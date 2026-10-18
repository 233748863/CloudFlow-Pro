package com.cloudflow.hr.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.cloudflow.hr.service.HrHException.conflict;

public final class HrAdvanceApplicationRules {
    public static final String MULTIPLIER = "hr.advance.salary.multiplier";
    public static final String NET_RATIO = "hr.advance.payroll.maximumNetRatio";
    public static final String MINIMUM_NET = "hr.advance.payroll.minimumNetAmount";
    private static final BigDecimal MAX_SALARY = new BigDecimal("9999999999999999.99");

    private HrAdvanceApplicationRules() { }

    public record PublishedRule(Long ruleId, Long ruleTenantId, String ruleCode, Integer ruleVersion, BigDecimal value) { }
    public record Policy(PublishedRule multiplier, PublishedRule maximumNetRatio, PublishedRule minimumNetAmount) { }
    public record Capacity(BigDecimal maximumAmount, BigDecimal occupiedAmount, BigDecimal availableAmount) { }

    public static Policy policy(Long tenantId, List<PublishedRule> rules, boolean payrollDeduction) {
        List<String> expected = payrollDeduction ? List.of(MULTIPLIER, NET_RATIO, MINIMUM_NET) : List.of(MULTIPLIER);
        if (tenantId == null || tenantId <= 0 || rules == null || rules.size() != expected.size()) throw missing();
        Map<String, PublishedRule> indexed = new HashMap<>();
        for (PublishedRule rule : rules) {
            if (rule == null || rule.ruleId() == null || rule.ruleId() <= 0 || rule.ruleVersion() == null || rule.ruleVersion() <= 0
                    || rule.ruleTenantId() == null || !(tenantId.equals(rule.ruleTenantId()) || rule.ruleTenantId() == 100000L || rule.ruleTenantId() == 0L)
                    || !expected.contains(rule.ruleCode()) || indexed.putIfAbsent(rule.ruleCode(), rule) != null
                    || rule.value() == null || rule.value().signum() < 0 || rule.value().compareTo(MAX_SALARY) > 0) throw missing();
            try { rule.value().setScale(2, RoundingMode.UNNECESSARY); }
            catch (ArithmeticException failure) { throw missing(); }
        }
        PublishedRule multiplier = indexed.get(MULTIPLIER);
        if (multiplier == null || multiplier.value().signum() <= 0) throw missing();
        if (payrollDeduction && indexed.get(NET_RATIO).value().compareTo(BigDecimal.ONE) > 0) throw missing();
        return new Policy(multiplier, indexed.get(NET_RATIO), indexed.get(MINIMUM_NET));
    }

    public static Capacity capacity(Policy policy, BigDecimal fixedMonthlySalary, BigDecimal occupiedAmount) {
        if (policy == null || policy.multiplier() == null || policy.multiplier().value() == null || policy.multiplier().value().signum() <= 0
                || fixedMonthlySalary == null || fixedMonthlySalary.signum() <= 0 || fixedMonthlySalary.compareTo(MAX_SALARY) > 0
                || occupiedAmount == null || occupiedAmount.signum() < 0) throw missing();
        try { fixedMonthlySalary.setScale(2, RoundingMode.UNNECESSARY); occupiedAmount.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException failure) { throw missing(); }
        // Keep the exact limit: a fractional cent must never increase the approved borrowing ceiling.
        BigDecimal maximum = fixedMonthlySalary.multiply(policy.multiplier().value());
        BigDecimal available = maximum.subtract(occupiedAmount).max(BigDecimal.ZERO).setScale(2, RoundingMode.DOWN);
        return new Capacity(maximum, occupiedAmount, available);
    }

    public static void requireAvailable(Capacity capacity, BigDecimal requestedAmount) {
        BigDecimal requested;
        try { requested = HrAdvanceAmounts.positive(requestedAmount); }
        catch (IllegalArgumentException failure) { throw HrHException.invalid("借款金额须大于0且最多保留两位小数，不超过999999999999.99"); }
        if (capacity == null || requested.compareTo(capacity.availableAmount()) > 0) {
            throw conflict("ADVANCE_LIMIT_EXCEEDED", "借款金额超过已核定可借额度，请核对未还本金及待审批、待放款申请");
        }
    }

    public static Map<String, Object> payrollSnapshot(Policy policy) {
        if (policy == null || policy.maximumNetRatio() == null || policy.minimumNetAmount() == null) throw missing();
        return Map.of("confirmationStatus", "CONFIRMED", "maximumNetRatio", policy.maximumNetRatio().value(),
                "minimumNetAmount", policy.minimumNetAmount().value(), "maximumNetRatioRule", policy.maximumNetRatio(),
                "minimumNetAmountRule", policy.minimumNetAmount());
    }

    private static HrHException missing() {
        return conflict("ADVANCE_POLICY_REQUIRED", "借款额度及工资扣还须读取完整已发布规则和已生效固定月薪，不使用默认值");
    }
}
