package com.cloudflow.oa.mapper;

import com.cloudflow.common.datascope.CloudFlowBaseMapper;
import com.cloudflow.oa.domain.WorkTask;
import org.apache.ibatis.annotations.Mapper;

/**
 * 协作任务 Mapper 接口
 * 继承CloudFlowBaseMapper以自动启用数据权限
 */
@Mapper
public interface WorkTaskMapper extends CloudFlowBaseMapper<WorkTask> {
}
