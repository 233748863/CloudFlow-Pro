package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTaskHistory;
import org.apache.ibatis.annotations.Mapper;

/**
 * 任务审批历史 Mapper 接口
 */
@Mapper
public interface WfTaskHistoryMapper extends BaseMapper<WfTaskHistory> {
}
