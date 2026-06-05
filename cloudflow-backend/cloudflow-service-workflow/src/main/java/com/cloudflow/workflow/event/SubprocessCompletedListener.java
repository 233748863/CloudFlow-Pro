package com.cloudflow.workflow.event;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * 子流程完成事件监听器
 * 监听 SubprocessCompletedEvent，在子流程完成后恢复父流程的执行。
 *
 * 处理流程：
 * 1. 查找父流程实例，验证状态为 RUNNING
 * 2. 查找父流程定义，解析流程模型 JSON
 * 3. 定位到触发子流程的节点（parentNodeKey）
 * 4. 从该节点的 next 继续执行父流程
 *
 * 使用 @Async 异步执行，避免阻塞子流程的完成逻辑
 *
 * @author CloudFlow
 */
@Component
public class SubprocessCompletedListener {

    private static final Logger log = LoggerFactory.getLogger(SubprocessCompletedListener.class);

    private final WfProcessInstanceMapper processInstanceMapper;
    private final WfProcessDefinitionMapper processDefinitionMapper;
    @Lazy
    private final INodeExecutionService nodeExecutionService;
    private final WorkflowGraphModelResolver workflowGraphModelResolver;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    public SubprocessCompletedListener(WfProcessInstanceMapper processInstanceMapper,
                                        WfProcessDefinitionMapper processDefinitionMapper,
                                        @Lazy INodeExecutionService nodeExecutionService,
                                        WorkflowGraphModelResolver workflowGraphModelResolver) {
        this.processInstanceMapper = processInstanceMapper;
        this.processDefinitionMapper = processDefinitionMapper;
        this.nodeExecutionService = nodeExecutionService;
        this.workflowGraphModelResolver = workflowGraphModelResolver;
    }

    /**
     * 处理子流程完成事件，恢复父流程执行
     */
    @EventListener
    @Async
    public void onSubprocessCompleted(SubprocessCompletedEvent event) {
        String parentInstanceId = event.getParentInstanceId();
        String parentNodeKey = event.getParentNodeKey();
        String childInstanceId = event.getChildInstanceId();

        log.info("[SubprocessCompletedListener] 开始处理子流程完成事件: parentInstanceId={}, parentNodeKey={}, childInstanceId={}",
                parentInstanceId, parentNodeKey, childInstanceId);

        try {
            // 1. 查找父流程实例
            WfProcessInstance parentInstance = processInstanceMapper.selectById(parentInstanceId);
            if (parentInstance == null) {
                log.warn("[SubprocessCompletedListener] 父流程实例不存在, parentInstanceId={}", parentInstanceId);
                return;
            }

            // 2. 验证父流程状态
            if (!WfProcessStatus.RUNNING.getCode().equals(parentInstance.getStatus())) {
                log.warn("[SubprocessCompletedListener] 父流程不在运行状态, parentInstanceId={}, status={}",
                        parentInstanceId, parentInstance.getStatus());
                return;
            }

            // 3. 查找父流程定义
            String definitionId = parentInstance.getDefinitionId();
            WfProcessDefinition parentDef = null;

            if (StringUtils.hasText(definitionId)) {
                parentDef = processDefinitionMapper.selectById(definitionId);
            }

            // 如果通过 definitionId 找不到，尝试通过 processDefKey 找最新已发布版本
            if (parentDef == null && StringUtils.hasText(parentInstance.getProcessDefKey())) {
                parentDef = processDefinitionMapper.selectPage(new Page<>(1, 1, false),
                        new LambdaQueryWrapper<WfProcessDefinition>()
                                .eq(WfProcessDefinition::getProcessKey, parentInstance.getProcessDefKey())
                                .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                                .orderByDesc(WfProcessDefinition::getVersion))
                        .getRecords().stream().findFirst().orElse(null);
            }

            if (parentDef == null) {
                log.error("[SubprocessCompletedListener] 未找到父流程定义, parentInstanceId={}, definitionId={}, processDefKey={}",
                        parentInstanceId, definitionId, parentInstance.getProcessDefKey());
                return;
            }

            if (!StringUtils.hasText(parentDef.getModelJson())) {
                log.error("[SubprocessCompletedListener] 父流程定义模型为空, definitionId={}", parentDef.getDefinitionId());
                return;
            }

            // 4. 解析父流程模型
            WfNodeConfig rootNode = workflowGraphModelResolver.parseRuntimeRoot(parentDef.getModelJson());

            // 5. 定位触发子流程的节点
            WfNodeConfig subprocessNode = nodeExecutionService.findNode(rootNode, parentNodeKey);
            if (subprocessNode == null) {
                log.error("[SubprocessCompletedListener] 在父流程模型中未找到子流程节点, parentNodeKey={}", parentNodeKey);
                return;
            }

            // 6. 解析父流程变量
            Map<String, Object> variables = new HashMap<>();
            if (StringUtils.hasText(parentInstance.getVariables())) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsed = objectMapper.readValue(parentInstance.getVariables(), Map.class);
                    variables.putAll(parsed);
                } catch (Exception e) {
                    log.warn("[SubprocessCompletedListener] 解析父流程变量失败: {}", e.getMessage());
                }
            }

            // 7. 从子流程节点的 next 继续执行父流程
            log.info("[SubprocessCompletedListener] 恢复父流程执行, parentInstanceId={}, 从节点 '{}' 的 next 继续",
                    parentInstanceId, subprocessNode.getTitle());

            nodeExecutionService.advanceAfterNode(parentInstance, subprocessNode, parentNodeKey, variables, 0, rootNode);

            log.info("[SubprocessCompletedListener] 父流程恢复执行成功, parentInstanceId={}", parentInstanceId);

        } catch (Exception e) {
            log.error("[SubprocessCompletedListener] 恢复父流程执行失败, parentInstanceId={}, parentNodeKey={}: {}",
                    parentInstanceId, parentNodeKey, e.getMessage(), e);
        }
    }
}
