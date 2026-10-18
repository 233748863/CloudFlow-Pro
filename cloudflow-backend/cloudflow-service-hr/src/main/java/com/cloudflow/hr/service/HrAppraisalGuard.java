package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.entity.HrAppraisalCycle;
import com.cloudflow.hr.domain.entity.HrAppraisalResult;
import com.cloudflow.hr.domain.entity.HrPerfDistributionRule;
import com.cloudflow.hr.domain.entity.HrPerformanceAssignment;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.cloudflow.hr.domain.entity.HrPerformanceResult;
import com.cloudflow.hr.domain.entity.HrTalentCalibrationSession;
import com.cloudflow.hr.mapper.HrAppraisalCycleMapper;
import com.cloudflow.hr.mapper.HrAppraisalResultMapper;
import com.cloudflow.hr.mapper.HrPerformanceObjectiveMapper;
import com.cloudflow.hr.mapper.HrPerformanceAssignmentMapper;
import com.cloudflow.hr.mapper.HrSkillMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Objects;
import java.util.Set;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Component
@RequiredArgsConstructor
public class HrAppraisalGuard {
    private final HrAppraisalCycleMapper cycles;
    private final HrAppraisalResultMapper results;
    private final HrPerformanceObjectiveMapper objectives;
    private final HrPerformanceAssignmentMapper assignments;
    private final HrHSupport access;

    public HrSkillMapper.EmployeeScope scope(boolean mine) {
        Long userId = access.user();
        if (!mine && UserContext.getDsType() == null) throw forbidden();
        if (mine) access.mine();
        return new HrSkillMapper.EmployeeScope(mine ? 4 : UserContext.getDsType(), userId,
                UserContext.getDeptId(), List.copyOf(UserContext.getDsDeptIds()));
    }

    public List<HrAppraisalResult> participants(Long cycleId) {
        return results.selectList(new LambdaQueryWrapper<HrAppraisalResult>().eq(HrAppraisalResult::getTenantId, tenantId())
                .eq(HrAppraisalResult::getCycleId, cycleId).orderByAsc(HrAppraisalResult::getEmployeeId));
    }

    public List<Long> visible(Long cycleId, boolean mine) {
        return cycles.visibleEmployees(tenantId(), cycleId, scope(mine));
    }

    public void fullScope(HrAppraisalCycle cycle) {
        HrSkillMapper.EmployeeScope currentScope = scope(false);
        if ("DRAFT".equals(cycle.getStatus())) {
            if (currentScope.type() != 0 && !Objects.equals(cycle.getCreateBy(), HrRuleSupport.userName())) throw forbidden();
        } else if (visible(cycle.getCycleId(), false).size() != participants(cycle.getCycleId()).size()) {
            throw forbidden();
        }
    }

    public HrAppraisalCycle cycle(Long cycleId) {
        HrAppraisalCycle cycle = cycleId == null ? null : cycles.selectOne(new LambdaQueryWrapper<HrAppraisalCycle>()
                .eq(HrAppraisalCycle::getTenantId, tenantId()).eq(HrAppraisalCycle::getCycleId, cycleId).eq(HrAppraisalCycle::getDeleted, 0));
        if (cycle == null) throw new HrHException("APPRAISAL_NOT_FOUND", "绩效周期不存在", 404);
        return cycle;
    }

