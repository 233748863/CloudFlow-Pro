package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;

/** 客户分级变更审批回调。 */
@Slf4j
@Component
public class CrmCustomerLevelApprovalHandler extends AbstractCrmApprovalHandler implements ApprovalResultHandler {

    private final CrmCustomerMapper customerMapper;
    private final ICrmCustomerService crmCustomerService;

    public CrmCustomerLevelApprovalHandler(CrmApprovalMapper approvalMapper,
                                           ObjectMapper objectMapper,
                                           CrmCustomerMapper customerMapper,
                                           ICrmCustomerService crmCustomerService) {
        super(approvalMapper, objectMapper);
        this.customerMapper = customerMapper;
        this.crmCustomerService = crmCustomerService;
    }

    @Override
    public String getSupportedBusinessType() {
        return CrmBusinessTypes.CRM_CUSTOMER_LEVEL;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO dto) {
        CrmApproval approval = loadApproval(dto);
        if (!updateApprovalStatus(approval, dto, true)) {
            return;
        }
        Map<String, Object> payload = parsePayload(approval);
        Long customerId = toLong(payload.get("customerId"));
        String targetLevel = text(payload.get("targetLevel"));
        if (customerId == null || targetLevel.isEmpty()) {
            return;
        }
        CrmCustomer existing = customerMapper.selectById(customerId);
        if (existing == null) {
            return;
        }
        LambdaUpdateWrapper<CrmCustomer> wrapper = new LambdaUpdateWrapper<CrmCustomer>()
                .eq(CrmCustomer::getCustomerId, customerId)
                .set(CrmCustomer::getLevelCode, targetLevel)
                .set(CrmCustomer::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(CrmCustomer::getUpdateTime, LocalDateTime.now());
        customerMapper.update(null, wrapper);
        crmCustomerService.refreshHealth(customerId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO dto) {
        updateApprovalStatus(loadApproval(dto), dto, false);
    }
}
