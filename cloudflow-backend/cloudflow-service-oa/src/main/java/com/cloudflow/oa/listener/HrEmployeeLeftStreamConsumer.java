package com.cloudflow.oa.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.oa.config.HrEventStreamConstants;
import com.cloudflow.oa.service.impl.OaEmployeeOffboardService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.stream.StreamListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrEmployeeLeftStreamConsumer implements StreamListener<String, MapRecord<String, String, String>> {

    private final OaEmployeeOffboardService oaEmployeeOffboardService;
    private final RedisStreamUtil redisStreamUtil;

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = message.getValue();
        try {
            Long userId = parseLong(body.get("userId"));
            Long tenantId = parseLong(body.get("tenantId"));
            if (userId == null || tenantId == null) {
                log.warn("skip oa employee-left event with missing userId/tenantId, msgId={}, body={}", msgId, body);
            } else {
                TenantBroker.runAs(tenantId, ignored ->
                        oaEmployeeOffboardService.cancelPendingDocumentsForEmployeeLeft(tenantId, userId, msgId));
            }
            redisStreamUtil.ackGlobal(
                    HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY,
                    HrEventStreamConstants.EMPLOYEE_LEFT_GROUP,
                    msgId);
            redisStreamUtil.deleteGlobal(HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY, msgId);
        } catch (Exception ex) {
            log.error("consume oa employee-left event failed, msgId={}, body={}", msgId, body, ex);
        }
    }

    private Long parseLong(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() >= 2 && normalized.startsWith("\"") && normalized.endsWith("\"")) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        if (normalized.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(normalized);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
