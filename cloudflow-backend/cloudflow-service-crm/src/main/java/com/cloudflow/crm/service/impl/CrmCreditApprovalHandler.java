package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomerCredit;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmCustomerCreditMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

@Component
public class CrmCreditApprovalHandler extends AbstractCrmApprovalHandler implements ApprovalResultHandler {
    private final CrmCustomerCreditMapper creditMapper;
    private final CrmAuditTrail auditTrail;

    public CrmCreditApprovalHandler(CrmApprovalMapper approvalMapper, ObjectMapper objectMapper,
            CrmCustomerCreditMapper creditMapper, CrmAuditTrail auditTrail) {
        super(approvalMapper, objectMapper);
        this.creditMapper = creditMapper; this.auditTrail = auditTrail;
    }

    @Override
    public String getSupportedBusinessType() { return CrmBusinessTypes.CRM_CUSTOMER_CREDIT; }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO dto) {
        CrmApproval approval = locked(dto);
        if (!"PENDING".equals(approval.getStatus()) || !updateApprovalStatus(approval, dto, true)) return;
        CrmCustomerCredit proposed = objectMapper.convertValue(parsePayload(approval), CrmCustomerCredit.class);
        CrmCustomerCredit current = CrmRecordSupport.require(creditMapper.lockByCustomer(approval.getBusinessRefId()), "客户额度记录不存在");
        if (!current.getCreditId().equals(proposed.getCreditId())) throw new IllegalStateException("额度审批对象不一致");
        CrmRecordSupport.saved(creditMapper.update(null, new LambdaUpdateWrapper<CrmCustomerCredit>()
                .eq(CrmCustomerCredit::getCreditId, current.getCreditId()).eq(CrmCustomerCredit::getVersion, current.getVersion())
                .set(CrmCustomerCredit::getCreditLimit, proposed.getCreditLimit()).set(CrmCustomerCredit::getOverdueThreshold, proposed.getOverdueThreshold())
                .set(CrmCustomerCredit::getCurrency, proposed.getCurrency()).set(CrmCustomerCredit::getStatus, proposed.getStatus())
                .set(CrmCustomerCredit::getEffectiveStart, proposed.getEffectiveStart()).set(CrmCustomerCredit::getEffectiveEnd, proposed.getEffectiveEnd())
                .set(CrmCustomerCredit::getRemark, proposed.getRemark()).set(CrmCustomerCredit::getInstanceId, dto.getProcessInstanceId())
                .set(CrmCustomerCredit::getVersion, current.getVersion() + 1).set(CrmCustomerCredit::getUpdateBy, "workflow")
                .set(CrmCustomerCredit::getUpdateTime, LocalDateTime.now())));
        auditTrail.record("CRM_CREDIT_APPROVED", "CRM_CUSTOMER:" + current.getCustomerId(),
                "审批单=" + approval.getApprovalId() + ",原额度=" + current.getCreditLimit() + ",新额度=" + proposed.getCreditLimit(), true);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO dto) {
        CrmApproval approval = locked(dto);
        if ("PENDING".equals(approval.getStatus())) updateApprovalStatus(approval, dto, false);
    }

    private CrmApproval locked(ApprovalResultDTO dto) {
        CrmApproval approval = CrmRecordSupport.require(approvalMapper.lockById(dto.getBusinessId()), "额度审批不存在");
        if (!getSupportedBusinessType().equals(approval.getBusinessType())) throw new IllegalArgumentException("审批业务类型不匹配");
        return approval;
    }
}
