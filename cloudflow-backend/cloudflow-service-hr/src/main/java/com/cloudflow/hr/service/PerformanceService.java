package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.PerformanceAssignmentChildrenDTO;
import com.cloudflow.hr.domain.dto.PerformanceObjectiveCreateDTO;
import com.cloudflow.hr.domain.dto.PerformanceObjectiveQueryDTO;
import com.cloudflow.hr.domain.dto.PerformanceResultUpdateDTO;
import com.cloudflow.hr.domain.dto.PerformanceSalaryAdjustmentCreateDTO;
import com.cloudflow.hr.domain.vo.PerformanceObjectiveVO;
import com.cloudflow.hr.domain.vo.PerformanceOverviewVO;

public interface PerformanceService {

    Long createObjective(PerformanceObjectiveCreateDTO dto);

    Page<PerformanceObjectiveVO> listObjectives(PerformanceObjectiveQueryDTO query);

    PerformanceObjectiveVO getObjective(Long id);

    PerformanceObjectiveVO getObjectiveTree(Long id);

    PerformanceOverviewVO getOverview();

    void saveAssignmentChildren(Long parentId, PerformanceAssignmentChildrenDTO dto);

    void updateResult(PerformanceResultUpdateDTO dto);

    void submitPlan(Long objectiveId);

    void approvePlan(Long objectiveId);

    void rejectPlan(Long objectiveId);

    void submitResult(Long objectiveId);

    void approveResult(Long objectiveId);

    void rejectResult(Long objectiveId);

    Long createSalaryAdjustment(Long objectiveId, PerformanceSalaryAdjustmentCreateDTO dto);
}
