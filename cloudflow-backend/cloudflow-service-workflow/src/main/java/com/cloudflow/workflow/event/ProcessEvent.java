package com.cloudflow.workflow.event;

/**
 * 流程级事件基类
 * 所有流程生命周期事件（启动、完成、拒绝、撤回、作废）的公共父类。
 * 外部模块可以监听此类型来捕获所有流程级事件。
 *
 * 示例：
 * <pre>
 * // 监听所有流程级事件
 * @EventListener
 * public void onAnyProcessEvent(ProcessEvent event) { ... }
 *
 * // 只监听流程启动
 * @EventListener
 * public void onProcessStarted(ProcessStartedEvent event) { ... }
 * </pre>
 */
public abstract class ProcessEvent extends BaseWorkflowEvent {

    /** 操作人ID */
    private final Long operatorId;

    /** 操作人姓名 */
    private final String operatorName;

    protected ProcessEvent(Object source, String instanceId, String processDefKey,
                           Long operatorId, String operatorName) {
        super(source, instanceId, processDefKey);
        this.operatorId = operatorId;
        this.operatorName = operatorName;
    }

    public Long getOperatorId() {
        return operatorId;
    }

    public String getOperatorName() {
        return operatorName;
    }
}
