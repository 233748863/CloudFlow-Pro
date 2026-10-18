package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfCountersignTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 5.I: 会签任务 Mapper
 */
@Mapper
public interface WfCountersignTaskMapper extends BaseMapper<WfCountersignTask> {
    WfCountersignTask selectForUpdate(@Param("tenantId") Long tenantId, @Param("countersignId") String countersignId);
}
