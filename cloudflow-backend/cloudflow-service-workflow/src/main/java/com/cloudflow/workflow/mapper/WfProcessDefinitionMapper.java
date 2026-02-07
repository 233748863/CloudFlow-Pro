package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import org.apache.ibatis.annotations.Mapper;

/**
 * 流程定义 Mapper 接口
 */
@Mapper
public interface WfProcessDefinitionMapper extends BaseMapper<WfProcessDefinition> {
}
