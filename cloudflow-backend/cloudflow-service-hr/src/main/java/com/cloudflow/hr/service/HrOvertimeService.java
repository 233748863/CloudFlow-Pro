package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.hr.client.HrHRuleClient;
import com.cloudflow.hr.client.dto.BusinessRuleDTO;
import com.cloudflow.hr.client.dto.BusinessRuleHitRecordDTO;
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

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrOvertimeService {
    public static final String BUSINESS_TYPE = "HR_OVERTIME";
    private final HrOvertimeRequestMapper requests;
    private final HrHMapper mapper;
    private final HrLookupMapper lookups;
    private final HrLeavePeriodMapper leavePeriods;
    private final HrHSupport helper;
    private final HrRuleSupport support;
    private final HrOvertimeTypeService types;
    private final HrRuleWorkflowService workflow;
    private final HrHEventService events;
    private final HrHRuleClient businessRules;
    private final HrOvertimeSettlementService settlements;
    private final HrHCipherService cipher;

    public PageResult<OvertimeListVO> list(OvertimeQuery query, boolean mine) {
        helper.permission(mine ? "hr:overtime:mine" : "hr:overtime:list"); helper.validate(query);
        HrHSupport.dateRange(query.getWorkDateFrom(), query.getWorkDateTo());
        List<Long> employees = helper.scopedEmployees(query, mine);
        if (employees.isEmpty()) return new PageResult<>(List.of(), 0, query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<HrOvertimeRequest> wrapper = new LambdaQueryWrapper<HrOvertimeRequest>().eq(HrOvertimeRequest::getTenantId, tenantId())
                .eq(HrOvertimeRequest::getDeleted, 0).in(HrOvertimeRequest::getEmployeeId, employees)
                .ge(query.getWorkDateFrom() != null, HrOvertimeRequest::getWorkDate, query.getWorkDateFrom())
                .le(query.getWorkDateTo() != null, HrOvertimeRequest::getWorkDate, query.getWorkDateTo())
                .eq(query.getStatus() != null, HrOvertimeRequest::getStatus, query.getStatus())
                .eq(query.getSettlementStatus() != null, HrOvertimeRequest::getSettlementStatus, query.getSettlementStatus())
                .eq(query.getSettleMode() != null, HrOvertimeRequest::getSettleMode, query.getSettleMode());
        boolean ascending = "asc".equals(query.getSortOrder());
        if ("workDate".equals(query.getSortBy())) wrapper.orderBy(true, ascending, HrOvertimeRequest::getWorkDate);
        else if ("requestNo".equals(query.getSortBy())) wrapper.orderBy(true, ascending, HrOvertimeRequest::getRequestNo);
        else wrapper.orderBy(true, ascending, HrOvertimeRequest::getCreateTime);
        wrapper.orderByAsc(HrOvertimeRequest::getRequestId);
        Page<HrOvertimeRequest> page = requests.selectPage(new Page<>(query.getPageNum(), query.getPageSize()), wrapper);
        return new PageResult<>(page.getRecords().stream().map(this::listView).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public OvertimeDetailVO detail(Long id) {
        HrOvertimeRequest row = get(id);
        if (helper.owner(row.getEmployeeId())) helper.permission("hr:overtime:mine");
        else { helper.permission("hr:overtime:list"); helper.scope(row.getEmployeeId()); }
        return detailView(row);
    }

    public List<OvertimeExportVO> export(OvertimeQuery query, boolean mine) {
        helper.permission(mine ? "hr:overtime:mine" : "hr:overtime:export"); helper.validate(query);
        query.setPageSize(100); query.setPageNum(1); List<OvertimeExportVO> result = new ArrayList<>();
        PageResult<OvertimeListVO> page;
        do {
            page = list(query, mine);
            for (OvertimeListVO row : page.getRows()) {
                OvertimeExportVO view = helper.view(row, new OvertimeExportVO()); view.setRequestId(row.getRequestId().toString()); view.setWorkDate(row.getWorkDate().toString()); result.add(view);
            }
            query.setPageNum(query.getPageNum() + 1);
        } while (page.getPageNum() * page.getPageSize() < page.getTotal());
        support.audit(BUSINESS_TYPE, null, "EXPORT", Map.of("count", result.size())); return result;
    }

    public OvertimeOptionsVO options() {
        helper.permission("hr:overtime:apply"); helper.mine();
        OvertimeOptionsVO view = new OvertimeOptionsVO(); view.setBusinessTimezone(HrHSupport.BUSINESS_ZONE.getId());
        List<OvertimeOptionVO> eligible = new ArrayList<>();
        for (HrOvertimeType type : types.all()) {
            if (!flag(type.getStatus())) continue;
            try { types.validateEnabled(type); }
            catch (HrHException blocked) { continue; }
            OvertimeOptionVO option = helper.view(type, new OvertimeOptionVO()); option.setEligibleSettleModes(types.modes(type)); eligible.add(option);
        }
        view.setTypes(eligible); return view;
    }

    public OvertimePreviewVO preview(OvertimeDraftDTO input) {
        helper.permission("hr:overtime:apply"); helper.validate(input);
        HrEmployee employee = helper.mine();
        HrOvertimeRequest draft = draft(employee, input);
        OvertimePreviewVO view = new OvertimePreviewVO(); view.setWorkDate(draft.getWorkDate()); view.setRequestedMinutes(draft.getRequestedMinutes());
        view.setSegments(List.of()); view.setWarnings(List.of()); view.setBlockers(List.of());
        try {
            Context context = context(draft, !draft.getEndTime().isAfter(HrHSupport.now()));
            fillPreview(view, context);
            if (context.calculation() != null) view.setWarnings(limits(draft, context, false));
        } catch (HrHException failure) { view.setBlockers(List.of(blocker(failure.getCode(), failure.getMessage()))); }
        catch (HrBusinessException failure) { view.setBlockers(List.of(blocker(failure.getCode(), failure.getMessage()))); }
        return view;
    }

    public OvertimeDetailVO create(OvertimeDraftDTO input, String idempotencyKey) {
        helper.permission("hr:overtime:apply"); helper.validate(input);
        HrEmployee employee = helper.mine(); HrOvertimeRequest draft = draft(employee, input);
        String key = HrHSupport.key(idempotencyKey); String digest = creationDigest(employee.getId(), input);
        try {
            return helper.locked(helper.overtimeLocks(draft), () -> {
                HrOvertimeRequest previous = mapper.overtimeReplay(tenantId(), employee.getId(), key);
                if (previous != null) return replay(previous, digest);
                Context context = context(draft, false); applyContext(draft, context, false);
                draft.setRequestNo("OT-" + UUID.randomUUID().toString().replace("-", "")); draft.setIdempotencyKey(key); draft.setRequestDigest(digest);
                draft.setStatus("DRAFT"); draft.setSettlementStatus("NOT_READY"); draft.setSettledFlag(0); draft.setDeleted(0); draft.setVersion(0);
                draft.setCreateBy(userName()); draft.setCreateTime(HrHSupport.now()); draft.setUpdateBy(userName()); draft.setUpdateTime(HrHSupport.now());
                requests.insert(draft); audit(draft, "CREATE"); return detailView(draft);
            });
        } catch (DuplicateKeyException duplicate) {
            HrOvertimeRequest previous = mapper.overtimeReplay(tenantId(), employee.getId(), key);
            if (previous == null) throw conflict("CREATE_CONFLICT", "创建申请发生冲突，请重试原请求");
            return replay(previous, digest);
        }
    }

    public OvertimeDetailVO update(Long id, OvertimeDraftDTO input) {
        helper.permission("hr:overtime:apply"); helper.validate(input);
        HrOvertimeRequest original = get(id); helper.own(original.getEmployeeId());
        HrOvertimeRequest proposed = draft(helper.employee(original.getEmployeeId()), input);
        List<String> keys = new ArrayList<>(); keys.add("attendance-config");
        keys.addAll(List.of("overtime:" + original.getEmployeeId() + ":" + YearMonth.from(original.getWorkDate()),
                "overtime:" + original.getEmployeeId() + ":" + YearMonth.from(proposed.getWorkDate())).stream().distinct().sorted().toList());
        helper.attendanceLocks(keys, List.of(original.getEmployeeId()), original.getWorkDate().isBefore(proposed.getWorkDate()) ? original.getWorkDate().minusDays(1) : proposed.getWorkDate().minusDays(1),
                original.getWorkDate().isAfter(proposed.getWorkDate()) ? original.getWorkDate().plusDays(1) : proposed.getWorkDate().plusDays(1));
        return helper.locked(keys, () -> {
            HrOvertimeRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion()); state(row, "DRAFT");
            row.setStartTime(proposed.getStartTime()); row.setEndTime(proposed.getEndTime()); row.setWorkDate(proposed.getWorkDate());
            row.setRequestedMinutes(proposed.getRequestedMinutes()); row.setSettleMode(proposed.getSettleMode()); row.setReason(proposed.getReason());
            applyContext(row, context(row, false), false); save(row); audit(row, "UPDATE"); return detailView(row);
        });
    }

    @Audit(name = "删除加班草稿", spel = "#id", highRisk = true)
    public void delete(Long id, Integer version) {
        helper.permission("hr:overtime:apply"); HrOvertimeRequest original = get(id); helper.own(original.getEmployeeId());
        helper.locked(helper.overtimeLocks(original), () -> {
            HrOvertimeRequest row = locked(id); HrHSupport.version(version, row.getVersion()); state(row, "DRAFT");
            row.setDeleted(1); save(row); audit(row, "DELETE_DRAFT"); return null;
        });
    }

    public OvertimeDetailVO submit(Long id, VersionDTO input) {
        helper.permission("hr:overtime:apply"); helper.validate(input); HrOvertimeRequest original = get(id); helper.own(original.getEmployeeId());
        return helper.locked(helper.overtimeLocks(original), () -> {
            HrOvertimeRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion()); state(row, "DRAFT");
            Context context = context(row, true); List<RuleWarningVO> warnings = limits(row, context, true);
            Map<String, Object> policy = new TreeMap<>(helper.approvals(BUSINESS_TYPE, helper.employee(row.getEmployeeId()), null));
            policy.put("calendar", context.calendar()); policy.put("type", context.type()); policy.put("typeDigest", helper.digest(context.type())); policy.put("warnings", warnings);
            applyContext(row, context, true); row.setPolicySnapshot(helper.json(policy)); row.setStatus("SUBMITTED"); save(row); audit(row, "SUBMIT");
            notifyProcessors(row, "hr:overtime:verify", "核定工时"); return detailView(row);
        });
    }

    public OvertimeDetailVO reviewHours(Long id, OvertimeHoursReviewDTO input) {
        helper.validate(input); HrOvertimeRequest original = get(id); helper.operator(original.getEmployeeId(), "hr:overtime:verify");
        List<String> keys = new ArrayList<>(helper.overtimeLocks(original));
        HrLeavePeriod period = "COMPENSATORY".equals(original.getSettleMode()) ? leavePeriod(original.getWorkDate()) : null;
        if (period != null) keys.add("leave:" + original.getEmployeeId() + ":" + original.getLeaveTypeId());
        return helper.locked(keys, () -> {
            if (period != null) assertLeaveOpen(leavePeriods.selectLocked(period.getPeriodId(), tenantId()));
            HrOvertimeRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion()); state(row, "SUBMITTED");
            if (row.getApprovedMinutes() != null) throw conflict("HOURS_ALREADY_REVIEWED", "工时已核定，有误须撤回重建");
            verifyFrozen(row);
            if (input.getApprovedMinutes() > row.getActualMinutes()) throw invalid("核定分钟不能超过实际分钟");
            row.setApprovedMinutes(input.getApprovedMinutes()); row.setApprovedHours(HrOvertimeCalculator.hours(input.getApprovedMinutes()));
            row.setReviewedBy(helper.user()); row.setReviewedTime(HrHSupport.now()); row.setReviewNote(HrHSupport.text(input.getNote(), 500));
            if (period != null) { types.leaveType(row.getLeaveTypeId()); row.setLeavePeriodId(period.getPeriodId()); ready(row); }
            else { save(row); notifyProcessors(row, "hr:overtime:price", "核定加班费"); }
            audit(row, "REVIEW_HOURS"); return detailView(row);
        });
    }

    public OvertimeDetailVO reviewPay(Long id, OvertimePayReviewDTO input) {
        helper.validate(input); HrOvertimeRequest original = get(id); helper.operator(original.getEmployeeId(), "hr:overtime:price");
        if (!"PAY".equals(original.getSettleMode())) throw conflict("SETTLE_MODE_CONFLICT", "此申请不使用加班费结算");
        HrPayrollPeriod period = settlements.payrollPeriod(input.getPayrollPeriodId());
        return helper.locked(settlements.locks(original, List.of(period.getPeriodId())), () -> {
            settlements.assertPricingTarget(original, period.getPeriodId());
            HrOvertimeRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion()); state(row, "SUBMITTED");
            if (row.getApprovedMinutes() == null || row.getPricedBy() != null) throw conflict("PAY_REVIEW_NOT_READY", "须先完成工时核定且只能核价一次");
            verifyFrozen(row); types.component(row.getSalaryComponentId()); settlements.assertCurrency(row);
            BigDecimal amount = HrOvertimeCalculator.money(row.getApprovedMinutes(), input.getHourlyRate(), row.getRateMultiplier());
            row.setHourlyRateCipher(cipher.seal(input.getHourlyRate().toPlainString())); row.setSettlementAmountCipher(cipher.seal(amount.toPlainString()));
            row.setPayrollPeriodId(period.getPeriodId()); row.setPricedBy(helper.user()); row.setPricedTime(HrHSupport.now()); row.setPriceNote(HrHSupport.text(input.getNote(), 500));
            ready(row); audit(row, "REVIEW_PAY"); return detailView(row);
        });
    }

    public OvertimeDetailVO reviewReject(Long id, ReasonVersionDTO input) {
        helper.validate(input); HrOvertimeRequest original = get(id); helper.operator(original.getEmployeeId(), "hr:overtime:verify");
        return helper.locked(helper.overtimeLocks(original), () -> {
            HrOvertimeRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion()); state(row, "SUBMITTED");
            if (row.getApprovedMinutes() != null) throw conflict("HOURS_ALREADY_REVIEWED", "工时已核定，有误须由申请人撤回重建");
            row.setStatus("REJECTED"); row.setReviewNote(HrHSupport.text(input.getReason(), 500)); row.setReviewedBy(helper.user()); row.setReviewedTime(HrHSupport.now());
            save(row); audit(row, "REVIEW_REJECT"); notifyResult(row); return detailView(row);
        });
    }

    @Audit(name = "撤回加班申请", spel = "#id", highRisk = true)
    public OvertimeDetailVO cancel(Long id, ReasonVersionDTO input) {
        helper.validate(input); helper.permission("hr:overtime:cancel"); HrOvertimeRequest original = get(id); helper.own(original.getEmployeeId());
        return support.lockedWithoutTransaction("rule-workflow:" + BUSINESS_TYPE + ":" + id, () -> helper.locked(helper.overtimeLocks(original), () -> {
            HrOvertimeRequest row = locked(id);
            if ("CANCELLED".equals(row.getStatus())) return detailView(row);
            HrHSupport.version(input.getVersion(), row.getVersion());
            if (!List.of("DRAFT", "SUBMITTED", "PENDING", "APPROVING").contains(row.getStatus())) throw conflict("CANCEL_NOT_ALLOWED", "已终审的加班申请不能撤回");
            row.setStatus("CANCELLED"); save(row); workflow.cancel(BUSINESS_TYPE, id); audit(row, "CANCEL"); return detailView(row);
        }));
    }

    private void ready(HrOvertimeRequest row) {
        ObjectNode policy = helper.tree(row.getPolicySnapshot()); helper.verifyActors(BUSINESS_TYPE, policy, helper.employee(row.getEmployeeId()), null);
        row.setStatus("PENDING"); save(row);
        Map<String, Object> variables = new TreeMap<>();
        variables.put("requestId", row.getRequestId().toString()); variables.put("requestNo", row.getRequestNo()); variables.put("employeeId", row.getEmployeeId().toString());
        variables.put("deptId", row.getDeptId().toString()); variables.put("workDate", row.getWorkDate().toString()); variables.put("approvedMinutes", row.getApprovedMinutes());
        variables.put("settleMode", row.getSettleMode()); variables.put("detailPath", "/hr/overtime?requestId=" + row.getRequestId());
        for (String field : List.of("applicantUserId", HrHSupport.EXCLUDED_USERS, "responsibleApproverIds", "hrApproverIds")) variables.put(field, helper.convert(policy.path(field), Object.class));
        workflow.enqueueForApplicant(BUSINESS_TYPE, row.getRequestId(), row.getRequestNo(), "加班申请审批", HrHSupport.number(policy.path("applicantUserId").asText()), variables);
    }

    public void onApproval(ApprovalResultDTO result) {
        HrOvertimeRequest original = get(result.getBusinessId());
        helper.locked(helper.overtimeLocks(original), () -> {
            HrOvertimeRequest row = locked(result.getBusinessId());
            if (!Objects.equals(result.getTenantId(), row.getTenantId()) || !Objects.equals(result.getBusinessNo(), row.getRequestNo()) || !BUSINESS_TYPE.equals(result.getBusinessType())) throw conflict("CALLBACK_IDENTITY_CONFLICT", "审批回调与业务单据不一致");
            if ("CANCELLED".equals(row.getStatus())) return null;
            if (row.getInstanceId() == null) throw conflict("WORKFLOW_BINDING_PENDING", "等待可靠启动恢复审批实例绑定");
            if (!row.getInstanceId().equals(result.getProcessInstanceId())) throw conflict("WORKFLOW_BINDING_CONFLICT", "回调实例与当前审批实例不一致");
            helper.callbackActor(helper.tree(row.getPolicySnapshot()), result.getApproverId(), result.getApprovalResult());
            if (List.of("APPROVED", "REJECTED").contains(row.getStatus())) return null;
            state(row, "APPROVING");
            if (!List.of("APPROVED", "REJECTED").contains(result.getApprovalResult())) throw invalid("审批结果无效");
            if (!events.mark(result, "OVERTIME_DECISION")) return null;
            row.setStatus(result.getApprovalResult());
            if ("APPROVED".equals(row.getStatus())) row.setSettlementStatus("PENDING");
            save(row); audit(row, "APPROVAL_RESULT");
            if ("APPROVED".equals(row.getStatus())) events.execution(HrHEventService.OVERTIME_SETTLE, row.getRequestId(), row.getVersion());
            else notifyResult(row);
            return null;
        });
    }

    private void verifyFrozen(HrOvertimeRequest row) {
        Context current = context(row, true); ObjectNode policy = helper.tree(row.getPolicySnapshot());
        if (!Objects.equals(policy.path("typeDigest").asText(), helper.digest(current.type()))
                || !helper.tree(calculationSnapshot(current)).equals(helper.tree(row.getCalculationSnapshot()))
                || !helper.matchesSnapshot(current.calendar(), policy.path("calendar"))) {
            throw conflict("OVERTIME_SNAPSHOT_CONFLICT", "打卡、日历或核算配置已变化，须撤回并重新提交");
        }
        helper.verifyActors(BUSINESS_TYPE, policy, helper.employee(row.getEmployeeId()), null);
    }

    private List<RuleWarningVO> limits(HrOvertimeRequest row, Context context, boolean record) {
        R<BusinessRuleDTO> response;
        try { response = businessRules.getEffectiveRule("hr.overtime.hours.limit"); }
        catch (RuntimeException failure) { throw unavailable(); }
        if (response == null || !response.isSuccess()) throw unavailable();
        BusinessRuleDTO rule = response.getData();
        if (rule == null || !Integer.valueOf(1).equals(rule.getEnabled()) || !"hr.overtime.hours.limit".equals(rule.getRuleCode())
                || !"hr".equals(rule.getModule()) || rule.getThresholdValue() != null || !List.of("BLOCK", "WARN").contains(rule.getEffect())) {
            throw conflict("OVERTIME_RULE_MISSING", "加班规则须启用BLOCK或WARN，阈值只在加班类型中核定");
        }
        List<RuleWarningVO> warnings = new ArrayList<>(); YearMonth month = YearMonth.from(row.getWorkDate());
        boolean blocked = false;
        for (String dimension : List.of("DAY", "MONTH")) {
            long actual = mapper.actualMinutes(tenantId(), row.getEmployeeId(), row.getRequestId(), "DAY".equals(dimension) ? row.getWorkDate() : month.atDay(1),
                    "DAY".equals(dimension) ? row.getWorkDate() : month.atEndOfMonth()) + context.calculation().actualMinutes();
            BigDecimal threshold = "DAY".equals(dimension) ? context.type().getMaxHoursPerDay() : context.type().getMaxHoursPerMonth();
            if (!HrOvertimeCalculator.exceeds(actual, threshold)) continue;
            RuleWarningVO warning = new RuleWarningVO(); warning.setRuleCode(rule.getRuleCode()); warning.setDimension(dimension); warning.setEffect(rule.getEffect());
            warning.setLimitHours(threshold); warning.setActualHours(HrOvertimeCalculator.hours(actual)); warning.setMessage("DAY".equals(dimension) ? "超过员工自然日加班上限" : "超过员工自然月加班上限"); warnings.add(warning);
            if (record) {
                BusinessRuleHitRecordDTO hit = new BusinessRuleHitRecordDTO(); hit.setTenantId(tenantId()); hit.setRuleCode(rule.getRuleCode()); hit.setBusinessType("HR_OVERTIME_" + dimension);
                hit.setBusinessId(row.getRequestId()); hit.setThresholdValue(threshold); hit.setActualValue(HrOvertimeCalculator.hours(actual)); hit.setEffect(rule.getEffect()); hit.setHitResult(rule.getEffect());
                R<Void> written;
                try { written = businessRules.recordHit(hit); } catch (RuntimeException failure) { throw unavailable(); }
                if (written == null || !written.isSuccess()) throw unavailable();
            }
            blocked |= "BLOCK".equals(rule.getEffect());
        }
        if (blocked && record) throw conflict("OVERTIME_LIMIT_EXCEEDED", "加班实际分钟超过已核定日月上限");
        return warnings;
    }

    private HrLeavePeriod leavePeriod(LocalDate date) {
        List<HrLeavePeriod> periods = leavePeriods.selectList(new LambdaQueryWrapper<HrLeavePeriod>().eq(HrLeavePeriod::getTenantId, tenantId())
                .eq(HrLeavePeriod::getDeleted, 0).eq(HrLeavePeriod::getStatus, "OPEN").le(HrLeavePeriod::getStartDate, date).ge(HrLeavePeriod::getEndDate, date));
        if (periods.size() != 1) throw conflict("LEAVE_PERIOD_MISSING", "须有唯一覆盖加班日期的开放假期周期");
        return periods.get(0);
    }
    private void assertLeaveOpen(HrLeavePeriod period) {
        if (period == null || !Objects.equals(period.getTenantId(), tenantId()) || flag(period.getDeleted()) || !"OPEN".equals(period.getStatus())) throw conflict("PERIOD_CLOSED", "假期周期已关闭或失效");
    }
    private void notifyProcessors(HrOvertimeRequest row, String permission, String action) {
        Long applicant = HrHSupport.number(helper.tree(row.getPolicySnapshot()).path("applicantUserId").asText());
        List<Long> recipients = mapper.permissionUsers(tenantId(), permission, row.getDeptId()).stream().filter(userId -> !userId.equals(applicant)).toList();
        events.notify("HR_OVERTIME_ACTION_REQUIRED", BUSINESS_TYPE, row.getRequestId(), row.getRequestNo(), row.getStatus(), row.getVersion(), recipients, action, "/hr/overtime?requestId=" + row.getRequestId());
    }
    private void notifyResult(HrOvertimeRequest row) {
        events.notify("HR_REQUEST_EXECUTION_RESULT", BUSINESS_TYPE, row.getRequestId(), row.getRequestNo(), row.getStatus(), row.getVersion(),
                List.of(HrHSupport.number(helper.tree(row.getPolicySnapshot()).path("applicantUserId").asText())), "查看申请结果", "/hr/ess/overtime?requestId=" + row.getRequestId());
    }

    public <T> T withCheckin(com.cloudflow.hr.domain.dto.HrAttendanceCheckinPayload input, java.util.function.Function<CheckinLink, T> action) {
        HrOvertimeRequest original = get(input.getOvertimeRequestId()); helper.own(original.getEmployeeId());
        if (!Objects.equals(input.getEmployeeId(), original.getEmployeeId()) || input.getOvertimeTypeId() != null) throw forbidden();
        return helper.locked(helper.overtimeLocks(original), () -> {
            HrOvertimeRequest row = locked(original.getRequestId()); state(row, "DRAFT");
            LocalDateTime time = input.getCheckTime();
            if (time == null || time.isBefore(row.getStartTime()) || time.isAfter(row.getEndTime())
                    || "IN".equals(input.getLogType()) && !time.isBefore(row.getEndTime())
                    || "OUT".equals(input.getLogType()) && !time.isAfter(row.getStartTime())) throw invalid("加班打卡时间须位于本人草稿的有效进出边界");
            Context context = context(row, false);
            return action.apply(new CheckinLink(row.getRequestId(), context.type().getTypeId(), context.slot().shift(), context.slot().date()));
        });
    }

    public record CheckinLink(Long requestId, Long overtimeTypeId, HrShift shift, LocalDate attendanceDate) {}

    private HrOvertimeRequest draft(HrEmployee employee, OvertimeDraftDTO input) {
        HrOvertimeRequest row = new HrOvertimeRequest();
        row.setTenantId(tenantId()); row.setEmployeeId(employee.getId()); row.setDeptId(employee.getDeptId());
        row.setStartTime(input.getStartTime()); row.setEndTime(input.getEndTime()); row.setRequestedMinutes(HrOvertimeCalculator.requestedMinutes(input.getStartTime(), input.getEndTime()));
        row.setWorkDate(input.getStartTime().toLocalDate()); row.setReason(HrHSupport.text(input.getReason(), 800)); row.setSettleMode(input.getSettleMode()); row.setCurrency("CNY");
        return row;
    }

    private String creationDigest(Long employeeId, OvertimeDraftDTO input) {
        return helper.digest(Map.of("tenantId", tenantId(), "employeeId", employeeId, "startTime", input.getStartTime().toString(),
                "endTime", input.getEndTime().toString(), "settleMode", input.getSettleMode(), "reason", HrHSupport.text(input.getReason(), 800)));
    }

    private OvertimeDetailVO replay(HrOvertimeRequest row, String digest) {
        if (!Objects.equals(row.getRequestDigest(), digest)) throw conflict("IDEMPOTENCY_CONFLICT", "同一创建键已用于不同申请内容");
        if (flag(row.getDeleted())) throw conflict("DRAFT_DELETED", "该创建键对应的草稿已删除，不能复活");
        helper.own(row.getEmployeeId()); return detailView(row);
    }

    public HrOvertimeRequest get(Long id) {
        HrOvertimeRequest row = id == null ? null : requests.selectById(id);
        return assertRow(row);
    }

    private HrOvertimeRequest locked(Long id) { return assertRow(mapper.overtimeLocked(tenantId(), id)); }
    private HrOvertimeRequest assertRow(HrOvertimeRequest row) {
        if (row == null || !Objects.equals(row.getTenantId(), tenantId()) || flag(row.getDeleted())) throw new HrHException("OVERTIME_NOT_FOUND", "加班申请不存在", 404);
        return row;
    }
    private void state(HrOvertimeRequest row, String expected) { if (!expected.equals(row.getStatus())) throw conflict("STATE_CONFLICT", "当前申请状态不允许此操作"); }
    private void save(HrOvertimeRequest row) {
        row.setUpdateBy(userName()); row.setUpdateTime(HrHSupport.now());
        if (requests.updateById(row) != 1) throw conflict("VERSION_CONFLICT", "加班申请已变化");
    }
    private void audit(HrOvertimeRequest row, String action) {
        support.audit(BUSINESS_TYPE, row.getRequestId(), action, Map.of("requestId", row.getRequestId(), "status", row.getStatus(),
                "settlementStatus", row.getSettlementStatus(), "version", row.getVersion()));
    }

    private OvertimeListVO listView(HrOvertimeRequest row) {
        OvertimeListVO view = helper.view(row, new OvertimeListVO()); names(row, view); return view;
    }
    private void names(HrOvertimeRequest row, OvertimeListVO view) {
        view.setEmployeeName(helper.employee(row.getEmployeeId()).getName()); view.setDeptName(lookups.findDeptName(tenantId(), row.getDeptId()));
        view.setOvertimeTypeName(types.get(row.getOvertimeTypeId()).getTypeName()); view.setAllowedActions(actions(row));
    }
    private OvertimeDetailVO detailView(HrOvertimeRequest row) {
        OvertimeDetailVO view = helper.view(row, new OvertimeDetailVO()); names(row, view);
        if (row.getShiftId() != null) view.setShiftName(helper.shiftName(row.getShiftId()));
        ObjectNode calculation = helper.tree(row.getCalculationSnapshot()); ObjectNode policy = helper.tree(row.getPolicySnapshot());
        if (calculation.has("summary")) view.setCalculationSummary(helper.convert(calculation.path("summary"), CalculationSummaryVO.class));
        List<RuleWarningVO> warnings = new ArrayList<>(); for (JsonNode warning : policy.path("warnings")) warnings.add(helper.convert(warning, RuleWarningVO.class));
        view.setRuleWarnings(warnings); return view;
    }
    private List<String> actions(HrOvertimeRequest row) {
        if (flag(row.getDeleted())) return List.of();
        List<String> actions = new ArrayList<>(); boolean owner = helper.owner(row.getEmployeeId());
        if (owner && helper.permitted("hr:overtime:apply") && "DRAFT".equals(row.getStatus())) actions.addAll(List.of("edit", "delete", "submit"));
        if (owner && helper.permitted("hr:overtime:cancel") && List.of("DRAFT", "SUBMITTED", "PENDING", "APPROVING").contains(row.getStatus())) actions.add("cancel");
        if (!owner && "SUBMITTED".equals(row.getStatus())) {
            if (row.getApprovedMinutes() == null && helper.permitted("hr:overtime:verify")) actions.addAll(List.of("reviewHours", "reviewReject"));
            if (row.getApprovedMinutes() != null && "PAY".equals(row.getSettleMode()) && helper.permitted("hr:overtime:price")) actions.add("reviewPay");
        }
        if (owner || helper.permitted("PAY".equals(row.getSettleMode()) ? "hr:overtime:finance" : "hr:overtime:verify")) actions.add("settlement");
        return actions;
    }

    private Context context(HrOvertimeRequest request, boolean requireActual) {
        helper.activeEmployee(request.getEmployeeId(), request.getWorkDate());
        if (requireActual && request.getEndTime().isAfter(HrHSupport.now())) throw conflict("OVERTIME_NOT_ENDED", "加班时段结束后才能提交核定");
        List<HrAttendanceCheckin> raw = mapper.checkins(tenantId(), request.getEmployeeId(), request.getWorkDate().minusDays(1).atStartOfDay(), request.getWorkDate().plusDays(2).atStartOfDay());
        Map<LocalDate, List<HrAttendanceCheckin>> groups = raw.stream().filter(card -> card.getAttendanceDate() != null)
                .collect(Collectors.groupingBy(HrAttendanceCheckin::getAttendanceDate));
        List<LocalDate> candidates = groups.entrySet().stream().filter(entry -> entry.getValue().stream().anyMatch(card -> card.getCheckTime().isBefore(request.getEndTime()))
                && entry.getValue().stream().anyMatch(card -> card.getCheckTime().isAfter(request.getStartTime())))
                .filter(entry -> !entry.getKey().isBefore(request.getWorkDate().minusDays(1)) && !entry.getKey().isAfter(request.getWorkDate())).map(Map.Entry::getKey).toList();
        if (candidates.size() > 1) throw conflict("MULTIPLE_SHIFT_EVIDENCE", "申请不能唯一归属于一个实际班次");
        LocalDate attendanceDate = candidates.isEmpty() ? request.getWorkDate() : candidates.get(0);
        if (candidates.isEmpty()) {
            Map<String, Object> previous = mapper.assignment(tenantId(), request.getEmployeeId(), request.getWorkDate().minusDays(1));
            if (previous != null) {
                HrHSupport.Slot prior = helper.slot(request.getEmployeeId(), request.getWorkDate().minusDays(1));
                if (request.getStartTime().isBefore(prior.end()) && !request.getStartTime().isBefore(prior.start())) attendanceDate = prior.date();
            }
        }
        HrHSupport.Slot slot = helper.slot(request.getEmployeeId(), attendanceDate); helper.monthOpen(request.getEmployeeId(), attendanceDate);
        Map<String, Object> calendar = helper.calendar(request.getEmployeeId(), request.getWorkDate());
        if (!Objects.equals(HrHSupport.number(calendar.get("calendarId")), HrHSupport.number(slot.calendar().get("calendarId")))) throw conflict("CALENDAR_CONFLICT", "自然日与班次归属的日历不一致");
        String dayType = HrOvertimeCalculator.dayType(String.valueOf(calendar.get("dateType")), HrHSupport.number(calendar.get("triplePayFlag")).intValue());
        HrOvertimeType type = types.match(dayType);
        if (!types.modes(type).contains(request.getSettleMode())) throw conflict("SETTLE_MODE_DISABLED", "此加班类型未启用所选报酬方式");
        HrOvertimeCalculator.Calculation calculation = null;
        if (requireActual) {
            List<HrAttendanceCheckin> cards = groups.getOrDefault(attendanceDate, List.of());
            assertSingleShiftEvidence(slot, cards);
            for (HrAttendanceCheckin card : cards) if (card.getOvertimeTypeId() != null && card.getCheckTime().toLocalDate().equals(request.getWorkDate())
                    && !Objects.equals(card.getOvertimeTypeId(), type.getTypeId())) throw conflict("CHECKIN_TYPE_CONFLICT", "原始卡关联的加班类型与日历不一致");
            calculation = HrOvertimeCalculator.calculate(slot.shift(), slot.rule(), attendanceDate, "WORKDAY".equals(slot.calendar().get("dateType")),
                    request.getStartTime(), request.getEndTime(), cards);
            if (calculation.actualMinutes() <= 0) throw conflict("NO_ACTUAL_OVERTIME", "申请时段没有扣除应工作时间、休息和阈值后的有效加班分钟");
            helper.noLeave(request.getEmployeeId(), attendanceDate, request.getStartTime(), request.getEndTime());
            if (mapper.overtimeOverlap(tenantId(), request.getEmployeeId(), request.getRequestId(), request.getStartTime(), request.getEndTime()) > 0
                    || mapper.shiftOverlap(tenantId(), request.getEmployeeId(), null, attendanceDate, attendanceDate) > 0) throw conflict("REQUEST_OVERLAP", "存在重叠申请或尚未完成撤回的申请");
        }
        return new Context(slot, calendar, type, calculation);
    }

    private void assertSingleShiftEvidence(HrHSupport.Slot selected, List<HrAttendanceCheckin> cards) {
        if (cards.isEmpty()) return;
        LocalDateTime from = cards.stream().map(HrAttendanceCheckin::getCheckTime).min(LocalDateTime::compareTo).orElseThrow();
        LocalDateTime to = cards.stream().map(HrAttendanceCheckin::getCheckTime).max(LocalDateTime::compareTo).orElseThrow();
        for (LocalDate date = from.toLocalDate().minusDays(1); !date.isAfter(to.toLocalDate()); date = date.plusDays(1)) {
            if (date.equals(selected.date()) || mapper.assignment(tenantId(), selected.employeeId(), date) == null) continue;
            HrHSupport.Slot other = helper.slot(selected.employeeId(), date);
            if ("WORKDAY".equals(other.calendar().get("dateType")) && other.start().isBefore(to) && other.end().isAfter(from)) throw conflict("MULTIPLE_SHIFT_EVIDENCE", "原始证据覆盖另一实际工作班次，须先明确归属并核正");
        }
    }

    private void applyContext(HrOvertimeRequest row, Context context, boolean freeze) {
        row.setAttendanceDate(context.slot().date()); row.setShiftId(context.slot().shift().getId()); row.setRuleId(context.slot().rule().getId());
        row.setCalendarId(HrHSupport.number(context.calendar().get("calendarId"))); row.setDateType(String.valueOf(context.calendar().get("dateType")));
        row.setTriplePayFlag(HrHSupport.number(context.calendar().get("triplePayFlag")).intValue()); row.setOvertimeTypeId(context.type().getTypeId());
        if (freeze) {
            row.setRateMultiplier(context.type().getRateMultiplier()); row.setCompensatoryRatio(context.type().getCompensatoryRatio());
            row.setSalaryComponentId(context.type().getSalaryComponentId()); row.setLeaveTypeId(context.type().getCompensatoryLeaveTypeId());
            row.setActualMinutes(context.calculation().actualMinutes()); row.setActualHours(HrOvertimeCalculator.hours(row.getActualMinutes()));
            row.setCalculationSnapshot(calculationSnapshot(context));
        }
    }

    private String calculationSnapshot(Context context) {
        HrOvertimeCalculator.Calculation calculation = context.calculation(); CalculationSummaryVO summary = new CalculationSummaryVO();
        summary.setActualMinutes(calculation.actualMinutes()); summary.setExcludedMinutes(calculation.excludedMinutes());
        summary.setExpectedMinutes(calculation.expectedMinutes()); summary.setThresholdMinutes(calculation.thresholdMinutes()); summary.setSegments(segments(calculation));
        summary.setAssignmentVersion(context.slot().assignmentVersion()); summary.setShiftVersion(context.slot().shift().getVersion()); summary.setRuleVersion(context.slot().rule().getVersion());
        return helper.json(Map.of("source", helper.slotSnapshot(context.slot()), "evidence", calculation.evidence(), "summary", summary));
    }
    static List<TimeSegmentVO> segments(HrOvertimeCalculator.Calculation calculation) {
        return calculation.segments().stream().map(span -> {
            TimeSegmentVO segment = new TimeSegmentVO();
            segment.setStartTime(span.startTime()); segment.setEndTime(span.endTime()); segment.setMinutes(span.minutes());
            segment.setKind(span.kind()); segment.setSourceCheckinIds(span.sourceCheckinIds());
            return segment;
        }).toList();
    }
    private void fillPreview(OvertimePreviewVO view, Context context) {
        view.setAttendanceDate(context.slot().date()); view.setCalendarId(HrHSupport.number(context.calendar().get("calendarId"))); view.setDateType(String.valueOf(context.calendar().get("dateType")));
        view.setTriplePayFlag(HrHSupport.number(context.calendar().get("triplePayFlag")).intValue()); view.setOvertimeTypeId(context.type().getTypeId()); view.setOvertimeTypeName(context.type().getTypeName());
        view.setThresholdMinutes(context.slot().shift().getOvertimeThresholdMinutes()); view.setRateMultiplier(context.type().getRateMultiplier()); view.setCompensatoryRatio(context.type().getCompensatoryRatio());
        view.setEligibleSettleModes(types.modes(context.type()));
        if (context.calculation() != null) { view.setActualMinutes(context.calculation().actualMinutes()); view.setActualHours(HrOvertimeCalculator.hours(view.getActualMinutes())); view.setSegments(segments(context.calculation())); }
    }
    private BusinessBlockerVO blocker(String code, String message) { BusinessBlockerVO blocker = new BusinessBlockerVO(); blocker.setCode(code); blocker.setMessage(message); return blocker; }
    private record Context(HrHSupport.Slot slot, Map<String, Object> calendar, HrOvertimeType type, HrOvertimeCalculator.Calculation calculation) {}
}
