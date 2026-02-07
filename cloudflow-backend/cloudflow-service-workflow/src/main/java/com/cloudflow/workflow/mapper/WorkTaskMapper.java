package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WorkTask;
import org.apache.ibatis.annotations.Mapper;

/**
 * 协作任务 Mapper 接口
 */
@Mapper
public interface WorkTaskMapper extends BaseMapper<WorkTask> {
}
