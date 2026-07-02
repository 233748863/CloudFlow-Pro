# OA + 工作流全量回归报告 2026-07-02

## 执行信息

- 回归标记：`CF_OA_WF_FULL_20260702021106`
- 环境：Gateway `9000`，Auth `9001`，Workflow `9002`，OA `9003`
- 数据库：`cloud_flow_db`
- 测试数据策略：保留本轮测试数据，便于后续定位

## 覆盖范围

- 覆盖模块：OA 审批单、工作流发起联动、工作流任务生成、权限边界、告警接口、耗材库存接口。
- 覆盖角色：管理员、区域经理、财务、人事、普通员工、法务、销售、OA、销售经理。
- 覆盖场景：正常提交、跨角色提交、无权限提交、带预算/项目/客户等关联字段的复杂 OA 单、工作流告警列表、低库存耗材列表。

## 总体结论

本轮回归阻塞。

OA 单据可以创建并进入提交/待审批状态，但没有生成工作流实例，审批人无法收到任务。因此多角色审批、驳回、转交、加签、会签、超时、回调、业务状态回写这些后续场景不能判定通过。

## 已确认通过

- 12 个角色账号在回归周期内登录成功。
- 7 个无权限提交用例返回 `403`，已覆盖的权限边界有效。
- 最终复核时核心服务存活：Gateway `9000`，Auth `9001`，Workflow `9002`，OA `9003`。

## P0 阻塞缺陷：OA 提交后未发起工作流

### 业务影响

用户能提交 OA 单据，但审批人没有待办任务，单据停在待审批状态，不能完成端到端审批。

### 数据证据

本轮创建的业务单：

| 模块 | 业务记录 | 状态 | 工作流实例 |
| --- | --- | --- | --- |
| 出差 | `biz_business_trip.id=9016`，`CC202607020004` | `PENDING` | 空 |
| 合同 | `oa_contract.contract_id=9206`，`HT202607020001` | `PENDING` | 空 |
| 知识发布 | `oa_knowledge_document.document_id=9003` | `PENDING` | 空 |
| 印章续期 | `oa_seal_renewal.id=26355`，`YZ202607020001` | `PENDING` | 空 |
| 证照借用 | `oa_license_borrow.id=9003`，`ZZ202607020001` | `PENDING` | 空 |
| 用印申请 | `oa_seal_application.id=9003`，`YY202607020001` | `PENDING` | 空 |
| 项目 | `oa_project.project_id=9305`，`PRJ20260702101127` | `PENDING` | 空 |
| 预算计划 | `oa_budget_plan.budget_id=9106`，`YS20260702101128` | `PENDING` | 空 |
| 预算调整 | `oa_budget_adjustment.adjustment_id=9103`，`TZ20260702101129` | `PENDING` | 空 |
| 用车 | `oa_vehicle_usage.usage_id=9015` | `0` | 空 |

`2026-07-02 10:11:19` 到 `10:11:32` 的事件箱记录：

| 事件 | 业务 ID | 状态 |
| --- | --- | --- |
| `BUSINESS_TRIP_SUBMITTED` | `9016` | `PUBLISHED` |
| `SEAL_APPLICATION_SUBMITTED` | `9003` | `PUBLISHED` |
| `LICENSE_BORROW_SUBMITTED` | `9003` | `PUBLISHED` |
| `SEAL_RENEWAL_SUBMITTED` | `26355` | `PUBLISHED` |
| `KNOWLEDGE_DOCUMENT_SUBMITTED` | `9003` | `PUBLISHED` |
| `CONTRACT_CREATED` | `9206` | `PUBLISHED` |
| `CONTRACT_SUBMITTED` | `9206` | `PUBLISHED` |
| `PROJECT_SUBMITTED` | `9305` | `PUBLISHED` |
| `BUDGET_PLAN_SUBMITTED` | `9106` | `PUBLISHED` |
| `BUDGET_ADJUSTMENT_SUBMITTED` | `9103` | `PUBLISHED` |
| `VEHICLE_USAGE_SUBMITTED` | `9015` | `PUBLISHED` |

`2026-07-02 10:00:00` 之后的工作流记录：

- `wf_process_instance`：`0`
- `wf_task`：`0`

### 源码定位

- 发布端：`cloudflow-common-redis/src/main/java/com/cloudflow/common/redis/core/RedisStreamUtil.java:77`
  - 使用 `RedisTemplate<String, Object>` 和 `opsForStream().add(MapRecord.create(streamKey, content))` 发布。
- 消费端：`cloudflow-common-event/src/main/java/com/cloudflow/common/event/config/EventConsumerAutoConfiguration.java:103`
  - 直接把 `body.get("payload")` 反序列化为 `BusinessEventEnvelope`。
- 失败处理：`cloudflow-common-event/src/main/java/com/cloudflow/common/event/config/EventConsumerAutoConfiguration.java:122-130`
  - 再次解析同一份 payload 写死信；解析失败后仍 ack Redis Stream 消息。

### 根因

Redis Stream 的 payload 写入格式和消费端读取格式不兼容，消费者无法稳定还原 `BusinessEventEnvelope`，随后消息被 ack，导致 OA 提交流事件没有进入工作流发起消费者。

### 修复方向

