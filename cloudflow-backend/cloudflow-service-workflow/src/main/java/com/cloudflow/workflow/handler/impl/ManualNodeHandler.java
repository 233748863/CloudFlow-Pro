package com.cloudflow.workflow.handler.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.handler.INodeHandler;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.ISysNoticeService;
import com.cloudflow.workflow.strategy.AssignUserStrategyFactory;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * 人工任务节点处理器
 * 创建一个需要人工处理的任务（类似审批节点，但语义上是"执行任务"而非"审批决策"）
 * 任务创建后流程阻塞，等待处理人完成任务后继续流转
 *
 * 前端配置的 props 字段：
 * - taskDescription: 任务描述
 * - priority: 任务优先级 (LOW/MEDIUM/HIGH)
 *
 * 处理人通过 approverType + approverValue 配置，与审批节点一致
 *
 * @author CloudFlow
 */
@Component
@RequiredArgsConstructor
public class ManualNodeHandler implements INodeHandler {

    private static final Logger log = LoggerFactory.getLogger(ManualNodeHandler.class);

    private final WfTaskMapper taskMapper;
    private final ISysNoticeService sysNoticeService;
    private final AssignUserStrategyFactory assignUserStrategyFactory;

    @Override
    public String getNodeType() {
        return "MANUAL";
    }

    @Override
    public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        log.info("[ManualNodeHandler] 执行人工任务节点, nodeKey={}, instanceId={}", node.getId(), instance.getInstanceId());

        // 解析处理人
        Long assigneeId = assignUserStrategyFactory.resolve(node, instance);
        if (assigneeId == null) {
            log.warn("[ManualNodeHandler] 人工任务节点未能解析到处理人, nodeKey={}, approverType={}, approverValue={}",
                    node.getId(), node.getApproverType(), node.getApproverValue());
            assigneeId = 1L; // 降级到管理员
        }

        // 从 props 中读取任务描述和优先级
        Map<String, Object> props = node.getProps();
        String taskDescription = null;
        String priority = "NORMAL";
        if (props != null) {
            taskDescription = (String) props.get("taskDescription");
            String configPriority = (String) props.get("priority");
            if (configPriority != null) {
                priority = normalizePriority(configPriority);
            }
        }

        // 创建人工任务（复用 wf_task 表，与审批任务共用同一套完成机制）
        WfTask task = new WfTask();
        task.setTaskId(UUID.randomUUID().toString());
        task.setInstanceId(instance.getInstanceId());
        task.setNodeName(node.getTitle());
        task.setNodeKey(node.getId());
        task.setAssignee(assigneeId);
        task.setStatus(WfTaskStatus.TODO.getCode());
        task.setPriority(priority);
        task.setCreateTime(LocalDateTime.now());
        taskMapper.insert(task);

        // 发送通知，包含任务描述
        String noticeContent = "您有一个新的人工任务: " + node.getTitle() + " (流程: " + instance.getTitle() + ")";
        if (taskDescription != null && !taskDescription.isEmpty()) {
            noticeContent += "\n任务说明: " + taskDescription;
        }
        sysNoticeService.sendNotice(assigneeId, "人工任务通知", noticeContent,
                "1", UserContext.getUserId(), UserContext.getUserName());

        log.info("[ManualNodeHandler] 人工任务已创建, taskId={}, assignee={}, priority={}",
                task.getTaskId(), assigneeId, priority);

        // 返回 false 表示流程阻塞，等待处理人完成任务后由 completeTask 触发继续流转
        return false;
    }

    /**
     * 兼容前端与后端优先级枚举差异：
     * 前端人工任务配置使用 LOW/MEDIUM/HIGH，后端统一使用 LOW/NORMAL/HIGH/URGENT。
     */
    private String normalizePriority(String rawPriority) {
        if (rawPriority == null) {
            return "NORMAL";
        }
        String value = rawPriority.trim().toUpperCase();
        if ("MEDIUM".equals(value)) {
            return "NORMAL";
        }
        if ("LOW".equals(value) || "NORMAL".equals(value) || "HIGH".equals(value) || "URGENT".equals(value)) {
            return value;
        }
        return "NORMAL";
    }
}
