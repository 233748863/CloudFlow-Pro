package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.hr.domain.dto.HrHRequests.*;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.domain.vo.attendance.HrHViews.*;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.*;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrOvertimeSettlementService {
    private static final Set<String> RESOLUTION_ERRORS = Set.of("PERIOD_CLOSED", "PAYROLL_ALREADY_GENERATED", "PAYROLL_PERIOD_MISSING", "LEAVE_PERIOD_MISSING");
    private final HrOvertimeRequestMapper requests;
    private final HrHMapper mapper;
    private final HrPayrollPeriodMapper payrollPeriods;
    private final HrLeavePeriodMapper leavePeriods;
    private final HrCompChangeMapper changes;
    private final HrSalarySlipMapper slips;
    private final HrPayrollBatchMapper batches;
    private final HrHSupport helper;
    private final HrRuleSupport support;
    private final HrOvertimeTypeService types;
    private final HrPayrollCalculationService payroll;
    private final HrLeaveBusinessService leave;
    private final HrHEventService events;
    private final ObjectProvider<HrPayrollCorrectionService> corrections;
    private final HrHCipherService cipher;

    public OvertimeSettlementVO detail(Long id) {
        HrOvertimeRequest row = get(id); authorizeRead(row); return view(row);
    }

    public OvertimeSettlementVO retry(Long id, ReasonVersionDTO input) {
        helper.validate(input); HrOvertimeRequest original = get(id); authorizeAction(original, "hr:overtime:retry");
        return helper.locked(locks(original, List.of()), () -> {
            HrOvertimeRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion());
            if ("NEEDS_RESOLUTION".equals(row.getSettlementStatus())) throw conflict("RESOLUTION_REQUIRED", "目标周期不可继续结算，须显式处置");
            if (!"APPROVED".equals(row.getStatus()) || !"FAILED".equals(row.getSettlementStatus())) throw conflict("RETRY_NOT_ALLOWED", "当前结果不允许原依据重试");
            row.setSettlementStatus("PENDING"); save(row); audit(row, "RETRY"); events.execution(HrHEventService.OVERTIME_SETTLE, id, row.getVersion());
            return view(row);
        });
    }

    @Audit(name = "处置加班结算异常", spel = "#id", highRisk = true)
    public OvertimeSettlementVO resolve(Long id, OvertimeResolutionDTO input) {
        helper.validate(input); HrOvertimeRequest original = get(id); authorizeAction(original, "hr:overtime:resolve");
        String action = input.getAction();
        if ("REJECT".equals(action) && (input.getTargetPeriodId() != null || input.getOriginalSlipId() != null)
                || "COMPENSATORY_ADJUSTMENT".equals(action) && (!"COMPENSATORY".equals(original.getSettleMode()) || input.getTargetPeriodId() == null || input.getOriginalSlipId() != null)
                || "PAY_CORRECTION".equals(action) && (!"PAY".equals(original.getSettleMode()) || input.getTargetPeriodId() == null || input.getOriginalSlipId() == null)) throw invalid("处置方式与报酬模式、目标字段不匹配");
        if ("PAY_CORRECTION".equals(action)) helper.permission("hr:payroll:correct");
        List<Long> extraPay = "PAY_CORRECTION".equals(action) ? List.of(input.getTargetPeriodId()) : List.of();
        return helper.locked(locks(original, extraPay), () -> {
            lockPayrollPeriods(original, extraPay);
            if ("COMPENSATORY".equals(original.getSettleMode())) lockLeavePeriods(original.getLeavePeriodId(), "COMPENSATORY_ADJUSTMENT".equals(action) ? input.getTargetPeriodId() : null);
            HrOvertimeRequest row = locked(id); HrHSupport.version(input.getVersion(), row.getVersion());
            if (!"APPROVED".equals(row.getStatus()) || !"NEEDS_RESOLUTION".equals(row.getSettlementStatus())) throw conflict("RESOLUTION_NOT_ALLOWED", "仅审批通过且待人工处置的申请可执行此操作");
            assertNoResult(row);
            ObjectNode resolution = helper.tree(helper.json(Map.of("action", action, "originalPeriodId", originalPeriod(row).toString(),
                    "operatorId", helper.user().toString(), "handledTime", HrHSupport.now().toString(), "reason", HrHSupport.text(input.getReason(), 500))));
            if (input.getTargetPeriodId() != null) resolution.put("targetPeriodId", input.getTargetPeriodId().toString());
            if (input.getOriginalSlipId() != null) resolution.put("originalSlipId", input.getOriginalSlipId().toString());
            row.setSettlementResolution(resolution.toString());
            if ("REJECT".equals(action)) { row.setSettlementStatus("REJECTED"); save(row); }
            else if ("COMPENSATORY_ADJUSTMENT".equals(action)) credit(row, input.getTargetPeriodId(), true);
            else {
                assertOriginalPaid(row, input.getOriginalSlipId());
                HrPayrollCorrection correction = corrections.getObject().createOvertimeCorrectionLocked(row, input.getOriginalSlipId(), input.getTargetPeriodId(), HrHSupport.text(input.getReason(), 500));
                row.setPayrollCorrectionId(correction.getCorrectionId()); row.setSettlementStatus("CORRECTION_PENDING");
                resolution.put("correctionSlipId", correction.getCorrectionSlipId().toString()); row.setSettlementResolution(resolution.toString()); save(row);
            }
            audit(row, action); notifyResult(row); return view(row);
        });
    }

    public void settle(Long id, Integer expectedVersion) {
        HrOvertimeRequest original = get(id);
        try {
            helper.locked(locks(original, List.of()), () -> {
                lockPayrollPeriods(original, List.of());
                if ("COMPENSATORY".equals(original.getSettleMode())) lockLeavePeriods(original.getLeavePeriodId(), null);
                HrOvertimeRequest row = locked(id);
                if (!"APPROVED".equals(row.getStatus())) return null;
                if ("SETTLED".equals(row.getSettlementStatus())) { verifyResult(row); return null; }
                if (!Objects.equals(expectedVersion, row.getVersion())) return null;
                if (!List.of("PENDING", "FAILED").contains(row.getSettlementStatus())) return null;
                if ("FAILED".equals(row.getSettlementStatus())) return null;
                if ("PAY".equals(row.getSettleMode())) payChange(row); else credit(row, row.getLeavePeriodId(), false);
                audit(row, "SETTLED"); notifyResult(row); return null;
            });
        } catch (HrHException failure) { failure(original, failure.getCode(), failure.getMessage()); }
        catch (HrBusinessException failure) { failure(original, failure.getCode(), "账务处理被既有规则阻塞，请核查对应业务码"); }
        catch (RuntimeException failure) { failure(original, "SETTLEMENT_FAILED", "结算暂未完成，可按原依据重试"); }
    }

    private void failure(HrOvertimeRequest original, String code, String message) {
        helper.locked(locks(original, List.of()), () -> {
            HrOvertimeRequest row = locked(original.getRequestId());
            if (!Objects.equals(row.getVersion(), original.getVersion()) || !"APPROVED".equals(row.getStatus()) || !"PENDING".equals(row.getSettlementStatus())) return null;
            row.setSettlementStatus(RESOLUTION_ERRORS.contains(code) ? "NEEDS_RESOLUTION" : "FAILED");
            row.setLastErrorCode(code); row.setLastErrorMessage(message); save(row); audit(row, "SETTLEMENT_FAILURE"); notifyResult(row); return null;
        });
    }

    private void payChange(HrOvertimeRequest row) {
        HrCompChange existing = mapper.changeSource(tenantId(), row.getRequestId().toString());
        if (existing != null) { verifyChange(row, existing); row.setCompChangeId(existing.getId()); finish(row); return; }
        if (row.getPayrollCorrectionId() != null || row.getLeaveLedgerId() != null) throw conflict("SOURCE_CONFLICT", "原申请已走其他结算路径");
        HrPayrollPeriod period = payrollPeriod(row.getPayrollPeriodId()); assertPayOpen(period); types.component(row.getSalaryComponentId());
        if (payroll.hasCoverage(row.getEmployeeId(), period.getStartDate(), period.getEndDate())) throw conflict("PAYROLL_ALREADY_GENERATED", "原目标已生成工资覆盖，须人工确认处置");
        assertCurrency(row); BigDecimal amount = amount(row);
        HrCompChange change = new HrCompChange(); change.setTenantId(tenantId()); change.setChangeNo("OT-" + row.getRequestId());
        change.setEmployeeId(row.getEmployeeId()); change.setChangeType("OVERTIME"); change.setStatus("APPROVED");
        change.setEffectiveDate(period.getStartDate()); change.setSalaryComponentId(row.getSalaryComponentId()); change.setPayrollPeriodId(period.getPeriodId());
        change.setSourceBizType(HrOvertimeService.BUSINESS_TYPE); change.setSourceBizId(row.getRequestId().toString()); change.setReason("已批准加班费");
        change.setDeleted(0); change.setVersion(0); change.setCreateBy(userName()); change.setUpdateBy(userName()); change.setCreateTime(HrHSupport.now()); change.setUpdateTime(HrHSupport.now());
        mapper.insertOvertimeChange(change, cipher.legacyAmount("0.00"), cipher.legacyAmount(amount.toPlainString()));
        row.setCompChangeId(change.getId()); finish(row);
    }

    private void credit(HrOvertimeRequest row, Long targetPeriodId, boolean explicit) {
        if (row.getCompChangeId() != null || row.getPayrollCorrectionId() != null || mapper.changeSource(tenantId(), row.getRequestId().toString()) != null) throw conflict("SOURCE_CONFLICT", "原申请已走其他结算路径");
        types.leaveType(row.getLeaveTypeId());
        BigInteger previous = BigInteger.ZERO; BigDecimal previousQuantity = BigDecimal.ZERO.setScale(2);
        for (HrOvertimeRequest history : mapper.settledCredits(tenantId(), row.getEmployeeId(), row.getLeaveTypeId(), row.getLeavePeriodId())) {
            previous = previous.add(HrOvertimeCalculator.weighted(history.getApprovedMinutes(), history.getCompensatoryRatio()));
            if (history.getCompensatoryQuantity() == null) throw conflict("ROUNDING_HISTORY_CONFLICT", "历史调休缺少授予数量");
            previousQuantity = previousQuantity.add(history.getCompensatoryQuantity());
        }
        HrOvertimeCalculator.Rounding rounding = HrOvertimeCalculator.rounding(previous, previousQuantity, row.getApprovedMinutes(), row.getCompensatoryRatio());
        HrLeaveLedger existing = mapper.ledgerSource(tenantId(), eventKey(row));
        if (existing != null) {
            verifyLedger(row, existing, targetPeriodId, rounding.quantity()); row.setLeaveLedgerId(existing.getLedgerId());
        } else {
            HrLeavePeriod target = leavePeriods.selectLocked(targetPeriodId, tenantId());
            assertLeaveOpen(target, explicit);
            if (rounding.quantity().signum() > 0) row.setLeaveLedgerId(leave.postOvertimeLocked(row.getRequestId(), row.getEmployeeId(), row.getLeaveTypeId(), targetPeriodId, rounding.quantity()));
        }
        row.setCompensatoryQuantity(rounding.quantity());
        ObjectNode calculation = helper.tree(row.getCalculationSnapshot());
        OvertimeRoundingVO view = new OvertimeRoundingVO(); view.setPolicy(HrOvertimeCalculator.ROUNDING_POLICY); view.setSourcePeriodId(row.getLeavePeriodId());
        view.setRawMinutes(row.getApprovedMinutes()); view.setRatio(row.getCompensatoryRatio()); view.setCurrentCreditHours(rounding.quantity()); view.setCumulativeCreditHours(rounding.creditAfter()); view.setResidualNumerator(rounding.residualNumerator());
        ObjectNode detail = helper.tree(helper.json(view)); detail.put("weightedBefore", rounding.weightedBefore().toString()); detail.put("weightedAfter", rounding.weightedAfter().toString());
        detail.put("creditBefore", rounding.creditBefore().toPlainString()); detail.put("creditAfter", rounding.creditAfter().toPlainString()); calculation.set("rounding", detail);
        row.setCalculationSnapshot(calculation.toString()); finish(row);
    }

    private void finish(HrOvertimeRequest row) {
        row.setSettlementStatus("SETTLED"); row.setSettledFlag(1); row.setSettleTime(HrHSupport.now()); row.setLastErrorCode(null); row.setLastErrorMessage(null); save(row);
    }

    public void correctionResult(Long correctionId, String approvalResult, boolean applied, boolean targetClosed) {
        HrOvertimeRequest source = mapper.correctionSource(tenantId(), correctionId);
        if (source == null) return;
        HrOvertimeRequest row = locked(source.getRequestId());
        if (!"CORRECTION_PENDING".equals(row.getSettlementStatus())) return;
        if (applied) { corrections.getObject().assertOvertimeApplied(row); finish(row); }
        else if ("REJECTED".equals(approvalResult) || targetClosed) {
            row.setSettlementStatus("REJECTED");
            if (targetClosed) { row.setLastErrorCode("CORRECTION_TARGET_CLOSED"); row.setLastErrorMessage("补正审批通过，但目标周期已关闭，未执行入账"); }
            save(row);
        } else throw conflict("CORRECTION_NOT_APPLIED", "补正尚未实际应用，不能标记加班结算成功");
        audit(row, "CORRECTION_RESULT"); notifyResult(row);
    }

    public HrPayrollPeriod payrollPeriod(Long id) {
        HrPayrollPeriod period = id == null ? null : payrollPeriods.selectById(id);
        if (period == null || !Objects.equals(period.getTenantId(), tenantId()) || flag(period.getDeleted())) throw conflict("PAYROLL_PERIOD_MISSING", "目标工资周期不存在或已失效");
        return period;
    }

    public List<String> locks(HrOvertimeRequest row, List<Long> extraPeriods) {
        List<String> result = new ArrayList<>(); result.add("attendance-config");
        List<Long> periods = new ArrayList<>(extraPeriods); if (row.getPayrollPeriodId() != null) periods.add(row.getPayrollPeriodId());
        periods = periods.stream().distinct().sorted().toList();
        for (Long periodId : periods) result.add("payroll-period:" + periodId);
        SortedSet<Integer> years = new TreeSet<>();
        for (Long periodId : periods) { HrPayrollPeriod period = payrollPeriods.selectById(periodId); if (period != null && Objects.equals(period.getTenantId(), tenantId())) years.add(period.getEndDate().getYear()); }
        for (Integer year : years) result.add("payroll-year:" + row.getEmployeeId() + ":" + year);
        result.add("overtime:" + row.getEmployeeId() + ":" + YearMonth.from(row.getWorkDate()));
        helper.attendanceLocks(result, List.of(row.getEmployeeId()), row.getWorkDate().minusDays(1), row.getWorkDate().plusDays(1));
        if ("COMPENSATORY".equals(row.getSettleMode())) result.add("leave:" + row.getEmployeeId() + ":" + row.getLeaveTypeId());
        return result;
    }

    public void lockPayrollPeriods(HrOvertimeRequest row, List<Long> extraPeriods) {
        List<Long> periods = new ArrayList<>(extraPeriods);
        if (row.getPayrollPeriodId() != null) periods.add(row.getPayrollPeriodId());
        for (Long periodId : periods.stream().distinct().sorted().toList()) mapper.payrollPeriodLocked(tenantId(), periodId);
    }

    public void assertPricingTarget(HrOvertimeRequest row, Long targetId) {
        HrPayrollPeriod target = mapper.payrollPeriodLocked(tenantId(), targetId); assertPayOpen(target);
        List<HrPayrollPeriod> candidates = payrollPeriods.selectList(new LambdaQueryWrapper<HrPayrollPeriod>().eq(HrPayrollPeriod::getTenantId, tenantId())
                .eq(HrPayrollPeriod::getDeleted, 0).eq(HrPayrollPeriod::getStatus, "OPEN").gt(HrPayrollPeriod::getStartDate, row.getWorkDate()).orderByAsc(HrPayrollPeriod::getStartDate));
        List<HrPayrollPeriod> available = candidates.stream().filter(period -> !payroll.hasCoverage(row.getEmployeeId(), period.getStartDate(), period.getEndDate())).toList();
        if (available.isEmpty() || !Objects.equals(available.get(0).getPeriodId(), targetId)
                || available.size() > 1 && available.get(0).getStartDate().equals(available.get(1).getStartDate())) throw conflict("PAYROLL_TARGET_INVALID", "财务须确认加班日之后首个未生成工资的开放周期");
    }

    public void assertCurrency(HrOvertimeRequest row) {
        HrEmployeeComp compensation = payroll.compensation(row.getEmployeeId(), row.getWorkDate());
        if (!"CNY".equals(mapper.compensationCurrency(tenantId(), compensation.getId())) || !"CNY".equals(row.getCurrency())) throw conflict("CURRENCY_UNSUPPORTED", "须配置有效CNY薪级，当前加班费仅接入CNY工资链路");
    }

    public void assertOriginalPaid(HrOvertimeRequest row, Long slipId) {
        HrSalarySlip original = slips.selectById(slipId);
        if (original == null || !Objects.equals(original.getTenantId(), tenantId()) || flag(original.getDeleted())
                || !Objects.equals(original.getEmployeeId(), row.getEmployeeId()) || !"PAID".equals(original.getStatus())) throw conflict("CORRECTION_REQUIRES_PAID", "须选择本人原目标周期内真实已发放的工资单");
        Long periodId;
        if (original.getBatchId() != null) {
            HrPayrollBatch batch = batches.selectById(original.getBatchId());
            if (batch == null || !Objects.equals(batch.getTenantId(), tenantId())) throw conflict("CORRECTION_REQUIRES_PAID", "原工资批次无法核实");
            periodId = batch.getPayrollPeriodId();
        } else periodId = HrHSupport.number(HrPayrollCalculationService.snapshot(original).get("payrollPeriodId"));
        if (!Objects.equals(periodId, row.getPayrollPeriodId())) throw conflict("CORRECTION_REQUIRES_PAID", "原工资单不属于冻结的目标周期");
    }

    public BigDecimal amount(HrOvertimeRequest row) {
        try {
            BigDecimal amount = new BigDecimal(cipher.open(row.getSettlementAmountCipher()));
            if (amount.compareTo(HrOvertimeCalculator.money(row.getApprovedMinutes(), new BigDecimal(cipher.open(row.getHourlyRateCipher())), row.getRateMultiplier())) != 0) throw conflict("PAY_AMOUNT_CONFLICT", "冻结的加班费依据不一致");
            return amount;
        } catch (NumberFormatException | NullPointerException invalid) { throw conflict("PAY_AMOUNT_MISSING", "核价金额缺失或无法读取"); }
    }

    private HrOvertimeRequest get(Long id) {
        HrOvertimeRequest row = id == null ? null : requests.selectById(id); return assertRow(row);
    }
    private HrOvertimeRequest locked(Long id) { return assertRow(mapper.overtimeLocked(tenantId(), id)); }
    private HrOvertimeRequest assertRow(HrOvertimeRequest row) {
        if (row == null || !Objects.equals(row.getTenantId(), tenantId()) || flag(row.getDeleted())) throw new HrHException("OVERTIME_NOT_FOUND", "加班申请不存在", 404);
        return row;
    }
    private void save(HrOvertimeRequest row) {
        row.setUpdateBy(userName()); row.setUpdateTime(HrHSupport.now());
        if (requests.updateById(row) != 1) throw conflict("VERSION_CONFLICT", "申请结算状态已变化");
    }
    private void authorizeRead(HrOvertimeRequest row) {
        if (helper.owner(row.getEmployeeId())) helper.permission("hr:overtime:mine");
        else { helper.permission("PAY".equals(row.getSettleMode()) ? "hr:overtime:finance" : "hr:overtime:verify"); helper.scope(row.getEmployeeId()); }
    }
    private void authorizeAction(HrOvertimeRequest row, String permission) {
        helper.permission(permission); helper.operator(row.getEmployeeId(), "PAY".equals(row.getSettleMode()) ? "hr:overtime:price" : "hr:overtime:verify");
    }
    private Long originalPeriod(HrOvertimeRequest row) { return "PAY".equals(row.getSettleMode()) ? row.getPayrollPeriodId() : row.getLeavePeriodId(); }
    private static String eventKey(HrOvertimeRequest row) { return "HR_OVERTIME:" + row.getRequestId() + ":COMPENSATORY"; }
    private void assertPayOpen(HrPayrollPeriod period) {
        if (period == null || !Objects.equals(period.getTenantId(), tenantId()) || flag(period.getDeleted()) || !"OPEN".equals(period.getStatus())) throw conflict("PERIOD_CLOSED", "冻结的工资周期已关闭或不可用");
    }
    private void assertLeaveOpen(HrLeavePeriod period, boolean explicit) {
        if (period == null || !Objects.equals(period.getTenantId(), tenantId()) || flag(period.getDeleted()) || !"OPEN".equals(period.getStatus())) throw conflict(explicit ? "TARGET_PERIOD_CLOSED" : "PERIOD_CLOSED", "假期目标周期已关闭或失效");
    }
    private void lockLeavePeriods(Long original, Long target) {
        List<Long> ids = new ArrayList<>(); if (original != null) ids.add(original); if (target != null) ids.add(target);
        for (Long periodId : ids.stream().distinct().sorted().toList()) leavePeriods.selectLocked(periodId, tenantId());
    }

    private void assertNoResult(HrOvertimeRequest row) {
        if (flag(row.getSettledFlag()) || row.getCompChangeId() != null || row.getLeaveLedgerId() != null || row.getPayrollCorrectionId() != null
                || mapper.changeSource(tenantId(), row.getRequestId().toString()) != null || mapper.ledgerSource(tenantId(), eventKey(row)) != null) throw conflict("SOURCE_CONFLICT", "原申请已有关联结算结果，不能另走处置路径");
    }
    private void verifyChange(HrOvertimeRequest row, HrCompChange change) {
        HrPayrollPeriod period = payrollPeriod(row.getPayrollPeriodId());
        if (flag(change.getDeleted()) || !"APPROVED".equals(change.getStatus()) || !"OVERTIME".equals(change.getChangeType())
                || !Objects.equals(change.getEmployeeId(), row.getEmployeeId()) || !Objects.equals(change.getPayrollPeriodId(), row.getPayrollPeriodId())
                || !Objects.equals(change.getSalaryComponentId(), row.getSalaryComponentId()) || !Objects.equals(change.getEffectiveDate(), period.getStartDate())
                || change.getChangeAmount() == null || amount(row).compareTo(change.getChangeAmount()) != 0 || row.getPayrollCorrectionId() != null || row.getLeaveLedgerId() != null) throw conflict("SOURCE_CONFLICT", "已有工资来源与冻结的申请结果不一致");
    }
    private void verifyLedger(HrOvertimeRequest row, HrLeaveLedger ledger, Long targetPeriod, BigDecimal quantity) {
        if (!Objects.equals(ledger.getEmployeeId(), row.getEmployeeId()) || !Objects.equals(ledger.getLeaveTypeId(), row.getLeaveTypeId())
                || !Objects.equals(ledger.getLeavePeriodId(), targetPeriod) || !"COMPENSATORY".equals(ledger.getTransactionType()) || !"HOUR".equals(ledger.getQuantityUnit())
                || !HrOvertimeService.BUSINESS_TYPE.equals(ledger.getSourceBizType()) || !row.getRequestId().toString().equals(ledger.getSourceBizId())
                || ledger.getLeaveDays() == null || ledger.getLeaveDays().compareTo(quantity) != 0) throw conflict("SOURCE_CONFLICT", "已有调休来源与冻结的申请结果不一致");
    }
    private void verifyResult(HrOvertimeRequest row) {
        if (!flag(row.getSettledFlag()) || row.getSettleTime() == null) throw conflict("SOURCE_CONFLICT", "结算结果缺少完成标记");
        if (row.getPayrollCorrectionId() != null) { corrections.getObject().assertOvertimeApplied(row); return; }
        if ("PAY".equals(row.getSettleMode())) {
            HrCompChange change = mapper.changeSource(tenantId(), row.getRequestId().toString());
            if (change == null || !Objects.equals(change.getId(), row.getCompChangeId())) throw conflict("SOURCE_CONFLICT", "工资来源缺失");
            verifyChange(row, change);
        } else if (row.getCompensatoryQuantity() == null || row.getCompensatoryQuantity().signum() < 0) throw conflict("SOURCE_CONFLICT", "调休结算数量无效");
        else if (row.getCompensatoryQuantity().signum() == 0) { if (row.getLeaveLedgerId() != null || mapper.ledgerSource(tenantId(), eventKey(row)) != null) throw conflict("SOURCE_CONFLICT", "零差额申请不应有台账"); }
        else {
            HrLeaveLedger ledger = mapper.ledgerSource(tenantId(), eventKey(row)); ObjectNode resolution = helper.tree(row.getSettlementResolution());
            Long target = resolution.has("targetPeriodId") ? HrHSupport.number(resolution.path("targetPeriodId").asText()) : row.getLeavePeriodId();
            if (ledger == null || !Objects.equals(ledger.getLedgerId(), row.getLeaveLedgerId())) throw conflict("SOURCE_CONFLICT", "调休来源缺失");
            verifyLedger(row, ledger, target, row.getCompensatoryQuantity());
        }
    }

    static ResolutionVO resolutionView(HrHSupport helper, String value) {
        if (value == null) return null;
        ObjectNode snapshot = helper.tree(value);
        JsonNode handledTime = snapshot.remove("handledTime");
        ResolutionVO view = helper.convert(snapshot, ResolutionVO.class);
        if (handledTime != null && !handledTime.isNull()) {
            try { view.setHandledTime(LocalDateTime.parse(handledTime.asText())); }
            catch (DateTimeParseException failure) { throw conflict("SNAPSHOT_INVALID", "结算处置时间无法读取"); }
        }
        return view;
    }

    private OvertimeSettlementVO view(HrOvertimeRequest row) {
        OvertimeSettlementVO view = helper.view(row, new OvertimeSettlementVO());
        view.setResolution(resolutionView(helper, row.getSettlementResolution()));
        if ("PAY".equals(row.getSettleMode())) {
            if (row.getHourlyRateCipher() != null) view.setHourlyRate(new BigDecimal(cipher.open(row.getHourlyRateCipher())));
            if (row.getSettlementAmountCipher() != null) view.setSettlementAmount(amount(row));
            view.setLeaveTypeId(null); view.setLeavePeriodId(null); view.setLeaveLedgerId(null); view.setCompensatoryQuantity(null);
        } else {
            view.setCurrency(null); view.setSalaryComponentId(null); view.setPayrollPeriodId(null); view.setCompChangeId(null); view.setPayrollCorrectionId(null);
            view.setPricedBy(null); view.setPricedTime(null); view.setPriceNote(null); view.setQuantityUnit("HOUR");
            ObjectNode calculation = helper.tree(row.getCalculationSnapshot()); if (calculation.has("rounding")) view.setRounding(helper.convert(calculation.path("rounding"), OvertimeRoundingVO.class));
        }
        List<String> actions = new ArrayList<>();
        if (!helper.owner(row.getEmployeeId()) && helper.permitted("PAY".equals(row.getSettleMode()) ? "hr:overtime:price" : "hr:overtime:verify") && "APPROVED".equals(row.getStatus())) {
            if ("FAILED".equals(row.getSettlementStatus()) && helper.permitted("hr:overtime:retry")) actions.add("retry");
            if ("NEEDS_RESOLUTION".equals(row.getSettlementStatus()) && helper.permitted("hr:overtime:resolve")) actions.add("resolve");
        }
        view.setAllowedActions(actions); return view;
    }
    private void audit(HrOvertimeRequest row, String action) {
        Map<String, Object> detail = new TreeMap<>(); detail.put("requestId", row.getRequestId()); detail.put("settlementStatus", row.getSettlementStatus()); detail.put("version", row.getVersion());
        detail.put("compChangeId", row.getCompChangeId()); detail.put("leaveLedgerId", row.getLeaveLedgerId()); detail.put("payrollCorrectionId", row.getPayrollCorrectionId()); detail.put("errorCode", row.getLastErrorCode());
        support.audit(HrOvertimeService.BUSINESS_TYPE, row.getRequestId(), action, detail);
    }
    private void notifyResult(HrOvertimeRequest row) {
        Long applicant = HrHSupport.number(helper.tree(row.getPolicySnapshot()).path("applicantUserId").asText());
        events.notify("HR_REQUEST_EXECUTION_RESULT", HrOvertimeService.BUSINESS_TYPE, row.getRequestId(), row.getRequestNo(), row.getSettlementStatus(), row.getVersion(),
                List.of(applicant), "查看结算执行结果", "/hr/ess/overtime?requestId=" + row.getRequestId());
    }
}
