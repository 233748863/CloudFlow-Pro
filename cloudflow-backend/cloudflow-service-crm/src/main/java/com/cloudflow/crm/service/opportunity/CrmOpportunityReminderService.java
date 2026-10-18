package com.cloudflow.crm.service.opportunity;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.constant.MessageEventType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmOpportunityStageHistory;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmSalesStageMapper;
import com.cloudflow.crm.service.email.CrmEmailAccessService;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class CrmOpportunityReminderService {
    public static final String BUSINESS_TYPE = "CRM_OPPORTUNITY_STAGE_NOTICE";
    private static final String SOURCE = "cloudflow-service-crm";
    private final CrmSalesStageMapper stages;
    private final CrmOpportunityMapper opportunities;
    private final CrmSalesStageService catalog;
    private final CrmEmailAccessService identities;
    private final OutboxEventMapper events;
    private final MessageSender messages;
    private final ObjectMapper json;
    private final TransactionTemplate transactions;

    public int dispatch() {
        Long tenantId = CrmRecordSupport.tenantId();
        LocalDateTime now = LocalDateTime.now().withNano(0);
        stages.refreshDurations(tenantId, now);
        long afterId = 0; int queued = 0;
        while (true) {
            List<Long> ids = stages.pendingNoticeIds(tenantId, afterId, now);
            for (Long id : ids) queued += Objects.requireNonNull(transactions.execute(status -> queue(id, now)));
            if (ids.size() < 200) return queued;
            afterId = ids.get(ids.size() - 1);
        }
    }

    private int queue(Long id, LocalDateTime now) {
        CrmOpportunity opportunity = opportunities.lockById(id);
        if (opportunity == null || !Objects.equals(CrmRecordSupport.tenantId(), opportunity.getTenantId())) return 0;
        CrmSalesStage rule = CrmOpportunityStagePolicy.find(catalog.lockCatalog(), opportunity.getStage());
        CrmOpportunityStageHistory history = stages.latestHistory(opportunity.getTenantId(), id);
        if (!due(opportunity, rule, history, now) || !recipientAvailable(opportunity)) return 0;
        String key = key(opportunity, history, rule.getOverdueDays());
        String eventId = eventId(opportunity.getTenantId(), key);
        if (event(eventId) != null) return 0;
        String title = "商机阶段超期：" + opportunity.getOpportunityName();
        String content = "阶段：" + rule.getStageName() + "；进入时间：" + history.getChangedTime() + "；提醒阈值：" + rule.getOverdueDays() + "天。请核实推进计划。";
        messages.send(MessageSendRequest.builder().templateCode(BUSINESS_TYPE).bizType(BUSINESS_TYPE).bizId(String.valueOf(id))
                .channelTypes(List.of(MessageChannelType.INTERNAL)).receivers(List.of(MessageReceiver.ofUser(opportunity.getOwnerId())))
                .category(MessageCategory.BIZ_REMINDER).deduplicationKey(key).traceId(eventId).renderedContent(true).title(title).content(content)
                .params(Map.of("opportunityId", id, "historyId", history.getHistoryId(), "overdueDays", rule.getOverdueDays()))
                .linkUrl("/office/crm/opportunities?opportunityId=" + id).build());
        return 1;
    }

    public MessageSourceResult verify(MessageSourceCheck check) {
        try {
            if (check == null || check.request() == null || check.recordId() == null || check.recordId() <= 0 || check.eventId() == null) return denied("SOURCE_INVALID");
            MessageSendRequest request = check.request();
            if (!BUSINESS_TYPE.equals(request.getBizType()) || !BUSINESS_TYPE.equals(request.getTemplateCode())
                    || request.getResendFromId() != null || !request.safeChannelTypes().equals(List.of(MessageChannelType.INTERNAL))
                    || request.safeReceivers().size() != 1) return denied("SOURCE_INVALID");
            MessageReceiver receiver = request.safeReceivers().get(0);
            if (!"USER".equals(receiver.getReceiverType()) || receiver.getReceiverAddress() != null) return denied("SOURCE_INVALID");
            OutboxEvent stored = event(check.eventId());
            if (stored == null || !SOURCE.equals(stored.getAggregateType()) || !MessageEventType.SEND.equals(stored.getEventType())) return denied("SOURCE_INVALID");
            BusinessEventEnvelope envelope = json.readValue(stored.getPayloadJson(), BusinessEventEnvelope.class);
            MessageSendRequest normalized = request.toBuilder().receivers(List.of(MessageReceiver.ofUser(receiver.getReceiverId()))).build();
            if (!SOURCE.equals(envelope.getSourceModule()) || !Objects.equals(CrmRecordSupport.tenantId(), envelope.getTenantId())
                    || !Objects.equals(check.eventId(), envelope.getEventId())
                    || !MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(normalized, json), json).equals(envelope.getPayloadDigest())) return denied("SOURCE_INVALID");
            Long id = identifier(request.getBizId());
            CrmOpportunity opportunity = opportunities.selectById(id);
            if (opportunity == null || !Objects.equals(CrmRecordSupport.tenantId(), opportunity.getTenantId())
                    || !Objects.equals(receiver.getReceiverId(), opportunity.getOwnerId())) return denied("SOURCE_EXPIRED");
            CrmSalesStage rule = catalog.list().stream().filter(stage -> Objects.equals(stage.getStageCode(), opportunity.getStage())).findFirst().orElse(null);
            CrmOpportunityStageHistory history = stages.latestHistory(opportunity.getTenantId(), id);
            if (!due(opportunity, rule, history, LocalDateTime.now()) || !recipientAvailable(opportunity)) return denied("SOURCE_EXPIRED");
            if (!Objects.equals(String.valueOf(history.getHistoryId()), String.valueOf(request.safeParams().get("historyId")))
                    || !Objects.equals(String.valueOf(rule.getOverdueDays()), String.valueOf(request.safeParams().get("overdueDays")))
                    || !Objects.equals(key(opportunity, history, rule.getOverdueDays()), request.getDeduplicationKey())
                    || !Objects.equals(eventId(opportunity.getTenantId(), request.getDeduplicationKey()), check.eventId())) return denied("SOURCE_EXPIRED");
            return new MessageSourceResult(true, null);
        } catch (IllegalArgumentException | JsonProcessingException invalid) { return denied("SOURCE_INVALID"); }
    }

    private boolean due(CrmOpportunity opportunity, CrmSalesStage rule, CrmOpportunityStageHistory history, LocalDateTime now) {
        return Integer.valueOf(0).equals(opportunity.getDeleted()) && "OPEN".equals(opportunity.getStatus())
                && rule != null && "ACTIVE".equals(rule.getStatus()) && !CrmOpportunityStagePolicy.terminal(rule)
                && rule.getOverdueDays() != null && rule.getOverdueDays() > 0 && history != null
                && Objects.equals(history.getToStage(), opportunity.getStage()) && Objects.equals(history.getChangedTime(), opportunity.getStageChangedTime())
                && ChronoUnit.SECONDS.between(history.getChangedTime(), now) >= rule.getOverdueDays() * 86400L;
    }

    private boolean recipientAvailable(CrmOpportunity opportunity) {
        try {
            if (opportunity.getOwnerId() == null || !stages.recipientPermission(opportunity.getTenantId(), opportunity.getOwnerId())) return false;
            CrmEmailAccessService.Actor actor = identities.resolve(opportunity.getOwnerId());
            return opportunities.selectByIdWithDataScope(opportunity.getOpportunityId(), actor.scope("scope_dept_id", "scope_owner_id")) != null;
        } catch (CrmBusinessException unavailable) { return false; }
    }

    private OutboxEvent event(String id) {
        return events.selectOne(new LambdaQueryWrapper<OutboxEvent>().eq(OutboxEvent::getTenantId, CrmRecordSupport.tenantId()).eq(OutboxEvent::getEventId, id));
    }

    private String key(CrmOpportunity opportunity, CrmOpportunityStageHistory history, int threshold) {
        return BUSINESS_TYPE + ":" + opportunity.getOpportunityId() + ":" + history.getHistoryId() + ":" + threshold;
    }

    private String eventId(Long tenantId, String key) { return UUID.nameUUIDFromBytes((SOURCE + ":" + tenantId + ":" + key).getBytes(StandardCharsets.UTF_8)).toString(); }
    private Long identifier(String value) { if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("商机来源ID无效"); return Long.valueOf(value); }
    private MessageSourceResult denied(String reason) { return new MessageSourceResult(false, reason); }
}
