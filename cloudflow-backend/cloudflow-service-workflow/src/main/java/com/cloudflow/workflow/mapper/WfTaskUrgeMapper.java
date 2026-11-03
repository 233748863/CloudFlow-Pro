package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTaskUrge;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface WfTaskUrgeMapper extends BaseMapper<WfTaskUrge> {
    int recordReminder(@Param("tenantId") Long tenantId, @Param("taskId") String taskId,
                       @Param("recipientId") Long recipientId, @Param("sourceKey") String sourceKey,
                       @Param("reason") String reason);
}
