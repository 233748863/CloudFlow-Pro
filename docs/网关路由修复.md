# 后端代码修复文档

## 修复概述

本文档记录了 CloudFlow Pro 后端代码审查中发现的所有严重问题及其修复方案。

**重要说明**: 根据用户要求，Redis密码配置问题已跳过，其他所有问题都需要修复。

## P0 严重问题修复

### 1. SpEL 注入漏洞修复 ✅

**问题**: 使用 `StandardEvaluationContext` 存在远程代码执行风险

**位置**: `WorkflowServiceImpl.java` - `evaluateCondition` 方法

**修复状态**: ✅ 已完成

**修复内容**: 已将 `StandardEvaluationContext` 改为 `SimpleEvaluationContext`

```java
// ✅ 已修复
import org.springframework.expression.spel.support.SimpleEvaluationContext;

private boolean evaluateCondition(String condition, Map<String, Object> variables) {
    if (!StringUtils.hasText(condition)) {
        return true;
    }
    try {
        // 使用 SimpleEvaluationContext 防止 SpEL 注入攻击
        SimpleEvaluationContext context = SimpleEvaluationContext.forReadOnlyDataBinding().build();
        
        if (variables != null) {
            variables.forEach(context::setVariable);
        }
        
        Boolean result = parser.parseExpression(condition).getValue(context, Boolean.class);
        return result != null && result;
    } catch (Exception e) {
        System.err.println("Condition evaluation failed: " + condition + " Error: " + e.getMessage());
        return false;
    }
}
```

### 2. 任务权限校验被注释 ⚠️

**问题**: `completeTask` 方法中权限校验被注释，任何用户可处理任何任务

**位置**: `WorkflowServiceImpl.java` 第 464 行

**修复状态**: ⏳ 待修复

**当前代码**:
```java
// 校验权限
Long currentUserId = UserContext.getUserId();
if (task.getAssignee() != null && !task.getAssignee().equals(currentUserId)) {
    // return R.fail("无权处理此任务");  // ❌ 被注释
}
```

**修复方案**:
```java
// 校验权限
Long currentUserId = UserContext.getUserId();
if (task.getAssignee() != null && !task.getAssignee().equals(currentUserId)) {
    return R.fail("无权处理此任务");  // ✅ 启用权限校验
}
```

**预计工作量**: 10分钟

### 3. 并行网关竞态条件 ⚠️

**问题**: `increment` 和 `expire` 操作非原子性，可能导致并发问题

**位置**: `WorkflowServiceImpl.java` 第 289-299 行

**修复状态**: ⏳ 待修复

**当前代码**:
```java
if (gateway != null) {
    String joinKey = "sys:wf:join:" + instance.getInstanceId() + ":" + gateway.getId();
    long count = redisCache.increment(joinKey);
    redisCache.expire(joinKey, 24, java.util.concurrent.TimeUnit.HOURS);
    
    int totalBranches = gateway.getBranches() != null ? gateway.getBranches().size() : 0;
    
    if (count < totalBranches) {
        return;
    }
    redisCache.deleteObject(joinKey);
}
```

**修复方案**:
```java
if (gateway != null) {
    String joinKey = "sys:wf:join:" + instance.getInstanceId() + ":" + gateway.getId();
    RLock joinLock = redissonClient.getLock("lock:join:" + gateway.getId());
    try {
        if (joinLock.tryLock(5, 10, TimeUnit.SECONDS)) {
            long count = redisCache.increment(joinKey);
            // 首次设置过期时间
            if (count == 1) {
                redisCache.expire(joinKey, 1, java.util.concurrent.TimeUnit.HOURS);
            }
            
            int totalBranches = gateway.getBranches() != null ? gateway.getBranches().size() : 0;
            
            if (count < totalBranches) {
                return;
            }
            redisCache.deleteObject(joinKey);
        }
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new RuntimeException("并行网关汇聚失败", e);
    } finally {
        if (joinLock.isHeldByCurrentThread()) {
            joinLock.unlock();
        }
    }
}
```

**预计工作量**: 4小时

### 4. 递归深度限制过低 ⚠️

**问题**: 深度限制为 100，复杂流程可能失败

**位置**: `WorkflowServiceImpl.java` 第 257 行

**修复状态**: ⏳ 待修复

**当前代码**:
```java
private void runNode(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables, int depth) {
    if (depth > 100) {  // ❌ 限制过低
        throw new RuntimeException("流程深度超出限制（可能检测到循环）");
    }
    // ...
}
```

