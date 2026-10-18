# 批次 A 技术设计 · 03 SDK 与执行协议

| 项 | 内容 |
| --- | --- |
| 覆盖 | A2 消息发送 SDK（outbox 链路）· A3 集中调度执行协议 · A4 日历解析 SDK |
| 性质 | 这三处是批次 A 最复杂的部分，也是 PRD 里"待确认"最集中的地方 |
| 版本 | v1 · 2026-08-31 |

## 0. ⚠️ 修正 PRD 的一处技术错误

**A2 的 PRD FR-3.2B 写**：
> "outbox 消费者复用现有 `OutboxScheduler` 机制，按 `aggregate_type='MESSAGE'` 区分消息类事件"

**实测 `OutboxPublisher.publish()` 的实现**：
```java
outbox.setAggregateType(envelope.getSourceModule());   // ← aggregate_type 存的是来源模块
outbox.setEventType(envelope.getEventType());
```

`aggregate_type` 存的是**来源模块**（如 `cloudflow-workflow`），不是事件分类。若强行写成 `'MESSAGE'` 会破坏现有约定，且丢失来源信息。

**修正**：消息类事件用 **`event_type` 区分**，`aggregate_type` 保持来源模块：
```
event_type    = "MESSAGE_SEND"        ← 消费者按此路由
aggregate_type = "cloudflow-workflow"  ← 保持来源模块（现有约定）
aggregate_id  = 业务对象 ID
```

---

## 1. A2 消息发送 SDK

### 1.1 模块定位

新建 `cloudflow-common-message`（与现有 16 个 `cloudflow-common-*` 并列）。**只含发送侧**，管理面与消费侧在 `cloudflow-auth`。

```
cloudflow-common-message/
├── api/
│   ├── MessageSender.java              发送入口（业务方唯一依赖）
│   ├── dto/MessageSendRequest.java     发送请求
│   └── dto/MessageReceiver.java        接收方
├── channel/
│   ├── MessageChannelSender.java       渠道适配接口（策略模式）
│   ├── MessageChannelSenderFactory.java 工厂
│   └── impl/InternalChannelSender.java 站内实现（本批唯一实现）
├── constant/
│   ├── MessageChannelType.java         渠道类型枚举
│   ├── MessageCategory.java            消息分类枚举
│   └── MessageEventType.java           事件类型常量
└── config/MessageAutoConfiguration.java
```

### 1.2 业务方调用方式（**21 个调用方要改成这个**）

```java
// 改造前（OA/workflow 侧现状）
sysNoticeService.sendNotice(userId, "标题", "内容", "1", senderId, "系统");

// 改造后
messageSender.send(MessageSendRequest.builder()
        .templateCode("WF_TASK_TODO")
        .channelTypes(List.of(MessageChannelType.INTERNAL))
        .receivers(List.of(MessageReceiver.ofUser(userId)))
        .params(Map.of("processTitle", title, "starterName", name))
        .category(MessageCategory.TODO)
        .bizType("WF_TASK").bizId(taskId)
        .linkUrl("/task/" + taskId)
        .build());
```

**设计要点**：SDK 接口必须做到**一行替换**，否则 21 个调用方的改造成本与出错率都会失控（A2 风险表已列此项）。

### 1.3 发送链路（已定决策：SDK 直写 outbox，auth 统一消费）

```
① 业务方调 messageSender.send(request)
        ↓ 同一事务内（复用 OutboxPublisher 的 @Transactional）
② SDK 构造 BusinessEventEnvelope：
     eventType     = "MESSAGE_SEND"
     sourceModule  = 当前服务名（spring.application.name）
     sourceId      = bizId 的数值化或 null
     tenantId      = UserContext.getTenantId()
     payload       = MessageSendRequest 的 JSON
        ↓
③ OutboxPublisher.publish(envelope) → 写 outbox_event
        ↓ 业务事务提交（回滚则消息一并回滚 ← A2 的 AC-2）
④ auth 侧 OutboxScheduler（现有，fixedDelay 5s）扫描并 claim
        ↓
⑤ auth 侧 MessageSendEventConsumer（implements BusinessEventConsumer, eventType()="MESSAGE_SEND")
        ↓
⑥ 发送前六道校验（见 1.4）
        ↓
⑦ MessageChannelSenderFactory 按 channelType 取实现 → 发送
        ↓
⑧ 写 sys_message_record（幂等键 uk_msg_rec_outbox）
```

