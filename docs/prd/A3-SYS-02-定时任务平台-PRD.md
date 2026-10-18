# PRD：定时任务平台化

| 项 | 内容 |
| --- | --- |
| 条目编号 | SYS-02 |
| 所属批次 | 批次 A（第 3 项） |
| 对标依据 | `docs/benchmark/05-system-系统治理对标.md` |
| 优先级 | P0 |
| 预估工作量 | M+（因采用集中调度，比本地调度多一层执行协议与容错） |
| 版本 | v2 · 2026-08-31（已按调度架构决策更新） |
| 架构决策 | **auth 集中调度 + Feign 调各服务 `@Inner` 执行接口**（用户 2026-08-31 决定） |

## 0. 对调研结论的一处修正

调研文档 `05-system` 里 SYS-02 写的是"**无任务表，应是 `@Scheduled` 硬编码**"，并把"分布式重复执行"列为关键问题。**编码前实测后这条需要修正**：

项目**已有** `cloudflow-common-job` 公共模块，含 `DistributedJob.java` / `DistributedJobAspect.java` / `JobAutoConfiguration.java`，基于 Redisson 分布式锁，注解支持 `name`（锁 key）/ `lockTime`（默认 300 秒）/ `waitTime`（默认 0 不等待）。

实测覆盖率：**29 个 `@Scheduled` 方法中 24 个已带 `@DistributedJob`**。未带的 3 处均已用其他方式保证单实例执行：
- `OutboxScheduler`：用数据库行级 claim（`claimBatch` + `locked_by`/`locked_until`），不需要额外锁
- `TimerSchedulerService`：源码注释明确说明"不再挂载 `@Scheduled`，避免同一 Redis ZSet 被两个调度器并发消费"，由 `TimerScanJob` 统一调度并自持 `lock:scheduled:scanAndTriggerTimers`
- `EventAutoConfiguration`：配置类，非业务任务

**所以本 PRD 的问题定义调整为：分布式去重已解决，真正缺的是「管理面」——周期不可改、执行历史不可查、不能手动触发、失败不可见。**

## 1. 背景与目标

### 1.1 真实问题

实测 16 个业务任务类，全部为编译期固化：

| 服务 | 任务类 | 触发 | 业务 |
| --- | --- | --- | --- |
| auth | `AuditLogArchiveJob` | `0 0 3 1 * ?` 每月1日3点 | 审计日志归档 |
| auth | `SysDictOrphanAlertScanJob` | `0 0 2 * * ?` | 字典孤儿扫描 |
| crm | `CrmLifecycleJob` | `0 0 2 * * ?` / `0 0 3 * * ?` | 客户公海释放 / 报价过期 |
| crm | `CrmNotificationServiceImpl` | `0 0 9 * * ?` / `0 0 * * * ?` | 日报推送 / 工单 SLA |
| hr | `EmployeeContractExpireJob` | `0 0 4 * * ?` | 合同到期 |
| hr | `TrainingArchiveRebuildJob` | `0 30 2 * * ?` | 培训档案重建 |
| oa | `OaBorrowOverdueJob` | `0 0 9 * * ?` / `0 30 9 * * ?` / `0 0 9 * * ?` | 借用超期 / 证照到期 / 合同风险 |
| workflow | `ProcessBusinessReconcileJob` | `0 */30 * * * ?` | 流程业务对账 |
| workflow | `TaskReminderJob` | `fixedRate 30s` | 任务催办 |
| workflow | `TaskTimeoutJob` | `fixedRate 60s` + `0 0 2 * * ?` | 超时扫描 / 清理过期 key |
| workflow | `TimerScanJob` | `fixedRate 60s` + `0 0 3 * * ?` | 定时节点扫描 / 清理 |
| workflow | `DeadlockDetectionService` | `fixedDelay 30s` | 死锁检测 |
| workflow | `AnomalyDetectionServiceImpl` | — | 异常检测 |
| workflow | `TimeoutDetectionServiceImpl` | — | 超时检测 |
| workflow | `TransactionConsistencyService` | — | 事务一致性 |
| common | `OutboxScheduler` | `fixedDelay 5s` | 发件箱投递 |

