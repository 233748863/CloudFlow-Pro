package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmDealAllocation;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.CrmReceivableWriteoffDTO;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.domain.vo.CrmRefundSourcesVO;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmDealAllocationMapper;
import com.cloudflow.crm.mapper.CrmDealEventMapper;
import com.cloudflow.crm.service.deal.CrmReceivableTeamService;
import com.cloudflow.crm.service.receivable.CrmRefundService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmReceiptRefundDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmReceivableServiceImpl receivables;
    private final CrmApprovalServiceImpl approvals;
    private final CrmRefundApprovalHandler callbacks;
    private final CrmRefundService refunds;
    private final TransactionTemplate transactions;
    private final CrmCustomer customer;

    private CrmReceiptRefundDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; receivables = fixture.bean(CrmReceivableServiceImpl.class);
        approvals = fixture.bean(CrmApprovalServiceImpl.class); callbacks = fixture.bean(CrmRefundApprovalHandler.class);
        refunds = fixture.bean(CrmRefundService.class); transactions = fixture.bean(TransactionTemplate.class);
        customer = fixture.customer("selected receipt refund");
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount();
        CrmReceiptRefundDatabaseChecks checks = new CrmReceiptRefundDatabaseChecks(fixture);
        checks.selection(); checks.recovery(); checks.retryBinding(); checks.workflowAvailability(); checks.missingSources(); checks.competition(); checks.scope();
        System.out.println("H3_SELECTED_RECEIPT_REFUND_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; concurrency_groups=2; mysql=true; transactions=true; receipt_entrypoints=true; refund_entrypoints=true; team_setup=business_entrypoint; hr_http=false; workflow_http=false; salary_posting=false; production_modified=false");
    }

    private CrmReceivable plan() {
        CrmReceivable record = new CrmReceivable(); record.setCustomerId(customer.getCustomerId());
        record.setReceivableName("退款来源 " + UUID.randomUUID()); record.setPlannedAmount(new BigDecimal("100"));
        receivables.createReceivable(record); return current(record);
    }

    private CrmReceivable current(CrmReceivable record) { return receivables.getAccessibleReceivable(record.getReceivableId()); }

    private CrmDealEvent receipt(CrmReceivable record, String amount) {
        CrmReceivableWriteoffDTO request = new CrmReceivableWriteoffDTO();
        request.setVersion(current(record).getVersion()); request.setAmount(new BigDecimal(amount)); request.setWriteoffDate(LocalDate.now());
        receivables.writeoffReceivable(record.getReceivableId(), request);
        String key = "CRM_RECEIVABLE_RECEIPT:" + record.getReceivableId() + ":" + (request.getVersion() + 1);
        return fixture.mapper(CrmDealEventMapper.class).selectOne(new LambdaQueryWrapper<CrmDealEvent>().eq(CrmDealEvent::getEventKey, key));
    }

    private void team(CrmReceivable record, int version, String ownerShare, String sellerShare) {
        fixture.bean(CrmReceivableTeamService.class).save(record.getReceivableId(), new CrmDealTeamRequest(version, current(record).getVersion(),
                List.of(new CrmDealTeamRequest.Member(1L, "OWNER", new BigDecimal(ownerShare)),
                        new CrmDealTeamRequest.Member(2L, "CO_SELLER", new BigDecimal(sellerShare))), "通过真实团队入口设置退款来源"));
    }

    private CrmApproval submit(CrmReceivable record, Long source, String amount) {
        Long id = fixture.refundWorkflow.submit(record, source, current(record).getVersion(), new BigDecimal(amount), "财务指定原收款");
        return fixture.mapper(CrmApprovalMapper.class).selectById(id);
    }

    private ApprovalResultDTO callback(CrmApproval approval) {
        return fixture.refundWorkflow.completedFixture(approval, true);
    }

    private CrmDealEvent reversal(CrmApproval approval) {
        return fixture.mapper(CrmDealEventMapper.class).selectOne(new LambdaQueryWrapper<CrmDealEvent>()
                .eq(CrmDealEvent::getEventKey, "CRM_RECEIVABLE_REFUND:" + approval.getApprovalId()));
    }

    private List<CrmDealAllocation> allocations(Long eventId) {
        return fixture.mapper(CrmDealAllocationMapper.class).selectList(new LambdaQueryWrapper<CrmDealAllocation>()
                .eq(CrmDealAllocation::getEventId, eventId).orderByAsc(CrmDealAllocation::getSalesUserId));
    }

    private void amount(CrmReceivable record, String expected) {
        decimal(expected, current(record).getReceivedAmount(), "real cumulative receipt matches selected refunds");
        decimal(expected, fixture.jdbc.queryForObject("SELECT SUM(amount) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=?", BigDecimal.class, record.getReceivableId()), "real receipt and reversal facts sum to current cumulative cash");
    }

    private void selection() throws Exception {
        CrmReceivable record = plan(); team(record, 0, "0.6", "0.4");
        CrmDealEvent first = receipt(record, "30"); team(record, 1, "0.2", "0.8");
        CrmDealEvent second = receipt(record, "20"); team(record, 2, "0.9", "0.1");
        equal(1, first.getTeamVersion(), "first receipt freezes first team version");
        equal(2, second.getTeamVersion(), "second receipt freezes changed team version");
        decimal("18", allocations(first.getEventId()).get(0).getAllocatedAmount(), "first actual 30 freezes owner 18");
        decimal("4", allocations(second.getEventId()).get(0).getAllocatedAmount(), "second actual 20 freezes owner 4");
        String original = fixture.json.writeValueAsString(allocations(second.getEventId()));
        PageQuery page = new PageQuery(); page.setPageSize(1);
        CrmRefundSourcesVO sources = refunds.sources(record.getReceivableId(), page);
        equal(2L, sources.receipts().getTotal(), "receipt selection is paginated without losing older sources");
        equal(1, sources.receipts().getRows().size(), "receipt selection respects requested page size");
        equal(second.getEventId(), sources.receipts().getRows().get(0).getReceiptEventId(), "source list displays latest receipt but does not submit a selection");
        decimal("0", sources.untrackedAmount(), "real CRM receipts have no invented or missing baseline");
        String exposed = fixture.json.writeValueAsString(sources);
        check(!exposed.contains("commission") && !exposed.contains("employeeId") && !exposed.contains("sourceSnapshot"), "refund selection response excludes salary and internal source payload");
        page.setPageNum(2); equal(first.getEventId(), refunds.sources(record.getReceivableId(), page).receipts().getRows().get(0).getReceiptEventId(), "older receipt remains explicitly selectable");
        fails(IllegalArgumentException.class, () -> submit(record, null, "1"), "finance must explicitly select an original receipt");
        fails(IllegalArgumentException.class, () -> submit(record, second.getEventId(), "20.01"), "source-specific cap applies even though overall cash is 50");
        fails(IllegalArgumentException.class, () -> approvals.submitRefund(record.getReceivableId(), second.getEventId(), 0, BigDecimal.ONE, "stale"), "refund submission rejects an old page version");
        CrmApproval pending = submit(record, second.getEventId(), "5");
        equal(pending.getApprovalId(), refunds.sources(record.getReceivableId(), new PageQuery()).pendingApprovalId(), "pending refund is visible before any cash is removed");
        amount(record, "50");
        fails(IllegalArgumentException.class, () -> submit(record, first.getEventId(), "5"), "existing one-pending-refund-per-plan rule is retained");
        fixture.failEmployees = true;
        try { callbacks.handleApproved(callback(pending)); } finally { fixture.failEmployees = false; }
        callbacks.handleApproved(callback(pending)); amount(record, "45");
        CrmDealEvent refunded = reversal(pending);
        equal(second.getEventId(), refunded.getReversalOfId(), "refund references finance-selected second receipt rather than oldest receipt");
        decimal("-1", allocations(refunded.getEventId()).get(0).getAllocatedAmount(), "refund uses second receipt's historical 20 percent owner share");
        decimal("-4", allocations(refunded.getEventId()).get(1).getAllocatedAmount(), "refund uses second receipt's historical 80 percent seller share");
        equal(original, fixture.json.writeValueAsString(allocations(second.getEventId())), "later team changes and refunds never rewrite original frozen allocations");
        check(allocations(refunded.getEventId()).stream().allMatch(entry -> "UNCONFIRMED".equals(entry.getCommissionStatus()) && entry.getCompChangeId() == null), "refund cannot invent a paid salary adjustment");
        CrmApproval remainder = submit(record, second.getEventId(), "15"); callbacks.handleApproved(callback(remainder)); amount(record, "30");
        equal(2L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND reversal_of_id=?", second.getEventId()), "one source supports two separately approved partial refunds");
        decimal("0", fixture.jdbc.queryForObject("SELECT SUM(allocated_amount) FROM crm_deal_allocation WHERE tenant_id=100000 AND (event_id=? OR reversal_of_id IN (SELECT allocation_id FROM (SELECT allocation_id FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=?) original))", BigDecimal.class, second.getEventId(), second.getEventId()), "full refund via multiple parts cancels original member amounts exactly");
        fails(IllegalArgumentException.class, () -> submit(record, second.getEventId(), "0.01"), "exhausted selected receipt cannot use another receipt's cash");
        fails(IllegalArgumentException.class, () -> submit(record, refunded.getEventId(), "1"), "a reversal cannot be selected as an original receipt");
        CrmApproval rejected = submit(record, first.getEventId(), "7");
        ApprovalResultDTO result = fixture.refundWorkflow.completedFixture(rejected, false); callbacks.handleRejected(result);
        equal(null, reversal(rejected), "rejected approval creates no financial reversal"); amount(record, "30");
    }

    private void recovery() {
        CrmReceivable record = plan(); CrmDealEvent source = receipt(record, "40");
        CrmApproval pending = submit(record, source.getEventId(), "10");
        ApprovalResultDTO stale = callback(pending); stale.setProcessInstanceId("wrong-instance"); callbacks.handleApproved(stale);
        equal(null, reversal(pending), "stale workflow callback cannot reverse selected receipt"); amount(record, "40");
        fails(IllegalStateException.class, () -> transactions.executeWithoutResult(status -> {
            callbacks.handleApproved(callback(pending)); throw new IllegalStateException("rollback after selected refund");
        }), "late transaction failure rolls back approval, cash and every reversal allocation");
        equal("PENDING", fixture.mapper(CrmApprovalMapper.class).selectById(pending.getApprovalId()).getStatus(), "rolled-back callback leaves approval retryable");
        equal(null, reversal(pending), "rolled-back refund leaves no consumed business key"); amount(record, "40");
        callbacks.handleApproved(callback(pending)); amount(record, "30");
        CrmReceivable after = current(record); callbacks.handleApproved(callback(pending)); equal(after.getVersion(), current(record).getVersion(), "duplicate workflow callback does not change receipt version");
        CrmReceivable blocked = plan(); fixture.failEmployees = true;
        try { fails(IllegalArgumentException.class, () -> receipt(blocked, "10"), "unverified current employee identity prevents new receipt and fact"); }
        finally { fixture.failEmployees = false; }
        decimal("0", current(blocked).getReceivedAmount(), "directory failure rolls back new cash");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=?", blocked.getReceivableId()), "directory failure creates no synthetic receipt source");
    }

    private void missingSources() {
        CrmReceivable old = plan();
        fixture.jdbc.update("UPDATE crm_receivable SET received_amount=30,outstanding_amount=70,status='PARTIAL_RECEIVED' WHERE tenant_id=100000 AND receivable_id=?", old.getReceivableId());
        CrmRefundSourcesVO sources = refunds.sources(old.getReceivableId(), new PageQuery());
        decimal("30", sources.untrackedAmount(), "legacy accumulated cash without sources is clearly marked for review");
        equal(0L, sources.receipts().getTotal(), "legacy cumulative cash is not fabricated into a refundable receipt");
        fails(IllegalArgumentException.class, () -> submit(old, null, "10"), "legacy missing source cannot be silently assigned by age");
        CrmReceivable foreignPlan = plan(); CrmDealEvent other = receipt(foreignPlan, "10");
        fails(IllegalArgumentException.class, () -> submit(old, other.getEventId(), "10"), "another plan's real source cannot justify this refund");
    }

    private void retryBinding() {
        CrmReceivable record = plan(); CrmDealEvent source = receipt(record, "40");
        CrmApproval pending = submit(record, source.getEventId(), "10");
        fixture.jdbc.update("UPDATE crm_approval SET instance_id=NULL WHERE tenant_id=100000 AND approval_id=?", pending.getApprovalId());
        CrmApprovalInstanceBinder binder = fixture.bean(CrmApprovalInstanceBinder.class);
        InternalWorkflowStartDTO request = new com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO();
        request.setTenantId(100000L); request.setProcessDefKey("crm_refund_review");
        request.setBusinessKey(pending.getBusinessType() + ":" + pending.getApprovalId()); request.setStartUserId(pending.getApplicantId());
        request.setVariables(new java.util.HashMap<>(java.util.Map.of("approvalId", pending.getApprovalId(), "businessId", pending.getApprovalId(),
                "businessType", pending.getBusinessType(), "businessRefId", pending.getBusinessRefId())));
        request.setTenantId(100001L);
        fails(IllegalStateException.class, () -> binder.bindRefundRetry(request, "refund-retry-instance"), "refund retry rejects another tenant");
        request.setTenantId(100000L); request.setProcessDefKey("opportunity_downgrade_review");
        fails(IllegalStateException.class, () -> binder.bindRefundRetry(request, "refund-retry-instance"), "refund retry rejects another workflow definition");
        request.setProcessDefKey("crm_refund_review"); request.setStartUserId(2L);
        fails(IllegalStateException.class, () -> binder.bindRefundRetry(request, "refund-retry-instance"), "refund retry rejects another initiator");
        request.setStartUserId(pending.getApplicantId()); request.getVariables().put("businessRefId", record.getReceivableId() + 1);
        fails(IllegalStateException.class, () -> binder.bindRefundRetry(request, "refund-retry-instance"), "refund retry rejects another receipt plan");
        request.getVariables().put("businessRefId", record.getReceivableId());
        fails(IllegalStateException.class, () -> binder.bindRefundRetry(request, java.util.Map.of("accepted", true)), "refund retry requires an actual workflow instance");
        equal(null, fixture.mapper(CrmApprovalMapper.class).selectById(pending.getApprovalId()).getInstanceId(), "invalid refund retries do not bind an instance");
        binder.bindRefundRetry(request, java.util.Map.of("processInstanceId", "refund-retry-instance"));
        binder.bindRefundRetry(request, java.util.Map.of("instanceId", "refund-retry-instance"));
        equal("refund-retry-instance", fixture.mapper(CrmApprovalMapper.class).selectById(pending.getApprovalId()).getInstanceId(), "refund retry restores one durable workflow binding");
        fails(IllegalStateException.class, () -> binder.bindRefundRetry(request, "different-refund-instance"), "refund retry cannot replace its first workflow instance");
        amount(record, "40");
    }

    private void workflowAvailability() {
        CrmReceivable record = plan(); CrmDealEvent source = receipt(record, "10");
        CrmApproval existing = submit(record, source.getEventId(), "1");
        CrmReceivable blocked = plan(); CrmDealEvent blockedSource = receipt(blocked, "10");
        long before = fixture.scalar("SELECT COUNT(*) FROM crm_approval WHERE tenant_id=100000 AND business_ref_type='CRM_RECEIVABLE' AND business_ref_id=?", blocked.getReceivableId());
        try {
            for (String status : List.of("DRAFT", "SUSPENDED")) {
                fixture.jdbc.update("UPDATE wf_process_definition SET status=? WHERE tenant_id=100000 AND definition_id='crm_refund_review'", status);
                check(!fixture.refundWorkflow.applicant(() -> refunds.sources(blocked.getReceivableId(), new PageQuery())).workflowConfigured(), "unpublished refund workflow is clearly unavailable");
                fails(IllegalArgumentException.class, () -> submit(blocked, blockedSource.getEventId(), "1"), "unconfigured workflow cannot create a stranded refund approval");
            }
            equal(before, fixture.scalar("SELECT COUNT(*) FROM crm_approval WHERE tenant_id=100000 AND business_ref_type='CRM_RECEIVABLE' AND business_ref_id=?", blocked.getReceivableId()), "disabled refund entry creates no approval");
            callbacks.handleApproved(callback(existing)); amount(record, "9");
            amount(blocked, "10");
        } finally { fixture.jdbc.update("UPDATE wf_process_definition SET status='PUBLISHED' WHERE tenant_id=100000 AND definition_id='crm_refund_review'"); }
        check(fixture.refundWorkflow.applicant(() -> refunds.sources(blocked.getReceivableId(), new PageQuery())).workflowConfigured(), "published refund workflow re-enables new submissions");
    }

    private void competition() throws Exception {
        CrmReceivable record = plan(); CrmDealEvent source = receipt(record, "100");
        int[] submitted = fixture.parallel(() -> attemptSubmit(record, source), () -> attemptSubmit(record, source));
        equal(1, submitted[0] + submitted[1], "concurrent different refund submissions create one pending approval");
        Long pendingId = refunds.sources(record.getReceivableId(), new PageQuery()).pendingApprovalId();
        CrmApproval approval = fixture.mapper(CrmApprovalMapper.class).selectById(pendingId);
        int[] completed = fixture.parallel(() -> { callbacks.handleApproved(callback(approval)); return 1; }, () -> { callbacks.handleApproved(callback(approval)); return 1; });
        equal(2, completed[0] + completed[1], "duplicate approved callbacks both resolve without duplicate cash reversal");
        amount(record, "40");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND reversal_of_id=?", source.getEventId()), "concurrent callback creates one physical negative receipt fact");
    }

    private int attemptSubmit(CrmReceivable record, CrmDealEvent source) {
        try { submit(record, source.getEventId(), "60"); return 1; } catch (IllegalArgumentException rejected) { return 0; }
    }

    private void scope() {
        CrmReceivable record = plan(); CrmDealEvent source = receipt(record, "10");
        int version = current(record).getVersion();
        identity(100000L, 990088L, 4);
        try {
            fails(IllegalArgumentException.class, () -> refunds.sources(record.getReceivableId(), new PageQuery()), "same-tenant out-of-scope owner cannot list receipts for refund");
            fails(IllegalArgumentException.class, () -> approvals.submitRefund(record.getReceivableId(), source.getEventId(), version, BigDecimal.ONE, "foreign owner"), "same-tenant owner cannot bypass scope by supplying a valid source ID");
        } finally { identity(); }
        identity(100001L, 1L, 0);
        try {
            fails(IllegalArgumentException.class, () -> refunds.sources(record.getReceivableId(), new PageQuery()), "foreign tenant cannot read receipt choices or totals");
            fails(IllegalArgumentException.class, () -> approvals.submitRefund(record.getReceivableId(), source.getEventId(), version, BigDecimal.ONE, "foreign tenant"), "foreign tenant cannot refund another tenant's exact source ID");
        } finally { identity(); }
        amount(record, "10");
    }
}
