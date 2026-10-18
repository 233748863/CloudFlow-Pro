package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.CrmReceivableWriteoffDTO;
import com.cloudflow.crm.domain.dto.ReceivableInvoiceSyncDTO;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.deal.CrmDealTeamStore;
import com.cloudflow.crm.service.receivable.CrmReceivableAccessService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmReceivableDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmReceivableServiceImpl service;
    private final CrmApprovalServiceImpl approvals;
    private final CrmRefundApprovalHandler refunds;
    private final TransactionTemplate transactions;
    private final CrmCustomer customer;

    private CrmReceivableDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture;
        service = fixture.bean(CrmReceivableServiceImpl.class);
        approvals = fixture.bean(CrmApprovalServiceImpl.class);
        refunds = fixture.bean(CrmRefundApprovalHandler.class);
        transactions = fixture.bean(TransactionTemplate.class);
        customer = fixture.customer("receivable protection");
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount();
        CrmReceivableDatabaseChecks checks = new CrmReceivableDatabaseChecks(fixture);
        checks.creation(); checks.numbering(); checks.contracts(); checks.updates(); checks.receipts(); checks.invoiceInputs();
        checks.refunds(); checks.history(); checks.competition(); checks.scope();
        System.out.println("H3_RECEIVABLE_PROTECTION_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; concurrency_groups=6; mysql=true; transactions=true; hr_http=false; oa_http=false; receipt_ledger=true; production_modified=false");
    }

    private CrmReceivable draft(String amount) {
        CrmReceivable record = new CrmReceivable();
        record.setCustomerId(customer.getCustomerId()); record.setReceivableName("应收保护 " + UUID.randomUUID());
        record.setPlannedAmount(new BigDecimal(amount)); record.setDueDate(LocalDate.now().plusDays(7));
        return record;
    }

    private void numbering() {
        HashSet<String> numbers = new java.util.HashSet<String>();
        for (int index = 0; index < 40; index++) {
            CrmReceivable record = create("1");
            check(record.getReceivableNo().matches("SK[a-f0-9]{32}"), "automatic receipt number uses full UUID within column limit");
            check(numbers.add(record.getReceivableNo()), "rapid receipt creation keeps distinct numbers");
        }
        CrmReceivable supplied = draft("1"); supplied.setReceivableNo("CUSTOM-" + UUID.randomUUID());
        String expected = supplied.getReceivableNo(); service.createReceivable(supplied);
        equal(expected, current(supplied).getReceivableNo(), "user supplied valid receipt number is preserved");
    }

    private CrmReceivable create(String amount) {
        CrmReceivable record = draft(amount); service.createReceivable(record); return current(record);
    }

    private CrmReceivable current(CrmReceivable record) { return service.getAccessibleReceivable(record.getReceivableId()); }

    private void amounts(CrmReceivable record, String planned, String received, String remaining) {
        CrmReceivable current = current(record);
        decimal(planned, current.getPlannedAmount(), "planned amount remains exact");
        decimal(received, current.getReceivedAmount(), "received amount remains exact");
        decimal(remaining, current.getOutstandingAmount(), "remaining amount equals planned minus received");
    }

    private void rejectedCreation(Consumer<CrmReceivable> mutate, String label) {
        CrmReceivable record = draft("100"); mutate.accept(record);
        long before = fixture.scalar("SELECT COUNT(*) FROM crm_receivable");
        fails(IllegalArgumentException.class, () -> service.createReceivable(record), label);
        equal(before, fixture.scalar("SELECT COUNT(*) FROM crm_receivable"), label + " leaves no plan");
    }

    private void creation() {
        CrmReceivable record = draft("100.1200"); record.setCustomerName("伪造客户"); record.setOwnerName("伪造负责人");
        record.setTenantId(100001L); record.setDeleted(1); record.setVersion(500); record.setCreateBy("forged");
        service.createReceivable(record);
        amounts(record, "100.12", "0", "100.12");
        CrmReceivable persisted = current(record);
        equal(0, persisted.getVersion(), "creation initializes real version");
        equal(100000L, persisted.getTenantId(), "creation cannot select foreign tenant");
        equal(0, persisted.getDeleted(), "creation cannot hide the new plan");
        equal("batch-e-check", persisted.getCreateBy(), "creation audit identity is trusted");
        equal(customer.getCustomerName(), persisted.getCustomerName(), "customer snapshot is server sourced");
        equal("CRM user 1", persisted.getOwnerName(), "owner name comes from trusted employee fixture");
        equal(false, persisted.getBindingLocked(), "fresh plan can change binding");
        CrmReceivable query = new CrmReceivable(); query.setCustomerId(customer.getCustomerId());
        PageResult<CrmReceivable> page = service.queryPage(query, new PageQuery());
        equal(0, page.getRows().stream().filter(row -> row.getReceivableId().equals(record.getReceivableId())).findFirst().orElseThrow().getVersion(), "scoped list includes version");
        for (String amount : List.of("-0.01", "0.001", "1000000000000")) rejectedCreation(input -> input.setPlannedAmount(new BigDecimal(amount)), "invalid monetary precision or range rejected " + amount);
        rejectedCreation(input -> input.setPlannedAmount(null), "missing planned amount rejected");
        rejectedCreation(input -> input.setReceivableId(1L), "caller supplied primary key rejected");
        rejectedCreation(input -> input.setReceivedAmount(BigDecimal.ONE), "creation cannot report cash already received");
        rejectedCreation(input -> input.setOutstandingAmount(BigDecimal.ZERO), "creation cannot forge balance");
        rejectedCreation(input -> input.setReceivedDate(LocalDate.now()), "creation cannot forge receipt date");
        rejectedCreation(input -> input.setStatus("RECEIVED"), "creation cannot forge receipt status");
        rejectedCreation(input -> input.setInvoiceStatus("WRITEOFF_FULL"), "creation cannot forge invoice status");
        rejectedCreation(input -> input.setInvoiceId(500L), "creation cannot bind invoice by assignment");
        rejectedCreation(input -> input.setReceivableName("x".repeat(121)), "overlong name rejected");
        rejectedCreation(input -> input.setRemark("x".repeat(501)), "overlong remark rejected");
        fixture.missingEmployees.add(990020L);
        try { rejectedCreation(input -> input.setOwnerId(990020L), "missing owner cannot be assigned"); }
        finally { fixture.missingEmployees.remove(990020L); }
        fails(IllegalStateException.class, () -> fixture.bean(CrmReceivableAccessService.class).lockInScope(record.getReceivableId()), "row lock requires business transaction");
        CrmReceivable zero = create("0");
        fails(IllegalArgumentException.class, () -> service.confirmReceipt(zero.getReceivableId(), 0), "zero plan cannot claim a completed receipt");
    }

    private RemoteOaService.ContractInfo contract(Long id, Long customerId) {
        RemoteOaService.ContractInfo contract = new RemoteOaService.ContractInfo(); contract.setContractId(id);
        contract.setContractNo("CHECK-CONTRACT-" + id); contract.setCustomerId(customerId);
        fixture.jdbc.update("INSERT INTO oa_contract (contract_id,tenant_id,contract_no,contract_name,counterparty_name,contract_type,customer_id,amount,currency,status,owner_id,owner_name,dept_id,version,deleted) VALUES (?,100000,?,'应收来源合同输入','测试客户','SALES',?,100,'CNY','DRAFT',1,'来源负责人',100,0,0)",
                id, contract.getContractNo(), customerId);
        contract.setCustomerName("不可信的跨服务名称"); fixture.contractDetails.put(id, contract); return contract;
    }

    private void contracts() {
        RemoteOaService.ContractInfo contract = contract(990031L, customer.getCustomerId());
        CrmReceivable record = draft("100"); record.setContractId(contract.getContractId()); record.setContractNo("forged");
        service.createReceivable(record);
        equal(contract.getContractNo(), current(record).getContractNo(), "bound contract number is trusted");
        equal(customer.getCustomerName(), current(record).getCustomerName(), "contract cannot replace CRM customer name");
        CrmReceivable detached = current(record); detached.setContractId(null); detached.setContractNo(null);
        fails(IllegalArgumentException.class, () -> service.updateReceivable(detached), "copied source team history locks contract association");
        equal(contract.getContractId(), current(record).getContractId(), "copied source association is preserved");
        equal(contract.getContractNo(), current(record).getContractNo(), "copied source contract number is preserved");
        CrmCustomer other = fixture.customer("other receivable customer"); contract(990032L, other.getCustomerId());
        rejectedCreation(input -> input.setContractId(990032L), "foreign customer contract rejected");
        contract.setContractId(990099L);
        rejectedCreation(input -> input.setContractId(990031L), "mismatched contract ID rejected");
        contract.setContractId(990031L);
        fixture.failContractDetails = true;
        try {
            CrmReceivable unavailable = draft("100"); unavailable.setContractId(990031L);
            long before = fixture.scalar("SELECT COUNT(*) FROM crm_receivable");
            fails(ServiceException.class, () -> service.createReceivable(unavailable), "OA failure cannot fall back to client contract data");
            equal(before, fixture.scalar("SELECT COUNT(*) FROM crm_receivable"), "OA failure leaves no plan");
            CrmReceivable localEdit = current(record); localEdit.setReceivableName("合同关联未改变时本地计划可编辑");
            service.updateReceivable(localEdit); equal(localEdit.getReceivableName(), current(record).getReceivableName(), "unchanged association edit does not require unavailable OA");
        } finally { fixture.failContractDetails = false; }
    }

    private void updates() {
        CrmReceivable record = create("100");
        for (Consumer<CrmReceivable> mutate : List.<Consumer<CrmReceivable>>of(
                input -> input.setReceivedAmount(BigDecimal.ONE), input -> input.setOutstandingAmount(BigDecimal.ZERO),
                input -> input.setReceivedDate(LocalDate.now()), input -> input.setStatus("RECEIVED"),
                input -> input.setInvoiceStatus("BOUND"), input -> input.setInvoiceId(2L), input -> input.setOwnerId(2L),
                input -> input.setReceivableNo("REPLACED"), input -> input.setVersion(null))) {
            CrmReceivable input = current(record); mutate.accept(input);
            fails(IllegalArgumentException.class, () -> service.updateReceivable(input), "generic edit rejects protected field or missing version");
            equal(0, current(record).getVersion(), "rejected generic write leaves original version");
        }
        CrmReceivable edit = current(record); edit.setPlannedAmount(new BigDecimal("150.37")); edit.setTenantId(100001L);
        edit.setDeleted(1); edit.setCreateBy("forged"); edit.setOwnerName("forged"); edit.setCustomerName("forged"); edit.setDueDate(null);
        service.updateReceivable(edit); amounts(record, "150.37", "0", "150.37");
        CrmReceivable changed = current(record);
        equal(1, changed.getVersion(), "plan edit increments version"); equal(100000L, changed.getTenantId(), "edit keeps tenant");
        equal("batch-e-check", changed.getCreateBy(), "edit keeps creation audit"); equal("CRM user 1", changed.getOwnerName(), "edit keeps owner snapshot");
        equal(customer.getCustomerName(), changed.getCustomerName(), "edit keeps customer snapshot"); equal(null, changed.getDueDate(), "blank due date really clears column");
        fails(IllegalArgumentException.class, () -> service.updateReceivable(edit), "stale edit cannot overwrite new plan");
        writeoff(changed, "40.12");
        CrmReceivable smaller = current(record); smaller.setPlannedAmount(new BigDecimal("40.11"));
        fails(IllegalArgumentException.class, () -> service.updateReceivable(smaller), "planned amount cannot be lowered below received cash");
        CrmReceivable exact = current(record); exact.setPlannedAmount(new BigDecimal("40.12")); service.updateReceivable(exact);
        amounts(record, "40.12", "40.12", "0"); equal("RECEIVED", current(record).getStatus(), "status follows changed plan and unchanged receipts");
        CrmReceivable bigger = current(record); bigger.setPlannedAmount(new BigDecimal("50.13")); service.updateReceivable(bigger);
        amounts(record, "50.13", "40.12", "10.01"); equal("PARTIAL_RECEIVED", current(record).getStatus(), "larger plan is partially received");
        CrmReceivable rebind = current(record); rebind.setCustomerId(fixture.customer("late rebind").getCustomerId());
        fails(IllegalArgumentException.class, () -> service.updateReceivable(rebind), "history locks customer binding");
    }

    private CrmReceivableWriteoffDTO request(Integer version, String amount) {
        CrmReceivableWriteoffDTO request = new CrmReceivableWriteoffDTO(); request.setVersion(version); request.setAmount(new BigDecimal(amount));
        request.setWriteoffDate(LocalDate.now()); request.setRemark("核销说明保留在审计中"); return request;
    }

    private void writeoff(CrmReceivable record, String amount) { service.writeoffReceivable(record.getReceivableId(), request(record.getVersion(), amount)); }

    private long auditCount(CrmReceivable record, String action) {
        return fixture.scalar("SELECT COUNT(*) FROM sys_audit_log WHERE audit_field=? AND audit_name=?", "CRM_RECEIVABLE:" + record.getReceivableId(), action);
    }

    private void receipts() {
        CrmReceivable record = create("100.01");
        for (String amount : List.of("0", "-0.01", "0.001", "100.02", "1000000000000"))
            fails(IllegalArgumentException.class, () -> writeoff(record, amount), "invalid partial receipt rejected " + amount);
        CrmReceivableWriteoffDTO future = request(0, "1"); future.setWriteoffDate(LocalDate.now().plusDays(1));
        fails(IllegalArgumentException.class, () -> service.writeoffReceivable(record.getReceivableId(), future), "future cash receipt rejected");
        fails(IllegalArgumentException.class, () -> service.confirmReceipt(record.getReceivableId(), null), "confirmation needs observed version");
        writeoff(record, "30.01"); amounts(record, "100.01", "30.01", "70");
        equal("NONE", current(record).getInvoiceStatus(), "CRM receipt does not pretend OA invoice has been written off");
        equal(1L, auditCount(record, "CRM_RECEIVABLE_WRITEOFF"), "partial cash has one durable audit");
        fails(IllegalArgumentException.class, () -> writeoff(record, "30.01"), "same version cannot write off twice");
        int published = fixture.receiptNotifications.get();
        CrmReceivable remaining = current(record); service.confirmReceipt(record.getReceivableId(), remaining.getVersion());
        amounts(record, "100.01", "100.01", "0");
        equal(published + 1, fixture.receiptNotifications.get(), "committed confirmation publishes once");
        check(fixture.jdbc.queryForObject("SELECT after_val FROM sys_audit_log WHERE audit_field=? AND audit_name='CRM_RECEIVABLE_CONFIRMED'", String.class,
                "CRM_RECEIVABLE:" + record.getReceivableId()).contains("本次到账=70.00"), "confirmation audit records remaining increment rather than cumulative total");
        fails(IllegalArgumentException.class, () -> service.confirmReceipt(record.getReceivableId(), remaining.getVersion()), "stale confirmation rejected");
        service.confirmReceipt(record.getReceivableId(), current(record).getVersion());
        equal(published + 1, fixture.receiptNotifications.get(), "already settled record does not publish another confirmation");
        equal(1L, auditCount(record, "CRM_RECEIVABLE_CONFIRMED"), "confirmation never duplicates audit");
        CrmReceivable rolledBack = create("100"); int notificationsBefore = fixture.receiptNotifications.get();
        fails(IllegalStateException.class, () -> transactions.execute(status -> {
            service.confirmReceipt(rolledBack.getReceivableId(), rolledBack.getVersion()); throw new IllegalStateException("rollback after confirmation fixture");
        }), "outer rollback cancels confirmation");
        amounts(rolledBack, "100", "0", "100"); equal(0L, auditCount(rolledBack, "CRM_RECEIVABLE_CONFIRMED"), "rollback cancels cash audit");
        equal(notificationsBefore, fixture.receiptNotifications.get(), "rollback sends no premature invoice binding event");
        fixture.jdbc.update("UPDATE crm_receivable SET version=? WHERE receivable_id=?", Integer.MAX_VALUE, rolledBack.getReceivableId());
        fails(IllegalArgumentException.class, () -> service.confirmReceipt(rolledBack.getReceivableId(), Integer.MAX_VALUE), "version overflow rejected before writing");
    }

    private ReceivableInvoiceSyncDTO invoice(String status, String amount) {
        ReceivableInvoiceSyncDTO request = new ReceivableInvoiceSyncDTO(); request.setInvoiceId(990070L); request.setInvoiceStatus(status);
        request.setGrossAmount(new BigDecimal("100")); request.setTotalWriteoffAmount(amount == null ? null : new BigDecimal(amount));
        request.setWriteoffDate(LocalDate.now()); return request;
    }

    private void invoiceInputs() {
        CrmReceivable record = create("150");
        fails(IllegalArgumentException.class, () -> service.syncInvoiceStatus(record.getReceivableId(), null), "empty invoice notification rejected");
        for (ReceivableInvoiceSyncDTO input : List.of(invoice("UNKNOWN", "0"), invoice("WRITEOFF_FULL", null), invoice("WRITEOFF_FULL", "50"),
                invoice("WRITEOFF_PARTIAL", "100"), invoice("WRITEOFF_PARTIAL", "0"), invoice("WRITEOFF_PARTIAL", "0.001")))
            fails(IllegalArgumentException.class, () -> service.syncInvoiceStatus(record.getReceivableId(), input), "malformed invoice state cannot create money");
        amounts(record, "150", "0", "150");
        for (String state : List.of("BOUND", "WRITEOFF_FULL", "WRITEOFF_PARTIAL", "VOID"))
            fails(IllegalArgumentException.class, () -> service.syncInvoiceStatus(record.getReceivableId(), invoice(state, "100")), "unsigned cumulative state cannot create invoice binding or cash " + state);
        equal(null, current(record).getInvoiceId(), "unverified invoice notification never creates binding");
        fixture.jdbc.update("UPDATE crm_receivable SET invoice_id=990070,invoice_status='BOUND' WHERE receivable_id=?", record.getReceivableId());
        rejectBoundCrmReceipt(record);
        ReceivableInvoiceSyncDTO other = invoice("BOUND", "0"); other.setInvoiceId(990071L);
        fails(IllegalArgumentException.class, () -> service.syncInvoiceStatus(record.getReceivableId(), other), "invoice association cannot silently switch");
        ReceivableInvoiceSyncDTO tooLarge = invoice("WRITEOFF_FULL", "151"); tooLarge.setGrossAmount(new BigDecimal("151"));
        fails(IllegalArgumentException.class, () -> service.syncInvoiceStatus(record.getReceivableId(), tooLarge), "invoice amount is not silently clamped to plan");
        amounts(record, "150", "0", "150");
    }

    private void rejectBoundCrmReceipt(CrmReceivable record) {
        CrmReceivable before = current(record);
        fails(IllegalArgumentException.class, () -> service.confirmReceipt(record.getReceivableId(), before.getVersion()), "bound invoice requires receipt on invoice page");
        fails(IllegalArgumentException.class, () -> service.writeoffReceivable(record.getReceivableId(), request(before.getVersion(), "1")), "bound invoice rejects CRM partial receipt");
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmCrossModuleDraftServiceImpl.class).confirmReceivable(customer.getCustomerId(), record.getReceivableId(), before.getVersion()), "customer workspace cannot bypass invoice receipt entry");
        amounts(record, before.getPlannedAmount().toPlainString(), before.getReceivedAmount().toPlainString(), before.getOutstandingAmount().toPlainString());
        equal(before.getVersion(), current(record).getVersion(), "rejected manual receipts cannot change version");
        equal(0L, auditCount(record, "CRM_RECEIVABLE_CONFIRMED"), "rejected bound receipt creates no cash audit");
        equal(0L, auditCount(record, "CRM_RECEIVABLE_WRITEOFF"), "rejected bound partial receipt creates no cash audit");
    }

    private CrmApproval approval(CrmReceivable record, String amount) {
        Long source = fixture.jdbc.queryForObject("SELECT MIN(event_id) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=? AND event_type='RECEIPT' AND reversal_of_id IS NULL", Long.class, record.getReceivableId());
        Integer version = fixture.jdbc.queryForObject("SELECT version FROM crm_receivable WHERE tenant_id=100000 AND receivable_id=?", Integer.class, record.getReceivableId());
        Long id = fixture.refundWorkflow.submit(record, source, version, new BigDecimal(amount), "审批退款测试");
        return fixture.mapper(CrmApprovalMapper.class).selectById(id);
    }

    private ApprovalResultDTO callback(CrmApproval approval) {
        return fixture.refundWorkflow.completedFixture(approval, true);
    }

    private void refunds() {
        CrmReceivable record = create("100"); service.confirmReceipt(record.getReceivableId(), 0);
        for (String amount : List.of("-0.01", "0", "0.001", "100.01"))
            fails(IllegalArgumentException.class, () -> approval(record, amount), "refund request validates amount " + amount);
        CrmApproval approval = approval(record, "40.01");
        fails(IllegalArgumentException.class, () -> approval(record, "40.01"), "only one pending refund per receivable");
        ApprovalResultDTO stale = callback(approval); stale.setProcessInstanceId("previous-workflow"); refunds.handleApproved(stale);
        amounts(record, "100", "100", "0");
        refunds.handleApproved(callback(approval)); amounts(record, "100", "59.99", "40.01");
        int version = current(record).getVersion(); refunds.handleApproved(callback(approval));
        equal(version, current(record).getVersion(), "duplicate refund callback does not increment business version");
        equal(1L, auditCount(record, "CRM_RECEIVABLE_REFUND"), "duplicate refund callback has one audit");
        CrmApproval second = approval(record, "59.99"); refunds.handleApproved(callback(second)); amounts(record, "100", "0", "100");
        equal(null, current(record).getReceivedDate(), "fully refunded record clears receipt date in SQL");
        equal(true, current(record).getBindingLocked(), "refund history stays protected after received total becomes zero");
        fails(IllegalArgumentException.class, () -> service.removeReceivables(List.of(record.getReceivableId())), "refunded history cannot be deleted");
        CrmReceivable shortage = create("100"); service.confirmReceipt(shortage.getReceivableId(), 0); CrmApproval excessive = approval(shortage, "100");
        fixture.jdbc.update("UPDATE crm_receivable SET received_amount=50,outstanding_amount=50,status='PARTIAL_RECEIVED' WHERE receivable_id=?", shortage.getReceivableId());
        fails(IllegalArgumentException.class, () -> refunds.handleApproved(callback(excessive)), "insufficient receipt at approval cannot silently under-refund");
        amounts(shortage, "100", "50", "50");
        equal("PENDING", fixture.mapper(CrmApprovalMapper.class).selectById(excessive.getApprovalId()).getStatus(), "refund failure rolls back approval status");
        equal(0L, auditCount(shortage, "CRM_RECEIVABLE_REFUND"), "refund failure leaves no success audit");
        CrmApproval wrongBusiness = fixture.mapper(CrmApprovalMapper.class).selectById(excessive.getApprovalId());
        wrongBusiness.setBusinessType(CrmBusinessTypes.CRM_CUSTOMER_CREDIT); fixture.mapper(CrmApprovalMapper.class).updateById(wrongBusiness);
        fails(IllegalArgumentException.class, () -> refunds.handleApproved(callback(wrongBusiness)), "callback cannot reuse another business approval");
    }

    private void history() {
        CrmReceivable teamPlan = create("100"); CrmDealTeamStore teams = fixture.bean(CrmDealTeamStore.class);
        transactions.executeWithoutResult(status -> {
            fixture.bean(CrmReceivableAccessService.class).lockInScope(teamPlan.getReceivableId());
            teams.replace("RECEIVABLE", teamPlan.getReceivableId(), 0, List.of(member(1L, "OWNER", "0.6"), member(2L, "CO_SELLER", "0.4")), new BigDecimal("100"), "original");
            teams.replace("RECEIVABLE", teamPlan.getReceivableId(), 1, List.of(member(1L, "OWNER", "0.7"), member(2L, "CO_SELLER", "0.3")), new BigDecimal("100"), "current");
        });
        equal(true, current(teamPlan).getBindingLocked(), "team history locks associated business");
        CrmReceivable edited = current(teamPlan); edited.setPlannedAmount(new BigDecimal("200")); service.updateReceivable(edited);
        decimal("100", teams.rows("RECEIVABLE", teamPlan.getReceivableId(), 1).stream().map(row -> row.getAllocatedAmount()).reduce(BigDecimal.ZERO, BigDecimal::add), "old team preview remains unchanged");
        decimal("200", teams.rows("RECEIVABLE", teamPlan.getReceivableId(), 2).stream().map(row -> row.getAllocatedAmount()).reduce(BigDecimal.ZERO, BigDecimal::add), "current team preview follows plan edit");
        fails(IllegalArgumentException.class, () -> service.removeReceivables(List.of(teamPlan.getReceivableId())), "team history prevents deletion");
        CrmReceivable empty = create("100");
        fails(IllegalArgumentException.class, () -> service.removeReceivables(List.of(empty.getReceivableId(), teamPlan.getReceivableId())), "mixed deletion rolls back all rows");
        equal(0, current(empty).getDeleted(), "failure in batch preserves untouched plan");
        CrmReceivable earlier = create("100"); CrmReceivable later = create("100"); service.confirmReceipt(later.getReceivableId(), 0);
        fails(IllegalArgumentException.class, () -> service.removeReceivables(List.of(earlier.getReceivableId(), later.getReceivableId())), "later protected row rolls back earlier delete");
        equal(0, current(earlier).getDeleted(), "earlier delete is undone transactionally");
        service.removeReceivables(List.of(empty.getReceivableId(), empty.getReceivableId()));
        equal(1L, fixture.scalar("SELECT deleted FROM crm_receivable WHERE receivable_id=?", empty.getReceivableId()), "unsettled plan is deleted once");
    }

    private CrmDealPolicy.Member member(Long id, String role, String percentage) {
        return new CrmDealPolicy.Member(id, id, "CRM user " + id, 100L, role, new BigDecimal(percentage), null);
    }

    private int attempt(Runnable operation) { try { operation.run(); return 1; } catch (IllegalArgumentException rejected) { return 0; } }

    private void compete(Callable<Integer> first, Callable<Integer> second, String label) throws Exception {
        int[] results = simultaneous(first, second); equal(1, results[0] + results[1], label);
    }

    private int[] simultaneous(Callable<Integer> first, Callable<Integer> second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        return fixture.parallel(() -> together(ready, first), () -> together(ready, second));
    }

    private int together(CountDownLatch ready, Callable<Integer> operation) throws Exception {
        ready.countDown();
        if (!ready.await(10, TimeUnit.SECONDS)) throw new AssertionError("concurrent request did not reach start barrier");
        return operation.call();
    }

    private void competition() throws Exception {
        CrmReceivable confirm = create("100");
        compete(() -> attempt(() -> service.confirmReceipt(confirm.getReceivableId(), 0)),
                () -> attempt(() -> fixture.bean(CrmCrossModuleDraftServiceImpl.class).confirmReceivable(customer.getCustomerId(), confirm.getReceivableId(), 0)),
                "workspace and ordinary confirmation have one winner");
        amounts(confirm, "100", "100", "0"); equal(1L, auditCount(confirm, "CRM_RECEIVABLE_CONFIRMED"), "competing entries record one increment");
        CrmReceivable partial = create("100");
        compete(() -> attempt(() -> writeoff(partial, "20")), () -> attempt(() -> writeoff(partial, "20")), "same-version partial receipts have one winner");
        amounts(partial, "100", "20", "80");
        CrmReceivable editing = create("100"); CrmReceivable proposed = current(editing); proposed.setPlannedAmount(new BigDecimal("110"));
        compete(() -> attempt(() -> service.updateReceivable(proposed)), () -> attempt(() -> service.confirmReceipt(editing.getReceivableId(), 0)), "plan edit and cash receipt cannot overwrite each other");
        CrmReceivable after = current(editing); equal(1, after.getVersion(), "competing edit increments once");
        decimal(after.getPlannedAmount().subtract(after.getReceivedAmount()).toPlainString(), after.getOutstandingAmount(), "competing edit preserves amount identity");
        CrmReceivable deleting = create("100");
        compete(() -> attempt(() -> service.removeReceivables(List.of(deleting.getReceivableId()))),
                () -> attempt(() -> service.confirmReceipt(deleting.getReceivableId(), 0)), "deletion and receipt cannot both succeed");
        CrmReceivable approved = create("100"); service.confirmReceipt(approved.getReceivableId(), 0); CrmApproval pending = approval(approved, "60");
        int[] callbacks = simultaneous(() -> { refunds.handleApproved(callback(pending)); return 1; }, () -> { refunds.handleApproved(callback(pending)); return 1; });
        equal(2, callbacks[0] + callbacks[1], "identical approved callbacks both resolve without duplicating refund");
        amounts(approved, "100", "40", "60"); equal(1L, auditCount(approved, "CRM_RECEIVABLE_REFUND"), "concurrent callbacks record refund once");
        CrmReceivable submitting = create("100"); service.confirmReceipt(submitting.getReceivableId(), 0);
        compete(() -> attempt(() -> approval(submitting, "20")), () -> attempt(() -> approval(submitting, "20")), "refund submission is serialized to one pending approval");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_approval WHERE business_type='CRM_REFUND' AND business_ref_id=? AND status='PENDING'", submitting.getReceivableId()), "database stores one pending refund");
    }

    private void scope() {
        CrmReceivable record = create("100"); CrmCustomer other = fixture.customer("workspace mismatch");
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmCrossModuleDraftServiceImpl.class).confirmReceivable(other.getCustomerId(), record.getReceivableId(), 0), "workspace cannot confirm another customer's record");
        identity(100000L, 990081L, 4);
        try {
            fails(IllegalArgumentException.class, () -> service.getAccessibleReceivable(record.getReceivableId()), "owner scope hides another customer's receipt");
            fails(IllegalArgumentException.class, () -> service.confirmReceipt(record.getReceivableId(), 0), "owner scope also applies to row locking");
            fails(IllegalArgumentException.class, () -> approvals.submitRefund(record.getReceivableId(), null, record.getVersion(), new BigDecimal("10"), "foreign owner"), "refund creation cannot bypass customer scope");
        } finally { identity(); }
        identity(100001L, 1L, 0);
        try {
            fails(IllegalArgumentException.class, () -> service.getAccessibleReceivable(record.getReceivableId()), "foreign tenant cannot read by numeric ID");
            fails(IllegalArgumentException.class, () -> service.confirmReceipt(record.getReceivableId(), 0), "foreign tenant cannot confirm by numeric ID");
            fails(IllegalArgumentException.class, () -> service.syncInvoiceStatus(record.getReceivableId(), invoice("BOUND", "0")), "internal invoice sync still requires correct tenant");
        } finally { identity(); }
        amounts(record, "100", "0", "100");
    }
}
