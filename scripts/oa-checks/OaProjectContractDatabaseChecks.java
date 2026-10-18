package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.*;
import com.cloudflow.oa.mapper.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.multipart.MultipartFile;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

public final class OaProjectContractDatabaseChecks {
    static void run(OaOperationsDatabaseChecks fixture) throws Exception { projects(fixture); OaProjectOpeningHoursDatabaseChecks.run(fixture); timesheets(fixture); contracts(fixture); }

    static OaProject project(OaOperationsDatabaseChecks fixture, String suffix, Long owner) {
        OaProject project = new OaProject(); OaRecordSupport.create(project, "projectId"); project.setProjectNo(fixture.marker + suffix); project.setProjectName("验证项目" + suffix);
        project.setOwnerId(owner); project.setDeptId(100L); project.setStatus("IN_PROGRESS"); project.setPercentCompleteMode("TASK_COMPLETION"); project.setStartDate(LocalDate.now().minusDays(10)); project.setEndDate(LocalDate.now().plusMonths(6));
        fixture.mapper(OaProjectMapper.class).insert(project); return fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId());
    }

    static OaProjectTask projectTask(OaOperationsDatabaseChecks fixture, OaProject project, String name, boolean milestone, String status) {
        OaProjectTask task = new OaProjectTask(); task.setProjectId(project.getProjectId()); task.setSubject(name); task.setIsMilestoneFlag(milestone ? 1 : 0); task.setStatus(status); task.setAssigneeId(UserContext.getUserId());
        task.setPlannedStart(LocalDate.now().atStartOfDay()); task.setPlannedEnd(LocalDate.now().plusDays(5).atStartOfDay());
        Long id = fixture.bean(OaProjectTaskService.class).saveTask(task); return fixture.mapper(OaProjectTaskMapper.class).selectById(id);
    }

    static void projects(OaOperationsDatabaseChecks fixture) {
        identity(100000L, 1L); OaProject project = project(fixture, "-progress", 1L); OaProjectTaskService service = fixture.bean(OaProjectTaskService.class);
        OaProjectTask completed = projectTask(fixture, project, "完成任务", false, "COMPLETED"); OaProjectTask pending = projectTask(fixture, project, "未开始任务", false, "NOT_STARTED");
        OaProjectTask milestone = projectTask(fixture, project, "验收里程碑", true, "NOT_STARTED");
        decimal("33.33", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getProgress(), "persisted progress counts milestone only once");
        fixture.jdbc.update("UPDATE oa_project SET percent_complete_mode='TASK_PROGRESS' WHERE project_id=?", project.getProjectId());
        pending = fixture.mapper(OaProjectTaskMapper.class).selectById(pending.getTaskId()); pending.setSubject("调整任务名称"); service.saveTask(pending);
        decimal("20.00", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getProgress(), "persisted milestone weight is three");
        OaProjectDependency forward = new OaProjectDependency(); forward.setProjectId(project.getProjectId()); forward.setPredecessorTaskId(completed.getTaskId()); forward.setSuccessorTaskId(pending.getTaskId()); service.saveDependency(forward);
        OaProjectDependency reverse = new OaProjectDependency(); reverse.setProjectId(project.getProjectId()); reverse.setPredecessorTaskId(pending.getTaskId()); reverse.setSuccessorTaskId(completed.getTaskId());
        fails(IllegalArgumentException.class, () -> service.saveDependency(reverse), "cyclic dependency rolls back");
        equal(1L, fixture.count("SELECT COUNT(*) FROM oa_project_dependency WHERE project_id=? AND deleted=0", project.getProjectId()), "invalid edge not persisted");
        service.snapshotBaseline(project.getProjectId()); fails(IllegalArgumentException.class, () -> service.saveTask(milestone), "baseline version invalidates stale edit");
        OaProjectTemplate template = new OaProjectTemplate(); template.setTemplateCode(fixture.marker); template.setTemplateName("交付任务模板");
        Long templateId = fixture.bean(OaProjectTemplateService.class).saveFromProject(project.getProjectId(), template);
        OaProject destination = project(fixture, "-template", 1L); fixture.bean(OaProjectTemplateService.class).applyTemplate(templateId, destination.getProjectId());
        equal(3, service.list(destination.getProjectId()).size(), "template creates canonical project tasks");
    }

    static void timesheets(OaOperationsDatabaseChecks fixture) throws Exception {
        Long employeeUser = fixture.jdbc.queryForObject("SELECT employee.user_id FROM hr_employee employee JOIN sys_user account ON account.user_id=employee.user_id AND account.tenant_id=employee.tenant_id WHERE employee.tenant_id=100000 AND employee.deleted=0 AND employee.employee_status NOT IN ('RESIGNED','TERMINATED') AND account.deleted=0 AND account.status='0' AND NOT EXISTS (SELECT 1 FROM oa_timesheet sheet WHERE sheet.tenant_id=employee.tenant_id AND sheet.employee_id IN (SELECT member.id FROM hr_employee member WHERE member.tenant_id=employee.tenant_id AND member.user_id=employee.user_id) AND sheet.deleted=0) GROUP BY employee.user_id HAVING COUNT(*)=1 ORDER BY employee.user_id LIMIT 1", Long.class);
        identity(100000L, employeeUser); OaProject project = project(fixture, "-hours", employeeUser); OaProjectTask task = projectTask(fixture, project, "填报交付工时", false, "IN_PROGRESS");
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=12.50 WHERE task_id=?", task.getTaskId());
        OaActivityCatalogService catalog = fixture.bean(OaActivityCatalogService.class); OaActivityType type = new OaActivityType(); type.setTypeCode(fixture.marker); type.setTypeName("验证交付活动"); type.setBillableDefaultFlag(1);
        Long typeId = catalog.saveType(type); OaActivityCost cost = new OaActivityCost(); cost.setActivityTypeId(typeId); cost.setCostingRate(number("120")); cost.setBillingRate(number("240")); cost.setEffectiveStart(LocalDate.now().minusDays(10));
        Long costId = catalog.saveCost(cost); OaActivityCost duplicate = new OaActivityCost(); duplicate.setActivityTypeId(typeId); duplicate.setCostingRate(number("120")); duplicate.setBillingRate(number("240")); duplicate.setEffectiveStart(LocalDate.now());
        fails(IllegalArgumentException.class, () -> catalog.saveCost(duplicate), "overlapping default price rejected with real locks");
        OaTimesheetService service = fixture.bean(OaTimesheetService.class); equal(true, service.availableTasks(project.getProjectId()).stream().anyMatch(item -> item.getTaskId().equals(task.getTaskId())), "own project task selector works");
        OaTimesheetDetail detail = new OaTimesheetDetail(); detail.setProjectId(project.getProjectId()); detail.setTaskId(task.getTaskId()); detail.setActivityTypeId(typeId); detail.setWorkDate(LocalDate.now()); detail.setHours(number("8")); detail.setBillableFlag(1); detail.setDescription("完成实施联调和验收资料整理");
        Long id = saveSheet(service, detail);
        fixture.bean(OaProjectAccountingService.class).recalculate(project.getProjectId());
        decimal("12.50", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getActualHours(), "draft hours excluded while historical opening survives");
        service.submit(id); OaTimesheet submitted = fixture.mapper(OaTimesheetMapper.class).selectById(id);
        decimal("960", submitted.getCostingAmount(), "costing snapshot persisted"); decimal("1920", submitted.getBillingAmount(), "billing snapshot persisted");
        OaActivityCost edited = fixture.mapper(OaActivityCostMapper.class).selectById(costId); edited.setCostingRate(number("999")); edited.setBillingRate(number("1999")); catalog.saveCost(edited);
        ApprovalResultDTO approved = fixture.bind(service, id, submitted.getInstanceId()); service.handleApproved(approved); service.handleApproved(approved);
        decimal("960", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getLaborCostAmount(), "approval replay does not double project cost");
        decimal("20.50", fixture.mapper(OaProjectTaskMapper.class).selectById(task.getTaskId()).getActualHours(), "approval adds hours to historical opening once");
        decimal("20.50", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getActualHours(), "project approval includes opening once");
        OaTimesheetDetail original = service.detail(id).getDetails().get(0); decimal("120", original.getCostingRate(), "price changes preserve historical rate");
        OaTimesheetDetail reversal = new OaTimesheetDetail(); reversal.setProjectId(project.getProjectId()); reversal.setTaskId(task.getTaskId()); reversal.setActivityTypeId(typeId); reversal.setWorkDate(LocalDate.now()); reversal.setHours(number("-1")); reversal.setBillableFlag(1); reversal.setReversalOfDetailId(original.getDetailId()); reversal.setDescription("冲正重复统计的一小时");
        Long reverseId = saveSheet(service, reversal); service.submit(reverseId); OaTimesheet correction = fixture.mapper(OaTimesheetMapper.class).selectById(reverseId);
        decimal("-120", correction.getCostingAmount(), "reversal reuses original price"); service.handleApproved(fixture.bind(service, reverseId, correction.getInstanceId()));
        decimal("840", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getLaborCostAmount(), "correction reduces project cost");
        decimal("19.50", fixture.mapper(OaProjectTaskMapper.class).selectById(task.getTaskId()).getActualHours(), "reversal reduces approved hours without erasing opening");
        decimal("19.50", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getActualHours(), "project reversal retains opening");
        decimal("12.50", fixture.mapper(OaProjectTaskMapper.class).selectById(task.getTaskId()).getOpeningActualHours(), "approval and reversal preserve immutable opening");
        reversal.setDetailId(null); reversal.setHours(number("-8")); fails(IllegalArgumentException.class, () -> saveSheet(service, reversal), "cumulative over-reversal rejected");
        identity(100001L, employeeUser); fails(IllegalArgumentException.class, () -> service.detail(id), "foreign tenant cannot view timesheet"); identity(100000L, 1L);
    }

    static Long saveSheet(OaTimesheetService service, OaTimesheetDetail detail) {
        OaTimesheet sheet = new OaTimesheet(); sheet.setStartDate(LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))); sheet.setEndDate(sheet.getStartDate().plusDays(6));
        TimesheetSaveDTO request = new TimesheetSaveDTO(); request.setTimesheet(sheet); request.setDetails(List.of(detail)); return service.save(request);
    }

    static String upload(OaOperationsDatabaseChecks fixture, OaPrivateFileStorageService.Kind kind) {
        byte[] content = "%PDF-1.4\nBatch F isolated test evidence\n%%EOF".getBytes(StandardCharsets.US_ASCII);
        MultipartFile file = proxy(MultipartFile.class, (method, values) -> switch (method) {
            case "getOriginalFilename", "getName" -> "evidence.pdf";
            case "getContentType" -> "application/pdf";
            case "getSize" -> (long) content.length;
            case "isEmpty" -> false;
            case "getBytes" -> content;
            case "getInputStream" -> new ByteArrayInputStream(content);
            default -> throw new IllegalStateException("Unexpected upload operation " + method);
        });
        return fixture.bean(OaPrivateFileStorageService.class).upload(kind, file).reference();
    }

    static void contracts(OaOperationsDatabaseChecks fixture) {
        OaContract contract = new OaContract(); OaRecordSupport.create(contract, "contractId"); contract.setContractNo(fixture.marker); contract.setContractName("履约与签署验证合同"); contract.setContractType("SERVICE"); contract.setCounterpartyName("验证合作方");
        contract.setOwnerId(1L); contract.setDeptId(100L); contract.setStatus("ACTIVE"); contract.setRequiresFulfilmentFlag(1); contract.setStartDate(LocalDate.now()); contract.setEndDate(LocalDate.now().plusMonths(1));
        fixture.mapper(OaContractMapper.class).insert(contract); OaContractFulfilmentService service = fixture.bean(OaContractFulfilmentService.class);
        OaContractFulfilmentTerm term = new OaContractFulfilmentTerm(); term.setContractId(contract.getContractId()); term.setTermCategory("DELIVERY"); term.setTermContent("按约定交付成果并完成验收"); term.setResponsibleParty("OUR"); term.setResponsibleId(1L); term.setDeadlineDate(LocalDate.now().plusDays(5)); term.setRequirement("双方确认交付内容和验收结果");
        Long termId = service.saveTerm(term); ContractTermConfirmDTO confirm = new ContractTermConfirmDTO(); confirm.setFulfilledDate(LocalDate.now()); confirm.setEvidenceRemark("双方线下验收确认");
        service.confirmTerm(termId, confirm); equal("FULFILLED", fixture.mapper(OaContractMapper.class).selectById(contract.getContractId()).getFulfilmentStatus(), "term completion updates contract state");
        ContractSignDTO sign = new ContractSignDTO(); sign.setSignMethod("SCAN"); sign.setCounterpartySignee("验证签署人"); sign.setSignedFileUrl(upload(fixture, OaPrivateFileStorageService.Kind.CONTRACT_SIGNED)); sign.setCounterpartySignTime(LocalDate.now().atStartOfDay());
        HttpServletRequest http = proxy(HttpServletRequest.class, (method, values) -> "getRemoteAddr".equals(method) ? "192.168.1.1" : null);
        equal(true, service.sign(contract.getContractId(), sign, http).warning(), "gateway signing IP is marked unreliable");
        equal(1, fixture.mapper(OaContractMapper.class).selectById(contract.getContractId()).getSignedFlag(), "signed file reference persisted");
        fails(ServiceException.class, () -> service.sign(contract.getContractId(), sign, http), "signature cannot be overwritten");
        equal(true, service.downloadSignedFile(contract.getContractId()).getBody().length > 0, "authorized signature file readable");
    }
}
