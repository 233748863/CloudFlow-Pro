# PRD：OA 增强项合集（OA-07/08）

| 项 | 内容 |
| --- | --- |
| 条目编号 | OA-07 会议室与会议深化 · OA-08 耗材库存台账 |
| 所属批次 | 批次 H（P2 增强项） |
| 对标依据 | `docs/benchmark/02-oa-协同办公对标.md` |
| 优先级 | P2 |
| 预估工作量 | OA-07 M / OA-08 M |
| 版本 | v1 · 2026-08-31 |

## 0. 定位

两项独立。**OA-07 有一个必须处理的对齐问题**：批次 E 的 CRM-01（活动管理）已建了会议/通话/任务三实体，OA-07 改会议时必须与之对齐字段口径，否则系统内出现两套不可互通的会议模型。

---

# OA-07 会议室与会议深化

## 1. 背景

现有 `oa_meeting_room` + `oa_meeting_minutes` + `oa_meeting_attendance` 三表，**有会议纪要与签到（这两点比对标项目强）**。

缺：
- 可预约时段配置（当前应是自由时段预约，无法表达"会议室仅工作日 8:00-20:00 可约"）
- 线上会议链接
- 参会人接受/拒绝状态
- 多提醒设置
- 周期性会议
- 会议室设备与容量信息

## 2. 与 CRM-01 的对齐要求（**关键**）

批次 E 的 CRM-01 已建：
- `crm_activity`（含 `activity_type=MEETING`、`status`、`start_time`、`end_time`、`all_day_flag`、`join_url`、`meeting_platform`、`reminders`）
- `crm_activity_participant`（含 `acceptance_status` 四态：NONE/ACCEPTED/DECLINED/TENTATIVE）

**OA-07 必须复用同一套取值**：
| 概念 | 统一取值 |
| --- | --- |
| 会议状态 | `PLANNED` / `IN_PROGRESS` / `COMPLETED` / `CANCELLED` / `NOT_HELD` |
| 参会接受状态 | `NONE` / `ACCEPTED` / `DECLINED` / `TENTATIVE` |
| 提醒配置结构 | 与 `crm_activity_reminder` 同结构（提前分钟数 + 渠道 + 发送状态） |

CRM-01 的 §9-1 已记录这个对齐要求（"CRM 活动挂客户、OA 日程挂内部事务，受众不同；但 status / acceptance_status / 提醒配置结构必须一致"）。

## 3. 现状基线

| 项 | 现状 |
| --- | --- |
| `oa_meeting_room` | 会议室基础信息 |
| `oa_schedule_event` | 日程事件 |
| `oa_meeting_minutes` | 会议纪要（**领先能力**） |
| `oa_meeting_attendance` | 会议签到（**领先能力**） |
| 接口 | `/oa/meeting-room`、`/oa/schedule`、`/oa/meeting-minutes` |
| 前端 | `MeetingRoomPage.tsx`、`MeetingMinutesPage.tsx`、`SchedulePage.tsx`、`admin-meeting.css`、`MeetingRoomSelector.tsx` |
| 日历库 | `@fullcalendar/*` 6.1.20（已有） |
| CRM 活动 | 批次 E CRM-01 已交付（对齐对象） |

## 4. 功能需求

### FR-1 会议室配置增强
- FR-1.1 `oa_meeting_room` 增：
  ```
  capacity              容量（人数）
  location              位置（楼层/区域）
  equipment_tags        设备标签（JSON：投影/白板/视频会议/电话会议）
  open_time / close_time        可预约时段
  bookable_weekdays     可预约星期（如 1-5）
  holiday_calendar_id   绑定节假日日历（节假日是否可约）
  min_booking_minutes   最短预约时长
  max_booking_minutes   最长预约时长
  advance_booking_days  最多提前几天预约
  need_approval_flag    预约是否需审批
  approver_id           审批人
  buffer_minutes        会议间隔缓冲时间
  photo_url             会议室照片
  ```
- FR-1.2 预约时校验：时段在开放范围内、时长在上下限内、不超提前天数、非节假日（或按配置）、与已有预约不冲突（含缓冲时间）
- FR-1.3 `need_approval_flag=1` 时预约走审批

### FR-2 会议增强（对齐 CRM-01）
- FR-2.1 `oa_schedule_event` 增：
  ```
  join_url              线上会议链接
  meeting_platform      会议平台
  reminders             提醒配置（结构与 crm_activity_reminder 一致）
  recurrence_rule       周期规则（RRULE 字符串）
  recurrence_end_date   周期结束日期
  parent_event_id       周期实例的父事件
  status                统一取值（见 §2）
  meeting_room_id       关联会议室
  ```
- FR-2.2 `oa_meeting_attendance` 增：`acceptance_status`（四态，见 §2）、`response_time`
  - 现有签到字段保留（签到是实际出席，接受状态是事前确认，两者并存）
