package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployNotification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * 流程发布通知记录Mapper接口
 */
@Mapper
public interface WfDeployNotificationMapper extends BaseMapper<WfDeployNotification> {

    @Select("SELECT * FROM wf_deploy_notification WHERE deploy_id = #{deployId} ORDER BY created_time DESC")
    List<WfDeployNotification> listByDeployId(@Param("deployId") Long deployId);

    @Select("SELECT * FROM wf_deploy_notification WHERE send_status = #{status} ORDER BY created_time ASC")
    List<WfDeployNotification> listByStatus(@Param("status") String status);

    @Update("UPDATE wf_deploy_notification SET send_status = #{status}, send_time = NOW(), error_message = #{errorMessage} WHERE id = #{id}")
    int updateSendStatus(@Param("id") Long id, @Param("status") String status, @Param("errorMessage") String errorMessage);
}
