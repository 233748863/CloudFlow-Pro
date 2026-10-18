package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.hr.domain.dto.HrAdvanceRequests;
import com.cloudflow.hr.domain.entity.HrAdvanceRepayment;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.mapper.HrAdvanceRepaymentMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper.SalarySource;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.BiFunction;
import java.util.function.Function;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

@Service
@RequiredArgsConstructor
public class HrAdvanceLedgerService {
    private final HrEmployeeAdvanceMapper advances;
    private final HrAdvanceRepaymentMapper repayments;
    private final HrRuleSupport support;

    @Audit(name = "登记员工借款实际还款", spel = "#advanceId", highRisk = true)
    public HrAdvanceRepayment repayManual(Long advanceId, HrAdvanceRequests.Repayment input) {
        if (input == null || input.getProofFileId() == null || input.getProofFileId() <= 0 || input.getRepayDate() == null
                || input.getRepayDate().isAfter(HrHSupport.today())) throw invalid("实际还款日期及凭据缺失或无效");
        BigDecimal amount = HrAdvanceAmounts.positive(input.getAmount());
        String sourceKey = "MANUAL:" + eventKey(input.getSourceEventKey());
        String remark = HrHSupport.text(input.getRemark(), 500);
        return withAdvanceLock(advanceId, advance -> {
            verifyLedger(advance);
            if (input.getRepayDate().isBefore(advance.getPaidTime().toLocalDate())) throw invalid("还款日期不能早于实际放款");
            HrAdvanceRepayment existing = repayments.selectOne(new LambdaQueryWrapper<HrAdvanceRepayment>()
                    .eq(HrAdvanceRepayment::getTenantId, tenantId()).eq(HrAdvanceRepayment::getSourceEventKey, sourceKey));
            if (existing != null) {
                if (!Objects.equals(existing.getAdvanceId(), advanceId) || !"MANUAL".equals(existing.getRepayType())
                        || !"POSTED".equals(existing.getStatus()) || existing.getReversalOfId() != null
                        || existing.getSalarySlipId() != null || existing.getSettlementId() != null
                        || existing.getRepayAmount().compareTo(amount) != 0 || !Objects.equals(existing.getRepayDate(), input.getRepayDate())
                        || !Objects.equals(existing.getProofFileId(), input.getProofFileId()) || !Objects.equals(existing.getRemark(), remark)) {
                    throw conflict("ADVANCE_SOURCE_CONFLICT", "同一还款标识已有不同内容，请核对原记录");
                }
                return existing;
            }
            HrHSupport.version(input.getVersion(), advance.getVersion());
            HrAdvanceAmounts.Balance next = HrAdvanceAmounts.repayAvailable(balance(advance), amount);
            HrAdvanceRepayment entry = new HrAdvanceRepayment();
            entry.setTenantId(tenantId()); entry.setAdvanceId(advanceId); entry.setRepayType("MANUAL"); entry.setStatus("POSTED");
            entry.setRepayAmount(amount); entry.setSourceEventKey(sourceKey); entry.setProofFileId(input.getProofFileId());
            entry.setRepayDate(input.getRepayDate()); entry.setRepayMonth(YearMonth.from(input.getRepayDate()).toString());
            entry.setPostedTime(HrHSupport.now()); entry.setRemark(remark);
            save(entry); updateBalance(advance, next); audit(advance, entry, "MANUAL_POST");
            return entry;
        });
    }

    @Audit(name = "核销员工借款本金", spel = "#advanceId", highRisk = true)
    public void writeoff(Long advanceId, HrAdvanceRequests.Writeoff input) {
        if (input == null || !Boolean.TRUE.equals(input.getConfirmed())) throw invalid("核销须再次明确确认");
        BigDecimal amount = HrAdvanceAmounts.positive(input.getAmount());
        String sourceKey = eventKey(input.getSourceEventKey());
        String reason = HrHSupport.text(input.getReason(), 500);
        withAdvanceLock(advanceId, advance -> {
            verifyLedger(advance);
            String operation = "WO:" + sourceKey;
            Map<String, Object> previous = support.auditDetail("HR_ADVANCE", advanceId, operation);
            if (!previous.isEmpty()) {
                if (!sourceKey.equals(previous.get("sourceEventKey")) || !amount.toPlainString().equals(previous.get("amount"))
                        || !reason.equals(previous.get("reason"))) throw conflict("ADVANCE_SOURCE_CONFLICT", "同一核销标识已有不同内容");
                return null;
            }
            HrHSupport.version(input.getVersion(), advance.getVersion());
            for (HrSalarySlip pending : advances.pendingCorrectionSlips(tenantId(), advance.getEmployeeId())) {
                if (pending.getComponents() != null && pending.getComponents().stream().anyMatch(component ->
                        "HR_ADVANCE_REVERSAL".equals(component.get("sourceBizType"))
                                && advanceId.toString().equals(String.valueOf(component.get("advanceId"))))) {
                    throw conflict("ADVANCE_CORRECTION_PENDING", "借款尚有待审批或待支付的工资补正，不能核销");
                }
            }
            HrAdvanceAmounts.Balance before = balance(advance);
            updateBalance(advance, HrAdvanceAmounts.writeOff(before, amount));
            support.audit("HR_ADVANCE", advanceId, operation, Map.of("sourceEventKey", sourceKey, "amount", amount.toPlainString(),
                    "reason", reason, "action", "WRITE_OFF", "previousOutstanding", before.outstanding().toPlainString(),
                    "outstanding", advance.getOutstandingAmount().toPlainString(), "writtenOff", advance.getWrittenOffAmount().toPlainString()));
            return null;
        });
    }

