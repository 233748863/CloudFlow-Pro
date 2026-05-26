package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.vo.DynamicMapVO;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 任务统计服务接口
 * 从原工作流服务拆分出来，负责任务统计和分组功能
 *
 * @author CloudFlow
 */
public interface ITaskStatisticsService {

    /**
     * 获取任务统计详情
     * 支持按时间段、状态、流程类型、处理人等多维度统计
     *
     * @param userId    用户ID
     * @param startTime 开始时间（可选）
     * @param endTime   结束时间（可选）
     * @return 统计结果 Map
     */
    DynamicMapVO getTaskStatistics(Long userId, LocalDateTime startTime, LocalDateTime endTime);

    /**
     * 获取任务分组
     * 按流程类型、状态、优先级、处理人等维度分组
     *
     * @param userId 用户ID
     * @return 分组结果 Map
     */
    DynamicMapVO getTaskGroups(Long userId);

    /**
     * 获取用户任务统计数量（轻量级）
     * 返回待办数、已办数、我发起的流程数
     *
     * @param userId 用户ID
     * @return 数量 Map（todoCount, doneCount, myInstanceCount）
     */
    Map<String, Integer> getTasksCount(Long userId);
}
