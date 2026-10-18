package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.tenant.TenantContext;
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
import java.util.Objects;

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
        Long tenantId = Objects.requireNonNull(TenantContext.getTenantId(), "候选人退出处理缺少租户上下文");

        List<WfTaskCandidate> pendingCandidates = taskCandidateMapper.selectList(new LambdaQueryWrapper<WfTaskCandidate>()
                .eq(WfTaskCandidate::getTenantId, tenantId).eq(WfTaskCandidate::getUserId, userId)
                .eq(WfTaskCandidate::getStatus, "PENDING").orderByAsc(WfTaskCandidate::getTaskId));
        if (pendingCandidates.isEmpty()) {
            return;
        }

        Set<String> affectedTaskIds = new LinkedHashSet<>();
        for (WfTaskCandidate candidate : pendingCandidates) {
            affectedTaskIds.add(candidate.getTaskId());
        }

        int updated = 0;
        int noAssigneeAlerts = 0;
        for (String taskId : affectedTaskIds) {
            WfTask task = taskId == null ? null : taskMapper.selectForUpdate(tenantId, taskId);
            updated += taskCandidateMapper.cancelPendingForUser(tenantId, taskId, userId);
            if (task == null || !WfTaskStatus.TODO.getCode().equals(task.getStatus()) || task.getAssignee() != null) {
                continue;
            }
            if (!taskCandidateMapper.selectPendingForTaskForUpdate(tenantId, taskId).isEmpty()) continue;

            anomalyDetectionService.detectNoAssignee(task.getTaskId(), task.getInstanceId(), task.getNodeKey());
            noAssigneeAlerts++;
        }

        log.warn("workflow offboard candidate cleanup completed, eventId={}, userId={}, cancelledCandidates={}, affectedTasks={}, noAssigneeAlerts={}",
                sourceEventId, userId, updated, affectedTaskIds.size(), noAssigneeAlerts);
    }
}
