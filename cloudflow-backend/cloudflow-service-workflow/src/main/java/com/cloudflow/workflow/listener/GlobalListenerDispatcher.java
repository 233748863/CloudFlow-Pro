package com.cloudflow.workflow.listener;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 全局监听器调度器
 *
 * 自动收集 Spring 容器中所有 {@link WorkflowGlobalListener} 实现，
 * 按 {@link WorkflowGlobalListener#getOrder()} 升序排列，
 * 在流程执行的四个阶段依次调用。
 *
 * 调用点：
 *   - WfInstanceServiceImpl.startProcess()  → fireCreate()
 *   - NodeExecutionServiceImpl.runNode()     → fireStart() / fireFinish()
 *   - NodeExecutionServiceImpl（任务创建后） → fireAssignment()
 *
 * 异常处理：
 *   单个监听器抛出异常不影响其他监听器和主流程，仅记录错误日志。
 */
@Component
public class GlobalListenerDispatcher {

    private static final Logger log = LoggerFactory.getLogger(GlobalListenerDispatcher.class);

    /**
     * Spring 自动注入所有 WorkflowGlobalListener 实现
     * 如果容器中没有任何实现，则为空列表
     */
    @Autowired(required = false)
    private List<WorkflowGlobalListener> listeners;

    /** 排序后的监听器列表（不可变） */
    private List<WorkflowGlobalListener> sortedListeners;

    @PostConstruct
    public void init() {
        if (listeners == null || listeners.isEmpty()) {
            sortedListeners = new ArrayList<>();
            log.info("[GlobalListenerDispatcher] 未发现全局监听器");
        } else {
            sortedListeners = new ArrayList<>(listeners);
            sortedListeners.sort(Comparator.comparingInt(WorkflowGlobalListener::getOrder));
            log.info("[GlobalListenerDispatcher] 已加载 {} 个全局监听器: {}",
                    sortedListeners.size(),
                    sortedListeners.stream()
                            .map(l -> l.getClass().getSimpleName() + "(order=" + l.getOrder() + ")")
                            .reduce((a, b) -> a + ", " + b).orElse(""));
        }
    }

    /**
     * 阶段一：流程创建
     * 在流程实例创建完成、第一个节点执行之前调用
     */
    public void fireCreate(WfProcessInstance instance, Map<String, Object> variables) {
        for (WorkflowGlobalListener listener : sortedListeners) {
            try {
                listener.onCreate(instance, variables);
            } catch (Exception e) {
                log.error("[GlobalListenerDispatcher] onCreate 失败: listener={}, instanceId={}, error={}",
                        listener.getClass().getSimpleName(), instance.getInstanceId(), e.getMessage(), e);
            }
        }
    }

    /**
     * 阶段二：节点开始
     * 在每个节点开始执行之前调用
     */
    public void fireStart(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
        for (WorkflowGlobalListener listener : sortedListeners) {
            try {
                listener.onStart(instance, node, variables);
            } catch (Exception e) {
                log.error("[GlobalListenerDispatcher] onStart 失败: listener={}, nodeId={}, error={}",
                        listener.getClass().getSimpleName(), node.getId(), e.getMessage(), e);
            }
        }
    }

    /**
     * 阶段三：任务分配
     * 在审批任务创建并分配给处理人之后调用
     */
    public void fireAssignment(WfProcessInstance instance, WfTask task, WfNodeConfig node) {
        for (WorkflowGlobalListener listener : sortedListeners) {
            try {
                listener.onAssignment(instance, task, node);
            } catch (Exception e) {
                log.error("[GlobalListenerDispatcher] onAssignment 失败: listener={}, taskId={}, error={}",
                        listener.getClass().getSimpleName(), task.getTaskId(), e.getMessage(), e);
            }
        }
    }

    /**
     * 阶段四：节点完成 / 流程结束
     * 在节点执行完成后调用
     */
    public void fireFinish(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
        for (WorkflowGlobalListener listener : sortedListeners) {
            try {
                listener.onFinish(instance, node, variables);
            } catch (Exception e) {
                log.error("[GlobalListenerDispatcher] onFinish 失败: listener={}, nodeId={}, error={}",
                        listener.getClass().getSimpleName(), node.getId(), e.getMessage(), e);
            }
        }
    }
}
