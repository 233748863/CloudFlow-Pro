package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomerCredit;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmCustomerCreditMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class CrmApprovalInstanceBinder {
    private final CrmApprovalMapper approvalMapper;
    private final CrmCustomerCreditMapper creditMapper;

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void bindOpportunityRetry(InternalWorkflowStartDTO request, Object response) {
        bindRetry(request, response, CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE, "opportunity_downgrade_review");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void bindRefundRetry(InternalWorkflowStartDTO request, Object response) {
        bindRetry(request, response, CrmBusinessTypes.CRM_REFUND, "crm_refund_review");
    }

    private void bindRetry(InternalWorkflowStartDTO request, Object response, String businessType, String processKey) {
        if (request == null || request.getBusinessKey() == null
                || !request.getBusinessKey().startsWith(businessType + ":")) return;
        if (!Objects.equals(CrmRecordSupport.tenantId(), request.getTenantId()) || request.getVariables() == null)
            throw new IllegalStateException("CRM审批重试租户或业务来源无效");
        Map<String, Object> variables = request.getVariables();
        Long approvalId = identifier(variables.get("approvalId"));
        CrmApproval approval = CrmRecordSupport.require(approvalMapper.lockById(approvalId), "CRM审批重试记录不存在");
        if (!Objects.equals(approval.getTenantId(), request.getTenantId()) || !Integer.valueOf(0).equals(approval.getDeleted())
                || !businessType.equals(approval.getBusinessType())
                || !processKey.equals(request.getProcessDefKey())
                || !Objects.equals(request.getBusinessKey(), approval.getBusinessType() + ":" + approvalId)
                || !Objects.equals(request.getStartUserId(), approval.getApplicantId())
                || !Objects.equals(identifier(variables.get("businessId")), approvalId)
                || !Objects.equals(identifier(variables.get("businessRefId")), approval.getBusinessRefId())
                || !Objects.equals(variables.get("businessType"), approval.getBusinessType()))
            throw new IllegalStateException("CRM审批重试与原申请不一致");
        Object value = response instanceof Map<?, ?> result
                ? result.get("processInstanceId") == null ? result.get("instanceId") : result.get("processInstanceId") : response;
        if (!(value instanceof String instanceId) || !StringUtils.hasText(instanceId) || instanceId.length() > 80
                || instanceId.chars().anyMatch(character -> character < 32)) throw new IllegalStateException("CRM审批重试缺少有效流程实例");
        bind(approvalId, instanceId);
    }

    private Long identifier(Object value) {
        String text = String.valueOf(value);
        if (!text.matches("[1-9][0-9]{0,18}")) throw new IllegalStateException("CRM审批重试标识无效");
        try { return Long.valueOf(text); }
        catch (NumberFormatException invalid) { throw new IllegalStateException("CRM审批重试标识超出范围", invalid); }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void bind(Long approvalId, String instanceId) {
        CrmApproval approval = CrmRecordSupport.require(approvalMapper.lockById(approvalId), "审批记录不存在");
        if (StringUtils.hasText(approval.getInstanceId())) {
            if (!approval.getInstanceId().equals(instanceId)) throw new IllegalStateException("审批已绑定其他流程实例");
            return;
        }
        if (!"PENDING".equals(approval.getStatus())) throw new IllegalStateException("审批已结束，不能绑定新流程");
        CrmRecordSupport.saved(approvalMapper.update(null, new LambdaUpdateWrapper<CrmApproval>()
                .eq(CrmApproval::getApprovalId, approvalId).eq(CrmApproval::getStatus, "PENDING")
                .set(CrmApproval::getInstanceId, instanceId).set(CrmApproval::getUpdateBy, approval.getApplicantName())
                .set(CrmApproval::getUpdateTime, LocalDateTime.now())));
        if (CrmBusinessTypes.CRM_CUSTOMER_CREDIT.equals(approval.getBusinessType())) {
            CrmCustomerCredit current = CrmRecordSupport.require(creditMapper.lockByCustomer(approval.getBusinessRefId()), "客户额度不存在");
            CrmRecordSupport.saved(creditMapper.update(null, new LambdaUpdateWrapper<CrmCustomerCredit>()
                    .eq(CrmCustomerCredit::getCreditId, current.getCreditId()).eq(CrmCustomerCredit::getVersion, current.getVersion())
                    .set(CrmCustomerCredit::getInstanceId, instanceId).set(CrmCustomerCredit::getVersion, current.getVersion() + 1)
                    .set(CrmCustomerCredit::getUpdateTime, LocalDateTime.now()).set(CrmCustomerCredit::getUpdateBy, "workflow")));
        }
    }
}
