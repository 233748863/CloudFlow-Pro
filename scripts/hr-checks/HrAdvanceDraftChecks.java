package com.cloudflow.hr.checks;

import com.cloudflow.hr.domain.dto.HrAdvanceRequests;
import com.cloudflow.hr.service.HrAdvanceDraftRules;
import com.cloudflow.hr.service.HrHException;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.function.Consumer;

public final class HrAdvanceDraftChecks {
    private static final LocalDate APPLICATION_DATE = LocalDate.of(2026, 9, 25);
    private static int checks;

    public static void main(String[] arguments) {
        HrAdvanceDraftRules.Plan lump = HrAdvanceDraftRules.plan(lump(), APPLICATION_DATE);
        check(lump.amount().toPlainString().equals("100.00") && lump.purpose().equals("必要用途"), "金额和用途规范化");
        check(lump.repayStartMonth() == null && lump.repayMonths() == null && lump.monthlyDeductAmount() == null, "一次性归还不保留分期列");
        for (Consumer<HrAdvanceRequests.Draft> change : List.<Consumer<HrAdvanceRequests.Draft>>of(
                input -> input.setRepayStartMonth("2026-09"), input -> input.setRepayMonths(1),
                input -> input.setMonthlyDeductAmount(BigDecimal.ONE))) {
            HrAdvanceRequests.Draft input = lump();
            change.accept(input);
            rejects(() -> HrAdvanceDraftRules.plan(input, APPLICATION_DATE));
        }
        rejects(() -> HrAdvanceDraftRules.plan(null, APPLICATION_DATE));
        rejects(() -> HrAdvanceDraftRules.plan(lump(), null));
        for (String mode : Arrays.asList(null, "", "SALARY", "lump_sum")) {
            HrAdvanceRequests.Draft input = lump(); input.setRepayMode(mode);
            rejects(() -> HrAdvanceDraftRules.plan(input, APPLICATION_DATE));
        }
        for (String purpose : Arrays.asList(null, "", "   ", "用".repeat(501))) {
            HrAdvanceRequests.Draft input = lump(); input.setPurpose(purpose);
            rejects(() -> HrAdvanceDraftRules.plan(input, APPLICATION_DATE));
        }
        for (BigDecimal amount : Arrays.asList(null, BigDecimal.ZERO, new BigDecimal("-0.01"), new BigDecimal("0.001"), new BigDecimal("1000000000000"))) {
            HrAdvanceRequests.Draft input = lump(); input.setAmount(amount);
            rejects(() -> HrAdvanceDraftRules.plan(input, APPLICATION_DATE));
        }
        HrAdvanceRequests.Draft maximum = lump(); maximum.setAmount(new BigDecimal("999999999999.99"));
        check(HrAdvanceDraftRules.plan(maximum, APPLICATION_DATE).amount().equals(maximum.getAmount()), "十二位整数和两位小数不丢失精度");
        HrAdvanceDraftRules.Plan installments = HrAdvanceDraftRules.plan(salary("2026-09", 3, "40.00"), APPLICATION_DATE);
        check(installments.repayMonths() == 3 && installments.monthlyDeductAmount().toPlainString().equals("40.00"), "40加40加末期20覆盖本金");
        check(HrAdvanceDraftRules.plan(salary("2026-09", 1, "100.00"), APPLICATION_DATE).repayMonths() == 1, "单期恰好归还");
        rejects(() -> HrAdvanceDraftRules.plan(salary("2026-09", 4, "40.00"), APPLICATION_DATE));
        rejects(() -> HrAdvanceDraftRules.plan(salary("2026-09", 2, "40.00"), APPLICATION_DATE));
        rejects(() -> HrAdvanceDraftRules.plan(salary("2026-09", 3, "50.00"), APPLICATION_DATE));
        for (String month : Arrays.asList(null, "", "2026-9", "2026-00", "2026-13", "0000-01", "10000-01", "2026-08")) {
            rejects(() -> HrAdvanceDraftRules.plan(salary(month, 3, "40.00"), APPLICATION_DATE));
        }
        for (Integer months : Arrays.asList(null, 0, -1, Integer.MAX_VALUE)) {
            rejects(() -> HrAdvanceDraftRules.plan(salary("2026-09", months, "40.00"), APPLICATION_DATE));
        }
        for (String amount : Arrays.asList(null, "0", "-1", "0.001", "1000000000000")) {
            rejects(() -> HrAdvanceDraftRules.plan(salary("2026-09", 3, amount), APPLICATION_DATE));
        }
        check(HrAdvanceDraftRules.plan(salary("9999-12", 1, "100.00"), APPLICATION_DATE).repayStartMonth().equals("9999-12"), "末期允许9999年12月");
        rejects(() -> HrAdvanceDraftRules.plan(salary("9999-12", 2, "50.00"), APPLICATION_DATE));
        check(HrAdvanceDraftRules.plan(salary("2026-08", 3, "40.00"), LocalDate.of(2026, 8, 31)).repayStartMonth().equals("2026-08"), "跨月编辑以原申请日期校验");
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            Validator validator = factory.getValidator();
            check(validator.validate(lump()).isEmpty(), "正式请求约束接受合法草稿");
            HrAdvanceRequests.Draft input = lump(); input.setVersion(-1);
            check(!validator.validate(input).isEmpty(), "正式请求约束拒绝负版本");
            input = lump(); input.setAmount(new BigDecimal("1.001"));
            check(!validator.validate(input).isEmpty(), "正式请求约束拒绝多于两位小数");
            input = lump(); input.setPurpose("用".repeat(501));
            check(!validator.validate(input).isEmpty(), "正式请求约束拒绝过长用途");
        }
        for (int principalCents = 1; principalCents <= 500; principalCents++) {
            int monthlyCents = Math.max(1, principalCents / 3);
            int periods = (principalCents + monthlyCents - 1) / monthlyCents;
            HrAdvanceRequests.Draft input = salary("2026-09", periods, BigDecimal.valueOf(monthlyCents, 2).toPlainString());
            input.setAmount(BigDecimal.valueOf(principalCents, 2));
            HrAdvanceDraftRules.Plan result = HrAdvanceDraftRules.plan(input, APPLICATION_DATE);
            BigDecimal remaining = result.amount().subtract(result.monthlyDeductAmount().multiply(BigDecimal.valueOf(periods - 1L)));
            check(remaining.signum() > 0 && remaining.compareTo(result.monthlyDeductAmount()) <= 0, "末期正数且不超过月扣计划");
        }
        System.out.println("H2_ADVANCE_DRAFT_RULES: checks=" + checks + "; failed=0; boundary_sequences=500; actual_rules=true; request_validation=true; database=false; http=false; production_modified=false");
    }

    private static HrAdvanceRequests.Draft lump() {
        HrAdvanceRequests.Draft input = new HrAdvanceRequests.Draft();
        input.setAmount(new BigDecimal("100.00")); input.setPurpose(" 必要用途 "); input.setRepayMode("LUMP_SUM");
        return input;
    }

    private static HrAdvanceRequests.Draft salary(String month, Integer periods, String monthly) {
        HrAdvanceRequests.Draft input = lump(); input.setRepayMode("SALARY_DEDUCT");
        input.setRepayStartMonth(month); input.setRepayMonths(periods);
        input.setMonthlyDeductAmount(monthly == null ? null : new BigDecimal(monthly));
        return input;
    }

    private static void rejects(Runnable operation) {
        checks++;
        try { operation.run(); }
        catch (HrHException expected) {
            if (expected.getStatus() != 400 || !"INVALID_PARAMETER".equals(expected.getCode())) throw expected;
            return;
        } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("无效草稿未被拒绝: " + checks);
    }

    private static void check(boolean accepted, String label) {
        checks++;
        if (!accepted) throw new AssertionError(label);
    }
}