    <T> T withAdvanceLock(Long advanceId, Function<HrEmployeeAdvance, T> action) {
        if (advanceId == null || advanceId <= 0) throw invalid("借款编号无效");
        return support.transaction(() -> {
            HrEmployeeAdvance initial = advance(advanceId);
            if (advances.lockEmployee(tenantId(), initial.getEmployeeId()) == null) throw conflict("ADVANCE_EMPLOYEE_MISSING", "借款员工档案不存在");
            HrEmployeeAdvance current = advances.lockAdvance(tenantId(), advanceId);
            if (current == null) throw missing();
            if (!Objects.equals(current.getEmployeeId(), initial.getEmployeeId())) throw conflict("ADVANCE_EMPLOYEE_CHANGED", "借款归属已变化");
            return action.apply(current);
        });
    }

    private static String eventKey(String value) {
        if (value == null || !value.matches("[a-f0-9]{32}")) throw invalid("业务请求标识无效");
        return value;
    }

    @Audit(name = "更新借款工资扣还预约", spel = "#advanceId")
    public Optional<HrAdvanceRepayment> reserveSalary(Long advanceId, Long salarySlipId, BigDecimal amount) {
        BigDecimal requested = HrAdvanceAmounts.nonnegative(amount);
        return salaryLocked(advanceId, salarySlipId, (advance, salary) -> {
            requireSalaryState(salary, "DRAFT");
            HrAdvanceRepayment existing = salaryEntry(advanceId, salary);
            if (requested.signum() == 0) return release(advance, existing);
            requireSalaryPlan(advance, salary);
            if (existing != null && !List.of("RESERVED", "RELEASED").contains(existing.getStatus())) {
                throw conflict("ADVANCE_ENTRY_FINAL", "已入账或冲正的工资扣还不能重新预约");
            }
            BigDecimal previous = existing != null && "RESERVED".equals(existing.getStatus()) ? existing.getRepayAmount() : BigDecimal.ZERO;
            BigDecimal monthlyUsed = entries(advanceId).stream()
                    .filter(entry -> "SALARY".equals(entry.getRepayType()) && salary.periodMonth().equals(entry.getRepayMonth())
                            && List.of("RESERVED", "POSTED", "REVERSED").contains(entry.getStatus()))
                    .map(HrAdvanceRepayment::getRepayAmount).reduce(BigDecimal.ZERO, BigDecimal::add).subtract(previous);
            if (monthlyUsed.signum() < 0 || requested.add(monthlyUsed).compareTo(advance.getMonthlyDeductAmount()) > 0) {
                throw conflict("ADVANCE_MONTHLY_LIMIT", "本月工资扣还合计超过已约定月扣金额");
            }
            HrAdvanceAmounts.Balance next = HrAdvanceAmounts.replaceReservation(balance(advance), previous, requested);
            if (existing != null && "RESERVED".equals(existing.getStatus()) && existing.getRepayAmount().compareTo(requested) == 0) {
                return Optional.of(existing);
            }
            HrAdvanceRepayment entry = existing == null ? newSalaryEntry(advanceId, salarySlipId, salary.periodMonth()) : existing;
            entry.setRepayAmount(requested);
            entry.setStatus("RESERVED");
            entry.setRemark("工资扣还预约，尚未实际还款");
            save(entry);
            updateBalance(advance, next);
            audit(advance, entry, "SALARY_RESERVE");
            return Optional.of(entry);
        });
    }

    @Audit(name = "释放借款工资扣还预约", spel = "#advanceId", highRisk = true)
    public Optional<HrAdvanceRepayment> releaseSalary(Long advanceId, Long salarySlipId) {
        return salaryLocked(advanceId, salarySlipId, (advance, salary) -> {
            requireSalaryState(salary, "DRAFT", "CANCELLED");
            return release(advance, salaryEntry(advanceId, salary));
        });
    }

    @Audit(name = "实际发薪后登记借款还款", spel = "#advanceId", highRisk = true)
    public HrAdvanceRepayment postSalary(Long advanceId, Long salarySlipId, LocalDate paidDate) {
        if (paidDate == null || paidDate.isAfter(HrHSupport.today())) throw invalid("实际还款日期缺失或晚于今日");
        return salaryLocked(advanceId, salarySlipId, (advance, salary) -> {
            requireSalaryState(salary, "PAID");
            HrAdvanceRepayment entry = salaryEntry(advanceId, salary);
            if (entry == null) throw conflict("ADVANCE_RESERVATION_MISSING", "实际发薪前未保存对应扣款预约");
            if ("POSTED".equals(entry.getStatus())) return entry;
            if (!"RESERVED".equals(entry.getStatus())) throw conflict("ADVANCE_ENTRY_FINAL", "该扣款预约已释放或冲正");
            if (paidDate.isBefore(advance.getPaidTime().toLocalDate())) throw invalid("还款日期不能早于实际放款");
            HrAdvanceAmounts.Balance next = HrAdvanceAmounts.postReserved(balance(advance), entry.getRepayAmount());
            entry.setStatus("POSTED");
            entry.setRepayDate(paidDate);
            entry.setPostedTime(HrHSupport.now());
            entry.setRemark("工资实际发放后扣还入账");
            save(entry);
            updateBalance(advance, next);
            audit(advance, entry, "SALARY_POST");
            return entry;
        });
    }

