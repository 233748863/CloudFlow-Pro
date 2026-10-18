package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfGatewayActivationMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowProcessStateService {
    private final WfProcessInstanceMapper instanceMapper;
    private final ProcessMonitorMapper monitorMapper;
    private final TimerSchedulerService timerScheduler;
    private final WfGatewayActivationMapper gatewayMapper;
    private final WorkflowTerminalTaskService terminalTasks;
    private final WorkflowMeetingLifecyclePublisher meetingLifecycle;
    private final WorkflowSettlementLifecyclePublisher settlementLifecycle;

    @Transactional(rollbackFor = Exception.class)
    public void transition(WfProcessInstance instance, WfProcessStatus target) {
        WfProcessStatus previous = WfProcessStatus.fromCode(instance.getStatus());
        if (!previous.canTransitionTo(target)) {
            log.warn("拒绝非法流程状态转移, instanceId={}, from={}, to={}", instance.getInstanceId(), previous, target);
            throw WorkflowException.invalidState("流程状态不允许从" + previous.getDesc() + "变为" + target.getDesc());
        }
        if (target.isTerminal()) terminalTasks.finish(instance, target);
        instance.setStatus(target.getCode());
        LocalDateTime endTime = target.isTerminal() ? LocalDateTime.now() : null;
        instance.setEndTime(endTime);
        if (target.isTerminal()) WorkflowWaitState.clear(instance);
        if (instanceMapper.updateById(instance) <= 0) {
            throw WorkflowException.invalidState("流程状态已被其他操作变更，请刷新后重试");
        }
        Long duration = endTime != null && instance.getStartTime() != null
                ? Duration.between(instance.getStartTime(), endTime).toMillis() : null;
        monitorMapper.update(null, new LambdaUpdateWrapper<ProcessMonitor>()
                .eq(ProcessMonitor::getInstanceId, instance.getInstanceId())
                .eq(ProcessMonitor::getTenantId, instance.getTenantId())
                .set(ProcessMonitor::getStatus, target.getCode())
                .set(ProcessMonitor::getEndTime, endTime)
                .set(ProcessMonitor::getDuration, duration)
                .set(ProcessMonitor::getUpdateTime, LocalDateTime.now()));
        if (target.isTerminal()) {
            gatewayMapper.markCancelled(instance.getTenantId(), instance.getInstanceId());
            timerScheduler.cancelAfterCommit(instance.getInstanceId());
            meetingLifecycle.terminal(instance, target);
            settlementLifecycle.terminal(instance, target);
        }
    }
}
