# Phase 1 核心功能补齐 - 实现指南

本文档提供任务2、3、4的详细实现指南。

---

## 任务2: 自动审批机制

### 需求说明
避免同一人在多个节点重复审批，提升审批效率。

### 实现方案

#### 1. 在流程定义中添加配置
在流程定义的节点配置中添加 `autoPass` 标志：

```json
{
  "nodeKey": "approve_node_1",
  "nodeName": "部门审批",
  "autoPass": true,  // 启用自动审批
  "assigneeType": "USER",
  "assigneeValue": "user1,user2"
}
```

#### 2. 修改 WfTaskServiceImpl.completeTask() 方法

在任务完成后，检查是否需要自动审批：

```java
@Override
public R<?> completeTask(String taskId, String action, String comment, 
                         Map<String, Object> variables, String delegateUserId) {
    // ... 现有的任务完成逻辑 ...
    
    // 任务完成后，检查自动审批
    if ("APPROVE".equals(action)) {
        checkAndAutoPass(instance, currentUserId, variables);
    }
    
    return R.ok("任务处理成功");
}

/**
 * 检查并执行自动审批
 * 如果当前用户在后续节点中，自动完成这些任务
 */
private void checkAndAutoPass(WfProcessInstance instance, Long currentUserId, 
                               Map<String, Object> variables) {
    // 1. 获取当前活动节点
    List<WfTask> activeTasks = taskMapper.selectList(
        new LambdaQueryWrapper<WfTask>()
            .eq(WfTask::getProcessInstanceId, instance.getInstanceId())
            .eq(WfTask::getStatus, "PENDING")
    );
    
    // 2. 检查每个活动任务
    for (WfTask task : activeTasks) {
        // 获取节点配置
        Map<String, Object> nodeConfig = getNodeConfig(instance, task.getNodeKey());
        Boolean autoPass = (Boolean) nodeConfig.get("autoPass");
        
        // 如果启用自动审批且当前用户是处理人
        if (Boolean.TRUE.equals(autoPass) && 
            Objects.equals(task.getAssigneeId(), currentUserId)) {
            
            log.info("自动审批: 用户[{}]自动通过任务[{}]", currentUserId, task.getTaskId());
            
            // 自动完成任务
            autoCompleteTask(task, currentUserId, "系统自动审批（避免重复审批）");
        }
    }
}

/**
 * 自动完成任务
 */
private void autoCompleteTask(WfTask task, Long userId, String comment) {
    // 更新任务状态
    task.setStatus("APPROVED");
    task.setCompletedTime(new Date());
    task.setComment(comment);
    taskMapper.updateById(task);
    
    // 记录审计日志
    auditService.recordAudit(
        task.getProcessInstanceId(),
        task.getTaskId(),
        task.getNodeKey(),
        userId,
        "AUTO_APPROVE",
        comment,
        null
    );
    
    // 继续流程流转
    nodeExecutionService.executeNode(
        task.getProcessInstanceId(),
        task.getNodeKey(),
        new HashMap<>()
    );
}
```

#### 3. 添加审计动作

在 `WorkflowAuditService` 中添加：

```java
public static final String AUTO_APPROVE = "AUTO_APPROVE"; // 自动审批
```

---

## 任务3: 流程终止功能

### 需求说明
管理员强制终止异常流程，与作废的区别是用于异常流程处理。

### 实现方案

#### 1. 在 WfInstanceServiceImpl 中实现 terminateProcess()

```java
@Override
public R<?> terminateProcess(String instanceId, String reason) {
    // 1. 权限校验 - 仅管理员可操作
    Long currentUserId = SecurityUtils.getUserId();
    if (!SecurityUtils.isAdmin()) {
        return R.fail("仅管理员可终止流程");
    }
    
    // 2. 参数校验
    if (StringUtils.isBlank(reason)) {
        return R.fail("终止原因不能为空");
    }
    
    // 3. 查询流程实例
    WfProcessInstance instance = instanceMapper.selectById(instanceId);
    if (instance == null) {
        return R.fail("流程实例不存在");
    }
    
    // 4. 状态校验
    if (!"RUNNING".equals(instance.getStatus()) && 
        !"SUSPENDED".equals(instance.getStatus())) {
        return R.fail("只能终止运行中或已暂停的流程");
    }
    
    // 5. 使用分布式锁
    RLock lock = redissonClient.getLock("lock:instance:" + instanceId);
    try {
        if (lock.tryLock(5, 10, TimeUnit.SECONDS)) {
            // 6. 删除所有待办任务
            int deletedTasks = taskMapper.delete(
                new LambdaQueryWrapper<WfTask>()
                    .eq(WfTask::getProcessInstanceId, instanceId)
                    .in(WfTask::getStatus, "PENDING", "DELEGATED")
            );
            
            // 7. 更新流程实例状态
            instance.setStatus("TERMINATED");
            instance.setEndTime(new Date());
            instance.setEndReason(reason);
            instanceMapper.updateById(instance);
            
            // 8. 记录审计日志
            auditService.recordAudit(
                instanceId,
                null,
                null,
                currentUserId,
                "TERMINATE",
                reason,
                Map.of("deletedTasks", deletedTasks)
            );
            
            // 9. 发布事件
            eventPublisher.publishTerminateEvent(instance, reason);
            
            log.info("流程终止成功: instanceId={}, deletedTasks={}, reason={}", 
                     instanceId, deletedTasks, reason);
            
            return R.ok("流程已终止", Map.of("deletedTasks", deletedTasks));
        } else {
            return R.fail("系统繁忙，请稍后重试");
        }
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        return R.fail("操作被中断");
    } finally {
        if (lock.isHeldByCurrentThread()) {
            lock.unlock();
        }
    }
}
```

#### 2. 在 WorkflowController 中添加接口

