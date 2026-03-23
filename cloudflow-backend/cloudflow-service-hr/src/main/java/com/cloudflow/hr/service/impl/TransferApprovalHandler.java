package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.TransferService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 调岗审批结果处理器
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TransferApprovalHandler implements ApprovalResultHandler {

    private final TransferService transferService;

    @Override
    public String getSupportedBusinessType() {
        return "TRANSFER";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        log.info("处理调岗审批通过，businessId: {}, processInstanceId: {}",
                dto.getBusinessId(), dto.getProcessInstanceId());

        try {
            transferService.approveTransfer(dto.getBusinessId());
            log.info("调岗审批通过处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("调岗审批通过处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        log.info("处理调岗审批拒绝，businessId: {}, processInstanceId: {}, comment: {}",
                dto.getBusinessId(), dto.getProcessInstanceId(), dto.getApprovalComment());

        try {
            transferService.rejectTransfer(dto.getBusinessId());
            log.info("调岗审批拒绝处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("调岗审批拒绝处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }
}
