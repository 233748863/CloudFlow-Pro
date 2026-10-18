package com.cloudflow.crm.service.email;

import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.crm.domain.CrmEmailTrackingLink;
import com.cloudflow.crm.domain.CrmMassEmail;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmEmailTrackingLinkMapper;
import com.cloudflow.crm.mapper.CrmMassEmailRecipientMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class CrmEmailSnapshotService {
    public static final String BUSINESS_TYPE = "CRM_MASS_EMAIL";
    private final CrmMassEmailRecipientMapper recipients;
    private final CrmEmailTrackingLinkMapper links;
    private final CrmEmailSnapshotCodec codec;
    private final CrmEmailContentService content;
    private final ObjectMapper json;

    public CrmMassEmailRecipient freeze(CrmMassEmail task, String targetType, Long targetId, String address, Map<String, String> variables,
            MessageEmailTemplate template, CrmEmailPolicyService.Policy policy, CrmEmailAccessService.Actor actor, boolean test) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("邮件快照必须完整事务保存");
        policy.requireSending();
        if (!template.ready()) throw new CrmBusinessException("MAIL_DISABLED: " + template.reason());
        String normalized = CrmEmailSecurity.address(address);
        String from = CrmEmailSecurity.address(template.fromAddress());
        if (task.getFromAddress() != null && !Objects.equals(from, CrmEmailSecurity.address(task.getFromAddress()))) {
            throw new CrmBusinessException("MAIL_SENDER_INVALID: 发件邮箱须与启用渠道核定地址一致");
        }
        String openToken = CrmEmailSecurity.newToken();
        String unsubscribeToken = CrmEmailSecurity.newToken();
        CrmMassEmailRecipient recipient = new CrmMassEmailRecipient();
        recipient.setTenantId(task.getTenantId()); recipient.setMassEmailId(task.getMassEmailId()); recipient.setCampaignId(task.getCampaignId());
        recipient.setTargetType(targetType); recipient.setTargetId(targetId); recipient.setEmailHash(CrmEmailSecurity.emailHash(normalized));
        recipient.setEmailMask(CrmEmailSecurity.maskAddress(normalized)); recipient.setEmailEncrypted("PENDING");
        recipient.setOpenTokenHash(CrmEmailSecurity.tokenHash(openToken)); recipient.setUnsubscribeTokenHash(CrmEmailSecurity.tokenHash(unsubscribeToken));
        recipient.setTestFlag(test ? 1 : 0); recipient.setStatus("PENDING"); recipient.setCreateBy(actor.userName());
        recipient.setCreateTime(LocalDateTime.now()); recipient.setUpdateBy(actor.userName()); recipient.setUpdateTime(recipient.getCreateTime());
        recipients.insert(recipient);
        Map<String, String> tracked = new LinkedHashMap<>();
        Map<String, CrmEmailTrackingLink> mappings = new LinkedHashMap<>();
        java.util.Set<String> destinations = new java.util.LinkedHashSet<>();
        CrmEmailContentService.Rendered rendered = content.render(task, template, variables, policy, destination -> {
            destinations.add(destination);
            if (!policy.trackingEnabled()) return destination;
            return tracked.computeIfAbsent(destination, target -> {
                String token = CrmEmailSecurity.newToken();
                CrmEmailTrackingLink link = new CrmEmailTrackingLink();
                link.setTenantId(task.getTenantId()); link.setRecipientId(recipient.getRecipientId());
                link.setTokenHash(CrmEmailSecurity.tokenHash(token)); link.setDestinationUrl(target); link.setDestinationHash(MessagePayloadCodec.hash(target));
                link.setCreateBy(actor.userName()); link.setCreateTime(recipient.getCreateTime()); mappings.put(target, link);
                return CrmEmailSecurity.trackingUrl(policy.publicOrigin(), "click", token);
            });
        });
        for (CrmEmailTrackingLink link : mappings.values()) links.insert(link);
        String body = rendered.html() + "<p>不再接收此类营销邮件？<a href=\""
                + CrmEmailSecurity.escape(CrmEmailSecurity.trackingUrl(policy.publicOrigin(), "unsubscribe", unsubscribeToken)) + "\">确认退订</a></p>";
        if (policy.trackingEnabled()) body += "<img src=\"" + CrmEmailSecurity.escape(CrmEmailSecurity.trackingUrl(policy.publicOrigin(), "open", openToken)) + "\" alt=\"\">";
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("operatorId", actor.userId()); params.put("mailFromAddress", from);
        String fromName = CrmEmailContentService.header(task.getFromName() == null ? template.fromName() : task.getFromName(), 120, false);
        if (fromName != null) params.put("mailFromName", fromName);
        if (task.getReplyTo() != null) params.put("mailReplyTo", CrmEmailSecurity.address(task.getReplyTo()));
        MessageSendRequest request = MessageSendRequest.builder().templateCode(task.getTemplateCode()).renderedContent(true)
                .title(rendered.subject()).content(body).category(MessageCategory.BIZ_REMINDER).channelTypes(List.of(MessageChannelType.EMAIL))
                .receivers(List.of(MessageReceiver.builder().receiverType("EMAIL").receiverAddress(normalized).build()))
                .params(params).bizType(BUSINESS_TYPE).bizId(String.valueOf(recipient.getRecipientId()))
                .traceId(BUSINESS_TYPE + ":" + recipient.getRecipientId())
                .deduplicationKey(BUSINESS_TYPE + ":" + recipient.getRecipientId()).build();
        ObjectNode snapshot = json.createObjectNode();
        snapshot.put("taskVersion", task.getVersion());
        snapshot.put("operatorId", actor.userId()); snapshot.put("publicOrigin", policy.publicOrigin());
        snapshot.put("templateDigest", templateDigest(template)); snapshot.put("trackingEnabled", policy.trackingEnabled());
        snapshot.set("images", json.valueToTree(rendered.images()));
        snapshot.set("destinations", json.valueToTree(destinations));
        snapshot.set("request", MessagePayloadCodec.internalTree(request, json));
        recipient.setEmailEncrypted(codec.encode(recipient, "ADDRESS", json.valueToTree(normalized)));
        recipient.setVariableSnapshotEncrypted(codec.encode(recipient, "VARIABLES", snapshot));
        CrmRecordSupport.saved(recipients.updateSnapshot(recipient));
        return recipient;
    }

    public JsonNode document(CrmMassEmailRecipient recipient) {
        codec.readAddress(recipient);
        JsonNode document = codec.decode(recipient, "VARIABLES", recipient.getVariableSnapshotEncrypted());
        if (!document.isObject() || !document.path("request").isObject()) throw new CrmBusinessException("MAIL_SNAPSHOT_INVALID: 邮件快照无效");
        return document;
    }

    public MessageSendRequest request(CrmMassEmailRecipient recipient) {
        try { return json.treeToValue(document(recipient).required("request"), MessageSendRequest.class); }
        catch (Exception invalid) { throw new CrmBusinessException("MAIL_SNAPSHOT_INVALID: 邮件快照无效"); }
    }

    public String templateDigest(MessageEmailTemplate template) {
        return MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(template, json), json);
    }

    public boolean newerResult(CrmMassEmailRecipient recipient, com.cloudflow.common.message.api.MessageDeliveryResult result) {
        if (result.deliveryId() == null || result.deliveryId() <= 0 || result.recordId() == null || result.recordId() <= 0
                || result.version() == null || result.version() < 0) throw new CrmBusinessException("MAIL_RESULT_INVALID: 投递结果版本无效");
        JsonNode projection = document(recipient).path("deliveryProjection");
        if (projection.isMissingNode()) return true;
        if (!projection.path("recordId").isIntegralNumber() || !projection.path("deliveryId").isIntegralNumber()
                || !projection.path("version").isIntegralNumber() || !projection.path("version").canConvertToInt()) {
            throw new CrmBusinessException("MAIL_SNAPSHOT_INVALID: 投递结果快照无效");
        }
        if (projection.path("recordId").longValue() != result.recordId()) return true;
        if (projection.path("deliveryId").longValue() != result.deliveryId()) throw new CrmBusinessException("MAIL_RESULT_INVALID: 投递关联不一致");
        return result.version() > projection.path("version").intValue();
    }

    public void projectResult(CrmMassEmailRecipient recipient, com.cloudflow.common.message.api.MessageDeliveryResult result) {
        ObjectNode document = (com.fasterxml.jackson.databind.node.ObjectNode) document(recipient);
        ObjectNode projection = document.putObject("deliveryProjection");
        projection.put("recordId", result.recordId()); projection.put("deliveryId", result.deliveryId()); projection.put("version", result.version());
        recipient.setVariableSnapshotEncrypted(codec.encode(recipient, "VARIABLES", document));
    }
}
