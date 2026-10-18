# PRD：CRM 工单 SLA 服务等级（CRM-03）

| 项 | 内容 |
| --- | --- |
| 条目编号 | CRM-03 |
| 所属批次 | 批次 E（第 2 份） |
| 对标依据 | `docs/benchmark/03-crm-客户经营对标.md` |
| 优先级 | P0 —— 工单已有但 SLA 是空的，属"表面有实际不可考核" |
| 预估工作量 | M |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题：有 SLA 提醒，没有 SLA 模型

现状是**倒置的**：已经有 SLA 提醒任务在跑，但底层没有 SLA 模型支撑。

实测确认：
- `CrmNotificationServiceImpl` 有 `@Scheduled(cron="0 0 * * * ?")` + `@DistributedJob` 的 `scheduledTicketSlaDispatch()`，调 `dispatchTicketSlaDue()`，用 `ticketSlaReminderHours()` 算提醒窗口
- `crm_service_ticket`（23 列）有 `severity` 与 `due_time`，但 **`due_time` 是录入时算死的固定值**

**缺什么**：
- 无优先级分档时长（P1 响应 1 小时、P3 响应 8 小时）
- 无暂停计时（"等待客户回复"期间不该算超时）
- 无工作日历（SLA 只该算工作时间）
- 无履约判定（哪些状态算履约完成）
- 无按客户/客户等级差异化 SLA（VIP 客户更快响应）
- 无首次响应与解决时长的区分

### 1.2 目标
1. 建立 SLA 策略模型（可按客户/等级/行业差异化）
2. 优先级分档的响应与解决时长
3. 暂停计时与工作日历（只算工作时间）
4. 履约判定与违约标记
5. 现有 SLA 提醒任务改读真实模型

### 1.3 非目标
- 不做 SLA 违约赔偿计算
- 不做多级升级链（工作流已有 `wf_escalation_chain`，工单升级可后续对接）
- 不做客户可见的 SLA 承诺页面（属 CRM-08 客户门户）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `crm_service_ticket` | 23 列：`customer_id, ticket_no, ticket_title, severity, issue_type, owner_id, opened_time, resolved_time, due_time, description, solution, attachment_url, status` + 审计列 |
| SLA 提醒 | `CrmNotificationServiceImpl.scheduledTicketSlaDispatch()`（每小时）+ `dispatchTicketSlaDue()` + `ticketSlaReminderHours()` 配置项 |
| 提醒接口 | `POST /crm/notification/dispatch/ticket-sla` |
| 工单接口 | `/crm/ticket` CRUD + `/{id}/resolve` + `/{id}/close` |
| 节假日日历 | **批次 A HR-04 已交付**（`calcWorkMinutes` / `nextWorkday`） |
| 客户等级 | `crm_customer.level_code`、`health_level` |

## 3. 范围

### 3.1 做
1. 新增 `crm_sla_policy`（策略）
2. 新增 `crm_sla_priority`（优先级分档时长）
3. 新增 `crm_sla_status_rule`（暂停与履约状态规则）
4. `crm_service_ticket` 增 SLA 计时字段
5. SLA 计时引擎（工作时间计算 + 暂停）
6. 违约标记与告警
7. 现有提醒任务改读真实模型
8. SLA 达成率报表

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 违约赔偿计算 | 涉及合同条款，超出范围 |
| 多级升级链 | 工作流已有 `wf_escalation_chain`，可后续对接 |
| 客户可见 SLA 页面 | CRM-08 客户门户 |
| SLA 条款与合同绑定 | 可后续评估（OA-06 合同履约条款可承载） |

## 4. 功能需求

### FR-1 SLA 策略
- FR-1.1 新增 `crm_sla_policy`：
  | 字段 | 说明 |
  | --- | --- |
  | policy_id | PK |
  | tenant_id | 租户 |
  | policy_code / policy_name | 编码与名称 |
  | **entity_type** | 适用范围：GLOBAL 全局 / CUSTOMER 指定客户 / CUSTOMER_LEVEL 客户等级 / INDUSTRY 行业 |
  | entity_id | 范围对象 ID（GLOBAL 时为空） |
  | holiday_calendar_id | 绑定节假日日历（引用 `sys_holiday_calendar`） |
  | apply_for_resolution | 是否考核解决时长（可只考核响应） |
  | default_flag | 是否默认策略 |
  | priority | 优先级（多策略匹配时的选择顺序） |
  | effective_start / effective_end | 生效期 |
  | status | ENABLED / DISABLED |
  | remark | 备注 |
  | + 审计列 | |
