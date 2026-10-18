package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.hr.domain.entity.HrAdvanceRepayment;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.mapper.HrAdvanceRepaymentMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Supplier;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

@Service
@RequiredArgsConstructor
public class HrAdvancePayrollService {
    private static final String SOURCE = "HR_ADVANCE";
    private static final String REVERSAL = "HR_ADVANCE_REVERSAL";
    private final HrEmployeeAdvanceMapper advances;
    private final HrAdvanceRepaymentMapper repayments;
    private final HrSalarySlipMapper salaries;
    private final HrAdvanceLedgerService ledger;
    private final HrRuleSupport support;
    private final HrReferralBonusService referralBonus;
    private final HrCommissionService commissions;

    public static boolean hasReversals(HrSalarySlip slip) {
        return slip != null && slip.getComponents() != null && slip.getComponents().stream()
                .anyMatch(component -> REVERSAL.equals(component.get("sourceBizType")));
    }

    public <T> T withEmployeeLocks(List<Long> employeeIds, Supplier<T> action) {
        if (employeeIds == null || employeeIds.stream().anyMatch(identifier -> identifier == null || identifier <= 0)) {
            throw HrHException.invalid("工资员工编号无效");
        }
        return support.transaction(() -> {
            for (Long employeeId : employeeIds.stream().distinct().sorted().toList()) {
                if (advances.lockEmployee(tenantId(), employeeId) == null) throw conflict("ADVANCE_EMPLOYEE_MISSING", "工资员工档案不存在");
            }
            return action.get();
        });
    }

    public void preview(HrSalarySlip slip) {
        if (!Objects.equals(slip.getTenantId(), tenantId())) throw HrHException.forbidden();
        List<Map<String, Object>> components = new ArrayList<>(slip.getComponents() == null ? List.of() : slip.getComponents());
        BigDecimal previous = BigDecimal.ZERO;
        for (Map<String, Object> component : components) {
            if (SOURCE.equals(component.get("sourceBizType"))) previous = previous.add(HrAdvanceAmounts.positive(decimal(component.get("amount"))));
            if (REVERSAL.equals(component.get("sourceBizType"))) throw conflict("ADVANCE_CORRECTION_RECALCULATION", "借款还款补正不能作为普通工资重算");
        }
        components.removeIf(component -> SOURCE.equals(component.get("sourceBizType")));
        BigDecimal originalNet = slip.getNetTotal().add(previous);
        BigDecimal originalDeduction = slip.getDeductionTotal().subtract(previous);
        YearMonth payrollMonth = month(slip.getPeriodMonth());
        List<Plan> plans = new ArrayList<>();
        BigDecimal budget = originalNet.max(BigDecimal.ZERO);
        List<HrEmployeeAdvance> loans = advances.selectList(new LambdaQueryWrapper<HrEmployeeAdvance>()
                .eq(HrEmployeeAdvance::getTenantId, tenantId()).eq(HrEmployeeAdvance::getEmployeeId, slip.getEmployeeId())
                .eq(HrEmployeeAdvance::getRepayMode, "SALARY_DEDUCT").in(HrEmployeeAdvance::getStatus, "PAID", "REPAYING"));
        for (HrEmployeeAdvance loan : loans) {
            HrAdvanceAmounts.Balance balance = ledger.verifiedBalance(loan);
            YearMonth starts = month(loan.getRepayStartMonth());
            if (starts.isAfter(payrollMonth) || YearMonth.from(loan.getPaidTime()).isAfter(payrollMonth)) continue;
            BigDecimal used = BigDecimal.ZERO;
            BigDecimal own = BigDecimal.ZERO;
            for (HrAdvanceRepayment entry : loanEntries(loan.getAdvanceId())) {
                if (slip.getId() != null && Objects.equals(entry.getSalarySlipId(), slip.getId())
                        && "SALARY".equals(entry.getRepayType()) && "RESERVED".equals(entry.getStatus())) own = own.add(entry.getRepayAmount());
                if ("SALARY".equals(entry.getRepayType()) && slip.getPeriodMonth().equals(entry.getRepayMonth())
                        && List.of("RESERVED", "POSTED", "REVERSED").contains(entry.getStatus())) used = used.add(entry.getRepayAmount());
            }
            BigDecimal monthly = HrAdvanceAmounts.positive(loan.getMonthlyDeductAmount()).subtract(used).add(own);
            if (monthly.signum() < 0) throw conflict("ADVANCE_MONTHLY_LIMIT", "借款本月已用扣还额度超出核定计划，请先核对原记录");
            BigDecimal available = balance.available().add(own);
            if (monthly.signum() == 0 || available.signum() == 0) continue;
            budget = budget.min(HrAdvancePayrollPolicy.budget(originalNet.max(BigDecimal.ZERO), loan.getRuleSnapshot()));
            plans.add(new Plan(loan, monthly.min(available)));
        }
        plans.sort(Comparator.comparing((Plan plan) -> plan.advance().getPaidTime()).thenComparing(plan -> plan.advance().getAdvanceId()));
        BigDecimal total = BigDecimal.ZERO;
        for (Plan plan : plans) {
            BigDecimal deduction = plan.maximum().min(budget.subtract(total));
            if (deduction.signum() <= 0) continue;
            Map<String, Object> component = new LinkedHashMap<>();
            component.put("name", "借款扣还 " + plan.advance().getAdvanceNo()); component.put("type", "DEDUCTION");
            component.put("sourceBizType", SOURCE); component.put("advanceId", plan.advance().getAdvanceId().toString());
            component.put("amount", deduction); component.put("payrollDeduction", plan.advance().getRuleSnapshot().path("payrollDeduction"));
            component.put("ruleId", plan.advance().getRuleSnapshot().path("ruleId").longValue());
            component.put("ruleVersion", plan.advance().getRuleSnapshot().path("ruleVersion").intValue());
            components.add(component); total = total.add(deduction);
        }
        slip.setComponents(components); slip.setDeductionTotal(originalDeduction.add(total)); slip.setNetTotal(originalNet.subtract(total));
    }

