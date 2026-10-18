# PRD：CRM 活动管理（CRM-01）

| 项 | 内容 |
| --- | --- |
| 条目编号 | CRM-01 |
| 所属批次 | 批次 E（第 1 份） |
| 对标依据 | `docs/benchmark/03-crm-客户经营对标.md` |
| 优先级 | P0 —— **CRM 模块最大单点缺口** |
| 预估工作量 | L |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题

CRM 是五个业务服务里最薄的（**17 表 / 156 端点**，对比 HR 86 表 / 463 端点），而活动管理是其中最大的空白。

现状只有 `crm_follow_up`（17 列）一张表，把所有客户互动压成"跟进记录"：`follow_up_type` / `follow_up_time` / `content` / `result_summary` / `attachment_url` + 两个固定外键 `customer_id` / `opportunity_id`。

**缺什么**：
- 无参会人概念（谁参加了这次会议）
- 无参会人接受状态（对方确认来不来）
- 无提醒（会议前 30 分钟提醒）
- 不能挂到工单/线索/合同（只有 customer_id + opportunity_id 两个固定外键）
- 无通话方向（呼入/呼出）
- 无日程视图（销售看不到自己这周的客户拜访安排）

实测确认：`CrmWorkspaceActivityItemVO` 只是**只读的时间线聚合**（字段为 `module` / `sourceLabel` / `eventTime` / `path` 等），不是活动管理实体。

### 1.2 目标
1. 建立活动三实体语义（会议 / 通话 / 任务）
2. 多态挂载（客户 / 商机 / 线索 / 工单 / 合同）
3. 参会人与接受状态
4. 多提醒
5. 日历视图（复用已有 FullCalendar）
6. 客户 360 时间线聚合活动与跟进

### 1.3 非目标
- 不替代 `crm_follow_up`（跟进记录有独立业务含义，两者并行）
- 不做外部日历同步（Outlook/Google）
- 不做视频会议集成（只存 `join_url`）
- 不做营销活动（CRM-02，Campaign 是不同概念）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `crm_follow_up` | 17 列：`customer_id, opportunity_id, follow_up_type, follow_up_time, next_follow_up_time, content, result_summary, attachment_url, owner_id, owner_name` + 审计列 |
| `crm_customer` | 36 列，含 `last_follow_up_time` / `next_follow_up_time` |
| `crm_opportunity` | 27 列，含 `latest_follow_up_time` |
| 服务实现 | `CrmFollowUpServiceImpl`、`CrmCustomerWorkspaceServiceImpl`（客户工作台）|
| 时间线 | `CrmWorkspaceActivityItemVO`（只读聚合，非实体） |
| OA 侧日程 | `oa_schedule_event`、`oa_meeting_room`、`oa_meeting_minutes`、`oa_meeting_attendance`（**注意：需与本 PRD 对齐字段口径，见 §9-1**） |
| 前端 | `@fullcalendar/*` 6.1.20 已在依赖（daygrid / timegrid / interaction / react） |

## 3. 范围

### 3.1 做
1. 新增 `crm_activity`（活动主表，三类合一）
2. 新增 `crm_activity_participant`（参与人）
3. 新增 `crm_activity_reminder`（提醒，或用 JSON 字段，见 §9-2）
4. 多态挂载
5. 日历视图接口 + 前端（FullCalendar）
6. 客户 360 时间线聚合
7. 提醒发送（走 SYS-01）

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 替代 `crm_follow_up` | 跟进记录是"结果记录"，活动是"事件安排"，语义不同 |
| 外部日历同步 | 需 OAuth 与双向同步，成本高；可后续评估 |
| 视频会议集成 | 只存链接 |
| 周期性活动 | 见 §9-3（本期不做，需求不明确） |

## 4. 功能需求

