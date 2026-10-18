package com.cloudflow.hr.checks;

import com.cloudflow.hr.service.HrSettlementCalculation;
import com.cloudflow.hr.service.HrSettlementCalculation.Policy;
import com.cloudflow.hr.service.HrSettlementCalculation.Result;
import com.cloudflow.hr.service.HrSettlementCalculation.SalarySample;
import com.cloudflow.hr.service.HrSettlementCalculation.Slab;
import com.cloudflow.hr.service.HrSettlementCalculation.SamplingSelection;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

public final class HrSettlementCalculationChecks {
    private static int checks;
    private static final List<Slab> ANNUAL = List.of(new Slab(1, decimal("0"), null, "PER_YEAR", decimal("1")));

    public static void main(String[] arguments) {
        Policy actual = policy("ACTUAL_MONTHS", ANNUAL, null, null, null, "0", RoundingMode.HALF_UP);
        Result monthEnd = calculate(actual, "2024-01-31", "2024-02-29", "12000");
        equal("1000", monthEnd.severanceAmount());
        check(monthEnd.serviceYearsNumerator().equals("1") && monthEnd.serviceYearsDenominator().equals("12"), "月末完整月保留精确工龄");
        equal("1000", calculate(actual, "2023-01-31", "2023-02-28", "12000").severanceAmount());
        Result partialMonth = calculate(actual, "2024-01-31", "2024-03-30", "14640");
        equal("2400.65", partialMonth.severanceAmount());
        check(partialMonth.serviceYearsNumerator().equals("61") && partialMonth.serviceYearsDenominator().equals("372"), "月末不足月按30/31月精确计龄");
        equal("6000", calculate(actual, "2024-02-29", "2024-08-29", "12000").severanceAmount());
        equal("12000", calculate(actual, "2024-02-29", "2025-02-28", "12000").severanceAmount());
        equal("0", calculate(actual, "2026-09-30", "2026-09-30", "12000").severanceAmount());

        Policy halves = policy("CEIL_HALF_YEAR", ANNUAL, null, null, null, "0", RoundingMode.HALF_UP);
        equal("6000", calculate(halves, "2026-01-01", "2026-06-30", "12000").severanceAmount());
        equal("6000", calculate(halves, "2026-01-01", "2026-07-01", "12000").severanceAmount());
        equal("12000", calculate(halves, "2026-01-01", "2026-07-02", "12000").severanceAmount());
        equal("12000", calculate(halves, "2025-09-30", "2026-09-30", "12000").severanceAmount());
        equal("18000", calculate(halves, "2025-09-29", "2026-09-30", "12000").severanceAmount());
        Policy floors = policy("FLOOR_YEAR", ANNUAL, null, null, null, "0", RoundingMode.HALF_UP);
        equal("0", calculate(floors, "2025-10-01", "2026-09-30", "12000").severanceAmount());
        equal("12000", calculate(floors, "2025-09-30", "2026-09-30", "12000").severanceAmount());

        List<Slab> boundary = List.of(new Slab(2, decimal("0.5"), null, "PER_YEAR", decimal("1")),
                new Slab(1, decimal("0"), decimal("0.5"), "FIXED", decimal("0.25")));
        Policy fixed = policy("ACTUAL_MONTHS", boundary, null, null, null, "0", RoundingMode.HALF_UP);
        equal("3000", calculate(fixed, "2026-01-01", "2026-06-30", "12000").severanceAmount());
        equal("6000", calculate(fixed, "2026-01-01", "2026-07-01", "12000").severanceAmount());
        Policy capped = policy("ACTUAL_MONTHS", ANNUAL, "10000", "3", "12", "1", RoundingMode.HALF_UP);
        Result cappedResult = calculate(capped, "2000-09-30", "2026-09-30", "50000");
        equal("390000", cappedResult.severanceAmount());
        equal("13", cappedResult.compensationMonths());
        equal("50000", cappedResult.averageMonthlySalary());
        equal("30000", cappedResult.cappedMonthlySalary());

        LocalDate exitDate = LocalDate.parse("2026-09-30");
        List<SalarySample> samples = samples(exitDate, "21750");
        equal("3000", HrSettlementCalculation.leaveCash(actual, exitDate, samples, "DAY", decimal("3")));
        equal("3000", HrSettlementCalculation.leaveCash(actual, exitDate, samples, "HOUR", decimal("24")));
        equal("62.50", HrSettlementCalculation.leaveCash(actual, exitDate, samples, "HOUR", decimal("0.5")));
        equal("50000", HrSettlementCalculation.leaveCash(capped, exitDate, samples(exitDate, "50000"), "DAY", decimal("21.75")));
        rejects(() -> HrSettlementCalculation.leaveCash(actual, exitDate, samples, "MINUTE", decimal("1")));
        rejects(() -> HrSettlementCalculation.leaveCash(actual, exitDate, samples, "DAY", decimal("-1")));
        Policy missingLeave = new Policy("CONFIRMED", exitDate, exitDate, 2, "ACTUAL_MONTHS", ANNUAL,
                null, null, null, decimal("0"), null, null, null, RoundingMode.HALF_UP);
        equal("12000", calculate(missingLeave, "2025-09-30", "2026-09-30", "12000").severanceAmount());
        rejects(() -> HrSettlementCalculation.leaveCash(missingLeave, exitDate, samples, "DAY", decimal("1")));

        equal("80", HrSettlementCalculation.net(decimal("100"), decimal("50"), decimal("60"), decimal("10")));
        equal("0", HrSettlementCalculation.net(decimal("100"), decimal("50"), decimal("140"), decimal("10")));
        equal("-10", HrSettlementCalculation.net(decimal("100"), decimal("50"), decimal("150"), decimal("10")));
        equal("999999999999.99", HrSettlementCalculation.signedMoney(decimal("999999999999.99")));
        equal("-999999999999.99", HrSettlementCalculation.signedMoney(decimal("-999999999999.99")));
        rejects(() -> HrSettlementCalculation.signedMoney(decimal("1000000000000")));
        rejects(() -> HrSettlementCalculation.signedMoney(decimal("0.001")));
        rejects(() -> HrSettlementCalculation.net(decimal("999999999999.99"), decimal("0.01"), decimal("0"), decimal("0")));
        rejects(() -> HrSettlementCalculation.net(decimal("0"), decimal("0"), decimal("999999999999.99"), decimal("0.01")));
        rejects(() -> HrSettlementCalculation.net(decimal("-1"), decimal("0"), decimal("0"), decimal("0")));
        rejects(() -> calculate(actual, "2000-09-30", "2026-09-30", "999999999999.99"));

        List<Slab> halfMonth = List.of(new Slab(1, decimal("0"), null, "FIXED", decimal("0.5")));
        equal("0.01", calculate(policy("ACTUAL_MONTHS", halfMonth, null, null, null, "0", RoundingMode.HALF_UP), "2026-01-01", "2026-09-30", "0.01").severanceAmount());
        for (RoundingMode mode : RoundingMode.values()) {
            if (mode != RoundingMode.HALF_UP) rejects(() -> calculate(policy("ACTUAL_MONTHS", halfMonth, null, null, null, "0", mode), "2026-01-01", "2026-09-30", "0.01"));
        }
        equal("0.01", HrSettlementCalculation.postingAmount(decimal("0.005")));
        equal("0.00", HrSettlementCalculation.postingAmount(decimal("0.004")));
        equal("0.02", HrSettlementCalculation.postingAmount(decimal("0.015")));
        equal("1.00", HrSettlementCalculation.postingAmount(decimal("0.999")));
        equal("0.02", HrSettlementCalculation.postedTotal(List.of(
                HrSettlementCalculation.postingAmount(decimal("0.005")), HrSettlementCalculation.postingAmount(decimal("0.005")))));
        equal("0.00", HrSettlementCalculation.postedTotal(List.of(
                HrSettlementCalculation.postingAmount(decimal("0.004")), HrSettlementCalculation.postingAmount(decimal("0.004")))));
        equal("-0.01", HrSettlementCalculation.reversalAmount(decimal("0.01")));
        equal("0.01", HrSettlementCalculation.reversalAmount(decimal("-0.01")));
        equal("0.00", HrSettlementCalculation.postedTotal(List.of(decimal("0.01"), HrSettlementCalculation.reversalAmount(decimal("0.01")))));
        rejects(() -> HrSettlementCalculation.reversalAmount(decimal("0.005")));
        rejects(() -> HrSettlementCalculation.postedTotal(List.of(decimal("0.005"))));
        rejects(() -> HrSettlementCalculation.postedTotal(List.of(decimal("999999999999.99"), decimal("0.01"))));
        rejects(() -> HrSettlementCalculation.postingAmount(decimal("999999999999.991")));
        rejects(() -> HrSettlementCalculation.postingAmount(decimal("-0.001")));
        rejects(() -> HrSettlementCalculation.postingAmount(null));
        check("HALF_UP".equals(HrSettlementCalculation.roundingSnapshot().get("amountRounding"))
                && Integer.valueOf(2).equals(HrSettlementCalculation.roundingSnapshot().get("amountScale"))
                && "EACH_SOURCE_ITEM".equals(HrSettlementCalculation.roundingSnapshot().get("roundingStage"))
                && "SUM_POSTED_ITEMS".equals(HrSettlementCalculation.roundingSnapshot().get("totalMethod"))
                && "NEGATE_ORIGINAL_POSTED_AMOUNT".equals(HrSettlementCalculation.roundingSnapshot().get("reversalMethod")), "舍入规则快照可解释逐项入账、合计及冲正");
        rejects(() -> calculate(actual, "2026-10-01", "2026-09-30", "12000"));
        rejects(() -> calculate(actual, "0999-01-01", "2026-09-30", "12000"));
        rejects(() -> calculate(actual, "1000-01-01", "2026-09-30", "12000"));
        Policy draft = new Policy("DRAFT", actual.effectiveFrom(), null, 2, "ACTUAL_MONTHS", ANNUAL, null, null, null,
                decimal("0"), null, null, null, RoundingMode.HALF_UP);
        HrSettlementCalculation.validatePolicy(draft);
        rejects(() -> calculate(draft, "2025-01-01", "2026-09-30", "12000"));
        rejects(() -> calculate(missingLeave, "2025-01-01", "2026-09-29", "12000"));
        rejects(() -> calculate(missingLeave, "2025-01-01", "2026-10-01", "12000"));
        rejects(() -> HrSettlementCalculation.severance(actual, LocalDate.parse("2025-01-01"), exitDate, List.of(samples.get(0))));
        rejects(() -> HrSettlementCalculation.severance(actual, LocalDate.parse("2025-01-01"), exitDate, List.of(samples.get(0), samples.get(0))));
        rejects(() -> HrSettlementCalculation.severance(actual, LocalDate.parse("2025-01-01"), exitDate,
                List.of(new SalarySample(YearMonth.of(2026, 6), decimal("100")), new SalarySample(YearMonth.of(2026, 8), decimal("100")))));
        rejects(() -> HrSettlementCalculation.severance(actual, LocalDate.parse("2025-01-01"), exitDate, samples(LocalDate.parse("2026-11-30"), "12000")));
        for (List<Slab> invalid : invalidSlabs()) rejects(() -> HrSettlementCalculation.validatePolicy(policy("ACTUAL_MONTHS", invalid, null, null, null, "0", RoundingMode.HALF_UP)));
        rejects(() -> HrSettlementCalculation.validatePolicy(policy("UNKNOWN", ANNUAL, null, null, null, "0", RoundingMode.HALF_UP)));
        rejects(() -> HrSettlementCalculation.validatePolicy(policy("ACTUAL_MONTHS", ANNUAL, "1000", null, null, "0", RoundingMode.HALF_UP)));
        rejects(() -> HrSettlementCalculation.validatePolicy(policy("ACTUAL_MONTHS", ANNUAL, null, "3", null, "0", RoundingMode.HALF_UP)));
        rejects(() -> HrSettlementCalculation.validatePolicy(policy("ACTUAL_MONTHS", ANNUAL, null, null, "0", "0", RoundingMode.HALF_UP)));
        rejects(() -> HrSettlementCalculation.validatePolicy(policy("ACTUAL_MONTHS", ANNUAL, null, null, null, "-1", RoundingMode.HALF_UP)));
        rejects(() -> HrSettlementCalculation.validatePolicy(policy("ACTUAL_MONTHS", ANNUAL, null, null, null, "0.00001", RoundingMode.HALF_UP)));
        rejects(() -> HrSettlementCalculation.validatePolicy(policy("ACTUAL_MONTHS", ANNUAL, null, null, null, "0", null)));
        reviewedSampling();
        System.out.println("H2_SETTLEMENT_CALCULATION: checks=" + checks + "; failed=0; exact_service_fraction=true; reviewed_sampling=true; real_http=false; real_database=false");
    }

