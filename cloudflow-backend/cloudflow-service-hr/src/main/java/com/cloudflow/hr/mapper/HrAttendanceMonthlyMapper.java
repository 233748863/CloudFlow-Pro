package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrAttendanceMonthly;
import org.apache.ibatis.annotations.Param;

public interface HrAttendanceMonthlyMapper extends BaseMapper<HrAttendanceMonthly> {
    HrAttendanceMonthly selectEmployeeMonth(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId,
                                           @Param("year") int year, @Param("month") int month);
}
