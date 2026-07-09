package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.vo.DynamicMapVO;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.service.ITaskStatisticsService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.common.audit.annotation.Audit;
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
 * 从原工作流服务拆分出来，专注于统计和分组功能
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
    public DynamicMapVO getTaskStatistics(Long userId, LocalDateTime startTime, LocalDateTime endTime) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new IllegalStateException("用户未登录");
        }
        return buildTaskStatistics(currentUserId, startTime, endTime, false);
    }

    @Override
    public DynamicMapVO getAdminTaskStatistics(Long userId, LocalDateTime startTime, LocalDateTime endTime) {
        Long currentUserId = UserContext.getUserId();
        if (!permissionService.isAdmin(currentUserId)) {
            throw new SecurityException("无权查看管理员任务统计");
        }
        Long targetUserId = userId != null ? userId : currentUserId;
        return buildTaskStatistics(targetUserId, startTime, endTime, true);
    }

    private DynamicMapVO buildTaskStatistics(Long userId, LocalDateTime startTime, LocalDateTime endTime, boolean adminView) {
        log.info("[getTaskStatistics] 查询任务统计, userId={}, startTime={}, endTime={}", userId, startTime, endTime);

        Map<String, Object> stats = new HashMap<>();
        Long currentTenantId = UserContext.getTenantId();

        // 1. 按时间段统计
        Map<String, Object> timePeriodStats = new HashMap<>();

        LocalDateTime todayStart = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0);
        LambdaQueryWrapper<WfTask> todayTodoQuery = new LambdaQueryWrapper<WfTask>()
            .eq(WfTask::getAssignee, userId)
            .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
            .ge(WfTask::getCreateTime, java.sql.Timestamp.valueOf(todayStart));
        if (currentTenantId != null) {
            todayTodoQuery.eq(WfTask::getTenantId, currentTenantId);
        }
        Long todayTodoCount = taskMapper.selectCount(todayTodoQuery);
        timePeriodStats.put("todayTodo", todayTodoCount != null ? todayTodoCount : 0);

        LocalDateTime weekStart = LocalDateTime.now().with(DayOfWeek.MONDAY).withHour(0).withMinute(0).withSecond(0);
        LambdaQueryWrapper<WfTask> weekTodoQuery = new LambdaQueryWrapper<WfTask>()
            .eq(WfTask::getAssignee, userId)
            .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
            .ge(WfTask::getCreateTime, java.sql.Timestamp.valueOf(weekStart));
        if (currentTenantId != null) {
            weekTodoQuery.eq(WfTask::getTenantId, currentTenantId);
        }
        Long weekTodoCount = taskMapper.selectCount(weekTodoQuery);
        timePeriodStats.put("weekTodo", weekTodoCount != null ? weekTodoCount : 0);

        LocalDateTime monthStart = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0);
        LambdaQueryWrapper<WfTask> monthTodoQuery = new LambdaQueryWrapper<WfTask>()
            .eq(WfTask::getAssignee, userId)
            .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
            .ge(WfTask::getCreateTime, java.sql.Timestamp.valueOf(monthStart));
        if (currentTenantId != null) {
            monthTodoQuery.eq(WfTask::getTenantId, currentTenantId);
        }
        Long monthTodoCount = taskMapper.selectCount(monthTodoQuery);
        timePeriodStats.put("monthTodo", monthTodoCount != null ? monthTodoCount : 0);
        stats.put("timePeriod", timePeriodStats);

        // 2. 按任务状态统计
        Map<String, Object> statusStats = new HashMap<>();

        LambdaQueryWrapper<WfTask> todoCountQuery = new LambdaQueryWrapper<WfTask>()
            .eq(WfTask::getAssignee, userId)
            .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode());
        if (currentTenantId != null) {
            todoCountQuery.eq(WfTask::getTenantId, currentTenantId);
        }
        Long todoCount = taskMapper.selectCount(todoCountQuery);
        statusStats.put("todo", todoCount != null ? todoCount : 0);

        LambdaQueryWrapper<WfTaskHistory> doneWrapper = new LambdaQueryWrapper<WfTaskHistory>()
            .eq(WfTaskHistory::getOperatorId, userId);
        if (currentTenantId != null) {
            doneWrapper.eq(WfTaskHistory::getTenantId, currentTenantId);
        }
        if (startTime != null) {
            doneWrapper.ge(WfTaskHistory::getCreateTime, java.sql.Timestamp.valueOf(startTime));
        }
        if (endTime != null) {
            doneWrapper.le(WfTaskHistory::getCreateTime, java.sql.Timestamp.valueOf(endTime));
        }
        Long doneCount = taskHistoryMapper.selectCount(doneWrapper);
        statusStats.put("done", doneCount != null ? doneCount : 0);

        LambdaQueryWrapper<WfTask> timeoutQuery = new LambdaQueryWrapper<WfTask>()
            .eq(WfTask::getAssignee, userId)
            .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
            .eq(WfTask::getIsTimeout, 1);
        if (currentTenantId != null) {
            timeoutQuery.eq(WfTask::getTenantId, currentTenantId);
        }
        Long timeoutCount = taskMapper.selectCount(timeoutQuery);
        statusStats.put("timeout", timeoutCount != null ? timeoutCount : 0);
        stats.put("status", statusStats);

        // 3. 按流程类型统计
        LambdaQueryWrapper<WfTask> userTasksQuery = new LambdaQueryWrapper<WfTask>()
            .eq(WfTask::getAssignee, userId)
            .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode());
        if (currentTenantId != null) {
            userTasksQuery.eq(WfTask::getTenantId, currentTenantId);
        }
        List<WfTask> userTasks = taskMapper.selectList(userTasksQuery);

        Map<String, Long> processTypeStats = new HashMap<>();
        if (!userTasks.isEmpty()) {
            List<String> instanceIds = userTasks.stream()
                .map(WfTask::getInstanceId).distinct().collect(Collectors.toList());
            List<WfProcessInstance> instances = processInstanceMapper.selectBatchIds(instanceIds).stream()
                .filter(inst -> currentTenantId == null || Objects.equals(currentTenantId, inst.getTenantId()))
                .collect(Collectors.toList());
            Map<String, String> instanceDefKeyMap = instances.stream()
                .collect(Collectors.toMap(WfProcessInstance::getInstanceId, WfProcessInstance::getProcessDefKey));
            for (WfTask task : userTasks) {
                String defKey = instanceDefKeyMap.getOrDefault(task.getInstanceId(), "unknown");
                processTypeStats.merge(defKey, 1L, Long::sum);
            }
        }
        stats.put("processType", processTypeStats);

        // 4. 按处理人统计（管理员视角）
        if (adminView) {
            List<Map<String, Object>> assigneeStats = new ArrayList<>();
            LambdaQueryWrapper<WfTask> allTasksQuery = new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode());
            if (currentTenantId != null) {
                allTasksQuery.eq(WfTask::getTenantId, currentTenantId);
            }
            List<WfTask> allTasks = taskMapper.selectList(allTasksQuery);
            Map<Long, Long> assigneeCountMap = allTasks.stream()
                .filter(task -> task.getAssignee() != null)
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
        LambdaQueryWrapper<WfTaskHistory> historiesQuery = new LambdaQueryWrapper<WfTaskHistory>()
            .eq(WfTaskHistory::getOperatorId, userId)
            .isNotNull(WfTaskHistory::getDurationSeconds);
        if (currentTenantId != null) {
            historiesQuery.eq(WfTaskHistory::getTenantId, currentTenantId);
        }
        List<WfTaskHistory> histories = taskHistoryMapper.selectList(historiesQuery);
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
        LambdaQueryWrapper<WfProcessInstance> myInstanceQuery = new LambdaQueryWrapper<WfProcessInstance>()
            .eq(WfProcessInstance::getStartUserId, userId);
        if (currentTenantId != null) {
            myInstanceQuery.eq(WfProcessInstance::getTenantId, currentTenantId);
        }
        Long myInstanceCount = processInstanceMapper.selectCount(myInstanceQuery);
        stats.put("myInstanceCount", myInstanceCount != null ? myInstanceCount : 0);

        log.info("[getTaskStatistics] 统计完成, userId={}, 待办={}, 已办={}", userId, todoCount, doneCount);
        return DynamicMapVO.from(stats);
    }

    @Override
    public DynamicMapVO getTaskGroups(Long userId) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new IllegalStateException("用户未登录");
        }
        return buildTaskGroups(currentUserId, false);
    }

    @Override
    public DynamicMapVO getAdminTaskGroups(Long userId) {
        Long currentUserId = UserContext.getUserId();
        if (!permissionService.isAdmin(currentUserId)) {
            throw new SecurityException("无权查看管理员任务分组");
        }
        return buildTaskGroups(userId != null ? userId : currentUserId, true);
    }

    private DynamicMapVO buildTaskGroups(Long userId, boolean adminView) {
        log.info("[getTaskGroups] 查询任务分组, userId={}, adminView={}", userId, adminView);

        Long currentTenantId = UserContext.getTenantId();

        Map<String, Object> groups = new HashMap<>();

        LambdaQueryWrapper<WfTask> tasksQuery = new LambdaQueryWrapper<WfTask>()
            .eq(WfTask::getAssignee, userId)
            .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode());
        if (currentTenantId != null) {
            tasksQuery.eq(WfTask::getTenantId, currentTenantId);
        }
        List<WfTask> tasks = taskMapper.selectList(tasksQuery);
        groups.put("total", tasks.size());

        if (tasks.isEmpty()) {
            groups.put("byProcessType", new HashMap<>());
            groups.put("byStatus", new HashMap<>());
            groups.put("byPriority", new HashMap<>());
            return DynamicMapVO.from(groups);
        }

        // 1. 按流程类型分组
        List<String> instanceIds = tasks.stream().map(WfTask::getInstanceId).distinct().collect(Collectors.toList());
        List<WfProcessInstance> instances = processInstanceMapper.selectBatchIds(instanceIds).stream()
            .filter(inst -> currentTenantId == null || Objects.equals(currentTenantId, inst.getTenantId()))
            .collect(Collectors.toList());
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
        if (adminView) {
            LambdaQueryWrapper<WfTask> allTasksQuery = new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode());
            if (currentTenantId != null) {
                allTasksQuery.eq(WfTask::getTenantId, currentTenantId);
            }
            List<WfTask> allTasks = taskMapper.selectList(allTasksQuery);
            Map<Long, Long> byAssignee = allTasks.stream()
                .filter(task -> task.getAssignee() != null)
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
        return DynamicMapVO.from(groups);
    }

    @Override
    public Map<String, Integer> getTasksCount(Long userId) {
        Map<String, Integer> counts = new HashMap<>();
        Long currentTenantId = UserContext.getTenantId();

        LambdaQueryWrapper<WfTask> todoCountQuery = new LambdaQueryWrapper<WfTask>()
            .eq(WfTask::getAssignee, userId)
            .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode());
        if (currentTenantId != null) {
            todoCountQuery.eq(WfTask::getTenantId, currentTenantId);
        }
        Long todoCount = taskMapper.selectCount(todoCountQuery);
        int pending = todoCount != null ? todoCount.intValue() : 0;
        counts.put("pending", pending);
        counts.put("todoCount", pending);

        LambdaQueryWrapper<WfTaskHistory> doneCountQuery = new LambdaQueryWrapper<WfTaskHistory>()
            .eq(WfTaskHistory::getOperatorId, userId);
        if (currentTenantId != null) {
            doneCountQuery.eq(WfTaskHistory::getTenantId, currentTenantId);
        }
        Long doneCount = taskHistoryMapper.selectCount(doneCountQuery);
        int completed = doneCount != null ? doneCount.intValue() : 0;
        counts.put("completed", completed);
        counts.put("doneCount", completed);

        LambdaQueryWrapper<WfProcessInstance> myInstanceQuery = new LambdaQueryWrapper<WfProcessInstance>()
            .eq(WfProcessInstance::getStartUserId, userId);
        if (currentTenantId != null) {
            myInstanceQuery.eq(WfProcessInstance::getTenantId, currentTenantId);
        }
        Long myInstanceCount = processInstanceMapper.selectCount(myInstanceQuery);
        int myApplications = myInstanceCount != null ? myInstanceCount.intValue() : 0;
        counts.put("myApplications", myApplications);
        counts.put("myInstanceCount", myApplications);

        return counts;
    }
}
