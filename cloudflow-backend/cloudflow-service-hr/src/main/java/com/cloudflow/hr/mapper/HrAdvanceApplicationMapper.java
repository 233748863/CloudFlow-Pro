package com.cloudflow.hr.mapper;

import java.math.BigDecimal;
import java.util.List;
import org.apache.ibatis.annotations.Param;

public interface HrAdvanceApplicationMapper {
    Long approvalTaskAdvance(@Param("tenantId") Long tenantId, @Param("taskId") String taskId, @Param("userId") Long userId);
    int activeSettlement(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    String lockWorkflowStatus(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId);
    List<Long> departmentLeaders(@Param("tenantId") Long tenantId, @Param("departmentId") Long departmentId);
    BigDecimal occupiedAmount(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("excludedId") Long excludedId);
    int decisionMatches(@Param("tenantId") Long tenantId, @Param("advanceId") Long advanceId,
            @Param("instanceId") String instanceId, @Param("status") String status, @Param("actor") Long actor);
    PaymentSource paymentSource(@Param("tenantId") Long tenantId, @Param("paymentId") Long paymentId);
    String paymentEvent(@Param("tenantId") Long tenantId, @Param("eventId") String eventId, @Param("paymentId") Long paymentId);

    record PaymentSource(Long paymentId, Long userId, String sourceBizType, String sourceBizId, BigDecimal amount, String status, Integer deleted) { }
}
