package com.cloudflow.workflow.event;

/**
 * 节点开始执行事件
 * 当流程引擎开始执行某个节点时发布。
 */
public class NodeStartedEvent extends NodeEvent {

    public NodeStartedEvent(Object source, String instanceId, String processDefKey,
                             String nodeKey, String nodeName, String nodeType) {
        super(source, instanceId, processDefKey, nodeKey, nodeName, nodeType);
    }
}
