package com.cloudflow.workflow.event;

/**
 * 任务分配事件
 * 当审批任务被创建并分配给处理人时发布。
 * 外部模块可监听此事件实现自定义通知、待办提醒等。
 */
public class TaskAssignedEvent extends TaskEvent {

    /** 任务处理人ID */
    private final Long assigneeId;

    /** 任务处理人姓名 */
    private final String assigneeName;

    public TaskAssignedEvent(Object source, String instanceId, String processDefKey,
                              String taskId, String nodeKey, String nodeName,
                              Long assigneeId, String assigneeName) {
        super(source, instanceId, processDefKey, taskId, nodeKey, nodeName);
        this.assigneeId = assigneeId;
        this.assigneeName = assigneeName;
    }

    public Long getAssigneeId() {
        return assigneeId;
    }

    public String getAssigneeName() {
        return assigneeName;
    }
}
