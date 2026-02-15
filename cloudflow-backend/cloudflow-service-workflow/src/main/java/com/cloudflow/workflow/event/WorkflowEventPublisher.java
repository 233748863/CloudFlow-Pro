package com.cloudflow.workflow.event;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfNodeConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * 工作流事件发布器
 * 封装 Spring ApplicationEventPublisher，提供语义化的事件发布方法。
 * 在 WorkflowServiceImpl 的关键节点调用，将业务逻辑与事件处理解耦。
 *
 * 设计思路：
 * - 替代 poco-flow 中 Flowable 引擎的全局事件监听机制
 * - 通过 Spring Event 实现松耦合的事件驱动架构
 * - 事件发布失败不影响主流程（catch 异常后仅记录日志）
 */
@Component
public class WorkflowEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(WorkflowEventPublisher.class);

    private final ApplicationEventPublisher eventPublisher;

    public WorkflowEventPublisher(ApplicationEventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    // ==================== 流程级事件 ====================

    /**
     * 发布流程启动事件
     * 对应 poco-flow 的 PROCESS_STARTED 事件
     */
    public void publishProcessStarted(WfProcessInstance instance) {
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.PROCESS_STARTED)
                .instanceId(instance.getInstanceId())
                .processDefKey(instance.getProcessDefKey())
                .operatorId(instance.getStartUserId())
                .operatorName(instance.getStartUserName())
                .build());
    }

    /**
     * 发布流程完成事件
     * 对应 poco-flow 的 PROCESS_COMPLETED 事件
     */
    public void publishProcessCompleted(WfProcessInstance instance) {
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.PROCESS_COMPLETED)
                .instanceId(instance.getInstanceId())
                .processDefKey(instance.getProcessDefKey())
                .build());
    }

    /**
     * 发布流程拒绝事件
     * 对应 poco-flow 的 PROCESS_COMPLETED_WITH_TERMINATE_END_EVENT
     */
    public void publishProcessRejected(WfProcessInstance instance, String nodeName, String comment) {
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.PROCESS_REJECTED)
                .instanceId(instance.getInstanceId())
                .processDefKey(instance.getProcessDefKey())
                .nodeName(nodeName)
                .operatorId(UserContext.getUserId())
                .operatorName(UserContext.getUserName())
                .comment(comment)
                .build());
    }

    /**
     * 发布流程撤回事件
     */
    public void publishProcessRevoked(WfProcessInstance instance) {
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.PROCESS_REVOKED)
                .instanceId(instance.getInstanceId())
                .processDefKey(instance.getProcessDefKey())
                .operatorId(UserContext.getUserId())
                .operatorName(UserContext.getUserName())
                .build());
    }

    // ==================== 节点级事件 ====================

    /**
     * 发布节点开始执行事件
     * 对应 poco-flow 的 ACTIVITY_STARTED 事件
     *
     * @param instance 流程实例
     * @param node     当前执行的节点配置
     */
    public void publishNodeStarted(WfProcessInstance instance, WfNodeConfig node) {
        if (node == null) return;
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.NODE_STARTED)
                .instanceId(instance.getInstanceId())
                .processDefKey(instance.getProcessDefKey())
                .nodeKey(node.getId())
                .nodeName(node.getTitle())
                .nodeType(node.getType())
                .build());
    }

    /**
     * 发布节点执行完成事件
     * 对应 poco-flow 的 ACTIVITY_COMPLETED 事件
     *
     * @param instance 流程实例
     * @param node     完成的节点配置
     */
    public void publishNodeCompleted(WfProcessInstance instance, WfNodeConfig node) {
        if (node == null) return;
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.NODE_COMPLETED)
                .instanceId(instance.getInstanceId())
                .processDefKey(instance.getProcessDefKey())
                .nodeKey(node.getId())
                .nodeName(node.getTitle())
                .nodeType(node.getType())
                .build());
    }

    /**
     * 发布节点执行完成事件（通过 nodeKey/nodeName/nodeType 参数）
     * 用于在没有 WfNodeConfig 对象时发布事件
     */
    public void publishNodeCompleted(WfProcessInstance instance, String nodeKey, String nodeName, String nodeType) {
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.NODE_COMPLETED)
                .instanceId(instance.getInstanceId())
                .processDefKey(instance.getProcessDefKey())
                .nodeKey(nodeKey)
                .nodeName(nodeName)
                .nodeType(nodeType)
                .build());
    }

    // ==================== 任务级事件 ====================

    /**
     * 发布任务分配事件
     * 对应 poco-flow 的 TASK_ASSIGNED 事件
     *
     * @param instance   流程实例
     * @param taskId     任务ID
     * @param nodeKey    节点Key
     * @param nodeName   节点名称
     * @param assigneeId 被分配人ID
     * @param assigneeName 被分配人姓名
     */
    public void publishTaskAssigned(WfProcessInstance instance, String taskId,
                                     String nodeKey, String nodeName,
                                     Long assigneeId, String assigneeName) {
        publishTaskAssigned(instance, taskId, nodeKey, nodeName, "APPROVAL", assigneeId, assigneeName);
    }

    /**
     * 发布任务分配事件（指定节点类型）
     * 支持 APPROVAL 和 MANUAL 等不同类型的任务节点
     */
    public void publishTaskAssigned(WfProcessInstance instance, String taskId,
                                     String nodeKey, String nodeName, String nodeType,
                                     Long assigneeId, String assigneeName) {
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.TASK_ASSIGNED)
                .instanceId(instance.getInstanceId())
                .processDefKey(instance.getProcessDefKey())
                .taskId(taskId)
                .nodeKey(nodeKey)
                .nodeName(nodeName)
                .nodeType(nodeType != null ? nodeType : "APPROVAL")
                .operatorId(assigneeId)
                .operatorName(assigneeName)
                .build());
    }

    /**
     * 发布任务完成事件
     * 对应 poco-flow 的 TASK_COMPLETED 事件
     *
     * @param instance 流程实例
     * @param taskId   任务ID
     * @param nodeKey  节点Key
     * @param nodeName 节点名称
     * @param action   操作动作（APPROVE / REJECT / DELEGATE）
     * @param comment  审批意见
     */
    public void publishTaskCompleted(WfProcessInstance instance, String taskId,
                                      String nodeKey, String nodeName,
                                      String action, String comment) {
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.TASK_COMPLETED)
                .instanceId(instance.getInstanceId())
                .processDefKey(instance.getProcessDefKey())
                .taskId(taskId)
                .nodeKey(nodeKey)
                .nodeName(nodeName)
                .nodeType("APPROVAL")
                .operatorId(UserContext.getUserId())
                .operatorName(UserContext.getUserName())
                .action(action)
                .comment(comment)
                .build());
    }

    // ==================== 变量变更事件 ====================

    /**
     * 发布变量变更事件
     * 对应 poco-flow 的 VARIABLE_CREATED / VARIABLE_UPDATED / VARIABLE_DELETED 事件
     *
     * @param instanceId    流程实例ID
     * @param processDefKey 流程定义Key
     * @param changedVarsJson 变更的变量（JSON 格式）
     */
    public void publishVariableUpdated(String instanceId, String processDefKey, String changedVarsJson) {
        publish(WorkflowEvent.builder(this, WorkflowEvent.EventType.VARIABLE_UPDATED)
                .instanceId(instanceId)
                .processDefKey(processDefKey)
                .operatorId(UserContext.getUserId())
                .operatorName(UserContext.getUserName())
                .extraData(changedVarsJson)
                .build());
    }

    // ==================== 内部方法 ====================

    /**
     * 安全发布事件，异常不影响主流程
     */
    private void publish(WorkflowEvent event) {
        try {
            log.debug("[WorkflowEventPublisher] 发布事件: {}", event);
            eventPublisher.publishEvent(event);
        } catch (Exception e) {
            // 事件发布失败不应影响主流程
            log.error("[WorkflowEventPublisher] 事件发布失败: eventType={}, instanceId={}, error={}",
                    event.getEventType(), event.getInstanceId(), e.getMessage(), e);
        }
    }
}
