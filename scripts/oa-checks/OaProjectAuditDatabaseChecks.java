package com.cloudflow.oa.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaActivityCost;
import com.cloudflow.oa.domain.OaActivityType;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.domain.OaTimesheet;
import com.cloudflow.oa.domain.OaTimesheetDetail;
import com.cloudflow.oa.mapper.OaActivityCostMapper;
import com.cloudflow.oa.mapper.OaTimesheetMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.BiConsumer;

public final class OaProjectAuditDatabaseChecks {
    private OaProjectAuditDatabaseChecks() { }

    private record Audit(JsonNode before, JsonNode after) { }

    static void costSnapshotsAndRollback(OaOperationsDatabaseChecks fixture, BiConsumer<Boolean, String> verify) throws Exception {
        OaActivityCatalogService catalog = fixture.bean(OaActivityCatalogService.class);
        OaActivityCost cost = price(activity(fixture, "-audit-cost"), "10.11", "20.13");
        cost.setEffectiveEnd(LocalDate.now().plusDays(10));
        Long costId = catalog.saveCost(cost);
        Audit created = audit(fixture, "COST_CONFIGURED", costId);
        verify.accept(created.before().path("state").isNull()
                        && amount(created.after().path("state").path("costingRate"), "10.11")
                        && amount(created.after().path("state").path("billingRate"), "20.13"),
                "Creating a price must record its absent previous state and both actual rates");
        verify.accept(created.after().path("operatorId").asLong() == 1L
                        && created.after().path("businessId").asLong() == costId,
                "Price audit must retain the actual operator and inserted record identifier");
        OaActivityCost changed = fixture.mapper(OaActivityCostMapper.class).selectById(costId);
        changed.setCostingRate(new BigDecimal("12.13"));
        changed.setBillingRate(new BigDecimal("24.15"));
        changed.setEffectiveEnd(null);
        catalog.saveCost(changed);
        Audit edited = audit(fixture, "COST_CONFIGURED", costId);
        verify.accept(amount(edited.before().path("state").path("costingRate"), "10.11")
                        && amount(edited.after().path("state").path("costingRate"), "12.13")
                        && amount(edited.before().path("state").path("billingRate"), "20.13")
                        && amount(edited.after().path("state").path("billingRate"), "24.15"),
                "Price edits must retain distinct immutable before and after rate values");
        verify.accept(!edited.before().path("state").path("effectiveEnd").isNull()
                        && edited.after().path("state").path("effectiveEnd").isNull()
                        && fixture.mapper(OaActivityCostMapper.class).selectById(costId).getEffectiveEnd() == null,
                "Clearing a price end date must appear in both the stored record and audit snapshot");
        String before = row(fixture, "SELECT * FROM oa_activity_cost WHERE cost_id=?", costId);
        long count = auditCount(fixture, "COST_CONFIGURED", costId);
        OaActivityCost blocked = fixture.mapper(OaActivityCostMapper.class).selectById(costId);
        blocked.setCostingRate(new BigDecimal("99.99"));
        rejectAuditWrite(fixture, "COST_CONFIGURED", () -> catalog.saveCost(blocked), verify);
        verify.accept(before.equals(row(fixture, "SELECT * FROM oa_activity_cost WHERE cost_id=?", costId))
                        && auditCount(fixture, "COST_CONFIGURED", costId) == count,
                "An audit insertion failure must roll back the entire price edit and its audit row");
        OaActivityCost retried = fixture.mapper(OaActivityCostMapper.class).selectById(costId);
        retried.setCostingRate(new BigDecimal("77.77"));
        catalog.saveCost(retried);
        verify.accept(amount(audit(fixture, "COST_CONFIGURED", costId).after().path("state").path("costingRate"), "77.77")
                        && auditCount(fixture, "COST_CONFIGURED", costId) == count + 1,
                "A price edit must recover with one accurate audit after the storage failure is removed");
    }

