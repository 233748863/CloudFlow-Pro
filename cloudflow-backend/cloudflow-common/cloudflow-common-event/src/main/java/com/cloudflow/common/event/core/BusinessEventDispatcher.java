package com.cloudflow.common.event.core;

import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;

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

    public void dispatch(BusinessEventEnvelope envelope) throws Exception {
        BusinessEventConsumer consumer = consumers.get(envelope.getEventType());
        if (consumer == null) {
            throw new ServiceException("未找到事件消费者: " + envelope.getEventType(), ErrorCodeConstants.BAD_REQUEST);
        }
        consumer.consume(envelope);
    }
}
