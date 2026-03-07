package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.handler.NodeHandlerFactory;
import com.cloudflow.workflow.expression.ConditionExpressionEngine;
import com.cloudflow.workflow.job.TaskReminderJob;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.model.WorkflowModelBridge;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.*;
import com.cloudflow.workflow.listener.GlobalListenerDispatcher;
import com.cloudflow.workflow.strategy.AssignUserStrategyFactory;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 节点执行引擎服务实现
 * 从 WorkflowServiceImpl 拆分而来，负责所有节点执行、条件评估、人员分配等核心引擎逻辑
 *
 * @author CloudFlow
 */
@Service
public class NodeExecutionServiceImpl implements INodeExecutionService {

    private static final Logger log = LoggerFactory.getLogger(NodeExecutionServiceImpl.class);

    @Autowired
    private RedissonClient redissonClient;
    @Autowired
    private RedisCache redisCache;
    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;
    @Autowired
    private WfTaskMapper taskMapper;
    @Autowired
    private WfProcessSnapshotMapper snapshotMapper;
    @Autowired
    private SysUserMapper sysUserMapper;
    @Autowired
    private SysRoleMapper sysRoleMapper;
    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;
    @Autowired
    private SysDeptMapper sysDeptMapper;
    @Autowired
    private ISysNoticeService sysNoticeService;
    @Autowired
    private WorkflowProperties workflowProperties;
    @Autowired
    private WorkflowSecurityUtils securityUtils;
    @Autowired
    private WorkflowEventPublisher workflowEventPublisher;
    @Autowired
    private ICountersignService countersignService;
    @Autowired
    private NodeHandlerFactory nodeHandlerFactory;
    @Autowired
    private AssignUserStrategyFactory assignUserStrategyFactory;
    @Autowired
    private ConditionExpressionEngine conditionExpressionEngine;
    @Autowired
    private TaskReminderJob taskReminderJob;
    @Autowired
    private GlobalListenerDispatcher globalListenerDispatcher;
    @Autowired
    private com.cloudflow.workflow.service.monitor.IProcessMonitorService processMonitorService;
    @Autowired
    private com.cloudflow.workflow.service.monitor.IAnomalyDetectionService anomalyDetectionService;
    @Autowired
    private WorkflowModelBridge workflowModelBridge;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    // ==================== 核心节点执行 ====================

