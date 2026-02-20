package com.cloudflow.workflow.listener;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 默认全局监听器实现
 *
 * 提供基础的日志记录和通用处理逻辑。
 * 业务模块可参考此类创建自定义监听器，覆盖需要的阶段方法。
 *
 * 默认行为：
 *   - onCreate：记录流程创建日志，注入默认变量（_createTime）
 *   - onStart：记录节点开始日志
 *   - onAssignment：记录任务分配日志
 *   - onFinish：记录节点完成日志，END 节点时记录流程结束
 */
@Component
public class DefaultWorkflowGlobalListener implements WorkflowGlobalListener {

    private static final Logger log = LoggerFactory.getLogger(DefaultWorkflowGlobalListener.class);

    @Override
    public int getOrder() {
        // 默认监听器最先执行，业务监听器可设置更大的 order 值
        return -100;
    }

    @Override
    public void onCreate(WfProcessInstance instance, Map<String, Object> variables) {
        log.info("[全局监听] 流程创建: instanceId={}, processDefKey={}, 发起人={}({})",
                instance.getInstanceId(), instance.getProcessDefKey(),
                instance.getStartUserName(), instance.getStartUserId());

        // 注入默认变量：流程创建时间戳
        if (variables != null && !variables.containsKey("_createTime")) {
            variables.put("_createTime", System.currentTimeMillis());
        }
    }

    @Override
    public void onStart(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
        log.debug("[全局监听] 节点开始: instanceId={}, nodeId={}, nodeTitle={}, nodeType={}",
                instance.getInstanceId(), node.getId(), node.getTitle(), node.getType());
    }

    @Override
    public void onAssignment(WfProcessInstance instance, WfTask task, WfNodeConfig node) {
        log.info("[全局监听] 任务分配: instanceId={}, taskId={}, nodeTitle={}, 处理人={}({})",
                instance.getInstanceId(), task.getTaskId(), node.getTitle(),
                task.getAssigneeName(), task.getAssignee());
    }

    @Override
    public void onFinish(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
        if ("END".equals(node.getType())) {
            log.info("[全局监听] 流程结束: instanceId={}, processDefKey={}",
                    instance.getInstanceId(), instance.getProcessDefKey());
        } else {
            log.debug("[全局监听] 节点完成: instanceId={}, nodeId={}, nodeTitle={}",
                    instance.getInstanceId(), node.getId(), node.getTitle());
        }
    }
}