1. 统一 Redis Stream 字段格式：发布端写明确 JSON 字符串，或消费端兼容 JSON 对象与二次序列化字符串。
2. 反序列化失败时保留原始 Stream 消息写入死信；未成功消费前不能按成功路径 ack。
3. 增加集成测试：通过 `RedisStreamUtil` 发布 `BusinessEventEnvelope`，由 `EventConsumerAutoConfiguration` 消费，断言目标 `BusinessEventConsumer` 被调用 1 次。

## P1 阻塞缺陷：超时告警接口 500

### 证据

- 接口：`GET /workflow/alert/timeout/unresolved`
- HTTP 状态：`500`
- Trace ID：`25cedab9-0562-452c-bb1d-dbb95a259ccd`
- 日志：`cloudflow-service-workflow/logs/cloudflow-workflow.log:17566`
- 错误：`Invalid bound statement (not found): com.cloudflow.workflow.mapper.TimeoutAlertMapper.selectUnresolved`

### 源码定位

- Controller 调用：`cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/controller/AlertController.java:40`
- Mapper 声明：`cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/mapper/TimeoutAlertMapper.java:45`
- XML 缺少：`cloudflow-service-workflow/src/main/resources/mapper/workflow/TimeoutAlertMapper.xml` 中没有 `<select id="selectUnresolved">`

### 修复方向

补齐 `selectUnresolved`、`selectByLevel`、`selectByAssignee` 的 XML SQL，或把这些查询改为 MyBatis-Plus 条件查询。

## P1 阻塞缺陷：低库存耗材接口 500

### 证据

- 接口：`GET /oa/consumable/low-stock`
- HTTP 状态：`500`
- Trace ID：`d93e9712-7add-4e4b-b0e7-1e71147a4f0a`

源码和表结构不一致：

- `SysConsumable` 映射到 `oa_consumable`：`cloudflow-service-oa/src/main/java/com/cloudflow/oa/domain/SysConsumable.java:12`
- `selectLowStockList` 查询 `sys_consumable`：`cloudflow-service-oa/src/main/resources/mapper/SysConsumableMapper.xml:7`
- `sys_consumable` 删除字段是 `del_flag`，`oa_consumable` 删除字段是 `deleted`

### 修复方向

把 `SysConsumableMapper.xml` 改为查询 `oa_consumable` 并使用 `deleted = 0`；当前实体注解和业务表结构都指向 `oa_consumable` 是目标表。

## 因 P0 未完成的覆盖

以下场景已纳入计划，但在工作流无法生成实例前不能判定通过：

- 多角色审批链：发起人 -> 直属经理 -> 财务/人事/法务/OA -> 管理员。
- 驳回再提交、同意回写、转交、委托、加签、会签。
- 超时告警生成与升级。
- 工作流回调业务状态。
- 客户经营、任务绩效分配、预算、合同、项目、发票、付款、采购等跨模块联动审批。

## 修复后复测清单

1. 重跑 OA 提交矩阵，断言每条已提交业务单都有非空 `instance_id` 或 `process_instance_id`。
2. 断言每条事件都有成功的工作流实例，或保留可追踪的死信记录；解析失败不能静默 ack。
3. 每个模块至少执行 2 轮完整审批：通过路径、驳回再提交路径，并使用不同角色账号。
4. 复测 `GET /workflow/alert/timeout/unresolved` 和 `GET /oa/consumable/low-stock`，HTTP 状态必须为 `200`。
5. 验证工作流通过和驳回后的业务状态回写。

## 修复后验证补充

修复时间：`2026-07-02`

- Redis Stream 事件消费已兼容 raw JSON、二次序列化 JSON 字符串、`occurredAt` 的 `T` 格式和空格格式。
- 事件解析失败时先写入 raw DLQ，DLQ 写入成功后再 ack，避免静默丢消息。
- `GET /workflow/alert/timeout/unresolved` 已恢复 HTTP `200` / code `200`。
- `GET /oa/consumable/low-stock` 已恢复 HTTP `200` / code `200`。
- 项目、预算计划、预算调整已补齐可启动流程定义。
- 预算调整事件补偿时已能从关联预算负责人兜底发起人。
- workflow fallback 重试成功后已回填 OA 业务表实例 ID。

本轮 10 条业务单复测结果：

| 模块 | 业务记录 | 工作流实例 | 待办 |
| --- | --- | --- | --- |
| 出差 | `biz_business_trip.id=9016` | 非空 | 1 |
| 合同 | `oa_contract.contract_id=9206` | 非空 | 2 |
| 知识发布 | `oa_knowledge_document.document_id=9003` | 非空 | 1 |
| 印章续期 | `oa_seal_renewal.id=26355` | 非空 | 1 |
| 证照借用 | `oa_license_borrow.id=9003` | 非空 | 1 |
| 用印申请 | `oa_seal_application.id=9003` | 非空 | 1 |
| 项目 | `oa_project.project_id=9305` | 非空 | 1 |
| 预算计划 | `oa_budget_plan.budget_id=9106` | 非空 | 1 |
| 预算调整 | `oa_budget_adjustment.adjustment_id=9103` | 非空 | 1 |
| 用车 | `oa_vehicle_usage.usage_id=9015` | 非空 | 1 |

补偿后数据库复核：业务实例缺失数 `0`，`91536`、`91537`、`91538` 均为 `PUBLISHED`。
