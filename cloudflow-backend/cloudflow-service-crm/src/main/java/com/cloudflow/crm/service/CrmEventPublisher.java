package com.cloudflow.crm.service;

import java.util.Map;

/**
 * CRM 领域事件发布入口。
 * 事件通过全局 Redis Stream 广播，供 HR / OA / 通知等模块订阅。
 */
public interface CrmEventPublisher {

    /**
     * 发布 CRM 事件。extraFields 允许携带业务 ID、姓名等扩展信息。
     */
    void publish(String eventType, Long tenantId, Map<String, Object> extraFields);

    default void publish(String eventType, Map<String, Object> extraFields) {
        publish(eventType, null, extraFields);
    }
}
