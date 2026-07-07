package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
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
    private final ICrmCustomerService crmCustomerService;

    @Override
    public String getSupportedBusinessType() {
        return CrmBusinessTypes.CRM_RENEWAL;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, "WON");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "LOST");
    }

    private boolean updateStatus(ApprovalResultDTO dto, String status) {
        CrmRenewal renewal = renewalMapper.selectById(dto.getBusinessId());
        if (renewal == null) {
            throw new IllegalStateException("未找到续约记录，businessId=" + dto.getBusinessId());
        }

        LambdaUpdateWrapper<CrmRenewal> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(CrmRenewal::getRenewalId, dto.getBusinessId())
                .eq(CrmRenewal::getInstanceId, dto.getProcessInstanceId())
                .set(CrmRenewal::getStatus, status)
                .set(CrmRenewal::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(CrmRenewal::getUpdateTime, LocalDateTime.now());
        int updated = renewalMapper.update(null, wrapper);
        if (updated <= 0) {
            if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                    "CRM续约", dto.getBusinessId(), renewal.getInstanceId(), dto.getProcessInstanceId())) {
                return false;
            }
            throw new IllegalStateException("CRM续约审批结果回写失败，businessId=" + dto.getBusinessId());
        }
        crmCustomerService.refreshHealth(renewal.getCustomerId());
        log.info("CRM 续约审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
        return true;
    }
}
