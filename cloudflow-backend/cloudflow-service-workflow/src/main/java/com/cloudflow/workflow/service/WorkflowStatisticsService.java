package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * G.3 + G.4: 流程监控大屏 & 流程统计分析服务
 * M.2: 监控指标暴露（通过 Redis 计数器）
 */
@Service
public class WorkflowStatisticsService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowStatisticsService.class);

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfTaskHistoryMapper taskHistoryMapper;

    @Autowired
    private RedisCache redisCache;

    /**
     * G.3: 获取流程监控大屏数据（概览）
     */
    public Map<String, Object> getDashboardOverview() {
        log.info("[getDashboardOverview] 获取监控大屏概览数据");
        Map<String, Object> overview = new HashMap<>();

        try {
            // 1. 流程实例统计
            Long totalInstances = processInstanceMapper.selectCount(null);
            Long runningInstances = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStatus, "RUNNING"));
            Long completedInstances = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStatus, "COMPLETED"));
            Long rejectedInstances = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStatus, "REJECTED"));
            Long revokedInstances = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStatus, "REVOKED"));

            Map<String, Object> instanceStats = new HashMap<>();
            instanceStats.put("total", totalInstances);
            instanceStats.put("running", runningInstances);
            instanceStats.put("completed", completedInstances);
            instanceStats.put("rejected", rejectedInstances);
            instanceStats.put("revoked", revokedInstances);
            overview.put("instances", instanceStats);

            // 2. 待办任务统计
            Long totalTasks = taskMapper.selectCount(null);
            Long todoTasks = taskMapper.selectCount(
                new LambdaQueryWrapper<WfTask>().eq(WfTask::getStatus, "TODO"));
            overview.put("tasks", Map.of("total", totalTasks, "todo", todoTasks));

            // 3. 今日统计
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0);
            cal.set(Calendar.MINUTE, 0);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);
            Date todayStart = cal.getTime();

            Long todayStarted = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>()
                    .ge(WfProcessInstance::getStartTime, todayStart));
            Long todayCompleted = taskHistoryMapper.selectCount(
                new LambdaQueryWrapper<WfTaskHistory>()
                    .ge(WfTaskHistory::getCreateTime, todayStart));

            overview.put("today", Map.of("started", todayStarted, "completed", todayCompleted));

            // 4. 通过率
            if (completedInstances + rejectedInstances > 0) {
                double approvalRate = (double) completedInstances / (completedInstances + rejectedInstances) * 100;
                overview.put("approvalRate", Math.round(approvalRate * 100.0) / 100.0);
            } else {
                overview.put("approvalRate", 0);
            }

        } catch (Exception e) {
            log.error("[getDashboardOverview] 获取概览数据失败: {}", e.getMessage(), e);
        }

        return overview;
    }

    /**
     * G.4: 获取流程统计分析数据
     */
    public Map<String, Object> getStatisticsAnalysis() {
        log.info("[getStatisticsAnalysis] 获取统计分析数据");
        Map<String, Object> analysis = new HashMap<>();

        try {
            // 1. 按流程类型统计
            List<WfProcessInstance> allInstances = processInstanceMapper.selectList(null);
            Map<String, Long> byProcessKey = allInstances.stream()
                .collect(Collectors.groupingBy(WfProcessInstance::getProcessDefKey, Collectors.counting()));
            analysis.put("byProcessKey", byProcessKey);

            // 2. 按状态统计
            Map<String, Long> byStatus = allInstances.stream()
                .collect(Collectors.groupingBy(WfProcessInstance::getStatus, Collectors.counting()));
            analysis.put("byStatus", byStatus);

            // 3. 平均处理时长（已完成的流程）
            List<WfProcessInstance> completedList = allInstances.stream()
                .filter(i -> "COMPLETED".equals(i.getStatus()) && i.getEndTime() != null && i.getStartTime() != null)
                .collect(Collectors.toList());

            if (!completedList.isEmpty()) {
                double avgDurationHours = completedList.stream()
                    .mapToLong(i -> i.getEndTime().getTime() - i.getStartTime().getTime())
                    .average()
                    .orElse(0) / (1000.0 * 3600);
                analysis.put("avgDurationHours", Math.round(avgDurationHours * 100.0) / 100.0);
            } else {
                analysis.put("avgDurationHours", 0);
            }

            // 4. 最近7天趋势
            List<Map<String, Object>> dailyTrend = new ArrayList<>();
            Calendar cal = Calendar.getInstance();
            for (int i = 6; i >= 0; i--) {
                Calendar dayStart = (Calendar) cal.clone();
                dayStart.add(Calendar.DAY_OF_MONTH, -i);
                dayStart.set(Calendar.HOUR_OF_DAY, 0);
                dayStart.set(Calendar.MINUTE, 0);
                dayStart.set(Calendar.SECOND, 0);

                Calendar dayEnd = (Calendar) dayStart.clone();
                dayEnd.add(Calendar.DAY_OF_MONTH, 1);

                long dayCount = allInstances.stream()
                    .filter(inst -> inst.getStartTime() != null
                        && !inst.getStartTime().before(dayStart.getTime())
                        && inst.getStartTime().before(dayEnd.getTime()))
                    .count();

                Map<String, Object> dayData = new HashMap<>();
                dayData.put("date", new java.text.SimpleDateFormat("MM-dd").format(dayStart.getTime()));
                dayData.put("count", dayCount);
                dailyTrend.add(dayData);
            }
            analysis.put("dailyTrend", dailyTrend);

            // 5. 处理人工作量排行（Top 10）
            List<WfTaskHistory> allHistory = taskHistoryMapper.selectList(null);
            Map<Long, Long> operatorWorkload = allHistory.stream()
                .filter(h -> h.getOperatorId() != null)
                .collect(Collectors.groupingBy(WfTaskHistory::getOperatorId, Collectors.counting()));

            List<Map<String, Object>> workloadRank = operatorWorkload.entrySet().stream()
                .sorted(Map.Entry.<Long, Long>comparingByValue().reversed())
                .limit(10)
                .map(entry -> {
                    Map<String, Object> item = new HashMap<>();
                    item.put("operatorId", entry.getKey());
                    item.put("taskCount", entry.getValue());
                    return item;
                })
                .collect(Collectors.toList());
            analysis.put("workloadRank", workloadRank);

        } catch (Exception e) {
            log.error("[getStatisticsAnalysis] 获取统计分析数据失败: {}", e.getMessage(), e);
        }

        return analysis;
    }

    /**
     * M.2: 获取监控指标（从 Redis 计数器读取）
     */
    public Map<String, Object> getMetrics() {
        log.info("[getMetrics] 获取监控指标");
        Map<String, Object> metrics = new HashMap<>();

        try {
            // 操作计数器
            Map<String, Object> actionCounters = new HashMap<>();
            for (WorkflowAuditService.AuditAction action : WorkflowAuditService.AuditAction.values()) {
                String counterKey = "sys:wf:metrics:action:" + action.name();
                Object count = redisCache.getCacheObject(counterKey);
                if (count != null) {
                    actionCounters.put(action.name(), count);
                }
            }
            metrics.put("actionCounters", actionCounters);

            // 今日操作计数
            String today = new java.text.SimpleDateFormat("yyyyMMdd").format(new Date());
            Map<String, Object> todayCounters = new HashMap<>();
            for (WorkflowAuditService.AuditAction action : WorkflowAuditService.AuditAction.values()) {
                String dailyKey = "sys:wf:metrics:daily:" + action.name() + ":" + today;
                Object count = redisCache.getCacheObject(dailyKey);
                if (count != null) {
                    todayCounters.put(action.name(), count);
                }
            }
            metrics.put("todayCounters", todayCounters);

            // 系统健康指标
            Map<String, Object> health = new HashMap<>();
            health.put("timestamp", new Date());
            health.put("status", "UP");
            metrics.put("health", health);

        } catch (Exception e) {
            log.error("[getMetrics] 获取监控指标失败: {}", e.getMessage(), e);
            metrics.put("health", Map.of("status", "DEGRADED", "error", e.getMessage()));
        }

        return metrics;
    }
}
