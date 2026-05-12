package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.service.HrDomainCrudService;
import com.cloudflow.hr.service.WorkflowCallbackService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Map;

/**
 * 工作流审批回调分发服务。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowCallbackServiceImpl implements WorkflowCallbackService {

    private final HrDomainCrudService crudService;

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
            crudService.update(target.tableName(), dto.getBusinessId(), Map.of("status", status));
            log.info("审批回调已写入新HR表，businessType: {}, businessId: {}, table: {}, status: {}",
                    dto.getBusinessType(), dto.getBusinessId(), target.tableName(), status);
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
            case "RECRUITMENT_REQUEST" -> new CallbackTarget("hr_recruitment_requisition");
            case "OFFER" -> new CallbackTarget("hr_offer");
            case "ONBOARDING", "PROBATION", "PROBATION_CONFIRMATION", "TRANSFER", "RESIGNATION" ->
                    new CallbackTarget("hr_lifecycle_application");
            case "LEAVE", "OVERTIME", "ATTENDANCE_SUPPLEMENT" -> new CallbackTarget("hr_time_request");
            case "SALARY_ADJUSTMENT" -> new CallbackTarget("hr_comp_change");
            case "PERFORMANCE_PLAN", "PERFORMANCE_RESULT" -> new CallbackTarget("hr_performance_objective");
            default -> throw new HrBusinessException("UNSUPPORTED_BUSINESS_TYPE",
                    "不支持的业务类型：" + businessType);
        };
    }

    private String resolveStatus(String businessType, String approvalResult) {
        if ("REJECTED".equals(approvalResult)) {
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
        if (!"APPROVED".equals(dto.getApprovalResult()) && !"REJECTED".equals(dto.getApprovalResult())) {
            throw new HrBusinessException("INVALID_PARAMETER",
                    "审批结果只能是 APPROVED 或 REJECTED，当前值：" + dto.getApprovalResult());
        }
    }

    private record CallbackTarget(String tableName) {
    }
}
