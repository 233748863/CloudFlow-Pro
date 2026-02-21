package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.vo.TaskDetailVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 任务审批历史 Mapper 接口
 */
@Mapper
public interface WfTaskHistoryMapper extends BaseMapper<WfTaskHistory> {

    /**
     * 批量查询流程实例的审批历史（转换为TaskDetailVO）
     *
     * @param instanceIds 实例ID列表
     * @return 审批历史列表（TaskDetailVO格式）
     */
    List<TaskDetailVO> selectBatchByInstanceIds(@Param("instanceIds") List<String> instanceIds);
}
