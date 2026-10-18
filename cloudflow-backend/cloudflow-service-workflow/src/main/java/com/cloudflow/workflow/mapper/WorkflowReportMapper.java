package com.cloudflow.workflow.mapper;

import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.workflow.domain.WfTask;
import java.util.List;
import java.util.Set;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface WorkflowReportMapper {
    List<WfTask> proxyTasks(@Param("tenantId") Long tenantId, @Param("userId") Long userId,
                            @Param("query") PreparedReportQuery query, @Param("instanceMode") boolean instanceMode);
    List<ReportRow> instances(@Param("tenantId") Long tenantId, @Param("userId") Long userId,
                              @Param("admin") boolean admin, @Param("agentInstances") Set<String> agentInstances,
                              @Param("query") PreparedReportQuery query);
    List<ReportRow> tasks(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("admin") boolean admin,
                          @Param("agentTasks") Set<String> agentTasks, @Param("allowTodo") boolean allowTodo,
                          @Param("allowHandled") boolean allowHandled, @Param("query") PreparedReportQuery query);
}