    public HrAppraisalCycle lock(Long cycleId, String... statuses) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("绩效写入必须在事务内锁定周期");
        if (cycles.lockCycle(tenantId(), cycleId) == null) throw new HrHException("APPRAISAL_NOT_FOUND", "绩效周期不存在", 404);
        HrAppraisalCycle cycle = cycle(cycleId);
        if (!Set.of(statuses).contains(cycle.getStatus())) throw conflict("APPRAISAL_STAGE_LOCKED", "当前阶段不允许此操作；完成后的绩效依据只读");
        return cycle;
    }

    public HrPerformanceObjective objective(Long objectiveId) {
        return objectiveId == null ? null : objectives.selectOne(new LambdaQueryWrapper<HrPerformanceObjective>()
                .eq(HrPerformanceObjective::getTenantId, tenantId()).eq(HrPerformanceObjective::getId, objectiveId)
                .eq(HrPerformanceObjective::getDeleted, 0));
    }

    public void legacyObjective(Long objectiveId) {
        HrPerformanceObjective objective = objective(objectiveId);
        if (objective != null && objective.getCycleId() != null) legacyCycle(objective.getCycleId());
    }

    public void legacyEntity(Object entity) {
        if (entity instanceof HrPerformanceObjective objective) {
            legacyCycle(objective.getCycleId());
        } else if (entity instanceof HrPerformanceAssignment assignment) {
            legacyCycle(assignment.getCycleId());
            legacyObjective(assignment.getObjectiveId());
        } else if (entity instanceof HrPerformanceResult result) {
            legacyObjective(result.getObjectiveId());
        } else if (entity instanceof HrPerfDistributionRule rule) {
            legacyCycle(rule.getCycleId());
            legacyObjective(rule.getObjectiveId());
        } else if (entity instanceof HrTalentCalibrationSession session) {
            legacyCycle(session.getCycleId());
        }
    }

    public <T> void legacyRead(QueryWrapper<T> query, String table) {
        if (Set.of("hr_performance_objective", "hr_performance_assignment", "hr_perf_distribution_rule", "hr_talent_calibration_session").contains(table)) {
            query.isNull("cycle_id");
        } else if ("hr_performance_result".equals(table)) {
            List<Long> identifiers = objectives.selectList(new LambdaQueryWrapper<HrPerformanceObjective>()
                    .select(HrPerformanceObjective::getId).eq(HrPerformanceObjective::getTenantId, tenantId())
                    .isNotNull(HrPerformanceObjective::getCycleId)).stream().map(HrPerformanceObjective::getId).toList();
            if (!identifiers.isEmpty()) query.notIn("objective_id", identifiers);
        }
    }

    private void legacyCycle(Long cycleId) {
        if (cycleId != null) throw conflict("APPRAISAL_DEDICATED_ENTRY_REQUIRED", "周期关联数据须在绩效周期页面操作，既有入口不能回改冻结依据");
    }

    public HrAppraisalCycle scoring(Long objectiveId, Long employeeId) {
        HrPerformanceObjective objective = objective(objectiveId);
        if (objective == null) throw invalid("绩效目标不存在");
        if (objective.getCycleId() == null) return null;
        HrAppraisalCycle cycle = lock(objective.getCycleId(), "SCORING");
        member(cycle.getCycleId(), employeeId);
        return cycle;
    }

    public void member(Long cycleId, Long employeeId) {
        if (employeeId == null || results.selectCount(new LambdaQueryWrapper<HrAppraisalResult>()
                .eq(HrAppraisalResult::getTenantId, tenantId()).eq(HrAppraisalResult::getCycleId, cycleId)
                .eq(HrAppraisalResult::getEmployeeId, employeeId)) != 1) throw invalid("员工不在该周期冻结参评名单中");
    }

    public void evaluationTarget(Long objectiveId, Long assignmentId, Long employeeId) {
        List<HrPerformanceAssignment> nodes = assignments.selectList(new LambdaQueryWrapper<HrPerformanceAssignment>()
                .eq(HrPerformanceAssignment::getTenantId, tenantId()).eq(HrPerformanceAssignment::getObjectiveId, objectiveId));
        Set<Long> parents = nodes.stream().map(HrPerformanceAssignment::getParentId).filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
        if (nodes.stream().noneMatch(node -> !parents.contains(node.getId()) && "EMPLOYEE".equals(node.getAssigneeType())
                && Objects.equals(node.getAssigneeId(), employeeId) && (assignmentId == null || assignmentId.equals(node.getId())))) {
            throw invalid("被评员工未承接该目标的叶子分派");
        }
    }
}
