package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.hr.domain.dto.HrAppraisalRequests;
import com.cloudflow.hr.domain.entity.HrAppraisalCycle;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrPerformanceAssignment;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.cloudflow.hr.domain.entity.HrPerformanceResult;
import com.cloudflow.hr.domain.vo.performance.HrAppraisalViews;
import com.cloudflow.hr.mapper.HrAppraisalCycleMapper;
import com.cloudflow.hr.mapper.HrPerformanceAssignmentMapper;
import com.cloudflow.hr.mapper.HrPerformanceObjectiveMapper;
import com.cloudflow.hr.mapper.HrPerformanceResultMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrAppraisalTargets {
    private final HrAppraisalCycleMapper cycles;
    private final HrPerformanceObjectiveMapper objectives;
    private final HrPerformanceAssignmentMapper assignments;
    private final HrPerformanceResultMapper scores;
    private final HrAppraisalGuard guard;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final HrAppraisalSnapshots snapshots;

    @Audit(name = "维护绩效周期目标")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public Long saveGoals(Long cycleId, HrAppraisalRequests.GoalTree input) {
        access.permission("hr:appraisal:manage");
        access.validate(input);
        HrAppraisalCycle cycle = guard.lock(cycleId, "ONGOING");
        guard.fullScope(cycle);
        HrHSupport.version(input.getVersion(), cycle.getVersion());
        HrAppraisalViews.Frozen frozen = frozen(cycle);
        if (input.getKraId() != null && frozen.kras().stream().noneMatch(kra -> kra.kraId().equals(input.getKraId()))) throw invalid("关键成果领域不属于本周期");
        if (!"GOAL_BASED".equals(frozen.evaluationMethod()) && input.getKraId() == null) throw invalid("须选择本周期的关键成果领域");
        if ("GOAL_BASED".equals(frozen.evaluationMethod()) && input.getKraId() != null) throw invalid("目标评价模式不使用关键成果领域");
        List<HrAppraisalRequests.GoalNode> ordered = ordered(input.getNodes());
        Set<String> parentKeys = input.getNodes().stream().map(HrAppraisalRequests.GoalNode::parentKey).filter(Objects::nonNull).collect(Collectors.toSet());
        for (HrAppraisalRequests.GoalNode node : ordered) {
            HrAppraisalRules.weight(node.weight());
            if ("EMPLOYEE".equals(node.assigneeType())) {
                guard.member(cycleId, node.assigneeId());
                access.scope(node.assigneeId());
            } else {
                if (!parentKeys.contains(node.key())) throw invalid("叶子目标必须分派到员工");
                if (cycles.validScopeIds(tenantId(), "DEPT", List.of(node.assigneeId())).size() != 1) throw invalid("目标部门无效");
            }
        }
        HrPerformanceObjective objective = input.getObjectiveId() == null ? new HrPerformanceObjective() : requiredObjective(cycleId, input.getObjectiveId());
        if (input.getObjectiveId() != null) {
            assertNoEvidence(objective.getId());
            assignments.delete(new LambdaQueryWrapper<HrPerformanceAssignment>().eq(HrPerformanceAssignment::getTenantId, tenantId())
                    .eq(HrPerformanceAssignment::getCycleId, cycleId).eq(HrPerformanceAssignment::getObjectiveId, objective.getId()));
        }
        objective.setTenantId(tenantId());
        objective.setCycleId(cycleId);
        objective.setCycleName(cycle.getCycleName());
        objective.setCycleStartDate(cycle.getStartDate());
        objective.setCycleEndDate(cycle.getEndDate());
        objective.setObjectiveName(input.getObjectiveName().trim());
        objective.setKraId(input.getKraId());
        objective.setUpdateBy(HrRuleSupport.userName());
        if (objective.getId() == null) {
            objective.setObjectiveNo("AP-" + UUID.randomUUID().toString().replace("-", ""));
            objective.setStatus("DRAFT");
            objective.setDeleted(0);
            objective.setVersion(0);
            objective.setCreateBy(HrRuleSupport.userName());
            objectives.insert(objective);
        } else if (objectives.updateById(objective) != 1) throw conflict("VERSION_CONFLICT", "目标已变化");
        Map<String, Long> identifiers = new LinkedHashMap<>();
        Map<Long, String> departmentNames = cycles.options(tenantId(), "DEPT").stream().collect(Collectors.toMap(HrAppraisalViews.Option::identifier, HrAppraisalViews.Option::name));
        for (HrAppraisalRequests.GoalNode node : ordered) {
            HrPerformanceAssignment assignment = new HrPerformanceAssignment();
            assignment.setTenantId(tenantId());
            assignment.setCycleId(cycleId);
            assignment.setObjectiveId(objective.getId());
            assignment.setParentId(node.parentKey() == null ? null : identifiers.get(node.parentKey()));
            assignment.setAssigneeType(node.assigneeType());
            assignment.setAssigneeId(node.assigneeId());
            assignment.setAssigneeName("EMPLOYEE".equals(node.assigneeType()) ? access.employee(node.assigneeId()).getName() : departmentNames.get(node.assigneeId()));
            assignment.setWeight(node.weight().movePointRight(2));
            assignment.setTargetValue(node.targetValue());
            assignment.setActualValue(BigDecimal.ZERO);
            assignment.setStatus("ACTIVE");
            assignment.setVersion(0);
            assignments.insert(assignment);
            identifiers.put(node.key(), assignment.getId());
        }
        advance(cycle);
        support.audit("HR_APPRAISAL", cycleId, "GOALS_SAVED", goals(cycleId));
        return objective.getId();
    }

    @Audit(name = "移除未冻结绩效目标", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void removeGoal(Long cycleId, Long objectiveId, Integer version) {
        access.permission("hr:appraisal:manage");
        HrAppraisalCycle cycle = guard.lock(cycleId, "ONGOING");
        guard.fullScope(cycle);
        HrHSupport.version(version, cycle.getVersion());
        HrPerformanceObjective objective = requiredObjective(cycleId, objectiveId);
        assertNoEvidence(objectiveId);
        objective.setDeleted(1);
        objective.setUpdateBy(HrRuleSupport.userName());
        if (objectives.updateById(objective) != 1) throw conflict("VERSION_CONFLICT", "目标已变化");
        assignments.delete(new LambdaQueryWrapper<HrPerformanceAssignment>().eq(HrPerformanceAssignment::getTenantId, tenantId())
                .eq(HrPerformanceAssignment::getCycleId, cycleId).eq(HrPerformanceAssignment::getObjectiveId, objectiveId));
        advance(cycle);
        support.audit("HR_APPRAISAL", cycleId, "GOAL_REMOVED", Map.of("objectiveId", objectiveId));
    }

    @Audit(name = "记录绩效周期叶子目标评分")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void scoreGoal(Long cycleId, HrAppraisalRequests.GoalScore input) {
        access.permission("hr:appraisal:score");
        access.validate(input);
        HrAppraisalCycle cycle = guard.lock(cycleId, "SCORING");
        HrHSupport.version(input.getVersion(), cycle.getVersion());
        HrAppraisalViews.Frozen frozen = frozen(cycle);
        unchanged(cycle);
        HrAppraisalViews.Goal goal = leaves(frozen.goals()).stream().filter(row -> row.assignmentId().equals(input.getAssignmentId())).findFirst()
                .orElseThrow(() -> invalid("只能对本周期冻结的叶子目标评分"));
        access.operator(goal.assigneeId(), "hr:appraisal:score");
        HrAppraisalRules.score(input.getScore(), frozen.scoreConfig());
        List<HrPerformanceResult> existing = scoreRows(goal);
        if (existing.size() > 1) throw conflict("APPRAISAL_DUPLICATE_SCORE", "目标存在重复评分，须核对原始记录");
        HrPerformanceResult score = existing.isEmpty() ? new HrPerformanceResult() : existing.get(0);
        score.setTenantId(tenantId());
        score.setObjectiveId(goal.objectiveId());
        score.setAssignmentId(goal.assignmentId());
        score.setEmployeeId(goal.assigneeId());
        score.setScore(input.getScore());
        score.setSummary(input.getSummary().trim());
        score.setStatus("SUBMITTED");
        if (score.getId() == null) {
            score.setVersion(0);
            scores.insert(score);
        } else if (scores.updateById(score) != 1) throw conflict("VERSION_CONFLICT", "目标评分已变化");
        advance(cycle);
        support.audit("HR_APPRAISAL", cycleId, "GOAL_SCORED", new HrAppraisalViews.GoalInput(goal.assignmentId(), score.getId(), score.getVersion(), score.getScore(), score.getSummary()));
    }

    public List<HrAppraisalViews.Goal> goals(Long cycleId) {
        Map<Long, HrPerformanceObjective> indexed = objectives.selectList(new LambdaQueryWrapper<HrPerformanceObjective>()
                        .eq(HrPerformanceObjective::getTenantId, tenantId()).eq(HrPerformanceObjective::getCycleId, cycleId)
                        .eq(HrPerformanceObjective::getDeleted, 0).orderByAsc(HrPerformanceObjective::getId)).stream()
                .collect(Collectors.toMap(HrPerformanceObjective::getId, objective -> objective));
        List<HrAppraisalViews.Goal> goals = new ArrayList<>();
        for (HrPerformanceAssignment assignment : assignments.selectList(new LambdaQueryWrapper<HrPerformanceAssignment>()
                .eq(HrPerformanceAssignment::getTenantId, tenantId()).eq(HrPerformanceAssignment::getCycleId, cycleId).orderByAsc(HrPerformanceAssignment::getId))) {
            HrPerformanceObjective objective = indexed.get(assignment.getObjectiveId());
            if (objective == null || !"ACTIVE".equals(assignment.getStatus())) throw invalid("周期目标或分派状态不一致");
            goals.add(new HrAppraisalViews.Goal(assignment.getId(), objective.getId(), objective.getObjectiveName(), assignment.getParentId(),
                    objective.getKraId(), assignment.getAssigneeType(), assignment.getAssigneeId(), assignment.getAssigneeName(),
                    assignment.getWeight().movePointLeft(2), assignment.getTargetValue(), objective.getVersion(), assignment.getVersion()));
        }
        for (HrAppraisalViews.Goal goal : goals) {
            if (goal.parentId() != null && goals.stream().noneMatch(parent -> parent.assignmentId().equals(goal.parentId()) && parent.objectiveId().equals(goal.objectiveId()))) {
                throw invalid("分派父节点不存在或跨目标");
            }
        }
        return List.copyOf(goals);
    }

    public List<HrAppraisalViews.Goal> freezeGoals(HrAppraisalCycle cycle) {
        List<HrAppraisalViews.Goal> goals = goals(cycle.getCycleId());
        HrAppraisalViews.Frozen frozen = frozen(cycle);
        HrAppraisalRules.goals(frozen.evaluationMethod(), ruleKras(frozen.kras()), goals.stream().map(goal -> ruleGoal(goal, null)).toList(),
                guard.participants(cycle.getCycleId()).stream().map(result -> result.getEmployeeId()).collect(Collectors.toSet()));
        return goals;
    }

    public void unchanged(HrAppraisalCycle cycle) {
        if (!snapshots.matches(frozen(cycle).goals(), snapshots.tree(goals(cycle.getCycleId())))) {
            throw conflict("APPRAISAL_FROZEN_GOALS_CHANGED", "目标或权重与评分阶段冻结依据不一致");
        }
    }

    public List<HrAppraisalViews.GoalInput> currentScores(HrAppraisalCycle cycle, Long employeeId) {
        List<HrAppraisalViews.GoalInput> values = new ArrayList<>();
        for (HrAppraisalViews.Goal goal : leaves(frozen(cycle).goals())) {
            if (!Objects.equals(employeeId, goal.assigneeId())) continue;
            for (HrPerformanceResult score : scoreRows(goal)) {
                values.add(new HrAppraisalViews.GoalInput(goal.assignmentId(), score.getId(), score.getVersion(), score.getScore(), score.getSummary()));
            }
        }
        return List.copyOf(values);
    }

    public Calculation input(HrAppraisalCycle cycle, Long employeeId) {
        HrAppraisalViews.Frozen frozen = frozen(cycle);
        List<HrAppraisalViews.Goal> employeeGoals = leaves(frozen.goals()).stream().filter(goal -> goal.assigneeId().equals(employeeId)).toList();
        List<HrAppraisalViews.GoalInput> goalInputs = new ArrayList<>();
        List<HrAppraisalRules.Goal> ruleGoals = new ArrayList<>();
        for (HrAppraisalViews.Goal goal : employeeGoals) {
            List<HrPerformanceResult> rows = scoreRows(goal);
            if (rows.size() != 1 || !"SUBMITTED".equals(rows.get(0).getStatus()) || rows.get(0).getScore() == null) {
                throw invalid("目标缺少唯一已提交评分：" + goal.objectiveName());
            }
            HrPerformanceResult score = rows.get(0);
            goalInputs.add(new HrAppraisalViews.GoalInput(goal.assignmentId(), score.getId(), score.getVersion(), score.getScore(), score.getSummary()));
            ruleGoals.add(new HrAppraisalRules.Goal(goal.assignmentId(), null, employeeId, goal.kraId(), goal.weight(), score.getScore()));
        }
        List<HrAppraisalViews.SourceInput> sourceInputs = cycles.sourceInputs(tenantId(), cycle.getCycleId(), employeeId);
        Map<String, List<BigDecimal>> grouped = new LinkedHashMap<>();
        for (HrAppraisalViews.SourceInput source : sourceInputs) {
            if ("CUSTOMER".equals(source.source())) throw invalid(HrAppraisalRules.CUSTOMER_DISABLED);
            if ("SELF".equals(source.source()) != Objects.equals(employeeId, source.evaluatorEmployeeId())) throw invalid("自评来源与真实评价人不一致");
            HrAppraisalRules.score(source.score(), frozen.scoreConfig());
            grouped.computeIfAbsent(sourceVariable(source.source()), key -> new ArrayList<>()).add(source.score());
        }
        Map<String, BigDecimal> sourceScores = new LinkedHashMap<>();
        grouped.forEach((source, values) -> sourceScores.put(source, values.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(values.size()), 16, RoundingMode.HALF_UP)));
        HrAppraisalRules.Scores calculated = HrAppraisalRules.calculate(frozen.evaluationMethod(), frozen.finalScoreMode(), frozen.finalScoreFormula(),
                frozen.scoreConfig(), ruleKras(frozen.kras()), ruleGoals, sourceScores);
        return new Calculation(calculated.calculatedScore(), new HrAppraisalViews.Inputs(List.copyOf(goalInputs), sourceInputs, calculated.inputs()));
    }

    public HrAppraisalViews.Frozen frozen(HrAppraisalCycle cycle) {
        if (cycle.getFrozenConfig() == null) throw invalid("周期尚未冻结配置");
        return access.convert(cycle.getFrozenConfig(), HrAppraisalViews.Frozen.class);
    }

    public static List<HrAppraisalViews.Goal> leaves(List<HrAppraisalViews.Goal> goals) {
        Set<Long> parents = goals.stream().map(HrAppraisalViews.Goal::parentId).filter(Objects::nonNull).collect(Collectors.toSet());
        return goals.stream().filter(goal -> !parents.contains(goal.assignmentId())).toList();
    }

    public static List<HrAppraisalRules.Kra> ruleKras(List<HrAppraisalViews.Kra> kras) {
        return kras.stream().map(kra -> new HrAppraisalRules.Kra(kra.kraId(), kra.weight())).toList();
    }

    public static String sourceVariable(String source) {
        return switch (source) {
            case "SELF" -> "selfScore";
            case "MANAGER" -> "managerScore";
            case "PEER" -> "peerScore";
            case "SUBORDINATE" -> "subordinateScore";
            case "CUSTOMER" -> "customerScore";
            default -> throw invalid("未知360评分来源");
        };
    }

    private List<HrPerformanceResult> scoreRows(HrAppraisalViews.Goal goal) {
        return scores.selectList(new LambdaQueryWrapper<HrPerformanceResult>().eq(HrPerformanceResult::getTenantId, tenantId())
                .eq(HrPerformanceResult::getObjectiveId, goal.objectiveId()).eq(HrPerformanceResult::getAssignmentId, goal.assignmentId())
                .eq(HrPerformanceResult::getEmployeeId, goal.assigneeId()));
    }

    private HrPerformanceObjective requiredObjective(Long cycleId, Long objectiveId) {
        HrPerformanceObjective objective = guard.objective(objectiveId);
        if (objective == null || !Objects.equals(objective.getCycleId(), cycleId)) throw invalid("目标不属于本周期");
        return objective;
    }

    private void assertNoEvidence(Long objectiveId) {
        if (scores.selectCount(new LambdaQueryWrapper<HrPerformanceResult>().eq(HrPerformanceResult::getTenantId, tenantId())
                .eq(HrPerformanceResult::getObjectiveId, objectiveId)) != 0) throw conflict("APPRAISAL_EVIDENCE_EXISTS", "目标已有评分证据，不能替换或移除");
    }

    private void advance(HrAppraisalCycle cycle) {
        cycle.setUpdateBy(HrRuleSupport.userName());
        if (cycles.updateById(cycle) != 1) throw conflict("VERSION_CONFLICT", "周期已变化，请重新读取");
    }

    private static HrAppraisalRules.Goal ruleGoal(HrAppraisalViews.Goal goal, BigDecimal score) {
        return new HrAppraisalRules.Goal(goal.assignmentId(), goal.parentId(), "EMPLOYEE".equals(goal.assigneeType()) ? goal.assigneeId() : null,
                goal.kraId(), goal.weight(), score);
    }

    private static List<HrAppraisalRequests.GoalNode> ordered(List<HrAppraisalRequests.GoalNode> nodes) {
        Map<String, HrAppraisalRequests.GoalNode> indexed = new HashMap<>();
        for (HrAppraisalRequests.GoalNode node : nodes) if (indexed.put(node.key(), node) != null) throw invalid("分派节点标识重复");
        for (HrAppraisalRequests.GoalNode node : nodes) {
            Set<String> visited = new HashSet<>();
            HrAppraisalRequests.GoalNode current = node;
            while (current != null) {
                if (!visited.add(current.key())) throw invalid("分派树存在循环");
                if (current.parentKey() != null && !indexed.containsKey(current.parentKey())) throw invalid("分派树父节点不存在");
                current = indexed.get(current.parentKey());
            }
        }
        List<HrAppraisalRequests.GoalNode> result = new ArrayList<>();
        Set<String> appended = new HashSet<>();
        while (result.size() < nodes.size()) {
            for (HrAppraisalRequests.GoalNode node : nodes) {
                if (!appended.contains(node.key()) && (node.parentKey() == null || appended.contains(node.parentKey()))) {
                    result.add(node);
                    appended.add(node.key());
                }
            }
        }
        return List.copyOf(result);
    }

    public record Calculation(BigDecimal score, HrAppraisalViews.Inputs inputs) { }
}
