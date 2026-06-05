package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployApproval;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 流程发布审批Mapper接口
 */
@Mapper
public interface WfDeployApprovalMapper extends BaseMapper<WfDeployApproval> {

    WfDeployApproval selectByDeployId(@Param("deployId") Long deployId);

    List<WfDeployApproval> listByStatus(@Param("status") String status);

    List<WfDeployApproval> listBySubmitter(@Param("submitterId") Long submitterId);

    List<WfDeployApproval> listPendingForUser(@Param("userId") Long userId);
}
