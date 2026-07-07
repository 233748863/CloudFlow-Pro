package com.cloudflow.workflow.event;

/**
 * 子流程结束事件
 * 当子流程进入任意终态（COMPLETED/REJECTED/REVOKED/INVALIDATED/TERMINATED 等）后发布此事件，
 * 通知父流程按子流程终态决策后续流转。
 *
 * 事件触发时机：
 *   NodeExecutionServiceImpl.completeInstance() 以及实例撤回/作废/终止路径中，
 *   检测到当前实例有 parentInstanceId 时发布（携带子流程终态）
 *
 * 事件处理：
 *   SubprocessCompletedListener 监听此事件（事务提交后），转发到
 *   IWfInstanceService.handleSubprocessFinished 在锁+事务保护下恢复或挂起父流程：
 *   - 子流程 COMPLETED → 父流程从子流程节点的 next 继续
 *   - 其余终态 → 父流程挂起（SUSPENDED）+ 告警，人工处理后可恢复重跑子流程节点
 *
 * @author CloudFlow
 */
public class SubprocessCompletedEvent extends BaseWorkflowEvent {

    /** 父流程实例ID */
    private final String parentInstanceId;

    /** 父流程中触发子流程的节点Key */
    private final String parentNodeKey;

    /** 子流程实例ID（即当前结束的子流程） */
    private final String childInstanceId;

    /** 子流程终态（WfProcessStatus code，如 COMPLETED/REJECTED/REVOKED/INVALIDATED/TERMINATED） */
    private final String childStatus;

    /**
     * @param source           事件源
     * @param parentInstanceId 父流程实例ID
     * @param parentNodeKey    父流程中触发子流程的节点Key
     * @param childInstanceId  子流程实例ID
     * @param childStatus      子流程终态
     */
    public SubprocessCompletedEvent(Object source, String parentInstanceId, String parentNodeKey,
                                    String childInstanceId, String childStatus) {
        // 使用父流程实例ID作为事件的 instanceId，processDefKey 暂不填（监听器中会查询）
        super(source, parentInstanceId, null);
        this.parentInstanceId = parentInstanceId;
        this.parentNodeKey = parentNodeKey;
        this.childInstanceId = childInstanceId;
        this.childStatus = childStatus;
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

    public String getChildStatus() {
        return childStatus;
    }

    @Override
    public String toString() {
        return "SubprocessCompletedEvent{" +
                "parentInstanceId='" + parentInstanceId + '\'' +
                ", parentNodeKey='" + parentNodeKey + '\'' +
                ", childInstanceId='" + childInstanceId + '\'' +
                ", childStatus='" + childStatus + '\'' +
                ", eventTime=" + getEventTime() +
                '}';
    }
}
