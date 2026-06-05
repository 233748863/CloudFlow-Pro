package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 流程定义 Mapper 接口
 */
@Mapper
public interface WfProcessDefinitionMapper extends BaseMapper<WfProcessDefinition> {

    /**
     * 物理删除流程定义。
     * 注意：BaseMapper.deleteById 会触发逻辑删除，永久删除场景必须显式物理删除。
     */
    int deletePhysicalById(@Param("definitionId") String definitionId);
}
