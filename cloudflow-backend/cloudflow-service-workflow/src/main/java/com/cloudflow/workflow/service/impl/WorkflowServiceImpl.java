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
import org.springframework.expression.spel.support.SimpleEvaluationContext;

import com.cloudflow.common.core.utils.RedisCache;

import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import java.util.concurrent.TimeUnit;

import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;

import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.service.RateLimiterService;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class WorkflowServiceImpl implements IWorkflowService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowServiceImpl.class);

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

    /** P0: 权限校验服务 */
    @Autowired
    private WorkflowPermissionService permissionService;

    /** P0: 限流服务 */
    @Autowired
    private RateLimiterService rateLimiterService;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private final ExpressionParser parser = new SpelExpressionParser();

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "processDefinition", allEntries = true)
    public R<?> saveProcessDefinition(WfProcessDefinition definition) {
        log.info("[saveProcessDefinition] 开始保存流程定义, processKey={}", definition.getProcessKey());
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(definition.getProcessKey())) {
            throw WorkflowException.validationError("流程Key不能为空");
        }
        if (!StringUtils.hasText(definition.getProcessName())) {
            throw WorkflowException.validationError("流程名称不能为空");
        }
        
        // P0-2: 权限校验 - 仅管理员可操作流程定义
        permissionService.checkDefinitionPermission("保存");
        
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
        log.info("[saveProcessDefinition] 流程定义保存成功, definitionId={}, version={}", definition.getDefinitionId(), version);
        return R.ok(definition.getDefinitionId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "processDefinition", allEntries = true)
    public R<?> deployProcessDefinition(String definitionId) {
        log.info("[deployProcessDefinition] 开始发布流程定义, definitionId={}", definitionId);
        
        // P0-2: 权限校验
        permissionService.checkDefinitionPermission("发布");
        
        WfProcessDefinition def = processDefinitionMapper.selectById(definitionId);
        if (def == null) {
            throw WorkflowException.processNotFound(definitionId);
        }
        
        // P0-4: 状态校验
        if ("PUBLISHED".equals(def.getStatus())) {
            throw WorkflowException.invalidState("流程定义已发布，无需重复发布");
        }
        
        // Update status to PUBLISHED
        def.setStatus("PUBLISHED");
        processDefinitionMapper.updateById(def);
        
        // 将同 processKey 的旧版本归档
        processDefinitionMapper.update(null,
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, def.getProcessKey())
                .ne(WfProcessDefinition::getDefinitionId, definitionId)
                .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                .set(WfProcessDefinition::getStatus, "ARCHIVED")
        );
        
        log.info("[deployProcessDefinition] 流程定义发布成功, definitionId={}, processKey={}", definitionId, def.getProcessKey());
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "formDefinition", allEntries = true)
    public R<?> saveFormDefinition(WfFormDefinition definition) {
        log.info("[saveFormDefinition] 开始保存表单定义, formId={}", definition.getFormId());
        
        // P0-2: 权限校验
        permissionService.checkDefinitionPermission("保存表单");
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(definition.getFormName())) {
            throw WorkflowException.validationError("表单名称不能为空");
        }
        
        if (!StringUtils.hasText(definition.getFormId())) {
            definition.setFormId(UUID.randomUUID().toString());
        }
        
        WfFormDefinition exist = formDefinitionMapper.selectById(definition.getFormId());
        if (exist != null) {
            definition.setVersion(exist.getVersion() + 1);
            formDefinitionMapper.updateById(definition);
            log.info("[saveFormDefinition] 表单定义更新成功, formId={}, version={}", definition.getFormId(), definition.getVersion());
        } else {
            definition.setVersion(1);
            definition.setCreateTime(new Date());
            formDefinitionMapper.insert(definition);
            log.info("[saveFormDefinition] 表单定义创建成功, formId={}", definition.getFormId());
        }
        return R.ok(definition.getFormId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcess(String processDefKey, String businessKey, Map<String, Object> variables) {
        Long userId = UserContext.getUserId();
        String userName = UserContext.getUserName();
        log.info("[startProcess] 开始启动流程, processDefKey={}, businessKey={}, userId={}", processDefKey, businessKey, userId);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(processDefKey)) {
            throw WorkflowException.validationError("流程定义Key不能为空");
        }
        if (variables == null) {
            variables = new java.util.HashMap<>();
        }
        
        // P0-5: 限流检查
        rateLimiterService.checkStartProcessLimit(userId != null ? userId : 0L);
        
        // P0-4: 变量大小限制（防止超大 payload）
        try {
            String varsJson = objectMapper.writeValueAsString(variables);
            if (varsJson.length() > 65536) { // 64KB 限制
                throw WorkflowException.validationError("流程变量数据过大，请精简后重试");
            }
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[startProcess] 变量序列化检查失败: {}", e.getMessage());
        }
        
        // 1. 查询流程定义
        WfProcessDefinition def = processDefinitionMapper.selectOne(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, processDefKey)
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1")
        );

        if (def == null) {
            throw WorkflowException.processNotFound(processDefKey);
        }

        // 2. 创建流程实例
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId(UUID.randomUUID().toString());
        instance.setProcessDefKey(processDefKey);
        instance.setBusinessKey(businessKey);
        instance.setTitle((String) variables.getOrDefault("title", def.getProcessName()));
        
        instance.setStartUserId(userId != null ? userId : 1L);
        instance.setStartUserName(userName != null ? userName : "admin");
        instance.setStatus(WfProcessStatus.RUNNING.getCode());
        instance.setStartTime(new Date());
        
        // P0-4: 安全序列化变量
        try {
            instance.setVariables(objectMapper.writeValueAsString(variables));
        } catch (Exception e) {
            log.error("[startProcess] 变量序列化失败: {}", e.getMessage());
            instance.setVariables("{}");
        }

        processInstanceMapper.insert(instance);
        log.info("[startProcess] 流程实例创建成功, instanceId={}", instance.getInstanceId());

        // 3. 解析模型并启动
        try {
            if (!StringUtils.hasText(def.getModelJson())) {
                log.info("[startProcess] 使用 Legacy 模式启动流程");
                return startLegacyProcess(instance, variables);
            }

            WfNodeConfig rootNode = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
            WfNodeConfig nextNode = rootNode.getNext();
            runNode(instance, nextNode, variables, 0);
            
        } catch (WorkflowException e) {
            // P0-3: 事务一致性 - WorkflowException 会触发事务回滚
            throw e;
        } catch (Exception e) {
            // P0-3: 事务一致性 - 将异常包装为 RuntimeException 触发回滚
            log.error("[startProcess] 启动流程失败, instanceId={}, error={}", instance.getInstanceId(), e.getMessage(), e);
            throw new WorkflowException("PROCESS_START_FAILED", "启动流程失败: " + e.getMessage(), e);
        }

        log.info("[startProcess] 流程启动成功, instanceId={}", instance.getInstanceId());
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
        if (depth > 500) {
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
                     RLock joinLock = redissonClient.getLock("lock:join:" + gateway.getId());
                     
                     try {
                         if (joinLock.tryLock(5, 10, TimeUnit.SECONDS)) {
                             long count = redisCache.increment(joinKey);
                             // 设置过期时间以避免垃圾数据（仅在第一次时设置）
                             if (count == 1) {
                                 redisCache.expire(joinKey, 1, TimeUnit.HOURS);
                             }
                             
                             int totalBranches = gateway.getBranches() != null ? gateway.getBranches().size() : 0;
                             
                             if (count < totalBranches) {
                                 // 等待其他分支
                                 return;
                             }
                             // 所有分支已到达，继续（并清除 key）
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
            // Use SimpleEvaluationContext to prevent SpEL injection attacks
            SimpleEvaluationContext context = SimpleEvaluationContext.forReadOnlyDataBinding().build();
            
            // Add variables to context
            if (variables != null) {
                variables.forEach(context::setVariable);
            }
            
            // Support simple expressions like "#amount > 5000"
            Boolean result = parser.parseExpression(condition).getValue(context, Boolean.class);
            return result != null && result;
        } catch (Exception e) {
            log.warn("[evaluateCondition] 条件表达式求值失败: condition={}, error={}", condition, e.getMessage());
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
        Long currentUserId = UserContext.getUserId();
        log.info("[completeTask] 开始处理任务, taskId={}, action={}, userId={}", taskId, action, currentUserId);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (!StringUtils.hasText(action)) {
            throw WorkflowException.validationError("操作类型不能为空");
        }
        
        // P0-5: 限流检查
        rateLimiterService.checkCompleteTaskLimit(currentUserId != null ? currentUserId : 0L);
        
        RLock lock = redissonClient.getLock("lock:task:" + taskId);
        try {
            if (lock.tryLock(5, 10, TimeUnit.SECONDS)) {
                // 1. 查询当前任务
                WfTask task = taskMapper.selectById(taskId);
                if (task == null) {
                    throw WorkflowException.taskNotFound(taskId);
                }
                
                // P0-2: 使用权限服务校验
                permissionService.checkTaskPermission(task);

                // 2. 保存历史记录
                WfTaskHistory history = new WfTaskHistory();
                history.setHistoryId(UUID.randomUUID().toString());
                history.setTaskId(task.getTaskId());
                history.setInstanceId(task.getInstanceId());
                history.setNodeName(task.getNodeName());
                history.setNodeKey(task.getNodeKey());
                history.setOperatorId(currentUserId);
                history.setOperatorName(UserContext.getUserName());
                history.setComment(comment);
                history.setAction(action);
                history.setCreateTime(new Date());
                taskHistoryMapper.insert(history);

                // 3. 删除当前任务
                taskMapper.deleteById(taskId);
                log.info("[completeTask] 任务已完成, taskId={}, action={}", taskId, action);

                // 4. 流程流转
                WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
                
                if ("REJECT".equalsIgnoreCase(action)) {
                    completeInstance(instance, WfProcessStatus.REJECTED.getCode());
                    log.info("[completeTask] 流程被拒绝, instanceId={}", instance.getInstanceId());
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
                        WfNodeConfig nextNode = findNextNode(root, task.getNodeKey());
                        
                        if (nextNode != null) {
                            runNode(instance, nextNode, variables, 0);
                        } else {
                            completeInstance(instance, WfProcessStatus.COMPLETED.getCode()); 
                        }
                    } else {
                         completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
                    }
                } catch (WorkflowException e) {
                    throw e;
                } catch (Exception e) {
                    log.error("[completeTask] 流程流转失败, taskId={}, error={}", taskId, e.getMessage(), e);
                    throw new WorkflowException("TASK_FLOW_FAILED", "流程流转失败: " + e.getMessage(), e);
                }

                return R.ok();
            } else {
                throw WorkflowException.invalidState("任务处理中，请勿重复提交");
            }
        } catch (WorkflowException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
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
        log.info("[rejectTask] 开始驳回任务, taskId={}, targetNodeKey={}", taskId, targetNodeKey);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (!StringUtils.hasText(targetNodeKey)) {
            throw WorkflowException.validationError("目标节点Key不能为空");
        }
        
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        
        // P0-2: 权限校验
        permissionService.checkRejectPermission(task);
        
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
        if (instance == null) {
            throw WorkflowException.instanceNotFound(task.getInstanceId());
        }
        
        WfProcessDefinition def = processDefinitionMapper.selectOne(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1")
        );
        
        try {
            WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
            WfNodeConfig targetNode = findNode(root, targetNodeKey);
            if (targetNode == null) {
                throw WorkflowException.validationError("目标节点不存在: " + targetNodeKey);
            }
            
            runNode(instance, targetNode, null, 0);
            
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("[rejectTask] 驳回失败, taskId={}, error={}", taskId, e.getMessage(), e);
            throw new WorkflowException("REJECT_FAILED", "驳回失败: " + e.getMessage(), e);
        }
        
        log.info("[rejectTask] 驳回成功, taskId={}, targetNodeKey={}", taskId, targetNodeKey);
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> recallProcess(String instanceId) {
        log.info("[recallProcess] 开始撤回流程, instanceId={}", instanceId);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(instanceId)) {
            throw WorkflowException.validationError("流程实例ID不能为空");
        }
        
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        
        if (!WfProcessStatus.RUNNING.getCode().equals(instance.getStatus())) {
            throw WorkflowException.invalidState("流程已结束，无法撤回");
        }
        
        // P0-2: 使用权限服务校验
        permissionService.checkRecallPermission(instance);
        
        // Delete all active tasks
        LambdaQueryWrapper<WfTask> taskWrapper = new LambdaQueryWrapper<>();
        taskWrapper.eq(WfTask::getInstanceId, instanceId);
        taskMapper.delete(taskWrapper);
        
        // P0-4: 清理 Redis 中的相关数据（SLA 超时等）
        try {
            redisCache.deleteObject("sys:wf:join:" + instanceId + ":*");
        } catch (Exception e) {
            log.warn("[recallProcess] 清理 Redis 数据失败: {}", e.getMessage());
        }
        
        // Update instance status
        instance.setStatus(WfProcessStatus.REVOKED.getCode());
        instance.setEndTime(new Date());
        processInstanceMapper.updateById(instance);
        
        log.info("[recallProcess] 流程撤回成功, instanceId={}", instanceId);
        return R.ok();
    }

    @Override
    public PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery) {
        log.info("[getTodoTasks] 查询待办任务, userId={}, pageNum={}, pageSize={}", userId, pageQuery.getPageNum(), pageQuery.getPageSize());
        
        Page<WfTask> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTask> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(WfTask::getAssignee, userId);
        queryWrapper.orderByDesc(WfTask::getCreateTime);
        
        Page<WfTask> resultPage = taskMapper.selectPage(page, queryWrapper);
        List<WfTask> tasks = resultPage.getRecords();

        if (tasks != null && !tasks.isEmpty()) {
            // P0-1: 批量查询优化 - 收集所有 instanceId
            List<String> instanceIds = tasks.stream()
                .map(WfTask::getInstanceId)
                .distinct()
                .collect(java.util.stream.Collectors.toList());
            
            // P0-1: 批量查询流程实例
            List<WfProcessInstance> instances = processInstanceMapper.selectBatchIds(instanceIds);
            Map<String, WfProcessInstance> instanceMap = instances.stream()
                .collect(java.util.stream.Collectors.toMap(WfProcessInstance::getInstanceId, inst -> inst));
            
            // P0-1: 收集所有 processDefKey
            List<String> processKeys = instances.stream()
                .map(WfProcessInstance::getProcessDefKey)
                .distinct()
                .collect(java.util.stream.Collectors.toList());
            
            // P0-1: 批量查询流程定义
            List<WfProcessDefinition> definitions = processDefinitionMapper.selectList(
                new LambdaQueryWrapper<WfProcessDefinition>()
                    .in(WfProcessDefinition::getProcessKey, processKeys)
                    .orderByDesc(WfProcessDefinition::getVersion)
            );
            
            // P0-1: 为每个 processKey 保留最新版本
            Map<String, WfProcessDefinition> defMap = new java.util.HashMap<>();
            for (WfProcessDefinition def : definitions) {
                defMap.putIfAbsent(def.getProcessKey(), def);
            }
            
            // P0-1: 填充任务数据
            for (WfTask task : tasks) {
                WfProcessInstance instance = instanceMap.get(task.getInstanceId());
                if (instance != null) {
                    task.setProcessDefKey(instance.getProcessDefKey());
                    task.setStartUserId(String.valueOf(instance.getStartUserId()));
                    task.setStartUserName(instance.getStartUserName());
                    task.setInstanceTitle(instance.getTitle());
                    
                    WfProcessDefinition def = defMap.get(instance.getProcessDefKey());
                    if (def != null) {
                        task.setProcessName(def.getProcessName());
                        task.setFormId(def.getFormId());
                    }
                    
                    if (StringUtils.hasText(instance.getVariables())) {
                        try {
                            Map<String, Object> vars = objectMapper.readValue(instance.getVariables(), Map.class);
                            task.setVariables(vars);
                        } catch (Exception e) {
                            log.warn("[getTodoTasks] 变量反序列化失败: {}", e.getMessage());
                        }
                    }
                }
            }
        }
        
        log.info("[getTodoTasks] 查询完成, 返回 {} 条任务", tasks != null ? tasks.size() : 0);
        return new PageResult<>(tasks, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public WfProcessInstance getProcessInstance(String instanceId) {
        log.info("[getProcessInstance] 查询流程实例, instanceId={}", instanceId);
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            log.warn("[getProcessInstance] 流程实例不存在, instanceId={}", instanceId);
        }
        return instance;
    }

    @Override
    public Map<String, Object> getProcessTrace(String instanceId) {
        log.info("[getProcessTrace] 查询流程轨迹, instanceId={}", instanceId);
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
        log.info("[getProcessTrace] 查询完成, finished={}, active={}", finished.size(), active.size());
        return result;
    }

    @Override
    public PageResult<WfProcessInstance> getMyInstances(Long userId, PageQuery pageQuery) {
        log.info("[getMyInstances] 查询我的流程实例, userId={}, pageNum={}, pageSize={}", userId, pageQuery.getPageNum(), pageQuery.getPageSize());
        
        Page<WfProcessInstance> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfProcessInstance> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(WfProcessInstance::getStartUserId, userId);
        queryWrapper.orderByDesc(WfProcessInstance::getStartTime);
        
        Page<WfProcessInstance> resultPage = processInstanceMapper.selectPage(page, queryWrapper);
        List<WfProcessInstance> list = resultPage.getRecords();

        if (list != null && !list.isEmpty()) {
            // P0-1: 批量查询优化 - 收集所有 processDefKey
            List<String> processKeys = list.stream()
                .map(WfProcessInstance::getProcessDefKey)
                .distinct()
                .collect(java.util.stream.Collectors.toList());
            
            // P0-1: 批量查询流程定义
            List<WfProcessDefinition> definitions = processDefinitionMapper.selectList(
                new LambdaQueryWrapper<WfProcessDefinition>()
                    .in(WfProcessDefinition::getProcessKey, processKeys)
                    .orderByDesc(WfProcessDefinition::getVersion)
            );
            
            // P0-1: 为每个 processKey 保留最新版本
            Map<String, WfProcessDefinition> defMap = new java.util.HashMap<>();
            for (WfProcessDefinition def : definitions) {
                defMap.putIfAbsent(def.getProcessKey(), def);
            }
            
            // P0-1: 填充实例数据
            for (WfProcessInstance instance : list) {
                WfProcessDefinition def = defMap.get(instance.getProcessDefKey());
                if (def != null) {
                    instance.setFormId(def.getFormId());
                }
            }
        }
        
        log.info("[getMyInstances] 查询完成, 返回 {} 条实例", list != null ? list.size() : 0);
        return new PageResult<>(list, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public PageResult<WfProcessDefinition> listProcessDefinitions(PageQuery pageQuery) {
        log.info("[listProcessDefinitions] 查询流程定义列表, pageNum={}, pageSize={}", pageQuery.getPageNum(), pageQuery.getPageSize());
        Page<WfProcessDefinition> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        Page<WfProcessDefinition> resultPage = processDefinitionMapper.selectPage(page, null);
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Cacheable(value = "formDefinition", key = "#formId", unless = "#result == null")
    public WfFormDefinition getFormDefinition(String formId) {
        log.info("[getFormDefinition] 查询表单定义(缓存未命中), formId={}", formId);
        return formDefinitionMapper.selectById(formId);
    }

    @Override
    public PageResult<WfFormDefinition> listFormDefinitions(PageQuery pageQuery) {
        log.info("[listFormDefinitions] 查询表单定义列表, pageNum={}, pageSize={}", pageQuery.getPageNum(), pageQuery.getPageSize());
        Page<WfFormDefinition> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        Page<WfFormDefinition> resultPage = formDefinitionMapper.selectPage(page, null);
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void readTask(String taskId, Long userId) {
        log.info("[readTask] 标记任务已读, taskId={}, userId={}", taskId, userId);
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
        Long currentUserId = UserContext.getUserId();
        log.info("[urgeTask] 开始催办任务, taskId={}, userId={}", taskId, currentUserId);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        
        // P0-5: 限流检查
        rateLimiterService.checkUrgeTaskLimit(currentUserId != null ? currentUserId : 0L);
        
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) {
            throw WorkflowException.instanceNotFound(task.getInstanceId());
        }
        
        // P0-2: 使用权限服务校验
        permissionService.checkUrgePermission(instance);
        
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
        
        log.info("[urgeTask] 催办成功, taskId={}, recipientId={}", taskId, task.getAssignee());
        return R.ok();
    }
}