**关键收益**（对应 A2 的三条 AC）：
- AC-2：业务事务回滚 → outbox 记录一并回滚 → 消息不误发
- AC-2B：auth 停机 → 消息堆积在 outbox 不丢 → 恢复后自动投递
- AC-2C：auth 多实例 → 现有 `locked_by`/`locked_until` 行级 claim 保证只投递一次

### 1.4 发送前六道校验（顺序固定）

```
1. 模板存在且 status=ENABLED           → 否则 FAILED, error="模板不存在或已停用"
2. params 满足 params_declare 的必填    → 否则 FAILED, error="缺失参数: xxx"
3. 渠道存在且 implemented_flag=1        → 否则 SKIPPED, skip_reason=NOT_IMPLEMENTED
                                          （本批 EMAIL/SMS 走这条）
4. 用户订阅未关闭（force_send_flag 跳过）→ 否则 SKIPPED, skip_reason=UNSUBSCRIBED
5. 不在免打扰时段（force_send_flag 跳过）→ 否则延迟投递（重入 outbox，next_retry_at 设为时段结束）
6. 去重窗口内未发过同 key              → 否则 SKIPPED, skip_reason=DEDUPED
   去重 key = template_code + receiver_id + biz_id
7. 渠道限流未超（rate_limit_minute/daily_limit） → 超限则延迟重试
```

### 1.5 渠道适配接口（策略模式）

```java
public interface MessageChannelSender {
    MessageChannelType channelType();
    boolean implemented();                    // 本批：INTERNAL=true，其余=false
    ChannelSendResult send(ChannelSendContext ctx);
    default ChannelTestResult test(ChannelTestContext ctx) {
        return ChannelTestResult.notImplemented();
    }
}
```

**本批交付两个实现**：
| 实现 | 说明 |
| --- | --- |
| `InternalChannelSender` | 站内消息：写 `sys_message_record` + 通过现有 `NotificationWebSocketHandler` 推送 |
| `MockChannelSender` | **仅测试环境注册**（`@Profile("test")`），用于验证"新增一个实现类即可接入"（A2 的 AC-9C）|

**未来接入邮件只需**（A2 的 AC-9D）：
```java
@Component
public class EmailChannelSender implements MessageChannelSender {
    public MessageChannelType channelType() { return MessageChannelType.EMAIL; }
    public boolean implemented() { return true; }
    public ChannelSendResult send(ChannelSendContext ctx) { /* JavaMailSender */ }
}
```
**不改表、不改发送主流程、不改模板机制** —— 这是策略模式设计正确性的判据。

### 1.6 ROLE/DEPT 接收方展开

```
receiver_type=ROLE  → 查 sys_user_role 展开为 USER 列表
receiver_type=DEPT  → 查 sys_user（含子部门，按 sys_dept 树）展开
展开上限：500（可配 cloudflow.message.receiver-expand-limit）
超限 → FAILED, error="接收人超上限，请改用公告"
```

展开在**消费侧**做（不在 SDK 侧），避免业务事务里做大量查询。

---

## 2. A3 集中调度执行协议

### 2.1 整体时序

```
auth 侧                                        业务服务侧
──────────                                     ──────────
ThreadPoolTaskScheduler 到点触发
   ↓
① 抢 Redisson 锁 lock:job:dispatch:{jobId}:{fireTimeWindow}
   （防 auth 多实例重复触发 ← A3 的 FR-3.3）
   ↓ 拿到锁
② 生成 executeNo = UUID
   写 sys_job_log(execute_status=RUNNING, dispatcher_ip=本机)
   ↓
③ Feign 调 POST /inner/job/execute
   { jobId, executeNo, handlerName, handlerParam,
     timeoutSeconds, lockTimeSeconds }
   连接超时 3s / 读超时 10s
   ────────────────────────────────────→  ④ 收到请求
                                              抢 @DistributedJob 锁
                                              （name=handlerName, lockTime, waitTime=0）
                                              ↓ 拿到锁
                                          ⑤ 立即返回 {accepted:true}
                                              ↓ 不等执行完
   ⑥ Feign 返回，auth 侧线程释放          ⑦ 本地线程池异步跑 handler
      （长任务不占 HTTP 连接 ← FR-1B.3）      ↓ 完成/异常
                                          ⑧ 调 auth 的 POST /inner/job/report
   ⑨ 按 executeNo 更新 sys_job_log  ←────────  { executeNo, executeStatus,
      （幂等：uk_job_log_execute_no）            affectedRows, resultMsg,
                                                 exceptionStack, executorIp, durationMs }
```

**若 ④ 未拿到锁** → 立即返回 `{accepted:false, reason:"LOCK_HELD"}` → auth 侧记 `SKIPPED`