    @Audit(name = "保存工资借款扣还预约", spel = "#salarySlipId")
    public HrSalarySlip reserveCalculated(Long salarySlipId) {
        return salaryLocked(salarySlipId, slip -> {
            if (!"DRAFT".equals(slip.getStatus()) || Boolean.TRUE.equals(slip.getEmployeeConfirmed())) {
                throw conflict("ADVANCE_SALARY_STATE", "只能重算未确定的草稿工资单");
            }
            preview(slip);
            Map<Long, BigDecimal> expected = deductions(slip);
            for (HrAdvanceRepayment entry : salaryEntries(salarySlipId)) {
                if ("RESERVED".equals(entry.getStatus()) && !expected.containsKey(entry.getAdvanceId())) ledger.releaseSalary(entry.getAdvanceId(), salarySlipId);
            }
            for (Map.Entry<Long, BigDecimal> entry : expected.entrySet()) ledger.reserveSalary(entry.getKey(), salarySlipId, entry.getValue());
            saveSalary(slip);
            assertEntries(slip, false);
            return slip;
        });
    }

    public void assertReserved(HrSalarySlip slip) {
        salaryLocked(slip.getId(), current -> {
            if (!Objects.equals(current.getVersion(), slip.getVersion())) throw conflict("ADVANCE_SALARY_CHANGED", "工资单已变化，请重新读取");
            assertEntries(current, false); return null;
        });
    }

    @Audit(name = "发薪并入账借款扣还", spel = "#salarySlipId", highRisk = true)
    public void pay(Long salarySlipId, Consumer<HrSalarySlip> verifyDigest) {
        salaryLocked(salarySlipId, slip -> {
            if (!List.of("SUBMITTED", "PAID").contains(slip.getStatus())) throw conflict("ADVANCE_SALARY_STATE", "仅已提交工资单可以确认发薪");
            verifyDigest.accept(slip);
            boolean paid = "PAID".equals(slip.getStatus());
            assertEntries(slip, paid);
            if (paid) { referralBonus.postSalary(slip); commissions.postSalary(slip); return null; }
            slip.setStatus("PAID"); saveSalary(slip);
            referralBonus.postSalary(slip);
            commissions.postSalary(slip);
            for (Long advanceId : deductions(slip).keySet()) ledger.postSalary(advanceId, salarySlipId, HrHSupport.today());
            for (Map<String, Object> component : components(slip, REVERSAL)) {
                ledger.reverseSalary(identifier(component.get("repaymentId")), salarySlipId, HrHSupport.today());
            }
            support.audit("SALARY_SLIP", salarySlipId, "ADVANCE_PAYROLL_POST", Map.of("salarySlipId", salarySlipId,
                    "deductionCount", deductions(slip).size(), "reversalCount", components(slip, REVERSAL).size()));
            return null;
        });
    }

