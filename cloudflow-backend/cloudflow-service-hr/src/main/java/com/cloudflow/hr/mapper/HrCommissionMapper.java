package com.cloudflow.hr.mapper;

import com.cloudflow.common.event.commission.CommissionEvents.Fact;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.hr.domain.entity.HrPayrollPeriod;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HrCommissionMapper {
    Fact source(@Param("tenantId") Long tenantId, @Param("allocationId") Long allocationId);
    List<Long> refunds(@Param("tenantId") Long tenantId, @Param("allocationId") Long allocationId);
    HrPayrollPeriod lockPeriod(@Param("tenantId") Long tenantId, @Param("periodId") Long periodId);
    List<OutboxEvent> requests(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
}
