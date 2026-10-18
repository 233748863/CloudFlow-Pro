package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.CrmDealTeam;
import com.cloudflow.crm.service.deal.CrmDealHandoverPolicy;
import com.cloudflow.crm.service.deal.CrmDealMemberResolver;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmDealHandoverPolicyChecks {
    static void run() {
        int before = assertionCount();
        List<CrmDealTeam> original = List.of(row(11L, "OWNER", "0.5"), row(12L, "CO_SELLER", "0.3"), row(13L, "SUPPORT", "0.2"));
        List<CrmDealMemberResolver.Assignment> merged = CrmDealHandoverPolicy.transfer(original, 11L, 12L);
        equal(2, merged.size(), "handover removes departing owner rather than duplicating successor");
        decimal("0.8", member(merged, 12L).percentage(), "existing successor receives sum of both ratios");
        equal("OWNER", member(merged, 12L).role(), "existing successor becomes sole owner");
        equal(null, member(merged, 12L).commissionRate(), "changed successor rate requires new confirmation");
        decimal("0.2", member(merged, 13L).percentage(), "other member ratio is unchanged");
        decimal("0.1", member(merged, 13L).commissionRate(), "other member confirmed rate is unchanged");
        decimal("0.5", original.get(0).getAllocatedPercentage(), "input owner snapshot remains unchanged");
        equal("CO_SELLER", original.get(1).getRoleType(), "input successor role remains unchanged");
        List<CrmDealMemberResolver.Assignment> replaced = CrmDealHandoverPolicy.transfer(original, 11L, 14L);
        equal(3, replaced.size(), "new successor replaces departing owner without changing others");
        decimal("0.5", member(replaced, 14L).percentage(), "new successor inherits only departing ratio");
        decimal("0.3", member(replaced, 12L).percentage(), "existing collaborator share stays unchanged for new successor");
        List<CrmDealMemberResolver.Assignment> baseline = CrmDealHandoverPolicy.transfer(List.of(), 11L, 12L);
        decimal("1", baseline.get(0).percentage(), "unconfigured team defaults to 100 percent new owner");
        fails(IllegalArgumentException.class, () -> CrmDealHandoverPolicy.transfer(original, 11L, 11L), "self handover is rejected");
        fails(IllegalArgumentException.class, () -> CrmDealHandoverPolicy.transfer(original, null, 12L), "missing departing owner is rejected");
        fails(IllegalArgumentException.class, () -> CrmDealHandoverPolicy.transfer(original, 11L, 0L), "invalid successor is rejected");
        fails(IllegalArgumentException.class, () -> CrmDealHandoverPolicy.transfer(null, 11L, 12L), "missing team data cannot masquerade as unconfigured team");
        fails(IllegalArgumentException.class, () -> CrmDealHandoverPolicy.transfer(original, 99L, 12L), "actual team owner must match departing owner");
        fails(IllegalArgumentException.class, () -> CrmDealHandoverPolicy.transfer(Arrays.asList(original.get(0), null), 11L, 12L), "null member is rejected");
        fails(IllegalArgumentException.class, () -> CrmDealHandoverPolicy.transfer(List.of(row(11L, "OWNER", "0.5"), row(11L, "SUPPORT", "0.5")), 11L, 12L), "duplicate departing identity cannot silently lose allocation");
        fails(IllegalArgumentException.class, () -> CrmDealHandoverPolicy.transfer(List.of(row(11L, "OWNER", "0.5"), row(12L, "CO_SELLER", "0.2")), 11L, 12L), "malformed original total is rejected before merging");
        fails(IllegalArgumentException.class, () -> CrmDealHandoverPolicy.transfer(List.of(row(11L, "OWNER", "0.5"), row(12L, "OWNER", "0.5")), 11L, 12L), "malformed original owners are rejected");
        List<CrmDealTeam> maximum = new ArrayList<>();
        for (long userId = 1; userId <= 200; userId++) maximum.add(row(userId, userId == 1 ? "OWNER" : "SUPPORT", "0.005"));
        for (long successor = 2; successor <= 200; successor++) {
            List<CrmDealMemberResolver.Assignment> result = CrmDealHandoverPolicy.transfer(maximum, 1L, successor);
            equal(199, result.size(), "maximum-size handover removes exactly one identity");
            decimal("0.01", member(result, successor).percentage(), "maximum-size handover sums exact decimals");
            decimal("1", result.stream().map(CrmDealMemberResolver.Assignment::percentage).reduce(BigDecimal.ZERO, BigDecimal::add), "maximum-size handover preserves total");
            equal(1L, result.stream().filter(member -> "OWNER".equals(member.role())).count(), "maximum-size handover retains a unique owner");
        }
        System.out.println("H3_HANDOVER_POLICY_CHECKS: assertions=" + (assertionCount() - before) + "; failed=0; database=false; http=false");
    }

    private static CrmDealTeam row(Long userId, String role, String percentage) {
        CrmDealTeam row = new CrmDealTeam(); row.setSalesUserId(userId); row.setRoleType(role);
        row.setAllocatedPercentage(new BigDecimal(percentage)); row.setCommissionRate(new BigDecimal("0.1")); return row;
    }

    private static CrmDealMemberResolver.Assignment member(List<CrmDealMemberResolver.Assignment> rows, Long userId) {
        return rows.stream().filter(member -> userId.equals(member.userId())).findFirst().orElseThrow();
    }
}
