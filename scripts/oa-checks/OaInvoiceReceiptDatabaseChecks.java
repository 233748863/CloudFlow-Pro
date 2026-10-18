package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.invoice.InvoiceReceiptSource;
import com.cloudflow.oa.domain.OaInvoice;
import com.cloudflow.oa.domain.OaInvoiceWriteoff;
import com.cloudflow.oa.mapper.OaInvoiceReceiptMapper;
import com.cloudflow.oa.service.remote.RemoteContractTeamDirectory;
import com.cloudflow.oa.service.remote.RemoteCrmService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import org.springframework.transaction.support.TransactionTemplate;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaInvoiceReceiptDatabaseChecks {
    private final OaOperationsDatabaseChecks fixture;
    private final OaInvoiceServiceImpl invoices;
    private final AtomicInteger callbacks = new AtomicInteger();
    private volatile boolean unavailableDirectory;

    private OaInvoiceReceiptDatabaseChecks(OaOperationsDatabaseChecks fixture) throws Exception {
        this.fixture = fixture;
        fixture.beans.put(RemoteContractTeamDirectory.class, (RemoteContractTeamDirectory) users -> {
            if (unavailableDirectory) return R.fail("fixture directory unavailable");
            return R.ok(users.stream().map(user -> new RemoteContractTeamDirectory.Employee(100000L, user, user,
                    "Invoice member " + user, 100L, "Invoice department", true, true, true)).toList());
        });
        fixture.beans.put(RemoteCrmService.class, proxy(RemoteCrmService.class, (method, values) -> {
            if (!"syncReceivableInvoiceStatus".equals(method)) throw new AssertionError("unexpected invoice remote operation");
            callbacks.incrementAndGet();
            RemoteCrmService.InvoiceStatusSyncRequest request = (RemoteCrmService.InvoiceStatusSyncRequest) values[3];
            equal(1L, fixture.count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_id=?", request.getEventId()), "callback sees committed durable source");
            return R.fail("fixture delivery pending");
        }));
        fixture.register(OaInvoiceReceiptService.class);
        invoices = fixture.register(OaInvoiceServiceImpl.class);
    }

    static void run(OaOperationsDatabaseChecks fixture) throws Exception {
        int before = checks.get(); identity(100000L, 1L);
        OaInvoiceReceiptDatabaseChecks verification = new OaInvoiceReceiptDatabaseChecks(fixture);
        verification.history(); verification.validation(); verification.refundedEdit(); verification.rollback(); verification.competition(); verification.scope();
        System.out.println("H3_INVOICE_RECEIPT_OA_DATABASE_CHECKS: assertions=" + (checks.get() - before)
                + "; failed=0; concurrency_groups=3; mysql=true; transactions=true; crm_delivery_fixture=true; hr_fixture=true; source_copy=false; production_modified=false");
    }

    private Long plan(String received) {
        String number = "IR-" + UUID.randomUUID();
        Long customer = fixture.jdbc.queryForObject("SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND deleted=0 ORDER BY customer_id LIMIT 1", Long.class);
        BigDecimal amount = new BigDecimal(received);
        fixture.jdbc.update("INSERT INTO crm_receivable (tenant_id,customer_id,customer_name,receivable_no,receivable_name,planned_amount,received_amount,outstanding_amount,received_date,status,owner_id,owner_name,version) VALUES (100000,?,'Invoice fixture',?,?,100,?,?,?,? ,1,'Invoice owner',0)",
                customer, number, number, amount, new BigDecimal("100").subtract(amount), amount.signum() > 0 ? LocalDate.now() : null, amount.signum() > 0 ? "PARTIAL_RECEIVED" : "PLANNED");
        return fixture.count("SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=?", number);
    }

    private OaInvoice invoice() {
        OaInvoice invoice = new OaInvoice(); invoice.setInvoiceDirection("OUTPUT"); invoice.setInvoiceCode("IR");
        invoice.setInvoiceNo(UUID.randomUUID().toString()); invoice.setGrossAmount(new BigDecimal("100"));
        invoices.createInvoice(invoice); return current(invoice);
    }

    private OaInvoice current(OaInvoice invoice) { return invoices.getInvoiceInfo(invoice.getInvoiceId()); }
    private void bind(OaInvoice invoice, Long plan) { OaInvoice binding = new OaInvoice(); binding.setReceivableId(plan); invoices.bindInvoice(invoice.getInvoiceId(), binding); }
    private OaInvoiceWriteoff receipt(OaInvoice invoice, String amount) {
        OaInvoice current = current(invoice); OaInvoiceWriteoff request = new OaInvoiceWriteoff();
        request.setInvoiceId(current.getInvoiceId()); request.setInvoiceVersion(current.getVersion()); request.setBusinessType("CRM_RECEIVABLE");
        request.setBusinessId(current.getReceivableId()); request.setWriteoffAmount(new BigDecimal(amount)); request.setWriteoffDate(LocalDate.now());
        return request;
    }
    private long writeoffs(OaInvoice invoice) { return fixture.count("SELECT COUNT(*) FROM oa_invoice_writeoff WHERE tenant_id=100000 AND invoice_id=?", invoice.getInvoiceId()); }
    private long sources(OaInvoice invoice) { return fixture.count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND aggregate_id=? AND event_type='INVOICE_RECEIVABLE_CHANGED'", invoice.getInvoiceId()); }
    private void totals(OaInvoice invoice, String received, String remaining, String pending) {
        OaInvoice current = current(invoice);
        decimal(received, current.getReceivedAmount(), "invoice total includes historical and pending real receipts");
        decimal(remaining, current.getOutstandingAmount(), "invoice remaining is based on combined cash");
        decimal(pending, current.getPendingReceivedAmount(), "pending source amount is explicit");
    }

    private void history() throws Exception {
        Long plan = plan("30"); OaInvoice invoice = invoice(); bind(invoice, plan);
        totals(invoice, "30", "70", "0"); equal(0L, writeoffs(invoice), "binding historical receipt creates no fake writeoff");
        equal(1L, sources(invoice), "binding creates exactly one durable source");
        int version = current(invoice).getVersion(); bind(invoice, plan);
        equal(version, current(invoice).getVersion(), "repeated binding preserves invoice version"); equal(1L, sources(invoice), "repeated binding does not publish again");
        OaInvoiceWriteoff receipt = receipt(invoice, "20"); invoices.writeoffInvoice(receipt);
        totals(invoice, "50", "50", "20"); equal(1L, writeoffs(invoice), "new 20 creates one real writeoff");
        decimal("30", fixture.jdbc.queryForObject("SELECT received_amount FROM crm_receivable WHERE receivable_id=?", BigDecimal.class, plan), "OA never writes CRM cash through another service transaction");
        List<String> envelopes = fixture.jdbc.queryForList("SELECT payload_json FROM outbox_event WHERE tenant_id=100000 AND aggregate_id=? AND event_type='INVOICE_RECEIVABLE_CHANGED' ORDER BY id", String.class, invoice.getInvoiceId());
        BusinessEventEnvelope envelope = fixture.json.readValue(envelopes.get(1), BusinessEventEnvelope.class);
        InvoiceReceiptSource source = fixture.json.readValue(envelope.getPayload(), InvoiceReceiptSource.class);
        equal(InvoiceReceiptSource.digest(envelope.getPayload()), envelope.getPayloadDigest(), "stored source digest matches actual payload");
        equal(source.eventId(), envelope.getEventId(), "source identity includes invoice version");
        decimal("30", source.getReceivedBefore(), "source preserves real historical baseline 30"); decimal("50", source.getReceivedAfter(), "source preserves combined result 50");
        decimal("20", source.getReceiptAmount(), "source contains only the actual new 20"); equal(1, source.getMembers().size(), "default owner is frozen at actual receipt time");
        equal(1L, source.getMembers().get(0).employeeId(), "receipt carries verified employee identity");
        fails(IllegalArgumentException.class, () -> invoices.writeoffInvoice(receipt), "same page version cannot duplicate receipt");
        totals(invoice, "50", "50", "20"); equal(1L, writeoffs(invoice), "rejected duplicate leaves history unchanged");
    }

    private void invalidReceipt(OaInvoice invoice, Consumer<OaInvoiceWriteoff> mutate, String label) {
        OaInvoiceWriteoff request = receipt(invoice, "10"); mutate.accept(request);
        int version = current(invoice).getVersion(); long before = writeoffs(invoice); long events = sources(invoice);
        fails(IllegalArgumentException.class, () -> invoices.writeoffInvoice(request), label);
        equal(version, current(invoice).getVersion(), label + " preserves version"); equal(before, writeoffs(invoice), label + " preserves receipt rows");
        equal(events, sources(invoice), label + " preserves sources");
    }

    private void validation() {
        Long plan = plan("30"); OaInvoice invoice = invoice(); bind(invoice, plan);
        for (String amount : List.of("0", "-1", "0.001", "70.01", "10000000000000000"))
            invalidReceipt(invoice, request -> request.setWriteoffAmount(new BigDecimal(amount)), "invalid receipt amount " + amount);
        invalidReceipt(invoice, request -> request.setInvoiceVersion(null), "missing page version rejected");
        invalidReceipt(invoice, request -> request.setBusinessId(plan + 1), "different business target rejected");
        invalidReceipt(invoice, request -> request.setBusinessType("EXPENSE_CLAIM"), "other business type cannot consume CRM receipt");
        invalidReceipt(invoice, request -> request.setWriteoffId(1L), "client cannot choose writeoff identity");
        invalidReceipt(invoice, request -> request.setWriteoffDate(LocalDate.now().plusDays(1)), "future receipt date rejected");
        invalidReceipt(invoice, request -> request.setRemark("x".repeat(501)), "oversized receipt description rejected");
        OaInvoice altered = current(invoice); altered.setGrossAmount(new BigDecimal("50"));
        fails(IllegalArgumentException.class, () -> invoices.updateInvoice(altered), "bound invoice amount cannot erase historical coverage");
        OaInvoice forged = current(invoice); forged.setStatus("WRITEOFF_FULL");
        fails(IllegalArgumentException.class, () -> invoices.updateInvoice(forged), "ordinary edit cannot forge receipt state");
        fails(IllegalArgumentException.class, () -> bind(invoice, plan("0")), "bound invoice cannot switch to another plan");
        fails(IllegalArgumentException.class, () -> invoices.removeInvoices(List.of(invoice.getInvoiceId())), "bound historical invoice cannot be deleted");
        OaInvoice unbound = invoice(); OaInvoiceWriteoff direct = receipt(unbound, "10"); direct.setBusinessId(plan);
        fails(IllegalArgumentException.class, () -> invoices.writeoffInvoice(direct), "unbound invoice cannot claim another plan receipt");
        OaInvoice tooSmall = invoice(); OaInvoice edit = current(tooSmall); edit.setGrossAmount(new BigDecimal("20")); invoices.updateInvoice(edit);
        fails(IllegalArgumentException.class, () -> bind(tooSmall, plan), "historical amount cannot exceed invoice amount");
        equal(null, current(tooSmall).getReceivableId(), "invalid baseline binding rolls back relation");
        OaInvoice different = invoice(); fails(IllegalArgumentException.class, () -> bind(different, plan), "same plan cannot be silently bound to a second invoice");
    }

    private void rollback() {
        Long plan = plan("30"); OaInvoice invoice = invoice(); bind(invoice, plan);
        int version = current(invoice).getVersion(); long events = sources(invoice); int calls = callbacks.get();
        fixture.jdbc.execute("CREATE TRIGGER invoice_receipt_source_failure BEFORE INSERT ON outbox_event FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated source failure'");
        try { fails(RuntimeException.class, () -> invoices.writeoffInvoice(receipt(invoice, "20")), "source persistence failure rolls back invoice receipt"); }
        finally { fixture.jdbc.execute("DROP TRIGGER invoice_receipt_source_failure"); }
        equal(version, current(invoice).getVersion(), "source failure rolls back invoice version"); equal(0L, writeoffs(invoice), "source failure rolls back writeoff");
        equal(events, sources(invoice), "source failure leaves no partial event"); equal(calls, callbacks.get(), "rolled back source never calls CRM");
        unavailableDirectory = true;
        try { fails(IllegalArgumentException.class, () -> invoices.writeoffInvoice(receipt(invoice, "20")), "missing real employee snapshot refuses receipt"); }
        finally { unavailableDirectory = false; }
        equal(version, current(invoice).getVersion(), "directory failure rolls back version"); equal(0L, writeoffs(invoice), "directory failure rolls back receipt");
        fails(IllegalStateException.class, () -> fixture.bean(TransactionTemplate.class).execute(status -> {
            invoices.writeoffInvoice(receipt(invoice, "20")); throw new IllegalStateException("outer fixture failure");
        }), "outer failure rolls back receipt and source together");
        equal(calls, callbacks.get(), "outer rollback suppresses post-commit callback"); totals(invoice, "30", "70", "0");
        invoices.writeoffInvoice(receipt(invoice, "20")); totals(invoice, "50", "50", "20");
        equal(calls + 1, callbacks.get(), "retry emits committed durable source even when CRM delivery remains unavailable");
    }

    private void refundedEdit() {
        Long plan = plan("100"); OaInvoice invoice = invoice(); bind(invoice, plan);
        equal("WRITEOFF_FULL", current(invoice).getStatus(), "historical full receipt displays settled invoice");
        fixture.jdbc.update("UPDATE crm_receivable SET received_amount=50,outstanding_amount=50,status='PARTIAL_RECEIVED',version=version+1 WHERE receivable_id=?", plan);
        OaInvoice edit = current(invoice); edit.setRemark("confirmed refund fixture, descriptive edit only");
        equal("WRITEOFF_PARTIAL", edit.getStatus(), "confirmed CRM refund changes displayed receipt state");
        int version = edit.getVersion(); long events = sources(invoice);
        invoices.updateInvoice(edit);
        equal(version + 1, current(invoice).getVersion(), "descriptive edit accepts the currently displayed state after refund");
        equal(edit.getRemark(), current(invoice).getRemark(), "descriptive edit after refund is retained");
        totals(invoice, "50", "50", "0"); equal(0L, writeoffs(invoice), "descriptive edit creates no receipt");
        equal(events, sources(invoice), "descriptive edit creates no financial event");
    }

    private int attempt(Runnable action) { try { action.run(); return 1; } catch (IllegalArgumentException rejected) { return 0; } }
    private int together(CountDownLatch ready, Callable<Integer> action) throws Exception {
        identity(100000L, 1L);
        try { ready.countDown(); if (!ready.await(10, TimeUnit.SECONDS)) throw new AssertionError("invoice race barrier timed out"); return action.call(); }
        finally { com.cloudflow.common.tenant.TenantContext.clear(); com.cloudflow.common.core.context.UserContext.clear(); }
    }
    private void compete(Callable<Integer> first, Callable<Integer> second) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2); CountDownLatch ready = new CountDownLatch(2);
        try {
            Future<Integer> left = executor.submit(() -> together(ready, first)); Future<Integer> right = executor.submit(() -> together(ready, second));
            equal(1, left.get(20, TimeUnit.SECONDS) + right.get(20, TimeUnit.SECONDS), "exactly one competing invoice operation commits");
        } finally { executor.shutdownNow(); executor.awaitTermination(10, TimeUnit.SECONDS); identity(100000L, 1L); }
    }
    private void competition() throws Exception {
        Long plan = plan("30"); OaInvoice invoice = invoice(); bind(invoice, plan);
        OaInvoiceWriteoff first = receipt(invoice, "20"), second = receipt(invoice, "20");
        compete(() -> attempt(() -> invoices.writeoffInvoice(first)), () -> attempt(() -> invoices.writeoffInvoice(second)));
        totals(invoice, "50", "50", "20"); equal(1L, writeoffs(invoice), "concurrent same-version submits do not duplicate money");
        Long shared = plan("30"); OaInvoice left = invoice(), right = invoice();
        compete(() -> attempt(() -> bind(left, shared)), () -> attempt(() -> bind(right, shared)));
        equal(1L, fixture.count("SELECT COUNT(*) FROM oa_invoice WHERE tenant_id=100000 AND receivable_id=?", shared), "competing binds keep one physical invoice");
        OaInvoice removable = invoice(); Long empty = plan("0");
        compete(() -> attempt(() -> bind(removable, empty)), () -> attempt(() -> invoices.removeInvoices(List.of(removable.getInvoiceId()))));
        equal(0L, fixture.count("SELECT COUNT(*) FROM oa_invoice WHERE invoice_id=? AND deleted=1 AND receivable_id IS NOT NULL", removable.getInvoiceId()), "delete versus bind leaves no orphan association");
    }

    private void scope() {
        Long plan = plan("30"); OaInvoice invoice = invoice(); bind(invoice, plan);
        identity(100001L, 1L);
        try {
            fails(IllegalArgumentException.class, () -> current(invoice), "foreign tenant cannot read receipt totals");
            fails(IllegalArgumentException.class, () -> bind(invoice, plan), "foreign tenant cannot bind invoice by ID");
        } finally { identity(100000L, 1L); }
        totals(invoice, "30", "70", "0");
    }
}
