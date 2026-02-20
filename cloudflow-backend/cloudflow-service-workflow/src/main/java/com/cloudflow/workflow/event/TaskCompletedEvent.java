package com.cloudflow.workflow.event;

/**
 * 任务完成事件
 * 当审批人完成任务（同意、拒绝、转办等操作）时发布。
 */
public class TaskCompletedEvent extends TaskEvent {

    /** 操作人ID */
    private final Long operatorId;

    /** 操作人姓名 */
    private final String operatorName;

    /** 操作类型（APPROVE / REJECT / DELEGATE / RETURN 等） */
    private final String action;

    /** 审批意见 */
    private final String comment;

    public TaskCompletedEvent(Object source, String instanceId, String processDefKey,
                               String taskId, String nodeKey, String nodeName,
                               Long operatorId, String operatorName,
                               String action, String comment) {
        super(source, instanceId, processDefKey, taskId, nodeKey, nodeName);
        this.operatorId = operatorId;
        this.operatorName = operatorName;
        this.action = action;
        this.comment = comment;
    }

    public Long getOperatorId() {
        return operatorId;
    }

    public String getOperatorName() {
        return operatorName;
    }

    public String getAction() {
        return action;
    }

    public String getComment() {
        return comment;
    }
}
