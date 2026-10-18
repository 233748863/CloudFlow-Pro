package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.CrmReceivableWriteoffDTO;
import com.cloudflow.crm.domain.vo.CrmRefundSourcesVO;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.service.receivable.CrmRefundService;
import com.cloudflow.crm.service.receivable.CrmRefundWorkflowModel;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmRefundWorkflowDatabaseChecks {
    private record Scenario(CrmCustomer customer, CrmReceivable record, Long source, CrmApproval approval) { }
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmReceivableServiceImpl receivables;
    private final CrmRefundApprovalHandler callbacks;
    private final CrmRefundService refunds;

    private CrmRefundWorkflowDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; receivables = fixture.bean(CrmReceivableServiceImpl.class);
        callbacks = fixture.bean(CrmRefundApprovalHandler.class); refunds = fixture.bean(CrmRefundService.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) {
        int before = assertionCount();
        CrmRefundWorkflowDatabaseChecks checks = new CrmRefundWorkflowDatabaseChecks(fixture);
        checks.independentParticipants(); checks.sequentialApproval(); checks.rejections(); checks.falseEvidence(); checks.unavailable();
        System.out.println("H3_REFUND_WORKFLOW_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; formal_seed=true; mysql=true; transactions=true; workflow_history=explicit_database_fixture; workflow_http=false; production_modified=false");
    }

    private Scenario scenario(boolean submitted) {
        CrmCustomer customer = fixture.customer("refund dual approval " + UUID.randomUUID());
        CrmReceivable record = new CrmReceivable(); record.setCustomerId(customer.getCustomerId());
        record.setReceivableName("双级退款 " + UUID.randomUUID()); record.setPlannedAmount(new BigDecimal("100"));
        receivables.createReceivable(record);
        CrmReceivableWriteoffDTO receipt = new CrmReceivableWriteoffDTO(); receipt.setVersion(current(record).getVersion());
        receipt.setAmount(new BigDecimal("50")); receipt.setWriteoffDate(LocalDate.now()); receivables.writeoffReceivable(record.getReceivableId(), receipt);
        Long source = fixture.jdbc.queryForObject("SELECT event_id FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=? AND event_type='RECEIPT'", Long.class, record.getReceivableId());
        Scenario input = new Scenario(customer, current(record), source, null);
        return submitted ? new Scenario(customer, input.record(), source, submit(input)) : input;
    }

    private CrmReceivable current(CrmReceivable record) { return receivables.getAccessibleReceivable(record.getReceivableId()); }

    private CrmApproval submit(Scenario input) {
        Long approvalId = fixture.refundWorkflow.submit(input.record(), input.source(), current(input.record()).getVersion(), new BigDecimal("5"), "客户负责人首审，另一财务复核");
        CrmApproval approval = fixture.mapper(CrmApprovalMapper.class).selectById(approvalId);
        check(approval.getApprovalNo().matches("RFD[a-f0-9]{32}"), "refund number uses a full UUID rather than a three-digit per-second random suffix");
        return approval;
    }

    private CrmRefundSourcesVO available(Scenario input) {
        return fixture.refundWorkflow.applicant(() -> refunds.sources(input.record().getReceivableId(), new PageQuery()));
    }

    private void unchanged(Scenario input, String label) {
        decimal("50", current(input.record()).getReceivedAmount(), label + " keeps cash unchanged");
        equal("PENDING", fixture.mapper(CrmApprovalMapper.class).selectById(input.approval().getApprovalId()).getStatus(), label + " rolls back approval status");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND reversal_of_id=?", input.source()), label + " creates no refund fact");
    }

    private void independentParticipants() {
        Scenario input = scenario(false);
        CrmRefundSourcesVO sources = available(input);
        check(sources.workflowConfigured() && sources.financeReviewerCount() >= 2, "published seed resolves independent finance candidates");
        check(sources.businessOwnerName() != null && sources.workflowMessage().contains("另一名财务"), "refund form receives owner and actual approval order");
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmApprovalServiceImpl.class).submitRefund(input.record().getReceivableId(), input.source(), input.record().getVersion(), BigDecimal.ONE, "self"), "customer owner cannot apply and self-approve even as administrator");
        fixture.jdbc.update("UPDATE crm_customer SET owner_id=? WHERE tenant_id=100000 AND customer_id=?", CrmRefundWorkflowFixture.OTHER_REVIEWER, input.customer().getCustomerId());
        CrmApproval approval = submit(input);
        equal(CrmRefundWorkflowFixture.OTHER_REVIEWER, fixture.refundWorkflow.owner(approval), "refund takes current customer owner rather than receivable owner");
        equal(1L, current(input.record()).getOwnerId(), "customer approval does not silently rewrite receivable ownership");
        Long excluded = fixture.jdbc.queryForObject("SELECT JSON_CONTAINS(JSON_EXTRACT(payload_json,'$.approvalPolicy.financeReviewerIds'),JSON_QUOTE(?)) FROM crm_approval WHERE tenant_id=100000 AND approval_id=?", Long.class, CrmRefundWorkflowFixture.OTHER_REVIEWER.toString(), approval.getApprovalId());
        equal(0L, excluded, "finance owner is excluded from final finance candidates");
        equal(CrmRefundWorkflowFixture.APPLICANT, approval.getApplicantId(), "application keeps a separate finance applicant");
    }

    private void sequentialApproval() {
        Scenario input = scenario(true); CrmApproval approval = input.approval();
        ApprovalResultDTO approved = fixture.refundWorkflow.callback(approval, CrmRefundWorkflowFixture.REVIEWER, true);
        fails(IllegalArgumentException.class, () -> callbacks.handleApproved(approved), "early callback cannot replace actual workflow completion"); unchanged(input, "early callback");
        LocalDateTime first = LocalDateTime.now().withNano(0);
        fixture.refundWorkflow.history(approval, "customer_owner", fixture.refundWorkflow.owner(approval), null, "APPROVE", first);
        fails(IllegalArgumentException.class, () -> callbacks.handleApproved(approved), "owner approval alone cannot deduct cash"); unchanged(input, "owner-only approval");
        fixture.refundWorkflow.history(approval, "finance_review", CrmRefundWorkflowFixture.REVIEWER, null, "COUNTERSIGN_APPROVE", first);
        fixture.refundWorkflow.state(approval, "PASSED"); callbacks.handleApproved(approved);
        decimal("45", current(input.record()).getReceivedAmount(), "both same-second independent approvals deduct exactly five");
        equal("APPROVED", fixture.mapper(CrmApprovalMapper.class).selectById(approval.getApprovalId()).getStatus(), "valid completed refund is approved");
        Integer version = current(input.record()).getVersion(); callbacks.handleApproved(approved);
        callbacks.handleRejected(fixture.refundWorkflow.callback(approval, fixture.refundWorkflow.owner(approval), false));
        equal(version, current(input.record()).getVersion(), "replayed or contrary late callback does not deduct again");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND reversal_of_id=?", input.source()), "completed refund creates exactly one immutable reversal");
    }

    private void rejections() {
        for (boolean ownerReject : List.of(true, false)) {
            Scenario input = scenario(true); CrmApproval approval = input.approval();
            Long owner = fixture.refundWorkflow.owner(approval); LocalDateTime first = LocalDateTime.now().withNano(0);
            fixture.refundWorkflow.history(approval, "customer_owner", owner, null, ownerReject ? "REJECT" : "APPROVE", first);
            if (!ownerReject) fixture.refundWorkflow.history(approval, "finance_review", CrmRefundWorkflowFixture.REVIEWER, null, "COUNTERSIGN_REJECT", first);
            fixture.refundWorkflow.state(approval, "REJECTED");
            callbacks.handleRejected(fixture.refundWorkflow.callback(approval, ownerReject ? owner : CrmRefundWorkflowFixture.REVIEWER, false));
            equal("REJECTED", fixture.mapper(CrmApprovalMapper.class).selectById(approval.getApprovalId()).getStatus(), "actual rejection at either stage closes the request");
            decimal("50", current(input.record()).getReceivedAmount(), "rejected stage never deducts original cash");
            equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND reversal_of_id=?", input.source()), "rejected stage creates no negative receipt");
        }
        Scenario forged = scenario(true); fixture.refundWorkflow.state(forged.approval(), "REJECTED");
        fails(IllegalArgumentException.class, () -> callbacks.handleRejected(fixture.refundWorkflow.callback(forged.approval(), 1L, false)), "rejected outcome without manual history is also rejected");
        unchanged(forged, "forged rejection");
    }

    private void refused(Consumer<Scenario> change, Consumer<ApprovalResultDTO> callbackChange, String label) {
        Scenario input = scenario(true); ApprovalResultDTO callback = fixture.refundWorkflow.completedFixture(input.approval(), true);
        change.accept(input); callbackChange.accept(callback);
        fails(IllegalArgumentException.class, () -> callbacks.handleApproved(callback), label); unchanged(input, label);
    }

    private void falseEvidence() {
        refused(input -> { }, callback -> callback.setApproverId(CrmRefundWorkflowFixture.APPLICANT), "applicant cannot forge final callback");
        refused(input -> { }, callback -> callback.setApproverId(1L), "administrator owner cannot replace finance");
        refused(input -> { }, callback -> callback.setApproverId(null), "anonymous callback is rejected");
        refused(input -> { }, callback -> callback.setTenantId(100001L), "callback tenant must match frozen application");
        refused(input -> { }, callback -> callback.setBusinessType("crm_other"), "callback business type must match");
        refused(input -> fixture.jdbc.update("UPDATE wf_task_history SET action='REJECT' WHERE tenant_id=100000 AND instance_id=? AND node_key='customer_owner'", input.approval().getInstanceId()), callback -> { }, "owner rejection cannot become a pass");
        refused(input -> fixture.jdbc.update("UPDATE wf_task_history SET tenant_id=100001 WHERE tenant_id=100000 AND instance_id=? AND node_key='customer_owner'", input.approval().getInstanceId()), callback -> { }, "foreign tenant history cannot justify first approval");
        refused(input -> fixture.jdbc.update("UPDATE wf_task_history SET on_behalf_of_user_id=? WHERE tenant_id=100000 AND instance_id=? AND node_key='finance_review'", CrmRefundWorkflowFixture.APPLICANT, input.approval().getInstanceId()), callback -> { }, "proxy finance history cannot justify refund");
        refused(input -> fixture.jdbc.update("UPDATE wf_task_history SET task_type='AUTO_APPROVAL' WHERE tenant_id=100000 AND instance_id=? AND node_key='customer_owner'", input.approval().getInstanceId()), callback -> { }, "automatic owner approval cannot justify refund");
        refused(input -> fixture.jdbc.update("UPDATE wf_task_history SET create_time=DATE_ADD(create_time,INTERVAL 5 MINUTE) WHERE tenant_id=100000 AND instance_id=? AND node_key='customer_owner'", input.approval().getInstanceId()), callback -> { }, "finance history preceding owner is rejected");
        refused(input -> fixture.jdbc.update("UPDATE wf_process_instance SET start_user_id=1 WHERE tenant_id=100000 AND instance_id=?", input.approval().getInstanceId()), callback -> { }, "different persisted applicant is rejected");
        refused(input -> fixture.jdbc.update("UPDATE wf_process_instance SET variables=JSON_SET(variables,'$.refundApproval.receiptEventId','other-receipt') WHERE tenant_id=100000 AND instance_id=?", input.approval().getInstanceId()), callback -> { }, "changed receipt evidence cannot be approved");
        refused(input -> fixture.jdbc.update("UPDATE wf_process_instance SET variables=JSON_SET(variables,'$.financeReviewerIds',JSON_ARRAY('1')) WHERE tenant_id=100000 AND instance_id=?", input.approval().getInstanceId()), callback -> { }, "changed finance list cannot be approved");
        refused(input -> fixture.jdbc.update("UPDATE wf_process_instance SET definition_id='unrelated-definition' WHERE tenant_id=100000 AND instance_id=?", input.approval().getInstanceId()), callback -> { }, "different stored model cannot be approved");
        try {
            refused(input -> fixture.jdbc.update("UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=?", CrmRefundWorkflowFixture.REVIEWER), callback -> { }, "disabled reviewer cannot finish refund");
        } finally { fixture.jdbc.update("UPDATE sys_user SET status='0' WHERE tenant_id=100000 AND user_id=?", CrmRefundWorkflowFixture.REVIEWER); }
        try {
            refused(input -> fixture.jdbc.update("UPDATE sys_user_role SET role_id=5 WHERE tenant_id=100000 AND user_id=? AND role_id=3", CrmRefundWorkflowFixture.REVIEWER), callback -> { }, "former finance employee cannot finish refund");
        } finally { fixture.jdbc.update("UPDATE sys_user_role SET role_id=3 WHERE tenant_id=100000 AND user_id=? AND role_id=5", CrmRefundWorkflowFixture.REVIEWER); }
        try {
            refused(input -> fixture.jdbc.update("UPDATE wf_process_definition SET version=2 WHERE tenant_id=100000 AND definition_id='crm_refund_review'"), callback -> { }, "published version drift cannot rewrite frozen approval");
        } finally { fixture.jdbc.update("UPDATE wf_process_definition SET version=1 WHERE tenant_id=100000 AND definition_id='crm_refund_review'"); }
    }

    private void unavailable() {
        Scenario missingOwner = scenario(false);
        fixture.jdbc.update("UPDATE crm_customer SET owner_id=NULL WHERE tenant_id=100000 AND customer_id=?", missingOwner.customer().getCustomerId());
        check(!available(missingOwner).workflowConfigured(), "missing customer owner disables refund");
        fails(IllegalArgumentException.class, () -> submit(missingOwner), "missing owner is checked again at submit");
        Scenario noFinance = scenario(false);
        try {
            fixture.jdbc.update("UPDATE sys_role SET status='1' WHERE tenant_id=100000 AND role_id=3");
            check(!available(noFinance).workflowConfigured(), "missing effective finance role disables refund");
            fails(IllegalArgumentException.class, () -> submit(noFinance), "no independent finance cannot leave a pending request");
        } finally { fixture.jdbc.update("UPDATE sys_role SET status='0' WHERE tenant_id=100000 AND role_id=3"); }
        String model = fixture.jdbc.queryForObject("SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id='crm_refund_review'", String.class);
        check(CrmRefundWorkflowModel.stages(readModel(model)).size() == 2, "formal SQL seed uses the same strict business model validation");
        try {
            fixture.jdbc.update("UPDATE wf_process_definition SET model_json='{}' WHERE tenant_id=100000 AND definition_id='crm_refund_review'");
            check(!available(noFinance).workflowConfigured(), "unsafe published model disables refund");
            fails(IllegalArgumentException.class, () -> submit(noFinance), "unsafe model cannot create a pending request");
        } finally { fixture.jdbc.update("UPDATE wf_process_definition SET model_json=? WHERE tenant_id=100000 AND definition_id='crm_refund_review'", model); }
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_approval WHERE tenant_id=100000 AND business_ref_type='CRM_RECEIVABLE' AND business_ref_id=?", noFinance.record().getReceivableId()), "unavailable refund creates no application row");
    }

    private com.fasterxml.jackson.databind.JsonNode readModel(String model) {
        try { return fixture.json.readTree(model); }
        catch (Exception failure) { throw new AssertionError(failure); }
    }
}
