package com.cloudflow.common.event.core;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 事件分发器。
 */
public class BusinessEventDispatcher {

    private final Map<String, BusinessEventConsumer> consumers;

    public BusinessEventDispatcher(List<BusinessEventConsumer> consumers) {
        this.consumers = consumers.stream().collect(Collectors.toMap(BusinessEventConsumer::eventType, Function.identity()));
    }

    public boolean dispatch(BusinessEventEnvelope envelope) throws Exception {
        BusinessEventConsumer consumer = consumers.get(envelope.getEventType());
        if (consumer == null) {
            return false;
        }
        consumer.consume(envelope);
        return true;
    }
}
