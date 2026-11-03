package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfUrgeEffect;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.vo.WorkflowUrgeTiming;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface WfUrgeEffectMapper extends BaseMapper<WfUrgeEffect> {
    int recordCompletion(@Param("history") WfTaskHistory history);

    List<WorkflowUrgeTiming> selectTimings(@Param("tenantId") Long tenantId,
                                         @Param("historyIds") List<String> historyIds);
}
