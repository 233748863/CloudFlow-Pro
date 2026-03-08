package com.cloudflow.workflow.listener;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 全局监听器调度器。
 */
@Component
public class GlobalListenerDispatcher {

    private static final Logger log = LoggerFactory.getLogger(GlobalListenerDispatcher.class);

    @Autowired(required = false)
    private List<WorkflowGlobalListener> listeners;

    private List<WorkflowGlobalListener> sortedListeners;

    @PostConstruct
    public void init() {
        if (listeners == null || listeners.isEmpty()) {
            sortedListeners = new ArrayList<>();
            log.info("[GlobalListenerDispatcher] 未发现全局监听器");
            return;
        }

        sortedListeners = new ArrayList<>(listeners);
        sortedListeners.sort(Comparator.comparingInt(WorkflowGlobalListener::getOrder));
        log.info("[GlobalListenerDispatcher] 已加载 {} 个全局监听器: {}",
                sortedListeners.size(),
                sortedListeners.stream()
                        .map(listener -> listener.getClass().getSimpleName() + "(order=" + listener.getOrder() + ")")
                        .reduce((a, b) -> a + ", " + b)
                        .orElse(""));
    }

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

    public void fireStart(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
        for (WorkflowGlobalListener listener : sortedListeners) {
            try {
                listener.onStart(instance, node, variables);
            } catch (Exception e) {
                String nodeId = node != null ? node.getId() : "<null>";
                log.error("[GlobalListenerDispatcher] onStart 失败: listener={}, nodeId={}, error={}",
                        listener.getClass().getSimpleName(), nodeId, e.getMessage(), e);
            }
        }
    }

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

    public void fireFinish(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
        for (WorkflowGlobalListener listener : sortedListeners) {
            try {
                listener.onFinish(instance, node, variables);
            } catch (Exception e) {
                String nodeId = node != null ? node.getId() : "<process-end>";
                log.error("[GlobalListenerDispatcher] onFinish 失败: listener={}, nodeId={}, error={}",
                        listener.getClass().getSimpleName(), nodeId, e.getMessage(), e);
            }
        }
    }
}