**痛点（都是实际运维问题，不是假设）**：
1. **周期改不了**：cron 虽支持配置项占位（如 `${cloudflow.crm.quote-expire-cron:0 0 3 * * ?}`），但改了要改 Nacos 配置并重启服务；`fixedRate` 类（催办 30s、超时 60s、死锁 30s）是**硬编码字面量**，完全不可调
2. **执行历史无处查**：任务跑了没跑、跑了多久、处理了多少条、报了什么错，只能翻日志
3. **不能手动触发**：合同到期提醒漏发了，只能等下一个周期或重启服务
4. **失败不告警**：任务抛异常后除日志无任何感知
5. **新增条目会继续叠加**：本系列后续还有资产折旧过账（OA-01）、假期按月累积（HR-03）、SLA 计时（CRM-03）、消息定时发送（SYS-01）等新任务

### 1.2 目标
1. 任务定义从代码搬到数据库，周期与参数可在界面改、即时生效
2. 每次执行落日志，含耗时、结果、处理条数、异常栈
3. 支持手动触发、暂停/恢复
4. 失败告警（走 SYS-01 消息中心）
5. **保留现有 `@DistributedJob` 的分布式锁能力**，不重造

### 1.3 非目标
- 不引入 xxl-job（GPL-3.0）或 PowerJob 独立调度中心
- 不做任务编排/依赖链（DAG）
- 不做分片并行计算（MapReduce 式）
- 不重写 `OutboxScheduler` 与 `TimerSchedulerService` 这两个特殊任务

## 2. 现状基线（实测）

### 2.1 已有资产（必须复用）

`cloudflow-common-job` 模块三个类：
```
DistributedJob.java        注解：name / lockTime(默认300s) / waitTime(默认0)
DistributedJobAspect.java  切面：基于 Redisson 加锁
JobAutoConfiguration.java  自动配置
```

依赖：Redisson 3.27.0（已在依赖中）

### 2.2 缺失
- 任务定义表、执行日志表
- 管理接口与前端页面
- 手动触发、暂停恢复
- 动态调度（改 cron 即时生效，不重启）
- 失败告警

## 3. 范围

### 3.1 做
1. 三张表：`sys_job` / `sys_job_log` / `sys_job_handler`
2. **auth 集中调度器**：基于 Spring `ThreadPoolTaskScheduler` 按 `sys_job` 注册与重调度，触发时加分布式锁防 auth 多实例重复触发
3. **执行协议**：Feign 调各服务 `@Inner` 执行接口，异步执行 + 回报制上报结果
4. Handler 注册与上报：`@JobHandler` 注解标记，各服务启动后上报清单到 auth
5. 网络容错：调用重试、`DISPATCH_FAILED` 状态、待补跑队列、回报丢失巡检 + 状态反查
6. 执行日志：每次执行落库，区分调度失败与执行失败
7. 管理接口：CRUD、手动触发、暂停恢复、日志查询
8. 失败告警：走 SYS-01 消息中心
9. 16 个业务任务迁移（高频任务处理方式见 §12-1）
10. `cloudflow-common-job` 内统一实现执行接口与异步执行池，五服务共用

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 重写分布式锁 | `@DistributedJob` 已覆盖，继续用（锁留在业务服务侧） |
| 同步等待执行结果 | 长任务会占死 HTTP 连接，强制异步 + 回报制（FR-1B.3） |
| 迁移 `OutboxScheduler` | 5 秒高频 + DB 行 claim，属基础设施非业务任务，保持 `@Scheduled` |
| 迁移 `TimerSchedulerService` | 源码注释明确要求由 `TimerScanJob` 单点调度，改动风险高于收益；`TimerScanJob` 本身迁移 |
| 任务 DAG 编排 | 现有 16 个任务彼此独立，无编排需求 |
| 分片并行 | 单实例执行足够，无大数据量任务 |

## 4. 角色与权限

| 角色 | 权限码 |
| --- | --- |
| 管理员 | `system:job:list` / `:add` / `:edit` / `:remove` / `:trigger` / `:toggle` / `:log` |
| 其他 | 无 |

