package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrPerformanceObjectiveTreePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceResultUpdatePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceSalaryAdjustmentRequest;
import com.cloudflow.hr.domain.dto.HrPerformanceSplitPayload;

import java.util.Map;

public interface HrPerformanceService {

    Map<String, Object> listObjectives(Map<String, Object> query);

    Map<String, Object> getObjectiveTree(Long id);

    Map<String, Object> getOverview();

    Long createObjective(HrPerformanceObjectiveTreePayload payload);

    void saveAssignmentChildren(Long parentId, HrPerformanceSplitPayload payload);

    void updateResult(HrPerformanceResultUpdatePayload payload);

    void submitPlan(Long objectiveId);

    void submitResult(Long objectiveId);

    Long createSalaryAdjustment(Long objectiveId, HrPerformanceSalaryAdjustmentRequest payload);
}
