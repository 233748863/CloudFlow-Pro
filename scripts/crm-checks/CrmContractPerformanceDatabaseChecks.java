package com.cloudflow.crm.service.impl;

import com.cloudflow.common.event.contract.ContractPerformanceSource;
import com.cloudflow.common.event.contract.ContractPerformanceSourceCodec;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.crm.service.deal.CrmContractPerformanceService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmContractPerformanceDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmContractPerformanceService performance;

    private CrmContractPerformanceDatabaseChecks(CrmOperationsDatabaseChecks fixture) throws Exception {
        this.fixture = fixture;
        performance = fixture.bean(CrmContractPerformanceService.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount(); identity();
        CrmContractPerformanceDatabaseChecks verification = new CrmContractPerformanceDatabaseChecks(fixture);
        verification.confirmation(); verification.chain(); verification.invalidSources(); verification.provenance();
        verification.rollback(); verification.concurrency();
        System.out.println("H3_CONTRACT_PERFORMANCE_CRM_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; concurrency_groups=1; mysql=true; transactions=true; consumer=true; oa_source=database_fixture; real_http=false; salary_posting=false; production_modified=false");
    }

    private ContractPerformanceSource initial() {
        String marker = "H3_CP_" + UUID.randomUUID();
        Long customer = fixture.customer(marker).getCustomerId();
        String instance = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.now().minusMinutes(1).withNano(0);
        String file = "private-contract-source-" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO oa_contract(tenant_id,contract_no,contract_name,counterparty_name,contract_type,amount,currency,customer_id,owner_id,dept_id,status,version,deleted,instance_id,start_date,end_date,signed_flag,our_signee_id,our_sign_time,counterparty_signee,counterparty_sign_time,signed_file_url) VALUES(100000,?,'合同来源数据库输入','核验客户','SALES',100.01,'CNY',?,1,100,'APPROVED',3,0,?,?,?,1,1,?,'来源对方签署人',?,?)",
                marker, customer, instance, LocalDate.now().minusDays(1), LocalDate.now().plusMonths(1), now.minusMinutes(1), now.minusMinutes(2), file);
        Long contractId = fixture.scalar("SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND contract_no=?", marker);
        ContractPerformanceSource source = new ContractPerformanceSource();
        source.setTenantId(100000L); source.setContractId(contractId); source.setContractVersion(3); source.setRevision(1);
        source.setOperation("CONFIRM"); source.setCustomerId(customer); source.setContractType("SALES"); source.setAmount(new BigDecimal("100.01"));
        source.setCurrency("CNY"); source.setContractStatus("APPROVED"); source.setApprovalInstanceId(instance);
        source.setApprovedTime(now.minusMinutes(3)); source.setStartDate(LocalDate.now().minusDays(1)); source.setEndDate(LocalDate.now().plusMonths(1));
        source.setOurSigneeId(1L); source.setOurSignTime(now.minusMinutes(1)); source.setCounterpartySignTime(now.minusMinutes(2));
        source.setSignedEvidenceDigest(ContractPerformanceSource.signatureDigest(1L, source.getOurSignTime(), "来源对方签署人", source.getCounterpartySignTime(), file, fixture.json));
        source.setOccurredTime(now); source.setTeamVersion(1);
        source.setMembers(List.of(new ContractPerformanceSource.Member(1L, 1001L, "冻结主责", 100L, "OWNER", new BigDecimal("0.6000")),
                new ContractPerformanceSource.Member(2L, 1002L, "冻结协同", 101L, "CO_SELLER", new BigDecimal("0.4000"))));
        return source;
    }

    private BusinessEventEnvelope publish(ContractPerformanceSource source) {
        BusinessEventEnvelope envelope = ContractPerformanceSourceCodec.encode(source, fixture.json);
        fixture.bean(OutboxPublisher.class).publish(envelope);
        return envelope;
    }
    private ContractPerformanceSource next(ContractPerformanceSource previous, BusinessEventEnvelope envelope, String operation, String amount) {
        ContractPerformanceSource source = fixture.json.convertValue(previous, ContractPerformanceSource.class);
        source.setRevision(previous.getRevision() + 1); source.setContractVersion(previous.getContractVersion() + 1);
        source.setOperation(operation); source.setPreviousEventId(previous.eventId()); source.setPreviousDigest(envelope.getPayloadDigest());
        source.setAmount(new BigDecimal(amount)); source.setOccurredTime(previous.getOccurredTime().plusSeconds(1));
        source.setContractStatus("REVERSE".equals(operation) ? "TERMINATED" : "APPROVED");
        fixture.jdbc.update("UPDATE oa_contract SET amount=?,version=?,status=? WHERE tenant_id=100000 AND contract_id=?",
                source.getAmount(), source.getContractVersion(), source.getContractStatus(), source.getContractId());
        return source;
    }
    private long count(ContractPerformanceSource source) {
        return fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=?", source.getContractId());
    }
    private BigDecimal total(ContractPerformanceSource source) {
        return fixture.jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=?", BigDecimal.class, source.getContractId());
    }
    private BigDecimal memberTotal(ContractPerformanceSource source, long userId) {
        return fixture.jdbc.queryForObject("SELECT COALESCE(SUM(allocation.allocated_amount),0) FROM crm_deal_allocation allocation JOIN crm_deal_event event ON event.event_id=allocation.event_id AND event.tenant_id=allocation.tenant_id WHERE event.tenant_id=100000 AND event.biz_type='CONTRACT' AND event.biz_id=? AND allocation.sales_user_id=?", BigDecimal.class, source.getContractId(), userId);
    }

    private void confirmation() {
        ContractPerformanceSource source = initial(); BusinessEventEnvelope envelope = publish(source);
        performance.consume(envelope);
        equal(1L, count(source), "one real contract source creates one ledger fact");
        decimal("100.01", total(source), "contract amount is actual OA value, not opportunity estimate");
        decimal("60.01", memberTotal(source, 1), "owner receives exact cent remainder");
        decimal("40.00", memberTotal(source, 2), "partner retains frozen 40 percent");
        for (int repeat = 0; repeat < 5; repeat++) performance.consume(envelope);
        performance.synchronize(source.eventId());
        equal(1L, count(source), "repeated stream and internal source synchronization are idempotent");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_allocation allocation JOIN crm_deal_event event ON event.event_id=allocation.event_id AND event.tenant_id=allocation.tenant_id WHERE event.tenant_id=100000 AND event.biz_type='CONTRACT' AND event.biz_id=? AND (allocation.commission_status<>'NOT_APPLICABLE' OR allocation.commission_amount IS NOT NULL OR allocation.comp_change_id IS NOT NULL)", source.getContractId()), "contract confirmation cannot create payroll or receipt commission");
        BusinessEventEnvelope changed = fixture.json.convertValue(envelope, BusinessEventEnvelope.class); changed.setPayload("{}");
        fails(IllegalArgumentException.class, () -> performance.consume(changed), "stream payload must equal durable source envelope");
        TenantBroker.runAs(100001L, tenant -> fails(IllegalArgumentException.class, () -> performance.consume(envelope), "foreign tenant cannot consume this source"));
        equal(1L, count(source), "rejected source spoofing leaves facts unchanged");
        ContractPerformanceSource foreign = fixture.json.convertValue(source, ContractPerformanceSource.class); foreign.setTenantId(100001L);
        check(!source.eventId().equals(foreign.eventId()), "global outbox identity includes tenant");
    }

    private void chain() {
        ContractPerformanceSource initial = initial(); BusinessEventEnvelope first = publish(initial);
        ContractPerformanceSource corrected = next(initial, first, "CORRECT", "120.01"); BusinessEventEnvelope second = publish(corrected);
        performance.consume(second);
        equal(3L, count(initial), "out-of-order correction materializes original reversal and replacement atomically");
        decimal("120.01", total(initial), "corrected ledger total reconciles to current contract amount");
        decimal("72.01", memberTotal(initial, 1), "correction keeps original owner ratio");
        decimal("48.00", memberTotal(initial, 2), "correction keeps original partner ratio");
        performance.consume(first); decimal("120.01", total(initial), "old notification cannot reset corrected total");
        ContractPerformanceSource reversed = next(corrected, second, "REVERSE", "120.01"); BusinessEventEnvelope third = publish(reversed);
        performance.consume(third); performance.consume(second); performance.consume(first); performance.consume(third);
        equal(4L, count(initial), "terminal replay never adds another reversal");
        decimal("0", total(initial), "original correction and terminal reversal net to zero");
        decimal("0", memberTotal(initial, 1), "owner fully reversed using frozen original amounts");
        decimal("0", memberTotal(initial, 2), "partner fully reversed using frozen original amounts");
        equal(2L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=? AND reversal_of_id IS NOT NULL", initial.getContractId()), "both reversals explicitly reference preceding facts");
        ContractPerformanceSource delayed = initial(); BusinessEventEnvelope delayedFirst = publish(delayed);
        ContractPerformanceSource delayedCorrection = next(delayed, delayedFirst, "CORRECT", "70.01"); BusinessEventEnvelope delayedSecond = publish(delayedCorrection);
        ContractPerformanceSource delayedReversal = next(delayedCorrection, delayedSecond, "REVERSE", "70.01"); BusinessEventEnvelope last = publish(delayedReversal);
        performance.consume(last);
        equal(4L, count(delayed), "last notification can recover every durable predecessor");
        decimal("0", total(delayed), "reversed contract cannot temporarily remain counted after atomic chain recovery");
    }

    private void invalidSources() throws Exception {
        rejectSource(source -> source.setSchemaVersion(2), "unknown schema rejected");
        rejectSource(source -> source.setTenantId(100001L), "foreign persisted tenant rejected");
        rejectSource(source -> source.setStartDate(null), "missing start date rejected");
        rejectSource(source -> source.setStartDate(LocalDate.now().plusDays(1)), "future start rejected");
        rejectSource(source -> source.setApprovedTime(null), "missing approval time rejected");
        rejectSource(source -> source.setApprovalInstanceId(""), "empty approval instance rejected");
        rejectSource(source -> source.setOurSignTime(null), "missing our signature rejected");
        rejectSource(source -> source.setCounterpartySignTime(LocalDateTime.now().plusDays(1)), "future counterparty signature rejected");
        rejectSource(source -> source.setSignedEvidenceDigest("bad"), "malformed signed evidence digest rejected");
        rejectSource(source -> source.setContractStatus("PENDING"), "unapproved status cannot be presented as effective contract");
        rejectSource(source -> source.setContractType("PURCHASE"), "purchase contract cannot be sales performance");
        rejectSource(source -> source.setAmount(new BigDecimal("-1")), "negative source amount rejected");
        rejectSource(source -> source.setAmount(new BigDecimal("0.001")), "fractional-cent source amount rejected");
        rejectSource(source -> source.setAmount(new BigDecimal("1000000000000")), "overflowing source amount rejected");
        rejectSource(source -> source.setCurrency("cny"), "malformed source currency rejected");
        rejectSource(source -> source.setContractVersion(4), "source cannot claim a future business version");
        rejectSource(source -> source.setRevision(2), "source revision requires a predecessor");
        rejectSource(source -> source.setPreviousEventId(UUID.randomUUID().toString()), "initial source cannot hide a predecessor");
        rejectSource(source -> source.setTeamVersion(-1), "negative team version rejected");
        rejectSource(source -> source.setMembers(List.of()), "missing frozen members rejected");
        rejectSource(source -> source.setMembers(List.of(source.getMembers().get(0), source.getMembers().get(0))), "duplicate members rejected");
        ContractPerformanceSource original = initial(); BusinessEventEnvelope first = publish(original);
        ContractPerformanceSource changed = next(original, first, "CORRECT", "120.01"); changed.setPreviousDigest("a".repeat(64)); BusinessEventEnvelope invalid = publish(changed);
        fails(IllegalArgumentException.class, () -> performance.consume(invalid), "wrong predecessor digest rejects entire chain"); equal(0L, count(original), "bad chain cannot leave even an original fact");
        ContractPerformanceSource team = initial(); BusinessEventEnvelope teamFirst = publish(team); ContractPerformanceSource teamNext = next(team, teamFirst, "CORRECT", "80.01");
        teamNext.setMembers(List.of(new ContractPerformanceSource.Member(1L, 1001L, "冻结主责", 100L, "OWNER", new BigDecimal("0.5")),
                new ContractPerformanceSource.Member(2L, 1002L, "冻结协同", 101L, "CO_SELLER", new BigDecimal("0.5"))));
        BusinessEventEnvelope teamEvent = publish(teamNext);
        fails(IllegalArgumentException.class, () -> performance.consume(teamEvent), "correction cannot rewrite original frozen proportions"); equal(0L, count(team), "invalid correction team causes atomic rollback");
    }

    private void rejectSource(Consumer<ContractPerformanceSource> change, String label) throws Exception {
        ContractPerformanceSource source = initial(); change.accept(source);
        String payload = fixture.json.writeValueAsString(source);
        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().eventId(source.eventId()).sourceId(source.getContractId())
                .eventType(ContractPerformanceSource.EVENT).sourceModule(ContractPerformanceSource.SERVICE).tenantId(100000L)
                .occurredAt(source.getOccurredTime()).payload(payload).payloadDigest(ContractPerformanceSource.digest(payload)).build();
        fixture.bean(OutboxPublisher.class).publish(envelope);
        fails(IllegalArgumentException.class, () -> performance.consume(envelope), label);
        equal(0L, count(source), label + " leaves ledger empty");
    }

    private void provenance() {
        ContractPerformanceSource unsigned = initial(); BusinessEventEnvelope envelope = publish(unsigned);
        fixture.jdbc.update("UPDATE oa_contract SET signed_flag=0 WHERE contract_id=?", unsigned.getContractId());
        fails(IllegalArgumentException.class, () -> performance.consume(envelope), "durable notification still requires actual signed contract"); equal(0L, count(unsigned), "unsigned real record cannot count");
        ContractPerformanceSource signature = initial(); BusinessEventEnvelope signatureEvent = publish(signature);
        fixture.jdbc.update("UPDATE oa_contract SET signed_file_url='changed-evidence' WHERE contract_id=?", signature.getContractId());
        fails(IllegalArgumentException.class, () -> performance.consume(signatureEvent), "source signed evidence must match real immutable contract");
        ContractPerformanceSource customer = initial(); BusinessEventEnvelope customerEvent = publish(customer);
        fixture.jdbc.update("UPDATE oa_contract SET customer_id=0 WHERE contract_id=?", customer.getContractId());
        fails(IllegalArgumentException.class, () -> performance.consume(customerEvent), "source must match actual customer");
        ContractPerformanceSource module = initial(); BusinessEventEnvelope moduleEvent = ContractPerformanceSourceCodec.encode(module, fixture.json); moduleEvent.setSourceModule("cloudflow-service-crm");
        fixture.bean(OutboxPublisher.class).publish(moduleEvent);
        fails(IllegalArgumentException.class, () -> performance.consume(moduleEvent), "only OA aggregate can confirm contract sales");
        ContractPerformanceSource missing = initial();
        fails(IllegalArgumentException.class, () -> performance.consume(ContractPerformanceSourceCodec.encode(missing, fixture.json)), "transient notification without durable outbox source is rejected");
    }

    private void rollback() {
        ContractPerformanceSource source = initial(); BusinessEventEnvelope envelope = publish(source);
        fixture.jdbc.execute("CREATE TRIGGER h3_contract_allocation_failure BEFORE INSERT ON crm_deal_allocation FOR EACH ROW BEGIN IF NEW.tenant_id=100000 AND NEW.sales_user_id=2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated contract allocation failure'; END IF; END");
        try { fails(RuntimeException.class, () -> performance.consume(envelope), "second member failure rolls first member and event back"); }
        finally { fixture.jdbc.execute("DROP TRIGGER h3_contract_allocation_failure"); }
        equal(0L, count(source), "partial allocation cannot leave contract performance fact");
        decimal("0", memberTotal(source, 1), "partial allocation cannot leave owner amount");
        performance.consume(envelope); equal(1L, count(source), "same durable source recovers after failure");
        decimal("100.01", total(source), "recovered amount reconciles exactly once");
    }

    private void concurrency() throws Exception {
        ContractPerformanceSource source = initial(); BusinessEventEnvelope first = publish(source);
        ContractPerformanceSource changed = next(source, first, "CORRECT", "90.01"); BusinessEventEnvelope second = publish(changed);
        ExecutorService executor = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Boolean> original = executor.submit(() -> { identity(); start.await(); performance.consume(first); return true; });
            Future<Boolean> correction = executor.submit(() -> { identity(); start.await(); performance.consume(second); return true; });
            start.countDown(); equal(true, original.get(30, TimeUnit.SECONDS), "concurrent original completes");
            equal(true, correction.get(30, TimeUnit.SECONDS), "concurrent correction completes");
        } finally { executor.shutdownNow(); identity(); }
        equal(3L, count(source), "concurrent source consumers create only original reversal and replacement");
        decimal("90.01", total(source), "concurrent ordering preserves corrected total");
    }
}
