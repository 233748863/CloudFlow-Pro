# P2 高价值修复项实施计划

> 本文档列出 P0/P1 完成后的高价值优化项，按实施优先级排序

## 实施优先级

### 第一批：核心功能增强（立即实施）
1. **4.C: 启动权限校验** - 按角色/部门限制流程启动权限
2. **4.F: 流程实例去重** - 幂等Key防重，避免重复提交
3. **5.G: 变量合并逻辑** - 审批时可修改/补充流程变量
4. **6.B: 目标节点合法性校验** - 只允许驳回到之前的审批节点

### 第二批：用户体验优化（短期实施）
5. **5.F: 任务完成通知发起人** - 每个节点完成后通知发起人进度
6. **8.C: 已读/未读标记集成** - getTodoTasks 返回已读状态
7. **9.A: 查看实例权限控制** - 只允许发起人、处理人、管理员查看
8. **10.A: 流程轨迹信息完整性** - 返回完整历史记录（处理人、时间、意见）

### 第三批：性能与监控（中期实施）
9. **4.K: runNode重复加载定义优化** - 将定义作为参数传递，避免重复查询
10. **P.3: 数据库索引审查** - 确保关键字段有索引
11. **M.2: 监控指标暴露** - 使用 Micrometer 暴露 Prometheus 指标
12. **S.3: 操作审计日志** - 使用 AOP 记录关键操作

### 第四批：高级功能（长期规划）
13. **G.2: 事务补偿机制** - Saga 模式实现
14. **G.3: 流程监控大屏** - 统计 API + Dashboard
15. **G.4: 流程统计分析** - 平均耗时、通过率、驳回率等

---

## 第一批详细实施方案

### 1. 4.C: 启动权限校验

**目标**: 实现按角色/部门限制流程启动权限

**实施步骤**:
1. 在 `wf_process_definition` 表增加字段：
   - `start_permission_type` VARCHAR(20) - 权限类型（ALL/ROLE/DEPT/USER）
   - `start_permission_value` TEXT - 权限值（角色ID列表/部门ID列表/用户ID列表，JSON格式）

2. 创建 `ProcessStartPermissionChecker` 服务：
```java
@Service
public class ProcessStartPermissionChecker {
    boolean canStartProcess(Long userId, WfProcessDefinition definition);
}
```

3. 在 `startProcess` 方法中调用权限检查

**预计工作量**: 2小时

---

### 2. 4.F: 流程实例去重

**目标**: 使用幂等Key防止重复提交

**实施步骤**:
1. 在 `startProcess` 方法增加可选参数 `idempotentKey`
2. 使用 Redis 存储幂等Key：
   - Key: `sys:wf:idempotent:{idempotentKey}`
   - Value: instanceId
   - TTL: 5分钟

3. 逻辑：
```java
if (idempotentKey != null) {
    String existingInstanceId = redisCache.getCacheObject("sys:wf:idempotent:" + idempotentKey);
    if (existingInstanceId != null) {
        return R.ok(existingInstanceId); // 返回已存在的实例ID
    }
}
// ... 创建实例后
if (idempotentKey != null) {
    redisCache.setCacheObject("sys:wf:idempotent:" + idempotentKey, instanceId, 5, TimeUnit.MINUTES);
}
```

**预计工作量**: 1小时

---

### 3. 5.G: 变量合并逻辑

**目标**: 审批时可修改/补充流程变量

**实施步骤**:
1. 在 `completeTask` 方法中，将传入的 `variables` 与实例变量合并：
```java
// 获取实例当前变量
Map<String, Object> instanceVars = objectMapper.readValue(instance.getVariables(), Map.class);

// 合并新变量（新变量覆盖旧变量）
if (variables != null) {
    instanceVars.putAll(variables);
}

// 更新实例变量
instance.setVariables(objectMapper.writeValueAsString(instanceVars));
processInstanceMapper.updateById(instance);

// 使用合并后的变量继续流转
runNode(instance, nextNode, instanceVars, 0);
```

2. 在 `WfTaskHistory` 中增加字段记录变量变更：
   - `variables_changed` TEXT - 记录本次修改的变量（JSON格式）

**预计工作量**: 1.5小时

---

### 4. 6.B: 目标节点合法性校验

**目标**: 驳回时只允许驳回到之前的审批节点

