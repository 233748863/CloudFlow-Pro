package com.cloudflow.workflow.service.monitor;

import com.cloudflow.workflow.domain.monitor.ProcessMonitor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 流程执行监控服务接口
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
public interface IProcessMonitorService {

    /**
     * 记录流程开始
     *
     * @param instanceId    流程实例ID
     * @param processDefId  流程定义ID
     * @param processDefKey 流程定义Key
     * @param processDefName 流程定义名称
     * @param businessKey   业务键
     * @param startUserId   发起人ID
     * @param startUserName 发起人姓名
     */
    void recordProcessStart(String instanceId, String processDefId, String processDefKey,
                           String processDefName, String businessKey, Long startUserId, String startUserName);

    /**
     * 记录流程完成
     *
     * @param instanceId 流程实例ID
     * @param status     状态：COMPLETED/FAILED/TERMINATED
     * @param errorMessage 错误信息（如有）
     */
    void recordProcessEnd(String instanceId, String status, String errorMessage);

    /**
     * 更新流程节点数量
     *
     * @param instanceId 流程实例ID
     */
    void incrementNodeCount(String instanceId);

    /**
     * 更新流程任务数量
     *
     * @param instanceId 流程实例ID
     */
    void incrementTaskCount(String instanceId);

    /**
     * 根据流程实例ID查询监控记录
     *
     * @param instanceId 流程实例ID
     * @return 监控记录
     */
    ProcessMonitor getByInstanceId(String instanceId);

    /**
     * 查询运行中的流程
     *
     * @return 运行中的流程列表
     */
    List<ProcessMonitor> getRunningProcesses();

    /**
     * 查询指定时间范围内的流程
     *
     * @param startTime 开始时间
     * @param endTime   结束时间
     * @return 流程列表
     */
    List<ProcessMonitor> getProcessesByTimeRange(LocalDateTime startTime, LocalDateTime endTime);

    /**
     * 查询指定流程定义的监控记录
     *
     * @param processDefKey 流程定义Key
     * @param limit         限制数量
     * @return 监控记录列表
     */
    List<ProcessMonitor> getProcessesByDefKey(String processDefKey, Integer limit);

    /**
     * 统计流程执行情况
     *
     * @param processDefKey 流程定义Key
     * @param startTime     开始时间
     * @param endTime       结束时间
     * @return 统计结果
     */
    com.cloudflow.workflow.domain.vo.ProcessStatisticsVO getStatistics(String processDefKey, LocalDateTime startTime, LocalDateTime endTime);

    /**
     * 清理过期监控数据
     *
     * @param retentionDays 保留天数
     * @return 清理数量
     */
    int cleanExpiredData(int retentionDays);
}
