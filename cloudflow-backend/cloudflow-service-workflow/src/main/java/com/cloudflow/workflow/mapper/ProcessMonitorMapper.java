package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 流程执行监控Mapper
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Mapper
public interface ProcessMonitorMapper extends BaseMapper<ProcessMonitor> {

    /**
     * 根据流程实例ID查询监控记录
     *
     * @param instanceId 流程实例ID
     * @return 监控记录
     */
    ProcessMonitor selectByInstanceId(@Param("instanceId") String instanceId);

    /**
     * 查询运行中的流程
     *
     * @param tenantId 租户ID
     * @return 运行中的流程列表
     */
    List<ProcessMonitor> selectRunningProcesses(@Param("tenantId") Long tenantId);

    /**
     * 查询指定时间范围内的流程
     *
     * @param tenantId  租户ID
     * @param startTime 开始时间
     * @param endTime   结束时间
     * @return 流程列表
     */
    List<ProcessMonitor> selectByTimeRange(
            @Param("tenantId") Long tenantId,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime
    );

    /**
     * 查询指定流程定义的监控记录
     *
     * @param tenantId      租户ID
     * @param processDefKey 流程定义Key
     * @param limit         限制数量
     * @return 监控记录列表
     */
    List<ProcessMonitor> selectByProcessDefKey(
            @Param("tenantId") Long tenantId,
            @Param("processDefKey") String processDefKey,
            @Param("limit") Integer limit
    );

    /**
     * 统计流程执行情况
     *
     * @param tenantId      租户ID
     * @param processDefKey 流程定义Key
     * @param startTime     开始时间
     * @param endTime       结束时间
     * @return 统计结果Map
     */
    ProcessMonitor selectStatistics(
            @Param("tenantId") Long tenantId,
            @Param("processDefKey") String processDefKey,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime
    );
}
