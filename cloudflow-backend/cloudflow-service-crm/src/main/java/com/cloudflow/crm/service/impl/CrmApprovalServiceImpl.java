package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.event.CrmApprovalSubmittedEvent;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.service.receivable.CrmReceivableAccessService;
import com.cloudflow.crm.service.receivable.CrmReceivableAmounts;
import com.cloudflow.crm.service.receivable.CrmRefundService;
import com.cloudflow.crm.service.ICrmApprovalService;
import com.cloudflow.crm.service.remote.RemoteWorkflowService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityAccessService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityStagePolicy;
import com.cloudflow.crm.service.opportunity.CrmOpportunityStageService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityWriteService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmApprovalServiceImpl implements ICrmApprovalService {

    private final CrmApprovalMapper approvalMapper;
    private final CrmCustomerMapper customerMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmReceivableAccessService receivableAccess;
    private final CrmRefundService refunds;
    private final RemoteWorkflowService remoteWorkflowService;
    private final ObjectMapper objectMapper;
    private final OutboxPublisher outboxPublisher;
    private final CrmLostAnalysisService lostAnalysisService;
    private final CrmReferenceService references;
    private final CrmApprovalInstanceBinder instanceBinder;
    private final CrmOpportunityAccessService opportunityAccess;
    private final CrmOpportunityStageService opportunityStages;
    private final org.springframework.transaction.PlatformTransactionManager transactionManager;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long submitCustomerCredit(com.cloudflow.crm.domain.CrmCustomerCredit proposed) {
        CrmCustomer customer = references.customer(proposed.getCustomerId());
        Map<String, Object> payload = objectMapper.convertValue(proposed,
                new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() { });
        CrmApproval approval = insertApproval(CrmBusinessTypes.CRM_CUSTOMER_CREDIT, "CREDIT_CHANGE",
                "CRM_CUSTOMER", customer.getCustomerId(), customer.getCustomerName(), payload, proposed.getRemark());
        publishApprovalSubmittedEvent(approval, "customer_credit_review");
        startWorkflowAfterCommit(approval.getApprovalId(), "customer_credit_review");
        return approval.getApprovalId();
    }

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
        publishApprovalSubmittedEvent(approval, "customer_claim_review");
        startWorkflowAfterCommit(approval.getApprovalId(), "customer_claim_review");
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
        publishApprovalSubmittedEvent(approval, "customer_level_change");
        startWorkflowAfterCommit(approval.getApprovalId(), "customer_level_change");
        return approval.getApprovalId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public Long submitOpportunityDowngrade(Long opportunityId, String action, String targetStage, String lostReason,
            java.util.List<com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO.Reason> reasons, Integer version) {
        CrmOpportunity opportunity = opportunityAccess.lock(opportunityId);
        CrmOpportunityStagePolicy.version(version, opportunity);
        String normalized = normalizeAction(action, "DOWNGRADE", "CLOSE");
        String target = "CLOSE".equals(normalized) ? CrmConstants.OpportunityStage.LOST : CrmOpportunityStagePolicy.code(targetStage);
        if ("CLOSE".equals(normalized)) {
            lostAnalysisService.validateReasons(reasons);
        } else if (java.util.Set.of("WON", "LOST").contains(target)) {
            throw new IllegalArgumentException("输单必须选择CLOSE动作并提供结构化原因");
        }
        if (java.util.Set.of("WON", "LOST").contains(opportunity.getStage())) throw new IllegalArgumentException("已结案商机不能提交降级或输单审批");
        CrmOpportunity proposed = new CrmOpportunity(); org.springframework.beans.BeanUtils.copyProperties(opportunity, proposed);
        proposed.setStage(target);
        opportunityStages.prepare(opportunity, proposed, CrmOpportunityStagePolicy.Action.APPROVED_DOWNGRADE,
                CrmOpportunityWriteService.approvalReason(target, lostReason, reasons));
        if (hasPendingDowngradeApproval(opportunityId)) {
            throw new IllegalStateException("该商机已有待处理的降级/输单审批，请勿重复提交");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("opportunityId", opportunityId);
        payload.put("currentStage", opportunity.getStage());
        payload.put("opportunityVersion", opportunity.getVersion());
        payload.put("targetStage", target);
        payload.put("lostReason", lostReason);
        payload.put("reasons", reasons);
        payload.put("action", normalized);
        CrmApproval approval = insertApproval(
                CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE,
                normalized,
                "CRM_OPPORTUNITY",
                opportunityId,
                opportunity.getOpportunityName(),
                payload,
                lostReason);
        publishApprovalSubmittedEvent(approval, "opportunity_downgrade_review");
        startWorkflowAfterCommit(approval.getApprovalId(), "opportunity_downgrade_review");
        return approval.getApprovalId();
    }

    /**
     * 业务级幂等校验：同一商机已存在待处理（PENDING）的降级/输单审批时不允许重复提交，
     * 避免 @RepeatSubmit 时间窗过后重复拖拽产生多条审批单与工作流实例。
     */
    private boolean hasPendingDowngradeApproval(Long opportunityId) {
        LambdaQueryWrapper<CrmApproval> wrapper = new LambdaQueryWrapper<CrmApproval>()
                .eq(CrmApproval::getBusinessType, CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE)
                .eq(CrmApproval::getBusinessRefType, "CRM_OPPORTUNITY")
                .eq(CrmApproval::getBusinessRefId, opportunityId)
                .eq(CrmApproval::getStatus, CrmConstants.QuoteStatus.PENDING)
                .eq(CrmApproval::getDeleted, CrmConstants.DelFlag.NORMAL);
        Long pending = approvalMapper.selectCount(wrapper);
        return pending != null && pending > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long submitRefund(Long receivableId, Long receiptEventId, Integer version, BigDecimal refundAmount, String reason) {
        if (receivableId == null) {
            throw new IllegalArgumentException("回款ID不能为空");
        }
        CrmReceivable receivable = receivableAccess.lockInScope(receivableId);
        CrmReceivableAmounts.version(receivable, version);
        CrmReceivableAmounts.active(receivable);
        com.fasterxml.jackson.databind.node.ObjectNode approvalPolicy = refunds.prepareWorkflow(receivable);
        refundAmount = CrmReceivableAmounts.positive(refundAmount, "退款金额");
        if (CrmReceivableAmounts.received(receivable).compareTo(refundAmount) < 0) {
            throw new IllegalArgumentException("退款金额不能超过已到账金额");
        }
        if (reason != null && reason.length() > 500) throw new IllegalArgumentException("退款原因最多500字符");
        CrmDealEvent receipt = refunds.select(receivable, receiptEventId, refundAmount);
        if (approvalMapper.selectCount(new LambdaQueryWrapper<CrmApproval>()
                .eq(CrmApproval::getBusinessType, CrmBusinessTypes.CRM_REFUND).eq(CrmApproval::getBusinessRefType, "CRM_RECEIVABLE")
                .eq(CrmApproval::getBusinessRefId, receivableId).eq(CrmApproval::getStatus, "PENDING").eq(CrmApproval::getDeleted, 0)) > 0)
            throw new IllegalArgumentException("当前回款计划已有待处理退款审批");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("receivableId", receivableId);
        payload.put("customerId", receivable.getCustomerId());
        payload.put("customerName", receivable.getCustomerName());
        payload.put("contractId", receivable.getContractId());
        payload.put("refundAmount", refundAmount);
        payload.put("originalReceivedAmount", receivable.getReceivedAmount());
        payload.put("originalVersion", receivable.getVersion());
        payload.put("receiptEventId", receipt.getEventId());
        payload.put("receiptEventKey", receipt.getEventKey());
        payload.put("originalReceiptAmount", receipt.getAmount());
        payload.put("currency", receipt.getCurrency());
        payload.put("approvalPolicy", approvalPolicy);
        CrmApproval approval = insertApproval(
                CrmBusinessTypes.CRM_REFUND,
                "REFUND",
                "CRM_RECEIVABLE",
                receivableId,
                receivable.getReceivableName(),
                payload,
                reason);
        publishApprovalSubmittedEvent(approval, "crm_refund_review");
        startWorkflowAfterCommit(approval.getApprovalId(), "crm_refund_review");
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
        if (tenantId == null) {
            throw new IllegalArgumentException("tenantId不能为空");
        }
        approval.setTenantId(tenantId);
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

    public void startWorkflow(CrmApproval approval, String processDefKey) {
        org.springframework.transaction.support.TransactionTemplate outsideTransaction = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        outsideTransaction.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
        outsideTransaction.executeWithoutResult(status -> doStartWorkflow(approval, processDefKey));
    }

    private void doStartWorkflow(CrmApproval approval, String processDefKey) {
        CrmApproval current = approvalMapper.selectById(approval.getApprovalId());
        if (current == null) {
            throw new IllegalStateException("CRM审批记录不存在: " + approval.getApprovalId());
        }
        if (StringUtils.hasText(current.getInstanceId())) {
            log.info("CRM 审批流程已存在，跳过启动: approvalId={}, instanceId={}",
                    current.getApprovalId(), current.getInstanceId());
            return;
        }
        if (!"PENDING".equals(current.getStatus())) return;
        InternalWorkflowStartDTO dto = new InternalWorkflowStartDTO();
        dto.setTenantId(current.getTenantId());
        dto.setProcessDefKey(processDefKey);
        dto.setBusinessKey(current.getBusinessType() + ":" + current.getApprovalId());
        dto.setStartUserId(current.getApplicantId());
        dto.setStartUserName(current.getApplicantName());
        Map<String, Object> variables = new HashMap<>();
        variables.put("approvalId", current.getApprovalId());
        variables.put("approvalNo", current.getApprovalNo());
        variables.put("businessRefType", current.getBusinessRefType());
        variables.put("businessRefId", current.getBusinessRefId());
        variables.put("businessRefName", current.getBusinessRefName());
        variables.put("actionType", current.getActionType());
        if (CrmBusinessTypes.CRM_REFUND.equals(current.getBusinessType())) variables.putAll(refunds.workflowVariables(current));
        WorkflowCallbackConstants.applyCallbackMetadata(
                variables, current.getBusinessType(), current.getApprovalId(), current.getApprovalNo(),
                "workflow:stream:approval-callback:crm");
        dto.setVariables(variables);

        R<?> result = remoteWorkflowService.startProcessInternal(dto);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new IllegalStateException("启动 CRM 审批流程失败: approvalId=" + current.getApprovalId()
                    + ", processDefKey=" + processDefKey
                    + ", msg=" + (result == null ? "null" : result.getMsg()));
        }
        String instanceId = extractInstanceId(result.getData());
        if (!StringUtils.hasText(instanceId)) {
            throw new IllegalStateException("启动 CRM 审批流程未返回实例ID: approvalId=" + current.getApprovalId()
                    + ", processDefKey=" + processDefKey);
        }
        instanceBinder.bind(current.getApprovalId(), instanceId);
    }

    private void startWorkflowAfterCommit(Long approvalId, String processDefKey) {
        Runnable task = () -> {
            try {
                CrmApproval approval = approvalMapper.selectById(approvalId);
                if (approval != null) {
                    startWorkflow(approval, processDefKey);
                }
            } catch (Exception ex) {
                log.warn("提交后即时启动 CRM 审批流程失败，等待 Outbox 重试: approvalId={}, processDefKey={}",
                        approvalId, processDefKey, ex);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
        } else {
            task.run();
        }
    }

    private void publishApprovalSubmittedEvent(CrmApproval approval, String processDefKey) {
        CrmApprovalSubmittedEvent event = new CrmApprovalSubmittedEvent();
        event.setApprovalId(approval.getApprovalId());
        event.setProcessDefKey(processDefKey);
        event.setSubmittedAt(LocalDateTime.now());
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("CRM_APPROVAL_SUBMITTED")
                    .sourceModule("cloudflow-crm")
                    .sourceId(approval.getApprovalId())
                    .tenantId(approval.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new IllegalStateException("CRM审批提交流程事件发布失败", e);
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
            case CrmBusinessTypes.CRM_CUSTOMER_CREDIT -> "CRD";
            default -> "CRA";
        };
        return CrmBusinessTypes.CRM_REFUND.equals(businessType) ? prefix + UUID.randomUUID().toString().replace("-", "") : Localize.nextNo(prefix);
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
