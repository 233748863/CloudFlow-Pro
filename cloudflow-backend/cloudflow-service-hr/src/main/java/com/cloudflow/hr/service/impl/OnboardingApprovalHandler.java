package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.OnboardingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 入职审批结果处理器
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OnboardingApprovalHandler implements ApprovalResultHandler {

    private final OnboardingService onboardingService;

    @Override
    public String getSupportedBusinessType() {
        return "ONBOARDING";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        log.info("处理入职审批通过，businessId: {}, processInstanceId: {}",
                dto.getBusinessId(), dto.getProcessInstanceId());

        try {
            onboardingService.approveOnboarding(dto.getBusinessId());
            log.info("入职审批通过处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("入职审批通过处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        log.info("处理入职审批拒绝，businessId: {}, processInstanceId: {}, comment: {}",
                dto.getBusinessId(), dto.getProcessInstanceId(), dto.getApprovalComment());

        try {
            onboardingService.rejectOnboarding(dto.getBusinessId());
            log.info("入职审批拒绝处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("入职审批拒绝处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }
}
