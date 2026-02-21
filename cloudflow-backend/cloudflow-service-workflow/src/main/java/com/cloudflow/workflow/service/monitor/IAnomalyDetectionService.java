package com.cloudflow.workflow.service.monitor;

import com.cloudflow.workflow.domain.monitor.AnomalyAlert;

/**
 * 异常检测服务接口
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
public interface IAnomalyDetectionService {

    /**
     * 检测执行失败
     * 当流程或任务执行失败时调用
     *
     * @param instanceId 流程实例ID
     * @param errorMessage 错误信息
     * @param stackTrace 堆栈跟踪
     */
    void detectExecutionFailure(String instanceId, String errorMessage, String stackTrace);

    /**
     * 检测死锁
     * 定时任务调用，检测可能的死锁情况
     */
    void detectDeadlock();

    /**
     * 检测无候选人
     * 当任务没有候选人时调用
     *
     * @param taskId 任务ID
     * @param instanceId 流程实例ID
     * @param nodeKey 节点Key
     */
    void detectNoAssignee(String taskId, String instanceId, String nodeKey);

    /**
     * 检测数据不一致
     * 定时任务调用，检测数据一致性问题
     */
    void detectDataInconsistency();

    /**
     * 发送异常告警
     *
     * @param alert 告警记录
     */
    void sendAnomalyAlert(AnomalyAlert alert);

    /**
     * 解决异常告警
     *
     * @param alertId 告警ID
     * @param resolver 解决人
     * @param solution 解决方案
     */
    void resolveAnomalyAlert(Long alertId, String resolver, String solution);
}