### 2.2 四类失败的区分（这是集中调度必须做对的部分）

| 情况 | 状态 | 处理 |
| --- | --- | --- |
| Feign 调用失败（连接超时/5xx/服务不可达） | `DISPATCH_FAILED` | 按 `dispatch_retry_count`（默认 3）× `dispatch_retry_interval_sec`（默认 10s）重试；耗尽后告警，**文案明确是"网络调度失败"** |
| 目标服务全部实例不可用 | `DISPATCH_FAILED` | 按 `misfire_strategy`：`IGNORE` 跳过；`FIRE_ONCE` 记入待补跑队列，服务恢复后补跑一次 |
| handler 抛异常（业务失败） | `FAILED` | 按 `retry_count` 重试；告警文案是"任务执行失败" |
| **回报丢失**（执行完但回报请求失败） | 先 `RUNNING` 悬挂 → 巡检处理 | 见 2.3 |

### 2.3 回报丢失的处理（**集中调度特有的坑**）

```
巡检任务（auth 内置，每 5 min）：
  查 sys_job_log WHERE execute_status='RUNNING'
                   AND start_time < NOW() - timeout_seconds
  ↓ 对每条
  ① 先调业务服务 GET /inner/job/status/{executeNo} 反查真实状态
  ↓
  ② 反查成功 → 按真实状态更新（多数情况能救回来）
     反查失败（服务已重启，内存态丢失）→ 置 TIMEOUT
  ↓
  ③ 告警文案必须是「结果未知」而不是「执行失败」
     （任务实际可能已成功，误报会让运维做错决策 ← A3 的 AC-5D）
```

业务服务侧需保留 `executeNo → 执行状态` 的短期缓存（Redis，TTL = timeoutSeconds × 2）供反查。

### 2.4 Handler 注册与上报

```java
// 业务方标记
@JobHandler(value = "crmQuoteExpire", desc = "报价过期处理")
public JobResult expireQuotes(String param) {
    int count = ...;
    return JobResult.success(count, "处理 " + count + " 条过期报价");
}

// cloudflow-common-job 内：启动后扫描并上报
@EventListener(ApplicationReadyEvent.class)
public void reportHandlers() {
    List<HandlerInfo> handlers = scanJobHandlers();
    authJobFeignClient.reportHandlers(new HandlerReportDTO(serviceName, handlers));
}
```

**Handler 白名单**：`handler_name` 只能是已上报值，**不接受反射类名或表达式**（A3 的 NFR，防任意方法调用）。

### 2.5 高频任务的新间隔（已定决策）

写入 `06` 种子数据的 16 条 `sys_job` 记录中，四个高频任务用调整后的值：

| handler | 原 | 新 `interval_ms` | `log_success_flag` |
| --- | --- | --- | --- |
| `taskReminder` | 30s | **300000**（5min） | 0（只记失败） |
| `taskTimeout` | 60s | **300000**（5min） | 0 |
| `timerScan` | 60s | **180000**（3min） | 0 |
| `deadlockDetection` | 30s | **600000**（10min） | 0 |

其余 12 个低频任务 `log_success_flag=1`。

### 2.6 不迁移的两个任务

| 任务 | 保持 `@Scheduled` 的原因 |
| --- | --- |
| `OutboxScheduler`（5s） | 基础设施非业务任务；用 DB 行级 claim 而非 Redisson 锁；5s 高频不适合走 Feign |
| `TimerSchedulerService` | 源码注释明确要求由 `TimerScanJob` 单点调度，避免两个调度器并发消费同一 Redis ZSet。**`TimerScanJob` 本身迁移，它内部调用 `TimerSchedulerService` 的方式不变** |

---

## 3. A4 日历解析 SDK

### 3.1 三级回退解析（已定决策）

```java
public interface HolidayCalendarResolver {
    /**
     * 解析员工在指定日期应使用的日历 ID
     * 三级回退：班次 → 部门 → 租户默认
     */
    Long resolveCalendarId(Long employeeId, LocalDate date);
}
```

```
① 查该员工当日排班：hr_schedule_assignment(employee_id, date) → shift_id
   → hr_shift.holiday_calendar_id  非空则返回
        ↓ 无排班或班次未配日历
② 查员工部门：hr_employee.dept_id → sys_dept.holiday_calendar_id
   非空则返回
        ↓ 部门未配
③ 查租户默认：sys_holiday_calendar WHERE tenant_id=? AND default_flag=1 AND status='ENABLED'
   非空则返回
        ↓ 三级全空
④ 抛 BusinessException("未配置节假日日历，请联系管理员")
   ← 绝不静默按自然日计算（A4 的 AC-13C）
```

