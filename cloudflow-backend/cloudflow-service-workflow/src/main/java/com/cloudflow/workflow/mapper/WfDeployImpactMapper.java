package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployImpact;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 发布影响分析Mapper接口
 */
@Mapper
public interface WfDeployImpactMapper extends BaseMapper<WfDeployImpact> {

    @Select("SELECT * FROM wf_deploy_impact WHERE deploy_id = #{deployId} ORDER BY impact_level DESC")
    List<WfDeployImpact> listByDeployId(@Param("deployId") Long deployId);

    @Select("SELECT * FROM wf_deploy_impact WHERE deploy_id = #{deployId} AND impact_level IN ('HIGH', 'CRITICAL')")
    List<WfDeployImpact> listHighImpactByDeployId(@Param("deployId") Long deployId);
}
