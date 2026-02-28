package com.cloudflow.workflow.event;

/**
 * 子流程完成事件
 * 当子流程执行完毕后发布此事件，通知父流程继续流转。
 *
 * 事件触发时机：
 *   NodeExecutionServiceImpl.completeInstance() 中检测到当前实例有 parentInstanceId 时发布
 *
 * 事件处理：
 *   SubprocessCompletedListener 监听此事件，查找父流程定义，
 *   定位到触发子流程的节点，从该节点的 next 继续执行父流程
 *
 * @author CloudFlow
 */
public class SubprocessCompletedEvent extends BaseWorkflowEvent {

    /** 父流程实例ID */
    private final String parentInstanceId;

    /** 父流程中触发子流程的节点Key */
    private final String parentNodeKey;

    /** 子流程实例ID（即当前完成的子流程） */
    private final String childInstanceId;

    /**
     * @param source           事件源
     * @param parentInstanceId 父流程实例ID
     * @param parentNodeKey    父流程中触发子流程的节点Key
     * @param childInstanceId  子流程实例ID
     */
    public SubprocessCompletedEvent(Object source, String parentInstanceId, String parentNodeKey, String childInstanceId) {
        // 使用父流程实例ID作为事件的 instanceId，processDefKey 暂不填（监听器中会查询）
        super(source, parentInstanceId, null);
        this.parentInstanceId = parentInstanceId;
        this.parentNodeKey = parentNodeKey;
        this.childInstanceId = childInstanceId;
    }

    public String getParentInstanceId() {
        return parentInstanceId;
    }

    public String getParentNodeKey() {
        return parentNodeKey;
    }

    public String getChildInstanceId() {
        return childInstanceId;
    }

    @Override
    public String toString() {
        return "SubprocessCompletedEvent{" +
                "parentInstanceId='" + parentInstanceId + '\'' +
                ", parentNodeKey='" + parentNodeKey + '\'' +
                ", childInstanceId='" + childInstanceId + '\'' +
                ", eventTime=" + getEventTime() +
                '}';
    }
}