- FR-1.2 策略匹配顺序：指定客户 > 客户等级 > 行业 > 全局默认；同级按 `priority`
- FR-1.3 无匹配策略时工单不计 SLA（`sla_status=NOT_APPLICABLE`）

### FR-2 优先级分档
- FR-2.1 新增 `crm_sla_priority`：`policy_id, priority_code, priority_name, first_response_minutes, resolution_minutes, sort_no`
- FR-2.2 `priority_code` 与 `crm_service_ticket.severity` 对应（需统一取值，见 §9-1）
- FR-2.3 同一策略下每个优先级各自的响应与解决时长

### FR-3 状态规则
- FR-3.1 新增 `crm_sla_status_rule`：`policy_id, rule_type(PAUSE 暂停 / FULFILL 履约完成), ticket_status`
- FR-3.2 `PAUSE`：工单进入这些状态时暂停 SLA 计时（如 `WAITING_CUSTOMER` 等待客户回复）
- FR-3.3 `FULFILL`：工单进入这些状态时视为履约完成（如 `RESOLVED` / `CLOSED`）

### FR-4 工单 SLA 字段
- FR-4.1 `crm_service_ticket` 增：
  ```
  sla_policy_id            匹配的策略
  first_response_due       首次响应到期时间
  resolution_due           解决到期时间
  first_response_time      实际首次响应时间
  first_response_minutes   实际响应用时（工作分钟）
  resolution_minutes       实际解决用时（工作分钟）
  sla_paused_minutes       累计暂停分钟
  pause_start_time         当前暂停开始时间（未暂停时为空）
  sla_status               NOT_APPLICABLE / ONGOING / PAUSED / RESPONSE_BREACHED /
                           RESOLUTION_BREACHED / FULFILLED
  response_breached_flag   响应违约
  resolution_breached_flag 解决违约
  ```
- FR-4.2 `due_time` 字段保留但语义改为由 SLA 计算得出（不再手工录入）

### FR-5 SLA 计时引擎
- FR-5.1 工单创建时：匹配策略 → 按 `severity` 取分档时长 → 用 `calcWorkMinutes` 反算到期时间（**只算工作时间，跳过节假日与非工作时段**）
- FR-5.2 首次响应：工单首次被处理人回复/更新状态时记 `first_response_time`，计算实际响应工作分钟
- FR-5.3 暂停：工单进入 `PAUSE` 状态时记 `pause_start_time`；离开时累加到 `sla_paused_minutes` 并**顺延到期时间**
- FR-5.4 履约：工单进入 `FULFILL` 状态时判定是否违约，置 `sla_status=FULFILLED` 或对应 BREACHED
- FR-5.5 违约判定：实际用时（扣除暂停）> 约定时长 → 违约
- FR-5.6 优先级变更时重算到期时间（按新分档，已消耗时间保留）

### FR-6 提醒与告警改造
- FR-6.1 `dispatchTicketSlaDue()` 改为读 `first_response_due` / `resolution_due` 真实值
- FR-6.2 提醒时机：到期前 N%（可配，如 80%）与到期时各一次
- FR-6.3 违约时告警给负责人与其上级（走批次 A SYS-01）
- FR-6.4 现有 `@Scheduled` 任务交由批次 A SYS-02 纳管

### FR-7 报表
- FR-7.1 SLA 达成率：按策略/优先级/负责人/时间段统计响应与解决达成率
- FR-7.2 违约工单列表
- FR-7.3 平均响应与解决时长趋势（图表用批次 A LC-05）

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `crm_sla_policy`、`crm_sla_priority`、`crm_sla_status_rule` |
| 改造 | `crm_service_ticket`（增 11 个 SLA 字段） |

