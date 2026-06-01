package com.cloudflow.common.event.core;

/**
 * 业务事件消费者。
 */
public interface BusinessEventConsumer {

    String eventType();

    void consume(BusinessEventEnvelope envelope) throws Exception;
}
