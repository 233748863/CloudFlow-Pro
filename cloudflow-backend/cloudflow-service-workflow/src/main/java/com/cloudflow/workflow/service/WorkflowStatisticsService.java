package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
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
    private WfProcessDefinitionMapper processDefinitionMapper;

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
            LocalDateTime todayStart = LocalDate.now().atStartOfDay();

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
            // 1. 按流程类型统计 - 转换为中文名称
            List<WfProcessInstance> allInstances = processInstanceMapper.selectList(null);
            
            // 查询所有流程定义，建立 processKey -> processName 的映射
            List<WfProcessDefinition> allDefinitions = processDefinitionMapper.selectList(null);
            Map<String, String> keyToNameMap = allDefinitions.stream()
                .collect(Collectors.toMap(
                    WfProcessDefinition::getProcessKey,
                    WfProcessDefinition::getProcessName,
                    (existing, replacement) -> existing // 如果有重复key，保留第一个
                ));
            
            // 按 processKey 分组统计，然后转换为中文名称
            Map<String, Long> byProcessKey = allInstances.stream()
                .collect(Collectors.groupingBy(WfProcessInstance::getProcessDefKey, Collectors.counting()));
            
            // 将英文 key 转换为中文名称
            Map<String, Long> byProcessName = new HashMap<>();
            for (Map.Entry<String, Long> entry : byProcessKey.entrySet()) {
                String processKey = entry.getKey();
                String processName = keyToNameMap.getOrDefault(processKey, processKey); // 如果找不到中文名，使用原key
                byProcessName.put(processName, entry.getValue());
            }
            
            analysis.put("byProcessKey", byProcessName);

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
                    .mapToLong(i -> Duration.between(i.getStartTime(), i.getEndTime()).toMillis())
                    .average()
                    .orElse(0) / (1000.0 * 3600);
                analysis.put("avgDurationHours", Math.round(avgDurationHours * 100.0) / 100.0);
            } else {
                analysis.put("avgDurationHours", 0);
            }

            // 4. 最近7天趋势
            List<Map<String, Object>> dailyTrend = new ArrayList<>();
            LocalDate today = LocalDate.now();
            for (int i = 6; i >= 0; i--) {
                LocalDate targetDate = today.minusDays(i);
                LocalDateTime dayStart = targetDate.atStartOfDay();
                LocalDateTime dayEnd = targetDate.plusDays(1).atStartOfDay();

                long dayCount = allInstances.stream()
                    .filter(inst -> inst.getStartTime() != null
                        && !inst.getStartTime().isBefore(dayStart)
                        && inst.getStartTime().isBefore(dayEnd))
                    .count();

                Map<String, Object> dayData = new HashMap<>();
                dayData.put("date", targetDate.format(DateTimeFormatter.ofPattern("MM-dd")));
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

            // 6. 完成率（已完成 / 总实例数）
            long totalCount = allInstances.size();
            long completedCount = allInstances.stream()
                .filter(i -> "COMPLETED".equals(i.getStatus())).count();
            if (totalCount > 0) {
                double approvalRate = (double) completedCount / totalCount * 100;
                analysis.put("approvalRate", Math.round(approvalRate * 100.0) / 100.0);
            } else {
                analysis.put("approvalRate", 0);
            }

        } catch (Exception e) {
            log.error("[getStatisticsAnalysis] 获取统计分析数据失败: {}", e.getMessage(), e);
        }

        return analysis;
    }

    /**
     * M.2: 获取监控指标（合并数据库统计 + Redis 计数器）
     */
    public Map<String, Object> getMetrics() {
        log.info("[getMetrics] 获取监控指标");
        Map<String, Object> metrics = new HashMap<>();

        try {
            // === 核心实例统计（从数据库查询） ===
            Long totalInstances = processInstanceMapper.selectCount(null);
            Long runningInstances = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStatus, "RUNNING"));
            Long completedInstances = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStatus, "COMPLETED"));
            Long rejectedInstances = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStatus, "REJECTED"));

            Long revokedInstances = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStatus, "REVOKED"));

            metrics.put("totalInstances", totalInstances);
            metrics.put("runningInstances", runningInstances);
            metrics.put("completedInstances", completedInstances);
            metrics.put("rejectedInstances", rejectedInstances);
            metrics.put("revokedInstances", revokedInstances);

            // === 流程定义统计 ===
            Long totalDefinitions = processDefinitionMapper.selectCount(null);
            Long deployedDefinitions = processDefinitionMapper.selectCount(
                new LambdaQueryWrapper<WfProcessDefinition>().eq(WfProcessDefinition::getStatus, 1));
            metrics.put("totalDefinitions", totalDefinitions);
            metrics.put("deployedDefinitions", deployedDefinitions);

            // === 任务统计 ===
            Long totalTasks = taskMapper.selectCount(
                new LambdaQueryWrapper<WfTask>().eq(WfTask::getStatus, "TODO"));
            Long allTasks = taskMapper.selectCount(null);
            metrics.put("totalTasks", totalTasks);
            metrics.put("allTaskCount", allTasks);

            // === 今日统计 ===
            LocalDateTime todayStart = LocalDate.now().atStartOfDay();

            Long todayInstances = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>()
                    .ge(WfProcessInstance::getStartTime, todayStart));
            Long todayTasks = taskHistoryMapper.selectCount(
                new LambdaQueryWrapper<WfTaskHistory>()
                    .ge(WfTaskHistory::getCreateTime, todayStart));

            metrics.put("todayInstances", todayInstances);
            metrics.put("todayTasks", todayTasks);

            // === 操作计数器（从 Redis 读取） ===
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
            String todayStr = DateTimeFormatter.ofPattern("yyyyMMdd").format(LocalDateTime.now());
            Map<String, Object> todayCounters = new HashMap<>();
            for (WorkflowAuditService.AuditAction action : WorkflowAuditService.AuditAction.values()) {
                String dailyKey = "sys:wf:metrics:daily:" + action.name() + ":" + todayStr;
                Object count = redisCache.getCacheObject(dailyKey);
                if (count != null) {
                    todayCounters.put(action.name(), count);
                }
            }
            metrics.put("todayCounters", todayCounters);

            // === 系统健康检查 ===
            Map<String, Object> health = new HashMap<>();
            health.put("timestamp", LocalDateTime.now());
            health.put("status", "UP");

            // 检查数据库连接
            try {
                processInstanceMapper.selectCount(new LambdaQueryWrapper<WfProcessInstance>().last("LIMIT 1"));
                health.put("database", "UP");
            } catch (Exception dbEx) {
                health.put("database", "DOWN");
                health.put("status", "DEGRADED");
            }

            // 检查 Redis 连接
            try {
                redisCache.setCacheObject("sys:wf:health:ping", "pong", 60, java.util.concurrent.TimeUnit.SECONDS);
                Object pong = redisCache.getCacheObject("sys:wf:health:ping");
                health.put("redis", pong != null ? "UP" : "DOWN");
            } catch (Exception redisEx) {
                health.put("redis", "DOWN");
                health.put("status", "DEGRADED");
            }

            // 工作流引擎状态（基于数据库可用性判断）
            health.put("workflowEngine", "UP".equals(health.get("database")) ? "UP" : "DOWN");

            metrics.put("health", health);

        } catch (Exception e) {
            log.error("[getMetrics] 获取监控指标失败: {}", e.getMessage(), e);
            metrics.put("health", Map.of("status", "DEGRADED", "error", e.getMessage()));
        }

        return metrics;
    }
}
