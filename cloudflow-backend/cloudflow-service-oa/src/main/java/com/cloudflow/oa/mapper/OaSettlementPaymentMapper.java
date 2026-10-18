package com.cloudflow.oa.mapper;

import com.cloudflow.oa.domain.BizPaymentRequest;
import java.math.BigDecimal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaSettlementPaymentMapper {
    Long employee(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId);
    Source lockSource(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId);
    int approved(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId);
    BizPaymentRequest payment(@Param("tenantId") Long tenantId, @Param("settlementId") String settlementId);

    record Source(Long settlementId, Long employeeId, Long userId, String userName, String employeeName,
            Long deptId, String deptName, String settlementNo, BigDecimal amount, String status, String approvalStatus,
            String instanceId, Long paymentRequestId, Long submitterUserId) { }
}
