package com.cloudflow.crm.service.impl;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.common.event.invoice.InvoiceReceiptSource;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.CrmReceivableWriteoffDTO;
import com.cloudflow.crm.domain.dto.ReceivableInvoiceSyncDTO;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmInvoiceReceiptMapper;
import com.cloudflow.crm.service.receivable.CrmInvoiceReceiptService;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.springframework.transaction.support.TransactionTemplate;
import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmInvoiceReceiptDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmReceivableServiceImpl service;
    private final CrmInvoiceReceiptService receipts;
    private final CrmCustomer customer;

    private CrmInvoiceReceiptDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; service = fixture.bean(CrmReceivableServiceImpl.class);
        receipts = fixture.bean(CrmInvoiceReceiptService.class); customer = fixture.customer("invoice source");
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount(); identity();
        CrmInvoiceReceiptDatabaseChecks checks = new CrmInvoiceReceiptDatabaseChecks(fixture);
        checks.envelopes(); checks.historyAndReplay(); checks.pendingAndRollback(); checks.competition(); checks.boundary();
        System.out.println("H3_INVOICE_RECEIPT_CRM_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; concurrency_groups=2; mysql=true; transactions=true; source_fixture=true; oa_http=false; receipt_allocations=true; refund_allocations=false; production_modified=false");
    }

    private CrmReceivable plan() {
        CrmReceivable record = new CrmReceivable(); record.setCustomerId(customer.getCustomerId()); record.setReceivableName("invoice source " + UUID.randomUUID());
        record.setPlannedAmount(new BigDecimal("100")); service.createReceivable(record); return current(record);
    }

    private CrmReceivable current(CrmReceivable record) { return service.getAccessibleReceivable(record.getReceivableId()); }

    private Long invoice(CrmReceivable record) {
        String number = "SOURCE-" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO oa_invoice (tenant_id,invoice_direction,invoice_code,invoice_no,gross_amount,customer_id,receivable_id,status,version) VALUES (100000,'OUTPUT',?,?,100,?,?,'BOUND',0)", number, number, customer.getCustomerId(), record.getReceivableId());
        return fixture.scalar("SELECT invoice_id FROM oa_invoice WHERE tenant_id=100000 AND invoice_no=?", number);
    }

    private BusinessEventEnvelope source(CrmReceivable record, Long invoiceId, String operation, String amount) throws Exception {
        CrmReceivable current = current(record);
        BigDecimal before = current.getReceivedAmount().add(fixture.mapper(CrmInvoiceReceiptMapper.class).pendingAmount(record.getReceivableId(), 100000L));
        int invoiceVersion = (int) fixture.scalar("SELECT version FROM oa_invoice WHERE invoice_id=?", invoiceId) + 1;
        fixture.jdbc.update("UPDATE oa_invoice SET version=?,status=? WHERE invoice_id=?", invoiceVersion, "VOID".equals(operation) ? "VOID" : "BOUND", invoiceId);
        InvoiceReceiptSource source = new InvoiceReceiptSource(); source.setTenantId(100000L); source.setOperation(operation);
        source.setInvoiceId(invoiceId); source.setInvoiceVersion(invoiceVersion); source.setReceivableId(record.getReceivableId());
        source.setReceivableVersion(current.getVersion()); source.setCustomerId(customer.getCustomerId()); source.setCurrency("CNY");
        source.setGrossAmount(new BigDecimal("100")); source.setReceivedBefore(before); source.setReceiptAmount(new BigDecimal(amount));
        source.setReceivedAfter(before.add(source.getReceiptAmount())); source.setOccurredTime(LocalDateTime.now().withNano(0));
        source.setReceiptDate(LocalDate.now()); source.setTeamVersion(0);
        if ("RECEIPT".equals(operation)) {
            String marker = UUID.randomUUID().toString();
            fixture.jdbc.update("INSERT INTO oa_invoice_writeoff (tenant_id,invoice_id,business_type,business_id,writeoff_amount,writeoff_date,remark) VALUES (100000,?,'CRM_RECEIVABLE',?,?,?,?)",
                    invoiceId, record.getReceivableId(), source.getReceiptAmount(), source.getReceiptDate(), marker);
            source.setWriteoffId(fixture.scalar("SELECT writeoff_id FROM oa_invoice_writeoff WHERE tenant_id=100000 AND remark=?", marker));
            source.setMembers(List.of(new InvoiceReceiptSource.Member(1L, 1L, "Frozen owner", 100L, "OWNER", new BigDecimal("0.6"), null),
                    new InvoiceReceiptSource.Member(2L, 2L, "Frozen seller", 101L, "CO_SELLER", new BigDecimal("0.4"), null)));
        }
        String payload = fixture.json.writeValueAsString(source);
        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().eventId(source.eventId()).eventType(InvoiceReceiptSource.EVENT)
                .sourceId(invoiceId).sourceModule(InvoiceReceiptSource.SERVICE).tenantId(100000L).occurredAt(source.getOccurredTime())
                .payload(payload).payloadDigest(InvoiceReceiptSource.digest(payload)).build();
        fixture.bean(OutboxPublisher.class).publishOnceAt(envelope, null);
        com.fasterxml.jackson.databind.node.ObjectNode serialized = fixture.json.valueToTree(envelope);
        serialized.put("occurredAt", source.getOccurredTime().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        fixture.jdbc.update("UPDATE outbox_event SET payload_json=? WHERE tenant_id=100000 AND event_id=?", serialized.toString(), envelope.getEventId());
        return envelope;
    }

    private void envelopes() throws Exception {
        LocalDateTime expected = LocalDateTime.of(2026, 1, 2, 3, 4, 5);
        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().eventId(UUID.randomUUID().toString()).eventType(InvoiceReceiptSource.EVENT)
                .tenantId(100000L).sourceModule(InvoiceReceiptSource.SERVICE).sourceId(1L).occurredAt(expected).payload("{ \"amount\" : 20 }").build();
        for (String format : List.of("2026-01-02T03:04:05", "2026-01-02T03:04:05+08:00", "2026-01-02 03:04:05")) {
            com.fasterxml.jackson.databind.node.ObjectNode serialized = fixture.json.valueToTree(envelope); serialized.put("occurredAt", format);
            BusinessEventEnvelope decoded = BusinessEventEnvelopeCodec.read(serialized.toString(), fixture.json);
            equal(expected, decoded.getOccurredAt(), "live and persisted envelopes share timestamp decoding: " + format);
            equal(envelope.getPayload(), decoded.getPayload(), "timestamp normalization never rewrites signed payload bytes");
            equal(expected, BusinessEventEnvelopeCodec.read(fixture.json.writeValueAsString(serialized.toString()), fixture.json).getOccurredAt(), "wrapped stream envelope uses the same decoder");
        }
    }

    private void sync(CrmReceivable record, BusinessEventEnvelope envelope) {
        ReceivableInvoiceSyncDTO request = new ReceivableInvoiceSyncDTO(); request.setEventId(envelope.getEventId());
        service.syncInvoiceStatus(record.getReceivableId(), request);
    }

    private void amount(CrmReceivable record, String amount) {
        decimal(amount, current(record).getReceivedAmount(), "confirmed CRM total is exact");
        decimal(new BigDecimal("100").subtract(new BigDecimal(amount)).toPlainString(), current(record).getOutstandingAmount(), "remaining is exact");
    }

    private long events(CrmReceivable record) { return fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=?", record.getReceivableId()); }

    private void historyAndReplay() throws Exception {
        CrmReceivable record = plan(); CrmReceivableWriteoffDTO history = new CrmReceivableWriteoffDTO();
        history.setVersion(record.getVersion()); history.setAmount(new BigDecimal("30")); history.setWriteoffDate(LocalDate.now());
        service.writeoffReceivable(record.getReceivableId(), history);
        long factsBefore = events(record); Long invoiceId = invoice(record);
        BusinessEventEnvelope bound = source(record, invoiceId, "BOUND", "0"); sync(record, bound);
        amount(record, "30"); equal(factsBefore, events(record), "binding cannot turn historical 30 into a new receipt fact");
        int version = current(record).getVersion(); receipts.consume(bound);
        equal(version, current(record).getVersion(), "duplicate binding does not touch version");
        BusinessEventEnvelope received = source(record, invoiceId, "RECEIPT", "20"); sync(record, received);
        amount(record, "50"); equal(factsBefore + 1, events(record), "20 creates one independent real receipt fact");
        decimal("50", fixture.jdbc.queryForObject("SELECT SUM(amount) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=?", BigDecimal.class, record.getReceivableId()), "binding preserves original 30 plus new 20 without duplication");
        decimal("42", allocation(record, 1L), "owner keeps original 30 plus new frozen 12"); decimal("8", allocation(record, 2L), "frozen collaborator allocation is 8");
        equal(3L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_allocation allocation JOIN crm_deal_event event ON event.event_id=allocation.event_id WHERE event.biz_type='RECEIVABLE' AND event.biz_id=? AND allocation.commission_status='UNCONFIRMED' AND allocation.comp_change_id IS NULL", record.getReceivableId()), "unconfirmed commission creates no salary posting");
        version = current(record).getVersion(); sync(record, received); receipts.consume(received); sync(record, bound);
        amount(record, "50"); equal(version, current(record).getVersion(), "HTTP and stream duplicates both leave version unchanged");
        Long selected = fixture.jdbc.queryForObject("SELECT event_id FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=? AND amount=20 AND reversal_of_id IS NULL", Long.class, record.getReceivableId());
        Long approvalId = fixture.refundWorkflow.submit(record, selected, current(record).getVersion(), new BigDecimal("10"), "invoice replay check");
        CrmApproval approval = fixture.mapper(CrmApprovalMapper.class).selectById(approvalId);
        ApprovalResultDTO callback = fixture.refundWorkflow.completedFixture(approval, true);
        fixture.bean(CrmRefundApprovalHandler.class).handleApproved(callback); amount(record, "40");
        sync(record, received); sync(record, bound); amount(record, "40");
        BusinessEventEnvelope later = source(record, invoiceId, "RECEIPT", "15"); receipts.consume(later); amount(record, "55");
        BusinessEventEnvelope earlier = source(record, invoiceId, "RECEIPT", "5");
        BusinessEventEnvelope newest = source(record, invoiceId, "RECEIPT", "10");
        receipts.consume(newest); receipts.consume(earlier); amount(record, "70"); equal(factsBefore + 5, events(record), "out of order delivery preserves each original receipt and the selected refund once");
        BusinessEventEnvelope voided = source(record, invoiceId, "VOID", "0"); receipts.consume(voided);
        receipts.consume(bound); receipts.consume(received); amount(record, "70"); equal("VOID", current(record).getInvoiceStatus(), "old bound and receipt notifications cannot resurrect a void invoice");
    }

    private BigDecimal allocation(CrmReceivable record, Long userId) {
        return fixture.jdbc.queryForObject("SELECT SUM(allocation.allocated_amount) FROM crm_deal_allocation allocation JOIN crm_deal_event event ON event.event_id=allocation.event_id WHERE event.biz_type='RECEIVABLE' AND event.biz_id=? AND allocation.sales_user_id=?", BigDecimal.class, record.getReceivableId(), userId);
    }

    private void pendingAndRollback() throws Exception {
        CrmReceivable record = plan(); Long invoiceId = invoice(record);
        fails(IllegalArgumentException.class, () -> service.confirmReceipt(record.getReceivableId(), record.getVersion()), "physical OA binding blocks CRM before notification arrives");
        fails(IllegalArgumentException.class, () -> service.removeReceivables(List.of(record.getReceivableId())), "physical OA binding blocks premature plan deletion");
        BusinessEventEnvelope received = source(record, invoiceId, "RECEIPT", "20");
        CrmReceivable smaller = current(record); smaller.setPlannedAmount(new BigDecimal("10"));
        fails(IllegalArgumentException.class, () -> service.updateReceivable(smaller), "pending real invoice receipt prevents plan shrinking below cash");
        fails(IllegalStateException.class, () -> fixture.bean(TransactionTemplate.class).execute(status -> {
            receipts.consume(received); throw new IllegalStateException("fixture rollback");
        }), "outer failure rolls back CRM cash and source fact atomically");
        amount(record, "0"); equal(0L, events(record), "failed application leaves no consumed marker");
        decimal("20", fixture.mapper(CrmInvoiceReceiptMapper.class).pendingAmount(record.getReceivableId(), 100000L), "pending source remains available for retry");
        receipts.consume(received); amount(record, "20");
        decimal("0", fixture.mapper(CrmInvoiceReceiptMapper.class).pendingAmount(record.getReceivableId(), 100000L), "committed fact removes pending delta once");
    }

    private int concurrent(CountDownLatch start, BusinessEventEnvelope envelope) throws Exception {
        start.countDown(); if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("invoice source concurrency barrier timeout");
        receipts.consume(envelope); return 1;
    }

    private void competition() throws Exception {
        CrmReceivable duplicate = plan(); Long invoiceId = invoice(duplicate);
        BusinessEventEnvelope source = source(duplicate, invoiceId, "RECEIPT", "20");
        CountDownLatch firstStart = new CountDownLatch(2);
        int[] repeated = fixture.parallel(() -> concurrent(firstStart, source), () -> concurrent(firstStart, source));
        equal(2, repeated[0] + repeated[1], "both duplicate deliveries finish idempotently"); amount(duplicate, "20"); equal(1L, events(duplicate), "concurrent duplicates create one fact");
        CrmReceivable distinct = plan(); Long secondInvoice = invoice(distinct);
        BusinessEventEnvelope first = source(distinct, secondInvoice, "RECEIPT", "20");
        BusinessEventEnvelope second = source(distinct, secondInvoice, "RECEIPT", "30");
        CountDownLatch secondStart = new CountDownLatch(2);
        int[] concurrent = fixture.parallel(() -> concurrent(secondStart, first), () -> concurrent(secondStart, second));
        equal(2, concurrent[0] + concurrent[1], "distinct source deliveries both commit"); amount(distinct, "50"); equal(2L, events(distinct), "distinct concurrent receipts retain both facts");
    }

    private void boundary() throws Exception {
        CrmReceivable record = plan(); Long invoiceId = invoice(record); BusinessEventEnvelope valid = source(record, invoiceId, "RECEIPT", "20");
        BusinessEventEnvelope forged = fixture.json.readValue(fixture.json.writeValueAsString(valid), BusinessEventEnvelope.class);
        forged.setPayload(valid.getPayload().replace("Frozen owner", "Changed owner")); forged.setPayloadDigest(InvoiceReceiptSource.digest(forged.getPayload()));
        fails(IllegalArgumentException.class, () -> receipts.consume(forged), "same source identity with different payload is rejected");
        CrmReceivable other = plan(); fails(IllegalArgumentException.class, () -> sync(other, valid), "valid source cannot target another receivable");
        fails(IllegalArgumentException.class, () -> receipts.synchronize(record.getReceivableId(), UUID.randomUUID().toString()), "unknown durable source is rejected");
        identity(100001L, 1L, 0);
        try { fails(IllegalArgumentException.class, () -> receipts.consume(valid), "another tenant cannot consume source by event ID"); }
        finally { identity(); }
        InvoiceReceiptSource payload = fixture.json.readValue(valid.getPayload(), InvoiceReceiptSource.class);
        fixture.jdbc.update("UPDATE oa_invoice_writeoff SET writeoff_amount=21 WHERE writeoff_id=?", payload.getWriteoffId());
        fails(IllegalArgumentException.class, () -> receipts.consume(valid), "persisted writeoff amount must match source evidence");
        fixture.jdbc.update("UPDATE oa_invoice_writeoff SET writeoff_amount=20 WHERE writeoff_id=?", payload.getWriteoffId());
        invalidSource(record, valid, source -> source.setGrossAmount(null), "missing gross amount is rejected without null pointer failure");
        invalidSource(record, valid, source -> source.setGrossAmount(new BigDecimal("-1")), "negative source gross amount is rejected");
        invalidSource(record, valid, source -> source.setGrossAmount(new BigDecimal("100.001")), "source gross precision is verified");
        invalidSource(record, valid, source -> source.setReceivedBefore(null), "missing receipt baseline is rejected");
        invalidSource(record, valid, source -> source.setInvoiceId(null), "missing invoice identity is rejected");
        invalidSource(record, valid, source -> source.setReceivableId(null), "missing plan identity is rejected");
        invalidSource(record, valid, source -> source.setCustomerId(null), "missing customer identity is rejected");
        invalidSource(record, valid, source -> source.setCurrency(null), "missing currency is rejected");
        invalidSource(record, valid, source -> source.setTeamVersion(null), "missing team version is rejected");
        invalidSource(record, valid, source -> source.setMembers(java.util.Arrays.asList((InvoiceReceiptSource.Member) null)), "null frozen member is rejected without null pointer failure");
        amount(record, "0"); equal(0L, events(record), "rejected sources leave no cash facts");
        receipts.consume(valid); amount(record, "20");
    }

    private void invalidSource(CrmReceivable record, BusinessEventEnvelope valid, Consumer<InvoiceReceiptSource> change, String label) throws Exception {
        InvoiceReceiptSource source = fixture.json.readValue(valid.getPayload(), InvoiceReceiptSource.class); change.accept(source);
        String original = fixture.jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE tenant_id=100000 AND event_id=?", String.class, valid.getEventId());
        ObjectNode altered = (com.fasterxml.jackson.databind.node.ObjectNode) fixture.json.readTree(original);
        String payload = fixture.json.writeValueAsString(source);
        altered.put("payload", payload); altered.put("payloadDigest", InvoiceReceiptSource.digest(payload));
        fixture.jdbc.update("UPDATE outbox_event SET payload_json=? WHERE tenant_id=100000 AND event_id=?", altered.toString(), valid.getEventId());
        try { fails(IllegalArgumentException.class, () -> sync(record, valid), label); }
        finally { fixture.jdbc.update("UPDATE outbox_event SET payload_json=? WHERE tenant_id=100000 AND event_id=?", original, valid.getEventId()); }
    }
}
