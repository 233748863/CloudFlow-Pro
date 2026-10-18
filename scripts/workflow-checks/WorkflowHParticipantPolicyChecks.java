import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.service.WorkflowCompletionContext;
import com.cloudflow.workflow.service.WorkflowHParticipantPolicy;
import com.cloudflow.workflow.service.WorkflowNodePolicy;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.lang.reflect.Proxy;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiFunction;

public final class WorkflowHParticipantPolicyChecks {
    private static final Long TENANT = 100000L;
    private static final Long APPLICANT = 11L;
    private static final Long PEER = 12L;
    private static final Long RESPONSIBLE = 21L;
    private static final Long HUMAN_RESOURCES = 22L;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static int checks;

    public static void main(String[] arguments) {
        for (Class<?> entity : List.of(SysUser.class, SysRole.class, SysUserRole.class, WfTaskHistory.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "h-participant-checks"), entity);
        }
        Long previousUser = UserContext.getUserId();
        Long previousTenant = UserContext.getTenantId();
        try {
            UserContext.setTenantId(TENANT);
            checkStartContract();
            checkFrozenIdentity();
            checkNodeAndTaskActions();
            checkLegacyProcesses();
            checkCorrectionsAndModels();
            checkMeetings();
            checkRefunds();
            checkSettlements();
        } finally {
            UserContext.setUserId(previousUser);
            UserContext.setTenantId(previousTenant);
        }
        System.out.println("PASS: " + checks + " workflow H participant checks");
    }

    private static void checkStartContract() {
        Fixture overtime = new Fixture("HR_OVERTIME", false);
        Fixture single = new Fixture("HR_SHIFT_REQUEST", false);
        Fixture swap = new Fixture("HR_SHIFT_REQUEST", true);
        Fixture consumable = new Fixture("OA_CONSUMABLE_REQUEST", false);
        for (Fixture fixture : List.of(overtime, single, swap, consumable)) {
            accepts(() -> fixture.policy.assertStart(TENANT, APPLICANT, fixture.variables(), null));
        }
        changedStart(overtime, "_hExcludedUserIds", null, "H_APPROVER_MISSING");
        changedStart(overtime, "_hExcludedUserIds", List.of("12"), "H_EXCLUSIONS_INVALID");
        changedStart(overtime, "_hExcludedUserIds", List.of("11", "11"), "H_APPROVER_INVALID");
        changedStart(overtime, "applicantUserId", "12", "H_EXCLUSIONS_INVALID");
        changedStart(overtime, "responsibleApproverIds", null, "H_APPROVER_MISSING");
        changedStart(overtime, "hrApproverIds", null, "H_APPROVER_MISSING");
        changedStart(overtime, "responsibleApproverIds", List.of(), "H_APPROVER_MISSING");
        changedStart(overtime, "responsibleApproverIds", List.of(21L), "H_IDENTITY_INVALID");
        changedStart(overtime, "responsibleApproverIds", List.of("0"), "H_IDENTITY_INVALID");
        changedStart(overtime, "responsibleApproverIds", List.of("9223372036854775808"), "H_IDENTITY_INVALID");
        changedStart(overtime, "responsibleApproverIds", List.of("21", "22"), "H_APPROVER_INVALID");
        changedStart(overtime, "responsibleApproverIds", List.of("22"), "H_SELF_APPROVAL_FORBIDDEN");
        changedStart(overtime, "responsibleApproverIds", List.of("11"), "H_SELF_APPROVAL_FORBIDDEN");
        changedStart(overtime, "hrApproverIds", List.of("21"), "H_SELF_APPROVAL_FORBIDDEN");
        changedStart(swap, "requestMode", null, "H_IDENTITY_MISSING");
        changedStart(swap, "requestMode", "UNKNOWN", "H_IDENTITY_MISSING");
        changedStart(swap, "_hExcludedUserIds", List.of("11"), "H_EXCLUSIONS_INVALID");
        changedStart(swap, "responsibleApproverIds", List.of("12"), "H_SELF_APPROVAL_FORBIDDEN");
        changedStart(consumable, "approverIds", List.of("11"), "H_SELF_APPROVAL_FORBIDDEN");
        changedStart(overtime, "nodeAssignees", Map.of(), "H_ASSIGNEE_OVERRIDE_FORBIDDEN");
        changedStart(overtime, "_nodeAssignees", Map.of(), "H_ASSIGNEE_OVERRIDE_FORBIDDEN");
        rejects("H_ASSIGNEE_OVERRIDE_FORBIDDEN", () -> overtime.policy.assertStart(TENANT, APPLICANT,
                overtime.variables(), Map.of("responsible", List.of(RESPONSIBLE))));
        rejects("H_IDENTITY_MISSING", () -> overtime.policy.assertStart(null, APPLICANT, overtime.variables(), null));
        overtime.users.get(RESPONSIBLE).setStatus("1");
        rejects("H_APPROVER_UNAVAILABLE", () -> overtime.policy.assertStart(TENANT, APPLICANT, overtime.variables(), null));
        overtime.users.get(RESPONSIBLE).setStatus("0");
        overtime.users.get(HUMAN_RESOURCES).setTenantId(TENANT + 1);
        rejects("H_APPROVER_UNAVAILABLE", () -> overtime.policy.assertStart(TENANT, APPLICANT, overtime.variables(), null));
        swap.users.get(PEER).setDeleted(1);
        rejects("H_APPROVER_UNAVAILABLE", () -> swap.policy.assertStart(TENANT, APPLICANT, swap.variables(), null));
    }

    private static void checkFrozenIdentity() {
        Fixture fixture = new Fixture("HR_OVERTIME", false);
        accepts(() -> fixture.policy.assertTaskVariables(fixture.runtime(), Map.of("comment", "approved")));
        for (String key : List.of("businessType", "businessId", "businessKey", "callbackStreamKey", "tenantId",
                "startUserId", "applicantUserId", "requestMode", "approverIds", "responsibleApproverIds",
                "hrApproverIds", "_hExcludedUserIds", "_nodeAssignees", "_other")) {
            rejects("H_IDENTITY_OVERRIDE_FORBIDDEN", () -> fixture.policy.assertTaskVariables(fixture.runtime(), Map.of(key, "changed")));
        }
        rejects("H_IDENTITY_OVERRIDE_FORBIDDEN", () -> fixture.policy.assertTaskVariables(fixture.runtime(),
                Map.of("responsibleApproverIds", List.of("21"))));
        Map<String, Object> changed = fixture.variables();
        changed.put("businessType", "OTHER");
        changed.remove("_hExcludedUserIds");
        rejects("H_IDENTITY_OVERRIDE_FORBIDDEN", () -> fixture.policy.assertRuntimeVariables(fixture.runtime(), changed));
        WfProcessInstance untrusted = fixture.runtime();
        untrusted.setVariables(stringify(changed));
        rejects("H_IDENTITY_OVERRIDE_FORBIDDEN", () -> fixture.policy.assertRuntimeVariables(untrusted, fixture.variables()));
        untrusted.setTenantId(TENANT + 1);
        rejects("H_IDENTITY_MISMATCH", () -> fixture.policy.assertRuntimeVariables(untrusted, fixture.variables()));
        Map<String, Object> incomplete = fixture.variables();
        incomplete.remove("_hExcludedUserIds");
        fixture.stored.setVariables(stringify(incomplete));
        rejects("H_APPROVER_MISSING", () -> fixture.policy.assertTaskVariables(fixture.runtime(), Map.of()));
    }

    private static void checkNodeAndTaskActions() {
        Fixture fixture = new Fixture("HR_SHIFT_REQUEST", true);
        WfNodeConfig responsibleNode = fixture.nodes.get("responsible");
        WfTask task = fixture.task("responsible", RESPONSIBLE);
        UserContext.setUserId(RESPONSIBLE);
        accepts(() -> fixture.policy.assertAssignees(fixture.runtime(), responsibleNode, List.of(RESPONSIBLE)));
        accepts(() -> fixture.policy.assertTaskAction(task, RESPONSIBLE, Map.of()));
        accepts(() -> fixture.policy.assertNodeExecution(fixture.runtime(), responsibleNode, fixture.variables()));
        rejects("H_NODE_UNSAFE", () -> fixture.policy.assertAssignees(fixture.runtime(), null, List.of(RESPONSIBLE)));
        rejects("H_APPROVER_INVALID", () -> fixture.policy.assertAssignees(fixture.runtime(), responsibleNode, List.of()));
        rejects("H_APPROVER_INVALID", () -> fixture.policy.assertAssignees(fixture.runtime(), responsibleNode, List.of(APPLICANT)));
        rejects("H_APPROVER_INVALID", () -> fixture.policy.assertTaskAssignment(task, PEER));
        rejects("H_APPROVER_INVALID", () -> fixture.policy.assertTaskAssignment(task, HUMAN_RESOURCES));
        rejects("H_APPROVER_INVALID", () -> fixture.policy.assertTaskAction(fixture.task("responsible", APPLICANT), RESPONSIBLE, null));
        rejects("H_SELF_APPROVAL_FORBIDDEN", () -> fixture.policy.assertTaskAction(task, APPLICANT, null));
        UserContext.setUserId(APPLICANT);
        task.setProxyUserId(APPLICANT);
        rejects("H_SELF_APPROVAL_FORBIDDEN", () -> fixture.policy.assertTaskAction(task, APPLICANT, null));
        rejects("H_SELF_APPROVAL_FORBIDDEN", () -> fixture.policy.assertTaskAction(task, RESPONSIBLE, null));
        UserContext.setUserId(RESPONSIBLE);
        UserContext.setTenantId(TENANT + 1);
        rejects("H_SELF_APPROVAL_FORBIDDEN", () -> fixture.policy.assertTaskAction(task, RESPONSIBLE, null));
        UserContext.setTenantId(TENANT);
        rejects("H_SELF_APPROVAL_FORBIDDEN", () -> WorkflowCompletionContext.automatically(() -> {
            fixture.policy.assertTaskAction(task, RESPONSIBLE, null);
            return null;
        }));
        rejects("H_PARTICIPANT_CHANGE_FORBIDDEN", () -> fixture.policy.assertParticipantChange(task, List.of(HUMAN_RESOURCES)));
        rejects("H_PARTICIPANT_CHANGE_FORBIDDEN", () -> fixture.policy.assertFrozenParticipants(fixture.stored.getInstanceId()));
        rejects("H_TASK_ROUTE_UNSAFE", () -> fixture.policy.assertNoDirectCompletion(task));
        rejects("H_AUTOMATIC_APPROVAL_FORBIDDEN", () -> fixture.policy.assertNoAutomaticSkip(fixture.runtime()));
        accepts(() -> fixture.policy.assertCompletion(fixture.runtime(), "REJECTED"));
        rejects("H_APPROVER_INVALID", () -> fixture.policy.assertCompletion(fixture.runtime(), "PASSED"));
        UserContext.setUserId(HUMAN_RESOURCES);
        accepts(() -> fixture.policy.assertCompletion(fixture.runtime(), "PASSED"));
        rejects("H_APPROVER_INVALID", () -> fixture.policy.assertCompletion(fixture.runtime(), "AUTO_PASSED"));

        responsibleNode.setAllowDelegate(null);
        responsibleNode.setAllowAddSign(null);
        rejects("H_NODE_UNSAFE", () -> fixture.policy.assertAssignees(fixture.runtime(), responsibleNode, List.of(RESPONSIBLE)));
        responsibleNode.setProps(Map.of("allowDelegate", false, "allowAddSign", false));
        accepts(() -> fixture.policy.assertAssignees(fixture.runtime(), responsibleNode, List.of(RESPONSIBLE)));
        responsibleNode.setProps(Map.of("allowDelegate", "false", "allowAddSign", false));
        rejects("H_NODE_UNSAFE", () -> fixture.policy.assertAssignees(fixture.runtime(), responsibleNode, List.of(RESPONSIBLE)));
        responsibleNode.setProps(Map.of("allowDelegate", false, "allowAddSign", false));
        responsibleNode.setAllowDelegate(true);
        rejects("H_NODE_UNSAFE", () -> fixture.policy.assertAssignees(fixture.runtime(), responsibleNode, List.of(RESPONSIBLE)));
        responsibleNode.setAllowDelegate(false);
        responsibleNode.setAllowAddSign(false);
        responsibleNode.setApproveSelf("AUTO_SKIP");
        rejects("H_NODE_UNSAFE", () -> fixture.policy.assertAssignees(fixture.runtime(), responsibleNode, List.of(RESPONSIBLE)));
        responsibleNode.setApproveSelf("ALLOW");
        responsibleNode.setApproverValue("approverIds");
        rejects("H_NODE_UNSAFE", () -> fixture.policy.assertAssignees(fixture.runtime(), responsibleNode, List.of(RESPONSIBLE)));
        responsibleNode.setType("MANUAL");
        rejects("H_NODE_UNSAFE", () -> fixture.policy.assertNodeExecution(fixture.runtime(), responsibleNode, fixture.variables()));
        fixture.stored.setDefinitionId(null);
        rejects("H_MODEL_DRIFT", () -> fixture.policy.assertNodeExecution(fixture.runtime(), responsibleNode, fixture.variables()));

        Fixture consumable = new Fixture("OA_CONSUMABLE_REQUEST", false);
        WfTask consumableTask = consumable.task("approval", RESPONSIBLE);
        UserContext.setUserId(RESPONSIBLE);
        accepts(() -> consumable.policy.assertTaskAction(consumableTask, RESPONSIBLE, null));
        accepts(() -> consumable.policy.assertParticipantChange(consumableTask, List.of(RESPONSIBLE)));
        rejects("H_APPROVER_INVALID", () -> consumable.policy.assertParticipantChange(consumableTask, List.of(APPLICANT)));
        rejects("H_APPROVER_INVALID", () -> consumable.policy.assertParticipantChange(consumableTask, List.of(HUMAN_RESOURCES)));
        consumable.users.get(RESPONSIBLE).setStatus("1");
        rejects("H_APPROVER_UNAVAILABLE", () -> consumable.policy.assertTaskAction(consumableTask, RESPONSIBLE, null));
    }

    private static void checkLegacyProcesses() {
        Fixture fixture = new Fixture("OTHER", false);
        WfTask task = fixture.task("legacy", null);
        accepts(() -> fixture.policy.assertStart(TENANT, APPLICANT, fixture.variables(), Map.of("legacy", List.of(APPLICANT))));
        accepts(() -> fixture.policy.assertTaskVariables(fixture.runtime(), Map.of("businessType", "OTHER", "_legacy", true)));
        accepts(() -> fixture.policy.assertTaskAction(task, null, null));
        accepts(() -> fixture.policy.assertParticipantChange(task, List.of(APPLICANT)));
        accepts(() -> fixture.policy.assertFrozenParticipants(fixture.stored.getInstanceId()));
        accepts(() -> fixture.policy.assertNoDirectCompletion(task));
        accepts(() -> fixture.policy.assertNoAutomaticSkip(fixture.runtime()));
        accepts(() -> fixture.policy.assertCompletion(fixture.runtime(), "AUTO_PASSED"));
        changedStart(fixture, "_hExcludedUserIds", List.of("11"), "H_IDENTITY_MISSING");
    }

    private static void checkCorrectionsAndModels() {
        Fixture correction = new Fixture("HR_PAYROLL_CORRECTION", false, true);
        UserContext.setUserId(RESPONSIBLE);
        WfNodeConfig finance = correction.nodes.get("finance");
        WfTask task = correction.task("finance", RESPONSIBLE);
        accepts(() -> correction.policy.assertTaskAction(task, RESPONSIBLE, null));
        accepts(() -> correction.policy.assertCompletion(correction.runtime(), "PASSED"));
        accepts(() -> {
            if (!List.of(RESPONSIBLE).equals(correction.policy.resolveFrozenAssignees(correction.runtime(), finance))) {
                throw new AssertionError("Finance role must resolve from frozen independent list, not live first member");
            }
        });
        rejects("H_PARTICIPANT_CHANGE_FORBIDDEN", () -> correction.policy.assertParticipantChange(task, List.of(HUMAN_RESOURCES)));
        rejects("H_PARTICIPANT_CHANGE_FORBIDDEN", () -> correction.policy.assertFrozenParticipants(correction.stored.getInstanceId()));
        rejects("H_IDENTITY_OVERRIDE_FORBIDDEN", () -> correction.policy.assertTaskVariables(correction.runtime(), Map.of("hCorrectionApproverIds", List.of("22"))));
        rejects("H_SELF_APPROVAL_FORBIDDEN", () -> WorkflowCompletionContext.automatically(() -> {
            correction.policy.assertCompletion(correction.runtime(), "PASSED"); return null;
        }));
        changedStart(correction, "_hExcludedUserIds", null, "H_APPROVER_MISSING");
        changedStart(correction, "hCorrectionApproverIds", null, "H_APPROVER_MISSING");
        changedStart(correction, "hCorrectionApproverIds", List.of("11"), "H_SELF_APPROVAL_FORBIDDEN");
        finance.setApproverType("VARIABLE_USER"); finance.setApproverValue("hCorrectionApproverIds");
        correction.refreeze();
        accepts(() -> correction.policy.assertTaskAction(task, RESPONSIBLE, null));
        accepts(() -> correction.policy.assertAssignees(correction.runtime(), finance, List.of(RESPONSIBLE)));
        finance.setSignType("ALL"); correction.refreeze();
        accepts(() -> correction.policy.assertAssignees(correction.runtime(), finance, List.of(RESPONSIBLE, HUMAN_RESOURCES)));
        correction.financeMembers.remove(RESPONSIBLE);
        rejects("H_FINANCE_UNAVAILABLE", () -> correction.policy.assertTaskAction(task, RESPONSIBLE, null));

        Fixture ordinaryCorrection = new Fixture("HR_PAYROLL_CORRECTION", false);
        accepts(() -> ordinaryCorrection.policy.assertTaskAction(ordinaryCorrection.task("finance", APPLICANT), null, null));
        accepts(() -> ordinaryCorrection.policy.assertNoAutomaticSkip(ordinaryCorrection.runtime()));
        accepts(() -> ordinaryCorrection.policy.freezeStartDefinition(TENANT, APPLICANT, ordinaryCorrection.variables(), null));
        for (String marker : List.of("hCorrectionApproverIds", "_hDefinition")) {
            ordinaryCorrection.stored.setVariables("{\"businessType\":\"HR_PAYROLL_CORRECTION\",\"" + marker + "\":");
            rejects("H_IDENTITY_INVALID", () -> ordinaryCorrection.policy.assertTaskAction(ordinaryCorrection.task("finance", APPLICANT), null, null));
        }

        Fixture model = new Fixture("HR_OVERTIME", false);
        Map<String, Object> expected = model.startVariables();
        accepts(() -> model.policy.freezeStartDefinition(TENANT, APPLICANT, expected, model.definition));
        for (String field : List.of("definitionId", "definitionVersion", "modelDigest")) {
            Map<String, Object> changed = model.startVariables(); changed.remove(field);
            rejects("H_MODEL_SNAPSHOT_CONFLICT", () -> model.policy.freezeStartDefinition(TENANT, APPLICANT, changed, model.definition));
        }
        rejects("H_IDENTITY_OVERRIDE_FORBIDDEN", () -> model.policy.freezeStartDefinition(TENANT, APPLICANT, model.variables(), model.definition));
        model.definition.setVersion(2);
        rejects("H_MODEL_DRIFT", () -> model.policy.assertTaskAction(model.task("responsible", RESPONSIBLE), RESPONSIBLE, null));
        model.definition.setVersion(1);
        model.definition.setModelJson(model.definition.getModelJson().replace("responsibleApproverIds", "hrApproverIds"));
        rejects("H_MODEL_DRIFT", () -> model.policy.assertTaskAction(model.task("responsible", RESPONSIBLE), RESPONSIBLE, null));

        Fixture missingStage = new Fixture("HR_OVERTIME", false);
        missingStage.nodes.remove("responsible");
        rejects("H_MODEL_UNSAFE", missingStage::refreeze);
        Fixture histories = new Fixture("HR_OVERTIME", false);
        UserContext.setUserId(HUMAN_RESOURCES);
        WfTaskHistory responsibleHistory = histories.histories.get(0);
        responsibleHistory.setOperatorId(APPLICANT);
        rejects("H_STAGE_INCOMPLETE", () -> histories.policy.assertCompletion(histories.runtime(), "PASSED"));
        responsibleHistory.setOperatorId(RESPONSIBLE); responsibleHistory.setTaskType("AUTO_PASS");
        rejects("H_STAGE_INCOMPLETE", () -> histories.policy.assertCompletion(histories.runtime(), "PASSED"));
        responsibleHistory.setTaskType("APPROVAL");
        accepts(() -> histories.policy.assertCompletion(histories.runtime(), "PASSED"));
        histories.histories.remove(0);
        rejects("H_STAGE_INCOMPLETE", () -> histories.policy.assertCompletion(histories.runtime(), "PASSED"));
        rejects("H_STAGE_INCOMPLETE", () -> histories.policy.assertNodeExecution(histories.runtime(), histories.nodes.get("hr"), histories.variables()));
        rejects("H_STAGE_INCOMPLETE", () -> histories.policy.assertAssignees(histories.runtime(), histories.nodes.get("hr"), List.of(HUMAN_RESOURCES)));
        rejects("H_STAGE_INCOMPLETE", () -> histories.policy.assertTaskAssignment(histories.task("hr", HUMAN_RESOURCES), HUMAN_RESOURCES));
        rejects("H_STAGE_INCOMPLETE", () -> histories.policy.assertTaskAction(histories.task("hr", HUMAN_RESOURCES), HUMAN_RESOURCES, null));
        accepts(() -> histories.policy.assertAssignees(histories.runtime(), histories.nodes.get("responsible"), List.of(RESPONSIBLE)));
    }

    private static void changedStart(Fixture fixture, String field, Object value, String code) {
        Map<String, Object> variables = fixture.variables();
        if (value == null) variables.remove(field); else variables.put(field, value);
        rejects(code, () -> fixture.policy.assertStart(TENANT, APPLICANT, variables, null));
    }

    private static void accepts(Runnable operation) {
        operation.run();
        checks++;
    }

    private static void rejects(String code, Runnable operation) {
        try {
            operation.run();
        } catch (WorkflowException failure) {
            if (!code.equals(failure.getCode())) throw new AssertionError("Expected " + code + ", got " + failure.getCode(), failure);
            checks++;
            return;
        }
        throw new AssertionError("Expected " + code);
    }

    private static String stringify(Map<String, Object> variables) {
        try { return JSON.writeValueAsString(variables); }
        catch (Exception failure) { throw new AssertionError(failure); }
    }

    private static <MapperType> MapperType proxy(Class<MapperType> type, BiFunction<String, Object[], Object> calls) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type},
                (target, method, arguments) -> calls.apply(method.getName(), arguments)));
    }

    private static void checkMeetings() {
        Fixture meeting = new Fixture("OA_MEETING_BOOKING", false);
        UserContext.setUserId(RESPONSIBLE);
        accepts(() -> meeting.policy.assertStart(TENANT, APPLICANT, meeting.startVariables(), null));
        changedStart(meeting, "approverIds", List.of(APPLICANT.toString()), "H_SELF_APPROVAL_FORBIDDEN");
        accepts(() -> meeting.policy.assertTaskAction(meeting.task("approval", RESPONSIBLE), RESPONSIBLE, Map.of()));
        rejects("H_SELF_APPROVAL_FORBIDDEN", () -> meeting.policy.assertTaskAction(meeting.task("approval", RESPONSIBLE), APPLICANT, Map.of()));
        for (String field : List.of("roomId", "startTime", "endTime", "scheduleVersion", "oaRequestToken", "meetingTitle")) {
            rejects("H_IDENTITY_OVERRIDE_FORBIDDEN", () -> meeting.policy.assertTaskVariables(meeting.runtime(), Map.of(field, "changed")));
        }
        rejects("H_PARTICIPANT_CHANGE_FORBIDDEN", () -> meeting.policy.assertParticipantChange(meeting.task("approval", RESPONSIBLE), List.of(APPLICANT)));
        accepts(() -> meeting.policy.assertCompletion(meeting.runtime(), "PASSED"));
        meeting.histories.clear();
        rejects("H_STAGE_INCOMPLETE", () -> meeting.policy.assertCompletion(meeting.runtime(), "PASSED"));
        meeting.nodes.get("approval").setAllowDelegate(true);
        rejects("H_MODEL_UNSAFE", meeting::refreeze);
        meeting.nodes.get("approval").setAllowDelegate(false); meeting.nodes.get("approval").setApproveSelf("AUTO_SKIP");
        rejects("H_MODEL_UNSAFE", meeting::refreeze);
    }

    private static void checkRefunds() {
        int before = checks;
        Fixture refund = new Fixture("crm_refund", false);
        UserContext.setUserId(RESPONSIBLE);
        accepts(() -> refund.policy.assertStart(TENANT, APPLICANT, refund.startVariables(), null));
        accepts(() -> refund.policy.assertAssignees(refund.runtime(), refund.nodes.get("customer_owner"), List.of(RESPONSIBLE)));
        accepts(() -> refund.policy.assertTaskAction(refund.task("customer_owner", RESPONSIBLE), RESPONSIBLE, Map.of()));
        changedStart(refund, "customerOwnerApproverIds", List.of(APPLICANT.toString()), "H_SELF_APPROVAL_FORBIDDEN");
        changedStart(refund, "financeReviewerIds", List.of(APPLICANT.toString()), "H_SELF_APPROVAL_FORBIDDEN");
        changedStart(refund, "financeReviewerIds", List.of(RESPONSIBLE.toString()), "H_SELF_APPROVAL_FORBIDDEN");
        changedStart(refund, "customerOwnerApproverIds", List.of(RESPONSIBLE.toString(), HUMAN_RESOURCES.toString()), "H_APPROVER_INVALID");
        for (String field : List.of("definitionId", "definitionVersion", "modelDigest")) {
            Map<String, Object> variables = refund.startVariables(); variables.remove(field);
            rejects("H_MODEL_SNAPSHOT_CONFLICT", () -> refund.policy.freezeStartDefinition(TENANT, APPLICANT, variables, refund.definition));
        }
        for (String field : List.of("refundApproval", "customerOwnerApproverIds", "financeReviewerIds", "approvalId", "businessRefId", "approvalNo")) {
            rejects("H_IDENTITY_OVERRIDE_FORBIDDEN", () -> refund.policy.assertTaskVariables(refund.runtime(), Map.of(field, "changed")));
        }
        rejects("H_PARTICIPANT_CHANGE_FORBIDDEN", () -> refund.policy.assertParticipantChange(refund.task("customer_owner", RESPONSIBLE), List.of(HUMAN_RESOURCES)));
        rejects("H_PARTICIPANT_CHANGE_FORBIDDEN", () -> refund.policy.assertFrozenParticipants(refund.stored.getInstanceId()));
        rejects("H_TASK_ROUTE_UNSAFE", () -> refund.policy.assertNoDirectCompletion(refund.task("customer_owner", RESPONSIBLE)));
        rejects("H_AUTOMATIC_APPROVAL_FORBIDDEN", () -> refund.policy.assertNoAutomaticSkip(refund.runtime()));
        rejects("H_APPROVER_INVALID", () -> refund.policy.assertCompletion(refund.runtime(), "PASSED"));
        UserContext.setUserId(APPLICANT);
        rejects("H_SELF_APPROVAL_FORBIDDEN", () -> refund.policy.assertTaskAction(refund.task("customer_owner", RESPONSIBLE), APPLICANT, Map.of()));
        UserContext.setUserId(HUMAN_RESOURCES);
        accepts(() -> refund.policy.assertAssignees(refund.runtime(), refund.nodes.get("finance_review"), List.of(HUMAN_RESOURCES, PEER)));
        accepts(() -> refund.policy.assertTaskAction(refund.task("finance_review", HUMAN_RESOURCES), HUMAN_RESOURCES, Map.of()));
        for (String action : List.of("APPROVE", "REJECT")) {
            accepts(() -> {
                String expected = "APPROVE".equals(action) ? "PASSED" : "REJECTED";
                if (!expected.equals(refund.policy.refundDecision(refund.task("finance_review", HUMAN_RESOURCES), action)))
                    throw new AssertionError("One independent finance decision must close the refund review");
            });
        }
        rejects("H_TASK_ROUTE_UNSAFE", () -> refund.policy.refundDecision(refund.task("customer_owner", RESPONSIBLE), "APPROVE"));
        accepts(() -> refund.policy.assertCompletion(refund.runtime(), "PASSED"));
        accepts(() -> refund.policy.assertCompletion(refund.runtime(), "REJECTED"));
        rejects("H_APPROVER_INVALID", () -> refund.policy.assertCompletion(refund.runtime(), "AUTO_PASSED"));
        WfTaskHistory owner = refund.histories.remove(0);
        rejects("H_STAGE_INCOMPLETE", () -> refund.policy.assertAssignees(refund.runtime(), refund.nodes.get("finance_review"), List.of(HUMAN_RESOURCES, PEER)));
        rejects("H_STAGE_INCOMPLETE", () -> refund.policy.assertTaskAction(refund.task("finance_review", HUMAN_RESOURCES), HUMAN_RESOURCES, null));
        rejects("H_STAGE_INCOMPLETE", () -> refund.policy.assertCompletion(refund.runtime(), "PASSED"));
        refund.histories.add(0, owner);
        owner.setOnBehalfOfUserId(APPLICANT);
        rejects("H_STAGE_INCOMPLETE", () -> refund.policy.assertCompletion(refund.runtime(), "PASSED"));
        owner.setOnBehalfOfUserId(null); owner.setCreateTime(LocalDateTime.now().plusDays(1));
        rejects("H_STAGE_INCOMPLETE", () -> refund.policy.assertCompletion(refund.runtime(), "PASSED"));
        owner.setCreateTime(refund.histories.get(1).getCreateTime());
        accepts(() -> refund.policy.assertCompletion(refund.runtime(), "PASSED"));
        refund.financeMembers.remove(HUMAN_RESOURCES);
        rejects("H_FINANCE_UNAVAILABLE", () -> refund.policy.assertTaskAction(refund.task("finance_review", HUMAN_RESOURCES), HUMAN_RESOURCES, null));
        refund.financeMembers.add(HUMAN_RESOURCES); refund.users.get(PEER).setStatus("1");
        rejects("H_APPROVER_UNAVAILABLE", () -> refund.policy.assertCompletion(refund.runtime(), "PASSED"));
        refund.users.get(PEER).setStatus("0");
        for (String flag : List.of("allowDelegate", "allowAddSign", "allowAgent")) {
            Fixture unsafe = new Fixture("crm_refund", false);
            unsafe.nodes.get("finance_review").setProps(Map.of(flag, true));
            rejects("H_MODEL_UNSAFE", unsafe::refreeze);
        }
        Fixture wrongSign = new Fixture("crm_refund", false); wrongSign.nodes.get("finance_review").setSignType("ALL");
        rejects("H_MODEL_UNSAFE", wrongSign::refreeze);
        Fixture overwrittenSign = new Fixture("crm_refund", false); overwrittenSign.nodes.get("finance_review").setProps(Map.of("signType", "ALL"));
        rejects("H_MODEL_UNSAFE", overwrittenSign::refreeze);
        Fixture ordinary = new Fixture("OA_CONSUMABLE_REQUEST", false);
        accepts(() -> {
            if (ordinary.policy.refundDecision(ordinary.task("approval", RESPONSIBLE), "REJECT") != null)
                throw new AssertionError("Other businesses retain existing countersign semantics");
        });
        System.out.println("H3_REFUND_WORKFLOW_PARTICIPANT_CHECKS: assertions=" + (checks - before) + "; failed=0; frozen_order=true; workflow_http=false");
    }

    private static void checkSettlements() {
        int before = checks;
        Fixture settlement = new Fixture("HR_SETTLEMENT", false);
        accepts(() -> settlement.policy.assertStart(TENANT, APPLICANT, settlement.startVariables(), null));
        settlement.users.get(PEER).setStatus("1");
        accepts(() -> settlement.policy.assertStart(TENANT, APPLICANT, settlement.startVariables(), null));
        settlement.users.get(PEER).setDeleted(1);
        rejects("H_EXCLUSIONS_INVALID", () -> settlement.policy.assertStart(TENANT, APPLICANT, settlement.startVariables(), null));
        settlement.users.get(PEER).setDeleted(0); settlement.users.get(PEER).setTenantId(999L);
        rejects("H_EXCLUSIONS_INVALID", () -> settlement.policy.assertStart(TENANT, APPLICANT, settlement.startVariables(), null));
        settlement.users.get(PEER).setTenantId(TENANT);
        settlement.users.get(APPLICANT).setStatus("1");
        rejects("H_APPROVER_UNAVAILABLE", () -> settlement.policy.assertStart(TENANT, APPLICANT, settlement.startVariables(), null));
        settlement.users.get(APPLICANT).setStatus("0");
        changedStart(settlement, "_hExcludedUserIds", List.of("11"), "H_EXCLUSIONS_INVALID");
        changedStart(settlement, "settlementEmployeeUserId", "11", "H_EXCLUSIONS_INVALID");
        changedStart(settlement, "settlementRevision", "0", "H_IDENTITY_INVALID");
        changedStart(settlement, "settlementRevision", "2147483648", "H_EXCLUSIONS_INVALID");
        changedStart(settlement, "settlementId", "902", "H_EXCLUSIONS_INVALID");
        changedStart(settlement, "financeApproverIds", List.of("11"), "H_SELF_APPROVAL_FORBIDDEN");
        changedStart(settlement, "financeApproverIds", List.of("12"), "H_SELF_APPROVAL_FORBIDDEN");
        UserContext.setUserId(HUMAN_RESOURCES);
        accepts(() -> settlement.policy.assertTaskAction(settlement.task("finance_review", HUMAN_RESOURCES), HUMAN_RESOURCES, null));
        accepts(() -> settlement.policy.assertCompletion(settlement.runtime(), "PASSED"));
        rejects("H_APPROVER_INVALID", () -> settlement.policy.assertCompletion(settlement.runtime(), "AUTO_PASSED"));
        rejects("H_PARTICIPANT_CHANGE_FORBIDDEN", () -> settlement.policy.assertParticipantChange(settlement.task("finance_review", HUMAN_RESOURCES), List.of(RESPONSIBLE)));
        rejects("H_PARTICIPANT_CHANGE_FORBIDDEN", () -> settlement.policy.assertFrozenParticipants(settlement.stored.getInstanceId()));
        rejects("H_AUTOMATIC_APPROVAL_FORBIDDEN", () -> settlement.policy.assertNoAutomaticSkip(settlement.runtime()));
        for (String field : List.of("settlementId", "settlementRevision", "settlementEmployeeUserId", "financeApproverIds", "_hExcludedUserIds")) {
            rejects("H_IDENTITY_OVERRIDE_FORBIDDEN", () -> settlement.policy.assertTaskVariables(settlement.runtime(), Map.of(field, "forged")));
        }
        WfTaskHistory decision = settlement.histories.get(0);
        decision.setOnBehalfOfUserId(RESPONSIBLE);
        rejects("H_STAGE_INCOMPLETE", () -> settlement.policy.assertCompletion(settlement.runtime(), "PASSED"));
        decision.setOnBehalfOfUserId(null); decision.setTaskType("APPROVAL");
        rejects("H_STAGE_INCOMPLETE", () -> settlement.policy.assertCompletion(settlement.runtime(), "PASSED"));
        decision.setTaskType("OR_SIGN"); decision.setAction("APPROVE");
        rejects("H_STAGE_INCOMPLETE", () -> settlement.policy.assertCompletion(settlement.runtime(), "PASSED"));
        decision.setAction("COUNTERSIGN_APPROVE");
        settlement.financeMembers.remove(HUMAN_RESOURCES);
        rejects("H_FINANCE_UNAVAILABLE", () -> settlement.policy.assertTaskAction(settlement.task("finance_review", HUMAN_RESOURCES), HUMAN_RESOURCES, null));
        settlement.financeMembers.add(HUMAN_RESOURCES);
        settlement.stored.setBusinessKey("HR_SETTLEMENT:901:R2");
        rejects("H_IDENTITY_INVALID", () -> settlement.policy.assertCompletion(settlement.runtime(), "PASSED"));
        for (String flag : List.of("allowDelegate", "allowAddSign", "allowAgent", "allowSelection", "allowEdit")) {
            Fixture unsafe = new Fixture("HR_SETTLEMENT", false); unsafe.nodes.get("finance_review").setProps(Map.of(flag, true));
            rejects("H_MODEL_UNSAFE", unsafe::refreeze);
        }
        Fixture wrongSign = new Fixture("HR_SETTLEMENT", false); wrongSign.nodes.get("finance_review").setSignType("ALL");
        rejects("H_MODEL_UNSAFE", wrongSign::refreeze);
        Fixture extraStage = new Fixture("HR_SETTLEMENT", false); extraStage.addNode("leader", "responsibleApproverIds");
        rejects("H_MODEL_UNSAFE", extraStage::refreeze);
        System.out.println("H2_SETTLEMENT_PARTICIPANT_CHECKS: assertions=" + (checks - before) + "; failed=0; disabled_employee_allowed=true; actual_policy=true; database_fixtures=true; workflow_http=false");
    }

    private static final class Fixture {
        private final WfProcessInstance stored = new WfProcessInstance();
        private final WfProcessDefinition definition = new WfProcessDefinition();
        private final Map<String, WfNodeConfig> nodes = new LinkedHashMap<>();
        private final Map<Long, SysUser> users = new LinkedHashMap<>();
        private final Set<Long> financeMembers = new LinkedHashSet<>(List.of(APPLICANT, RESPONSIBLE, HUMAN_RESOURCES));
        private final List<WfTaskHistory> histories = new ArrayList<>();
        private final WorkflowHParticipantPolicy policy;

        private Fixture(String businessType, boolean swap) {
            this(businessType, swap, false);
        }

        private Fixture(String businessType, boolean swap, boolean correction) {
            stored.setInstanceId("h-participant-check");
            stored.setTenantId(TENANT);
            stored.setStartUserId(APPLICANT);
            stored.setDefinitionId("frozen-definition");
            Map<String, Object> variables = new HashMap<>();
            variables.put("businessType", businessType);
            variables.put("businessId", "901");
            boolean controlled = Set.of("HR_OVERTIME", "HR_SHIFT_REQUEST", "HR_SETTLEMENT", "OA_CONSUMABLE_REQUEST", "OA_MEETING_BOOKING", "crm_refund").contains(businessType) || correction;
            if (controlled) {
                boolean hr = "HR_OVERTIME".equals(businessType) || "HR_SHIFT_REQUEST".equals(businessType);
                variables.put(hr || correction || "HR_SETTLEMENT".equals(businessType) ? "applicantUserId" : "applicantId", APPLICANT.toString());
                variables.put("_hExcludedUserIds", swap ? List.of(APPLICANT.toString(), PEER.toString()) : List.of(APPLICANT.toString()));
                if ("HR_SETTLEMENT".equals(businessType)) {
                    variables.put("settlementId", "901"); variables.put("employeeId", "801"); variables.put("settlementRevision", "1");
                    variables.put("settlementEmployeeUserId", PEER.toString()); variables.put("_hExcludedUserIds", List.of(APPLICANT.toString(), PEER.toString()));
                    variables.put("financeApproverIds", List.of(HUMAN_RESOURCES.toString()));
                    stored.setBusinessKey("HR_SETTLEMENT:901:R1");
                    addNode("finance_review", "financeApproverIds"); nodes.get("finance_review").setSignType("ANY");
                } else if (hr) {
                    variables.put("responsibleApproverIds", List.of(RESPONSIBLE.toString()));
                    variables.put("hrApproverIds", List.of(HUMAN_RESOURCES.toString()));
                    addNode("responsible", "responsibleApproverIds");
                    addNode("hr", "hrApproverIds");
                } else if ("crm_refund".equals(businessType)) {
                    variables.put("customerOwnerApproverIds", List.of(RESPONSIBLE.toString()));
                    variables.put("financeReviewerIds", List.of(HUMAN_RESOURCES.toString(), PEER.toString()));
                    variables.put("refundApproval", Map.of("approvalId", "901", "receiptEventId", "902", "refundAmount", "5.00"));
                    addNode("customer_owner", "customerOwnerApproverIds");
                    addNode("finance_review", "financeReviewerIds"); nodes.get("finance_review").setSignType("ANY");
                    financeMembers.add(PEER);
                } else if (correction) {
                    variables.put("hCorrectionApproverIds", List.of(RESPONSIBLE.toString(), HUMAN_RESOURCES.toString()));
                    addNode("finance", "finance"); nodes.get("finance").setApproverType("ROLE");
                } else {
                    variables.put("approverIds", List.of(RESPONSIBLE.toString()));
                    addNode("approval", "approverIds");
                }
                if ("HR_SHIFT_REQUEST".equals(businessType)) variables.put("requestMode", swap ? "SWAP" : "SINGLE");
            }
            stored.setVariables(stringify(variables));
            for (Long userId : List.of(APPLICANT, PEER, RESPONSIBLE, HUMAN_RESOURCES)) {
                SysUser user = new SysUser();
                user.setUserId(userId); user.setTenantId(TENANT); user.setStatus("0"); user.setDeleted(0);
                users.put(userId, user);
            }
            WfProcessInstanceMapper instanceMapper = proxy(WfProcessInstanceMapper.class, (method, arguments) -> {
                if ("selectById".equals(method) && Objects.equals(arguments[0], stored.getInstanceId())) return stored;
                throw new AssertionError("Unexpected instance access: " + method);
            });
            SysUserMapper userMapper = proxy(SysUserMapper.class, (method, arguments) -> {
                if (!"selectList".equals(method)) throw new AssertionError("Unexpected user access: " + method);
                LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) arguments[0];
                String sql = query.getSqlSegment();
                boolean employeeIdentity = "HR_SETTLEMENT".equals(businessType) && !sql.contains("status") && sql.contains("user_id =");
                if (!sql.contains("tenant_id") || !employeeIdentity && !sql.contains("status") || !sql.contains("deleted")) {
                    throw new AssertionError("Participant lookup must check tenant, status and deletion");
                }
                Map<String, Object> values = query.getParamNameValuePairs();
                return users.values().stream().filter(user -> Objects.equals(user.getTenantId(), values.get("MPGENVAL1"))
                        && (employeeIdentity || "0".equals(user.getStatus())) && Integer.valueOf(0).equals(user.getDeleted())
                        && values.containsValue(user.getUserId())).toList();
            });
            WorkflowNodePolicy nodePolicy = new WorkflowNodePolicy(null, null, null) {
                @Override
                public WfNodeConfig resolveNode(WfProcessInstance instance, String nodeKey) { return nodes.get(nodeKey); }
            };
            definition.setDefinitionId(stored.getDefinitionId()); definition.setTenantId(TENANT);
            definition.setVersion(1); definition.setProcessKey("crm_refund".equals(businessType) ? "crm_refund_review" : "h-process");
            WfProcessDefinitionMapper definitions = proxy(WfProcessDefinitionMapper.class, (method, arguments) -> {
                if (!"selectById".equals(method)) throw new AssertionError("Unexpected definition access: " + method);
                return Objects.equals(definition.getDefinitionId(), arguments[0]) ? definition : null;
            });
            SysRoleMapper roles = proxy(SysRoleMapper.class, (method, arguments) -> {
                SysRole role = new SysRole(); role.setRoleId(99L); role.setTenantId(TENANT);
                role.setRoleKey("finance"); role.setStatus("0"); role.setDeleted(0); return List.of(role);
            });
            SysUserRoleMapper members = proxy(SysUserRoleMapper.class, (method, arguments) -> {
                LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) arguments[0]; query.getSqlSegment();
                return financeMembers.stream().filter(userId -> query.getParamNameValuePairs().containsValue(userId)).map(userId -> {
                    SysUserRole member = new SysUserRole(); member.setUserId(userId); member.setRoleId(99L); member.setTenantId(TENANT); return member;
                }).toList();
            });
            WfTaskHistoryMapper historyMapper = proxy(WfTaskHistoryMapper.class, (method, arguments) -> new ArrayList<>(histories));
            policy = new WorkflowHParticipantPolicy(instanceMapper, userMapper, nodePolicy, definitions, roles, members, historyMapper);
            if (controlled) refreeze();
            for (String nodeId : nodes.keySet()) {
                WfTaskHistory history = new WfTaskHistory(); history.setNodeKey(nodeId); history.setTenantId(TENANT);
                history.setInstanceId(stored.getInstanceId()); history.setAction("APPROVE"); history.setTaskType("APPROVAL");
                history.setOperatorId(Set.of("hr", "finance_review").contains(nodeId) ? HUMAN_RESOURCES : RESPONSIBLE);
                history.setTaskId("h-task-" + nodeId); history.setCreateTime(LocalDateTime.now().withNano(0)); histories.add(history);
                if ("HR_SETTLEMENT".equals(businessType)) { history.setAction("COUNTERSIGN_APPROVE"); history.setTaskType("OR_SIGN"); }
            }
        }

        private Map<String, Object> startVariables() {
            Map<String, Object> variables = variables(); variables.remove("_hDefinition"); return variables;
        }

        private void refreeze() {
            List<Object> graphNodes = new ArrayList<>(); graphNodes.add(Map.of("id", "start", "type", "START"));
            graphNodes.addAll(nodes.values()); graphNodes.add(Map.of("id", "end", "type", "END"));
            List<String> order = new ArrayList<>(); order.add("start"); order.addAll(nodes.keySet()); order.add("end");
            List<Map<String, String>> edges = new ArrayList<>();
            for (int index = 0; index < order.size() - 1; index++) edges.add(Map.of("source", order.get(index), "target", order.get(index + 1)));
            definition.setModelJson(stringify(Map.of("nodes", graphNodes, "edges", edges)));
            Map<String, Object> variables = startVariables();
            variables.put("definitionId", definition.getDefinitionId()); variables.put("definitionVersion", definition.getVersion());
            try { variables.put("modelDigest", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(JSON.readTree(definition.getModelJson()))))); }
            catch (Exception failure) { throw new AssertionError(failure); }
            stored.setVariables(stringify(policy.freezeStartDefinition(TENANT, APPLICANT, variables, definition)));
        }

        private void addNode(String id, String variable) {
            WfNodeConfig node = new WfNodeConfig();
            node.setId(id); node.setType("APPROVAL"); node.setApproverType("VARIABLE_USER"); node.setApproverValue(variable);
            node.setAllowDelegate(false); node.setAllowAddSign(false);
            nodes.put(id, node);
        }

        private Map<String, Object> variables() {
            try { return JSON.readValue(stored.getVariables(), new TypeReference<Map<String, Object>>() {}); }
            catch (Exception failure) { throw new AssertionError(failure); }
        }

        private WfProcessInstance runtime() {
            WfProcessInstance instance = new WfProcessInstance();
            instance.setInstanceId(stored.getInstanceId()); instance.setTenantId(stored.getTenantId());
            instance.setStartUserId(stored.getStartUserId()); instance.setDefinitionId(stored.getDefinitionId());
            instance.setVariables(stored.getVariables());
            return instance;
        }

        private WfTask task(String nodeKey, Long assigneeId) {
            WfTask task = new WfTask();
            task.setTaskId("h-task-check"); task.setTenantId(TENANT); task.setInstanceId(stored.getInstanceId());
            task.setNodeKey(nodeKey); task.setAssignee(assigneeId);
            return task;
        }
    }
}