**修复方案**:
```java
private void runNode(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables, int depth) {
    if (depth > 500) {  // ✅ 提高到 500
        throw new RuntimeException("流程深度超出限制（可能检测到循环）");
    }
    // ...
}
```

**预计工作量**: 10分钟

### 5. 流程变量序列化错误被忽略 ⚠️

**问题**: 序列化失败时静默忽略，导致数据丢失

**位置**: `WorkflowServiceImpl.java` 第 195-199 行

**修复状态**: ⏳ 待修复

**当前代码**:
```java
// Save variables as JSON
try {
    instance.setVariables(objectMapper.writeValueAsString(variables));
} catch (Exception e) {
    // 忽略序列化错误  // ❌ 静默失败
}
```

**修复方案**:
```java
// Save variables as JSON
try {
    instance.setVariables(objectMapper.writeValueAsString(variables));
} catch (Exception e) {
    // ✅ 记录错误并使用空对象
    System.err.println("Failed to serialize variables: " + e.getMessage());
    instance.setVariables("{}");
}
```

**预计工作量**: 30分钟

### 6. 多租户隔离缺失 ⚠️ 🔥

**问题**: 数据库查询未过滤 tenant_id，可能导致跨租户数据泄露

**严重程度**: 🔥 极高（数据安全问题）

**修复状态**: ⏳ 待修复

**影响范围**: 
- `WorkflowServiceImpl.java` - 所有查询方法（约15处）
- `SysUserServiceImpl.java` - 用户查询方法（约5处）
- `SysRoleServiceImpl.java` - 角色查询方法（约3处）
- `SysDeptServiceImpl.java` - 部门查询方法（约3处）
- `SysMenuServiceImpl.java` - 菜单查询方法（约3处）
- OA模块所有Service类（约20处）

**当前代码示例**:
```java
// ❌ 缺少租户过滤
public PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery) {
    Page<WfTask> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
    LambdaQueryWrapper<WfTask> queryWrapper = new LambdaQueryWrapper<>();
    queryWrapper.eq(WfTask::getAssignee, userId);
    queryWrapper.orderByDesc(WfTask::getCreateTime);
    
    Page<WfTask> resultPage = taskMapper.selectPage(page, queryWrapper);
    // ...
}
```

**修复方案**:

**步骤1**: 在 UserContext 中添加租户ID获取方法
```java
// UserContext.java
public static Long getTenantId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof UserDetails) {
        // 从 JWT token 或 UserDetails 中获取租户ID
        return ((CustomUserDetails) authentication.getPrincipal()).getTenantId();
    }
    return null;
}
```

**步骤2**: 创建 MyBatis-Plus 租户拦截器（推荐方案）
```java
// TenantInterceptor.java
@Component
public class TenantLineHandler implements TenantLineHandler {
    
    @Override
    public Expression getTenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            return new NullValue();
        }
        return new LongValue(tenantId);
    }
    
    @Override
    public String getTenantIdColumn() {
        return "tenant_id";
    }
    
    @Override
    public boolean ignoreTable(String tableName) {
        // 系统表不需要租户隔离
        return "sys_tenant".equalsIgnoreCase(tableName) 
            || "sys_config".equalsIgnoreCase(tableName);
    }
}

// MybatisPlusConfig.java
@Configuration
public class MybatisPlusConfig {
    
    @Autowired
    private TenantLineHandler tenantLineHandler;
    
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        
        // 添加租户拦截器
        TenantLineInnerInterceptor tenantInterceptor = new TenantLineInnerInterceptor();
        tenantInterceptor.setTenantLineHandler(tenantLineHandler);
        interceptor.addInnerInterceptor(tenantInterceptor);
        
        // 添加分页拦截器
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        
        return interceptor;
    }
}
```

**步骤3**: 在所有查询中手动添加租户过滤（临时方案/双重保险）
```java
// ✅ 添加租户过滤
public PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery) {
    Page<WfTask> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
    LambdaQueryWrapper<WfTask> queryWrapper = new LambdaQueryWrapper<>();
    
    // 添加租户过滤
    Long tenantId = UserContext.getTenantId();
    if (tenantId != null) {
        queryWrapper.eq(WfTask::getTenantId, tenantId);
    }
    
    queryWrapper.eq(WfTask::getAssignee, userId);
    queryWrapper.orderByDesc(WfTask::getCreateTime);
    
    Page<WfTask> resultPage = taskMapper.selectPage(page, queryWrapper);
    // ...
}
```

