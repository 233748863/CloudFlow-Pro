package com.cloudflow.workflow.event;

/**
 * 节点级事件基类
 *
 * 所有与流程节点执行相关的事件继承此类。
 * 包含节点Key、节点名称、节点类型等节点上下文信息。
 */
public abstract class NodeEvent extends BaseWorkflowEvent {

    /** 节点Key（流程定义中的节点标识） */
    private final String nodeKey;

    /** 节点名称 */
    private final String nodeName;

    /** 节点类型（APPROVAL / NOTIFICATION / SCRIPT / CONDITION / PARALLEL / END 等） */
    private final String nodeType;

    protected NodeEvent(Object source, String instanceId, String processDefKey,
                        String nodeKey, String nodeName, String nodeType) {
        super(source, instanceId, processDefKey);
        this.nodeKey = nodeKey;
        this.nodeName = nodeName;
        this.nodeType = nodeType;
    }

    public String getNodeKey() {
        return nodeKey;
    }

    public String getNodeName() {
        return nodeName;
    }

    public String getNodeType() {
        return nodeType;
    }
}
