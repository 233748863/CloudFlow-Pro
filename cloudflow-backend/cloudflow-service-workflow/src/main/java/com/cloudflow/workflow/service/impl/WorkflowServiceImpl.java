package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.IWorkflowService;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.domain.system.SysDept;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;

import com.cloudflow.common.core.utils.RedisCache;

import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import java.util.concurrent.TimeUnit;

import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;

@Service
public class WorkflowServiceImpl implements IWorkflowService {

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfTaskHistoryMapper taskHistoryMapper;

    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;

    @Autowired
    private WfFormDefinitionMapper formDefinitionMapper;
    
    @Autowired
    private SysUserMapper sysUserMapper;
    
    @Autowired
    private SysRoleMapper sysRoleMapper;
    
    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;
    
    @Autowired
    private SysDeptMapper sysDeptMapper;

    @Autowired
    private com.cloudflow.workflow.service.ISysNoticeService sysNoticeService;

    @Autowired
    private com.cloudflow.workflow.mapper.WfTaskReadMapper taskReadMapper;
    
    @Autowired
    private com.cloudflow.workflow.mapper.WfTaskUrgeMapper taskUrgeMapper;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private final ExpressionParser parser = new SpelExpressionParser();

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> saveProcessDefinition(WfProcessDefinition definition) {
        if (!StringUtils.hasText(definition.getProcessKey())) {
            return R.fail("流程Key不能为空");
        }
        
        // 查找当前Key的最大版本
        WfProcessDefinition lastDef = processDefinitionMapper.selectOne(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, definition.getProcessKey())
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1")
        );

        int version = 1;
        if (lastDef != null) {
            version = lastDef.getVersion() + 1;
        }

        definition.setDefinitionId(UUID.randomUUID().toString());
        definition.setVersion(version);
        definition.setStatus("DRAFT"); // 默认为草稿状态
        definition.setCreateTime(new Date());
        
