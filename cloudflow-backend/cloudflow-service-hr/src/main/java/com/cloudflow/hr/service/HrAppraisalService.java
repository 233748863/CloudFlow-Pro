package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.HrAppraisalRequests;
import com.cloudflow.hr.domain.entity.HrAppraisalCycle;
import com.cloudflow.hr.domain.entity.HrAppraisalKra;
import com.cloudflow.hr.domain.entity.HrAppraisalResult;
import com.cloudflow.hr.domain.entity.HrPerfDistributionRule;
import com.cloudflow.hr.domain.entity.HrTalentCalibrationSession;
import com.cloudflow.hr.domain.vo.performance.HrAppraisalViews;
import com.cloudflow.hr.mapper.HrAppraisalCycleMapper;
import com.cloudflow.hr.mapper.HrAppraisalKraMapper;
import com.cloudflow.hr.mapper.HrAppraisalResultMapper;
import com.cloudflow.hr.mapper.HrPerfDistributionRuleMapper;
import com.cloudflow.hr.mapper.HrTalentCalibrationSessionMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrAppraisalService {
    private final HrAppraisalCycleMapper cycles;
    private final HrAppraisalKraMapper kras;
    private final HrAppraisalResultMapper results;
    private final HrPerfDistributionRuleMapper rules;
    private final HrTalentCalibrationSessionMapper sessions;
    private final HrAppraisalTargets targets;
    private final HrAppraisalGuard guard;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final ObjectMapper objectMapper;
    private final HrAppraisalSnapshots snapshots;

    public HrAppraisalViews.Options options() {
        access.permission("hr:appraisal:manage");
        return new HrAppraisalViews.Options(cycles.options(tenantId(), "DEPT"), cycles.options(tenantId(), "POSITION"), cycles.options(tenantId(), "LEVEL"));
    }

    public PageResult<HrAppraisalViews.Employee> people(HrAppraisalRequests.Query query) {
        access.user();
        if (!access.permitted("hr:appraisal:manage") && !access.permitted("hr:appraisal:calibrate")) throw forbidden();
        access.validate(query);
        Page<HrAppraisalViews.Employee> page = cycles.people(new Page<>(query.getPageNum(), query.getPageSize()), tenantId(), query, guard.scope(false), HrHSupport.today());
        return new PageResult<>(page.getRecords(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public PageResult<HrAppraisalViews.Cycle> list(HrAppraisalRequests.Query query, boolean mine) {
        access.permission(mine ? "hr:appraisal:own" : "hr:appraisal:list");
        access.validate(query);
        Page<Long> page = cycles.pageCycles(new Page<>(query.getPageNum(), query.getPageSize()), tenantId(), query, guard.scope(mine), mine, HrRuleSupport.userName());
        List<HrAppraisalViews.Cycle> rows = page.getRecords().stream().map(identifier -> cycleView(guard.cycle(identifier), guard.visible(identifier, mine).size(), mine)).toList();
        return new PageResult<>(rows, page.getTotal(), page.getCurrent(), page.getSize());
    }

    public HrAppraisalViews.Detail detail(Long cycleId, boolean mine) {
        access.permission(mine ? "hr:appraisal:own" : "hr:appraisal:list");
        HrAppraisalCycle cycle = guard.cycle(cycleId);
        List<HrAppraisalResult> participants = guard.participants(cycleId);
        List<Long> visible = guard.visible(cycleId, mine);
        if ("DRAFT".equals(cycle.getStatus()) && !mine) guard.fullScope(cycle);
        else if (visible.isEmpty()) throw forbidden();
        boolean full = !mine && visible.size() == participants.size();
        boolean published = "COMPLETED".equals(cycle.getStatus());
        HrAppraisalViews.Frozen frozen = cycle.getFrozenConfig() == null ? null : targets.frozen(cycle);
        boolean frozenTargets = frozen != null && !List.of("DRAFT", "ONGOING").contains(cycle.getStatus());
        List<HrAppraisalViews.Goal> goals = frozenTargets ? frozen.goals() : mine ? List.of() : targets.goals(cycleId);
        if (!full) goals = HrAppraisalTargets.leaves(goals).stream().filter(goal -> visible.contains(goal.assigneeId()))
                .map(goal -> new HrAppraisalViews.Goal(goal.assignmentId(), goal.objectiveId(), goal.objectiveName(), null, goal.kraId(),
                        goal.assigneeType(), goal.assigneeId(), goal.assigneeName(), goal.weight(), goal.targetValue(), goal.objectiveVersion(), goal.assignmentVersion())).toList();
        HrAppraisalViews.Rule rule = frozenTargets ? frozen.distributionRule() : currentRule(cycleId);
        HrAppraisalRules.Distribution distribution = full ? distribution(rule, participants, false) : null;
        List<HrAppraisalViews.Result> rows = participants.stream().filter(result -> visible.contains(result.getEmployeeId()))
                .map(result -> resultView(result, cycle, mine, published)).toList();
        List<HrAppraisalViews.Session> meetings = mine ? List.of() : sessionRows(cycleId).stream()
                .filter(session -> full || Objects.equals(session.getFacilitatorId(), access.user())
                        || session.getParticipants() != null && session.getParticipants().contains(access.user())).map(this::sessionView).toList();
        return new HrAppraisalViews.Detail(cycleView(cycle, visible.size(), mine), frozen == null ? kraViews(cycleId) : frozen.kras(),
                goals, rows, full ? rule : null, distribution, meetings);
    }

    @Audit(name = "维护绩效周期配置")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public Long save(HrAppraisalRequests.Draft input) {
        access.permission("hr:appraisal:manage");
        access.validate(input);
        guard.scope(false);
        if (input.getEndDate().isBefore(input.getStartDate())) throw invalid("结束日期不能早于开始日期");
        HrAppraisalRules.configuration(input.getEvaluationMethod(), input.getFinalScoreMode(), input.getFinalScoreFormula(), input.getScoreConfig());
        validateScope("DEPT", input.getScopeDeptIds());
        validateScope("POSITION", input.getScopePositionIds());
        validateScope("LEVEL", input.getScopeJobLevelIds());
        HrAppraisalCycle cycle = input.getCycleId() == null ? new HrAppraisalCycle() : guard.lock(input.getCycleId(), "DRAFT");
        if (input.getCycleId() != null) {
            guard.fullScope(cycle);
            HrHSupport.version(input.getVersion(), cycle.getVersion());
        }
        cycle.setTenantId(tenantId());
        cycle.setCycleName(input.getCycleName().trim());
        cycle.setCycleType(input.getCycleType());
        cycle.setStartDate(input.getStartDate());
        cycle.setEndDate(input.getEndDate());
        cycle.setScopeDeptIds(List.copyOf(input.getScopeDeptIds()));
        cycle.setScopePositionIds(List.copyOf(input.getScopePositionIds()));
        cycle.setScopeJobLevelIds(List.copyOf(input.getScopeJobLevelIds()));
        cycle.setEvaluationMethod(input.getEvaluationMethod());
        cycle.setFinalScoreMode(input.getFinalScoreMode());
        cycle.setFinalScoreFormula("FORMULA".equals(input.getFinalScoreMode()) ? input.getFinalScoreFormula().trim() : "");
        cycle.setScoreConfig(snapshots.tree(input.getScoreConfig()));
        cycle.setRemark(input.getRemark() == null ? "" : input.getRemark().trim());
        cycle.setUpdateBy(HrRuleSupport.userName());
        if (cycle.getCycleId() == null) {
            cycle.setStatus("DRAFT");
            cycle.setDeleted(0);
            cycle.setVersion(0);
            cycle.setCreateBy(HrRuleSupport.userName());
            cycles.insert(cycle);
        } else update(cycle);
        support.audit("HR_APPRAISAL", cycle.getCycleId(), "CONFIGURED", cycleView(cycle, 0, false));
        return cycle.getCycleId();
    }

    @Audit(name = "删除绩效周期草稿", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void remove(Long cycleId, Integer version) {
        access.permission("hr:appraisal:manage");
        HrAppraisalCycle cycle = guard.lock(cycleId, "DRAFT");
        guard.fullScope(cycle);
        HrHSupport.version(version, cycle.getVersion());
        cycle.setDeleted(1);
        update(cycle);
        support.audit("HR_APPRAISAL", cycleId, "DRAFT_REMOVED", Map.of("version", version));
    }

    public HrAppraisalViews.Preview preview(Long cycleId) {
        access.permission("hr:appraisal:manage");
        HrAppraisalCycle cycle = guard.cycle(cycleId);
        guard.fullScope(cycle);
        if (!"DRAFT".equals(cycle.getStatus())) throw invalid("启动后参评名单已冻结，请查看周期详情");
        return previewOf(cycle);
    }

    @Audit(name = "配置绩效周期关键成果领域")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void saveKras(Long cycleId, HrAppraisalRequests.Kras input) {
        access.permission("hr:appraisal:manage");
        access.validate(input);
        HrAppraisalCycle cycle = guard.lock(cycleId, "DRAFT");
        guard.fullScope(cycle);
        HrHSupport.version(input.getVersion(), cycle.getVersion());
        if ("GOAL_BASED".equals(cycle.getEvaluationMethod()) && !input.getKras().isEmpty()) throw invalid("目标评价模式不配置关键成果领域");
        Set<String> names = new HashSet<>();
        List<HrAppraisalRules.Kra> weights = new ArrayList<>();
        for (int index = 0; index < input.getKras().size(); index++) {
            HrAppraisalRequests.Kra row = input.getKras().get(index);
            if (!names.add(row.kraName().trim())) throw invalid("关键成果领域名称重复");
            weights.add(new HrAppraisalRules.Kra((long) index + 1, row.weight()));
        }
        HrAppraisalRules.kras(weights, !"GOAL_BASED".equals(cycle.getEvaluationMethod()));
        kras.delete(new LambdaQueryWrapper<HrAppraisalKra>().eq(HrAppraisalKra::getTenantId, tenantId()).eq(HrAppraisalKra::getCycleId, cycleId));
        for (int index = 0; index < input.getKras().size(); index++) {
            HrAppraisalRequests.Kra row = input.getKras().get(index);
            HrAppraisalKra kra = new HrAppraisalKra();
            kra.setTenantId(tenantId());
            kra.setCycleId(cycleId);
            kra.setKraName(row.kraName().trim());
            kra.setWeight(row.weight());
            kra.setSortNo(index);
            kra.setDescription(row.description());
            kra.setVersion(0);
            kra.setCreateBy(HrRuleSupport.userName());
            kra.setUpdateBy(HrRuleSupport.userName());
            kras.insert(kra);
        }
        update(cycle);
        support.audit("HR_APPRAISAL", cycleId, "KRA_CONFIGURED", kraViews(cycleId));
    }

    @Audit(name = "配置绩效周期分布规则")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void saveDistribution(Long cycleId, HrAppraisalRequests.Distribution input) {
        access.permission("hr:appraisal:manage");
        access.validate(input);
        HrAppraisalRules.quotas(input.getDistribution());
        HrAppraisalCycle cycle = guard.lock(cycleId, "DRAFT", "ONGOING");
        guard.fullScope(cycle);
        HrHSupport.version(input.getVersion(), cycle.getVersion());
        List<HrPerfDistributionRule> existing = rules.selectList(ruleQuery().eq(HrPerfDistributionRule::getCycleId, cycleId));
        if (existing.size() > 1) throw invalid("周期存在多条分布规则，须核对原始配置");
        HrPerfDistributionRule rule = existing.isEmpty() ? new HrPerfDistributionRule() : existing.get(0);
        rule.setTenantId(tenantId());
        rule.setCycleId(cycleId);
        rule.setRuleName(input.getRuleName().trim());
        rule.setEnforceMode(input.getEnforceMode());
        rule.setDistribution(objectMapper.convertValue(input.getDistribution(), new TypeReference<List<Map<String, Object>>>() { }));
        rule.setTotalPopulation(guard.participants(cycleId).size());
        rule.setStatus("ACTIVE");
        rule.setUpdateBy(HrRuleSupport.userName());
        if (rule.getId() == null) {
            rule.setDeleted(0);
            rule.setVersion(0);
            rule.setCreateBy(HrRuleSupport.userName());
            rules.insert(rule);
        } else if (rules.updateById(rule) != 1) throw conflict("VERSION_CONFLICT", "分布规则已变化");
        update(cycle);
        support.audit("HR_APPRAISAL", cycleId, "DISTRIBUTION_CONFIGURED", currentRule(cycleId));
    }

    @Audit(name = "推进绩效周期阶段", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public String transition(Long cycleId, HrAppraisalRequests.Transition input) {
        access.permission("hr:appraisal:transition");
        access.validate(input);
        HrAppraisalCycle cycle = guard.lock(cycleId, "DRAFT", "ONGOING", "SCORING", "CALIBRATING");
        guard.fullScope(cycle);
        HrHSupport.version(input.getVersion(), cycle.getVersion());
        HrAppraisalRules.transition(cycle.getStatus(), input.getTargetStatus());
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("from", cycle.getStatus());
        evidence.put("to", input.getTargetStatus());
        switch (input.getTargetStatus()) {
            case "ONGOING" -> start(cycle, input.getPreviewDigest(), evidence);
            case "SCORING" -> {
                HrAppraisalViews.Frozen old = targets.frozen(cycle);
                List<HrAppraisalViews.Goal> goals = targets.freezeGoals(cycle);
                HrAppraisalViews.Rule rule = currentRule(cycleId);
                if (rule != null) HrAppraisalRules.quotas(rule.distribution());
                HrAppraisalViews.Frozen frozen = new HrAppraisalViews.Frozen(old.evaluationMethod(), old.finalScoreMode(), old.finalScoreFormula(), old.scoreConfig(),
                        old.kras(), goals, rule, old.participantsDigest());
                cycle.setFrozenConfig(snapshots.tree(frozen));
                evidence.put("frozen", frozen);
            }
            case "CALIBRATING" -> {
                verifyCalculated(cycle);
                evidence.put("results", guard.participants(cycleId));
            }
            case "COMPLETED" -> {
                verifyCalculated(cycle);
                List<HrAppraisalResult> participants = guard.participants(cycleId);
                for (HrAppraisalResult result : participants) {
                    if (!"CALIBRATED".equals(result.getStatus()) || result.getFinalScore() == null || result.getGrade() == null) throw invalid("须逐人确认最终得分、等级和原因后再完成");
                }
                HrAppraisalRules.Distribution distribution = distribution(targets.frozen(cycle).distributionRule(), participants, true);
                if (distribution != null && (!distribution.valid() || !distribution.violations().isEmpty() && !input.isAcknowledgeWarnings())) {
                    throw conflict("APPRAISAL_DISTRIBUTION_FAILED", distribution.valid() ? "存在分布警告，须明确确认后完成" : "最终等级未通过强制分布校验");
                }
                if (sessionRows(cycleId).stream().anyMatch(session -> !Set.of("COMPLETED", "CANCELLED").contains(session.getStatus()))) throw invalid("校准会议尚未完成或取消");
                for (HrAppraisalResult result : participants) {
                    result.setStatus("COMPLETED");
                    updateResult(result);
                }
                cycle.setCompletedTime(HrHSupport.now());
                if (distribution != null) evidence.put("distribution", distribution);
                evidence.put("warningsAcknowledged", input.isAcknowledgeWarnings());
                evidence.put("results", participants);
            }
            default -> throw invalid("目标阶段无效");
        }
        cycle.setStatus(input.getTargetStatus());
        update(cycle);
        support.audit("HR_APPRAISAL", cycleId, "TRANSITION", evidence);
        return cycle.getStatus();
    }

    @Audit(name = "计算绩效周期总分")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public HrAppraisalViews.Calculated calculate(Long cycleId, Integer version) {
        access.permission("hr:appraisal:score");
        HrAppraisalCycle cycle = guard.lock(cycleId, "SCORING");
        guard.fullScope(cycle);
        HrHSupport.version(version, cycle.getVersion());
        targets.unchanged(cycle);
        List<HrAppraisalResult> participants = guard.participants(cycleId);
        Map<Long, HrAppraisalTargets.Calculation> computed = new LinkedHashMap<>();
        List<HrAppraisalViews.Calculation> output = new ArrayList<>();
        for (HrAppraisalResult result : participants) {
            HrAppraisalViews.Employee employee = access.convert(result.getScopeSnapshot(), HrAppraisalViews.Employee.class);
            try {
                HrAppraisalTargets.Calculation calculation = targets.input(cycle, result.getEmployeeId());
                computed.put(result.getEmployeeId(), calculation);
                output.add(new HrAppraisalViews.Calculation(result.getEmployeeId(), employee.employeeName(), calculation.score(), null));
            } catch (IllegalArgumentException | ArithmeticException missing) {
                output.add(new HrAppraisalViews.Calculation(result.getEmployeeId(), employee.employeeName(), null, missing.getMessage()));
            } catch (HrHException missing) {
                if (missing.getStatus() != 400) throw missing;
                output.add(new HrAppraisalViews.Calculation(result.getEmployeeId(), employee.employeeName(), null, missing.getMessage()));
            }
        }
        if (computed.size() != participants.size()) return new HrAppraisalViews.Calculated(cycle.getVersion(), List.copyOf(output));
        for (HrAppraisalResult result : participants) {
            HrAppraisalTargets.Calculation calculation = computed.get(result.getEmployeeId());
            result.setInputScores(snapshots.tree(calculation.inputs()));
            result.setCalculatedScore(calculation.score());
            result.setFinalScore(calculation.score());
            result.setStatus("SCORED");
            updateResult(result);
        }
        update(cycle);
        support.audit("HR_APPRAISAL", cycleId, "CALCULATED", participants);
        return new HrAppraisalViews.Calculated(cycle.getVersion(), List.copyOf(output));
    }

    @Audit(name = "校准绩效周期结果", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void calibrate(Long cycleId, HrAppraisalRequests.Calibration input) {
        access.permission("hr:appraisal:calibrate");
        access.validate(input);
        HrAppraisalCycle cycle = guard.lock(cycleId, "CALIBRATING");
        HrHSupport.version(input.getVersion(), cycle.getVersion());
        HrAppraisalResult result = guard.participants(cycleId).stream().filter(row -> row.getAppraisalResultId().equals(input.getAppraisalResultId())).findFirst()
                .orElseThrow(() -> invalid("结果不属于该周期"));
        access.operator(result.getEmployeeId(), "hr:appraisal:calibrate");
        HrHSupport.version(input.getResultVersion(), result.getVersion());
        HrAppraisalViews.Frozen frozen = targets.frozen(cycle);
        HrAppraisalRules.score(input.getFinalScore(), frozen.scoreConfig());
        if (frozen.distributionRule() != null && frozen.distributionRule().distribution().stream().noneMatch(quota -> quota.grade().equals(input.getGrade().trim()))) throw invalid("等级不在冻结的分布规则中");
        result.setFinalScore(input.getFinalScore());
        result.setGrade(input.getGrade().trim());
        result.setCalibrationReason(input.getReason().trim());
        result.setCalibratedBy(access.user());
        result.setStatus("CALIBRATED");
        updateResult(result);
        update(cycle);
        support.audit("HR_APPRAISAL", cycleId, "CALIBRATED", result);
    }

    @Audit(name = "维护绩效周期校准会议", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public Long saveSession(Long cycleId, HrAppraisalRequests.Session input) {
        access.permission("hr:appraisal:calibrate");
        access.validate(input);
        HrAppraisalCycle cycle = guard.lock(cycleId, "CALIBRATING");
        HrHSupport.version(input.getVersion(), cycle.getVersion());
        if (guard.visible(cycleId, false).isEmpty()) throw forbidden();
        if (!input.getParticipantUserIds().contains(input.getFacilitatorUserId())) throw invalid("主持人须包含在参会名单中");
        if (new HashSet<>(input.getParticipantUserIds()).size() != input.getParticipantUserIds().size()) throw invalid("参会人重复");
        for (Long userId : input.getParticipantUserIds()) {
            List<Long> linked = cycles.employeesForUser(tenantId(), userId);
            if (linked.size() != 1) throw invalid("参会账号须关联本租户唯一有效员工");
            access.scope(linked.get(0));
        }
        if ("COMPLETED".equals(input.getStatus()) && (input.getMinutes() == null || input.getMinutes().isBlank())) throw invalid("会议完成须填写实际纪要");
        HrTalentCalibrationSession session = input.getSessionId() == null ? new HrTalentCalibrationSession() : sessionRows(cycleId).stream()
                .filter(row -> row.getId().equals(input.getSessionId())).findFirst().orElseThrow(() -> invalid("会议不属于该周期"));
        if (session.getId() != null && !Objects.equals(session.getCreateBy(), HrRuleSupport.userName())) guard.fullScope(cycle);
        if (session.getId() != null && Set.of("COMPLETED", "CANCELLED").contains(session.getStatus())) throw invalid("已结束的会议记录只读");
        session.setTenantId(tenantId());
        session.setCycleId(cycleId);
        session.setSessionName(input.getSessionName().trim());
        session.setScheduledAt(input.getScheduledAt());
        session.setLocation(input.getLocation().trim());
        session.setFacilitatorId(input.getFacilitatorUserId());
        session.setParticipants(List.copyOf(input.getParticipantUserIds()));
        session.setAgenda(input.getAgenda().trim());
        session.setMinutes(input.getMinutes() == null ? "" : input.getMinutes().trim());
        session.setStatus(input.getStatus());
        session.setUpdateBy(HrRuleSupport.userName());
        if (session.getId() == null) {
            session.setSessionNo("AP-CAL-" + UUID.randomUUID().toString().replace("-", ""));
            session.setCreateBy(HrRuleSupport.userName());
            session.setDeleted(0);
            session.setVersion(0);
            sessions.insert(session);
        } else if (sessions.updateById(session) != 1) throw conflict("VERSION_CONFLICT", "会议记录已变化");
        update(cycle);
        support.audit("HR_APPRAISAL", cycleId, "CALIBRATION_SESSION", sessionView(session));
        return session.getId();
    }

    private void start(HrAppraisalCycle cycle, String digest, Map<String, Object> evidence) {
        HrAppraisalRules.Configuration configuration = access.convert(cycle.getScoreConfig(), HrAppraisalRules.Configuration.class);
        HrAppraisalRules.configuration(cycle.getEvaluationMethod(), cycle.getFinalScoreMode(), cycle.getFinalScoreFormula(), configuration);
        List<HrAppraisalViews.Kra> definitions = kraViews(cycle.getCycleId());
        HrAppraisalRules.kras(HrAppraisalTargets.ruleKras(definitions), !"GOAL_BASED".equals(cycle.getEvaluationMethod()));
        if ("GOAL_BASED".equals(cycle.getEvaluationMethod()) && !definitions.isEmpty()) throw invalid("目标评价模式须先清空关键成果领域");
        HrAppraisalViews.Preview preview = previewOf(cycle);
        if (preview.employees().isEmpty()) throw invalid("范围交集中没有有效参评员工");
        if (!preview.digest().equals(digest)) throw conflict("APPRAISAL_PREVIEW_CHANGED", "参评名单或员工信息已变化，请重新预览后启动");
        if (!guard.participants(cycle.getCycleId()).isEmpty()) throw invalid("周期草稿存在异常参评记录");
        for (HrAppraisalViews.Employee employee : preview.employees()) {
            HrAppraisalResult result = new HrAppraisalResult();
            result.setTenantId(tenantId());
            result.setCycleId(cycle.getCycleId());
            result.setEmployeeId(employee.employeeId());
            result.setScopeSnapshot(snapshots.tree(employee));
            result.setStatus("PENDING");
            result.setVersion(0);
            result.setCreateBy(HrRuleSupport.userName());
            result.setUpdateBy(HrRuleSupport.userName());
            results.insert(result);
        }
        HrAppraisalViews.Frozen frozen = new HrAppraisalViews.Frozen(cycle.getEvaluationMethod(), cycle.getFinalScoreMode(), cycle.getFinalScoreFormula(), configuration,
                definitions, List.of(), null, preview.digest());
        cycle.setFrozenConfig(snapshots.tree(frozen));
        evidence.put("participants", preview);
        evidence.put("frozen", frozen);
    }

    private void verifyCalculated(HrAppraisalCycle cycle) {
        targets.unchanged(cycle);
        for (HrAppraisalResult result : guard.participants(cycle.getCycleId())) {
            if (!Set.of("SCORED", "CALIBRATED").contains(result.getStatus()) || result.getCalculatedScore() == null || result.getInputScores() == null) throw invalid("存在未计算完成的参评员工");
            HrAppraisalTargets.Calculation current = targets.input(cycle, result.getEmployeeId());
            if (result.getCalculatedScore().compareTo(current.score()) != 0 || !snapshots.matches(current.inputs(), result.getInputScores())) {
                throw conflict("APPRAISAL_INPUT_CHANGED", "真实评分输入已变化，须重新计算后进入校准");
            }
        }
    }

    private HrAppraisalViews.Preview previewOf(HrAppraisalCycle cycle) {
        List<HrAppraisalViews.Employee> employees = cycles.preview(tenantId(), cycle, guard.scope(false), HrHSupport.today());
        return new HrAppraisalViews.Preview(employees, access.digest(Map.of("cycleId", cycle.getCycleId(), "version", cycle.getVersion(), "employees", employees)));
    }

    private void validateScope(String kind, List<Long> identifiers) {
        if (new HashSet<>(identifiers).size() != identifiers.size()) throw invalid("范围中存在重复项");
        if (!identifiers.isEmpty() && cycles.validScopeIds(tenantId(), kind, identifiers).size() != identifiers.size()) throw invalid("范围中存在其他租户、无效或已停用项目");
    }

    private List<HrAppraisalViews.Kra> kraViews(Long cycleId) {
        return kras.selectList(new LambdaQueryWrapper<HrAppraisalKra>().eq(HrAppraisalKra::getTenantId, tenantId())
                .eq(HrAppraisalKra::getCycleId, cycleId).orderByAsc(HrAppraisalKra::getSortNo, HrAppraisalKra::getKraId)).stream()
                .map(kra -> new HrAppraisalViews.Kra(kra.getKraId(), kra.getKraName(), kra.getWeight(), kra.getSortNo(), kra.getDescription())).toList();
    }

    private LambdaQueryWrapper<HrPerfDistributionRule> ruleQuery() {
        return new LambdaQueryWrapper<HrPerfDistributionRule>().eq(HrPerfDistributionRule::getTenantId, tenantId())
                .eq(HrPerfDistributionRule::getDeleted, 0).eq(HrPerfDistributionRule::getStatus, "ACTIVE");
    }

    private HrAppraisalViews.Rule currentRule(Long cycleId) {
        List<HrPerfDistributionRule> choices = rules.selectList(ruleQuery().eq(HrPerfDistributionRule::getCycleId, cycleId));
        if (choices.size() > 1) throw invalid("周期存在多条启用分布规则");
        if (choices.isEmpty()) choices = rules.selectPage(new Page<>(1, 1, false), ruleQuery().isNull(HrPerfDistributionRule::getCycleId)
                .isNull(HrPerfDistributionRule::getObjectiveId).orderByDesc(HrPerfDistributionRule::getId)).getRecords();
        if (choices.isEmpty()) return null;
        HrPerfDistributionRule rule = choices.get(0);
        List<HrAppraisalRules.GradeQuota> distribution = objectMapper.convertValue(rule.getDistribution(), new TypeReference<List<HrAppraisalRules.GradeQuota>>() { });
        return new HrAppraisalViews.Rule(rule.getId(), rule.getVersion(), rule.getRuleName(), rule.getEnforceMode(), distribution);
    }

    private HrAppraisalRules.Distribution distribution(HrAppraisalViews.Rule rule, List<HrAppraisalResult> participants, boolean required) {
        if (rule == null) return null;
        if (participants.isEmpty() || participants.stream().anyMatch(result -> result.getGrade() == null)) {
            if (required) throw invalid("尚有员工未确认最终等级");
            return null;
        }
        return HrAppraisalRules.distribution(participants.size(), rule.distribution(), participants.stream().map(HrAppraisalResult::getGrade).toList(), rule.enforceMode());
    }

    private HrAppraisalViews.Cycle cycleView(HrAppraisalCycle cycle, int visibleCount, boolean mine) {
        return new HrAppraisalViews.Cycle(cycle.getCycleId(), cycle.getCycleName(), cycle.getCycleType(), cycle.getStartDate(), cycle.getEndDate(),
                mine ? List.of() : cycle.getScopeDeptIds(), mine ? List.of() : cycle.getScopePositionIds(), mine ? List.of() : cycle.getScopeJobLevelIds(),
                cycle.getEvaluationMethod(), cycle.getFinalScoreMode(), cycle.getFinalScoreFormula(), access.convert(cycle.getScoreConfig(), HrAppraisalRules.Configuration.class),
                cycle.getStatus(), cycle.getVersion(), cycle.getCompletedTime(), mine ? null : cycle.getRemark(), visibleCount);
    }

    private HrAppraisalViews.Result resultView(HrAppraisalResult result, HrAppraisalCycle cycle, boolean mine, boolean published) {
        HrAppraisalViews.Employee employee = access.convert(result.getScopeSnapshot(), HrAppraisalViews.Employee.class);
        HrAppraisalViews.Inputs inputs = !mine && result.getInputScores() != null ? access.convert(result.getInputScores(), HrAppraisalViews.Inputs.class) : null;
        List<HrAppraisalViews.GoalInput> goalScores = !mine && "SCORING".equals(cycle.getStatus()) ? targets.currentScores(cycle, result.getEmployeeId()) : inputs == null ? List.of() : inputs.goals();
        return new HrAppraisalViews.Result(result.getAppraisalResultId(), result.getEmployeeId(), employee.userId(), employee.employeeName(), employee.employeeNo(),
                mine && !published ? null : result.getCalculatedScore(), mine && !published ? null : result.getFinalScore(), mine && !published ? null : result.getGrade(),
                mine ? null : result.getCalibrationReason(), result.getStatus(), result.getVersion(), goalScores, inputs == null ? Map.of() : inputs.values());
    }

    private List<HrTalentCalibrationSession> sessionRows(Long cycleId) {
        return sessions.selectList(new LambdaQueryWrapper<HrTalentCalibrationSession>().eq(HrTalentCalibrationSession::getTenantId, tenantId())
                .eq(HrTalentCalibrationSession::getCycleId, cycleId).eq(HrTalentCalibrationSession::getDeleted, 0).orderByAsc(HrTalentCalibrationSession::getId));
    }

    private HrAppraisalViews.Session sessionView(HrTalentCalibrationSession session) {
        return new HrAppraisalViews.Session(session.getId(), session.getSessionName(), session.getScheduledAt(), session.getLocation(), session.getFacilitatorId(),
                session.getParticipants(), session.getAgenda(), session.getMinutes(), session.getStatus(),
                session.getParticipants() == null || session.getParticipants().isEmpty() ? List.of() : cycles.meetingPeople(tenantId(), session.getParticipants()));
    }

    private void update(HrAppraisalCycle cycle) {
        cycle.setUpdateBy(HrRuleSupport.userName());
        if (cycles.updateById(cycle) != 1) throw conflict("VERSION_CONFLICT", "周期已变化，请重新读取");
    }

    private void updateResult(HrAppraisalResult result) {
        result.setUpdateBy(HrRuleSupport.userName());
        if (results.updateById(result) != 1) throw conflict("VERSION_CONFLICT", "周期结果已变化，请重新读取");
    }
}
