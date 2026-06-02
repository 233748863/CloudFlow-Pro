package com.cloudflow.workflow.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.workflow.config.HrEventStreamConstants;
import com.cloudflow.workflow.service.impl.WfEmployeeOffboardTransferService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.stream.StreamListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Objects;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrEmployeeLeftStreamConsumer implements StreamListener<String, MapRecord<String, String, String>> {

    private final WfEmployeeOffboardTransferService offboardTransferService;
    private final RedisStreamUtil redisStreamUtil;

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = message.getValue();
        try {
            Long userId = parseLong(body.get("userId"));
            Long tenantId = parseLong(body.get("tenantId"));
            Long successorUserId = parseLong(body.get("successorUserId"));
            String employeeName = normalize(body.get("employeeName"));

            if (userId == null) {
                log.warn("skip employee-left event without userId, msgId={}, body={}", msgId, body);
            } else if (tenantId == null) {
                log.warn("skip employee-left event without tenantId, msgId={}, userId={}, body={}", msgId, userId, body);
            } else if (successorUserId == null) {
                log.warn("skip employee-left transfer without successorUserId, msgId={}, tenantId={}, userId={}",
                        msgId, tenantId, userId);
            } else if (Objects.equals(userId, successorUserId)) {
                log.warn("skip employee-left transfer with same successor, msgId={}, tenantId={}, userId={}",
                        msgId, tenantId, userId);
            } else {
                TenantBroker.runAs(tenantId, ignored ->
                        offboardTransferService.transferTodoTasksForEmployeeLeft(userId, employeeName, successorUserId, msgId));
            }
            ackAndDelete(msgId);
        } catch (Exception ex) {
            log.error("consume employee-left event failed, msgId={}, body={}", msgId, body, ex);
        }
    }

    private void ackAndDelete(String msgId) {
        redisStreamUtil.ackGlobal(
                HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY,
                HrEventStreamConstants.EMPLOYEE_LEFT_GROUP,
                msgId);
        redisStreamUtil.deleteGlobal(HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY, msgId);
    }

    private Long parseLong(String value) {
        String normalized = normalize(value);
        if (normalized == null || normalized.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(normalized);
        } catch (NumberFormatException ex) {
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
