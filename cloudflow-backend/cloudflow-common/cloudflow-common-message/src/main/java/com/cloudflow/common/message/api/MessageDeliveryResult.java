package com.cloudflow.common.message.api;

public record MessageDeliveryResult(Long deliveryId, Long recordId, Long tenantId, String outboxEventId,
        String channelType, String status, String businessType, String businessId, String errorCode, Integer version) { }