### FR-1 活动主表
- FR-1.1 新增 `crm_activity`：
  | 字段 | 说明 |
  | --- | --- |
  | activity_id | PK |
  | tenant_id | 租户 |
  | activity_no | 编号 |
  | activity_type | MEETING 会议 / CALL 通话 / TASK 任务 |
  | subject | 主题 |
  | description | 说明 |
  | status | PLANNED 计划 / IN_PROGRESS 进行中 / COMPLETED 已完成 / CANCELLED 已取消 / NOT_HELD 未举行 |
  | priority | HIGH / MEDIUM / LOW |
  | direction | INBOUND / OUTBOUND（CALL 用） |
  | start_time | 开始时间 |
  | end_time | 结束时间 |
  | all_day_flag | 全天 |
  | duration_minutes | 时长 |
  | **biz_type** | 多态挂载：CUSTOMER / OPPORTUNITY / LEAD / TICKET / CONTRACT / QUOTE / NONE |
  | **biz_id** | 挂载对象 ID |
  | customer_id | 冗余客户 ID（便于按客户查询，非挂载对象时也回填） |
  | customer_name | 冗余客户名 |
  | owner_id / owner_name | 负责人 |
  | location | 地点 |
  | join_url | 线上会议链接 |
  | meeting_platform | 会议平台 |
  | result_summary | 结果纪要（完成时填） |
  | next_action | 后续动作 |
  | complete_time | 完成时间 |
  | overdue_flag | 是否逾期（TASK 用） |
  | attachment_url | 附件 |
  | follow_up_id | 关联生成的跟进记录（完成活动可自动生成跟进） |
  | + 审计列 | |

  索引：`idx_biz(tenant_id, biz_type, biz_id)`、`idx_customer(tenant_id, customer_id)`、`idx_owner_time(owner_id, start_time)`、`idx_status_time(tenant_id, status, start_time)`

### FR-2 参与人
- FR-2.1 新增 `crm_activity_participant`：
  ```
  participant_id, tenant_id, activity_id
  participant_type   USER 内部用户 / CONTACT 客户联系人 / LEAD 线索联系人
  participant_id_ref 参与人 ID
  participant_name
  is_organizer_flag  是否组织者
  acceptance_status  NONE 未响应 / ACCEPTED 接受 / DECLINED 拒绝 / TENTATIVE 待定
  response_time
  attend_flag        实际是否出席（活动后回填）
  remark
  + 审计列
  ```
- FR-2.2 内部用户参与时，活动出现在其日历中
- FR-2.3 客户联系人参与时，`acceptance_status` 由销售代为记录（不做对外邀请邮件的自动回执，见 §9-4）

### FR-3 提醒
- FR-3.1 提醒配置：提前 N 分钟（可多个，如 1440 / 30）
- FR-3.2 提醒渠道：站内 + 邮件（走批次 A SYS-01）
- FR-3.3 提醒发送由内置任务扫描（批次 A SYS-02 纳管）
- FR-3.4 活动取消或改期时，未发送的提醒同步取消或重排
- FR-3.5 存储方式见 §9-2（独立表 or JSON 字段）

### FR-4 多态挂载与联动
- FR-4.1 从客户/商机/线索/工单/合同详情页均可新建活动，自动带入 `biz_type` + `biz_id` + `customer_id`
- FR-4.2 活动完成时可选择自动生成一条 `crm_follow_up`（内容取 `result_summary`），保持跟进记录的连续性
- FR-4.3 活动完成时更新挂载对象的 `last_follow_up_time`（客户/商机已有该字段）
- FR-4.4 `next_action` 可一键创建下一个活动

### FR-5 日历与列表视图
- FR-5.1 日历接口：`GET /crm/activity/calendar?start=&end=&ownerId=`，返回该时段活动
- FR-5.2 前端用已有 `@fullcalendar/*` 渲染（月/周/日视图），支持拖拽改期
- FR-5.3 列表视图：按类型/状态/负责人/客户/时间范围筛选
- FR-5.4 「我的活动」视图：今日待办、本周安排、逾期未完成
- FR-5.5 团队视图：管理者按数据权限查看下属活动

### FR-6 客户 360 时间线
- FR-6.1 客户详情页时间线**同时聚合**：活动（`crm_activity`）+ 跟进（`crm_follow_up`）+ 商机阶段变更 + 报价 + 回款 + 工单
- FR-6.2 复用 OA 侧 `oa_trace_event` + `/oa/timeline` 的成熟模式，在 CRM 侧建 `crm_trace_event`（或直接查询聚合，见 §9-5）
- FR-6.3 时间线支持按类型筛选

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `crm_activity` |
| 新增 | `crm_activity_participant` |
| 新增（可选） | `crm_activity_reminder`（§9-2） |
| 新增（可选） | `crm_trace_event`（§9-5） |
| 保留 | `crm_follow_up`（并行，不删） |

