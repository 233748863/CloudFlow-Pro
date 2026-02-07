package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfProcessInstance;
import org.apache.ibatis.annotations.Mapper;

/**
 * 工作流实例 Mapper 接口
 */
@Mapper
public interface WfProcessInstanceMapper extends BaseMapper<WfProcessInstance> {
}
