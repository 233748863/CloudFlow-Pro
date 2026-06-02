package com.cloudflow.crm.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.crm.config.HrEventStreamConstants;
import com.cloudflow.crm.service.ICrmHandoverTaskService;
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

    private final ICrmHandoverTaskService handoverTaskService;
    private final RedisStreamUtil redisStreamUtil;

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = message.getValue();
        try {
            Long userId = parseLong(body.get("userId"));
            String employeeName = normalize(body.get("employeeName"));
            Long deptId = parseLong(body.get("deptId"));
            Long tenantId = parseLong(body.get("tenantId"));
            Long successorUserId = parseLong(body.get("successorUserId"));
            if (userId == null) {
                log.warn("skip employee-left event because userId is empty, msgId={}, body={}", msgId, body);
            } else {
                TenantBroker.runAs(tenantId, tid ->
                        handoverTaskService.generateForEmployeeLeft(tenantId, userId, employeeName, deptId, msgId, successorUserId));
            }
            redisStreamUtil.ackGlobal(
                    HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY,
                    HrEventStreamConstants.EMPLOYEE_LEFT_GROUP,
                    msgId);
            redisStreamUtil.deleteGlobal(HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY, msgId);
        } catch (Exception ex) {
            log.error("consume employee-left event failed: msgId={}, body={}", msgId, body, ex);
        }
    }

    private Long parseLong(String value) {
        String normalized = normalize(value);
        if (normalized == null || normalized.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(normalized);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() >= 2 && normalized.startsWith("\"") && normalized.endsWith("\"")) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        return normalized;
    }
}
