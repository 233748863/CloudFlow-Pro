package com.cloudflow.hr.service;

import java.util.Map;

/**
 * HR 培养行动业务接口。
 *
 * <p>培养行动可关联培训班次（{@code training_session_id}）；完成时回填评估分。
 */
public interface HrTalentDevelopmentService {

    Long createAction(Map<String, Object> payload);

    void updateAction(Long actionId, Map<String, Object> payload);

    Map<String, Object> pageActions(Map<String, Object> query);

    void completeAction(Long actionId, java.math.BigDecimal evaluationScore, String evaluationNotes);
}
