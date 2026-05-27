package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.HrPerformanceObjectiveTreePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceResultUpdatePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceSalaryAdjustmentRequest;
import com.cloudflow.hr.domain.dto.HrPerformanceSplitPayload;
import com.cloudflow.hr.domain.dto.performance.HrPerformanceCommonQueryDTO;
import com.cloudflow.hr.domain.vo.performance.HrPerformanceObjectiveTreeVO;
import com.cloudflow.hr.domain.vo.performance.HrPerformanceObjectiveVO;
import com.cloudflow.hr.domain.vo.performance.HrPerformanceOverviewVO;

public interface IHrPerformanceService {

    PageResult<HrPerformanceObjectiveVO> listObjectives(HrPerformanceCommonQueryDTO query);

    HrPerformanceObjectiveTreeVO getObjectiveTree(Long id);

    HrPerformanceOverviewVO getOverview();

    Long createObjective(HrPerformanceObjectiveTreePayload payload);

    void saveAssignmentChildren(Long parentId, HrPerformanceSplitPayload payload);

    void updateResult(HrPerformanceResultUpdatePayload payload);

    void submitPlan(Long objectiveId);

    void submitResult(Long objectiveId);

    Long createSalaryAdjustment(Long objectiveId, HrPerformanceSalaryAdjustmentRequest payload);
}