    @Audit(name = "实际支付工资补正后冲正借款还款", spel = "#repaymentId", highRisk = true)
    public HrAdvanceRepayment reverseSalary(Long repaymentId, Long correctionSlipId, LocalDate paidDate) {
        if (paidDate == null || paidDate.isAfter(HrHSupport.today())) throw invalid("实际补正支付日期缺失或晚于今日");
        HrAdvanceRepayment initial = repayment(repaymentId);
        return salaryLocked(initial.getAdvanceId(), correctionSlipId, (advance, salary) -> {
            requireSalaryState(salary, "PAID");
            HrAdvanceRepayment original = repayment(repaymentId);
            if (!Objects.equals(original.getAdvanceId(), advance.getAdvanceId()) || !"SALARY".equals(original.getRepayType())
                    || original.getReversalOfId() != null || original.getSalarySlipId() == null
                    || Objects.equals(original.getSalarySlipId(), correctionSlipId)
                    || original.getRepayDate() == null || paidDate.isBefore(original.getRepayDate())) {
                throw conflict("ADVANCE_REVERSAL_SOURCE_INVALID", "须选择同员工原工资实际扣还记录，日期不得早于原还款");
            }
            SalarySource originalSalary = advances.lockSalary(tenantId(), original.getSalarySlipId());
            if (originalSalary != null) HrAdvancePayrollService.assertNotInSettlement(originalSalary.reservedSettlementId());
            if (originalSalary == null || !"PAID".equals(originalSalary.status())
                    || !Objects.equals(originalSalary.employeeId(), advance.getEmployeeId())
                    || !Objects.equals(originalSalary.periodMonth(), original.getRepayMonth())) {
                throw conflict("ADVANCE_REVERSAL_SOURCE_INVALID", "原工资单未实际发放或与原款不匹配");
            }
            String sourceKey = "SALARY_CORRECTION:" + correctionSlipId + ":REPAYMENT:" + repaymentId;
            HrAdvanceRepayment existing = repayments.selectOne(new LambdaQueryWrapper<HrAdvanceRepayment>()
                    .eq(HrAdvanceRepayment::getTenantId, tenantId()).eq(HrAdvanceRepayment::getReversalOfId, repaymentId));
            if (existing != null) {
                if (!"REVERSED".equals(original.getStatus()) || !"POSTED".equals(existing.getStatus())
                        || !"SALARY".equals(existing.getRepayType()) || !Objects.equals(existing.getAdvanceId(), advance.getAdvanceId())
                        || !sourceKey.equals(existing.getSourceEventKey()) || !Objects.equals(existing.getSalarySlipId(), correctionSlipId)
                        || !Objects.equals(existing.getRepayMonth(), original.getRepayMonth())
                        || existing.getRepayAmount().compareTo(original.getRepayAmount().negate()) != 0) {
                    throw conflict("ADVANCE_REVERSAL_CONFLICT", "原还款已由另一笔补正处理或冲正来源不一致");
                }
                return existing;
            }
            if (!"POSTED".equals(original.getStatus())) throw conflict("ADVANCE_ENTRY_FINAL", "仅实际入账且未冲正的工资扣还可补正");
            HrAdvanceAmounts.Balance next = HrAdvanceAmounts.reverseRepayment(balance(advance), original.getRepayAmount());
            HrAdvanceRepayment reversal = new HrAdvanceRepayment();
            reversal.setTenantId(tenantId()); reversal.setAdvanceId(advance.getAdvanceId()); reversal.setSalarySlipId(correctionSlipId);
            reversal.setRepayMonth(original.getRepayMonth()); reversal.setRepayType("SALARY"); reversal.setStatus("POSTED");
            reversal.setSourceEventKey(sourceKey); reversal.setReversalOfId(repaymentId);
            reversal.setRepayAmount(original.getRepayAmount().negate()); reversal.setRepayDate(paidDate);
            reversal.setPostedTime(HrHSupport.now()); reversal.setRemark("实际支付补正工资后退回原借款扣还，原记录金额不变");
            save(reversal);
            original.setStatus("REVERSED"); save(original);
            updateBalance(advance, next);
            audit(advance, reversal, "SALARY_REVERSE");
            return reversal;
        });
    }

    HrAdvanceAmounts.Balance verifiedBalance(HrEmployeeAdvance advance) {
        return verifiedLedger(advance).balance();
    }

    record LedgerSnapshot(HrAdvanceAmounts.Balance balance, List<HrAdvanceRepayment> entries) {
        LedgerSnapshot { entries = List.copyOf(entries); }
    }

    private HrAdvanceRepayment repayment(Long identifier) {
        HrAdvanceRepayment row = identifier == null ? null : repayments.selectOne(new LambdaQueryWrapper<HrAdvanceRepayment>()
                .eq(HrAdvanceRepayment::getTenantId, tenantId()).eq(HrAdvanceRepayment::getRepaymentId, identifier));
        if (row == null) throw new HrHException("ADVANCE_REPAYMENT_NOT_FOUND", "原还款记录不存在", 404);
        return row;
    }

