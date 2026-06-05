package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployImpact;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 发布影响分析Mapper接口
 */
@Mapper
public interface WfDeployImpactMapper extends BaseMapper<WfDeployImpact> {

    List<WfDeployImpact> listByDeployId(@Param("deployId") Long deployId);

    List<WfDeployImpact> listHighImpactByDeployId(@Param("deployId") Long deployId);
}