- FR-2.3 周期性会议：按 RRULE 展开为多个实例（`parent_event_id` 关联），单个实例可独立修改或取消
- FR-2.4 提醒发送走批次 A SYS-01；会议改期时旧提醒取消重排（与 CRM-01 FR-3.4 同一要求）

### FR-3 会议室看板
- FR-3.1 会议室占用日历视图（横轴时间、纵轴会议室），用 `@fullcalendar` 资源视图
- FR-3.2 空闲会议室查询：给定时段与人数，返回可用会议室
- FR-3.3 会议室使用率统计（用批次 A LC-05）

### FR-4 冲突检测
- FR-4.1 会议室时段冲突检测（含缓冲时间）
- FR-4.2 参会人时段冲突提示（查该人同时段的其他会议与 CRM 活动，**跨模块查询**）
- FR-4.3 冲突不强制阻止（提示为主），会议室冲突除外（会议室是独占资源，必须阻止）

## 5. 验收标准
| # | 验收项 |
| --- | --- |
| AC-1 | 会议室可配置容量、设备、可预约时段、时长限制、提前天数 |
| AC-2 | 超出开放时段/时长限制/提前天数的预约被拒绝 |
| AC-3 | 节假日按配置决定是否可约（联动批次 A 日历） |
| AC-4 | **会议室时段冲突（含缓冲时间）被阻止** |
| AC-5 | 参会人时段冲突有提示（含 CRM 活动冲突） |
| AC-6 | `need_approval_flag=1` 时预约走审批 |
| AC-7 | 线上会议链接可填并在通知中展示 |
| AC-8 | **参会接受状态四态与 CRM-01 取值一致** |
| AC-9 | **会议状态取值与 CRM-01 一致** |
| AC-10 | 提醒按配置发出；改期后旧提醒取消重排 |
| AC-11 | 周期性会议按 RRULE 正确展开；单实例可独立修改取消 |
| AC-12 | 会议室占用看板与空闲查询正确 |
| AC-13 | 会议室使用率统计正确 |
| AC-14 | 回归：现有会议纪要与签到功能不变 |

## 6. 依赖与风险
- 依赖：**批次 E CRM-01（字段口径对齐）**、批次 A HR-04（节假日日历）、批次 A SYS-01（提醒）、`@fullcalendar`（已有）
- 风险：
  - **与 CRM-01 口径不一致会导致两套会议模型** → AC-8/9 专项验证
  - RRULE 周期展开逻辑复杂（尤其"每月最后一个周五"这类规则）→ 建议只支持常用规则（每日/每周/每月同一天），复杂规则不做
  - 跨模块查参会人冲突需调 CRM 服务 → 走 `@Inner` 接口，CRM 不可达时降级为只查 OA 内冲突

---

# OA-08 耗材库存出入库台账

## 1. 背景

`oa_consumable` 单表，库存数量应是就地增减。**与 D1 假期余额同类问题** —— 数量错了无法追溯，无出入库流水。

## 2. 现状基线

| 项 | 现状 |
| --- | --- |
| `oa_consumable` | 耗材单表 |
| `oa_asset_movement` | **F1 已建**（资产调拨，模式可参照） |
| `oa_supplier` | **F2 已扩展**（采购来源） |
| 采购 | `biz_purchase_request` / `biz_purchase_receipt` |
| 风险告警 | `oa_risk_alert`（可复用做补货提醒） |
| 领用 | 无结构化领用申请 |

## 3. 范围决策：只取最简出入库语义

对标文档已明确"我们是办公耗材不是仓储业务，只取最简出入库流水"。**不做**：仓库、批次、序列号、库位、盘点、调拨单、安全库存自动补货单。

## 4. 功能需求

### FR-5 耗材主数据增强
- FR-5.1 `oa_consumable` 增：`category_id, unit, specification, brand, safety_stock DECIMAL(12,2), max_stock DECIMAL(12,2), current_stock DECIMAL(12,2)（物化值）, avg_cost DECIMAL(12,2), last_purchase_price, storage_location, supplier_id, status, last_calc_time`
- FR-5.2 `current_stock` 降级为**物化值**，由台账重算（与 D1 的 `hr_leave_quota` 同一模式）

### FR-6 出入库台账
- FR-6.1 新增 `oa_consumable_ledger`：
  ```
  ledger_id, tenant_id, consumable_id
  transaction_type   INBOUND 入库 / OUTBOUND 领用出库 / ADJUST 盘盈盘亏调整 /
                     SCRAP 报废 / RETURN 退回
  quantity           DECIMAL(12,2)，正为增负为减
  balance_after      变动后结存 DECIMAL(12,2)
  unit_price / amount
  source_biz_type    来源单据类型（PURCHASE_RECEIPT / CONSUMABLE_REQUEST / MANUAL）
  source_biz_id
  operator_id / operator_name
  operate_time
  storage_location
  remark
  + 审计列
  ```
