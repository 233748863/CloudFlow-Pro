package com.cloudflow.workflow.event;

/**
 * 流程终止事件。
 * 管理员强制终止运行中或暂停中的流程时发布。
 */
public class ProcessTerminatedEvent extends ProcessEvent {

    private final String reason;

    public ProcessTerminatedEvent(Object source, String instanceId, String processDefKey,
                                  Long operatorId, String operatorName, String reason) {
        super(source, instanceId, processDefKey, operatorId, operatorName);
        this.reason = reason;
    }

    public String getReason() {
        return reason;
    }
}
