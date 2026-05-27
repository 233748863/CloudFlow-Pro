package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/** 客户领取 / 公海释放 审批回调。 */
@Slf4j
@Component
public class CrmCustomerClaimApprovalHandler extends AbstractCrmApprovalHandler implements ApprovalResultHandler {

    private final CrmCustomerMapper customerMapper;
    private final ICrmCustomerService crmCustomerService;
    private final CrmEventPublisher crmEventPublisher;

    public CrmCustomerClaimApprovalHandler(CrmApprovalMapper approvalMapper,
                                           ObjectMapper objectMapper,
                                           CrmCustomerMapper customerMapper,
                                           ICrmCustomerService crmCustomerService,
                                           CrmEventPublisher crmEventPublisher) {
        super(approvalMapper, objectMapper);
        this.customerMapper = customerMapper;
        this.crmCustomerService = crmCustomerService;
        this.crmEventPublisher = crmEventPublisher;
    }

    @Override
    public String getSupportedBusinessType() {
        return CrmBusinessTypes.CRM_CUSTOMER_CLAIM;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO dto) {
        CrmApproval approval = loadApproval(dto);
        updateApprovalStatus(approval, dto, true);
        Map<String, Object> payload = parsePayload(approval);
        Long customerId = toLong(payload.get("customerId"));
        String action = text(payload.get("action"));
        if (customerId == null) {
            return;
        }
        CrmCustomer customer = customerMapper.selectById(customerId);
        if (customer == null) {
            return;
        }
        LambdaUpdateWrapper<CrmCustomer> wrapper = new LambdaUpdateWrapper<CrmCustomer>()
                .eq(CrmCustomer::getCustomerId, customerId)
                .set(CrmCustomer::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(CrmCustomer::getUpdateTime, LocalDateTime.now());
        if ("CLAIM".equalsIgnoreCase(action)) {
            wrapper.set(CrmCustomer::getOwnerId, approval.getApplicantId())
                    .set(CrmCustomer::getOwnerName, approval.getApplicantName())
                    .set(CrmCustomer::getDeptId, approval.getDeptId())
                    .set(CrmCustomer::getDeptName, approval.getDeptName())
                    .set(CrmCustomer::getStatus, CrmConstants.CustomerStatus.ACTIVE);
        } else {
            wrapper.set(CrmCustomer::getOwnerId, null)
                    .set(CrmCustomer::getOwnerName, null)
                    .set(CrmCustomer::getDeptId, null)
                    .set(CrmCustomer::getDeptName, null)
                    .set(CrmCustomer::getStatus, "POOL");
        }
        customerMapper.update(null, wrapper);
        crmCustomerService.refreshHealth(customerId);

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("customerId", customer.getCustomerId());
        fields.put("customerName", customer.getCustomerName());
        fields.put("action", action);
        fields.put("fromOwnerId", customer.getOwnerId());
        fields.put("fromOwnerName", customer.getOwnerName());
        if ("CLAIM".equalsIgnoreCase(action)) {
            fields.put("toOwnerId", approval.getApplicantId());
            fields.put("toOwnerName", approval.getApplicantName());
        }
        crmEventPublisher.publish(CrmEventStreamConstants.EVENT_CUSTOMER_OWNER_CHANGED,
                customer.getTenantId(), fields);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO dto) {
        updateApprovalStatus(loadApproval(dto), dto, false);
    }
}
