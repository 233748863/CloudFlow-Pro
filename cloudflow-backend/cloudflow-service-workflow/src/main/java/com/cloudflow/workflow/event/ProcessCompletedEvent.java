package com.cloudflow.workflow.event;

/**
 * 流程完成事件
 * 流程正常走完所有节点到达 END 节点时发布。
 */
public class ProcessCompletedEvent extends ProcessEvent {

    public ProcessCompletedEvent(Object source, String instanceId, String processDefKey,
                                  Long operatorId, String operatorName) {
        super(source, instanceId, processDefKey, operatorId, operatorName);
    }
}
