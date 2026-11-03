package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.domain.OaExpenseStandard;
import com.cloudflow.oa.domain.vo.OaExpenseExceedResultVO;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class OaExpenseLimitChecks {
    public static void main(String[] args) {
        OaExpenseLimitCalculator single = calculator(standard(1L, "PER_ITEM", "杭州", "100"), standard(2L, "PER_ITEM", null, "50"));
        expect(single.evaluate(List.of(item("杭州", "2026-11-03", "150")), List.of()), "50", 1);
        if (single.historyRange(List.of(item("杭州", "2026-11-03", "1"))) != null) throw new AssertionError("单笔不应读取历史");

        OaExpenseLimitCalculator daily = calculator(standard(3L, "DAILY", "杭州", "100"));
        List<BizExpenseItem> current = List.of(item("杭州", "2026-11-03", "30"), item("杭州", "2026-11-03", "30"));
        expect(daily.evaluate(current, List.of(item("杭州", "2026-11-03", "60"), item("杭州", "2026-11-02", "1000"), item("上海", "2026-11-03", "500"))), "20", 1);
        OaExpenseLimitCalculator.HistoryRange range = daily.historyRange(current);
        if (!range.from().equals(LocalDate.of(2026, 11, 3)) || !range.until().equals(LocalDate.of(2026, 11, 4))) throw new AssertionError("日查询边界");

        OaExpenseLimitCalculator monthly = calculator(standard(4L, "MONTHLY", "杭州", "100"));
        expect(monthly.evaluate(List.of(item("杭州", "2026-12-01", "20")), List.of(item("杭州", "2026-11-30", "500"))), "0", 0);
        expect(monthly.evaluate(List.of(item("杭州", "2026-11-30", "20")), List.of(item("杭州", "2026-11-01", "90"))), "10", 1);

        OaExpenseLimitCalculator yearly = calculator(standard(5L, "YEARLY", "杭州", "100"));
        expect(yearly.evaluate(List.of(item("杭州", "2027-01-01", "20")), List.of(item("杭州", "2026-12-31", "500"))), "0", 0);
        expect(yearly.evaluate(List.of(item("杭州", "2026-12-31", "20")), List.of(item("杭州", "2026-01-01", "90"))), "10", 1);

        OaExpenseLimitCalculator overlapping = calculator(standard(6L, "DAILY", "杭州", "100"), standard(7L, "MONTHLY", "杭州", "100"), standard(8L, "YEARLY", "杭州", "100"));
        expect(overlapping.evaluate(List.of(item("杭州", "2026-11-03", "20")), List.of(item("杭州", "2026-11-03", "90"))), "10", 3);
        expect(overlapping.evaluate(List.of(item("杭州", "2026-11-03", "20")), List.of(item("杭州", "2026-11-03", "200"))), "20", 3);

        OaExpenseLimitCalculator generic = calculator(standard(9L, "DAILY", null, "100"), standard(10L, "DAILY", "上海", "500"));
        expect(generic.evaluate(List.of(item("杭州", "2026-11-03", "30")), List.of(item("北京", "2026-11-03", "80"), item("上海", "2026-11-03", "500"))), "10", 1);
        System.out.println("OA_EXPENSE_LIMIT_CHECKS=PASS (city, per-item/day/month/year, boundaries, incremental excess)");
    }

    private static OaExpenseLimitCalculator calculator(OaExpenseStandard... standards) {
        return new OaExpenseLimitCalculator(List.of(standards), null);
    }
    private static OaExpenseStandard standard(Long id, String type, String city, String amount) {
        OaExpenseStandard standard = new OaExpenseStandard();
        standard.setStandardId(id); standard.setCategory("MEAL"); standard.setCity(city);
        standard.setLimitType(type); standard.setLimitAmount(new BigDecimal(amount));
        return standard;
    }
    private static BizExpenseItem item(String city, String date, String amount) {
        BizExpenseItem item = new BizExpenseItem();
        item.setCity(city); item.setExpenseDate(LocalDate.parse(date));
        item.setAmount(new BigDecimal(amount)); item.setExpenseType("MEAL");
        return item;
    }
    private static void expect(OaExpenseExceedResultVO result, String amount, int details) {
        if (result.getTotalExceededAmount().compareTo(new BigDecimal(amount)) != 0 || result.getDetails().size() != details
                || result.isExceeded() != (details > 0)) {
            throw new AssertionError("Expected excess=" + amount + ", details=" + details + "; actual=" + result);
        }
    }
}
