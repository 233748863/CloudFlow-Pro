package com.cloudflow.workflow.event;

/**
 * 任务级事件基类
 *
 * 所有与审批任务相关的事件继承此类。
 * 包含任务ID、节点Key、节点名称等任务上下文信息。
 */
public abstract class TaskEvent extends BaseWorkflowEvent {

    /** 任务ID */
    private final String taskId;

    /** 节点Key（流程定义中的节点标识） */
    private final String nodeKey;

    /** 节点名称（如"部门经理审批"） */
    private final String nodeName;

    protected TaskEvent(Object source, String instanceId, String processDefKey,
                        String taskId, String nodeKey, String nodeName) {
        super(source, instanceId, processDefKey);
        this.taskId = taskId;
        this.nodeKey = nodeKey;
        this.nodeName = nodeName;
    }

    public String getTaskId() {
        return taskId;
    }

    public String getNodeKey() {
        return nodeKey;
    }

    public String getNodeName() {
        return nodeName;
    }
}
