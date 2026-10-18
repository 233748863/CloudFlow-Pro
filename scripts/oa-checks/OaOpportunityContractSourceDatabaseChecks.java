package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.domain.OaContract;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaOpportunityContractSourceDatabaseChecks {
    private final OaOperationsDatabaseChecks fixture;
    private final OaContractServiceImpl contracts;
    private final TransactionTemplate transactions;
    private record Source(Long id, Long customerId, int version) { }

    private OaOpportunityContractSourceDatabaseChecks(OaOperationsDatabaseChecks fixture) {
        this.fixture = fixture; contracts = fixture.bean(OaContractServiceImpl.class);
        transactions = new TransactionTemplate(fixture.transactions); transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    static void run(OaOperationsDatabaseChecks fixture) throws Exception {
        int before = checks.get(); identity(100000L, 1L);
        OaOpportunityContractSourceDatabaseChecks verification = new OaOpportunityContractSourceDatabaseChecks(fixture);
        verification.boundaries(); verification.quoteOrigin(); verification.competition();
        System.out.println("H3_REOPEN_OA_SOURCE_DATABASE_CHECKS: assertions=" + (checks.get() - before)
                + "; failed=0; concurrency_groups=2; mysql=true; contract_entrypoint=true; opportunity=database_fixture; stale_win_refused=true; source_relink_refused=true; production_modified=false");
    }

    private Source source() {
        String marker = "RO_" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO crm_customer(tenant_id,customer_code,customer_name,owner_id,dept_id,status,deleted) VALUES(100000,?,'商机恢复客户',1,100,'ACTIVE',0)", marker);
        Long customerId = fixture.jdbc.queryForObject("SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=?", Long.class, marker);
        fixture.jdbc.update("INSERT INTO crm_opportunity(tenant_id,customer_id,opportunity_name,owner_id,dept_id,expected_amount,stage,status,version,deleted) VALUES(100000,?,?,1,100,100.01,'WON','CLOSED',4,0)", customerId, marker);
        Long id = fixture.jdbc.queryForObject("SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=?", Long.class, marker);
        return new Source(id, customerId, 4);
    }

    private OaContract draft(Source source) {
        OaContract draft = new OaContract(); draft.setContractNo("RO_" + UUID.randomUUID()); draft.setContractName("受来源状态保护的合同"); draft.setCounterpartyName("商机恢复客户");
        draft.setContractType("SALES"); draft.setAmount(number("100.01")); draft.setCurrency("CNY"); draft.setCustomerId(source.customerId()); draft.setOwnerId(1L);
        draft.setSourceType("CRM_OPPORTUNITY"); draft.setSourceId(source.id()); draft.setSourceVersion(source.version()); return draft;
    }
    private long count(Source source) { return fixture.count("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_OPPORTUNITY' AND source_id=?", source.id()); }

    private void boundaries() {
        OaOpportunityContractSourceDatabaseChecks.Source source = source(); OaContract missing = draft(source); missing.setSourceVersion(null);
        fails(IllegalArgumentException.class, () -> contracts.createContract(missing), "automatic opportunity source requires a version");
        OaContract stale = draft(source); stale.setSourceVersion(3); fails(IllegalArgumentException.class, () -> contracts.createContract(stale), "stale won request cannot create a contract");
        OaContract wrong = draft(source); wrong.setCustomerId(source.customerId() + 1); fails(IllegalArgumentException.class, () -> contracts.createContract(wrong), "source customer must match");
        for (long tenant : List.of(100000L, 100001L)) {
            identity(tenant, 997799L); UserContext.setDsType(4);
            try { fails(IllegalArgumentException.class, () -> contracts.createContract(draft(source)), "source lock honors tenant and customer scope"); }
            finally { identity(100000L, 1L); }
        }
        fixture.jdbc.update("UPDATE crm_opportunity SET stage='QUALIFIED',status='OPEN',version=5 WHERE opportunity_id=?", source.id());
        fails(IllegalArgumentException.class, () -> contracts.createContract(draft(source)), "reopened opportunity rejects delayed automatic win request");
        equal(0L, count(source), "all rejected source requests create no contract");
        fixture.jdbc.update("UPDATE crm_opportunity SET stage='WON',status='CLOSED',version=4 WHERE opportunity_id=?", source.id());
        Long id = contracts.createContract(draft(source)); equal(1L, count(source), "current winning source creates one draft");
        for (String field : List.of("type", "id", "customer")) {
            OaContract changed = contracts.getContractInfo(id);
            if ("type".equals(field)) changed.setSourceType("CRM_CUSTOMER");
            if ("id".equals(field)) changed.setSourceId(source.id() + 1);
            if ("customer".equals(field)) changed.setCustomerId(source.customerId() + 1);
            fails(IllegalArgumentException.class, () -> contracts.updateContract(changed), "linked source cannot be edited: " + field);
        }
        OaContract standalone = draft(source); standalone.setSourceType(null); standalone.setSourceId(null); standalone.setSourceVersion(null);
        OaContract persisted = contracts.getContractInfo(contracts.createContract(standalone)); persisted.setSourceType("CRM_OPPORTUNITY"); persisted.setSourceId(source.id());
        fails(IllegalArgumentException.class, () -> contracts.updateContract(persisted), "existing contract cannot be attached by editing its origin after restore inspection");
    }

    private void quoteOrigin() {
        OaOpportunityContractSourceDatabaseChecks.Source source = source(); String marker = "RQ_" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO crm_quote(tenant_id,quote_no,quote_name,customer_id,opportunity_id,total_amount,currency,status,owner_id,version,deleted) VALUES(100000,?,'赢单来源报价',?,?,100.01,'CNY','APPROVED',1,0,0)", marker, source.customerId(), source.id());
        Long quoteId = fixture.jdbc.queryForObject("SELECT quote_id FROM crm_quote WHERE tenant_id=100000 AND quote_no=?", Long.class, marker);
        OaContract draft = draft(source); draft.setSourceType("CRM_QUOTE"); draft.setSourceId(quoteId); draft.setSourceVersion(0); draft.setOpportunityVersion(4);
        fixture.jdbc.update("UPDATE crm_opportunity SET stage='QUALIFIED',status='OPEN',version=5 WHERE opportunity_id=?", source.id());
        fails(IllegalArgumentException.class, () -> contracts.createContract(draft), "delayed automatic quote conversion also validates original winning version");
        equal(0L, fixture.count("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_QUOTE' AND source_id=?", quoteId), "stale automatic quote conversion creates no contract");
        draft.setOpportunityVersion(null);
        Long id = contracts.createContract(draft); equal(1L, fixture.count("SELECT COUNT(*) FROM oa_contract WHERE contract_id=?", id), "independent user-requested quote conversion remains available");
    }

    private void competition() throws Exception {
        OaOpportunityContractSourceDatabaseChecks.Source source = source(); CountDownLatch held = new CountDownLatch(1); CountDownLatch started = new CountDownLatch(1);
        Callable<Integer> restoreFirst = () -> transactions.execute(status -> {
            fixture.jdbc.update("UPDATE crm_opportunity SET stage='QUALIFIED',status='OPEN',version=5 WHERE opportunity_id=?", source.id()); held.countDown(); awaitWait(started); return 1;
        });
        Callable<Integer> staleCreate = () -> { equal(true, held.await(5, TimeUnit.SECONDS), "restore state is locked before delayed creation"); started.countDown();
            fails(IllegalArgumentException.class, () -> contracts.createContract(draft(source)), "creation rechecks source after waiting for restore"); return 1; };
        parallel(restoreFirst, staleCreate); equal(0L, count(source), "restore-first race creates no stale contract");
        OaOpportunityContractSourceDatabaseChecks.Source other = source(); CountDownLatch created = new CountDownLatch(1); CountDownLatch restoring = new CountDownLatch(1);
        Callable<Integer> createFirst = () -> transactions.execute(status -> { contracts.createContract(draft(other)); created.countDown(); awaitWait(restoring); return 1; });
        Callable<Integer> laterRestore = () -> { equal(true, created.await(5, TimeUnit.SECONDS), "contract creation holds source before competing restore"); restoring.countDown();
            fixture.jdbc.update("UPDATE crm_opportunity SET stage='QUALIFIED',status='OPEN',version=5 WHERE opportunity_id=?", other.id()); return 1; };
        parallel(createFirst, laterRestore); equal(1L, count(other), "create-first race commits its draft before the source can reopen");
    }

    private void awaitWait(CountDownLatch started) {
        try {
            equal(true, started.await(5, TimeUnit.SECONDS), "competing source action starts"); long waiting = 0;
            for (int attempt = 0; attempt < 60 && waiting == 0; attempt++) { waiting = fixture.count("SELECT COUNT(*) FROM performance_schema.data_lock_waits"); if (waiting == 0) Thread.sleep(50); }
            equal(true, waiting > 0, "source protection is an actual InnoDB row lock");
        } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
    }

    private void parallel(Callable<Integer> first, Callable<Integer> second) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> tasks = List.of(first, second).stream().map(operation -> executor.submit(() -> {
                identity(100000L, 1L); try { return operation.call(); } finally { TenantContext.clear(); UserContext.clear(); }
            })).toList();
            equal(2, tasks.get(0).get(30, TimeUnit.SECONDS) + tasks.get(1).get(30, TimeUnit.SECONDS), "both source actions finish without deadlock");
        } finally { executor.shutdownNow(); executor.awaitTermination(10, TimeUnit.SECONDS); identity(100000L, 1L); }
    }
}
