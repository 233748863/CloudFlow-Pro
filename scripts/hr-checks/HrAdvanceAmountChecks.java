package com.cloudflow.hr.checks;

import com.cloudflow.hr.service.HrAdvanceAmounts;
import com.cloudflow.hr.service.HrAdvanceAmounts.Allocation;
import com.cloudflow.hr.service.HrAdvanceAmounts.Balance;
import com.cloudflow.hr.service.HrAdvanceAmounts.FundedLoan;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class HrAdvanceAmountChecks {
    private static int checks;
    private static int sequenceSteps;
    private static final YearMonth MONTH = YearMonth.of(2026, 9);
    private static final LocalDateTime PAID = LocalDateTime.of(2026, 8, 1, 10, 0);

    public static void main(String[] arguments) {
        Balance unfunded = HrAdvanceAmounts.unfunded();
        equal("0", unfunded.available());
        check(!unfunded.cleared(), "未放款不等于已还清");
        rejects(() -> HrAdvanceAmounts.reserve(unfunded, money("0.01")));
        rejects(() -> HrAdvanceAmounts.repayAvailable(unfunded, money("0.01")));
        rejects(() -> HrAdvanceAmounts.postReserved(unfunded, money("0.01")));
        rejects(() -> HrAdvanceAmounts.writeOff(unfunded, money("0.01")));
        rejects(() -> HrAdvanceAmounts.reverseRepayment(unfunded, money("0.01")));
        Balance original = HrAdvanceAmounts.funded(money("100"));
        Balance reserved = HrAdvanceAmounts.reserve(original, money("30"));
        equal("100", original.available());
        equal("70", reserved.available());
        equal("0", reserved.repaid());
        Balance recalculated = HrAdvanceAmounts.replaceReservation(reserved, money("30"), money("50"));
        equal("50", recalculated.reserved());
        equal("100", recalculated.outstanding());
        check(recalculated.equals(HrAdvanceAmounts.replaceReservation(recalculated, money("50"), money("50"))), "同预约重算金额不叠加");
        Balance posted = HrAdvanceAmounts.postReserved(recalculated, money("20"));
        equal("20", posted.repaid());
        equal("80", posted.outstanding());
        equal("30", posted.reserved());
        Balance manual = HrAdvanceAmounts.repayAvailable(posted, money("50"));
        equal("70", manual.repaid());
        equal("30", manual.outstanding());
        equal("30", manual.reserved());
        rejects(() -> HrAdvanceAmounts.repayAvailable(manual, money("0.01")));
        rejects(() -> HrAdvanceAmounts.writeOff(manual, money("30")));
        Balance released = HrAdvanceAmounts.release(manual, money("30"));
        equal("30", released.available());
        equal("70", released.repaid());
        Balance writtenOff = HrAdvanceAmounts.writeOff(released, money("30"));
        equal("0", writtenOff.outstanding());
        equal("30", writtenOff.writtenOff());
        check(!writtenOff.cleared(), "核销不能冒充实际还清");
        Balance reversed = HrAdvanceAmounts.reverseRepayment(writtenOff, money("10"));
        equal("10", reversed.outstanding());
        equal("60", reversed.repaid());
        equal("30", reversed.writtenOff());
        Balance cleared = HrAdvanceAmounts.repayAvailable(original, money("100"));
        check(cleared.cleared(), "实际还清且无预约才清账");
        check(!HrAdvanceAmounts.reverseRepayment(cleared, money("0.01")).cleared(), "冲正恢复未还本金");
        equal("999999999999.99", HrAdvanceAmounts.funded(HrAdvanceAmounts.MAX_PRINCIPAL).outstanding());
        equal("1.00", HrAdvanceAmounts.positive(money("1.000")));
        for (BigDecimal invalid : Arrays.asList(null, money("-0.01"), money("0.001"), money("1000000000000"))) {
            rejects(() -> HrAdvanceAmounts.nonnegative(invalid));
        }
        rejects(() -> HrAdvanceAmounts.funded(BigDecimal.ZERO));
        rejects(() -> new Balance(money("100"), money("1"), money("100"), BigDecimal.ZERO, BigDecimal.ZERO));
        rejects(() -> new Balance(money("100"), BigDecimal.ZERO, money("100"), money("100.01"), BigDecimal.ZERO));
        rejects(() -> new Balance(money("100"), BigDecimal.ZERO, money("90"), BigDecimal.ZERO, BigDecimal.ZERO));
        rejects(() -> HrAdvanceAmounts.reserve(null, money("1")));
        rejects(() -> HrAdvanceAmounts.reserve(original, BigDecimal.ZERO));
        rejects(() -> HrAdvanceAmounts.reserve(reserved, money("70.01")));
        rejects(() -> HrAdvanceAmounts.release(reserved, money("30.01")));
        rejects(() -> HrAdvanceAmounts.replaceReservation(reserved, money("30.01"), BigDecimal.ZERO));
        rejects(() -> HrAdvanceAmounts.replaceReservation(reserved, money("20"), money("90.01")));
        rejects(() -> HrAdvanceAmounts.postReserved(reserved, money("30.01")));
        rejects(() -> HrAdvanceAmounts.repayAvailable(original, money("100.01")));
        rejects(() -> HrAdvanceAmounts.reverseRepayment(cleared, money("100.01")));
        rejects(() -> HrAdvanceAmounts.writeOff(original, money("100.01")));
        rejects(() -> HrAdvanceAmounts.writeOff(original, BigDecimal.ZERO));
        equal("0.01", HrAdvanceAmounts.deduction(money("30"), money("0.01"), money("100")));
        equal("0", HrAdvanceAmounts.deduction(money("30"), money("100"), BigDecimal.ZERO));
        equal("10", HrAdvanceAmounts.deduction(money("30"), money("100"), money("10")));
        equal("30", HrAdvanceAmounts.deduction(money("30"), money("100"), money("9999999999999999.99")));
        rejects(() -> HrAdvanceAmounts.deduction(money("30"), money("100"), money("10000000000000000")));
        rejects(() -> HrAdvanceAmounts.deduction(money("30"), money("100"), money("-1")));
        allocationChecks(original, cleared);
        sequences();
        System.out.println("H2_ADVANCE_AMOUNT_CHECKS: checks=" + checks + "; failed=0; sequence_steps=" + sequenceSteps
                + "; conservation=true; reservation=true; reversal=true; stable_allocation=true; database=false; http=false; production_modified=false");
    }

    private static void allocationChecks(Balance original, Balance cleared) {
        FundedLoan laterIdentifier = loan(20L, PAID, MONTH, "30", original);
        FundedLoan earlierIdentifier = loan(10L, PAID, MONTH, "50", original);
        FundedLoan future = loan(5L, PAID, MONTH.plusMonths(1), "100", original);
        FundedLoan laterPayment = loan(1L, PAID.plusMonths(2), MONTH, "100", original);
        List<Allocation> result = HrAdvanceAmounts.allocate(List.of(laterIdentifier, future, earlierIdentifier, laterPayment), MONTH, money("70"));
        check(result.size() == 2, "只为已放款且到期的借款分配可扣工资");
        check(result.get(0).advanceId().equals(10L), "同放款时间按编号稳定分配");
        equal("50", result.get(0).amount());
        check(result.get(1).advanceId().equals(20L), "后续借款使用剩余工资额度");
        equal("20", result.get(1).amount());
        check(result.equals(HrAdvanceAmounts.allocate(List.of(earlierIdentifier, laterIdentifier), MONTH, money("70"))), "输入顺序不影响扣款分配");
        rejectsUnsupported(() -> result.add(new Allocation(9L, money("1"))));
        FundedLoan earlierPayment = loan(30L, PAID.minusDays(1), MONTH, "60", original);
        List<Allocation> byPayment = HrAdvanceAmounts.allocate(List.of(earlierIdentifier, earlierPayment), MONTH, money("70"));
        check(byPayment.get(0).advanceId().equals(30L), "放款时间先于编号排序");
        equal("60", byPayment.get(0).amount());
        equal("10", byPayment.get(1).amount());
        FundedLoan held = loan(40L, PAID, MONTH, "100", HrAdvanceAmounts.reserve(original, money("90")));
        equal("10", HrAdvanceAmounts.allocate(List.of(held), MONTH, money("100")).get(0).amount());
        check(HrAdvanceAmounts.allocate(List.of(loan(50L, PAID, MONTH, "100", cleared)), MONTH, money("100")).isEmpty(), "已清账不再次扣款");
        check(HrAdvanceAmounts.allocate(List.of(held), MONTH, BigDecimal.ZERO).isEmpty(), "可扣工资为零时不生成零金额预约");
        check(HrAdvanceAmounts.allocate(List.of(), MONTH, money("100")).isEmpty(), "无借款不改变工资");
        rejects(() -> HrAdvanceAmounts.allocate(List.of(held, held), MONTH, money("100")));
        rejects(() -> HrAdvanceAmounts.allocate(null, MONTH, money("100")));
        rejects(() -> HrAdvanceAmounts.allocate(Arrays.asList(held, null), MONTH, money("100")));
        rejects(() -> HrAdvanceAmounts.allocate(List.of(held), null, money("100")));
        rejects(() -> HrAdvanceAmounts.allocate(List.of(held), YearMonth.of(10000, 1), money("100")));
        rejects(() -> loan(0L, PAID, MONTH, "10", original));
        rejects(() -> loan(1L, null, MONTH, "10", original));
        rejects(() -> loan(1L, PAID, null, "10", original));
        rejects(() -> loan(1L, PAID, MONTH, "0", original));
        rejects(() -> loan(1L, PAID, MONTH, "10", HrAdvanceAmounts.unfunded()));
        rejects(() -> new Allocation(1L, BigDecimal.ZERO));
        List<FundedLoan> large = new ArrayList<>();
        for (long identifier = 1; identifier <= 3; identifier++) {
            large.add(loan(identifier, PAID, MONTH, "999999999999.99", HrAdvanceAmounts.funded(HrAdvanceAmounts.MAX_PRINCIPAL)));
        }
        BigDecimal total = HrAdvanceAmounts.allocate(large, MONTH, money("2000000000000")).stream()
                .map(Allocation::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        equal("2000000000000", total);
    }

    private static void sequences() {
        for (int principalCents = 1; principalCents <= 250; principalCents++) {
            BigDecimal principal = BigDecimal.valueOf(principalCents, 2);
            BigDecimal held = BigDecimal.valueOf(principalCents / 2, 2);
            Balance original = HrAdvanceAmounts.funded(principal);
            Balance reserved = HrAdvanceAmounts.replaceReservation(original, BigDecimal.ZERO, held);
            if (reserved.available().signum() > 0) reserved = HrAdvanceAmounts.repayAvailable(reserved, reserved.available());
            if (held.signum() > 0) reserved = HrAdvanceAmounts.postReserved(reserved, held);
            if (!reserved.cleared()) throw new AssertionError("逐分本金未还清: " + principalCents);
            Balance reversed = HrAdvanceAmounts.reverseRepayment(reserved, principal);
            if (!reversed.equals(original)) throw new AssertionError("逐分本金冲正不守恒: " + principalCents);
            sequenceSteps++;
        }
    }

    private static FundedLoan loan(Long identifier, LocalDateTime paid, YearMonth start, String planned, Balance balance) {
        return new FundedLoan(identifier, paid, start, money(planned), balance);
    }

    private static BigDecimal money(String value) {
        return new BigDecimal(value);
    }

    private static void equal(String expected, BigDecimal actual) {
        check(money(expected).compareTo(actual) == 0, "金额应为" + expected + "，实际" + actual);
    }

    private static void check(boolean condition, String label) {
        checks++;
        if (!condition) throw new AssertionError(label);
    }

    private static void rejects(Runnable operation) {
        checks++;
        try { operation.run(); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("非法借款金额或来源未被拒绝: " + checks);
    }

    private static void rejectsUnsupported(Runnable operation) {
        checks++;
        try { operation.run(); }
        catch (UnsupportedOperationException expected) { return; }
        throw new AssertionError("分配结果允许原地改写");
    }
}
