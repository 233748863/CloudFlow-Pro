package com.cloudflow.hr.service;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrOffer;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.mapper.HrHMapper;
import com.cloudflow.hr.mapper.HrOfferMapper;
import com.cloudflow.hr.mapper.HrPositionMapper;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrRecruitmentApprovalService {
    private final HrOfferMapper offers;
    private final HrPositionMapper positions;
    private final HrRecruitmentIdentityService identities;
    private final HrRuleSupport support;
    private final HrRuleWorkflowService workflow;
    private final HrHSupport access;
    private final HrHMapper lookups;
    private final RuntimeSysConfigService settings;
    private final HrReferralProgressService progress;

    @Audit(name = "发起录用审批", spel = "#offerId")
    public void submit(Long offerId) {
        access.permission("hr:recruitment:edit");
        support.transaction(() -> {
            HrOffer offer = offers.lockOffer(tenantId(), offerId);
            if (offer == null || !Integer.valueOf(0).equals(offer.getDeleted())) throw forbidden();
            HrCandidate candidate = identities.requireCandidate(offer.getCandidateId());
            if ("APPROVING".equals(offer.getStatus()) && !support.auditDetail("OFFER", offerId, "SUBMITTED").isEmpty()) return null;
            if (!"DRAFT".equals(offer.getStatus()) || offer.getProcessInstanceId() != null) throw conflict("OFFER_STATE", "仅尚未提交的录用草稿可以发起审批");
            if (offer.getExpectedArrivalDate() == null || offer.getOfferNo() == null || offer.getOfferNo().isBlank()) throw invalid("请补齐录用单号与预计入职日期");
            HrPosition position = offer.getPositionId() == null ? null : positions.selectById(offer.getPositionId());
            if (position == null || !Objects.equals(position.getTenantId(), tenantId()) || !Integer.valueOf(1).equals(position.getStatus())
                    || position.getPositionName() == null || position.getPositionName().isBlank()) throw invalid("请选择有效的拟聘岗位");
            if (offer.getSalary() == null || offer.getSalary().signum() <= 0) throw invalid("请填写大于零的录用月薪");
            Map<String, Object> terms = Map.of("candidateId", candidate.getId().toString(), "candidateName", candidate.getName(),
                    "positionId", position.getId().toString(), "positionName", position.getPositionName(),
                    "salary", offer.getSalary().toPlainString(), "expectedOnboardDate", offer.getExpectedArrivalDate().toString());
            String processKey = settings.getString("sys.hr.offer.processKey", "offer_approval");
            Map<String, Object> definition = lookups.definition(tenantId(), processKey);
            if (definition == null) throw conflict("WORKFLOW_NOT_CONFIGURED", "录用审批流程尚未发布");
            com.fasterxml.jackson.databind.node.ObjectNode model = access.tree(String.valueOf(definition.get("modelJson")));
            List<Long> approvers = lookups.roleUsers(tenantId(), "admin").stream()
                    .filter(userId -> !Objects.equals(userId, access.user())).toList();
            if (approvers.isEmpty()) throw conflict("APPROVER_MISSING", "录用审批缺少独立的管理员审批人");
            access.validateOfferModel(model);
            Map<String, Object> snapshot = new LinkedHashMap<>();
            snapshot.put("applicantUserId", access.user().toString()); snapshot.put("offerApproverIds", approvers.stream().map(String::valueOf).toList());
            snapshot.put(HrHSupport.EXCLUDED_USERS, List.of(access.user().toString())); snapshot.put("candidateId", candidate.getId().toString());
            snapshot.put("processKey", processKey); snapshot.put("definitionId", definition.get("definitionId"));
            snapshot.put("definitionVersion", definition.get("version")); snapshot.put("modelDigest", access.digest(model));
            snapshot.put("offerTermsDigest", access.digest(terms));
            support.audit("OFFER", offerId, "SUBMITTED", snapshot);
            offer.setStatus("APPROVING");
            if (offers.updateById(offer) != 1) throw conflict("VERSION_CONFLICT", "录用单已变化，请重试");
            Map<String, Object> variables = new LinkedHashMap<>(terms);
            variables.put("detailPath", "/hr/recruitment");
            for (String field : List.of("applicantUserId", "offerApproverIds", HrHSupport.EXCLUDED_USERS, "definitionId", "definitionVersion", "modelDigest", "offerTermsDigest")) variables.put(field, snapshot.get(field));
            workflow.enqueue("OFFER", offerId, offer.getOfferNo(), "录用审批", variables);
            return null;
        });
    }

    public void verifyResult(ApprovalResultDTO result) {
        Map<String, Object> submission = support.auditDetail("OFFER", result.getBusinessId(), "SUBMITTED");
        if (submission.isEmpty()) throw conflict("OFFER_SUBMISSION_MISSING", "录用审批缺少服务器提交依据");
        Long actor = result.getApproverId();
        if (actor == null || Objects.equals(actor, HrHSupport.number(submission.get("applicantUserId")))
                || !(submission.get("offerApproverIds") instanceof List<?> approvers)
                || approvers.stream().map(HrHSupport::number).noneMatch(actor::equals)
                || !lookups.roleUsers(tenantId(), "admin").contains(actor)) throw forbidden();
        String resultStatus = "APPROVED".equals(result.getApprovalResult()) ? "PASSED" : "REJECTED".equals(result.getApprovalResult()) ? "REJECTED" : "";
        if (offers.decisionMatches(tenantId(), result.getBusinessId(), result.getProcessInstanceId(), resultStatus, actor) != 1) throw conflict("OFFER_DECISION_MISSING", "录用审批缺少对应流程的真实办理结果");
    }

    @Audit(name = "办理录用审批后续状态", spel = "#offerId")
    public void changeStatus(Long offerId, String action) {
        if ("submit".equals(action)) { submit(offerId); return; }
        access.permission("hr:recruitment:edit");
        support.transaction(() -> {
            HrOffer offer = offers.lockOffer(tenantId(), offerId);
            if (offer == null) throw forbidden();
            HrCandidate candidate = identities.requireCandidate(offer.getCandidateId());
            String next = "send".equals(action) ? "SENT" : "accept".equals(action) ? "ACCEPTED" : "reject".equals(action) && "SENT".equals(offer.getStatus()) ? "REJECTED" : null;
            if (next == null) throw conflict("OFFER_WORKFLOW_REQUIRED", "录用审批结果须由真实审批待办产生");
            if (next.equals(offer.getStatus())) return null;
            if (offer.getProcessInstanceId() == null || !("send".equals(action) ? "APPROVED" : "SENT").equals(offer.getStatus())) throw conflict("OFFER_STATE", "请先完成录用审批及前一步办理");
            if ("REJECTED".equals(next) && "HIRED".equals(candidate.getStatus())) throw conflict("HIRED_CANDIDATE_IMMUTABLE", "员工已经入职，请通过员工异动处理后续离职");
            offer.setStatus(next);
            if (offers.updateById(offer) != 1) throw conflict("VERSION_CONFLICT", "录用状态已变化，请重试");
            progress.recruitmentChanged(offer);
            support.audit("OFFER", offerId, next, Map.of("candidateId", offer.getCandidateId())); return null;
        });
    }
}
