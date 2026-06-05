package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployNotification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 流程发布通知记录Mapper接口
 */
@Mapper
public interface WfDeployNotificationMapper extends BaseMapper<WfDeployNotification> {

    List<WfDeployNotification> listByDeployId(@Param("deployId") Long deployId);

    List<WfDeployNotification> listByStatus(@Param("status") String status);

    int updateSendStatus(@Param("id") Long id, @Param("status") String status, @Param("errorMessage") String errorMessage);
}
