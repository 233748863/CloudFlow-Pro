package com.cloudflow.hr.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;

/** Ordered row locks and guarded occupancy writes; business amounts remain immutable. */
public interface HrSettlementSourceMapper {
    List<Long> salaryIds(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    List<Long> advanceIds(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    List<Long> leaveTypes(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    Long lockLeaveType(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    List<Long> leavePeriodIds(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    Long lockLeavePeriod(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    List<Long> trainingIds(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    Long lockTraining(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("identifier") Long identifier);
    int reserveSalary(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("sourceId") Long sourceId,
            @Param("settlementId") Long settlementId, @Param("version") Integer version);
    int releaseSalary(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("sourceId") Long sourceId,
            @Param("settlementId") Long settlementId);
    int reserveTraining(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("sourceId") Long sourceId,
            @Param("settlementId") Long settlementId, @Param("version") Integer version);
    int releaseTraining(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("sourceId") Long sourceId,
            @Param("settlementId") Long settlementId);
}
