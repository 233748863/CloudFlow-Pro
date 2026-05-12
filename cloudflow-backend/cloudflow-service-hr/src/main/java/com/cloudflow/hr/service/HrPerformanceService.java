package com.cloudflow.hr.service;

import java.util.Map;

public interface HrPerformanceService {

    Map<String, Object> listObjectives(Map<String, Object> query);

    Map<String, Object> getObjectiveTree(Long id);

    Map<String, Object> getOverview();

    Long createObjective(Map<String, Object> payload);

    void saveAssignmentChildren(Long parentId, Map<String, Object> payload);

    void updateResult(Map<String, Object> payload);

    void submitPlan(Long objectiveId);

    void submitResult(Long objectiveId);

    Long createSalaryAdjustment(Long objectiveId, Map<String, Object> payload);
}
