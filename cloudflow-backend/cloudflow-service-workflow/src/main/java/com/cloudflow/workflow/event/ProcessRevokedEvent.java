package com.cloudflow.workflow.event;

/**
 * 流程撤回事件
 * 发起人在流程尚未被审批前撤回流程时发布。
 */
public class ProcessRevokedEvent extends ProcessEvent {

    public ProcessRevokedEvent(Object source, String instanceId, String processDefKey,
                                Long operatorId, String operatorName) {
        super(source, instanceId, processDefKey, operatorId, operatorName);
    }
}
