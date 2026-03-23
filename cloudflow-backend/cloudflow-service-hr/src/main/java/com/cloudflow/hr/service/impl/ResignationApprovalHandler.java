package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.ResignationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 离职审批结果处理器
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ResignationApprovalHandler implements ApprovalResultHandler {

    private final ResignationService resignationService;

    @Override
    public String getSupportedBusinessType() {
        return "RESIGNATION";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        log.info("处理离职审批通过，businessId: {}, processInstanceId: {}",
                dto.getBusinessId(), dto.getProcessInstanceId());

        try {
            resignationService.approveResignation(dto.getBusinessId());
            log.info("离职审批通过处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("离职审批通过处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        log.info("处理离职审批拒绝，businessId: {}, processInstanceId: {}, comment: {}",
                dto.getBusinessId(), dto.getProcessInstanceId(), dto.getApprovalComment());

        try {
            resignationService.rejectResignation(dto.getBusinessId());
            log.info("离职审批拒绝处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("离职审批拒绝处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }
}