    @Override
    public void runNode(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables, int depth, WfNodeConfig rootNode) {
        // 深度限制检查
        int maxDepth = workflowProperties.getEngine().getMaxDepth();
        if (depth > maxDepth) {
            throw new RuntimeException("流程深度超出限制（最大 " + maxDepth + "，可能检测到循环）");
        }

        if (node == null) {
            // 流程结束
            completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
            return;
        }

        // 并行汇聚检查
        try {
            if (rootNode != null) {
                WfNodeConfig gateway = findParentGateway(rootNode, node.getId());
                if (gateway != null) {
                    String joinKey = "sys:wf:join:" + instance.getInstanceId() + ":" + gateway.getId();
                    RLock joinLock = redissonClient.getLock("lock:join:" + instance.getInstanceId() + ":" + gateway.getId());
                    try {
                        if (joinLock.tryLock(5, 10, TimeUnit.SECONDS)) {
                            long count = redisCache.increment(joinKey);
                            if (count == 1) {
                                // P1-14: 将过期时间从 1 小时延长到 24 小时，防止长时间分支执行导致计数器过期
                                // 24 小时足以覆盖绝大多数业务场景，超过此时间的流程应通过 SLA 超时机制处理
                                redisCache.expire(joinKey, 24, TimeUnit.HOURS);
                            }
                            int totalBranches = resolveBranchRouting(gateway, rootNode).branches().size();
                            // P1-14: 防御性检查 - 如果 count 超过 totalBranches，说明计数器可能被重置过
                            if (count > totalBranches && totalBranches > 0) {
                                log.warn("[runNode] 并行汇聚计数异常: instanceId={}, gatewayId={}, count={}, totalBranches={}，" +
                                         "可能是 Redis key 过期后重新计数，强制继续执行",
                                    instance.getInstanceId(), gateway.getId(), count, totalBranches);
                                redisCache.deleteObject(joinKey);
                                // 不 return，继续执行后续节点
                            } else if (count < totalBranches) {
                                return; // 等待其他分支
                            } else {
                                redisCache.deleteObject(joinKey);
                            }
                        } else {
                            throw new RuntimeException("获取并行网关锁超时");
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException("并行网关处理被中断");
                    } finally {
                        if (joinLock.isHeldByCurrentThread()) {
                            joinLock.unlock();
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[runNode] 并行汇聚检查异常: {}", e.getMessage());
        }

        // P2-10: inputs 数据流映射 — 节点执行前，从流程变量提取到节点局部作用域
        // inputs 配置格式: {"localVar": "processVar"} — 将流程变量 processVar 的值映射为节点可见的 localVar
        applyInputsMapping(node, variables);

        // 全局监听器 — 节点开始执行前回调
        globalListenerDispatcher.fireStart(instance, node, variables);

        // 按节点类型分发处理
        if ("APPROVAL".equals(node.getType())) {
            handleApprovalNode(node, instance, variables);
        } else if (nodeHandlerFactory.supports(node.getType())) {
            // 通过节点处理器工厂分发（NOTIFICATION/SCRIPT/COPY/TIMER/SUBPROCESS/MANUAL 等）
            // P2-9: 节点级重试 — 读取 node.getRetry() 配置，失败时自动重试
            Boolean shouldContinue = executeWithRetry(node, instance, variables);
            if (Boolean.TRUE.equals(shouldContinue)) {
                // P2-10: outputs 数据流映射 — 节点执行后，将节点输出写回流程变量
                applyOutputsMapping(node, variables, instance);
                // 全局监听器 — 非审批节点执行完成后回调
                globalListenerDispatcher.fireFinish(instance, node, variables);
                advanceAfterNode(instance, node, node.getId(), variables, depth, rootNode);
            }
        } else if ("CONDITION".equals(node.getType()) || "GATEWAY".equals(node.getType())) {
            handleConditionGateway(node, instance, variables, depth, rootNode);
        } else if ("PARALLEL".equals(node.getType())) {
            handleParallelGateway(node, instance, variables, depth, rootNode);
        } else if ("END".equals(node.getType())) {
            completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
        } else {
            // 未知或开始节点，直接继续
            advanceAfterNode(instance, node, node.getId(), variables, depth, rootNode);
        }
    }

    /**
     * 处理审批节点：创建审批任务或会签任务
     */
    private void handleApprovalNode(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        // 检查是否为会签节点
        String signType = node.getSignType();
        if (signType != null && !signType.isEmpty()) {
            // 会签模式
            List<Long> assigneeIds = resolveMultipleAssignees(node, instance);
            if (assigneeIds == null || assigneeIds.isEmpty()) {
                assigneeIds = new ArrayList<>();
                Long singleAssignee = resolveAssignee(node, instance);
                assigneeIds.add(singleAssignee != null ? singleAssignee : 1L);
            }

            Integer passPercent = node.getPassPercent();
            countersignService.createCountersignTask(
                instance.getInstanceId(), node.getId(), node.getTitle(),
                signType, passPercent, assigneeIds
            );

            for (Long assigneeId : assigneeIds) {
                sysNoticeService.sendNotice(assigneeId, "会签任务通知",
                    "您有一个新的会签任务: " + node.getTitle() + " (流程: " + instance.getTitle() + ")",
                    "1", UserContext.getUserId(), UserContext.getUserName());
            }
            log.info("[runNode] 会签任务已创建, nodeKey={}, signType={}, assignees={}", node.getId(), signType, assigneeIds.size());
            return;
        }

        // 普通审批模式：创建单个用户任务
        WfTask task = new WfTask();
        task.setTaskId(UUID.randomUUID().toString());
        task.setInstanceId(instance.getInstanceId());
        task.setNodeName(node.getTitle());
        task.setNodeKey(node.getId());

        Long assigneeId = resolveAssignee(node, instance);
        task.setAssignee(assigneeId != null ? assigneeId : 1L);
        task.setStatus(WfTaskStatus.TODO.getCode());
        task.setCreateTime(LocalDateTime.now());
        taskMapper.insert(task);

        // P2-9: 全局监听器 — 审批任务分配后回调
        globalListenerDispatcher.fireAssignment(instance, task, node);

        // 发送通知
        sysNoticeService.sendNotice(task.getAssignee(), "待办任务通知",
            "您有一个新的待办任务: " + node.getTitle() + " (流程: " + instance.getTitle() + ")",
            "1", UserContext.getUserId(), UserContext.getUserName());

        // SLA 超时注册
        if (node.getSlaHours() != null && node.getSlaHours() > 0) {
            long expireTime = System.currentTimeMillis() + node.getSlaHours() * 3600 * 1000L;
            redisCache.setCacheZSet("sys:task:timeouts", task.getTaskId(), (double) expireTime);
            taskReminderJob.registerReminders(task.getTaskId(), node.getSlaHours());
        }

        // 发布任务分配事件
        String assigneeName = null;
        if (task.getAssignee() != null) {
            SysUser assigneeUser = sysUserMapper.selectById(task.getAssignee());
            if (assigneeUser != null) {
                assigneeName = assigneeUser.getNickName() != null ? assigneeUser.getNickName() : assigneeUser.getUserName();
            }
        }
        workflowEventPublisher.publishTaskAssigned(instance, task.getTaskId(), node.getId(), node.getTitle(), task.getAssignee(), assigneeName);
    }

    /**
     * 处理排他网关（条件分支）
     */
    private void handleConditionGateway(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables, int depth, WfNodeConfig rootNode) {
        BranchRouting routing = resolveBranchRouting(node, rootNode);
        List<WfNodeConfig> branches = routing.branches();
        boolean branchTaken = false;
        if (branches != null && !branches.isEmpty()) {
            for (WfNodeConfig branch : branches) {
                if (evaluateCondition(branch.getCondition(), variables)) {
                    WfNodeConfig branchEntry = resolveExclusiveBranchEntry(branch, rootNode);
                    runNode(instance, branchEntry, variables, depth + 1, rootNode);
                    branchTaken = true;
                    return;
                }
            }
        }
        if (!branchTaken) {
            // P1-9: 排他网关无分支匹配时记录告警日志，便于排查配置问题。
            if (branches != null && !branches.isEmpty()) {
                List<String> conditions = branches.stream()
                    .map(b -> b.getCondition() != null ? b.getCondition() : "(空)")
                    .collect(Collectors.toList());
                log.warn("[handleConditionGateway] 排他网关 '{}' (id={}) 所有分支条件均不满足，将走默认路径(next)。 instanceId={}, 分支条件={}, 当前变量={}",
                    node.getTitle(), node.getId(), instance.getInstanceId(), conditions, variables);
            }
            runNode(instance, routing.defaultNext(), variables, depth + 1, rootNode);
        }
    }

    /**
     * 处理并行网关
     * 并行网关的所有分支都会被执行（不评估条件），分支执行完毕后在汇合点等待所有分支完成
     *
     * 关键修复：前端数据模型中，并行网关的分支头节点类型为 CONDITION（仅作为分支标签/描述使用），
     * 但 CONDITION 类型在 runNode() 中会走 handleConditionGateway() 逻辑去评估条件表达式。
     * 并行网关的语义是"所有分支都执行"，不应该评估条件。
     * 因此这里对 CONDITION 类型的分支头节点做特殊处理：跳过条件评估，直接执行其 next 链。
     */
    private void handleParallelGateway(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables, int depth, WfNodeConfig rootNode) {
        BranchRouting routing = resolveBranchRouting(node, rootNode);
        List<WfNodeConfig> branches = routing.branches();
        if (branches != null) {
            for (WfNodeConfig branch : branches) {
                WfNodeConfig branchEntry = resolveParallelBranchEntry(branch, rootNode);
                runNode(instance, branchEntry, variables, depth + 1, rootNode);
            }
        }
    }

    private WorkflowRuntimeGraph resolveRuntimeGraph(WfNodeConfig rootNode) {
        return workflowModelBridge.resolveRuntimeGraph(rootNode);
    }

    private WorkflowRuntimeGraph requireRuntimeGraph(WfNodeConfig rootNode) {
        WorkflowRuntimeGraph runtimeGraph = resolveRuntimeGraph(rootNode);
        if (runtimeGraph == null) {
            throw WorkflowException.validationError("流程运行时图索引缺失，仅支持 nodes+edges 主模型");
        }
        return runtimeGraph;
    }

    /**
     * 统一解析节点分支与默认后继（仅支持 nodes+edges 运行时图索引）。
     */
    private BranchRouting resolveBranchRouting(WfNodeConfig currentNode, WfNodeConfig rootNode) {
        if (currentNode == null) {
            return BranchRouting.empty();
        }

        if (!StringUtils.hasText(currentNode.getId())) {
            throw WorkflowException.validationError("节点ID缺失，无法按图模型流转");
        }
        WorkflowRuntimeGraph runtimeGraph = requireRuntimeGraph(rootNode);

        List<WorkflowRuntimeGraph.EdgeLink> outgoingEdges = runtimeGraph.getOutgoingEdges(currentNode.getId());
        if (outgoingEdges == null || outgoingEdges.isEmpty()) {
            return BranchRouting.empty();
        }

        if (outgoingEdges.size() == 1) {
            WorkflowRuntimeGraph.EdgeLink edge = outgoingEdges.get(0);
            WfNodeConfig nextNode = runtimeGraph.getNode(edge.getTargetId());
            applyEdgeCondition(nextNode, edge.getCondition());
            return new BranchRouting(List.of(), nextNode);
        }

        WorkflowRuntimeGraph.EdgeLink defaultEdge = null;
        for (WorkflowRuntimeGraph.EdgeLink edge : outgoingEdges) {
            if (edge.isDefault()) {
                defaultEdge = edge;
                break;
            }
        }

        List<WfNodeConfig> branchNodes = new ArrayList<>();
        WfNodeConfig defaultNext = null;
        for (WorkflowRuntimeGraph.EdgeLink edge : outgoingEdges) {
            WfNodeConfig targetNode = runtimeGraph.getNode(edge.getTargetId());
            if (targetNode == null) {
                continue;
            }
            applyEdgeCondition(targetNode, edge.getCondition());
            if (defaultEdge != null && edge == defaultEdge) {
                defaultNext = targetNode;
            } else {
                branchNodes.add(targetNode);
            }
        }

        if (defaultEdge == null) {
            // 无默认边时，全部出边都视为分支。
            return new BranchRouting(branchNodes, null);
        }
        return new BranchRouting(branchNodes, defaultNext);
    }

    private void applyEdgeCondition(WfNodeConfig targetNode, String edgeCondition) {
        if (targetNode == null) {
            return;
        }
        if (!StringUtils.hasText(targetNode.getCondition()) && StringUtils.hasText(edgeCondition)) {
            targetNode.setCondition(edgeCondition);
        }
    }

    private WfNodeConfig resolveParallelBranchEntry(WfNodeConfig branch, WfNodeConfig rootNode) {
        if (branch == null) {
            return null;
        }
        if ("CONDITION".equals(branch.getType())) {
            BranchRouting routing = resolveBranchRouting(branch, rootNode);
            if (routing.defaultNext() != null) {
                return routing.defaultNext();
            }
            if (routing.branches() != null && !routing.branches().isEmpty()) {
                return routing.branches().get(0);
            }
        }
        return branch;
    }

    private WfNodeConfig resolveExclusiveBranchEntry(WfNodeConfig branch, WfNodeConfig rootNode) {
        if (branch == null) {
            return null;
        }
        if ("CONDITION".equals(branch.getType())) {
            BranchRouting routing = resolveBranchRouting(branch, rootNode);
            if (routing.defaultNext() != null) {
                return routing.defaultNext();
            }
            if (routing.branches() != null && !routing.branches().isEmpty()) {
                return routing.branches().get(0);
            }
        }
        return branch;
    }

    private record BranchRouting(List<WfNodeConfig> branches, WfNodeConfig defaultNext) {
        private static BranchRouting empty() {
            return new BranchRouting(List.of(), null);
        }
    }

    // ==================== 流转逻辑 ====================

    @Override
    public void advanceAfterNode(WfProcessInstance instance, WfNodeConfig currentNode, String currentNodeKey,
                                  Map<String, Object> variables, int depth, WfNodeConfig rootNode) {
        if (currentNode == null) {
            completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
            return;
        }

        BranchRouting routing = resolveBranchRouting(currentNode, rootNode);
        List<WfNodeConfig> branches = routing.branches();

        if (branches != null && !branches.isEmpty()) {
            String strategy = StringUtils.hasText(currentNode.getBranchStrategy())
                ? currentNode.getBranchStrategy().trim().toUpperCase(Locale.ROOT)
                : "EXCLUSIVE";

            if (!"EXCLUSIVE".equals(strategy) && !"PARALLEL".equals(strategy) && !"RACE".equals(strategy)) {
                throw WorkflowException.validationError(String.format(
                    "节点 %s(%s) 的 branchStrategy=%s 非法，仅支持 EXCLUSIVE/PARALLEL/RACE",
                    currentNode.getTitle(), currentNode.getId(), strategy));
            }

            // 严格模式：仅并行网关允许 PARALLEL/RACE，其他节点配置该策略直接报错
            if (!"PARALLEL".equals(currentNode.getType()) && ("PARALLEL".equals(strategy) || "RACE".equals(strategy))) {
                throw WorkflowException.validationError(String.format(
                    "节点 %s(%s) 类型为 %s，不允许使用分支策略 %s",
                    currentNode.getTitle(), currentNode.getId(), currentNode.getType(), strategy));
            }

            if ("PARALLEL".equals(strategy) || "RACE".equals(strategy)) {
                for (WfNodeConfig branch : branches) {
                    WfNodeConfig branchEntry = resolveParallelBranchEntry(branch, rootNode);
                    runNode(instance, branchEntry, variables, depth + 1, rootNode);
                }
                return;
            }

            // EXCLUSIVE
            boolean exclusiveBranchTaken = false;
            for (WfNodeConfig branch : branches) {
                if (evaluateCondition(branch.getCondition(), variables)) {
                    exclusiveBranchTaken = true;
                    WfNodeConfig branchEntry = resolveExclusiveBranchEntry(branch, rootNode);
                    runNode(instance, branchEntry, variables, depth + 1, rootNode);
                    return;
                }
            }

            if (!exclusiveBranchTaken) {
                List<String> conditions = branches.stream()
                    .map(b -> b.getCondition() != null ? b.getCondition() : "(空)")
                    .collect(Collectors.toList());
                log.warn("[advanceAfterNode] 排他网关 '{}' (id={}) 所有分支条件均不满足，将走默认路径(next)。 instanceId={}, 分支条件={}, 当前变量={}",
                    currentNode.getTitle(), currentNode.getId(), instance.getInstanceId(), conditions, variables);
            }
        }

        WfNodeConfig nextNode = routing.defaultNext();
        if (nextNode == null) {
            nextNode = findNextNode(rootNode, currentNodeKey);
        }

        if (nextNode != null) {
            runNode(instance, nextNode, variables, depth + 1, rootNode);
        } else {
            completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
        }
    }

    @Override
    public void completeInstance(WfProcessInstance instance, String status) {
        instance.setStatus(status);
        instance.setEndTime(LocalDateTime.now());
        processInstanceMapper.updateById(instance);

        // 记录流程结束监控
        try {
            String errorMessage = null;
            if ("FAILED".equals(status) || "TERMINATED".equals(status)) {
                errorMessage = "流程" + ("FAILED".equals(status) ? "失败" : "终止");
            }
            processMonitorService.recordProcessEnd(instance.getInstanceId(), status, errorMessage);
        } catch (Exception e) {
            log.warn("[completeInstance] 记录流程结束监控失败: {}", e.getMessage());
        }

        if (WfProcessStatus.COMPLETED.getCode().equals(status)) {
            workflowEventPublisher.publishProcessCompleted(instance);
        }

        // P2-9: 全局监听器 — 流程结束回调
        globalListenerDispatcher.fireFinish(instance, null, null);

        // 子流程完成后回调父流程：如果当前实例是子流程，发布事件通知父流程继续流转
        if (WfProcessStatus.COMPLETED.getCode().equals(status)
                && StringUtils.hasText(instance.getParentInstanceId())
                && StringUtils.hasText(instance.getParentNodeKey())) {
            try {
                workflowEventPublisher.publishSubprocessCompleted(
                        instance.getParentInstanceId(),
                        instance.getParentNodeKey(),
                        instance.getInstanceId());
                log.info("[completeInstance] 子流程完成事件已发布, parentInstanceId={}, parentNodeKey={}, childInstanceId={}",
                        instance.getParentInstanceId(), instance.getParentNodeKey(), instance.getInstanceId());
            } catch (Exception e) {
                log.error("[completeInstance] 发布子流程完成事件失败, parentInstanceId={}, parentNodeKey={}: {}",
                        instance.getParentInstanceId(), instance.getParentNodeKey(), e.getMessage(), e);
            }
        }
    }


    // ==================== 节点查找 ====================

    @Override
    public WfNodeConfig findNode(WfNodeConfig root, String nodeId) {
        if (root == null || !StringUtils.hasText(nodeId)) {
            return null;
        }
        return requireRuntimeGraph(root).getNode(nodeId);
    }

    @Override
    public WfNodeConfig findNextNode(WfNodeConfig root, String currentNodeId) {
        if (root == null || !StringUtils.hasText(currentNodeId)) {
            return null;
        }
        WorkflowRuntimeGraph runtimeGraph = requireRuntimeGraph(root);
        WorkflowRuntimeGraph.EdgeLink edge = runtimeGraph.findDefaultOrFirstOutgoingEdge(currentNodeId);
        if (edge == null) {
            return null;
        }
        WfNodeConfig nextNode = runtimeGraph.getNode(edge.getTargetId());
        applyEdgeCondition(nextNode, edge.getCondition());
        return nextNode;
    }

    private WfNodeConfig findParentGateway(WfNodeConfig root, String targetNodeId) {
        if (root == null || !StringUtils.hasText(targetNodeId)) {
            return null;
        }

        WorkflowRuntimeGraph runtimeGraph = requireRuntimeGraph(root);
        for (String nodeId : runtimeGraph.getNodeIds()) {
            WfNodeConfig candidate = runtimeGraph.getNode(nodeId);
            if (candidate == null || !"PARALLEL".equals(candidate.getType())) {
                continue;
            }
            WorkflowRuntimeGraph.EdgeLink defaultEdge = null;
            for (WorkflowRuntimeGraph.EdgeLink edge : runtimeGraph.getOutgoingEdges(nodeId)) {
                if (edge.isDefault()) {
                    defaultEdge = edge;
                    break;
                }
            }
            if (defaultEdge != null && targetNodeId.equals(defaultEdge.getTargetId())) {
                return candidate;
            }
        }
        return null;
    }

    // ==================== 条件评估 ====================

    @Override
    public boolean evaluateCondition(String condition, Map<String, Object> variables) {
        if (!StringUtils.hasText(condition)) return true;
        String trimmed = condition.trim();
        if (!trimmed.startsWith("{")) {
            try {
                securityUtils.validateSpelExpression(condition);
            } catch (Exception e) {
                log.warn("[evaluateCondition] SpEL 表达式安全校验失败: {}", e.getMessage());
                return false;
            }
        }
        return conditionExpressionEngine.evaluate(condition, variables);
    }

    // ==================== 人员分配 ====================

    @Override
    public Long resolveAssignee(WfNodeConfig node, WfProcessInstance instance) {
        return assignUserStrategyFactory.resolve(node, instance);
    }

    @Override
    public List<Long> resolveMultipleAssignees(WfNodeConfig node, WfProcessInstance instance) {
        return assignUserStrategyFactory.resolveMultiple(node, instance);
    }

    @Override
    public String resolveAssigneeDescription(String approverType, String approverValue) {
        return assignUserStrategyFactory.getDescription(approverType, approverValue);
    }

    // ==================== 步骤提取与详情构建 ====================

    @Override
    public List<Map<String, String>> extractApprovalSteps(WfNodeConfig root) {
        List<Map<String, String>> steps = new ArrayList<>();
        WorkflowRuntimeGraph runtimeGraph = requireRuntimeGraph(root);
        String entryNodeId = StringUtils.hasText(runtimeGraph.getFirstExecutableNodeId())
                ? runtimeGraph.getFirstExecutableNodeId()
                : runtimeGraph.getStartNodeId();
        collectApprovalStepsByGraph(root, entryNodeId, steps, new HashSet<>());
        return steps;
    }

    private void collectApprovalStepsByGraph(WfNodeConfig root,
                                             String nodeId,
                                             List<Map<String, String>> steps,
                                             Set<String> visited) {
        if (!StringUtils.hasText(nodeId) || visited.contains(nodeId)) {
            return;
        }
        visited.add(nodeId);

        WfNodeConfig node = findNode(root, nodeId);
        if (node == null) {
            return;
        }

        BranchRouting routing = resolveBranchRouting(node, root);

        if ("PARALLEL".equals(node.getType())) {
            Map<String, String> step = new HashMap<>();
            step.put("nodeKey", node.getId());
            step.put("nodeTitle", node.getTitle() != null ? node.getTitle() : "并行审批");
            step.put("nodeType", "PARALLEL");
            step.put("branchStrategy", node.getBranchStrategy() != null ? node.getBranchStrategy() : "PARALLEL");
            if (routing.branches() != null && !routing.branches().isEmpty()) {
                try {
                    List<List<Map<String, String>>> branchStepsList = new ArrayList<>();
                    for (WfNodeConfig branch : routing.branches()) {
                        WfNodeConfig branchEntry = resolveParallelBranchEntry(branch, root);
                        if (branchEntry == null || !StringUtils.hasText(branchEntry.getId())) {
                            continue;
                        }
                        List<Map<String, String>> branchSteps = new ArrayList<>();
                        collectApprovalStepsByGraph(root, branchEntry.getId(), branchSteps, new HashSet<>(visited));
                        branchStepsList.add(branchSteps);
                    }
                    step.put("branches", objectMapper.writeValueAsString(branchStepsList));
                } catch (Exception e) {
                    step.put("branches", "[]");
                }
            }
            steps.add(step);
            if (routing.defaultNext() != null && StringUtils.hasText(routing.defaultNext().getId())) {
                collectApprovalStepsByGraph(root, routing.defaultNext().getId(), steps, visited);
            }
            return;
        }

        if ("CONDITION".equals(node.getType()) || "GATEWAY".equals(node.getType())) {
            Map<String, String> step = new HashMap<>();
            step.put("nodeKey", node.getId());
            step.put("nodeTitle", node.getTitle() != null ? node.getTitle() : "条件分支");
            step.put("nodeType", "CONDITION");
            step.put("branchStrategy", "EXCLUSIVE");
            if (routing.branches() != null && !routing.branches().isEmpty()) {
                try {
                    List<List<Map<String, String>>> branchStepsList = new ArrayList<>();
                    for (WfNodeConfig branch : routing.branches()) {
                        WfNodeConfig branchEntry = resolveExclusiveBranchEntry(branch, root);
                        if (branchEntry == null || !StringUtils.hasText(branchEntry.getId())) {
                            continue;
                        }
                        List<Map<String, String>> branchSteps = new ArrayList<>();
                        collectApprovalStepsByGraph(root, branchEntry.getId(), branchSteps, new HashSet<>(visited));
                        branchStepsList.add(branchSteps);
                    }
                    step.put("branches", objectMapper.writeValueAsString(branchStepsList));
                } catch (Exception e) {
                    step.put("branches", "[]");
                }
            }
            steps.add(step);
            if (routing.defaultNext() != null && StringUtils.hasText(routing.defaultNext().getId())) {
                collectApprovalStepsByGraph(root, routing.defaultNext().getId(), steps, visited);
            }
            return;
        }

        if ("APPROVAL".equals(node.getType()) || "MANUAL".equals(node.getType())) {
            Map<String, String> step = new HashMap<>();
            step.put("nodeKey", node.getId());
            step.put("nodeTitle", node.getTitle());
            step.put("nodeType", node.getType());
            step.put("approverType", node.getApproverType());
            step.put("approverValue", node.getApproverValue());
            if (node.getSignType() != null && !node.getSignType().isEmpty()) {
                step.put("signType", node.getSignType());
                if (node.getPassPercent() != null) {
                    step.put("passPercent", String.valueOf(node.getPassPercent()));
                }
            }
            steps.add(step);
        }

        if (routing.defaultNext() != null && StringUtils.hasText(routing.defaultNext().getId())) {
            collectApprovalStepsByGraph(root, routing.defaultNext().getId(), steps, visited);
        }
    }

    @Override
    public List<Map<String, Object>> buildAllStepsDetail(List<Map<String, String>> steps,
                                                          List<WfTaskHistory> histories,
                                                          String currentNodeKey) {
        List<Map<String, Object>> details = new ArrayList<>();
        // 添加"发起申请"作为第一步
        Map<String, Object> startStep = new HashMap<>();
        startStep.put("nodeKey", "_start");
        startStep.put("nodeTitle", "发起申请");
        startStep.put("stepIndex", 0);
        startStep.put("nodeType", "START");
        startStep.put("approverType", "INITIATOR");
        startStep.put("approverTypeLabel", "发起人");
        startStep.put("approverDescription", "发起人");
        startStep.put("approverUsers", new ArrayList<>());
        startStep.put("status", "completed");
        details.add(startStep);

        for (int i = 0; i < steps.size(); i++) {
            details.add(buildStepDetail(steps.get(i), i, histories, currentNodeKey));
        }
        return details;
    }

    /**
     * 构建单个步骤的审批人详情信息
     */
    private Map<String, Object> buildStepDetail(Map<String, String> step, int index,
                                                  List<WfTaskHistory> histories, String currentNodeKey) {
        Map<String, Object> detail = new HashMap<>();
        String nodeKey = step.get("nodeKey");
        String nodeType = step.get("nodeType");
        String approverType = step.get("approverType");
        String approverValue = step.get("approverValue");

        detail.put("nodeKey", nodeKey);
        detail.put("nodeTitle", step.get("nodeTitle"));
        detail.put("stepIndex", index + 1);
        detail.put("nodeType", nodeType != null ? nodeType : "APPROVAL");

        // 会签信息
        String signType = step.get("signType");
        if (StringUtils.hasText(signType)) {
            detail.put("signType", signType);
            String passPercent = step.get("passPercent");
            if (StringUtils.hasText(passPercent)) {
                detail.put("passPercent", Integer.parseInt(passPercent));
            }
        }

        // 并行/条件网关节点
        if ("PARALLEL".equals(nodeType) || "CONDITION".equals(nodeType)) {
            String branchStrategy = step.get("branchStrategy");
            detail.put("branchStrategy", branchStrategy != null ? branchStrategy : ("PARALLEL".equals(nodeType) ? "PARALLEL" : "EXCLUSIVE"));
            detail.put("approverType", "");
            detail.put("approverTypeLabel", "PARALLEL".equals(nodeType) ? "并行审批" : "条件分支");
            detail.put("approverDescription", "PARALLEL".equals(nodeType) ? "并行审批" : "条件分支");
            detail.put("approverUsers", new ArrayList<>());

            String branchesJson = step.get("branches");
            if (StringUtils.hasText(branchesJson)) {
                try {
                    @SuppressWarnings("unchecked")
                    List<List<Map<String, String>>> branchStepsList = objectMapper.readValue(branchesJson, List.class);
                    List<List<Map<String, Object>>> branchDetails = new ArrayList<>();
                    for (List<Map<String, String>> branchSteps : branchStepsList) {
                        List<Map<String, Object>> branchDetail = new ArrayList<>();
                        for (int bi = 0; bi < branchSteps.size(); bi++) {
                            branchDetail.add(buildStepDetail(branchSteps.get(bi), bi, histories, currentNodeKey));
                        }
                        branchDetails.add(branchDetail);
                    }
                    detail.put("branches", branchDetails);
                } catch (Exception e) {
                    detail.put("branches", new ArrayList<>());
                }
            } else {
                detail.put("branches", new ArrayList<>());
            }

            String gatewayStatus = determineGatewayStatus(detail, currentNodeKey, histories);
            detail.put("status", gatewayStatus);
            return detail;
        }

        // 普通审批/人工任务节点
        detail.put("approverType", approverType != null ? approverType : "");
        detail.put("approverDescription", resolveAssigneeDescription(approverType, approverValue));

        // 分配类型中文标签
        String typeLabel = "待定";
        if (StringUtils.hasText(approverType)) {
            switch (approverType) {
                case "USER": typeLabel = "指定人员"; break;
                case "ROLE": typeLabel = "按角色"; break;
                case "DEPT_MANAGER": typeLabel = "部门经理"; break;
                case "DIRECT_LEADER": typeLabel = "直属领导"; break;
                case "USERS": case "USER_LIST": typeLabel = "指定多人"; break;
                case "DEPT": typeLabel = "按部门"; break;
                default: typeLabel = approverType; break;
            }
        }
        if (StringUtils.hasText(signType)) {
            switch (signType) {
                case "ALL": typeLabel += " (会签-全部同意)"; break;
                case "ANY": typeLabel += " (会签-任一同意)"; break;
                case "PERCENT": typeLabel += " (会签-按比例)"; break;
                default: typeLabel += " (会签)"; break;
            }
        }
        detail.put("approverTypeLabel", typeLabel);

        // 解析具体审批人列表
        List<Map<String, Object>> approverUsers = resolveApproverUsers(approverType, approverValue);
        detail.put("approverUsers", approverUsers);

        // 判断步骤状态
        boolean isCompleted = false;
        String operatorName = null;
        if (histories != null) {
            for (WfTaskHistory h : histories) {
                if (nodeKey.equals(h.getNodeKey()) && h.getOperatorName() != null) {
                    isCompleted = true;
                    operatorName = h.getOperatorName();
                }
            }
        }
        if (isCompleted) {
            detail.put("status", "completed");
            detail.put("operatorName", operatorName);
        } else if (nodeKey.equals(currentNodeKey)) {
            detail.put("status", "active");
        } else {
            detail.put("status", "pending");
        }

        return detail;
    }

    /**
     * 解析审批人用户列表
     */
    private List<Map<String, Object>> resolveApproverUsers(String approverType, String approverValue) {
        List<Map<String, Object>> approverUsers = new ArrayList<>();
        try {
            if ("USER".equals(approverType) && StringUtils.hasText(approverValue)) {
                SysUser user = sysUserMapper.selectById(Long.valueOf(approverValue));
                if (user != null) {
                    Map<String, Object> u = new HashMap<>();
                    u.put("userId", user.getUserId());
                    u.put("userName", user.getNickName() != null ? user.getNickName() : user.getUserName());
                    approverUsers.add(u);
                }
            } else if ("ROLE".equals(approverType) && StringUtils.hasText(approverValue)) {
                SysRole role = sysRoleMapper.selectOne(
                    new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, approverValue));
                if (role != null) {
                    List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                        new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, role.getRoleId()));
                    if (userRoles != null) {
                        List<Long> userIds = userRoles.stream().map(SysUserRole::getUserId).collect(Collectors.toList());
                        if (!userIds.isEmpty()) {
                            List<SysUser> users = sysUserMapper.selectBatchIds(userIds);
                            for (SysUser user : users) {
                                Map<String, Object> u = new HashMap<>();
                                u.put("userId", user.getUserId());
                                u.put("userName", user.getNickName() != null ? user.getNickName() : user.getUserName());
                                approverUsers.add(u);
                            }
                        }
                    }
                }
            } else if (("USERS".equals(approverType) || "USER_LIST".equals(approverType)) && StringUtils.hasText(approverValue)) {
                String[] ids = approverValue.split(",");
                List<Long> userIds = new ArrayList<>();
                for (String id : ids) {
                    try { userIds.add(Long.valueOf(id.trim())); } catch (NumberFormatException ignored) {}
                }
                if (!userIds.isEmpty()) {
                    List<SysUser> users = sysUserMapper.selectBatchIds(userIds);
                    for (SysUser user : users) {
                        Map<String, Object> u = new HashMap<>();
                        u.put("userId", user.getUserId());
                        u.put("userName", user.getNickName() != null ? user.getNickName() : user.getUserName());
                        approverUsers.add(u);
                    }
                }
            } else if ("DEPT".equals(approverType) && StringUtils.hasText(approverValue)) {
                List<SysUser> deptUsers = sysUserMapper.selectList(
                    new LambdaQueryWrapper<SysUser>().eq(SysUser::getDeptId, Long.valueOf(approverValue)));
                if (deptUsers != null) {
                    for (SysUser user : deptUsers) {
                        Map<String, Object> u = new HashMap<>();
                        u.put("userId", user.getUserId());
                        u.put("userName", user.getNickName() != null ? user.getNickName() : user.getUserName());
                        approverUsers.add(u);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[resolveApproverUsers] 解析审批人列表失败: {}", e.getMessage());
        }
        return approverUsers;
    }

    /**
     * 判断网关节点的聚合状态
     */
    private String determineGatewayStatus(Map<String, Object> gatewayDetail, String currentNodeKey, List<WfTaskHistory> histories) {
        Object branchesObj = gatewayDetail.get("branches");
        if (!(branchesObj instanceof List)) return "pending";

        @SuppressWarnings("unchecked")
        List<List<Map<String, Object>>> branches = (List<List<Map<String, Object>>>) branchesObj;
        if (branches.isEmpty()) return "pending";

        boolean allCompleted = true;
        boolean hasActive = false;
        boolean hasCompleted = false;

        for (List<Map<String, Object>> branch : branches) {
            for (Map<String, Object> step : branch) {
                String status = (String) step.get("status");
                if ("completed".equals(status)) {
                    hasCompleted = true;
                } else if ("active".equals(status)) {
                    hasActive = true;
                    allCompleted = false;
                } else {
                    allCompleted = false;
                }
            }
        }

        if (allCompleted && hasCompleted) return "completed";
        if (hasActive || hasCompleted) return "active";
        return "pending";
    }

    // ==================== 按钮权限 ====================

    @Override
    public List<String> extractNodeButtons(WfNodeConfig node) {
        if (node == null) return null;

        Map<String, Object> props = node.getProps();
        if (props == null) return null;

        Object buttonsObj = props.get("buttons");
        if (buttonsObj == null) return null;

        List<String> buttons = new ArrayList<>();
        if (buttonsObj instanceof List) {
            @SuppressWarnings("unchecked")
            List<?> buttonsList = (List<?>) buttonsObj;
            for (Object item : buttonsList) {
                if (item != null) {
                    buttons.add(String.valueOf(item));
                }
            }
        } else if (buttonsObj instanceof String) {
            String buttonsStr = (String) buttonsObj;
            if (StringUtils.hasText(buttonsStr)) {
                try {
                    @SuppressWarnings("unchecked")
                    List<String> parsed = objectMapper.readValue(buttonsStr, List.class);
                    buttons.addAll(parsed);
                } catch (Exception e) {
                    for (String btn : buttonsStr.split(",")) {
                        String trimmed = btn.trim();
                        if (!trimmed.isEmpty()) {
                            buttons.add(trimmed);
                        }
                    }
                }
            }
        }

        return buttons.isEmpty() ? null : buttons;
    }

    // ==================== P2-9: 节点级重试 ====================

    /**
     * 带重试的节点执行
     * 读取节点的 retry 配置（maxRetries, delayMs），在执行失败时自动重试
     *
     * retry 配置格式（JSON）:
     * {
     *   "maxRetries": 3,      // 最大重试次数，默认 0（不重试）
     *   "delayMs": 1000       // 重试间隔（毫秒），默认 1000
     * }
     *
     * @param node      当前节点配置
     * @param instance  流程实例
     * @param variables 流程变量
     * @return 节点处理器的返回值（true=继续流转，false=阻塞等待）
     */
    private Boolean executeWithRetry(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        Map<String, Object> retryConfig = node.getRetry();
        int maxRetries = 0;
        long delayMs = 1000L;

        if (retryConfig != null) {
            Object maxRetriesObj = retryConfig.get("maxRetries");
            if (maxRetriesObj instanceof Number) {
                maxRetries = ((Number) maxRetriesObj).intValue();
            }
            Object delayObj = retryConfig.get("delayMs");
            if (delayObj instanceof Number) {
                delayMs = ((Number) delayObj).longValue();
            }
        }

        // 无重试配置时直接执行
        if (maxRetries <= 0) {
            return nodeHandlerFactory.handle(node, instance, variables);
        }

        // 带重试执行
        Exception lastException = null;
        for (int attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                Boolean result = nodeHandlerFactory.handle(node, instance, variables);
                if (attempt > 0) {
                    log.info("[executeWithRetry] 节点 '{}' (id={}) 第 {} 次重试成功, instanceId={}",
                            node.getTitle(), node.getId(), attempt, instance.getInstanceId());
                }
                return result;
            } catch (Exception e) {
                lastException = e;
                log.warn("[executeWithRetry] 节点 '{}' (id={}) 执行失败 (第 {}/{} 次), instanceId={}: {}",
                        node.getTitle(), node.getId(), attempt + 1, maxRetries + 1,
                        instance.getInstanceId(), e.getMessage());

                if (attempt < maxRetries) {
                    try {
                        Thread.sleep(delayMs);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        log.warn("[executeWithRetry] 重试等待被中断");
                        break;
                    }
                }
            }
        }

        // 所有重试都失败
        log.error("[executeWithRetry] 节点 '{}' (id={}) 重试 {} 次后仍然失败, instanceId={}, 将继续流转避免阻塞",
                node.getTitle(), node.getId(), maxRetries, instance.getInstanceId(), lastException);

        // 记录异常告警
        try {
            String errorMessage = "节点执行失败（已重试" + maxRetries + "次）: " + (lastException != null ? lastException.getMessage() : "未知错误");
            String stackTrace = lastException != null ? lastException.toString() : null;
            anomalyDetectionService.detectExecutionFailure(instance.getInstanceId(), errorMessage, stackTrace);
        } catch (Exception e) {
            log.warn("[executeWithRetry] 记录异常告警失败: {}", e.getMessage());
        }

        // 返回 true 继续流转，避免父流程永久阻塞
        return true;
    }

    // ==================== P2-10: inputs/outputs 数据流映射 ====================

    /**
     * 应用 inputs 映射：节点执行前，从流程变量中提取值到局部变量
     *
     * inputs 配置格式: {"localVarName": "processVarName"}
     * 作用: 将流程变量 processVarName 的值复制到 variables 中的 localVarName
     * 用途: 节点可以通过 inputs 声明它需要哪些流程变量，实现节点间数据流的显式声明
     *
     * 例如: {"orderAmount": "formData.amount"} 表示把流程变量中 formData.amount 的值映射为 orderAmount
     *
     * @param node      当前节点配置
     * @param variables 流程变量（会被就地修改）
     */
    private void applyInputsMapping(WfNodeConfig node, Map<String, Object> variables) {
        Map<String, String> inputs = node.getInputs();
        if (inputs == null || inputs.isEmpty() || variables == null) {
            return;
        }

        for (Map.Entry<String, String> entry : inputs.entrySet()) {
            String localKey = entry.getKey();
            String sourceKey = entry.getValue();

            if (!StringUtils.hasText(localKey) || !StringUtils.hasText(sourceKey)) {
                continue;
            }

            // 支持嵌套属性访问：如 "formData.amount" → 从 variables["formData"]["amount"] 取值
            Object value = resolveNestedValue(variables, sourceKey);
            if (value != null) {
                variables.put(localKey, value);
                log.debug("[applyInputsMapping] 节点 '{}': {} <- {} = {}", node.getId(), localKey, sourceKey, value);
            }
        }
    }

    /**
     * 应用 outputs 映射：节点执行后，将节点输出写回流程变量
     *
     * outputs 配置格式: {"processVarName": "localVarName"}
     * 作用: 将 variables 中 localVarName 的值复制到 processVarName，并持久化到流程实例
     * 用途: 节点执行完成后可以将产出数据写入流程变量，供后续节点使用
     *
     * @param node      当前节点配置
     * @param variables 流程变量（会被就地修改）
     * @param instance  流程实例（用于持久化更新后的变量）
     */
    private void applyOutputsMapping(WfNodeConfig node, Map<String, Object> variables, WfProcessInstance instance) {
        Map<String, String> outputs = node.getOutputs();
        if (outputs == null || outputs.isEmpty() || variables == null) {
            return;
        }

        boolean changed = false;
        for (Map.Entry<String, String> entry : outputs.entrySet()) {
            String targetKey = entry.getKey();
            String sourceKey = entry.getValue();

            if (!StringUtils.hasText(targetKey) || !StringUtils.hasText(sourceKey)) {
                continue;
            }

            Object value = resolveNestedValue(variables, sourceKey);
            if (value != null) {
                variables.put(targetKey, value);
                changed = true;
                log.debug("[applyOutputsMapping] 节点 '{}': {} <- {} = {}", node.getId(), targetKey, sourceKey, value);
            }
        }

        // 如果有变量变更，持久化到流程实例
        if (changed) {
            try {
                instance.setVariables(objectMapper.writeValueAsString(variables));
                processInstanceMapper.updateById(instance);
            } catch (Exception e) {
                log.warn("[applyOutputsMapping] 持久化流程变量失败: {}", e.getMessage());
            }
        }
    }

    /**
     * 解析嵌套属性值，支持点号分隔的属性路径
     * 例如: "formData.amount" → variables.get("formData") 如果是 Map 则继续 .get("amount")
     * 如果不含点号，直接从 variables 中取值
     */
    @SuppressWarnings("unchecked")
    private Object resolveNestedValue(Map<String, Object> variables, String path) {
        if (!path.contains(".")) {
            return variables.get(path);
        }

        String[] parts = path.split("\\.");
        Object current = variables;
        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return null;
            }
        }
        return current;
    }

    // ==================== 快照 ====================

    @Override
    public void saveProcessSnapshot(WfProcessInstance instance, String nodeKey, String nodeName) {
        try {
            WfProcessSnapshot snapshot = new WfProcessSnapshot();
            snapshot.setSnapshotId(UUID.randomUUID().toString());
            snapshot.setInstanceId(instance.getInstanceId());
            snapshot.setNodeKey(nodeKey);
            snapshot.setNodeName(nodeName);
            snapshot.setStatus(instance.getStatus());
            snapshot.setVariables(instance.getVariables());

            List<WfTask> activeTasks = taskMapper.selectList(
                new LambdaQueryWrapper<WfTask>().eq(WfTask::getInstanceId, instance.getInstanceId())
            );
            snapshot.setActiveTasks(objectMapper.writeValueAsString(activeTasks));
            snapshot.setCreateTime(LocalDateTime.now());

            snapshotMapper.insert(snapshot);
            log.debug("[saveProcessSnapshot] 快照保存成功, instanceId={}, nodeKey={}", instance.getInstanceId(), nodeKey);
        } catch (Exception e) {
            log.warn("[saveProcessSnapshot] 快照保存失败: {}", e.getMessage());
        }
    }
}





