package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.service.WorkflowCallbackService;
import com.cloudflow.hr.domain.entity.HrCompChange;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrOffer;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.cloudflow.hr.domain.entity.HrRecruitmentRequisition;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

/**
 * HR 工作流审批回调实现。
 *
 * <p>注册为公共 {@link WorkflowCallbackService} 的实现，会替换公共模块的默认 Dispatcher
 * （得益于 {@code @ConditionalOnMissingBean}）。HR 业务不使用 {@code ApprovalResultHandler}
 * 策略模式，而是按 businessType 直接路由到 {@link HrTypedCrudService} 做状态回写。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrWorkflowCallbackServiceImpl implements WorkflowCallbackService {

    private final HrTypedCrudService crudService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApprovalResult(ApprovalResultDTO dto) {
        log.info("收到审批结果回调，businessType: {}, businessId: {}, result: {}, processInstanceId: {}",
                dto.getBusinessType(), dto.getBusinessId(), dto.getApprovalResult(), dto.getProcessInstanceId());

        validateApprovalResult(dto);

        // 回调线程没有登录态，显式补租户上下文，保证异步回写仍然走租户隔离。
        UserContext.setTenantId(dto.getTenantId());
        TenantContext.setTenantId(dto.getTenantId());
        try {
            CallbackTarget target = resolveTarget(dto.getBusinessType());
            String status = resolveStatus(dto.getBusinessType(), dto.getApprovalResult());
            crudService.updateProperties(target.entityClass(), dto.getBusinessId(), java.util.Map.of("status", status));
            log.info("审批回调已写入 HR 表，businessType: {}, businessId: {}, entity: {}, status: {}",
                    dto.getBusinessType(), dto.getBusinessId(), target.entityClass().getSimpleName(), status);
        } catch (Exception e) {
            log.error("处理审批结果失败，businessType: {}, businessId: {}",
                    dto.getBusinessType(), dto.getBusinessId(), e);
            throw e;
        } finally {
            UserContext.setTenantId(null);
            TenantContext.clear();
        }
    }

    private CallbackTarget resolveTarget(String businessType) {
        String normalized = normalizeBusinessType(businessType);
        return switch (normalized) {
            case "RECRUITMENT_REQUEST" -> new CallbackTarget(HrRecruitmentRequisition.class);
            case "OFFER" -> new CallbackTarget(HrOffer.class);
            case "ONBOARDING", "PROBATION", "PROBATION_CONFIRMATION", "TRANSFER", "RESIGNATION" ->
                    new CallbackTarget(HrLifecycleApplication.class);
            case "LEAVE", "OVERTIME", "ATTENDANCE_SUPPLEMENT" -> new CallbackTarget(HrTimeRequest.class);
            case "SALARY_ADJUSTMENT" -> new CallbackTarget(HrCompChange.class);
            case "PERFORMANCE_PLAN", "PERFORMANCE_RESULT" -> new CallbackTarget(HrPerformanceObjective.class);
            default -> throw new HrBusinessException("UNSUPPORTED_BUSINESS_TYPE",
                    "不支持的业务类型：" + businessType);
        };
    }

    private String resolveStatus(String businessType, String approvalResult) {
        if (WorkflowCallbackConstants.RESULT_REJECTED.equals(approvalResult)) {
            return "REJECTED";
        }
        String normalized = normalizeBusinessType(businessType);
        if ("RECRUITMENT_REQUEST".equals(normalized)) {
            return "RECRUITING";
        }
        if ("PERFORMANCE_PLAN".equals(normalized)) {
            return "PLAN_APPROVED";
        }
        if ("PERFORMANCE_RESULT".equals(normalized)) {
            return "COMPLETED";
        }
        return "APPROVED";
    }

    private String normalizeBusinessType(String businessType) {
        return String.valueOf(businessType).trim().toUpperCase(Locale.ROOT).replace('-', '_');
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

    private record CallbackTarget(Class<?> entityClass) {
    }
}
