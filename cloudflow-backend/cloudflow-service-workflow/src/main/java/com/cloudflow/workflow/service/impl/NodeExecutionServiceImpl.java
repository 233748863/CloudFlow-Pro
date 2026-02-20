package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
                    RLock joinLock = redissonClient.getLock("lock:join:" + gateway.getId());
                    try {
                        if (joinLock.tryLock(5, 10, TimeUnit.SECONDS)) {
                            long count = redisCache.increment(joinKey);
                            if (count == 1) {
                                redisCache.expire(joinKey, 1, TimeUnit.HOURS);
                            }
                            int totalBranches = gateway.getBranches() != null ? gateway.getBranches().size() : 0;
                            if (count < totalBranches) {
                                return; // 等待其他分支
                            }
                            redisCache.deleteObject(joinKey);
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

        // P2-9: 全局监听器 — 节点开始执行前回调
        globalListenerDispatcher.fireStart(instance, node, variables);

        // 按节点类型分发处理
        if ("APPROVAL".equals(node.getType())) {
            handleApprovalNode(node, instance, variables);
        } else if (nodeHandlerFactory.supports(node.getType())) {
            // 通过节点处理器工厂分发（NOTIFICATION/SCRIPT/COPY/TIMER/SUBPROCESS/MANUAL 等）
            Boolean shouldContinue = nodeHandlerFactory.handle(node, instance, variables);
            if (Boolean.TRUE.equals(shouldContinue)) {
                // P2-9: 全局监听器 — 非审批节点执行完成后回调
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
            runNode(instance, node.getNext(), variables, depth + 1, rootNode);
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
        task.setCreateTime(new Date());
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
        List<WfNodeConfig> branches = node.getBranches();
        boolean branchTaken = false;
        if (branches != null && !branches.isEmpty()) {
            for (WfNodeConfig branch : branches) {
                if (evaluateCondition(branch.getCondition(), variables)) {
                    runNode(instance, branch, variables, depth + 1, rootNode);
                    branchTaken = true;
                    return;
                }
            }
        }
        if (!branchTaken) {
            runNode(instance, node.getNext(), variables, depth + 1, rootNode);
        }
    }

    /**
     * 处理并行网关
     */
    private void handleParallelGateway(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables, int depth, WfNodeConfig rootNode) {
        List<WfNodeConfig> branches = node.getBranches();
        if (branches != null) {
            for (WfNodeConfig branch : branches) {
                runNode(instance, branch, variables, depth + 1, rootNode);
            }
        }
    }

    // ==================== 流转逻辑 ====================

    @Override
    public void advanceAfterNode(WfProcessInstance instance, WfNodeConfig currentNode, String currentNodeKey,
                                  Map<String, Object> variables, int depth, WfNodeConfig rootNode) {
        if (currentNode != null && currentNode.getBranches() != null && !currentNode.getBranches().isEmpty()) {
            String strategy = currentNode.getBranchStrategy();
            List<WfNodeConfig> branches = currentNode.getBranches();

            if ("PARALLEL".equals(strategy)) {
                for (WfNodeConfig branch : branches) {
                    runNode(instance, branch, variables, depth + 1, rootNode);
                }
                return;
            } else {
                // EXCLUSIVE 或默认策略
                for (WfNodeConfig branch : branches) {
                    if (evaluateCondition(branch.getCondition(), variables)) {
                        if (branch.getNext() != null) {
                            runNode(instance, branch.getNext(), variables, depth + 1, rootNode);
                        }
                        return;
                    }
                }
            }
        }

        // 没有分支或分支都不匹配，走 next
        if (currentNode != null && currentNode.getNext() != null) {
            runNode(instance, currentNode.getNext(), variables, depth + 1, rootNode);
        } else {
            WfNodeConfig nextNode = findNextNode(rootNode, currentNodeKey);
            if (nextNode != null) {
                runNode(instance, nextNode, variables, depth + 1, rootNode);
            } else {
                completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
            }
        }
    }

    @Override
    public void completeInstance(WfProcessInstance instance, String status) {
        instance.setStatus(status);
        instance.setEndTime(new Date());
        processInstanceMapper.updateById(instance);

        if (WfProcessStatus.COMPLETED.getCode().equals(status)) {
            workflowEventPublisher.publishProcessCompleted(instance);
        }

        // P2-9: 全局监听器 — 流程结束回调
        globalListenerDispatcher.fireFinish(instance, null, null);
    }

    // ==================== 节点查找 ====================

    @Override
    public WfNodeConfig findNode(WfNodeConfig root, String nodeId) {
        if (root == null) return null;
        if (nodeId.equals(root.getId())) return root;

        WfNodeConfig found = findNode(root.getNext(), nodeId);
        if (found != null) return found;

        if (root.getBranches() != null) {
            for (WfNodeConfig branch : root.getBranches()) {
                found = findNode(branch, nodeId);
                if (found != null) return found;
            }
        }
        return null;
    }

    @Override
    public WfNodeConfig findNextNode(WfNodeConfig root, String currentNodeId) {
        java.util.LinkedList<WfNodeConfig> path = new java.util.LinkedList<>();
        if (findPath(root, currentNodeId, path)) {
            while (!path.isEmpty()) {
                WfNodeConfig node = path.removeLast();
                if (node.getNext() != null) {
                    return node.getNext();
                }
            }
        }
        return null;
    }

    private boolean findPath(WfNodeConfig current, String targetId, java.util.LinkedList<WfNodeConfig> path) {
        if (current == null) return false;
        path.add(current);
        if (targetId.equals(current.getId())) return true;
        if (findPath(current.getNext(), targetId, path)) return true;
        if (current.getBranches() != null) {
            for (WfNodeConfig branch : current.getBranches()) {
                if (findPath(branch, targetId, path)) return true;
            }
        }
        path.removeLast();
        return false;
    }

    private WfNodeConfig findParentGateway(WfNodeConfig root, String targetNodeId) {
        if (root == null) return null;
        if ("PARALLEL".equals(root.getType()) && root.getNext() != null && targetNodeId.equals(root.getNext().getId())) {
            return root;
        }
        WfNodeConfig found = findParentGateway(root.getNext(), targetNodeId);
        if (found != null) return found;
        if (root.getBranches() != null) {
            for (WfNodeConfig branch : root.getBranches()) {
                found = findParentGateway(branch, targetNodeId);
                if (found != null) return found;
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
        collectApprovalSteps(root, steps);
        return steps;
    }

    private void collectApprovalSteps(WfNodeConfig node, List<Map<String, String>> steps) {
        if (node == null) return;

        if ("PARALLEL".equals(node.getType())) {
            Map<String, String> step = new HashMap<>();
            step.put("nodeKey", node.getId());
            step.put("nodeTitle", node.getTitle() != null ? node.getTitle() : "并行审批");
            step.put("nodeType", "PARALLEL");
            step.put("branchStrategy", node.getBranchStrategy() != null ? node.getBranchStrategy() : "PARALLEL");
            if (node.getBranches() != null && !node.getBranches().isEmpty()) {
                try {
                    List<List<Map<String, String>>> branchStepsList = new ArrayList<>();
                    for (WfNodeConfig branch : node.getBranches()) {
                        List<Map<String, String>> branchSteps = new ArrayList<>();
                        collectApprovalSteps(branch, branchSteps);
                        branchStepsList.add(branchSteps);
                    }
                    step.put("branches", objectMapper.writeValueAsString(branchStepsList));
                } catch (Exception e) {
                    step.put("branches", "[]");
                }
            }
            steps.add(step);
            collectApprovalSteps(node.getNext(), steps);
            return;
        }

        if ("CONDITION".equals(node.getType()) || "GATEWAY".equals(node.getType())) {
            Map<String, String> step = new HashMap<>();
            step.put("nodeKey", node.getId());
            step.put("nodeTitle", node.getTitle() != null ? node.getTitle() : "条件分支");
            step.put("nodeType", "CONDITION");
            step.put("branchStrategy", "EXCLUSIVE");
            if (node.getBranches() != null && !node.getBranches().isEmpty()) {
                try {
                    List<List<Map<String, String>>> branchStepsList = new ArrayList<>();
                    for (WfNodeConfig branch : node.getBranches()) {
                        List<Map<String, String>> branchSteps = new ArrayList<>();
                        collectApprovalSteps(branch, branchSteps);
                        branchStepsList.add(branchSteps);
                    }
                    step.put("branches", objectMapper.writeValueAsString(branchStepsList));
                } catch (Exception e) {
                    step.put("branches", "[]");
                }
            }
            steps.add(step);
            collectApprovalSteps(node.getNext(), steps);
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

        collectApprovalSteps(node.getNext(), steps);

        if (node.getBranches() != null && !"PARALLEL".equals(node.getType())
                && !"CONDITION".equals(node.getType()) && !"GATEWAY".equals(node.getType())) {
            for (WfNodeConfig branch : node.getBranches()) {
                collectApprovalSteps(branch, steps);
            }
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
    @SuppressWarnings("unchecked")
    private String determineGatewayStatus(Map<String, Object> gatewayDetail, String currentNodeKey, List<WfTaskHistory> histories) {
        Object branchesObj = gatewayDetail.get("branches");
        if (!(branchesObj instanceof List)) return "pending";

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
            for (Object item : (List<?>) buttonsObj) {
                if (item != null) {
                    buttons.add(String.valueOf(item));
                }
            }
        } else if (buttonsObj instanceof String) {
            String buttonsStr = (String) buttonsObj;
            if (StringUtils.hasText(buttonsStr)) {
                try {
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
            snapshot.setCreateTime(new Date());

            snapshotMapper.insert(snapshot);
            log.debug("[saveProcessSnapshot] 快照保存成功, instanceId={}, nodeKey={}", instance.getInstanceId(), nodeKey);
        } catch (Exception e) {
            log.warn("[saveProcessSnapshot] 快照保存失败: {}", e.getMessage());
        }
    }
}