**需要修改的文件列表**:
1. `cloudflow-common` - 添加 TenantLineHandler 和 MybatisPlusConfig
2. `UserContext.java` - 添加 getTenantId() 方法
3. `WorkflowServiceImpl.java` - 所有查询方法（约15处）
4. `SysUserServiceImpl.java` - 用户查询方法（约5处）
5. `SysRoleServiceImpl.java` - 角色查询方法（约3处）
6. `SysDeptServiceImpl.java` - 部门查询方法（约3处）
7. `SysMenuServiceImpl.java` - 菜单查询方法（约3处）
8. OA模块所有Service类（约20处）

**预计工作量**: 2天（配置拦截器1小时 + 修改所有查询方法16小时 + 测试7小时）

## P1 重要问题修复

### 7. 数据库索引缺失 ⚠️

**问题**: `wf_task_history` 表缺少关键索引

**位置**: `DB/02_workflow.sql`

**修复状态**: ⏳ 待修复

**修复方案**:
```sql
-- 添加索引以提高查询性能
CREATE INDEX idx_task_history_node_key ON wf_task_history(node_key);
CREATE INDEX idx_task_history_operator_id ON wf_task_history(operator_id);
CREATE INDEX idx_task_history_instance_id ON wf_task_history(instance_id);

-- 添加租户ID索引（配合多租户修复）
CREATE INDEX idx_task_tenant_id ON wf_task(tenant_id);
CREATE INDEX idx_instance_tenant_id ON wf_process_instance(tenant_id);
CREATE INDEX idx_task_history_tenant_id ON wf_task_history(tenant_id);
```

**预计工作量**: 1小时

### 8. 数据库连接池未配置 ⚠️

**问题**: 高并发时可能连接耗尽

**位置**: Nacos 配置中心

**修复状态**: ⏳ 待修复

**修复方案**:
```yaml
spring:
  datasource:
    type: com.zaxxer.hikari.HikariDataSource
    hikari:
      minimum-idle: 10
      maximum-pool-size: 50
      idle-timeout: 600000
      max-lifetime: 1800000
      connection-timeout: 30000
      connection-test-query: SELECT 1
      pool-name: CloudFlowHikariPool
```

**预计工作量**: 30分钟

### 9. 日志级别不当 ⚠️

**问题**: 生产环境使用 DEBUG 级别影响性能

**位置**: Nacos 配置中心

**修复状态**: ⏳ 待修复

**修复方案**:
```yaml
logging:
  level:
    root: INFO  # ✅ 改为 INFO
    com.cloudflow: INFO
    com.cloudflow.workflow: DEBUG  # 仅工作流模块保持 DEBUG（开发阶段）
```

**预计工作量**: 10分钟

### 10. 用户注册缺少默认角色 ⚠️

**问题**: 新用户注册后无角色，无法使用系统

**位置**: `AuthController.java` 或 `SysUserServiceImpl.java`

**修复状态**: ⏳ 待修复

**修复方案**:
```java
@Transactional(rollbackFor = Exception.class)
public R<?> register(RegisterRequest request) {
    // ... 创建用户 ...
    
    // ✅ 分配默认角色
    SysRole defaultRole = sysRoleMapper.selectOne(
        new LambdaQueryWrapper<SysRole>()
            .eq(SysRole::getRoleKey, "common")
            .last("LIMIT 1")
    );
    
    if (defaultRole != null) {
        SysUserRole userRole = new SysUserRole();
        userRole.setUserId(user.getUserId());
        userRole.setRoleId(defaultRole.getRoleId());
        sysUserRoleMapper.insert(userRole);
    }
    
    return R.ok();
}
```

**预计工作量**: 2小时

## P2 优化建议

### 11. 事务超时配置

**建议**: 为长时间运行的事务添加超时配置

```java
@Transactional(rollbackFor = Exception.class, timeout = 30)
public R<?> startProcess(...) {
    // ...
}
```

**预计工作量**: 1小时

### 12. 健康检查端点

**建议**: 添加自定义健康检查

```java
@Component
public class WorkflowHealthIndicator implements HealthIndicator {
    @Override
    public Health health() {
        // 检查数据库连接
        // 检查 Redis 连接
        // 检查工作流引擎状态
        return Health.up().build();
    }
}
```

