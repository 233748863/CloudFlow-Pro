package com.cloudflow.hr.service;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.hr.domain.dto.HrAdvanceRequests;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.vo.advance.HrAdvanceViews;
import com.cloudflow.hr.mapper.HrAdvanceApplicationMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

@Service
@RequiredArgsConstructor
public class HrAdvanceApplicationService {
    public static final String BUSINESS_TYPE = "HR_ADVANCE";
    public static final String PAYMENT_CREATE = "HR_ADVANCE_PAYMENT_CREATE";
    private final HrEmployeeAdvanceMapper advances;
    private final HrAdvanceApplicationMapper applications;
    private final HrAdvanceLedgerService ledger;
    private final HrAdvancePolicyService policies;
    private final HrAdvanceApprovalSupport approvals;
    private final HrRuleWorkflowService workflow;
    private final HrHEventService events;
    private final HrHSupport access;
    private final HrRuleSupport support;

    public HrAdvanceViews.Approval approvalDetail(String taskId) {
        access.permission("workflow:task:complete");
        if (taskId == null || !taskId.matches("[A-Za-z0-9_-]{1,64}")) throw forbidden();
        Long advanceId = applications.approvalTaskAdvance(tenantId(), taskId, access.user());
        HrEmployeeAdvance advance = advanceId == null ? null : advances.selectById(advanceId);
        if (advance == null || !Objects.equals(advance.getTenantId(), tenantId()) || advance.getRuleSnapshot() == null) throw forbidden();
        ObjectNode frozen = access.tree(access.json(advance.getRuleSnapshot().path("workflow")));
        approvals.verifyActor(frozen, access.user(), "REJECTED");
        String employeeName = advance.getRuleSnapshot().path("employeeName").asText();
        if (employeeName.isBlank()) throw conflict("ADVANCE_SNAPSHOT_MISSING", "借款缺少提交时的员工姓名");
        return new HrAdvanceViews.Approval(taskId, advanceId, advance.getAdvanceNo(), employeeName,
                advance.getAdvanceAmount().toPlainString(), advance.getPurpose(), advance.getApplyDate(),
                advance.getRepayMode(), advance.getRepayStartMonth(), advance.getRepayMonths(),
                advance.getMonthlyDeductAmount() == null ? null : advance.getMonthlyDeductAmount().toPlainString(), advance.getApprovalStatus());
    }

