package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfFormDefinition;
import org.apache.ibatis.annotations.Mapper;

/**
 * 表单定义 Mapper 接口
 */
@Mapper
public interface WfFormDefinitionMapper extends BaseMapper<WfFormDefinition> {
}
