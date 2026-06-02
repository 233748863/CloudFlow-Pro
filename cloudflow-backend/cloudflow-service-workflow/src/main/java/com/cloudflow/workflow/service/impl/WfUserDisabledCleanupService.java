package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskCandidate;
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

@Slf4j
@Service
@RequiredArgsConstructor
public class WfUserDisabledCleanupService {

    private final WfTaskMapper taskMapper;
    private final WfTaskCandidateMapper taskCandidateMapper;
    private final TaskMonitorMapper taskMonitorMapper;
    private final IAnomalyDetectionService anomalyDetectionService;
    private final WfCandidateOffboardService candidateOffboardService;

    @Transactional(rollbackFor = Exception.class)
    public void cleanupDisabledUserTasks(Long userId, String sourceEventId) {
        if (userId == null) {
            return;
        }

        candidateOffboardService.deactivatePendingCandidatesForEmployeeLeft(userId, sourceEventId);

        List<WfTask> todoTasks = taskMapper.selectList(new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode()));
        int releasedTasks = 0;
        int noAssigneeAlerts = 0;
        LocalDateTime now = LocalDateTime.now();

        for (WfTask task : todoTasks) {
            task.setAssignee(null);
            task.setAssigneeName(null);
            taskMapper.updateById(task);
            releasedTasks++;

            TaskMonitor monitor = taskMonitorMapper.selectByTaskId(task.getTaskId());
            if (monitor != null) {
                monitor.setAssigneeId(null);
                monitor.setAssigneeName(null);
                monitor.setAction("DISABLE");
                monitor.setUpdateTime(now);
                taskMonitorMapper.updateById(monitor);
            }

            long remainingCandidates = taskCandidateMapper.selectCount(new LambdaQueryWrapper<WfTaskCandidate>()
                    .eq(WfTaskCandidate::getTaskId, task.getTaskId())
                    .eq(WfTaskCandidate::getStatus, "PENDING"));
            if (remainingCandidates == 0) {
                anomalyDetectionService.detectNoAssignee(task.getTaskId(), task.getInstanceId(), task.getNodeKey());
                noAssigneeAlerts++;
            }
        }

        log.warn("workflow disabled-user cleanup completed, eventId={}, userId={}, releasedTasks={}, noAssigneeAlerts={}",
                sourceEventId, userId, releasedTasks, noAssigneeAlerts);
    }
}
