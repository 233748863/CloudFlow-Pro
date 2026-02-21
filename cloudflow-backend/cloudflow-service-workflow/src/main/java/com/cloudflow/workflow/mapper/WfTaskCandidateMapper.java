package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTaskCandidate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 任务候选人 Mapper 接口
 */
@Mapper
public interface WfTaskCandidateMapper extends BaseMapper<WfTaskCandidate> {

    /**
     * 批量查询任务候选人
     *
     * @param taskIds 任务ID列表
     * @return 候选人列表
     */
    List<WfTaskCandidate> selectBatchByTaskIds(@Param("taskIds") List<String> taskIds);
}