```java
/**
 * 终止流程
 */
@PostMapping("/instance/terminate")
@PreAuthorize("@ss.hasRole('admin')")
public R<?> terminateProcess(@RequestBody Map<String, String> params) {
    String instanceId = params.get("instanceId");
    String reason = params.get("reason");
    return instanceService.terminateProcess(instanceId, reason);
}
```

#### 3. 添加审计动作

```java
public static final String TERMINATE = "TERMINATE"; // 终止流程
```

---

## 任务4: 权限忽略机制

### 需求说明
支持系统自动审批和管理员代理审批，灵活的权限控制。

### 实现方案

#### 1. 在流程变量中添加权限忽略标志

```java
// 在 startProcess 或 completeTask 时设置
variables.put("_ignore_permission", true);      // 忽略权限校验
variables.put("_ignore_delegation", true);      // 忽略委派处理
variables.put("_ignore_countersign", true);     // 忽略会签处理
variables.put("_system_auto_approve", true);    // 系统自动审批标志
```

#### 2. 修改权限校验逻辑

在 `WfTaskServiceImpl.completeTask()` 中：

```java
@Override
public R<?> completeTask(String taskId, String action, String comment, 
                         Map<String, Object> variables, String delegateUserId) {
    // 1. 查询任务
    WfTask task = taskMapper.selectById(taskId);
    if (task == null) {
        return R.fail("任务不存在");
    }
    
    // 2. 获取当前用户
    Long currentUserId = SecurityUtils.getUserId();
    
    // 3. 权限校验（支持忽略）
    if (!checkTaskPermission(task, currentUserId, variables)) {
        return R.fail("您没有权限处理此任务");
    }
    
    // ... 后续逻辑 ...
}

/**
 * 检查任务权限（支持权限忽略）
 */
private boolean checkTaskPermission(WfTask task, Long userId, Map<String, Object> variables) {
    // 1. 检查是否忽略权限
    Boolean ignorePermission = (Boolean) variables.get("_ignore_permission");
    if (Boolean.TRUE.equals(ignorePermission)) {
        // 仅管理员可以忽略权限
        if (SecurityUtils.isAdmin()) {
            log.info("管理员忽略权限校验: userId={}, taskId={}", userId, task.getTaskId());
            return true;
        }
    }
    
    // 2. 检查是否系统自动审批
    Boolean systemAutoApprove = (Boolean) variables.get("_system_auto_approve");
    if (Boolean.TRUE.equals(systemAutoApprove)) {
        log.info("系统自动审批: taskId={}", task.getTaskId());
        return true;
    }
    
    // 3. 正常权限校验
    // 检查是否是任务处理人
    if (Objects.equals(task.getAssigneeId(), userId)) {
        return true;
    }
    
    // 检查是否是候选人
    if (isCandidate(task, userId)) {
        return true;
    }
    
    // 检查是否是管理员
    if (SecurityUtils.isAdmin()) {
        return true;
    }
    
    return false;
}
```

#### 3. 在委派和会签处理中支持忽略

```java
/**
 * 处理委派（支持忽略）
 */
private void handleDelegation(WfTask task, Map<String, Object> variables) {
    // 检查是否忽略委派
    Boolean ignoreDelegation = (Boolean) variables.get("_ignore_delegation");
    if (Boolean.TRUE.equals(ignoreDelegation)) {
        log.info("忽略委派处理: taskId={}", task.getTaskId());
        return;
    }
    
    // 正常委派处理逻辑
    // ...
}

/**
 * 处理会签（支持忽略）
 */
private void handleCountersign(WfTask task, Map<String, Object> variables) {
    // 检查是否忽略会签
    Boolean ignoreCountersign = (Boolean) variables.get("_ignore_countersign");
    if (Boolean.TRUE.equals(ignoreCountersign)) {
        log.info("忽略会签处理: taskId={}", task.getTaskId());
        return;
    }
    
    // 正常会签处理逻辑
    // ...
}
```

#### 4. 记录审计日志

在使用权限忽略时，记录详细的审计日志：

```java
if (Boolean.TRUE.equals(ignorePermission)) {
    auditService.recordAudit(
        task.getProcessInstanceId(),
        task.getTaskId(),
        task.getNodeKey(),
        userId,
        "IGNORE_PERMISSION",
        "管理员忽略权限校验",
        Map.of("originalAssignee", task.getAssigneeId())
    );
}
```

---

## 测试建议

### 任务2测试
1. 创建一个流程，同一用户在多个节点
2. 在第一个节点启用 `autoPass`
3. 完成第一个节点后，检查后续节点是否自动完成

### 任务3测试
1. 启动一个流程
2. 使用管理员账号调用终止接口
3. 验证所有待办任务被删除
4. 验证流程状态变为 TERMINATED

### 任务4测试
1. 使用管理员账号，设置 `_ignore_permission=true`
2. 完成不属于自己的任务
3. 验证任务可以成功完成
4. 检查审计日志是否记录了权限忽略操作

---

## 注意事项

1. **安全性**: 权限忽略功能仅限管理员使用，必须严格校验
2. **审计**: 所有特殊操作都必须记录详细的审计日志
3. **分布式锁**: 终止流程等关键操作必须使用分布式锁
4. **事件发布**: 重要操作完成后发布事件，便于其他模块监听
5. **错误处理**: 完善的异常处理和错误提示

---

## 实现优先级

1. **P0 - 立即实现**: 任务3（流程终止）- 最简单，影响最大
2. **P1 - 本周完成**: 任务4（权限忽略）- 中等复杂度
3. **P2 - 下周完成**: 任务2（自动审批）- 需要仔细测试

---

**文档版本**: v1.0  
**创建时间**: 2026-02-21  
**作者**: CloudFlow Team