    /** Caller holds employee, settlement and advance locks in the settlement transaction. */
    Optional<HrAdvanceRepayment> reserveSettlementLocked(HrEmployeeAdvance advance, Long settlementId, BigDecimal amount) {
        requireSettlementTransaction(settlementId);
        verifyLedger(advance);
        BigDecimal requested = HrAdvanceAmounts.nonnegative(amount);
        HrAdvanceRepayment existing = settlementEntry(advance, settlementId);
        if (requested.signum() == 0) {
            if (existing != null && !"RELEASED".equals(existing.getStatus())) throw conflict("ADVANCE_SOURCE_CONFLICT", "零金额结算仍存在借款预约，请核对原来源");
            return Optional.ofNullable(existing);
        }
        if (existing != null && !List.of("RESERVED", "RELEASED").contains(existing.getStatus())) throw conflict("ADVANCE_ENTRY_FINAL", "已入账的结算还款不能重新预约");
        if (existing != null && "RESERVED".equals(existing.getStatus())) {
            if (existing.getRepayAmount().compareTo(requested) != 0) throw conflict("ADVANCE_SOURCE_CONFLICT", "结算原预约金额不一致，须先释放再重算");
            return Optional.of(existing);
        }
        HrAdvanceAmounts.Balance next = HrAdvanceAmounts.replaceReservation(balance(advance), BigDecimal.ZERO, requested);
        HrAdvanceRepayment entry = existing == null ? new HrAdvanceRepayment() : existing;
        entry.setTenantId(tenantId()); entry.setAdvanceId(advance.getAdvanceId()); entry.setSettlementId(settlementId);
        entry.setRepayType("SETTLEMENT"); entry.setSourceEventKey("SETTLEMENT:" + settlementId + ":ADVANCE:" + advance.getAdvanceId());
        entry.setRepayAmount(requested); entry.setStatus("RESERVED"); entry.setRemark("离职结算借款预约，尚未实际还款");
        save(entry); updateBalance(advance, next); audit(advance, entry, "SETTLEMENT_RESERVE");
        return Optional.of(entry);
    }

    Optional<HrAdvanceRepayment> releaseSettlementLocked(HrEmployeeAdvance advance, Long settlementId, BigDecimal amount) {
        requireSettlementTransaction(settlementId); verifyLedger(advance);
        BigDecimal expected = HrAdvanceAmounts.nonnegative(amount);
        HrAdvanceRepayment entry = settlementEntry(advance, settlementId);
        if (expected.signum() == 0 && (entry == null || "RELEASED".equals(entry.getStatus()))) return Optional.ofNullable(entry);
        if (entry == null || entry.getRepayAmount().compareTo(expected) != 0) throw conflict("ADVANCE_SOURCE_CONFLICT", "待释放借款与结算原预约金额不一致");
        return release(advance, entry);
    }

    /** Called only after the settlement funds evidence has been verified, under the original source locks. */
    Optional<HrAdvanceRepayment> postSettlementLocked(HrEmployeeAdvance advance, Long settlementId, BigDecimal amount, LocalDate paidDate) {
        requireSettlementTransaction(settlementId); verifyLedger(advance);
        BigDecimal expected = HrAdvanceAmounts.nonnegative(amount);
        HrAdvanceRepayment entry = settlementEntry(advance, settlementId);
        if (expected.signum() == 0 && (entry == null || "RELEASED".equals(entry.getStatus()))) return Optional.ofNullable(entry);
        if (entry == null || entry.getRepayAmount().compareTo(expected) != 0) throw conflict("ADVANCE_SOURCE_CONFLICT", "实际结算还款与原预约金额不一致");
        postSettlementEntry(advance, entry, paidDate, "SETTLEMENT_POST");
        return Optional.of(entry);
    }

    void postSettlementSalaryLocked(Long advanceId, com.cloudflow.hr.domain.entity.HrSalarySlip slip, Long settlementId, LocalDate paidDate) {
        requireSettlementTransaction(settlementId);
        SalarySource salary = advances.lockSalary(tenantId(), slip.getId());
        HrEmployeeAdvance advance = advances.lockAdvance(tenantId(), advanceId);
        if (advance == null || salary == null || !"PAID".equals(salary.status()) || !settlementId.equals(salary.reservedSettlementId())
                || !Objects.equals(salary.employeeId(), advance.getEmployeeId()) || !Objects.equals(slip.getEmployeeId(), advance.getEmployeeId())) throw conflict("ADVANCE_SALARY_MISMATCH", "结算工资与借款或预约来源不一致");
        verifyLedger(advance);
        HrAdvanceRepayment entry = salaryEntry(advanceId, salary);
        if (entry == null) throw conflict("ADVANCE_RESERVATION_MISSING", "结算工资缺少已核定借款预约");
        postSettlementEntry(advance, entry, paidDate, "SETTLEMENT_SALARY_POST");
    }

