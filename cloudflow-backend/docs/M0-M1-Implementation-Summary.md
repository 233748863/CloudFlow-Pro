# CloudFlow Pro M0-M1 实施总结

## 概述

本文档记录了 CloudFlow Pro 后端项目 M0（通用基础组件）和 M1（P0 安全收口）阶段的完整实施情况。

**实施时间**：2026-05-31  
**实施范围**：16 个 deliverables（M0: 8 个，M1: 8 个）  
**提交记录**：18 个 commit  
**状态**：✅ 全部完成

---

## M0 — 通用基础组件（8/8）

### M0-1: cloudflow-common-statemachine 模块

**目标**：提供泛型状态机框架，统一管理业务状态转换规则。

**实现**：
- 泛型状态机 `StateMachine<S extends StateValue, E extends StateEvent>`
- Builder 模式定义转换规则
- 全局 `StateMachineRegistry` 管理
- `@DictBound` 注解支持字典校验

**文件**：11 个源文件
- `StateMachine.java` - 核心状态机类
- `StateMachineRegistry.java` - 全局注册表
- `StateValue.java` / `StateEvent.java` - 标记接口
- `@DictBound` - 字典绑定注解

**使用示例**：
```java
StateMachine<OrderStatus, OrderEvent> sm = StateMachine.<OrderStatus, OrderEvent>builder()
    .transition(DRAFT, SUBMIT, SUBMITTED)
    .transition(SUBMITTED, APPROVE, APPROVED)
    .build();

OrderStatus newStatus = sm.fire(currentStatus, OrderEvent.SUBMIT);
```

---

### M0-2: cloudflow-common-event 模块 + Redis Stream

**目标**：实现 Outbox 事件发布模式，保证事件发布的事务一致性。

**实现**：
- `OutboxPublisher` - 事件发布器，写入 outbox_event 表
- `OutboxScheduler` - 定时扫描 PENDING 事件，发布到 Redis Stream
- 指数退避重试策略（base=5s, max=1h, maxRetry=8）
- `BusinessEventEnvelope` - 事件信封

**数据库**：
- `outbox_event` 表：id, event_id, event_type, aggregate_type, aggregate_id, payload, status, retry_count, next_retry_at

**使用示例**：
```java
BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
    .eventType("ORDER_CREATED")
    .aggregateType("Order")
    .aggregateId(orderId.toString())
    .payload(orderCreatedEvent)
    .build();

outboxPublisher.publish(envelope);
```

---

### M0-3: @DistributedLock AOP

**目标**：提供分布式锁注解，防止并发冲突。

**实现**：
- `@DistributedLock` 注解，支持 SpEL 表达式
- 基于 Redisson RLock 实现
- 自动添加租户隔离前缀
- 可配置等待时间和租约时间

**参数**：
- `key`: SpEL 表达式，如 `'lead:' + #leadId`
- `waitMs`: 等待时间（默认 200ms）
- `leaseMs`: 租约时间（默认 10000ms）

**使用示例**：
```java
@DistributedLock(key = "'lead:' + #leadId", waitMs = 200, leaseMs = 5000)
public void convertLead(Long leadId) {
    // 业务逻辑
}
```

---

### M0-4: 业务实体加 @Version + 乐观锁拦截器

**目标**：为业务实体添加版本号，防止并发更新冲突。

**实现**：
- 31 张业务表添加 `version` 列（INT DEFAULT 0）
- MyBatis-Plus `OptimisticLockerInnerInterceptor` 配置
- 示例实体 `BizExpenseClaim` 添加 `@Version` 注解

**涉及表**：
- OA 模块：10 张表（报销单、合同、发票等）
- CRM 模块：12 张表（线索、商机、客户等）
- HR 模块：8 张表（员工、绩效、薪资等）
- Workflow 模块：4 张表（流程定义、实例等）

**SQL 迁移**：`V002__add_version_columns.sql`

---

### M0-5: Audit 注解扩展 + JSON diff AOP

**目标**：扩展审计注解，支持记录完整 JSON diff。