    static void timesheetSnapshotsAndRollback(OaOperationsDatabaseChecks fixture, BiConsumer<Boolean, String> verify) throws Exception {
        Long employeeUser = Objects.requireNonNull(fixture.jdbc.queryForObject(
                "SELECT employee.user_id FROM hr_employee employee JOIN sys_user account ON account.user_id=employee.user_id "
                        + "AND account.tenant_id=employee.tenant_id WHERE employee.tenant_id=100000 AND employee.deleted=0 "
                        + "AND employee.employee_status NOT IN ('RESIGNED','TERMINATED') AND account.deleted=0 AND account.status='0' "
                        + "GROUP BY employee.user_id HAVING COUNT(*)=1 ORDER BY employee.user_id LIMIT 1", Long.class));
        OaOperationsChecks.identity(100000L, employeeUser);
        OaProject project = OaProjectContractDatabaseChecks.project(fixture, "-audit-timesheet", employeeUser);
        OaProjectTask task = OaProjectContractDatabaseChecks.projectTask(fixture, project, "工时审计任务", false, "NOT_STARTED");
        Long activityId = activity(fixture, "-audit-hours");
        fixture.bean(OaActivityCatalogService.class).saveCost(price(activityId, "100.01", "150.03"));
        OaTimesheetService service = fixture.bean(OaTimesheetService.class);
        Long sheetId = OaProjectContractDatabaseChecks.saveSheet(service, detail(project, task, activityId, "1.25"));
        String draft = sheetState(fixture, sheetId);
        long outboxBefore = approvalEvents(fixture, sheetId);
        rejectAuditWrite(fixture, "TIMESHEET_SUBMITTED", () -> service.submit(sheetId), verify);
        verify.accept(draft.equals(sheetState(fixture, sheetId)) && approvalEvents(fixture, sheetId) == outboxBefore
                        && auditCount(fixture, "TIMESHEET_SUBMITTED", sheetId) == 0,
                "Failed submission audit must preserve the original draft, prices and approval outbox");
        service.submit(sheetId);
        Audit submittedAudit = audit(fixture, "TIMESHEET_SUBMITTED", sheetId);
        verify.accept("DRAFT".equals(submittedAudit.before().path("state").path("timesheet").path("status").asText())
                        && "SUBMITTED".equals(submittedAudit.after().path("state").path("timesheet").path("status").asText())
                        && submittedAudit.after().path("state").path("details").size() == 1,
                "Submission audit must contain the real state transition and locked detail");
        verify.accept(amount(submittedAudit.after().path("state").path("timesheet").path("costingAmount"), "125.01")
                        && amount(submittedAudit.after().path("state").path("timesheet").path("billingAmount"), "187.54")
                        && amount(submittedAudit.after().path("state").path("details").get(0).path("hours"), "1.25"),
                "Submission audit must retain exact hours and independently rounded cost and billing");
        OaTimesheet submitted = fixture.mapper(OaTimesheetMapper.class).selectById(sheetId);
        ApprovalResultDTO approved = fixture.bind(service, sheetId, submitted.getInstanceId());
        approved.setApprovalResult("APPROVED");
        approved.setApproverId(employeeUser);
        approved.setApproverName("工时项目经理");
        approved.setApprovalTime(System.currentTimeMillis());
        OaOperationsChecks.identity(100000L, 1L);
        String bound = sheetState(fixture, sheetId);
        String projectBefore = projectState(fixture, project.getProjectId());
        long calculationBefore = auditCount(fixture, "PROJECT_RECALCULATED", project.getProjectId());
        rejectAuditWrite(fixture, "TIMESHEET_APPROVED", () -> service.handleApproved(approved), verify);
        verify.accept(bound.equals(sheetState(fixture, sheetId)) && projectBefore.equals(projectState(fixture, project.getProjectId()))
                        && auditCount(fixture, "TIMESHEET_APPROVED", sheetId) == 0
                        && auditCount(fixture, "PROJECT_RECALCULATED", project.getProjectId()) == calculationBefore,
                "Failed approval audit must roll back approval, project totals, task hours and dependent calculation audit");
        service.handleApproved(approved);
        Audit accepted = audit(fixture, "TIMESHEET_APPROVED", sheetId);
        verify.accept("APPROVING".equals(accepted.before().path("state").path("timesheet").path("status").asText())
                        && "APPROVED".equals(accepted.after().path("state").path("timesheet").path("status").asText())
                        && amount(accepted.after().path("state").path("details").get(0).path("costingRate"), "100.01"),
                "Approval audit must retain before and after states and the original locked rate");
        verify.accept(accepted.after().path("operatorId").asLong() == employeeUser
                        && accepted.after().path("executorId").asLong() == 1L
                        && accepted.after().path("approval").path("approverId").asLong() == employeeUser
                        && "工时项目经理".equals(accepted.after().path("operatorName").asText())
                        && approved.getProcessInstanceId().equals(accepted.after().path("approval").path("processInstanceId").asText()),
                "Approval audit must distinguish the actual project manager from the callback executor and retain the workflow instance");
        String afterApproval = sheetState(fixture, sheetId);
        String projectAfter = projectState(fixture, project.getProjectId());
        long approvedAudits = auditCount(fixture, "TIMESHEET_APPROVED", sheetId);
        long approvedCalculations = auditCount(fixture, "PROJECT_RECALCULATED", project.getProjectId());
        service.handleApproved(approved);
        verify.accept(afterApproval.equals(sheetState(fixture, sheetId)) && projectAfter.equals(projectState(fixture, project.getProjectId()))
                        && auditCount(fixture, "TIMESHEET_APPROVED", sheetId) == approvedAudits
                        && auditCount(fixture, "PROJECT_RECALCULATED", project.getProjectId()) == approvedCalculations,
                "A repeated approval callback must preserve financial facts and avoid duplicate approval or calculation audits");
        OaOperationsChecks.identity(100000L, employeeUser);
        Long rejectionId = OaProjectContractDatabaseChecks.saveSheet(service, detail(project, task, activityId, "0.50"));
        service.submit(rejectionId);
        OaTimesheet rejectionSheet = fixture.mapper(OaTimesheetMapper.class).selectById(rejectionId);
        ApprovalResultDTO rejected = fixture.bind(service, rejectionId, rejectionSheet.getInstanceId());
        rejected.setApprovalResult("REJECTED");
        rejected.setApproverId(employeeUser);
        rejected.setApproverName("工时项目经理");
        rejected.setApprovalComment("请补充实际工作内容");
        rejected.setApprovalTime(System.currentTimeMillis());
        OaOperationsChecks.identity(100000L, 1L);
        service.handleRejected(rejected);
        service.handleRejected(rejected);
        Audit rejection = audit(fixture, "TIMESHEET_REJECTED", rejectionId);
        verify.accept("APPROVING".equals(rejection.before().path("state").path("timesheet").path("status").asText())
                        && "REJECTED".equals(rejection.after().path("state").path("timesheet").path("status").asText())
                        && "请补充实际工作内容".equals(rejection.after().path("state").path("timesheet").path("rejectReason").asText())
                        && auditCount(fixture, "TIMESHEET_REJECTED", rejectionId) == 1,
                "Rejection audit must retain the manager's actual reason and remain unique after callback replay");
    }

