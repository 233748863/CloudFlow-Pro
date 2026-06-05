package com.cloudflow.hr.mapper;

import com.cloudflow.hr.domain.vo.HrDeptSummaryVO;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

@Mapper
public interface HrDirectoryMapper {

    HrEmployeeSummaryVO findEmployee(@Param("tenantId") long tenantId, @Param("employeeId") Long employeeId);

    HrEmployeeSummaryVO findEmployeeByUserId(@Param("tenantId") long tenantId, @Param("userId") Long userId);

    List<HrEmployeeSummaryVO> listEmployees(@Param("tenantId") long tenantId, @Param("ids") Collection<Long> ids);

    List<HrEmployeeSummaryVO> listEmployeesByUserIds(@Param("tenantId") long tenantId, @Param("userIds") Collection<Long> userIds);

    List<HrDeptSummaryVO> listDepartments(@Param("tenantId") long tenantId, @Param("deptIds") Collection<Long> deptIds);
}
