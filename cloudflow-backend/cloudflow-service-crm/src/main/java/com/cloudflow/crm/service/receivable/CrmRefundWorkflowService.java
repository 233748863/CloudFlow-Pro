package com.cloudflow.crm.service.receivable;

import com.cloudflow.common.core.context.UserContext;
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
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmRefundWorkflowService {
    public record Availability(boolean configured, String message, String businessOwnerName, int financeReviewerCount) { }
    private record Plan(ObjectNode policy, String ownerName, int reviewerCount) { }
    private static final String EXCLUDED = "_hExcludedUserIds";
    private static final List<String> FROZEN_FIELDS = List.of("applicantId", EXCLUDED, CrmRefundWorkflowModel.OWNER,
            CrmRefundWorkflowModel.FINANCE, "processKey", "definitionId", "definitionVersion", "modelDigest");
    private final CrmRefundWorkflowMapper mapper;
    private final ObjectMapper json;

    public Availability availability(CrmReceivable record) {
        try {
            Plan plan = plan(record, UserContext.getUserId());
            return new Availability(true, "客户业务负责人先审批，再由另一名财务复核；两段通过后才扣减到账", plan.ownerName(), plan.reviewerCount());
        } catch (CrmBusinessException failure) { return new Availability(false, failure.getMessage(), null, 0); }
    }

    public ObjectNode prepare(CrmReceivable record) { return plan(record, UserContext.getUserId()).policy(); }

    private Plan plan(CrmReceivable record, Long applicantId) {
        if (record == null || record.getTenantId() == null || record.getCustomerId() == null || applicantId == null
                || mapper.activeUser(record.getTenantId(), applicantId) == null) throw invalid("退款申请人身份无效");
        Definition definition = mapper.definition(record.getTenantId());
        if (definition == null || definition.version() == null || definition.version() < 1)
            throw invalid("退款审批流程尚未配置或已停用，暂不能提交；请联系管理员");
        JsonNode model = tree(definition.modelJson());
        CrmRefundWorkflowModel.stages(model);
        Participant owner = mapper.customerOwner(record.getTenantId(), record.getCustomerId());
        if (owner == null) throw invalid("客户尚无有效业务负责人，或负责人没有审批办理权限，暂不能提交退款");
        if (Objects.equals(owner.userId(), applicantId)) throw invalid("退款申请人与客户业务负责人不能是同一人，请由其他财务提交");
        List<Participant> reviewers = mapper.financeReviewers(record.getTenantId(), applicantId, owner.userId());
        if (reviewers.isEmpty()) throw invalid("没有可复核的另一名财务，须排除申请人和客户业务负责人，暂不能提交退款");
        ObjectNode policy = json.createObjectNode();
        policy.put("applicantId", applicantId.toString());
        policy.set(EXCLUDED, json.valueToTree(List.of(applicantId.toString())));
        policy.set(CrmRefundWorkflowModel.OWNER, json.valueToTree(List.of(owner.userId().toString())));
        policy.set(CrmRefundWorkflowModel.FINANCE, json.valueToTree(reviewers.stream().map(member -> member.userId().toString()).toList()));
        policy.put("customerId", record.getCustomerId().toString());
        policy.put("businessOwnerName", owner.name());
        policy.put("processKey", definition.processKey());
        policy.put("definitionId", definition.definitionId());
        policy.put("definitionVersion", definition.version().toString());
        policy.put("modelDigest", CrmRefundWorkflowModel.digest(model));
        return new Plan(policy, owner.name(), reviewers.size());
    }

    public Map<String, Object> variables(CrmApproval approval) {
        ObjectNode payload = tree(approval.getPayloadJson());
        ObjectNode policy = frozen(approval, payload);
        Map<String, Object> variables = new LinkedHashMap<>();
        for (String field : FROZEN_FIELDS) variables.put(field, json.convertValue(policy.get(field), Object.class));
        ObjectNode detail = policy.deepCopy();
        detail.put("approvalId", approval.getApprovalId().toString());
        detail.put("approvalNo", approval.getApprovalNo());
        detail.put("receivableId", approval.getBusinessRefId().toString());
        detail.put("receivableName", approval.getBusinessRefName());
        detail.put("customerName", payload.path("customerName").asText());
        detail.put("receiptEventId", payload.path("receiptEventId").asText());
        detail.put("receiptEventKey", payload.path("receiptEventKey").asText());
        detail.put("refundAmount", CrmReceivableAmounts.positive(payload.path("refundAmount").decimalValue(), "退款金额").toPlainString());
        detail.put("currency", payload.path("currency").asText());
        detail.put("reason", approval.getRemark() == null ? "" : approval.getRemark());
        variables.put(CrmRefundWorkflowModel.SNAPSHOT, json.convertValue(detail, Object.class));
        return variables;
    }

    public void verifyResult(CrmApproval approval, ApprovalResultDTO result, boolean approved) {
        ObjectNode payload = tree(approval.getPayloadJson());
        ObjectNode policy = frozen(approval, payload);
        if (result == null || !Objects.equals(result.getTenantId(), approval.getTenantId())
                || !Objects.equals(result.getBusinessId(), approval.getApprovalId())
                || !Objects.equals(result.getBusinessType(), CrmBusinessTypes.CRM_REFUND)
                || !Objects.equals(result.getProcessInstanceId(), approval.getInstanceId())
                || !Objects.equals(result.getApprovalResult(), approved ? "APPROVED" : "REJECTED")) throw invalid("退款审批回写身份不一致");
        List<Long> owners = ids(policy.path(CrmRefundWorkflowModel.OWNER));
        List<Long> reviewers = ids(policy.path(CrmRefundWorkflowModel.FINANCE));
        Long actor = result.getApproverId();
        if (actor == null || Objects.equals(actor, approval.getApplicantId()) || !mapper.canComplete(approval.getTenantId(), actor)
                || !(reviewers.contains(actor) || !approved && owners.contains(actor))) throw invalid("退款结果必须由对应独立审批人实际办理");
        if (reviewers.contains(actor) && mapper.financeReviewers(approval.getTenantId(), approval.getApplicantId(), owners.get(0))
                .stream().noneMatch(member -> Objects.equals(member.userId(), actor))) throw invalid("退款复核人没有有效财务资格");
        Instance instance = mapper.instance(approval.getTenantId(), approval.getInstanceId());
        if (instance == null || !Objects.equals(instance.startUserId(), approval.getApplicantId())
                || !CrmRefundWorkflowModel.PROCESS_KEY.equals(instance.processDefKey())
                || !Objects.equals(instance.businessKey(), CrmBusinessTypes.CRM_REFUND + ":" + approval.getApprovalId())
                || !Objects.equals(instance.definitionId(), policy.path("definitionId").asText())
                || !Objects.equals(instance.status(), approved ? "PASSED" : "REJECTED")) throw invalid("退款流程尚未按原申请完成真实审批");
        Definition definition = mapper.definitionById(approval.getTenantId(), instance.definitionId());
        if (definition == null || !CrmRefundWorkflowModel.PROCESS_KEY.equals(definition.processKey())
                || !Objects.equals(String.valueOf(definition.version()), policy.path("definitionVersion").asText())
                || !Objects.equals(CrmRefundWorkflowModel.digest(tree(definition.modelJson())), policy.path("modelDigest").asText()))
            throw invalid("退款审批模型与原申请冻结依据不一致");
        ObjectNode persisted = tree(instance.variables());
        for (Map.Entry<String, Object> expected : variables(approval).entrySet()) {
            if (!json.valueToTree(expected.getValue()).equals(persisted.path(expected.getKey()))) throw invalid("退款流程原收款或审批名单与申请不一致");
        }
        if (!Objects.equals(persisted.path("businessType").asText(), approval.getBusinessType())
                || !Objects.equals(persisted.path("businessId").asText(), approval.getApprovalId().toString())) throw invalid("退款流程业务绑定不一致");
        Map<String, String> stages = CrmRefundWorkflowModel.stages(tree(definition.modelJson()));
        List<History> histories = mapper.histories(approval.getTenantId(), approval.getInstanceId());
        String actorStage = reviewers.contains(actor) ? CrmRefundWorkflowModel.FINANCE : CrmRefundWorkflowModel.OWNER;
        History decision = histories.stream().filter(history -> Objects.equals(history.nodeKey(), stages.get(actorStage))
                && Objects.equals(history.operatorId(), actor) && manual(history)
                && (approved ? Set.of("APPROVE", "COUNTERSIGN_APPROVE") : Set.of("REJECT", "COUNTERSIGN_REJECT")).contains(history.action()))
                .findFirst().orElseThrow(() -> invalid("退款审批缺少真实办理历史"));
        if (approved || CrmRefundWorkflowModel.FINANCE.equals(actorStage)) {
            boolean firstApproved = histories.stream().anyMatch(history -> Objects.equals(history.nodeKey(), stages.get(CrmRefundWorkflowModel.OWNER))
                    && owners.contains(history.operatorId()) && Set.of("APPROVE", "COUNTERSIGN_APPROVE").contains(history.action())
                    && manual(history) && !Objects.equals(history.taskId(), decision.taskId()) && !history.createTime().isAfter(decision.createTime()));
            if (!firstApproved) throw invalid("客户业务负责人尚未实际同意，不能由财务跳过首审退款");
        }
    }

    private ObjectNode frozen(CrmApproval approval, ObjectNode payload) {
        if (!CrmBusinessTypes.CRM_REFUND.equals(approval.getBusinessType()) || !"CRM_RECEIVABLE".equals(approval.getBusinessRefType())
                || approval.getApplicantId() == null || approval.getBusinessRefId() == null
                || !Objects.equals(payload.path("receivableId").asText(), approval.getBusinessRefId().toString())
                || !(payload.get("approvalPolicy") instanceof ObjectNode policy)
                || !Objects.equals(policy.path("applicantId").asText(), approval.getApplicantId().toString())
                || !Objects.equals(policy.path("customerId").asText(), payload.path("customerId").asText())
                || !CrmRefundWorkflowModel.PROCESS_KEY.equals(policy.path("processKey").asText())
                || policy.path("definitionId").asText().isBlank() || !policy.path("definitionVersion").asText().matches("[1-9][0-9]*")
                || !policy.path("modelDigest").asText().matches("[0-9a-f]{64}")) throw invalid("退款申请缺少可信的双级审批依据");
        List<Long> owners = ids(policy.path(CrmRefundWorkflowModel.OWNER));
        List<Long> reviewers = ids(policy.path(CrmRefundWorkflowModel.FINANCE));
        if (owners.size() != 1 || owners.contains(approval.getApplicantId()) || reviewers.contains(approval.getApplicantId())
                || reviewers.contains(owners.get(0)) || !ids(policy.path(EXCLUDED)).equals(List.of(approval.getApplicantId())))
            throw invalid("退款申请的首审、复核与申请人必须相互独立");
        return policy;
    }

    private List<Long> ids(JsonNode source) {
        if (!source.isArray() || source.isEmpty()) throw invalid("退款审批名单缺失");
        Set<Long> result = new LinkedHashSet<>();
        for (JsonNode value : source) {
            if (!value.isTextual() || !value.asText().matches("[1-9][0-9]{0,18}")) throw invalid("退款审批人员标识无效");
            try { if (!result.add(Long.valueOf(value.asText()))) throw invalid("退款审批名单重复"); }
            catch (NumberFormatException failure) { throw invalid("退款审批人员标识超出有效范围"); }
        }
        return List.copyOf(result);
    }

    private boolean manual(History history) {
        return history.onBehalfOfUserId() == null && history.createTime() != null && history.taskId() != null
                && history.taskType() != null && !history.taskType().startsWith("AUTO_");
    }

    private ObjectNode tree(String source) {
        try {
            JsonNode value = source == null ? null : json.reader().with(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readTree(source);
            if (value instanceof ObjectNode object) return object;
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw invalid("退款审批依据无法解析"); }
        throw invalid("退款审批依据缺失");
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
