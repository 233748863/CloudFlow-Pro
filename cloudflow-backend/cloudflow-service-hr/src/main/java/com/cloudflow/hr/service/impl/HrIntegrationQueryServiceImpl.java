package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.vo.HrDeptSummaryVO;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.service.HrIntegrationQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 对其它微服务暴露员工 / 部门的轻量查询。
 *
 * <p>使用原生 JdbcTemplate 直接读 sys_dept / hr_employee，
 * 避开 {@code HrDomainCrudService} 的高敏列脱敏与 SaToken 校验，
 * 既能提高聚合查询效率，也限定了对外开放的字段集合。
 */
@Service
@RequiredArgsConstructor
public class HrIntegrationQueryServiceImpl implements HrIntegrationQueryService {

    private static final long DEFAULT_TENANT_ID = 100000L;
    private static final String EMPLOYEE_SELECT =
            "SELECT e.id, e.employee_no, e.name, e.dept_id, e.position_id, e.employee_status, e.user_id, " +
                    "d.dept_name, p.position_name " +
                    "FROM hr_employee e " +
                    "LEFT JOIN sys_dept d ON d.dept_id = e.dept_id " +
                    "LEFT JOIN hr_position p ON p.id = e.position_id " +
                    "WHERE e.deleted = 0";

    private final JdbcTemplate jdbcTemplate;

    private static final RowMapper<HrEmployeeSummaryVO> EMPLOYEE_MAPPER = (rs, rowNum) -> {
        HrEmployeeSummaryVO vo = new HrEmployeeSummaryVO();
        vo.setEmployeeId(rs.getLong("id"));
        vo.setEmployeeNo(rs.getString("employee_no"));
        vo.setEmployeeName(rs.getString("name"));
        long deptId = rs.getLong("dept_id");
        vo.setDeptId(rs.wasNull() ? null : deptId);
        vo.setDeptName(rs.getString("dept_name"));
        long positionId = rs.getLong("position_id");
        vo.setPositionId(rs.wasNull() ? null : positionId);
        vo.setPositionName(rs.getString("position_name"));
        vo.setStatus(rs.getString("employee_status"));
        long userId = rs.getLong("user_id");
        vo.setUserId(rs.wasNull() ? null : userId);
        vo.setActive(isActive(vo.getStatus()));
        return vo;
    };

    private static final RowMapper<HrDeptSummaryVO> DEPT_MAPPER = (rs, rowNum) -> {
        HrDeptSummaryVO vo = new HrDeptSummaryVO();
        vo.setDeptId(rs.getLong("dept_id"));
        vo.setDeptName(rs.getString("dept_name"));
        long parentId = rs.getLong("parent_id");
        vo.setParentId(rs.wasNull() ? null : parentId);
        vo.setStatus(rs.getString("status"));
        return vo;
    };

    @Override
    public Optional<HrEmployeeSummaryVO> findEmployee(Long employeeId) {
        if (employeeId == null) {
            return Optional.empty();
        }
        List<HrEmployeeSummaryVO> rows = jdbcTemplate.query(
                EMPLOYEE_SELECT + " AND e.tenant_id = ? AND e.id = ? LIMIT 1",
                EMPLOYEE_MAPPER,
                DEFAULT_TENANT_ID, employeeId);
        return rows.stream().findFirst();
    }

    @Override
    public Optional<HrEmployeeSummaryVO> findEmployeeByUserId(Long userId) {
        if (userId == null) {
            return Optional.empty();
        }
        List<HrEmployeeSummaryVO> rows = jdbcTemplate.query(
                EMPLOYEE_SELECT + " AND e.tenant_id = ? AND e.user_id = ? LIMIT 1",
                EMPLOYEE_MAPPER,
                DEFAULT_TENANT_ID, userId);
        return rows.stream().findFirst();
    }

    @Override
    public List<HrEmployeeSummaryVO> listEmployees(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(","));
        List<Object> args = new ArrayList<>();
        args.add(DEFAULT_TENANT_ID);
        args.addAll(ids);
        return jdbcTemplate.query(
                EMPLOYEE_SELECT + " AND e.tenant_id = ? AND e.id IN (" + placeholders + ")",
                EMPLOYEE_MAPPER,
                args.toArray());
    }

    @Override
    public List<HrEmployeeSummaryVO> listEmployeesByUserIds(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }
        String placeholders = userIds.stream().map(id -> "?").collect(Collectors.joining(","));
        List<Object> args = new ArrayList<>();
        args.add(DEFAULT_TENANT_ID);
        args.addAll(userIds);
        return jdbcTemplate.query(
                EMPLOYEE_SELECT + " AND e.tenant_id = ? AND e.user_id IN (" + placeholders + ")",
                EMPLOYEE_MAPPER,
                args.toArray());
    }

    @Override
    public List<HrDeptSummaryVO> listDepartments(Collection<Long> deptIds) {
        String sql = "SELECT dept_id, dept_name, parent_id, status FROM sys_dept WHERE del_flag = '0' AND tenant_id = ?";
        if (deptIds == null || deptIds.isEmpty()) {
            return jdbcTemplate.query(sql, DEPT_MAPPER, DEFAULT_TENANT_ID);
        }
        String placeholders = deptIds.stream().map(id -> "?").collect(Collectors.joining(","));
        List<Object> args = new ArrayList<>();
        args.add(DEFAULT_TENANT_ID);
        args.addAll(deptIds);
        return jdbcTemplate.query(sql + " AND dept_id IN (" + placeholders + ")", DEPT_MAPPER, args.toArray());
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
