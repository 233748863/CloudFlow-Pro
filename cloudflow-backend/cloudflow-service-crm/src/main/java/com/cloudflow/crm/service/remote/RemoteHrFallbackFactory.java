package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.vo.HrDeptSummaryVO;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class RemoteHrFallbackFactory implements FallbackFactory<RemoteHrService> {

    @Override
    public RemoteHrService create(Throwable cause) {
        log.error("CRM 调用 HR 服务失败: {}", cause.getMessage());
        return new RemoteHrService() {
            @Override
            public R<HrEmployeeSummaryVO> getEmployee(Long employeeId) {
                log.warn("HR 服务不可用，无法查询员工: employeeId={}", employeeId);
                return R.ok(null);
            }

            @Override
            public R<HrEmployeeSummaryVO> getEmployeeByUserId(Long userId) {
                log.warn("HR 服务不可用，无法按 userId 查询员工: userId={}", userId);
                return R.ok(null);
            }

            @Override
            public R<List<HrEmployeeSummaryVO>> listEmployees(List<Long> ids) {
                log.warn("HR 服务不可用，批量查询员工降级为空列表");
                return R.ok(List.of());
            }

            @Override
            public R<List<HrEmployeeSummaryVO>> listEmployeesByUserIds(List<Long> userIds) {
                log.warn("HR 服务不可用，按 userIds 批量查询员工降级为空列表");
                return R.ok(List.of());
            }

            @Override
            public R<List<HrDeptSummaryVO>> listDepartments(List<Long> ids) {
                log.warn("HR 服务不可用，部门查询降级为空列表");
                return R.ok(List.of());
            }
        };
    }
}
