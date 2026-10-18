package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.domain.dto.TimesheetSaveDTO;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.OaApprovalParticipant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OaTimesheetService implements OaApprovalParticipant {
    private final OaTimesheetMapper sheets;
    private final OaTimesheetDetailMapper details;
    private final OaTimesheetQueryMapper query;
    private final OaIdentityReferenceMapper identities;
    private final OaProjectMapper projects;
    private final OaProjectTaskMapper projectTasks;
    private final OaTimesheetCalculationService calculation;
    private final OaProjectAccountingService accounting;
    private final OaApprovalOutboxService approvals;
    private final OaProjectAuditService audit;

    public OaIdentityReference employee() { return myEmployee(false); }

    public List<OaProjectTask> availableTasks(Long projectId) {
        return availableTasks(projectId, null, null);
    }

    public List<OaProjectTask> availableTasks(Long projectId, LocalDate from, LocalDate to) {
        if (availableProjects(from, to).stream().noneMatch(project -> Objects.equals(project.getProjectId(), projectId))) throw new IllegalArgumentException("只能查看本人参与项目的任务");
        return projectTasks.selectList(new LambdaQueryWrapper<OaProjectTask>().eq(OaProjectTask::getTenantId, OaRecordSupport.tenantId())
                .eq(OaProjectTask::getProjectId, projectId).eq(OaProjectTask::getDeleted, 0).eq(OaProjectTask::getIsGroupFlag, 0)
                .ne(OaProjectTask::getStatus, "CANCELLED").orderByAsc(OaProjectTask::getSortNo, OaProjectTask::getTaskId));
    }

    public List<OaProject> availableProjects() {
        return availableProjects(null, null);
    }

    public List<OaProject> availableProjects(LocalDate from, LocalDate to) {
        LocalDate fromDate = from == null ? LocalDate.now() : from;
        LocalDate toDate = to == null ? fromDate : to;
        if (fromDate.isAfter(toDate) || ChronoUnit.DAYS.between(fromDate, toDate) > 30) throw new IllegalArgumentException("工时选择期间必须为1至31天");
        List<OaProject> result = query.availableProjectsForPeriod(OaRecordSupport.tenantId(), UserContext.getUserId(), fromDate, toDate);
        if (!costsVisible()) for (OaProject project : result) {
            project.setLaborCostAmount(null); project.setActualCostAmount(null); project.setEstimatedCost(null);
            project.setGrossMargin(null); project.setGrossMarginRate(null);
        }
        return result;
    }

    public PageResult<OaTimesheet> page(String status, boolean review, PageQuery pageQuery) {
        LambdaQueryWrapper<OaTimesheet> wrapper = new LambdaQueryWrapper<OaTimesheet>().eq(OaTimesheet::getTenantId, OaRecordSupport.tenantId())
                .eq(OaTimesheet::getDeleted, 0).eq(status != null && !status.isBlank(), OaTimesheet::getStatus, status).orderByDesc(OaTimesheet::getStartDate, OaTimesheet::getTimesheetId);
        if (review) {
            if (!StpUtil.hasPermission("oa:timesheet:review")) throw new IllegalArgumentException("无工时审核查看权限");
            List<Long> ids = query.reviewableSheetIds(OaRecordSupport.tenantId(), UserContext.getUserId());
            if (ids.isEmpty()) wrapper.eq(OaTimesheet::getTimesheetId, -1L); else wrapper.in(OaTimesheet::getTimesheetId, ids);
        } else wrapper.eq(OaTimesheet::getEmployeeId, myEmployee(false).getId());
        PageResult<OaTimesheet> result = PageResult.build(sheets.selectPage(pageQuery.build(), wrapper));
        if (!costsVisible()) result.getRows().forEach(sheet -> sheet.setCostingAmount(null));
        return result;
    }

    public TimesheetSaveDTO detail(Long id) {
        OaTimesheet sheet = OaRecordSupport.active(sheets.selectById(id)); assertReadable(sheet);
        TimesheetSaveDTO result = new TimesheetSaveDTO(); result.setTimesheet(sheet); result.setDetails(rawDetails(id));
        if (!costsVisible()) {
            sheet.setCostingAmount(null);
            for (OaTimesheetDetail item : result.getDetails()) { item.setCostingRate(null); item.setCostingAmount(null); }
        }
        return result;
    }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    @Audit(name = "保存本人工时单", spel = "#request.timesheet.timesheetId")
    public Long save(TimesheetSaveDTO request) {
        OaIdentityReference employee = myEmployee(true);
        OaTimesheet sheet = OaRecordSupport.require(request.getTimesheet(), "工时单不能为空");
        if (sheet.getTimesheetId() == null) {
            OaRecordSupport.create(sheet, "timesheetId"); sheet.setTimesheetNo("GS" + UUID.randomUUID().toString().replace("-", ""));
        } else {
            OaTimesheet previous = OaRecordSupport.active(sheets.selectForUpdate(sheet.getTimesheetId(), OaRecordSupport.tenantId())); assertOwner(previous, employee);
            if (!Set.of("DRAFT", "REJECTED").contains(previous.getStatus())) throw new IllegalArgumentException("已提交工时不能修改，已审批工时请新建冲正单");
            OaRecordSupport.update(sheet, previous); sheet.setTimesheetNo(previous.getTimesheetNo());
        }
        sheet.setEmployeeId(employee.getId()); sheet.setEmployeeName(employee.getName()); sheet.setDeptId(employee.getDeptId());
        sheet.setStatus("DRAFT"); sheet.setInstanceId(null); sheet.setSubmitTime(null); sheet.setApproveTime(null); sheet.setRejectReason(null);
        calculation.prepare(sheet, request.getDetails(), employee, false);
        if (sheet.getTimesheetId() == null) OaRecordSupport.saved(sheets.insert(sheet)); else OaRecordSupport.saved(sheets.updateById(sheet));
        details.update(null, new LambdaUpdateWrapper<OaTimesheetDetail>().eq(OaTimesheetDetail::getTenantId, OaRecordSupport.tenantId())
                .eq(OaTimesheetDetail::getTimesheetId, sheet.getTimesheetId()).eq(OaTimesheetDetail::getDeleted, 0).set(OaTimesheetDetail::getDeleted, 1));
        for (OaTimesheetDetail item : request.getDetails()) {
            OaRecordSupport.create(item, "detailId"); item.setTimesheetId(sheet.getTimesheetId()); OaRecordSupport.saved(details.insert(item));
        }
        return sheet.getTimesheetId();
    }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void submit(Long id) {
        OaIdentityReference employee = myEmployee(true);
        OaTimesheet sheet = OaRecordSupport.active(sheets.selectForUpdate(id, OaRecordSupport.tenantId())); assertOwner(sheet, employee);
        if (Set.of("SUBMITTED", "APPROVING").contains(sheet.getStatus())) return;
        if (!Set.of("DRAFT", "REJECTED").contains(sheet.getStatus())) throw new IllegalArgumentException("仅草稿或驳回工时可以提交");
        List<OaTimesheetDetail> items = rawDetails(id);
        OaProjectAuditService.Snapshot before = audit.timesheet(sheet, items);
        calculation.prepare(sheet, items, employee, true);
        for (OaTimesheetDetail item : items) { OaRecordSupport.touch(item); OaRecordSupport.saved(details.updateById(item)); }
        List<String> approverIds = items.stream().map(OaTimesheetDetail::getProjectId).distinct().sorted()
                .map(projectId -> OaRecordSupport.active(projects.selectById(projectId)))
                .map(project -> OaRecordSupport.require(identities.user(project.getOwnerId(), OaRecordSupport.tenantId()), "项目经理未配置或已停用").getId().toString()).distinct().toList();
        sheet.setInstanceId(approvals.queue(getSupportedBusinessType(), id, sheet.getTimesheetNo(), "oa_timesheet_approval",
                Map.of("approverIds", approverIds, "employeeName", sheet.getEmployeeName(), "totalHours", sheet.getTotalHours(), "startDate", sheet.getStartDate().toString(), "endDate", sheet.getEndDate().toString())));
        sheet.setStatus("SUBMITTED"); sheet.setSubmitTime(LocalDateTime.now()); sheet.setApproveTime(null); sheet.setRejectReason(null);
        OaRecordSupport.touch(sheet); OaRecordSupport.saved(sheets.updateById(sheet));
        audit.record(OaProjectAuditService.Action.TIMESHEET_SUBMITTED, before, audit.timesheet(sheet, items), Map.of(), null);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除草稿工时单", highRisk = true, spel = "#id")
    public void remove(Long id) {
        OaIdentityReference employee = myEmployee(true);
        OaTimesheet sheet = OaRecordSupport.active(sheets.selectForUpdate(id, OaRecordSupport.tenantId())); assertOwner(sheet, employee);
        if (!Set.of("DRAFT", "REJECTED").contains(sheet.getStatus())) throw new IllegalArgumentException("已提交工时不能删除");
        OaRecordSupport.touch(sheet);
        OaRecordSupport.saved(sheets.update(null, new LambdaUpdateWrapper<OaTimesheet>()
                .eq(OaTimesheet::getTimesheetId, id).eq(OaTimesheet::getTenantId, OaRecordSupport.tenantId())
                .eq(OaTimesheet::getDeleted, 0).eq(OaTimesheet::getVersion, sheet.getVersion())
                .set(OaTimesheet::getDeleted, 1).set(OaTimesheet::getVersion, sheet.getVersion() + 1)
                .set(OaTimesheet::getUpdateBy, sheet.getUpdateBy()).set(OaTimesheet::getUpdateTime, sheet.getUpdateTime())));
        details.update(null, new LambdaUpdateWrapper<OaTimesheetDetail>()
                .eq(OaTimesheetDetail::getTimesheetId, id).eq(OaTimesheetDetail::getTenantId, OaRecordSupport.tenantId())
                .eq(OaTimesheetDetail::getDeleted, 0).set(OaTimesheetDetail::getDeleted, 1)
                .set(OaTimesheetDetail::getUpdateBy, sheet.getUpdateBy()).set(OaTimesheetDetail::getUpdateTime, sheet.getUpdateTime()));
    }

    @Override
    public String getSupportedBusinessType() { return "OA_TIMESHEET"; }

    @Override
    public String currentInstance(Long id) { return OaRecordSupport.active(sheets.selectById(id)).getInstanceId(); }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void bindInstance(OaApprovalRequest request, String instanceId) {
        OaTimesheet sheet = OaRecordSupport.active(sheets.selectForUpdate(request.getBusinessId(), OaRecordSupport.tenantId()));
        if (!request.getReservation().equals(sheet.getInstanceId())) return;
        sheet.setInstanceId(instanceId); sheet.setStatus("APPROVING"); OaRecordSupport.touch(sheet); OaRecordSupport.saved(sheets.updateById(sheet)); approvals.recordBinding(request, instanceId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void handleApproved(ApprovalResultDTO result) { approvalResult(result, true); }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void handleRejected(ApprovalResultDTO result) { approvalResult(result, false); }

    private void approvalResult(ApprovalResultDTO result, boolean accepted) {
        OaTimesheet reference = OaRecordSupport.active(sheets.selectById(result.getBusinessId()));
        OaIdentityReference employee = OaRecordSupport.require(identities.employeeRecord(reference.getEmployeeId(), OaRecordSupport.tenantId()), "原员工记录不存在");
        OaRecordSupport.require(identities.userForUpdate(employee.getUserId(), OaRecordSupport.tenantId()), "原员工账号不存在");
        OaTimesheet sheet = OaRecordSupport.active(sheets.selectForUpdate(reference.getTimesheetId(), OaRecordSupport.tenantId()));
        if (!OaApprovalOutboxService.matches(sheet.getInstanceId(), result) || !Set.of("SUBMITTED", "APPROVING").contains(sheet.getStatus())) return;
        List<OaTimesheetDetail> items = rawDetails(sheet.getTimesheetId());
        OaProjectAuditService.Snapshot before = audit.timesheet(sheet, items);
        approvals.snapshot(result);
        List<Long> projectIds = items.stream().map(OaTimesheetDetail::getProjectId).distinct().sorted().toList();
        for (Long projectId : projectIds) OaRecordSupport.active(projects.selectForUpdate(projectId, OaRecordSupport.tenantId()));
        sheet.setStatus(accepted ? "APPROVED" : "REJECTED"); sheet.setApproveTime(accepted ? LocalDateTime.now() : null);
        sheet.setRejectReason(accepted ? null : result.getApprovalComment()); OaRecordSupport.touch(sheet); OaRecordSupport.saved(sheets.updateById(sheet));
        if (accepted) for (Long projectId : projectIds) accounting.recalculate(projectId);
        audit.record(accepted ? OaProjectAuditService.Action.TIMESHEET_APPROVED : OaProjectAuditService.Action.TIMESHEET_REJECTED,
                before, audit.timesheet(sheet, items), Map.of("projectIds", projectIds), result);
    }

    private List<OaTimesheetDetail> rawDetails(Long id) {
        return details.selectList(new LambdaQueryWrapper<OaTimesheetDetail>().eq(OaTimesheetDetail::getTenantId, OaRecordSupport.tenantId())
                .eq(OaTimesheetDetail::getTimesheetId, id).eq(OaTimesheetDetail::getDeleted, 0).orderByAsc(OaTimesheetDetail::getWorkDate, OaTimesheetDetail::getDetailId));
    }

    private OaIdentityReference myEmployee(boolean lock) {
        Long userId = OaRecordSupport.require(UserContext.getUserId(), "用户未登录");
        if (lock) OaRecordSupport.require(identities.userForUpdate(userId, OaRecordSupport.tenantId()), "账号不存在");
        List<OaIdentityReference> matches = identities.employeesForUser(userId, OaRecordSupport.tenantId());
        if (matches.size() != 1) throw new IllegalArgumentException("当前账号须关联唯一在职员工，请联系人事配置");
        return matches.get(0);
    }

    private void assertOwner(OaTimesheet sheet, OaIdentityReference employee) { OaRecordSupport.same(sheet.getEmployeeId(), employee.getId(), "只能操作本人工时单"); }

    private void assertReadable(OaTimesheet sheet) {
        OaIdentityReference employee = identities.employeeRecord(sheet.getEmployeeId(), OaRecordSupport.tenantId());
        if (employee != null && Objects.equals(employee.getUserId(), UserContext.getUserId())) return;
        if (StpUtil.hasPermission("oa:timesheet:review") && query.reviewableSheetIds(OaRecordSupport.tenantId(), UserContext.getUserId()).contains(sheet.getTimesheetId())) return;
        throw new IllegalArgumentException("无权查看该工时单");
    }

    private boolean costsVisible() { return StpUtil.hasPermission("oa:activity-cost:list"); }
}
