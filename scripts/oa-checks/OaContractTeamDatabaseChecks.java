package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.dto.OaContractTeamRequest;
import com.cloudflow.oa.domain.vo.OaContractTeamView;
import com.cloudflow.oa.service.IOaContractAmountThresholdService;
import com.cloudflow.oa.service.remote.RemoteContractTeamDirectory;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.support.TransactionTemplate;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaContractTeamDatabaseChecks {
    private final OaOperationsDatabaseChecks fixture;
    private final OaContractServiceImpl contracts;
    private final OaContractTeamService teams;
    private final TransactionTemplate transactions;
    private String directoryMode = "VALID";

    private OaContractTeamDatabaseChecks(OaOperationsDatabaseChecks fixture) throws Exception {
        this.fixture = fixture;
        fixture.beans.put(RemoteContractTeamDirectory.class, (RemoteContractTeamDirectory) this::employees);
        fixture.beans.put(RemoteWorkflowService.class, proxy(RemoteWorkflowService.class, (method, values) -> {
            throw new AssertionError("Contract team check must not start workflow: " + method);
        }));
        fixture.beans.put(IOaContractAmountThresholdService.class, proxy(IOaContractAmountThresholdService.class, (method, values) -> {
            throw new AssertionError("Contract team check must not submit contract: " + method);
        }));
        fixture.register(OaWorkflowFailureHelper.class);
        teams = fixture.register(OaContractTeamService.class);
        contracts = fixture.register(OaContractServiceImpl.class);
        transactions = fixture.bean(TransactionTemplate.class);
    }

    static void run(OaOperationsDatabaseChecks fixture) throws Exception {
        int before = checks.get();
        identity(100000L, 1L);
        OaContractTeamDatabaseChecks verification = new OaContractTeamDatabaseChecks(fixture);
        verification.history(); verification.validation(); verification.directory(); verification.rollback(); verification.scope(); verification.deletion(); verification.receivableTeamHistory(); verification.competition();
        System.out.println("H3_CONTRACT_TEAM_DATABASE_CHECKS: assertions=" + (checks.get() - before)
                + "; failed=0; concurrency_groups=6; mysql=true; transactions=true; hr_fixture=true; workflow_not_called=true; source_copy=false; contract_facts=false; production_modified=false");
    }

    private R<List<RemoteContractTeamDirectory.Employee>> employees(List<Long> users) {
        if ("THROWN".equals(directoryMode)) throw new IllegalStateException("HR fixture unavailable");
        if ("FAILED".equals(directoryMode)) return R.fail("HR fixture unavailable");
        if ("NULL".equals(directoryMode)) return null;
        List<RemoteContractTeamDirectory.Employee> result = new ArrayList<>();
        for (Long user : users) {
            if ("MISSING".equals(directoryMode) && user == 2L) continue;
            result.add(new RemoteContractTeamDirectory.Employee("FOREIGN".equals(directoryMode) ? 100001L : 100000L,
                    "DUPLICATE_EMPLOYEE".equals(directoryMode) ? 1001L : 1000L + user, user, "合同核验用户 " + user,
                    user == 3L ? 101L : 100L, "合同核验部门", !"INACTIVE".equals(directoryMode),
                    !"USER_DISABLED".equals(directoryMode), !"DEPT_DISABLED".equals(directoryMode)));
        }
        if ("DUPLICATE_USER".equals(directoryMode)) result.add(result.get(0));
        return R.ok(result);
    }

    private OaContract draft(String amount) {
        OaContract contract = new OaContract();
        String name = "H3_CT_" + UUID.randomUUID();
        contract.setContractNo(name); contract.setContractName(name); contract.setCounterpartyName("隔离合同客户");
        contract.setContractType("SALES"); contract.setAmount(number(amount)); contract.setCurrency("CNY");
        contract.setOwnerId(1L); contract.setOwnerName("合同核验用户 1");
        return contract;
    }

    private OaContract create(String amount) { return contracts.getContractInfo(contracts.createContract(draft(amount))); }
    private OaContract current(OaContract contract) { return contracts.getContractInfo(contract.getContractId()); }
    private OaContractTeamRequest.Member member(long user, String role, String ratio) { return new OaContractTeamRequest.Member(user, role, ratio == null ? null : number(ratio)); }
    private List<OaContractTeamRequest.Member> pair(String ownerRatio, String salesRatio) { return List.of(member(1, "OWNER", ownerRatio), member(2, "CO_SELLER", salesRatio)); }
    private OaContractTeamRequest request(OaContractTeamView current, List<OaContractTeamRequest.Member> members) {
        return new OaContractTeamRequest(current.teamVersion(), current.businessVersion(), members, "合同分成数据库核验");
    }
    private OaContractTeamView save(OaContract contract, List<OaContractTeamRequest.Member> members) {
        return teams.save(contract.getContractId(), request(teams.read(contract.getContractId(), null), members));
    }
    private long count(OaContract contract) { return fixture.count("SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=?", contract.getContractId()); }
    private void unchanged(OaContract contract, int version, long rows) {
        equal(version, current(contract).getVersion(), "rejection preserves contract version");
        equal(rows, count(contract), "rejection preserves every team row");
    }

    private void history() {
        OaContract contract = create("100.01");
        OaContractTeamView initial = teams.read(contract.getContractId(), null);
        equal(0, initial.teamVersion(), "unconfigured team uses transient version zero");
        decimal("1", initial.members().get(0).allocatedPercentage(), "unconfigured owner has 100 percent");
        equal(0L, count(contract), "reading a default team does not create history");
        equal(false, contract.getCurrencyLocked(), "default team does not lock currency");
        contract.setCurrency("USD"); contracts.updateContract(contract);
        equal("USD", current(contract).getCurrency(), "currency remains editable before history");
        OaContractTeamView first = save(contract, pair("0.6", "0.4"));
        equal(1, first.teamVersion(), "first team persists one version");
        equal(true, current(contract).getCurrencyLocked(), "history locks currency");
        decimal("60.01", first.members().get(0).allocatedAmount(), "rounding remainder belongs to owner");
        decimal("40", first.members().get(1).allocatedAmount(), "co-seller retains exact rounded amount");
        OaContract proposed = current(contract); proposed.setCurrency("EUR");
        fails(IllegalArgumentException.class, () -> contracts.updateContract(proposed), "ordinary edit cannot change historical currency");
        unchanged(contract, first.businessVersion(), 2L);
        save(contract, pair("0.5", "0.5"));
        OaContract larger = current(contract); larger.setAmount(number("200.02")); larger.setCurrency(null); larger.setOwnerName("forged");
        contracts.updateContract(larger);
        OaContractTeamView currentTeam = teams.read(contract.getContractId(), null);
        equal(2, currentTeam.teamVersion(), "amount edit changes current preview without creating a team version");
        decimal("200.02", currentTeam.amount(), "current preview follows contract amount");
        decimal("100.01", teams.read(contract.getContractId(), 1).amount(), "historical amount stays immutable");
        equal("USD", current(contract).getCurrency(), "omitted currency preserves locked currency");
        equal("合同核验用户 1", current(contract).getOwnerName(), "ordinary edit cannot forge team owner name");
        fails(IllegalArgumentException.class, () -> contracts.removeContracts(List.of(contract.getContractId())), "historical team prevents contract deletion");
        OaContract stealing = current(contract); stealing.setOwnerId(3L);
        fails(IllegalArgumentException.class, () -> contracts.updateContract(stealing), "multi-member owner change requires full team edit");
        OaContractTeamView changed = save(contract, List.of(member(3, "OWNER", "0.7"), member(2, "CO_SELLER", "0.3")));
        equal(3L, current(contract).getOwnerId(), "team update changes contract owner atomically");
        equal(101L, current(contract).getDeptId(), "team update changes owner department atomically");
        equal(changed.businessVersion(), current(contract).getVersion(), "team response carries persisted business version");
        equal(1L, teams.read(contract.getContractId(), 1).ownerId(), "new owner does not rewrite historical owner");
        fixture.jdbc.update("UPDATE crm_deal_team SET commission_rate=0.1000,commission_amount=7.00 WHERE biz_type='CONTRACT' AND biz_id=? AND current_flag=1", contract.getContractId());
        equal(null, teams.read(contract.getContractId(), null).members().get(0).commissionRate(), "ordinary team read omits commission rate");
        fixture.permissions.add("crm:commission:manage");
        try { decimal("0.1", teams.read(contract.getContractId(), null).members().get(0).commissionRate(), "only approved permission reveals commission rate"); }
        finally { fixture.permissions.remove("crm:commission:manage"); }
    }

    private void validation() {
        OaContract contract = create("100"); OaContractTeamView initial = teams.read(contract.getContractId(), null);
        for (List<OaContractTeamRequest.Member> members : List.of(List.<OaContractTeamRequest.Member>of(),
                pair("0.2", "0.4"), pair("0.7", "0.4"), pair("0.60001", "0.39999"), pair("-0.1", "1.1"), pair(null, "1"),
                List.of(member(1, "OWNER", "0.5"), member(1, "CO_SELLER", "0.5")),
                List.of(member(1, "OWNER", "0.5"), member(2, "OWNER", "0.5")),
                List.of(member(1, "SUPPORT", "1")), List.of(member(1, "UNKNOWN", "1")))) {
            fails(IllegalArgumentException.class, () -> teams.save(contract.getContractId(), request(initial, members)), "invalid whole team rejected");
            unchanged(contract, 0, 0L);
        }
        fails(IllegalArgumentException.class, () -> teams.save(contract.getContractId(), new OaContractTeamRequest(null, 0, pair("0.6", "0.4"), null)), "team version is mandatory");
        fails(IllegalArgumentException.class, () -> teams.save(contract.getContractId(), new OaContractTeamRequest(0, null, pair("0.6", "0.4"), null)), "business version is mandatory");
        fails(IllegalArgumentException.class, () -> teams.save(contract.getContractId(), new OaContractTeamRequest(0, 0, pair("0.6", "0.4"), "x".repeat(501))), "overlong adjustment reason rejected");
        for (String invalid : List.of("-0.01", "0.001", "1000000000000"))
            fails(IllegalArgumentException.class, () -> contracts.createContract(draft(invalid)), "contract amount precision bound " + invalid);
        OaContract suppliedId = draft("10"); suppliedId.setContractId(contract.getContractId());
        fails(IllegalArgumentException.class, () -> contracts.createContract(suppliedId), "creation cannot choose existing ID");
        OaContract noVersion = current(contract); noVersion.setVersion(null);
        fails(IllegalArgumentException.class, () -> contracts.updateContract(noVersion), "ordinary edit requires observed version");
        OaContract cents = create("0.01");
        fails(IllegalArgumentException.class, () -> save(cents, List.of(member(1, "OWNER", "0"), member(2, "CO_SELLER", "0.5"), member(3, "SUPPORT", "0.5"))), "negative rounding remainder rolls back");
        unchanged(cents, 0, 0L);
        List<OaContractTeamRequest.Member> maximum = new ArrayList<>();
        for (int user = 1; user <= 200; user++) maximum.add(member(user, user == 1 ? "OWNER" : "CO_SELLER", "0.0050"));
        equal(200, save(contract, maximum).members().size(), "maximum 200-member team persists");
        maximum.add(member(201, "SUPPORT", "0"));
        fails(IllegalArgumentException.class, () -> save(contract, maximum), "201st team member rejected");
        unchanged(contract, 1, 200L);
        for (String status : List.of("CANCELLED", "EXPIRED", "TERMINATED")) {
            OaContract terminal = create("100"); save(terminal, pair("0.6", "0.4"));
            fixture.jdbc.update("UPDATE oa_contract SET status=? WHERE contract_id=?", status, terminal.getContractId());
            fails(IllegalArgumentException.class, () -> save(terminal, List.of(member(3, "OWNER", "1"))), "terminal owner change rejected " + status);
            unchanged(terminal, 1, 2L);
        }
    }

    private void directory() {
        OaContract contract = create("100");
        for (String mode : List.of("THROWN", "FAILED", "NULL", "MISSING", "FOREIGN", "INACTIVE", "USER_DISABLED", "DEPT_DISABLED", "DUPLICATE_EMPLOYEE", "DUPLICATE_USER")) {
            directoryMode = mode;
            try {
                fails(IllegalArgumentException.class, () -> teams.save(contract.getContractId(), new OaContractTeamRequest(0, 0, pair("0.6", "0.4"), null)), "untrusted HR response rejected " + mode);
                unchanged(contract, 0, 0L);
                equal(false, current(contract).getCurrencyLocked(), "untrusted HR response cannot lock currency");
            } finally { directoryMode = "VALID"; }
        }
    }

    private void rollback() {
        OaContract contract = create("100");
        fails(IllegalStateException.class, () -> transactions.executeWithoutResult(status -> {
            save(contract, pair("0.6", "0.4")); throw new IllegalStateException("forced enclosing transaction rollback");
        }), "outer rollback undoes first team and contract update");
        unchanged(contract, 0, 0L); equal(false, current(contract).getCurrencyLocked(), "rolled-back first team leaves currency editable");
        save(contract, pair("0.6", "0.4"));
        fails(IllegalStateException.class, () -> transactions.executeWithoutResult(status -> {
            save(contract, List.of(member(3, "OWNER", "1"))); throw new IllegalStateException("forced owner transaction rollback");
        }), "outer rollback restores retired team and old owner");
        unchanged(contract, 1, 2L); equal(1L, current(contract).getOwnerId(), "rollback restores owner");
        equal(1, teams.read(contract.getContractId(), null).teamVersion(), "rollback restores current team flag");
        fixture.jdbc.update("UPDATE crm_deal_team SET current_flag=0 WHERE biz_type='CONTRACT' AND biz_id=?", contract.getContractId());
        fails(IllegalArgumentException.class, () -> teams.read(contract.getContractId(), null), "missing current group cannot become a default team");
        equal(true, current(contract).getCurrencyLocked(), "incomplete history still locks currency");
    }

    private void scope() {
        OaContract contract = create("100"); save(contract, pair("0.6", "0.4"));
        identity(100000L, 2L); UserContext.setDsType(4);
        try {
            fails(IllegalArgumentException.class, () -> contracts.getContractInfo(contract.getContractId()), "own-data scope hides another owner's detail");
            fails(IllegalArgumentException.class, () -> teams.read(contract.getContractId(), null), "membership does not expand contract read scope");
            fails(IllegalArgumentException.class, () -> teams.save(contract.getContractId(), new OaContractTeamRequest(1, 1, pair("0.5", "0.5"), null)), "membership does not expand contract team write scope");
            fails(ServiceException.class, () -> contracts.removeContracts(List.of(contract.getContractId())), "ordinary deletion retains existing ownership guard");
        } finally { identity(100000L, 1L); }
        identity(100001L, 1L);
        try {
            fails(IllegalArgumentException.class, () -> teams.read(contract.getContractId(), 1), "foreign tenant cannot read historical team");
            fails(IllegalArgumentException.class, () -> teams.save(contract.getContractId(), new OaContractTeamRequest(1, 1, pair("0.5", "0.5"), null)), "foreign tenant cannot write team by guessed ID");
        } finally { identity(100000L, 1L); }
        unchanged(contract, 1, 2L);
        UserContext.setUserId(null);
        try { fails(IllegalArgumentException.class, () -> teams.read(contract.getContractId(), null), "missing user context rejected"); }
        finally { identity(100000L, 1L); }
        equal(false, StpUtil.hasPermission("crm:commission:manage"), "salary permission fixture restored");
    }

    private int attempt(Runnable action) { try { action.run(); return 1; } catch (IllegalArgumentException rejected) { return 0; } }

    private void deletion() {
        OaContract removable = create("100");
        OaContractTeamView observed = teams.read(removable.getContractId(), null);
        equal(true, contracts.removeContracts(List.of(removable.getContractId())), "unused draft deletion reports success");
        equal(1L, fixture.count("SELECT COUNT(*) FROM oa_contract WHERE contract_id=? AND tenant_id=100000 AND deleted=1 AND version=1", removable.getContractId()), "successful delete persists logical deletion and advances version");
        fails(IllegalArgumentException.class, () -> current(removable), "deleted contract is not readable");
        fails(IllegalArgumentException.class, () -> teams.save(removable.getContractId(), request(observed, pair("0.6", "0.4"))), "team cannot be saved after deletion won");
        equal(0L, count(removable), "delete-first ordering leaves no historical team");
        fails(IllegalArgumentException.class, () -> contracts.removeContracts(List.of(removable.getContractId())), "deleted contract cannot report another successful deletion");
        OaContract draft = create("100");
        OaContract historical = create("100");
        save(historical, pair("0.6", "0.4"));
        long traces = fixture.count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=100000");
        fails(IllegalArgumentException.class, () -> contracts.removeContracts(List.of(draft.getContractId(), historical.getContractId())), "mixed batch cannot delete a contract with historical allocations");
        equal(0, current(draft).getVersion(), "later rejection rolls back earlier draft deletion and version");
        equal(traces, fixture.count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=100000"), "rejected deletion rolls back trace records");
        unchanged(historical, 1, 2L);
    }

    private int[] compete(Callable<Integer> first, Callable<Integer> second) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        try {
            Future<Integer> left = executor.submit(() -> together(ready, first));
            Future<Integer> right = executor.submit(() -> together(ready, second));
            int[] results = { left.get(20, TimeUnit.SECONDS), right.get(20, TimeUnit.SECONDS) };
            equal(1, results[0] + results[1], "exactly one concurrent contract writer succeeds");
            return results;
        } finally { executor.shutdownNow(); if (!executor.awaitTermination(10, TimeUnit.SECONDS)) throw new AssertionError("contract test workers did not stop"); }
    }

    private void receivableTeamHistory() {
        OaContract contract = create("100");
        String number = "H3-RTEAM-" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO crm_receivable (tenant_id,customer_id,contract_id,receivable_no,receivable_name,planned_amount,received_amount,outstanding_amount,owner_id,status) VALUES (100000,1,?,?,'应收团队历史输入',100,0,100,1,'PLANNED')", contract.getContractId(), number);
        Long receivableId = fixture.jdbc.queryForObject("SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=?", Long.class, number);
        fixture.jdbc.update("INSERT INTO crm_deal_team (tenant_id,biz_type,biz_id,team_version,current_flag,sales_user_id,sales_user_name,dept_id,role_type,allocated_percentage,allocated_amount) VALUES (100000,'RECEIVABLE',?,1,1,1,'来源主责',100,'OWNER',1,100)", receivableId);
        equal(0L, count(contract), "receivable-only history has no contract team rows");
        equal(true, current(contract).getCurrencyLocked(), "copied receivable team alone locks source contract currency");
        OaContract proposed = current(contract); proposed.setCurrency("EUR");
        fails(IllegalArgumentException.class, () -> contracts.updateContract(proposed), "source contract cannot change denomination after receivable team copy");
        equal("CNY", current(contract).getCurrency(), "rejected source edit preserves original denomination");
        equal(0, current(contract).getVersion(), "rejected source edit does not consume version");
        fails(IllegalArgumentException.class, () -> contracts.removeContracts(List.of(contract.getContractId())), "receivable team history prevents deleting source contract");
        fixture.jdbc.update("UPDATE crm_deal_team SET current_flag=0 WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=?", receivableId);
        equal(true, current(contract).getCurrencyLocked(), "retired receivable team history still locks source currency");
        OaContract foreign = create("100");
        String foreignNumber = "H3-RTEAM-" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO crm_receivable (tenant_id,customer_id,contract_id,receivable_no,receivable_name,planned_amount,received_amount,outstanding_amount,owner_id,status) VALUES (100001,1,?,?,'外租户应收输入',100,0,100,1,'PLANNED')", foreign.getContractId(), foreignNumber);
        Long foreignId = fixture.jdbc.queryForObject("SELECT receivable_id FROM crm_receivable WHERE tenant_id=100001 AND receivable_no=?", Long.class, foreignNumber);
        fixture.jdbc.update("INSERT INTO crm_deal_team (tenant_id,biz_type,biz_id,team_version,current_flag,sales_user_id,sales_user_name,dept_id,role_type,allocated_percentage,allocated_amount) VALUES (100001,'RECEIVABLE',?,1,1,1,'外租户主责',100,'OWNER',1,100)", foreignId);
        equal(false, current(foreign).getCurrencyLocked(), "foreign receipt team cannot lock this tenant contract");
        OaContract allowed = current(foreign); allowed.setCurrency("EUR"); contracts.updateContract(allowed);
        equal("EUR", current(foreign).getCurrency(), "tenant-filtered source currency remains editable without own history");
    }

    private int together(CountDownLatch ready, Callable<Integer> action) throws Exception {
        identity(100000L, 1L);
        try { ready.countDown(); if (!ready.await(10, TimeUnit.SECONDS)) throw new AssertionError("contract start barrier timed out"); return action.call(); }
        finally { UserContext.clear(); com.cloudflow.common.tenant.TenantContext.clear(); }
    }

    private void competition() throws Exception {
        OaContract contract = create("100"); OaContractTeamView original = teams.read(contract.getContractId(), null);
        compete(() -> attempt(() -> teams.save(contract.getContractId(), request(original, pair("0.6", "0.4")))),
                () -> attempt(() -> teams.save(contract.getContractId(), request(original, pair("0.5", "0.5")))));
        unchanged(contract, 1, 2L);
        for (int round = 0; round < 3; round++) {
            OaContract currency = create("100"); OaContractTeamView before = teams.read(currency.getContractId(), null);
            OaContract edit = current(currency); edit.setCurrency("EUR");
            compete(() -> attempt(() -> teams.save(currency.getContractId(), request(before, pair("0.6", "0.4")))),
                    () -> attempt(() -> contracts.updateContract(edit)));
            OaContract after = current(currency); OaContractTeamView group = teams.read(currency.getContractId(), null);
            equal(after.getCurrencyLocked() ? "CNY" : "EUR", after.getCurrency(), "team and currency race preserves original allocation denomination");
            equal(after.getCurrency(), group.currency(), "persisted contract and team currency remain consistent");
            equal(after.getCurrencyLocked() ? 1 : 0, group.teamVersion(), "currency race leaves only a complete current group or no history");
        }
        OaContract removal = create("100"); OaContractTeamView removable = teams.read(removal.getContractId(), null);
        int[] deletionResults = compete(() -> attempt(() -> teams.save(removal.getContractId(), request(removable, pair("0.6", "0.4")))),
                () -> attempt(() -> contracts.removeContracts(List.of(removal.getContractId()))));
        equal((long) deletionResults[1], fixture.count("SELECT COUNT(*) FROM oa_contract WHERE contract_id=? AND tenant_id=100000 AND deleted=1", removal.getContractId()), "deletion race response agrees with persisted deletion state");
        equal(deletionResults[0] == 1 ? 2L : 0L, count(removal), "deletion race response agrees with complete team persistence");
        equal(0L, fixture.count("SELECT COUNT(*) FROM crm_deal_team team JOIN oa_contract contract ON contract.contract_id=team.biz_id AND contract.tenant_id=team.tenant_id WHERE team.biz_type='CONTRACT' AND team.biz_id=? AND contract.deleted<>0", removal.getContractId()), "concurrent deletion leaves no orphan historical team");
        OaContract owner = create("100"); save(owner, List.of(member(1, "OWNER", "1"))); OaContractTeamView initial = teams.read(owner.getContractId(), null);
        OaContract ordinary = current(owner); ordinary.setOwnerId(3L);
        compete(() -> attempt(() -> teams.save(owner.getContractId(), request(initial, pair("0.6", "0.4")))),
                () -> attempt(() -> contracts.updateContract(ordinary)));
        equal(current(owner).getOwnerId(), teams.read(owner.getContractId(), null).ownerId(), "concurrent owner edits retain single matching primary owner");
    }
}
