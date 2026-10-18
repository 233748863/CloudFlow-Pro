package com.cloudflow.hr.service;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrSettlementApprovalMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

/** Each submission owns an independent workflow key. Cancellation retains reservations until the remote terminal state is known. */
@Service
@RequiredArgsConstructor
public class HrSettlementWorkflowService {
    public static final String BUSINESS_TYPE = "HR_SETTLEMENT";
    public static final String START_EVENT = "HR_SETTLEMENT_WORKFLOW_START";
    public static final String CANCEL_EVENT = "HR_SETTLEMENT_WORKFLOW_CANCEL";
    public static final String CLOSED_EVENT = "HR_SETTLEMENT_WORKFLOW_CLOSED";
    private final HrFinalSettlementMapper settlements;
    private final HrEmployeeAdvanceMapper employees;
    private final HrSettlementApprovalMapper workflowRecords;
    private final HrSettlementDraftService drafts;
    private final HrSettlementReservationService reservations;
    private final HrSettlementApprovalSupport approvals;
    private final WorkflowServiceClient client;
    private final OutboxPublisher publisher;
    private final HrHEventService events;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final ObjectMapper json;

    public record Command(Long tenantId, Long settlementId, Integer revision) { }
    public record Closed(Long tenantId, Long settlementId, Integer revision, String processInstanceId, String status) { }

    public com.cloudflow.hr.domain.vo.settlement.HrSettlementView approvalDetail(String taskId) {
        access.permission("hr:settlement:list"); access.permission("workflow:task:complete");
        Long id = workflowRecords.pendingSettlement(tenantId(), taskId, access.user());
        if (id == null) throw forbidden();
        HrFinalSettlement record = find(id); ObjectNode current = workflow(record);
        verifySubmitted(current); approvals.verifyRecordedActor(approval(current), access.user());
        return drafts.detail(id);
    }

    @Audit(name = "同步离职结算审批关闭", spel = "#message?.settlementId", highRisk = true)
    public void onClosed(Closed message) {
        if (message == null || !Objects.equals(tenantId(), message.tenantId()) || message.revision() == null
                || message.settlementId() == null || message.processInstanceId() == null
                || !Set.of("INVALIDATED", "CANCELLED", "TERMINATED").contains(String.valueOf(message.status()))) throw forbidden();
        reservations.locked(message.settlementId(), record -> {
            if (!current(record, new Command(message.tenantId(), message.settlementId(), message.revision()))) return null;
            ObjectNode current = workflow(record); verifySubmitted(current);
            if (record.getInstanceId() == null) throw conflict("SETTLEMENT_BINDING_PENDING", "等待恢复原审批绑定后释放来源");
            if (!Objects.equals(record.getInstanceId(), message.processInstanceId())
                    || !message.status().equals(instanceStatus(record, current, message.processInstanceId()))) throw forbidden();
            if ("CANCELLED".equals(record.getApprovalStatus()) && current.path("remoteClosed").asBoolean(false)) return null;
            if (!"SUBMITTED".equals(record.getApprovalStatus()) || !"DRAFT".equals(record.getStatus())) throw conflict("SETTLEMENT_APPROVAL_STATE", "结算状态与审批关闭记录不一致");
            current.put("remoteStatus", message.status()); finishCancellation(record, current); return null;
        });
    }

