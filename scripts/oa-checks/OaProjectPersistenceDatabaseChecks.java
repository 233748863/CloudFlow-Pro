package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.oa.domain.OaActivityCost;
import com.cloudflow.oa.domain.OaActivityType;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectDependency;
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.domain.OaTimesheet;
import com.cloudflow.oa.domain.OaTimesheetDetail;
import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.oa.mapper.OaProjectMapper;
import com.cloudflow.oa.mapper.OaTimesheetMapper;
import com.cloudflow.oa.service.remote.RemoteBusinessRuleService;
import com.cloudflow.oa.service.remote.RemoteBusinessRuleFallbackFactory;
import com.cloudflow.common.core.domain.R;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class OaProjectPersistenceDatabaseChecks {
    private static int assertions;
    private static final List<Map<String, Object>> outcomes = new ArrayList<>();

    private OaProjectPersistenceDatabaseChecks() { }

    @FunctionalInterface
    private interface Scenario {
        void run(OaOperationsDatabaseChecks fixture) throws Exception;
    }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2) throw new IllegalArgumentException("An isolated JDBC URL and result path are required");
        StpLogic previous = StpUtil.getStpLogic();
        try {
            OaOperationsChecks.identity(100000L, 1L);
            OaOperationsDatabaseChecks fixture = new OaOperationsDatabaseChecks(arguments[0], false);
            scenario(fixture, "task-removal-and-empty-group", OaProjectPersistenceDatabaseChecks::taskRemoval);
            scenario(fixture, "dependency-removal", OaProjectPersistenceDatabaseChecks::dependencyRemoval);
            scenario(fixture, "dependency-rule-record-failure-rejects-save", OaProjectPersistenceDatabaseChecks::dependencyRecordFailure);
            scenario(fixture, "client-tree-fields-and-subtree", OaProjectPersistenceDatabaseChecks::clientTreeFields);
            scenario(fixture, "move-to-root-with-opening-hours", OaProjectPersistenceDatabaseChecks::rootMovement);
            scenario(fixture, "stale-tree-rejection", OaProjectPersistenceDatabaseChecks::staleTree);
            scenario(fixture, "duplicate-and-incomplete-tree-rejection", OaProjectPersistenceDatabaseChecks::treeCompleteness);
            scenario(fixture, "five-level-boundary-and-cycle", OaProjectPersistenceDatabaseChecks::depthAndCycle);
            scenario(fixture, "draft-timesheet-removal-and-detail-release", OaProjectPersistenceDatabaseChecks::draftRemoval);
            scenario(fixture, "unchanged-recalculation-preserves-versions", OaProjectPersistenceDatabaseChecks::unchangedRecalculation);
            scenario(fixture, "full-reversal-clears-margin-rate", OaProjectPersistenceDatabaseChecks::fullReversal);
            scenario(fixture, "all-project-recalculation-failure-and-recovery", OaProjectPersistenceDatabaseChecks::recalculationRecovery);
            scenario(fixture, "cost-audit-snapshots-and-rollback", (OaOperationsDatabaseChecks current) ->
                    OaProjectAuditDatabaseChecks.costSnapshotsAndRollback(current, OaProjectPersistenceDatabaseChecks::require));
            scenario(fixture, "timesheet-audit-snapshots-rollback-and-replay", (OaOperationsDatabaseChecks current) ->
                    OaProjectAuditDatabaseChecks.timesheetSnapshotsAndRollback(current, OaProjectPersistenceDatabaseChecks::require));
            scenario(fixture, "requested-recalculation-audit-and-rollback", (OaOperationsDatabaseChecks current) ->
                    OaProjectAuditDatabaseChecks.requestedRecalculationAudit(current, OaProjectPersistenceDatabaseChecks::require));
            boolean passed = outcomes.stream().allMatch(value -> Boolean.TRUE.equals(value.get("passed")));
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("passed", passed);
            result.put("assertions", assertions);
            result.put("scenarios", outcomes);
            result.put("actualDatabase", true);
            result.put("productionTenantPlugins", true);
            result.put("clientMessageDeserialization", true);
            result.put("actualApplicationHttp", false);
            result.put("actualWorkflowExecution", false);
            result.put("allF3AcceptanceComplete", false);
            Files.writeString(Path.of(arguments[1]), fixture.json.writerWithDefaultPrettyPrinter().writeValueAsString(result));
            System.out.println("F3_PROJECT_DATABASE: passed=" + passed + "; assertions=" + assertions + "; scenarios=" + outcomes.size());
            if (!passed) throw new AssertionError("Project persistence cases failed; retain original per-case evidence");
        } finally {
            StpUtil.setStpLogic(previous);
            OaOperationsChecks.identity(100000L, 1L);
        }
    }

    private static void scenario(OaOperationsDatabaseChecks fixture, String name, Scenario operation) {
        Map<String, Object> outcome = new LinkedHashMap<>();
        outcome.put("name", name);
        try {
            OaOperationsChecks.identity(100000L, 1L);
            operation.run(fixture);
            outcome.put("passed", true);
            System.out.println("F3_CASE: " + name + "; passed=true");
        } catch (Throwable failure) {
            outcome.put("passed", false);
            outcome.put("failureType", failure.getClass().getName());
            outcome.put("failure", failure.getMessage());
            System.out.println("F3_CASE: " + name + "; passed=false; type=" + failure.getClass().getSimpleName());
        }
        outcomes.add(outcome);
    }

    private static void require(boolean condition, String description) {
        assertions++;
        if (!condition) throw new AssertionError(description);
    }

    private static OaProject project(OaOperationsDatabaseChecks fixture, String suffix) {
        return OaProjectContractDatabaseChecks.project(fixture, suffix, OaRecordSupport.require(
                com.cloudflow.common.core.context.UserContext.getUserId(), "Test user is required"));
    }

    private static OaProjectTask task(OaOperationsDatabaseChecks fixture, OaProject project,
                                      String subject, Long parentId, boolean group) {
        OaProjectTask task = new OaProjectTask();
        task.setProjectId(project.getProjectId());
        task.setSubject(subject);
        task.setParentTaskId(parentId);
        task.setIsGroupFlag(group ? 1 : 0);
        task.setTaskWeight(BigDecimal.ONE);
        task.setPlannedStart(LocalDate.now().atStartOfDay());
        task.setPlannedEnd(LocalDate.now().plusDays(5).atStartOfDay());
        OaProjectTaskService service = fixture.bean(OaProjectTaskService.class);
        return service.detail(service.saveTask(task));
    }

    private static List<Map<String, Object>> clientTree(OaOperationsDatabaseChecks fixture, Long projectId) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (OaProjectTask task : fixture.bean(OaProjectTaskService.class).list(projectId)) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("taskId", task.getTaskId());
            node.put("parentTaskId", task.getParentTaskId());
            node.put("sortNo", task.getSortNo());
            node.put("version", task.getVersion());
            result.add(node);
        }
        return result;
    }

    private static Map<String, Object> node(List<Map<String, Object>> tree, Long taskId) {
        return tree.stream().filter(value -> Objects.equals(taskId, value.get("taskId"))).findFirst().orElseThrow();
    }

    private static void submitTree(OaOperationsDatabaseChecks fixture, Long projectId,
                                   List<Map<String, Object>> tree) throws Exception {
        List<ProjectWbsTreeNodeDTO> decoded = fixture.json.copy()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .readValue(fixture.json.writeValueAsString(tree), new TypeReference<List<ProjectWbsTreeNodeDTO>>() { });
        fixture.bean(OaProjectTaskService.class).updateTree(projectId, decoded);
    }

    private static String snapshot(OaOperationsDatabaseChecks fixture, Long projectId) throws Exception {
        return fixture.json.writeValueAsString(fixture.jdbc.queryForList(
                "SELECT task_id,parent_task_id,sort_no,version,subject,level_path,opening_actual_hours,actual_hours "
                        + "FROM oa_project_task WHERE tenant_id=100000 AND project_id=? ORDER BY task_id", projectId));
    }

    private static void rejectedTree(OaOperationsDatabaseChecks fixture, Long projectId,
                                     List<Map<String, Object>> tree, String description) throws Exception {
        String before = snapshot(fixture, projectId);
        boolean rejected = false;
        try {
            submitTree(fixture, projectId, tree);
        } catch (RuntimeException exception) {
            rejected = true;
        }
        require(rejected, description);
        require(before.equals(snapshot(fixture, projectId)), "Rejected tree command must leave every stored task unchanged");
    }

    private static void taskRemoval(OaOperationsDatabaseChecks fixture) {
        OaProject project = project(fixture, "-remove-task");
        OaProjectTask parent = task(fixture, project, "保留空分组", null, true);
        OaProjectTask leaf = task(fixture, project, "删除未引用任务", parent.getTaskId(), false);
        OaProjectTaskService service = fixture.bean(OaProjectTaskService.class);
        service.removeTasks(List.of(leaf.getTaskId()));
        require(fixture.count("SELECT deleted FROM oa_project_task WHERE tenant_id=100000 AND task_id=?", leaf.getTaskId()) == 1,
                "Deleting an unused task must persist deleted=1");
        require(service.list(project.getProjectId()).stream().noneMatch(value -> value.getTaskId().equals(leaf.getTaskId())),
                "Deleted task must disappear from the actual project list");
        OaProjectTask empty = service.detail(parent.getTaskId());
        require(empty.getProgress().signum() == 0 && empty.getActualHours().signum() == 0,
                "Former parent must refresh its empty-group progress and hours");
    }

    private static void dependencyRemoval(OaOperationsDatabaseChecks fixture) {
        OaProject project = project(fixture, "-remove-edge");
        OaProjectTask predecessor = task(fixture, project, "前置任务", null, false);
        OaProjectTask successor = task(fixture, project, "后置任务", null, false);
        OaProjectDependency edge = new OaProjectDependency();
        edge.setProjectId(project.getProjectId());
        edge.setPredecessorTaskId(predecessor.getTaskId());
        edge.setSuccessorTaskId(successor.getTaskId());
        OaProjectTaskService service = fixture.bean(OaProjectTaskService.class);
        Long edgeId = service.saveDependency(edge);
        service.removeDependencies(List.of(edgeId));
        require(fixture.count("SELECT deleted FROM oa_project_dependency WHERE tenant_id=100000 AND dependency_id=?", edgeId) == 1,
                "Removing a dependency must persist deleted=1");
        require(service.dependencies(project.getProjectId()).isEmpty(), "Removed dependency must not remain active");
        service.removeTasks(List.of(predecessor.getTaskId()));
        require(fixture.count("SELECT deleted FROM oa_project_task WHERE task_id=?", predecessor.getTaskId()) == 1,
                "A removed dependency must no longer prevent deletion of its otherwise unused task");
    }

    private static void dependencyRecordFailure(OaOperationsDatabaseChecks fixture) throws Exception {
        OaProject project = project(fixture, "-rule-record-failure");
        OaProjectTask predecessor = task(fixture, project, "未完成前置任务", null, false);
        OaProjectTask successor = task(fixture, project, "拒绝无记录的开始操作", null, false);
        OaProjectTaskService originalTasks = fixture.bean(OaProjectTaskService.class);
        OaBusinessRuleService originalRules = fixture.bean(OaBusinessRuleService.class);
        RemoteBusinessRuleService originalClient = fixture.bean(RemoteBusinessRuleService.class);
        OaProjectDependency edge = new OaProjectDependency();
        edge.setProjectId(project.getProjectId());
        edge.setPredecessorTaskId(predecessor.getTaskId());
        edge.setSuccessorTaskId(successor.getTaskId());
        originalTasks.saveDependency(edge);
        String before = fixture.json.writeValueAsString(fixture.jdbc.queryForList(
                "SELECT * FROM oa_project_task WHERE tenant_id=100000 AND project_id=? ORDER BY task_id", project.getProjectId()));
        String projectBefore = fixture.json.writeValueAsString(fixture.jdbc.queryForList(
                "SELECT * FROM oa_project WHERE tenant_id=100000 AND project_id=?", project.getProjectId()));
        RemoteBusinessRuleService fallback = new RemoteBusinessRuleFallbackFactory().create(new IllegalStateException("受控规则记录故障"));
        fixture.beans.put(RemoteBusinessRuleService.class, new RemoteBusinessRuleService() {
            @Override
            public R<BusinessRuleDTO> getEffectiveRule(String ruleCode) {
                return originalClient.getEffectiveRule(ruleCode);
            }

            @Override
            public R<Void> recordHit(BusinessRuleHitRecordDTO record) {
                return fallback.recordHit(record);
            }

            @Override
            public R<BusinessRuleDTO> getEffectiveProjectRule(String ruleCode) {
                return originalClient.getEffectiveProjectRule(ruleCode);
            }

            @Override
            public R<Void> recordProjectHit(BusinessRuleHitRecordDTO record) {
                return fallback.recordProjectHit(record);
            }
        });
        try {
            fixture.register(OaBusinessRuleService.class);
            OaProjectTaskService guardedTasks = fixture.register(OaProjectTaskService.class);
            successor = guardedTasks.detail(successor.getTaskId());
            successor.setStatus("IN_PROGRESS");
            successor.setProgress(BigDecimal.valueOf(25));
            boolean rejected = false;
            try {
                guardedTasks.saveTask(successor);
            } catch (IllegalStateException failure) {
                rejected = "业务规则命中记录保存失败，操作未放行".equals(failure.getMessage());
            }
            require(rejected, "规则记录失败必须向业务返回失败");
            require(before.equals(fixture.json.writeValueAsString(fixture.jdbc.queryForList(
                    "SELECT * FROM oa_project_task WHERE tenant_id=100000 AND project_id=? ORDER BY task_id", project.getProjectId()))),
                    "规则记录失败后所有任务状态、日期、进度及版本保持");
            require(projectBefore.equals(fixture.json.writeValueAsString(fixture.jdbc.queryForList(
                    "SELECT * FROM oa_project WHERE tenant_id=100000 AND project_id=?", project.getProjectId()))),
                    "规则记录失败后项目进度及状态保持");
        } finally {
            fixture.beans.put(RemoteBusinessRuleService.class, originalClient);
            fixture.beans.put(OaBusinessRuleService.class, originalRules);
            fixture.beans.put(OaProjectTaskService.class, originalTasks);
        }
    }

    private static void clientTreeFields(OaOperationsDatabaseChecks fixture) throws Exception {
        OaProject project = project(fixture, "-client-tree");
        OaProjectTask first = task(fixture, project, "原分组", null, true);
        OaProjectTask second = task(fixture, project, "目标分组", null, true);
        OaProjectTask branch = task(fixture, project, "移动分组", first.getTaskId(), true);
        OaProjectTask leaf = task(fixture, project, "随组移动任务", branch.getTaskId(), false);
        List<Map<String, Object>> tree = clientTree(fixture, project.getProjectId());
        node(tree, branch.getTaskId()).put("parentTaskId", second.getTaskId());
        node(tree, branch.getTaskId()).put("sortNo", 17);
        submitTree(fixture, project.getProjectId(), tree);
        OaProjectTaskService service = fixture.bean(OaProjectTaskService.class);
        OaProjectTask moved = service.detail(branch.getTaskId());
        require(Objects.equals(moved.getParentTaskId(), second.getTaskId()) && Integer.valueOf(17).equals(moved.getSortNo()),
                "Actual client parentTaskId and sortNo fields must survive request deserialization and database persistence");
        require(service.detail(leaf.getTaskId()).getLevelPath().equals("/" + second.getTaskId() + "/" + branch.getTaskId() + "/" + leaf.getTaskId() + "/"),
                "Moving a group must retain its descendants and update their full paths");
    }

    private static void rootMovement(OaOperationsDatabaseChecks fixture) throws Exception {
        OaProject project = project(fixture, "-move-root");
        OaProjectTask root = task(fixture, project, "原主分组", null, true);
        OaProjectTask child = task(fixture, project, "保持所属分组", root.getTaskId(), true);
        OaProjectTask leaf = task(fixture, project, "移到根节点", child.getTaskId(), false);
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=1.25 WHERE task_id=?", root.getTaskId());
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=3.50 WHERE task_id=?", leaf.getTaskId());
        OaProjectAccountingService accounting = fixture.bean(OaProjectAccountingService.class);
        accounting.recalculate(project.getProjectId());
        List<Map<String, Object>> tree = clientTree(fixture, project.getProjectId());
        node(tree, leaf.getTaskId()).put("parentTaskId", null);
        submitTree(fixture, project.getProjectId(), tree);
        OaProjectTaskService service = fixture.bean(OaProjectTaskService.class);
        require(service.detail(leaf.getTaskId()).getParentTaskId() == null, "Moving to root must clear the stored parent");
        require(Objects.equals(service.detail(child.getTaskId()).getParentTaskId(), root.getTaskId()),
                "Moving one task to root must keep the unrelated hierarchy intact");
        accounting.recalculate(project.getProjectId());
        require(fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getActualHours().compareTo(new BigDecimal("4.75")) == 0,
                "Reparenting must preserve each task's independent opening hours exactly once");
    }

    private static void staleTree(OaOperationsDatabaseChecks fixture) throws Exception {
        OaProject project = project(fixture, "-stale-tree");
        OaProjectTask root = task(fixture, project, "版本分组", null, true);
        OaProjectTask leaf = task(fixture, project, "旧页面任务", root.getTaskId(), false);
        List<Map<String, Object>> stale = clientTree(fixture, project.getProjectId());
        OaProjectTaskService service = fixture.bean(OaProjectTaskService.class);
        OaProjectTask edited = service.detail(leaf.getTaskId());
        edited.setSubject("其他操作者已保存");
        service.saveTask(edited);
        node(stale, leaf.getTaskId()).put("parentTaskId", null);
        rejectedTree(fixture, project.getProjectId(), stale, "An outdated browser tree must be rejected after another saved task change");
    }

    private static void treeCompleteness(OaOperationsDatabaseChecks fixture) throws Exception {
        OaProject project = project(fixture, "-complete-tree");
        task(fixture, project, "第一任务", null, false);
        task(fixture, project, "第二任务", null, false);
        List<Map<String, Object>> duplicate = clientTree(fixture, project.getProjectId());
        duplicate.add(new LinkedHashMap<>(duplicate.get(0)));
        rejectedTree(fixture, project.getProjectId(), duplicate, "A duplicate task identifier in the submitted tree must be rejected");
        List<Map<String, Object>> incomplete = clientTree(fixture, project.getProjectId());
        incomplete.remove(0);
        rejectedTree(fixture, project.getProjectId(), incomplete, "An incomplete browser snapshot must be rejected instead of overwriting a changed tree");
    }

    private static void depthAndCycle(OaOperationsDatabaseChecks fixture) throws Exception {
        OaProject project = project(fixture, "-depth");
        List<OaProjectTask> chain = new ArrayList<>();
        Long parentId = null;
        for (int depth = 1; depth <= 5; depth++) {
            OaProjectTask member = task(fixture, project, "第" + depth + "层分组", parentId, true);
            chain.add(member);
            parentId = member.getTaskId();
        }
        boolean rejected = false;
        try {
            task(fixture, project, "第六层", parentId, false);
        } catch (RuntimeException exception) {
            rejected = true;
        }
        require(rejected && fixture.bean(OaProjectTaskService.class).list(project.getProjectId()).size() == 5,
                "The sixth level must fail and roll back its actual task insertion");
        List<ProjectWbsTreeNodeDTO> cyclic = new ArrayList<>();
        for (OaProjectTask task : fixture.bean(OaProjectTaskService.class).list(project.getProjectId())) {
            Map<String, Object> legacy = new LinkedHashMap<>();
            legacy.put("taskId", task.getTaskId());
            legacy.put("parentId", task.getTaskId().equals(chain.get(0).getTaskId()) ? chain.get(4).getTaskId() : task.getParentTaskId());
            legacy.put("sortOrder", task.getSortNo());
            legacy.put("version", task.getVersion());
            cyclic.add(fixture.json.copy().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                    .convertValue(legacy, ProjectWbsTreeNodeDTO.class));
        }
        String before = snapshot(fixture, project.getProjectId());
        rejected = false;
        try {
            fixture.bean(OaProjectTaskService.class).updateTree(project.getProjectId(), cyclic);
        } catch (RuntimeException exception) {
            rejected = true;
        }
        require(rejected && before.equals(snapshot(fixture, project.getProjectId())),
                "A real task cycle must be rejected with the entire original tree unchanged");
    }

    private static void draftRemoval(OaOperationsDatabaseChecks fixture) {
        Long employeeUser = fixture.jdbc.queryForObject(
                "SELECT employee.user_id FROM hr_employee employee JOIN sys_user account ON account.user_id=employee.user_id "
                        + "AND account.tenant_id=employee.tenant_id WHERE employee.tenant_id=100000 AND employee.deleted=0 "
                        + "AND employee.employee_status NOT IN ('RESIGNED','TERMINATED') AND account.deleted=0 AND account.status='0' "
                        + "AND NOT EXISTS (SELECT 1 FROM oa_timesheet sheet WHERE sheet.tenant_id=employee.tenant_id "
                        + "AND sheet.employee_id=employee.id AND sheet.deleted=0) GROUP BY employee.user_id "
                        + "HAVING COUNT(*)=1 ORDER BY employee.user_id LIMIT 1", Long.class);
        OaOperationsChecks.identity(100000L, Objects.requireNonNull(employeeUser));
        OaProject project = project(fixture, "-draft-hours");
        OaProjectTask task = task(fixture, project, "草稿工时任务", null, false);
        OaActivityCatalogService catalog = fixture.bean(OaActivityCatalogService.class);
        OaActivityType activity = new OaActivityType();
        activity.setTypeCode(fixture.marker + "-draft");
        activity.setTypeName("待删除草稿活动");
        activity.setBillableDefaultFlag(1);
        Long activityId = catalog.saveType(activity);
        OaActivityCost cost = new OaActivityCost();
        cost.setActivityTypeId(activityId);
        cost.setCostingRate(new BigDecimal("1.23"));
        cost.setBillingRate(new BigDecimal("4.56"));
        cost.setEffectiveStart(LocalDate.now().minusDays(10));
        catalog.saveCost(cost);
        OaTimesheetDetail detail = new OaTimesheetDetail();
        detail.setProjectId(project.getProjectId());
        detail.setTaskId(task.getTaskId());
        detail.setActivityTypeId(activityId);
        detail.setWorkDate(LocalDate.now());
        detail.setHours(new BigDecimal("2.00"));
        detail.setBillableFlag(1);
        detail.setDescription("删除未提交的测试工时草稿");
        OaTimesheetService service = fixture.bean(OaTimesheetService.class);
        Long sheetId = OaProjectContractDatabaseChecks.saveSheet(service, detail);
        service.remove(sheetId);
        require(fixture.count("SELECT deleted FROM oa_timesheet WHERE timesheet_id=?", sheetId) == 1,
                "Removing a draft timesheet must persist deleted=1");
        require(fixture.count("SELECT COUNT(*) FROM oa_timesheet_detail WHERE timesheet_id=? AND deleted=0", sheetId) == 0,
                "Deleted draft details must release their active task references");
        fixture.bean(OaProjectTaskService.class).removeTasks(List.of(task.getTaskId()));
        require(fixture.count("SELECT deleted FROM oa_project_task WHERE task_id=?", task.getTaskId()) == 1,
                "A deleted draft must no longer prevent removing the otherwise unused task");
    }

    private static void unchangedRecalculation(OaOperationsDatabaseChecks fixture) throws Exception {
        OaProject project = project(fixture, "-stable-versions");
        OaProjectTask group = task(fixture, project, "保持版本分组", null, true);
        OaProjectTask leaf = task(fixture, project, "保持版本任务", group.getTaskId(), false);
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=1.25 WHERE task_id=?", leaf.getTaskId());
        OaProjectAccountingService accounting = fixture.bean(OaProjectAccountingService.class);
        accounting.recalculate(project.getProjectId());
        String projectBefore = fixture.json.writeValueAsString(fixture.jdbc.queryForMap(
                "SELECT * FROM oa_project WHERE tenant_id=100000 AND project_id=?", project.getProjectId()));
        String tasksBefore = snapshot(fixture, project.getProjectId());
        accounting.recalculate(project.getProjectId());
        accounting.recalculate(project.getProjectId());
        require(projectBefore.equals(fixture.json.writeValueAsString(fixture.jdbc.queryForMap(
                "SELECT * FROM oa_project WHERE tenant_id=100000 AND project_id=?", project.getProjectId()))),
                "Recalculating unchanged financial facts must preserve the project's data and edit version");
        require(tasksBefore.equals(snapshot(fixture, project.getProjectId())),
                "Recalculating unchanged hours must preserve every task and browser edit version");
    }

    private static void recalculationRecovery(OaOperationsDatabaseChecks fixture) throws Exception {
        OaProject failedProject = project(fixture, "-recalculate-failure");
        OaProjectTask firstTask = task(fixture, failedProject, "故障项目第一项", null, false);
        OaProjectTask secondTask = task(fixture, failedProject, "故障项目第二项", null, false);
        OaProject followingProject = project(fixture, "-recalculate-following");
        OaProjectTask followingTask = task(fixture, followingProject, "失败后仍需处理的项目任务", null, false);
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=99999999.99 WHERE task_id IN (?,?)",
                firstTask.getTaskId(), secondTask.getTaskId());
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=1.25 WHERE task_id=?", followingTask.getTaskId());
        String failedBefore = fixture.json.writeValueAsString(fixture.jdbc.queryForMap(
                "SELECT * FROM oa_project WHERE tenant_id=100000 AND project_id=?", failedProject.getProjectId()));
        String failedTasksBefore = snapshot(fixture, failedProject.getProjectId());
        OaProjectAccountingService accounting = fixture.bean(OaProjectAccountingService.class);
        IllegalStateException reported = null;
        try { accounting.recalculateAll(); }
        catch (IllegalStateException failure) { reported = failure; }
        require(reported != null && reported.getSuppressed().length == 1
                        && reported.getSuppressed()[0].getMessage().contains(String.valueOf(failedProject.getProjectId())),
                "A failed project must be reported with its actual project identifier");
        require(failedBefore.equals(fixture.json.writeValueAsString(fixture.jdbc.queryForMap(
                        "SELECT * FROM oa_project WHERE tenant_id=100000 AND project_id=?", failedProject.getProjectId())))
                        && failedTasksBefore.equals(snapshot(fixture, failedProject.getProjectId())),
                "The failed project's transaction must preserve all prior project and task values");
        require(fixture.mapper(OaProjectMapper.class).selectById(followingProject.getProjectId()).getActualHours()
                        .compareTo(new BigDecimal("1.25")) == 0,
                "A later project must still commit its independent recalculation after an earlier failure");
        OaProjectAuditDatabaseChecks.batchOutcome(fixture, "PARTIAL_FAILURE", failedProject.getProjectId(),
                OaProjectPersistenceDatabaseChecks::require);
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=0.01 WHERE task_id IN (?,?)",
                firstTask.getTaskId(), secondTask.getTaskId());
        int processed = accounting.recalculateAll();
        require(processed == fixture.count("SELECT COUNT(*) FROM oa_project WHERE tenant_id=100000 AND deleted=0"),
                "Recovery must report the actual number of projects recalculated");
        OaProject recovered = fixture.mapper(OaProjectMapper.class).selectById(failedProject.getProjectId());
        require(recovered.getActualHours().compareTo(new BigDecimal("0.02")) == 0,
                "A corrected project must recover from its original task facts on a subsequent full recalculation");
        require(recovered.getLaborCostAmount().signum() == 0 && recovered.getBillableAmount().signum() == 0,
                "Recovery of historical opening hours must not create labor cost or customer billing");
        OaProjectAuditDatabaseChecks.batchOutcome(fixture, "COMPLETED", null, OaProjectPersistenceDatabaseChecks::require);
    }

    private static void fullReversal(OaOperationsDatabaseChecks fixture) throws Exception {
        Long employeeUser = fixture.jdbc.queryForObject(
                "SELECT employee.user_id FROM hr_employee employee JOIN sys_user account ON account.user_id=employee.user_id "
                        + "AND account.tenant_id=employee.tenant_id WHERE employee.tenant_id=100000 AND employee.deleted=0 "
                        + "AND employee.employee_status NOT IN ('RESIGNED','TERMINATED') AND account.deleted=0 AND account.status='0' "
                        + "AND NOT EXISTS (SELECT 1 FROM oa_timesheet sheet WHERE sheet.tenant_id=employee.tenant_id "
                        + "AND sheet.employee_id IN (SELECT member.id FROM hr_employee member "
                        + "WHERE member.tenant_id=employee.tenant_id AND member.user_id=employee.user_id) AND sheet.deleted=0) "
                        + "GROUP BY employee.user_id HAVING COUNT(*)=1 ORDER BY employee.user_id LIMIT 1", Long.class);
        OaOperationsChecks.identity(100000L, Objects.requireNonNull(employeeUser));
        OaProject project = project(fixture, "-full-reversal");
        OaProjectTask task = task(fixture, project, "完整冲正且保留期初", null, false);
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=1.25 WHERE task_id=?", task.getTaskId());
        OaActivityCatalogService catalog = fixture.bean(OaActivityCatalogService.class);
        OaActivityType activity = new OaActivityType();
        activity.setTypeCode(fixture.marker + "-reversal");
        activity.setTypeName("完整冲正活动");
        activity.setBillableDefaultFlag(1);
        Long activityId = catalog.saveType(activity);
        OaActivityCost cost = new OaActivityCost();
        cost.setActivityTypeId(activityId);
        cost.setCostingRate(new BigDecimal("1.23"));
        cost.setBillingRate(new BigDecimal("4.56"));
        cost.setEffectiveStart(LocalDate.now().minusDays(10));
        catalog.saveCost(cost);
        OaTimesheetDetail detail = new OaTimesheetDetail();
        detail.setProjectId(project.getProjectId());
        detail.setTaskId(task.getTaskId());
        detail.setActivityTypeId(activityId);
        detail.setWorkDate(LocalDate.now());
        detail.setHours(new BigDecimal("2.00"));
        detail.setBillableFlag(1);
        detail.setDescription("核对全部冲正后的毛利率");
        OaTimesheetService service = fixture.bean(OaTimesheetService.class);
        Long sheetId = OaProjectContractDatabaseChecks.saveSheet(service, detail);
        service.submit(sheetId);
        OaTimesheet submitted = fixture.mapper(OaTimesheetMapper.class).selectById(sheetId);
        service.handleApproved(fixture.bind(service, sheetId, submitted.getInstanceId()));
        OaProject approved = fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId());
        require(approved.getLaborCostAmount().compareTo(new BigDecimal("2.46")) == 0
                        && approved.getBillableAmount().compareTo(new BigDecimal("9.12")) == 0,
                "Approved hours must persist separate cost and billable amounts before reversal");
        require(approved.getGrossMargin().compareTo(new BigDecimal("6.66")) == 0
                        && approved.getGrossMarginRate().compareTo(new BigDecimal("0.7303")) == 0,
                "Nonzero billing must persist the exact monetary margin and rounded rate");
        OaTimesheetDetail original = service.detail(sheetId).getDetails().get(0);
        OaTimesheetDetail reversal = new OaTimesheetDetail();
        reversal.setProjectId(project.getProjectId());
        reversal.setTaskId(task.getTaskId());
        reversal.setActivityTypeId(activityId);
        reversal.setWorkDate(original.getWorkDate());
        reversal.setHours(new BigDecimal("-2.00"));
        reversal.setBillableFlag(1);
        reversal.setReversalOfDetailId(original.getDetailId());
        reversal.setDescription("全部冲正已批准的两小时");
        Long reversalId = OaProjectContractDatabaseChecks.saveSheet(service, reversal);
        service.submit(reversalId);
        OaTimesheet reversalSheet = fixture.mapper(OaTimesheetMapper.class).selectById(reversalId);
        service.handleApproved(fixture.bind(service, reversalId, reversalSheet.getInstanceId()));
        OaProject reversed = fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId());
        require(reversed.getLaborCostAmount().signum() == 0 && reversed.getBillableAmount().signum() == 0
                        && reversed.getGrossMargin().signum() == 0,
                "A full approved reversal must return both amounts and the monetary margin to zero");
        require(reversed.getGrossMarginRate() == null && fixture.count(
                        "SELECT COUNT(*) FROM oa_project WHERE project_id=? AND gross_margin_rate IS NULL", project.getProjectId()) == 1,
                "Returning billing to zero must clear the old margin rate in the actual database");
        require(reversed.getActualHours().compareTo(new BigDecimal("1.25")) == 0,
                "A full reversal must retain independent historical opening hours");
        require(service.detail(sheetId).getDetails().get(0).getHours().compareTo(new BigDecimal("2.00")) == 0,
                "Reversal must preserve the original approved detail");
    }
}
