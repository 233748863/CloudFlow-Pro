package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.domain.dto.ApprovalResultDTO;
import com.cloudflow.crm.service.ApprovalResultHandler;
import com.cloudflow.crm.service.WorkflowCallbackService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowCallbackServiceImpl implements WorkflowCallbackService {

    private final List<ApprovalResultHandler> handlers;
    private final Map<String, ApprovalResultHandler> handlerMap = new HashMap<>();

    @PostConstruct
    public void init() {
        for (ApprovalResultHandler handler : handlers) {
            handlerMap.put(handler.getSupportedBusinessType(), handler);
            log.info("注册 CRM 审批结果处理器: {} -> {}",
                    handler.getSupportedBusinessType(), handler.getClass().getSimpleName());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApprovalResult(ApprovalResultDTO dto) {
        validateApprovalResult(dto);
        UserContext.setTenantId(dto.getTenantId());
        try {
            ApprovalResultHandler handler = handlerMap.get(dto.getBusinessType());
            if (handler == null) {
                throw new IllegalStateException("未找到业务类型对应的处理器: " + dto.getBusinessType());
            }
            if ("APPROVED".equals(dto.getApprovalResult())) {
                handler.handleApproved(dto);
                return;
            }
            if ("REJECTED".equals(dto.getApprovalResult())) {
                handler.handleRejected(dto);
                return;
            }
            throw new IllegalArgumentException("不支持的审批结果: " + dto.getApprovalResult());
        } finally {
            UserContext.setTenantId(null);
        }
    }

    private void validateApprovalResult(ApprovalResultDTO dto) {
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
        if (!"APPROVED".equals(dto.getApprovalResult()) && !"REJECTED".equals(dto.getApprovalResult())) {
            throw new IllegalArgumentException("审批结果只能是 APPROVED 或 REJECTED，当前值: " + dto.getApprovalResult());
        }
    }
}
