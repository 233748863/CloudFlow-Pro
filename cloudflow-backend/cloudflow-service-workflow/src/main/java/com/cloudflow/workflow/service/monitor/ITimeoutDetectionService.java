package com.cloudflow.workflow.service.monitor;

import com.cloudflow.workflow.domain.monitor.TimeoutAlert;

/**
 * 超时检测服务接口
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
public interface ITimeoutDetectionService {

    /**
     * 检测超时任务
     * 定时任务调用，检测所有超时的任务并创建告警
     */
    void detectTimeoutTasks();

    /**
     * 检测超时流程
     * 定时任务调用，检测所有超时的流程并创建告警
     */
    void detectTimeoutProcesses();

    /**
     * 发送超时告警
     *
     * @param alert 告警记录
     */
    void sendTimeoutAlert(TimeoutAlert alert);

    /**
     * 升级超时告警
     * 当告警长时间未处理时，升级告警级别
     *
     * @param alertId 告警ID
     */
    void escalateTimeoutAlert(Long alertId);

    /**
     * 解决超时告警
     *
     * @param alertId 告警ID
     * @param resolver 解决人
     * @param solution 解决方案
     */
    void resolveTimeoutAlert(Long alertId, String resolver, String solution);
}
