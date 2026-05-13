package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.RedisStreamUtil;
import com.cloudflow.hr.config.HrEventStreamConstants;
import com.cloudflow.hr.service.HrEventPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 通过 Redis Stream 跨服务广播 HR 领域事件。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrEventPublisherImpl implements HrEventPublisher {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final RedisStreamUtil redisStreamUtil;

    @Override
    public void publishEmployeeLeft(Long employeeId, Long userId, String employeeName, Long deptId, String deptName) {
        if (employeeId == null) {
            log.warn("publishEmployeeLeft 跳过: employeeId 为空");
            return;
        }
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            tenantId = DEFAULT_TENANT_ID;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", "EMPLOYEE_LEFT");
        payload.put("tenantId", String.valueOf(tenantId));
        payload.put("employeeId", String.valueOf(employeeId));
        payload.put("userId", userId == null ? "" : String.valueOf(userId));
        payload.put("employeeName", employeeName == null ? "" : employeeName);
        payload.put("deptId", deptId == null ? "" : String.valueOf(deptId));
        payload.put("deptName", deptName == null ? "" : deptName);
        payload.put("eventTime", String.valueOf(Instant.now().toEpochMilli()));
        try {
            String recordId = redisStreamUtil.publishGlobal(
                    HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY, payload);
            log.info("已发布员工离职事件: employeeId={}, recordId={}", employeeId, recordId);
        } catch (Exception ex) {
            log.error("发布员工离职事件失败: employeeId={}", employeeId, ex);
        }
    }
}
