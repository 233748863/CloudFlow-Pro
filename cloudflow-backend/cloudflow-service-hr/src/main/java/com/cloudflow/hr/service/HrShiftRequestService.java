package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.hr.domain.dto.HrHRequests.*;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.domain.vo.attendance.HrHViews.*;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrShiftRequestService {
    public static final String BUSINESS_TYPE = "HR_SHIFT_REQUEST";
    private final HrShiftRequestMapper requests;
    private final HrScheduleAssignmentMapper assignments;
    private final HrAttendanceRuleMapper rules;
    private final HrEmployeeMapper employees;
    private final HrLookupMapper lookups;
    private final HrHMapper mapper;
    private final HrHSupport helper;
    private final HrRuleSupport support;
    private final HrPayrollCalculationService payroll;
    private final HrRuleWorkflowService workflow;
    private final HrHEventService events;
    private final HolidayCalendarService calendars;

    public PageResult<ShiftRequestVO> list(ShiftRequestQuery query, boolean mine) {
        helper.permission(mine ? "hr:shift-request:mine" : "hr:shift-request:list");
        List<Long> employeeIds = helper.scopedEmployees(query, mine);
        if (employeeIds.isEmpty()) return new PageResult<>(List.of(), 0L, query.getPageNum().longValue(), query.getPageSize().longValue());
        Page<HrShiftRequest> page = requests.selectPage(new Page<>(query.getPageNum(), query.getPageSize()), query(query).in(HrShiftRequest::getEmployeeId, employeeIds));
        return new PageResult<>(page.getRecords().stream().map(this::listView).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public PageResult<ShiftInvitationVO> invitations(ShiftRequestQuery query) {
        helper.permission("hr:shift-request:respond"); Long employeeId = helper.mine().getId();
        Page<HrShiftRequest> page = requests.selectPage(new Page<>(query.getPageNum(), query.getPageSize()), query(query)
                .eq(HrShiftRequest::getSwapEmployeeId, employeeId).ne(HrShiftRequest::getStatus, "DRAFT"));
        return new PageResult<>(page.getRecords().stream().map(this::invitationView).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    private LambdaQueryWrapper<HrShiftRequest> query(ShiftRequestQuery query) {
        helper.validate(query); HrHSupport.dateRange(query.getDateFrom(), query.getDateTo());
        LambdaQueryWrapper<HrShiftRequest> wrapper = new LambdaQueryWrapper<HrShiftRequest>().eq(HrShiftRequest::getTenantId, tenantId())
                .eq(HrShiftRequest::getDeleted, 0).ge(query.getDateFrom() != null, HrShiftRequest::getFromDate, query.getDateFrom())
                .le(query.getDateTo() != null, HrShiftRequest::getFromDate, query.getDateTo())
                .eq(query.getStatus() != null, HrShiftRequest::getStatus, query.getStatus())
                .eq(query.getApplicationStatus() != null, HrShiftRequest::getApplicationStatus, query.getApplicationStatus());
        boolean ascending = "asc".equals(query.getSortOrder());
        if ("workDate".equals(query.getSortBy())) wrapper.orderBy(true, ascending, HrShiftRequest::getFromDate);
        else if ("requestNo".equals(query.getSortBy())) wrapper.orderBy(true, ascending, HrShiftRequest::getRequestNo);
        else wrapper.orderBy(true, ascending, HrShiftRequest::getCreateTime);
        return wrapper.orderByAsc(HrShiftRequest::getRequestId);
    }

    public ShiftRequestDetailVO detail(Long id) {
        HrShiftRequest row = get(id);
        if (helper.owner(row.getEmployeeId())) helper.permission("hr:shift-request:mine");
        else { helper.permission("hr:shift-request:list"); helper.scope(row.getEmployeeId()); }
        return detailView(row);
    }

    public ShiftInvitationVO invitation(Long id) {
        helper.permission("hr:shift-request:respond"); HrShiftRequest row = get(id); peer(row);
        if ("DRAFT".equals(row.getStatus())) throw forbidden();
        return invitationView(row);
    }

    public ShiftOptionsVO options(LocalDate date) {
        helper.permission("hr:shift-request:apply"); future(date); helper.minimumRestMinutes();
        HrEmployee employee = helper.mine(); HrHSupport.Slot own = helper.slot(employee.getId(), date); workSlot(own);
        ShiftOptionsVO view = new ShiftOptionsVO(); view.setAttendanceDate(date); view.setOwnSlot(helper.slotView(own));
        List<EligibleShiftVO> shifts = new ArrayList<>();
        for (HrAttendanceRule rule : rules.selectList(new LambdaQueryWrapper<HrAttendanceRule>().eq(HrAttendanceRule::getTenantId, tenantId()).eq(HrAttendanceRule::getStatus, 1))) {
            if (!rule.hasValidCheckMethods()) continue;
            if (Objects.equals(rule.getShiftId(), own.shift().getId())) continue;
            try {
                HrHSupport.Slot target = target(own, rule.getShiftId(), rule.getId()); workSlot(target);
                EligibleShiftVO option = new EligibleShiftVO(); option.setShiftId(target.shift().getId()); option.setShiftName(target.shift().getShiftName());
                option.setRuleId(rule.getId()); option.setStartTime(target.shift().getStartTime()); option.setEndTime(target.shift().getEndTime()); shifts.add(option);
            } catch (HrHException | HrBusinessException blocked) { }
        }
        List<EligiblePeerVO> peers = new ArrayList<>();
        for (HrEmployee candidate : employees.selectList(new LambdaQueryWrapper<HrEmployee>().eq(HrEmployee::getTenantId, tenantId())
                .eq(HrEmployee::getDeleted, 0).eq(HrEmployee::getDeptId, employee.getDeptId()).ne(HrEmployee::getId, employee.getId()))) {
            try {
                helper.activeEmployee(candidate.getId(), date); helper.linkedUser(candidate);
                HrHSupport.Slot slot = helper.slot(candidate.getId(), date); workSlot(slot);
                if (Objects.equals(slot.shift().getId(), own.shift().getId())) continue;
                EligiblePeerVO option = new EligiblePeerVO(); option.setEmployeeId(candidate.getId()); option.setName(candidate.getName()); option.setShiftName(slot.shift().getShiftName()); peers.add(option);
            } catch (HrHException | HrBusinessException blocked) { }
        }
        view.setEligibleShifts(shifts); view.setEligiblePeers(peers); return view;
    }

    public ShiftPreviewVO preview(ShiftDraftDTO input) {
        helper.permission("hr:shift-request:apply"); helper.validate(input); HrShiftRequest draft = draft(helper.mine(), input);
        ShiftPreviewVO view = new ShiftPreviewVO(); view.setBeforeSlots(List.of()); view.setAfterSlots(List.of()); view.setRestGaps(List.of()); view.setBlockers(List.of());
        try {
            Plan plan = plan(draft); view.setBeforeSlots(plan.before().stream().map(helper::slotView).toList());
            view.setAfterSlots(plan.after().stream().map(helper::slotView).toList()); view.setRestGaps(plan.gaps()); view.setMinimumRestMinutes(plan.rest());
        } catch (HrHException failure) { view.setBlockers(List.of(blocker(failure.getCode(), failure.getMessage()))); }
        catch (HrBusinessException failure) { view.setBlockers(List.of(blocker(failure.getCode(), "排班依据不完整，请先核查规则"))); }
        return view;
    }

    public ShiftRequestDetailVO create(ShiftDraftDTO input, String idempotencyKey) {
        helper.permission("hr:shift-request:apply"); helper.validate(input); HrEmployee employee = helper.mine();
        String key = HrHSupport.key(idempotencyKey); String digest = creationDigest(employee.getId(), input);
        HrShiftRequest draft = draft(employee, input);
        try {
            return helper.locked(locks(draft), () -> {
                HrShiftRequest previous = mapper.shiftReplay(tenantId(), employee.getId(), key);
                if (previous != null) return replay(previous, digest);
                lockEmployees(draft); setPlan(draft, plan(draft));
                draft.setRequestNo("SR-" + UUID.randomUUID().toString().replace("-", "")); draft.setIdempotencyKey(key); draft.setRequestDigest(digest);
                draft.setStatus("DRAFT"); draft.setApplicationStatus("NOT_READY"); draft.setPeerAcceptanceStatus("NONE"); draft.setDeleted(0); draft.setVersion(0);
                draft.setCreateBy(userName()); draft.setUpdateBy(userName()); draft.setCreateTime(HrHSupport.now()); draft.setUpdateTime(HrHSupport.now());
                requests.insert(draft); audit(draft, "CREATE"); return detailView(draft);
            });
        } catch (DuplicateKeyException duplicate) {
            HrShiftRequest previous = mapper.shiftReplay(tenantId(), employee.getId(), key);
            if (previous == null) throw conflict("CREATE_CONFLICT", "创建发生冲突，请重放原请求");
            return replay(previous, digest);
        }
    }

    public ShiftRequestDetailVO update(Long id, ShiftDraftDTO input) {
        helper.permission("hr:shift-request:apply"); helper.validate(input); HrShiftRequest original = get(id); helper.own(original.getEmployeeId());
        HrShiftRequest candidate = draft(helper.employee(original.getEmployeeId()), input); candidate.setRequestId(id);
        List<Long> employeeIds = new ArrayList<>(participants(original)); employeeIds.addAll(participants(candidate));
        List<Long> orderedEmployees = employeeIds.stream().distinct().sorted().toList();
        LocalDate from = original.getFromDate().isBefore(candidate.getFromDate()) ? original.getFromDate() : candidate.getFromDate();
        LocalDate to = original.getToDate().isAfter(candidate.getToDate()) ? original.getToDate() : candidate.getToDate();
        List<String> resources = new ArrayList<>(); resources.add("attendance-config"); helper.attendanceLocks(resources, orderedEmployees, from.minusDays(1), to.plusDays(1));
        return helper.locked(resources, () -> {
            if (mapper.lockEmployees(tenantId(), orderedEmployees).size() != orderedEmployees.size()) throw conflict("EMPLOYEE_NOT_FOUND", "调班员工依据不完整");
            HrShiftRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion()); state(row, "DRAFT");
            row.setRequestMode(candidate.getRequestMode()); row.setFromDate(candidate.getFromDate()); row.setToDate(candidate.getToDate());
            row.setToShiftId(candidate.getToShiftId()); row.setToRuleId(candidate.getToRuleId()); row.setSwapEmployeeId(candidate.getSwapEmployeeId()); row.setReason(candidate.getReason());
            setPlan(row, plan(row)); save(row); audit(row, "EDIT"); return detailView(row);
        });
    }

    @Audit(name = "删除调班草稿", spel = "#id", highRisk = true)
    public void delete(Long id, Integer version) {
        helper.permission("hr:shift-request:apply"); HrShiftRequest original = get(id); helper.own(original.getEmployeeId());
        helper.locked(locks(original), () -> { HrShiftRequest row = locked(id); HrHSupport.version(version, row.getVersion()); state(row, "DRAFT"); row.setDeleted(1); save(row); audit(row, "DELETE"); return null; });
    }

    public ShiftRequestDetailVO submit(Long id, VersionDTO input) {
        helper.permission("hr:shift-request:apply"); helper.validate(input); HrShiftRequest original = get(id); helper.own(original.getEmployeeId());
        return helper.locked(locks(original), () -> {
            lockEmployees(original); HrShiftRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion()); state(row, "DRAFT"); verifyPlan(row);
            ObjectNode snapshot = helper.tree(row.getScheduleSnapshot());
            Map<String, Object> actors = helper.approvals(BUSINESS_TYPE, helper.employee(row.getEmployeeId()), row.getSwapEmployeeId() == null ? null : helper.employee(row.getSwapEmployeeId()));
            actors.forEach((field, value) -> snapshot.set(field, helper.convert(value, JsonNode.class))); row.setScheduleSnapshot(snapshot.toString());
            if ("SWAP".equals(row.getRequestMode())) { row.setStatus("WAITING_ACCEPTANCE"); row.setPeerAcceptanceStatus("PENDING"); save(row); invite(row); }
            else ready(row);
            audit(row, "SUBMIT"); return detailView(row);
        });
    }

    public ShiftInvitationVO respond(Long id, ShiftResponseDTO input) {
        helper.permission("hr:shift-request:respond"); helper.validate(input); HrShiftRequest original = get(id); peer(original);
        if ("DECLINED".equals(input.getDecision())) HrHSupport.text(input.getNote(), 500);
        return helper.locked(locks(original), () -> {
            lockEmployees(original); HrShiftRequest row = locked(id); peer(row); HrHSupport.version(input.getVersion(), row.getVersion()); state(row, "WAITING_ACCEPTANCE");
            if (!"PENDING".equals(row.getPeerAcceptanceStatus())) throw conflict("PEER_ALREADY_RESPONDED", "已回应的同意邀请不能再次修改");
            if ("ACCEPTED".equals(input.getDecision())) { verifyPlan(row); helper.verifyActors(BUSINESS_TYPE, helper.tree(row.getScheduleSnapshot()), helper.employee(row.getEmployeeId()), helper.employee(row.getSwapEmployeeId())); }
            row.setPeerAcceptanceStatus(input.getDecision()); row.setPeerRespondedBy(helper.user()); row.setPeerRespondedTime(HrHSupport.now()); row.setPeerResponseNote(input.getNote() == null ? null : input.getNote().trim());
            if ("ACCEPTED".equals(input.getDecision())) ready(row); else { row.setStatus("REJECTED"); save(row); notifyResult(row); }
            audit(row, "PEER_RESPONSE"); return invitationView(row);
        });
    }

    @Audit(name = "撤回调班申请", spel = "#id", highRisk = true)
    public ShiftRequestDetailVO cancel(Long id, ReasonVersionDTO input) {
        helper.permission("hr:shift-request:cancel"); helper.validate(input); HrShiftRequest original = get(id); helper.own(original.getEmployeeId());
        return support.lockedWithoutTransaction("rule-workflow:" + BUSINESS_TYPE + ":" + id, () -> helper.locked(locks(original), () -> {
            HrShiftRequest row = locked(id); if ("CANCELLED".equals(row.getStatus())) return detailView(row);
            HrHSupport.version(input.getVersion(), row.getVersion());
            if (!List.of("DRAFT", "WAITING_ACCEPTANCE", "PENDING", "APPROVING").contains(row.getStatus())) throw conflict("CANCEL_NOT_ALLOWED", "已终审的调班申请不能撤回");
            row.setStatus("CANCELLED"); save(row); workflow.cancel(BUSINESS_TYPE, id); audit(row, "CANCEL"); notifyResult(row); return detailView(row);
        }));
    }

    public ShiftRequestDetailVO retry(Long id, ReasonVersionDTO input) {
        helper.permission("hr:shift-request:retry"); helper.validate(input); HrShiftRequest original = get(id); helper.scope(original.getEmployeeId());
        if (original.getSwapEmployeeId() != null) helper.scope(original.getSwapEmployeeId());
        return helper.locked(locks(original), () -> {
            lockEmployees(original); HrShiftRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion()); state(row, "APPROVED");
            if (!"FAILED".equals(row.getApplicationStatus())) throw conflict("RETRY_NOT_ALLOWED", "仅应用失败的已批准申请可重试");
            verifyPlan(row); row.setApplicationStatus("PENDING"); save(row); audit(row, "RETRY"); events.execution(HrHEventService.SHIFT_APPLY, id, row.getVersion()); return detailView(row);
        });
    }

    private void ready(HrShiftRequest row) {
        ObjectNode snapshot = helper.tree(row.getScheduleSnapshot());
        helper.verifyActors(BUSINESS_TYPE, snapshot, helper.employee(row.getEmployeeId()), row.getSwapEmployeeId() == null ? null : helper.employee(row.getSwapEmployeeId()));
        row.setStatus("PENDING"); save(row);
        Map<String, Object> variables = new TreeMap<>(); variables.put("requestId", row.getRequestId().toString()); variables.put("requestNo", row.getRequestNo());
        variables.put("employeeId", row.getEmployeeId().toString()); variables.put("deptId", row.getDeptId().toString()); variables.put("attendanceDate", row.getFromDate().toString());
        variables.put("requestMode", row.getRequestMode()); variables.put("detailPath", "/hr/shift-request?requestId=" + row.getRequestId());
        for (String field : List.of("applicantUserId", HrHSupport.EXCLUDED_USERS, "responsibleApproverIds", "hrApproverIds")) variables.put(field, helper.convert(snapshot.path(field), Object.class));
        workflow.enqueueForApplicant(BUSINESS_TYPE, row.getRequestId(), row.getRequestNo(), "调班申请审批", HrHSupport.number(snapshot.path("applicantUserId").asText()), variables);
    }

    public void onApproval(ApprovalResultDTO result) {
        HrShiftRequest original = get(result.getBusinessId());
        helper.locked(locks(original), () -> {
            HrShiftRequest row = locked(result.getBusinessId());
            if (!Objects.equals(row.getTenantId(), result.getTenantId()) || !Objects.equals(row.getRequestNo(), result.getBusinessNo()) || !BUSINESS_TYPE.equals(result.getBusinessType())) throw conflict("CALLBACK_IDENTITY_CONFLICT", "调班回调与业务单据不一致");
            if ("CANCELLED".equals(row.getStatus())) return null;
            if (row.getInstanceId() == null) throw conflict("WORKFLOW_BINDING_PENDING", "等待审批实例绑定恢复");
            if (!row.getInstanceId().equals(result.getProcessInstanceId())) throw conflict("WORKFLOW_BINDING_CONFLICT", "审批实例不匹配");
            helper.callbackActor(helper.tree(row.getScheduleSnapshot()), result.getApproverId(), result.getApprovalResult());
            if (List.of("APPROVED", "REJECTED").contains(row.getStatus())) return null;
            state(row, "APPROVING"); if (!List.of("APPROVED", "REJECTED").contains(result.getApprovalResult())) throw invalid("审批结果无效");
            if ("SWAP".equals(row.getRequestMode()) && (!"ACCEPTED".equals(row.getPeerAcceptanceStatus()) || row.getPeerRespondedBy() == null)) throw conflict("PEER_CONSENT_REQUIRED", "互换申请缺少对方同意");
            if (!events.mark(result, "SHIFT_DECISION")) return null;
            row.setStatus(result.getApprovalResult()); row.setApproverId(result.getApproverId());
            if ("APPROVED".equals(row.getStatus())) row.setApplicationStatus("PENDING");
            save(row); audit(row, "APPROVAL_RESULT");
            if ("APPROVED".equals(row.getStatus())) events.execution(HrHEventService.SHIFT_APPLY, row.getRequestId(), row.getVersion()); else notifyResult(row);
            return null;
        });
    }

    public void apply(Long id, Integer expectedVersion) {
        HrShiftRequest original = get(id);
        try {
            helper.locked(locks(original), () -> {
                lockEmployees(original); HrShiftRequest row = locked(id);
                if (!"APPROVED".equals(row.getStatus())) return null;
                if ("APPLIED".equals(row.getApplicationStatus())) { verifyApplied(row); return null; }
                if (!Objects.equals(expectedVersion, row.getVersion())) return null;
                if (!"PENDING".equals(row.getApplicationStatus())) return null;
                Plan plan = verifyPlan(row);
                if (!mapper.sourceAssignments(tenantId(), id).isEmpty()) throw conflict("SHIFT_SOURCE_CONFLICT", "排班来源与未完成申请不一致");
                for (HrHSupport.Slot slot : plan.after()) {
                    HrScheduleAssignment assignment = new HrScheduleAssignment(); assignment.setTenantId(tenantId()); assignment.setTargetType("EMPLOYEE");
                    assignment.setTargetId(slot.employeeId()); assignment.setTargetName(helper.employee(slot.employeeId()).getName()); assignment.setRuleId(slot.rule().getId());
                    assignment.setShiftId(slot.shift().getId()); assignment.setScheduleDate(slot.date()); assignment.setEffectiveStart(slot.date()); assignment.setEffectiveEnd(slot.date());
                    assignment.setStatus("PUBLISHED"); assignment.setSourceShiftRequestId(id); assignment.setVersion(0); assignment.setCreateTime(HrHSupport.now()); assignment.setUpdateTime(HrHSupport.now());
                    assignments.insert(assignment);
                    HrHSupport.Slot actual = helper.slot(slot.employeeId(), slot.date());
                    if (!assignment.getId().equals(actual.assignmentId()) || !slot.shift().getId().equals(actual.shift().getId()) || !slot.rule().getId().equals(actual.rule().getId())
                            || !helper.digest(slot.calendar()).equals(helper.digest(actual.calendar()))) throw conflict("SHIFT_PRIORITY_CONFLICT", "新单日排班未成为实际有效排班，整笔操作已回滚");
                }
                row.setApplicationStatus("APPLIED"); row.setAppliedTime(HrHSupport.now()); row.setLastErrorCode(null); row.setLastErrorMessage(null); save(row);
                audit(row, "APPLIED"); notifyResult(row); calendars.invalidateAssignments(); return null;
            });
        } catch (HrHException failure) { recordFailure(original, failure.getCode(), failure.getMessage()); }
        catch (HrBusinessException failure) { recordFailure(original, failure.getCode(), "排班应用被既有业务规则阻塞"); }
        catch (RuntimeException failure) { recordFailure(original, "SHIFT_APPLY_FAILED", "调班暂未应用，可按原快照重试"); }
    }

    private void recordFailure(HrShiftRequest original, String code, String message) {
        helper.locked(locks(original), () -> {
            HrShiftRequest row = locked(original.getRequestId());
            if (!Objects.equals(row.getVersion(), original.getVersion()) || !"APPROVED".equals(row.getStatus()) || !"PENDING".equals(row.getApplicationStatus())) return null;
            row.setApplicationStatus("FAILED"); row.setLastErrorCode(code); row.setLastErrorMessage(message); save(row); audit(row, "APPLICATION_FAILED"); notifyResult(row); return null;
        });
    }

    private Plan plan(HrShiftRequest row) {
        future(row.getFromDate());
        if (!Objects.equals(row.getFromDate(), row.getToDate())) throw invalid("首轮调班仅支持同一考勤日");
        HrEmployee applicant = helper.activeEmployee(row.getEmployeeId(), row.getFromDate()); helper.linkedUser(applicant);
        if (!Objects.equals(applicant.getDeptId(), row.getDeptId())) throw conflict("DEPARTMENT_CHANGED", "申请人部门已经变化");
        int rest = helper.minimumRestMinutes();
        List<HrHSupport.Slot> before = new ArrayList<>(); List<HrHSupport.Slot> after = new ArrayList<>();
        HrHSupport.Slot own = helper.slot(applicant.getId(), row.getFromDate()); workSlot(own); before.add(own);
        if ("SINGLE".equals(row.getRequestMode())) {
            if (row.getSwapEmployeeId() != null || Objects.equals(own.shift().getId(), row.getToShiftId())) throw invalid("单人调班须选择不同的目标班次且不指定互换员工");
            after.add(target(own, row.getToShiftId(), row.getToRuleId()));
        } else if ("SWAP".equals(row.getRequestMode())) {
            if (row.getSwapEmployeeId() == null || row.getSwapEmployeeId().equals(applicant.getId())) throw invalid("互换必须指定另一名同部门员工");
            HrEmployee peer = helper.activeEmployee(row.getSwapEmployeeId(), row.getFromDate()); helper.linkedUser(peer);
            if (!applicant.getDeptId().equals(peer.getDeptId()) || helper.linkedUser(applicant).equals(helper.linkedUser(peer))) throw conflict("SWAP_EMPLOYEE_INVALID", "互换双方须属于同部门且关联不同登录用户");
            HrHSupport.Slot peerSlot = helper.slot(peer.getId(), row.getFromDate()); workSlot(peerSlot); before.add(peerSlot);
            if (own.shift().getId().equals(peerSlot.shift().getId())) throw invalid("双方原班次相同，无需互换");
            after.add(target(own, peerSlot.shift().getId(), peerSlot.rule().getId()));
            after.add(target(peerSlot, own.shift().getId(), own.rule().getId()));
        } else throw invalid("调班模式无效");
        List<Map<String, Object>> neighbors = new ArrayList<>(); List<RestGapVO> gaps = new ArrayList<>();
        for (int index = 0; index < before.size(); index++) {
            HrHSupport.Slot oldSlot = before.get(index); HrHSupport.Slot newSlot = after.get(index); workSlot(newSlot);
            LocalDateTime from = oldSlot.start().isBefore(newSlot.start()) ? oldSlot.start() : newSlot.start();
            LocalDateTime to = oldSlot.end().isAfter(newSlot.end()) ? oldSlot.end() : newSlot.end();
            for (LocalDate date = from.toLocalDate(); !date.isAfter(to.toLocalDate()); date = date.plusDays(1)) helper.monthOpen(oldSlot.employeeId(), date);
            if (mapper.rawAttendance(tenantId(), oldSlot.employeeId(), oldSlot.date(), from, to) > 0
                    || mapper.manualAttendance(tenantId(), oldSlot.employeeId(), from.toLocalDate(), to.toLocalDate()) > 0) throw conflict("SHIFT_ATTENDANCE_EXISTS", "受影响时段已有原始卡或人工考勤结论");
            if (payroll.hasCoverage(oldSlot.employeeId(), from.toLocalDate(), to.toLocalDate())) throw conflict("SHIFT_PAYROLL_EXISTS", "受影响日期已经生成工资覆盖");
            helper.noLeave(oldSlot.employeeId(), oldSlot.date(), from, to);
            if (mapper.overtimeOverlap(tenantId(), oldSlot.employeeId(), null, from, to) > 0) throw conflict("OVERTIME_OVERLAP", "受影响时段存在已占用的加班申请");
            if (mapper.shiftOverlap(tenantId(), oldSlot.employeeId(), row.getRequestId(), from.toLocalDate().minusDays(1), to.toLocalDate()) > 0) throw conflict("SHIFT_OVERLAP", "受影响时段存在待完成调班申请");
            neighbors(newSlot, rest, neighbors, gaps);
        }
        Map<String, Object> snapshot = new TreeMap<>(); snapshot.put("minimumRestMinutes", rest);
        snapshot.put("before", before.stream().map(helper::slotSnapshot).toList()); snapshot.put("after", after.stream().map(helper::slotSnapshot).toList());
        snapshot.put("neighbors", neighbors); snapshot.put("bindings", participants(row).stream().map(employeeId -> {
            HrEmployee employee = helper.employee(employeeId); return Map.of("employeeId", employeeId.toString(), "deptId", employee.getDeptId().toString(), "userId", helper.linkedUser(employee).toString());
        }).toList());
        return new Plan(before, after, gaps, rest, snapshot);
    }

    private void neighbors(HrHSupport.Slot proposed, int rest, List<Map<String, Object>> snapshots, List<RestGapVO> gaps) {
        long days = rest / 1440L + 2;
        HrHSupport.Slot previous = null; HrHSupport.Slot next = null;
        for (LocalDate date = proposed.date().minusDays(days); !date.isAfter(proposed.date().plusDays(days)); date = date.plusDays(1)) {
            if (date.equals(proposed.date()) || mapper.assignment(tenantId(), proposed.employeeId(), date) == null) continue;
            HrHSupport.Slot neighbor = helper.slot(proposed.employeeId(), date);
            if (!"WORKDAY".equals(neighbor.calendar().get("dateType"))) continue;
            workSlot(neighbor); snapshots.add(helper.slotSnapshot(neighbor));
            if (neighbor.start().isBefore(proposed.end()) && neighbor.end().isAfter(proposed.start())) throw conflict("SHIFT_TIME_OVERLAP", "新班次与相邻实际工作班次交叠");
            if (!neighbor.end().isAfter(proposed.start()) && (previous == null || neighbor.end().isAfter(previous.end()))) previous = neighbor;
            if (!neighbor.start().isBefore(proposed.end()) && (next == null || neighbor.start().isBefore(next.start()))) next = neighbor;
        }
        if (previous != null) gaps.add(gap(proposed.employeeId(), previous.end(), proposed.start(), rest));
        if (next != null) gaps.add(gap(proposed.employeeId(), proposed.end(), next.start(), rest));
    }

    private RestGapVO gap(Long employeeId, LocalDateTime end, LocalDateTime start, int required) {
        long minutes = ChronoUnit.MINUTES.between(end, start);
        if (minutes < required || start.isBefore(end)) throw conflict("SHIFT_REST_INSUFFICIENT", "新班次与相邻工作班次之间休息时间不足");
        RestGapVO view = new RestGapVO(); view.setEmployeeId(employeeId); view.setPreviousEnd(end); view.setNextStart(start); view.setGapMinutes(minutes); return view;
    }

    private HrHSupport.Slot target(HrHSupport.Slot original, Long shiftId, Long ruleId) {
        HrShift shift = helper.shift(shiftId); HrAttendanceRule rule = helper.rule(ruleId);
        if (!Objects.equals(rule.getShiftId(), shift.getId())) throw conflict("RULE_SHIFT_CONFLICT", "目标规则与目标班次不兼容");
        return new HrHSupport.Slot(original.employeeId(), original.date(), null, null, shift, rule,
                helper.calendarForShift(original.employeeId(), original.date(), shift), original.date().toString());
    }

    private void workSlot(HrHSupport.Slot slot) {
        if (!"WORKDAY".equals(slot.calendar().get("dateType"))) throw conflict("SHIFT_NOT_WORKDAY", "首轮调班只能替换实际工作日已有工作班");
        if (slot.shift().getBreakMinutes() == null) throw conflict("SHIFT_BREAK_REQUIRED", "班次休息分钟未核定");
        HrShiftBreaks.resolve(slot.shift(), slot.date(), slot.rule().getConfigJson(), slot.shift().getBreakMinutes() > 0);
    }

    private void future(LocalDate date) { if (date == null || !date.isAfter(HrHSupport.today())) throw invalid("调班日期须严格晚于今天"); }

    private Plan verifyPlan(HrShiftRequest row) {
        Plan current = plan(row); ObjectNode frozen = helper.tree(row.getScheduleSnapshot());
        if (!helper.digest(current.snapshot()).equals(frozen.path("planDigest").asText()) || !Objects.equals(row.getMinimumRestMinutes(), current.rest())) {
            throw conflict("SHIFT_SNAPSHOT_CONFLICT", "双方排班、班次、规则、日历或身份依据已变化，须取消并重建申请");
        }
        return current;
    }

    private void setPlan(HrShiftRequest row, Plan plan) {
        row.setFromShiftId(plan.before().get(0).shift().getId()); row.setFromRuleId(plan.before().get(0).rule().getId());
        row.setToShiftId(plan.after().get(0).shift().getId()); row.setToRuleId(plan.after().get(0).rule().getId()); row.setMinimumRestMinutes(plan.rest());
        row.setScheduleSnapshot(helper.json(Map.of("plan", plan.snapshot(), "planDigest", helper.digest(plan.snapshot()))));
    }

    private void verifyApplied(HrShiftRequest row) {
        List<HrScheduleAssignment> sources = mapper.sourceAssignments(tenantId(), row.getRequestId());
        List<ShiftSlotVO> expected = slots(row, "after");
        if (sources.size() != expected.size() || sources.size() != participants(row).size()) throw conflict("SHIFT_SOURCE_CONFLICT", "已应用申请的排班来源不完整");
        for (ShiftSlotVO slot : expected) {
            long count = sources.stream().filter(source -> "EMPLOYEE".equals(source.getTargetType()) && Objects.equals(source.getTargetId(), slot.getEmployeeId())
                    && Objects.equals(source.getScheduleDate(), slot.getAttendanceDate()) && Objects.equals(source.getShiftId(), slot.getShiftId())
                    && Objects.equals(source.getRuleId(), slot.getRuleId()) && "PUBLISHED".equals(source.getStatus())).count();
            if (count != 1) throw conflict("SHIFT_SOURCE_CONFLICT", "已应用申请的排班依据被改变");
        }
    }

    private HrShiftRequest draft(HrEmployee employee, ShiftDraftDTO input) {
        if ("SINGLE".equals(input.getRequestMode()) && (input.getTargetShiftId() == null || input.getTargetRuleId() == null || input.getSwapEmployeeId() != null)
                || "SWAP".equals(input.getRequestMode()) && (input.getSwapEmployeeId() == null || input.getTargetShiftId() != null || input.getTargetRuleId() != null)) throw invalid("调班模式与目标字段不匹配");
        HrShiftRequest row = new HrShiftRequest(); row.setTenantId(tenantId()); row.setEmployeeId(employee.getId()); row.setDeptId(employee.getDeptId());
        row.setRequestMode(input.getRequestMode()); row.setFromDate(input.getAttendanceDate()); row.setToDate(input.getAttendanceDate()); row.setSwapEmployeeId(input.getSwapEmployeeId());
        row.setToShiftId(input.getTargetShiftId()); row.setToRuleId(input.getTargetRuleId()); row.setReason(HrHSupport.text(input.getReason(), 800)); return row;
    }

    private String creationDigest(Long employeeId, ShiftDraftDTO input) {
        Map<String, Object> payload = new TreeMap<>(); payload.put("tenantId", tenantId()); payload.put("employeeId", employeeId);
        payload.put("requestMode", input.getRequestMode()); payload.put("attendanceDate", input.getAttendanceDate().toString()); payload.put("targetShiftId", input.getTargetShiftId());
        payload.put("targetRuleId", input.getTargetRuleId()); payload.put("swapEmployeeId", input.getSwapEmployeeId()); payload.put("reason", HrHSupport.text(input.getReason(), 800)); return helper.digest(payload);
    }

    private ShiftRequestDetailVO replay(HrShiftRequest row, String digest) {
        if (!Objects.equals(row.getRequestDigest(), digest)) throw conflict("IDEMPOTENCY_CONFLICT", "同一创建键不能用于不同申请内容");
        helper.own(row.getEmployeeId()); return detailView(row);
    }

    public HrShiftRequest get(Long id) { return assertRow(id == null ? null : requests.selectById(id)); }
    private HrShiftRequest locked(Long id) { return assertRow(mapper.shiftLocked(tenantId(), id)); }
    private HrShiftRequest assertRow(HrShiftRequest row) {
        if (row == null || !Objects.equals(row.getTenantId(), tenantId()) || flag(row.getDeleted())) throw new HrHException("SHIFT_REQUEST_NOT_FOUND", "调班申请不存在", 404);
        return row;
    }
    private void state(HrShiftRequest row, String status) { if (!status.equals(row.getStatus())) throw conflict("STATE_CONFLICT", "当前调班状态不允许此操作"); }
    private void peer(HrShiftRequest row) { if (!Objects.equals(row.getSwapEmployeeId(), helper.mine().getId()) || !"SWAP".equals(row.getRequestMode())) throw forbidden(); }
    private void save(HrShiftRequest row) {
        row.setUpdateBy(userName()); row.setUpdateTime(HrHSupport.now());
        if (requests.updateById(row) != 1) throw conflict("VERSION_CONFLICT", "调班申请已经变化");
    }
    private List<Long> participants(HrShiftRequest row) {
        return row.getSwapEmployeeId() == null ? List.of(row.getEmployeeId()) : List.of(row.getEmployeeId(), row.getSwapEmployeeId()).stream().distinct().sorted().toList();
    }
    private List<String> locks(HrShiftRequest row) {
        List<String> result = new ArrayList<>(); result.add("attendance-config"); helper.attendanceLocks(result, participants(row), row.getFromDate().minusDays(1), row.getToDate().plusDays(1)); return result;
    }
    private void lockEmployees(HrShiftRequest row) {
        if (mapper.lockEmployees(tenantId(), participants(row)).size() != participants(row).size()) throw conflict("EMPLOYEE_NOT_FOUND", "调班双方员工依据不完整");
    }

    private ShiftRequestVO listView(HrShiftRequest row) { ShiftRequestVO view = helper.view(row, new ShiftRequestVO()); names(row, view); return view; }
    private void names(HrShiftRequest row, ShiftRequestVO view) {
        view.setEmployeeName(helper.employee(row.getEmployeeId()).getName()); view.setDeptName(lookups.findDeptName(tenantId(), row.getDeptId()));
        view.setFromShiftName(helper.shiftName(row.getFromShiftId())); view.setToShiftName(helper.shiftName(row.getToShiftId()));
        if (row.getSwapEmployeeId() != null) view.setSwapEmployeeName(helper.employee(row.getSwapEmployeeId()).getName()); view.setAllowedActions(actions(row));
    }
    private ShiftRequestDetailVO detailView(HrShiftRequest row) {
        ShiftRequestDetailVO view = helper.view(row, new ShiftRequestDetailVO()); names(row, view); view.setBeforeSlots(slots(row, "before")); view.setAfterSlots(slots(row, "after")); return view;
    }
    private List<ShiftSlotVO> slots(HrShiftRequest row, String field) {
        List<ShiftSlotVO> result = new ArrayList<>(); for (JsonNode slot : helper.tree(row.getScheduleSnapshot()).path("plan").path(field)) result.add(helper.convert(slot.path("slot"), ShiftSlotVO.class)); return result;
    }
    private ShiftInvitationVO invitationView(HrShiftRequest row) {
        ShiftInvitationVO view = helper.view(row, new ShiftInvitationVO()); view.setApplicantName(helper.employee(row.getEmployeeId()).getName()); view.setAttendanceDate(row.getFromDate());
        for (ShiftSlotVO slot : slots(row, "before")) { if (Objects.equals(slot.getEmployeeId(), row.getSwapEmployeeId())) view.setOwnBefore(slot); else view.setApplicantBefore(slot); }
        for (ShiftSlotVO slot : slots(row, "after")) { if (Objects.equals(slot.getEmployeeId(), row.getSwapEmployeeId())) view.setOwnAfter(slot); else view.setApplicantAfter(slot); }
        view.setAllowedActions("WAITING_ACCEPTANCE".equals(row.getStatus()) && "PENDING".equals(row.getPeerAcceptanceStatus()) && helper.permitted("hr:shift-request:respond") ? List.of("accept", "decline") : List.of()); return view;
    }
    private List<String> actions(HrShiftRequest row) {
        if (flag(row.getDeleted())) return List.of();
        List<String> actions = new ArrayList<>(); boolean owner = helper.owner(row.getEmployeeId());
        if (owner && helper.permitted("hr:shift-request:apply") && "DRAFT".equals(row.getStatus())) actions.addAll(List.of("edit", "delete", "submit"));
        if (owner && helper.permitted("hr:shift-request:cancel") && List.of("DRAFT", "WAITING_ACCEPTANCE", "PENDING", "APPROVING").contains(row.getStatus())) actions.add("cancel");
        if (helper.permitted("hr:shift-request:retry") && "APPROVED".equals(row.getStatus()) && "FAILED".equals(row.getApplicationStatus())) actions.add("retry"); return actions;
    }
    private void invite(HrShiftRequest row) {
        events.notify("HR_SHIFT_REQUEST_INVITATION", BUSINESS_TYPE, row.getRequestId(), row.getRequestNo(), row.getStatus(), row.getVersion(),
                helper.tree(row.getScheduleSnapshot()).path("plan").path("bindings").findValues("userId").stream().map(value -> HrHSupport.number(value.asText()))
                        .filter(userId -> !userId.toString().equals(helper.tree(row.getScheduleSnapshot()).path("applicantUserId").asText())).toList(),
                "回应换班邀请", "/hr/ess/shift-request?invitationId=" + row.getRequestId());
    }
    private void notifyResult(HrShiftRequest row) {
        events.notify("HR_REQUEST_EXECUTION_RESULT", BUSINESS_TYPE, row.getRequestId(), row.getRequestNo(), row.getStatus() + "/" + row.getApplicationStatus(), row.getVersion(),
                helper.tree(row.getScheduleSnapshot()).path("plan").path("bindings").findValues("userId").stream().map(value -> HrHSupport.number(value.asText())).toList(),
                "查看调班结果", "/hr/ess/shift-request?requestId=" + row.getRequestId());
    }
    private void audit(HrShiftRequest row, String action) {
        support.audit(BUSINESS_TYPE, row.getRequestId(), action, Map.of("requestId", row.getRequestId(), "status", row.getStatus(), "applicationStatus", row.getApplicationStatus(), "version", row.getVersion()));
    }
    private BusinessBlockerVO blocker(String code, String message) { BusinessBlockerVO blocker = new BusinessBlockerVO(); blocker.setCode(code); blocker.setMessage(message); return blocker; }
    private record Plan(List<HrHSupport.Slot> before, List<HrHSupport.Slot> after, List<RestGapVO> gaps, int rest, Map<String, Object> snapshot) {}
}
