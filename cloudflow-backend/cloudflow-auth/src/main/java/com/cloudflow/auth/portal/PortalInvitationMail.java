package com.cloudflow.auth.portal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.SysPortalUser;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.security.portal.PortalAccessPolicy;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

@Component
public class PortalInvitationMail {
    public static final String BUSINESS_TYPE = "PORTAL_ACTIVATION";
    private final PortalAccessPolicy access;
    private final SysMessageChannelMapper channels;
    private final MessageDeliveryService delivery;
    private final OutboxPublisher outbox;
    private final ObjectMapper json;
    private final MessageSecretCipher cipher;
    private final boolean encryptionConfigured;

    public PortalInvitationMail(PortalAccessPolicy access, SysMessageChannelMapper channels, MessageDeliveryService delivery,
            OutboxPublisher outbox, ObjectMapper json, MessageSecretCipher cipher,
            @Value("${cloudflow.message.secret-key:${CLOUDFLOW_MESSAGE_SECRET_KEY:}}") String secret) {
        this.access = access;
        this.channels = channels;
        this.delivery = delivery;
        this.outbox = outbox;
        this.json = json;
        this.cipher = cipher;
        this.encryptionConfigured = secret != null && secret.trim().length() >= 32;
    }

    public String unavailableReason(Long tenantId) {
        String reason = access.unavailableReason();
        if (reason != null) return reason;
        if (!encryptionConfigured) return "尚未配置邮件载荷加密密钥，邀请未发送";
        Long available = channels.selectCount(new LambdaQueryWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getTenantId, tenantId).eq(SysMessageChannel::getChannelType, "EMAIL")
                .eq(SysMessageChannel::getStatus, "ENABLED").eq(SysMessageChannel::getImplementedFlag, 1)
                .eq(SysMessageChannel::getDeleted, 0));
        return available == 0 ? "尚未配置可用邮件渠道，邀请未发送" : null;
    }

    public String prepare(SysPortalUser user) {
        user.setActivateTokenHash(null);
        user.setActivateExpireTime(null);
        user.setActivateConsumedTime(null);
        if (unavailableReason(user.getTenantId()) != null) return null;
        String token = PortalCredentials.randomToken();
        user.setActivateTokenHash(PortalCredentials.activationHash(token));
        user.setActivateExpireTime(LocalDateTime.now().plusMinutes(PortalAccountRules.ACTIVATION_MINUTES));
        return token;
    }

    public void reserve(SysPortalUser user, String tenantCode, String activationToken) {
        if (activationToken == null) return;
        String link = access.publicUrl() + "/portal/" + tenantCode + "/activate#token=" + activationToken;
        String content = "<p>您收到一份客户门户邀请。</p><p>登录账号：" + HtmlUtils.htmlEscape(user.getLoginAccount())
                + "</p><p><a href=\"" + HtmlUtils.htmlEscape(link) + "\">设置密码并激活账号</a></p>"
                + "<p>链接15分钟内有效，完成密码设置后才会启用账号。若您未预期此邀请，请忽略邮件。</p>";
        MessageReceiver receiver = MessageReceiver.ofAddress("EMAIL", user.getEmail());
        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().eventId(UUID.randomUUID().toString()).eventType("MESSAGE_SEND")
                .tenantId(user.getTenantId()).sourceModule("cloudflow-auth").sourceId(user.getPortalUserId()).build();
        MessageSendRequest request = MessageSendRequest.builder().bizType(BUSINESS_TYPE).bizId(user.getPortalUserId().toString())
                .category(MessageCategory.SYSTEM).forceSend(true).title("客户门户账号邀请").content(content)
                .channelTypes(List.of(MessageChannelType.EMAIL)).receivers(List.of(receiver)).traceId(envelope.getEventId())
                .params(Map.of("activationHash", user.getActivateTokenHash())).build();
        MessagePayloadCodec.encode(envelope, request, json, cipher);
        delivery.reserve(envelope, request, MessageChannelType.EMAIL, receiver);
        outbox.publish(envelope);
    }
}