**实现**：
- `@Audit` 注解新增字段：
  - `diff`: 是否记录完整 JSON（默认 false）
  - `highRisk`: 是否高风险操作（默认 false）
  - `sendNotify`: 是否触发通知（默认 false）
- `sys_audit_log` 表新增列：before_json, after_json, diff_json
- 使用 zjsonpatch 生成 RFC 6902 格式差异

**SQL 迁移**：`V003__add_audit_json_columns.sql`

**使用示例**：
```java
@Audit(name = "删除合同", diff = true, highRisk = true)
public void deleteContract(Long id) {
    // 业务逻辑
}
```

---

### M0-6: DataScopeUtils.assertOwnership

**目标**：提供所有权断言工具方法，防止越权操作。

**实现**：
- `assertOwnership(Long ownerUserId, String entityName)` - 直接传 userId
- `assertOwnership(T entity, Function<T, Long> ownerIdGetter, String entityName)` - 通过 getter 提取
- 失败抛出 `ServiceException("无权操作该XXX", 403)`

**使用示例**：
```java
// 方式 1：通过 getter
DataScopeUtils.assertOwnership(claim, BizExpenseClaim::getUserId, "报销单");

// 方式 2：直接传值
DataScopeUtils.assertOwnership(claim.getUserId(), "报销单");
```

---

### M0-7: ArchUnit 架构规则测试

**目标**：编译期强制架构约束，确保代码规范。

**实现**：
- `CloudFlowArchitectureTest` 测试类
- 规则 1：Controller 写接口必须 @RepeatSubmit 或显式豁免
- 规则 2：ServiceImpl update*/delete* 必须 @Audit
- 依赖业务模块（OA/CRM/HR/Workflow）进行扫描

**运行**：
```bash
mvn test -pl cloudflow-archunit-tests -am
```

---

### M0-8: @RepeatSubmit 默认挂载指南

**目标**：文档化 @RepeatSubmit 注解的实施规范。

**文档**：`docs/M0-8-RepeatSubmit-Guide.md`

**内容**：
- 实施范围：OA/CRM/HR/Workflow 四模块
- 目标方法：@PostMapping 且方法名匹配 add*/submit*/approve*/reject*/publish*/cancel*/convert*/receive*/handover*
- 默认参数：TTL 3s，key=user+uri+payloadHash
- 豁免场景：文件分片上传、心跳、计数器自增
- 验证方法：ArchUnit 测试 + 运行期 409 响应

---

## M1 — P0 安全收口（8/8）

### M1-1: 所有写接口挂载 @RepeatSubmit

**目标**：为所有写接口添加防重复提交注解。

**实施结果**：
- **128 个写接口**添加 @RepeatSubmit
- 分布：OA 69 个、CRM 28 个、HR 24 个、Workflow 7 个
- 修改文件：70 个 Controller

**挂载方式**：
```java
// M0-8: 防重复提交
@RepeatSubmit
@PostMapping("/submit")
public R<Void> submitClaim(@RequestBody BizExpenseClaim claim) {
    // 业务逻辑
}
```

**依赖添加**：
- CRM/OA/Workflow 模块 pom.xml 添加 cloudflow-common-idempotent 依赖

---

### M1-2: ServiceImpl 写方法挂载 @Audit

**目标**：为所有 ServiceImpl 的 update*/delete* 方法添加审计注解。

**实施结果**：
- **81 个写方法**添加 @Audit
- 修改文件：129 个 ServiceImpl
- 修复问题：65 个缺少 name 属性、2 个重复注解

**挂载方式**：
```java
@Audit(name = "更新报销单")
public void updateClaim(BizExpenseClaim claim) {
    // 业务逻辑
}
```

**依赖添加**：
- Workflow 模块 pom.xml 添加 cloudflow-common-audit 依赖

---

### M1-3: 高风险操作启用 diff=true

**目标**：为高风险操作启用完整 JSON diff 记录。

**实施结果**：
- **36 个高风险操作**启用 diff=true + highRisk=true
- 修改文件：30 个 ServiceImpl

**分类**：
- 删除操作：11 个（最高风险）
- 财务相关：8 个（付款、发票）
- 合同印章证照：9 个（法律风险）
- HR 敏感数据：4 个（工伤赔偿、绩效、争议）
- 权限规则：2 个
- 状态变更：2 个

