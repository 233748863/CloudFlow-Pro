package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrEmployee;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface HrEmployeeMapper extends BaseMapper<HrEmployee> {
    HrEmployee selectAttendanceById(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);

    List<HrEmployee> selectAttendanceCandidates(@Param("tenantId") Long tenantId,
                                              @Param("employeeIds") List<Long> employeeIds,
                                              @Param("deptIds") List<Long> deptIds);
}
