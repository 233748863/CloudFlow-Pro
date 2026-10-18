package com.cloudflow.hr.service;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class HrSettlementCalculation {
    public static final RoundingMode AMOUNT_ROUNDING = RoundingMode.HALF_UP;
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("999999999999.99");
    private static final BigDecimal MAX_FACTOR = new BigDecimal("9999.9999");

    private HrSettlementCalculation() { }

    public record Slab(int sortNo, BigDecimal minimumYears, BigDecimal maximumYears,
                       String mode, BigDecimal compensationMonths) { }

    public record Policy(String status, LocalDate effectiveFrom, LocalDate effectiveTo,
                         int averagingMonths, String serviceRounding, List<Slab> slabs,
                         BigDecimal socialMonthlySalary, BigDecimal baseCapMultiplier,
                         BigDecimal maximumMonths, BigDecimal noticeMonths,
                         BigDecimal leaveDailyDivisor, BigDecimal leaveHoursPerDay,
                         BigDecimal leaveCashMultiplier, RoundingMode amountRounding) {
        public Policy {
            require(slabs != null, "缺少工龄分档");
            slabs = List.copyOf(slabs);
        }
    }

    /** Exact attributed wage, including any fractional cent from component allocation. */
    public record SalarySample(YearMonth month, BigInteger amountNumerator, BigInteger amountDenominator) {
        public SalarySample(YearMonth month, BigDecimal postedAmount) {
            this(month, money(postedAmount).unscaledValue(), BigInteger.valueOf(100));
        }
        public SalarySample {
            require(amountNumerator != null && amountDenominator != null, "工资取样金额缺失");
            Fraction value = new Fraction(amountNumerator, amountDenominator);
            require(value.compareTo(Fraction.of(0)) >= 0 && value.compareTo(Fraction.of(MAX_AMOUNT)) <= 0, "工资取样金额为负或超出容量");
            amountNumerator = value.numerator(); amountDenominator = value.denominator();
        }
    }

    public record SamplingSelection(List<YearMonth> months, BigDecimal averagingMonths, String reason) {
        public SamplingSelection {
            require(months != null && !months.isEmpty() && months.size() <= 120 && months.stream().allMatch(month -> month != null), "请核定1至120个取样月份");
            require(new HashSet<>(months).size() == months.size(), "核定取样月份不能重复");
            require(months.stream().allMatch(month -> month.getYear() >= 1000 && month.getYear() <= 9999), "核定取样月份无效");
            require(averagingMonths != null && averagingMonths.signum() > 0 && averagingMonths.compareTo(BigDecimal.valueOf(120)) <= 0, "核定平均月份数须大于0且不超过120");
            try { averagingMonths = averagingMonths.setScale(4, RoundingMode.UNNECESSARY).stripTrailingZeros(); }
            catch (ArithmeticException failure) { throw new IllegalArgumentException("核定平均月份数最多保留四位小数", failure); }
            require(reason != null && !reason.isBlank() && reason.trim().length() <= 2000, "请填写不超过2000字符的取样核定原因");
            reason = reason.trim(); months = months.stream().sorted().toList();
        }
    }

    public record Result(String serviceYearsNumerator, String serviceYearsDenominator,
                         BigDecimal displayWorkYears, BigDecimal compensationMonths,
                         BigDecimal averageMonthlySalary, BigDecimal cappedMonthlySalary,
                         BigDecimal severanceAmount) { }

    public static void validatePolicy(Policy policy) {
        require(policy != null, "缺少经济补偿规则");
        date(policy.effectiveFrom());
        if (policy.effectiveTo() != null) {
            date(policy.effectiveTo());
            require(!policy.effectiveTo().isBefore(policy.effectiveFrom()), "规则失效日期早于生效日期");
        }
        require(policy.averagingMonths() >= 1 && policy.averagingMonths() <= 120, "工资取样月数必须在1至120之间");
        require(policy.serviceRounding() != null && Set.of("ACTUAL_MONTHS", "FLOOR_YEAR", "CEIL_HALF_YEAR").contains(policy.serviceRounding()), "工龄算法未核定");
        require(policy.amountRounding() == AMOUNT_ROUNDING, "结算金额须按已批准的四舍五入规则保留两位小数");
        require((policy.socialMonthlySalary() == null) == (policy.baseCapMultiplier() == null), "社平工资和基数封顶倍数必须同时核定");
        if (policy.socialMonthlySalary() != null) {
            require(money(policy.socialMonthlySalary()).signum() > 0, "社平工资必须大于0");
            factor(policy.baseCapMultiplier(), false);
        }
        if (policy.maximumMonths() != null) factor(policy.maximumMonths(), false);
        factor(policy.noticeMonths(), true);
        int leaveSettings = (policy.leaveDailyDivisor() == null ? 0 : 1)
                + (policy.leaveHoursPerDay() == null ? 0 : 1) + (policy.leaveCashMultiplier() == null ? 0 : 1);
        require(leaveSettings == 0 || leaveSettings == 3, "年假折现的日薪除数、每日小时数和系数必须同时核定");
        if (leaveSettings == 3) {
            factor(policy.leaveDailyDivisor(), false);
            factor(policy.leaveHoursPerDay(), false);
            factor(policy.leaveCashMultiplier(), true);
        }
        List<Slab> ordered = orderedSlabs(policy.slabs());
        require(!ordered.isEmpty(), "缺少工龄分档");
        BigDecimal nextMinimum = BigDecimal.ZERO;
        Set<Integer> sequences = new HashSet<>();
        for (int index = 0; index < ordered.size(); index++) {
            Slab slab = ordered.get(index);
            require(slab.sortNo() >= 0 && sequences.add(slab.sortNo()), "工龄分档顺序重复或无效");
            factor(slab.minimumYears(), true);
            require(nextMinimum != null && slab.minimumYears().compareTo(nextMinimum) == 0, "工龄分档存在重叠或空洞");
            require(slab.mode() != null && Set.of("FIXED", "PER_YEAR").contains(slab.mode()), "工龄分档计算方式无效");
            factor(slab.compensationMonths(), true);
            if (slab.maximumYears() != null) {
                factor(slab.maximumYears(), false);
                require(slab.maximumYears().compareTo(slab.minimumYears()) > 0, "工龄分档上限必须大于下限");
            } else require(index == ordered.size() - 1, "不限工龄档必须是最后一档");
            nextMinimum = slab.maximumYears();
        }
        require(nextMinimum == null, "最后一档必须覆盖其后的工龄");
    }

    public static Result severance(Policy policy, LocalDate joinDate, LocalDate relievingDate,
                                   List<SalarySample> samples) {
        return severance(policy, joinDate, relievingDate, samples, legacySelection(policy, samples, relievingDate));
    }

    public static Result severance(Policy policy, LocalDate joinDate, LocalDate relievingDate,
                                   List<SalarySample> samples, SamplingSelection selection) {
        activePolicy(policy, relievingDate);
        Fraction actualYears = serviceYears(joinDate, relievingDate);
        Fraction calculationYears = switch (policy.serviceRounding()) {
            case "FLOOR_YEAR" -> Fraction.integer(actualYears.floor());
            case "CEIL_HALF_YEAR" -> Fraction.integer(actualYears.multiply(Fraction.of(2)).ceiling()).divide(Fraction.of(2));
            default -> actualYears;
        };
        Slab selected = orderedSlabs(policy.slabs()).stream().filter(slab -> calculationYears.compareTo(Fraction.of(slab.minimumYears())) >= 0
                && (slab.maximumYears() == null || calculationYears.compareTo(Fraction.of(slab.maximumYears())) < 0))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("工龄未被核定分档覆盖"));
        Fraction months = Fraction.of(selected.compensationMonths());
        if ("PER_YEAR".equals(selected.mode())) months = months.multiply(calculationYears);
        if (policy.maximumMonths() != null) months = months.min(Fraction.of(policy.maximumMonths()));
        months = months.add(Fraction.of(policy.noticeMonths()));
        Fraction average = averageSalary(samples, relievingDate, selection);
        Fraction capped = policy.socialMonthlySalary() == null ? average
                : average.min(Fraction.of(policy.socialMonthlySalary()).multiply(Fraction.of(policy.baseCapMultiplier())));
        BigDecimal displayYears = actualYears.decimal(2, RoundingMode.HALF_UP);
        require(displayYears.compareTo(new BigDecimal("999.99")) <= 0, "展示工龄超出字段容量");
        return new Result(actualYears.numerator().toString(), actualYears.denominator().toString(), displayYears,
                months.decimal(12, RoundingMode.HALF_UP), average.decimal(12, RoundingMode.HALF_UP),
                capped.decimal(12, RoundingMode.HALF_UP), amount(capped.multiply(months), policy.amountRounding()));
    }

    public static BigDecimal leaveCash(Policy policy, LocalDate relievingDate, List<SalarySample> samples,
                                       String unit, BigDecimal quantity) {
        return leaveCash(policy, relievingDate, samples, legacySelection(policy, samples, relievingDate), unit, quantity);
    }

    public static BigDecimal leaveCash(Policy policy, LocalDate relievingDate, List<SalarySample> samples,
                                       SamplingSelection selection, String unit, BigDecimal quantity) {
        activePolicy(policy, relievingDate);
        require(policy.leaveDailyDivisor() != null, "年假折现政策未核定");
        require(quantity != null && quantity.signum() >= 0 && quantity.compareTo(MAX_AMOUNT) <= 0, "年假余额无效");
        require("DAY".equals(unit) || "HOUR".equals(unit), "年假单位必须为DAY或HOUR");
        Fraction days = Fraction.of(quantity);
        if ("HOUR".equals(unit)) days = days.divide(Fraction.of(policy.leaveHoursPerDay()));
        Fraction dailySalary = averageSalary(samples, relievingDate, selection).divide(Fraction.of(policy.leaveDailyDivisor()));
        return amount(days.multiply(dailySalary).multiply(Fraction.of(policy.leaveCashMultiplier())), policy.amountRounding());
    }

    public static BigDecimal net(BigDecimal payable, BigDecimal severance, BigDecimal receivable, BigDecimal assetLoss) {
        BigDecimal result = money(payable).add(money(severance)).subtract(money(receivable)).subtract(money(assetLoss));
        return signedMoney(result);
    }

    public static BigDecimal signedMoney(BigDecimal value) {
        require(value != null && value.abs().compareTo(MAX_AMOUNT) <= 0, "结算金额缺失或超出字段容量");
        try { return value.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException failure) { throw new IllegalArgumentException("已入账金额最多保留两位小数", failure); }
    }

    /** Calculated line amounts are rounded exactly once, before posting. */
    public static BigDecimal postingAmount(BigDecimal calculatedAmount) {
        require(calculatedAmount != null && calculatedAmount.signum() >= 0
                && calculatedAmount.compareTo(MAX_AMOUNT) <= 0, "结算计算金额缺失、为负或超出字段容量");
        return money(calculatedAmount.setScale(2, AMOUNT_ROUNDING));
    }

    public static BigDecimal postedTotal(List<BigDecimal> postedAmounts) {
        require(postedAmounts != null, "结算明细缺失");
        BigDecimal total = BigDecimal.ZERO;
        for (BigDecimal postedAmount : postedAmounts) total = total.add(signedMoney(postedAmount));
        return signedMoney(total);
    }

    public static BigDecimal reversalAmount(BigDecimal originalPostedAmount) {
        return signedMoney(originalPostedAmount).negate();
    }

    public static Map<String, Object> roundingSnapshot() {
        return Map.of("amountRounding", AMOUNT_ROUNDING.name(), "amountScale", 2,
                "roundingStage", "EACH_SOURCE_ITEM", "totalMethod", "SUM_POSTED_ITEMS",
                "reversalMethod", "NEGATE_ORIGINAL_POSTED_AMOUNT");
    }

    private static BigDecimal money(BigDecimal value) {
        BigDecimal result = signedMoney(value);
        require(result.signum() >= 0, "普通结算来源金额不能为负");
        return result;
    }

    private static BigDecimal amount(Fraction value, RoundingMode rounding) {
        require(value.compareTo(Fraction.of(MAX_AMOUNT)) <= 0, "结算计算金额超出字段容量");
        return money(value.decimal(2, rounding));
    }

    private static void factor(BigDecimal value, boolean allowZero) {
        require(value != null && value.compareTo(MAX_FACTOR) <= 0 && (allowZero ? value.signum() >= 0 : value.signum() > 0), "核定系数缺失或超出字段容量");
        try { value.setScale(4, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException failure) { throw new IllegalArgumentException("核定系数最多保留四位小数", failure); }
    }

    private static List<Slab> orderedSlabs(List<Slab> slabs) {
        require(slabs != null && slabs.stream().allMatch(slab -> slab != null && slab.minimumYears() != null), "工龄分档为空");
        return slabs.stream().sorted(Comparator.comparing(Slab::minimumYears)).toList();
    }

    private static void activePolicy(Policy policy, LocalDate relievingDate) {
        validatePolicy(policy);
        date(relievingDate);
        require("CONFIRMED".equals(policy.status()), "补偿规则尚未核定");
        require(!relievingDate.isBefore(policy.effectiveFrom()) && (policy.effectiveTo() == null || !relievingDate.isAfter(policy.effectiveTo())), "补偿规则未覆盖离职日期");
    }

    private static Fraction averageSalary(List<SalarySample> samples, LocalDate relievingDate, SamplingSelection selection) {
        require(selection != null, "缺少本单取样月份、平均月份数及核定原因");
        require(samples != null && samples.size() == selection.months().size(), "实际工资来源未覆盖全部核定月份");
        Set<YearMonth> months = new HashSet<>();
        Fraction total = Fraction.of(0);
        for (SalarySample sample : samples) {
            require(sample != null && sample.month() != null && sample.month().getYear() >= 1000 && sample.month().getYear() <= 9999
                    && !sample.month().isAfter(YearMonth.from(relievingDate)) && months.add(sample.month()), "工资取样月份无效、晚于离职或重复");
            total = total.add(new Fraction(sample.amountNumerator(), sample.amountDenominator()));
        }
        require(months.equals(new HashSet<>(selection.months())), "实际工资来源与核定取样月份不一致");
        Fraction average = total.divide(Fraction.of(selection.averagingMonths()));
        require(average.compareTo(Fraction.of(MAX_AMOUNT)) <= 0, "平均工资超出结算金额容量");
        return average;
    }

    /** Compatibility for the original standalone checks; settlement callers must supply a reviewed selection. */
    private static SamplingSelection legacySelection(Policy policy, List<SalarySample> samples, LocalDate relievingDate) {
        activePolicy(policy, relievingDate);
        require(samples != null && samples.size() == policy.averagingMonths() && samples.stream().allMatch(sample -> sample != null && sample.month() != null), "已核定工资取样月数不足或多余");
        Set<YearMonth> months = new HashSet<>(samples.stream().map(SalarySample::month).toList());
        YearMonth latest = months.stream().max(Comparator.naturalOrder()).orElseThrow();
        for (int offset = 0; offset < policy.averagingMonths(); offset++) require(months.contains(latest.minusMonths(offset)), "工资取样月份不连续");
        return new SamplingSelection(samples.stream().map(SalarySample::month).toList(), BigDecimal.valueOf(policy.averagingMonths()), "固定政策月数计算兼容入口");
    }

    private static Fraction serviceYears(LocalDate joinDate, LocalDate relievingDate) {
        date(joinDate); date(relievingDate);
        require(!relievingDate.isBefore(joinDate), "离职日期早于入职日期");
        long wholeMonths = ChronoUnit.MONTHS.between(YearMonth.from(joinDate), YearMonth.from(relievingDate));
        if (joinDate.plusMonths(wholeMonths).isAfter(relievingDate)) wholeMonths--;
        LocalDate anchor = joinDate.plusMonths(wholeMonths);
        long remainingDays = ChronoUnit.DAYS.between(anchor, relievingDate);
        if (remainingDays == 0) return Fraction.of(wholeMonths).divide(Fraction.of(12));
        long monthDays = ChronoUnit.DAYS.between(anchor, joinDate.plusMonths(wholeMonths + 1));
        return Fraction.of(wholeMonths).add(Fraction.of(remainingDays).divide(Fraction.of(monthDays))).divide(Fraction.of(12));
    }

    private static void date(LocalDate value) {
        require(value != null && value.getYear() >= 1000 && value.getYear() <= 9999, "结算日期无效");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }

    record Fraction(BigInteger numerator, BigInteger denominator) implements Comparable<Fraction> {
        Fraction {
            require(denominator.signum() > 0, "计算分母必须大于0");
            BigInteger divisor = numerator.gcd(denominator);
            numerator = numerator.divide(divisor); denominator = denominator.divide(divisor);
        }
        static Fraction of(long value) { return integer(BigInteger.valueOf(value)); }
        static Fraction integer(BigInteger value) { return new Fraction(value, BigInteger.ONE); }
        static Fraction of(BigDecimal value) {
            return value.scale() < 0 ? integer(value.toBigIntegerExact())
                    : new Fraction(value.unscaledValue(), BigInteger.TEN.pow(value.scale()));
        }
        Fraction add(Fraction other) { return new Fraction(numerator.multiply(other.denominator).add(other.numerator.multiply(denominator)), denominator.multiply(other.denominator)); }
        Fraction multiply(Fraction other) { return new Fraction(numerator.multiply(other.numerator), denominator.multiply(other.denominator)); }
        Fraction divide(Fraction other) { return new Fraction(numerator.multiply(other.denominator), denominator.multiply(other.numerator)); }
        private Fraction min(Fraction other) { return compareTo(other) <= 0 ? this : other; }
        private BigInteger floor() { return numerator.divide(denominator); }
        private BigInteger ceiling() { return numerator.add(denominator).subtract(BigInteger.ONE).divide(denominator); }
        private BigDecimal decimal(int scale, RoundingMode rounding) { return new BigDecimal(numerator).divide(new BigDecimal(denominator), scale, rounding); }
        @Override public int compareTo(Fraction other) { return numerator.multiply(other.denominator).compareTo(other.numerator.multiply(denominator)); }
    }
}
