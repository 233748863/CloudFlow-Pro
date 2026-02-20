package com.cloudflow.workflow.event;

import org.springframework.context.ApplicationEvent;

import java.time.LocalDateTime;

/**
 * 工作流事件抽象基类
 *
 * P2-8 架构优化：将原来的单一 WorkflowEvent 拆分为独立事件类层次结构。
 * 参考 RuoYi-Cloud-Plus FlowProcessEventHandler 的设计思路：
 * - 每种事件类型对应一个独立的事件类
 * - 外部模块（如 OA）可以通过 @EventListener 直接按类型监听，无需 SpEL condition
 * - 事件发布失败不影响主流程
 *
 * 事件层次结构：
 * BaseWorkflowEvent
 * ├── ProcessEvent（流程级事件基类）
 * │   ├── ProcessStartedEvent
 * │   ├── ProcessCompletedEvent
 * │   ├── ProcessRejectedEvent
 * │   ├── ProcessRevokedEvent
 * │   └── ProcessInvalidatedEvent
 * ├── TaskEvent（任务级事件基类）
 * │   ├── TaskAssignedEvent
 * │   └── TaskCompletedEvent
 * └── NodeEvent（节点级事件基类）
 *     ├── NodeStartedEvent
 *     └── NodeCompletedEvent
 */
public abstract class BaseWorkflowEvent extends ApplicationEvent {

    /** 流程实例ID */
    private final String instanceId;

    /** 流程定义Key（如 wf_leave、wf_reimburse） */
    private final String processDefKey;

    /** 事件发生时间 */
    private final LocalDateTime eventTime;

    protected BaseWorkflowEvent(Object source, String instanceId, String processDefKey) {
        super(source);
        this.instanceId = instanceId;
        this.processDefKey = processDefKey;
        this.eventTime = LocalDateTime.now();
    }

    public String getInstanceId() {
        return instanceId;
    }

    public String getProcessDefKey() {
        return processDefKey;
    }

    public LocalDateTime getEventTime() {
        return eventTime;
    }

    @Override
    public String toString() {
        return getClass().getSimpleName() + "{" +
                "instanceId='" + instanceId + '\'' +
                ", processDefKey='" + processDefKey + '\'' +
                ", eventTime=" + eventTime +
                '}';
    }
}
