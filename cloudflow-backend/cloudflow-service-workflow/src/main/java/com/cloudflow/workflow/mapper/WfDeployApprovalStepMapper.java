package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployApprovalStep;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 流程发布审批步骤Mapper接口
 */
@Mapper
public interface WfDeployApprovalStepMapper extends BaseMapper<WfDeployApprovalStep> {

    List<WfDeployApprovalStep> listByApprovalId(@Param("approvalId") Long approvalId);

    WfDeployApprovalStep selectByApprovalAndStep(@Param("approvalId") Long approvalId, @Param("stepNo") Integer stepNo);

    WfDeployApprovalStep selectNextPendingStep(@Param("approvalId") Long approvalId);
}
