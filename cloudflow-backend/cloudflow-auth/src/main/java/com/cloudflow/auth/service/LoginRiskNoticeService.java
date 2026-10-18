package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class LoginRiskNoticeService {

    private static final String SYSTEM_SENDER = "auth-system";

    private final MessageSender messageSender;

    public void notifyIfLocationChanged(SysUser user, UserLoginHistoryService.LoginRiskContext context) {
        if (user == null || user.getUserId() == null) {
            return;
        }
        if (context == null || !StringUtils.hasText(context.previousIp()) || !StringUtils.hasText(context.currentIp())) {
            return;
        }
        if (context.previousIp().equals(context.currentIp())) {
            return;
        }
        String previousKey = resolveLocationKey(context.previousProvince(), context.previousLocation());
        String currentKey = resolveLocationKey(context.currentProvince(), context.currentLocation());
        if (!StringUtils.hasText(previousKey) || !StringUtils.hasText(currentKey)) {
            return;
        }
        if (previousKey.equals(currentKey)) {
            return;
        }

        try {
            String content = "检测到您的账号登录地区发生变化。上次登录地区：" + safeLocation(context.previousLocation())
                    + "，本次登录地区：" + safeLocation(context.currentLocation())
                    + "。上次登录IP：" + context.previousIp()
                    + "，本次登录IP：" + context.currentIp()
                    + "。如非本人操作，请立即修改密码并联系管理员。";
            messageSender.send(MessageSendRequest.builder()
                    .channelTypes(List.of(MessageChannelType.INTERNAL))
                    .receivers(List.of(MessageReceiver.ofUser(user.getUserId())))
                    .params(Map.of("senderName", SYSTEM_SENDER))
                    .category(MessageCategory.SYSTEM)
                    .bizType("SYS_LOGIN_RISK")
                    .bizId(String.valueOf(user.getUserId()))
                    .forceSend(true)
                    .title("登录环境变化提醒")
                    .content(content)
                    .build());
        } catch (Exception e) {
            log.warn("发送登录环境变化提醒失败, userId={}", user.getUserId(), e);
        }
    }

    private String resolveLocationKey(String province, String location) {
        if (StringUtils.hasText(province) && !"UNKNOWN".equalsIgnoreCase(province) && !"INTERNAL".equalsIgnoreCase(province)) {
            return province;
        }
        if (StringUtils.hasText(location) && !"UNKNOWN".equalsIgnoreCase(location) && !"INTERNAL".equalsIgnoreCase(location)) {
            return location;
        }
        return null;
    }

    private String safeLocation(String location) {
        return StringUtils.hasText(location) ? location : "未知";
    }
}