**实施步骤**:
1. 创建 `findPreviousApprovalNodes` 方法：
```java
private List<String> findPreviousApprovalNodes(String instanceId, String currentNodeKey) {
    // 从 wf_task_history 查询当前节点之前的所有 APPROVAL 类型节点
    List<WfTaskHistory> histories = taskHistoryMapper.selectList(
        new LambdaQueryWrapper<WfTaskHistory>()
            .eq(WfTaskHistory::getInstanceId, instanceId)
            .orderByAsc(WfTaskHistory::getCreateTime)
    );
    
    List<String> previousNodes = new ArrayList<>();
    for (WfTaskHistory h : histories) {
        if (h.getNodeKey().equals(currentNodeKey)) {
            break; // 到达当前节点，停止
        }
        if ("APPROVAL".equals(getNodeType(h.getNodeKey()))) {
            previousNodes.add(h.getNodeKey());
        }
    }
    return previousNodes;
}
```

2. 在 `rejectTask` 方法中校验：
```java
List<String> allowedNodes = findPreviousApprovalNodes(task.getInstanceId(), task.getNodeKey());
if (!allowedNodes.contains(targetNodeKey)) {
    throw WorkflowException.validationError("只能驳回到之前的审批节点");
}
```

**预计工作量**: 2小时

---

## 实施时间表

| 批次 | 项目数 | 预计工作量 | 开始时间 | 完成时间 |
|------|--------|-----------|---------|---------|
| 第一批 | 4项 | 6.5小时 | 立即 | 1天内 |
| 第二批 | 4项 | 8小时 | 第2天 | 第3天 |
| 第三批 | 4项 | 16小时 | 第4天 | 第6天 |
| 第四批 | 3项 | 40小时 | 第7天 | 第12天 |

---

## 数据库变更清单

### wf_process_definition 表
```sql
ALTER TABLE wf_process_definition 
ADD COLUMN start_permission_type VARCHAR(20) DEFAULT 'ALL' COMMENT '启动权限类型：ALL/ROLE/DEPT/USER',
ADD COLUMN start_permission_value TEXT COMMENT '权限值（JSON格式）';
```

### wf_task_history 表
```sql
ALTER TABLE wf_task_history 
ADD COLUMN variables_changed TEXT COMMENT '本次修改的变量（JSON格式）';
```

### 索引优化（P.3）
```sql
-- wf_task 表
CREATE INDEX idx_assignee_status ON wf_task(assignee, status);
CREATE INDEX idx_instance_status ON wf_task(instance_id, status);

-- wf_process_instance 表
CREATE INDEX idx_start_user_status ON wf_process_instance(start_user_id, status);
CREATE INDEX idx_process_key_status ON wf_process_instance(process_def_key, status);
CREATE INDEX idx_start_time ON wf_process_instance(start_time);

-- wf_task_history 表
CREATE INDEX idx_instance_create_time ON wf_task_history(instance_id, create_time);
CREATE INDEX idx_operator_create_time ON wf_task_history(operator_id, create_time);
```

---

## 配置文件变更

### application.yml
```yaml
workflow:
  # 已有配置
  rate-limit:
    start-process: 10
    complete-task: 30
    urge-task: 5
  
  # 新增配置
  idempotent:
    enabled: true
    ttl-minutes: 5
  
  permission:
    check-start-permission: true
    default-start-permission: ALL
  
  monitoring:
    enabled: true
    metrics-prefix: cloudflow_workflow
```

---

## 测试计划

### 单元测试
- [ ] ProcessStartPermissionChecker 测试
- [ ] 幂等Key防重测试
- [ ] 变量合并逻辑测试
- [ ] 目标节点合法性校验测试

### 集成测试
- [ ] 完整流程启动权限测试
- [ ] 重复提交防护测试
- [ ] 审批变量修改测试
- [ ] 驳回节点限制测试

### 性能测试
- [ ] 并发启动流程测试（1000 QPS）
- [ ] 批量查询性能测试
- [ ] 索引优化效果验证

---

## 风险评估

| 风险项 | 影响 | 概率 | 缓解措施 |
|--------|------|------|---------|
| 数据库变更失败 | 高 | 低 | 提前备份，使用事务 |
| 权限逻辑复杂 | 中 | 中 | 充分测试，分阶段上线 |
| 性能下降 | 高 | 低 | 压测验证，监控指标 |
| 兼容性问题 | 中 | 低 | 保留旧逻辑兼容 |

---

## 回滚方案

1. **代码回滚**: Git revert 到上一个稳定版本
2. **数据库回滚**: 
   - 删除新增字段（如果未使用）
   - 删除新增索引
3. **配置回滚**: 恢复旧配置文件
4. **Redis清理**: 清除新增的Key前缀

---

## 成功标准

- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 性能测试达标（P99 < 500ms）
- [ ] 代码审查通过
- [ ] 文档更新完成
- [ ] 生产环境灰度验证通过
