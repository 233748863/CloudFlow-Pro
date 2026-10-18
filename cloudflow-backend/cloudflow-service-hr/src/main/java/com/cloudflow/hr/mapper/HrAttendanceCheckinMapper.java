package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrAttendanceCheckin;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

public interface HrAttendanceCheckinMapper extends BaseMapper<HrAttendanceCheckin> {
    List<HrAttendanceCheckin> selectEmployeeDates(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId,
                                                @Param("from") LocalDate from, @Param("to") LocalDate to);
}
