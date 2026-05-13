package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.vo.HrDeptSummaryVO;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 提供给其它微服务（CRM、OA 等）使用的员工 / 部门轻量查询。
 * 只读 sys_dept 与 hr_employee，不涉及薪税等敏感字段。
 */
public interface HrIntegrationQueryService {

    Optional<HrEmployeeSummaryVO> findEmployee(Long employeeId);

    Optional<HrEmployeeSummaryVO> findEmployeeByUserId(Long userId);

    List<HrEmployeeSummaryVO> listEmployees(Collection<Long> ids);

    List<HrEmployeeSummaryVO> listEmployeesByUserIds(Collection<Long> userIds);

    List<HrDeptSummaryVO> listDepartments(Collection<Long> deptIds);
}
