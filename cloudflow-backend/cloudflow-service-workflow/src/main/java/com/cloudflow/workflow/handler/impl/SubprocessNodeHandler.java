package com.cloudflow.workflow.handler.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.handler.INodeHandler;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 子流程节点处理器
 * 根据配置的子流程ID（processKey）启动一个新的流程实例
 *
 * 支持两种模式：
 * 1. waitForCompletion=true（默认）：阻塞父流程，等待子流程完成后继续
 * 2. waitForCompletion=false：异步启动子流程，父流程立即继续
 *
 * 前端配置的 props 字段：
 * - subprocessId: 子流程的 processKey
 * - variableMapping: JSON 字符串，定义父流程变量到子流程的映射
 * - waitForCompletion: 是否等待子流程完成（默认 true）
 *
 * @author CloudFlow
 */
@Component
@RequiredArgsConstructor
public class SubprocessNodeHandler implements INodeHandler {

    private static final Logger log = LoggerFactory.getLogger(SubprocessNodeHandler.class);

    private final WfProcessDefinitionMapper processDefinitionMapper;
    private final WfFormDefinitionMapper formDefinitionMapper;
    private final WfProcessInstanceMapper processInstanceMapper;

    /**
     * 使用 @Autowired + @Lazy 字段注入，避免与 @RequiredArgsConstructor 构造器注入产生循环依赖
     * 依赖链: nodeExecutionServiceImpl → nodeHandlerFactory → subprocessNodeHandler → nodeExecutionServiceImpl
     * @Lazy 延迟初始化可打破此循环
     */
    @Autowired
    @Lazy
    private INodeExecutionService nodeExecutionService;
    @Autowired
    private WorkflowGraphModelResolver workflowGraphModelResolver;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Override
    public String getNodeType() {
        return "SUBPROCESS";
    }

