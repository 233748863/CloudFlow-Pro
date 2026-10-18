package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.deal.CrmDealPolicy.Member;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmDealPolicyChecks {
    static void run() {
        int before = assertionCount();
        List<Member> members = List.of(member(1, "OWNER", "0.3333", null), member(2, "CO_SELLER", "0.3333", "0.10"), member(3, "PRE_SALES", "0.3334", "0.05"));
        List<CrmDealPolicy.Allocation> allocation = CrmDealPolicy.allocate(new BigDecimal("0.05"), members, true);
        decimal("0.01", allocation.get(0).amount(), "rounding difference goes only to OWNER");
        decimal("0.02", allocation.get(1).amount(), "co-seller retains rounded cents");
        decimal("0.02", allocation.get(2).amount(), "pre-sales retains rounded cents");
        equal("UNCONFIRMED", allocation.get(0).commissionStatus(), "unconfirmed rate cannot become payroll ready");
        equal(null, allocation.get(0).commissionAmount(), "unconfirmed commission is null rather than a fake zero");
        decimal("0.05", allocation.stream().map(CrmDealPolicy.Allocation::amount).reduce(BigDecimal.ZERO, BigDecimal::add), "allocated cents preserve exact fact");
        CrmDealPolicy.Allocation half = CrmDealPolicy.allocate(new BigDecimal("0.03"), List.of(member(1, "OWNER", "1", "0.5")), true).get(0);
        decimal("0.02", half.commissionAmount(), "commission half cent rounds up");
        equal("READY", half.commissionStatus(), "known rate still requires posting rather than paid status");
        CrmDealPolicy.Allocation won = CrmDealPolicy.allocate(new BigDecimal("100"), List.of(member(1, "OWNER", "1", "0.5")), false).get(0);
        equal("NOT_APPLICABLE", won.commissionStatus(), "won and contract facts cannot produce receipt commission");
        equal(null, won.commissionAmount(), "won fact never synthesizes commission");
        decimal("999999999999.99", CrmDealPolicy.money(new BigDecimal("999999999999.99")), "approved DECIMAL14 maximum is preserved");
        for (String invalid : List.of("-0.01", "0.001", "1000000000000.00")) fails(IllegalArgumentException.class, () -> CrmDealPolicy.money(new BigDecimal(invalid)), "invalid fact precision or range rejected");
        for (String invalid : List.of("-0.0001", "1.0001", "100", "0.12345")) fails(IllegalArgumentException.class, () -> CrmDealPolicy.ratio(new BigDecimal(invalid)), "invalid team or commission ratio rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(null), "missing team rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of()), "empty team rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of(member(1, "OWNER", "0.9", null))), "sum below one rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of(member(1, "OWNER", "1", null), member(2, "SUPPORT", "0.1", null))), "sum above one rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of(member(1, "OWNER", "0.5", null), member(2, "OWNER", "0.5", null))), "two owners rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of(member(1, "SUPPORT", "1", null))), "no owner rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of(member(1, "OWNER", "0.5", null), member(1, "SUPPORT", "0.5", null))), "duplicate user rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of(new Member(1L, null, "成员", 100L, "OWNER", BigDecimal.ONE, null))), "missing HR mapping rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of(member(1, "OWNER", "0.5", null), new Member(2L, 1L, "成员", 100L, "SUPPORT", new BigDecimal("0.5"), null))), "same employee cannot be paid through two users");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of(new Member(1L, 1L, "成员", null, "OWNER", BigDecimal.ONE, null))), "missing department snapshot rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.team(List.of(member(1, "UNKNOWN", "1", null))), "unknown role rejected");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.allocate(new BigDecimal("0.01"), List.of(member(1, "OWNER", "0", null), member(2, "CO_SELLER", "0.5", null), member(3, "SUPPORT", "0.5", null)), true), "negative OWNER rounding allocation rejected");
        equal("CNY", CrmDealPolicy.currency("CNY"), "CNY is explicit");
        equal("USD", CrmDealPolicy.currency("USD"), "foreign currency stays distinct rather than converted");
        for (String invalid : List.of("", "cny", "CNY,USD", "人民币")) fails(IllegalArgumentException.class, () -> CrmDealPolicy.currency(invalid), "implicit or mixed currency rejected");
        CrmDealPolicy.eventType("WON", "OPPORTUNITY"); CrmDealPolicy.eventType("CONTRACT", "CONTRACT"); CrmDealPolicy.eventType("RECEIPT", "RECEIVABLE");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.eventType("CONTRACT", "OPPORTUNITY"), "estimate cannot masquerade as contract fact");
        fails(IllegalArgumentException.class, () -> CrmDealPolicy.eventType("RECEIPT", "CONTRACT"), "contract approval cannot masquerade as cash receipt");
        Random random = new Random(1907L);
        for (int attempt = 0; attempt < 300; attempt++) {
            int basisPoints = 1 + random.nextInt(9999);
            BigDecimal amount = BigDecimal.valueOf(random.nextInt(10000000), 2);
            List<Member> variable = List.of(member(1, "OWNER", BigDecimal.valueOf(basisPoints, 4).toPlainString(), null), member(2, "CO_SELLER", BigDecimal.valueOf(10000 - basisPoints, 4).toPlainString(), "0.0625"));
            List<CrmDealPolicy.Allocation> split = CrmDealPolicy.allocate(amount, variable, true);
            decimal(amount.toPlainString(), split.stream().map(CrmDealPolicy.Allocation::amount).reduce(BigDecimal.ZERO, BigDecimal::add), "random ratios preserve every cent");
            equal(true, split.stream().allMatch(value -> value.amount().signum() >= 0), "no participant allocation becomes negative");
        }
        List<Member> unordered = new ArrayList<>(members); java.util.Collections.reverse(unordered);
        equal(CrmDealPolicy.team(members), CrmDealPolicy.team(unordered), "member order has one canonical snapshot");
        System.out.println("H3_DEAL_POLICY_CHECKS: assertions=" + (assertionCount() - before) + "; failed=0; database=false");
    }

    static Member member(long userId, String role, String percentage, String commissionRate) {
        return new Member(userId, userId, "成员" + userId, 100L, role, new BigDecimal(percentage), commissionRate == null ? null : new BigDecimal(commissionRate));
    }
}
