package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.crm.domain.CrmDealAllocation;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmDealTeam;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmDealAllocationMapper;
import com.cloudflow.crm.mapper.CrmDealEventMapper;
import com.cloudflow.crm.mapper.CrmDealTeamMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.service.deal.CrmDealLedgerService;
import com.cloudflow.crm.service.deal.CrmDealLedgerService.Fact;
import com.cloudflow.crm.service.deal.CrmDealLedgerService.Reversal;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmDealLedgerDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmDealLedgerService ledger;
    private final TransactionTemplate transactions;
    private final LocalDateTime occurred = LocalDateTime.now().minusMinutes(1).withNano(0);
    private final String prefix = "H3_DEAL_" + UUID.randomUUID().toString().replace("-", "");
    private final List<CrmDealPolicy.Member> members = List.of(CrmDealPolicyChecks.member(1, "OWNER", "0.3333", null),
            CrmDealPolicyChecks.member(2, "CO_SELLER", "0.3333", "0.125"), CrmDealPolicyChecks.member(3, "SUPPORT", "0.3334", "0.0625"));
    private CrmOpportunity business;

    private CrmDealLedgerDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; ledger = fixture.bean(CrmDealLedgerService.class); transactions = fixture.bean(TransactionTemplate.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount();
        CrmDealLedgerDatabaseChecks checks = new CrmDealLedgerDatabaseChecks(fixture);
        checks.business = fixture.opportunity(fixture.customer("h3-deal-ledger"), null, "WON");
        checks.teamConstraints(); checks.facts(); checks.reversals(); checks.competition(); checks.tenants();
        System.out.println("H3_DEAL_LEDGER_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; mysql=true; transactions=true; frozen_allocations=true; business_entrypoints=false; hr_http=false; production_modified=false");
    }

    private Fact fact(String suffix, String amount) {
        return new Fact(prefix + suffix, "WON", "OPPORTUNITY", business.getOpportunityId(), business.getCustomerId(),
                new BigDecimal(amount), "CNY", occurred, 1, "cloudflow-service-crm", business.getVersion(),
                fixture.json.createObjectNode().put("status", "WON").put("sourceId", business.getOpportunityId()), false);
    }

    private CrmDealEvent append(Fact request) {
        return transactions.execute(status -> {
            fixture.mapper(CrmOpportunityMapper.class).lockById(business.getOpportunityId());
            return ledger.append(request, members);
        });
    }

    private List<CrmDealAllocation> entries(Long id) {
        return fixture.mapper(CrmDealAllocationMapper.class).selectList(new LambdaQueryWrapper<CrmDealAllocation>()
                .eq(CrmDealAllocation::getEventId, id).orderByAsc(CrmDealAllocation::getSalesUserId));
    }

    private void teamConstraints() {
        CrmDealTeam member = new CrmDealTeam(); member.setTenantId(100000L); member.setBizType("OPPORTUNITY");
        member.setBizId(business.getOpportunityId()); member.setTeamVersion(1); member.setCurrentFlag(1); member.setSalesUserId(1L);
        member.setSalesUserName("团队主责"); member.setDeptId(100L); member.setRoleType("OWNER"); member.setAllocatedPercentage(BigDecimal.ONE);
        member.setAllocatedAmount(new BigDecimal("100")); member.setCommissionAmount(BigDecimal.ZERO);
        CrmRecordSupport.create(member, "teamId"); fixture.mapper(CrmDealTeamMapper.class).insert(member);
        equal(1L, fixture.mapper(CrmDealTeamMapper.class).selectById(member.getTeamId()).getCurrentMemberId(), "generated current member is populated by MySQL");
        member.setTeamId(null); member.setTeamVersion(2);
        fails(DataIntegrityViolationException.class, () -> fixture.mapper(CrmDealTeamMapper.class).insert(member), "only one current version for each member");
        member.setTeamId(null); member.setCurrentFlag(0); fixture.mapper(CrmDealTeamMapper.class).insert(member);
        member.setTeamId(null); member.setTeamVersion(3); fixture.mapper(CrmDealTeamMapper.class).insert(member);
        equal(3L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_team WHERE biz_id=? AND tenant_id=100000", business.getOpportunityId()), "history versions coexist without replacing prior members");
        member.setTeamId(null); member.setTeamVersion(4); member.setAllocatedPercentage(new BigDecimal("1.0001"));
        constraintViolation(() -> fixture.mapper(CrmDealTeamMapper.class).insert(member), "chk_deal_team_rates", "database rejects excessive allocation ratio");
    }

    private void facts() {
        Fact request = fact("_FACT", "0.05");
        fails(IllegalTransactionStateException.class, () -> ledger.append(request, members), "ledger refuses to run outside business transaction");
        CrmDealEvent event = append(request);
        equal(event.getEventId(), append(request).getEventId(), "exact repeated event returns original identity");
        equal(3, entries(event.getEventId()).size(), "one allocation per frozen member");
        decimal("0.01", entries(event.getEventId()).get(0).getAllocatedAmount(), "owner absorbs cent remainder in real database");
        decimal("0.02", entries(event.getEventId()).get(1).getAllocatedAmount(), "co-seller amount persists precisely");
        equal("NOT_APPLICABLE", entries(event.getEventId()).get(0).getCommissionStatus(), "won cannot create payroll input");
        fails(IllegalArgumentException.class, () -> append(fact("_FACT", "0.06")), "same business key with changed money is rejected");
        Fact changedCurrency = new Fact(request.eventKey(), request.eventType(), request.bizType(), request.bizId(), request.customerId(), request.amount(), "USD", occurred, 1, request.sourceService(), request.sourceVersion(), request.evidence(), false);
        fails(IllegalArgumentException.class, () -> append(changedCurrency), "same key cannot switch currency");
        Fact changedSource = new Fact(request.eventKey(), request.eventType(), request.bizType(), request.bizId(), request.customerId(), request.amount(), "CNY", occurred, 1, request.sourceService(), request.sourceVersion(), fixture.json.createObjectNode().put("status", "CLOSED"), false);
        fails(IllegalArgumentException.class, () -> append(changedSource), "same key with different verified source is rejected");
        fails(IllegalArgumentException.class, () -> transactions.execute(status -> ledger.append(request, List.of(CrmDealPolicyChecks.member(1, "OWNER", "1", null)))), "same key cannot silently adopt new team");
        decimal("0.05", ledger.find(request.eventKey()).getAmount(), "failed repeats leave original amount unchanged");
        fails(IllegalStateException.class, () -> transactions.execute(status -> { ledger.append(fact("_ROLLBACK", "10"), members); throw new IllegalStateException("rollback fixture"); }), "later business failure rolls back ledger and allocation");
        equal(null, ledger.find(prefix + "_ROLLBACK"), "failed business leaves no event");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_allocation allocation LEFT JOIN crm_deal_event event ON event.event_id=allocation.event_id AND event.tenant_id=allocation.tenant_id WHERE event.event_id IS NULL"), "no orphan allocations after rollback");
        CrmDealEvent invalid = new CrmDealEvent(); BeanUtils.copyProperties(event, invalid); invalid.setEventId(null);
        invalid.setEventKey(prefix + "_NEGATIVE"); invalid.setAmount(new BigDecimal("-0.01"));
        constraintViolation(() -> fixture.mapper(CrmDealEventMapper.class).insert(invalid), "chk_deal_event_amount", "database forbids a negative original fact");
    }

    private void reversals() {
        CrmDealEvent original = append(fact("_REVERSIBLE", "100.01"));
        String sourceBefore = ledger.find(original.getEventKey()).getSourceSnapshot();
        Reversal request = new Reversal(original.getEventId(), prefix + "_REVERSE", occurred.plusSeconds(1), "cloudflow-service-crm", 2,
                "核对原始业务后全额冲正", fixture.json.createObjectNode().put("originalEventId", original.getEventId()));
        Reversal foreignSource = new Reversal(original.getEventId(), prefix + "_WRONG_SOURCE", request.occurredTime(),
                "cloudflow-service-oa", 2, request.reason(), request.evidence());
        fails(IllegalArgumentException.class, () -> transactions.execute(status -> ledger.reverse(foreignSource)), "OA cannot reverse a CRM won fact");
        equal(null, ledger.find(foreignSource.eventKey()), "rejected foreign source leaves no reversal");
        CrmDealEvent reversed = transactions.execute(status -> ledger.reverse(request));
        decimal("-100.01", reversed.getAmount(), "reversal is exact negative original amount");
        equal(original.getEventId(), reversed.getReversalOfId(), "reversal links original fact");
        equal(original.getTeamVersion(), reversed.getTeamVersion(), "reversal retains original team version");
        equal(sourceBefore, ledger.find(original.getEventKey()).getSourceSnapshot(), "reversal never overwrites original source snapshot");
        List<CrmDealAllocation> before = entries(original.getEventId()); List<CrmDealAllocation> after = entries(reversed.getEventId());
        for (int index = 0; index < before.size(); index++) {
            equal(before.get(index).getAllocationId(), after.get(index).getReversalOfId(), "member reversal references original allocation");
            decimal(before.get(index).getAllocatedAmount().negate().toPlainString(), after.get(index).getAllocatedAmount(), "each exact frozen amount is reversed without recalculation");
            equal(before.get(index).getDeptId(), after.get(index).getDeptId(), "original department remains frozen");
        }
        equal(reversed.getEventId(), transactions.execute(status -> ledger.reverse(request)).getEventId(), "same reversal is idempotent");
        Reversal secondKey = new Reversal(original.getEventId(), prefix + "_REVERSE_AGAIN", request.occurredTime(), request.sourceService(), request.sourceVersion(), request.reason(), request.evidence());
        fails(IllegalArgumentException.class, () -> transactions.execute(status -> ledger.reverse(secondKey)), "new request key cannot reverse one fact twice");
        Reversal reverseReversal = new Reversal(reversed.getEventId(), prefix + "_DOUBLE_NEGATIVE", request.occurredTime(), request.sourceService(), 3, request.reason(), request.evidence());
        fails(IllegalArgumentException.class, () -> transactions.execute(status -> ledger.reverse(reverseReversal)), "reversals cannot be reused as original facts");
        decimal("0", before.stream().map(CrmDealAllocation::getAllocatedAmount).reduce(BigDecimal.ZERO, BigDecimal::add)
                .add(after.stream().map(CrmDealAllocation::getAllocatedAmount).reduce(BigDecimal.ZERO, BigDecimal::add)), "original and reverse allocation sums cancel exactly");
    }

    private void competition() throws Exception {
        Fact request = fact("_CONCURRENT", "15.37");
        int[] duplicates = fixture.parallel(() -> { append(request); return 1; }, () -> { append(request); return 1; });
        equal(2, duplicates[0] + duplicates[1], "concurrent identical calls both resolve successfully");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE event_key=? AND tenant_id=100000", request.eventKey()), "concurrent duplicate produces one physical fact");
        equal(3, entries(ledger.find(request.eventKey()).getEventId()).size(), "concurrent duplicate produces only one member set");
        int[] conflict = fixture.parallel(() -> attempt(fact("_CONFLICT", "11")), () -> attempt(fact("_CONFLICT", "12")));
        equal(1, conflict[0] + conflict[1], "same-source competing payload has exactly one winner");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE event_key=? AND tenant_id=100000", prefix + "_CONFLICT"), "conflicting payload never creates second fact");
    }

    private int attempt(Fact request) { try { append(request); return 1; } catch (CrmBusinessException rejected) { return 0; } }

    private void constraintViolation(Runnable operation, String constraint, String label) {
        try { operation.run(); }
        catch (DataAccessException rejected) {
            Throwable cause = rejected.getMostSpecificCause();
            check(cause instanceof SQLException sql && sql.getErrorCode() == 3819 && sql.getMessage().contains(constraint), label);
            return;
        }
        throw new AssertionError(label + ": MySQL accepted an invalid value");
    }

    private void tenants() {
        CrmDealEvent original = ledger.find(prefix + "_FACT");
        identity(100001L, 1L, 0);
        try {
            equal(null, ledger.find(original.getEventKey()), "tenant interceptor hides foreign event keys");
            Reversal foreign = new Reversal(original.getEventId(), prefix + "_FOREIGN", occurred, "cloudflow-service-crm", 2, "越租户请求", fixture.json.createObjectNode().put("originalEventId", original.getEventId()));
            fails(IllegalArgumentException.class, () -> transactions.execute(status -> ledger.reverse(foreign)), "foreign original cannot be reversed by numeric ID");
            equal(0, entries(original.getEventId()).size(), "foreign allocation list is tenant-filtered");
        } finally { identity(); }
    }
}