    static void requestedRecalculationAudit(OaOperationsDatabaseChecks fixture, BiConsumer<Boolean, String> verify) throws Exception {
        OaProject project = OaProjectContractDatabaseChecks.project(fixture, "-audit-recalculation", 1L);
        OaProjectTask task = OaProjectContractDatabaseChecks.projectTask(fixture, project, "重算审计任务", false, "NOT_STARTED");
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=2.50 WHERE task_id=?", task.getTaskId());
        fixture.jdbc.update("UPDATE oa_project SET other_cost_amount=5.67 WHERE project_id=?", project.getProjectId());
        OaProjectAccountingService accounting = fixture.bean(OaProjectAccountingService.class);
        accounting.recalculateRequested(project.getProjectId());
        Audit calculated = audit(fixture, "PROJECT_RECALCULATED", project.getProjectId());
        verify.accept(amount(calculated.before().path("state").path("project").path("actualHours"), "0.00")
                        && amount(calculated.after().path("state").path("project").path("actualHours"), "2.50")
                        && amount(calculated.after().path("state").path("project").path("actualCostAmount"), "5.67")
                        && amount(calculated.after().path("state").path("tasks").get(0).path("actualHours"), "2.50")
                        && calculated.after().path("details").path("requested").asBoolean(),
                "Requested recalculation audit must retain real project and task values before and after changes");
        String unchanged = projectState(fixture, project.getProjectId());
        long auditsBefore = auditCount(fixture, "PROJECT_RECALCULATED", project.getProjectId());
        accounting.recalculateRequested(project.getProjectId());
        Audit repeated = audit(fixture, "PROJECT_RECALCULATED", project.getProjectId());
        verify.accept(unchanged.equals(projectState(fixture, project.getProjectId()))
                        && repeated.before().path("state").equals(repeated.after().path("state"))
                        && !repeated.after().path("details").path("changed").asBoolean()
                        && auditCount(fixture, "PROJECT_RECALCULATED", project.getProjectId()) == auditsBefore + 1,
                "An explicit repeated recalculation must record the operator while preserving unchanged project and task versions");
        accounting.recalculate(project.getProjectId());
        verify.accept(auditCount(fixture, "PROJECT_RECALCULATED", project.getProjectId()) == auditsBefore + 1,
                "A read-triggered unchanged recalculation must not create an additional business-change audit");
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=3.50 WHERE task_id=?", task.getTaskId());
        String beforeFailure = projectState(fixture, project.getProjectId());
        rejectAuditWrite(fixture, "PROJECT_RECALCULATED", () -> accounting.recalculateRequested(project.getProjectId()), verify);
        verify.accept(beforeFailure.equals(projectState(fixture, project.getProjectId()))
                        && auditCount(fixture, "PROJECT_RECALCULATED", project.getProjectId()) == auditsBefore + 1,
                "A failed recalculation audit must preserve all previous stored project and task values");
        accounting.recalculateRequested(project.getProjectId());
        verify.accept(amount(audit(fixture, "PROJECT_RECALCULATED", project.getProjectId()).after()
                        .path("state").path("project").path("actualHours"), "3.50"),
                "Recalculation must recover from its actual opening-hour facts after audit storage recovers");
    }

