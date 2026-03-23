package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.OfferService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Offer 审批结果处理器
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OfferApprovalHandler implements ApprovalResultHandler {

    private final OfferService offerService;

    @Override
    public String getSupportedBusinessType() {
        return "OFFER";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        log.info("处理 Offer 审批通过，businessId: {}, processInstanceId: {}",
                dto.getBusinessId(), dto.getProcessInstanceId());

        try {
            offerService.approveOffer(dto.getBusinessId());
            log.info("Offer 审批通过处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("Offer 审批通过处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        log.info("处理 Offer 审批拒绝，businessId: {}, processInstanceId: {}, comment: {}",
                dto.getBusinessId(), dto.getProcessInstanceId(), dto.getApprovalComment());

        try {
            offerService.rejectOffer(dto.getBusinessId());
            log.info("Offer 审批拒绝处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("Offer 审批拒绝处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }
}
