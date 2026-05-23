package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrPerfEvaluator;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface HrPerfEvaluatorMapper extends BaseMapper<HrPerfEvaluator> {

    /**
     * 评估人列表（含 response 评分快照），按 objectiveId+可选 evaluateeId 过滤。
     */
    List<Map<String, Object>> selectEvaluatorsWithResponse(@Param("tenantId") Long tenantId,
                                                           @Param("objectiveId") Long objectiveId,
                                                           @Param("evaluateeId") Long evaluateeId);

    /**
     * 评估人待办列表（含目标基础信息），仅 status='PENDING'。
     */
    List<Map<String, Object>> selectPendingForEvaluator(@Param("tenantId") Long tenantId,
                                                        @Param("evaluatorId") Long evaluatorId);

    /**
     * 360 聚合用：拉某 (objectiveId, evaluateeId) 已 SUBMITTED 的 (source, weight, score)。
     */
    List<Map<String, Object>> selectAggregationRows(@Param("tenantId") Long tenantId,
                                                    @Param("objectiveId") Long objectiveId,
                                                    @Param("evaluateeId") Long evaluateeId);
}