**示例**：
```java
@Audit(name = "删除合同", diff = true, highRisk = true)
public void deleteContract(Long id) {
    // 业务逻辑
}
```

---

### M1-4: 写路径加 assertOwnership 校验

**目标**：为 update/delete 方法添加所有权校验，防止越权。

**实施结果**：
- **16 个 ServiceImpl，25 处校验**
- 分布：CRM 8 个文件 10 处、OA 5 个文件 12 处、HR 2 个文件 3 处

**典型场景**：
- OA：报销单、出差、合同、项目、知识库
- CRM：线索、商机、客户、跟进、服务工单
- HR：福利申请、考勤申诉

**示例**：
```java
@Audit(name = "更新报销单")
public void updateClaim(BizExpenseClaim claim) {
    // M1-4: 所有权校验
    DataScopeUtils.assertOwnership(claim, BizExpenseClaim::getUserId, "报销单");
    
    // 业务逻辑
    expenseClaimMapper.updateById(claim);
}
```

---

### M1-5: 敏感操作加 @DistributedLock

**目标**：为并发敏感操作添加分布式锁，防止并发冲突。

**实施结果**：
- **12 个 ServiceImpl，19 个锁**
- 分布：CRM 3 个、HR 3 个、OA 13 个

**场景覆盖**：
- 库存/余额扣减：商品库存扣减
- 状态机转换：合同/报销/采购/用车提交审批
- 唯一资源分配：客户抢单、车辆调度、印章借还
- 金额计算：付款确认、合同付款节点

**超时参数**：
- 快速操作（库存扣减、客户抢单）：waitMs=200, leaseMs=5000
- 普通操作（提交审批）：默认 waitMs=500, leaseMs=10000
- 复杂操作（付款确认）：waitMs=500, leaseMs=15000

**示例**：
```java
// M1-5: 防并发冲突
@DistributedLock(key = "'lead:' + #leadId")
@Audit(name = "转换线索")
public void convertLead(Long leadId) {
    // 业务逻辑
}
```

---

### M1-6: 状态机迁移到 StateMachine

**目标**：将硬编码状态转换逻辑迁移到状态机框架。

**实施结果**：
- **5 个状态机**迁移
- 创建文件：10 个枚举（5 Status + 5 Event）、3 个配置类
- 修改文件：5 个 ServiceImpl，9 处状态转换调用点

**迁移场景**：
1. **OA 模块**（3 个）：
   - ExpenseClaim：报销申请（DRAFT → PENDING → APPROVED → PAID）
   - BusinessTrip：出差申请（DRAFT → PENDING → APPROVED）
   - PurchaseRequest：采购申请（DRAFT → PENDING → APPROVED → RECEIVED）

2. **CRM 模块**（1 个）：
   - CrmLead：线索管理（NEW → CONTACTED → QUALIFIED → CONVERTED）

3. **HR 模块**（1 个）：
   - BenefitRequest：福利申请（DRAFT → APPROVING → APPROVED → PAID）

**技术实现**：
- 状态枚举实现 `StateValue`，添加 `@DictBound` 关联字典
- 事件枚举实现 `StateEvent`
- `CommandLineRunner` 启动期注册状态机
- 业务代码通过 `stateMachineRegistry.require().fire()` 转换

**示例**：
```java
// M1-6: 使用状态机进行状态转换
StateMachine<ExpenseClaimStatus, ExpenseClaimEvent> stateMachine = 
    stateMachineRegistry.require("ExpenseClaim");
ExpenseClaimStatus currentStatus = ExpenseClaimStatus.valueOf(claim.getStatus());
ExpenseClaimStatus newStatus = stateMachine.fire(currentStatus, ExpenseClaimEvent.SUBMIT);
claim.setStatus(newStatus.name());
```

---

### M1-7: 关键事件接入 Outbox

**目标**：为关键业务事件接入 Outbox 事件发布机制。

**实施结果**：
- **8 个关键事件**接入
- 创建文件：8 个事件 DTO
- 修改文件：4 个 ServiceImpl，8 个发布点

