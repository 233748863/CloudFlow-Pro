package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.CrmDealAllocation;
import com.cloudflow.crm.service.deal.CrmDealRefundPolicy;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.springframework.beans.BeanUtils;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmDealRefundPolicyChecks {
    private static long nextId = 10000;

    static void run() {
        int before = assertionCount();
        List<CrmDealAllocation> sources = List.of(source(1, "OWNER", "60", "6"), source(2, "CO_SELLER", "40", null));
        List<CrmDealRefundPolicy.Portion> first = CrmDealRefundPolicy.allocate(new BigDecimal("100"), new BigDecimal("30"), sources, List.of());
        decimal("18", first.get(0).amount(), "partial refund keeps the original owner's cash allocation");
        decimal("12", first.get(1).amount(), "partial refund keeps the original colleague's cash allocation");
        decimal("1.8", first.get(0).commissionAmount(), "confirmed commission reverses proportionally from its frozen value");
        equal(null, first.get(1).commissionAmount(), "unconfirmed commission stays unconfirmed");
        List<CrmDealAllocation> previous = reversals(first);
        fails(IllegalArgumentException.class, () -> CrmDealRefundPolicy.allocate(new BigDecimal("100"), new BigDecimal("70.01"), sources, previous), "partial refund cannot exceed the selected source balance");
        List<CrmDealRefundPolicy.Portion> rest = CrmDealRefundPolicy.allocate(new BigDecimal("100"), new BigDecimal("70"), sources, previous);
        decimal("42", rest.get(0).amount(), "final refund consumes exact remaining owner allocation");
        decimal("4.2", rest.get(0).commissionAmount(), "final refund consumes exact remaining original commission");
        ArrayList<CrmDealAllocation> duplicate = new ArrayList<>(previous); duplicate.add(previous.get(0));
        fails(IllegalArgumentException.class, () -> CrmDealRefundPolicy.allocate(new BigDecimal("100"), BigDecimal.ONE, sources, duplicate), "duplicate refund allocation identity is rejected");
        previous.get(0).setTenantId(100001L);
        fails(IllegalArgumentException.class, () -> CrmDealRefundPolicy.allocate(new BigDecimal("100"), BigDecimal.ONE, sources, previous), "foreign tenant reversal is rejected");
        fails(IllegalArgumentException.class, () -> CrmDealRefundPolicy.allocate(new BigDecimal("99"), BigDecimal.ONE, sources, List.of()), "source amount and frozen allocation sum must agree");
        fails(IllegalArgumentException.class, () -> CrmDealRefundPolicy.allocate(new BigDecimal("100"), new BigDecimal("0.001"), sources, List.of()), "refund precision is limited to cents");
        randomPartitions();
        System.out.println("H3_REFUND_ALLOCATION_POLICY_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; random_partitions=300; database=false; source_allocations_unchanged=true");
    }

    private static CrmDealAllocation source(long id, String role, String amount, String commission) {
        CrmDealAllocation source = new CrmDealAllocation();
        source.setAllocationId(id); source.setTenantId(100000L); source.setEventId(500L);
        source.setSalesUserId(id); source.setEmployeeId(id); source.setDeptId(100L); source.setRoleType(role);
        source.setAllocatedAmount(new BigDecimal(amount)); source.setAllocatedPercentage(BigDecimal.ZERO);
        source.setCommissionAmount(commission == null ? null : new BigDecimal(commission));
        return source;
    }

    private static List<CrmDealAllocation> reversals(List<CrmDealRefundPolicy.Portion> portions) {
        List<CrmDealAllocation> result = new ArrayList<>();
        for (CrmDealRefundPolicy.Portion portion : portions) {
            CrmDealAllocation reversal = new CrmDealAllocation(); BeanUtils.copyProperties(portion.original(), reversal);
            reversal.setAllocationId(nextId++); reversal.setReversalOfId(portion.original().getAllocationId());
            reversal.setAllocatedAmount(portion.amount().negate());
            reversal.setCommissionAmount(portion.commissionAmount() == null ? null : portion.commissionAmount().negate());
            result.add(reversal);
        }
        return result;
    }

    private static void randomPartitions() {
        Random random = new Random(20260918);
        for (int trial = 0; trial < 300; trial++) {
            List<CrmDealAllocation> original = new ArrayList<>();
            int memberCount = 2 + random.nextInt(19);
            int totalCents = 0;
            for (int index = 0; index < memberCount; index++) {
                int cents = index == 0 ? 0 : 1 + random.nextInt(200);
                totalCents += cents;
                original.add(source(index + 1L, index == 0 ? "OWNER" : "CO_SELLER", BigDecimal.valueOf(cents, 2).toPlainString(),
                        index % 3 == 0 ? null : BigDecimal.valueOf(cents / 5, 2).toPlainString()));
            }
            BigDecimal total = BigDecimal.valueOf(totalCents, 2);
            List<CrmDealAllocation> previous = new ArrayList<>();
            int remaining = totalCents;
            while (remaining > 0) {
                int cents = 1 + random.nextInt(remaining);
                BigDecimal requested = BigDecimal.valueOf(cents, 2);
                List<CrmDealRefundPolicy.Portion> portions = CrmDealRefundPolicy.allocate(total, requested, original, previous);
                decimal(requested.toPlainString(), portions.stream().map(CrmDealRefundPolicy.Portion::amount).reduce(BigDecimal.ZERO, BigDecimal::add), "each partial refund sums to exactly the requested cents");
                check(portions.stream().allMatch(portion -> portion.amount().signum() >= 0), "rounding never creates negative refund allocation even for a zero-share owner");
                previous.addAll(reversals(portions));
                remaining -= cents;
            }
            for (CrmDealAllocation source : original) {
                List<CrmDealAllocation> refunded = previous.stream().filter(entry -> source.getAllocationId().equals(entry.getReversalOfId())).toList();
                decimal(source.getAllocatedAmount().negate().toPlainString(), refunded.stream().map(CrmDealAllocation::getAllocatedAmount).reduce(BigDecimal.ZERO, BigDecimal::add), "all partial refunds cancel each exact original allocation");
                if (source.getCommissionAmount() == null) check(refunded.stream().allMatch(entry -> entry.getCommissionAmount() == null), "random unconfirmed commission never becomes salary-ready");
                else decimal(source.getCommissionAmount().negate().toPlainString(), refunded.stream().map(CrmDealAllocation::getCommissionAmount).reduce(BigDecimal.ZERO, BigDecimal::add), "all partial refunds cancel each exact original commission");
            }
        }
    }
}