    private static void reviewedSampling() {
        Policy one = policy("ACTUAL_MONTHS", List.of(new Slab(1, decimal("0"), null, "FIXED", decimal("1"))), null, null, null, "0", RoundingMode.HALF_UP);
        LocalDate exit = LocalDate.of(2026, 9, 15); LocalDate join = LocalDate.of(2026, 8, 1);
        YearMonth august = YearMonth.of(2026, 8); YearMonth september = YearMonth.of(2026, 9);
        SamplingSelection selected = new SamplingSelection(List.of(september, august), decimal("1.5"), "管理员按适用政策核定不足月分母");
        List<SalarySample> samples = List.of(new SalarySample(august, decimal("3000")), new SalarySample(september, decimal("1500")));
        equal("3000", HrSettlementCalculation.severance(one, join, exit, samples, selected).severanceAmount());
        check(selected.months().equals(List.of(august, september)), "核定月份按固定顺序保存");
        SamplingSelection shortService = new SamplingSelection(List.of(september), decimal("0.5"), "本单按已生效政策核定半个月");
        equal("3000", HrSettlementCalculation.severance(one, join, exit, List.of(samples.get(1)), shortService).severanceAmount());
        equal("3000", HrSettlementCalculation.leaveCash(one, exit, List.of(samples.get(1)), shortService, "DAY", decimal("21.75")));
        SamplingSelection discontinuous = new SamplingSelection(List.of(YearMonth.of(2026, 6), august), decimal("2"), "经核定排除无薪停薪月");
        equal("100", HrSettlementCalculation.severance(one, LocalDate.of(2026, 1, 1), exit,
                List.of(new SalarySample(YearMonth.of(2026, 6), decimal("100")), new SalarySample(august, decimal("100"))), discontinuous).severanceAmount());
        SamplingSelection single = new SamplingSelection(List.of(august), decimal("1"), "真实分摊尾差样本");
        SalarySample exact = new SalarySample(august, BigInteger.ONE, BigInteger.valueOf(300));
        Policy triple = policy("ACTUAL_MONTHS", List.of(new Slab(1, decimal("0"), null, "FIXED", decimal("3"))), null, null, null, "0", RoundingMode.HALF_UP);
        equal("0.01", HrSettlementCalculation.severance(triple, join, exit, List.of(exact), single).severanceAmount());
        rejects(() -> HrSettlementCalculation.severance(one, join, exit, List.of(samples.get(0)), selected));
        rejects(() -> HrSettlementCalculation.severance(one, join, exit, List.of(samples.get(1)), single));
        rejects(() -> HrSettlementCalculation.severance(one, join, exit, samples, null));
        rejects(() -> new SamplingSelection(List.of(august, august), decimal("2"), "重复"));
        rejects(() -> new SamplingSelection(List.of(), decimal("1"), "无月份"));
        rejects(() -> new SamplingSelection(List.of(august), decimal("0"), "零分母"));
        rejects(() -> new SamplingSelection(List.of(august), decimal("-1"), "负分母"));
        rejects(() -> new SamplingSelection(List.of(august), decimal("120.0001"), "超限"));
        rejects(() -> new SamplingSelection(List.of(august), decimal("0.00001"), "过度精度"));
        rejects(() -> new SamplingSelection(List.of(august), decimal("1"), " "));
        rejects(() -> new SamplingSelection(List.of(august), decimal("1"), "核".repeat(2001)));
        rejects(() -> new SalarySample(august, BigInteger.ONE, BigInteger.ZERO));
        rejects(() -> new SalarySample(august, BigInteger.valueOf(-1), BigInteger.ONE));
        rejects(() -> new SalarySample(august, decimal("0.001")));
        rejects(() -> HrSettlementCalculation.severance(one, join, exit,
                List.of(new SalarySample(YearMonth.of(2026, 10), decimal("1"))),
                new SamplingSelection(List.of(YearMonth.of(2026, 10)), decimal("1"), "未来月份")));
    }

