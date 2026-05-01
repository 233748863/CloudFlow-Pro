package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.util.OaContractConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 合同审批结果处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ContractApprovalHandler implements ApprovalResultHandler {

    private final OaContractMapper contractMapper;
    private final IOaTraceEventService traceEventService;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_CONTRACT;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, OaContractConstants.CONTRACT_STATUS_APPROVED, "APPROVAL_APPROVED", "合同审批通过");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, OaContractConstants.CONTRACT_STATUS_REJECTED, "APPROVAL_REJECTED", "合同审批驳回");
    }

    private void updateStatus(ApprovalResultDTO dto, String status, String eventType, String eventTitle) {
        OaContract contract = contractMapper.selectById(dto.getBusinessId());
        if (contract == null || !"0".equals(contract.getDelFlag())) {
            throw new IllegalStateException("未找到合同记录，businessId=" + dto.getBusinessId());
        }
        LambdaUpdateWrapper<OaContract> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaContract::getContractId, dto.getBusinessId())
                .set(OaContract::getInstanceId, dto.getProcessInstanceId())
                .set(OaContract::getStatus, status)
                .set(OaContract::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(OaContract::getUpdateTime, LocalDateTime.now());
        int updated = contractMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("合同审批结果回写失败，businessId=" + dto.getBusinessId());
        }
        traceEventService.record(contract.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT, contract.getContractId(),
                OaContractConstants.BUSINESS_TYPE_APPROVAL, contract.getContractId(), eventType, eventTitle,
                dto.getApprovalComment(), dto.getApproverId(), dto.getApproverName(), null);
        log.info("合同审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
