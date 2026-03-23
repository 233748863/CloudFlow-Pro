package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.AttendanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 补卡审批结果处理器
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AttendanceSupplementApprovalHandler implements ApprovalResultHandler {

    private final AttendanceService attendanceService;

    @Override
    public String getSupportedBusinessType() {
        return "ATTENDANCE_SUPPLEMENT";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        log.info("处理补卡审批通过，businessId: {}, processInstanceId: {}",
                dto.getBusinessId(), dto.getProcessInstanceId());

        try {
            attendanceService.approveSupplementApplication(dto.getBusinessId());
            log.info("补卡审批通过处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("补卡审批通过处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        log.info("处理补卡审批拒绝，businessId: {}, processInstanceId: {}, comment: {}",
                dto.getBusinessId(), dto.getProcessInstanceId(), dto.getApprovalComment());

        try {
            attendanceService.rejectSupplementApplication(dto.getBusinessId());
            log.info("补卡审批拒绝处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("补卡审批拒绝处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }
}
