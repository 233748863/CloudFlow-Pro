package com.cloudflow.workflow.mapper;

import com.cloudflow.common.datascope.CloudFlowBaseMapper;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.vo.ProcessInstanceVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 工作流实例 Mapper 接口
 * 继承CloudFlowBaseMapper以支持数据权限
 */
@Mapper
public interface WfProcessInstanceMapper extends CloudFlowBaseMapper<WfProcessInstance> {

    /**
     * 批量查询流程实例（包含定义信息）
     *
     * @param instanceIds 实例ID列表
     * @return 流程实例VO列表
     */
    List<ProcessInstanceVO> selectBatchWithDefinition(@Param("instanceIds") List<String> instanceIds);
}
