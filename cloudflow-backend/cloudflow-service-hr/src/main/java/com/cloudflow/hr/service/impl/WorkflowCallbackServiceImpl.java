package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.WorkflowCallbackService;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 工作流审批回调分发服务。
 */
@Slf4j
@Service
public class WorkflowCallbackServiceImpl implements WorkflowCallbackService {

    private final Map<String, ApprovalResultHandler> handlerMap = new HashMap<>();

    @Autowired
    private List<ApprovalResultHandler> handlers;

    @PostConstruct
    public void init() {
        log.info("初始化工作流回调处理器映射表");
        for (ApprovalResultHandler handler : handlers) {
            String businessType = handler.getSupportedBusinessType();
            handlerMap.put(businessType, handler);
            log.info("注册审批结果处理器：{} -> {}", businessType, handler.getClass().getSimpleName());
        }
        log.info("工作流回调处理器映射表初始化完成，共注册{}个处理器", handlerMap.size());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApprovalResult(ApprovalResultDTO dto) {
        log.info("收到审批结果回调，businessType: {}, businessId: {}, result: {}, processInstanceId: {}",
                dto.getBusinessType(), dto.getBusinessId(), dto.getApprovalResult(), dto.getProcessInstanceId());

        validateApprovalResult(dto);

        // 回调线程没有登录态，显式补租户上下文，保证异步回写仍然走租户隔离。
        UserContext.setTenantId(dto.getTenantId());
        try {
            ApprovalResultHandler handler = handlerMap.get(dto.getBusinessType());
            if (handler == null) {
                log.error("未找到业务类型对应的处理器，businessType: {}", dto.getBusinessType());
                throw new HrBusinessException("UNSUPPORTED_BUSINESS_TYPE",
                        "不支持的业务类型：" + dto.getBusinessType());
            }

            if ("APPROVED".equals(dto.getApprovalResult())) {
                handler.handleApproved(dto);
                log.info("审批通过处理完成，businessType: {}, businessId: {}",
                        dto.getBusinessType(), dto.getBusinessId());
                return;
            }

            if ("REJECTED".equals(dto.getApprovalResult())) {
                handler.handleRejected(dto);
                log.info("审批驳回处理完成，businessType: {}, businessId: {}",
                        dto.getBusinessType(), dto.getBusinessId());
                return;
            }

            log.error("不支持的审批结果，approvalResult: {}", dto.getApprovalResult());
            throw new HrBusinessException("INVALID_APPROVAL_RESULT",
                    "不支持的审批结果：" + dto.getApprovalResult());
        } catch (Exception e) {
            log.error("处理审批结果失败，businessType: {}, businessId: {}",
                    dto.getBusinessType(), dto.getBusinessId(), e);
            throw e;
        } finally {
            UserContext.setTenantId(null);
        }
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

    public int getHandlerCount() {
        return handlerMap.size();
    }

    public boolean isSupportedBusinessType(String businessType) {
        return handlerMap.containsKey(businessType);
    }
}
