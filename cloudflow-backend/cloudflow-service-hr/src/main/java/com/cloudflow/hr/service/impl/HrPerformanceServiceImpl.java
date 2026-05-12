package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.service.HrPerformanceService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class HrPerformanceServiceImpl implements HrPerformanceService {

    private static final long TENANT_ID = 100000L;
    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<LinkedHashMap<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public Map<String, Object> listObjectives(Map<String, Object> query) {
        String keyword = text(query.get("keyword"));
        String status = text(query.get("status"));
        int pageNum = Math.max(1, toInt(query.get("pageNum"), toInt(query.get("current"), 1)));
        int pageSize = Math.min(500, Math.max(1, toInt(query.get("pageSize"), toInt(query.get("size"), 50))));

        StringBuilder where = new StringBuilder(" WHERE tenant_id = ? AND deleted = 0");
        List<Object> args = new ArrayList<>();
        args.add(TENANT_ID);
        if (StringUtils.hasText(keyword)) {
            where.append(" AND (objective_no LIKE ? OR objective_name LIKE ? OR cycle_name LIKE ?)");
            String like = "%" + keyword.trim() + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        if (StringUtils.hasText(status)) {
            where.append(" AND status = ?");
            args.add(status.trim());
        }

        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM hr_performance_objective" + where,
                Long.class,
                args.toArray()
        );

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT * FROM hr_performance_objective" + where + " ORDER BY update_time DESC, id DESC LIMIT ? OFFSET ?",
                appendArgs(args, pageSize, (pageNum - 1) * pageSize)
        );

        List<Map<String, Object>> records = rows.stream()
                .map(this::normalizeObjectiveRow)
                .toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("records", records);
        result.put("rows", records);
        result.put("total", total == null ? records.size() : total);
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
        List<Map<String, Object>> salaryAdjustments = jdbcTemplate.queryForList(
                "SELECT * FROM hr_performance_salary_adjustment WHERE tenant_id = ? AND objective_id = ? ORDER BY id DESC",
                TENANT_ID, id
        );

        Map<String, Object> result = new LinkedHashMap<>(objective);
        result.put("salaryAdjustments", salaryAdjustments.stream().map(this::toCamelRow).toList());
        return result;
    }

    @Override
    public Map<String, Object> getOverview() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT status FROM hr_performance_objective WHERE tenant_id = ? AND deleted = 0",
                TENANT_ID
        );
        int draftCount = 0;
        int planApprovingCount = 0;
        int runningCount = 0;
        int resultApprovingCount = 0;
        int completedCount = 0;
        for (Map<String, Object> row : rows) {
            String status = text(row.get("status")).toUpperCase(Locale.ROOT);
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
    public Long createObjective(Map<String, Object> payload) {
        List<Map<String, Object>> categoryDefinitions = asMapList(payload.get("categoryDefinitions"));
        List<Map<String, Object>> metrics = asMapList(payload.get("metrics"));
        List<Map<String, Object>> departmentAssignments = asMapList(payload.get("departmentAssignments"));

        Map<String, Object> metricConfig = new LinkedHashMap<>();
        metricConfig.put("totalTargetAmount", toDecimal(payload.get("totalTargetAmount")));
        metricConfig.put("scoreCap", toDecimal(payload.get("scoreCap"), BigDecimal.valueOf(120)));
        metricConfig.put("categoryCodes", normalizeStringList(payload.get("categoryCodes")));
        metricConfig.put("categoryDefinitions", categoryDefinitions);
        metricConfig.put("metrics", metrics);
        metricConfig.put("assignmentMeta", new LinkedHashMap<>());

        String objectiveNo = text(payload.get("objectiveNo"));
        if (!StringUtils.hasText(objectiveNo)) {
            objectiveNo = "HRPF" + System.currentTimeMillis();
        }

        Long objectiveId = insertAndReturnId(
                "INSERT INTO hr_performance_objective (tenant_id, objective_no, cycle_name, cycle_start_date, cycle_end_date, objective_name, owner_employee_id, metric_config, status, create_by, update_by, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                TENANT_ID,
                objectiveNo,
                requireText(payload.get("cycleName"), "cycleName"),
                toSqlDate(requireText(payload.get("cycleStartDate"), "cycleStartDate")),
                toSqlDate(requireText(payload.get("cycleEndDate"), "cycleEndDate")),
                requireText(payload.get("objectiveName"), "objectiveName"),
                resolveOwnerEmployeeId(departmentAssignments),
                writeJson(metricConfig),
                "DRAFT",
                "admin",
                "admin"
        );

        Map<String, Object> assignmentMeta = new LinkedHashMap<>();
        for (Map<String, Object> dept : departmentAssignments) {
            Long deptId = toLong(dept.get("deptId"));
            if (deptId == null) {
                continue;
            }
            BigDecimal deptTargetAmount = toDecimal(dept.get("targetAmount"));
            Long deptAssignmentId = insertAndReturnId(
                    "INSERT INTO hr_performance_assignment (tenant_id, objective_id, parent_id, assignee_type, assignee_id, assignee_name, target_value, actual_value, weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    TENANT_ID,
                    objectiveId,
                    null,
                    "DEPT",
                    deptId,
                    text(dept.get("deptName")),
                    deptTargetAmount,
                    BigDecimal.ZERO,
                    BigDecimal.valueOf(100),
                    "ACTIVE"
            );
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
                Long categoryAssignmentId = insertAndReturnId(
                        "INSERT INTO hr_performance_assignment (tenant_id, objective_id, parent_id, assignee_type, assignee_id, assignee_name, target_value, actual_value, weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        TENANT_ID,
                        objectiveId,
                        deptAssignmentId,
                        "DEPT",
                        deptId,
                        text(dept.get("deptName")),
                        targetAmount,
                        BigDecimal.ZERO,
                        weight,
                        "ACTIVE"
                );
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
        jdbcTemplate.update(
                "UPDATE hr_performance_objective SET metric_config = ?, update_time = NOW() WHERE id = ? AND tenant_id = ?",
                writeJson(metricConfig), objectiveId, TENANT_ID
        );
        return objectiveId;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void saveAssignmentChildren(Long parentId, Map<String, Object> payload) {
        Map<String, Object> parent = getAssignment(parentId);
        if (parent.isEmpty()) {
            throw new IllegalArgumentException("绩效分解节点不存在");
        }
        Long objectiveId = toLong(parent.get("objectiveId"));
        List<Map<String, Object>> children = asMapList(payload.get("children"));
        Map<String, Object> objective = loadObjective(objectiveId);
        Map<String, Object> metricConfig = parseJsonObject(objective.get("metricConfig"));
        Map<String, Object> assignmentMeta = mutableMap(parseJsonObject(metricConfig.get("assignmentMeta")));

        List<Map<String, Object>> existed = jdbcTemplate.queryForList(
                "SELECT * FROM hr_performance_assignment WHERE tenant_id = ? AND parent_id = ? ORDER BY id ASC",
                TENANT_ID, parentId
        );
        if (!existed.isEmpty()) {
            List<Long> existingIds = existed.stream().map(item -> toLong(item.get("id"))).filter(Objects::nonNull).toList();
            jdbcTemplate.update(
                    "DELETE FROM hr_performance_result WHERE tenant_id = ? AND assignment_id IN (" +
                            existingIds.stream().map(id -> "?").collect(Collectors.joining(",")) + ")",
                    appendArgs(List.of(TENANT_ID), existingIds.toArray())
            );
            jdbcTemplate.update(
                    "DELETE FROM hr_performance_assignment WHERE tenant_id = ? AND parent_id = ?",
                    TENANT_ID, parentId
            );
            existingIds.forEach(id -> assignmentMeta.remove(String.valueOf(id)));
        }

        Long objectiveOwner = toLong(objective.get("ownerEmployeeId"));
        String parentAssigneeType = text(parent.get("assigneeType")).toUpperCase(Locale.ROOT);
        Long parentAssigneeId = toLong(parent.get("assigneeId"));
        String parentAssigneeName = text(parent.get("assigneeName"));
        for (Map<String, Object> child : children) {
            String assigneeType = defaultText(child.get("assigneeType"), "EMPLOYEE").toUpperCase(Locale.ROOT);
            Long assigneeId = "DEPT".equals(assigneeType) ? parentAssigneeId : toLong(child.get("assigneeId"));
            String assigneeName = "DEPT".equals(assigneeType) ? parentAssigneeName : text(child.get("assigneeName"));
            BigDecimal targetAmount = toDecimal(child.get("targetAmount"));
            BigDecimal weight = toDecimal(firstNonNull(child.get("metricWeight"), child.get("weight")), BigDecimal.valueOf(100));

            Long childId = insertAndReturnId(
                    "INSERT INTO hr_performance_assignment (tenant_id, objective_id, parent_id, assignee_type, assignee_id, assignee_name, target_value, actual_value, weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    TENANT_ID,
                    objectiveId,
                    parentId,
                    assigneeType,
                    assigneeId,
                    assigneeName,
                    targetAmount,
                    BigDecimal.ZERO,
                    weight,
                    "ACTIVE"
            );

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
        jdbcTemplate.update(
                "UPDATE hr_performance_objective SET metric_config = ?, update_time = NOW() WHERE id = ? AND tenant_id = ?",
                writeJson(metricConfig), objectiveId, TENANT_ID
        );
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateResult(Map<String, Object> payload) {
        Long assignmentId = toLong(payload.get("assignmentId"));
        BigDecimal actualAmount = toDecimal(payload.get("actualAmount"));
        Map<String, Object> assignment = getAssignment(assignmentId);
        if (assignment.isEmpty()) {
            throw new IllegalArgumentException("绩效分解节点不存在");
        }
        jdbcTemplate.update(
                "UPDATE hr_performance_assignment SET actual_value = ?, update_time = NOW() WHERE id = ? AND tenant_id = ?",
                actualAmount, assignmentId, TENANT_ID
        );

        Long objectiveId = toLong(assignment.get("objectiveId"));
        Map<String, Object> objective = loadObjective(objectiveId);
        Map<String, Object> metricConfig = parseJsonObject(objective.get("metricConfig"));
        Map<String, Object> assignmentMeta = mutableMap(parseJsonObject(metricConfig.get("assignmentMeta")));
        Map<String, Object> meta = mutableMap(parseJsonObject(assignmentMeta.get(String.valueOf(assignmentId))));
        meta.put("actualAmount", actualAmount);
        assignmentMeta.put(String.valueOf(assignmentId), meta);
        metricConfig.put("assignmentMeta", assignmentMeta);
        jdbcTemplate.update(
                "UPDATE hr_performance_objective SET metric_config = ?, update_time = NOW() WHERE id = ? AND tenant_id = ?",
                writeJson(metricConfig), objectiveId, TENANT_ID
        );
    }

    @Override
    public void submitPlan(Long objectiveId) {
        jdbcTemplate.update(
                "UPDATE hr_performance_objective SET status = 'PLAN_APPROVING', update_time = NOW() WHERE id = ? AND tenant_id = ?",
                objectiveId, TENANT_ID
        );
    }

    @Override
    public void submitResult(Long objectiveId) {
        jdbcTemplate.update(
                "UPDATE hr_performance_objective SET status = 'RESULT_APPROVING', update_time = NOW() WHERE id = ? AND tenant_id = ?",
                objectiveId, TENANT_ID
        );
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createSalaryAdjustment(Long objectiveId, Map<String, Object> payload) {
        Long employeeId = toLong(payload.get("employeeId"));
        if (employeeId == null) {
            throw new IllegalArgumentException("employeeId不能为空");
        }
        BigDecimal afterTotal = toDecimal(payload.get("afterTotal"));
        BigDecimal beforeTotal = queryEmployeeSalary(employeeId);
        BigDecimal adjustmentAmount = afterTotal.subtract(beforeTotal);
        String reason = defaultText(payload.get("adjustmentReason"), "绩效结果调薪");
        Date effectiveDate = toSqlDate(defaultText(payload.get("effectiveDate"), LocalDate.now().toString()));

        Long compChangeId = insertAndReturnId(
                "INSERT INTO hr_comp_change (tenant_id, change_no, employee_id, change_type, before_total, after_total, change_amount, effective_date, reason, status, create_by, update_by, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                TENANT_ID,
                "HRCG" + System.currentTimeMillis(),
                employeeId,
                "PERFORMANCE",
                beforeTotal,
                afterTotal,
                adjustmentAmount,
                effectiveDate,
                reason,
                "DRAFT",
                "admin",
                "admin"
        );

        return insertAndReturnId(
                "INSERT INTO hr_performance_salary_adjustment (tenant_id, objective_id, employee_id, comp_change_id, adjustment_amount, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                TENANT_ID,
                objectiveId,
                employeeId,
                compChangeId,
                adjustmentAmount,
                reason,
                "DRAFT"
        );
    }

    private Map<String, Object> normalizeObjectiveRow(Map<String, Object> row) {
        Map<String, Object> result = isDbSnakeCaseRow(row) ? toCamelRow(row) : new LinkedHashMap<>(row);
        Map<String, Object> metricConfig = parseJsonObject(result.get("metricConfig"));
        result.put("totalTargetAmount", toDecimal(metricConfig.get("totalTargetAmount")));
        result.put("scoreCap", toDecimal(metricConfig.get("scoreCap"), BigDecimal.valueOf(120)));
        result.put("categoryCodes", normalizeStringList(metricConfig.get("categoryCodes")));
        result.put("categoryDefinitions", asMapList(metricConfig.get("categoryDefinitions")));
        result.put("metrics", normalizeMetrics(asMapList(metricConfig.get("metrics"))));
        result.put("status", normalizeObjectiveStatus(text(result.get("status"))));

        List<Map<String, Object>> assignments = jdbcTemplate.queryForList(
                "SELECT * FROM hr_performance_assignment WHERE tenant_id = ? AND objective_id = ?",
                TENANT_ID, toLong(result.get("id"))
        );
        Map<String, Object> assignmentMeta = parseJsonObject(metricConfig.get("assignmentMeta"));
        List<Map<String, Object>> results = jdbcTemplate.queryForList(
                "SELECT * FROM hr_performance_result WHERE tenant_id = ? AND objective_id = ?",
                TENANT_ID, toLong(result.get("id"))
        );
        List<Map<String, Object>> tree = buildAssignmentTree(assignments, results, assignmentMeta);
        result.put("assignments", tree);
        result.put("leafTaskCount", countLeafTasks(tree));
        result.put("completionRate", completionRateOfTree(tree));
        result.put("actualAmount", actualAmountOfTree(tree));
        result.putAll(summarizeObjectiveScore(tree, results));
        return result;
    }

    private boolean isDbSnakeCaseRow(Map<String, Object> row) {
        return row.containsKey("objective_no")
                || row.containsKey("cycle_name")
                || row.containsKey("metric_config")
                || row.containsKey("create_time");
    }

    private List<Map<String, Object>> buildAssignmentTree(List<Map<String, Object>> rows,
                                                          List<Map<String, Object>> results,
                                                          Map<String, Object> assignmentMeta) {
        Map<Long, Map<String, Object>> resultByAssignment = results.stream()
                .map(this::toCamelRow)
                .collect(Collectors.toMap(
                        item -> toLong(item.get("assignmentId")),
                        item -> item,
                        (left, right) -> right,
                        LinkedHashMap::new
                ));
        Map<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> row : rows.stream().sorted(Comparator.comparing(item -> toLong(item.get("id")))).toList()) {
            Map<String, Object> node = toCamelRow(row);
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
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT * FROM hr_performance_objective WHERE tenant_id = ? AND id = ? AND deleted = 0",
                TENANT_ID, id
        );
        return rows.isEmpty() ? Map.of() : toCamelRow(rows.get(0));
    }

    private Map<String, Object> getAssignment(Long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT * FROM hr_performance_assignment WHERE tenant_id = ? AND id = ?",
                TENANT_ID, id
        );
        return rows.isEmpty() ? Map.of() : toCamelRow(rows.get(0));
    }

    private BigDecimal queryEmployeeSalary(Long employeeId) {
        List<BigDecimal> rows = jdbcTemplate.queryForList(
                "SELECT total_salary FROM hr_employee_comp WHERE tenant_id = ? AND employee_id = ? AND deleted = 0 ORDER BY effective_date DESC, id DESC LIMIT 1",
                BigDecimal.class,
                TENANT_ID, employeeId
        );
        return rows.isEmpty() ? BigDecimal.ZERO : rows.get(0);
    }

    private Long insertAndReturnId(String sql, Object... values) {
        return jdbcTemplate.execute((org.springframework.jdbc.core.ConnectionCallback<Long>) connection -> {
            PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < values.length; i++) {
                Object value = values[i];
                if (value == null) {
                    statement.setNull(i + 1, Types.NULL);
                } else {
                    statement.setObject(i + 1, value);
                }
            }
            statement.executeUpdate();
            try (var rs = statement.getGeneratedKeys()) {
                if (rs.next()) {
                    return rs.getLong(1);
                }
            }
            return null;
        });
    }

    private Object[] appendArgs(List<Object> args, Object... extra) {
        List<Object> values = new ArrayList<>(args);
        values.addAll(List.of(extra));
        return values.toArray();
    }

    private Map<String, Object> toCamelRow(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            result.put(toCamel(entry.getKey()), entry.getValue());
        }
        return result;
    }

    private String toCamel(String key) {
        StringBuilder builder = new StringBuilder();
        boolean upperNext = false;
        for (char ch : key.toCharArray()) {
            if (ch == '_') {
                upperNext = true;
                continue;
            }
            builder.append(upperNext ? Character.toUpperCase(ch) : Character.toLowerCase(ch));
            upperNext = false;
        }
        return builder.toString();
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

    private Date toSqlDate(String value) {
        return Date.valueOf(LocalDate.parse(value));
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