**约束**：手动触发与暂停是高影响操作，必须记 `@SysLog` + `sys_audit_log`。

## 5. 功能需求

### FR-1 Handler 注册与上报
- FR-1.1 新增注解标记可调度方法（如 `@JobHandler(value="crmQuoteExpire", desc="报价过期处理")`），各服务启动时扫描本进程 handler
- FR-1.2 Handler 方法签名统一：接收 `String param`（对应 `sys_job.handler_param`），返回执行结果摘要（处理条数、说明）
- FR-1.3 **handler 自动上报**：各服务启动完成后调 auth 的 `/inner/job/handler/report` 上报本服务 handler 清单（handler 名、中文说明、所属服务），auth 落 `sys_job_handler` 表
- FR-1.4 管理界面从 `sys_job_handler` 下拉选择，展示 handler 名 + 中文说明 + 所属服务 + 最近上报时间
- FR-1.5 `sys_job.handler_name` 引用未上报的 handler 时，任务保存失败并提示
- FR-1.6 服务下线后其 handler 标记为 `OFFLINE`（超过心跳周期未上报），引用它的任务在界面标红警示

### FR-1B 执行协议（集中调度的核心设计）
- FR-1B.1 各服务提供统一执行入口：`POST /inner/job/execute`，入参 `{jobId, executeNo, handlerName, handlerParam, timeoutSeconds}`
- FR-1B.2 **异步执行协议**（关键：避免长任务阻塞 HTTP 连接）：
  - auth 调用执行接口，被调服务**立即返回 `ACCEPTED` + `executeNo`**，不等任务跑完
  - 被调服务在本地线程池异步执行 handler
  - 执行完成后由被调服务调 auth 的 `/inner/job/report` 回传结果（状态、耗时、处理条数、异常栈）
  - auth 侧按 `executeNo` 更新 `sys_job_log`
- FR-1B.3 **不采用同步等待**：现有任务中 `AuditLogArchiveJob`（月度归档）、`TrainingArchiveRebuildJob`（档案重建）可能长时间运行，同步 HTTP 会超时或占死连接
- FR-1B.4 执行去重仍由被调服务侧的 `@DistributedJob` 保证（锁在业务服务侧，不在 auth 侧）
- FR-1B.5 被调服务未拿到锁时，回传状态 `SKIPPED`

### FR-2 任务定义
- FR-2.1 字段：任务名、分组、handler、参数、cron 表达式、状态、并发开关、错过策略、重试次数与间隔、超时秒数、失败告警开关与接收人
- FR-2.2 cron 表达式保存前校验合法性，并回显未来 5 次执行时间
- FR-2.3 `concurrent_flag=0`（默认）时，上次未跑完则本次跳过（复用 `@DistributedJob` 的 `waitTime=0` 语义）
- FR-2.4 错过策略 `misfire_strategy`：`IGNORE`（跳过，默认）/ `FIRE_ONCE`（补跑一次）/ `FIRE_ALL`（全部补跑）
- FR-2.5 支持 `fixedRate` / `fixedDelay` 型任务：`trigger_type=CRON/FIXED_RATE/FIXED_DELAY`，后两者用 `interval_ms` 字段（现有催办 30s、超时 60s、死锁 30s 属这类）

### FR-3 集中动态调度
- FR-3.1 调度器**只在 auth 服务运行**，从 `sys_job` 加载全部启用任务并注册到 `ThreadPoolTaskScheduler`
- FR-3.2 新增/修改/删除/暂停任务后**即时生效，不重启服务**（同进程内直接重注册 `ScheduledFuture`，无需跨服务通知，这是集中调度的一个优势）
- FR-3.3 **auth 多实例部署时**，调度器本身需防重复触发：auth 侧对每次触发加分布式锁（key 含 `jobId + 触发时间窗口`），只有拿到锁的实例发起 Feign 调用
- FR-3.4 记录 `last_fire_time` / `next_fire_time` 供界面展示
- FR-3.5 触发时按 `sys_job.service_name` 路由到对应服务（Feign 客户端按服务名调用，走 Nacos 服务发现与现有负载均衡）

