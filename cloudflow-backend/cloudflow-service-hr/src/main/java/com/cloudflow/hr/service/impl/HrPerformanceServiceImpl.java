package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.HrPerformanceObjectiveTreePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceResultUpdatePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceSalaryAdjustmentRequest;
import com.cloudflow.hr.domain.dto.HrPerformanceSplitPayload;
import com.cloudflow.hr.domain.entity.HrCompChange;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.entity.HrPerformanceAssignment;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.cloudflow.hr.domain.entity.HrPerformanceResult;
import com.cloudflow.hr.domain.entity.HrPerformanceSalaryAdjustment;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrCompChangeMapper;
import com.cloudflow.hr.mapper.HrEmployeeCompMapper;
import com.cloudflow.hr.mapper.HrPerformanceAssignmentMapper;
import com.cloudflow.hr.mapper.HrPerformanceObjectiveMapper;
import com.cloudflow.hr.mapper.HrPerformanceResultMapper;
import com.cloudflow.hr.mapper.HrPerformanceSalaryAdjustmentMapper;
import com.cloudflow.hr.service.HrPerformanceService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class HrPerformanceServiceImpl implements HrPerformanceService {

    private static final long TENANT_ID = 100000L;
    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<LinkedHashMap<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    private final ObjectMapper objectMapper;
    private final HrPerformanceObjectiveMapper objectiveMapper;
    private final HrPerformanceAssignmentMapper assignmentMapper;
    private final HrPerformanceResultMapper performanceResultMapper;
    private final HrEmployeeCompMapper employeeCompMapper;
    private final HrCompChangeMapper compChangeMapper;
    private final HrPerformanceSalaryAdjustmentMapper performanceSalaryAdjustmentMapper;
    private final HrAuditLogMapper auditLogMapper;

    @Override
    public Map<String, Object> listObjectives(Map<String, Object> query) {
        String keyword = text(query.get("keyword"));
        String status = text(query.get("status"));
        int pageNum = Math.max(1, toInt(query.get("pageNum"), toInt(query.get("current"), 1)));
        int pageSize = Math.min(500, Math.max(1, toInt(query.get("pageSize"), toInt(query.get("size"), 50))));

        LambdaQueryWrapper<HrPerformanceObjective> wrapper = new LambdaQueryWrapper<HrPerformanceObjective>()
                .eq(HrPerformanceObjective::getTenantId, TENANT_ID)
                .eq(HrPerformanceObjective::getDeleted, 0);
        if (StringUtils.hasText(keyword)) {
            String like = keyword.trim();
            wrapper.and(w -> w.like(HrPerformanceObjective::getObjectiveNo, like)
                    .or().like(HrPerformanceObjective::getObjectiveName, like)
                    .or().like(HrPerformanceObjective::getCycleName, like));
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(HrPerformanceObjective::getStatus, status.trim());
        }
        wrapper.orderByDesc(HrPerformanceObjective::getUpdateTime).orderByDesc(HrPerformanceObjective::getId);

        IPage<HrPerformanceObjective> page = objectiveMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
        List<Map<String, Object>> records = page.getRecords().stream()
                .map(this::toMap)
                .map(this::normalizeObjectiveRow)
                .toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("records", records);
        result.put("rows", records);
        result.put("total", page.getTotal());
        result.put("current", pageNum);
        result.put("size", pageSize);
        return result;
    }

    @Override
    public Map<String, Object> getObjectiveTree(Long id) {
        Map<String, Object> objective = getObjective(id);
        if (objective.isEmpty()) {
            return Map.of();
        }
        List<Map<String, Object>> salaryAdjustments = performanceSalaryAdjustmentMapper.selectList(
                        new LambdaQueryWrapper<HrPerformanceSalaryAdjustment>()
                                .eq(HrPerformanceSalaryAdjustment::getObjectiveId, id)
                                .orderByDesc(HrPerformanceSalaryAdjustment::getId))
                .stream()
                .map(this::toMap)
                .toList();

        Map<String, Object> result = new LinkedHashMap<>(objective);
        result.put("salaryAdjustments", salaryAdjustments);
        return result;
    }

    @Override
    public Map<String, Object> getOverview() {
        List<HrPerformanceObjective> rows = objectiveMapper.selectList(
                new LambdaQueryWrapper<HrPerformanceObjective>()
                        .select(HrPerformanceObjective::getStatus)
                        .eq(HrPerformanceObjective::getTenantId, TENANT_ID)
                        .eq(HrPerformanceObjective::getDeleted, 0));
        int draftCount = 0;
        int planApprovingCount = 0;
        int runningCount = 0;
        int resultApprovingCount = 0;
        int completedCount = 0;
        for (HrPerformanceObjective row : rows) {
            String status = text(row.getStatus()).toUpperCase(Locale.ROOT);
            switch (status) {
                case "DRAFT", "REJECTED" -> draftCount++;
                case "PLAN_APPROVING" -> planApprovingCount++;
                case "PLAN_APPROVED" -> runningCount++;
                case "RESULT_APPROVING" -> resultApprovingCount++;
                case "COMPLETED" -> completedCount++;
                default -> {
                }
            }
        }
        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("draftCount", draftCount);
        overview.put("planApprovingCount", planApprovingCount);
        overview.put("runningCount", runningCount);
        overview.put("resultApprovingCount", resultApprovingCount);
        overview.put("completedCount", completedCount);
        overview.put("objectiveCount", rows.size());
        overview.put("activeObjectiveCount", runningCount);
        overview.put("completedObjectiveCount", completedCount);
        return overview;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createObjective(HrPerformanceObjectiveTreePayload payload) {
        Map<String, Object> payloadMap = objectMapper.convertValue(payload, MAP_TYPE);
        List<Map<String, Object>> categoryDefinitions = asMapList(payloadMap.get("categoryDefinitions"));
        List<Map<String, Object>> metrics = asMapList(payloadMap.get("metrics"));
        List<Map<String, Object>> departmentAssignments = asMapList(payloadMap.get("departmentAssignments"));

        Map<String, Object> metricConfig = new LinkedHashMap<>();
        metricConfig.put("totalTargetAmount", toDecimal(payloadMap.get("totalTargetAmount")));
        metricConfig.put("scoreCap", toDecimal(payloadMap.get("scoreCap"), BigDecimal.valueOf(120)));
        metricConfig.put("categoryCodes", normalizeStringList(payloadMap.get("categoryCodes")));
        metricConfig.put("categoryDefinitions", categoryDefinitions);
        metricConfig.put("metrics", metrics);
        metricConfig.put("assignmentMeta", new LinkedHashMap<>());

        String objectiveNo = text(payloadMap.get("objectiveNo"));
        if (!StringUtils.hasText(objectiveNo)) {
            objectiveNo = "HRPF" + System.currentTimeMillis();
        }

        HrPerformanceObjective objective = new HrPerformanceObjective();
        objective.setTenantId(TENANT_ID);
        objective.setObjectiveNo(objectiveNo);
        objective.setCycleName(requireText(payloadMap.get("cycleName"), "cycleName"));
        objective.setCycleStartDate(LocalDate.parse(requireText(payloadMap.get("cycleStartDate"), "cycleStartDate")));
        objective.setCycleEndDate(LocalDate.parse(requireText(payloadMap.get("cycleEndDate"), "cycleEndDate")));
        objective.setObjectiveName(requireText(payloadMap.get("objectiveName"), "objectiveName"));
        objective.setOwnerEmployeeId(resolveOwnerEmployeeId(departmentAssignments));
        objective.setMetricConfig(objectMapper.valueToTree(metricConfig));
        objective.setStatus("DRAFT");
        objective.setCreateBy("admin");
        objective.setUpdateBy("admin");
        objective.setDeleted(0);
        objectiveMapper.insert(objective);
        Long objectiveId = objective.getId();

        Map<String, Object> assignmentMeta = new LinkedHashMap<>();
        for (Map<String, Object> dept : departmentAssignments) {
            Long deptId = toLong(dept.get("deptId"));
            if (deptId == null) {
                continue;
            }
            BigDecimal deptTargetAmount = toDecimal(dept.get("targetAmount"));
            HrPerformanceAssignment deptAssignment = new HrPerformanceAssignment();
            deptAssignment.setTenantId(TENANT_ID);
            deptAssignment.setObjectiveId(objectiveId);
            deptAssignment.setParentId(null);
            deptAssignment.setAssigneeType("DEPT");
            deptAssignment.setAssigneeId(deptId);
            deptAssignment.setAssigneeName(text(dept.get("deptName")));
            deptAssignment.setTargetValue(deptTargetAmount);
            deptAssignment.setActualValue(BigDecimal.ZERO);
            deptAssignment.setWeight(BigDecimal.valueOf(100));
            deptAssignment.setStatus("ACTIVE");
            assignmentMapper.insert(deptAssignment);
            Long deptAssignmentId = deptAssignment.getId();

            Map<String, Object> deptMeta = new LinkedHashMap<>();
            deptMeta.put("targetAmount", deptTargetAmount);
            deptMeta.put("actualAmount", BigDecimal.ZERO);
            if (dept.get("ownerEmployeeId") != null) {
                deptMeta.put("ownerEmployeeId", toLong(dept.get("ownerEmployeeId")));
            }
            assignmentMeta.put(String.valueOf(deptAssignmentId), deptMeta);

            for (Map<String, Object> category : asMapList(dept.get("categories"))) {
                BigDecimal weight = toDecimal(category.get("metricWeight"), BigDecimal.valueOf(100));
                BigDecimal targetAmount = toDecimal(category.get("targetAmount"));
                HrPerformanceAssignment catAssignment = new HrPerformanceAssignment();
                catAssignment.setTenantId(TENANT_ID);
                catAssignment.setObjectiveId(objectiveId);
                catAssignment.setParentId(deptAssignmentId);
                catAssignment.setAssigneeType("DEPT");
                catAssignment.setAssigneeId(deptId);
                catAssignment.setAssigneeName(text(dept.get("deptName")));
                catAssignment.setTargetValue(targetAmount);
                catAssignment.setActualValue(BigDecimal.ZERO);
                catAssignment.setWeight(weight);
                catAssignment.setStatus("ACTIVE");
                assignmentMapper.insert(catAssignment);
                Long categoryAssignmentId = catAssignment.getId();

                Map<String, Object> categoryMeta = new LinkedHashMap<>();
                categoryMeta.put("categoryCode", text(category.get("categoryCode")));
                categoryMeta.put("categoryName", text(category.get("categoryName")));
                categoryMeta.put("metricCode", text(category.get("metricCode")));
                categoryMeta.put("metricName", text(category.get("metricName")));
                categoryMeta.put("metricUnit", text(category.get("metricUnit")));
                categoryMeta.put("metricWeight", weight);
                categoryMeta.put("metricValueType", defaultText(category.get("valueType"), "DECIMAL"));
                categoryMeta.put("metricPrecision", toInt(category.get("precision"), 2));
                categoryMeta.put("targetAmount", targetAmount);
                categoryMeta.put("actualAmount", BigDecimal.ZERO);
                categoryMeta.put("quotaSource", defaultText(category.get("quotaSource"), "MANAGER"));
                categoryMeta.put("locked", Boolean.TRUE.equals(category.get("locked")));
                assignmentMeta.put(String.valueOf(categoryAssignmentId), categoryMeta);
            }
        }

        metricConfig.put("assignmentMeta", assignmentMeta);
        objectiveMapper.update(null,
                new LambdaUpdateWrapper<HrPerformanceObjective>()
                        .eq(HrPerformanceObjective::getTenantId, TENANT_ID)
                        .eq(HrPerformanceObjective::getId, objectiveId)
                        .set(HrPerformanceObjective::getMetricConfig, objectMapper.valueToTree(metricConfig))
                        .set(HrPerformanceObjective::getUpdateTime, LocalDateTime.now()));
        writeAuditLog("hr_performance_objective", objectiveId, "CREATE", Map.of(), loadObjective(objectiveId));
        return objectiveId;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void saveAssignmentChildren(Long parentId, HrPerformanceSplitPayload payload) {
        Map<String, Object> parent = getAssignment(parentId);
        if (parent.isEmpty()) {
            throw new IllegalArgumentException("绩效分解节点不存在");
        }
        Long objectiveId = toLong(parent.get("objectiveId"));
        List<Map<String, Object>> beforeAssignments = loadAssignmentsByParent(parentId);
        List<Map<String, Object>> children = payload == null || payload.getChildren() == null
                ? List.of()
                : payload.getChildren().stream()
                .map(item -> objectMapper.convertValue(item, MAP_TYPE))
                .map(this::mutableMap)
                .toList();
        Map<String, Object> objective = loadObjective(objectiveId);
        Map<String, Object> metricConfig = parseJsonObject(objective.get("metricConfig"));
        Map<String, Object> assignmentMeta = mutableMap(parseJsonObject(metricConfig.get("assignmentMeta")));

        List<HrPerformanceAssignment> existed = assignmentMapper.selectList(
                new LambdaQueryWrapper<HrPerformanceAssignment>()
                        .eq(HrPerformanceAssignment::getTenantId, TENANT_ID)
                        .eq(HrPerformanceAssignment::getParentId, parentId)
                        .orderByAsc(HrPerformanceAssignment::getId));
        if (!existed.isEmpty()) {
            List<Long> existingIds = existed.stream().map(HrPerformanceAssignment::getId).toList();
            performanceResultMapper.delete(
                    new LambdaQueryWrapper<HrPerformanceResult>()
                            .eq(HrPerformanceResult::getTenantId, TENANT_ID)
                            .in(HrPerformanceResult::getAssignmentId, existingIds));
            assignmentMapper.delete(
                    new LambdaQueryWrapper<HrPerformanceAssignment>()
                            .eq(HrPerformanceAssignment::getTenantId, TENANT_ID)
                            .eq(HrPerformanceAssignment::getParentId, parentId));
            existingIds.forEach(id -> assignmentMeta.remove(String.valueOf(id)));
        }

        Long objectiveOwner = toLong(objective.get("ownerEmployeeId"));
        Long parentAssigneeId = toLong(parent.get("assigneeId"));
        String parentAssigneeName = text(parent.get("assigneeName"));
        for (Map<String, Object> child : children) {
            String assigneeType = defaultText(child.get("assigneeType"), "EMPLOYEE").toUpperCase(Locale.ROOT);
            Long assigneeId = "DEPT".equals(assigneeType) ? parentAssigneeId : toLong(child.get("assigneeId"));
            String assigneeName = "DEPT".equals(assigneeType) ? parentAssigneeName : text(child.get("assigneeName"));
            BigDecimal targetAmount = toDecimal(child.get("targetAmount"));
            BigDecimal weight = toDecimal(firstNonNull(child.get("metricWeight"), child.get("weight")), BigDecimal.valueOf(100));

            HrPerformanceAssignment childEntity = new HrPerformanceAssignment();
            childEntity.setTenantId(TENANT_ID);
            childEntity.setObjectiveId(objectiveId);
            childEntity.setParentId(parentId);
            childEntity.setAssigneeType(assigneeType);
            childEntity.setAssigneeId(assigneeId);
            childEntity.setAssigneeName(assigneeName);
            childEntity.setTargetValue(targetAmount);
            childEntity.setActualValue(BigDecimal.ZERO);
            childEntity.setWeight(weight);
            childEntity.setStatus("ACTIVE");
            assignmentMapper.insert(childEntity);
            Long childId = childEntity.getId();

            Map<String, Object> meta = new LinkedHashMap<>();
            copyIfPresent(child, meta, "categoryCode", "categoryName", "metricCode", "metricName", "metricUnit", "quotaSource");
            meta.put("metricWeight", weight);
            meta.put("metricValueType", defaultText(child.get("metricValueType"), defaultText(child.get("valueType"), "DECIMAL")));
            meta.put("metricPrecision", toInt(firstNonNull(child.get("metricPrecision"), child.get("precision")), 2));
            meta.put("targetAmount", targetAmount);
            meta.put("actualAmount", BigDecimal.ZERO);
            meta.put("locked", Boolean.TRUE.equals(child.get("locked")));
            if ("DEPT".equals(assigneeType) && objectiveOwner != null) {
                meta.put("ownerEmployeeId", objectiveOwner);
            }
            assignmentMeta.put(String.valueOf(childId), meta);
        }

        metricConfig.put("assignmentMeta", assignmentMeta);
        objectiveMapper.update(null,
                new LambdaUpdateWrapper<HrPerformanceObjective>()
                        .eq(HrPerformanceObjective::getTenantId, TENANT_ID)
                        .eq(HrPerformanceObjective::getId, objectiveId)
                        .set(HrPerformanceObjective::getMetricConfig, objectMapper.valueToTree(metricConfig))
                        .set(HrPerformanceObjective::getUpdateTime, LocalDateTime.now()));
        writeAuditLog("hr_performance_assignment", parentId, "UPSERT_CHILDREN",
                Map.of("children", beforeAssignments),
                Map.of("children", loadAssignmentsByParent(parentId)));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateResult(HrPerformanceResultUpdatePayload payload) {
        Long assignmentId = payload == null ? null : payload.getAssignmentId();
        BigDecimal actualAmount = payload == null ? BigDecimal.ZERO : payload.getActualAmount();
        Map<String, Object> assignment = getAssignment(assignmentId);
        if (assignment.isEmpty()) {
            throw new IllegalArgumentException("绩效分解节点不存在");
        }
        Map<String, Object> before = new LinkedHashMap<>(assignment);
        assignmentMapper.update(null,
                new LambdaUpdateWrapper<HrPerformanceAssignment>()
                        .eq(HrPerformanceAssignment::getTenantId, TENANT_ID)
                        .eq(HrPerformanceAssignment::getId, assignmentId)
                        .set(HrPerformanceAssignment::getActualValue, actualAmount)
                        .set(HrPerformanceAssignment::getUpdateTime, LocalDateTime.now()));

        Long objectiveId = toLong(assignment.get("objectiveId"));
        Map<String, Object> objective = loadObjective(objectiveId);
        Map<String, Object> metricConfig = parseJsonObject(objective.get("metricConfig"));
        Map<String, Object> assignmentMeta = mutableMap(parseJsonObject(metricConfig.get("assignmentMeta")));
        Map<String, Object> meta = mutableMap(parseJsonObject(assignmentMeta.get(String.valueOf(assignmentId))));
        meta.put("actualAmount", actualAmount);
        assignmentMeta.put(String.valueOf(assignmentId), meta);
        metricConfig.put("assignmentMeta", assignmentMeta);
        objectiveMapper.update(null,
                new LambdaUpdateWrapper<HrPerformanceObjective>()
                        .eq(HrPerformanceObjective::getTenantId, TENANT_ID)
                        .eq(HrPerformanceObjective::getId, objectiveId)
                        .set(HrPerformanceObjective::getMetricConfig, objectMapper.valueToTree(metricConfig))
                        .set(HrPerformanceObjective::getUpdateTime, LocalDateTime.now()));
        writeAuditLog("hr_performance_assignment", assignmentId, "UPDATE_RESULT", before, getAssignment(assignmentId));
    }

    @Override
    public void submitPlan(Long objectiveId) {
        Map<String, Object> before = loadObjective(objectiveId);
        objectiveMapper.update(null,
                new LambdaUpdateWrapper<HrPerformanceObjective>()
                        .eq(HrPerformanceObjective::getTenantId, TENANT_ID)
                        .eq(HrPerformanceObjective::getId, objectiveId)
                        .set(HrPerformanceObjective::getStatus, "PLAN_APPROVING")
                        .set(HrPerformanceObjective::getUpdateTime, LocalDateTime.now()));
        writeAuditLog("hr_performance_objective", objectiveId, "SUBMIT_PLAN", before, loadObjective(objectiveId));
    }

    @Override
    public void submitResult(Long objectiveId) {
        Map<String, Object> before = loadObjective(objectiveId);
        objectiveMapper.update(null,
                new LambdaUpdateWrapper<HrPerformanceObjective>()
                        .eq(HrPerformanceObjective::getTenantId, TENANT_ID)
                        .eq(HrPerformanceObjective::getId, objectiveId)
                        .set(HrPerformanceObjective::getStatus, "RESULT_APPROVING")
                        .set(HrPerformanceObjective::getUpdateTime, LocalDateTime.now()));
        writeAuditLog("hr_performance_objective", objectiveId, "SUBMIT_RESULT", before, loadObjective(objectiveId));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createSalaryAdjustment(Long objectiveId, HrPerformanceSalaryAdjustmentRequest payload) {
        Long employeeId = payload == null ? null : payload.getEmployeeId();
        if (employeeId == null) {
            throw new IllegalArgumentException("employeeId不能为空");
        }
        BigDecimal afterTotal = payload.getAfterTotal() == null ? BigDecimal.ZERO : payload.getAfterTotal();
        BigDecimal beforeTotal = queryEmployeeSalary(employeeId);
        BigDecimal adjustmentAmount = afterTotal.subtract(beforeTotal);
        String reason = defaultText(payload.getAdjustmentReason(), "绩效结果调薪");
        LocalDate effectiveDate = LocalDate.parse(defaultText(payload.getEffectiveDate(), LocalDate.now().toString()));

        HrCompChange compChange = new HrCompChange();
        compChange.setTenantId(TENANT_ID);
        compChange.setChangeNo("HRCG" + System.currentTimeMillis());
        compChange.setEmployeeId(employeeId);
        compChange.setChangeType("PERFORMANCE");
        compChange.setBeforeTotal(beforeTotal);
        compChange.setAfterTotal(afterTotal);
        compChange.setChangeAmount(adjustmentAmount);
        compChange.setEffectiveDate(effectiveDate);
        compChange.setReason(reason);
        compChange.setStatus("DRAFT");
        compChange.setCreateBy("admin");
        compChange.setUpdateBy("admin");
        compChange.setDeleted(0);
        compChangeMapper.insert(compChange);

        HrPerformanceSalaryAdjustment adjustment = new HrPerformanceSalaryAdjustment();
        adjustment.setTenantId(TENANT_ID);
        adjustment.setObjectiveId(objectiveId);
        adjustment.setEmployeeId(employeeId);
        adjustment.setCompChangeId(compChange.getId());
        adjustment.setAdjustmentAmount(adjustmentAmount);
        adjustment.setReason(reason);
        adjustment.setStatus("DRAFT");
        performanceSalaryAdjustmentMapper.insert(adjustment);

        Long adjustmentId = adjustment.getId();
        writeAuditLog("hr_performance_salary_adjustment", adjustmentId, "CREATE", Map.of(), toMap(adjustment));
        return adjustmentId;
    }

    private Map<String, Object> normalizeObjectiveRow(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>(row);
        Map<String, Object> metricConfig = parseJsonObject(result.get("metricConfig"));
        result.put("totalTargetAmount", toDecimal(metricConfig.get("totalTargetAmount")));
        result.put("scoreCap", toDecimal(metricConfig.get("scoreCap"), BigDecimal.valueOf(120)));
        result.put("categoryCodes", normalizeStringList(metricConfig.get("categoryCodes")));
        result.put("categoryDefinitions", asMapList(metricConfig.get("categoryDefinitions")));
        result.put("metrics", normalizeMetrics(asMapList(metricConfig.get("metrics"))));
        result.put("status", normalizeObjectiveStatus(text(result.get("status"))));

        Long objectiveId = toLong(result.get("id"));
        List<Map<String, Object>> assignments = assignmentMapper.selectList(
                        new LambdaQueryWrapper<HrPerformanceAssignment>()
                                .eq(HrPerformanceAssignment::getTenantId, TENANT_ID)
                                .eq(HrPerformanceAssignment::getObjectiveId, objectiveId))
                .stream()
                .map(this::toMap)
                .toList();
        Map<String, Object> assignmentMeta = parseJsonObject(metricConfig.get("assignmentMeta"));
        List<Map<String, Object>> results = performanceResultMapper.selectList(
                        new LambdaQueryWrapper<HrPerformanceResult>()
                                .eq(HrPerformanceResult::getTenantId, TENANT_ID)
                                .eq(HrPerformanceResult::getObjectiveId, objectiveId))
                .stream()
                .map(this::toMap)
                .toList();
        List<Map<String, Object>> tree = buildAssignmentTree(assignments, results, assignmentMeta);
        result.put("assignments", tree);
        result.put("leafTaskCount", countLeafTasks(tree));
        result.put("completionRate", completionRateOfTree(tree));
        result.put("actualAmount", actualAmountOfTree(tree));
        result.putAll(summarizeObjectiveScore(tree, results));
        return result;
    }

    private List<Map<String, Object>> buildAssignmentTree(List<Map<String, Object>> rows,
                                                          List<Map<String, Object>> results,
                                                          Map<String, Object> assignmentMeta) {
        Map<Long, Map<String, Object>> resultByAssignment = results.stream()
                .collect(Collectors.toMap(
                        item -> toLong(item.get("assignmentId")),
                        item -> item,
                        (left, right) -> right,
                        LinkedHashMap::new
                ));
        Map<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> row : rows.stream().sorted(Comparator.comparing(item -> toLong(item.get("id")))).toList()) {
            Map<String, Object> node = new LinkedHashMap<>(row);
            Long id = toLong(node.get("id"));
            Map<String, Object> meta = parseJsonObject(assignmentMeta.get(String.valueOf(id)));
            mergeMeta(node, meta);
            BigDecimal targetAmount = firstDecimal(node.get("targetAmount"), node.get("targetValue"), BigDecimal.ZERO);
            BigDecimal actualAmount = firstDecimal(node.get("actualAmount"), node.get("actualValue"), BigDecimal.ZERO);
            node.put("targetAmount", targetAmount);
            node.put("targetValue", targetAmount);
            node.put("actualAmount", actualAmount);
            node.put("actualValue", actualAmount);
            node.put("metricWeight", toDecimal(firstNonNull(node.get("metricWeight"), node.get("weight")), BigDecimal.valueOf(100)));
            node.put("metricPrecision", toInt(node.get("metricPrecision"), 2));
            node.put("metricValueType", defaultText(node.get("metricValueType"), "DECIMAL"));
            node.put("children", new ArrayList<Map<String, Object>>());
            Map<String, Object> result = resultByAssignment.get(id);
            if (result != null) {
                node.put("score", toDecimal(result.get("score")));
                node.put("grade", text(result.get("grade")));
                node.put("summary", text(result.get("summary")));
            }
            node.put("completionRate", calculateCompletionRate(targetAmount, actualAmount));
            byId.put(id, node);
        }

        List<Map<String, Object>> roots = new ArrayList<>();
        for (Map<String, Object> node : byId.values()) {
            Long parentId = toLong(node.get("parentId"));
            if (parentId == null) {
                roots.add(node);
                continue;
            }
            Map<String, Object> parent = byId.get(parentId);
            if (parent == null) {
                roots.add(node);
                continue;
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> children = (List<Map<String, Object>>) parent.get("children");
            children.add(node);
        }
        refreshAggregateFields(roots);
        return roots;
    }

    private void refreshAggregateFields(List<Map<String, Object>> nodes) {
        for (Map<String, Object> node : nodes) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> children = (List<Map<String, Object>>) node.get("children");
            if (children != null && !children.isEmpty()) {
                refreshAggregateFields(children);
                if (!"EMPLOYEE".equals(text(node.get("assigneeType")).toUpperCase(Locale.ROOT))) {
                    BigDecimal targetAmount = children.stream()
                            .map(item -> toDecimal(item.get("targetAmount")))
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal actualAmount = children.stream()
                            .map(item -> toDecimal(item.get("actualAmount")))
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    node.put("targetAmount", targetAmount);
                    node.put("targetValue", targetAmount);
                    node.put("actualAmount", actualAmount);
                    node.put("actualValue", actualAmount);
                    node.put("completionRate", calculateCompletionRate(targetAmount, actualAmount));
                }
            }
        }
    }

    private Map<String, Object> summarizeObjectiveScore(List<Map<String, Object>> tree, List<Map<String, Object>> results) {
        List<Map<String, Object>> leafNodes = new ArrayList<>();
        collectLeafNodes(tree, leafNodes);
        BigDecimal score = BigDecimal.ZERO;
        if (!results.isEmpty()) {
            score = results.stream()
                    .map(item -> toDecimal(item.get("score")))
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .divide(BigDecimal.valueOf(results.size()), 2, RoundingMode.HALF_UP);
        } else if (!leafNodes.isEmpty()) {
            score = BigDecimal.valueOf(completionRateOfTree(tree)).setScale(2, RoundingMode.HALF_UP);
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("score", score);
        summary.put("grade", gradeOfScore(score));
        return summary;
    }

    private int countLeafTasks(List<Map<String, Object>> tree) {
        List<Map<String, Object>> leafNodes = new ArrayList<>();
        collectLeafNodes(tree, leafNodes);
        return leafNodes.size();
    }

    private void collectLeafNodes(List<Map<String, Object>> nodes, List<Map<String, Object>> output) {
        for (Map<String, Object> node : nodes) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> children = (List<Map<String, Object>>) node.get("children");
            if (children == null || children.isEmpty()) {
                if ("EMPLOYEE".equals(text(node.get("assigneeType")).toUpperCase(Locale.ROOT))) {
                    output.add(node);
                }
                continue;
            }
            collectLeafNodes(children, output);
        }
    }

    private double completionRateOfTree(List<Map<String, Object>> tree) {
        List<Map<String, Object>> leafNodes = new ArrayList<>();
        collectLeafNodes(tree, leafNodes);
        BigDecimal totalWeight = BigDecimal.ZERO;
        BigDecimal totalScore = BigDecimal.ZERO;
        for (Map<String, Object> leaf : leafNodes) {
            BigDecimal weight = toDecimal(leaf.get("metricWeight"), BigDecimal.valueOf(100));
            BigDecimal target = toDecimal(leaf.get("targetAmount"));
            BigDecimal actual = toDecimal(leaf.get("actualAmount"));
            if (weight.compareTo(BigDecimal.ZERO) <= 0 || target.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal rate = actual.multiply(BigDecimal.valueOf(100)).divide(target, 4, RoundingMode.HALF_UP);
            totalWeight = totalWeight.add(weight);
            totalScore = totalScore.add(rate.multiply(weight));
        }
        if (totalWeight.compareTo(BigDecimal.ZERO) <= 0) {
            return 0D;
        }
        return totalScore.divide(totalWeight, 2, RoundingMode.HALF_UP).doubleValue();
    }

    private BigDecimal actualAmountOfTree(List<Map<String, Object>> tree) {
        return tree.stream()
                .map(item -> toDecimal(item.get("actualAmount")))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Map<String, Object> getObjective(Long id) {
        Map<String, Object> raw = loadObjective(id);
        return raw.isEmpty() ? raw : normalizeObjectiveRow(raw);
    }

    private Map<String, Object> loadObjective(Long id) {
        HrPerformanceObjective entity = objectiveMapper.selectOne(
                new LambdaQueryWrapper<HrPerformanceObjective>()
                        .eq(HrPerformanceObjective::getTenantId, TENANT_ID)
                        .eq(HrPerformanceObjective::getId, id)
                        .eq(HrPerformanceObjective::getDeleted, 0)
                        .last("LIMIT 1"));
        return entity == null ? Map.of() : toMap(entity);
    }

    private Map<String, Object> getAssignment(Long id) {
        if (id == null) {
            return Map.of();
        }
        HrPerformanceAssignment entity = assignmentMapper.selectOne(
                new LambdaQueryWrapper<HrPerformanceAssignment>()
                        .eq(HrPerformanceAssignment::getTenantId, TENANT_ID)
                        .eq(HrPerformanceAssignment::getId, id)
                        .last("LIMIT 1"));
        return entity == null ? Map.of() : toMap(entity);
    }

    private List<Map<String, Object>> loadAssignmentsByParent(Long parentId) {
        return assignmentMapper.selectList(
                        new LambdaQueryWrapper<HrPerformanceAssignment>()
                                .eq(HrPerformanceAssignment::getTenantId, TENANT_ID)
                                .eq(HrPerformanceAssignment::getParentId, parentId)
                                .orderByAsc(HrPerformanceAssignment::getId))
                .stream()
                .map(this::toMap)
                .toList();
    }

    private BigDecimal queryEmployeeSalary(Long employeeId) {
        List<HrEmployeeComp> rows = employeeCompMapper.selectList(
                new LambdaQueryWrapper<HrEmployeeComp>()
                        .eq(HrEmployeeComp::getEmployeeId, employeeId)
                        .eq(HrEmployeeComp::getDeleted, 0)
                        .orderByDesc(HrEmployeeComp::getEffectiveDate)
                        .orderByDesc(HrEmployeeComp::getId)
                        .last("LIMIT 1")
        );
        if (rows.isEmpty() || rows.get(0).getTotalSalary() == null) {
            return BigDecimal.ZERO;
        }
        return rows.get(0).getTotalSalary();
    }

    private void writeAuditLog(String tableName,
                               Long businessId,
                               String operationType,
                               Map<String, Object> before,
                               Map<String, Object> after) {
        try {
            auditLogMapper.insertLog(
                    TENANT_ID,
                    tableName,
                    businessId,
                    operationType,
                    UserContext.getUserId(),
                    UserContext.getUserName(),
                    writeJson(before == null ? Map.of() : before),
                    writeJson(after == null ? Map.of() : after));
        } catch (Exception ignored) {
        }
    }

    private Map<String, Object> toMap(Object value) {
        return objectMapper.convertValue(value, MAP_TYPE);
    }

    private Map<String, Object> parseJsonObject(Object value) {
        if (value == null) {
            return Map.of();
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            map.forEach((k, v) -> result.put(String.valueOf(k), v));
            return result;
        }
        if (value instanceof JsonNode node) {
            return objectMapper.convertValue(node, MAP_TYPE);
        }
        try {
            return objectMapper.readValue(String.valueOf(value), MAP_TYPE);
        } catch (JsonProcessingException ex) {
            return Map.of();
        }
    }

    private List<Map<String, Object>> asMapList(Object value) {
        if (value == null) {
            return List.of();
        }
        if (value instanceof Collection<?> collection) {
            List<Map<String, Object>> result = new ArrayList<>();
            for (Object item : collection) {
                result.add(mutableMap(parseJsonObject(item)));
            }
            return result;
        }
        if (value instanceof JsonNode node && node.isArray()) {
            List<Map<String, Object>> result = new ArrayList<>();
            node.forEach(child -> result.add(mutableMap(parseJsonObject(child))));
            return result;
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            try {
                return objectMapper.readValue(text, LIST_MAP_TYPE).stream().map(this::mutableMap).toList();
            } catch (JsonProcessingException ex) {
                return List.of();
            }
        }
        return List.of();
    }

    private List<Map<String, Object>> normalizeMetrics(List<Map<String, Object>> metrics) {
        return metrics.stream().map(item -> {
            Map<String, Object> metric = mutableMap(item);
            if (!metric.containsKey("metricWeight") && metric.containsKey("weight")) {
                metric.put("metricWeight", metric.get("weight"));
            }
            if (!metric.containsKey("metricCode") && metric.containsKey("metric")) {
                metric.put("metricCode", metric.get("metric"));
            }
            if (!metric.containsKey("metricName") && metric.containsKey("metric")) {
                metric.put("metricName", metric.get("metric"));
            }
            metric.putIfAbsent("metricUnit", "%");
            metric.putIfAbsent("valueType", "PERCENT");
            metric.putIfAbsent("precision", 2);
            return metric;
        }).toList();
    }

    private List<String> normalizeStringList(Object value) {
        if (value == null) {
            return List.of();
        }
        if (value instanceof Collection<?> collection) {
            return collection.stream().map(String::valueOf).filter(StringUtils::hasText).toList();
        }
        if (value instanceof JsonNode node && node.isArray()) {
            List<String> result = new ArrayList<>();
            node.forEach(child -> {
                String text = child.asText();
                if (StringUtils.hasText(text)) {
                    result.add(text);
                }
            });
            return result;
        }
        String text = text(value);
        if (!StringUtils.hasText(text)) {
            return List.of();
        }
        if (text.startsWith("[") && text.endsWith("]")) {
            try {
                return objectMapper.readValue(text, new TypeReference<List<String>>() {});
            } catch (JsonProcessingException ex) {
                return List.of();
            }
        }
        return List.of(text);
    }

    private Map<String, Object> mutableMap(Map<String, Object> source) {
        return new LinkedHashMap<>(source);
    }

    private void mergeMeta(Map<String, Object> target, Map<String, Object> meta) {
        for (Map.Entry<String, Object> entry : meta.entrySet()) {
            target.putIfAbsent(entry.getKey(), entry.getValue());
        }
    }

    private void copyIfPresent(Map<String, Object> source, Map<String, Object> target, String... keys) {
        for (String key : keys) {
            Object value = source.get(key);
            if (value != null && StringUtils.hasText(String.valueOf(value))) {
                target.put(key, value);
            }
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("JSON序列化失败", e);
        }
    }

    private String requireText(Object value, String fieldName) {
        String text = text(value);
        if (!StringUtils.hasText(text)) {
            throw new IllegalArgumentException(fieldName + "不能为空");
        }
        return text;
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String defaultText(Object value, String fallback) {
        String text = text(value);
        return StringUtils.hasText(text) ? text : fallback;
    }

    private Object firstNonNull(Object first, Object second) {
        return first != null ? first : second;
    }

    private Long resolveOwnerEmployeeId(List<Map<String, Object>> departmentAssignments) {
        for (Map<String, Object> item : departmentAssignments) {
            Long ownerEmployeeId = toLong(item.get("ownerEmployeeId"));
            if (ownerEmployeeId != null) {
                return ownerEmployeeId;
            }
        }
        return null;
    }

    private Long toLong(Object value) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private int toInt(Object value, int fallback) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return fallback;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private BigDecimal toDecimal(Object value) {
        return toDecimal(value, BigDecimal.ZERO);
    }

    private BigDecimal toDecimal(Object value, BigDecimal fallback) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return fallback;
        }
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private BigDecimal firstDecimal(Object first, Object second, BigDecimal fallback) {
        BigDecimal firstValue = toDecimal(first, null);
        if (firstValue != null) {
            return firstValue;
        }
        BigDecimal secondValue = toDecimal(second, null);
        return secondValue == null ? fallback : secondValue;
    }

    private double calculateCompletionRate(BigDecimal targetAmount, BigDecimal actualAmount) {
        if (targetAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return 0D;
        }
        return actualAmount.multiply(BigDecimal.valueOf(100))
                .divide(targetAmount, 2, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private String gradeOfScore(BigDecimal score) {
        if (score.compareTo(BigDecimal.valueOf(95)) >= 0) {
            return "A";
        }
        if (score.compareTo(BigDecimal.valueOf(85)) >= 0) {
            return "B+";
        }
        if (score.compareTo(BigDecimal.valueOf(75)) >= 0) {
            return "B";
        }
        if (score.compareTo(BigDecimal.valueOf(60)) >= 0) {
            return "C";
        }
        return "D";
    }

    private String normalizeObjectiveStatus(String status) {
        String value = defaultText(status, "DRAFT").toUpperCase(Locale.ROOT);
        return switch (value) {
            case "APPROVING" -> "PLAN_APPROVING";
            case "APPROVED" -> "PLAN_APPROVED";
            default -> value;
        };
    }
}
