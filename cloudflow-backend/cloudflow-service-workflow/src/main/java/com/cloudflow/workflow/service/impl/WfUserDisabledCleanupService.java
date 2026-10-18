package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.WfTaskCandidateMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.monitor.IAnomalyDetectionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class WfUserDisabledCleanupService {

    private final WfTaskMapper taskMapper;
    private final WfTaskCandidateMapper taskCandidateMapper;
    private final TaskMonitorMapper taskMonitorMapper;
    private final IAnomalyDetectionService anomalyDetectionService;
    private final WfCandidateOffboardService candidateOffboardService;

    @Audit(name = "停用用户释放工作流待办", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void cleanupDisabledUserTasks(Long userId, String sourceEventId) {
        if (userId == null) {
            return;
        }
        Long tenantId = Objects.requireNonNull(TenantContext.getTenantId(), "停用用户待办处理缺少租户上下文");
        if (sourceEventId == null || sourceEventId.isBlank()) throw new IllegalArgumentException("停用用户待办处理缺少来源事件");

        candidateOffboardService.deactivatePendingCandidatesForEmployeeLeft(userId, sourceEventId);

        List<WfTask> todoTasks = taskMapper.selectList(new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getTenantId, tenantId).eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode()).orderByAsc(WfTask::getTaskId));
        int releasedTasks = 0;
        int noAssigneeAlerts = 0;
        LocalDateTime now = LocalDateTime.now();

        for (WfTask observed : todoTasks) {
            WfTask task = taskMapper.selectForUpdate(tenantId, observed.getTaskId());
            if (task == null || !WfTaskStatus.TODO.getCode().equals(task.getStatus()) || !Objects.equals(userId, task.getAssignee())) continue;
            int nextVersion = task.getVersion() == null ? 1 : Math.addExact(task.getVersion(), 1);
            int released = taskMapper.update(null, new LambdaUpdateWrapper<WfTask>()
                    .eq(WfTask::getTenantId, tenantId).eq(WfTask::getTaskId, task.getTaskId())
                    .eq(WfTask::getAssignee, userId).eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
                    .set(WfTask::getDisabledFromUserId, userId).set(WfTask::getDisabledFromUserName, task.getAssigneeName())
                    .set(WfTask::getDisabledReleaseVersion, nextVersion).set(WfTask::getDisabledReleaseEventId, sourceEventId)
                    .set(WfTask::getAssignee, null).set(WfTask::getAssigneeName, null).set(WfTask::getVersion, nextVersion));
            if (released != 1) throw new IllegalStateException("停用用户待办已变更，请重试");
            releasedTasks++;

            TaskMonitor monitor = taskMonitorMapper.selectOne(new LambdaQueryWrapper<TaskMonitor>()
                    .eq(TaskMonitor::getTenantId, tenantId).eq(TaskMonitor::getTaskId, task.getTaskId()));
            if (monitor != null) {
                int version = Objects.requireNonNull(monitor.getVersion(), "任务监控缺少版本号");
                int changed = taskMonitorMapper.update(null, new LambdaUpdateWrapper<TaskMonitor>()
                        .eq(TaskMonitor::getTenantId, tenantId).eq(TaskMonitor::getId, monitor.getId()).eq(TaskMonitor::getVersion, version)
                        .set(TaskMonitor::getAssigneeId, null).set(TaskMonitor::getAssigneeName, null).set(TaskMonitor::getAction, "DISABLE")
                        .set(TaskMonitor::getUpdateTime, now).set(TaskMonitor::getVersion, Math.addExact(version, 1)));
                if (changed != 1) throw new IllegalStateException("停用用户任务监控已变更，请重试");
            }

            if (taskCandidateMapper.selectPendingForTaskForUpdate(tenantId, task.getTaskId()).isEmpty()) {
                anomalyDetectionService.detectNoAssignee(task.getTaskId(), task.getInstanceId(), task.getNodeKey());
                noAssigneeAlerts++;
            }
        }

        log.warn("workflow disabled-user cleanup completed, eventId={}, userId={}, releasedTasks={}, noAssigneeAlerts={}",
                sourceEventId, userId, releasedTasks, noAssigneeAlerts);
    }
}