### FR-3C 网络容错（集中调度的必备补偿）
- FR-3C.1 **调用失败重试**：Feign 调用失败（连接超时、服务不可达、5xx）按 `dispatch_retry_count`（默认 3 次）与 `dispatch_retry_interval_seconds`（默认 10 秒）重试
- FR-3C.2 重试耗尽后任务标记 `DISPATCH_FAILED`，落日志并告警（与执行失败区分开，便于判断是任务本身错还是网络问题）
- FR-3C.3 **目标服务全部实例不可用**时，按 `misfire_strategy` 处理：`IGNORE` 跳过本次；`FIRE_ONCE` 记入待补跑队列，服务恢复后补跑一次
- FR-3C.4 **回报丢失处理**：被调服务执行完但回报请求失败时，auth 侧的 `RUNNING` 记录会一直悬挂。需要巡检任务扫描超过 `timeout_seconds` 仍 `RUNNING` 的记录，置为 `TIMEOUT` 并告警（**注意：此时任务实际可能已成功，告警文案需说明"结果未知"而非"执行失败"**）
- FR-3C.5 被调服务提供执行状态查询接口 `GET /inner/job/status/{executeNo}`，供 auth 侧巡检时反查真实状态，减少误判
- FR-3C.6 Feign 调用超时设置：连接超时 3 秒、读超时 10 秒（因是异步协议，被调方立即返回，不需要长读超时）

### FR-4 手动触发
- FR-4.1 `POST /system/job/{id}/trigger`，可传临时参数覆盖 `handler_param`
- FR-4.2 手动触发同样受分布式锁约束（正在执行时拒绝并提示）
- FR-4.3 执行日志 `trigger_type=MANUAL`，记录触发人

### FR-5 执行日志
- FR-5.1 每次执行落一条：开始时间、结束时间、耗时、状态、结果摘要、异常栈、执行实例 IP、触发方式
- FR-5.2 状态：`RUNNING` / `SUCCESS` / `FAILED` / `TIMEOUT` / `SKIPPED`（未拿到锁或并发跳过）
- FR-5.3 查询支持按任务、状态、时间范围筛选
- FR-5.4 日志保留策略可配（默认 30 天），过期清理本身作为一个内置任务
- FR-5.5 长时间 `RUNNING`（超过 `timeout_seconds`）的记录由巡检置为 `TIMEOUT` 并告警

### FR-6 失败告警
- FR-6.1 `alarm_on_fail_flag=1` 时，任务失败发消息给 `alarm_receiver`（走 SYS-01）
- FR-6.2 连续失败 N 次（可配，默认 3）升级告警
- FR-6.3 告警内容含任务名、失败时间、异常摘要、日志链接

### FR-7 存量任务迁移
- FR-7.1 16 个业务任务改为 `@JobHandler` 标记，`sys_job` 初始数据写进 `06.cloudflow-business-seed.sql`（cron 与现有配置值保持一致，避免行为变化）
- FR-7.2 迁移后移除原 `@Scheduled` 注解，**保留 `@DistributedJob`**（锁仍在业务服务侧生效，见 FR-1B.4）
- FR-7.3 各服务需新增 `/inner/job/execute` 与 `/inner/job/status/{executeNo}` 两个接口 + 本地异步执行线程池
- FR-7.4 `OutboxScheduler` 与 `TimerSchedulerService` 不迁移（3.2 已说明），保持 `@Scheduled`
### FR-7B 高频任务间隔调整（**已定决策：调大间隔后统一走集中调度**）

用户 2026-08-31 决定：**16 个任务全部走集中调度，但先调大高频任务间隔**，把跨服务调用量从约 8000 次/天降到约 1200 次/天。

- FR-7B.1 四个高频任务的间隔调整方案：

