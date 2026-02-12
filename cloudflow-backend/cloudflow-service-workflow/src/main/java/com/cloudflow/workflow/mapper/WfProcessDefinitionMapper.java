package com.cloudflow.workflow.mapper;

import com.cloudflow.common.datascope.CloudFlowBaseMapper;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import org.apache.ibatis.annotations.Mapper;

/**
 * 流程定义 Mapper 接口
 * 继承CloudFlowBaseMapper以支持数据权限
 */
@Mapper
public interface WfProcessDefinitionMapper extends CloudFlowBaseMapper<WfProcessDefinition> {
}