`DB/05.cloudflow-crm.sql`：17 → 19~21 表

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| 数据权限 | 活动按 `owner_id` + 现有 `sys_role` 数据权限过滤；不可越权查他人活动 |
| 性能 | 日历接口单人单月 < 200ms；团队视图分页 |
| 时区 | 统一服务器时区（与项目现状一致） |
| 提醒可靠性 | 提醒走 SYS-01 的 outbox 机制；活动改期时旧提醒必须取消（防误提醒） |
| 多态完整性 | `biz_type` + `biz_id` 无外键约束（多态），需应用层校验对象存在 |
| 与 OA 日程口径 | 字段命名与 `oa_schedule_event` 对齐（§9-1），避免两套模型 |
| 冲突检测 | 同一用户同一时段多个活动时提示冲突（不强制阻止） |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 三种活动类型均可创建、编辑、完成、取消 |
| AC-2 | 五种 `biz_type` 挂载均正确；从各业务详情页新建自动带入关联 |
| AC-3 | 参与人可添加内部用户与客户联系人；`acceptance_status` 四态可记录 |
| AC-4 | 内部用户参与的活动出现在其日历中 |
| AC-5 | 提醒按提前分钟数正确发出（站内 + 邮件） |
| AC-6 | **活动改期后旧提醒被取消，按新时间重排；活动取消后不再提醒** |
| AC-7 | 活动完成时可自动生成 `crm_follow_up`，并更新客户 `last_follow_up_time` |
| AC-8 | `next_action` 可一键创建下一个活动并带入关联 |
| AC-9 | 日历视图月/周/日三种模式正确；拖拽改期生效 |
| AC-10 | 「我的活动」正确区分今日待办/本周安排/逾期未完成 |
| AC-11 | 客户 360 时间线同时展示活动与跟进，可按类型筛选 |
| AC-12 | 数据权限：普通销售看不到他人活动；管理者按数据权限可见下属 |
| AC-13 | 同一用户同一时段创建第二个活动时提示冲突 |
| AC-14 | 挂载不存在的业务对象时被拒绝 |
| AC-15 | 移动端可查看与完成活动（配合批次 G INT-03） |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A SYS-01 消息中心** | 提醒发送；强依赖 |
| **批次 A SYS-02 任务平台** | 提醒扫描任务 |
| `@fullcalendar/*`（已有） | 日历视图 |
| 现有 `sys_role` 数据权限 | 活动可见范围 |
| 批次 G INT-03 移动端 | 移动端活动管理（弱依赖） |
| 批次 F OA-07 会议深化 | 字段口径对齐（§9-1） |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **与 OA 日程/会议模型重复**（`oa_schedule_event` + `oa_meeting_*` 已有类似能力） | §9-1 待确认。核心判断：CRM 活动是"客户互动"，OA 日程是"内部安排"，两者受众与字段差异大，但**必须对齐字段命名与状态取值**，避免出现两套不可互通的模型 |
| 提醒误发（改期后旧提醒仍发） | AC-6 专项验证；提醒记录需与活动版本关联 |
| 活动与跟进两套记录导致用户困惑"该记哪个" | 产品引导：活动是"计划要做的事"，跟进是"做完的记录"；活动完成自动生成跟进（FR-4.2）降低双录成本 |
| 多态挂载无外键，数据可能悬挂（关联对象被删） | 应用层校验 + 删除业务对象时级联处理或标记；查询时容错 |
| 日历视图数据量大时性能问题 | 按时间范围 + owner 索引；团队视图分页 |

## 9. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | **CRM 活动与 OA 日程/会议是否合并** | 建议**不合并但对齐**：CRM 活动挂客户、OA 日程挂内部事务，受众不同；但 `status` 取值、`acceptance_status` 取值、提醒配置结构必须一致（批次 F OA-07 会改 `oa_meeting_attendance` 加 `acceptance_status`，两边用同一套取值）。若后续确认可合并，再评估收敛 |
| 2 | 提醒存独立表还是 JSON 字段 | 建议**独立表** `crm_activity_reminder`（`activity_id, remind_minutes_before, channel, sent_flag, send_time, message_record_id`）。理由：需要记录发送状态与关联消息记录，JSON 里做不了状态管理与索引查询 |
| 3 | 周期性活动是否需要 | 本期不做。若有"每周客户例会"需求，需引入 RRULE 与实例展开，复杂度高；建议先手工创建多条 |
| 4 | 客户联系人的接受状态如何获取 | 本期由销售代为记录（手工）。自动回执需对外发邮件带链接，属 CRM-02 营销能力范畴，后续评估 |
| 5 | 客户 360 时间线用聚合查询还是 `crm_trace_event` 表 | 建议先用**聚合查询**（各表按时间 union），避免维护冗余事件表；若性能不足再引入 `crm_trace_event`（可参考 OA 的 `oa_trace_event` 实现） |