    @Audit(name = "提交本人借款审批", spel = "#advanceId")
    public void submit(Long advanceId, HrHRequests.VersionDTO input) {
        access.permission("hr:advance:submit"); access.validate(input);
        HrEmployeeAdvance initial = own(advanceId);
        HrAdvanceApplicationRules.Policy policy = "DRAFT".equals(initial.getApprovalStatus())
                ? policies.published("SALARY_DEDUCT".equals(initial.getRepayMode())) : null;
        ledger.withAdvanceLock(advanceId, advance -> {
            HrEmployee employee = access.mine();
            if (!Objects.equals(employee.getId(), advance.getEmployeeId())) throw forbidden();
            Map<String, Object> prior = support.auditDetail(BUSINESS_TYPE, advanceId, "SUBMITTED");
            if (!prior.isEmpty() && Objects.equals(String.valueOf(input.getVersion()), String.valueOf(prior.get("submittedVersion")))
                    && !"CANCELLED".equals(advance.getApprovalStatus())) return null;
            HrHSupport.version(input.getVersion(), advance.getVersion());
            if (!Objects.equals(initial.getRepayMode(), advance.getRepayMode())) throw conflict("VERSION_CONFLICT", "还款方式已变化，请重新读取草稿");
            if (!"APPLYING".equals(advance.getStatus()) || !"DRAFT".equals(advance.getApprovalStatus()) || advance.getInstanceId() != null
                    || advance.getPaymentRequestId() != null || advance.getPaidTime() != null || advance.getOutstandingAmount().signum() != 0
                    || advance.getReservedAmount().signum() != 0 || advance.getRepaidAmount().signum() != 0 || advance.getWrittenOffAmount().signum() != 0) {
                throw conflict("ADVANCE_DRAFT_REQUIRED", "仅本人未提交且尚无放款或还款的草稿可以提交");
            }
            LocalDate date = HrHSupport.today();
            if (applications.activeSettlement(tenantId(), employee.getId()) != 0) throw conflict("ADVANCE_SETTLEMENT_PENDING", "员工已进入离职结算，不能新增借款");
            HrAdvanceRequests.Draft draft = new HrAdvanceRequests.Draft();
            draft.setAmount(advance.getAdvanceAmount()); draft.setPurpose(advance.getPurpose()); draft.setRepayMode(advance.getRepayMode());
            draft.setRepayStartMonth(advance.getRepayStartMonth()); draft.setRepayMonths(advance.getRepayMonths()); draft.setMonthlyDeductAmount(advance.getMonthlyDeductAmount());
            HrAdvanceDraftRules.plan(draft, date);
            ObjectNode snapshot = policies.freeze(advance, policy, date);
            snapshot.put("employeeName", employee.getName());
            Map<String, Object> approval = approvals.snapshot(employee);
            snapshot.set("workflow", access.convert(approval, com.fasterxml.jackson.databind.JsonNode.class));
            advance.setRuleSnapshot(snapshot); advance.setApprovalStatus("SUBMITTED"); save(advance);
            Map<String, Object> variables = new LinkedHashMap<>(); variables.put("advanceId", advanceId.toString());
            variables.put("employeeId", employee.getId().toString()); variables.put("detailPath", "/hr/advances?advanceId=" + advanceId);
            for (String field : List.of("applicantUserId", HrHSupport.EXCLUDED_USERS, "responsibleApproverIds", "financeApproverIds")) variables.put(field, approval.get(field));
            workflow.enqueueForApplicant(BUSINESS_TYPE, advanceId, advance.getAdvanceNo(), "员工借款审批", access.user(), variables);
            support.audit(BUSINESS_TYPE, advanceId, "SUBMITTED", Map.of("submittedVersion", input.getVersion(), "ruleId", policy.multiplier().ruleId(),
                    "ruleVersion", policy.multiplier().ruleVersion(), "employeeId", employee.getId()));
            return null;
        });
    }

    @Audit(name = "撤回本人借款审批", spel = "#advanceId")
    public void withdraw(Long advanceId, HrHRequests.ReasonVersionDTO input) {
        access.permission("hr:advance:submit"); access.validate(input); own(advanceId);
        ledger.withAdvanceLock(advanceId, advance -> {
            if (!Objects.equals(access.mine().getId(), advance.getEmployeeId())) throw forbidden();
            String reason = HrHSupport.text(input.getReason(), 500);
            Map<String, Object> prior = support.auditDetail(BUSINESS_TYPE, advanceId, "WITHDRAWN");
            if ("CANCELLED".equals(advance.getApprovalStatus()) && Objects.equals(prior.get("reason"), reason)
                    && Objects.equals(String.valueOf(input.getVersion()), String.valueOf(prior.get("withdrawnVersion")))) return null;
            HrHSupport.version(input.getVersion(), advance.getVersion());
            if (!"APPLYING".equals(advance.getStatus()) || !"SUBMITTED".equals(advance.getApprovalStatus())
                    || advance.getPaymentRequestId() != null || advance.getPaidTime() != null) throw conflict("ADVANCE_WITHDRAW_STATE", "仅尚未审批通过和放款的申请可以撤回");
            if (advance.getInstanceId() != null && !List.of("RUNNING", "PAUSED", "PENDING", "RESTARTED").contains(
                    Objects.toString(applications.lockWorkflowStatus(tenantId(), advance.getInstanceId()), ""))) {
                throw conflict("ADVANCE_WITHDRAW_STATE", "审批流程已经结束，等待结果同步后核对借款");
            }
            advance.setApprovalStatus("CANCELLED"); save(advance); workflow.cancel(BUSINESS_TYPE, advanceId);
            support.audit(BUSINESS_TYPE, advanceId, "WITHDRAWN", Map.of("withdrawnVersion", input.getVersion(), "reason", reason));
            return null;
        });
    }