    static void batchOutcome(OaOperationsDatabaseChecks fixture, String status, Long failedProject,
                             BiConsumer<Boolean, String> verify) throws Exception {
        Map<String, Object> record = fixture.jdbc.queryForMap("SELECT before_json,after_json FROM sys_audit_log "
                + "WHERE tenant_id=100000 AND audit_field='PROJECTS_RECALCULATED' ORDER BY audit_id DESC LIMIT 1");
        JsonNode before = fixture.json.readTree(record.get("before_json").toString());
        JsonNode after = fixture.json.readTree(record.get("after_json").toString());
        verify.accept("PENDING".equals(before.path("state").path("status").asText())
                        && status.equals(after.path("state").path("status").asText())
                        && before.path("businessNo").equals(after.path("businessNo"))
                        && !after.path("businessNo").asText().isBlank(),
                "Full recalculation audit must bind its original execution identifier to the actual final outcome");
        JsonNode failures = after.path("state").path("failedProjectIds");
        verify.accept(failedProject == null ? failures.isArray() && failures.isEmpty()
                        : failures.size() == 1 && failures.get(0).asLong() == failedProject,
                "Batch audit must preserve the exact failed project identifiers or an empty successful outcome");
    }

    private static Long activity(OaOperationsDatabaseChecks fixture, String suffix) {
        OaActivityType activity = new OaActivityType();
        activity.setTypeCode(fixture.marker + suffix);
        activity.setTypeName("项目审计验证活动" + suffix);
        activity.setBillableDefaultFlag(1);
        return fixture.bean(OaActivityCatalogService.class).saveType(activity);
    }

    private static OaActivityCost price(Long activityId, String costingRate, String billingRate) {
        OaActivityCost price = new OaActivityCost();
        price.setActivityTypeId(activityId);
        price.setCostingRate(new BigDecimal(costingRate));
        price.setBillingRate(new BigDecimal(billingRate));
        price.setEffectiveStart(LocalDate.now().minusDays(10));
        return price;
    }

