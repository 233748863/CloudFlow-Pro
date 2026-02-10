package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployRollbackHistory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 发布回滚历史Mapper接口
 */
@Mapper
public interface WfDeployRollbackHistoryMapper extends BaseMapper<WfDeployRollbackHistory> {

    @Select("SELECT * FROM wf_deploy_rollback_history WHERE original_deploy_id = #{deployId} ORDER BY rollback_time DESC")
    List<WfDeployRollbackHistory> listByOriginalDeployId(@Param("deployId") Long deployId);

    @Select("SELECT * FROM wf_deploy_rollback_history WHERE rollback_deploy_id = #{deployId}")
    WfDeployRollbackHistory selectByRollbackDeployId(@Param("deployId") Long deployId);

    @Select("SELECT * FROM wf_deploy_rollback_history ORDER BY rollback_time DESC LIMIT #{limit}")
    List<WfDeployRollbackHistory> listRecent(@Param("limit") Integer limit);
}
