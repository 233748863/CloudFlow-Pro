package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WorkflowVersion;
import org.apache.ibatis.annotations.Mapper;

/**
 * 流程版本 Mapper 接口
 * 提供版本数据的持久化操作
 * 
 * @author CloudFlow
 */
@Mapper
public interface WorkflowVersionMapper extends BaseMapper<WorkflowVersion> {
}
