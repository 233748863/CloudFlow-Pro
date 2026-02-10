package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployApprovalStep;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 流程发布审批步骤Mapper接口
 */
@Mapper
public interface WfDeployApprovalStepMapper extends BaseMapper<WfDeployApprovalStep> {

    @Select("SELECT * FROM wf_deploy_approval_step WHERE approval_id = #{approvalId} ORDER BY step_no ASC")
    List<WfDeployApprovalStep> listByApprovalId(@Param("approvalId") Long approvalId);

    @Select("SELECT * FROM wf_deploy_approval_step WHERE approval_id = #{approvalId} AND step_no = #{stepNo}")
    WfDeployApprovalStep selectByApprovalAndStep(@Param("approvalId") Long approvalId, @Param("stepNo") Integer stepNo);

    @Select("SELECT * FROM wf_deploy_approval_step WHERE approval_id = #{approvalId} AND step_status = 'PENDING' ORDER BY step_no ASC LIMIT 1")
    WfDeployApprovalStep selectNextPendingStep(@Param("approvalId") Long approvalId);
}
