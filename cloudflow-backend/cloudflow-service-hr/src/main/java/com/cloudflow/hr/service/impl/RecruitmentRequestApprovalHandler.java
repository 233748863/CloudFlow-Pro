package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.RecruitmentRequestService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 招聘需求审批结果处理器
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RecruitmentRequestApprovalHandler implements ApprovalResultHandler {

    private final RecruitmentRequestService recruitmentRequestService;

    @Override
    public String getSupportedBusinessType() {
        return "RECRUITMENT_REQUEST";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        log.info("处理招聘需求审批通过，businessId: {}, processInstanceId: {}",
                dto.getBusinessId(), dto.getProcessInstanceId());

        try {
            recruitmentRequestService.approveRecruitmentRequest(dto.getBusinessId());
            log.info("招聘需求审批通过处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("招聘需求审批通过处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        log.info("处理招聘需求审批拒绝，businessId: {}, processInstanceId: {}, comment: {}",
                dto.getBusinessId(), dto.getProcessInstanceId(), dto.getApprovalComment());

        try {
            recruitmentRequestService.rejectRecruitmentRequest(dto.getBusinessId());
            log.info("招聘需求审批拒绝处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("招聘需求审批拒绝处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }
}