| 任务 | 现状 | 调整为 | 调用量/天 | 业务影响 |
| --- | --- | --- | --- | --- |
| `TaskReminderJob`（任务催办） | `fixedRate 30s` | **5 min** | 288 | 催办通知最长延迟 5 分钟。催办本身是"提醒尽快处理"，5 分钟延迟无实质影响 |
| `TaskTimeoutJob`（超时扫描） | `fixedRate 60s` | **5 min** | 288 | 超时自动处理最长延迟 5 分钟。SLA 以小时/天为单位，5 分钟延迟可接受 |
| `TimerScanJob`（定时节点扫描） | `fixedRate 60s` | **3 min** | 480 | **定时节点到期误差从 ≤60s 变为 ≤3min**，需在设计器提示（见 FR-7B.3） |
| `DeadlockDetectionService`（死锁检测） | `fixedDelay 30s` | **10 min** | 144 | 死锁检测是兜底巡检，非实时要求 |
| **合计** | 约 8000 次/天 | | **约 1200 次/天** | |

- FR-7B.2 间隔值写入 `sys_job.interval_ms`，**上线后可在管理界面随时调整**（这是平台化的收益：发现延迟不可接受时不需改代码发版）
- FR-7B.3 **批次 B B2 的定时节点 PRD 需同步更新**：原 PRD 写"到期误差 ≤ 60 秒，需在设计器提示"，改为 **≤ 3 分钟**。若某流程对定时精度要求高，可单独调小 `TimerScanJob` 间隔（管理界面可改）
- FR-7B.4 `TaskTimeoutJob` 的第二个方法（`cleanupExpiredKeys`，每日 2 点）与 `TimerScanJob` 的清理方法（每日 3 点）属低频，不受本次调整影响
- FR-7B.5 调整后仍需观察：若催办或超时延迟引起业务反馈，优先在管理界面调小间隔，而非改回本地调度

## 6. 数据模型

### 6.1 `sys_job`
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| job_id | BIGINT PK | |
| tenant_id | BIGINT | 平台级任务可为 0 |
| job_name | VARCHAR(100) | 任务名 |
| job_group | VARCHAR(50) | 分组（按服务：auth/workflow/oa/crm/hr/common） |
| service_name | VARCHAR(50) | 归属服务，决定由哪个进程执行 |
| handler_name | VARCHAR(100) | handler 标识 |
| handler_param | VARCHAR(500) | 参数 |
| trigger_type | VARCHAR(20) | CRON / FIXED_RATE / FIXED_DELAY |
| cron_expression | VARCHAR(100) | CRON 型使用 |
| interval_ms | BIGINT | FIXED_* 型使用 |
| status | VARCHAR(20) | ENABLED / PAUSED |
| concurrent_flag | TINYINT | 是否允许并发 |
| misfire_strategy | VARCHAR(20) | IGNORE / FIRE_ONCE / FIRE_ALL |
| retry_count | INT | 执行失败重试次数 |
| retry_interval_seconds | INT | 执行失败重试间隔 |
| dispatch_retry_count | INT | **Feign 调用失败重试次数**（默认 3） |
| dispatch_retry_interval_seconds | INT | **调用失败重试间隔**（默认 10） |
| timeout_seconds | INT | 超时阈值（也是回报丢失判定阈值） |
| lock_time_seconds | INT | 分布式锁持有时间（映射 `@DistributedJob.lockTime`） |
| critical_flag | TINYINT | 关键任务标记，暂停需二次确认 |
| alarm_on_fail_flag | TINYINT | 失败告警开关 |
| alarm_receiver | VARCHAR(500) | 接收人（用户 ID 列表） |
| consecutive_fail_count | INT | 连续失败计数 |
| last_fire_time | DATETIME | |
| next_fire_time | DATETIME | |
| remark | VARCHAR(500) | |
| + 审计列 | | |

唯一索引 `uk_service_handler(service_name, handler_name, handler_param(100))`

