package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskCandidate;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.mapper.WfTaskCandidateMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.monitor.IAnomalyDetectionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class WfCandidateOffboardService {

    private final WfTaskCandidateMapper taskCandidateMapper;
    private final WfTaskMapper taskMapper;
    private final IAnomalyDetectionService anomalyDetectionService;

    @Transactional(rollbackFor = Exception.class)
    public void deactivatePendingCandidatesForEmployeeLeft(Long userId, String sourceEventId) {
        if (userId == null) {
            return;
        }

        List<WfTaskCandidate> pendingCandidates = taskCandidateMapper.selectList(new LambdaQueryWrapper<WfTaskCandidate>()
                .eq(WfTaskCandidate::getUserId, userId)
                .eq(WfTaskCandidate::getStatus, "PENDING"));
        if (pendingCandidates.isEmpty()) {
            return;
        }

        Set<String> affectedTaskIds = new LinkedHashSet<>();
        for (WfTaskCandidate candidate : pendingCandidates) {
            affectedTaskIds.add(candidate.getTaskId());
        }

        int updated = taskCandidateMapper.update(null, new LambdaUpdateWrapper<WfTaskCandidate>()
                .eq(WfTaskCandidate::getUserId, userId)
                .eq(WfTaskCandidate::getStatus, "PENDING")
                .set(WfTaskCandidate::getStatus, "CANCELLED"));

        int noAssigneeAlerts = 0;
        for (String taskId : affectedTaskIds) {
            long remaining = taskCandidateMapper.selectCount(new LambdaQueryWrapper<WfTaskCandidate>()
                    .eq(WfTaskCandidate::getTaskId, taskId)
                    .eq(WfTaskCandidate::getStatus, "PENDING"));
            if (remaining > 0) {
                continue;
            }

            WfTask task = taskMapper.selectById(taskId);
            if (task == null || !WfTaskStatus.TODO.getCode().equals(task.getStatus()) || task.getAssignee() != null) {
                continue;
            }

            anomalyDetectionService.detectNoAssignee(task.getTaskId(), task.getInstanceId(), task.getNodeKey());
            noAssigneeAlerts++;
        }

        log.warn("workflow offboard candidate cleanup completed, eventId={}, userId={}, cancelledCandidates={}, affectedTasks={}, noAssigneeAlerts={}",
                sourceEventId, userId, updated, affectedTaskIds.size(), noAssigneeAlerts);
    }
}
