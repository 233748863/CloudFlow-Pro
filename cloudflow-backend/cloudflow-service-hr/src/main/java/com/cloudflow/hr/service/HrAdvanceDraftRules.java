package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrAdvanceRequests;

import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import static com.cloudflow.hr.service.HrHException.invalid;

public final class HrAdvanceDraftRules {
    private HrAdvanceDraftRules() { }

    public static Plan plan(HrAdvanceRequests.Draft input, LocalDate applicationDate) {
        if (input == null || applicationDate == null) throw invalid("借款申请内容缺失");
        BigDecimal amount = HrAdvanceAmounts.positive(input.getAmount());
        String purpose = HrHSupport.text(input.getPurpose(), 500);
        String mode = input.getRepayMode();
        if (mode == null || !List.of("SALARY_DEDUCT", "LUMP_SUM").contains(mode)) throw invalid("请选择有效的还款方式");
        if ("LUMP_SUM".equals(mode)) {
            if (input.getRepayStartMonth() != null || input.getRepayMonths() != null || input.getMonthlyDeductAmount() != null) {
                throw invalid("一次性还款不能包含工资扣还计划");
            }
            return new Plan(amount, purpose, mode, null, null, null);
        }
        if (input.getRepayStartMonth() == null || !input.getRepayStartMonth().matches("[0-9]{4}-(0[1-9]|1[0-2])")
                || input.getRepayMonths() == null || input.getRepayMonths() <= 0) throw invalid("工资扣还须填写开始月份及正整数期数");
        BigDecimal monthly = HrAdvanceAmounts.positive(input.getMonthlyDeductAmount());
        try {
            YearMonth first = YearMonth.parse(input.getRepayStartMonth());
            YearMonth last = first.plusMonths(input.getRepayMonths().longValue() - 1);
            if (first.getYear() < 1 || first.isBefore(YearMonth.from(applicationDate)) || last.getYear() > 9999) {
                throw invalid("扣还开始月份不能早于申请月份，末期年份须在9999年以内");
            }
        } catch (DateTimeException failure) {
            throw invalid("扣还月份或期数超出有效日期范围");
        }
        BigDecimal beforeLast = monthly.multiply(BigDecimal.valueOf(input.getRepayMonths().longValue() - 1));
        if (beforeLast.compareTo(amount) >= 0 || beforeLast.add(monthly).compareTo(amount) < 0) {
            throw invalid("月扣金额和期数须覆盖借款本金，最后一期按剩余本金归还");
        }
        return new Plan(amount, purpose, mode, input.getRepayStartMonth(), input.getRepayMonths(), monthly);
    }

    public record Plan(BigDecimal amount, String purpose, String repayMode, String repayStartMonth,
            Integer repayMonths, BigDecimal monthlyDeductAmount) { }
}