- FR-6.2 台账不可修改删除（错误通过反向记录冲正，与 D1 同一原则）
- FR-6.3 结存由台账推导；提供重算接口与定时任务

### FR-7 领用申请
- FR-7.1 新增 `oa_consumable_request`：`request_id, tenant_id, request_no, applicant_id, applicant_name, dept_id, purpose, apply_date, expect_date, total_amount, status(DRAFT/APPROVING/APPROVED/ISSUED/REJECTED/CANCELLED), instance_id, issue_by, issue_time` + 审计列
- FR-7.2 新增 `oa_consumable_request_item`：`item_id, request_id, consumable_id, consumable_name, apply_quantity, approved_quantity, issued_quantity, unit, unit_price, amount, remark`
- FR-7.3 领用走审批（金额或数量超阈值时，走 `sys_business_rule`）
- FR-7.4 审批通过后发料，发料时写台账（`OUTBOUND`）
- FR-7.5 库存不足时提示（可选择部分发料）

### FR-8 入库
- FR-8.1 采购收货（`biz_purchase_receipt`）完成后自动入库写台账（`INBOUND`）
- FR-8.2 支持手工入库（如捐赠、调入）
- FR-8.3 入库更新 `avg_cost`（移动加权平均）

### FR-9 补货提醒
- FR-9.1 结存低于 `safety_stock` 时写 `oa_risk_alert` 并通知管理员（走批次 A SYS-01）
- FR-9.2 由内置任务扫描（批次 A SYS-02 纳管）
- FR-9.3 可一键生成采购申请（带入低库存耗材清单）

### FR-10 报表
- FR-10.1 库存台账（进出存明细）
- FR-10.2 领用统计（按部门/按人/按耗材）
- FR-10.3 库存预警清单
- FR-10.4 耗材成本分析

## 5. 验收标准
| # | 验收项 |
| --- | --- |
| AC-15 | 采购收货后自动入库，台账正确 |
| AC-16 | 手工入库可用；`avg_cost` 按移动加权平均更新 |
| AC-17 | 领用申请可提交与审批；通过后发料写台账 |
| AC-18 | 库存不足时提示，可部分发料 |
| AC-19 | **结存由台账推导，与台账 SUM 一致**（重算验证） |
| AC-20 | **台账不可修改删除；冲正通过反向记录** |
| AC-21 | 结存低于安全库存时告警并通知 |
| AC-22 | 可从预警清单一键生成采购申请 |
| AC-23 | 五种交易类型均正确记账 |
| AC-24 | 报表：进出存明细、领用统计、预警清单、成本分析正确 |
| AC-25 | 并发领用不超发（加锁验证） |

## 6. 依赖与风险
- 依赖：F1（`oa_asset_movement` 模式参照）、F2（供应商）、批次 A SYS-01/SYS-02、现有采购收货与规则中心
- 风险：
  - **并发领用超发** → 用 Redisson 锁（与 D1 假期扣减同一模式）
  - 遗留代码直接改 `current_stock` 绕过台账 → 需全仓排查现有耗材数量修改点并全部改走台账（与 D1 的同类风险）
  - 移动加权平均成本计算需注意精度

---

## 综合依赖汇总

| 依赖 | 被哪项用 |
| --- | --- |
| **批次 E CRM-01** | OA-07（字段口径对齐，**强要求**） |
| **批次 A HR-04 节假日日历** | OA-07（会议室节假日可约配置） |
| **批次 A SYS-01** | OA-07（会议提醒）、OA-08（补货通知） |
| **批次 A SYS-02** | OA-08（库存预警扫描、结存重算） |
| **批次 A LC-05** | 两项的报表 |
| **批次 F OA-01** | OA-08（调拨模式参照） |
| **批次 F OA-02** | OA-08（供应商引用） |

## 综合待确认

| # | 问题 | 建议 |
| --- | --- | --- |
| 1 | 两项是否有真实诉求 | OA-08 的"数量错了无法追溯"是实际问题，建议做；OA-07 属体验优化，看会议室紧张程度 |
| 2 | OA-07 的周期规则支持到什么程度 | 建议只支持每日/每周/每月同一天三种常用规则，不做完整 RRULE |
| 3 | OA-07 与 CRM-01 是否最终合并为一套活动模型 | 本期只要求口径对齐（AC-8/9）。若后续发现两套模型维护成本高，可评估合并，但受众与字段差异是客观存在的 |
| 4 | OA-08 是否需要盘点 | 建议不做（范围决策 §3）。若需要，`ADJUST` 类型已能承载盘盈盘亏，盘点单据可后续补 |
| 5 | OA-08 的领用审批阈值 | 建议走 `sys_business_rule`（新增规则码 `oa.consumable.request.limit`），按金额或数量配 |