    public void submit(Long id, HrHRequests.VersionDTO input) {
        HrFinalSettlement initial = find(id); String permission = HrSettlementReversalSourceService.submissionPermission(initial);
        access.permission(permission); access.validate(input); access.operator(initial.getEmployeeId(), permission);
        support.lockedWithoutTransaction(lock(id), () -> reservations.locked(id, record -> {
            if (!permission.equals(HrSettlementReversalSourceService.submissionPermission(record))) throw forbidden();
            access.operator(record.getEmployeeId(), permission); HrHSupport.version(input.getVersion(), record.getVersion());
            ObjectNode calculation = calculation(record); JsonNode previous = calculation.path("workflow");
            if (!previous.isMissingNode() && (!previous.isObject() || !previous.path("remoteClosed").asBoolean(false)
                    || !Set.of("REJECTED", "CANCELLED").contains(String.valueOf(record.getApprovalStatus())))) throw conflict("SETTLEMENT_APPROVAL_PENDING", "上一轮审批尚未结束，不能重复提交");
            int revision = previous.isMissingNode() ? 1 : nextRevision(previous);
            drafts.verifySubmissionLocked(record);
            ObjectNode approval = json.valueToTree(approvals.snapshot(access.employee(record.getEmployeeId()), access.user()));
            ObjectNode submitted = drafts.submissionEvidenceLocked(record);
            reservations.freezeLocked(record);
            calculation = calculation(record);
            if (!previous.isMissingNode()) {
                ArrayNode history = calculation.path("workflowHistory") instanceof ArrayNode values ? values.deepCopy() : json.createArrayNode();
                history.add(previous.deepCopy()); calculation.set("workflowHistory", history);
            }
            ObjectNode workflow = json.createObjectNode().put("revision", revision).put("startAttempted", false)
                    .put("cancelRequested", false).put("remoteClosed", false).put("submittedTime", HrHSupport.now().toString());
            workflow.set("approval", approval); workflow.set("submitted", submitted); workflow.put("submittedDigest", submissionDigest(submitted));
            calculation.set("workflow", workflow); record.setCalculationSnapshot(calculation);
            record.setApprovalStatus("SUBMITTED"); record.setInstanceId(null); save(record);
            publish(START_EVENT, new Command(tenantId(), id, revision)); audit(record, "SUBMITTED", revision); return null;
        }));
    }

    @Audit(name = "申请撤回离职结算审批", spel = "#id", highRisk = true)
    public void withdraw(Long id, HrHRequests.ReasonVersionDTO input) {
        HrFinalSettlement initial = find(id); String permission = HrSettlementReversalSourceService.submissionPermission(initial);
        access.permission(permission); access.validate(input); access.operator(initial.getEmployeeId(), permission);
        support.lockedWithoutTransaction(lock(id), () -> reservations.locked(id, record -> {
            if (!permission.equals(HrSettlementReversalSourceService.submissionPermission(record))) throw forbidden();
            access.operator(record.getEmployeeId(), permission); HrHSupport.version(input.getVersion(), record.getVersion());
            ObjectNode workflow = workflow(record);
            if (!"SUBMITTED".equals(record.getApprovalStatus()) || !"DRAFT".equals(record.getStatus())) throw conflict("SETTLEMENT_APPROVAL_STATE", "仅审批中的结算可以申请撤回");
            if (!Objects.equals(access.user().toString(), approval(workflow).path("applicantUserId").asText())) throw forbidden();
            if (workflow.path("cancelRequested").asBoolean(false)) return null;
            if (record.getInstanceId() != null && !Set.of("RUNNING", "PAUSED", "FAILED", "WITHDRAWN", "TASK_BACK", "RESTARTED", "PENDING").contains(instanceStatus(record, workflow, record.getInstanceId()))) throw conflict("SETTLEMENT_APPROVAL_FINISHED", "原审批已结束，请等待结果同步后处理");
            workflow.put("cancelRequested", true).put("cancelReason", input.getReason().trim()).put("cancelRequestedTime", HrHSupport.now().toString());
            putWorkflow(record, workflow);
            if (!workflow.path("startAttempted").asBoolean(false)) finishCancellation(record, workflow);
            else {
                save(record); publish(CANCEL_EVENT, command(record, workflow));
                audit(record, "CANCEL_REQUESTED", revision(workflow));
            }
            return null;
        }));
    }

    public void start(Command command) {
        validate(command);
        support.lockedWithoutTransaction(lock(command.settlementId()), () -> { startLocked(command); return null; });
    }

    @Audit(name = "处理离职结算审批撤回", spel = "#command?.settlementId", highRisk = true)
    public void cancel(Command command) {
        validate(command);
        support.lockedWithoutTransaction(lock(command.settlementId()), () -> {
            HrFinalSettlement record = find(command.settlementId());
            if (!current(record, command) || !"SUBMITTED".equals(record.getApprovalStatus()) || !workflow(record).path("cancelRequested").asBoolean(false)) return null;
            // An uncertain start is recovered with the same business key before cancellation.
            if (record.getInstanceId() == null) startLocked(command);
            else cancelRemote(command);
            return null;
        });
    }

