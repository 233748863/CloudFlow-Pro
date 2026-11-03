package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.domain.OaExpenseStandard;
import com.cloudflow.oa.domain.vo.OaExpenseExceedDetailVO;
import com.cloudflow.oa.domain.vo.OaExpenseExceedResultVO;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** 单次提交内复用标准匹配结果，按实际发生日期累计，不写入额外的额度副本。 */
public final class OaExpenseLimitCalculator {
    public static final Set<String> LIMIT_TYPES = Set.of("PER_ITEM", "DAILY", "MONTHLY", "YEARLY");
    private final List<OaExpenseStandard> standards;
    private final String positionLevel;
    private final Map<ItemScope, List<OaExpenseStandard>> matches = new HashMap<>();

    public OaExpenseLimitCalculator(List<OaExpenseStandard> standards, String positionLevel) {
        this.standards = standards;
        this.positionLevel = positionLevel;
    }

    public record HistoryRange(LocalDate from, LocalDate until, Set<String> expenseTypes) { }
    private record ItemScope(String category, String city) { }
    private record Period(Long standardId, LocalDate start) { }

    /** 只查询本单真正命中的累计周期；单笔标准无需历史查询。 */
    public HistoryRange historyRange(List<BizExpenseItem> items) {
        LocalDate from = null;
        LocalDate until = null;
        Set<String> expenseTypes = new LinkedHashSet<>();
        for (BizExpenseItem item : items) {
            for (OaExpenseStandard standard : matched(item)) {
                if ("PER_ITEM".equals(standard.getLimitType())) continue;
                LocalDate start = periodStart(standard.getLimitType(), item.getExpenseDate());
                LocalDate end = periodEnd(standard.getLimitType(), start);
                if (from == null || start.isBefore(from)) from = start;
                if (until == null || end.isAfter(until)) until = end;
                expenseTypes.add(item.getExpenseType());
            }
        }
        return from == null ? null : new HistoryRange(from, until, Set.copyOf(expenseTypes));
    }

    public OaExpenseExceedResultVO evaluate(List<BizExpenseItem> items, List<BizExpenseItem> committedUsage) {
        Map<Period, BigDecimal> totals = new HashMap<>();
        for (BizExpenseItem item : committedUsage) {
            for (OaExpenseStandard standard : matched(item)) {
                if ("PER_ITEM".equals(standard.getLimitType())) continue;
                Period period = new Period(standard.getStandardId(), periodStart(standard.getLimitType(), item.getExpenseDate()));
                totals.merge(period, item.getAmount(), BigDecimal::add);
            }
        }
        List<OaExpenseExceedDetailVO> details = new ArrayList<>();
        BigDecimal totalExceeded = BigDecimal.ZERO;
        for (BizExpenseItem item : items) {
            BigDecimal itemExceeded = BigDecimal.ZERO;
            for (OaExpenseStandard standard : matched(item)) {
                String type = standard.getLimitType();
                LocalDate start = periodStart(type, item.getExpenseDate());
                Period period = new Period(standard.getStandardId(), start);
                BigDecimal before = "PER_ITEM".equals(type) ? BigDecimal.ZERO : totals.getOrDefault(period, BigDecimal.ZERO);
                BigDecimal after = before.add(item.getAmount());
                if (!"PER_ITEM".equals(type)) totals.put(period, after);
                // 只把本次新增的超额计入本单；日/月/年同时超标时，同一金额不重复相加。
                BigDecimal exceeded = excess(after, standard.getLimitAmount()).subtract(excess(before, standard.getLimitAmount()));
                if (exceeded.signum() <= 0) continue;
                itemExceeded = itemExceeded.max(exceeded);
                OaExpenseExceedDetailVO detail = new OaExpenseExceedDetailVO();
                detail.setItemId(item.getId());
                detail.setExpenseType(item.getExpenseType());
                detail.setStandardId(standard.getStandardId());
                detail.setStandardLimit(standard.getLimitAmount());
                detail.setActualAmount(after);
                detail.setExceededAmount(exceeded);
                detail.setCity(item.getCity());
                detail.setLimitType(type);
                detail.setPeriodStart(start);
                detail.setPeriodEnd(periodEnd(type, start));
                details.add(detail);
            }
            totalExceeded = totalExceeded.add(itemExceeded);
        }
        OaExpenseExceedResultVO result = new OaExpenseExceedResultVO();
        result.setExceeded(!details.isEmpty());
        result.setDetails(details);
        result.setTotalExceededAmount(totalExceeded);
        return result;
    }

    private List<OaExpenseStandard> matched(BizExpenseItem item) {
        return matches.computeIfAbsent(new ItemScope(item.getExpenseType(), item.getCity()), scope -> {
            Map<String, OaExpenseStandard> byPeriod = new LinkedHashMap<>();
            for (OaExpenseStandard standard : standards) {
                if (!Objects.equals(standard.getCategory(), scope.category())) continue;
                if (StringUtils.hasText(standard.getPositionLevel()) && !Objects.equals(standard.getPositionLevel(), positionLevel)) continue;
                if (StringUtils.hasText(standard.getCity()) && !Objects.equals(standard.getCity(), scope.city())) continue;
                OaExpenseStandard previous = byPeriod.get(standard.getLimitType());
                if (previous == null || specificity(standard) > specificity(previous)
                        || specificity(standard) == specificity(previous) && standard.getLimitAmount().compareTo(previous.getLimitAmount()) < 0) {
                    byPeriod.put(standard.getLimitType(), standard);
                }
            }
            return List.copyOf(byPeriod.values());
        });
    }

    private static int specificity(OaExpenseStandard standard) {
        return (StringUtils.hasText(standard.getPositionLevel()) ? 2 : 0) + (StringUtils.hasText(standard.getCity()) ? 1 : 0);
    }

    private static BigDecimal excess(BigDecimal amount, BigDecimal limit) {
        return amount.subtract(limit).max(BigDecimal.ZERO);
    }

    private static LocalDate periodStart(String type, LocalDate date) {
        return switch (type) {
            case "PER_ITEM", "DAILY" -> date;
            case "MONTHLY" -> date.withDayOfMonth(1);
            case "YEARLY" -> date.withDayOfYear(1);
            default -> throw new IllegalArgumentException("不支持的费用限额周期: " + type);
        };
    }

    private static LocalDate periodEnd(String type, LocalDate start) {
        return switch (type) {
            case "PER_ITEM", "DAILY" -> start.plusDays(1);
            case "MONTHLY" -> start.plusMonths(1);
            case "YEARLY" -> start.plusYears(1);
            default -> throw new IllegalArgumentException("不支持的费用限额周期: " + type);
        };
    }
}
