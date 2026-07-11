package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.service.WorkflowCallbackService;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.dto.UserCreateDTO;
import com.cloudflow.hr.client.vo.UserVO;
import com.cloudflow.hr.domain.entity.HrBenefitRequest;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.domain.entity.HrCompChange;
import com.cloudflow.hr.domain.entity.HrContractSignature;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrLaborDispute;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrMallOrder;
import com.cloudflow.hr.domain.entity.HrOffer;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.domain.entity.HrRecruitmentRequisition;
import com.cloudflow.hr.domain.entity.HrTalentReview;
import com.cloudflow.hr.domain.entity.HrTalentReviewParticipant;
import com.cloudflow.hr.domain.entity.HrTalentSuccessionPlan;
import com.cloudflow.hr.domain.entity.HrTalentSuccessor;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.domain.entity.HrWorkInjury;
import com.cloudflow.hr.domain.entity.WfCallbackSideEffect;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrMallOrderMapper;
import com.cloudflow.hr.mapper.HrOfferMapper;
import com.cloudflow.hr.mapper.HrPositionMapper;
import com.cloudflow.hr.mapper.HrRecruitmentRequisitionMapper;
import com.cloudflow.hr.mapper.HrSelfServiceMessageMapper;
import com.cloudflow.hr.mapper.HrTalentReviewParticipantMapper;
import com.cloudflow.hr.mapper.HrTalentSuccessorMapper;
import com.cloudflow.hr.mapper.HrTrainingEnrollmentMapper;
import com.cloudflow.hr.mapper.HrTrainingSessionMapper;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.mapper.WfCallbackSideEffectMapper;
import com.cloudflow.hr.service.IHrCertificateService;
import com.cloudflow.hr.service.IHrContractSignatureService;
import com.cloudflow.hr.service.IHrMallOrderService;
import com.cloudflow.hr.service.IHrTalentPoolService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.HrEmployeeOnboardingService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DuplicateKeyException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

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

    private static final Set<String> CALLBACK_APPROVING_STATUSES = Set.of(
            "SUBMITTED", "PENDING", "PENDING_APPROVAL", "APPROVING", "IN_PROGRESS", "APPLYING");
    private static final Set<String> CONTRACT_SIGN_APPROVING_STATUSES = Set.of("PENDING", "SIGNING");

    private final HrTypedCrudService crudService;
    private final HrEmployeeOnboardingService employeeOnboardingService;
    private final AuthServiceClient authServiceClient;
    private final HrOfferMapper hrOfferMapper;
    private final HrCandidateMapper hrCandidateMapper;
    private final HrRecruitmentRequisitionMapper hrRecruitmentRequisitionMapper;
    private final HrPositionMapper hrPositionMapper;
    private final HrEmployeeMapper hrEmployeeMapper;
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
    private final WfCallbackSideEffectMapper callbackSideEffectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApprovalResult(ApprovalResultDTO dto) {
        log.info("收到审批结果回调，businessType: {}, businessId: {}, result: {}, processInstanceId: {}",
                dto.getBusinessType(), dto.getBusinessId(), dto.getApprovalResult(), dto.getProcessInstanceId());

        validateApprovalResult(dto);

        // MP TenantLineInnerInterceptor 仅读 TenantContext；HR 历史代码另写 UserContext，
        // 改由 TenantBroker.runAs 包裹保证 finally 恢复，避免 Stream/异步线程跨租户裸跑。
        TenantBroker.runAs(dto.getTenantId(), tid -> {
            Long previousTenantId = UserContext.getTenantId();
            UserContext.setTenantId(tid);
            try {
                CallbackTarget target = resolveTarget(dto.getBusinessType());
                String status = resolveStatus(dto.getBusinessType(), dto.getApprovalResult());
                boolean updated = crudService.updatePropertiesIfWorkflowInstanceMatchesAndCurrentStatusIn(
                        target.entityClass(),
                        dto.getBusinessId(),
                        dto.getProcessInstanceId(),
                        target.statusField(),
                        allowedCurrentStatuses(target),
                        Map.of(target.statusField(), status),
                        target.instanceField());
                if (!updated) {
                    log.warn("HR审批回调未命中当前流程实例、当前状态已非审批中或已处理，跳过副作用: businessType={}, businessId={}, instanceId={}",
                            dto.getBusinessType(), dto.getBusinessId(), dto.getProcessInstanceId());
                    return;
                }
                applySideEffects(dto, target, status);
                log.info("审批回调已写入 HR 表，businessType: {}, businessId: {}, entity: {}, statusField: {}, status: {}",
                        dto.getBusinessType(), dto.getBusinessId(),
                        target.entityClass().getSimpleName(), target.statusField(), status);
            } catch (Exception e) {
                log.error("处理审批结果失败，businessType: {}, businessId: {}",
                        dto.getBusinessType(), dto.getBusinessId(), e);
                throw e;
            } finally {
                UserContext.setTenantId(previousTenantId);
            }
        });
    }

    private Set<String> allowedCurrentStatuses(CallbackTarget target) {
        if (target != null && target.entityClass() == HrContractSignature.class) {
            return CONTRACT_SIGN_APPROVING_STATUSES;
        }
        return CALLBACK_APPROVING_STATUSES;
    }

    private CallbackTarget resolveTarget(String businessType) {
        String normalized = normalizeBusinessType(businessType);
        return switch (normalized) {
            case "RECRUITMENT_REQUEST" -> new CallbackTarget(HrRecruitmentRequisition.class, "status", null);
            case "OFFER" -> new CallbackTarget(HrOffer.class, "status", null);
            case "ONBOARDING", "PROBATION", "PROBATION_CONFIRMATION", "TRANSFER", "RESIGNATION" ->
                    new CallbackTarget(HrLifecycleApplication.class, "status", null);
            case "LEAVE", "OVERTIME", "ATTENDANCE_SUPPLEMENT" ->
                    new CallbackTarget(HrTimeRequest.class, "status", null);
            case "SALARY_ADJUSTMENT" -> new CallbackTarget(HrCompChange.class, "status", null);
            case "PERFORMANCE_PLAN" ->
                    new CallbackTarget(HrPerformanceObjective.class, "status", "planProcessInstanceId");
            case "PERFORMANCE_RESULT" ->
                    new CallbackTarget(HrPerformanceObjective.class, "status", "resultProcessInstanceId");
            case "CERTIFICATE_REQUEST" -> new CallbackTarget(HrCertificateRequest.class, "status", null);
            case "CONTRACT_SIGN" -> new CallbackTarget(HrContractSignature.class, "signStatus", null);
            case "TRAINING_ENROLLMENT" -> new CallbackTarget(HrTrainingEnrollment.class, "status", null);
            case "TALENT_REVIEW" -> new CallbackTarget(HrTalentReview.class, "status", null);
            case "TALENT_SUCCESSION" -> new CallbackTarget(HrTalentSuccessionPlan.class, "status", null);
            case "BENEFIT_REQUEST" -> new CallbackTarget(HrBenefitRequest.class, "status", null);
            case "MALL_ORDER" -> new CallbackTarget(HrMallOrder.class, "status", null);
            case "WORK_INJURY" -> new CallbackTarget(HrWorkInjury.class, "status", null);
            case "LABOR_DISPUTE" -> new CallbackTarget(HrLaborDispute.class, "status", null);
            case "ATTENDANCE_APPEAL" -> new CallbackTarget(
                    com.cloudflow.hr.domain.entity.HrAttendanceAppeal.class, "status", "instanceId");
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
        if (target.entityClass() == HrLifecycleApplication.class && "APPROVED".equals(status)) {
            Map<String, Object> application = crudService.get(HrLifecycleApplication.class, dto.getBusinessId());
            if ("ONBOARDING".equalsIgnoreCase(String.valueOf(application.get("type")))
                    && employeeOnboardingService.isEmployeeCreationRequest(dto.getBusinessId())) {
                runSideEffectOnce(dto, "ONBOARDING_CREATE_EMPLOYEE", () ->
                        employeeOnboardingService.createEmployeeFromApprovedApplication(dto.getBusinessId()));
            }
            return;
        }
        if (target.entityClass() == HrTrainingEnrollment.class) {
            if (!"APPROVED".equals(status)) {
                return;
            }
            // 报名通过 → hr_training_session.enrolled_count++（容量校验在报名入口完成）。
            HrTrainingEnrollment enrollment = trainingEnrollmentMapper.selectById(dto.getBusinessId());
            if (enrollment == null || enrollment.getSessionId() == null) {
                return;
            }
            runSideEffectOnce(dto, "TRAINING_ENROLLED_COUNT", () ->
                    trainingSessionMapper.incrementEnrolledCount(enrollment.getSessionId(), dto.getTenantId()));
            return;
        }
        if (target.entityClass() == HrCertificateRequest.class && "APPROVED".equals(status)) {
            // 证明审批通过 → 渲染 PDF 落到 sys_file，再把 status 切为 ISSUED。
            runSideEffectOnce(dto, "CERTIFICATE_ISSUE_PDF", () -> certificateService.issuePdf(dto.getBusinessId()));
            return;
        }
        if (target.entityClass() == HrOffer.class && "APPROVED".equals(status)) {
            runSideEffectOnce(dto, "OFFER_CREATE_EMPLOYEE", () ->
                    autoCreateEmployeeFromOffer(dto.getBusinessId(), dto.getTenantId()));
            return;
        }
        if (target.entityClass() == HrContractSignature.class) {
            if ("SIGNED".equals(status)) {
                // 合同签署通过 → 写 sign_time，同步 hr_employee_contract.sign_status = SIGNED。
                runSideEffectOnce(dto, "CONTRACT_SIGNED", () -> contractSignatureService.onSigned(dto.getBusinessId()));
            } else {
                // 驳回等非通过态仍要同步主合同，避免 hr_employee_contract 卡在 PENDING/SIGNING。
                runSideEffectOnce(dto, "CONTRACT_SYNC_" + status, () ->
                        contractSignatureService.syncContractSignStatus(dto.getBusinessId(), status));
            }
            return;
        }
        if (target.entityClass() == HrTalentReview.class && "PUBLISHED".equals(status)) {
            runSideEffectOnce(dto, "TALENT_REVIEW_PUBLISH", () -> {
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
            });
            return;
        }
        if (target.entityClass() == HrTalentSuccessionPlan.class && "PUBLISHED".equals(status)) {
            runSideEffectOnce(dto, "TALENT_SUCCESSION_NOTIFY", () -> {
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
            });
            return;
        }
        if (target.entityClass() == HrBenefitRequest.class && "APPROVED".equals(status)) {
            // 福利申领通过 → 写 paid_at（积分入账/福利发放由下游单独触发，本回调仅打标完成）。
            runSideEffectOnce(dto, "BENEFIT_PAID_AT", () ->
                    crudService.updateProperties(HrBenefitRequest.class, dto.getBusinessId(),
                            Map.of("paidAt", LocalDateTime.now())));
            return;
        }
        if (target.entityClass() == HrMallOrder.class && "REJECTED".equals(status)) {
            // 积分商城订单驳回 → 退积分 + 还库存（IHrMallOrderService.cancel 中已封装幂等逻辑）。
            runSideEffectOnce(dto, "MALL_ORDER_CANCEL", () ->
                    mallOrderService.cancel(dto.getBusinessId(), "工作流驳回"));
            return;
        }
        if (target.entityClass() == HrWorkInjury.class && "DETERMINED".equals(status)) {
            runSideEffectOnce(dto, "WORK_INJURY_NOTIFY", () -> {
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
                    msg.setLinkUrl("/hr/work-injury-list");
                    msg.setReadFlag(false);
                    selfServiceMessageMapper.insert(msg);
                }
                log.info("工伤认定回调完成，injuryId={}", injuryId);
            });
        }
    }

    private void runSideEffectOnce(ApprovalResultDTO dto, String effectKey, Runnable action) {
        WfCallbackSideEffect marker = new WfCallbackSideEffect();
        marker.setTenantId(dto.getTenantId());
        marker.setBusinessType(normalizeBusinessType(dto.getBusinessType()));
        marker.setBusinessId(dto.getBusinessId());
        marker.setProcessInstanceId(dto.getProcessInstanceId());
        marker.setEffectKey(effectKey);
        marker.setCreateTime(LocalDateTime.now());
        try {
            callbackSideEffectMapper.insert(marker);
        } catch (DuplicateKeyException e) {
            log.info("工作流回调副作用已执行，跳过重复执行: businessType={}, businessId={}, effectKey={}",
                    dto.getBusinessType(), dto.getBusinessId(), effectKey);
            return;
        }
        action.run();
    }

    private void autoCreateEmployeeFromOffer(Long offerId, Long tenantId) {
        HrOffer offer = hrOfferMapper.selectById(offerId);
        if (offer == null) {
            throw new HrBusinessException("OFFER_NOT_FOUND", "Offer 不存在：" + offerId);
        }
        if (offer.getCandidateId() == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "Offer 缺少 candidateId：" + offerId);
        }

        HrCandidate candidate = hrCandidateMapper.selectById(offer.getCandidateId());
        if (candidate == null) {
            throw new HrBusinessException("CANDIDATE_NOT_FOUND", "候选人不存在：" + offer.getCandidateId());
        }

        HrRecruitmentRequisition requisition = candidate.getRequisitionId() == null
                ? null
                : hrRecruitmentRequisitionMapper.selectById(candidate.getRequisitionId());
        Long positionId = offer.getPositionId() != null
                ? offer.getPositionId()
                : (requisition == null ? null : requisition.getPositionId());
        HrPosition position = positionId == null ? null : hrPositionMapper.selectById(positionId);

        Long userId = ensureUserAccount(tenantId, offer, candidate, requisition, position);
        HrEmployee employee = ensureEmployeeProfile(tenantId, offer, candidate, requisition, position, userId);

        boolean candidateWasHired = "HIRED".equalsIgnoreCase(candidate.getStatus());
        UpdateWrapper<HrCandidate> candidateUpdate = new UpdateWrapper<>();
        candidateUpdate.eq("id", candidate.getId())
                .eq("tenant_id", tenantId)
                .set("status", "HIRED")
                .set("update_by", WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set("update_time", LocalDateTime.now());
        hrCandidateMapper.update(null, candidateUpdate);

        if (!candidateWasHired && requisition != null) {
            UpdateWrapper<HrRecruitmentRequisition> requisitionUpdate = new UpdateWrapper<>();
            requisitionUpdate.eq("id", requisition.getId())
                    .eq("tenant_id", tenantId)
                    .setSql("hired_count = IFNULL(hired_count, 0) + 1")
                    .set("update_by", WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                    .set("update_time", LocalDateTime.now());
            hrRecruitmentRequisitionMapper.update(null, requisitionUpdate);
        }

        log.info("Offer 自动入职完成，offerId={}, candidateId={}, employeeId={}, userId={}",
                offerId, candidate.getId(), employee.getId(), userId);
    }

    private Long ensureUserAccount(Long tenantId,
                                   HrOffer offer,
                                   HrCandidate candidate,
                                   HrRecruitmentRequisition requisition,
                                   HrPosition position) {
        String userName = buildUserName(offer, candidate);
        R<UserVO> existingUserResp = authServiceClient.getUserByUserName(userName);
        if (existingUserResp != null && existingUserResp.isSuccess()
                && existingUserResp.getData() != null && existingUserResp.getData().getUserId() != null) {
            return existingUserResp.getData().getUserId();
        }

        UserCreateDTO createDTO = new UserCreateDTO();
        createDTO.setTenantId(tenantId);
        createDTO.setDeptId(requisition == null ? null : requisition.getDeptId());
        createDTO.setUserName(userName);
        createDTO.setNickName(candidate.getName());
        createDTO.setEmail(candidate.getEmail());
        createDTO.setPhonenumber(candidate.getPhone());
        createDTO.setSex(toUserSex(candidate.getGender()));
        if (position != null && position.getPostId() != null) {
            List<Long> postIds = new ArrayList<>();
            postIds.add(position.getPostId());
            createDTO.setPostIds(postIds);
        }

        R<Long> createResp = authServiceClient.createUser(createDTO);
        if (createResp == null || !createResp.isSuccess() || createResp.getData() == null) {
            String msg = createResp == null ? "Auth 服务无响应" : createResp.getMsg();
            throw new HrBusinessException("AUTO_CREATE_USER_FAILED", "Offer 自动建号失败：" + msg);
        }
        return createResp.getData();
    }

    private HrEmployee ensureEmployeeProfile(Long tenantId,
                                             HrOffer offer,
                                             HrCandidate candidate,
                                             HrRecruitmentRequisition requisition,
                                             HrPosition position,
                                             Long userId) {
        HrEmployee existing = hrEmployeeMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<HrEmployee>()
                .eq(HrEmployee::getTenantId, tenantId)
                .eq(HrEmployee::getUserId, userId)
                .eq(HrEmployee::getDeleted, 0))
                .getRecords().stream().findFirst().orElse(null);
        if (existing != null) {
            return existing;
        }

        if (candidate.getEmail() != null && !candidate.getEmail().isBlank()) {
            existing = hrEmployeeMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<HrEmployee>()
                    .eq(HrEmployee::getTenantId, tenantId)
                    .eq(HrEmployee::getEmail, candidate.getEmail())
                    .eq(HrEmployee::getDeleted, 0))
                    .getRecords().stream().findFirst().orElse(null);
        }
        if (existing == null && candidate.getPhone() != null && !candidate.getPhone().isBlank()) {
            existing = hrEmployeeMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<HrEmployee>()
                    .eq(HrEmployee::getTenantId, tenantId)
                    .eq(HrEmployee::getPhone, candidate.getPhone())
                    .eq(HrEmployee::getDeleted, 0))
                    .getRecords().stream().findFirst().orElse(null);
        }
        if (existing != null) {
            if (existing.getUserId() == null && userId != null) {
                UpdateWrapper<HrEmployee> update = new UpdateWrapper<>();
                update.eq("id", existing.getId())
                        .eq("tenant_id", tenantId)
                        .set("user_id", userId)
                        .set("update_by", WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                        .set("update_time", LocalDateTime.now());
                hrEmployeeMapper.update(null, update);
                existing.setUserId(userId);
            }
            return existing;
        }

        HrEmployee employee = new HrEmployee();
        employee.setTenantId(tenantId);
        employee.setEmployeeNo(generateEmployeeNo(tenantId));
        employee.setName(candidate.getName());
        employee.setGender(normalizeEmployeeGender(candidate.getGender()));
        employee.setPhone(candidate.getPhone());
        employee.setEmail(candidate.getEmail());
        employee.setDeptId(requisition == null ? null : requisition.getDeptId());
        employee.setPostId(position == null ? null : position.getPostId());
        employee.setPositionId(offer.getPositionId() != null ? offer.getPositionId()
                : (requisition == null ? null : requisition.getPositionId()));
        employee.setEmployeeType("FULL_TIME");
        employee.setEmployeeStatus("PROBATION");
        employee.setHireDate(offer.getExpectedArrivalDate() != null ? offer.getExpectedArrivalDate() : LocalDate.now());
        employee.setUserId(userId);
        employee.setDeleted(0);
        employee.setCreateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        employee.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        hrEmployeeMapper.insert(employee);
        return employee;
    }

    private String buildUserName(HrOffer offer, HrCandidate candidate) {
        String seed = offer.getOfferNo();
        if (seed == null || seed.isBlank()) {
            seed = candidate.getEmail();
        }
        if (seed == null || seed.isBlank()) {
            seed = candidate.getPhone();
        }
        if (seed == null || seed.isBlank()) {
            seed = "offer_" + offer.getId();
        }
        String normalized = seed.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_]", "_");
        if (normalized.isBlank()) {
            normalized = "offer_" + offer.getId();
        }
        return normalized;
    }

    private String toUserSex(String gender) {
        if (gender == null) {
            return "2";
        }
        String normalized = gender.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "M", "MALE", "MAN", "男", "0" -> "0";
            case "F", "FEMALE", "WOMAN", "女", "1" -> "1";
            default -> "2";
        };
    }

    private String normalizeEmployeeGender(String gender) {
        if (gender == null || gender.isBlank()) {
            return "UNKNOWN";
        }
        String normalized = gender.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "M", "MALE", "MAN", "男", "0" -> "MALE";
            case "F", "FEMALE", "WOMAN", "女", "1" -> "FEMALE";
            default -> gender;
        };
    }

    private String generateEmployeeNo(Long tenantId) {
        for (int i = 0; i < 5; i++) {
            String employeeNo = "EMP" + System.currentTimeMillis() + i;
            Long exists = hrEmployeeMapper.selectCount(new LambdaQueryWrapper<HrEmployee>()
                    .eq(HrEmployee::getTenantId, tenantId)
                    .eq(HrEmployee::getEmployeeNo, employeeNo));
            if (exists == null || exists == 0) {
                return employeeNo;
            }
        }
        return "EMP" + System.nanoTime();
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

    private record CallbackTarget(Class<?> entityClass, String statusField, String instanceField) {
    }
}