    private void startLocked(Command command) {
        HrFinalSettlement ready = basicLocked(command.settlementId(), record -> {
            if (!current(record, command) || !"SUBMITTED".equals(record.getApprovalStatus())) return null;
            ObjectNode workflow = workflow(record);
            if (record.getInstanceId() != null) return record;
            verifySubmitted(workflow);
            if (!workflow.path("startAttempted").asBoolean(false)) {
                approvals.verifyCurrent(access.employee(record.getEmployeeId()), approval(workflow));
                workflow.put("startAttempted", true); putWorkflow(record, workflow); save(record);
                audit(record, "START_ATTEMPT", revision(workflow));
            }
            return record;
        });
        if (ready == null) return;
        if (ready.getInstanceId() == null) {
            ProcessStartDTO request = startRequest(ready, workflow(ready));
            AtomicReference<R<String>> response = new AtomicReference<>();
            WorkflowFallbackRetryContext.runRetrying(() -> response.set(client.startProcess(request)));
            R<String> result = response.get();
            if (result == null || !result.isSuccess() || result.getData() == null || result.getData().isBlank()) throw conflict("SETTLEMENT_START_RETRY", "审批启动结果尚未确认，已保存消息将重试");
            String instanceId = result.getData();
            basicLocked(command.settlementId(), record -> {
                if (!current(record, command) || !"SUBMITTED".equals(record.getApprovalStatus())) throw conflict("SETTLEMENT_BINDING_CONFLICT", "结算轮次或审批状态与启动结果不符");
                ObjectNode workflow = workflow(record);
                instanceStatus(record, workflow, instanceId);
                if (record.getInstanceId() != null && !instanceId.equals(record.getInstanceId())) throw conflict("SETTLEMENT_BINDING_CONFLICT", "结算审批实例绑定冲突");
                record.setInstanceId(instanceId); workflow.put("instanceId", instanceId); putWorkflow(record, workflow); save(record);
                audit(record, "STARTED", revision(workflow)); return null;
            });
        }
        HrFinalSettlement bound = find(command.settlementId());
        if (current(bound, command) && "SUBMITTED".equals(bound.getApprovalStatus()) && workflow(bound).path("cancelRequested").asBoolean(false)) cancelRemote(command);
    }

    private void cancelRemote(Command command) {
        HrFinalSettlement record = find(command.settlementId());
        if (!current(record, command) || !"SUBMITTED".equals(record.getApprovalStatus()) || !workflow(record).path("cancelRequested").asBoolean(false)) return;
        if (record.getInstanceId() == null) throw conflict("SETTLEMENT_BINDING_PENDING", "等待恢复原审批实例后完成撤回");
        String instanceId = record.getInstanceId();
        R<Void> response = client.cancelProcess(tenantId(), instanceId, BUSINESS_TYPE, record.getSettlementId());
        if (response == null || !response.isSuccess()) throw conflict("SETTLEMENT_CANCEL_RETRY", "审批撤回尚未完成，来源继续冻结并自动重试");
        reservations.locked(record.getSettlementId(), current -> {
            if (!current(current, command) || !"SUBMITTED".equals(current.getApprovalStatus())) return null;
            ObjectNode workflow = workflow(current); String status = instanceStatus(current, workflow, instanceId);
            if (Set.of("PASSED", "REJECTED").contains(status)) {
                workflow.put("cancelOutcome", "ALREADY_DECIDED"); workflow.put("cancelRequested", false); putWorkflow(current, workflow); save(current);
                audit(current, "CANCEL_TOO_LATE", revision(workflow)); return null;
            }
            if (!Set.of("INVALIDATED", "CANCELLED", "TERMINATED").contains(status)) throw conflict("SETTLEMENT_CANCEL_RETRY", "原审批尚未结束，不能释放结算来源");
            finishCancellation(current, workflow); return null;
        });
    }

