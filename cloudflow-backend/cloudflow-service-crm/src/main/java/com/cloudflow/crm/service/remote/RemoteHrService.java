package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.vo.HrDeptSummaryVO;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

/**
 * CRM → HR 的员工 / 部门查询。
 * 用于：校验客户归属员工是否在职、获取部门名称、支持离职交接。
 */
@FeignClient(
        name = "cloudflow-service-hr",
        contextId = "remoteHrService",
        fallbackFactory = RemoteHrFallbackFactory.class
)
public interface RemoteHrService {

    @GetMapping("/inner/hr/employees/{employeeId}")
    R<HrEmployeeSummaryVO> getEmployee(@PathVariable("employeeId") Long employeeId);

    @GetMapping("/inner/hr/employees/by-user/{userId}")
    R<HrEmployeeSummaryVO> getEmployeeByUserId(@PathVariable("userId") Long userId);

    @GetMapping("/inner/hr/employees")
    R<List<HrEmployeeSummaryVO>> listEmployees(@RequestParam("ids") List<Long> ids);

    @GetMapping("/inner/hr/employees/by-users")
    R<List<HrEmployeeSummaryVO>> listEmployeesByUserIds(@RequestParam("userIds") List<Long> userIds);

    @GetMapping("/inner/hr/depts")
    R<List<HrDeptSummaryVO>> listDepartments(@RequestParam(value = "ids", required = false) List<Long> ids);
}
