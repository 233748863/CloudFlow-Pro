package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.Hr360EvaluatorInvitePayload;
import com.cloudflow.hr.domain.dto.Hr360EvaluatorResponsePayload;

import java.util.List;
import java.util.Map;

/**
 * HR-P0-1 绩效 360 度评估服务。
 */
public interface HrPerformance360Service {

    /** 发起 360 邀请(批量插入评估关系)。 */
    List<Long> inviteEvaluators(Hr360EvaluatorInvitePayload payload);

    /** 评估人提交打分。 */
    void submitResponse(Hr360EvaluatorResponsePayload payload);

    /** 取消单条评估邀请。 */
    void cancelEvaluator(Long evaluatorId);

    /** 列出某个绩效目标下的所有评估邀请(可按被评人筛选)。 */
    List<Map<String, Object>> listEvaluators(Long objectiveId, Long evaluateeId);

    /** 查询某评估人未完成的评估邀请(评估人视角的待办)。 */
    List<Map<String, Object>> listPendingForEvaluator(Long evaluatorId);

    /** 聚合多源得分回填到 hr_performance_result 并返回结果摘要。 */
    Map<String, Object> aggregate(Long objectiveId, Long evaluateeId);
}
