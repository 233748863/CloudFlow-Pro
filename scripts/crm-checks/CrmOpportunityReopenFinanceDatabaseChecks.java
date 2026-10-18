package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.event.contract.ContractPerformanceSource;
import com.cloudflow.common.event.contract.ContractPerformanceSourceCodec;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.dto.CrmReceivableWriteoffDTO;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmDealEventMapper;
import com.cloudflow.crm.service.deal.CrmContractPerformanceService;
import com.cloudflow.crm.service.deal.CrmReceivableTeamService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityReopenLedgerService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityReopenService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmOpportunityReopenFinanceDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmOpportunityReopenDatabaseChecks business;
    private final CrmReceivableServiceImpl receivables;
    private final CrmContractPerformanceService performance;

    private CrmOpportunityReopenFinanceDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; business = new CrmOpportunityReopenDatabaseChecks(fixture);
        receivables = fixture.bean(CrmReceivableServiceImpl.class); performance = fixture.bean(CrmContractPerformanceService.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount(); identity(); CrmOpportunityReopenFinanceDatabaseChecks checks = new CrmOpportunityReopenFinanceDatabaseChecks(fixture);
        checks.draftsAndAssociations(); checks.contractSources(); checks.receiptsAndRefunds(); checks.invoiceSources(); checks.concurrency();
        System.out.println("H3_OPPORTUNITY_REOPEN_FINANCE_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; concurrency_groups=2; mysql=true; transactions=true; durable_contract_sources=true; selected_receipt_refunds=true; oa_workflow_hr=explicit_fixtures; real_http=false; production_modified=false");
    }

    private Long contract(CrmOpportunity opportunity) {
        String marker = "RF_" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO oa_contract(tenant_id,contract_no,contract_name,counterparty_name,contract_type,amount,currency,customer_id,owner_id,dept_id,status,version,deleted,source_type,source_id) VALUES(100000,?,'恢复关联核验合同','隔离客户','SALES',100.01,'CNY',?,1,100,'DRAFT',0,0,'CRM_OPPORTUNITY',?)",
                marker, opportunity.getCustomerId(), opportunity.getOpportunityId());
        Long id = fixture.scalar("SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND contract_no=?", marker);
        RemoteOaService.ContractInfo summary = new RemoteOaService.ContractInfo(); summary.setContractId(id); summary.setContractNo(marker); summary.setCustomerId(opportunity.getCustomerId());
        fixture.contractDetails.put(id, summary); return id;
    }

    private void blocked(CrmOpportunity opportunity, String label) {
        CrmOpportunityReopenService.View view = business.reopening.inspect(opportunity.getOpportunityId()); check(!view.allowed() && !view.blockers().isEmpty(), label + " is visibly blocked");
        long count = business.histories(opportunity.getOpportunityId());
        fails(IllegalArgumentException.class, () -> business.reopening.restore(opportunity.getOpportunityId(), business.request(opportunity)), label + " rejects mutation");
        equal("WON", business.read(opportunity.getOpportunityId()).getStage(), label + " retains terminal stage");
        equal(count, business.histories(opportunity.getOpportunityId()), label + " creates no history"); decimal("100.01", business.balance(opportunity.getOpportunityId()), label + " preserves winning balance");
    }

    private void draftsAndAssociations() throws Exception {
        CrmOpportunity opportunity = business.won("reopen retains drafts"); Long direct = contract(opportunity); Long quoteOrigin = contract(opportunity); Long quoteLink = contract(opportunity);
        CrmCustomer customer = fixture.mapper(com.cloudflow.crm.mapper.CrmCustomerMapper.class).selectById(opportunity.getCustomerId());
        CrmQuote quote = fixture.quote(customer, opportunity.getOpportunityId(), quoteLink);
        fixture.jdbc.update("UPDATE oa_contract SET source_type='CRM_QUOTE',source_id=? WHERE contract_id=?", quote.getQuoteId(), quoteOrigin);
        fixture.jdbc.update("UPDATE oa_contract SET source_type='CRM_CUSTOMER',source_id=?,deleted=1 WHERE contract_id=?", customer.getCustomerId(), quoteLink);
        fixture.jdbc.update("UPDATE crm_quote SET deleted=1 WHERE quote_id=?", quote.getQuoteId());
        CrmOpportunityReopenService.View view = business.reopening.inspect(opportunity.getOpportunityId()); check(view.allowed(), "drafts do not block reopening even with historic soft-deleted association");
        equal(3, view.retainedContracts(), "all three approved association paths are inspected");
        CrmOpportunityReopenService.Receipt receipt = business.reopening.restore(opportunity.getOpportunityId(), business.request(opportunity));
        equal(3L, fixture.scalar("SELECT COUNT(*) FROM oa_contract WHERE contract_id IN (?,?,?)", direct, quoteOrigin, quoteLink), "restoring retains all associated contracts");
        JsonNode evidence = fixture.json.readTree(fixture.jdbc.queryForObject("SELECT snapshot FROM crm_opportunity_stage_history WHERE history_id=?", String.class, receipt.historyId())).path("reopen");
        equal(3, evidence.path("contracts").size(), "history preserves server-verified contract list"); equal(1, evidence.path("quotes").size(), "history preserves historic quote link");
        CrmOpportunity wrong = business.won("inconsistent associated customer"); Long wrongContract = contract(wrong);
        fixture.jdbc.update("UPDATE oa_contract SET customer_id=? WHERE contract_id=?", customer.getCustomerId(), wrongContract);
        blocked(wrong, "mismatched associated contract customer");
        CrmOpportunity missing = business.won("missing quote-linked contract");
        fixture.quote(fixture.mapper(com.cloudflow.crm.mapper.CrmCustomerMapper.class).selectById(missing.getCustomerId()), missing.getOpportunityId(), 9223372036854775000L);
        blocked(missing, "missing historically linked contract");
    }

    private ContractPerformanceSource signed(CrmOpportunity opportunity, Long contractId) {
        LocalDateTime now = LocalDateTime.now().minusMinutes(1).withNano(0); String instance = UUID.randomUUID().toString(); String file = "reopen-source-" + UUID.randomUUID();
        fixture.jdbc.update("UPDATE oa_contract SET status='APPROVED',version=3,instance_id=?,start_date=?,end_date=?,signed_flag=1,our_signee_id=1,our_sign_time=?,counterparty_signee='原对方签署人',counterparty_sign_time=?,signed_file_url=? WHERE contract_id=?",
                instance, LocalDate.now().minusDays(1), LocalDate.now().plusMonths(1), now.minusMinutes(1), now.minusMinutes(2), file, contractId);
        ContractPerformanceSource source = new ContractPerformanceSource(); source.setTenantId(100000L); source.setContractId(contractId); source.setContractVersion(3); source.setRevision(1);
        source.setOperation("CONFIRM"); source.setCustomerId(opportunity.getCustomerId()); source.setContractType("SALES"); source.setAmount(new BigDecimal("100.01")); source.setCurrency("CNY");
        source.setContractStatus("APPROVED"); source.setApprovalInstanceId(instance); source.setApprovedTime(now.minusMinutes(3));
        source.setStartDate(LocalDate.now().minusDays(1)); source.setEndDate(LocalDate.now().plusMonths(1)); source.setOurSigneeId(1L); source.setOurSignTime(now.minusMinutes(1)); source.setCounterpartySignTime(now.minusMinutes(2));
        source.setSignedEvidenceDigest(ContractPerformanceSource.signatureDigest(1L, source.getOurSignTime(), "原对方签署人", source.getCounterpartySignTime(), file, fixture.json));
        source.setOccurredTime(now); source.setTeamVersion(1); source.setMembers(List.of(new ContractPerformanceSource.Member(1L, 1001L, "原主责", 100L, "OWNER", new BigDecimal("0.6000")),
                new ContractPerformanceSource.Member(2L, 1002L, "原协同", 101L, "CO_SELLER", new BigDecimal("0.4000")))); return source;
    }

    private BusinessEventEnvelope publish(ContractPerformanceSource source) {
        BusinessEventEnvelope envelope = ContractPerformanceSourceCodec.encode(source, fixture.json); fixture.bean(OutboxPublisher.class).publish(envelope); return envelope;
    }

    private BusinessEventEnvelope reverse(ContractPerformanceSource previous, BusinessEventEnvelope envelope) {
        ContractPerformanceSource source = fixture.json.convertValue(previous, ContractPerformanceSource.class);
        source.setOperation("REVERSE"); source.setRevision(previous.getRevision() + 1); source.setContractVersion(previous.getContractVersion() + 1);
        source.setContractStatus("TERMINATED"); source.setPreviousEventId(previous.eventId()); source.setPreviousDigest(envelope.getPayloadDigest()); source.setOccurredTime(previous.getOccurredTime().plusSeconds(1));
        fixture.jdbc.update("UPDATE oa_contract SET status='TERMINATED',version=? WHERE contract_id=?", source.getContractVersion(), source.getContractId()); return publish(source);
    }

    private void contractSources() throws Exception {
        CrmOpportunity opportunity = business.won("reopen durable contract chain"); Long id = contract(opportunity); ContractPerformanceSource source = signed(opportunity, id);
        blocked(opportunity, "signed and effective contract without source"); BusinessEventEnvelope envelope = publish(source);
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE biz_type='CONTRACT' AND biz_id=?", id), "pending confirmation has no consumed CRM fact yet");
        blocked(opportunity, "durable unconsumed confirmation"); performance.consume(envelope); blocked(opportunity, "consumed contract confirmation");
        BusinessEventEnvelope reversed = reverse(source, envelope); blocked(opportunity, "durable reversal not yet synchronized"); performance.consume(reversed);
        CrmOpportunityReopenService.View reconciled = business.reopening.inspect(opportunity.getOpportunityId());
        check(reconciled.allowed(), "fully reversed durable contract chain allows restore; blockers=" + reconciled.blockers());
        CrmOpportunityReopenLedgerService proof = fixture.bean(CrmOpportunityReopenLedgerService.class);
        equal(new BigDecimal("100.0100000000000000001"), proof.parse("{\"amount\":100.0100000000000000001}").path("amount").decimalValue(), "snapshot parsing preserves exact decimal precision");
        corruptedSnapshot(opportunity, source.factKey(), snapshot -> ((ObjectNode) snapshot.path("evidence").path("contract")).put("amount", new BigDecimal("100.02")), "changed frozen contract amount");
        corruptedSnapshot(opportunity, source.factKey(), snapshot -> ((ObjectNode) snapshot.path("evidence").path("contract")).put("amount", "100.01"), "numeric-looking text cannot replace a frozen decimal");
        corruptedSnapshot(opportunity, source.factKey(), snapshot -> ((ObjectNode) snapshot.path("evidence").path("contract")).put("contractId", id + 1), "changed original contract identity");
        corruptedSnapshot(opportunity, source.factKey(), snapshot -> ((ObjectNode) snapshot.path("evidence").path("contract")).remove("previousEventId"), "missing frozen field differs from explicit null");
        corruptedSnapshot(opportunity, source.factKey(), snapshot -> ((ObjectNode) snapshot.path("evidence").path("contract")).put("unexpected", true), "extra frozen contract field");
        corruptedSnapshot(opportunity, source.factKey(), snapshot -> ((ObjectNode) snapshot.path("evidence").path("contract").path("members").get(0)).put("deptId", 99999), "changed nested original department");
        corruptedSnapshot(opportunity, source.factKey(), snapshot -> ((ObjectNode) snapshot.path("evidence").path("contract").path("members").get(0)).put("percentage", new BigDecimal("0.6001")), "changed nested original percentage");
        corruptedSnapshot(opportunity, source.factKey(), snapshot -> ((ObjectNode) snapshot.path("evidence")).put("sourceDigest", "0".repeat(64)), "changed original source digest");
        String reversalKey = fixture.json.readValue(reversed.getPayload(), ContractPerformanceSource.class).reversalKey();
        corruptedSnapshot(opportunity, reversalKey, snapshot -> ((ObjectNode) snapshot.path("evidence")).put("sourceEventId", UUID.randomUUID().toString()), "changed reversal source identity");
        fixture.jdbc.update("UPDATE oa_contract SET status='DRAFT' WHERE contract_id=?", id);
        blocked(opportunity, "current contract state contradicts terminal reversal"); fixture.jdbc.update("UPDATE oa_contract SET status='TERMINATED' WHERE contract_id=?", id);
        Long originalAllocation = fixture.scalar("SELECT MIN(allocation_id) FROM crm_deal_allocation WHERE event_id=(SELECT event_id FROM crm_deal_event WHERE tenant_id=100000 AND event_key=?)", source.factKey());
        fixture.jdbc.update("UPDATE crm_deal_allocation SET dept_id=99999 WHERE reversal_of_id=?", originalAllocation);
        blocked(opportunity, "zero-total reversal attributed to wrong original department"); fixture.jdbc.update("UPDATE crm_deal_allocation SET dept_id=100 WHERE reversal_of_id=?", originalAllocation);
        business.reopening.restore(opportunity.getOpportunityId(), business.request(opportunity)); decimal("0", business.balance(opportunity.getOpportunityId()), "valid contract reversal permits original winning reversal");
        equal(2L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=?", id), "restore never duplicates contract reversal");
    }

    private void corruptedSnapshot(CrmOpportunity opportunity, String key, Consumer<ObjectNode> mutation, String label) throws Exception {
        CrmDealEvent event = fixture.mapper(CrmDealEventMapper.class).selectOne(new LambdaQueryWrapper<CrmDealEvent>().eq(CrmDealEvent::getEventKey, key));
        ObjectNode snapshot = (ObjectNode) fixture.bean(CrmOpportunityReopenLedgerService.class).parse(event.getSourceSnapshot());
        mutation.accept(snapshot);
        fixture.jdbc.update("UPDATE crm_deal_event SET source_snapshot=? WHERE event_id=?", fixture.json.writeValueAsString(snapshot), event.getEventId());
        try {
            blocked(opportunity, label);
        } finally { fixture.jdbc.update("UPDATE crm_deal_event SET source_snapshot=? WHERE event_id=?", event.getSourceSnapshot(), event.getEventId()); }
    }

    private CrmReceivable plan(CrmOpportunity opportunity, Long contractId) {
        CrmReceivable input = new CrmReceivable(); input.setCustomerId(opportunity.getCustomerId()); input.setContractId(contractId);
        input.setReceivableName("恢复原款核验 " + UUID.randomUUID()); input.setPlannedAmount(new BigDecimal("100.01")); receivables.createReceivable(input); return current(input);
    }
    private CrmReceivable current(CrmReceivable plan) { return receivables.getAccessibleReceivable(plan.getReceivableId()); }
    private CrmDealEvent receipt(CrmReceivable plan, String amount) {
        CrmReceivableWriteoffDTO input = new CrmReceivableWriteoffDTO(); input.setVersion(current(plan).getVersion()); input.setAmount(new BigDecimal(amount)); input.setWriteoffDate(LocalDate.now());
        receivables.writeoffReceivable(plan.getReceivableId(), input);
        return fixture.mapper(CrmDealEventMapper.class).selectOne(new LambdaQueryWrapper<CrmDealEvent>().eq(CrmDealEvent::getEventKey, "CRM_RECEIVABLE_RECEIPT:" + plan.getReceivableId() + ":" + (input.getVersion() + 1)));
    }
    private Long refund(CrmReceivable plan, CrmDealEvent source, String amount) {
        return fixture.refundWorkflow.submit(plan, source.getEventId(), current(plan).getVersion(), new BigDecimal(amount), "先按指定原款处理退款");
    }
    private void approve(Long approvalId) {
        CrmApproval approval = fixture.mapper(CrmApprovalMapper.class).selectById(approvalId);
        fixture.bean(CrmRefundApprovalHandler.class).handleApproved(fixture.refundWorkflow.completedFixture(approval, true));
    }

    private void receiptsAndRefunds() throws Exception {
        CrmOpportunity opportunity = business.won("reopen selected receipts"); Long contractId = contract(opportunity); CrmReceivable plan = plan(opportunity, contractId);
        CrmDealEvent first = receipt(plan, "30");
        fixture.bean(CrmReceivableTeamService.class).save(plan.getReceivableId(), new CrmDealTeamRequest(1, current(plan).getVersion(),
                List.of(new CrmDealTeamRequest.Member(1L, "OWNER", new BigDecimal("0.2000")), new CrmDealTeamRequest.Member(2L, "CO_SELLER", new BigDecimal("0.8000"))), "第二笔采用不同团队"));
        CrmDealEvent second = receipt(plan, "20"); String original = fixture.json.writeValueAsString(business.allocations(second.getEventId()));
        blocked(opportunity, "two actual receipts with different frozen teams"); Long pending = refund(plan, second, "5"); blocked(opportunity, "pending selected receipt refund");
        approve(pending); decimal("45", current(plan).getReceivedAmount(), "partial refund leaves real remaining cash"); blocked(opportunity, "partial refund");
        approve(refund(plan, second, "15")); blocked(opportunity, "another original receipt still has unrefunded cash");
        approve(refund(plan, first, "30")); decimal("0", current(plan).getReceivedAmount(), "all selected original receipts are completely refunded");
        check(business.reopening.inspect(opportunity.getOpportunityId()).allowed(), "all original receipts and allocations reconciled permits reopening");
        equal(original, fixture.json.writeValueAsString(business.allocations(second.getEventId())), "refund and inspection preserve original receipt allocations");
        fixture.jdbc.update("UPDATE crm_deal_allocation SET dept_id=99999 WHERE reversal_of_id IN (SELECT original.allocation_id FROM (SELECT allocation_id FROM crm_deal_allocation WHERE event_id=?) original)", second.getEventId());
        blocked(opportunity, "aggregate zero cannot hide wrong frozen member refund");
        fixture.jdbc.update("UPDATE crm_deal_allocation SET dept_id=100 WHERE reversal_of_id IN (SELECT original.allocation_id FROM (SELECT allocation_id FROM crm_deal_allocation WHERE event_id=?) original)", second.getEventId());
        business.reopening.restore(opportunity.getOpportunityId(), business.request(opportunity));
        decimal("0", business.balance(opportunity.getOpportunityId()), "fully reconciled receipts permit exact winning reversal");
        CrmOpportunity deleted = business.won("deleted receivable still has cash"); CrmReceivable deletedPlan = plan(deleted, contract(deleted)); receipt(deletedPlan, "1");
        fixture.jdbc.update("UPDATE crm_receivable SET deleted=1 WHERE receivable_id=?", deletedPlan.getReceivableId()); blocked(deleted, "soft-deleted receivable with confirmed cash");
    }

    private void invoiceSources() {
        CrmOpportunity opportunity = business.won("pending invoice receipt"); Long contractId = contract(opportunity); CrmReceivable plan = plan(opportunity, contractId); String marker = "RI_" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO oa_invoice(tenant_id,invoice_direction,invoice_code,invoice_no,customer_id,contract_id,receivable_id,status,deleted) VALUES(100000,'OUTPUT',?,?,?, ?,?,'BOUND',0)",
                marker, marker, opportunity.getCustomerId(), contractId, plan.getReceivableId());
        Long invoiceId = fixture.scalar("SELECT invoice_id FROM oa_invoice WHERE tenant_id=100000 AND invoice_no=?", marker);
        fixture.jdbc.update("INSERT INTO oa_invoice_writeoff(tenant_id,invoice_id,business_type,business_id,writeoff_amount,writeoff_date) VALUES(100000,?,'CRM_RECEIVABLE',?,1,CURRENT_DATE)", invoiceId, plan.getReceivableId());
        blocked(opportunity, "invoice has actual receipt awaiting CRM synchronization");
        fixture.jdbc.update("DELETE FROM oa_invoice WHERE invoice_id=?", invoiceId); blocked(opportunity, "orphaned invoice receipt source cannot disappear from validation");
    }

    private void concurrency() throws Exception {
        CrmOpportunity opportunity = business.won("receipt races restore"); Long contractId = contract(opportunity); CrmReceivable plan = plan(opportunity, contractId);
        CountDownLatch held = new CountDownLatch(1); CountDownLatch attempted = new CountDownLatch(1); TransactionTemplate transactions = new TransactionTemplate(fixture.manager);
        transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        Callable<Integer> payer = () -> transactions.execute(status -> {
            receipt(plan, "10"); held.countDown(); awaitWait(attempted); return 1;
        });
        Callable<Integer> restorer = () -> { check(held.await(5, TimeUnit.SECONDS), "receipt transaction has updated durable cash"); attempted.countDown(); blocked(opportunity, "committing receipt wins before restore"); return 1; };
        int[] receiptRace = fixture.parallel(payer, restorer); equal(2, receiptRace[0] + receiptRace[1], "receipt and restore finish without lock-order deadlock");
        CrmOpportunity confirming = business.won("confirmation races restore"); Long nextContract = contract(confirming);
        CountDownLatch signed = new CountDownLatch(1); CountDownLatch inspecting = new CountDownLatch(1);
        Callable<Integer> signer = () -> transactions.execute(status -> {
            fixture.jdbc.queryForObject("SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND contract_id=? FOR UPDATE", Long.class, nextContract);
            publish(signed(confirming, nextContract)); signed.countDown(); awaitWait(inspecting); return 1;
        });
        Callable<Integer> restoreSigned = () -> { check(signed.await(5, TimeUnit.SECONDS), "new confirmation owns contract row"); inspecting.countDown(); blocked(confirming, "committing unconsumed confirmation wins before restore"); return 1; };
        int[] contractRace = fixture.parallel(signer, restoreSigned); equal(2, contractRace[0] + contractRace[1], "confirmation and restoration finish with source re-read after lock wait");
    }

    private void awaitWait(CountDownLatch started) {
        try {
            check(started.await(5, TimeUnit.SECONDS), "competing restore begins"); long waiting = 0;
            for (int attempt = 0; attempt < 60 && waiting == 0; attempt++) { waiting = fixture.scalar("SELECT COUNT(*) FROM performance_schema.data_lock_waits"); if (waiting == 0) Thread.sleep(50); }
            check(waiting > 0, "actual InnoDB lock wait separates financial commit from restore validation");
        } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
    }
}