`DB/05.cloudflow-crm.sql`：+3 表

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **工作时间计算准确性** | 必须用批次 A 的 `calcWorkMinutes`，跨夜、跨周末、跨节假日、跨午休都要正确 |
| 计时一致性 | 暂停与恢复必须成对；异常中断（服务重启）时 `pause_start_time` 仍在库中，恢复后可继续 |
| 性能 | 到期时间计算涉及日历遍历，需缓存日历数据（批次 A 已有 Redis 缓存） |
| 幂等 | 重复触发履约判定不产生重复告警 |
| 精度 | 时长用分钟整数，避免秒级抖动 |
| 审计 | SLA 策略变更、优先级变更、人工调整到期时间记 `sys_audit_log` |
| 降级 | 节假日日历不可用时，SLA 计算失败应记录异常并按自然时间兜底计算 + 告警（工单不应因此阻塞创建） |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 四种 `entity_type` 策略匹配正确；匹配顺序为 客户 > 等级 > 行业 > 全局 |
| AC-2 | 无匹配策略时 `sla_status=NOT_APPLICABLE`，不计 SLA |
| AC-3 | **到期时间只算工作时间**：周五 17:00 创建的 4 小时响应 SLA，到期时间为下周一（跳过周末与非工作时段） |
| AC-4 | 跨法定节假日时到期时间正确顺延（联动批次 A 日历） |
| AC-5 | 首次响应时间正确记录，实际响应工作分钟计算正确 |
| AC-6 | **暂停计时：进入"等待客户"状态后计时暂停，恢复后到期时间顺延暂停时长** |
| AC-7 | 服务重启后暂停状态不丢失，恢复计时正确 |
| AC-8 | 履约状态判定正确：按时解决置 FULFILLED，超时置对应 BREACHED |
| AC-9 | 优先级变更后到期时间按新分档重算，已消耗时间保留 |
| AC-10 | 到期前 80% 与到期时各提醒一次；违约时告警给负责人与上级 |
| AC-11 | 现有 `dispatchTicketSlaDue()` 改读真实 SLA 字段，不再用固定 `due_time` |
| AC-12 | SLA 达成率报表按策略/优先级/负责人正确统计 |
| AC-13 | 日历不可用时工单仍可创建，SLA 按自然时间兜底并告警 |
| AC-14 | 重复触发履约判定不产生重复告警 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A HR-04 节假日日历** | `calcWorkMinutes` / `nextWorkday`；**强依赖，这是本 PRD 的核心计算能力** |
| **批次 A SYS-01 消息中心** | 提醒与违约告警 |
| **批次 A SYS-02 任务平台** | 纳管现有 SLA 提醒任务 |
| **批次 A LC-05 图表库** | SLA 报表 |
| 现有 `crm_service_ticket` | 改造对象 |
| 现有 `CrmNotificationServiceImpl` | 提醒逻辑改造 |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **工作时间计算是最易错的部分**（跨夜/跨周末/跨节假日/午休组合） | 强依赖批次 A 的能力（该 PRD 已有 AC-5 专项验证）；本 PRD AC-3/4 再验证一遍业务场景 |
| 暂停状态成对性被破坏（异常中断） | `pause_start_time` 落库而非内存（FR-4.1）；AC-7 验证重启恢复 |
| `severity` 与 `priority_code` 取值不统一 | §9-1 待确认；建议统一到一套取值 |
| 现有 `due_time` 语义变更影响存量逻辑 | 项目未上线；需梳理现有读 `due_time` 的代码（工单列表展示、提醒逻辑）并改为读新字段 |
| SLA 策略配置复杂，用户配错导致考核不准 | 提供"试算"：给定客户与优先级，展示计算出的到期时间 |
| 节假日日历未维护次年数据导致 SLA 算错 | 批次 A HR-04 已有"某年未维护提醒"机制；本 PRD 依赖它 |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 三张表（SYS-07 生成）+ 策略管理 + 匹配逻辑 | AC-1/2 |
| M2 | **SLA 计时引擎**（工作时间 + 到期计算 + 试算功能） | AC-3/4/13 |
| M3 | 首次响应 + 暂停恢复 + 履约判定 | AC-5/6/7/8/9 |
| M4 | 提醒与告警改造（含 SYS-02 纳管） | AC-10/11/14 |
| M5 | 达成率报表 | AC-12 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | `crm_service_ticket.severity` 与 `crm_sla_priority.priority_code` 取值如何统一 | 建议统一为 `P1/P2/P3/P4`（或 `URGENT/HIGH/MEDIUM/LOW`），用 `sys_dict_data` 承载；现有 `severity` 取值需梳理后统一 |
| 2 | 工作时段取自哪里 | 批次 A 的 `sys_holiday_calendar` 已有 `work_start_time` / `work_end_time` / `lunch_start_time` / `lunch_end_time`，直接用 |
| 3 | 是否需要 7×24 SLA（不按工作时间） | 建议支持：策略增 `round_the_clock_flag`，为真时按自然时间计算（部分紧急工单需要） |
| 4 | 违约后是否自动升级处理人 | 本期只告警不自动升级；工作流已有 `wf_escalation_chain`，后续可对接 |
| 5 | SLA 是否与合同条款绑定 | 本期不做；OA-06 合同履约条款落地后可评估关联 |
