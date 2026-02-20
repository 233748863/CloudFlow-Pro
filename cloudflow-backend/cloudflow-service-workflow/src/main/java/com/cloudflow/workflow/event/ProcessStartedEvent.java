package com.cloudflow.workflow.event;

/**
 * 流程启动事件
 *
 * 在流程实例创建并开始执行第一个节点后发布。
 * OA 模块可监听此事件执行业务初始化逻辑，例如：
 * - 创建请假记录
 * - 初始化报销单状态
 * - 发送流程发起通知
 *
 * 使用示例：
 * <pre>
 * @EventListener
 * public void onProcessStarted(ProcessStartedEvent event) {
 *     if ("wf_leave".equals(event.getProcessDefKey())) {
 *         // 处理请假流程启动逻辑
 *     }
 * }
 * </pre>
 */
public class ProcessStartedEvent extends ProcessEvent {

    /** 业务关联Key（如工单号、申请单号） */
    private final String businessKey;

    public ProcessStartedEvent(Object source, String instanceId, String processDefKey,
                                Long operatorId, String operatorName, String businessKey) {
        super(source, instanceId, processDefKey, operatorId, operatorName);
        this.businessKey = businessKey;
    }

    public String getBusinessKey() {
        return businessKey;
    }
}
