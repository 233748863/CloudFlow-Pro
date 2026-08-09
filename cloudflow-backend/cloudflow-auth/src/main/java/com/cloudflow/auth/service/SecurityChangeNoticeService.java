package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.common.core.event.SystemNoticeDispatchEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 账号安全设置变更提醒。
 *
 * 这类操作即使是本人在已登录状态下做的，也要留一条用户可见的痕迹：
 * 攻击者拿到会话后静默削弱账号防护，是最难被本人察觉的一类入侵。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SecurityChangeNoticeService {

    private static final String SYSTEM_SENDER = "auth-system";

    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    /** 关闭双因素认证：账号防护等级下降，必须通知本人 */
    public void notifyTotpDisabled(SysUser user) {
        dispatch(
                user,
                "双因素认证已关闭",
                "您的账号已关闭双因素认证，登录时将不再需要动态验证码。"
                        + "如非本人操作，请立即修改密码、重新开启双因素认证并联系管理员。"
        );
    }

    /** 启用双因素认证：同样值得留痕，便于本人比对操作时间 */
    public void notifyTotpEnabled(SysUser user) {
        dispatch(
                user,
                "双因素认证已开启",
                "您的账号已开启双因素认证，后续登录需要输入认证器中的动态验证码。"
                        + "如非本人操作，请立即修改密码并联系管理员。"
        );
    }

    private void dispatch(SysUser user, String title, String content) {
        if (user == null || user.getUserId() == null) {
            return;
        }
        try {
            SystemNoticeDispatchEvent event = new SystemNoticeDispatchEvent();
            event.setTenantId(user.getTenantId());
            event.setRecipientId(user.getUserId());
            event.setTitle(title);
            event.setContent(content);
            event.setType("1");
            event.setSenderId(null);
            event.setSenderName(SYSTEM_SENDER);

            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("SYSTEM_NOTICE_DISPATCH")
                    .sourceModule("cloudflow-auth")
                    .sourceId(user.getUserId())
                    .tenantId(user.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            // 通知失败不能反过来让安全操作本身失败
            log.warn("发送账号安全变更提醒失败, userId={}, title={}", user.getUserId(), title, e);
        }
    }
}
