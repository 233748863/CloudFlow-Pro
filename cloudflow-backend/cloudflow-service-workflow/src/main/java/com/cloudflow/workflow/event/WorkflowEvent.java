package com.cloudflow.workflow.event;

import org.springframework.context.ApplicationEvent;

import java.time.LocalDateTime;

/**
 * 工作流事件基类
 * 借鉴 poco-flow FlowProcessEventListener 的设计思路，
 * 使用 Spring ApplicationEvent 机制替代 Flowable 的全局事件监听器，
 * 实现流程生命周期事件的发布与解耦处理。
 *
 * 支持的事件类型：
 * - PROCESS_STARTED: 流程启动
 * - PROCESS_COMPLETED: 流程完成
 * - PROCESS_REJECTED: 流程拒绝
 * - PROCESS_REVOKED: 流程撤回
 * - NODE_STARTED: 节点开始执行
 * - NODE_COMPLETED: 节点执行完成
 * - TASK_ASSIGNED: 任务分配给用户
 * - TASK_COMPLETED: 任务完成（含审批意见）
 * - VARIABLE_UPDATED: 流程变量变更
 */
public class WorkflowEvent extends ApplicationEvent {

    /** 事件类型枚举 */
    public enum EventType {
        PROCESS_STARTED,
        PROCESS_COMPLETED,
        PROCESS_REJECTED,
        PROCESS_REVOKED,
        NODE_STARTED,
        NODE_COMPLETED,
        TASK_ASSIGNED,
        TASK_COMPLETED,
        VARIABLE_UPDATED
    }

    /** 事件类型 */
    private final EventType eventType;

    /** 流程实例ID */
    private final String instanceId;

    /** 流程定义Key */
    private final String processDefKey;

    /** 节点Key（节点级事件使用） */
    private final String nodeKey;

    /** 节点名称 */
    private final String nodeName;

    /** 节点类型（如 APPROVAL、NOTIFICATION、SCRIPT 等） */
    private final String nodeType;

    /** 任务ID（任务级事件使用） */
    private final String taskId;

    /** 操作人ID */
    private final Long operatorId;

    /** 操作人姓名 */
    private final String operatorName;

    /** 操作动作（如 APPROVE、REJECT、DELEGATE） */
    private final String action;

    /** 审批意见 */
    private final String comment;

    /** 事件发生时间 */
    private final LocalDateTime eventTime;

    /** 附加数据（JSON 格式，用于携带变量变更等扩展信息） */
    private final String extraData;

    private WorkflowEvent(Object source, EventType eventType, String instanceId, String processDefKey,
                           String nodeKey, String nodeName, String nodeType, String taskId,
                           Long operatorId, String operatorName, String action, String comment,
                           String extraData) {
        super(source);
        this.eventType = eventType;
        this.instanceId = instanceId;
        this.processDefKey = processDefKey;
        this.nodeKey = nodeKey;
        this.nodeName = nodeName;
        this.nodeType = nodeType;
        this.taskId = taskId;
        this.operatorId = operatorId;
        this.operatorName = operatorName;
        this.action = action;
        this.comment = comment;
        this.eventTime = LocalDateTime.now();
        this.extraData = extraData;
    }

    // ========== Getter 方法 ==========

    public EventType getEventType() { return eventType; }
    public String getInstanceId() { return instanceId; }
    public String getProcessDefKey() { return processDefKey; }
    public String getNodeKey() { return nodeKey; }
    public String getNodeName() { return nodeName; }
    public String getNodeType() { return nodeType; }
    public String getTaskId() { return taskId; }
    public Long getOperatorId() { return operatorId; }
    public String getOperatorName() { return operatorName; }
    public String getAction() { return action; }
    public String getComment() { return comment; }
    public LocalDateTime getEventTime() { return eventTime; }
    public String getExtraData() { return extraData; }

    @Override
    public String toString() {
        return "WorkflowEvent{" +
                "eventType=" + eventType +
                ", instanceId='" + instanceId + '\'' +
                ", nodeKey='" + nodeKey + '\'' +
                ", taskId='" + taskId + '\'' +
                ", operatorId=" + operatorId +
                ", eventTime=" + eventTime +
                '}';
    }

    // ========== Builder 模式，方便构建不同类型的事件 ==========

    public static Builder builder(Object source, EventType eventType) {
        return new Builder(source, eventType);
    }

    public static class Builder {
        private final Object source;
        private final EventType eventType;
        private String instanceId;
        private String processDefKey;
        private String nodeKey;
        private String nodeName;
        private String nodeType;
        private String taskId;
        private Long operatorId;
        private String operatorName;
        private String action;
        private String comment;
        private String extraData;

        private Builder(Object source, EventType eventType) {
            this.source = source;
            this.eventType = eventType;
        }

        public Builder instanceId(String instanceId) { this.instanceId = instanceId; return this; }
        public Builder processDefKey(String processDefKey) { this.processDefKey = processDefKey; return this; }
        public Builder nodeKey(String nodeKey) { this.nodeKey = nodeKey; return this; }
        public Builder nodeName(String nodeName) { this.nodeName = nodeName; return this; }
        public Builder nodeType(String nodeType) { this.nodeType = nodeType; return this; }
        public Builder taskId(String taskId) { this.taskId = taskId; return this; }
        public Builder operatorId(Long operatorId) { this.operatorId = operatorId; return this; }
        public Builder operatorName(String operatorName) { this.operatorName = operatorName; return this; }
        public Builder action(String action) { this.action = action; return this; }
        public Builder comment(String comment) { this.comment = comment; return this; }
        public Builder extraData(String extraData) { this.extraData = extraData; return this; }

        public WorkflowEvent build() {
            return new WorkflowEvent(source, eventType, instanceId, processDefKey,
                    nodeKey, nodeName, nodeType, taskId,
                    operatorId, operatorName, action, comment, extraData);
        }
    }
}
