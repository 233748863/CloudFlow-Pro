package com.cloudflow.workflow.event;

/**
 * 流程作废事件
 * 管理员作废运行中或暂停中的流程时发布。
 */
public class ProcessInvalidatedEvent extends ProcessEvent {

    /** 作废原因 */
    private final String reason;

    /** 被删除的待办任务数量 */
    private final int deletedTasks;

    public ProcessInvalidatedEvent(Object source, String instanceId, String processDefKey,
                                    Long operatorId, String operatorName,
                                    String reason, int deletedTasks) {
        super(source, instanceId, processDefKey, operatorId, operatorName);
        this.reason = reason;
        this.deletedTasks = deletedTasks;
    }

    public String getReason() {
        return reason;
    }

    public int getDeletedTasks() {
        return deletedTasks;
    }
}
