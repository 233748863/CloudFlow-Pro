package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;

/** 商机降级关闭审批回调。 */
@Slf4j
@Component
public class CrmOpportunityDowngradeApprovalHandler extends AbstractCrmApprovalHandler implements ApprovalResultHandler {

    private final CrmOpportunityMapper opportunityMapper;
    private final ICrmCustomerService customerService;

    public CrmOpportunityDowngradeApprovalHandler(CrmApprovalMapper approvalMapper,
                                                  ObjectMapper objectMapper,
                                                  CrmOpportunityMapper opportunityMapper,
                                                  ICrmCustomerService customerService) {
        super(approvalMapper, objectMapper);
        this.opportunityMapper = opportunityMapper;
        this.customerService = customerService;
    }

    @Override
    public String getSupportedBusinessType() {
        return CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO dto) {
        CrmApproval approval = loadApproval(dto);
        updateApprovalStatus(approval, dto, true);
        Map<String, Object> payload = parsePayload(approval);
        Long opportunityId = toLong(payload.get("opportunityId"));
        String targetStage = text(payload.get("targetStage"));
        String lostReason = text(payload.get("lostReason"));
        String action = text(payload.get("action"));
        if (opportunityId == null) {
            return;
        }
        CrmOpportunity opportunity = opportunityMapper.selectById(opportunityId);
        if (opportunity == null) {
            return;
        }
        LambdaUpdateWrapper<CrmOpportunity> wrapper = new LambdaUpdateWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getOpportunityId, opportunityId)
                .set(CrmOpportunity::getStage, targetStage.isEmpty() ? CrmConstants.OpportunityStage.LOST : targetStage)
                .set(CrmOpportunity::getStageChangedTime, LocalDateTime.now())
                .set(CrmOpportunity::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(CrmOpportunity::getUpdateTime, LocalDateTime.now());
        if ("CLOSE".equalsIgnoreCase(action)) {
            wrapper.set(CrmOpportunity::getStatus, CrmConstants.OpportunityStatus.CLOSED);
        } else {
            wrapper.set(CrmOpportunity::getStatus, CrmConstants.OpportunityStatus.OPEN);
        }
        if (!lostReason.isEmpty()) {
            wrapper.set(CrmOpportunity::getLostReason, lostReason);
        }
        opportunityMapper.update(null, wrapper);
        if (opportunity.getCustomerId() != null) {
            customerService.refreshHealth(opportunity.getCustomerId());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO dto) {
        updateApprovalStatus(loadApproval(dto), dto, false);
    }
}