    /** Funds verified by settlement; preserve the occupied source so ordinary payroll cannot pay or correct it again. */
    void paySettlementLocked(HrSalarySlip slip, Long settlementId, java.time.LocalDate paidDate) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                || !Objects.equals(tenantId(), slip.getTenantId()) || !Objects.equals(settlementId, slip.getReservedSettlementId())
                || !List.of("SUBMITTED", "CONFIRMED").contains(slip.getStatus()) || hasReversals(slip)) throw conflict("SETTLEMENT_SALARY_STATE", "结算工资来源或实际状态不一致");
        assertEntries(slip, false);
        slip.setStatus("PAID"); saveSalary(slip);
        for (Long advanceId : deductions(slip).keySet()) ledger.postSettlementSalaryLocked(advanceId, slip, settlementId, paidDate);
        referralBonus.postSalary(slip);
        commissions.postSalary(slip);
        support.audit("SALARY_SLIP", slip.getId(), "SETTLEMENT_PAYROLL_POST", Map.of("settlementId", settlementId, "deductionCount", deductions(slip).size()));
    }

    /** Caller verifies the frozen salary, original repayment identifiers and both money facts in the settlement transaction. */
    void restoreSettlementLocked(HrSalarySlip slip, Long originalSettlementId, Long reversalId, String originalState,
            Map<Long, Long> originalRepayments, java.time.LocalDate fundsDate) {
        restoreSettlementLocked(slip, originalSettlementId, reversalId, originalState, originalRepayments, fundsDate, true);
    }

    void restoreSettlementLocked(HrSalarySlip slip, Long originalSettlementId, Long reversalId, String originalState,
            Map<Long, Long> originalRepayments, java.time.LocalDate fundsDate, boolean apply) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                || slip == null || !Objects.equals(tenantId(), slip.getTenantId()) || !"PAID".equals(slip.getStatus())
                || originalSettlementId == null || originalSettlementId <= 0 || !originalSettlementId.equals(slip.getReservedSettlementId())
                || reversalId == null || reversalId <= 0 || originalSettlementId.equals(reversalId)
                || !List.of("SUBMITTED", "CONFIRMED").contains(String.valueOf(originalState)) || hasReversals(slip)
                || slip.getVersion() == null || slip.getVersion() == Integer.MAX_VALUE || originalRepayments == null) throw conflict("SETTLEMENT_SALARY_RESTORE_CONFLICT", "原结算工资状态或恢复依据不一致");
        Map<Long, BigDecimal> expected = deductions(slip);
        if (!expected.keySet().equals(originalRepayments.keySet())) throw conflict("SETTLEMENT_SALARY_RESTORE_CONFLICT", "工资借款来源与原结算冻结记录不一致");
        for (Map.Entry<Long, BigDecimal> deduction : expected.entrySet()) {
            ledger.reverseSettlementSalaryLocked(deduction.getKey(), slip, originalSettlementId, reversalId,
                    originalRepayments.get(deduction.getKey()), deduction.getValue(), fundsDate, apply);
        }
        referralBonus.reverseSettlementSalaryLocked(slip, originalSettlementId, reversalId, apply);
        commissions.reverseSettlementSalaryLocked(slip, originalSettlementId, reversalId, apply);
        if (!apply) { assertEntries(slip, true); return; }
        assertEntries(slip, false);
        if (salaries.update(null, new LambdaUpdateWrapper<HrSalarySlip>().eq(HrSalarySlip::getTenantId, tenantId())
                .eq(HrSalarySlip::getId, slip.getId()).eq(HrSalarySlip::getEmployeeId, slip.getEmployeeId())
                .eq(HrSalarySlip::getVersion, slip.getVersion()).eq(HrSalarySlip::getStatus, "PAID")
                .eq(HrSalarySlip::getReservedSettlementId, originalSettlementId).set(HrSalarySlip::getStatus, originalState)
                .set(HrSalarySlip::getReservedSettlementId, null).set(HrSalarySlip::getUpdateBy, userName())
                .set(HrSalarySlip::getUpdateTime, HrHSupport.now()).setSql("version = version + 1")) != 1) throw conflict("SETTLEMENT_SALARY_RESTORE_CONFLICT", "原工资已变化，未恢复工资或解除结算占位");
        support.audit("SALARY_SLIP", slip.getId(), "SETTLEMENT_PAYROLL_RESTORED", Map.of("originalSettlementId", originalSettlementId,
                "reversalSettlementId", reversalId, "originalState", originalState, "deductionCount", expected.size()));
    }

    @Audit(name = "取消工资借款扣还预约", spel = "#salarySlipId", highRisk = true)
    public void releaseSalary(Long salarySlipId) {
        salaryLocked(salarySlipId, slip -> {
            if (!List.of("DRAFT", "CANCELLED").contains(slip.getStatus())) throw conflict("ADVANCE_SALARY_STATE", "已确定工资单不能释放扣还预约");
            for (HrAdvanceRepayment entry : salaryEntries(salarySlipId)) {
                if (historicalSalaryEntry(slip, entry)) continue;
                if ("RESERVED".equals(entry.getStatus())) ledger.releaseSalary(entry.getAdvanceId(), salarySlipId);
                else if (!"RELEASED".equals(entry.getStatus())) throw conflict("ADVANCE_ENTRY_FINAL", "工资已有实际还款记录，不能取消");
            }
            return null;
        });
    }

    public void applyReversals(HrSalarySlip correction, HrSalarySlip original, List<Long> repaymentIds) {
        if (repaymentIds == null || repaymentIds.isEmpty()) return;
        if (!Objects.equals(correction.getTenantId(), tenantId()) || !Objects.equals(original.getTenantId(), tenantId())
                || !Objects.equals(correction.getEmployeeId(), original.getEmployeeId()) || !"PAID".equals(original.getStatus())
                || !"PENDING".equals(correction.getStatus()) || new HashSet<>(repaymentIds).size() != repaymentIds.size()) {
            throw conflict("ADVANCE_REVERSAL_SOURCE_INVALID", "工资补正的员工、原单状态或原款选择无效");
        }
        List<HrSalarySlip> pending = advances.pendingCorrectionSlips(tenantId(), correction.getEmployeeId());
        List<Map<String, Object>> components = new ArrayList<>(correction.getComponents());
        BigDecimal total = BigDecimal.ZERO;
        for (Long repaymentId : repaymentIds) {
            HrAdvanceRepayment source = repayment(repaymentId);
            if (!Objects.equals(source.getSalarySlipId(), original.getId()) || !"SALARY".equals(source.getRepayType())
                    || source.getReversalOfId() != null || !"POSTED".equals(source.getStatus())) {
                throw conflict("ADVANCE_REVERSAL_SOURCE_INVALID", "只能退回所选原工资单内尚未冲正的实际借款扣款");
            }
            for (HrSalarySlip active : pending) {
                if (components(active, REVERSAL).stream().anyMatch(component -> Objects.equals(identifier(component.get("repaymentId")), repaymentId))) {
                    throw conflict("ADVANCE_REVERSAL_PENDING", "所选还款已有待审批或待支付补正，请先完成原补正");
                }
            }
            verifyReversalSource(correction, source);
            components.add(Map.of("name", "退回原借款扣还", "type", "DEDUCTION", "sourceBizType", REVERSAL,
                    "repaymentId", repaymentId.toString(), "advanceId", source.getAdvanceId().toString(),
                    "originalSlipId", original.getId().toString(), "amount", source.getRepayAmount().negate()));
            total = total.add(source.getRepayAmount());
        }
        correction.setComponents(components); correction.setDeductionTotal(correction.getDeductionTotal().subtract(total));
        correction.setNetTotal(correction.getNetTotal().add(total));
    }

    private void assertEntries(HrSalarySlip slip, boolean paid) {
        if (slip.getGrossTotal() == null || slip.getDeductionTotal() == null || slip.getNetTotal() == null
                || slip.getGrossTotal().subtract(slip.getDeductionTotal()).compareTo(slip.getNetTotal()) != 0) {
            throw conflict("ADVANCE_PAYROLL_TOTAL_MISMATCH", "工资应发、扣款与实发金额不一致");
        }
        Map<Long, BigDecimal> expected = deductions(slip);
        Set<Long> matched = new HashSet<>();
        for (HrAdvanceRepayment entry : salaryEntries(slip.getId())) {
            if ("RELEASED".equals(entry.getStatus()) || entry.getReversalOfId() != null) continue;
            if (historicalSalaryEntry(slip, entry)) continue;
            BigDecimal amount = expected.get(entry.getAdvanceId());
            if (amount == null || !matched.add(entry.getAdvanceId()) || amount.compareTo(entry.getRepayAmount()) != 0
                    || !"SALARY".equals(entry.getRepayType()) || !slip.getPeriodMonth().equals(entry.getRepayMonth())
                    || !(paid ? List.of("POSTED", "REVERSED").contains(entry.getStatus()) : "RESERVED".equals(entry.getStatus()))) {
                throw conflict("ADVANCE_PAYROLL_LEDGER_MISMATCH", "工资扣款明细与实际预约或还款流水不一致");
            }
            verifyReversalSource(slip, entry);
        }
        if (matched.size() != expected.size()) throw conflict("ADVANCE_RESERVATION_MISSING", "工资借款扣款缺少真实预约，请重新计算");
        Set<Long> originals = new HashSet<>();
        for (Map<String, Object> component : components(slip, REVERSAL)) {
            Long repaymentId = identifier(component.get("repaymentId"));
            HrAdvanceRepayment source = repayment(repaymentId);
            if (!originals.add(repaymentId) || source.getReversalOfId() != null || !"SALARY".equals(source.getRepayType())
                    || !Objects.equals(identifier(component.get("advanceId")), source.getAdvanceId())
                    || !Objects.equals(identifier(component.get("originalSlipId")), source.getSalarySlipId())
                    || decimal(component.get("amount")).compareTo(source.getRepayAmount().negate()) != 0
                    || !(paid ? "REVERSED".equals(source.getStatus()) : "POSTED".equals(source.getStatus()))) {
                throw conflict("ADVANCE_REVERSAL_SOURCE_INVALID", "借款补正明细与原还款不一致");
            }
            verifyReversalSource(slip, source);
            if (paid && salaryEntries(slip.getId()).stream().noneMatch(entry -> Objects.equals(entry.getReversalOfId(), repaymentId)
                    && "POSTED".equals(entry.getStatus()) && entry.getRepayAmount().compareTo(source.getRepayAmount().negate()) == 0)) {
                throw conflict("ADVANCE_REVERSAL_MISSING", "已发放补正工资缺少反向还款流水");
            }
        }
        if (salaryEntries(slip.getId()).stream().anyMatch(entry -> entry.getReversalOfId() != null && !originals.contains(entry.getReversalOfId()))) {
            throw conflict("ADVANCE_PAYROLL_LEDGER_MISMATCH", "工资存在未列示的反向还款记录");
        }
    }

    private void verifyReversalSource(HrSalarySlip slip, HrAdvanceRepayment source) {
        HrEmployeeAdvance loan = advances.selectById(source.getAdvanceId());
        if (loan == null || !Objects.equals(loan.getTenantId(), tenantId()) || !Objects.equals(loan.getEmployeeId(), slip.getEmployeeId())) {
            throw conflict("ADVANCE_SALARY_MISMATCH", "原还款与当前员工或租户不匹配");
        }
        ledger.verifiedBalance(loan);
    }

    private boolean historicalSalaryEntry(HrSalarySlip slip, HrAdvanceRepayment entry) {
        if (entry.getReversalOfId() != null) return false;
        HrAdvanceRepayment current = ledger.currentSalaryEntry(entry.getAdvanceId(), slip.getId(), slip.getPeriodMonth());
        if (current == null) throw conflict("ADVANCE_PAYROLL_LEDGER_MISMATCH", "工资扣还缺少有效来源关联");
        return !Objects.equals(current.getRepaymentId(), entry.getRepaymentId());
    }

    private <T> T salaryLocked(Long salarySlipId, java.util.function.Function<HrSalarySlip, T> action) {
        HrSalarySlip initial = salary(salarySlipId);
        return withEmployeeLocks(List.of(initial.getEmployeeId()), () -> {
            HrEmployeeAdvanceMapper.SalarySource locked = advances.lockSalary(tenantId(), salarySlipId);
            if (locked == null) throw conflict("ADVANCE_SALARY_MISSING", "工资单不存在");
            assertNotInSettlement(locked.reservedSettlementId());
            HrSalarySlip current = salary(salarySlipId);
            if (!Objects.equals(initial.getEmployeeId(), current.getEmployeeId())) throw conflict("ADVANCE_SALARY_CHANGED", "工资员工已变化");
            return action.apply(current);
        });
    }

    private HrSalarySlip salary(Long identifier) {
        HrSalarySlip row = identifier == null ? null : salaries.selectById(identifier);
        if (row == null || !Objects.equals(row.getTenantId(), tenantId()) || Integer.valueOf(1).equals(row.getDeleted())) {
            throw new HrHException("ADVANCE_SALARY_MISSING", "工资单不存在", 404);
        }
        return row;
    }

    public static void assertNotInSettlement(Long settlementId) {
        if (settlementId != null) throw conflict("SALARY_RESERVED_BY_SETTLEMENT", "工资已纳入离职结算，请通过该结算处理付款或冲正");
    }

    private void saveSalary(HrSalarySlip slip) {
        slip.setUpdateBy(userName()); slip.setUpdateTime(HrHSupport.now());
        if (salaries.updateById(slip) != 1) throw conflict("ADVANCE_SALARY_CHANGED", "工资单已变化，本次操作未保存");
    }

    private HrAdvanceRepayment repayment(Long identifier) {
        HrAdvanceRepayment row = identifier == null ? null : repayments.selectById(identifier);
        if (row == null || !Objects.equals(row.getTenantId(), tenantId())) throw new HrHException("ADVANCE_REPAYMENT_NOT_FOUND", "原还款不存在", 404);
        return row;
    }

    private List<HrAdvanceRepayment> loanEntries(Long advanceId) {
        return repayments.selectList(new LambdaQueryWrapper<HrAdvanceRepayment>().eq(HrAdvanceRepayment::getTenantId, tenantId())
                .eq(HrAdvanceRepayment::getAdvanceId, advanceId).orderByAsc(HrAdvanceRepayment::getRepaymentId));
    }

    private List<HrAdvanceRepayment> salaryEntries(Long salarySlipId) {
        return repayments.selectList(new LambdaQueryWrapper<HrAdvanceRepayment>().eq(HrAdvanceRepayment::getTenantId, tenantId())
                .eq(HrAdvanceRepayment::getSalarySlipId, salarySlipId).orderByAsc(HrAdvanceRepayment::getAdvanceId));
    }

    private static Map<Long, BigDecimal> deductions(HrSalarySlip slip) {
        Map<Long, BigDecimal> amounts = new java.util.TreeMap<>();
        for (Map<String, Object> component : components(slip, SOURCE)) {
            Long advanceId = identifier(component.get("advanceId"));
            if (!"DEDUCTION".equals(component.get("type")) || amounts.put(advanceId, HrAdvanceAmounts.positive(decimal(component.get("amount")))) != null) {
                throw conflict("ADVANCE_DUPLICATE_COMPONENT", "同一工资单存在重复借款扣款项");
            }
        }
        return amounts;
    }

    private static List<Map<String, Object>> components(HrSalarySlip slip, String source) {
        return slip.getComponents() == null ? List.of() : slip.getComponents().stream().filter(component -> source.equals(component.get("sourceBizType"))).toList();
    }

    private static BigDecimal decimal(Object value) {
        try { return new BigDecimal(String.valueOf(value)); }
        catch (NumberFormatException failure) { throw conflict("ADVANCE_COMPONENT_INVALID", "工资借款金额无效"); }
    }

    private static Long identifier(Object value) {
        try {
            long identifier = decimal(value).longValueExact();
            if (identifier <= 0) throw new ArithmeticException();
            return identifier;
        } catch (ArithmeticException failure) { throw conflict("ADVANCE_COMPONENT_INVALID", "工资借款来源编号无效"); }
    }

    private static YearMonth month(String value) {
        if (value == null || !value.matches("[0-9]{4}-(0[1-9]|1[0-2])") || value.startsWith("0000")) throw conflict("ADVANCE_SALARY_PLAN_INVALID", "扣还月份无效");
        return YearMonth.parse(value);
    }

    private record Plan(HrEmployeeAdvance advance, BigDecimal maximum) { }
}
