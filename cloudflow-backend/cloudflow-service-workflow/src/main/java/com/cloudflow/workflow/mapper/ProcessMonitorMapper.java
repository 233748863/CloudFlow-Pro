package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.domain.monitor.ProcessTrend;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 流程监控 Mapper
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Mapper
public interface ProcessMonitorMapper extends BaseMapper<ProcessMonitor> {

    /**
     * 根据日期和状态统计数量
     */
    Integer countByDateAndStatus(@Param("startDate") LocalDateTime startDate, 
                                 @Param("status") String status,
                                 @Param("tenantId") Long tenantId);

    /**
     * 根据状态统计数量
     */
    Integer countByStatus(@Param("status") String status,
                         @Param("tenantId") Long tenantId);

    /**
     * 统计待办任务数量
     */
    Integer countPendingTasks(@Param("tenantId") Long tenantId);

    /**
     * 获取平均完成时间
     */
    Long getAvgCompletionTime(@Param("tenantId") Long tenantId);

    /**
     * 获取成功率
     */
    Double getSuccessRate(@Param("tenantId") Long tenantId);

    /**
     * 获取流程趋势数据
     */
    List<ProcessTrend> getProcessTrend(@Param("startDate") LocalDateTime startDate,
                                       @Param("processDefKey") String processDefKey,
                                       @Param("tenantId") Long tenantId);

    /**
     * 查询流程监控列表
     */
    List<ProcessMonitor> selectProcessMonitors(@Param("processDefKey") String processDefKey,
                                               @Param("status") String status,
                                               @Param("startTimeFrom") String startTimeFrom,
                                               @Param("startTimeTo") String startTimeTo,
                                               @Param("tenantId") Long tenantId);

    Page<ProcessMonitor> selectPageByDataScope(Page<ProcessMonitor> page,
                                               @Param("processDefKey") String processDefKey,
                                               @Param("status") String status,
                                               @Param("startTimeFrom") String startTimeFrom,
                                               @Param("startTimeTo") String startTimeTo,
                                               @Param("tenantId") Long tenantId,
                                               @Param("dataScope") DataScope dataScope);

    /**
     * 根据实例ID查询
     */
    ProcessMonitor selectByInstanceId(@Param("instanceId") String instanceId,
                                      @Param("tenantId") Long tenantId);

    ProcessMonitor selectByInstanceIdWithDataScope(@Param("instanceId") String instanceId,
                                                   @Param("tenantId") Long tenantId,
                                                   @Param("dataScope") DataScope dataScope);

    default ProcessMonitor selectByInstanceId(String instanceId) {
        return selectByInstanceId(instanceId, null);
    }
    
    /**
     * 查询正在运行的流程
     */
    List<ProcessMonitor> selectRunningProcesses(@Param("tenantId") Long tenantId);
    
    /**
     * 根据时间范围查询
     */
    List<ProcessMonitor> selectByTimeRange(@Param("tenantId") Long tenantId,
                                           @Param("startTime") LocalDateTime startTime,
                                           @Param("endTime") LocalDateTime endTime);
    
    /**
     * 根据流程定义Key查询
     */
    List<ProcessMonitor> selectByProcessDefKey(@Param("tenantId") Long tenantId,
                                               @Param("processDefKey") String processDefKey,
                                               @Param("limit") Integer limit);
    
    /**
     * 查询统计信息
     */
    Map<String, Object> selectStatistics(@Param("tenantId") Long tenantId,
                                         @Param("processDefKey") String processDefKey,
                                         @Param("startTime") LocalDateTime startTime,
                                         @Param("endTime") LocalDateTime endTime);
}
