package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 任务执行监控Mapper
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Mapper
public interface TaskMonitorMapper extends BaseMapper<TaskMonitor> {

    /**
     * 根据任务ID查询监控记录
     *
     * @param taskId 任务ID
     * @return 监控记录
     */
    TaskMonitor selectByTaskId(@Param("taskId") String taskId);

    /**
     * 查询流程实例的所有任务监控记录
     *
     * @param instanceId 流程实例ID
     * @return 任务监控列表
     */
    List<TaskMonitor> selectByInstanceId(@Param("instanceId") String instanceId);

    /**
     * 查询指定处理人的任务监控记录
     *
     * @param tenantId   租户ID
     * @param assigneeId 处理人ID
     * @return 任务监控列表
     */
    List<TaskMonitor> selectByAssignee(
            @Param("tenantId") Long tenantId,
            @Param("assigneeId") Long assigneeId
    );

    /**
     * 查询超时的任务
     *
     * @param tenantId  租户ID
     * @param threshold 超时阈值(毫秒)
     * @return 超时任务列表
     */
    List<TaskMonitor> selectTimeoutTasks(
            @Param("tenantId") Long tenantId,
            @Param("threshold") Long threshold
    );

    /**
     * 统计任务执行情况
     *
     * @param tenantId  租户ID
     * @param startTime 开始时间
     * @param endTime   结束时间
     * @return 统计结果
     */
    TaskMonitor selectTaskStatistics(
            @Param("tenantId") Long tenantId,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime
    );
}
