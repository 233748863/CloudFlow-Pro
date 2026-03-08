package com.cloudflow.workflow.listener;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 默认全局监听器。
 */
@Component
public class DefaultWorkflowGlobalListener implements WorkflowGlobalListener {

    private static final Logger log = LoggerFactory.getLogger(DefaultWorkflowGlobalListener.class);

    @Override
    public int getOrder() {
        return -100;
    }

    @Override
    public void onCreate(WfProcessInstance instance, Map<String, Object> variables) {
        log.info("[全局监听] 流程创建: instanceId={}, processDefKey={}, 发起人={}({})",
                instance.getInstanceId(), instance.getProcessDefKey(),
                instance.getStartUserName(), instance.getStartUserId());

        if (variables != null && !variables.containsKey("_createTime")) {
            variables.put("_createTime", System.currentTimeMillis());
        }
    }

    @Override
    public void onStart(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
        if (node == null) {
            return;
        }
        log.debug("[全局监听] 节点开始: instanceId={}, nodeId={}, nodeTitle={}, nodeType={}",
                instance.getInstanceId(), node.getId(), node.getTitle(), node.getType());
    }

    @Override
    public void onAssignment(WfProcessInstance instance, WfTask task, WfNodeConfig node) {
        log.info("[全局监听] 任务分配: instanceId={}, taskId={}, nodeTitle={}, 处理人={}({})",
                instance.getInstanceId(), task.getTaskId(), node != null ? node.getTitle() : "<unknown>",
                task.getAssigneeName(), task.getAssignee());
    }

    @Override
    public void onFinish(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
        if (node == null || "END".equals(node.getType())) {
            log.info("[全局监听] 流程结束: instanceId={}, processDefKey={}",
                    instance.getInstanceId(), instance.getProcessDefKey());
            return;
        }

        log.debug("[全局监听] 节点完成: instanceId={}, nodeId={}, nodeTitle={}",
                instance.getInstanceId(), node.getId(), node.getTitle());
    }
}
