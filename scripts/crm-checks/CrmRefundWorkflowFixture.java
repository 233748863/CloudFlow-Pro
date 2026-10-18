package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.service.receivable.CrmRefundWorkflowModel;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmRefundWorkflowFixture {
    static final Long APPLICANT = 990091L;
    static final Long REVIEWER = 990092L;
    static final Long OTHER_REVIEWER = 990093L;
    private final CrmOperationsDatabaseChecks fixture;

    CrmRefundWorkflowFixture(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture;
        for (Long userId : List.of(APPLICANT, REVIEWER, OTHER_REVIEWER)) {
            String userName = "refund-db-" + userId;
            fixture.jdbc.update("INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,status,deleted,remark) VALUES (?,100000,100,?,?,'0',0,'isolated refund database fixture; login not configured')", userId, userName, userName);
            fixture.jdbc.update("INSERT INTO sys_user_role (user_id,role_id,tenant_id) VALUES (?,3,100000)", userId);
        }
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM wf_process_definition WHERE definition_id='crm_refund_review' AND tenant_id=100000 AND process_key='crm_refund_review' AND version=1 AND status='PUBLISHED' AND deleted=0"), "database checks use the formal refund seed definition");
    }

    <Value> Value applicant(Supplier<Value> operation) {
        Long previousId = UserContext.getUserId();
        String previousName = UserContext.getUserName();
        Set<String> previousRoles = UserContext.getRoles();
        UserContext.setUserId(APPLICANT); UserContext.setUserName("refund-db-applicant"); UserContext.setRoles(Set.of("finance"));
        try { return operation.get(); }
        finally { UserContext.setUserId(previousId); UserContext.setUserName(previousName); UserContext.setRoles(previousRoles); }
    }

    Long submit(CrmReceivable record, Long source, Integer version, BigDecimal amount, String reason) {
        return applicant(() -> fixture.bean(CrmApprovalServiceImpl.class).submitRefund(record.getReceivableId(), source, version, amount, reason));
    }

    void start(InternalWorkflowStartDTO request, String instanceId) {
        equal(CrmRefundWorkflowModel.PROCESS_KEY, request.getProcessDefKey(), "refund remote substitute preserves formal process key");
        equal(APPLICANT, request.getStartUserId(), "refund remote substitute preserves independent applicant");
        String variables = fixture.json.valueToTree(request.getVariables()).toString();
        String definitionId = String.valueOf(request.getVariables().get("definitionId"));
        fixture.jdbc.update("INSERT INTO wf_process_instance (instance_id,tenant_id,process_def_key,definition_id,business_key,start_user_id,status,variables,create_by) VALUES (?,?,?,?,?,?,'RUNNING',?,'isolated-refund-fixture')",
                instanceId, request.getTenantId(), request.getProcessDefKey(), definitionId, request.getBusinessKey(), request.getStartUserId(), variables);
    }

    ApprovalResultDTO callback(CrmApproval approval, Long actor, boolean approved) {
        ApprovalResultDTO result = new ApprovalResultDTO(); result.setTenantId(approval.getTenantId());
        result.setBusinessType(approval.getBusinessType()); result.setBusinessId(approval.getApprovalId());
        result.setProcessInstanceId(approval.getInstanceId()); result.setApproverId(actor);
        result.setApprovalResult(approved ? "APPROVED" : "REJECTED"); return result;
    }

    synchronized ApprovalResultDTO completedFixture(CrmApproval approval, boolean approved) {
        String expected = approved ? "PASSED" : "REJECTED";
        String current = fixture.jdbc.queryForObject("SELECT status FROM wf_process_instance WHERE tenant_id=? AND instance_id=?", String.class, approval.getTenantId(), approval.getInstanceId());
        if ("RUNNING".equals(current)) {
            equal(0L, fixture.scalar("SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=? AND instance_id=?", approval.getTenantId(), approval.getInstanceId()), "legacy refund callback test arranges a new explicitly marked database-only history");
            LocalDateTime first = LocalDateTime.now().withNano(0).minusSeconds(1);
            history(approval, "customer_owner", owner(approval), null, "APPROVE", first);
            history(approval, "finance_review", REVIEWER, null, approved ? "COUNTERSIGN_APPROVE" : "COUNTERSIGN_REJECT", first.plusSeconds(1));
            state(approval, expected);
        } else { equal(expected, current, "repeated database-only refund callback uses the same persisted outcome"); }
        return callback(approval, REVIEWER, approved);
    }

    Long owner(CrmApproval approval) {
        try {
            JsonNode payload = fixture.json.readTree(approval.getPayloadJson());
            return Long.valueOf(payload.path("approvalPolicy").path(CrmRefundWorkflowModel.OWNER).get(0).asText());
        } catch (Exception failure) { throw new AssertionError(failure); }
    }

    String history(CrmApproval approval, String node, Long actor, Long represented, String action, LocalDateTime time) {
        String historyId = "refund-db-history-" + UUID.randomUUID();
        String taskId = "refund-db-task-" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO wf_task_history (history_id,tenant_id,task_id,instance_id,node_key,operator_id,on_behalf_of_user_id,action,task_type,comment,create_time) VALUES (?,?,?,?,?,?,?,?,'APPROVAL','ISOLATED DATABASE FIXTURE; workflow_http=false',?)",
                historyId, approval.getTenantId(), taskId, approval.getInstanceId(), node, actor, represented, action, time);
        return historyId;
    }

    void state(CrmApproval approval, String state) {
        equal(1, fixture.jdbc.update("UPDATE wf_process_instance SET status=? WHERE tenant_id=? AND instance_id=?", state, approval.getTenantId(), approval.getInstanceId()), "fixture changes only its owned refund instance");
    }
}