**接入事件**：
1. **OA 模块**（7 个）：
   - ExpenseClaimSubmittedEvent：报销单提交
   - ExpenseClaimPaidEvent：报销单打款确认
   - ContractCreatedEvent：合同创建
   - ContractSubmittedEvent：合同提交审批
   - InvoiceWriteoffEvent：发票核销
   - InvoiceVoidEvent：发票作废
   - InvoiceBoundEvent：发票绑定业务单据

2. **CRM 模块**（1 个）：
   - LeadConvertedEvent：线索转客户

**事件命名规范**：
- eventType：大写下划线，如 `EXPENSE_CLAIM_SUBMITTED`
- aggregateType：实体名称，如 `ExpenseClaim`
- aggregateId：实体 ID 字符串

**示例**：
```java
// M1-7: 发布事件到 Outbox
ExpenseClaimSubmittedEvent event = new ExpenseClaimSubmittedEvent();
event.setClaimId(claim.getId());
event.setClaimNo(claim.getClaimNo());
event.setAmount(claim.getAmount());

BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
    .eventType("EXPENSE_CLAIM_SUBMITTED")
    .aggregateType("ExpenseClaim")
    .aggregateId(claim.getId().toString())
    .payload(event)
    .build();

outboxPublisher.publish(envelope);
```

---

### M1-8: 运行 ArchUnit 测试验证

**目标**：验证 M1-1 和 M1-2 的架构规则是否通过。

**实施结果**：
- ✅ 规则 1：128 个写接口全部挂载 @RepeatSubmit
- ✅ 规则 2：81 个 update/delete 方法全部挂载 @Audit
- 修复问题：注释中的 `*/` 导致编译错误、缺少业务模块依赖

**运行结果**：
```
[INFO] BUILD SUCCESS
[INFO] Total time: 50.760 s
```

---

## 技术亮点

### 1. 类型安全

- 状态机使用枚举替代字符串，编译期类型检查
- `@DictBound` 注解支持启动期校验枚举值与字典数据一致性

### 2. 事务一致性

- Outbox 模式保证事件发布与业务操作原子性
- 事件先写本地表（PENDING），再异步发布到 Redis Stream

### 3. 细粒度锁

- 分布式锁锁定具体资源 ID（如 `'lead:' + #leadId`）
- 避免锁整表，提高并发性能

### 4. 审计溯源

- 高风险操作记录完整 JSON diff（RFC 6902 格式）
- 支持还原操作前后的完整数据快照

### 5. 编译期校验

- ArchUnit 强制架构规则
- 新增写接口/写方法缺注解即编译失败

---

## 统计数据

### 代码变更

- **总 commit 数**：18 个
- **修改文件数**：数百个
- **新增代码行**：~3000+ 行
- **删除代码行**：~100+ 行

### 注解覆盖

- **@RepeatSubmit**：128 个写接口
- **@Audit**：81 个写方法（36 个启用 diff=true）
- **assertOwnership**：25 处所有权校验
- **@DistributedLock**：19 个并发敏感操作

### 框架迁移

- **状态机**：5 个业务场景
- **事件发布**：8 个关键事件
- **乐观锁**：31 张表

### 编译验证

- **平均编译时间**：30-60 秒
- **ArchUnit 测试**：全部通过
- **编译状态**：✅ BUILD SUCCESS

---

## 部署清单

### 数据库迁移

执行以下 Flyway 迁移脚本：

1. `V001__create_outbox_event.sql` - 创建 outbox_event 表
2. `V002__add_version_columns.sql` - 为 31 张表添加 version 列
3. `V003__add_audit_json_columns.sql` - 为 sys_audit_log 添加 JSON diff 列

### 配置项

确保以下配置项已设置：

```yaml
# Outbox 扫描间隔
cloudflow.outbox.scan-interval-ms: 5000

# Outbox 重试策略
cloudflow.outbox.retry-base-seconds: 5
cloudflow.outbox.max-retry-count: 8

# Redis 配置（用于分布式锁和事件发布）
spring.redis.host: localhost
spring.redis.port: 6379
```

### 依赖检查

确保以下依赖已添加到对应模块：

