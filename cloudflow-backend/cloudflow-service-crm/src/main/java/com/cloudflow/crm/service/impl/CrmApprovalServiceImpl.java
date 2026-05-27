package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.ICrmApprovalService;
import com.cloudflow.crm.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmApprovalServiceImpl implements ICrmApprovalService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final CrmApprovalMapper approvalMapper;
    private final CrmCustomerMapper customerMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmReceivableMapper receivableMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long submitCustomerClaim(Long customerId, String action, String remark) {
        CrmCustomer customer = requireCustomer(customerId);
        String normalized = normalizeAction(action, "CLAIM", "RELEASE");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("customerId", customerId);
        payload.put("currentOwnerId", customer.getOwnerId());
        payload.put("currentOwnerName", customer.getOwnerName());
        payload.put("action", normalized);
        CrmApproval approval = insertApproval(
                CrmBusinessTypes.CRM_CUSTOMER_CLAIM,
                normalized,
                "CRM_CUSTOMER",
                customerId,
                customer.getCustomerName(),
                payload,
                remark);
        startWorkflow(approval, "customer_claim_review");
        return approval.getApprovalId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long submitCustomerLevelChange(Long customerId, String action, String targetLevel, String remark) {
        CrmCustomer customer = requireCustomer(customerId);
        if (!StringUtils.hasText(targetLevel)) {
            throw new IllegalArgumentException("目标分级不能为空");
        }
        String normalized = normalizeAction(action, "LEVEL_UP", "LEVEL_DOWN");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("customerId", customerId);
        payload.put("currentLevel", customer.getLevelCode());
        payload.put("targetLevel", targetLevel);
        payload.put("action", normalized);
        CrmApproval approval = insertApproval(
                CrmBusinessTypes.CRM_CUSTOMER_LEVEL,
                normalized,
                "CRM_CUSTOMER",
                customerId,
                customer.getCustomerName(),
                payload,
                remark);
        startWorkflow(approval, "customer_level_change");
        return approval.getApprovalId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long submitOpportunityDowngrade(Long opportunityId, String action, String targetStage, String lostReason) {
        CrmOpportunity opportunity = requireOpportunity(opportunityId);
        String normalized = normalizeAction(action, "DOWNGRADE", "CLOSE");
        if ("DOWNGRADE".equals(normalized) && !StringUtils.hasText(targetStage)) {
            throw new IllegalArgumentException("降级目标阶段不能为空");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("opportunityId", opportunityId);
        payload.put("currentStage", opportunity.getStage());
        payload.put("targetStage", "CLOSE".equals(normalized) ? CrmConstants.OpportunityStage.LOST : targetStage);
        payload.put("lostReason", lostReason);
        payload.put("action", normalized);
        CrmApproval approval = insertApproval(
                CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE,
                normalized,
                "CRM_OPPORTUNITY",
                opportunityId,
                opportunity.getOpportunityName(),
                payload,
                lostReason);
        startWorkflow(approval, "opportunity_downgrade_review");
        return approval.getApprovalId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long submitRefund(Long receivableId, BigDecimal refundAmount, String reason) {
        if (receivableId == null) {
            throw new IllegalArgumentException("回款ID不能为空");
        }
        CrmReceivable receivable = receivableMapper.selectById(receivableId);
        if (receivable == null || !CrmConstants.DelFlag.NORMAL.equals(receivable.getDeleted())) {
            throw new IllegalArgumentException("回款计划不存在");
        }
        if (refundAmount == null || refundAmount.signum() <= 0) {
            throw new IllegalArgumentException("退款金额必须大于 0");
        }
        if (receivable.getReceivedAmount() == null
                || receivable.getReceivedAmount().compareTo(refundAmount) < 0) {
            throw new IllegalArgumentException("退款金额不能超过已到账金额");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("receivableId", receivableId);
        payload.put("customerId", receivable.getCustomerId());
        payload.put("customerName", receivable.getCustomerName());
        payload.put("contractId", receivable.getContractId());
        payload.put("refundAmount", refundAmount);
        payload.put("originalReceivedAmount", receivable.getReceivedAmount());
        CrmApproval approval = insertApproval(
                CrmBusinessTypes.CRM_REFUND,
                "REFUND",
                "CRM_RECEIVABLE",
                receivableId,
                receivable.getReceivableName(),
                payload,
                reason);
        startWorkflow(approval, "crm_refund_review");
        return approval.getApprovalId();
    }

    @Override
    public CrmApproval getById(Long approvalId) {
        if (approvalId == null) {
            return null;
        }
        return approvalMapper.selectById(approvalId);
    }
    private CrmApproval insertApproval(String businessType, String actionType,
                                       String businessRefType, Long businessRefId, String businessRefName,
                                       Map<String, Object> payload, String remark) {
        CrmApproval approval = new CrmApproval();
        Long tenantId = UserContext.getTenantId();
        approval.setTenantId(tenantId == null ? DEFAULT_TENANT_ID : tenantId);
        approval.setApprovalNo(nextApprovalNo(businessType));
        approval.setBusinessType(businessType);
        approval.setActionType(actionType);
        approval.setBusinessRefType(businessRefType);
        approval.setBusinessRefId(businessRefId);
        approval.setBusinessRefName(businessRefName);
        approval.setPayloadJson(writeJson(payload));
        approval.setApplicantId(UserContext.getUserId());
        approval.setApplicantName(resolveUserName());
        approval.setDeptId(UserContext.getDeptId());
        approval.setDeptName(UserContext.getDeptName());
        approval.setStatus(CrmConstants.QuoteStatus.PENDING);
        approval.setRemark(remark);
        approval.setDeleted(CrmConstants.DelFlag.NORMAL);
        approval.setCreateBy(resolveUserName());
        approval.setCreateTime(LocalDateTime.now());
        approval.setUpdateBy(resolveUserName());
        approval.setUpdateTime(LocalDateTime.now());
        approvalMapper.insert(approval);
        return approval;
    }

    private void startWorkflow(CrmApproval approval, String processDefKey) {
        WorkflowProcessStartDTO dto = new WorkflowProcessStartDTO();
        dto.setProcessDefKey(processDefKey);
        dto.setBusinessKey(approval.getBusinessType() + ":" + approval.getApprovalId());
        Map<String, Object> variables = new HashMap<>();
        variables.put("approvalId", approval.getApprovalId());
        variables.put("approvalNo", approval.getApprovalNo());
        variables.put("businessRefType", approval.getBusinessRefType());
        variables.put("businessRefId", approval.getBusinessRefId());
        variables.put("businessRefName", approval.getBusinessRefName());
        variables.put("actionType", approval.getActionType());
        WorkflowCallbackConstants.applyCallbackMetadata(
                variables, approval.getBusinessType(), approval.getApprovalId(), approval.getApprovalNo(),
                "workflow:stream:approval-callback:crm");
        dto.setVariables(variables);
        try {
            R<?> result = remoteWorkflowService.startProcess(dto);
            if (result != null && result.isSuccess() && result.getData() != null) {
                approval.setInstanceId(extractInstanceId(result.getData()));
                approvalMapper.updateById(approval);
            }
        } catch (Exception ex) {
            log.warn("启动 CRM 审批流程失败: approvalId={}, processDefKey={}",
                    approval.getApprovalId(), processDefKey, ex);
        }
    }

    private String extractInstanceId(Object data) {
        if (data instanceof Map<?, ?> dataMap) {
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data != null ? String.valueOf(data) : null;
    }

    private String nextApprovalNo(String businessType) {
        String prefix = switch (businessType) {
            case CrmBusinessTypes.CRM_CUSTOMER_CLAIM -> "CLM";
            case CrmBusinessTypes.CRM_CUSTOMER_LEVEL -> "LVL";
            case CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE -> "OPD";
            case CrmBusinessTypes.CRM_REFUND -> "RFD";
            default -> "CRA";
        };
        return Localize.nextNo(prefix);
    }

    private CrmCustomer requireCustomer(Long customerId) {
        if (customerId == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        CrmCustomer customer = customerMapper.selectById(customerId);
        if (customer == null || !CrmConstants.DelFlag.NORMAL.equals(customer.getDeleted())) {
            throw new IllegalArgumentException("客户不存在");
        }
        return customer;
    }

    private CrmOpportunity requireOpportunity(Long opportunityId) {
        if (opportunityId == null) {
            throw new IllegalArgumentException("商机ID不能为空");
        }
        CrmOpportunity opportunity = opportunityMapper.selectById(opportunityId);
        if (opportunity == null || !CrmConstants.DelFlag.NORMAL.equals(opportunity.getDeleted())) {
            throw new IllegalArgumentException("商机不存在");
        }
        return opportunity;
    }

    private String normalizeAction(String action, String... allowed) {
        if (!StringUtils.hasText(action)) {
            throw new IllegalArgumentException("动作类型不能为空");
        }
        String upper = action.trim().toUpperCase();
        for (String item : allowed) {
            if (item.equals(upper)) {
                return upper;
            }
        }
        throw new IllegalArgumentException("不支持的动作类型: " + action);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("序列化 payload 失败", ex);
        }
    }

    private String resolveUserName() {
        String name = UserContext.getUserName();
        return StringUtils.hasText(name) ? name : "system";
    }
}