    private static List<List<Slab>> invalidSlabs() {
        return List.of(List.of(), List.of(new Slab(1, decimal("0.1"), null, "FIXED", decimal("1"))),
                List.of(new Slab(1, decimal("0"), decimal("1"), "FIXED", decimal("1"))),
                List.of(new Slab(1, decimal("0"), decimal("1"), "FIXED", decimal("1")), new Slab(2, decimal("0.9"), null, "FIXED", decimal("1"))),
                List.of(new Slab(1, decimal("0"), decimal("1"), "FIXED", decimal("1")), new Slab(2, decimal("1.1"), null, "FIXED", decimal("1"))),
                List.of(new Slab(1, decimal("0"), null, "FIXED", decimal("1")), new Slab(2, decimal("1"), null, "FIXED", decimal("1"))),
                List.of(new Slab(1, decimal("0"), decimal("1"), "FIXED", decimal("1")), new Slab(1, decimal("1"), null, "FIXED", decimal("1"))),
                List.of(new Slab(1, decimal("0"), null, "OTHER", decimal("1"))),
                List.of(new Slab(1, decimal("0"), null, "FIXED", decimal("-1"))));
    }

    private static Policy policy(String mode, List<Slab> slabs, String social, String multiplier, String maximum, String notice, RoundingMode rounding) {
        return new Policy("CONFIRMED", LocalDate.of(1000, 1, 1), null, 2, mode, slabs, decimal(social), decimal(multiplier), decimal(maximum),
                decimal(notice), decimal("21.75"), decimal("8"), decimal("1"), rounding);
    }
    private static Result calculate(Policy policy, String joined, String relieved, String monthlySalary) {
        LocalDate relievingDate = LocalDate.parse(relieved);
        return HrSettlementCalculation.severance(policy, LocalDate.parse(joined), relievingDate, samples(relievingDate, monthlySalary));
    }
    private static List<SalarySample> samples(LocalDate relievingDate, String monthlySalary) {
        List<SalarySample> result = new ArrayList<>();
        for (int offset = 1; offset <= 2; offset++) result.add(new SalarySample(YearMonth.from(relievingDate).minusMonths(offset), decimal(monthlySalary)));
        return result;
    }
    private static BigDecimal decimal(String value) { return value == null ? null : new BigDecimal(value); }
    private static void equal(String expected, BigDecimal actual) { check(decimal(expected).compareTo(actual) == 0, "期望" + expected + "，实际" + actual); }
    private static void check(boolean accepted, String message) { checks++; if (!accepted) throw new AssertionError(message); }
    private static void rejects(Runnable action) {
        try { action.run(); } catch (IllegalArgumentException expected) { checks++; return; }
        throw new AssertionError("无效核定或计算必须拒绝");
    }
}