    private static OaTimesheetDetail detail(OaProject project, OaProjectTask task, Long activityId, String hours) {
        OaTimesheetDetail detail = new OaTimesheetDetail();
        detail.setProjectId(project.getProjectId());
        detail.setTaskId(task.getTaskId());
        detail.setActivityTypeId(activityId);
        detail.setWorkDate(LocalDate.now());
        detail.setHours(new BigDecimal(hours));
        detail.setBillableFlag(1);
        detail.setDescription("核对项目工时操作记录与失败恢复");
        return detail;
    }

    private static Audit audit(OaOperationsDatabaseChecks fixture, String action, Long businessId) throws Exception {
        Map<String, Object> record = fixture.jdbc.queryForMap("SELECT before_json,after_json FROM sys_audit_log "
                + "WHERE tenant_id=100000 AND audit_field=? AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.businessId'))=? "
                + "ORDER BY audit_id DESC LIMIT 1", action, businessId.toString());
        return new Audit(fixture.json.readTree(record.get("before_json").toString()), fixture.json.readTree(record.get("after_json").toString()));
    }

    private static long auditCount(OaOperationsDatabaseChecks fixture, String action, Long businessId) {
        return fixture.count("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field=? "
                + "AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.businessId'))=?", action, businessId.toString());
    }

    private static long approvalEvents(OaOperationsDatabaseChecks fixture, Long sheetId) {
        return fixture.count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND aggregate_id=? "
                + "AND event_type='OA_F_APPROVAL_SUBMITTED'", sheetId);
    }

    private static boolean amount(JsonNode value, String expected) {
        return value != null && !value.isMissingNode() && !value.isNull()
                && new BigDecimal(value.asText()).compareTo(new BigDecimal(expected)) == 0;
    }

    private static String row(OaOperationsDatabaseChecks fixture, String query, Long identifier) throws Exception {
        return fixture.json.writeValueAsString(fixture.jdbc.queryForMap(query, identifier));
    }

    private static String sheetState(OaOperationsDatabaseChecks fixture, Long sheetId) throws Exception {
        return fixture.json.writeValueAsString(Map.of("sheet", fixture.jdbc.queryForMap("SELECT * FROM oa_timesheet WHERE timesheet_id=?", sheetId),
                "details", fixture.jdbc.queryForList("SELECT * FROM oa_timesheet_detail WHERE timesheet_id=? ORDER BY detail_id", sheetId)));
    }

    private static String projectState(OaOperationsDatabaseChecks fixture, Long projectId) throws Exception {
        return fixture.json.writeValueAsString(Map.of("project", fixture.jdbc.queryForMap("SELECT * FROM oa_project WHERE project_id=?", projectId),
                "tasks", fixture.jdbc.queryForList("SELECT * FROM oa_project_task WHERE project_id=? ORDER BY task_id", projectId)));
    }

    private static void rejectAuditWrite(OaOperationsDatabaseChecks fixture, String action, Runnable operation,
                                         BiConsumer<Boolean, String> verify) {
        String triggerName = "f3_audit_" + UUID.randomUUID().toString().replace("-", "");
        String validatedAction = OaProjectAuditService.Action.valueOf(action).name();
        fixture.jdbc.execute("CREATE TRIGGER " + triggerName + " BEFORE INSERT ON sys_audit_log FOR EACH ROW BEGIN "
                + "IF NEW.tenant_id=100000 AND NEW.audit_field='" + validatedAction + "' THEN "
                + "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='F3_EXPECTED_AUDIT_FAILURE'; END IF; END");
        RuntimeException actual = null;
        try {
            operation.run();
        } catch (RuntimeException failure) {
            actual = failure;
        } finally {
            fixture.jdbc.execute("DROP TRIGGER " + triggerName);
        }
        boolean expected = false;
        for (Throwable cause = actual; cause != null; cause = cause.getCause()) {
            if (cause.getMessage() != null && cause.getMessage().contains("F3_EXPECTED_AUDIT_FAILURE")) expected = true;
        }
        verify.accept(expected, "The actual audit database insertion must fail at the deliberate storage failure");
    }
}