**预计工作量**: 2小时

## 修复优先级与排期

### 第一阶段：P0严重问题（预计3天）

**Day 1 上午**:
1. ✅ SpEL注入漏洞 - 已完成
2. ⏳ 启用任务权限校验 - 10分钟
3. ⏳ 提高递归深度限制 - 10分钟
4. ⏳ 修复变量序列化错误处理 - 30分钟

**Day 1 下午 - Day 2**:
5. ⏳ 修复并行网关竞态条件 - 4小时

**Day 2 下午 - Day 3**:
6. ⏳ **修复多租户隔离缺失** - 2天
   - Day 2 下午: 配置租户拦截器（1小时）+ 修改 WorkflowServiceImpl（4小时）
   - Day 3 上午: 修改系统模块Service（4小时）
   - Day 3 下午: 修改OA模块Service（4小时）+ 测试（3小时）

### 第二阶段：P1重要问题（预计1天）

**Day 4 上午**:
7. ⏳ 添加数据库索引 - 1小时
8. ⏳ 配置数据库连接池 - 30分钟
9. ⏳ 调整日志级别 - 10分钟

**Day 4 下午**:
10. ⏳ 用户注册添加默认角色 - 2小时

### 第三阶段：P2优化（预计半天）

**Day 5 上午**:
11. 添加事务超时配置 - 1小时
12. 实现健康检查端点 - 2小时

**总预计时间**: 4.5个工作日

## 修复状态统计

- ✅ 已完成: 1 项 (SpEL 注入修复)
- ⏳ 待修复: 11 项
  - P0: 5项（任务权限、并行网关、递归深度、序列化错误、**多租户隔离**）
  - P1: 4项（数据库索引、连接池、日志级别、用户注册角色）
  - P2: 2项（事务超时、健康检查）
- 🚫 跳过: 1 项 (Redis密码配置 - 用户要求跳过)

**总计**: 13 项任务（12项需修复）

## 部署检查清单

### P0 问题检查
- [ ] SpEL注入漏洞已修复
- [ ] 任务权限校验已启用
- [ ] 并行网关竞态条件已修复
- [ ] 递归深度限制已提高
- [ ] 变量序列化错误处理已改进
- [ ] **多租户隔离已实现**

### P1 问题检查
- [ ] 数据库索引已创建
- [ ] 连接池已配置
- [ ] 日志级别已调整为 INFO
- [ ] 用户注册默认角色已添加

### P2 优化检查
- [ ] 事务超时已配置
- [ ] 健康检查端点已实现

### 部署前检查
- [ ] 所有 P0 问题已修复
- [ ] 所有 P1 问题已修复
- [ ] 环境变量已配置
- [ ] 监控告警已配置
- [ ] 备份策略已制定
- [ ] 多租户数据隔离测试通过

## 安全加固建议

1. **API 接口鉴权**: 确保所有 API 都有适当的权限验证
2. **SQL 注入防护**: 使用 MyBatis-Plus 的参数化查询
3. **XSS 防护**: 对用户输入进行转义
4. **CSRF 防护**: 添加 CSRF Token
5. **敏感信息加密**: 密码、Token 等敏感信息加密存储
6. **多租户数据隔离**: 确保租户间数据完全隔离

## 性能优化建议

1. **缓存策略**: 流程定义、表单定义等静态数据使用缓存
2. **批量操作**: 减少数据库往返次数
3. **异步处理**: 通知发送等非关键操作异步化
4. **连接池优化**: 根据实际负载调整连接池参数
5. **索引优化**: 为高频查询字段添加索引

## 监控告警建议

1. **流程执行监控**: 记录流程执行时间、失败率
2. **任务积压告警**: 待办任务超过阈值告警
3. **系统资源监控**: CPU、内存、数据库连接数
4. **错误日志告警**: 关键错误实时告警
5. **租户隔离监控**: 监控跨租户访问尝试

## 测试建议

1. **单元测试**: 覆盖核心业务逻辑
2. **集成测试**: 测试完整流程流转
3. **并发测试**: 测试并行网关、高并发场景
4. **安全测试**: 渗透测试、权限测试
5. **多租户测试**: 验证租户间数据完全隔离

---

**文档版本**: 2.0  
**创建时间**: 2026-02-07  
**最后更新**: 2026-02-07 16:42  
**审查人**: CodeBuddy CN  
**修复排期**: 4.5个工作日
