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
 *
 * 封装 Spring ApplicationEventPublisher，发布类型安全的工作流事件。
 * 外部模块通过 @EventListener 按事件类型监听，无需了解内部实现。
 *
 * 事件层次结构：
 *   BaseWorkflowEvent
 *   ├── ProcessEvent（流程级）
 *   │   ├── ProcessStartedEvent
 *   │   ├── ProcessCompletedEvent
 *   │   ├── ProcessRejectedEvent
 *   │   ├── ProcessRevokedEvent
 *   │   └── ProcessInvalidatedEvent
 *   ├── TaskEvent（任务级）
 *   │   ├── TaskAssignedEvent
 *   │   └── TaskCompletedEvent
 *   └── NodeEvent（节点级）
 *       ├── NodeStartedEvent
 *       └── NodeCompletedEvent
 *
 * 事件发布失败不影响主流程（catch 异常后仅记录日志）。
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
     */
    public void publishProcessStarted(WfProcessInstance instance) {
        publish(new ProcessStartedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                instance.getStartUserId(),
                instance.getStartUserName(),
                instance.getBusinessKey()
        ));
    }

    /**
     * 发布流程完成事件
     */
    public void publishProcessCompleted(WfProcessInstance instance) {
        Long operatorId = safeGetUserId();
        String operatorName = safeGetUserName();
        publish(new ProcessCompletedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                operatorId,
                operatorName
        ));
    }

    /**
     * 发布流程拒绝事件
     */
    public void publishProcessRejected(WfProcessInstance instance, String nodeName, String comment) {
        publish(new ProcessRejectedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                UserContext.getUserId(),
                UserContext.getUserName(),
                nodeName,
                comment
        ));
    }

    /**
     * 发布流程撤回事件
     */
    public void publishProcessRevoked(WfProcessInstance instance) {
        publish(new ProcessRevokedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                UserContext.getUserId(),
                UserContext.getUserName()
        ));
    }

    /**
     * 发布流程作废事件
     *
     * @param instance     流程实例
     * @param reason       作废原因
     * @param deletedTasks 被删除的待办任务数量
     */
    public void publishProcessInvalidated(WfProcessInstance instance, String reason, int deletedTasks) {
        publish(new ProcessInvalidatedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                safeGetUserId(),
                safeGetUserName(),
                reason,
                deletedTasks
        ));
    }

    /**
     * 发布流程终止事件
     *
     * @param instance 流程实例
     * @param reason   终止原因
     */
    public void publishProcessTerminated(WfProcessInstance instance, String reason) {
        publish(new ProcessTerminatedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                safeGetUserId(),
                safeGetUserName(),
                reason
        ));
    }

    /**
     * 发布子流程结束事件
     * 当子流程进入任意终态后，通知父流程按终态决策（完成则继续流转，异常终态则挂起父流程）
     *
     * @param parentInstanceId  父流程实例ID
     * @param parentNodeKey     父流程中触发子流程的节点Key
     * @param childInstanceId   子流程实例ID
     * @param childStatus       子流程终态（WfProcessStatus code）
     */
    public void publishSubprocessCompleted(String parentInstanceId, String parentNodeKey,
                                           String childInstanceId, String childStatus) {
        log.info("[WorkflowEventPublisher] 发布子流程结束事件: parentInstanceId={}, parentNodeKey={}, childInstanceId={}, childStatus={}",
                parentInstanceId, parentNodeKey, childInstanceId, childStatus);
        publish(new SubprocessCompletedEvent(this, parentInstanceId, parentNodeKey, childInstanceId, childStatus));
    }

    /**
     * 若实例是子流程（挂有父实例引用），发布子流程结束事件通知父流程。
     * 供实例进入终态的所有路径（完成/驳回/撤回/作废/终止）统一调用，非子流程实例静默跳过。
     *
     * @param child  刚进入终态的实例
     * @param status 终态（WfProcessStatus code）
     */
    public void publishSubprocessFinishedIfChild(WfProcessInstance child, String status) {
        if (child == null
                || !org.springframework.util.StringUtils.hasText(child.getParentInstanceId())
                || !org.springframework.util.StringUtils.hasText(child.getParentNodeKey())) {
            return;
        }
        publishSubprocessCompleted(child.getParentInstanceId(), child.getParentNodeKey(),
                child.getInstanceId(), status);
    }

    // ==================== 节点级事件 ====================

    /**
     * 发布节点开始执行事件
     */
    public void publishNodeStarted(WfProcessInstance instance, WfNodeConfig node) {
        if (node == null) return;
        publish(new NodeStartedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                node.getId(),
                node.getTitle(),
                node.getType()
        ));
    }

    /**
     * 发布节点执行完成事件
     */
    public void publishNodeCompleted(WfProcessInstance instance, WfNodeConfig node) {
        if (node == null) return;
        publishNodeCompleted(instance, node.getId(), node.getTitle(), node.getType(), 0L);
    }

    /**
     * 发布节点执行完成事件（通过参数）
     */
    public void publishNodeCompleted(WfProcessInstance instance, String nodeKey, String nodeName, String nodeType) {
        publishNodeCompleted(instance, nodeKey, nodeName, nodeType, 0L);
    }

    /**
     * 发布节点执行完成事件（含耗时）
     *
     * @param instance   流程实例
     * @param nodeKey    节点Key
     * @param nodeName   节点名称
     * @param nodeType   节点类型
     * @param durationMs 节点执行耗时（毫秒）
     */
    public void publishNodeCompleted(WfProcessInstance instance, String nodeKey,
                                      String nodeName, String nodeType, long durationMs) {
        publish(new NodeCompletedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                nodeKey,
                nodeName,
                nodeType,
                durationMs
        ));
    }

    // ==================== 任务级事件 ====================

    /**
     * 发布任务分配事件
     */
    public void publishTaskAssigned(WfProcessInstance instance, String taskId,
                                     String nodeKey, String nodeName,
                                     Long assigneeId, String assigneeName) {
        publish(new TaskAssignedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                taskId,
                nodeKey,
                nodeName,
                assigneeId,
                assigneeName
        ));
    }

    /**
     * 发布任务分配事件（指定节点类型，保持签名兼容）
     */
    public void publishTaskAssigned(WfProcessInstance instance, String taskId,
                                     String nodeKey, String nodeName, String nodeType,
                                     Long assigneeId, String assigneeName) {
        // nodeType 信息已包含在节点配置中，TaskAssignedEvent 聚焦于任务分配本身
        publish(new TaskAssignedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                taskId,
                nodeKey,
                nodeName,
                assigneeId,
                assigneeName
        ));
    }

    /**
     * 发布任务完成事件
     *
     * @param instance 流程实例
     * @param taskId   任务ID
     * @param nodeKey  节点Key
     * @param nodeName 节点名称
     * @param action   操作动作（APPROVE / REJECT / DELEGATE / RETURN）
     * @param comment  审批意见
     */
    public void publishTaskCompleted(WfProcessInstance instance, String taskId,
                                      String nodeKey, String nodeName,
                                      String action, String comment) {
        publish(new TaskCompletedEvent(
                this,
                instance.getInstanceId(),
                instance.getProcessDefKey(),
                taskId,
                nodeKey,
                nodeName,
                UserContext.getUserId(),
                UserContext.getUserName(),
                action,
                comment
        ));
    }

    // ==================== 变量变更事件（暂保留日志记录） ====================

    /**
     * 发布变量变更事件
     * 当前仅记录日志，后续可扩展为独立事件类
     */
    public void publishVariableUpdated(String instanceId, String processDefKey, String changedVarsJson) {
        log.debug("[WorkflowEventPublisher] 变量变更: instanceId={}, processDefKey={}, vars={}",
                instanceId, processDefKey, changedVarsJson);
    }

    // ==================== 内部方法 ====================

    /**
     * 安全发布事件，异常不影响主流程
     */
    private void publish(BaseWorkflowEvent event) {
        try {
            log.debug("[WorkflowEventPublisher] 发布事件: {} instanceId={}",
                    event.getClass().getSimpleName(), event.getInstanceId());
            eventPublisher.publishEvent(event);
        } catch (Exception e) {
            log.error("[WorkflowEventPublisher] 事件发布失败: type={}, instanceId={}, error={}",
                    event.getClass().getSimpleName(), event.getInstanceId(), e.getMessage(), e);
        }
    }

    /**
     * 安全获取当前用户ID（定时任务等场景可能没有用户上下文）
     */
    private Long safeGetUserId() {
        try {
            return UserContext.getUserId();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 安全获取当前用户名
     */
    private String safeGetUserName() {
        try {
            return UserContext.getUserName();
        } catch (Exception e) {
            return null;
        }
    }
}