### 6.2 `sys_job_log`
| 字段 | 类型 |
| --- | --- |
| log_id | BIGINT PK |
| tenant_id | BIGINT |
| job_id | BIGINT |
| job_name | VARCHAR(100) |
| handler_name | VARCHAR(100) |
| execute_no | VARCHAR(64) |
| trigger_type | VARCHAR(20)（CRON/MANUAL/RETRY） |
| trigger_by | VARCHAR(64)（手动触发人） |
| start_time / end_time | DATETIME |
| duration_ms | BIGINT |
| execute_status | VARCHAR(20)（RUNNING/SUCCESS/FAILED/TIMEOUT/SKIPPED/**DISPATCH_FAILED**） |
| affected_rows | INT（处理条数） |
| result_msg | VARCHAR(1000) |
| exception_stack | TEXT |
| executor_ip | VARCHAR(64)（实际执行的业务服务实例 IP） |
| dispatcher_ip | VARCHAR(64)（**发起调度的 auth 实例 IP**） |
| dispatch_retry_index | INT（**第几次调用重试**） |
| report_time | DATETIME（**回报到达时间**，为空说明回报未到） |
| retry_index | INT |
| create_time | DATETIME |

索引：`idx_job_time(job_id, start_time)`、`idx_status_time(execute_status, start_time)`、`uk_execute_no(execute_no)`

### 6.3 `sys_job_handler`（集中调度新增）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| handler_id | BIGINT PK | |
| service_name | VARCHAR(50) | 归属服务 |
| handler_name | VARCHAR(100) | handler 标识 |
| handler_desc | VARCHAR(200) | 中文说明 |
| status | VARCHAR(20) | ONLINE / OFFLINE |
| last_report_time | DATETIME | 最近上报时间 |
| + 审计列 | | |

唯一索引 `uk_service_handler(service_name, handler_name)`

**放置位置**：三张表均放 `DB/01.cloudflow-common.sql`

## 7. 接口设计

服务：`cloudflow-auth`（管理面），执行面在各服务本地

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET | `/system/job/list` | `system:job:list` |
| GET | `/system/job/{id}` | `system:job:list` |
| GET | `/system/job/handlers` | `system:job:list` |
| POST | `/system/job` | `system:job:add` |
| PUT | `/system/job` | `system:job:edit` |
| DELETE | `/system/job/{ids}` | `system:job:remove` |
| POST | `/system/job/{id}/trigger` | `system:job:trigger` |
| PUT | `/system/job/{id}/toggle` | `system:job:toggle` |
| POST | `/system/job/cron/validate` | `system:job:list` |
| GET | `/system/job/log` | `system:job:log` |
| GET | `/system/job/log/{id}` | `system:job:log` |
| DELETE | `/system/job/log/clean` | `system:job:remove` |

### 7.1 集中调度新增的内部接口

**auth 侧（被各业务服务调用）**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/inner/job/handler/report` | 各服务启动后上报 handler 清单（FR-1.3） |
| POST | `/inner/job/report` | 各服务执行完成后回传结果（FR-1B.2） |

**各业务服务侧（被 auth 调用）** —— 五个服务（workflow/oa/crm/hr/auth 自身）都要实现

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/inner/job/execute` | 接收执行指令，立即返回 ACCEPTED 后异步执行（FR-1B.1/2） |
| GET | `/inner/job/status/{executeNo}` | 供 auth 巡检反查真实状态（FR-3C.5） |

**注意**：这两个接口建议放进 `cloudflow-common-job` 公共模块统一实现，各服务只需引入依赖 + 注册 handler，避免五处重复代码。

## 8. 非功能需求

| 项 | 要求 |
| --- | --- |
| **调用量控制** | 高频任务按 FR-7B.1 调大间隔，总调用量 ≤ 1500 次/天；新增任务若间隔 < 3 分钟需评审 |
| 分布式安全 | 双层：auth 侧触发加锁防多实例重复触发（FR-3.3）；业务服务侧 `@DistributedJob` 防重复执行（FR-1B.4） |
| 动态生效 | 配置变更后即时生效（调度器与管理面同进程，直接重注册） |
| 幂等 | 同一 `execute_no` 不产生重复日志；重复回报只更新一次 |
| 执行协议 | **必须异步**：被调服务立即返回，回报制上报结果（FR-1B.2/3） |
| 网络容错 | 调用失败重试 + `DISPATCH_FAILED` 状态区分 + 回报丢失巡检 + 状态反查（FR-3C 全节） |
| 调用开销 | 高频任务产生持续 Feign 调用，需评估（FR-7.5、§12-1） |
| 权限 | 手动触发、暂停、删除全部记审计日志 |
| Handler 安全 | `handler_name` 只能是已上报白名单，**不接受反射类名或表达式**（防任意方法调用）；`/inner/job/execute` 必须走 `@Inner` 校验，防外部伪造触发 |
| 参数安全 | `handler_param` 由 handler 自行解析，平台不做 eval |
| 日志量 | 高频任务（30s 一次约每天 2880 条）需配保留期，默认 30 天 |
| 向后兼容 | 迁移后各任务的 cron 与行为与现状一致，不引入功能变化 |
| 单点风险 | **auth 挂掉则全系统定时任务停摆**（集中调度的固有代价）；需对 auth 调度器加存活监控告警 |

## 9. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 在界面改 `CrmLifecycleJob` 的公海释放 cron，10 秒内生效，无需重启服务 |
| AC-2 | 手动触发合同到期任务，执行日志出现 `trigger_type=MANUAL` 且记录触发人 |
| AC-3 | 任务执行完成后日志含耗时、处理条数、结果摘要 |
| AC-4 | 任务抛异常时日志状态 FAILED 且含异常栈；开启告警后收到消息（依赖 SYS-01） |
| AC-5 | **auth 双实例**部署下同一任务同一周期只发起一次 Feign 调用；**业务服务双实例**下只执行一次，另一实例记 SKIPPED |
| AC-5B | 长任务（如审计归档）执行期间 Feign 调用已返回，不占用 HTTP 连接；任务完成后回报到达并更新日志状态 |
| AC-5C | 目标服务全部停机时，调用重试 3 次后记 `DISPATCH_FAILED` 并告警；告警文案区分"网络调度失败"与"任务执行失败" |
| AC-5D | 被调服务执行成功但回报请求失败时，巡检先反查 `/inner/job/status/{executeNo}` 拿到真实状态；反查也失败才置 TIMEOUT，且告警文案为"结果未知"不是"执行失败" |
| AC-5E | 各服务启动后 handler 清单自动上报，管理界面可见；服务停机后其 handler 标记 OFFLINE，引用它的任务界面标红 |
| AC-5F | 外部直接调用 `/inner/job/execute` 被 `@Inner` 拦截，无法伪造触发任务 |
| AC-6 | 暂停任务后不再触发；恢复后按 cron 继续 |
| AC-7 | `concurrent_flag=0` 时上次未结束则本次记 SKIPPED |
| AC-8 | 保存非法 cron 表达式被拒绝；合法表达式回显未来 5 次执行时间 |
| AC-9 | `handler_name` 填未注册值时保存失败 |
| AC-10 | 16 个业务任务全部迁移完成，cron 与迁移前一致；`OutboxScheduler` 与 `TimerSchedulerService` 保持原状 |
| AC-11 | `fixedRate` 型任务迁移后可在界面调整间隔，改后 10 秒内生效 |
| AC-11B | **四个高频任务按 FR-7B.1 的新间隔运行**（催办 5min / 超时 5min / 定时节点 3min / 死锁 10min） |
| AC-11C | **调整后总调用量 ≤ 1500 次/天**（统计验证） |
| AC-11D | 定时节点到期误差 ≤ 3 分钟；设计器已提示该精度 |
| AC-12 | 超过 `timeout_seconds` 仍 RUNNING 的记录被置为 TIMEOUT 并告警 |

## 10. 依赖与风险

### 10.1 依赖
| 依赖 | 说明 |
| --- | --- |
| `cloudflow-common-job`（已有） | 分布式锁，直接复用 |
| Redisson 3.27.0（已有） | — |
| SYS-01 消息中心 | 失败告警；**弱依赖**，未就绪时告警可先只落日志 |
| SYS-07 代码生成器 | 两张表 CRUD 由生成器产出 |

### 10.2 风险

| 风险 | 应对 |
| --- | --- |
| **auth 成为定时任务单点**：auth 挂掉全系统任务停摆 | 集中调度的固有代价（架构选择的已知取舍）。应对：auth 多实例部署 + 调度器存活监控告警；关键任务（超时扫描、催办）恢复后按 `FIRE_ONCE` 补跑 |
| **网络抖动导致任务漏跑** | FR-3C 全节：调用重试、`DISPATCH_FAILED` 独立状态、待补跑队列、回报丢失巡检 + 状态反查 |
| **回报丢失导致状态悬挂**（任务实际成功但记录停在 RUNNING） | FR-3C.4/5：巡检 + 反查接口；AC-5D 明确告警文案为"结果未知"避免误导运维 |
| **高频任务的跨服务调用开销**：4 个 30-60s 级任务约每分钟 5-6 次 Feign 调用 | §12 待确认-1 提供三个方案；建议高频任务保留本地 `@Scheduled` 只做管理面纳管 |
| 长任务占死 HTTP 连接 | FR-1B.3 强制异步协议，被调方立即返回；AC-5B 验证 |
| 五个服务重复实现执行接口 | §7.1 已注明放进 `cloudflow-common-job` 统一实现 |
| 迁移 16 个任务引入行为变化 | AC-10 要求 cron 与迁移前完全一致；迁移逐个进行，每个任务单独验证 |
| 高频任务日志暴涨 | 30s 任务每天约 2880 条；配保留期 + 可选"仅失败落日志"开关 |
| 动态调度器实现复杂度 | 优先用 Spring `ThreadPoolTaskScheduler` 手动管理 `ScheduledFuture`，比引入 Quartz 轻；Quartz 作为备选 |
| 误操作暂停关键任务（如超时扫描） | `critical_flag` 标记，暂停时二次确认 + 审计 |
| `@Inner` 执行接口被外部滥用触发任务 | NFR 已列；AC-5F 验证 |

## 11. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 三张表（SYS-07 生成）+ `@JobHandler` 注解 + handler 上报机制 + 管理 CRUD 接口 | AC-8/9/5E |
| M2 | `cloudflow-common-job` 内统一实现 `/inner/job/execute` + `/inner/job/status` + 本地异步执行池 + 回报客户端 | AC-5B/5F |
| M3 | auth 集中调度器（CRON 型）+ 触发加锁 + Feign 路由 + 执行日志 | AC-1/3/5/6/7 |
| M4 | 网络容错全套：调用重试、DISPATCH_FAILED、待补跑队列、回报丢失巡检 + 状态反查 | AC-5C/5D/12 |
| M5 | 手动触发 + 暂停恢复 + FIXED_RATE/DELAY 型支持 | AC-2/11 |
| M6 | 失败告警 + 日志清理 + auth 调度器存活监控 | AC-4 |
| M7 | 16 个存量任务迁移（高频任务按 §12-1 结论处理） | AC-10 |
| M8 | 前端管理页面（手写） | — |

## 12. 待确认

| # | 问题 | 选项与建议 |
| --- | --- | --- |
| 1 | ~~高频任务是否也走集中调度~~ | **已定**：调大间隔后统一走集中调度（见 FR-7B）。调用量降到约 1200 次/天；间隔上线后可在管理界面调整。**需业务确认 FR-7B.1 表格里的四个新间隔是否可接受**，尤其催办 5 分钟与定时节点 3 分钟 |
| 2 | 动态调度用 Spring TaskScheduler 还是 Quartz | 建议 Spring `ThreadPoolTaskScheduler` + 自管 `ScheduledFuture`。集中调度下只有 auth 一处调度器，实现更简单 |
| 3 | 高频任务是否只在失败时落日志 | 建议加 `log_success_flag` 开关，30s 级任务默认只记失败与每小时一次成功摘要 |
| 4 | `TimerScanJob` 迁移是否影响 `TimerSchedulerService` 的单点约束 | 迁移前需确认：`TimerScanJob` 改由平台调度后，仍需保证 `scanAndTriggerTimers` 单点执行（现有 lock key 保留即可）。若按 §12-1 方案 1 处理，`TimerScanJob` 属高频保留本地，此风险自然消除 |
| 5 | auth 调度器是否需要热备 | 集中调度下 auth 是单点。建议：auth 多实例 + 触发加锁（FR-3.3）已实现天然热备（任一实例存活即可调度）；无需额外主备机制 |
