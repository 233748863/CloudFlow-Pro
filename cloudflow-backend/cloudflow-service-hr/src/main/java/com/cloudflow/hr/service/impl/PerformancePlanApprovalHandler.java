package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.ApprovalResultHandler;
import com.cloudflow.hr.service.PerformanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PerformancePlanApprovalHandler implements ApprovalResultHandler {

    private final PerformanceService performanceService;

    @Override
    public String getSupportedBusinessType() {
        return "PERFORMANCE_PLAN";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        performanceService.approvePlan(dto.getBusinessId());
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        performanceService.rejectPlan(dto.getBusinessId());
    }
}
