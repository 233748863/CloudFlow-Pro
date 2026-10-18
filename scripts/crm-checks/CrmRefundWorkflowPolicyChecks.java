package com.cloudflow.crm.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmRefundWorkflowMapper;
import com.cloudflow.crm.mapper.CrmRefundWorkflowMapper.Definition;
import com.cloudflow.crm.mapper.CrmRefundWorkflowMapper.History;
import com.cloudflow.crm.mapper.CrmRefundWorkflowMapper.Instance;
import com.cloudflow.crm.mapper.CrmRefundWorkflowMapper.Participant;
import com.cloudflow.crm.service.receivable.CrmRefundWorkflowModel;
import com.cloudflow.crm.service.receivable.CrmRefundWorkflowService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmRefundWorkflowPolicyChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Long APPLICANT = 11L;
    private static final Long OWNER = 21L;
    private static final Long REVIEWER = 31L;
    private static final String OWNER_STAGE = CrmRefundWorkflowModel.OWNER;
    private static final String FINANCE_STAGE = CrmRefundWorkflowModel.FINANCE;
    private static final LocalDateTime FIRST = LocalDateTime.of(2026, 9, 24, 10, 0);

    static void run() {
        int before = assertionCount();
        try {
            identity(100000L, APPLICANT, 0);
            modelRules(); availability(); frozenEvidence(); decisions();
        } finally { identity(); }
        System.out.println("H3_REFUND_WORKFLOW_POLICY_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; two_stage=true; self_approval=false; workflow_http=false");
    }

    private static ObjectNode model() {
        ObjectNode model = JSON.createObjectNode();
        ArrayNode nodes = model.putArray("nodes");
        nodes.addObject().put("id", "start").put("type", "START");
        nodes.addObject().put("id", "owner").put("type", "APPROVAL").put("approverType", "VARIABLE_USER")
                .put("approverValue", OWNER_STAGE).put("allowDelegate", false).put("allowAddSign", false);
        nodes.addObject().put("id", "finance").put("type", "APPROVAL").put("approverType", "VARIABLE_USER")
                .put("approverValue", FINANCE_STAGE).put("signType", "ANY").put("allowDelegate", false).put("allowAddSign", false);
        nodes.addObject().put("id", "end").put("type", "END");
        ArrayNode edges = model.putArray("edges");
        edges.addObject().put("source", "start").put("target", "owner");
        edges.addObject().put("source", "owner").put("target", "finance");
        edges.addObject().put("source", "finance").put("target", "end");
        return model;
    }

    private static ObjectNode node(ObjectNode model, int index) { return (ObjectNode) model.path("nodes").get(index); }

    private static void unsafe(Consumer<ObjectNode> change, String label) {
        ObjectNode model = model(); change.accept(model);
        fails(CrmBusinessException.class, () -> CrmRefundWorkflowModel.stages(model), label);
    }

    private static void modelRules() {
        equal(Map.of(OWNER_STAGE, "owner", FINANCE_STAGE, "finance"), CrmRefundWorkflowModel.stages(model()), "two mandatory refund stages in order");
        equal(64, CrmRefundWorkflowModel.digest(model()).length(), "refund model has SHA-256 evidence");
        unsafe(model -> ((ArrayNode) model.path("nodes")).remove(1), "single-stage model rejected");
        unsafe(model -> ((ObjectNode) model.path("edges").get(0)).put("target", "finance"), "owner bypass edge rejected");
        unsafe(model -> node(model, 2).put("id", "owner"), "duplicate node rejected");
        unsafe(model -> node(model, 2).put("approverValue", OWNER_STAGE), "duplicate approval stage rejected");
        unsafe(model -> node(model, 1).put("approverType", "USER"), "client-chosen fixed user rejected");
        unsafe(model -> node(model, 1).put("signType", "ANY"), "owner must approve alone");
        unsafe(model -> node(model, 2).put("signType", "ALL"), "finance stage must accept one independent reviewer");
        unsafe(model -> node(model, 2).remove("signType"), "finance stage cannot lose ANY policy");
        for (String flag : List.of("allowDelegate", "allowAddSign", "allowSelection", "allowEdit", "allowRollback", "allowReduceSign")) {
            unsafe(model -> node(model, 1).put(flag, true), "unsafe owner flag " + flag);
            unsafe(model -> node(model, 2).putObject("props").put(flag, true), "unsafe nested finance flag " + flag);
        }
        for (String field : List.of("condition", "conditionExpression", "expression")) {
            unsafe(model -> node(model, 1).putObject("props").put(field, "true"), "conditional owner skip " + field);
            unsafe(model -> ((ObjectNode) model.path("edges").get(0)).put(field, "true"), "conditional route " + field);
        }
        unsafe(model -> node(model, 1).putObject("props").put("approveSelf", "AUTO_SKIP"), "automatic self-approval rejected");
        unsafe(model -> node(model, 2).putObject("props").put("signType", "ALL"), "conflicting nested sign mode rejected");
        unsafe(model -> node(model, 1).put("slaHours", 1), "automatic timeout approval rejected");
        unsafe(model -> node(model, 2).putArray("outputs").add("applicantId"), "variable-writing node rejected");
        ObjectNode safe = model(); node(safe, 2).putObject("props").put("allowEdit", false);
        equal(2, CrmRefundWorkflowModel.stages(safe).size(), "explicitly disabled editing remains valid");
    }

    private static void availability() {
        Fixture fixture = new Fixture();
        CrmRefundWorkflowService.Availability available = fixture.service.availability(fixture.record);
        equal(true, available.configured(), "qualified refund chain is available");
        equal("Customer owner", available.businessOwnerName(), "customer owner is resolved independently of receivable owner");
        equal(2, available.financeReviewerCount(), "all independent qualified finance candidates are shown");
        for (Consumer<Fixture> change : List.<Consumer<Fixture>>of(
                value -> value.active = false, value -> value.owner = null, value -> value.reviewers = List.of(),
                value -> value.definition = null, value -> value.owner = new Participant(APPLICANT, "Applicant"))) {
            Fixture blocked = new Fixture(); change.accept(blocked);
            CrmRefundWorkflowService.Availability unavailable = blocked.service.availability(blocked.record);
            equal(false, unavailable.configured(), "missing independent refund prerequisites disables submission");
            check(!unavailable.message().isBlank(), "disabled refund explains its concrete reason");
            fails(CrmBusinessException.class, () -> blocked.service.prepare(blocked.record), "disabled state also blocks server submission");
        }
    }

    private static void frozenEvidence() {
        Fixture fixture = new Fixture();
        ObjectNode policy = fixture.service.prepare(fixture.record);
        equal(List.of(OWNER.toString()), JSON.convertValue(policy.path(OWNER_STAGE), new TypeReference<List<String>>() { }), "owner list is frozen as strings");
        equal(List.of(REVIEWER.toString(), "32"), JSON.convertValue(policy.path(FINANCE_STAGE), new TypeReference<List<String>>() { }), "finance list excludes applicant and owner");
        Map<String, Object> variables = fixture.service.variables(fixture.approval);
        JsonNode detail = JSON.valueToTree(variables.get(CrmRefundWorkflowModel.SNAPSHOT));
        equal("10.00", detail.path("refundAmount").asText(), "amount stays an exact decimal string");
        equal("701", detail.path("receiptEventId").asText(), "original receipt is included for approval");
        equal("Selected receipt refund", detail.path("reason").asText(), "original application reason is immutable");
        fixture.approval.setApprovalComment("Reviewer opinion");
        equal(variables, fixture.service.variables(fixture.approval), "review comments do not replace original reason");
        for (String field : List.of("applicantId", "customerId", "processKey", "definitionId", "definitionVersion", "modelDigest")) {
            Fixture missing = new Fixture(); ObjectNode payload = missing.payload();
            ((ObjectNode) payload.path("approvalPolicy")).remove(field); missing.approval.setPayloadJson(payload.toString());
            fails(CrmBusinessException.class, () -> missing.service.variables(missing.approval), "incomplete frozen evidence rejected: " + field);
        }
        for (String invalidId : List.of("0", "-1", "9223372036854775808", "not-a-user")) {
            Fixture invalid = new Fixture(); ObjectNode payload = invalid.payload();
            ((ObjectNode) payload.path("approvalPolicy")).putArray(OWNER_STAGE).add(invalidId); invalid.approval.setPayloadJson(payload.toString());
            fails(CrmBusinessException.class, () -> invalid.service.variables(invalid.approval), "invalid frozen identity rejected: " + invalidId);
        }
    }

    private static void decisions() {
        Fixture valid = new Fixture(); valid.service.verifyResult(valid.approval, valid.result, true);
        equal(2, valid.histories.size(), "both persisted manual stages justify approved refund");
        Fixture sameSecond = new Fixture(); sameSecond.histories.set(1, history("finance", REVIEWER, null, "APPROVE", FIRST));
        sameSecond.service.verifyResult(sameSecond.approval, sameSecond.result, true);
        equal(2, sameSecond.histories.size(), "same-second sequential approvals are allowed by DATETIME precision");
        for (boolean ownerReject : List.of(true, false)) {
            Fixture rejected = new Fixture(); rejected.result.setApprovalResult("REJECTED");
            rejected.result.setApproverId(ownerReject ? OWNER : REVIEWER);
            rejected.state = "REJECTED";
            rejected.histories = ownerReject ? new ArrayList<>(List.of(history("owner", OWNER, null, "REJECT", FIRST)))
                    : new ArrayList<>(List.of(history("owner", OWNER, null, "APPROVE", FIRST), history("finance", REVIEWER, null, "REJECT", FIRST.plusSeconds(1))));
            rejected.service.verifyResult(rejected.approval, rejected.result, false);
            equal(ownerReject ? 1 : 2, rejected.histories.size(), "rejection is allowed at its actual independent stage");
        }
        refused(value -> value.result.setApproverId(APPLICANT), "applicant cannot self-approve");
        refused(value -> value.result.setApproverId(OWNER), "owner cannot complete finance stage");
        refused(value -> value.result.setApproverId(1L), "administrator is not an alternate reviewer");
        refused(value -> value.result.setTenantId(100001L), "foreign tenant callback rejected");
        refused(value -> value.result.setBusinessId(999L), "foreign approval callback rejected");
        refused(value -> value.result.setProcessInstanceId("other"), "other process callback rejected");
        refused(value -> value.result.setBusinessType("other"), "different business callback rejected");
        refused(value -> value.state = "RUNNING", "early callback rejected before persisted terminal state");
        refused(value -> value.instancePresent = false, "synthetic callback without instance rejected");
        refused(value -> value.canComplete = false, "reviewer without task permission rejected");
        refused(value -> value.reviewers = List.of(new Participant(32L, "Other finance")), "reviewer without finance role rejected");
        refused(value -> value.histories.clear(), "no real approval history rejected");
        refused(value -> value.histories.remove(0), "finance cannot bypass owner history");
        refused(value -> value.histories.remove(1), "owner history alone cannot deduct cash");
        refused(value -> value.histories.set(0, history("owner", OWNER, APPLICANT, "APPROVE", FIRST)), "proxy owner history rejected");
        refused(value -> value.histories.set(1, history("finance", REVIEWER, OWNER, "APPROVE", FIRST.plusSeconds(1))), "proxy finance history rejected");
        refused(value -> value.histories.set(0, history("owner", OWNER, null, "REJECT", FIRST)), "rejected owner cannot be skipped");
        refused(value -> value.histories.set(0, history("owner", OWNER, null, "APPROVE", FIRST.plusSeconds(2))), "finance preceding owner is rejected");
        refused(value -> value.histories.set(1, new History("owner-task", "finance", REVIEWER, null, "APPROVE", "APPROVAL", FIRST.plusSeconds(1))), "one task cannot stand for both stages");
        refused(value -> value.histories.set(1, new History("finance-task", "finance", REVIEWER, null, "APPROVE", "AUTO_APPROVAL", FIRST.plusSeconds(1))), "automatic finance decision rejected");
        refused(value -> value.definition = new Definition("refund-definition", CrmRefundWorkflowModel.PROCESS_KEY, 2, model().toString()), "model version drift rejected");
        refused(value -> value.persisted.put("customerOwnerApproverIds", List.of(APPLICANT.toString())), "changed persisted owner rejected");
        refused(value -> value.persisted.put("businessId", "999"), "changed persisted business binding rejected");
        refused(value -> value.persisted.remove(CrmRefundWorkflowModel.SNAPSHOT), "missing persisted original receipt summary rejected");
    }

    private static void refused(Consumer<Fixture> change, String label) {
        Fixture fixture = new Fixture(); change.accept(fixture);
        fails(CrmBusinessException.class, () -> fixture.service.verifyResult(fixture.approval, fixture.result, true), label);
    }

    private static History history(String stage, Long actor, Long represented, String action, LocalDateTime time) {
        return new History(stage + "-task", stage, actor, represented, action, "APPROVAL", time);
    }

    private static final class Fixture {
        private final CrmReceivable record = new CrmReceivable();
        private final CrmApproval approval = new CrmApproval();
        private final ApprovalResultDTO result = new ApprovalResultDTO();
        private final CrmRefundWorkflowService service;
        private boolean active = true;
        private boolean canComplete = true;
        private boolean instancePresent = true;
        private String state = "PASSED";
        private Participant owner = new Participant(OWNER, "Customer owner");
        private List<Participant> reviewers = List.of(new Participant(REVIEWER, "Finance reviewer"), new Participant(32L, "Other finance"));
        private Definition definition = new Definition("refund-definition", CrmRefundWorkflowModel.PROCESS_KEY, 1, model().toString());
        private List<History> histories = new ArrayList<>(List.of(history("owner", OWNER, null, "APPROVE", FIRST), history("finance", REVIEWER, null, "APPROVE", FIRST.plusSeconds(1))));
        private Map<String, Object> persisted;

        private Fixture() {
            CrmRefundWorkflowMapper mapper = proxy(CrmRefundWorkflowMapper.class, (method, arguments) -> switch (method) {
                case "activeUser" -> active ? new Participant(APPLICANT, "Applicant") : null;
                case "customerOwner" -> owner;
                case "financeReviewers" -> reviewers;
                case "definition", "definitionById" -> definition;
                case "canComplete" -> canComplete;
                case "histories" -> histories;
                case "instance" -> instancePresent ? new Instance("refund-instance", "refund-definition", CrmRefundWorkflowModel.PROCESS_KEY,
                        CrmBusinessTypes.CRM_REFUND + ":601", APPLICANT, state, JSON.valueToTree(persisted).toString()) : null;
                default -> throw new AssertionError("Unexpected refund mapper call " + method);
            });
            service = new CrmRefundWorkflowService(mapper, JSON);
            record.setTenantId(100000L); record.setReceivableId(501L); record.setCustomerId(401L); record.setOwnerId(999L);
            approval.setTenantId(100000L); approval.setApprovalId(601L); approval.setApprovalNo("REFUND-POLICY-CHECK");
            approval.setBusinessType(CrmBusinessTypes.CRM_REFUND); approval.setBusinessRefType("CRM_RECEIVABLE");
            approval.setBusinessRefId(501L); approval.setBusinessRefName("Receivable"); approval.setApplicantId(APPLICANT);
            approval.setInstanceId("refund-instance"); approval.setRemark("Selected receipt refund");
            ObjectNode payload = JSON.createObjectNode().put("receivableId", 501L).put("customerId", 401L).put("customerName", "Customer")
                    .put("receiptEventId", 701L).put("receiptEventKey", "RECEIPT:701").put("currency", "CNY").put("refundAmount", new BigDecimal("10.00"));
            payload.set("approvalPolicy", service.prepare(record)); approval.setPayloadJson(payload.toString());
            persisted = new LinkedHashMap<>(service.variables(approval)); persisted.put("businessType", CrmBusinessTypes.CRM_REFUND); persisted.put("businessId", "601");
            result.setTenantId(100000L); result.setBusinessId(601L); result.setBusinessType(CrmBusinessTypes.CRM_REFUND);
            result.setProcessInstanceId("refund-instance"); result.setApproverId(REVIEWER); result.setApprovalResult("APPROVED");
        }

        private ObjectNode payload() {
            try { return (ObjectNode) JSON.readTree(approval.getPayloadJson()); }
            catch (Exception failure) { throw new AssertionError(failure); }
        }
    }
}
