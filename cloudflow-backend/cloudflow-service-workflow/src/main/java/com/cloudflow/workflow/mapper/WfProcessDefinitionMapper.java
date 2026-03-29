package com.cloudflow.workflow.mapper;

import com.cloudflow.common.datascope.CloudFlowBaseMapper;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;

/**
 * 流程定义 Mapper 接口
 * 继承CloudFlowBaseMapper以支持数据权限
 */
@Mapper
public interface WfProcessDefinitionMapper extends CloudFlowBaseMapper<WfProcessDefinition> {

    /**
     * 物理删除流程定义。
     * 注意：BaseMapper.deleteById 会触发逻辑删除，永久删除场景必须显式物理删除。
     */
    @Delete("DELETE FROM wf_process_definition WHERE definition_id = #{definitionId}")
    int deletePhysicalById(String definitionId);
}
