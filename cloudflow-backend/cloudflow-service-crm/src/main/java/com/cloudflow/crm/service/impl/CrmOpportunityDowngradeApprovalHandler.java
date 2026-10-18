package com.cloudflow.crm.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityWriteService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/** 商机降级关闭审批回调。 */
@Slf4j
@Component
public class CrmOpportunityDowngradeApprovalHandler extends AbstractCrmApprovalHandler implements ApprovalResultHandler {

    private final ICrmCustomerService crmCustomerService;
    private final CrmOpportunityWriteService opportunityWrites;

    public CrmOpportunityDowngradeApprovalHandler(CrmApprovalMapper approvalMapper,
                                                  ObjectMapper objectMapper,
                                                  ICrmCustomerService crmCustomerService,
                                                  CrmOpportunityWriteService opportunityWrites) {
        super(approvalMapper, objectMapper);
        this.crmCustomerService = crmCustomerService;
        this.opportunityWrites = opportunityWrites;
    }

    @Override
    public String getSupportedBusinessType() {
        return CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO dto) {
        CrmApproval approval = CrmRecordSupport.require(approvalMapper.lockById(dto.getBusinessId()), "审批记录不存在");
        if (!getSupportedBusinessType().equals(approval.getBusinessType())) throw new IllegalArgumentException("审批业务类型不匹配");
        if (!"PENDING".equals(approval.getStatus())) return;
        if (!updateApprovalStatus(approval, dto, true)) {
            return;
        }
        Map<String, Object> payload = parsePayload(approval);
        Long opportunityId = toLong(payload.get("opportunityId"));
        String targetStage = text(payload.get("targetStage"));
        String lostReason = text(payload.get("lostReason"));
        String action = text(payload.get("action"));
        CrmRecordSupport.require(opportunityId, "审批缺少商机信息");
        if (!opportunityId.equals(approval.getBusinessRefId())) throw new IllegalArgumentException("审批商机对象不匹配");
        if (!java.util.Set.of("CLOSE", "DOWNGRADE").contains(action) || "CLOSE".equals(action) != "LOST".equals(targetStage))
            throw new IllegalArgumentException("审批动作与目标阶段不匹配");
        java.util.List<com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO.Reason> reasons = objectMapper.convertValue(payload.get("reasons"),
                new com.fasterxml.jackson.core.type.TypeReference<java.util.List<com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO.Reason>>() { });
        Integer version = Integer.valueOf(text(payload.get("opportunityVersion")));
        CrmOpportunity opportunity = opportunityWrites.applyApproved(approval, version, text(payload.get("currentStage")), targetStage, lostReason, reasons);
        if (opportunity.getCustomerId() != null) {
            crmCustomerService.refreshHealth(opportunity.getCustomerId());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO dto) {
        CrmApproval approval = CrmRecordSupport.require(approvalMapper.lockById(dto.getBusinessId()), "审批记录不存在");
        if (!getSupportedBusinessType().equals(approval.getBusinessType())) throw new IllegalArgumentException("审批业务类型不匹配");
        if ("PENDING".equals(approval.getStatus())) updateApprovalStatus(approval, dto, false);
    }
}