    private void postSettlementEntry(HrEmployeeAdvance advance, HrAdvanceRepayment entry, LocalDate paidDate, String action) {
        if (paidDate == null || paidDate.isAfter(HrHSupport.today()) || advance.getPaidTime() == null || paidDate.isBefore(advance.getPaidTime().toLocalDate())) throw invalid("实际结算还款日期无效");
        if ("POSTED".equals(entry.getStatus())) return;
        if (!"RESERVED".equals(entry.getStatus())) throw conflict("ADVANCE_ENTRY_FINAL", "结算借款预约已释放或冲正");
        HrAdvanceAmounts.Balance next = HrAdvanceAmounts.postReserved(balance(advance), entry.getRepayAmount());
        entry.setStatus("POSTED"); entry.setRepayDate(paidDate); entry.setPostedTime(HrHSupport.now()); entry.setRemark("离职结算实际收付或净额抵销后入账");
        save(entry); updateBalance(advance, next); audit(advance, entry, action);
    }

    /** Caller verifies both settlements' money and frozen evidence, holding employee/settlement/source locks until commit. */
    Optional<HrAdvanceRepayment> reverseSettlementLocked(HrEmployeeAdvance advance, Long originalSettlementId,
            Long reversalId, BigDecimal amount, LocalDate fundsDate) {
        return reverseSettlementLocked(advance, originalSettlementId, reversalId, amount, fundsDate, true);
    }

    Optional<HrAdvanceRepayment> reverseSettlementLocked(HrEmployeeAdvance advance, Long originalSettlementId,
            Long reversalId, BigDecimal amount, LocalDate fundsDate, boolean apply) {
        requireSettlementReversal(originalSettlementId, reversalId); verifyLedger(advance);
        BigDecimal expected = HrAdvanceAmounts.nonnegative(amount);
        HrAdvanceRepayment original = settlementEntry(advance, originalSettlementId);
        if (expected.signum() == 0 && (original == null || "RELEASED".equals(original.getStatus()))) return Optional.empty();
        HrAdvanceRepayment refund = refundSettlementEntry(advance, original, reversalId, expected, fundsDate, false, apply);
        verifyLedger(advance);
        return Optional.of(refund);
    }

    /** Restores a new reservation without reusing or erasing the original salary repayment. No ordinary payroll bypass. */
    void reverseSettlementSalaryLocked(Long advanceId, HrSalarySlip slip, Long originalSettlementId, Long reversalId,
            Long originalRepaymentId, BigDecimal amount, LocalDate fundsDate) {
        reverseSettlementSalaryLocked(advanceId, slip, originalSettlementId, reversalId, originalRepaymentId, amount, fundsDate, true);
    }

    void reverseSettlementSalaryLocked(Long advanceId, HrSalarySlip slip, Long originalSettlementId, Long reversalId,
            Long originalRepaymentId, BigDecimal amount, LocalDate fundsDate, boolean apply) {
        requireSettlementReversal(originalSettlementId, reversalId);
        if (slip == null || !Objects.equals(tenantId(), slip.getTenantId())) throw settlementReversalChanged();
        SalarySource salary = advances.lockSalary(tenantId(), slip.getId());
        HrEmployeeAdvance advance = advances.lockAdvance(tenantId(), advanceId);
        if (salary == null || advance == null || !"PAID".equals(salary.status())
                || !originalSettlementId.equals(salary.reservedSettlementId())
                || !Objects.equals(salary.employeeId(), advance.getEmployeeId()) || !Objects.equals(slip.getEmployeeId(), salary.employeeId())
                || !Objects.equals(slip.getPeriodMonth(), salary.periodMonth())) throw settlementReversalChanged();
        verifyLedger(advance);
        HrAdvanceRepayment original = repayment(originalRepaymentId);
        if (!Objects.equals(advanceId, original.getAdvanceId()) || !Objects.equals(slip.getId(), original.getSalarySlipId())
                || !salary.periodMonth().equals(original.getRepayMonth()) || !"SALARY".equals(original.getRepayType())
                || original.getSettlementId() != null) throw settlementReversalChanged();
        HrAdvanceRepayment current = salaryEntry(advanceId, salary);
        String restoredKey = HrAdvanceSalaryReservationChain.restoredKey(advanceId, slip.getId(), originalRepaymentId);
        if (current == null || !(Objects.equals(originalRepaymentId, current.getRepaymentId())
                || restoredKey.equals(current.getSourceEventKey()) && "RESERVED".equals(current.getStatus()))) throw settlementReversalChanged();
        refundSettlementEntry(advance, original, reversalId, HrAdvanceAmounts.positive(amount), fundsDate, true, apply);
        if (!apply) return;
        HrAdvanceRepayment restored = salaryEntry(advanceId, salary);
        if (restored == null || !restoredKey.equals(restored.getSourceEventKey()) || !"RESERVED".equals(restored.getStatus())
                || restored.getRepayAmount().compareTo(amount) != 0) throw settlementReversalChanged();
        verifyLedger(advance);
    }

