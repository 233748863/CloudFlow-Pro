package com.cloudflow.auth.event.consumer;

import com.cloudflow.auth.message.MessageDispatchService;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * auth 侧统一消息事件消费者。
 */
@Component
@RequiredArgsConstructor
public class MessageSendEventConsumer implements BusinessEventConsumer {
    private final MessageDispatchService dispatchService;

    @Override
    public String eventType() {
        return "MESSAGE_SEND";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        dispatchService.dispatch(envelope);
    }
}
