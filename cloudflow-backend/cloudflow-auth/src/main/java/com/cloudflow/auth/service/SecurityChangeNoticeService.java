package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

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

    private final MessageSender messageSender;

    /** 关闭双因素认证：账号防护等级下降，必须通知本人 */
    @Audit(name = "发送双因素认证关闭提醒", highRisk = true)
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
            messageSender.send(MessageSendRequest.builder()
                    .channelTypes(List.of(MessageChannelType.INTERNAL))
                    .receivers(List.of(MessageReceiver.ofUser(user.getUserId())))
                    .params(Map.of("senderName", SYSTEM_SENDER))
                    .category(MessageCategory.SYSTEM)
                    .bizType("SYS_SECURITY_CHANGE")
                    .bizId(String.valueOf(user.getUserId()))
                    .forceSend(true)
                    .title(title)
                    .content(content)
                    .build());
        } catch (Exception e) {
            // 通知失败不能反过来让安全操作本身失败
            log.warn("发送账号安全变更提醒失败, userId={}, title={}", user.getUserId(), title, e);
        }
    }
}
