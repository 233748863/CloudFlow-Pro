package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.Hr360EvaluatorResponsePayload;
import com.cloudflow.hr.domain.dto.HrAppraisalRequests;
import com.cloudflow.hr.domain.entity.HrPerfEvaluator;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.cloudflow.hr.domain.vo.performance.HrAppraisalViews;
import com.cloudflow.hr.mapper.HrPerfEvaluatorMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrAppraisalInvitations {
    private final HrPerfEvaluatorMapper invitations;
    private final HrHSupport access;
    private final HrAppraisalGuard guard;
    private final IHrPerformance360Service performance360;

    public PageResult<HrAppraisalViews.Invitation> mine(HrAppraisalRequests.InvitationQuery query) {
        access.permission("hr:appraisal:respond");
        access.validate(query);
        Page<HrAppraisalViews.Invitation> page = invitations.selectOwnInvitations(new Page<>(query.getPageNum(), query.getPageSize()),
                tenantId(), access.mine().getId(), query);
        return new PageResult<>(page.getRecords(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public HrAppraisalViews.Invitation detail(Long invitationId) {
        access.permission("hr:appraisal:respond");
        HrAppraisalViews.Invitation invitation = invitations.selectOwnInvitation(tenantId(), access.mine().getId(), invitationId);
        if (invitation == null) throw forbidden();
        return invitation;
    }

    @Audit(name = "提交本人受邀周期评分")
    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public void respond(Long invitationId, HrAppraisalRequests.Response input) {
        access.permission("hr:appraisal:respond");
        access.validate(input);
        Long employeeId = access.mine().getId();
        HrPerfEvaluator invitation = owned(invitationId, employeeId);
        HrPerformanceObjective objective = guard.objective(invitation.getObjectiveId());
        if (objective == null || objective.getCycleId() == null) throw invalid("本人受邀评分入口仅支持真实绩效周期邀请");
        guard.lock(objective.getCycleId(), "SCORING");
        invitation = owned(invitationId, employeeId);
        HrHSupport.version(input.getVersion(), invitation.getVersion());
        if (!"PENDING".equals(invitation.getStatus())) throw conflict("APPRAISAL_INVITATION_CHANGED", "邀请已提交或取消，请读取本人邀请核对结果");
        guard.member(objective.getCycleId(), invitation.getEvaluateeId());
        guard.evaluationTarget(invitation.getObjectiveId(), invitation.getAssignmentId(), invitation.getEvaluateeId());
        Hr360EvaluatorResponsePayload payload = new Hr360EvaluatorResponsePayload();
        payload.setEvaluatorId(invitationId);
        payload.setScore(input.getScore());
        payload.setCommentText(input.getCommentText());
        performance360.submitResponse(payload);
    }

    private HrPerfEvaluator owned(Long invitationId, Long employeeId) {
        HrPerfEvaluator invitation = invitations.selectOne(new LambdaQueryWrapper<HrPerfEvaluator>()
                .eq(HrPerfEvaluator::getId, invitationId).eq(HrPerfEvaluator::getTenantId, tenantId())
                .eq(HrPerfEvaluator::getEvaluatorId, employeeId).eq(HrPerfEvaluator::getDeleted, 0));
        if (invitation == null) throw forbidden();
        if ("CUSTOMER".equals(invitation.getEvaluatorSource())) throw invalid(HrAppraisalRules.CUSTOMER_DISABLED);
        return invitation;
    }
}
