package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployRollbackHistory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 发布回滚历史Mapper接口
 */
@Mapper
public interface WfDeployRollbackHistoryMapper extends BaseMapper<WfDeployRollbackHistory> {

    List<WfDeployRollbackHistory> listByOriginalDeployId(@Param("deployId") Long deployId);

    WfDeployRollbackHistory selectByRollbackDeployId(@Param("deployId") Long deployId);

    List<WfDeployRollbackHistory> listRecent(@Param("limit") Integer limit);
}
