package com.cloudflow.oa.mapper;

import com.cloudflow.oa.domain.BizPaymentRequest;
import java.math.BigDecimal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaHrPaymentMapper {
    Long advanceEmployee(@Param("tenantId") Long tenantId, @Param("advanceId") Long advanceId);
    Long lockEmployee(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    AdvanceSource lockAdvance(@Param("tenantId") Long tenantId, @Param("advanceId") Long advanceId);
    int approved(@Param("tenantId") Long tenantId, @Param("advanceId") Long advanceId, @Param("instanceId") String instanceId);
    BizPaymentRequest sourcePayment(@Param("tenantId") Long tenantId, @Param("advanceId") String advanceId);
    BizPaymentRequest lockPayment(@Param("tenantId") Long tenantId, @Param("paymentId") Long paymentId);
    int payableBy(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("deptId") Long deptId);
    int fundable(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);

    record AdvanceSource(Long advanceId, Long employeeId, Long userId, String userName, String employeeName,
            Long deptId, String deptName, String advanceNo, BigDecimal amount, String purpose,
            String status, String approvalStatus, String instanceId, Long paymentRequestId) { }
}
