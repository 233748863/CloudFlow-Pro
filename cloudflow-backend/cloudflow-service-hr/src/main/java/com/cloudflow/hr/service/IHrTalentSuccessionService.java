package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.talent.HrTalentSuccessionPlanDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentSuccessionPlanQueryDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentSuccessorDTO;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessionPlanListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessionPlanVO;

/**
 * HR 继任计划业务接口。
 *
 * <p>关键岗位继任计划 + 继任人提名管理，发布走工作流审批，回调里向继任人发 ESS 站内信。
 */
public interface IHrTalentSuccessionService {

    Long createPlan(HrTalentSuccessionPlanDTO dto);

    void updatePlan(Long planId, HrTalentSuccessionPlanDTO dto);

    PageResult<HrTalentSuccessionPlanListVO> pagePlans(HrTalentSuccessionPlanQueryDTO query);

    HrTalentSuccessionPlanVO getPlan(Long planId);

    Long addSuccessor(Long planId, HrTalentSuccessorDTO dto);

    void removeSuccessor(Long successorId);

    String publish(Long planId);
}
