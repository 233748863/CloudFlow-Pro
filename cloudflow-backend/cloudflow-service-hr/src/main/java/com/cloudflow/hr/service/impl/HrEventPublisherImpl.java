package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.event.EmployeeOffboardEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.hr.service.HrEventPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 通过 Redis Stream 跨服务广播 HR 领域事件。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrEventPublisherImpl implements HrEventPublisher {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    @Override
    public void publishEmployeeLeft(Long employeeId, Long userId, String employeeName, Long deptId, String deptName,
                                    Long successorUserId) {
        if (employeeId == null) {
            log.warn("publishEmployeeLeft 跳过: employeeId 为空");
            return;
        }
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            tenantId = DEFAULT_TENANT_ID;
        }
        try {
            EmployeeOffboardEvent event = new EmployeeOffboardEvent();
            event.setEmployeeId(employeeId);
            event.setUserId(userId);
            event.setEmployeeName(employeeName);
            event.setDeptId(deptId);
            event.setDeptName(deptName);
            event.setSuccessorUserId(successorUserId);
            event.setLastWorkDate(LocalDate.now());

            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("EMPLOYEE_OFFBOARDED")
                    .sourceModule("cloudflow-service-hr")
                    .sourceId(employeeId)
                    .tenantId(tenantId)
                    .occurredAt(LocalDateTime.now())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
            log.info("已发布员工离职事件: employeeId={}, userId={}", employeeId, userId);
        } catch (Exception ex) {
            log.error("发布员工离职事件失败: employeeId={}", employeeId, ex);
        }
    }
}
