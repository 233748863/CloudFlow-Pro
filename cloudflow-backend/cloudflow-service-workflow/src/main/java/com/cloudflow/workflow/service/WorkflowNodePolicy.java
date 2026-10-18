package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Objects;

@Service
@RequiredArgsConstructor
public class WorkflowNodePolicy {
    private final WfProcessInstanceMapper instanceMapper;
    private final WfProcessDefinitionMapper definitionMapper;
    private final WorkflowGraphModelResolver graphResolver;

    public WfNodeConfig resolveNode(WfProcessInstance instance, String nodeKey) {
        if (instance == null) {
            return null;
        }
        WfProcessDefinition definition;
        if (StringUtils.hasText(instance.getDefinitionId())) {
            definition = definitionMapper.selectById(instance.getDefinitionId());
        } else {
            definition = definitionMapper.selectPage(new Page<>(1, 1, false),
                    new LambdaQueryWrapper<WfProcessDefinition>()
                            .eq(WfProcessDefinition::getTenantId, instance.getTenantId())
                            .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                            .orderByDesc(WfProcessDefinition::getVersion)).getRecords().stream().findFirst().orElse(null);
        }
        if (definition == null || !StringUtils.hasText(definition.getModelJson())) {
            return null;
        }
        if (!Objects.equals(instance.getTenantId(), definition.getTenantId())) {
            throw WorkflowException.permissionDenied("节点配置租户不匹配");
        }
        return graphResolver.parseRuntimeGraph(definition.getModelJson()).getNode(nodeKey);
    }

    public void assertTaskAllowed(WfTask task, String action) {
        WfProcessInstance instance = instanceMapper.selectById(task.getInstanceId());
        assertAllowed(resolveNode(instance, task.getNodeKey()), action);
    }

    public static boolean allows(WfNodeConfig node, String action) {
        if ("allowAgent".equals(action)) return node != null && Boolean.TRUE.equals(node.getAllowAgent());
        if (node == null) {
            return true;
        }
        Boolean allowed = switch (action) {
            case "allowAddSign" -> node.getAllowAddSign();
            case "allowReduceSign" -> node.getAllowReduceSign();
            case "allowDelegate" -> node.getAllowDelegate();
            case "allowUrge" -> node.getAllowUrge();
            case "allowRollback" -> node.getAllowRollback();
            case "allowCc" -> node.getAllowCc();
            case "allowSelection" -> node.getAllowSelection();
            default -> throw WorkflowException.validationError("未知节点操作: " + action);
        };
        return !Boolean.FALSE.equals(allowed);
    }

    public static java.util.Map<String, Boolean> permissions(WfNodeConfig node) {
        java.util.Map<String, Boolean> result = new java.util.LinkedHashMap<>();
        for (String action : java.util.List.of("allowAddSign", "allowReduceSign", "allowDelegate", "allowUrge",
                "allowRollback", "allowCc", "allowSelection", "allowAgent")) {
            result.put(action, allows(node, action));
        }
        return result;
    }

    public static void assertAllowed(WfNodeConfig node, String action) {
        if (!allows(node, action)) {
            throw new WorkflowException("NODE_ACTION_FORBIDDEN", "当前节点不允许该操作: " + action);
        }
    }

    public static String timeoutAction(WfNodeConfig node) {
        String action = node == null || node.getSlaAction() == null ? "AUTO_PASS" : node.getSlaAction();
        if (!"AUTO_PASS".equals(action) && !"AUTO_REJECT".equals(action)) {
            throw WorkflowException.validationError("未知任务超时动作: " + action);
        }
        return action;
    }
}
