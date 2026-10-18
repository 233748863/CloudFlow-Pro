package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.hr.domain.entity.WfCallbackSideEffect;
import com.cloudflow.hr.mapper.WfCallbackSideEffectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrHEventService {
    public static final String OVERTIME_SETTLE = "HR_OVERTIME_SETTLE";
    public static final String SHIFT_APPLY = "HR_SHIFT_REQUEST_APPLY";
    private final OutboxPublisher publisher;
    private final MessageSender messages;
    private final HrHSupport helper;
    private final WfCallbackSideEffectMapper markers;

    public void execution(String eventType, Long requestId, Integer version) {
        String key = tenantId() + ":" + eventType + ":" + requestId + ":" + version;
        publisher.publish(BusinessEventEnvelope.builder().eventId(UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString())
                .eventType(eventType).sourceModule("cloudflow-hr").sourceId(requestId).tenantId(tenantId()).occurredAt(HrHSupport.now())
                .payload(helper.json(Map.of("tenantId", tenantId().toString(), "requestId", requestId.toString(), "version", version))).build());
    }

    public boolean mark(ApprovalResultDTO result, String effect) {
        if (markers.selectCount(new LambdaQueryWrapper<WfCallbackSideEffect>().eq(WfCallbackSideEffect::getTenantId, tenantId())
                .eq(WfCallbackSideEffect::getBusinessType, result.getBusinessType()).eq(WfCallbackSideEffect::getBusinessId, result.getBusinessId())
                .eq(WfCallbackSideEffect::getProcessInstanceId, result.getProcessInstanceId()).eq(WfCallbackSideEffect::getEffectKey, effect)) > 0) return false;
        WfCallbackSideEffect marker = new WfCallbackSideEffect();
        marker.setTenantId(tenantId()); marker.setBusinessType(result.getBusinessType()); marker.setBusinessId(result.getBusinessId());
        marker.setProcessInstanceId(result.getProcessInstanceId()); marker.setEffectKey(effect); marker.setCreateTime(HrHSupport.now());
        markers.insert(marker);
        return true;
    }

    public void notify(String template, String businessType, Long id, String requestNo, String status, Integer version,
            List<Long> recipients, String actionLabel, String link) {
        if (recipients.isEmpty()) return;
        messages.send(MessageSendRequest.builder().templateCode(template).channelTypes(List.of(MessageChannelType.INTERNAL))
                .receivers(recipients.stream().distinct().map(MessageReceiver::ofUser).toList()).category(MessageCategory.BIZ_REMINDER)
                .params(Map.of("requestNo", requestNo, "status", status, "actionLabel", actionLabel, "linkUrl", link))
                .bizType(businessType).bizId(id.toString()).linkUrl(link)
                .deduplicationKey(businessType + ":" + id + ":" + status + ":" + version + ":" + template)
                .build());
    }
}
