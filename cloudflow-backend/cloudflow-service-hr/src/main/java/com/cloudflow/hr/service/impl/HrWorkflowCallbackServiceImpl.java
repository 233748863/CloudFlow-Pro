package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.service.WorkflowCallbackService;
import com.cloudflow.hr.domain.entity.HrBenefitRequest;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.domain.entity.HrCompChange;
import com.cloudflow.hr.domain.entity.HrContractSignature;
import com.cloudflow.hr.domain.entity.HrLaborDispute;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrMallOrder;
import com.cloudflow.hr.domain.entity.HrOffer;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.cloudflow.hr.domain.entity.HrRecruitmentRequisition;
import com.cloudflow.hr.domain.entity.HrTalentReview;
import com.cloudflow.hr.domain.entity.HrTalentReviewParticipant;
import com.cloudflow.hr.domain.entity.HrTalentSuccessionPlan;
import com.cloudflow.hr.domain.entity.HrTalentSuccessor;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.domain.entity.HrWorkInjury;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrMallOrderMapper;
import com.cloudflow.hr.mapper.HrSelfServiceMessageMapper;
import com.cloudflow.hr.mapper.HrTalentReviewParticipantMapper;
import com.cloudflow.hr.mapper.HrTalentSuccessorMapper;
import com.cloudflow.hr.mapper.HrTrainingEnrollmentMapper;
import com.cloudflow.hr.mapper.HrTrainingSessionMapper;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.service.IHrCertificateService;
import com.cloudflow.hr.service.IHrContractSignatureService;
import com.cloudflow.hr.service.IHrMallOrderService;
import com.cloudflow.hr.service.IHrTalentPoolService;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * HR 工作流审批回调实现。
 *
 * <p>注册为公共 {@link WorkflowCallbackService} 的实现，会替换公共模块的默认 Dispatcher
 * （得益于 {@code @ConditionalOnMissingBean}）。HR 业务不使用 {@code ApprovalResultHandler}
 * 策略模式，而是按 businessType 直接路由到 {@link HrTypedCrudService} 做状态回写。
 *
 * <p>businessType 命名兼容：历史 case 形式为去 {@code HR_} 前缀的裸名
 * （{@code RECRUITMENT_REQUEST} / {@code OFFER} / ...），与
 * {@code WorkflowBusinessTypeContributor} 注册的 {@code HR_*} code 形式存在历史错位。
 * 本类 {@link #normalizeBusinessType} 在归一化时同时剥离 {@code HR_} 前缀，使两种写法均能命中。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrWorkflowCallbackServiceImpl implements WorkflowCallbackService {

    private final HrTypedCrudService crudService;
    private final HrTrainingEnrollmentMapper trainingEnrollmentMapper;
    private final HrTrainingSessionMapper trainingSessionMapper;
    private final IHrCertificateService certificateService;
    private final IHrContractSignatureService contractSignatureService;
    private final HrTalentReviewParticipantMapper talentReviewParticipantMapper;
    private final HrTalentSuccessorMapper talentSuccessorMapper;
    private final IHrTalentPoolService talentPoolService;
    private final HrSelfServiceMessageMapper selfServiceMessageMapper;
    private final HrMallOrderMapper mallOrderMapper;
    private final IHrMallOrderService mallOrderService;
    private final HrWorkInjuryMapper workInjuryMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApprovalResult(ApprovalResultDTO dto) {
        log.info("收到审批结果回调，businessType: {}, businessId: {}, result: {}, processInstanceId: {}",
                dto.getBusinessType(), dto.getBusinessId(), dto.getApprovalResult(), dto.getProcessInstanceId());

        validateApprovalResult(dto);

        // MP TenantLineInnerInterceptor 仅读 TenantContext；HR 历史代码另写 UserContext，
        // 改由 TenantBroker.runAs 包裹保证 finally 恢复，避免 Stream/异步线程跨租户裸跑。
        TenantBroker.runAs(dto.getTenantId(), tid -> {
            UserContext.setTenantId(tid);
            try {
                CallbackTarget target = resolveTarget(dto.getBusinessType());
                String status = resolveStatus(dto.getBusinessType(), dto.getApprovalResult());
                crudService.updateProperties(
                        target.entityClass(),
                        dto.getBusinessId(),
                        Map.of(target.statusField(), status));
                applySideEffects(dto, target, status);
                log.info("审批回调已写入 HR 表，businessType: {}, businessId: {}, entity: {}, statusField: {}, status: {}",
                        dto.getBusinessType(), dto.getBusinessId(),
                        target.entityClass().getSimpleName(), target.statusField(), status);
            } catch (Exception e) {
                log.error("处理审批结果失败，businessType: {}, businessId: {}",
                        dto.getBusinessType(), dto.getBusinessId(), e);
                throw e;
            } finally {
                UserContext.setTenantId(null);
            }
        });
    }

    private CallbackTarget resolveTarget(String businessType) {
        String normalized = normalizeBusinessType(businessType);
        return switch (normalized) {
            case "RECRUITMENT_REQUEST" -> new CallbackTarget(HrRecruitmentRequisition.class, "status");
            case "OFFER" -> new CallbackTarget(HrOffer.class, "status");
            case "ONBOARDING", "PROBATION", "PROBATION_CONFIRMATION", "TRANSFER", "RESIGNATION" ->
                    new CallbackTarget(HrLifecycleApplication.class, "status");
            case "LEAVE", "OVERTIME", "ATTENDANCE_SUPPLEMENT" -> new CallbackTarget(HrTimeRequest.class, "status");
            case "SALARY_ADJUSTMENT" -> new CallbackTarget(HrCompChange.class, "status");
            case "PERFORMANCE_PLAN", "PERFORMANCE_RESULT" -> new CallbackTarget(HrPerformanceObjective.class, "status");
            case "CERTIFICATE_REQUEST" -> new CallbackTarget(HrCertificateRequest.class, "status");
            case "CONTRACT_SIGN" -> new CallbackTarget(HrContractSignature.class, "signStatus");
            case "TRAINING_ENROLLMENT" -> new CallbackTarget(HrTrainingEnrollment.class, "status");
            case "TALENT_REVIEW" -> new CallbackTarget(HrTalentReview.class, "status");
            case "TALENT_SUCCESSION" -> new CallbackTarget(HrTalentSuccessionPlan.class, "status");
            case "BENEFIT_REQUEST" -> new CallbackTarget(HrBenefitRequest.class, "status");
            case "MALL_ORDER" -> new CallbackTarget(HrMallOrder.class, "status");
            case "WORK_INJURY" -> new CallbackTarget(HrWorkInjury.class, "status");
            case "LABOR_DISPUTE" -> new CallbackTarget(HrLaborDispute.class, "status");
            case "ATTENDANCE_APPEAL" -> new CallbackTarget(
                    com.cloudflow.hr.domain.entity.HrAttendanceAppeal.class, "status");
            default -> throw new HrBusinessException("UNSUPPORTED_BUSINESS_TYPE",
                    "不支持的业务类型：" + businessType);
        };
    }

    private String resolveStatus(String businessType, String approvalResult) {
        String normalized = normalizeBusinessType(businessType);
        if (WorkflowCallbackConstants.RESULT_REJECTED.equals(approvalResult)) {
            return "REJECTED";
        }
        // APPROVED 分支
        if ("RECRUITMENT_REQUEST".equals(normalized)) {
            return "RECRUITING";
        }
        if ("PERFORMANCE_PLAN".equals(normalized)) {
            return "PLAN_APPROVED";
        }
        if ("PERFORMANCE_RESULT".equals(normalized)) {
            return "COMPLETED";
        }
        if ("CONTRACT_SIGN".equals(normalized)) {
            return "SIGNED";
        }
        if ("TALENT_REVIEW".equals(normalized) || "TALENT_SUCCESSION".equals(normalized)) {
            return "PUBLISHED";
        }
        if ("BENEFIT_REQUEST".equals(normalized)) {
            return "APPROVED";
        }
        if ("MALL_ORDER".equals(normalized)) {
            return "APPROVED";
        }
        if ("WORK_INJURY".equals(normalized)) {
            return "DETERMINED";
        }
        if ("LABOR_DISPUTE".equals(normalized)) {
            return "AWARDED";
        }
        // CERTIFICATE_REQUEST APPROVED 后由 PDF 生成完毕异步切换为 ISSUED，本回调先落 APPROVED。
        // TRAINING_ENROLLMENT APPROVED 即报名审批通过，待签到/完成再切 ATTENDED/PASSED。
        return "APPROVED";
    }

    private void applySideEffects(ApprovalResultDTO dto, CallbackTarget target, String status) {
        if (target.entityClass() == HrTrainingEnrollment.class) {
            if (!"APPROVED".equals(status)) {
                return;
            }
            // 报名通过 → hr_training_session.enrolled_count++（容量校验在报名入口完成）。
            HrTrainingEnrollment enrollment = trainingEnrollmentMapper.selectById(dto.getBusinessId());
            if (enrollment == null || enrollment.getSessionId() == null) {
                return;
            }
            trainingSessionMapper.incrementEnrolledCount(enrollment.getSessionId(), dto.getTenantId());
            return;
        }
        if (target.entityClass() == HrCertificateRequest.class && "APPROVED".equals(status)) {
            // 证明审批通过 → 渲染 PDF 落到 sys_file，再把 status 切为 ISSUED。
            certificateService.issuePdf(dto.getBusinessId());
            return;
        }
        if (target.entityClass() == HrContractSignature.class && "SIGNED".equals(status)) {
            // 合同签署通过 → 写 sign_time，同步 hr_employee_contract.sign_status = SIGNED。
            contractSignatureService.onSigned(dto.getBusinessId());
            return;
        }
        if (target.entityClass() == HrTalentReview.class && "PUBLISHED".equals(status)) {
            // 盘点发布通过 → 写 publish_time，并将 grid_cell ∈ {1,4} 的员工自动入 HiPo 默认池。
            Long reviewId = dto.getBusinessId();
            Long tenantId = dto.getTenantId();
            crudService.updateProperties(HrTalentReview.class, reviewId,
                    Map.of("publishTime", LocalDateTime.now()));
            List<HrTalentReviewParticipant> hiPos = talentReviewParticipantMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<HrTalentReviewParticipant>()
                            .eq("review_id", reviewId)
                            .eq("tenant_id", tenantId)
                            .eq("deleted", 0)
                            .in("grid_cell", 1, 4));
            for (HrTalentReviewParticipant p : hiPos) {
                talentPoolService.joinDefaultHipoPool(tenantId, p.getEmployeeId(), reviewId);
            }
            log.info("人才盘点发布回调完成，reviewId={}, 入 HiPo 池人数={}", reviewId, hiPos.size());
            return;
        }
        if (target.entityClass() == HrTalentSuccessionPlan.class && "PUBLISHED".equals(status)) {
            // 继任计划发布通过 → 写 publish_time，并向所有 ACTIVE 继任人发 ESS 站内信。
            Long planId = dto.getBusinessId();
            Long tenantId = dto.getTenantId();
            crudService.updateProperties(HrTalentSuccessionPlan.class, planId,
                    Map.of("publishTime", LocalDateTime.now()));
            List<HrTalentSuccessor> successors = talentSuccessorMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<HrTalentSuccessor>()
                            .eq("plan_id", planId)
                            .eq("tenant_id", tenantId)
                            .eq("status", "ACTIVE")
                            .eq("deleted", 0));
            for (HrTalentSuccessor s : successors) {
                com.cloudflow.hr.domain.entity.HrSelfServiceMessage msg =
                        new com.cloudflow.hr.domain.entity.HrSelfServiceMessage();
                msg.setTenantId(tenantId);
                msg.setEmployeeId(s.getEmployeeId());
                msg.setCategory("TALENT_SUCCESSION");
                msg.setTitle("您已被提名为关键岗位继任人");
                msg.setSummary("继任计划已发布，请关注后续发展路径与培养计划。");
                msg.setRelatedId(planId);
                msg.setLinkUrl("/hr/talent/archive");
                msg.setReadFlag(false);
                selfServiceMessageMapper.insert(msg);
            }
            log.info("继任计划发布回调完成，planId={}, 通知继任人数={}", planId, successors.size());
            return;
        }
        if (target.entityClass() == HrBenefitRequest.class && "APPROVED".equals(status)) {
            // 福利申领通过 → 写 paid_at（积分入账/福利发放由下游单独触发，本回调仅打标完成）。
            crudService.updateProperties(HrBenefitRequest.class, dto.getBusinessId(),
                    Map.of("paidAt", LocalDateTime.now()));
            return;
        }
        if (target.entityClass() == HrMallOrder.class && "REJECTED".equals(status)) {
            // 积分商城订单驳回 → 退积分 + 还库存（IHrMallOrderService.cancel 中已封装幂等逻辑）。
            mallOrderService.cancel(dto.getBusinessId(), "工作流驳回");
            return;
        }
        if (target.entityClass() == HrWorkInjury.class && "DETERMINED".equals(status)) {
            // 工伤认定通过 → 写 determined_at，并向员工发 ESS 站内信。
            Long injuryId = dto.getBusinessId();
            Long tenantId = dto.getTenantId();
            crudService.updateProperties(HrWorkInjury.class, injuryId,
                    Map.of("determinedAt", LocalDateTime.now()));
            HrWorkInjury injury = workInjuryMapper.selectById(injuryId);
            if (injury != null && injury.getEmployeeId() != null) {
                com.cloudflow.hr.domain.entity.HrSelfServiceMessage msg =
                        new com.cloudflow.hr.domain.entity.HrSelfServiceMessage();
                msg.setTenantId(tenantId);
                msg.setEmployeeId(injury.getEmployeeId());
                msg.setCategory("WORK_INJURY");
                msg.setTitle("工伤认定结果通知");
                msg.setSummary("您的工伤认定已审批通过，伤残等级："
                        + (injury.getDeterminedGrade() == null ? "待定" : injury.getDeterminedGrade()));
                msg.setRelatedId(injuryId);
                msg.setLinkUrl("/hr/work-injury/list");
                msg.setReadFlag(false);
                selfServiceMessageMapper.insert(msg);
            }
            log.info("工伤认定回调完成，injuryId={}", injuryId);
        }
    }

    private String normalizeBusinessType(String businessType) {
        String upper = String.valueOf(businessType).trim().toUpperCase(Locale.ROOT).replace('-', '_');
        return upper.startsWith("HR_") ? upper.substring(3) : upper;
    }

    private void validateApprovalResult(ApprovalResultDTO dto) {
        if (dto == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "审批结果 DTO 不能为空");
        }
        if (dto.getTenantId() == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "租户 ID 不能为空");
        }
        if (dto.getProcessInstanceId() == null || dto.getProcessInstanceId().isEmpty()) {
            throw new HrBusinessException("INVALID_PARAMETER", "流程实例 ID 不能为空");
        }
        if (dto.getBusinessType() == null || dto.getBusinessType().isEmpty()) {
            throw new HrBusinessException("INVALID_PARAMETER", "业务类型不能为空");
        }
        if (dto.getBusinessId() == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "业务 ID 不能为空");
        }
        if (dto.getApprovalResult() == null || dto.getApprovalResult().isEmpty()) {
            throw new HrBusinessException("INVALID_PARAMETER", "审批结果不能为空");
        }
        if (!WorkflowCallbackConstants.RESULT_APPROVED.equals(dto.getApprovalResult())
                && !WorkflowCallbackConstants.RESULT_REJECTED.equals(dto.getApprovalResult())) {
            throw new HrBusinessException("INVALID_PARAMETER",
                    "审批结果只能是 APPROVED 或 REJECTED，当前值：" + dto.getApprovalResult());
        }
    }

    private record CallbackTarget(Class<?> entityClass, String statusField) {
    }
}