    private HrAdvanceRepayment refundSettlementEntry(HrEmployeeAdvance advance, HrAdvanceRepayment original,
            Long reversalId, BigDecimal expected, LocalDate fundsDate, boolean restoreSalary, boolean apply) {
        if (original == null || original.getReversalOfId() != null || original.getProofFileId() != null
                || !Objects.equals(tenantId(), original.getTenantId()) || !Objects.equals(advance.getAdvanceId(), original.getAdvanceId())
                || original.getRepayAmount() == null || original.getRepayAmount().compareTo(expected) != 0 || expected.signum() <= 0
                || original.getRepayDate() == null || original.getPostedTime() == null
                || fundsDate == null || fundsDate.isAfter(HrHSupport.today()) || fundsDate.isBefore(original.getRepayDate())
                || !List.of("POSTED", "REVERSED").contains(String.valueOf(original.getStatus()))) throw settlementReversalChanged();
        List<HrAdvanceRepayment> previous = entries(advance.getAdvanceId()).stream()
                .filter(entry -> Objects.equals(original.getRepaymentId(), entry.getReversalOfId())).toList();
        String key = HrAdvanceSalaryReservationChain.reversalKey(reversalId, original.getRepaymentId());
        if (!previous.isEmpty()) {
            if (previous.size() != 1 || !"REVERSED".equals(original.getStatus())) throw settlementReversalChanged();
            HrAdvanceRepayment refund = previous.get(0);
            if (!"POSTED".equals(refund.getStatus()) || !key.equals(refund.getSourceEventKey())
                    || !Objects.equals(reversalId, refund.getSettlementId()) || refund.getSalarySlipId() != null || refund.getProofFileId() != null
                    || !original.getRepayType().equals(refund.getRepayType()) || !Objects.equals(original.getRepayMonth(), refund.getRepayMonth())
                    || refund.getRepayAmount().compareTo(expected.negate()) != 0 || !fundsDate.equals(refund.getRepayDate())
                    || refund.getPostedTime() == null) throw settlementReversalChanged();
            return refund;
        }
        if (!"POSTED".equals(original.getStatus())) throw settlementReversalChanged();
        HrAdvanceAmounts.Balance next = HrAdvanceAmounts.reverseRepayment(balance(advance), expected);
        if (restoreSalary) next = HrAdvanceAmounts.reserve(next, expected);
        if (!apply) return original;
        HrAdvanceRepayment refund = new HrAdvanceRepayment();
        refund.setTenantId(tenantId()); refund.setAdvanceId(advance.getAdvanceId()); refund.setSettlementId(reversalId);
        refund.setRepayType(original.getRepayType()); refund.setRepayMonth(original.getRepayMonth()); refund.setStatus("POSTED");
        refund.setSourceEventKey(key); refund.setReversalOfId(original.getRepaymentId()); refund.setRepayAmount(expected.negate());
        refund.setRepayDate(fundsDate); refund.setPostedTime(HrHSupport.now()); refund.setRemark("结算反向资金确认后退回原借款还款，保留原款金额及来源");
        save(refund); original.setStatus("REVERSED"); save(original);
        HrAdvanceRepayment restored = null;
        if (restoreSalary) {
            restored = newSalaryEntry(advance.getAdvanceId(), original.getSalarySlipId(), original.getRepayMonth());
            restored.setSourceEventKey(HrAdvanceSalaryReservationChain.restoredKey(advance.getAdvanceId(), original.getSalarySlipId(), original.getRepaymentId()));
            restored.setStatus("RESERVED"); restored.setRepayAmount(expected); restored.setRemark("原结算冲正后恢复工资扣还预约，尚未再次还款"); save(restored);
        }
        updateBalance(advance, next); audit(advance, refund, restoreSalary ? "SETTLEMENT_SALARY_REVERSE" : "SETTLEMENT_REVERSE");
        if (restored != null) audit(advance, restored, "SETTLEMENT_SALARY_RESTORE");
        return refund;
    }

    private static void requireSettlementReversal(Long originalSettlementId, Long reversalId) {
        requireSettlementTransaction(originalSettlementId); requireSettlementTransaction(reversalId);
        if (originalSettlementId.equals(reversalId)) throw settlementReversalChanged();
    }

    private static HrHException settlementReversalChanged() {
        return conflict("ADVANCE_SETTLEMENT_REVERSAL_CONFLICT", "结算原借款还款、返还金额或恢复预约不一致");
    }

    private HrAdvanceRepayment settlementEntry(HrEmployeeAdvance advance, Long settlementId) {
        HrAdvanceRepayment entry = repayments.selectOne(new LambdaQueryWrapper<HrAdvanceRepayment>()
                .eq(HrAdvanceRepayment::getTenantId, tenantId())
                .eq(HrAdvanceRepayment::getSourceEventKey, "SETTLEMENT:" + settlementId + ":ADVANCE:" + advance.getAdvanceId()));
        if (entry != null && (!Objects.equals(entry.getAdvanceId(), advance.getAdvanceId()) || !Objects.equals(entry.getSettlementId(), settlementId)
                || !"SETTLEMENT".equals(entry.getRepayType()) || entry.getSalarySlipId() != null || entry.getReversalOfId() != null
                || List.of("RESERVED", "RELEASED").contains(entry.getStatus()) && (entry.getRepayDate() != null || entry.getPostedTime() != null)
                || entry.getProofFileId() != null)) throw conflict("ADVANCE_SOURCE_CONFLICT", "结算借款预约来源不一致");
        return entry;
    }

    private static void requireSettlementTransaction(Long settlementId) {
        if (settlementId == null || settlementId <= 0 || !org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) throw invalid("结算借款须在已锁定来源的事务内处理");
    }

