package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.PerformanceAssignmentChildDTO;
import com.cloudflow.hr.domain.dto.PerformanceAssignmentChildrenDTO;
import com.cloudflow.hr.domain.dto.PerformanceCategoryAllocationDTO;
import com.cloudflow.hr.domain.dto.PerformanceCategoryDefinitionDTO;
import com.cloudflow.hr.domain.dto.PerformanceDepartmentAllocationDTO;
import com.cloudflow.hr.domain.dto.PerformanceMetricDTO;
import com.cloudflow.hr.domain.dto.PerformanceObjectiveCreateDTO;
import com.cloudflow.hr.domain.dto.PerformanceObjectiveQueryDTO;
import com.cloudflow.hr.domain.dto.PerformanceResultUpdateDTO;
import com.cloudflow.hr.domain.dto.PerformanceSalaryAdjustmentCreateDTO;
import com.cloudflow.hr.domain.dto.SalaryAdjustmentCreateDTO;
import com.cloudflow.hr.domain.entity.PerformanceAssignment;
import com.cloudflow.hr.domain.entity.PerformanceObjective;
import com.cloudflow.hr.domain.entity.SalaryAdjustment;
import com.cloudflow.hr.domain.vo.PerformanceAssignmentVO;
import com.cloudflow.hr.domain.vo.PerformanceObjectiveVO;
import com.cloudflow.hr.domain.vo.PerformanceOverviewVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.PerformanceAssignmentMapper;
import com.cloudflow.hr.mapper.PerformanceObjectiveMapper;
import com.cloudflow.hr.mapper.SalaryAdjustmentMapper;
import com.cloudflow.hr.service.PerformanceService;
import com.cloudflow.hr.service.SalaryAdjustmentService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PerformanceServiceImpl implements PerformanceService {

    private static final String STATUS_DRAFT = "DRAFT";
    private static final String STATUS_PLAN_APPROVING = "PLAN_APPROVING";
    private static final String STATUS_PLAN_APPROVED = "PLAN_APPROVED";
    private static final String STATUS_RESULT_APPROVING = "RESULT_APPROVING";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String STATUS_REJECTED = "REJECTED";
    private static final String ASSIGNEE_DEPT = "DEPT";
    private static final String ASSIGNEE_EMPLOYEE = "EMPLOYEE";
    private static final String QUOTA_MANAGER = "MANAGER";
    private static final String QUOTA_DEPT_OWNER = "DEPT_OWNER";
    private static final String DEFAULT_METRIC_CODE = "METRIC_1";
    private static final String VALUE_TYPE_DECIMAL = "DECIMAL";
    private static final String VALUE_TYPE_INTEGER = "INTEGER";
    private static final String VALUE_TYPE_PERCENT = "PERCENT";
    private static final String DEFAULT_METRIC_NAME = "统计指标";
    private static final String DEFAULT_METRIC_UNIT = "个";
    private static final BigDecimal DEFAULT_SCORE_CAP = new BigDecimal("120.00");
    private static final BigDecimal DEFAULT_METRIC_WEIGHT = new BigDecimal("100.00");
    private static final BigDecimal DEFAULT_SALARY_MIN_SCORE = new BigDecimal("60.00");
    private static final DateTimeFormatter NO_DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final int MAX_METRIC_UNIT_LENGTH = 20;
    private static final Set<String> INTEGER_METRIC_UNITS = Set.of("件", "个", "单", "次", "人", "台", "套", "箱");

    private final PerformanceObjectiveMapper objectiveMapper;
    private final PerformanceAssignmentMapper assignmentMapper;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;
    private final SalaryAdjustmentService salaryAdjustmentService;
    private final SalaryAdjustmentMapper salaryAdjustmentMapper;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createObjective(PerformanceObjectiveCreateDTO dto) {
        validateCreateObjective(dto);

        Long tenantId = SecurityUtils.getTenantId();
        List<PerformanceCategoryDefinitionDTO> categoryDefinitions = normalizeCategoryDefinitions(dto);
        List<PerformanceMetricDTO> metrics = normalizeMetrics(dto.getMetrics());
        Map<String, PerformanceCategoryDefinitionDTO> categoryMap = categoryDefinitions.stream()
                .collect(Collectors.toMap(PerformanceCategoryDefinitionDTO::getCategoryCode, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Map<String, PerformanceMetricDTO> metricMap = metrics.stream()
                .collect(Collectors.toMap(PerformanceMetricDTO::getMetricCode, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        PerformanceObjective objective = new PerformanceObjective();
        objective.setTenantId(tenantId);
        objective.setObjectiveNo("PF" + LocalDate.now().format(NO_DATE_FORMATTER) + IdUtils.snowflakeIdStr().substring(8));
        objective.setCycleName(dto.getCycleName());
        objective.setCycleStartDate(dto.getCycleStartDate());
        objective.setCycleEndDate(dto.getCycleEndDate());
        objective.setObjectiveName(dto.getObjectiveName());
        objective.setTotalTargetAmount(normalizeAmount(dto.getTotalTargetAmount()));
        objective.setCategoryCodes(categoryDefinitions.stream()
                .map(PerformanceCategoryDefinitionDTO::getCategoryCode)
                .collect(Collectors.joining(",")));
        objective.setCategoryConfig(writeJson(categoryDefinitions));
        objective.setMetricConfig(writeJson(metrics));
        objective.setScoreCap(dto.getScoreCap() == null ? DEFAULT_SCORE_CAP : normalizeRate(dto.getScoreCap()));
        objective.setStatus(STATUS_DRAFT);
        objectiveMapper.insert(objective);

        if (dto.getDepartmentAssignments() != null) {
            int deptOrder = 0;
            for (PerformanceDepartmentAllocationDTO dept : dto.getDepartmentAssignments()) {
                PerformanceAssignment deptNode = new PerformanceAssignment();
                deptNode.setTenantId(tenantId);
                deptNode.setObjectiveId(objective.getId());
                deptNode.setAssigneeType(ASSIGNEE_DEPT);
                deptNode.setAssigneeId(dept.getDeptId());
                deptNode.setNodeKey(rootNodeKey(dept.getDeptId()));
                deptNode.setAssigneeName(defaultName(dept.getDeptName(), "部门" + dept.getDeptId()));
                deptNode.setTargetAmount(metrics.size() == 1
                        ? normalizeMetricValue(dept.getTargetAmount(), metrics.get(0))
                        : normalizeAmount(dept.getTargetAmount()));
                deptNode.setActualAmount(BigDecimal.ZERO);
                deptNode.setQuotaSource(QUOTA_MANAGER);
                deptNode.setLocked(true);
                deptNode.setOwnerEmployeeId(dept.getOwnerEmployeeId());
                deptNode.setSortOrder(++deptOrder);
                deptNode.setStatus(STATUS_DRAFT);
                assignmentMapper.insert(deptNode);

                if (dept.getCategories() != null) {
                    int categoryOrder = 0;
                    for (PerformanceCategoryAllocationDTO category : dept.getCategories()) {
                        PerformanceAssignment categoryNode = new PerformanceAssignment();
                        categoryNode.setTenantId(tenantId);
                        categoryNode.setObjectiveId(objective.getId());
                        categoryNode.setParentId(deptNode.getId());
                        categoryNode.setNodeKey(categoryNodeKey(deptNode.getId(), category.getCategoryCode(), category.getMetricCode()));
                        categoryNode.setAssigneeType(ASSIGNEE_DEPT);
                        categoryNode.setAssigneeId(deptNode.getAssigneeId());
                        categoryNode.setAssigneeName(deptNode.getAssigneeName());
                        categoryNode.setCategoryCode(normalizeCategoryCode(category.getCategoryCode()));
                        PerformanceCategoryDefinitionDTO categoryDefinition = categoryMap.get(categoryNode.getCategoryCode());
                        categoryNode.setCategoryName(categoryDefinition == null ? categoryNode.getCategoryCode() : categoryDefinition.getCategoryName());
                        applyMetric(categoryNode, category, metricMap);
                        categoryNode.setNodeKey(categoryNodeKey(deptNode.getId(), categoryNode.getCategoryCode(), categoryNode.getMetricCode()));
                        categoryNode.setTargetAmount(normalizeMetricValue(category.getTargetAmount(), metricMap.get(categoryNode.getMetricCode())));
                        categoryNode.setActualAmount(BigDecimal.ZERO);
                        categoryNode.setQuotaSource(QUOTA_MANAGER);
                        categoryNode.setLocked(category.getLocked() == null || category.getLocked());
                        categoryNode.setOwnerEmployeeId(dept.getOwnerEmployeeId());
                        categoryNode.setSortOrder(++categoryOrder);
                        categoryNode.setStatus(STATUS_DRAFT);
                        assignmentMapper.insert(categoryNode);
                    }
                }
            }
        }

        validateDepartmentTotal(objective);
        return objective.getId();
    }

    @Override
    public Page<PerformanceObjectiveVO> listObjectives(PerformanceObjectiveQueryDTO query) {
        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<PerformanceObjective> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PerformanceObjective::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(PerformanceObjective::getObjectiveName, query.getKeyword())
                    .or()
                    .like(PerformanceObjective::getObjectiveNo, query.getKeyword())
                    .or()
                    .like(PerformanceObjective::getCycleName, query.getKeyword()));
        }
        if (query.getStatus() != null && !query.getStatus().isBlank()) {
            wrapper.eq(PerformanceObjective::getStatus, query.getStatus());
        }
        if (query.getCycleStartDate() != null) {
            wrapper.ge(PerformanceObjective::getCycleEndDate, query.getCycleStartDate());
        }
        if (query.getCycleEndDate() != null) {
            wrapper.le(PerformanceObjective::getCycleStartDate, query.getCycleEndDate());
        }
        wrapper.orderByDesc(PerformanceObjective::getCreateTime);

        Page<PerformanceObjective> page = objectiveMapper.selectPage(
                new Page<>(query.getPageNum(), query.getPageSize()),
                wrapper
        );
        Page<PerformanceObjectiveVO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(page.getRecords().stream().map(objective -> buildObjectiveVO(objective, false)).toList());
        return result;
    }

    @Override
    public PerformanceObjectiveVO getObjective(Long id) {
        return buildObjectiveVO(requireObjective(id), false);
    }

    @Override
    public PerformanceObjectiveVO getObjectiveTree(Long id) {
        return buildObjectiveVO(requireObjective(id), true);
    }

    @Override
    public PerformanceOverviewVO getOverview() {
        Long tenantId = SecurityUtils.getTenantId();
        List<PerformanceObjective> objectives = objectiveMapper.selectList(
                new LambdaQueryWrapper<PerformanceObjective>().eq(PerformanceObjective::getTenantId, tenantId)
        );
        PerformanceOverviewVO vo = new PerformanceOverviewVO();
        vo.setDraftCount(countByStatus(objectives, STATUS_DRAFT));
        vo.setPlanApprovingCount(countByStatus(objectives, STATUS_PLAN_APPROVING));
        vo.setRunningCount(countByStatus(objectives, STATUS_PLAN_APPROVED));
        vo.setResultApprovingCount(countByStatus(objectives, STATUS_RESULT_APPROVING));
        vo.setCompletedCount(countByStatus(objectives, STATUS_COMPLETED));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void saveAssignmentChildren(Long parentId, PerformanceAssignmentChildrenDTO dto) {
        PerformanceAssignment parent = requireAssignment(parentId);
        PerformanceObjective objective = requireObjective(parent.getObjectiveId());
        ensureEditable(objective);

        if (ASSIGNEE_DEPT.equals(parent.getAssigneeType()) && isBlank(parent.getCategoryCode())) {
            saveDepartmentCategoryChildren(objective, parent, dto.getChildren());
            return;
        }

        if (ASSIGNEE_DEPT.equals(parent.getAssigneeType()) && !isBlank(parent.getCategoryCode())) {
            saveCategoryEmployeeChildren(parent, dto.getChildren());
            return;
        }

        throw new HrBusinessException("INVALID_ASSIGNMENT_NODE", "员工叶子任务不能继续分解");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateResult(PerformanceResultUpdateDTO dto) {
        PerformanceAssignment assignment = requireAssignment(dto.getAssignmentId());
        PerformanceObjective objective = requireObjective(assignment.getObjectiveId());
        if (!STATUS_PLAN_APPROVED.equals(objective.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有已通过计划的绩效目标才能填报结果");
        }
        if (!ASSIGNEE_EMPLOYEE.equals(assignment.getAssigneeType()) || !listChildren(assignment.getId()).isEmpty()) {
            throw new HrBusinessException("INVALID_RESULT_NODE", "只能填报员工叶子任务的实际完成值");
        }
        assignment.setActualAmount(normalizeMetricValue(dto.getActualAmount(), metricMap(objective).get(assignment.getMetricCode())));
        assignmentMapper.updateById(assignment);
        recalculateActuals(objective.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitPlan(Long objectiveId) {
        PerformanceObjective objective = requireObjective(objectiveId);
        if (!STATUS_DRAFT.equals(objective.getStatus()) && !STATUS_REJECTED.equals(objective.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有草稿或已驳回目标才能提交计划审批");
        }
        validateFullPlan(objective);
        startWorkflow(objective, "PERFORMANCE_PLAN", workflowProcessKeyProperties.getPerformancePlan(), "绩效计划审批-");
        objective.setStatus(STATUS_PLAN_APPROVING);
        objectiveMapper.updateById(objective);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approvePlan(Long objectiveId) {
        PerformanceObjective objective = requireObjective(objectiveId);
        if (STATUS_PLAN_APPROVED.equals(objective.getStatus())) {
            return;
        }
        if (!STATUS_PLAN_APPROVING.equals(objective.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有计划审批中的目标才能审批通过");
        }
        objective.setStatus(STATUS_PLAN_APPROVED);
        objectiveMapper.updateById(objective);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectPlan(Long objectiveId) {
        PerformanceObjective objective = requireObjective(objectiveId);
        if (STATUS_REJECTED.equals(objective.getStatus())) {
            return;
        }
        if (!STATUS_PLAN_APPROVING.equals(objective.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有计划审批中的目标才能驳回");
        }
        objective.setStatus(STATUS_REJECTED);
        objectiveMapper.updateById(objective);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitResult(Long objectiveId) {
        PerformanceObjective objective = requireObjective(objectiveId);
        if (!STATUS_PLAN_APPROVED.equals(objective.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有执行中的绩效目标才能提交结果审批");
        }
        recalculateActuals(objectiveId);
        startWorkflow(objective, "PERFORMANCE_RESULT", workflowProcessKeyProperties.getPerformanceResult(), "绩效结果审批-");
        objective.setStatus(STATUS_RESULT_APPROVING);
        objectiveMapper.updateById(objective);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveResult(Long objectiveId) {
        PerformanceObjective objective = requireObjective(objectiveId);
        if (STATUS_COMPLETED.equals(objective.getStatus())) {
            return;
        }
        if (!STATUS_RESULT_APPROVING.equals(objective.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有结果审批中的目标才能归档");
        }
        recalculateActuals(objectiveId);
        PerformanceObjectiveVO snapshot = buildObjectiveVO(objective, true);
        snapshot.setStatus(STATUS_COMPLETED);
        objective.setArchivedActualAmount(snapshot.getActualAmount());
        objective.setArchivedCompletionRate(snapshot.getCompletionRate());
        objective.setArchivedCappedRate(snapshot.getCappedRate());
        objective.setArchivedScore(snapshot.getScore());
        objective.setArchivedGrade(snapshot.getGrade());
        objective.setArchivedTime(LocalDateTime.now());
        objective.setArchiveSnapshot(writeJson(snapshot));
        objective.setStatus(STATUS_COMPLETED);
        objectiveMapper.updateById(objective);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectResult(Long objectiveId) {
        PerformanceObjective objective = requireObjective(objectiveId);
        if (STATUS_PLAN_APPROVED.equals(objective.getStatus())) {
            return;
        }
        if (!STATUS_RESULT_APPROVING.equals(objective.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有结果审批中的目标才能驳回");
        }
        objective.setStatus(STATUS_PLAN_APPROVED);
        objectiveMapper.updateById(objective);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createSalaryAdjustment(Long objectiveId, PerformanceSalaryAdjustmentCreateDTO dto) {
        PerformanceObjective objective = requireObjective(objectiveId);
        if (!STATUS_COMPLETED.equals(objective.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "绩效结果归档后才能生成绩效调薪");
        }
        List<PerformanceAssignment> assignments = listAssignments(objectiveId);
        boolean employeeInObjective = assignments.stream()
                .anyMatch(item -> ASSIGNEE_EMPLOYEE.equals(item.getAssigneeType())
                        && Objects.equals(item.getAssigneeId(), dto.getEmployeeId()));
        if (!employeeInObjective) {
            throw new HrBusinessException("EMPLOYEE_NOT_IN_OBJECTIVE", "该员工没有本绩效目标的叶子任务");
        }
        Long duplicateCount = salaryAdjustmentMapper.selectCount(
                new LambdaQueryWrapper<SalaryAdjustment>()
                        .eq(SalaryAdjustment::getTenantId, objective.getTenantId())
                        .eq(SalaryAdjustment::getEmployeeId, dto.getEmployeeId())
                        .eq(SalaryAdjustment::getSourceType, "PERFORMANCE_OBJECTIVE")
                        .eq(SalaryAdjustment::getSourceId, objectiveId)
        );
        if (duplicateCount != null && duplicateCount > 0) {
            throw new HrBusinessException("PERFORMANCE_SALARY_DUPLICATE", "该员工已存在本绩效目标生成的调薪申请");
        }
        WeightedMetric employeeMetric = weightedMetric(metricAggregates(assignments.stream()
                .filter(item -> ASSIGNEE_EMPLOYEE.equals(item.getAssigneeType()))
                .filter(item -> Objects.equals(item.getAssigneeId(), dto.getEmployeeId()))
                .toList()), objective.getScoreCap());
        BigDecimal minScore = dto.getMinScore() == null ? DEFAULT_SALARY_MIN_SCORE : normalizeRate(dto.getMinScore());
        if (employeeMetric.cappedRate().compareTo(minScore) < 0) {
            throw new HrBusinessException("PERFORMANCE_SCORE_NOT_ELIGIBLE", "员工绩效得分未达到调薪最低分");
        }

        SalaryAdjustmentCreateDTO salaryDto = new SalaryAdjustmentCreateDTO();
        salaryDto.setEmployeeId(dto.getEmployeeId());
        salaryDto.setAdjustmentType("PERFORMANCE");
        salaryDto.setAdjustmentReason(defaultName(dto.getAdjustmentReason(),
                objective.getObjectiveName() + " 绩效结果调薪，绩效得分" + employeeMetric.cappedRate() + "，等级" + toGrade(employeeMetric.cappedRate())));
        salaryDto.setAfterSalaryData(dto.getAfterSalaryData());
        salaryDto.setAfterTotal(dto.getAfterTotal());
        salaryDto.setEffectiveDate(dto.getEffectiveDate());
        salaryDto.setSourceType("PERFORMANCE_OBJECTIVE");
        salaryDto.setSourceId(objectiveId);
        return salaryAdjustmentService.createSalaryAdjustment(salaryDto);
    }

    private void saveDepartmentCategoryChildren(
            PerformanceObjective objective,
            PerformanceAssignment parent,
            List<PerformanceAssignmentChildDTO> incoming
    ) {
        Set<String> allowedCategories = parseCategorySet(objective.getCategoryCodes());
        Map<String, PerformanceCategoryDefinitionDTO> categoryMap = categoryDefinitions(objective).stream()
                .collect(Collectors.toMap(PerformanceCategoryDefinitionDTO::getCategoryCode, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Map<String, PerformanceMetricDTO> allowedMetrics = metricMap(objective);
        List<PerformanceAssignment> existing = listChildren(parent.getId());
        Map<String, PerformanceAssignment> lockedByKey = existing.stream()
                .filter(item -> QUOTA_MANAGER.equals(item.getQuotaSource()) && Boolean.TRUE.equals(item.getLocked()))
                .collect(Collectors.toMap(this::assignmentKey, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Map<String, PerformanceAssignmentChildDTO> incomingByKey = new LinkedHashMap<>();
        for (PerformanceAssignmentChildDTO child : safeChildren(incoming)) {
            String categoryCode = normalizeCategoryCode(child.getCategoryCode());
            if (!allowedCategories.contains(categoryCode)) {
                throw new HrBusinessException("INVALID_CATEGORY", "考核类型不在经理指定范围内：" + categoryCode);
            }
            String metricCode = normalizeMetricCode(defaultName(child.getMetricCode(), DEFAULT_METRIC_CODE));
            if (!allowedMetrics.containsKey(metricCode)) {
                throw new HrBusinessException("INVALID_METRIC", "指标不在目标配置范围内：" + metricCode);
            }
            child.setCategoryCode(categoryCode);
            child.setMetricCode(metricCode);
            incomingByKey.put(assignmentKey(categoryCode, metricCode), child);
        }

        for (Map.Entry<String, PerformanceAssignment> entry : lockedByKey.entrySet()) {
            PerformanceAssignmentChildDTO child = incomingByKey.get(entry.getKey());
            PerformanceMetricDTO lockedMetric = allowedMetrics.get(entry.getValue().getMetricCode());
            if (child != null && normalizeMetricValue(child.getTargetAmount(), lockedMetric).compareTo(entry.getValue().getTargetAmount()) != 0) {
                throw new HrBusinessException("LOCKED_CATEGORY_CHANGED", "经理锁定指标目标不能修改：" + entry.getKey());
            }
            if (child != null && resolveMetricWeight(child.getMetricWeight(), entry.getValue().getMetricWeight()).compareTo(entry.getValue().getMetricWeight()) != 0) {
                throw new HrBusinessException("LOCKED_CATEGORY_CHANGED", "经理锁定指标权重不能修改：" + entry.getKey());
            }
        }

        for (PerformanceAssignment child : existing) {
            if (!Boolean.TRUE.equals(child.getLocked())) {
                deleteDescendants(child.getId());
                assignmentMapper.deleteById(child.getId());
            }
        }

        int order = lockedByKey.size();
        for (Map.Entry<String, PerformanceAssignmentChildDTO> entry : incomingByKey.entrySet()) {
            if (lockedByKey.containsKey(entry.getKey())) {
                continue;
            }
            PerformanceAssignment child = new PerformanceAssignment();
            child.setTenantId(parent.getTenantId());
            child.setObjectiveId(parent.getObjectiveId());
            child.setParentId(parent.getId());
            child.setAssigneeType(ASSIGNEE_DEPT);
            child.setAssigneeId(parent.getAssigneeId());
            child.setAssigneeName(parent.getAssigneeName());
            child.setCategoryCode(normalizeCategoryCode(entry.getValue().getCategoryCode()));
            PerformanceCategoryDefinitionDTO categoryDefinition = categoryMap.get(child.getCategoryCode());
            child.setCategoryName(categoryDefinition == null ? child.getCategoryCode() : categoryDefinition.getCategoryName());
            applyMetric(child, entry.getValue(), allowedMetrics);
            child.setNodeKey(categoryNodeKey(parent.getId(), child.getCategoryCode(), child.getMetricCode()));
            child.setTargetAmount(normalizeMetricValue(entry.getValue().getTargetAmount(), allowedMetrics.get(child.getMetricCode())));
            child.setActualAmount(BigDecimal.ZERO);
            child.setQuotaSource(QUOTA_DEPT_OWNER);
            child.setLocked(false);
            child.setOwnerEmployeeId(parent.getOwnerEmployeeId());
            child.setSortOrder(++order);
            child.setStatus(STATUS_DRAFT);
            assignmentMapper.insert(child);
        }
    }

    private void saveCategoryEmployeeChildren(PerformanceAssignment parent, List<PerformanceAssignmentChildDTO> incoming) {
        PerformanceObjective objective = requireObjective(parent.getObjectiveId());
        PerformanceMetricDTO metric = metricMap(objective).get(parent.getMetricCode());
        BigDecimal total = safeChildren(incoming).stream()
                .map(PerformanceAssignmentChildDTO::getTargetAmount)
                .map(value -> normalizeMetricValue(value, metric))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        ensureSameAmount(total, parent.getTargetAmount(), "员工叶子任务目标值合计必须等于指标目标值");

        for (PerformanceAssignment child : listChildren(parent.getId())) {
            deleteDescendants(child.getId());
            assignmentMapper.deleteById(child.getId());
        }

        int order = 0;
        for (PerformanceAssignmentChildDTO item : safeChildren(incoming)) {
            Long employeeId = item.getAssigneeId();
            if (employeeId == null) {
                throw new HrBusinessException("EMPLOYEE_REQUIRED", "员工叶子任务必须指定员工ID");
            }
            PerformanceAssignment child = new PerformanceAssignment();
            child.setTenantId(parent.getTenantId());
            child.setObjectiveId(parent.getObjectiveId());
            child.setParentId(parent.getId());
            child.setNodeKey(employeeNodeKey(parent.getId(), employeeId));
            child.setAssigneeType(ASSIGNEE_EMPLOYEE);
            child.setAssigneeId(employeeId);
            child.setAssigneeName(defaultName(item.getAssigneeName(), "员工" + employeeId));
            child.setCategoryCode(parent.getCategoryCode());
            child.setCategoryName(parent.getCategoryName());
            child.setMetricCode(parent.getMetricCode());
            child.setMetricName(parent.getMetricName());
            child.setMetricUnit(parent.getMetricUnit());
            child.setMetricValueType(parent.getMetricValueType());
            child.setMetricPrecision(parent.getMetricPrecision());
            child.setMetricWeight(parent.getMetricWeight());
            child.setTargetAmount(normalizeMetricValue(item.getTargetAmount(), metric));
            child.setActualAmount(BigDecimal.ZERO.setScale(metricPrecision(metric), RoundingMode.HALF_UP));
            child.setQuotaSource(QUOTA_DEPT_OWNER);
            child.setLocked(false);
            child.setOwnerEmployeeId(parent.getOwnerEmployeeId());
            child.setSortOrder(++order);
            child.setStatus(STATUS_DRAFT);
            assignmentMapper.insert(child);
        }
        recalculateActuals(parent.getObjectiveId());
    }

    private void validateCreateObjective(PerformanceObjectiveCreateDTO dto) {
        if (dto.getCycleEndDate().isBefore(dto.getCycleStartDate())) {
            throw new HrBusinessException("INVALID_CYCLE", "周期结束日期不能早于开始日期");
        }
        Set<String> categories = normalizeCategoryDefinitions(dto).stream()
                .map(PerformanceCategoryDefinitionDTO::getCategoryCode)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        List<PerformanceMetricDTO> metricDefinitions = normalizeMetrics(dto.getMetrics());
        Set<String> metrics = metricDefinitions.stream()
                .map(PerformanceMetricDTO::getMetricCode)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<String, PerformanceMetricDTO> metricDefinitionMap = metricDefinitions.stream()
                .collect(Collectors.toMap(PerformanceMetricDTO::getMetricCode, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        if (categories.isEmpty()) {
            throw new HrBusinessException("INVALID_CATEGORY", "可考核类型不能为空");
        }
        if (metrics.isEmpty()) {
            throw new HrBusinessException("INVALID_METRIC", "绩效指标不能为空");
        }
        if (dto.getDepartmentAssignments() == null || dto.getDepartmentAssignments().isEmpty()) {
            throw new HrBusinessException("DEPARTMENT_REQUIRED", "绩效目标至少需要分配1个部门");
        }
        BigDecimal deptTotal = BigDecimal.ZERO;
        for (PerformanceDepartmentAllocationDTO dept : dto.getDepartmentAssignments()) {
            deptTotal = deptTotal.add(metricDefinitions.size() == 1
                    ? normalizeMetricValue(dept.getTargetAmount(), metricDefinitions.get(0))
                    : normalizeAmount(dept.getTargetAmount()));
            BigDecimal normalizedDeptTarget = metricDefinitions.size() == 1
                    ? normalizeMetricValue(dept.getTargetAmount(), metricDefinitions.get(0))
                    : normalizeAmount(dept.getTargetAmount());
            if (dept.getCategories() == null) {
                continue;
            }
            BigDecimal categoryTotal = BigDecimal.ZERO;
            for (PerformanceCategoryAllocationDTO category : dept.getCategories()) {
                String categoryCode = normalizeCategoryCode(category.getCategoryCode());
                if (!categories.contains(categoryCode)) {
                    throw new HrBusinessException("INVALID_CATEGORY", "考核类型不在经理指定范围内：" + categoryCode);
                }
                String metricCode = normalizeMetricCode(defaultName(category.getMetricCode(), DEFAULT_METRIC_CODE));
                if (!metrics.contains(metricCode)) {
                    throw new HrBusinessException("INVALID_METRIC", "指标不在目标配置范围内：" + metricCode);
                }
                if (metrics.size() == 1) {
                    PerformanceMetricDTO metric = metricDefinitionMap.get(metricCode);
                    categoryTotal = categoryTotal.add(normalizeMetricValue(category.getTargetAmount(), metric));
                }
            }
            if (metrics.size() == 1 && categoryTotal.compareTo(normalizedDeptTarget) > 0) {
                throw new HrBusinessException("INVALID_CATEGORY_TOTAL", "经理锁定指标目标不能超过部门目标值");
            }
        }
        if (metrics.size() == 1 && dto.getTotalTargetAmount().compareTo(BigDecimal.ZERO) > 0) {
            ensureSameAmount(deptTotal, normalizeMetricValue(dto.getTotalTargetAmount(), metricDefinitions.get(0)), "部门目标值合计必须等于总目标值");
        }
    }

    private void validateDepartmentTotal(PerformanceObjective objective) {
        if (metricMap(objective).size() > 1 || objective.getTotalTargetAmount().compareTo(BigDecimal.ZERO) == 0) {
            return;
        }
        BigDecimal deptTotal = listAssignments(objective.getId()).stream()
                .filter(item -> item.getParentId() == null)
                .map(PerformanceAssignment::getTargetAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        ensureSameAmount(deptTotal, objective.getTotalTargetAmount(), "部门目标值合计必须等于总目标值");
    }

    private void validateFullPlan(PerformanceObjective objective) {
        validateDepartmentTotal(objective);
        Set<String> allowedCategories = parseCategorySet(objective.getCategoryCodes());
        Map<String, PerformanceMetricDTO> allowedMetrics = metricMap(objective);
        List<PerformanceAssignment> assignments = listAssignments(objective.getId());
        Map<Long, List<PerformanceAssignment>> childrenMap = assignments.stream()
                .filter(item -> item.getParentId() != null)
                .collect(Collectors.groupingBy(PerformanceAssignment::getParentId));
        List<PerformanceAssignment> departments = assignments.stream()
                .filter(item -> item.getParentId() == null)
                .toList();
        if (departments.isEmpty()) {
            throw new HrBusinessException("DEPARTMENT_REQUIRED", "绩效目标至少需要分配1个部门");
        }
        for (PerformanceAssignment dept : departments) {
            List<PerformanceAssignment> categories = childrenMap.getOrDefault(dept.getId(), List.of());
            if (categories.isEmpty()) {
                throw new HrBusinessException("CATEGORY_REQUIRED", dept.getAssigneeName() + " 尚未拆分考核类型指标");
            }
            BigDecimal categoryTotal = BigDecimal.ZERO;
            Set<String> categoryMetricKeys = new LinkedHashSet<>();
            for (PerformanceAssignment category : categories) {
                String categoryCode = normalizeCategoryCode(category.getCategoryCode());
                if (!allowedCategories.contains(categoryCode)) {
                    throw new HrBusinessException("INVALID_CATEGORY", "考核类型不在经理指定范围内：" + categoryCode);
                }
                String metricCode = normalizeMetricCode(category.getMetricCode());
                if (!allowedMetrics.containsKey(metricCode)) {
                    throw new HrBusinessException("INVALID_METRIC", "指标不在目标配置范围内：" + metricCode);
                }
                if (!categoryMetricKeys.add(assignmentKey(categoryCode, metricCode))) {
                    throw new HrBusinessException("DUPLICATE_CATEGORY_METRIC", dept.getAssigneeName() + " 存在重复的考核类型指标：" + assignmentKey(categoryCode, metricCode));
                }
                categoryTotal = categoryTotal.add(category.getTargetAmount());
                List<PerformanceAssignment> employees = childrenMap.getOrDefault(category.getId(), List.of());
                if (employees.isEmpty() && category.getTargetAmount().compareTo(BigDecimal.ZERO) > 0) {
                    throw new HrBusinessException("EMPLOYEE_TASK_REQUIRED", category.getAssigneeName() + "-" + category.getCategoryName() + "-" + category.getMetricName() + " 尚未分配员工任务");
                }
                BigDecimal employeeTotal = employees.stream()
                        .map(PerformanceAssignment::getTargetAmount)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                ensureSameAmount(employeeTotal, category.getTargetAmount(), category.getAssigneeName() + "-" + category.getCategoryName() + "-" + category.getMetricName() + " 员工任务合计必须等于指标目标值");
                for (PerformanceAssignment employee : employees) {
                    if (!ASSIGNEE_EMPLOYEE.equals(employee.getAssigneeType())) {
                        throw new HrBusinessException("INVALID_EMPLOYEE_TASK", "指标节点下只能分配员工叶子任务");
                    }
                    if (!Objects.equals(category.getMetricCode(), employee.getMetricCode())
                            || !Objects.equals(category.getCategoryCode(), employee.getCategoryCode())) {
                        throw new HrBusinessException("INVALID_EMPLOYEE_TASK", "员工叶子任务必须继承父节点的考核类型和指标");
                    }
                }
            }
            if (allowedMetrics.size() == 1) {
                ensureSameAmount(categoryTotal, dept.getTargetAmount(), dept.getAssigneeName() + " 指标目标值合计必须等于部门目标值");
            }
        }
    }

    private void recalculateActuals(Long objectiveId) {
        List<PerformanceAssignment> assignments = listAssignments(objectiveId);
        Map<Long, PerformanceAssignment> byId = assignments.stream()
                .collect(Collectors.toMap(PerformanceAssignment::getId, Function.identity()));
        Map<Long, List<PerformanceAssignment>> childrenMap = assignments.stream()
                .filter(item -> item.getParentId() != null)
                .collect(Collectors.groupingBy(PerformanceAssignment::getParentId));
        for (PerformanceAssignment root : assignments.stream().filter(item -> item.getParentId() == null).toList()) {
            calculateAndUpdateActual(root, byId, childrenMap);
        }
    }

    private BigDecimal calculateAndUpdateActual(
            PerformanceAssignment node,
            Map<Long, PerformanceAssignment> byId,
            Map<Long, List<PerformanceAssignment>> childrenMap
    ) {
        List<PerformanceAssignment> children = childrenMap.getOrDefault(node.getId(), List.of());
        if (children.isEmpty()) {
            return safeAmount(node.getActualAmount());
        }
        BigDecimal actual = BigDecimal.ZERO;
        for (PerformanceAssignment child : children) {
            PerformanceAssignment current = byId.get(child.getId());
            actual = actual.add(calculateAndUpdateActual(current, byId, childrenMap));
        }
        BigDecimal nextActual = !isBlank(node.getMetricCode()) || hasSingleMetricDescendant(node.getId(), childrenMap)
                ? actual
                : BigDecimal.ZERO;
        if (safeAmount(node.getActualAmount()).compareTo(nextActual) != 0) {
            node.setActualAmount(normalizeAssignmentValue(nextActual, node));
            assignmentMapper.updateById(node);
        }
        return nextActual;
    }

    private void startWorkflow(PerformanceObjective objective, String businessType, String processKey, String titlePrefix) {
        if (processKey == null || processKey.isBlank()) {
            throw new HrSystemException("WORKFLOW_KEY_MISSING", "绩效审批流程Key未配置");
        }
        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(objective.getTenantId());
        processStartDTO.setProcessDefinitionKey(processKey);
        processStartDTO.setBusinessType(businessType);
        processStartDTO.setBusinessId(objective.getId());
        processStartDTO.setBusinessNo(objective.getObjectiveNo());
        processStartDTO.setProcessTitle(titlePrefix + objective.getObjectiveName());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        Map<String, Object> variables = new HashMap<>();
        variables.put("objectiveNo", objective.getObjectiveNo());
        variables.put("objectiveName", objective.getObjectiveName());
        variables.put("cycleName", objective.getCycleName());
        variables.put("totalTargetAmount", objective.getTotalTargetAmount());
        variables.put("categoryCodes", objective.getCategoryCodes());
        variables.put("categoryDefinitions", categoryDefinitions(objective));
        variables.put("metrics", new ArrayList<>(metricMap(objective).values()));
        variables.put("assignments", listAssignments(objective.getId()).stream()
                .map(this::workflowAssignmentSnapshot)
                .toList());
        processStartDTO.setVariables(variables);

        R<String> result = workflowServiceClient.startProcess(processStartDTO);
        if (result == null) {
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动绩效审批流程失败: Workflow 服务无响应");
        }
        if (!result.isSuccess()) {
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动绩效审批流程失败: " + result.getMsg());
        }
        if (result.getData() == null || result.getData().isBlank()) {
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动绩效审批流程失败: Workflow 未返回流程实例ID");
        }
        if ("PERFORMANCE_PLAN".equals(businessType)) {
            objective.setPlanProcessInstanceId(result.getData());
        } else {
            objective.setResultProcessInstanceId(result.getData());
        }
    }

    private Map<String, Object> workflowAssignmentSnapshot(PerformanceAssignment assignment) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("id", assignment.getId());
        snapshot.put("parentId", assignment.getParentId());
        snapshot.put("assigneeType", assignment.getAssigneeType());
        snapshot.put("assigneeId", assignment.getAssigneeId());
        snapshot.put("assigneeName", assignment.getAssigneeName());
        snapshot.put("categoryCode", assignment.getCategoryCode());
        snapshot.put("categoryName", assignment.getCategoryName());
        snapshot.put("metricCode", assignment.getMetricCode());
        snapshot.put("metricName", assignment.getMetricName());
        snapshot.put("metricUnit", assignment.getMetricUnit());
        snapshot.put("metricWeight", assignment.getMetricWeight());
        snapshot.put("targetAmount", assignment.getTargetAmount());
        snapshot.put("actualAmount", assignment.getActualAmount());
        snapshot.put("quotaSource", assignment.getQuotaSource());
        snapshot.put("locked", assignment.getLocked());
        snapshot.put("ownerEmployeeId", assignment.getOwnerEmployeeId());
        return snapshot;
    }

    private PerformanceObjectiveVO buildObjectiveVO(PerformanceObjective objective, boolean includeTree) {
        PerformanceObjectiveVO archived = archivedObjectiveVO(objective, includeTree);
        if (archived != null) {
            return archived;
        }
        List<PerformanceAssignment> assignments = listAssignments(objective.getId());
        PerformanceObjectiveVO vo = convertObjective(objective);
        applyObjectiveMetrics(vo, objective, assignments);
        vo.setDepartmentCount((int) assignments.stream().filter(item -> item.getParentId() == null).count());
        vo.setLeafTaskCount((int) assignments.stream().filter(item -> ASSIGNEE_EMPLOYEE.equals(item.getAssigneeType())).count());
        if (includeTree) {
            vo.setAssignments(buildAssignmentTree(assignments, objective.getScoreCap()));
        }
        return vo;
    }

    private PerformanceObjectiveVO archivedObjectiveVO(PerformanceObjective objective, boolean includeTree) {
        if (!STATUS_COMPLETED.equals(objective.getStatus()) || isBlank(objective.getArchiveSnapshot())) {
            return null;
        }
        PerformanceObjectiveVO archived = readJsonObject(objective.getArchiveSnapshot(), PerformanceObjectiveVO.class);
        if (archived == null) {
            return null;
        }
        archived.setStatus(objective.getStatus());
        archived.setPlanProcessInstanceId(objective.getPlanProcessInstanceId());
        archived.setResultProcessInstanceId(objective.getResultProcessInstanceId());
        archived.setArchivedActualAmount(objective.getArchivedActualAmount());
        archived.setArchivedCompletionRate(objective.getArchivedCompletionRate());
        archived.setArchivedCappedRate(objective.getArchivedCappedRate());
        archived.setArchivedScore(objective.getArchivedScore());
        archived.setArchivedGrade(objective.getArchivedGrade());
        archived.setArchivedTime(objective.getArchivedTime());
        if (!includeTree) {
            archived.setAssignments(new ArrayList<>());
        }
        return archived;
    }

    private List<PerformanceAssignmentVO> buildAssignmentTree(List<PerformanceAssignment> assignments, BigDecimal scoreCap) {
        Map<Long, PerformanceAssignmentVO> voMap = assignments.stream()
                .sorted(Comparator.comparing((PerformanceAssignment item) -> item.getSortOrder() == null ? 0 : item.getSortOrder())
                        .thenComparing(PerformanceAssignment::getId))
                .map(item -> convertAssignment(item, scoreCap))
                .collect(Collectors.toMap(PerformanceAssignmentVO::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        List<PerformanceAssignmentVO> roots = new ArrayList<>();
        for (PerformanceAssignmentVO item : voMap.values()) {
            if (item.getParentId() == null) {
                roots.add(item);
            } else {
                PerformanceAssignmentVO parent = voMap.get(item.getParentId());
                if (parent != null) {
                    parent.getChildren().add(item);
                }
            }
        }
        recalculateVoMetrics(roots, scoreCap);
        return roots;
    }

    private void recalculateVoMetrics(List<PerformanceAssignmentVO> nodes, BigDecimal scoreCap) {
        for (PerformanceAssignmentVO node : nodes) {
            if (!node.getChildren().isEmpty()) {
                recalculateVoMetrics(node.getChildren(), scoreCap);
                if (!isBlank(node.getMetricCode()) || hasSingleMetricLeaf(node.getChildren())) {
                    node.setActualAmount(normalizeAmount(node.getChildren().stream()
                            .map(PerformanceAssignmentVO::getActualAmount)
                            .map(this::safeAmount)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)));
                } else {
                    node.setActualAmount(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
                }
            }
            if (isBlank(node.getMetricCode()) && !node.getChildren().isEmpty()) {
                applyWeightedMetrics(node, collectMetricLeaves(node), scoreCap);
            } else {
                applyMetrics(node, node.getTargetAmount(), node.getActualAmount(), scoreCap);
            }
        }
    }

    private PerformanceObjectiveVO convertObjective(PerformanceObjective objective) {
        PerformanceObjectiveVO vo = new PerformanceObjectiveVO();
        BeanUtils.copyProperties(objective, vo);
        List<PerformanceCategoryDefinitionDTO> categories = categoryDefinitions(objective);
        vo.setCategoryDefinitions(categories);
        vo.setCategoryCodes(categories.stream()
                .map(PerformanceCategoryDefinitionDTO::getCategoryCode)
                .toList());
        vo.setMetrics(new ArrayList<>(metricMap(objective).values()));
        return vo;
    }

    private PerformanceAssignmentVO convertAssignment(PerformanceAssignment assignment, BigDecimal scoreCap) {
        PerformanceAssignmentVO vo = new PerformanceAssignmentVO();
        BeanUtils.copyProperties(assignment, vo);
        applyMetrics(vo, assignment.getTargetAmount(), assignment.getActualAmount(), scoreCap);
        return vo;
    }

    private void applyObjectiveMetrics(PerformanceObjectiveVO vo, PerformanceObjective objective, List<PerformanceAssignment> assignments) {
        List<PerformanceAssignment> metricLeaves = collectMetricLeaves(assignments);
        if (!metricLeaves.isEmpty()) {
            applyWeightedMetrics(vo, metricAggregates(metricLeaves), objective.getScoreCap());
            vo.setActualAmount(hasSingleMetricAssignment(metricLeaves)
                    ? normalizeAmount(metricLeaves.stream()
                    .map(PerformanceAssignment::getActualAmount)
                    .map(this::safeAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add))
                    : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
            return;
        }

        BigDecimal actualAmount = metricMap(objective).size() == 1
                ? assignments.stream()
                .filter(item -> item.getParentId() == null)
                .map(PerformanceAssignment::getActualAmount)
                .map(this::safeAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                : BigDecimal.ZERO;
        applyMetrics(vo, objective.getTotalTargetAmount(), actualAmount, objective.getScoreCap());
    }

    private void applyWeightedMetrics(PerformanceObjectiveVO vo, Map<String, MetricAggregate> aggregates, BigDecimal scoreCap) {
        WeightedMetric weighted = weightedMetric(aggregates, scoreCap);
        vo.setCompletionRate(weighted.completionRate());
        vo.setCappedRate(weighted.cappedRate());
        vo.setScore(weighted.cappedRate());
        vo.setGrade(toGrade(weighted.cappedRate()));
    }

    private void applyWeightedMetrics(PerformanceAssignmentVO vo, List<PerformanceAssignmentVO> metricLeaves, BigDecimal scoreCap) {
        WeightedMetric weighted = weightedMetric(metricAggregatesFromVo(metricLeaves), scoreCap);
        vo.setCompletionRate(weighted.completionRate());
        vo.setCappedRate(weighted.cappedRate());
        vo.setScore(weighted.cappedRate());
        vo.setGrade(toGrade(weighted.cappedRate()));
    }

    private void applyMetrics(PerformanceObjectiveVO vo, BigDecimal target, BigDecimal actual, BigDecimal scoreCap) {
        BigDecimal completion = completionRate(target, actual);
        BigDecimal capped = completion.min(scoreCap == null ? DEFAULT_SCORE_CAP : scoreCap);
        vo.setActualAmount(normalizeAmount(actual));
        vo.setCompletionRate(completion);
        vo.setCappedRate(capped);
        vo.setScore(capped);
        vo.setGrade(toGrade(capped));
    }

    private void applyMetrics(PerformanceAssignmentVO vo, BigDecimal target, BigDecimal actual, BigDecimal scoreCap) {
        BigDecimal completion = completionRate(target, actual);
        BigDecimal capped = completion.min(scoreCap == null ? DEFAULT_SCORE_CAP : scoreCap);
        vo.setActualAmount(normalizeAmount(actual));
        vo.setCompletionRate(completion);
        vo.setCappedRate(capped);
        vo.setScore(capped);
        vo.setGrade(toGrade(capped));
    }

    private BigDecimal completionRate(BigDecimal target, BigDecimal actual) {
        BigDecimal safeTarget = safeAmount(target);
        if (safeTarget.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return safeAmount(actual)
                .multiply(new BigDecimal("100"))
                .divide(safeTarget, 2, RoundingMode.HALF_UP);
    }

    private String toGrade(BigDecimal score) {
        if (score.compareTo(new BigDecimal("95")) >= 0) return "S";
        if (score.compareTo(new BigDecimal("85")) >= 0) return "A";
        if (score.compareTo(new BigDecimal("70")) >= 0) return "B";
        if (score.compareTo(new BigDecimal("60")) >= 0) return "C";
        return "D";
    }

    private WeightedMetric weightedMetric(Map<String, MetricAggregate> aggregates, BigDecimal scoreCap) {
        BigDecimal cap = scoreCap == null ? DEFAULT_SCORE_CAP : scoreCap;
        BigDecimal weightTotal = BigDecimal.ZERO;
        BigDecimal completionTotal = BigDecimal.ZERO;
        BigDecimal cappedTotal = BigDecimal.ZERO;
        for (MetricAggregate aggregate : aggregates.values()) {
            BigDecimal weight = normalizeRate(aggregate.weight);
            if (weight.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal completion = completionRate(aggregate.target, aggregate.actual);
            weightTotal = weightTotal.add(weight);
            completionTotal = completionTotal.add(completion.multiply(weight));
            cappedTotal = cappedTotal.add(completion.min(cap).multiply(weight));
        }
        if (weightTotal.compareTo(BigDecimal.ZERO) == 0) {
            return new WeightedMetric(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP), BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        }
        return new WeightedMetric(
                completionTotal.divide(weightTotal, 2, RoundingMode.HALF_UP),
                cappedTotal.divide(weightTotal, 2, RoundingMode.HALF_UP)
        );
    }

    private Map<String, MetricAggregate> metricAggregates(List<PerformanceAssignment> assignments) {
        Map<String, MetricAggregate> aggregates = new LinkedHashMap<>();
        for (PerformanceAssignment assignment : assignments) {
            addMetricAggregate(
                    aggregates,
                    assignment.getCategoryCode(),
                    assignment.getMetricCode(),
                    assignment.getTargetAmount(),
                    assignment.getActualAmount(),
                    assignment.getMetricWeight()
            );
        }
        return aggregates;
    }

    private Map<String, MetricAggregate> metricAggregatesFromVo(List<PerformanceAssignmentVO> assignments) {
        Map<String, MetricAggregate> aggregates = new LinkedHashMap<>();
        for (PerformanceAssignmentVO assignment : assignments) {
            addMetricAggregate(
                    aggregates,
                    assignment.getCategoryCode(),
                    assignment.getMetricCode(),
                    assignment.getTargetAmount(),
                    assignment.getActualAmount(),
                    assignment.getMetricWeight()
            );
        }
        return aggregates;
    }

    private void addMetricAggregate(
            Map<String, MetricAggregate> aggregates,
            String categoryCode,
            String metricCode,
            BigDecimal target,
            BigDecimal actual,
            BigDecimal weight
    ) {
        String code = assignmentKey(categoryCode, defaultName(metricCode, DEFAULT_METRIC_CODE));
        MetricAggregate aggregate = aggregates.computeIfAbsent(code, key -> new MetricAggregate(normalizeRate(weight)));
        aggregate.target = aggregate.target.add(safeAmount(target));
        aggregate.actual = aggregate.actual.add(safeAmount(actual));
    }

    private List<PerformanceAssignment> collectMetricLeaves(List<PerformanceAssignment> assignments) {
        Set<Long> parentIds = assignments.stream()
                .map(PerformanceAssignment::getParentId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        return assignments.stream()
                .filter(item -> !parentIds.contains(item.getId()))
                .filter(item -> !isBlank(item.getMetricCode()))
                .toList();
    }

    private List<PerformanceAssignmentVO> collectMetricLeaves(PerformanceAssignmentVO node) {
        if (node.getChildren().isEmpty()) {
            return isBlank(node.getMetricCode()) ? List.of() : List.of(node);
        }
        return node.getChildren().stream()
                .flatMap(child -> collectMetricLeaves(child).stream())
                .toList();
    }

    private boolean hasSingleMetricAssignment(List<PerformanceAssignment> assignments) {
        return assignments.stream()
                .map(item -> normalizeMetricCode(item.getMetricCode()))
                .filter(code -> !code.isBlank())
                .collect(Collectors.toSet())
                .size() <= 1;
    }

    private boolean hasSingleMetricLeaf(List<PerformanceAssignmentVO> nodes) {
        return nodes.stream()
                .flatMap(node -> collectMetricLeaves(node).stream())
                .map(item -> normalizeMetricCode(item.getMetricCode()))
                .filter(code -> !code.isBlank())
                .collect(Collectors.toSet())
                .size() <= 1;
    }

    private boolean hasSingleMetricDescendant(Long parentId, Map<Long, List<PerformanceAssignment>> childrenMap) {
        Set<String> metricCodes = new LinkedHashSet<>();
        collectDescendantMetricCodes(parentId, childrenMap, metricCodes);
        return metricCodes.size() <= 1;
    }

    private void collectDescendantMetricCodes(Long parentId, Map<Long, List<PerformanceAssignment>> childrenMap, Set<String> metricCodes) {
        for (PerformanceAssignment child : childrenMap.getOrDefault(parentId, List.of())) {
            if (childrenMap.containsKey(child.getId())) {
                collectDescendantMetricCodes(child.getId(), childrenMap, metricCodes);
            } else if (!isBlank(child.getMetricCode())) {
                metricCodes.add(normalizeMetricCode(child.getMetricCode()));
            }
        }
    }

    private static class WeightedMetric {
        private final BigDecimal completionRate;
        private final BigDecimal cappedRate;

        private WeightedMetric(BigDecimal completionRate, BigDecimal cappedRate) {
            this.completionRate = completionRate;
            this.cappedRate = cappedRate;
        }

        private BigDecimal completionRate() {
            return completionRate;
        }

        private BigDecimal cappedRate() {
            return cappedRate;
        }
    }

    private static class MetricAggregate {
        private BigDecimal target = BigDecimal.ZERO;
        private BigDecimal actual = BigDecimal.ZERO;
        private BigDecimal weight;

        private MetricAggregate(BigDecimal weight) {
            this.weight = weight == null || weight.compareTo(BigDecimal.ZERO) <= 0
                    ? DEFAULT_METRIC_WEIGHT
                    : weight;
        }
    }

    private PerformanceObjective requireObjective(Long id) {
        Long tenantId = SecurityUtils.getTenantId();
        PerformanceObjective objective = objectiveMapper.selectById(id);
        if (objective == null || !tenantId.equals(objective.getTenantId())) {
            throw new HrBusinessException("PERFORMANCE_OBJECTIVE_NOT_FOUND", "绩效目标不存在");
        }
        return objective;
    }

    private PerformanceAssignment requireAssignment(Long id) {
        Long tenantId = SecurityUtils.getTenantId();
        PerformanceAssignment assignment = assignmentMapper.selectById(id);
        if (assignment == null || !tenantId.equals(assignment.getTenantId())) {
            throw new HrBusinessException("PERFORMANCE_ASSIGNMENT_NOT_FOUND", "绩效分配节点不存在");
        }
        return assignment;
    }

    private void ensureEditable(PerformanceObjective objective) {
        if (!STATUS_DRAFT.equals(objective.getStatus()) && !STATUS_REJECTED.equals(objective.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有草稿或已驳回目标才能调整分解");
        }
    }

    private List<PerformanceAssignment> listAssignments(Long objectiveId) {
        return assignmentMapper.selectList(
                new LambdaQueryWrapper<PerformanceAssignment>()
                        .eq(PerformanceAssignment::getObjectiveId, objectiveId)
                        .orderByAsc(PerformanceAssignment::getParentId)
                        .orderByAsc(PerformanceAssignment::getSortOrder)
                        .orderByAsc(PerformanceAssignment::getId)
        );
    }

    private List<PerformanceAssignment> listChildren(Long parentId) {
        return assignmentMapper.selectList(
                new LambdaQueryWrapper<PerformanceAssignment>()
                        .eq(PerformanceAssignment::getParentId, parentId)
                        .orderByAsc(PerformanceAssignment::getSortOrder)
                        .orderByAsc(PerformanceAssignment::getId)
        );
    }

    private void deleteDescendants(Long parentId) {
        for (PerformanceAssignment child : listChildren(parentId)) {
            deleteDescendants(child.getId());
            assignmentMapper.deleteById(child.getId());
        }
    }

    private Long countByStatus(List<PerformanceObjective> objectives, String status) {
        return objectives.stream().filter(item -> status.equals(item.getStatus())).count();
    }

    private List<PerformanceCategoryDefinitionDTO> normalizeCategoryDefinitions(PerformanceObjectiveCreateDTO dto) {
        List<PerformanceCategoryDefinitionDTO> source = dto.getCategoryDefinitions();
        if ((source == null || source.isEmpty()) && dto.getCategoryCodes() != null) {
            source = dto.getCategoryCodes().stream()
                    .map(code -> {
                        PerformanceCategoryDefinitionDTO category = new PerformanceCategoryDefinitionDTO();
                        category.setCategoryCode(code);
                        category.setCategoryName(code);
                        return category;
                    })
                    .toList();
        }
        Map<String, PerformanceCategoryDefinitionDTO> normalized = new LinkedHashMap<>();
        if (source != null) {
            for (PerformanceCategoryDefinitionDTO item : source) {
                String code = normalizeCategoryCode(item.getCategoryCode());
                if (code.isBlank()) {
                    continue;
                }
                PerformanceCategoryDefinitionDTO category = new PerformanceCategoryDefinitionDTO();
                category.setCategoryCode(code);
                category.setCategoryName(defaultName(item.getCategoryName(), code));
                normalized.putIfAbsent(code, category);
            }
        }
        return new ArrayList<>(normalized.values());
    }

    private List<PerformanceCategoryDefinitionDTO> categoryDefinitions(PerformanceObjective objective) {
        List<PerformanceCategoryDefinitionDTO> categories = readJsonList(
                objective.getCategoryConfig(),
                new TypeReference<List<PerformanceCategoryDefinitionDTO>>() {
                }
        );
        if (!categories.isEmpty()) {
            return categories.stream()
                    .map(item -> {
                        PerformanceCategoryDefinitionDTO category = new PerformanceCategoryDefinitionDTO();
                        category.setCategoryCode(normalizeCategoryCode(item.getCategoryCode()));
                        category.setCategoryName(defaultName(item.getCategoryName(), category.getCategoryCode()));
                        return category;
                    })
                    .filter(item -> !item.getCategoryCode().isBlank())
                    .toList();
        }
        return parseCategorySet(objective.getCategoryCodes()).stream()
                .map(code -> {
                    PerformanceCategoryDefinitionDTO category = new PerformanceCategoryDefinitionDTO();
                    category.setCategoryCode(code);
                    category.setCategoryName(code);
                    return category;
                })
                .toList();
    }

    private List<PerformanceMetricDTO> normalizeMetrics(List<PerformanceMetricDTO> metrics) {
        List<PerformanceMetricDTO> source = metrics == null || metrics.isEmpty()
                ? List.of(defaultMetric())
                : metrics;
        Map<String, PerformanceMetricDTO> normalized = new LinkedHashMap<>();
        for (PerformanceMetricDTO item : source) {
            String code = normalizeMetricCode(item.getMetricCode());
            if (code.isBlank()) {
                continue;
            }
            PerformanceMetricDTO metric = new PerformanceMetricDTO();
            metric.setMetricCode(code);
            metric.setMetricName(defaultName(item.getMetricName(), code));
            metric.setMetricUnit(normalizeMetricUnit(item.getMetricUnit()));
            metric.setValueType(metricValueType(item.getValueType(), metric.getMetricUnit()));
            metric.setPrecision(metricPrecision(item.getPrecision(), metric.getValueType()));
            metric.setMetricWeight(normalizeRate(safeAmount(item.getMetricWeight()).compareTo(BigDecimal.ZERO) > 0
                    ? item.getMetricWeight()
                    : DEFAULT_METRIC_WEIGHT));
            normalized.putIfAbsent(code, metric);
        }
        return new ArrayList<>(normalized.values());
    }

    private PerformanceMetricDTO defaultMetric() {
        PerformanceMetricDTO metric = new PerformanceMetricDTO();
        metric.setMetricCode(DEFAULT_METRIC_CODE);
        metric.setMetricName(DEFAULT_METRIC_NAME);
        metric.setMetricUnit(DEFAULT_METRIC_UNIT);
        metric.setValueType(VALUE_TYPE_INTEGER);
        metric.setPrecision(0);
        metric.setMetricWeight(DEFAULT_METRIC_WEIGHT);
        return metric;
    }

    private Map<String, PerformanceMetricDTO> metricMap(PerformanceObjective objective) {
        List<PerformanceMetricDTO> metrics = readJsonList(
                objective.getMetricConfig(),
                new TypeReference<List<PerformanceMetricDTO>>() {
                }
        );
        if (metrics.isEmpty()) {
            metrics = List.of(defaultMetric());
        }
        return normalizeMetrics(metrics).stream()
                .collect(Collectors.toMap(PerformanceMetricDTO::getMetricCode, Function.identity(), (left, right) -> left, LinkedHashMap::new));
    }

    private void applyMetric(
            PerformanceAssignment assignment,
            PerformanceCategoryAllocationDTO allocation,
            Map<String, PerformanceMetricDTO> metrics
    ) {
        String metricCode = normalizeMetricCode(defaultName(allocation.getMetricCode(), DEFAULT_METRIC_CODE));
        PerformanceMetricDTO metric = metrics.get(metricCode);
        if (metric == null) {
            throw new HrBusinessException("INVALID_METRIC", "指标不在目标配置范围内：" + metricCode);
        }
        assignment.setMetricCode(metric.getMetricCode());
        assignment.setMetricName(metric.getMetricName());
        assignment.setMetricUnit(metric.getMetricUnit());
        assignment.setMetricValueType(metricValueType(metric));
        assignment.setMetricPrecision(metricPrecision(metric));
        assignment.setMetricWeight(resolveMetricWeight(allocation.getMetricWeight(), metric.getMetricWeight()));
    }

    private void applyMetric(
            PerformanceAssignment assignment,
            PerformanceAssignmentChildDTO allocation,
            Map<String, PerformanceMetricDTO> metrics
    ) {
        String metricCode = normalizeMetricCode(defaultName(allocation.getMetricCode(), DEFAULT_METRIC_CODE));
        PerformanceMetricDTO metric = metrics.get(metricCode);
        if (metric == null) {
            throw new HrBusinessException("INVALID_METRIC", "指标不在目标配置范围内：" + metricCode);
        }
        assignment.setMetricCode(metric.getMetricCode());
        assignment.setMetricName(metric.getMetricName());
        assignment.setMetricUnit(metric.getMetricUnit());
        assignment.setMetricValueType(metricValueType(metric));
        assignment.setMetricPrecision(metricPrecision(metric));
        assignment.setMetricWeight(resolveMetricWeight(allocation.getMetricWeight(), metric.getMetricWeight()));
    }

    private BigDecimal resolveMetricWeight(BigDecimal overrideWeight, BigDecimal fallbackWeight) {
        return normalizeRate(safeAmount(overrideWeight).compareTo(BigDecimal.ZERO) > 0
                ? overrideWeight
                : fallbackWeight);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new HrSystemException("PERFORMANCE_CONFIG_WRITE_FAILED", "绩效配置序列化失败");
        }
    }

    private <T> List<T> readJsonList(String value, TypeReference<List<T>> typeReference) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            List<T> items = objectMapper.readValue(value, typeReference);
            return items == null ? List.of() : items;
        } catch (Exception e) {
            log.warn("绩效配置解析失败: {}", value, e);
            return List.of();
        }
    }

    private <T> T readJsonObject(String value, Class<T> type) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(value, type);
        } catch (Exception e) {
            log.warn("绩效归档快照解析失败: {}", value, e);
            return null;
        }
    }

    private String assignmentKey(PerformanceAssignment assignment) {
        return assignmentKey(assignment.getCategoryCode(), assignment.getMetricCode());
    }

    private String assignmentKey(String categoryCode, String metricCode) {
        return normalizeCategoryCode(categoryCode) + ":" + normalizeMetricCode(metricCode);
    }

    private String rootNodeKey(Long assigneeId) {
        return "ROOT:" + ASSIGNEE_DEPT + ":" + assigneeId;
    }

    private String categoryNodeKey(Long parentId, String categoryCode, String metricCode) {
        return "CATEGORY:" + parentId + ":" + assignmentKey(categoryCode, defaultName(metricCode, DEFAULT_METRIC_CODE));
    }

    private String employeeNodeKey(Long parentId, Long employeeId) {
        return "EMPLOYEE:" + parentId + ":" + employeeId;
    }

    private String normalizeCategoryCodes(List<String> categoryCodes) {
        return categoryCodes.stream()
                .map(this::normalizeCategoryCode)
                .filter(code -> !code.isBlank())
                .distinct()
                .collect(Collectors.joining(","));
    }

    private Set<String> parseCategorySet(String categoryCodes) {
        if (categoryCodes == null || categoryCodes.isBlank()) {
            return Set.of();
        }
        return java.util.Arrays.stream(categoryCodes.split(","))
                .map(this::normalizeCategoryCode)
                .filter(code -> !code.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private String normalizeCategoryCode(String value) {
        return value == null ? "" : value.trim().toUpperCase();
    }

    private String normalizeMetricCode(String value) {
        return value == null ? "" : value.trim().toUpperCase();
    }

    private String normalizeMetricUnit(String value) {
        String unit = defaultName(value, DEFAULT_METRIC_UNIT);
        if (unit.length() > MAX_METRIC_UNIT_LENGTH) {
            throw new HrBusinessException("INVALID_METRIC_UNIT", "指标单位长度不能超过20个字符：" + unit);
        }
        return unit;
    }

    private String defaultName(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private BigDecimal normalizeAmount(BigDecimal value) {
        return safeAmount(value).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal normalizeMetricValue(BigDecimal value, PerformanceMetricDTO metric) {
        BigDecimal safeValue = safeAmount(value);
        String valueType = metricValueType(metric);
        int precision = metricPrecision(metric);
        if (VALUE_TYPE_INTEGER.equals(valueType) && safeValue.stripTrailingZeros().scale() > 0) {
            throw new HrBusinessException("INVALID_METRIC_VALUE", "整数型指标的目标值和实际值必须为整数");
        }
        if (VALUE_TYPE_PERCENT.equals(valueType)
                && (safeValue.compareTo(BigDecimal.ZERO) < 0 || safeValue.compareTo(new BigDecimal("100")) > 0)) {
            throw new HrBusinessException("INVALID_METRIC_VALUE", "百分比型指标必须在0到100之间");
        }
        return safeValue.setScale(precision, RoundingMode.HALF_UP);
    }

    private String metricValueType(PerformanceMetricDTO metric) {
        if (metric == null) {
            return VALUE_TYPE_DECIMAL;
        }
        return metricValueType(metric.getValueType(), metric.getMetricUnit());
    }

    private String metricValueType(String valueType, String metricUnit) {
        String normalized = valueType == null ? "" : valueType.trim().toUpperCase();
        if (VALUE_TYPE_INTEGER.equals(normalized) || VALUE_TYPE_DECIMAL.equals(normalized) || VALUE_TYPE_PERCENT.equals(normalized)) {
            return normalized;
        }
        return INTEGER_METRIC_UNITS.contains(defaultName(metricUnit, DEFAULT_METRIC_UNIT)) ? VALUE_TYPE_INTEGER : VALUE_TYPE_DECIMAL;
    }

    private int metricPrecision(PerformanceMetricDTO metric) {
        if (metric == null) {
            return 2;
        }
        return metricPrecision(metric.getPrecision(), metricValueType(metric));
    }

    private int metricPrecision(Integer precision, String valueType) {
        if (VALUE_TYPE_INTEGER.equals(valueType)) {
            return 0;
        }
        int normalized = precision == null ? 2 : precision;
        return Math.min(4, Math.max(0, normalized));
    }

    private BigDecimal normalizeRate(BigDecimal value) {
        return safeAmount(value).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal safeAmount(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private BigDecimal normalizeAssignmentValue(BigDecimal value, PerformanceAssignment assignment) {
        if (assignment == null || isBlank(assignment.getMetricCode())) {
            return normalizeAmount(value);
        }
        int precision = assignment.getMetricPrecision() == null ? 2 : Math.min(4, Math.max(0, assignment.getMetricPrecision()));
        return safeAmount(value).setScale(precision, RoundingMode.HALF_UP);
    }

    private List<PerformanceAssignmentChildDTO> safeChildren(List<PerformanceAssignmentChildDTO> incoming) {
        return incoming == null ? List.of() : incoming;
    }

    private void ensureSameAmount(BigDecimal left, BigDecimal right, String message) {
        if (safeAmount(left).setScale(4, RoundingMode.HALF_UP)
                .compareTo(safeAmount(right).setScale(4, RoundingMode.HALF_UP)) != 0) {
            throw new HrBusinessException("AMOUNT_NOT_MATCH", message);
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
