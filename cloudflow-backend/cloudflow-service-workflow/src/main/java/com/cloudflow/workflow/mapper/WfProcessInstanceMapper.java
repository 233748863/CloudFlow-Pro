package com.cloudflow.workflow.mapper;

import com.cloudflow.common.datascope.CloudFlowBaseMapper;
import com.cloudflow.workflow.domain.WfProcessInstance;
import org.apache.ibatis.annotations.Mapper;

/**
 * 工作流实例 Mapper 接口
 * 继承CloudFlowBaseMapper以支持数据权限
 */
@Mapper
public interface WfProcessInstanceMapper extends CloudFlowBaseMapper<WfProcessInstance> {
}