    @Override
    public boolean handle(WfNodeConfig node, WfProcessInstance parentInstance, Map<String, Object> variables) {
        log.info("[SubprocessNodeHandler] 执行子流程节点, nodeKey={}, instanceId={}", node.getId(), parentInstance.getInstanceId());

        Map<String, Object> props = node.getProps();
        if (props == null) {
            throw WorkflowException.validationError(
                    "子流程节点[" + node.getTitle() + "]未配置属性，无法启动子流程");
        }

        // 读取子流程 processKey
        String subprocessId = (String) props.get("subprocessId");
        if (!StringUtils.hasText(subprocessId)) {
            throw WorkflowException.validationError(
                    "子流程节点[" + node.getTitle() + "]未配置 subprocessId，无法启动子流程");
        }

        // 是否等待子流程完成
        Object waitObj = props.get("waitForCompletion");
        boolean waitForCompletion = true; // 默认等待
        if (waitObj instanceof Boolean) {
            waitForCompletion = (Boolean) waitObj;
        } else if (waitObj instanceof String) {
            waitForCompletion = !"false".equalsIgnoreCase((String) waitObj);
        }

        // 查找子流程定义（取最新已发布版本）
        WfProcessDefinition subDef = processDefinitionMapper.selectPage(new Page<>(1, 1, false),
                new LambdaQueryWrapper<WfProcessDefinition>()
                        .eq(WfProcessDefinition::getProcessKey, subprocessId)
                        .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                        .orderByDesc(WfProcessDefinition::getVersion))
                .getRecords().stream().findFirst().orElse(null);

        if (subDef == null) {
            throw WorkflowException.processNotFound(subprocessId);
        }

        if (!StringUtils.hasText(subDef.getModelJson())) {
            throw WorkflowException.validationError(
                    "子流程[" + subprocessId + "]定义模型为空，无法启动子流程");
        }
        // 子流程绑定表单被删除时无法继续，交由失败挂起机制处理
        if (StringUtils.hasText(subDef.getFormId()) && formDefinitionMapper.selectById(subDef.getFormId()) == null) {
            throw WorkflowException.validationError(
                    "子流程[" + subprocessId + "]绑定的表单不存在(formId=" + subDef.getFormId() + ")，无法启动子流程");
        }

        // 构建子流程变量：先继承父流程变量，再应用变量映射
        Map<String, Object> subVariables = new HashMap<>();
        if (variables != null) {
            subVariables.putAll(variables);
        }

        // 解析变量映射
        String variableMappingStr = (String) props.get("variableMapping");
        if (StringUtils.hasText(variableMappingStr)) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, String> mapping = objectMapper.readValue(variableMappingStr, Map.class);
                for (Map.Entry<String, String> entry : mapping.entrySet()) {
                    String targetKey = entry.getKey();
                    String sourceExpr = entry.getValue();
                    // 简单变量引用替换: ${varName} -> 从父流程变量中取值
                    if (sourceExpr != null && sourceExpr.startsWith("${") && sourceExpr.endsWith("}")) {
                        String varName = sourceExpr.substring(2, sourceExpr.length() - 1);
                        if (variables != null && variables.containsKey(varName)) {
                            subVariables.put(targetKey, variables.get(varName));
                        }
                    } else {
                        subVariables.put(targetKey, sourceExpr);
                    }
                }
            } catch (Exception e) {
                log.warn("[SubprocessNodeHandler] 解析变量映射失败, nodeKey={}: {}", node.getId(), e.getMessage());
            }
        }

        String subInstanceId = UUID.randomUUID().toString();
        boolean subInstanceInserted = false;
        try {
            // 创建子流程实例
            WfProcessInstance subInstance = new WfProcessInstance();
            subInstance.setInstanceId(subInstanceId);
            subInstance.setProcessDefId(subDef.getDefinitionId());
            subInstance.setProcessDefKey(subDef.getProcessKey());
            // businessKey: 数据库列 NOT NULL，使用 "SUB_" + 子实例ID 作为业务标识
            subInstance.setBusinessKey("SUB_" + subInstanceId.substring(0, 8));
            subInstance.setTitle("[子流程] " + subDef.getProcessName() + " (来自: " + parentInstance.getTitle() + ")");
            subInstance.setStartUserId(parentInstance.getStartUserId());
            subInstance.setStartUserName(parentInstance.getStartUserName());
            subInstance.setStatus(WfProcessStatus.RUNNING.getCode());
            subInstance.setStartTime(LocalDateTime.now());
            // 继承父流程的租户ID和部门ID
            subInstance.setTenantId(parentInstance.getTenantId());
            subInstance.setDeptId(parentInstance.getDeptId());
            // 存储父流程关联信息，便于子流程完成后回调
            subInstance.setParentInstanceId(parentInstance.getInstanceId());
            subInstance.setParentNodeKey(node.getId());

            // 序列化子流程变量
            if (!subVariables.isEmpty()) {
                subInstance.setVariables(objectMapper.writeValueAsString(subVariables));
            }

            processInstanceMapper.insert(subInstance);
            subInstanceInserted = true;

            // 解析子流程模型并启动执行
            WfNodeConfig subRoot = workflowGraphModelResolver.parseRuntimeRoot(subDef.getModelJson());
            WorkflowRuntimeGraph runtimeGraph = workflowGraphModelResolver.resolveRuntimeGraph(subRoot);
            String firstNodeId = runtimeGraph != null
                    ? runtimeGraph.getFirstExecutableNodeId()
                    : workflowGraphModelResolver.resolveFirstExecutableNodeId(subDef.getModelJson());
            WfNodeConfig firstNode = StringUtils.hasText(firstNodeId)
                    ? nodeExecutionService.findNode(subRoot, firstNodeId)
                    : subRoot;
            if (firstNode == null) {
                throw WorkflowException.validationError("子流程启动失败：未找到首个可执行节点");
            }
            nodeExecutionService.runNode(subInstance, firstNode, subVariables, 0, subRoot);

            log.info("[SubprocessNodeHandler] 子流程已启动, subInstanceId={}, subProcessKey={}, waitForCompletion={}",
                    subInstance.getInstanceId(), subprocessId, waitForCompletion);

        } catch (Exception e) {
            log.error("[SubprocessNodeHandler] 启动子流程失败, nodeKey={}, subprocessId={}: {}",
                    node.getId(), subprocessId, e.getMessage(), e);
            // 清理半启动的子实例，避免重试时残留 RUNNING 状态的孤儿实例
            if (subInstanceInserted) {
                try {
                    WfProcessInstance orphan = processInstanceMapper.selectById(subInstanceId);
                    if (orphan != null && WfProcessStatus.RUNNING.getCode().equals(orphan.getStatus())) {
                        orphan.setStatus(WfProcessStatus.INVALIDATED.getCode());
                        orphan.setEndTime(LocalDateTime.now());
                        processInstanceMapper.updateById(orphan);
                    }
                } catch (Exception cleanupEx) {
                    log.error("[SubprocessNodeHandler] 清理失败子实例异常, subInstanceId={}: {}",
                            subInstanceId, cleanupEx.getMessage());
                }
            }
            // 抛出异常，交由 executeWithRetry 统一重试；重试耗尽后挂起父流程
            if (e instanceof WorkflowException) {
                throw (WorkflowException) e;
            }
            throw new WorkflowException("SUBPROCESS_START_FAILED",
                    "子流程[" + subprocessId + "]启动失败: " + e.getMessage(), e);
        }

        // waitForCompletion=true 时阻塞父流程，等待子流程完成后由回调触发继续
        // waitForCompletion=false 时父流程立即继续
        return !waitForCompletion;
    }
}
