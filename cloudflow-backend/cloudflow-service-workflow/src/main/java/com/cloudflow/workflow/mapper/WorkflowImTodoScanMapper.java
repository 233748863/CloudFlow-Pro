package com.cloudflow.workflow.mapper;

import com.cloudflow.workflow.domain.WfTask;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface WorkflowImTodoScanMapper {
    List<WfTask> pending(@Param("afterTaskId") String afterTaskId);
}