    public void onApproval(ApprovalResultDTO result) {
        if (result == null || !BUSINESS_TYPE.equals(result.getBusinessType()) || !Objects.equals(tenantId(), result.getTenantId())
                || !List.of("APPROVED", "REJECTED").contains(Objects.toString(result.getApprovalResult(), ""))) throw invalid("借款审批事件无效");
        ledger.withAdvanceLock(result.getBusinessId(), advance -> {
            if (!Objects.equals(advance.getAdvanceNo(), result.getBusinessNo())) throw forbidden();
            if (advance.getInstanceId() == null) throw conflict("WORKFLOW_BINDING_PENDING", "等待借款审批实例绑定恢复");
            if (!Objects.equals(advance.getInstanceId(), result.getProcessInstanceId())) throw forbidden();
            ObjectNode snapshot = advance.getRuleSnapshot() instanceof ObjectNode value ? value.deepCopy() : null;
            if (snapshot == null || !snapshot.path("workflow").isObject()) throw conflict("ADVANCE_SNAPSHOT_MISSING", "借款缺少提交时的规则及审批依据");
            approvals.verifyRecordedActor(access.tree(access.json(snapshot.path("workflow"))), result.getApproverId(), result.getApprovalResult());
            String expectedStatus = "APPROVED".equals(result.getApprovalResult()) ? "PASSED" : "REJECTED";
            if (applications.decisionMatches(tenantId(), advance.getAdvanceId(), advance.getInstanceId(), expectedStatus, result.getApproverId()) != 1) {
                throw conflict("ADVANCE_DECISION_MISSING", "借款审批缺少真实流程办理结果");
            }
            if ("CANCELLED".equals(advance.getApprovalStatus())) return null;
            if (snapshot.hasNonNull("decision")) {
                if (!result.getApprovalResult().equals(snapshot.path("decision").asText())) throw conflict("ADVANCE_DECISION_CONFLICT", "借款审批结果与原结果不一致");
                return null;
            }
            if (!"SUBMITTED".equals(advance.getApprovalStatus()) || !"APPLYING".equals(advance.getStatus())) throw conflict("ADVANCE_APPROVAL_STATE", "借款当前不在审批中");
            if (!events.mark(result, "ADVANCE_DECISION")) throw conflict("ADVANCE_DECISION_MISSING", "借款审批标记与业务结果不一致");
            snapshot.put("decision", result.getApprovalResult()); snapshot.put("decisionActor", result.getApproverId().toString());
            advance.setRuleSnapshot(snapshot); advance.setApprovalStatus(result.getApprovalResult());
            if ("APPROVED".equals(result.getApprovalResult())) advance.setStatus("APPROVED");
            save(advance);
            if ("APPROVED".equals(result.getApprovalResult())) events.execution(PAYMENT_CREATE, advance.getAdvanceId(), advance.getVersion());
            support.audit(BUSINESS_TYPE, advance.getAdvanceId(), "DECISION", Map.of("result", result.getApprovalResult(), "instanceId", advance.getInstanceId()));
            return null;
        });
    }

    private HrEmployeeAdvance own(Long advanceId) {
        HrEmployeeAdvance advance = advanceId == null || advanceId <= 0 ? null : advances.selectById(advanceId);
        if (advance == null || !Objects.equals(advance.getTenantId(), tenantId()) || !Objects.equals(access.mine().getId(), advance.getEmployeeId())) throw forbidden();
        return advance;
    }

    private void save(HrEmployeeAdvance advance) {
        advance.setUpdateBy(userName()); advance.setUpdateTime(HrHSupport.now());
        if (advances.updateById(advance) != 1) throw conflict("VERSION_CONFLICT", "借款已变化，请重新读取原单");
    }
}
