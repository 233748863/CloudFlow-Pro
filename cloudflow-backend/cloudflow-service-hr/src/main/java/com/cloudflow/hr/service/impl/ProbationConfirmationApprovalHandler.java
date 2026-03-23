package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.ProbationConfirmationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 转正审批结果处理器
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProbationConfirmationApprovalHandler implements ApprovalResultHandler {

    private final ProbationConfirmationService probationConfirmationService;

    @Override
    public String getSupportedBusinessType() {
        return "PROBATION_CONFIRMATION";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        log.info("处理转正审批通过，businessId: {}, processInstanceId: {}", 
                dto.getBusinessId(), dto.getProcessInstanceId());
        
        try {
            // 调用转正服务的审批通过处理方法
            probationConfirmationService.approveProbationConfirmation(dto.getBusinessId());
            log.info("转正审批通过处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("转正审批通过处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        log.info("处理转正审批拒绝，businessId: {}, processInstanceId: {}, comment: {}", 
                dto.getBusinessId(), dto.getProcessInstanceId(), dto.getApprovalComment());
        
        try {
            // 调用转正服务的审批拒绝处理方法
            // 可能需要延长试用期或标记为离职
            String reason = dto.getApprovalComment();
            Integer extensionDays = null;
            
            // 从流程变量中获取延长天数（如果有）
            if (dto.getVariables() != null && dto.getVariables().containsKey("extensionDays")) {
                extensionDays = (Integer) dto.getVariables().get("extensionDays");
            }
            
            probationConfirmationService.rejectProbationConfirmation(dto.getBusinessId(), reason, extensionDays);
            log.info("转正审批拒绝处理成功，businessId: {}", dto.getBusinessId());
        } catch (Exception e) {
            log.error("转正审批拒绝处理失败，businessId: {}", dto.getBusinessId(), e);
            throw e;
        }
    }
}
