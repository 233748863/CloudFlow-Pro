package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.crm.config.WorkflowCallbackStreamConstants;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.dto.ApprovalResultDTO;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.service.ApprovalResultHandler;
import com.cloudflow.crm.service.ICrmCustomerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class RenewalApprovalHandler implements ApprovalResultHandler {

    private final CrmRenewalMapper renewalMapper;
    private final ICrmCustomerService customerService;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_CRM_RENEWAL;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, "WON");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "LOST");
    }

    private void updateStatus(ApprovalResultDTO dto, String status) {
        CrmRenewal renewal = renewalMapper.selectById(dto.getBusinessId());
        if (renewal == null) {
            throw new IllegalStateException("未找到续约记录，businessId=" + dto.getBusinessId());
        }

        LambdaUpdateWrapper<CrmRenewal> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(CrmRenewal::getRenewalId, dto.getBusinessId())
                .set(CrmRenewal::getInstanceId, dto.getProcessInstanceId())
                .set(CrmRenewal::getStatus, status)
                .set(CrmRenewal::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(CrmRenewal::getUpdateTime, LocalDateTime.now());
        int updated = renewalMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到续约记录，businessId=" + dto.getBusinessId());
        }
        customerService.refreshHealth(renewal.getCustomerId());
        log.info("CRM 续约审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
