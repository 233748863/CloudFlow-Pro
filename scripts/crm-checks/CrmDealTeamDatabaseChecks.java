package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.vo.CrmDealTeamView;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.service.deal.CrmOpportunityTeamService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityWriteService;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmDealTeamDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmOpportunityTeamService teams;
    private final CrmOpportunityServiceImpl opportunities;
    private final CrmOpportunityWriteService writes;

    private CrmDealTeamDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; teams = fixture.bean(CrmOpportunityTeamService.class);
        opportunities = fixture.bean(CrmOpportunityServiceImpl.class); writes = fixture.bean(CrmOpportunityWriteService.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount();
        CrmDealTeamDatabaseChecks checks = new CrmDealTeamDatabaseChecks(fixture);
        checks.defaultAndHistory(); checks.membershipValidation(); checks.ownerConsistency(); checks.wonFacts(); checks.competition(); checks.scope();
        System.out.println("H3_DEAL_TEAM_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; mysql=true; opportunity_entrypoints=true; versioned_teams=true; won_fact=true; hr=interface_double; http=false; production_modified=false");
    }

    private CrmOpportunity create() {
        CrmOpportunity request = new CrmOpportunity(); request.setCustomerId(fixture.customer("h3-team").getCustomerId());
        request.setOpportunityName("团队业务验收"); request.setExpectedAmount(new BigDecimal("100.01"));
        request.setExpectedSignDate(LocalDate.now().plusDays(10)); request.setOwnerId(1L);
        opportunities.createOpportunity(request); return request;
    }

    private CrmOpportunity entity(Long id) { return fixture.mapper(CrmOpportunityMapper.class).selectById(id); }
    private CrmDealTeamRequest.Member member(long userId, String role, String percentage) { return new CrmDealTeamRequest.Member(userId, role, new BigDecimal(percentage)); }
    private CrmDealTeamRequest request(CrmDealTeamView current, CrmDealTeamRequest.Member... members) {
        return new CrmDealTeamRequest(current.teamVersion(), current.businessVersion(), List.of(members), "核对团队分配");
    }

    private void defaultAndHistory() {
        CrmOpportunity opportunity = create(); Long id = opportunity.getOpportunityId();
        CrmDealTeamView original = teams.read(id, null);
        equal(0, original.businessVersion(), "default team is created inside initial business transaction without artificial edit version");
        equal(1, original.teamVersion(), "new business has first physical team version");
        equal(1, original.members().size(), "default has exactly one owner");
        decimal("1", original.members().get(0).allocatedPercentage(), "default owner receives 100 percent");
        decimal("100.01", original.members().get(0).allocatedAmount(), "default preview uses actual business money");
        CrmDealTeamView saved = teams.save(id, request(original, member(1, "OWNER", "0.6000"), member(2, "CO_SELLER", "0.4000")));
        equal(2, saved.teamVersion(), "whole-team save creates new version"); equal(1, saved.businessVersion(), "team edit increments actual business version");
        equal(List.of(2, 1), saved.versions(), "history preserves each version");
        decimal("60.01", saved.members().get(0).allocatedAmount(), "owner cent amount persists");
        decimal("40.00", saved.members().get(1).allocatedAmount(), "co-seller amount persists");
        equal(1, teams.read(id, 1).members().size(), "old whole-team version is retained");
        equal(true, teams.read(id, 1).historical(), "history is explicitly labelled");
        fails(IllegalArgumentException.class, () -> teams.read(id, 0), "nonexistent baseline cannot hide version history");
        fails(IllegalArgumentException.class, () -> teams.save(id, request(original, member(1, "OWNER", "1"))), "stale team and business version are rejected");
        fixture.jdbc.update("UPDATE crm_deal_team SET commission_rate=0.1250, commission_amount=7.50 WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=? AND current_flag=1 AND sales_user_id=1", id);
        JsonNode privateView = fixture.json.valueToTree(teams.read(id, null));
        equal(false, privateView.path("members").get(0).has("commissionRate"), "no payroll permission hides commission rate field");
        equal(false, privateView.path("members").get(0).has("commissionAmount"), "no payroll permission hides commission amount field");
        CrmDealTeamView beforeRollback = teams.read(id, null);
        fails(IllegalStateException.class, () -> fixture.bean(TransactionTemplate.class).execute(status -> {
            teams.save(id, request(beforeRollback, member(1, "OWNER", "1"))); throw new IllegalStateException("team rollback fixture");
        }), "business failure rolls back new team and retirement together");
        equal(beforeRollback.teamVersion(), teams.read(id, null).teamVersion(), "rollback leaves old current version intact");
        CrmOpportunity update = entity(id); update.setExpectedAmount(new BigDecimal("200.03"));
        opportunities.updateOpportunity(update);
        CrmDealTeamView refreshed = teams.read(id, null);
        equal(2, refreshed.teamVersion(), "amount preview refresh does not overwrite old whole-team versions");
        decimal("200.03", refreshed.amount(), "generic business edit refreshes current team amount");
        decimal("100.01", teams.read(id, 1).amount(), "old team preview remains frozen after business amount update");
    }

    private void membershipValidation() {
        Long id = create().getOpportunityId(); CrmDealTeamView current = teams.read(id, null);
        fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.3"))), "total below 100 percent is rejected");
        fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "0.6"), member(2, "OWNER", "0.4"))), "two owners are rejected");
        fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "SUPPORT", "1"))), "missing owner is rejected");
        fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "0.6"), member(1, "CO_SELLER", "0.4"))), "duplicate account is rejected");
        fixture.failEmployees = true;
        try { fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "1"))), "HR outage cannot be accepted as a saved team"); }
        finally { fixture.failEmployees = false; }
        HrEmployeeSummaryVO employee = fixture.employee(2L); fixture.employeeDirectory.put(2L, employee);
        try {
            employee.setTenantId(100001L);
            fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"))), "HR result must carry matching tenant");
            employee.setTenantId(100000L); employee.setActive(false);
            fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"))), "departed employee cannot join team");
            employee.setActive(true); employee.setUserEnabled(false);
            fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"))), "disabled login cannot join team");
            employee.setUserEnabled(true); employee.setDepartmentEnabled(false);
            fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"))), "disabled department cannot join team");
            employee.setDepartmentEnabled(true); employee.setEmployeeId(1L);
            fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"))), "two users cannot represent one employee");
        } finally { fixture.employeeDirectory.remove(2L); }
        equal(current.teamVersion(), teams.read(id, null).teamVersion(), "invalid teams do not consume version");
        CrmDealTeamView multiple = teams.save(id, request(current, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4")));
        fixture.missingEmployees.add(2L);
        try {
            CrmDealTeamView repaired = teams.save(id, request(multiple, member(1, "OWNER", "1")));
            equal(1, repaired.members().size(), "authorized editor can remove a departed or missing old member");
        } finally { fixture.missingEmployees.clear(); }
    }

    private void ownerConsistency() {
        Long id = create().getOpportunityId();
        CrmDealTeamView multiple = teams.save(id, request(teams.read(id, null), member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4")));
        CrmOpportunity forged = entity(id); forged.setOwnerId(2L);
        fails(IllegalArgumentException.class, () -> opportunities.updateOpportunity(forged), "generic edit cannot silently replace owner of multi-person team");
        equal(1L, entity(id).getOwnerId(), "rejected owner reassignment leaves original owner");
        CrmDealTeamView assigned = teams.save(id, request(multiple, member(1, "CO_SELLER", "0.6"), member(2, "OWNER", "0.4")));
        equal(2L, assigned.ownerId(), "explicit whole-team owner is applied");
        equal(2L, entity(id).getOwnerId(), "business owner and team owner commit together");
        equal("CRM user 2", entity(id).getOwnerName(), "owner name comes from verified directory");
        CrmCustomer handedCustomer = fixture.mapper(CrmCustomerMapper.class).selectById(entity(id).getCustomerId());
        handedCustomer.setOwnerId(2L); fixture.mapper(CrmCustomerMapper.class).updateById(handedCustomer);
        identity(100000L, 1L, 4);
        try {
            fails(IllegalArgumentException.class, () -> teams.save(id, request(assigned, member(1, "OWNER", "1"))), "former customer owner with self-only data scope cannot retain opportunity access after customer handover");
        } finally { identity(); }
        CrmDealTeamView managed = teams.save(id, request(assigned, member(1, "CO_SELLER", "0.5"), member(2, "OWNER", "0.5")));
        equal(2L, managed.ownerId(), "authorized full-scope team manager can maintain another owner's opportunity");
        fails(ServiceException.class, () -> opportunities.updateOpportunity(entity(id)), "ordinary opportunity editing retains owner-only restriction");
    }

    private void wonFacts() {
        Long id = create().getOpportunityId();
        CrmDealTeamView team = teams.save(id, request(teams.read(id, null), member(1, "OWNER", "0.75"), member(2, "CO_SELLER", "0.25")));
        CrmOpportunity won = writes.win(id, null, team.businessVersion());
        equal("WON", won.getStage(), "real business win reaches terminal stage");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=? AND event_type='WON'", id), "real win inserts one persistent event");
        Long eventId = fixture.jdbc.queryForObject("SELECT event_id FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=? AND event_type='WON'", Long.class, id);
        decimal("75.01", fixture.jdbc.queryForObject("SELECT allocated_amount FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=? AND sales_user_id=1", BigDecimal.class, eventId), "real won fact applies owner percentage and cents");
        decimal("25.00", fixture.jdbc.queryForObject("SELECT allocated_amount FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=? AND sales_user_id=2", BigDecimal.class, eventId), "real won fact applies co-seller percentage");
        equal(2L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_allocation WHERE event_id=? AND commission_status='NOT_APPLICABLE' AND commission_amount IS NULL", eventId), "won does not manufacture receipt commissions");
        writes.win(id, null, won.getVersion());
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=? AND event_type='WON'", id), "repeat won action does not duplicate fact");
        CrmDealTeamView current = teams.read(id, null);
        fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(2, "OWNER", "1"))), "team maintenance cannot bypass closed-business owner restrictions");
        teams.save(id, request(current, member(1, "OWNER", "0.5"), member(2, "CO_SELLER", "0.5")));
        decimal("75.01", fixture.jdbc.queryForObject("SELECT allocated_amount FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=? AND sales_user_id=1", BigDecimal.class, eventId), "later team version never rewrites past won allocation");
        equal(team.teamVersion(), fixture.jdbc.queryForObject("SELECT team_version FROM crm_deal_event WHERE event_id=?", Integer.class, eventId), "won keeps team version at occurrence");
    }

    private void competition() throws Exception {
        Long id = create().getOpportunityId(); CrmDealTeamView original = teams.read(id, null);
        CrmDealTeamRequest left = request(original, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"));
        CrmDealTeamRequest right = request(original, member(1, "OWNER", "0.7"), member(3, "SUPPORT", "0.3"));
        int[] winners = fixture.parallel(() -> attempt(id, left), () -> attempt(id, right));
        equal(1, winners[0] + winners[1], "concurrent whole-team replacement has exactly one winner");
        equal(2L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=? AND current_flag=1", id), "concurrent replacement cannot mix member sets");
        equal(1L, fixture.scalar("SELECT COUNT(DISTINCT team_version) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=? AND current_flag=1", id), "only one current team version remains");
        equal(2, entity(id).getTeamVersion(), "business points to exactly the winning team version");
    }

    private int attempt(Long id, CrmDealTeamRequest request) {
        try { teams.save(id, request); return 1; } catch (IllegalArgumentException rejected) { return 0; }
    }

    private void scope() {
        Long id = create().getOpportunityId();
        CrmDealTeamView current = teams.save(id, request(teams.read(id, null), member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4")));
        identity(100000L, 2L, 4);
        try {
            fails(IllegalArgumentException.class, () -> teams.read(id, null), "membership does not grant customer data access");
            fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(2, "OWNER", "1"))), "member cannot take over an inaccessible business");
        } finally { identity(); }
        identity(100001L, 1L, 0);
        try {
            fails(IllegalArgumentException.class, () -> teams.read(id, 1), "historical teams remain tenant isolated");
            fails(IllegalArgumentException.class, () -> teams.save(id, request(current, member(1, "OWNER", "1"))), "foreign tenant cannot replace team");
        } finally { identity(); }
    }
}
