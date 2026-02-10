package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployApproval;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 流程发布审批Mapper接口
 */
@Mapper
public interface WfDeployApprovalMapper extends BaseMapper<WfDeployApproval> {

    @Select("SELECT * FROM wf_deploy_approval WHERE deploy_id = #{deployId}")
    WfDeployApproval selectByDeployId(@Param("deployId") Long deployId);

    @Select("SELECT * FROM wf_deploy_approval WHERE approval_status = #{status} ORDER BY submit_time DESC")
    List<WfDeployApproval> listByStatus(@Param("status") String status);

    @Select("SELECT * FROM wf_deploy_approval WHERE submitter_id = #{submitterId} ORDER BY submit_time DESC")
    List<WfDeployApproval> listBySubmitter(@Param("submitterId") Long submitterId);

    @Select("SELECT da.* FROM wf_deploy_approval da " +
            "INNER JOIN wf_deploy_approval_step das ON da.id = das.approval_id " +
            "WHERE das.step_status = 'PENDING' AND (das.approver_type = 'USER' AND FIND_IN_SET(#{userId}, das.approver_ids) > 0) " +
            "ORDER BY da.submit_time DESC")
    List<WfDeployApproval> listPendingForUser(@Param("userId") Long userId);
}
