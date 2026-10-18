package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.dto.CrmReceivableWriteoffDTO;
import com.cloudflow.crm.domain.vo.CrmDealTeamView;
import com.cloudflow.crm.service.deal.CrmReceivableTeamService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmReceivableTeamDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmReceivableServiceImpl receivables;
    private final CrmReceivableTeamService teams;
    private final TransactionTemplate transactions;
    private final CrmCustomer customer;

    private CrmReceivableTeamDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; receivables = fixture.bean(CrmReceivableServiceImpl.class);
        teams = fixture.bean(CrmReceivableTeamService.class); transactions = fixture.bean(TransactionTemplate.class);
        customer = fixture.customer("receivable team entrypoints");
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount();
        CrmReceivableTeamDatabaseChecks checks = new CrmReceivableTeamDatabaseChecks(fixture);
        checks.defaultsAndHistory(); checks.copySource(); checks.validation(); checks.rollback(); checks.scope(); checks.competition();
        System.out.println("H3_RECEIVABLE_TEAM_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; concurrency_groups=4; mysql=true; transactions=true; team_entrypoints=true; receipt_entrypoints=true; source_contract=database_fixture; hr_http=false; oa_http=false; salary_posting=false; production_modified=false");
    }

    private CrmReceivable draft(Long contractId, String amount) {
        CrmReceivable record = new CrmReceivable(); record.setCustomerId(customer.getCustomerId()); record.setContractId(contractId);
        record.setReceivableName("回款团队 " + UUID.randomUUID()); record.setPlannedAmount(new BigDecimal(amount)); record.setOwnerId(1L);
        return record;
    }

    private CrmReceivable create(Long contractId, String amount) {
        CrmReceivable record = draft(contractId, amount); receivables.createReceivable(record); return current(record);
    }

    private CrmReceivable current(CrmReceivable record) { return receivables.getAccessibleReceivable(record.getReceivableId()); }
    private CrmDealTeamView view(CrmReceivable record) { return teams.read(record.getReceivableId(), null); }
    private CrmDealTeamRequest.Member member(long userId, String role, String percentage) {
        return new CrmDealTeamRequest.Member(userId, role, new BigDecimal(percentage));
    }
    private CrmDealTeamRequest request(CrmDealTeamView previous, CrmDealTeamRequest.Member... members) {
        return new CrmDealTeamRequest(previous.teamVersion(), previous.businessVersion(), List.of(members), "明确调整回款团队");
    }
    private CrmDealTeamView save(CrmReceivable record, CrmDealTeamRequest.Member... members) {
        return teams.save(record.getReceivableId(), request(view(record), members));
    }
    private CrmDealTeamView.Member allocated(CrmDealTeamView team, long userId) {
        return team.members().stream().filter(member -> member.salesUserId() == userId).findFirst().orElseThrow();
    }
    private String ledger(CrmReceivable record) {
        return fixture.jdbc.queryForList("SELECT event.event_id,event.amount,event.team_version,allocation.sales_user_id,allocation.allocated_amount,allocation.commission_status,allocation.comp_change_id FROM crm_deal_event event JOIN crm_deal_allocation allocation ON allocation.event_id=event.event_id AND allocation.tenant_id=event.tenant_id WHERE event.tenant_id=100000 AND event.biz_type='RECEIVABLE' AND event.biz_id=? ORDER BY event.event_id,allocation.sales_user_id", record.getReceivableId()).toString();
    }
    private void receive(CrmReceivable record, String amount) {
        CrmReceivableWriteoffDTO body = new CrmReceivableWriteoffDTO(); body.setVersion(current(record).getVersion());
        body.setAmount(new BigDecimal(amount)); body.setWriteoffDate(LocalDate.now()); receivables.writeoffReceivable(record.getReceivableId(), body);
    }

    private void defaultsAndHistory() {
        CrmReceivable record = create(null, "100.01"); CrmDealTeamView original = view(record);
        equal(0, original.teamVersion(), "unconfigured receivable has default team version zero");
        equal(0, original.businessVersion(), "read does not change business version");
        equal(List.of(0), original.versions(), "default is explicitly selectable");
        equal("CNY", original.currency(), "unbound receivable has explicit CNY denomination");
        equal(1L, original.ownerId(), "default uses trusted plan owner");
        decimal("1", original.members().get(0).allocatedPercentage(), "default owner owns full amount");
        decimal("100.01", original.members().get(0).allocatedAmount(), "default preview uses planned amount");
        equal("[]", ledger(record), "team query creates no cash or allocation facts");
        CrmDealTeamView first = save(record, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"));
        equal(1, first.teamVersion(), "first save creates version one"); equal(1, first.businessVersion(), "team save advances business once");
        decimal("60.01", allocated(first, 1).allocatedAmount(), "owner receives exact cent remainder");
        decimal("40.00", allocated(first, 2).allocatedAmount(), "collaborator amount is exact");
        equal("[]", ledger(record), "saving team does not manufacture receipts");
        receive(record, "30"); String frozen = ledger(record);
        fails(IllegalArgumentException.class, () -> teams.save(record.getReceivableId(), request(first, member(1, "OWNER", "1"))), "receipt version invalidates stale team draft");
        CrmDealTeamView second = save(record, member(1, "OWNER", "0.2"), member(2, "CO_SELLER", "0.8"));
        equal(2, second.teamVersion(), "adjustment creates next full version"); equal(frozen, ledger(record), "new proportions leave old receipt distribution untouched");
        CrmDealTeamView history = teams.read(record.getReceivableId(), 1);
        equal(true, history.historical(), "historical team is explicitly read-only");
        decimal("60.01", allocated(history, 1).allocatedAmount(), "old preview is retained");
        receive(record, "20");
        decimal("18", fixture.jdbc.queryForObject("SELECT allocation.allocated_amount FROM crm_deal_allocation allocation JOIN crm_deal_event event ON event.event_id=allocation.event_id AND event.tenant_id=allocation.tenant_id WHERE event.tenant_id=100000 AND event.biz_type='RECEIVABLE' AND event.biz_id=? AND event.team_version=1 AND allocation.sales_user_id=1", BigDecimal.class, record.getReceivableId()), "first receipt uses original owner split");
        decimal("4", fixture.jdbc.queryForObject("SELECT allocation.allocated_amount FROM crm_deal_allocation allocation JOIN crm_deal_event event ON event.event_id=allocation.event_id AND event.tenant_id=allocation.tenant_id WHERE event.tenant_id=100000 AND event.biz_type='RECEIVABLE' AND event.biz_id=? AND event.team_version=2 AND allocation.sales_user_id=1", BigDecimal.class, record.getReceivableId()), "new receipt uses adjusted owner split");
        String bothReceipts = ledger(record);
        CrmReceivable edit = current(record); edit.setPlannedAmount(new BigDecimal("200.03")); receivables.updateReceivable(edit);
        decimal("40.01", allocated(view(record), 1).allocatedAmount(), "plan edit refreshes current preview only");
        decimal("60.01", allocated(teams.read(record.getReceivableId(), 1), 1).allocatedAmount(), "plan edit preserves earlier preview");
        CrmDealTeamView ownerChange = save(record, member(1, "CO_SELLER", "0.5"), member(2, "OWNER", "0.5"));
        equal(2L, ownerChange.ownerId(), "team entrypoint can change unique plan owner");
        equal(2L, current(record).getOwnerId(), "plan and team owner change atomically");
        equal("CRM user 2", current(record).getOwnerName(), "owner name is resolved from HR");
        equal(bothReceipts, ledger(record), "owner and plan changes preserve all prior cash facts");
        for (int missing : List.of(-1, 0, 4)) fails(IllegalArgumentException.class, () -> teams.read(record.getReceivableId(), missing), "invalid historical version rejected");
    }

    private Long contract(long id, String currency) {
        String number = "H3-RTEAM-" + id;
        fixture.jdbc.update("INSERT INTO oa_contract (contract_id,tenant_id,contract_no,contract_name,counterparty_name,contract_type,customer_id,amount,currency,status,owner_id,owner_name,dept_id,version,deleted) VALUES (?,100000,?,'回款团队来源','测试客户','SALES',?,800,?,'DRAFT',2,'旧合同姓名',100,0,0)", id, number, customer.getCustomerId(), currency);
        RemoteOaService.ContractInfo contract = new RemoteOaService.ContractInfo(); contract.setContractId(id); contract.setContractNo(number);
        contract.setCustomerId(customer.getCustomerId()); fixture.contractDetails.put(id, contract); return id;
    }

    private void sourceTeam(Long id, int version, String ownerShare) {
        transactions.executeWithoutResult(status -> {
            fixture.jdbc.queryForObject("SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND contract_id=? FOR UPDATE", Long.class, id);
            fixture.jdbc.update("UPDATE crm_deal_team SET current_flag=0 WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=? AND current_flag=1", id);
            for (long userId : List.of(1L, 2L)) {
                BigDecimal share = userId == 2 ? new BigDecimal(ownerShare) : BigDecimal.ONE.subtract(new BigDecimal(ownerShare));
                fixture.jdbc.update("INSERT INTO crm_deal_team (tenant_id,biz_type,biz_id,team_version,current_flag,sales_user_id,sales_user_name,dept_id,role_type,allocated_percentage,allocated_amount,commission_rate,commission_amount) VALUES (100000,'CONTRACT',?,?,1,?,'来源团队旧姓名',100,?,?,?,0.1,0)",
                        id, version, userId, userId == 2 ? "OWNER" : "CO_SELLER", share, new BigDecimal("800").multiply(share));
            }
        });
    }

    private void copySource() {
        Long contractId = contract(990201L, "USD"); sourceTeam(contractId, 1, "0.7");
        CrmReceivable record = create(contractId, "100.01"); CrmDealTeamView copied = view(record);
        equal(1, copied.teamVersion(), "copy starts independent receivable team version"); equal(0, copied.businessVersion(), "copy belongs to creation transaction");
        equal(2L, copied.ownerId(), "source owner overrides caller owner"); equal("CRM user 2", current(record).getOwnerName(), "source owner is refreshed from trusted HR");
        equal("USD", copied.currency(), "source contract denomination is explicit and not converted");
        decimal("70.01", allocated(copied, 2).allocatedAmount(), "copied owner preview uses plan amount");
        decimal("30.00", allocated(copied, 1).allocatedAmount(), "copied collaborator preview uses plan amount");
        decimal("0.1", fixture.jdbc.queryForObject("SELECT commission_rate FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=? AND current_flag=1 AND sales_user_id=2", BigDecimal.class, record.getReceivableId()), "approved source rate is copied without exposing client override");
        equal(true, current(record).getBindingLocked(), "copied team makes source binding immutable"); equal("[]", ledger(record), "copy does not create a receipt");
        sourceTeam(contractId, 2, "0.2");
        decimal("0.7", allocated(view(record), 2).allocatedPercentage(), "later source version cannot change copied team");
        CrmReceivable later = create(contractId, "50"); decimal("0.2", allocated(view(later), 2).allocatedPercentage(), "later plan copies latest source version");
        CrmReceivable attached = create(null, "543.21"); CrmReceivable attach = current(attached); attach.setContractId(contractId);
        receivables.updateReceivable(attach); CrmDealTeamView attachedTeam = view(attached);
        equal(1, attachedTeam.businessVersion(), "first association and copied team use one business update"); equal(2L, current(attached).getOwnerId(), "association persists trusted copied owner");
        decimal("108.64", allocated(attachedTeam, 2).allocatedAmount(), "association recalculates preview using latest source proportion");
        Long defaultId = contract(990202L, "EUR"); CrmReceivable defaultCopy = create(defaultId, "25");
        equal(1, view(defaultCopy).teamVersion(), "unconfigured source is explicitly copied as version one");
        equal(2L, view(defaultCopy).ownerId(), "unconfigured source uses contract owner"); decimal("1", view(defaultCopy).members().get(0).allocatedPercentage(), "unconfigured source copies 100 percent owner");
        Long missingSource = contract(990203L, "USD"); fixture.jdbc.update("UPDATE oa_contract SET deleted=1 WHERE contract_id=?", missingSource);
        long before = fixture.scalar("SELECT COUNT(*) FROM crm_receivable");
        fails(IllegalArgumentException.class, () -> create(missingSource, "10"), "stale remote contract cannot bypass locked physical source");
        equal(before, fixture.scalar("SELECT COUNT(*) FROM crm_receivable"), "invalid source leaves no plan");
        fixture.jdbc.update("UPDATE crm_deal_team SET current_flag=0 WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=?", contractId);
        fails(IllegalArgumentException.class, () -> create(contractId, "10"), "missing current source cannot reset to default owner over history");
        equal(before, fixture.scalar("SELECT COUNT(*) FROM crm_receivable"), "missing current source rolls back new plan");
    }

    private void validation() {
        CrmReceivable record = create(null, "100"); CrmDealTeamView original = view(record);
        List<CrmDealTeamRequest> invalid = List.of(
                new CrmDealTeamRequest(null, original.businessVersion(), List.of(member(1, "OWNER", "1")), null),
                new CrmDealTeamRequest(0, null, List.of(member(1, "OWNER", "1")), null),
                request(original, member(1, "CO_SELLER", "1")), request(original, member(1, "OWNER", "0.5"), member(2, "OWNER", "0.5")),
                request(original, member(1, "OWNER", "0.5")), request(original, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.6")),
                request(original, member(1, "OWNER", "0.5"), member(1, "CO_SELLER", "0.5")),
                request(original, member(1, "OWNER", "0.33333"), member(2, "CO_SELLER", "0.66667")),
                request(original, member(1, "OWNER", "-0.1"), member(2, "CO_SELLER", "1.1")),
                new CrmDealTeamRequest(0, 0, List.of(member(1, "OWNER", "1")), "x".repeat(501)), request(original));
        for (CrmDealTeamRequest proposed : invalid) {
            fails(IllegalArgumentException.class, () -> teams.save(record.getReceivableId(), proposed), "invalid full team rejected");
            equal(0, view(record).teamVersion(), "invalid team leaves no version"); equal(0, current(record).getVersion(), "invalid team leaves business unchanged");
        }
        fixture.missingEmployees.add(990299L);
        try { fails(IllegalArgumentException.class, () -> save(record, member(1, "OWNER", "0.5"), member(990299, "CO_SELLER", "0.5")), "missing employee cannot enter team"); }
        finally { fixture.missingEmployees.remove(990299L); }
        fixture.failEmployees = true;
        try { fails(IllegalArgumentException.class, () -> teams.save(record.getReceivableId(), request(original, member(1, "OWNER", "1"))), "unavailable HR cannot accept team"); }
        finally { fixture.failEmployees = false; }
        equal(0, current(record).getVersion(), "unavailable employee verification leaves version unchanged");
        fixture.jdbc.update("UPDATE crm_receivable SET status='CANCELLED' WHERE tenant_id=100000 AND receivable_id=?", record.getReceivableId());
        fails(IllegalArgumentException.class, () -> teams.save(record.getReceivableId(), request(original, member(1, "OWNER", "1"))), "cancelled plan cannot receive team edits");
    }

    private void rollback() {
        CrmReceivable record = create(null, "100"); save(record, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"));
        CrmDealTeamView before = view(record);
        fixture.jdbc.update("UPDATE crm_receivable SET remark='H3_RECEIVABLE_TEAM_ROLLBACK' WHERE tenant_id=100000 AND receivable_id=?", record.getReceivableId());
        fixture.jdbc.execute("CREATE TRIGGER h3_receivable_team_failure BEFORE UPDATE ON crm_receivable FOR EACH ROW BEGIN IF OLD.tenant_id=100000 AND OLD.remark='H3_RECEIVABLE_TEAM_ROLLBACK' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated team rollback'; END IF; END");
        try { fails(RuntimeException.class, () -> save(record, member(2, "OWNER", "1")), "owner write failure rolls back preceding team replacement"); }
        finally { fixture.jdbc.execute("DROP TRIGGER h3_receivable_team_failure"); }
        equal(before.teamVersion(), view(record).teamVersion(), "failed owner write restores current team version");
        equal(before.businessVersion(), current(record).getVersion(), "failed owner write does not consume business version");
        equal(before.members(), view(record).members(), "failed owner write restores complete previous members");
        equal(1L, current(record).getOwnerId(), "failed owner write retains original owner");
    }

    private void scope() {
        CrmReceivable record = create(null, "100"); CrmDealTeamRequest body = request(view(record), member(1, "OWNER", "1"));
        for (long tenantId : List.of(100000L, 100001L)) {
            identity(tenantId, 990298L, tenantId == 100000L ? 4 : 0);
            try {
                fails(IllegalArgumentException.class, () -> teams.read(record.getReceivableId(), null), "tenant and customer scope hide team");
                fails(IllegalArgumentException.class, () -> teams.save(record.getReceivableId(), body), "tenant and customer scope protect team writes");
            } finally { identity(); }
        }
        equal(0, view(record).teamVersion(), "scope failures create no team");
    }

    private int attempt(Runnable action) {
        try { action.run(); return 1; } catch (IllegalArgumentException rejected) { return 0; }
    }
    private int await(CountDownLatch ready, Callable<Integer> action) throws Exception {
        ready.countDown(); if (!ready.await(10, TimeUnit.SECONDS)) throw new AssertionError("team concurrency barrier timed out");
        return action.call();
    }
    private int[] simultaneous(Callable<Integer> first, Callable<Integer> second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2); return fixture.parallel(() -> await(ready, first), () -> await(ready, second));
    }

    private void competition() throws Exception {
        CrmReceivable competing = create(null, "100"); CrmDealTeamView initial = view(competing);
        int[] saves = simultaneous(() -> attempt(() -> teams.save(competing.getReceivableId(), request(initial, member(1, "OWNER", "1")))),
                () -> attempt(() -> teams.save(competing.getReceivableId(), request(initial, member(2, "OWNER", "1")))));
        equal(1, saves[0] + saves[1], "same-version team writers have exactly one winner"); equal(1, view(competing).teamVersion(), "competition creates one complete team version");
        CrmReceivable receiving = create(null, "100"); CrmDealTeamView priorReceipt = view(receiving);
        int[] receipts = simultaneous(() -> attempt(() -> teams.save(receiving.getReceivableId(), request(priorReceipt, member(2, "OWNER", "1")))),
                () -> attempt(() -> receivables.confirmReceipt(receiving.getReceivableId(), priorReceipt.businessVersion())));
        equal(1, receipts[0] + receipts[1], "team edit and versioned receipt cannot both use stale owner");
        equal(1, current(receiving).getVersion(), "receipt and team competition increments once");
        decimal(receipts[1] == 1 ? "100" : "0", current(receiving).getReceivedAmount(), "receipt winner determines cash exactly");
        CrmReceivable editing = create(null, "100"); CrmDealTeamView priorEdit = view(editing);
        CrmReceivable proposed = current(editing); proposed.setPlannedAmount(new BigDecimal("200"));
        int[] edits = simultaneous(() -> attempt(() -> teams.save(editing.getReceivableId(), request(priorEdit, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4")))),
                () -> attempt(() -> receivables.updateReceivable(proposed)));
        equal(1, edits[0] + edits[1], "plan and team edits use a shared version");
        decimal(current(editing).getPlannedAmount().toPlainString(), view(editing).amount(), "competing preview agrees with committed planned amount");
        Long sourceId = contract(990204L, "USD"); sourceTeam(sourceId, 1, "0.7");
        CrmReceivable target = draft(sourceId, "100");
        int[] copies = simultaneous(() -> { receivables.createReceivable(target); return 1; }, () -> { sourceTeam(sourceId, 2, "0.2"); return 1; });
        equal(2, copies[0] + copies[1], "source adjustment and new plan serialize successfully");
        CrmDealTeamView snapshot = view(target); BigDecimal ownerShare = allocated(snapshot, 2).allocatedPercentage();
        check(ownerShare.compareTo(new BigDecimal("0.7")) == 0 || ownerShare.compareTo(new BigDecimal("0.2")) == 0, "copy uses one committed source version");
        decimal(BigDecimal.ONE.subtract(ownerShare).toPlainString(), allocated(snapshot, 1).allocatedPercentage(), "copy never mixes members from different source versions");
        equal(1, snapshot.teamVersion(), "concurrent source copy creates one independent version");
    }
}
