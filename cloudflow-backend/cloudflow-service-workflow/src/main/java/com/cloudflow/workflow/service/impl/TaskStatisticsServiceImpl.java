package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.service.ITaskStatisticsService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 任务统计服务实现
 * 从 WorkflowServiceImpl 拆分出来，专注于统计和分组功能
 *
 * @author CloudFlow
 */
@Service
@RequiredArgsConstructor
public class TaskStatisticsServiceImpl implements ITaskStatisticsService {

    private static final Logger log = LoggerFactory.getLogger(TaskStatisticsServiceImpl.class);

    private final WfTaskMapper taskMapper;
    private final WfTaskHistoryMapper taskHistoryMapper;
    private final WfProcessInstanceMapper processInstanceMapper;
    private final SysUserMapper sysUserMapper;
    private final WorkflowPermissionService permissionService;

    @Override
    public Map<String, Object> getTaskStatistics(Long userId, LocalDateTime startTime, LocalDateTime endTime) {
        log.info("[getTaskStatistics] 查询任务统计, userId={}, startTime={}, endTime={}", userId, startTime, endTime);

        Map<String, Object> stats = new HashMap<>();

        if (userId == null) {
            userId = UserContext.getUserId();
        }

        // 1. 按时间段统计
        Map<String, Object> timePeriodStats = new HashMap<>();

        LocalDateTime todayStart = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0);
        Long todayTodoCount = taskMapper.selectCount(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
                .ge(WfTask::getCreateTime, java.sql.Timestamp.valueOf(todayStart))
        );
        timePeriodStats.put("todayTodo", todayTodoCount != null ? todayTodoCount : 0);

        LocalDateTime weekStart = LocalDateTime.now().with(DayOfWeek.MONDAY).withHour(0).withMinute(0).withSecond(0);
        Long weekTodoCount = taskMapper.selectCount(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
                .ge(WfTask::getCreateTime, java.sql.Timestamp.valueOf(weekStart))
        );
        timePeriodStats.put("weekTodo", weekTodoCount != null ? weekTodoCount : 0);

