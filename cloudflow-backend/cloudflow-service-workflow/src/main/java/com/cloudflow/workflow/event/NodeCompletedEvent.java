package com.cloudflow.workflow.event;

/**
 * 节点完成事件
 * 当流程节点执行完毕时发布。
 */
public class NodeCompletedEvent extends NodeEvent {

    /** 节点执行耗时（毫秒） */
    private final long durationMs;

    public NodeCompletedEvent(Object source, String instanceId, String processDefKey,
                               String nodeKey, String nodeName, String nodeType,
                               long durationMs) {
        super(source, instanceId, processDefKey, nodeKey, nodeName, nodeType);
        this.durationMs = durationMs;
    }

    public long getDurationMs() {
        return durationMs;
    }
}
