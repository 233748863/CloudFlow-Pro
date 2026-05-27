package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.talent.HrTalentDevelopmentActionDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentDevelopmentActionQueryDTO;
import com.cloudflow.hr.domain.vo.talent.HrTalentDevelopmentActionVO;

import java.math.BigDecimal;

/**
 * HR 培养行动业务接口。
 *
 * <p>培养行动可关联培训班次（{@code training_session_id}）；完成时回填评估分。
 */
public interface IHrTalentDevelopmentService {

    Long createAction(HrTalentDevelopmentActionDTO dto);

    void updateAction(Long actionId, HrTalentDevelopmentActionDTO dto);

    PageResult<HrTalentDevelopmentActionVO> pageActions(HrTalentDevelopmentActionQueryDTO query);

    void completeAction(Long actionId, BigDecimal evaluationScore, String evaluationNotes);
}
