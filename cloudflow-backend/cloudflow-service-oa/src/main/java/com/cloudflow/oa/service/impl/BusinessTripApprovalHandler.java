package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.mapper.BusinessTripMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 出差申请审批结果处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BusinessTripApprovalHandler implements ApprovalResultHandler {

    private final BusinessTripMapper businessTripMapper;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.BUSINESS_TRIP;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, "APPROVED");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "REJECTED");
    }

    private void updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<BusinessTrip> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BusinessTrip::getId, dto.getBusinessId())
                .set(BusinessTrip::getInstanceId, dto.getProcessInstanceId())
                .set(BusinessTrip::getStatus, status)
                .set(BusinessTrip::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(BusinessTrip::getUpdateTime, LocalDateTime.now());

        int updated = businessTripMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到出差申请记录，businessId=" + dto.getBusinessId());
        }
        log.info("出差申请审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
