package com.cloudflow.crm.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.service.impl.CrmContractApprovedEventHandler;
import com.cloudflow.crm.service.impl.CrmReceivableConfirmedEventHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.stream.StreamListener;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * CRM 自订阅 {@code crm:stream:events}。
 * 当前处理：
 * <ul>
 *     <li>{@code ContractApproved} → 自动建项目 + 预算</li>
 *     <li>{@code ReceivableConfirmed} → 自动绑定/核销发票</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CrmSelfEventStreamConsumer implements StreamListener<String, MapRecord<String, String, String>> {

    private final CrmContractApprovedEventHandler contractApprovedEventHandler;
    private final CrmReceivableConfirmedEventHandler receivableConfirmedEventHandler;
    private final RedisStreamUtil redisStreamUtil;

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = message.getValue();
        try {
            String eventType = normalize(body.get("eventType"));
            if (CrmEventStreamConstants.EVENT_CONTRACT_APPROVED.equalsIgnoreCase(eventType)) {
                contractApprovedEventHandler.handle(body);
            } else if (CrmEventStreamConstants.EVENT_RECEIVABLE_CONFIRMED.equalsIgnoreCase(eventType)) {
                receivableConfirmedEventHandler.handle(body);
            } else {
                log.debug("忽略 CRM 事件: msgId={}, eventType={}", msgId, eventType);
            }
            redisStreamUtil.ackGlobal(
                    CrmEventStreamConstants.CRM_EVENTS_STREAM_KEY,
                    CrmEventStreamConstants.SELF_CONSUMER_GROUP,
                    msgId);
            redisStreamUtil.deleteGlobal(CrmEventStreamConstants.CRM_EVENTS_STREAM_KEY, msgId);
        } catch (Exception ex) {
            log.error("CRM 事件处理失败: msgId={}, body={}", msgId, body, ex);
        }
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }
}
