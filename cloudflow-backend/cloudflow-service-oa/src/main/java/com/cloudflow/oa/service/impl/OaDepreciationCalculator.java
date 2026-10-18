package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaAssetDepreciationSchedule;
import com.cloudflow.oa.domain.SysAsset;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

public final class OaDepreciationCalculator {
    private OaDepreciationCalculator() { }

    public static int frequencyMonths(String frequency) {
        return switch (frequency) {
            case "MONTHLY" -> 1;
            case "QUARTERLY" -> 3;
            case "YEARLY" -> 12;
            default -> throw new IllegalArgumentException("折旧频率无效");
        };
    }

    public static List<OaAssetDepreciationSchedule> generate(SysAsset asset, List<OaAssetDepreciationSchedule> posted) {
        BigDecimal purchase = OaRecordSupport.decimal(asset.getPurchaseAmount(), 10, 2, false, "资产原值");
        BigDecimal salvage = OaRecordSupport.decimal(OaRecordSupport.zero(asset.getSalvageValue()), 10, 2, false, "残值");
        BigDecimal opening = OaRecordSupport.decimal(OaRecordSupport.zero(asset.getOpeningAccumulatedDepreciation()), 10, 2, false, "期初累计折旧");
        int months = OaRecordSupport.require(asset.getUsefulLifeMonths(), "折旧寿命不能为空");
        if (months < 1 || months > 1200) throw new IllegalArgumentException("折旧寿命必须为1至1200个月");
        LocalDate availableFrom = OaRecordSupport.require(asset.getAvailableFromDate(), "折旧起算日不能为空");
        String method = OaRecordSupport.code(asset.getDepreciationMethod(), "STRAIGHT_LINE", Set.of("STRAIGHT_LINE", "DOUBLE_DECLINING", "SUM_OF_YEARS"));
        int frequency = frequencyMonths(asset.getDepreciationFrequency());
        OaAssetDepreciationSchedule lastPosted = posted.stream().max(Comparator.comparing(OaAssetDepreciationSchedule::getPeriodNo)).orElse(null);
        int previousPeriod = lastPosted == null ? 0 : lastPosted.getPeriodNo();
        BigDecimal accumulated = opening.add(posted.stream().map(OaAssetDepreciationSchedule::getDepreciationAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal remaining = purchase.subtract(salvage).subtract(accumulated);
        if (remaining.signum() < 0) throw new IllegalArgumentException("残值与历史累计折旧不能超过资产原值");
        if (remaining.signum() == 0) return List.of();
        int coveredMonths = coveredMonths(availableFrom, lastPosted);
        int remainingLife = months - coveredMonths;
        if (remainingLife <= 0) throw new IllegalArgumentException("资产仍有待折旧金额，需先延长使用寿命");
        List<OaAssetDepreciationSchedule> result = new ArrayList<>();
        BigDecimal base = remaining;
        BigDecimal yearSum = BigDecimal.valueOf(sumOfYearMonthWeights(coveredMonths, months));
        // 折旧年始终以资产可使用日为起点；记账频率只决定年度金额的分摊。
        for (int yearStart = coveredMonths; yearStart < months;) {
            int yearEnd = Math.min((yearStart / 12 + 1) * 12, months);
            int yearMonths = yearEnd - yearStart;
            int lifeLeft = months - yearStart;
            BigDecimal annual;
            if (yearEnd == months) annual = remaining;
            else if ("STRAIGHT_LINE".equals(method)) annual = share(base, yearMonths, remainingLife);
            else if ("SUM_OF_YEARS".equals(method)) annual = base.multiply(BigDecimal.valueOf((long) lifeLeft * yearMonths)).divide(yearSum, 2, RoundingMode.HALF_UP);
            else if (lifeLeft <= 24) annual = share(remaining, yearMonths, lifeLeft);
            else annual = share(purchase.subtract(accumulated), 2L * yearMonths, remainingLife);
            annual = annual.min(remaining).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            BigDecimal annualRemaining = annual;
            for (int periodStart = yearStart; periodStart < yearEnd;) {
                int periodEnd = Math.min((periodStart / frequency + 1) * frequency, yearEnd);
                BigDecimal amount = periodEnd == yearEnd ? annualRemaining : share(annual, periodEnd - periodStart, yearMonths).min(annualRemaining);
                annualRemaining = annualRemaining.subtract(amount);
                accumulated = accumulated.add(amount); remaining = remaining.subtract(amount);
                OaAssetDepreciationSchedule row = new OaAssetDepreciationSchedule();
                row.setAssetId(asset.getAssetId()); row.setPeriodNo(++previousPeriod);
                row.setPeriodDate(availableFrom.plusMonths(periodEnd));
                row.setDepreciationAmount(amount); row.setAccumulatedAmount(accumulated); row.setNetValue(purchase.subtract(accumulated)); row.setStatus("PLANNED");
                result.add(row);
                periodStart = periodEnd;
            }
            yearStart = yearEnd;
        }
        return result;
    }

    private static BigDecimal share(BigDecimal value, long numerator, long denominator) {
        return value.multiply(BigDecimal.valueOf(numerator)).divide(BigDecimal.valueOf(denominator), 2, RoundingMode.HALF_UP);
    }

    private static int coveredMonths(LocalDate availableFrom, OaAssetDepreciationSchedule lastPosted) {
        if (lastPosted == null) return 0;
        LocalDate postedDate = OaRecordSupport.require(lastPosted.getPeriodDate(), "已过账折旧缺少日期");
        long elapsed = ChronoUnit.MONTHS.between(YearMonth.from(availableFrom), YearMonth.from(postedDate));
        if (elapsed < 1 || elapsed > 1200 || !availableFrom.plusMonths(elapsed).equals(postedDate)) {
            throw new IllegalArgumentException("已过账折旧日期与资产起算日不一致");
        }
        return Math.toIntExact(elapsed);
    }

    private static long sumOfYearMonthWeights(int coveredMonths, int months) {
        long sum = 0;
        for (int start = coveredMonths; start < months;) {
            int end = Math.min((start / 12 + 1) * 12, months);
            sum += (long) (months - start) * (end - start);
            start = end;
        }
        return sum;
    }
}
