package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.exception.HrBusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * ESS（员工自助）共用守卫：解析当前登录账号绑定的员工 ID，并对 employeeId 越权访问做拦截。
 *
 * <p>所有 ESS 端点必须先调 {@link #currentEmployeeId()}；写入/查看他人数据须显式经过
 * {@link #assertOwner(Long)}。HR 管理员视角不走 ESS 控制器，直接走 /employees /compensation 等。
 */
@Service
@RequiredArgsConstructor
public class HrEssSupport {

    private final IHrIntegrationQueryService integrationQueryService;

    public Long currentEmployeeId() {
        Long userId = UserContext.getUserId();
        if (userId == null) {
            throw new HrBusinessException("UNAUTHORIZED", "当前登录态缺失，无法解析员工身份");
        }
        return integrationQueryService.findEmployeeByUserId(userId)
                .map(HrEmployeeSummaryVO::getEmployeeId)
                .orElseThrow(() -> new HrBusinessException(
                        "EMPLOYEE_NOT_BOUND",
                        "当前账号未绑定 HR 员工档案，无法使用员工自助服务"));
    }

    public void assertOwner(Long employeeId) {
        if (employeeId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "employeeId 不能为空");
        }
        Long mine = currentEmployeeId();
        if (!mine.equals(employeeId)) {
            throw new HrBusinessException("FORBIDDEN_CROSS_EMPLOYEE",
                    "员工自助仅可操作本人数据，目标员工：" + employeeId);
        }
    }
}
