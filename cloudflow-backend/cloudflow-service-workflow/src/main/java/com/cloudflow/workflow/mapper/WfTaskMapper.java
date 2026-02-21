package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.vo.TaskDetailVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 任务 Mapper 接口
 */
@Mapper
public interface WfTaskMapper extends BaseMapper<WfTask> {

    /**
     * 批量查询任务详情
     *
     * @param taskIds 任务ID列表
     * @return 任务详情列表
     */
    List<TaskDetailVO> selectBatchByIds(@Param("taskIds") List<String> taskIds);
}
