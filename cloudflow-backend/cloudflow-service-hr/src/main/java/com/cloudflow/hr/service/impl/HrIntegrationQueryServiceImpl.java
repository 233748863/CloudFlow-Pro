package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.vo.HrDeptSummaryVO;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.mapper.HrDirectoryMapper;
import com.cloudflow.hr.service.IHrIntegrationQueryService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * 对其它微服务暴露员工 / 部门的轻量查询。
 *
 * <p>使用轻量 Mapper 直接读 sys_dept / hr_employee，
 * 避开通用领域写服务上的高敏列脱敏与 SaToken 校验，
 * 既能提高聚合查询效率，也限定了对外开放的字段集合。
 */
@Service
@RequiredArgsConstructor
public class HrIntegrationQueryServiceImpl implements IHrIntegrationQueryService {

    private final HrDirectoryMapper directoryMapper;

    @Override
    public List<java.util.Map<String, Object>> listApprovalJobLevels(Collection<Long> userIds) {
        Long tenantId = com.cloudflow.common.tenant.TenantContext.getTenantId();
        if (tenantId == null) {
            throw new IllegalStateException("职级查询缺少租户上下文");
        }
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }
        if (userIds.stream().anyMatch(userId -> userId == null || userId <= 0)) {
            throw new IllegalArgumentException("职级查询的用户编号无效");
        }
        return directoryMapper.listApprovalJobLevels(tenantId, userIds.stream().distinct().toList());
    }

    @Override
    public Optional<HrEmployeeSummaryVO> findEmployee(Long employeeId) {
        if (employeeId == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(withActive(directoryMapper.findEmployee(tenantId(), employeeId)));
    }

    @Override
    public Optional<HrEmployeeSummaryVO> findEmployeeByUserId(Long userId) {
        if (userId == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(withActive(directoryMapper.findEmployeeByUserId(tenantId(), userId)));
    }

    @Override
    public List<HrEmployeeSummaryVO> listEmployees(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return directoryMapper.listEmployees(tenantId(), ids).stream().map(this::withActive).toList();
    }

    @Override
    public List<HrEmployeeSummaryVO> listEmployeesByUserIds(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }
        return directoryMapper.listEmployeesByUserIds(tenantId(), userIds).stream().map(this::withActive).toList();
    }

    @Override
    public List<HrDeptSummaryVO> listDepartments(Collection<Long> deptIds) {
        return directoryMapper.listDepartments(tenantId(), deptIds);
    }

    private long tenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) tenantId = UserContext.getTenantId();
        if (tenantId == null || tenantId <= 0) throw new IllegalStateException("员工及部门查询缺少租户上下文");
        return tenantId;
    }

    private HrEmployeeSummaryVO withActive(HrEmployeeSummaryVO vo) {
        if (vo == null) {
            return null;
        }
        vo.setActive(isActive(vo.getStatus()));
        return vo;
    }

    private static boolean isActive(String status) {
        if (status == null) {
            return false;
        }
        return switch (status.toUpperCase(Locale.ROOT)) {
            case "ACTIVE", "REGULAR", "PROBATION", "ON_LEAVE" -> true;
            default -> false;
        };
    }
}
