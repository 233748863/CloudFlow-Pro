package com.cloudflow.common.workflow.callback.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 基于 {@link ApprovalResultHandler} 的默认回调分发实现。
 *
 * <p>业务侧只需提供若干 {@code ApprovalResultHandler} Bean，
 * 由本类按 {@code businessType} 路由并执行通过/驳回分支。
 *
 * <p>HR 服务自定义了 {@code WorkflowCallbackService} 直接实现，
 * 因此本 Bean 在该服务上下文中不会被装配（参见 {@code WorkflowCallbackAutoConfiguration}）。
 */
@Slf4j
public class DefaultWorkflowCallbackDispatcher implements WorkflowCallbackService {

    private final List<ApprovalResultHandler> handlers;
    private final Map<String, ApprovalResultHandler> handlerMap = new HashMap<>();

    public DefaultWorkflowCallbackDispatcher(List<ApprovalResultHandler> handlers) {
        this.handlers = handlers;
    }

    @PostConstruct
    public void init() {
        for (ApprovalResultHandler handler : handlers) {
            handlerMap.put(handler.getSupportedBusinessType(), handler);
            log.info("注册审批结果处理器: {} -> {}",
                    handler.getSupportedBusinessType(), handler.getClass().getSimpleName());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApprovalResult(ApprovalResultDTO dto) {
        validate(dto);
        UserContext.setTenantId(dto.getTenantId());
        try {
            ApprovalResultHandler handler = handlerMap.get(dto.getBusinessType());
            if (handler == null) {
                throw new IllegalStateException("未找到业务类型对应的处理器: " + dto.getBusinessType());
            }
            if (WorkflowCallbackConstants.RESULT_APPROVED.equals(dto.getApprovalResult())) {
                handler.handleApproved(dto);
                return;
            }
            if (WorkflowCallbackConstants.RESULT_REJECTED.equals(dto.getApprovalResult())) {
                handler.handleRejected(dto);
                return;
            }
            throw new IllegalArgumentException("不支持的审批结果: " + dto.getApprovalResult());
        } finally {
            UserContext.setTenantId(null);
        }
    }

    private void validate(ApprovalResultDTO dto) {
        if (dto == null) {
            throw new IllegalArgumentException("审批结果 DTO 不能为空");
        }
        if (dto.getTenantId() == null) {
            throw new IllegalArgumentException("租户 ID 不能为空");
        }
        if (dto.getProcessInstanceId() == null || dto.getProcessInstanceId().isBlank()) {
            throw new IllegalArgumentException("流程实例 ID 不能为空");
        }
        if (dto.getBusinessType() == null || dto.getBusinessType().isBlank()) {
            throw new IllegalArgumentException("业务类型不能为空");
        }
        if (dto.getBusinessId() == null) {
            throw new IllegalArgumentException("业务 ID 不能为空");
        }
        if (!WorkflowCallbackConstants.RESULT_APPROVED.equals(dto.getApprovalResult())
                && !WorkflowCallbackConstants.RESULT_REJECTED.equals(dto.getApprovalResult())) {
            throw new IllegalArgumentException("审批结果只能是 APPROVED 或 REJECTED，当前值: " + dto.getApprovalResult());
        }
    }
}
