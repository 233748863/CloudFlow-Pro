package com.cloudflow.hr.checks;

import com.cloudflow.hr.service.HrAdvanceApplicationRules;
import com.cloudflow.hr.service.HrAdvanceApplicationRules.PublishedRule;
import com.cloudflow.hr.service.HrAdvanceApplicationRules.Policy;
import com.cloudflow.hr.service.HrHException;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

public final class HrAdvanceApplicationRuleChecks {
    private static int checks;
    private static final Long TENANT = 200001L;

    public static void main(String[] arguments) {
        Policy policy = parse("2.5", "0.2", "1500");
        equal("25000", HrAdvanceApplicationRules.capacity(policy, decimal("10000"), decimal("0")).maximumAmount());
        equal("14999.99", HrAdvanceApplicationRules.capacity(policy, decimal("10000"), decimal("10000.01")).availableAmount());
        HrAdvanceApplicationRules.requireAvailable(HrAdvanceApplicationRules.capacity(policy, decimal("10000"), decimal("10000.01")), decimal("14999.99")); checks++;
        rejects(() -> HrAdvanceApplicationRules.requireAvailable(HrAdvanceApplicationRules.capacity(policy, decimal("10000"), decimal("10000.01")), decimal("15000")));
        equal("0", HrAdvanceApplicationRules.capacity(policy, decimal("10000"), decimal("30000")).availableAmount());
        Policy fractional = parse("1.5", "0", "0");
        equal("0.015", HrAdvanceApplicationRules.capacity(fractional, decimal("0.01"), decimal("0")).maximumAmount());
        equal("0.01", HrAdvanceApplicationRules.capacity(fractional, decimal("0.01"), decimal("0")).availableAmount());
        rejects(() -> HrAdvanceApplicationRules.requireAvailable(HrAdvanceApplicationRules.capacity(fractional, decimal("0.01"), decimal("0")), decimal("0.02")));
        check("CONFIRMED".equals(HrAdvanceApplicationRules.payrollSnapshot(policy).get("confirmationStatus")), "扣还快照只保存已核定版本");
        equal("0.2", (BigDecimal) HrAdvanceApplicationRules.payrollSnapshot(policy).get("maximumNetRatio"));
        equal("1500", (BigDecimal) HrAdvanceApplicationRules.payrollSnapshot(policy).get("minimumNetAmount"));
        Policy lump = HrAdvanceApplicationRules.policy(TENANT, List.of(rule(1L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 1, "2")), false);
        equal("200", HrAdvanceApplicationRules.capacity(lump, decimal("100"), decimal("0")).availableAmount());
        rejects(() -> HrAdvanceApplicationRules.payrollSnapshot(lump));
        for (Long tenant : List.of(TENANT, 100000L, 0L)) {
            HrAdvanceApplicationRules.policy(TENANT, List.of(rule(1L, tenant, HrAdvanceApplicationRules.MULTIPLIER, 1, "2")), false); checks++;
        }
        for (PublishedRule invalid : Arrays.asList(null, rule(null, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 1, "2"),
                rule(0L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 1, "2"), rule(1L, 200002L, HrAdvanceApplicationRules.MULTIPLIER, 1, "2"),
                rule(1L, null, HrAdvanceApplicationRules.MULTIPLIER, 1, "2"), rule(1L, TENANT, "other", 1, "2"),
                rule(1L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 0, "2"), rule(1L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, null, "2"),
                rule(1L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 1, "0"), rule(1L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 1, "-1"),
                rule(1L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 1, "1.001"), rule(1L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 1, null))) {
            rejects(() -> HrAdvanceApplicationRules.policy(TENANT, Arrays.asList(invalid), false));
        }
        rejects(() -> HrAdvanceApplicationRules.policy(TENANT, null, true));
        rejects(() -> HrAdvanceApplicationRules.policy(TENANT, List.of(), false));
        rejects(() -> HrAdvanceApplicationRules.policy(null, List.of(rule(1L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 1, "2")), false));
        rejects(() -> parse("2", "1.01", "0")); rejects(() -> parse("2", "-0.01", "0"));
        rejects(() -> parse("2", "0.2", "-1")); rejects(() -> parse("2", "0.2", "10000000000000000"));
        for (String invalidSalary : Arrays.asList(null, "0", "-0.01", "0.001", "10000000000000000")) {
            rejects(() -> HrAdvanceApplicationRules.capacity(policy, decimal(invalidSalary), decimal("0")));
        }
        rejects(() -> HrAdvanceApplicationRules.capacity(policy, decimal("1000"), decimal("-1")));
        rejects(() -> HrAdvanceApplicationRules.capacity(policy, decimal("1000"), decimal("0.001")));
        rejects(() -> HrAdvanceApplicationRules.requireAvailable(HrAdvanceApplicationRules.capacity(policy, decimal("10000"), decimal("0")), decimal("0.001")));
        System.out.println("H2_ADVANCE_APPLICATION_RULES: checks=" + checks + "; failed=0; published_rule_fixtures=true; real_http=false; real_database=false");
    }

    private static Policy parse(String multiplier, String ratio, String minimum) {
        return HrAdvanceApplicationRules.policy(TENANT, List.of(rule(1L, TENANT, HrAdvanceApplicationRules.MULTIPLIER, 2, multiplier),
                rule(2L, TENANT, HrAdvanceApplicationRules.NET_RATIO, 3, ratio), rule(3L, TENANT, HrAdvanceApplicationRules.MINIMUM_NET, 4, minimum)), true);
    }
    private static PublishedRule rule(Long id, Long tenant, String code, Integer version, String value) { return new PublishedRule(id, tenant, code, version, decimal(value)); }
    private static BigDecimal decimal(String value) { return value == null ? null : new BigDecimal(value); }
    private static void equal(String expected, BigDecimal actual) { check(decimal(expected).compareTo(actual) == 0, "金额期望" + expected + "，实际" + actual); }
    private static void check(boolean accepted, String message) { checks++; if (!accepted) throw new AssertionError(message); }
    private static void rejects(Runnable action) { try { action.run(); } catch (HrHException expected) { checks++; return; } throw new AssertionError("未核定或越界借款应被拒绝"); }
}