    public void onApproval(ApprovalResultDTO result) {
        if (result == null || !BUSINESS_TYPE.equals(result.getBusinessType()) || !Objects.equals(tenantId(), result.getTenantId())
                || !Set.of("APPROVED", "REJECTED").contains(String.valueOf(result.getApprovalResult())) || result.getProcessInstanceId() == null) throw forbidden();
        reservations.locked(result.getBusinessId(), record -> {
            if (!Objects.equals(record.getSettlementNo(), result.getBusinessNo())) throw forbidden();
            if (!Objects.equals(record.getInstanceId(), result.getProcessInstanceId())) {
                for (JsonNode old : calculation(record).path("workflowHistory")) if (result.getProcessInstanceId().equals(old.path("instanceId").asText()) && old.path("remoteClosed").asBoolean(false)) return null;
                if (record.getInstanceId() == null) throw conflict("SETTLEMENT_BINDING_PENDING", "等待恢复本轮结算审批绑定");
                throw forbidden();
            }
            ObjectNode workflow = workflow(record); ObjectNode approval = approval(workflow);
            verifySubmitted(workflow);
            approvals.verifyRecordedActor(approval, result.getApproverId());
            String expectedStatus = "APPROVED".equals(result.getApprovalResult()) ? "PASSED" : "REJECTED";
            if (!expectedStatus.equals(instanceStatus(record, workflow, result.getProcessInstanceId()))
                    || workflowRecords.decisionMatches(tenantId(), result.getProcessInstanceId(), expectedStatus, result.getApproverId(), approval.path("financeNodeId").asText()) != 1) throw conflict("SETTLEMENT_DECISION_MISSING", "结算缺少本轮独立财务的实际审批记录");
            if (workflow.hasNonNull("decision")) {
                if (!result.getApprovalResult().equals(workflow.path("decision").asText())) throw conflict("SETTLEMENT_DECISION_CONFLICT", "本轮结算审批结果不一致");
                return null;
            }
            if (!"DRAFT".equals(record.getStatus()) || !"SUBMITTED".equals(record.getApprovalStatus()) || !events.mark(result, "SETTLEMENT_DECISION")) throw conflict("SETTLEMENT_APPROVAL_STATE", "结算审批状态与结果记录不一致");
            workflow.put("decision", result.getApprovalResult()).put("decisionActor", result.getApproverId().toString())
                    .put("decisionTime", HrHSupport.now().toString()).put("remoteClosed", true).put("cancelRequested", false);
            putWorkflow(record, workflow);
            if ("REJECTED".equals(result.getApprovalResult())) reservations.releaseLocked(record);
            record.setApprovalStatus(result.getApprovalResult()); save(record); audit(record, "DECISION", revision(workflow)); return null;
        });
    }

    /** Confirmation verifies the persisted decision and the exact business facts that finance reviewed. */
    void verifyApprovedLocked(HrFinalSettlement record) {
        verifyApprovedLocked(record, false);
    }

    void verifyPostedLocked(HrFinalSettlement record) {
        verifyApprovedLocked(record, true);
    }

