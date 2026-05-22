package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrTalentArchiveService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 人才档案聚合查询：单员工历次盘点、所在池、培养行动、继任提名一站式纵览。
 */
@Service
@RequiredArgsConstructor
public class HrTalentArchiveServiceImpl implements HrTalentArchiveService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final JdbcTemplate jdbcTemplate;
    private final HrEssSupport essSupport;

    @Override
    public Map<String, Object> getArchive(Long employeeId) {
        if (employeeId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "employeeId 不能为空");
        }
        long tid = currentTenantId();
        Map<String, Object> employee = queryOne(
                "SELECT id AS employeeId, employee_no AS employeeNo, name, dept_id AS deptId, position_id AS positionId, status "
                        + "FROM hr_employee WHERE id = ? AND tenant_id = ? AND deleted = 0",
                employeeId, tid);
        if (employee.isEmpty()) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在：" + employeeId);
        }
        List<Map<String, Object>> reviews = jdbcTemplate.queryForList(
                "SELECT p.review_id AS reviewId, r.review_no AS reviewNo, r.review_name AS reviewName, "
                        + "r.review_year AS reviewYear, p.grid_cell AS gridCell, p.performance_band AS performanceBand, "
                        + "p.potential_band AS potentialBand, p.performance_score AS performanceScore, "
                        + "p.potential_score AS potentialScore, p.calibration_notes AS calibrationNotes, r.status "
                        + "FROM hr_talent_review_participant p "
                        + "JOIN hr_talent_review r ON r.id = p.review_id AND r.deleted = 0 "
                        + "WHERE p.employee_id = ? AND p.tenant_id = ? AND p.deleted = 0 "
                        + "ORDER BY r.review_year DESC, p.review_id DESC",
                employeeId, tid);
        List<Map<String, Object>> pools = jdbcTemplate.queryForList(
                "SELECT m.pool_id AS poolId, p.pool_no AS poolNo, p.pool_name AS poolName, p.pool_type AS poolType, "
                        + "m.joined_at AS joinedAt, m.status "
                        + "FROM hr_talent_pool_member m "
                        + "JOIN hr_talent_pool p ON p.id = m.pool_id AND p.deleted = 0 "
                        + "WHERE m.employee_id = ? AND m.tenant_id = ? AND m.deleted = 0 AND m.status = 'IN' "
                        + "ORDER BY m.joined_at DESC",
                employeeId, tid);
        List<Map<String, Object>> developmentActions = jdbcTemplate.queryForList(
                "SELECT id, action_type AS actionType, action_name AS actionName, mentor_id AS mentorId, "
                        + "start_date AS startDate, end_date AS endDate, status, evaluation_score AS evaluationScore "
                        + "FROM hr_talent_development_action "
                        + "WHERE employee_id = ? AND tenant_id = ? AND deleted = 0 "
                        + "ORDER BY start_date DESC, id DESC",
                employeeId, tid);
        List<Map<String, Object>> successorOf = jdbcTemplate.queryForList(
                "SELECT s.plan_id AS planId, p.plan_no AS planNo, p.plan_name AS planName, p.position_id AS positionId, "
                        + "s.readiness, s.rank_order AS rankOrder, s.status "
                        + "FROM hr_talent_successor s "
                        + "JOIN hr_talent_succession_plan p ON p.id = s.plan_id AND p.deleted = 0 "
                        + "WHERE s.employee_id = ? AND s.tenant_id = ? AND s.deleted = 0 AND s.status = 'ACTIVE' "
                        + "ORDER BY s.rank_order ASC",
                employeeId, tid);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("employee", employee);
        result.put("reviews", reviews);
        result.put("pools", pools);
        result.put("developmentActions", developmentActions);
        result.put("successorOf", successorOf);
        return result;
    }

    @Override
    public Map<String, Object> getMyArchive() {
        Long employeeId = essSupport.currentEmployeeId();
        return getArchive(employeeId);
    }

    private Map<String, Object> queryOne(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, args);
        return rows.isEmpty() ? Map.of() : rows.get(0);
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }
}
