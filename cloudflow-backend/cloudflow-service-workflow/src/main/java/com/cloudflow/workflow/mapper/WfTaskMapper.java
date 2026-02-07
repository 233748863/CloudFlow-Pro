package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTask;
import org.apache.ibatis.annotations.Mapper;

/**
 * 任务 Mapper 接口
 */
@Mapper
public interface WfTaskMapper extends BaseMapper<WfTask> {
}