    private void verifyApprovedLocked(HrFinalSettlement record, boolean posted) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                || !Objects.equals(tenantId(), record.getTenantId()) || !"APPROVED".equals(record.getApprovalStatus())) throw forbidden();
        ObjectNode workflow = workflow(record); verifySubmitted(workflow);
        ObjectNode approved = approval(workflow);
        Long actor = HrHSupport.number(workflow.path("decisionActor").asText()); approvals.verifyRecordedActor(approved, actor);
        if (!"APPROVED".equals(workflow.path("decision").asText()) || !workflow.path("remoteClosed").asBoolean(false)
                || workflow.path("cancelRequested").asBoolean(false) || !"PASSED".equals(instanceStatus(record, workflow, record.getInstanceId()))
                || workflowRecords.decisionMatches(tenantId(), record.getInstanceId(), "PASSED", actor, approved.path("financeNodeId").asText()) != 1) {
            throw conflict("SETTLEMENT_DECISION_MISSING", "结算缺少本轮独立财务的实际通过记录");
        }
        ObjectNode current = drafts.submissionEvidenceLocked(record);
        ObjectNode original = ((ObjectNode) workflow.get("submitted")).deepCopy();
        ((ObjectNode) current.path("calculationSnapshot")).remove(List.of("confirmation", "funds", "posting", "closure"));
        List<String> mutable = List.of("version", "status", "approvalStatus", "instanceId", "paymentRequestId", "settlementProofFileId",
                "confirmedBy", "confirmedTime", "paidTime", "updateBy", "updateTime");
        current.remove(mutable); original.remove(mutable);
        if (posted) {
            for (JsonNode evidence : List.of(current, original)) for (JsonNode item : evidence.path("items")) {
                if (!(item instanceof ObjectNode row)) throw conflict("SETTLEMENT_SUBMITTED_CHANGED", "原审批明细无法核实");
                row.remove(List.of("sourcePostedFlag", "version", "updateBy", "updateTime"));
            }
        }
        if (!submissionDigest(current).equals(submissionDigest(original))) throw conflict("SETTLEMENT_SUBMITTED_CHANGED", "结算金额或依据与财务审阅内容不一致");
    }

    private void finishCancellation(HrFinalSettlement record, ObjectNode workflow) {
        workflow.put("cancelRequested", false).put("remoteClosed", true).put("cancelOutcome", "CANCELLED").put("cancelledTime", HrHSupport.now().toString());
        putWorkflow(record, workflow); reservations.releaseLocked(record); record.setApprovalStatus("CANCELLED"); save(record); audit(record, "CANCELLED", revision(workflow));
    }

    private ProcessStartDTO startRequest(HrFinalSettlement record, ObjectNode workflow) {
        ObjectNode approval = approval(workflow); Map<String, Object> variables = new LinkedHashMap<>();
        for (String field : List.of("applicantUserId", "settlementEmployeeUserId", HrHSupport.EXCLUDED_USERS, "financeApproverIds", "definitionId", "definitionVersion", "modelDigest")) variables.put(field, json.convertValue(approval.get(field), Object.class));
        variables.put("settlementId", record.getSettlementId().toString()); variables.put("settlementRevision", Integer.toString(revision(workflow)));
        variables.put("employeeId", record.getEmployeeId().toString()); variables.put("detailPath", "/hr/final-settlements?settlementId=" + record.getSettlementId());
        ProcessStartDTO request = new ProcessStartDTO(); request.setTenantId(tenantId()); request.setBusinessType(BUSINESS_TYPE);
        request.setBusinessId(record.getSettlementId()); request.setBusinessNo(record.getSettlementNo()); request.setProcessTitle("离职结算财务复核");
        request.setStartUserId(HrHSupport.number(approval.path("applicantUserId").asText())); request.setProcessDefinitionKey(approval.path("processKey").asText()); request.setVariables(variables);
        return request;
    }

    private String instanceStatus(HrFinalSettlement record, ObjectNode workflow, String instanceId) {
        ObjectNode approval = approval(workflow);
        String status = workflowRecords.instanceStatus(tenantId(), instanceId, record.getSettlementId(), revision(workflow),
                HrHSupport.number(approval.path("applicantUserId").asText()), approval.path("definitionId").asText());
        if (status == null) throw conflict("SETTLEMENT_BINDING_CONFLICT", "审批实例与本租户结算、提交人、流程或轮次不一致");
        return status;
    }

    private <T> T basicLocked(Long id, Function<HrFinalSettlement, T> action) {
        HrFinalSettlement initial = find(id);
        return support.transaction(() -> {
            if (employees.lockEmployee(tenantId(), initial.getEmployeeId()) == null || settlements.lock(tenantId(), id) == null) throw forbidden();
            HrFinalSettlement record = find(id); if (!Objects.equals(initial.getEmployeeId(), record.getEmployeeId())) throw forbidden();
            return action.apply(record);
        });
    }
    private void publish(String type, Command command) {
        String key = command.tenantId() + ":" + type + ":" + command.settlementId() + ":R" + command.revision();
        publisher.publish(BusinessEventEnvelope.builder().eventType(type).sourceModule("cloudflow-hr").sourceId(command.settlementId())
                .eventId(UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString()).tenantId(command.tenantId())
                .occurredAt(HrHSupport.now()).payload(access.json(command)).build());
    }
    private void save(HrFinalSettlement record) {
        int version = record.getVersion(); record.setUpdateBy(userName()); record.setUpdateTime(HrHSupport.now());
        if (version == Integer.MAX_VALUE || settlements.updateApproval(record, version) != 1) throw conflict("VERSION_CONFLICT", "结算已变化，请读取原单核对");
        record.setVersion(version + 1);
    }
    private void audit(HrFinalSettlement record, String operation, int revision) { support.audit(BUSINESS_TYPE, record.getSettlementId(), operation, Map.of("revision", revision, "approvalStatus", record.getApprovalStatus(), "version", record.getVersion())); }
    String submissionDigest(JsonNode submitted) { return access.digest(canonical(submitted)); }
    private void verifySubmitted(ObjectNode workflow) { if (!workflow.path("submitted").isObject() || !submissionDigest(workflow.path("submitted")).equals(workflow.path("submittedDigest").asText())) throw conflict("SETTLEMENT_SUBMITTED_CHANGED", "本轮结算提交依据已变化，不能继续审批"); }
    private static Object canonical(JsonNode value) {
        if (value.isObject()) {
            Map<String, Object> result = new java.util.TreeMap<>(); value.fields().forEachRemaining(field -> result.put(field.getKey(), canonical(field.getValue()))); return result;
        }
        if (value.isArray()) { List<Object> result = new java.util.ArrayList<>(); value.forEach(item -> result.add(canonical(item))); return result; }
        if (value.isNumber()) return value.decimalValue().stripTrailingZeros();
        if (value.isBoolean()) return value.booleanValue();
        return value.isNull() ? null : value.asText();
    }
    private HrFinalSettlement find(Long id) { HrFinalSettlement record = id == null ? null : settlements.selectById(id); if (record == null || !Objects.equals(tenantId(), record.getTenantId())) throw forbidden(); return record; }
    private static String lock(Long id) { return "settlement-workflow:" + id; }
    private static ObjectNode calculation(HrFinalSettlement record) { if (!(record.getCalculationSnapshot() instanceof ObjectNode value)) throw conflict("SETTLEMENT_SNAPSHOT_MISSING", "结算缺少已核定计算依据"); return value.deepCopy(); }
    private static ObjectNode workflow(HrFinalSettlement record) { if (!(calculation(record).path("workflow") instanceof ObjectNode value)) throw conflict("SETTLEMENT_SNAPSHOT_MISSING", "结算缺少本轮审批依据"); return value.deepCopy(); }
    private static ObjectNode approval(ObjectNode workflow) { if (!(workflow.path("approval") instanceof ObjectNode value)) throw conflict("SETTLEMENT_SNAPSHOT_MISSING", "结算缺少冻结财务复核名单"); return value.deepCopy(); }
    private static void putWorkflow(HrFinalSettlement record, ObjectNode workflow) { ObjectNode calculation = calculation(record); calculation.set("workflow", workflow); record.setCalculationSnapshot(calculation); }
    private static int revision(JsonNode workflow) { JsonNode revision = workflow.path("revision"); if (!revision.isIntegralNumber() || !revision.canConvertToInt() || revision.intValue() < 1) throw conflict("SETTLEMENT_REVISION_INVALID", "结算审批轮次无效"); return revision.intValue(); }
    private static int nextRevision(JsonNode workflow) { int previous = revision(workflow); if (previous == Integer.MAX_VALUE) throw conflict("SETTLEMENT_REVISION_INVALID", "结算审批轮次已达到容量"); return previous + 1; }
    private static boolean current(HrFinalSettlement record, Command command) { return revision(workflow(record)) == command.revision(); }
    private static Command command(HrFinalSettlement record, ObjectNode workflow) { return new Command(tenantId(), record.getSettlementId(), revision(workflow)); }
    private static void validate(Command command) { if (command == null || !Objects.equals(tenantId(), command.tenantId()) || command.settlementId() == null || command.settlementId() <= 0 || command.revision() == null || command.revision() < 1) throw forbidden(); }
}
