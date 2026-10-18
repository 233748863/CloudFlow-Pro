package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.api.MessageEmailTemplateChoice;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmMassEmail;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.domain.CrmTargetListMember;
import com.cloudflow.crm.domain.dto.CrmMassEmailCommand;
import com.cloudflow.crm.domain.dto.CrmMassEmailDraft;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmCampaignMapper;
import com.cloudflow.crm.mapper.CrmEmailSuppressionMapper;
import com.cloudflow.crm.mapper.CrmMassEmailMapper;
import com.cloudflow.crm.mapper.CrmMassEmailRecipientMapper;
import com.cloudflow.crm.service.email.CrmEmailAccessService;
import com.cloudflow.crm.service.email.CrmEmailAudienceService;
import com.cloudflow.crm.service.email.CrmEmailContentService;
import com.cloudflow.crm.service.email.CrmEmailPolicyService;
import com.cloudflow.crm.service.email.CrmEmailSecurity;
import com.cloudflow.crm.service.email.CrmEmailSnapshotService;
import com.cloudflow.crm.service.email.CrmEmailStatisticsService;
import com.cloudflow.crm.service.remote.CrmMessageDeliveryClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class CrmCampaignDeliveryService {
    private final CrmMassEmailMapper tasks;
    private final CrmMassEmailRecipientMapper recipients;
    private final CrmCampaignMapper campaigns;
    private final CrmEmailSuppressionMapper suppressions;
    private final CrmEmailAccessService access;
    private final CrmEmailAudienceService audiences;
    private final CrmEmailPolicyService policies;
    private final CrmEmailContentService content;
    private final CrmEmailSnapshotService snapshots;
    private final CrmEmailStatisticsService statistics;
    private final CrmMessageDeliveryClient messages;
    private final MessageSender sender;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    public List<CrmMassEmail> list(Long campaignId) {
        campaign(campaignId, access.current(), false);
        return tasks.selectList(new LambdaQueryWrapper<CrmMassEmail>().eq(CrmMassEmail::getCampaignId, campaignId)
                .eq(CrmMassEmail::getDeleted, 0).orderByDesc(CrmMassEmail::getMassEmailId));
    }

    public List<com.cloudflow.common.message.api.MessageEmailTemplateChoice> templates() {
        if (!access.current().sending()) throw new CrmBusinessException("MAIL_FORBIDDEN: 无权配置营销邮件");
        R<List<MessageEmailTemplateChoice>> response = messages.templates();
        if (response == null || !response.isSuccess() || response.getData() == null) throw new CrmBusinessException("邮件模板暂不可用，请稍后重试");
        return response.getData();
    }

    public Map<String, Object> detail(Long id, PageQuery page) {
        CrmMassEmail task = accessible(id, access.current(), false);
        Page<CrmMassEmailRecipient> selected = recipients.selectPage(page.build(), new LambdaQueryWrapper<CrmMassEmailRecipient>()
                .eq(CrmMassEmailRecipient::getMassEmailId, id).orderByAsc(CrmMassEmailRecipient::getRecipientId));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("task", task); result.put("recipients", PageResult.build(selected));
        result.put("policy", policyView(policies.get(task.getTenantId())));
        return result;
    }

    @Audit(name = "维护营销邮件草稿")
    public CrmMassEmail save(CrmMassEmailDraft request) {
        if (request == null) throw new CrmBusinessException("邮件草稿不能为空");
        CrmEmailAccessService.Actor actor = access.current();
        campaign(request.campaignId(), actor, true);
        return transactions.execute(status -> {
            CrmCampaign campaign = campaigns.lockById(request.campaignId());
            actor.assertSending(campaign);
            if (Set.of("COMPLETED", "CANCELLED").contains(campaign.getStatus())) throw new CrmBusinessException("已结束活动不能创建或修改邮件");
            CrmMassEmail task;
            if (request.massEmailId() == null) {
                task = new CrmMassEmail(); CrmRecordSupport.create(task, "massEmailId"); task.setCampaignId(campaign.getCampaignId());
                task.setStatus("DRAFT"); task.setTotalCount(0); task.setSentCount(0); task.setFailedCount(0);
            } else {
                task = CrmRecordSupport.require(tasks.selectForUpdate(CrmRecordSupport.tenantId(), request.massEmailId()), "邮件任务不存在");
                if (!Objects.equals(task.getCampaignId(), request.campaignId())) throw new CrmBusinessException("邮件任务与活动不一致");
                version(task, request.version()); draft(task);
            }
            task.setSubject(CrmEmailContentService.header(request.subject(), 200, true));
            if (request.templateCode() == null || !request.templateCode().matches("[A-Za-z0-9_-]{1,100}")) throw new CrmBusinessException("邮件模板编码无效");
            task.setTemplateCode(request.templateCode()); task.setFromName(CrmEmailContentService.header(request.fromName(), 120, false));
            task.setFromAddress(optionalAddress(request.fromAddress())); task.setReplyTo(optionalAddress(request.replyTo()));
            CrmRecordSupport.touch(task);
            if (task.getMassEmailId() == null) tasks.insert(task); else CrmRecordSupport.saved(tasks.updateById(task));
            return task;
        });
    }

    public Map<String, Object> preview(Long id) {
        CrmEmailAccessService.Actor actor = access.current();
        CrmMassEmail task = accessible(id, actor, true);
        CrmCampaign campaign = campaign(task.getCampaignId(), actor, true);
        MessageEmailTemplate template = template(task.getTemplateCode());
        CrmEmailPolicyService.Policy policy = policies.get(task.getTenantId());
        CrmEmailAudienceService.Audience audience = audiences.collect(campaign.getCampaignId(), actor);
        Map<String, Object> result = new LinkedHashMap<>(audience.view());
        result.put("massEmailId", id); result.put("version", task.getVersion());
        result.put("previewDigest", digest(task, campaign, actor, audience, template, policy));
        result.put("confirmationThreshold", policy.confirmationThreshold());
        result.put("requiresConfirmation", audience.recipients().size() > policy.confirmationThreshold());
        String reason = !policy.sendingEnabled() ? policy.reason() : !template.ready() ? template.reason() : null;
        String html = "";
        if (reason == null) {
            try { html = content.render(task, template, sample(campaign.getCampaignName()), policy, value -> value).html(); }
            catch (CrmBusinessException invalid) { reason = invalid.getMessage(); }
        }
        result.put("ready", reason == null); result.put("reason", reason); result.put("previewHtml", html);
        result.put("policy", policyView(policy));
        return result;
    }

    @Audit(name = "发送营销邮件")
    public CrmMassEmail send(Long id, CrmMassEmailCommand command) { return activate(id, command, false); }

    @Audit(name = "安排营销邮件定时发送")
    public CrmMassEmail schedule(Long id, CrmMassEmailCommand command) { return activate(id, command, true); }

    private CrmMassEmail activate(Long id, CrmMassEmailCommand command, boolean scheduled) {
        CrmMassEmail reference = accessible(id, access.current(), true);
        MessageEmailTemplate template = template(reference.getTemplateCode());
        CrmMassEmail task = transactions.execute(status -> {
            CrmEmailAccessService.Actor actor = access.current();
            CrmCampaign campaign = campaigns.lockById(reference.getCampaignId());
            actor.assertSending(campaign);
            if (!"ACTIVE".equals(campaign.getStatus())) throw new CrmBusinessException("请先将营销活动设为进行中");
            CrmMassEmail current = CrmRecordSupport.require(tasks.selectForUpdate(CrmRecordSupport.tenantId(), id), "邮件任务不存在");
            draft(current); version(current, command == null ? null : command.version());
            CrmEmailPolicyService.Policy policy = policies.get(current.getTenantId()); policy.requireSending();
            if (!template.ready()) throw new CrmBusinessException("MAIL_DISABLED: " + template.reason());
            if (!Objects.equals(reference.getTemplateCode(), current.getTemplateCode())) throw new CrmBusinessException("邮件草稿已变化，请重新预览");
            CrmEmailAudienceService.Audience audience = audiences.collect(campaign.getCampaignId(), actor);
            verifyPreview(command, digest(current, campaign, actor, audience, template, policy), audience.recipients().size(), policy, true);
            if (audience.recipients().isEmpty()) throw new CrmBusinessException("当前没有可发送的收件人");
            LocalDateTime now = LocalDateTime.now();
            if (scheduled && (command.scheduledTime() == null || !command.scheduledTime().isAfter(now))) throw new CrmBusinessException("定时发送时间必须晚于当前时间");
            LocalDateTime deliveryTime = scheduled ? command.scheduledTime() : now.withNano(0);
            if (deliveryTime.getNano() != 0) deliveryTime = deliveryTime.withNano(0).plusSeconds(1);
            for (CrmTargetListMember member : audience.recipients()) {
                Map<String, String> variables = new LinkedHashMap<>(audience.variables().getOrDefault(CrmAudienceService.key(member), Map.of()));
                variables.put("campaignName", campaign.getCampaignName());
                snapshots.freeze(current, member.getMemberType(), member.getMemberRefId(), member.getEmail(), variables, template, policy, actor, false);
            }
            current.setStatus("SCHEDULED"); current.setTotalCount(audience.recipients().size()); current.setRecipientSnapshotTime(now);
            current.setScheduledTime(deliveryTime); current.setDeliverySummary("{\"PENDING\":" + audience.recipients().size() + "}");
            CrmRecordSupport.touch(current); CrmRecordSupport.saved(tasks.updateById(current)); return current;
        });
        if (!scheduled) dispatchBatch(id, 100);
        return tasks.selectById(task.getMassEmailId());
    }

    @Audit(name = "发送指定邮箱营销测试邮件")
    public CrmMassEmailRecipient test(Long id, CrmMassEmailCommand command) {
        CrmMassEmail reference = accessible(id, access.current(), true);
        MessageEmailTemplate template = template(reference.getTemplateCode());
        return transactions.execute(status -> {
            CrmEmailAccessService.Actor actor = access.current();
            CrmCampaign campaign = campaigns.lockById(reference.getCampaignId()); actor.assertSending(campaign);
            if (Set.of("COMPLETED", "CANCELLED").contains(campaign.getStatus())) throw new CrmBusinessException("已结束活动不能发送测试邮件");
            CrmMassEmail task = CrmRecordSupport.require(tasks.selectForUpdate(CrmRecordSupport.tenantId(), id), "邮件任务不存在");
            draft(task); version(task, command == null ? null : command.version());
            CrmEmailPolicyService.Policy policy = policies.get(task.getTenantId()); policy.requireSending();
            if (!Objects.equals(task.getTemplateCode(), template.templateCode())) throw new CrmBusinessException("邮件草稿已变化，请重新预览");
            CrmEmailAudienceService.Audience audience = audiences.collect(campaign.getCampaignId(), actor);
            verifyPreview(command, digest(task, campaign, actor, audience, template, policy), audience.recipients().size(), policy, false);
            String address = CrmEmailSecurity.address(command.testAddress());
            if (suppressions.exists(task.getTenantId(), CrmEmailSecurity.emailHash(address))) throw new CrmBusinessException("指定测试邮箱已退订，未发送邮件");
            CrmMassEmailRecipient existing = recipients.selectOne(new LambdaQueryWrapper<CrmMassEmailRecipient>()
                    .eq(CrmMassEmailRecipient::getMassEmailId, id).eq(CrmMassEmailRecipient::getTestFlag, 1)
                    .eq(CrmMassEmailRecipient::getEmailHash, CrmEmailSecurity.emailHash(address)));
            if (existing != null) {
                JsonNode frozen = snapshots.document(existing);
                if (!frozen.path("taskVersion").isInt() || frozen.path("taskVersion").intValue() != task.getVersion()
                        || !snapshots.templateDigest(template).equals(frozen.path("templateDigest").asText())
                        || !Objects.equals(policy.publicOrigin(), frozen.path("publicOrigin").asText())
                        || policy.trackingEnabled() != frozen.path("trackingEnabled").asBoolean()) {
                    throw new CrmBusinessException("MAIL_TEST_ALREADY_FROZEN: 此任务已向该邮箱登记过旧版测试，请新建邮件任务测试修改后的内容");
                }
                return existing;
            }
            CrmMassEmailRecipient recipient = snapshots.freeze(task, "TEST", null, address, sample(campaign.getCampaignName()), template, policy, actor, true);
            sender.send(snapshots.request(recipient)); recipient.setStatus("QUEUED"); CrmRecordSupport.saved(recipients.updateById(recipient));
            return recipient;
        });
    }

    @Audit(name = "取消营销邮件未发部分", highRisk = true)
    public CrmMassEmail cancel(Long id, CrmMassEmailCommand command) {
        CrmMassEmail reference = accessible(id, access.current(), true);
        return transactions.execute(status -> {
            CrmCampaign campaign = campaigns.lockById(reference.getCampaignId()); access.current().assertSending(campaign);
            CrmMassEmail task = CrmRecordSupport.require(tasks.selectForUpdate(CrmRecordSupport.tenantId(), id), "邮件任务不存在");
            if ("CANCELLED".equals(task.getStatus())) return task;
            version(task, command == null ? null : command.version());
            if (!Set.of("DRAFT", "SCHEDULED", "SENDING").contains(task.getStatus())) throw new CrmBusinessException("发送已结束，已发送事实不能取消");
            task.setStatus("CANCELLED"); recipients.stopPending(task.getTenantId(), id, "CANCELLED");
            if (task.getRecipientSnapshotTime() == null) { CrmRecordSupport.touch(task); CrmRecordSupport.saved(tasks.updateById(task)); }
            else statistics.refreshTask(task);
            return task;
        });
    }

    public int dispatch() {
        int processed = 0;
        for (Long id : tasks.due(CrmRecordSupport.tenantId(), LocalDateTime.now(), 100)) {
            if (processed >= 100) break;
            processed += dispatchBatch(id, 100 - processed);
        }
        return processed;
    }

    public int dispatchBatch(Long id, int maximum) {
        int limit = Math.max(1, Math.min(100, maximum));
        CrmMassEmail reference = tasks.selectById(id);
        if (reference == null || !Integer.valueOf(0).equals(reference.getDeleted())) return 0;
        return transactions.execute(status -> {
            CrmCampaign campaign = campaigns.lockById(reference.getCampaignId());
            CrmMassEmail task = tasks.selectForUpdate(CrmRecordSupport.tenantId(), id);
            if (task == null || !Set.of("SCHEDULED", "SENDING").contains(task.getStatus())
                    || task.getScheduledTime() == null || task.getScheduledTime().isAfter(LocalDateTime.now())) return 0;
            CrmEmailPolicyService.Policy policy = policies.get(task.getTenantId());
            if (!policy.sendingEnabled()) return 0;
            List<CrmMassEmailRecipient> pending = recipients.selectPending(task.getTenantId(), id, 0, limit);
            if (pending.isEmpty()) return 0;
            Map<Long, Set<String>> eligibleByOperator = new LinkedHashMap<>();
            task.setStatus("SENDING");
            if (task.getStartTime() == null) task.setStartTime(LocalDateTime.now());
            for (CrmMassEmailRecipient candidate : pending) {
                CrmMassEmailRecipient recipient = recipients.selectForUpdate(task.getTenantId(), candidate.getRecipientId());
                if (!"PENDING".equals(recipient.getStatus())) continue;
                com.cloudflow.common.message.api.MessageSendRequest request;
                Long operator;
                try {
                    JsonNode document = snapshots.document(recipient);
                    operator = operatorId(document.path("operatorId")); request = snapshots.request(recipient);
                } catch (CrmBusinessException invalid) {
                    recipient.setStatus("FAILED"); CrmRecordSupport.touch(recipient); CrmRecordSupport.saved(recipients.updateById(recipient)); continue;
                }
                Set<String> eligible = eligibleByOperator.computeIfAbsent(operator, operatorId -> {
                    try {
                        CrmEmailAccessService.Actor actor = access.resolve(operatorId); actor.assertSending(campaign);
                        if (!"ACTIVE".equals(campaign.getStatus())) return Set.of();
                        return audiences.collect(task.getCampaignId(), actor).recipients().stream()
                                .map(member -> CrmAudienceService.key(member) + ":" + CrmEmailSecurity.emailHash(member.getEmail())).collect(Collectors.toSet());
                    } catch (CrmBusinessException invalid) { return Set.of(); }
                });
                String key = recipient.getTargetType() + ":" + recipient.getTargetId() + ":" + recipient.getEmailHash();
                if (!eligible.contains(key) || suppressions.exists(task.getTenantId(), recipient.getEmailHash())) recipient.setStatus("SKIPPED");
                else { sender.send(request); recipient.setStatus("QUEUED"); }
                CrmRecordSupport.touch(recipient); CrmRecordSupport.saved(recipients.updateById(recipient));
            }
            statistics.refreshTask(task); return pending.size();
        });
    }

    public void aggregate() {
        for (CrmMassEmail task : tasks.selectList(new LambdaQueryWrapper<CrmMassEmail>().eq(CrmMassEmail::getDeleted, 0).isNotNull(CrmMassEmail::getRecipientSnapshotTime))) {
            transactions.execute(status -> { statistics.refreshTask(tasks.selectForUpdate(CrmRecordSupport.tenantId(), task.getMassEmailId())); return null; });
        }
        for (Long campaignId : statistics.campaignIds()) statistics.refreshCampaign(campaignId);
    }

    public CrmMassEmail accessible(Long id, CrmEmailAccessService.Actor actor, boolean write) {
        CrmMassEmail task = tasks.selectById(id);
        if (task == null || !Integer.valueOf(0).equals(task.getDeleted())) throw new CrmBusinessException("邮件任务不存在或无权访问");
        campaign(task.getCampaignId(), actor, write); return task;
    }

    private CrmCampaign campaign(Long id, CrmEmailAccessService.Actor actor, boolean write) {
        CrmCampaign campaign = CrmRecordSupport.require(campaigns.selectAccessible(id, actor.scope("scope_dept_id", "owner_id")), "营销活动不存在或无权访问");
        if (write) actor.assertSending(campaign);
        return campaign;
    }

    public MessageEmailTemplate template(String code) {
        try {
            R<MessageEmailTemplate> response = messages.template(code);
            if (response != null && response.isSuccess() && response.getData() != null) return response.getData();
        } catch (RuntimeException unavailable) { }
        return new MessageEmailTemplate(null, code, null, null, null, null, null, false, "消息服务暂不可用，邮件未发送");
    }

    private String digest(CrmMassEmail task, CrmCampaign campaign, CrmEmailAccessService.Actor actor,
            CrmEmailAudienceService.Audience audience, MessageEmailTemplate template, CrmEmailPolicyService.Policy policy) {
        ObjectNode document = json.createObjectNode();
        document.set("task", MessagePayloadCodec.internalTree(task, json)); document.put("campaignVersion", campaign.getVersion());
        document.put("campaignStatus", campaign.getStatus()); document.put("operatorId", actor.userId());
        document.set("template", MessagePayloadCodec.internalTree(template, json)); document.set("policy", json.valueToTree(policyView(policy)));
        document.set("counts", json.valueToTree(audience.counts()));
        ArrayNode selected = document.putArray("recipients");
        for (CrmTargetListMember member : audience.recipients()) {
            ObjectNode item = selected.addObject(); item.put("target", CrmAudienceService.key(member));
            item.put("emailHash", CrmEmailSecurity.emailHash(member.getEmail()));
            item.set("variables", json.valueToTree(audience.variables().get(CrmAudienceService.key(member))));
        }
        return MessagePayloadCodec.digest(document, json);
    }

    public static void verifyPreview(CrmMassEmailCommand command, String digest, int count, CrmEmailPolicyService.Policy policy, boolean formal) {
        if (command == null || command.previewDigest() == null || !Objects.equals(command.previewDigest(), digest)) {
            throw new CrmBusinessException("MAIL_PREVIEW_CHANGED: 名单、模板或配置已变化，请重新预览确认");
        }
        if (formal && count > policy.confirmationThreshold() && (!Boolean.TRUE.equals(command.confirmLarge())
                || !Objects.equals(command.confirmedRecipientCount(), count))) throw new CrmBusinessException("MAIL_CONFIRM_REQUIRED: 请确认本次精确收件人数后再发送");
    }

    public static Long operatorId(com.fasterxml.jackson.databind.JsonNode value) {
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() <= 0) throw new CrmBusinessException("MAIL_SNAPSHOT_INVALID: 操作人快照无效");
        return value.longValue();
    }

    private Map<String, Object> policyView(CrmEmailPolicyService.Policy policy) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sendingEnabled", policy.sendingEnabled()); result.put("trackingEnabled", policy.trackingEnabled());
        result.put("publicOrigin", policy.publicOrigin()); result.put("allowedHosts", policy.allowedHosts().stream().sorted().toList());
        result.put("confirmationThreshold", policy.confirmationThreshold()); result.put("reason", policy.reason()); return result;
    }

    private Map<String, String> sample(String campaignName) {
        return Map.of("contactName", "测试联系人", "companyName", "测试公司", "campaignName", campaignName);
    }

    private String optionalAddress(String value) {
        if (value == null || value.isBlank()) return null;
        String address = CrmEmailSecurity.address(value);
        if (address.length() > 100) throw new CrmBusinessException("发件或回复邮箱最多100字符");
        return address;
    }

    private void version(CrmMassEmail task, Integer version) {
        if (version == null || !Objects.equals(task.getVersion(), version)) throw new CrmBusinessException("邮件任务已变化，请刷新后重试");
    }

    private void draft(CrmMassEmail task) {
        if (!"DRAFT".equals(task.getStatus()) || task.getRecipientSnapshotTime() != null) throw new CrmBusinessException("仅未冻结的邮件草稿可以修改或发送");
    }
}
