# WorkflowServiceImpl 后端修复实施计划

## P0 - 必须修复（阻塞上线）

### 1. 修复 N+1 查询性能问题
**位置**: `getTodoTasks`, `getMyInstances`
**问题**: 循环查询流程实例和定义
**方案**: 
- 使用批量查询或 JOIN 查询
- 创建 DTO 对象包含所有需要的字段
- 使用 MyBatis 的 resultMap 关联查询

**实施步骤**:
1. 创建 `WfTaskDTO` 包含所有关联数据
2. 在 Mapper 中添加批量查询方法
3. 修改 `getTodoTasks` 使用批量查询
4. 修改 `getMyInstances` 使用批量查询

### 2. 添加完整的权限控制
**问题**: 很多操作没有权限校验
**方案**:
- 创建权限注解 `@RequiresPermission`
- 创建权限切面 `PermissionAspect`
- 为每个 API 添加权限校验

**实施步骤**:
1. 创建 `@RequiresPermission` 注解
2. 创建 `PermissionAspect` 切面
3. 为所有 API 方法添加权限注解
4. 在方法内部添加数据权限校验

### 3. 实现事务一致性保证
**问题**: 流程启动失败可能留下不一致状态
**方案**:
- 使用 `@Transactional` 确保原子性
- 添加补偿机制
- 使用状态机管理流程状态

**实施步骤**:
1. 为关键方法添加 `@Transactional`
2. 创建 `WorkflowCompensationService` 补偿服务
3. 在异常时执行补偿逻辑
4. 添加流程状态机

### 4. 添加异常处理和重试机制
**问题**: 异常处理不完善，只打印日志
**方案**:
- 创建自定义异常类
- 使用全局异常处理器
- 添加重试机制（Spring Retry）

**实施步骤**:
1. 创建 `WorkflowException` 异常类
2. 创建 `GlobalExceptionHandler`
3. 添加 Spring Retry 依赖
4. 为关键方法添加 `@Retryable`

### 5. 实现流程实例限流
**问题**: 恶意用户可大量启动流程
**方案**:
- 使用 Redis 令牌桶限流
- 限制每用户每分钟启动次数

**实施步骤**:
1. 创建 `RateLimiterService`
2. 在 `startProcess` 前检查限流
3. 使用 Redis 存储限流计数

## P1 - 高优先级（上线后立即优化）

### 6. 实现异步流程启动
**方案**: 使用 `@Async` 或消息队列
**实施步骤**:
1. 配置线程池
2. 创建 `AsyncWorkflowService`
3. 修改 `startProcess` 为异步

### 7. 添加缓存机制
**方案**: 使用 `@Cacheable` 缓存流程定义和表单定义
**实施步骤**:
1. 配置 Redis 缓存
2. 为查询方法添加 `@Cacheable`
3. 为更新方法添加 `@CacheEvict`

### 8. 完善日志和监控
**方案**: 使用 SLF4J + MDC 记录结构化日志
**实施步骤**:
1. 为所有方法添加日志
2. 使用 MDC 记录请求 ID
3. 添加性能监控日志

### 9. 实现任务超时自动处理
**方案**: 使用定时任务扫描超时任务
**实施步骤**:
1. 完善 `TaskTimeoutJob`
2. 实现超时处理逻辑
3. 支持配置超时动作

### 10. 添加数据脱敏
**方案**: 创建脱敏注解和切面
**实施步骤**:
1. 创建 `@Sensitive` 注解
2. 创建 `DataMaskAspect`
3. 为敏感字段添加脱敏

## P2 - 中优先级（迭代优化）

### 11. 实现任务委托/转办
**实施步骤**:
1. 创建 `delegateTask` 方法
2. 记录转办历史
3. 发送通知

### 12. 添加流程监控大屏
**实施步骤**:
1. 创建 `WorkflowMonitorService`
2. 提供统计 API
3. 实现实时数据推送

### 13. 实现批量操作
**实施步骤**:
1. 创建 `batchCompleteTask` 方法
2. 创建 `batchRecallProcess` 方法
3. 使用事务保证一致性

### 14. 优化消息通知
**实施步骤**:
1. 创建通知模板
2. 支持多渠道通知
3. 异步发送通知

### 15. 添加流程统计分析
**实施步骤**:
1. 创建 `WorkflowStatisticsService`
2. 提供各种统计 API
3. 生成统计报表

## 实施顺序

1. P0-4: 异常处理（基础设施）
2. P0-2: 权限控制（基础设施）
3. P0-1: N+1 查询优化
4. P0-3: 事务一致性
5. P0-5: 限流
6. P1-7: 缓存
7. P1-8: 日志监控
8. P1-6: 异步启动
9. P1-9: 超时处理
10. P1-10: 数据脱敏
11. P2 功能按需实施