    private Optional<HrAdvanceRepayment> release(HrEmployeeAdvance advance, HrAdvanceRepayment entry) {
        if (entry == null || "RELEASED".equals(entry.getStatus())) return Optional.ofNullable(entry);
        if (!"RESERVED".equals(entry.getStatus())) throw conflict("ADVANCE_ENTRY_FINAL", "已入账的还款只能通过关联原款的冲正处理");
        HrAdvanceAmounts.Balance next = HrAdvanceAmounts.release(balance(advance), entry.getRepayAmount());
        entry.setStatus("RELEASED");
        entry.setRemark("SETTLEMENT".equals(entry.getRepayType()) ? "离职结算预约已释放，未改写实际还款" : "工资扣还预约已释放，未改写实际还款");
        save(entry);
        updateBalance(advance, next);
        audit(advance, entry, "SETTLEMENT".equals(entry.getRepayType()) ? "SETTLEMENT_RELEASE" : "SALARY_RELEASE");
        return Optional.of(entry);
    }

    private <T> T salaryLocked(Long advanceId, Long salarySlipId, BiFunction<HrEmployeeAdvance, SalarySource, T> operation) {
        if (advanceId == null || advanceId <= 0 || salarySlipId == null || salarySlipId <= 0) throw invalid("借款及工资单编号无效");
        return support.transaction(() -> {
            HrEmployeeAdvance initial = advance(advanceId);
            if (advances.lockEmployee(tenantId(), initial.getEmployeeId()) == null) throw conflict("ADVANCE_EMPLOYEE_MISSING", "借款员工档案不存在");
            SalarySource salary = advances.lockSalary(tenantId(), salarySlipId);
            if (salary != null) HrAdvancePayrollService.assertNotInSettlement(salary.reservedSettlementId());
            if (salary == null || !Objects.equals(salary.employeeId(), initial.getEmployeeId())) {
                throw conflict("ADVANCE_SALARY_MISMATCH", "工资单与借款员工或租户不匹配");
            }
            HrEmployeeAdvance current = advances.lockAdvance(tenantId(), advanceId);
            if (current == null) throw missing();
            if (!Objects.equals(current.getEmployeeId(), initial.getEmployeeId())) throw conflict("ADVANCE_EMPLOYEE_CHANGED", "借款归属已变化");
            verifyLedger(current);
            return operation.apply(current, salary);
        });
    }

    private HrEmployeeAdvance advance(Long identifier) {
        HrEmployeeAdvance row = advances.selectOne(new LambdaQueryWrapper<HrEmployeeAdvance>()
                .eq(HrEmployeeAdvance::getTenantId, tenantId()).eq(HrEmployeeAdvance::getAdvanceId, identifier));
        if (row == null) throw missing();
        return row;
    }

    private List<HrAdvanceRepayment> entries(Long advanceId) {
        return repayments.selectList(new LambdaQueryWrapper<HrAdvanceRepayment>()
                .eq(HrAdvanceRepayment::getTenantId, tenantId()).eq(HrAdvanceRepayment::getAdvanceId, advanceId)
                .orderByAsc(HrAdvanceRepayment::getRepaymentId));
    }

    private HrAdvanceRepayment salaryEntry(Long advanceId, SalarySource salary) {
        return currentSalaryEntry(advanceId, salary.salarySlipId(), salary.periodMonth());
    }

    HrAdvanceRepayment currentSalaryEntry(Long advanceId, Long salaryId, String periodMonth) {
        return HrAdvanceSalaryReservationChain.current(tenantId(), advanceId, salaryId, periodMonth, entries(advanceId));
    }

    private void verifyLedger(HrEmployeeAdvance advance) {
        verifiedLedger(advance);
    }

    LedgerSnapshot verifiedLedger(HrEmployeeAdvance advance) {
        if (advance == null || !Objects.equals(advance.getTenantId(), tenantId())) throw missing();
        HrAdvanceAmounts.Balance current = balance(advance);
        List<HrAdvanceRepayment> rows = entries(advance.getAdvanceId());
        BigDecimal reserved = BigDecimal.ZERO;
        BigDecimal repaid = BigDecimal.ZERO;
        for (HrAdvanceRepayment entry : rows) {
            if (entry.getRepayAmount() == null || entry.getRepayAmount().signum() == 0
                    || entry.getReversalOfId() == null && entry.getRepayAmount().signum() < 0
                    || entry.getReversalOfId() != null && (entry.getRepayAmount().signum() > 0 || !"POSTED".equals(entry.getStatus()))
                    || entry.getRepayType() == null || !List.of("SALARY", "MANUAL", "SETTLEMENT").contains(entry.getRepayType())) {
                throw conflict("ADVANCE_LEDGER_INVALID", "还款流水类型、符号或冲正状态无效");
            }
            if ("RESERVED".equals(entry.getStatus())) reserved = reserved.add(entry.getRepayAmount());
            else if (List.of("POSTED", "REVERSED").contains(entry.getStatus())) repaid = repaid.add(entry.getRepayAmount());
            else if (!"RELEASED".equals(entry.getStatus())) throw conflict("ADVANCE_LEDGER_INVALID", "还款流水状态无效");
        }
        if (reserved.compareTo(current.reserved()) != 0 || repaid.compareTo(current.repaid()) != 0) {
            throw conflict("ADVANCE_LEDGER_MISMATCH", "借款余额与实际还款流水不一致，请先核对来源");
        }
        return new LedgerSnapshot(current, rows);
    }

