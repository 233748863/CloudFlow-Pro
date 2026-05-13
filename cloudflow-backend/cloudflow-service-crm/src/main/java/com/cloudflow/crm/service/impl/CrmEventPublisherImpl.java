package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.RedisStreamUtil;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.service.CrmEventPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 通过全局 Redis Stream 广播 CRM 领域事件。
 *
 * <p>Stream 使用字符串 map 承载，所有值统一 toString 序列化，
 * 消费侧按 eventType 字段分发处理。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CrmEventPublisherImpl implements CrmEventPublisher {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final RedisStreamUtil redisStreamUtil;

    @Override
    public void publish(String eventType, Long tenantId, Map<String, Object> extraFields) {
        if (eventType == null || eventType.isBlank()) {
            log.warn("publish CRM event skipped: eventType 为空");
            return;
        }
        Long resolvedTenant = tenantId;
        if (resolvedTenant == null) {
            resolvedTenant = UserContext.getTenantId();
        }
        if (resolvedTenant == null) {
            resolvedTenant = DEFAULT_TENANT_ID;
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", eventType);
        payload.put("tenantId", String.valueOf(resolvedTenant));
        payload.put("eventTime", String.valueOf(Instant.now().toEpochMilli()));
        if (extraFields != null) {
            for (Map.Entry<String, Object> entry : extraFields.entrySet()) {
                payload.put(entry.getKey(), entry.getValue() == null ? "" : String.valueOf(entry.getValue()));
            }
        }
        try {
            String recordId = redisStreamUtil.publishGlobal(
                    CrmEventStreamConstants.CRM_EVENTS_STREAM_KEY, payload);
            log.info("已发布 CRM 事件: type={}, recordId={}", eventType, recordId);
        } catch (Exception ex) {
            log.error("发布 CRM 事件失败: type={}", eventType, ex);
        }
    }
}
