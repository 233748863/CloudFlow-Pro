package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaAssetDepreciationSchedule;
import com.cloudflow.oa.domain.SysAsset;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaAssetDepreciationAnnualChecks {
    private static final List<String> FREQUENCIES = List.of("MONTHLY", "QUARTERLY", "YEARLY");
    private static final List<String> METHODS = List.of("STRAIGHT_LINE", "DOUBLE_DECLINING", "SUM_OF_YEARS");

    static void run() {
        Map<String, List<String>> examples = Map.of(
                "STRAIGHT_LINE", List.of("1800", "1800", "1800", "1800", "1800"),
                "DOUBLE_DECLINING", List.of("4000", "2400", "1440", "580", "580"),
                "SUM_OF_YEARS", List.of("3000", "2400", "1800", "1200", "600"));
        for (String method : METHODS) assertAnnual(asset(method), examples.get(method));
        assertAnnual(configure("STRAIGHT_LINE", 13, "1300", "0"), List.of("1200", "100"));
        assertAnnual(configure("STRAIGHT_LINE", 18, "1800", "0"), List.of("1200", "600"));
        assertAnnual(configure("STRAIGHT_LINE", 25, "2500", "0"), List.of("1200", "1200", "100"));
        assertAnnual(configure("SUM_OF_YEARS", 18, "2520", "0"), List.of("2160", "360"));
        assertAnnual(configure("SUM_OF_YEARS", 13, "1570", "0"), List.of("1560", "10"));
        assertAnnual(configure("DOUBLE_DECLINING", 25, "2500", "0"), List.of("2400", "92.31", "7.69"));
        assertAnnual(configure("STRAIGHT_LINE", 24, "0.03", "0"), List.of("0.02", "0.01"));
        SysAsset opening = asset("STRAIGHT_LINE"); opening.setOpeningAccumulatedDepreciation(number("1000"));
        assertAnnual(opening, List.of("1600", "1600", "1600", "1600", "1600"));
        shortYearRepair(); frequencyBoundaries();
    }

    private static SysAsset configure(String method, int months, String purchase, String salvage) {
        SysAsset value = asset(method); value.setUsefulLifeMonths(months); value.setPurchaseAmount(number(purchase)); value.setSalvageValue(number(salvage));
        return value;
    }

    private static void assertAnnual(SysAsset value, List<String> expected) {
        for (String frequency : FREQUENCIES) {
            value.setDepreciationFrequency(frequency);
            List<OaAssetDepreciationSchedule> plan = OaDepreciationCalculator.generate(value, List.of());
            List<BigDecimal> totals = annualTotals(value, plan);
            equal(expected.size(), totals.size(), "annual example length " + frequency);
            for (int index = 0; index < expected.size(); index++) decimal(expected.get(index), totals.get(index), value.getDepreciationMethod() + " " + frequency + " year " + (index + 1));
            assertPlan(value, plan, List.of());
        }
    }

    private static List<BigDecimal> annualTotals(SysAsset value, List<OaAssetDepreciationSchedule> plan) {
        List<BigDecimal> totals = new ArrayList<>();
        for (int year = 0; year < (value.getUsefulLifeMonths() + 11) / 12; year++) totals.add(BigDecimal.ZERO);
        for (OaAssetDepreciationSchedule row : plan) {
            long elapsed = ChronoUnit.MONTHS.between(YearMonth.from(value.getAvailableFromDate()), YearMonth.from(row.getPeriodDate()));
            int year = Math.toIntExact((elapsed - 1) / 12);
            totals.set(year, totals.get(year).add(row.getDepreciationAmount()));
        }
        return totals;
    }

    private static void assertPlan(SysAsset value, List<OaAssetDepreciationSchedule> plan, List<OaAssetDepreciationSchedule> history) {
        BigDecimal total = value.getOpeningAccumulatedDepreciation().add(history.stream().map(OaAssetDepreciationSchedule::getDepreciationAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        LocalDate previous = history.isEmpty() ? value.getAvailableFromDate() : history.get(history.size() - 1).getPeriodDate();
        int period = history.isEmpty() ? 0 : history.get(history.size() - 1).getPeriodNo();
        for (OaAssetDepreciationSchedule row : plan) {
            check(row.getPeriodDate().isAfter(previous), "future posting dates strictly increase");
            equal(++period, row.getPeriodNo(), "posting sequence continues once");
            check(row.getDepreciationAmount().signum() >= 0 && row.getDepreciationAmount().scale() == 2, "depreciation is nonnegative exact cents");
            total = total.add(row.getDepreciationAmount());
            decimal(total.toPlainString(), row.getAccumulatedAmount(), "cumulative balance agrees with all amounts");
            decimal(value.getPurchaseAmount().subtract(total).toPlainString(), row.getNetValue(), "net value agrees with purchase and cumulative balance");
            check(row.getNetValue().compareTo(value.getSalvageValue()) >= 0, "net value never crosses salvage");
            previous = row.getPeriodDate();
        }
        decimal(value.getPurchaseAmount().toPlainString(), total.add(value.getSalvageValue()), "opening plus history plus future plus salvage exactly equals purchase");
        if (!plan.isEmpty()) equal(value.getAvailableFromDate().plusMonths(value.getUsefulLifeMonths()), previous, "last date preserves actual lifetime including a short year");
    }

    private static void shortYearRepair() {
        SysAsset value = configure("STRAIGHT_LINE", 13, "1300", "0");
        value.setAvailableFromDate(LocalDate.of(2020, 1, 31));
        List<OaAssetDepreciationSchedule> history = OaDepreciationCalculator.generate(value, List.of());
        history.forEach(row -> { row.setStatus("POSTED"); row.setScheduleId(row.getPeriodNo().longValue()); row.setPostBy(1L); });
        List<String> preserved = history.stream().map(OaAssetDepreciationSchedule::toString).toList();
        value.setUsefulLifeMonths(25); value.setPurchaseAmount(number("2500"));
        List<OaAssetDepreciationSchedule> future = OaDepreciationCalculator.generate(value, history);
        equal(2, future.size(), "extension after posted 13-month life retains eleven months and one final month");
        decimal("1100", future.get(0).getDepreciationAmount(), "remaining eleven-month year has eleven twelfths of new depreciable value");
        decimal("100", future.get(1).getDepreciationAmount(), "remaining final month retains one twelfth");
        equal(LocalDate.of(2022, 1, 31), future.get(0).getPeriodDate(), "short-year repair uses original anniversary");
        equal(LocalDate.of(2022, 2, 28), future.get(1).getPeriodDate(), "short-year repair preserves month-end date");
        equal(preserved, history.stream().map(OaAssetDepreciationSchedule::toString).toList(), "repair leaves every historical field unchanged");
        assertPlan(value, future, history);
        value.setUsefulLifeMonths(13);
        fails(IllegalArgumentException.class, () -> OaDepreciationCalculator.generate(value, history), "capitalization after full lifetime requires extension");
        value.setUsefulLifeMonths(25); history.get(1).setPeriodDate(LocalDate.of(2021, 3, 1));
        fails(IllegalArgumentException.class, () -> OaDepreciationCalculator.generate(value, history), "misaligned posted dates cannot silently change covered months");
    }

    private static void frequencyBoundaries() {
        for (String method : METHODS) for (int months : List.of(1, 11, 12, 13, 18, 25, 60, 1200)) {
            for (String purchase : List.of("0.01", "0.03", "99999999.99")) for (LocalDate start : List.of(LocalDate.of(2020, 1, 31), LocalDate.of(2024, 2, 29))) {
                SysAsset value = configure(method, months, purchase, "0"); value.setAvailableFromDate(start);
                value.setSalvageValue(value.getPurchaseAmount().divide(BigDecimal.TEN, 2, RoundingMode.DOWN));
                value.setOpeningAccumulatedDepreciation(value.getPurchaseAmount().divide(BigDecimal.TEN, 2, RoundingMode.DOWN));
                List<BigDecimal> annual = annualTotals(value, OaDepreciationCalculator.generate(value, List.of()));
                for (String frequency : FREQUENCIES) {
                    value.setDepreciationFrequency(frequency);
                    List<OaAssetDepreciationSchedule> plan = OaDepreciationCalculator.generate(value, List.of());
                    List<BigDecimal> totals = annualTotals(value, plan);
                    for (int year = 0; year < annual.size(); year++) decimal(annual.get(year).toPlainString(), totals.get(year), "frequency-independent annual cents at amount/date/lifetime boundary");
                    assertPlan(value, plan, List.of());
                }
            }
        }
        SysAsset excessive = asset("STRAIGHT_LINE"); excessive.setUsefulLifeMonths(1201);
        fails(IllegalArgumentException.class, () -> OaDepreciationCalculator.generate(excessive, List.of()), "life over 1200 months rejected");
    }
}
