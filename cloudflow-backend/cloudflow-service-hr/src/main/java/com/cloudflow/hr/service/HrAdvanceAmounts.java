package com.cloudflow.hr.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class HrAdvanceAmounts {
    public static final BigDecimal MAX_PRINCIPAL = new BigDecimal("999999999999.99");
    private static final BigDecimal MAX_PAYROLL = new BigDecimal("9999999999999999.99");
    private static final BigDecimal ZERO = new BigDecimal("0.00");

    private HrAdvanceAmounts() { }

    public record Balance(BigDecimal funded, BigDecimal repaid, BigDecimal outstanding,
                          BigDecimal reserved, BigDecimal writtenOff) {
        public Balance {
            funded = nonnegative(funded);
            repaid = nonnegative(repaid);
            outstanding = nonnegative(outstanding);
            reserved = nonnegative(reserved);
            writtenOff = nonnegative(writtenOff);
            require(funded.compareTo(repaid.add(outstanding).add(writtenOff)) == 0, "借款本金与还款、余额及核销金额不一致");
            require(reserved.compareTo(outstanding) <= 0, "预约扣款不能超过实际未还本金");
        }

        public BigDecimal available() {
            return outstanding.subtract(reserved);
        }

        public boolean cleared() {
            return funded.signum() > 0 && outstanding.signum() == 0 && reserved.signum() == 0 && writtenOff.signum() == 0;
        }
    }

    public record FundedLoan(Long advanceId, LocalDateTime paidTime, YearMonth repayStartMonth,
                             BigDecimal plannedMonthlyAmount, Balance balance) {
        public FundedLoan {
            require(advanceId != null && advanceId > 0, "借款编号无效");
            require(paidTime != null && paidTime.getYear() >= 1 && paidTime.getYear() <= 9999, "实际放款时间无效");
            validMonth(repayStartMonth);
            plannedMonthlyAmount = positive(plannedMonthlyAmount);
            require(balance != null && balance.funded().signum() > 0, "未实际放款的借款不能扣还");
        }
    }

    public record Allocation(Long advanceId, BigDecimal amount) {
        public Allocation {
            require(advanceId != null && advanceId > 0, "借款编号无效");
            amount = positive(amount);
        }
    }

    public static Balance unfunded() {
        return new Balance(ZERO, ZERO, ZERO, ZERO, ZERO);
    }

    public static Balance funded(BigDecimal amount) {
        BigDecimal principal = positive(amount);
        return new Balance(principal, ZERO, principal, ZERO, ZERO);
    }

    public static Balance reserve(Balance balance, BigDecimal amount) {
        return replaceReservation(balance, ZERO, positive(amount));
    }

    public static Balance replaceReservation(Balance balance, BigDecimal previous, BigDecimal replacement) {
        required(balance);
        BigDecimal oldAmount = nonnegative(previous);
        BigDecimal newAmount = nonnegative(replacement);
        require(oldAmount.compareTo(balance.reserved()) <= 0, "原预约金额超过当前预约总额");
        BigDecimal reserved = balance.reserved().subtract(oldAmount).add(newAmount);
        require(reserved.compareTo(balance.outstanding()) <= 0, "可预约本金不足");
        return new Balance(balance.funded(), balance.repaid(), balance.outstanding(), reserved, balance.writtenOff());
    }

    public static Balance release(Balance balance, BigDecimal amount) {
        return replaceReservation(balance, positive(amount), ZERO);
    }

    public static Balance postReserved(Balance balance, BigDecimal amount) {
        required(balance);
        BigDecimal posted = positive(amount);
        require(posted.compareTo(balance.reserved()) <= 0, "入账金额超过已预约金额");
        return new Balance(balance.funded(), balance.repaid().add(posted), balance.outstanding().subtract(posted),
                balance.reserved().subtract(posted), balance.writtenOff());
    }

    public static Balance repayAvailable(Balance balance, BigDecimal amount) {
        required(balance);
        BigDecimal posted = positive(amount);
        require(posted.compareTo(balance.available()) <= 0, "实际还款不能扣走已预约本金或超过余额");
        return new Balance(balance.funded(), balance.repaid().add(posted), balance.outstanding().subtract(posted),
                balance.reserved(), balance.writtenOff());
    }

    public static Balance reverseRepayment(Balance balance, BigDecimal amount) {
        required(balance);
        BigDecimal reversed = positive(amount);
        require(reversed.compareTo(balance.repaid()) <= 0, "冲正金额超过已入账还款");
        return new Balance(balance.funded(), balance.repaid().subtract(reversed), balance.outstanding().add(reversed),
                balance.reserved(), balance.writtenOff());
    }

    public static Balance writeOff(Balance balance, BigDecimal amount) {
        required(balance);
        BigDecimal writtenOff = positive(amount);
        require(balance.reserved().signum() == 0, "存在扣款预约时不能核销");
        require(writtenOff.compareTo(balance.outstanding()) <= 0, "核销金额超过未还本金");
        return new Balance(balance.funded(), balance.repaid(), balance.outstanding().subtract(writtenOff),
                balance.reserved(), balance.writtenOff().add(writtenOff));
    }

    public static BigDecimal deduction(BigDecimal planned, BigDecimal availablePrincipal, BigDecimal allowedPayroll) {
        return positive(planned).min(nonnegative(availablePrincipal)).min(payrollBudget(allowedPayroll));
    }

    public static List<Allocation> allocate(List<FundedLoan> loans, YearMonth payrollMonth, BigDecimal allowedPayroll) {
        require(loans != null, "缺少借款明细");
        validMonth(payrollMonth);
        BigDecimal remaining = payrollBudget(allowedPayroll);
        Set<Long> identifiers = new HashSet<>();
        for (FundedLoan loan : loans) {
            require(loan != null && identifiers.add(loan.advanceId()), "借款明细为空或编号重复");
        }
        List<FundedLoan> ordered = loans.stream()
                .sorted(Comparator.comparing(FundedLoan::paidTime).thenComparing(FundedLoan::advanceId)).toList();
        List<Allocation> allocated = new ArrayList<>();
        for (FundedLoan loan : ordered) {
            if (loan.repayStartMonth().isAfter(payrollMonth) || YearMonth.from(loan.paidTime()).isAfter(payrollMonth)) continue;
            BigDecimal amount = deduction(loan.plannedMonthlyAmount(), loan.balance().available(), remaining);
            if (amount.signum() == 0) continue;
            allocated.add(new Allocation(loan.advanceId(), amount));
            remaining = remaining.subtract(amount);
        }
        return List.copyOf(allocated);
    }

    public static BigDecimal positive(BigDecimal value) {
        BigDecimal amount = nonnegative(value);
        require(amount.signum() > 0, "金额必须大于0");
        return amount;
    }

    public static BigDecimal nonnegative(BigDecimal value) {
        return bounded(value, MAX_PRINCIPAL);
    }

    private static BigDecimal payrollBudget(BigDecimal value) {
        return bounded(value, MAX_PAYROLL);
    }

    private static BigDecimal bounded(BigDecimal value, BigDecimal maximum) {
        require(value != null && value.signum() >= 0 && value.compareTo(maximum) <= 0, "金额缺失、为负或超过字段容量");
        try {
            return value.setScale(2, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException failure) {
            throw new IllegalArgumentException("金额最多保留两位小数，不能自动截断", failure);
        }
    }

    private static void validMonth(YearMonth month) {
        require(month != null && month.getYear() >= 1 && month.getYear() <= 9999, "扣还月份无效");
    }

    private static void required(Balance balance) {
        require(balance != null, "缺少借款余额");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }
}
