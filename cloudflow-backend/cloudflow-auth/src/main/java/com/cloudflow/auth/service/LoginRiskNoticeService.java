package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.common.core.event.SystemNoticeDispatchEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class LoginRiskNoticeService {

    private static final String SYSTEM_SENDER = "auth-system";

    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

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
            SystemNoticeDispatchEvent event = new SystemNoticeDispatchEvent();
            event.setTenantId(user.getTenantId());
            event.setRecipientId(user.getUserId());
            event.setTitle("登录环境变化提醒");
            event.setContent("检测到您的账号登录地区发生变化。上次登录地区：" + safeLocation(context.previousLocation())
                    + "，本次登录地区：" + safeLocation(context.currentLocation())
                    + "。上次登录IP：" + context.previousIp()
                    + "，本次登录IP：" + context.currentIp()
                    + "。如非本人操作，请立即修改密码并联系管理员。");
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