**跨服务问题**：`hr_shift` / `hr_schedule_assignment` / `hr_employee` 在 HR 服务的库表中。解析器放在哪？

| 方案 | 取舍 |
| --- | --- |
| **A（推荐）** 放 `cloudflow-common-*`，直接读表 | 各服务连同一库（现状如此），无 RPC；但 common 模块依赖了 HR 表结构 |
| B 放 HR 服务，其他服务走 `@Inner` | 职责清晰；但 CRM SLA 计时会高频调 HR，且 HR 挂了 SLA 就算不出来 |

**建议 A**：与项目现状一致（`SysNotice` 等已有跨模块读表的先例），且 D1 请假天数计算需逐日解析，走 RPC 开销不可接受。

### 3.2 缓存设计

```
两层缓存：
① 日历整年明细：key = holiday:cal:{calendarId}:{year}
   value = Map<LocalDate, DayType>（只含例外日期，约 30 条）
   TTL = 24h，明细变更时精确失效

② 员工日历归属：key = holiday:emp:{employeeId}:{date}
   value = calendarId
   TTL = 1h（排班可能变动，TTL 不宜长）
```

判定逻辑：先查缓存①拿到当年例外日期表 → 命中则按明细类型 → 未命中则按 `weekly_rest_days` 判周末。

**性能目标**（A4 的 NFR）：判定 P99 < 5ms（缓存命中），一年内区间计算 < 20ms。

### 3.3 六个计算方法

```java
boolean isWorkday(Long calendarId, LocalDate date);
int countWorkdays(Long calendarId, LocalDate start, LocalDate end);
BigDecimal calcLeaveDays(Long calendarId, LocalDateTime start, LocalDateTime end, boolean includeHoliday);
long calcWorkMinutes(Long calendarId, LocalDateTime start, LocalDateTime end);
LocalDate nextWorkday(Long calendarId, LocalDate from, int n);
DayTypeInfo getDateType(Long calendarId, LocalDate date);
```

**`calcLeaveDays` 的半天规则**（A4 的 §12-2 已定）：以日历 `lunch_start_time`（默认 12:00）为分界
```
起止都在上午 → 0.5
起止都在下午 → 0.5
跨午休       → 1.0
多日         → 首日 + 中间整日 + 末日，各按上述规则
includeHoliday=false 时跳过非工作日
```

**`calcWorkMinutes` 的规则**（CRM SLA 计时用）：
```
只累计 [work_start_time, work_end_time] 内的分钟
扣除 [lunch_start_time, lunch_end_time]
跳过非工作日
跨夜、跨周末、跨节假日均需正确处理
```

---

## 4. 三处 SDK 的依赖关系

```
cloudflow-common-message   ← 依赖 cloudflow-common-event（OutboxPublisher）
cloudflow-common-job       ← 依赖 cloudflow-common-core（Redisson 锁已在此）
                              新增：JobHandler 注解 + 执行接口 + 回报客户端
cloudflow-common-holiday   ← 依赖 cloudflow-common-core + Redis
（或并入现有某个 common 模块，见 §5-2）
```

## 5. 待确认

**全部 5 项已于 2026-08-31 定案**（见 `01-决策汇总.md` §1）：

| # | 问题 | ✅ 决策 |
| --- | --- | --- |
| 1 | 日历解析器直接读 HR 表是否接受 | **接受**（§3.1 方案 A）。理由：各服务连同一库（现状如此），D1 请假需逐日解析、CRM SLA 计时高频调用，走 RPC 开销不可接受 |
| 2 | 是否新建 `cloudflow-common-holiday` | **新建独立模块**。common 模块 16 → 17 个。理由：CRM/HR/OA 三处都依赖它，独立便于版本管理 |
| 3 | `MockChannelSender` 是否留生产 | **`@Profile("test")` 只在测试环境注册**，生产不加载。理由：它只为验证策略模式（AC-9C），生产多一个可调用的假渠道反而是风险 |
| 4 | `executeNo` 状态缓存 TTL | **`timeout_seconds` × 2**。理由：巡检在超过 timeout 后才反查，2 倍余量能覆盖巡检周期拖延；再长就是白占 Redis |
| 5 | `FIRE_ONCE` 补跑队列存储 | **Redis List**（key=`job:misfire:queue`），auth 启动时与每次调度前检查，**不新建表**。理由：补跑队列是短期数据（服务恢复后即消耗完），不需持久化与查询 |
