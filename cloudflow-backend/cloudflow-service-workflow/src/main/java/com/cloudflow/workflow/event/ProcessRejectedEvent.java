package com.cloudflow.workflow.event;

/**
 * 流程拒绝事件
 * 审批人在某个节点执行拒绝操作，导致流程终止时发布。
 */
public class ProcessRejectedEvent extends ProcessEvent {

    /** 拒绝发生的节点名称 */
    private final String nodeName;

    /** 拒绝意见 */
    private final String comment;

    public ProcessRejectedEvent(Object source, String instanceId, String processDefKey,
                                 Long operatorId, String operatorName,
                                 String nodeName, String comment) {
        super(source, instanceId, processDefKey, operatorId, operatorName);
        this.nodeName = nodeName;
        this.comment = comment;
    }

    public String getNodeName() {
        return nodeName;
    }

    public String getComment() {
        return comment;
    }
}