        LocalDateTime monthStart = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0);
        Long monthTodoCount = taskMapper.selectCount(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
                .ge(WfTask::getCreateTime, java.sql.Timestamp.valueOf(monthStart))
        );
        timePeriodStats.put("monthTodo", monthTodoCount != null ? monthTodoCount : 0);
        stats.put("timePeriod", timePeriodStats);

        // 2. 按任务状态统计
        Map<String, Object> statusStats = new HashMap<>();

        Long todoCount = taskMapper.selectCount(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
        );
        statusStats.put("todo", todoCount != null ? todoCount : 0);

        LambdaQueryWrapper<WfTaskHistory> doneWrapper = new LambdaQueryWrapper<WfTaskHistory>()
            .eq(WfTaskHistory::getOperatorId, userId);
        if (startTime != null) {
            doneWrapper.ge(WfTaskHistory::getCreateTime, java.sql.Timestamp.valueOf(startTime));
        }
        if (endTime != null) {
            doneWrapper.le(WfTaskHistory::getCreateTime, java.sql.Timestamp.valueOf(endTime));
        }
        Long doneCount = taskHistoryMapper.selectCount(doneWrapper);
        statusStats.put("done", doneCount != null ? doneCount : 0);

        Long timeoutCount = taskMapper.selectCount(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
                .eq(WfTask::getIsTimeout, 1)
        );
        statusStats.put("timeout", timeoutCount != null ? timeoutCount : 0);
        stats.put("status", statusStats);

        // 3. 按流程类型统计
        List<WfTask> userTasks = taskMapper.selectList(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
        );

        Map<String, Long> processTypeStats = new HashMap<>();
        if (!userTasks.isEmpty()) {
            List<String> instanceIds = userTasks.stream()
                .map(WfTask::getInstanceId).distinct().collect(Collectors.toList());
            List<WfProcessInstance> instances = processInstanceMapper.selectBatchIds(instanceIds);
            Map<String, String> instanceDefKeyMap = instances.stream()
                .collect(Collectors.toMap(WfProcessInstance::getInstanceId, WfProcessInstance::getProcessDefKey));
            for (WfTask task : userTasks) {
                String defKey = instanceDefKeyMap.getOrDefault(task.getInstanceId(), "unknown");
                processTypeStats.merge(defKey, 1L, Long::sum);
            }
        }
        stats.put("processType", processTypeStats);

        // 4. 按处理人统计（管理员视角）
        if (permissionService.isAdmin(userId)) {
            List<Map<String, Object>> assigneeStats = new ArrayList<>();
            List<WfTask> allTasks = taskMapper.selectList(
                new LambdaQueryWrapper<WfTask>().eq(WfTask::getStatus, WfTaskStatus.TODO.getCode()));
            Map<Long, Long> assigneeCountMap = allTasks.stream()
                .collect(Collectors.groupingBy(WfTask::getAssignee, Collectors.counting()));
            for (Map.Entry<Long, Long> entry : assigneeCountMap.entrySet()) {
                Map<String, Object> assigneeStat = new HashMap<>();
                assigneeStat.put("userId", entry.getKey());
                assigneeStat.put("taskCount", entry.getValue());
                SysUser user = sysUserMapper.selectById(entry.getKey());
                if (user != null) {
                    assigneeStat.put("userName", user.getNickName() != null ? user.getNickName() : user.getUserName());
                }
                assigneeStats.add(assigneeStat);
            }
            stats.put("assignees", assigneeStats);
        }

        // 5. 平均处理时长
        List<WfTaskHistory> histories = taskHistoryMapper.selectList(
            new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getOperatorId, userId)
                .isNotNull(WfTaskHistory::getDurationSeconds)
        );
        if (!histories.isEmpty()) {
            double avgDuration = histories.stream().mapToInt(WfTaskHistory::getDurationSeconds).average().orElse(0.0);
            stats.put("avgDurationSeconds", (long) avgDuration);
            stats.put("avgDurationMinutes", (long) (avgDuration / 60));
        } else {
            stats.put("avgDurationSeconds", 0L);
            stats.put("avgDurationMinutes", 0L);
        }

        // 6. 任务完成率
        Long totalAssigned = todoCount + doneCount;
        if (totalAssigned > 0) {
            double completionRate = (doneCount.doubleValue() / totalAssigned) * 100;
            stats.put("completionRate", String.format("%.2f%%", completionRate));
        } else {
            stats.put("completionRate", "0.00%");
        }

        // 7. 我发起的流程数
        Long myInstanceCount = processInstanceMapper.selectCount(
            new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStartUserId, userId));
        stats.put("myInstanceCount", myInstanceCount != null ? myInstanceCount : 0);

        log.info("[getTaskStatistics] 统计完成, userId={}, 待办={}, 已办={}", userId, todoCount, doneCount);
        return stats;
    }

    @Override
    public Map<String, Object> getTaskGroups(Long userId) {
        log.info("[getTaskGroups] 查询任务分组, userId={}", userId);

        if (userId == null) {
            userId = UserContext.getUserId();
        }

        Map<String, Object> groups = new HashMap<>();

        List<WfTask> tasks = taskMapper.selectList(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
        );
        groups.put("total", tasks.size());

        if (tasks.isEmpty()) {
            groups.put("byProcessType", new HashMap<>());
            groups.put("byStatus", new HashMap<>());
            groups.put("byPriority", new HashMap<>());
            return groups;
        }

        // 1. 按流程类型分组
        List<String> instanceIds = tasks.stream().map(WfTask::getInstanceId).distinct().collect(Collectors.toList());
        List<WfProcessInstance> instances = processInstanceMapper.selectBatchIds(instanceIds);
        Map<String, String> instanceDefKeyMap = instances.stream()
            .collect(Collectors.toMap(WfProcessInstance::getInstanceId, WfProcessInstance::getProcessDefKey));

        Map<String, Long> byProcessType = new HashMap<>();
        for (WfTask task : tasks) {
            String defKey = instanceDefKeyMap.getOrDefault(task.getInstanceId(), "unknown");
            byProcessType.merge(defKey, 1L, Long::sum);
        }
        groups.put("byProcessType", byProcessType);

        // 2. 按任务状态分组
        Map<String, Long> byStatus = tasks.stream()
            .collect(Collectors.groupingBy(
                task -> task.getStatus() != null ? task.getStatus() : "UNKNOWN", Collectors.counting()));
        groups.put("byStatus", byStatus);

        // 3. 按优先级分组
        Map<String, Long> byPriority = tasks.stream()
            .collect(Collectors.groupingBy(
                task -> {
                    String priority = task.getPriority();
                    return (priority == null || priority.isEmpty()) ? "NORMAL" : priority;
                }, Collectors.counting()));
        groups.put("byPriority", byPriority);

        // 4. 管理员视角：按处理人分组
        if (permissionService.isAdmin(userId)) {
            List<WfTask> allTasks = taskMapper.selectList(
                new LambdaQueryWrapper<WfTask>().eq(WfTask::getStatus, WfTaskStatus.TODO.getCode()));
            Map<Long, Long> byAssignee = allTasks.stream()
                .collect(Collectors.groupingBy(WfTask::getAssignee, Collectors.counting()));
            List<Map<String, Object>> assigneeGroups = new ArrayList<>();
            for (Map.Entry<Long, Long> entry : byAssignee.entrySet()) {
                Map<String, Object> assigneeGroup = new HashMap<>();
                assigneeGroup.put("userId", entry.getKey());
                assigneeGroup.put("taskCount", entry.getValue());
                SysUser user = sysUserMapper.selectById(entry.getKey());
                if (user != null) {
                    assigneeGroup.put("userName", user.getNickName() != null ? user.getNickName() : user.getUserName());
                }
                assigneeGroups.add(assigneeGroup);
            }
            groups.put("byAssignee", assigneeGroups);
        }

        log.info("[getTaskGroups] 分组完成, userId={}, total={}", userId, tasks.size());
        return groups;
    }

    @Override
    public Map<String, Integer> getTasksCount(Long userId) {
        Map<String, Integer> counts = new HashMap<>();

        Long todoCount = taskMapper.selectCount(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
        );
        counts.put("todoCount", todoCount != null ? todoCount.intValue() : 0);

        Long doneCount = taskHistoryMapper.selectCount(
            new LambdaQueryWrapper<WfTaskHistory>().eq(WfTaskHistory::getOperatorId, userId));
        counts.put("doneCount", doneCount != null ? doneCount.intValue() : 0);

        Long myInstanceCount = processInstanceMapper.selectCount(
            new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStartUserId, userId));
        counts.put("myInstanceCount", myInstanceCount != null ? myInstanceCount.intValue() : 0);

        return counts;
    }
}