    private HrAdvanceAmounts.Balance balance(HrEmployeeAdvance advance) {
        if (advance.getPaidTime() == null || advance.getPaymentRequestId() == null || advance.getPaymentRequestId() <= 0 || !"APPROVED".equals(advance.getApprovalStatus())
                || !List.of("PAID", "REPAYING", "CLEARED", "WRITTEN_OFF").contains(advance.getStatus())) {
            throw conflict("ADVANCE_NOT_FUNDED", "借款尚未实际放款，不能形成还款或扣款预约");
        }
        return new HrAdvanceAmounts.Balance(advance.getAdvanceAmount(), advance.getRepaidAmount(), advance.getOutstandingAmount(),
                advance.getReservedAmount(), advance.getWrittenOffAmount());
    }

    private void requireSalaryPlan(HrEmployeeAdvance advance, SalarySource salary) {
        if (!"SALARY_DEDUCT".equals(advance.getRepayMode()) || advance.getRepayStartMonth() == null
                || !advance.getRepayStartMonth().matches("[0-9]{4}-(0[1-9]|1[0-2])") || salary.periodMonth() == null
                || !salary.periodMonth().matches("[0-9]{4}-(0[1-9]|1[0-2])") || advance.getMonthlyDeductAmount() == null) {
            throw conflict("ADVANCE_SALARY_PLAN_INVALID", "借款未配置有效工资扣还计划");
        }
        YearMonth month = YearMonth.parse(salary.periodMonth());
        if (month.getYear() < 1 || YearMonth.parse(advance.getRepayStartMonth()).getYear() < 1) {
            throw conflict("ADVANCE_SALARY_PLAN_INVALID", "工资和扣还月份须为有效年份");
        }
        if (YearMonth.parse(advance.getRepayStartMonth()).isAfter(month) || YearMonth.from(advance.getPaidTime()).isAfter(month)) {
            throw conflict("ADVANCE_REPAYMENT_NOT_DUE", "工资月份早于放款或约定扣还开始月份");
        }
        HrAdvanceAmounts.positive(advance.getMonthlyDeductAmount());
    }

    private static void requireSalaryState(SalarySource salary, String... allowed) {
        if (!List.of(allowed).contains(salary.status())) throw conflict("ADVANCE_SALARY_STATE", "当前工资单状态不允许此还款操作");
    }

    private void updateBalance(HrEmployeeAdvance advance, HrAdvanceAmounts.Balance balance) {
        advance.setRepaidAmount(balance.repaid());
        advance.setOutstandingAmount(balance.outstanding());
        advance.setReservedAmount(balance.reserved());
        advance.setWrittenOffAmount(balance.writtenOff());
        advance.setStatus(balance.outstanding().signum() == 0 ? (balance.writtenOff().signum() > 0 ? "WRITTEN_OFF" : "CLEARED")
                : (balance.repaid().signum() > 0 ? "REPAYING" : "PAID"));
        advance.setUpdateBy(userName());
        advance.setUpdateTime(HrHSupport.now());
        if (advances.updateById(advance) != 1) throw conflict("ADVANCE_VERSION_CONFLICT", "借款已变化，当前还款操作未保存");
    }

    private void save(HrAdvanceRepayment entry) {
        entry.setUpdateBy(userName());
        entry.setUpdateTime(HrHSupport.now());
        if (entry.getRepaymentId() == null) {
            entry.setCreateBy(userName());
            entry.setCreateTime(HrHSupport.now());
            if (repayments.insert(entry) != 1) throw conflict("ADVANCE_ENTRY_FAILED", "还款流水未保存");
        } else if (repayments.updateById(entry) != 1) throw conflict("ADVANCE_ENTRY_FAILED", "还款流水已变化");
    }

    private HrAdvanceRepayment newSalaryEntry(Long advanceId, Long salarySlipId, String month) {
        HrAdvanceRepayment entry = new HrAdvanceRepayment();
        entry.setTenantId(tenantId());
        entry.setAdvanceId(advanceId);
        entry.setSalarySlipId(salarySlipId);
        entry.setRepayMonth(month);
        entry.setRepayType("SALARY");
        entry.setSourceEventKey(salaryKey(advanceId, salarySlipId));
        return entry;
    }

    private static String salaryKey(Long advanceId, Long salarySlipId) {
        return HrAdvanceSalaryReservationChain.rootKey(advanceId, salarySlipId);
    }

    private void audit(HrEmployeeAdvance advance, HrAdvanceRepayment entry, String operation) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("repaymentId", entry.getRepaymentId()); detail.put("salarySlipId", entry.getSalarySlipId());
        detail.put("settlementId", entry.getSettlementId());
        detail.put("sourceEventKey", entry.getSourceEventKey()); detail.put("amount", entry.getRepayAmount());
        detail.put("status", entry.getStatus()); detail.put("repaid", advance.getRepaidAmount());
        detail.put("reserved", advance.getReservedAmount()); detail.put("outstanding", advance.getOutstandingAmount());
        detail.put("proofFileId", entry.getProofFileId()); detail.put("repayDate", entry.getRepayDate()); detail.put("remark", entry.getRemark());
        support.audit("HR_ADVANCE", advance.getAdvanceId(), operation, detail);
    }

    private static HrHException missing() {
        return new HrHException("ADVANCE_NOT_FOUND", "借款不存在", 404);
    }
}
