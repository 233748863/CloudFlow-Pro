package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.mapper.VehicleUsageMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 用车申请审批结果处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VehicleUsageApprovalHandler implements ApprovalResultHandler {

    private final VehicleUsageMapper vehicleUsageMapper;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.VEHICLE_APPROVAL;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, "1");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "2");
    }

    private void updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<VehicleUsage> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(VehicleUsage::getUsageId, dto.getBusinessId())
                .eq(VehicleUsage::getProcessInstanceId, dto.getProcessInstanceId())
                .set(VehicleUsage::getStatus, status)
                .set(VehicleUsage::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(VehicleUsage::getUpdateTime, LocalDateTime.now());

        int updated = vehicleUsageMapper.update(null, wrapper);
        if (updated <= 0) {
            VehicleUsage usage = vehicleUsageMapper.selectById(dto.getBusinessId());
            if (usage == null) {
                throw new IllegalStateException("未找到用车申请记录，businessId=" + dto.getBusinessId());
            }
            if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                    "用车申请", dto.getBusinessId(), usage.getProcessInstanceId(), dto.getProcessInstanceId())) {
                return;
            }
            throw new IllegalStateException("用车申请审批结果回写失败，businessId=" + dto.getBusinessId());
        }
        log.info("用车申请审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
