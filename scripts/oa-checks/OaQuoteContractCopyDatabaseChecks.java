package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.vo.OaContractTeamView;
import com.cloudflow.oa.service.remote.RemoteContractTeamDirectory;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.support.TransactionTemplate;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaQuoteContractCopyDatabaseChecks {
    private final OaOperationsDatabaseChecks fixture;
    private final OaContractServiceImpl contracts;
    private final OaContractTeamService teams;
    private final TransactionTemplate transactions;
    private boolean directoryUnavailable;

    private record Source(Long id, Long customerId, String currency, Integer version) { }

    private OaQuoteContractCopyDatabaseChecks(OaOperationsDatabaseChecks fixture) throws Exception {
        this.fixture = fixture;
        fixture.beans.put(RemoteContractTeamDirectory.class, (RemoteContractTeamDirectory) users -> directoryUnavailable ? R.fail("isolated unavailable HR")
                : R.ok(users.stream().map(user -> new RemoteContractTeamDirectory.Employee(100000L, 1000L + user, user,
                    "来源核验用户 " + user, 100L, "来源核验部门", true, true, true)).toList()));
        teams = fixture.register(OaContractTeamService.class);
        contracts = fixture.register(OaContractServiceImpl.class);
        transactions = fixture.bean(TransactionTemplate.class);
    }

    static void run(OaOperationsDatabaseChecks fixture) throws Exception {
        int before = checks.get(); identity(100000L, 1L);
        OaQuoteContractCopyDatabaseChecks verification = new OaQuoteContractCopyDatabaseChecks(fixture);
        verification.copyAndReplay(); verification.defaultOwner(); verification.validationAndScope(); verification.rollback(); verification.competition();
        System.out.println("H3_QUOTE_CONTRACT_COPY_OA_DATABASE_CHECKS: assertions=" + (checks.get() - before)
                + "; failed=0; concurrency_groups=1; mysql=true; transactions=true; contract_entrypoint=true; quote_source=database_fixture; hr=interface_double; salary_posting=false; production_modified=false");
    }

    private Source source() {
        String marker = "QC_" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO crm_customer (tenant_id,customer_code,customer_name,owner_id,dept_id,status,deleted) VALUES (100000,?,'可信来源客户',1,100,'ACTIVE',0)", marker);
        Long customerId = fixture.jdbc.queryForObject("SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=?", Long.class, marker);
        fixture.jdbc.update("INSERT INTO crm_quote (tenant_id,quote_no,quote_name,customer_id,customer_name,total_amount,currency,status,owner_id,owner_name,version,deleted) VALUES (100000,?,'可信来源报价',?,'旧客户名',100.01,'CNY','DRAFT',2,'旧主责名',0,0)", marker, customerId);
        Long quoteId = fixture.jdbc.queryForObject("SELECT quote_id FROM crm_quote WHERE tenant_id=100000 AND quote_no=?", Long.class, marker);
        return current(quoteId);
    }

    private Source current(Long id) {
        return fixture.jdbc.queryForObject("SELECT quote_id,customer_id,currency,version FROM crm_quote WHERE quote_id=? AND tenant_id=100000",
                (row, index) -> new Source(row.getLong(1), row.getLong(2), row.getString(3), row.getInt(4)), id);
    }

    private void sourceTeam(Source source, int version, String share) {
        transactions.executeWithoutResult(status -> {
            fixture.jdbc.queryForObject("SELECT quote_id FROM crm_quote WHERE tenant_id=100000 AND quote_id=? FOR UPDATE", Long.class, source.id());
            fixture.jdbc.update("UPDATE crm_deal_team SET current_flag=0 WHERE tenant_id=100000 AND biz_type='QUOTE' AND biz_id=?", source.id());
            for (long user : List.of(1L, 2L)) {
                BigDecimal percentage = user == 2 ? number(share) : BigDecimal.ONE.subtract(number(share));
                fixture.jdbc.update("INSERT INTO crm_deal_team (tenant_id,biz_type,biz_id,team_version,current_flag,sales_user_id,sales_user_name,dept_id,role_type,allocated_percentage,allocated_amount,commission_rate,commission_amount) VALUES (100000,'QUOTE',?,?,1,?,'旧来源姓名',100,?,?,0,0.1,0)",
                        source.id(), version, user, user == 2 ? "OWNER" : "CO_SELLER", percentage);
            }
            fixture.jdbc.update("UPDATE crm_quote SET version=version+1 WHERE tenant_id=100000 AND quote_id=?", source.id());
        });
    }

    private OaContract draft(Source source) {
        OaContract draft = new OaContract();
        draft.setContractNo("QC_" + UUID.randomUUID()); draft.setContractName("来源报价合同"); draft.setCounterpartyName("可信来源客户");
        draft.setContractType("SALES"); draft.setCustomerId(source.customerId()); draft.setCustomerName("客户端伪造客户");
        draft.setSourceType("CRM_QUOTE"); draft.setSourceId(source.id()); draft.setSourceVersion(source.version());
        draft.setAmount(number("100.01")); draft.setCurrency(source.currency()); draft.setOwnerId(1L); draft.setOwnerName("客户端伪造主责");
        return draft;
    }

    private long count(Source source) { return fixture.count("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_QUOTE' AND source_id=?", source.id()); }

    private void copyAndReplay() {
        Source source = source(); sourceTeam(source, 3, "0.6"); source = current(source.id());
        Long id = contracts.createContract(draft(source)); OaContract contract = contracts.getContractInfo(id); OaContractTeamView team = teams.read(id, null);
        equal(1, team.teamVersion(), "contract gets its own first version, not source version three"); equal(0, team.businessVersion(), "source copy is part of creation");
        equal(2L, contract.getOwnerId(), "source owner overrides supplied owner"); equal("来源核验用户 2", contract.getOwnerName(), "source owner is verified with HR");
        equal("可信来源客户", contract.getCustomerName(), "current customer snapshot replaces supplied name");
        equal(true, contract.getCurrencyLocked(), "copied team immediately locks contract currency");
        decimal("60.01", team.members().stream().filter(member -> member.salesUserId() == 2L).findFirst().orElseThrow().allocatedAmount(), "source percentage is applied to actual target amount");
        equal(true, team.members().stream().allMatch(member -> member.commissionRate() == null && member.commissionAmount() == null), "non-payroll read hides copied real commission fields");
        decimal("0.1", fixture.jdbc.queryForObject("SELECT commission_rate FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=? AND sales_user_id=2", BigDecimal.class, id), "trusted source rate is preserved privately");
        String frozen = team.members().toString(); long events = fixture.count("SELECT COUNT(*) FROM outbox_event");
        sourceTeam(source, 4, "0.2");
        directoryUnavailable = true;
        try { equal(id, contracts.createContract(draft(current(source.id()))), "replay returns prior contract without revalidating or replacing its frozen team"); }
        finally { directoryUnavailable = false; }
        equal(1L, count(source), "replay never duplicates contract"); equal(events, fixture.count("SELECT COUNT(*) FROM outbox_event"), "replay does not publish another creation event");
        equal(frozen, teams.read(id, null).members().toString(), "later source changes do not overwrite copied members or previews");
        equal(0L, fixture.count("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=?", id), "draft copy does not manufacture effective-contract performance");
    }

    private void defaultOwner() {
        Source source = source(); Long id = contracts.createContract(draft(source)); OaContractTeamView team = teams.read(id, null);
        equal(1, team.teamVersion(), "source without configured team is copied explicitly"); equal(1, team.members().size(), "default copy contains only the source owner");
        equal(2L, team.ownerId(), "default copy uses quote owner"); decimal("1", team.members().get(0).allocatedPercentage(), "default owner has 100 percent");
        equal(0L, fixture.count("SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='QUOTE' AND biz_id=?", source.id()), "copy does not invent source quote team history");
    }

    private void validationAndScope() {
        Source source = source(); OaContract missingVersion = draft(source); missingVersion.setSourceVersion(null);
        fails(IllegalArgumentException.class, () -> contracts.createContract(missingVersion), "new source copy needs current source business version");
        OaContract currency = draft(source); currency.setCurrency("EUR"); fails(IllegalArgumentException.class, () -> contracts.createContract(currency), "copy cannot mix quote and contract currencies");
        OaContract customer = draft(source); customer.setCustomerId(source.customerId() + 1); fails(IllegalArgumentException.class, () -> contracts.createContract(customer), "source copy requires same customer");
        directoryUnavailable = true;
        try { fails(IllegalArgumentException.class, () -> contracts.createContract(draft(source)), "unavailable HR rejects new source copy"); }
        finally { directoryUnavailable = false; }
        for (long tenant : List.of(100000L, 100001L)) {
            identity(tenant, 990900L); UserContext.setDsType(4);
            try { fails(IllegalArgumentException.class, () -> contracts.createContract(draft(source)), "source quote is protected by tenant and customer scope"); }
            finally { identity(100000L, 1L); }
        }
        equal(0L, count(source), "all rejected source copies leave no contract");
        sourceTeam(source, 1, "0.6");
        fails(IllegalArgumentException.class, () -> contracts.createContract(draft(source)), "source edit invalidates the original draft version");
        Source latest = current(source.id());
        fixture.jdbc.update("UPDATE crm_deal_team SET current_flag=0 WHERE tenant_id=100000 AND biz_type='QUOTE' AND biz_id=?", source.id());
        fails(IllegalArgumentException.class, () -> contracts.createContract(draft(latest)), "incomplete source history cannot reset to default owner");
        equal(0L, count(source), "incomplete source history rolls back creation");
        fixture.jdbc.update("UPDATE crm_quote SET deleted=1 WHERE tenant_id=100000 AND quote_id=?", source.id());
        fails(IllegalArgumentException.class, () -> contracts.createContract(draft(latest)), "deleted source cannot create a contract");
    }

    private void rollback() {
        Source source = source(); sourceTeam(source, 1, "0.6"); Source latest = current(source.id());
        long beforeTeams = fixture.count("SELECT COUNT(*) FROM crm_deal_team"); long beforeEvents = fixture.count("SELECT COUNT(*) FROM outbox_event");
        fixture.jdbc.execute("CREATE TRIGGER h3_quote_contract_copy_failure BEFORE INSERT ON crm_deal_team FOR EACH ROW BEGIN IF NEW.biz_type='CONTRACT' AND NEW.sales_user_id=2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated contract team insertion failure'; END IF; END");
        try { fails(RuntimeException.class, () -> contracts.createContract(draft(latest)), "partial team insertion failure rolls back the contract"); }
        finally { fixture.jdbc.execute("DROP TRIGGER h3_quote_contract_copy_failure"); }
        equal(0L, count(source), "failed source copy leaves no contract"); equal(beforeTeams, fixture.count("SELECT COUNT(*) FROM crm_deal_team"), "failed source copy leaves no partial members");
        equal(beforeEvents, fixture.count("SELECT COUNT(*) FROM outbox_event"), "failed source copy leaves no creation event");
    }

    private void competition() throws Exception {
        Source source = source(); sourceTeam(source, 1, "0.6"); Source latest = current(source.id());
        CountDownLatch barrier = new CountDownLatch(2);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            List<Future<Long>> tasks = java.util.stream.IntStream.range(0, 2).mapToObj(index -> executor.submit(() -> {
                identity(100000L, 1L); barrier.countDown();
                if (!barrier.await(10, TimeUnit.SECONDS)) throw new AssertionError("source copy concurrency barrier timed out");
                return contracts.createContract(draft(latest));
            })).toList();
            Long first = tasks.get(0).get(30, TimeUnit.SECONDS); Long second = tasks.get(1).get(30, TimeUnit.SECONDS);
            equal(first, second, "two concurrent copies return the same contract ID"); equal(1L, count(source), "two concurrent copies persist exactly one contract");
            equal(2L, fixture.count("SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=?", first), "two concurrent copies persist exactly one complete team");
        } finally { executor.shutdownNow(); identity(100000L, 1L); }
    }
}
