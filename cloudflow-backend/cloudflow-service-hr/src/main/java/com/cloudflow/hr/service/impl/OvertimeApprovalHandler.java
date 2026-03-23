package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.OvertimeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 加班审批结果处理器
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OvertimeApprovalHandler implements ApprovalResultHandler {

    private final OvertimeService overtimeService;

    @Override
    public String getSupportedBusinessType() {
        return "OVERTIME";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        log.info("处理加班审批通过，businessId: {}, processInstanceId: {}",
                dto.getBusinessId(), dto.getProcessInstanceId());

        try {
            overtimeService.approveOvertimeApplication(dto.getBusinessId());
            log.info("加班审批通过处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("加班审批通过处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        log.info("处理加班审批拒绝，businessId: {}, processInstanceId: {}, comment: {}",
                dto.getBusinessId(), dto.getProcessInstanceId(), dto.getApprovalComment());

        try {
            overtimeService.rejectOvertimeApplication(dto.getBusinessId());
            log.info("加班审批拒绝处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("加班审批拒绝处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }
}