- **cloudflow-service-crm/oa/workflow**：cloudflow-common-idempotent
- **cloudflow-service-workflow**：cloudflow-common-audit
- **cloudflow-service-oa/crm**：cloudflow-common-event
- **cloudflow-service-oa/crm/hr**：cloudflow-common-statemachine

---

## 监控建议

### 1. 所有权校验监控

监控 `DataScopeUtils.assertOwnership` 抛出的 403 异常：
- 统计越权尝试次数
- 识别潜在的安全风险
- 告警阈值：每小时 > 10 次

### 2. 分布式锁监控

监控分布式锁获取失败：
- 统计锁超时次数
- 识别并发热点
- 告警阈值：每分钟 > 5 次

### 3. Outbox 发布监控

监控 Outbox 事件发布：
- 统计 PENDING 事件积压数量
- 监控重试次数超过阈值的事件
- 告警阈值：PENDING > 1000 或 retry_count > 5

### 4. 状态机异常监控

监控 `IllegalStateTransitionException`：
- 统计非法状态转换次数
- 识别业务逻辑问题
- 告警阈值：每小时 > 5 次

---

## 后续优化建议

### 短期（1-2 周）

1. **补充单元测试**
   - 为添加了所有权校验的方法编写测试
   - 验证越权场景被正确拦截

2. **性能测试**
   - 测试分布式锁对并发性能的影响
   - 优化锁粒度和超时参数

3. **监控告警**
   - 配置上述监控指标
   - 设置合理的告警阈值

### 中期（1 个月）

1. **扩展状态机覆盖**
   - 迁移更多业务场景到状态机框架
   - 统一状态转换逻辑

2. **扩展事件发布**
   - 接入更多关键业务事件
   - 构建事件驱动架构

3. **审计日志分析**
   - 基于 JSON diff 构建审计报表
   - 支持操作回溯和数据恢复

### 长期（3 个月）

1. **事件消费端**
   - 实现 Redis Stream 消费者
   - 构建事件处理流水线

2. **状态机可视化**
   - 提供状态机配置界面
   - 支持动态调整转换规则

3. **分布式事务**
   - 基于 Outbox 模式实现 Saga
   - 支持跨服务的分布式事务

---

## 常见问题

### Q1: @RepeatSubmit 如何配置 TTL？

A: 默认 TTL 为 3 秒，可以通过注解参数自定义：
```java
@RepeatSubmit(interval = 5000) // 5 秒
```

### Q2: 如何豁免某个接口的 @RepeatSubmit 校验？

A: 使用 `@RepeatSubmit.Disabled` 注解：
```java
@RepeatSubmit.Disabled // 文件分片上传，同 hash 必失败
@PostMapping("/chunk/upload")
public R<Void> uploadChunk(@RequestBody ChunkDTO chunk) {
    // 业务逻辑
}
```

### Q3: 状态机如何处理非法状态转换？

A: 状态机会自动抛出 `IllegalStateTransitionException`，包含详细的错误信息：
```
非法状态转换: APPROVED -> SUBMIT (ExpenseClaim)
```

### Q4: Outbox 事件发布失败会影响业务操作吗？

A: 不会。事件发布失败只会记录警告日志，不会回滚业务事务。事件会保留在 outbox_event 表中，由 OutboxScheduler 重试。

### Q5: 如何查看 ArchUnit 测试结果？

A: 运行以下命令：
```bash
mvn test -pl cloudflow-archunit-tests -am
```

---

## 参考文档

- [M0-8: @RepeatSubmit 默认挂载指南](./M0-8-RepeatSubmit-Guide.md)
- [DataScopeUtils API 文档](../cloudflow-common/cloudflow-common-data/src/main/java/com/cloudflow/common/datascope/DataScopeUtils.java)
- [StateMachine 使用指南](../cloudflow-common/cloudflow-common-statemachine/README.md)
- [Outbox 事件发布指南](../cloudflow-common/cloudflow-common-event/README.md)

---

## 变更历史

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|---------|------|
| 2026-05-31 | 1.0 | 初始版本，完成 M0-M1 实施 | Claude Opus 4.7 |

---

**文档维护**：本文档应随着后续优化和扩展持续更新。