        processDefinitionMapper.insert(definition);
        return R.ok(definition.getDefinitionId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> deployProcessDefinition(String definitionId) {
        WfProcessDefinition def = processDefinitionMapper.selectById(definitionId);
        if (def == null) {
            return R.fail("流程定义不存在");
        }
        
        // Update status to PUBLISHED
        def.setStatus("PUBLISHED");
        processDefinitionMapper.updateById(def);
        
        // 可选：将旧版本归档（设置为 ARCHIVED）如果需要的话
        // 目前，我们只将此版本标记为已发布。
        // 在 'startProcess' 中，我们应该查找最新的已发布版本，或者如果处于开发模式，则查找最新版本。
        // 让我们保持逻辑简单：startProcess 查找最新版本。
        // 但严格来说，它应该查找最新的已发布版本。
        
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> saveFormDefinition(WfFormDefinition definition) {
        if (!StringUtils.hasText(definition.getFormId())) {
            definition.setFormId(UUID.randomUUID().toString());
        }
        
        WfFormDefinition exist = formDefinitionMapper.selectById(definition.getFormId());
        if (exist != null) {
            definition.setVersion(exist.getVersion() + 1);
            formDefinitionMapper.updateById(definition);
        } else {
            definition.setVersion(1);
            definition.setCreateTime(new Date());
            formDefinitionMapper.insert(definition);
        }
        return R.ok(definition.getFormId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcess(String processDefKey, String businessKey, Map<String, Object> variables) {
        // 1. 查询流程定义
        WfProcessDefinition def = processDefinitionMapper.selectOne(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, processDefKey)
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1")
        );

        if (def == null) {
            return R.fail("流程定义不存在");
        }

        // 2. 创建流程实例
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId(UUID.randomUUID().toString());
        instance.setProcessDefKey(processDefKey);
        instance.setBusinessKey(businessKey);
        instance.setTitle((String) variables.getOrDefault("title", def.getProcessName()));
        
        Long userId = UserContext.getUserId();
        String userName = UserContext.getUserName();
        
        instance.setStartUserId(userId != null ? userId : 1L);
        instance.setStartUserName(userName != null ? userName : "admin");
        instance.setStatus(WfProcessStatus.RUNNING.getCode());
        instance.setStartTime(new Date());
        
        // Save variables as JSON
        try {
            instance.setVariables(objectMapper.writeValueAsString(variables));
        } catch (Exception e) {
            // 忽略序列化错误
        }

        processInstanceMapper.insert(instance);

        // 3. 解析模型并启动
        try {
            if (!StringUtils.hasText(def.getModelJson())) {
                // 针对没有 JSON 的遗留/测试定义的后备方案
                 return startLegacyProcess(instance, variables);
            }

            WfNodeConfig rootNode = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
            // 开始节点的下一个节点是第一个节点
            WfNodeConfig nextNode = rootNode.getNext();
            runNode(instance, nextNode, variables, 0);
            
        } catch (Exception e) {
            e.printStackTrace();
            return R.fail("启动流程失败: " + e.getMessage());
        }

        return R.ok(instance.getInstanceId());
    }
    
    private R<?> startLegacyProcess(WfProcessInstance instance, Map<String, Object> variables) {
        WfTask task = new WfTask();
        task.setTaskId(UUID.randomUUID().toString());
        task.setInstanceId(instance.getInstanceId());
        task.setNodeName("审批节点");
        task.setNodeKey("node_1");
        if (variables.containsKey("assignee")) {
             task.setAssignee(Long.valueOf(variables.get("assignee").toString()));
        } else {
             task.setAssignee(1L);
        }
        task.setStatus(WfTaskStatus.TODO.getCode());
        task.setCreateTime(new Date());
        taskMapper.insert(task);
        return R.ok(instance.getInstanceId());
    }

    // 递归/链式方法执行节点
    // 增加了深度检查以防止循环流程中的堆栈溢出
    private void runNode(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables, int depth) {
        if (depth > 100) {
            throw new RuntimeException("流程深度超出限制（可能检测到循环）");
        }
        
        if (node == null) {
            // 流程结束
            completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
            return;
        }

        // 检查并行汇聚
        // 我们需要知道 'node' 是否是一个并行网关的 'next'。
        // 这需要完整的定义。由于我们没有在这里传递它，我们可能需要加载它或传递它。
        // 为了优化，我们应该只加载一次定义。
        // 但在这里我们可以尝试从实例 -> 定义 -> json 加载它。
        // 理想情况下 'runNode' 应该以 'root' 作为上下文。
        // 目前，如果我们怀疑是汇聚，就加载它，或者总是加载它（MyBatis L1 缓存）。
        
        try {
            WfProcessDefinition def = processDefinitionMapper.selectOne(
                new LambdaQueryWrapper<WfProcessDefinition>()
                    .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                    .orderByDesc(WfProcessDefinition::getVersion)
                    .last("LIMIT 1")
            );
            if (def != null && StringUtils.hasText(def.getModelJson())) {
                 WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
                 WfNodeConfig gateway = findParentGateway(root, node.getId());
                 
                 if (gateway != null) {
                     // 此节点是 'gateway' 的汇聚节点
                     String joinKey = "sys:wf:join:" + instance.getInstanceId() + ":" + gateway.getId();
                     long count = redisCache.increment(joinKey);
                     // 设置过期时间以避免垃圾数据
                     redisCache.expire(joinKey, 24, java.util.concurrent.TimeUnit.HOURS);
                     
                     int totalBranches = gateway.getBranches() != null ? gateway.getBranches().size() : 0;
                     
                     if (count < totalBranches) {
                         // 等待其他分支
                         return;
                     }
                     // 所有分支已到达，继续（并清除 key）
                     redisCache.deleteObject(joinKey);
                 }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        if ("APPROVAL".equals(node.getType())) {
            // 创建用户任务
            WfTask task = new WfTask();
            task.setTaskId(UUID.randomUUID().toString());
            task.setInstanceId(instance.getInstanceId());
            task.setNodeName(node.getTitle());
            task.setNodeKey(node.getId()); // 使用节点 ID 作为 Key
            
            // 确定处理人
            Long assigneeId = resolveAssignee(node, instance);
            if (assigneeId != null) {
                task.setAssignee(assigneeId);
            } else {
                // 如果无法解析处理人，回退到管理员或保留未分配（任务池）
                // 对于本项目，默认为管理员
                task.setAssignee(1L);
            }
            
            task.setStatus(WfTaskStatus.TODO.getCode());
            task.setCreateTime(new Date());
            taskMapper.insert(task);
            
            // Send Notification
            sysNoticeService.sendNotice(
                task.getAssignee(), 
                "待办任务通知", 
                "您有一个新的待办任务: " + node.getTitle() + " (流程: " + instance.getTitle() + ")", 
                "1",
                UserContext.getUserId(),
                UserContext.getUserName()
            );
            
            // SLA 超时注册
            if (node.getSlaHours() != null && node.getSlaHours() > 0) {
                long expireTime = System.currentTimeMillis() + node.getSlaHours() * 3600 * 1000L;
                redisCache.setCacheZSet("sys:task:timeouts", task.getTaskId(), (double) expireTime);
                
                // 如果需要，存储动作，目前我们假设为 AUTO_PASS 或稍后查找
                // redisCache.setCacheObject("sys:task:sla_action:" + task.getTaskId(), node.getSlaAction());
            }
            
            // 停止在此处，等待用户操作
            return;

        } else if ("CONDITION".equals(node.getType()) || "GATEWAY".equals(node.getType())) {
            // 排他网关（条件）
            // 检查分支
            List<WfNodeConfig> branches = node.getBranches();
            boolean branchTaken = false;
            if (branches != null && !branches.isEmpty()) {
                for (WfNodeConfig branch : branches) {
                    if (evaluateCondition(branch.getCondition(), variables)) {
                        runNode(instance, branch, variables, depth + 1);
                        branchTaken = true;
                        return; // 只走一条路径
                    }
                }
            }
            // 如果没有分支匹配，如果有 next 则继续，或者报错？
            // 惯例：如果没有条件匹配，查找“默认”流或继续 next
            if (!branchTaken) {
                runNode(instance, node.getNext(), variables, depth + 1);
            }
            
        } else if ("PARALLEL".equals(node.getType())) {
            // 并行网关
            // 分叉所有分支
             List<WfNodeConfig> branches = node.getBranches();
             if (branches != null) {
                 for (WfNodeConfig branch : branches) {
                     // 为简单起见在同一线程中分叉，但递归执行
                     // 注意：这个简单的引擎尚未正确处理“汇聚”
                     runNode(instance, branch, variables, depth + 1);
                 }
             }
             // 并行通常不会立即继续 'next'，它等待汇聚
             // 简化版：不做其他操作
             
        } else if ("END".equals(node.getType())) {
             completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
        } else {
            // 未知或开始节点，直接继续
            runNode(instance, node.getNext(), variables, depth + 1);
        }
    }

    private Long resolveAssignee(WfNodeConfig node, WfProcessInstance instance) {
        String type = node.getApproverType();
        String value = node.getApproverValue();
        
        if ("USER".equals(type)) {
            try {
                return Long.valueOf(value);
            } catch (Exception e) { return null; }
        } else if ("ROLE".equals(type)) {
            // Find user by role key
            // 1. Find role id by key
            SysRole role = sysRoleMapper.selectOne(new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, value));
            if (role != null) {
                // 2. Find users with this role
                List<SysUserRole> userRoles = sysUserRoleMapper.selectList(new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, role.getRoleId()));
                if (userRoles != null && !userRoles.isEmpty()) {
                    // Return first one for now, or logic for pool
                    return userRoles.get(0).getUserId();
                }
            }
        } else if ("DEPT_MANAGER".equals(type) || "DIRECT_LEADER".equals(type)) {
             // Find start user's department
             Long startUserId = instance.getStartUserId();
             SysUser startUser = sysUserMapper.selectById(startUserId);
             if (startUser != null && startUser.getDeptId() != null) {
                 SysDept dept = sysDeptMapper.selectById(startUser.getDeptId());
                 if (dept != null) {
                     // In our mock data, leader is 'admin' or 'zhang_san' (username)
                     // Real system should store ID. Let's try to find user by username = leader
                     String leaderUsername = dept.getLeader();
                     if (StringUtils.hasText(leaderUsername)) {
                         SysUser leader = sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getUserName, leaderUsername));
                         if (leader != null) {
                             return leader.getUserId();
                         }
                     }
                 }
             }
        }
        
        return null;
    }

    private boolean evaluateCondition(String condition, Map<String, Object> variables) {
        if (!StringUtils.hasText(condition)) {
            return true; // No condition means always true (or default path)
        }
        try {
            StandardEvaluationContext context = new StandardEvaluationContext();
            context.setVariables(variables);
            // Add variables as root object properties as well for easier access "amount > 100" instead of "#amount > 100"
            if (variables != null) {
                variables.forEach(context::setVariable);
            }
            
            // Support simple expressions like "amount > 5000"
            // Note: variables in SpEL are accessed via #variableName usually, 
            // but we can try to parse standard java expressions
            Boolean result = parser.parseExpression(condition).getValue(context, Boolean.class);
            return result != null && result;
        } catch (Exception e) {
            // Log error, treat as false
            System.err.println("Condition evaluation failed: " + condition + " Error: " + e.getMessage());
            return false;
        }
    }

    private void completeInstance(WfProcessInstance instance, String status) {
        instance.setStatus(status);
        instance.setEndTime(new Date());
        processInstanceMapper.updateById(instance);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> completeTask(String taskId, String action, String comment, Map<String, Object> variables) {
        RLock lock = redissonClient.getLock("lock:task:" + taskId);
        try {
            if (lock.tryLock(5, 10, TimeUnit.SECONDS)) {
                // 1. 查询当前任务
                WfTask task = taskMapper.selectById(taskId);
                if (task == null) {
                    return R.fail("任务不存在");
                }
                
                // 校验权限
                Long currentUserId = UserContext.getUserId();
                if (task.getAssignee() != null && !task.getAssignee().equals(currentUserId)) {
                    // return R.fail("无权处理此任务"); 
                }

                // 2. 保存历史记录
                WfTaskHistory history = new WfTaskHistory();
                history.setHistoryId(UUID.randomUUID().toString());
                history.setTaskId(task.getTaskId());
                history.setInstanceId(task.getInstanceId());
                history.setNodeName(task.getNodeName());
                history.setNodeKey(task.getNodeKey()); // Add nodeKey to history
                history.setOperatorId(currentUserId);
                history.setOperatorName(UserContext.getUserName());
                history.setComment(comment);
                history.setAction(action);
                history.setCreateTime(new Date());
                taskHistoryMapper.insert(history);

                // 3. 删除当前任务
                taskMapper.deleteById(taskId);

                // 4. 流程流转
                WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
                
                // 如果是拒绝，直接结束
                if ("REJECT".equalsIgnoreCase(action)) {
                    completeInstance(instance, WfProcessStatus.REJECTED.getCode());
                    return R.ok();
                }

                // 查找流程定义和当前节点
                WfProcessDefinition def = processDefinitionMapper.selectOne(
                    new LambdaQueryWrapper<WfProcessDefinition>()
                        .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                        .orderByDesc(WfProcessDefinition::getVersion)
                        .last("LIMIT 1")
                );

                try {
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
                        
                        // Find the next node using path traversal to handle branch exits (joins)
                        WfNodeConfig nextNode = findNextNode(root, task.getNodeKey());
                        
                        if (nextNode != null) {
                            // 继续运行
                            runNode(instance, nextNode, variables, 0);
                        } else {
                            // No next node found, process completed
                            completeInstance(instance, WfProcessStatus.COMPLETED.getCode()); 
                        }
                    } else {
                        // Legacy simple logic
                         completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                    return R.fail("流程流转失败: " + e.getMessage());
                }

                return R.ok();
            } else {
                return R.fail("任务处理中，请勿重复提交");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return R.fail("系统繁忙");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    /**
     * Find the next node to execute after the current node completes.
     * Traverses up the tree to find the nearest "next" node (Join or Sequence).
     */
    private WfNodeConfig findNextNode(WfNodeConfig root, String currentNodeId) {
        java.util.LinkedList<WfNodeConfig> path = new java.util.LinkedList<>();
        if (findPath(root, currentNodeId, path)) {
            // Path found. Iterate from the end (current node) upwards.
            // We are looking for the first node in the ancestry chain (including self) that has a 'next'.
            // Note: In this model, a 'Branch' node itself might not have a 'next', but its parent (Gateway) does.
            // When the last node of a branch finishes, we should look at the Gateway's next.
            
            // path contains: [Root, Node1, Gateway, BranchNode, TaskNode]
            // We iterate in reverse: TaskNode -> BranchNode -> Gateway -> Node1 -> Root
            
            while (!path.isEmpty()) {
                WfNodeConfig node = path.removeLast();
                if (node.getNext() != null) {
                    return node.getNext();
                }
                // If node.next is null, continue to parent (loop again)
            }
        }
        return null;
    }

    private boolean findPath(WfNodeConfig current, String targetId, java.util.LinkedList<WfNodeConfig> path) {
        if (current == null) return false;
        
        path.add(current);
        if (targetId.equals(current.getId())) {
            return true;
        }
        
        // Check next
        if (findPath(current.getNext(), targetId, path)) {
            return true;
        }
        
        // Check branches
        if (current.getBranches() != null) {
            for (WfNodeConfig branch : current.getBranches()) {
                if (findPath(branch, targetId, path)) {
                    return true;
                }
            }
        }
        
        // Not found in this subtree, backtrack
        path.removeLast();
        return false;
    }

    private WfNodeConfig findParentGateway(WfNodeConfig root, String targetNodeId) {
        if (root == null) return null;
        
        // Check if root is a parallel gateway and its next is target
        if ("PARALLEL".equals(root.getType()) && root.getNext() != null && targetNodeId.equals(root.getNext().getId())) {
            return root;
        }
        
        // Recursive check in next
        WfNodeConfig found = findParentGateway(root.getNext(), targetNodeId);
        if (found != null) return found;
        
        // Recursive check in branches
        if (root.getBranches() != null) {
            for (WfNodeConfig branch : root.getBranches()) {
                found = findParentGateway(branch, targetNodeId);
                if (found != null) return found;
            }
        }
        
        return null;
    }

    private WfNodeConfig findNode(WfNodeConfig root, String nodeId) {
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
    @Transactional(rollbackFor = Exception.class)
    public R<?> rejectTask(String taskId, String targetNodeKey, String comment) {
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) return R.fail("任务不存在");
        
        // Validate user (omitted for brevity, assume caller checked or check here)
        
        // 1. Save History
        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTaskId(task.getTaskId());
        history.setInstanceId(task.getInstanceId());
        history.setNodeName(task.getNodeName());
        history.setNodeKey(task.getNodeKey());
        history.setOperatorId(UserContext.getUserId());
        history.setOperatorName(UserContext.getUserName());
        history.setComment(comment);
        history.setAction("REJECT_TO_" + targetNodeKey);
        history.setCreateTime(new Date());
        taskHistoryMapper.insert(history);
        
        // 2. Delete current task
        taskMapper.deleteById(taskId);
        
        // 3. Create new task at target node
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        WfProcessDefinition def = processDefinitionMapper.selectOne(new LambdaQueryWrapper<WfProcessDefinition>().eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey()).orderByDesc(WfProcessDefinition::getVersion).last("LIMIT 1"));
        
        try {
            WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
            WfNodeConfig targetNode = findNode(root, targetNodeKey);
            if (targetNode == null) return R.fail("目标节点不存在");
            
            // Re-run from target node
            // Note: This is simplified. In real world, we might need to find who processed that node before.
            // For now, we treat it as a new runNode which will resolve assignee again.
            runNode(instance, targetNode, null, 0);
            
        } catch(Exception e) {
            e.printStackTrace();
            return R.fail("驳回失败");
        }
        
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> recallProcess(String instanceId) {
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) return R.fail("实例不存在");
        
        if (!WfProcessStatus.RUNNING.getCode().equals(instance.getStatus())) {
            return R.fail("流程已结束，无法撤回");
        }
        
        Long currentUserId = UserContext.getUserId();
        if (!instance.getStartUserId().equals(currentUserId)) {
            return R.fail("非发起人无法撤回");
        }
        
        // Delete all active tasks
        LambdaQueryWrapper<WfTask> taskWrapper = new LambdaQueryWrapper<>();
        taskWrapper.eq(WfTask::getInstanceId, instanceId);
        taskMapper.delete(taskWrapper);
        
        // Update instance status
        instance.setStatus(WfProcessStatus.REVOKED.getCode());
        instance.setEndTime(new Date());
        processInstanceMapper.updateById(instance);
        
        return R.ok();
    }

    @Override
    public PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery) {
        Page<WfTask> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTask> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(WfTask::getAssignee, userId);
        queryWrapper.orderByDesc(WfTask::getCreateTime);
        
        Page<WfTask> resultPage = taskMapper.selectPage(page, queryWrapper);
        List<WfTask> tasks = resultPage.getRecords();

        if (tasks != null && !tasks.isEmpty()) {
            for (WfTask task : tasks) {
                WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
                if (instance != null) {
                    task.setProcessDefKey(instance.getProcessDefKey());
                    task.setStartUserId(String.valueOf(instance.getStartUserId()));
                    task.setStartUserName(instance.getStartUserName());
                    task.setInstanceTitle(instance.getTitle());
                    
                    WfProcessDefinition def = processDefinitionMapper.selectOne(
                         new LambdaQueryWrapper<WfProcessDefinition>()
                             .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                             .orderByDesc(WfProcessDefinition::getVersion)
                             .last("LIMIT 1")
                    );
                    if (def != null) {
                        task.setProcessName(def.getProcessName());
                        task.setFormId(def.getFormId());
                    }
                    
                    if (StringUtils.hasText(instance.getVariables())) {
                        try {
                            Map<String, Object> vars = objectMapper.readValue(instance.getVariables(), Map.class);
                            task.setVariables(vars);
                        } catch (Exception e) {
                            // Ignore
                        }
                    }
                }
            }
        }
        return new PageResult<>(tasks, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public WfProcessInstance getProcessInstance(String instanceId) {
        return processInstanceMapper.selectById(instanceId);
    }

    @Override
    public Map<String, Object> getProcessTrace(String instanceId) {
        // Finished nodes from history
        LambdaQueryWrapper<WfTaskHistory> historyWrapper = new LambdaQueryWrapper<>();
        historyWrapper.eq(WfTaskHistory::getInstanceId, instanceId);
        historyWrapper.orderByAsc(WfTaskHistory::getCreateTime);
        List<WfTaskHistory> histories = taskHistoryMapper.selectList(historyWrapper);
        
        List<String> finished = histories.stream()
                .map(WfTaskHistory::getNodeKey)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(java.util.stream.Collectors.toList());

        // Active nodes from tasks
        LambdaQueryWrapper<WfTask> taskWrapper = new LambdaQueryWrapper<>();
        taskWrapper.eq(WfTask::getInstanceId, instanceId);
        List<WfTask> tasks = taskMapper.selectList(taskWrapper);
        
        List<String> active = tasks.stream()
                .map(WfTask::getNodeKey)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(java.util.stream.Collectors.toList());

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("finished", finished);
        result.put("active", active);
        return result;
    }

    @Override
    public PageResult<WfProcessInstance> getMyInstances(Long userId, PageQuery pageQuery) {
        Page<WfProcessInstance> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfProcessInstance> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(WfProcessInstance::getStartUserId, userId);
        queryWrapper.orderByDesc(WfProcessInstance::getStartTime);
        
        Page<WfProcessInstance> resultPage = processInstanceMapper.selectPage(page, queryWrapper);
        List<WfProcessInstance> list = resultPage.getRecords();

        if (list != null) {
            for (WfProcessInstance instance : list) {
                WfProcessDefinition def = processDefinitionMapper.selectOne(
                     new LambdaQueryWrapper<WfProcessDefinition>()
                         .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                         .orderByDesc(WfProcessDefinition::getVersion)
                         .last("LIMIT 1")
                );
                if (def != null) {
                    instance.setFormId(def.getFormId());
                }
            }
        }
        return new PageResult<>(list, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public PageResult<WfProcessDefinition> listProcessDefinitions(PageQuery pageQuery) {
        Page<WfProcessDefinition> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        Page<WfProcessDefinition> resultPage = processDefinitionMapper.selectPage(page, null);
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public WfFormDefinition getFormDefinition(String formId) {
        return formDefinitionMapper.selectById(formId);
    }

    @Override
    public PageResult<WfFormDefinition> listFormDefinitions(PageQuery pageQuery) {
        Page<WfFormDefinition> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        Page<WfFormDefinition> resultPage = formDefinitionMapper.selectPage(page, null);
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void readTask(String taskId, Long userId) {
        // Check duplication
        Long count = taskReadMapper.selectCount(new LambdaQueryWrapper<com.cloudflow.workflow.domain.WfTaskRead>()
                .eq(com.cloudflow.workflow.domain.WfTaskRead::getTaskId, taskId)
                .eq(com.cloudflow.workflow.domain.WfTaskRead::getUserId, userId));
        if (count == 0) {
            com.cloudflow.workflow.domain.WfTaskRead read = new com.cloudflow.workflow.domain.WfTaskRead();
            read.setTaskId(taskId);
            read.setUserId(userId);
            read.setReadTime(new Date());
            taskReadMapper.insert(read);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> urgeTask(String taskId, String reason) {
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) return R.fail("任务不存在");
        
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) return R.fail("实例不存在");
        
        // Only initiator can urge?
        Long currentUserId = UserContext.getUserId();
        if (!instance.getStartUserId().equals(currentUserId)) {
            return R.fail("仅发起人可催办");
        }
        
        // Save urge record
        com.cloudflow.workflow.domain.WfTaskUrge urge = new com.cloudflow.workflow.domain.WfTaskUrge();
        urge.setTaskId(taskId);
        urge.setSenderId(currentUserId);
        urge.setRecipientId(task.getAssignee());
        urge.setReason(reason);
        urge.setCreateTime(new Date());
        taskUrgeMapper.insert(urge);
        
        // Send Notification
        sysNoticeService.sendNotice(
            task.getAssignee(), 
            "任务催办提醒", 
            "发起人催办了任务: " + task.getNodeName() + "，原因: " + (StringUtils.hasText(reason) ? reason : "无"), 
            "2",
            currentUserId,
            UserContext.getUserName()
        );
        
        return R.ok();
    }
}

