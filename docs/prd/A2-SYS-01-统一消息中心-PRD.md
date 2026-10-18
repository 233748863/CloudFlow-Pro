# PRD：统一消息中心

| 项 | 内容 |
| --- | --- |
| 条目编号 | SYS-01（= INT-01，同一件事） |
| 所属批次 | 批次 A（第 2 项） |
| 对标依据 | `docs/benchmark/05-system-系统治理对标.md`、`docs/benchmark/07-integration-集成与前端体验对标.md` |
| 优先级 | P0 —— **本轮头号跨模块阻塞点** |
| 预估工作量 | L+（含全部存量收口） |
| 版本 | v2 · 2026-08-31（已按三项决策更新） |
| 已定决策 | ① 发送链路：**SDK 直写 `outbox_event`，auth 统一消费投递**；② 渠道范围：**本批只实现站内渠道，邮件与短信均留适配抽象不实现**（2026-08-31 更新决策）；③ 收口范围：**本批一次做完全部存量收口** |

## 1. 背景与目标

### 1.1 为什么是头号优先级

四个已规划条目直接卡在没有统一消息通道上：

| 被阻塞条目 | 卡点 |
| --- | --- |
| CRM-02 营销活动闭环 | 群发邮件无发送通道 |
| OA-03 询价比价 | 供应商询价邀请无法外发 |
| INT-02 企业 IM 集成 | 待办卡片推送无底座 |
| INT-07 消息中心前端收口 | 后端不统一，前端无法收口 |

同时，现状是**六套并行的通知实现**（见 2.1），继续叠加新功能会让这笔债越滚越大。

### 1.2 目标

1. 建立统一消息模型与渠道适配层，业务方只调一个发送接口
2. 支持站内、邮件、短信三类渠道（企业 IM 由 INT-02 接入，本期只预留渠道类型）
3. 发送可靠（依赖已有 `outbox_event` 事务发件箱）、可追溯（发送记录与状态）、可治理（模板、订阅、免打扰）
4. 存量六套通知实现逐步收口（本期完成模型与接口，收口分阶段）

### 1.3 非目标
- 不做企业 IM 具体对接（INT-02 负责）
- 不做营销级群发编排（CRM-02 负责，本期只提供发送能力）
- 不引入独立消息中间件服务（novu 等）

## 2. 现状基线（实测，2026-08-31）

### 2.1 六套并行的通知实现

| # | 实现 | 载体 | 问题 |
| --- | --- | --- | --- |
| 1 | OA 公告 | `oa_announcement`(19列) + `oa_announcement_read` | 有 scope_type/scope_value 范围投递、is_top 置顶、expire_time —— 功能最完整 |
| 2 | 工作流通知 | `wf_notification_config`(11列) + `wf_notification_log`(14列) | 已有 event_type / notify_channel / template_id / recipient_type 概念，**最接近目标模型** |
| 3 | 站内通知 | `wf_notice`(14列) | **表名前缀与拥有者不一致**：表由 OA 独占读写，却用 `wf_` 前缀。<br>**M0 排查修正**：不存在跨服务直接读表 —— workflow 只发 `SystemNoticeDispatchEvent` 到 outbox，OA 消费后落库。**现有链路已是 outbox 事件流形态**，接近 A2 目标架构。详见 `A2-存量引用点排查.md` §1 修正一 |
| 4 | HR 自助消息 | `hr_self_service_message`(11列) | 独立一套，有 category / link_url / read_flag |
| 5 | CRM 通知 | `CrmNotificationController` 5 个 dispatch 接口 + `CrmNotificationServiceImpl` | 无表，两个 `@Scheduled` 定时推送（9点日报、每小时工单 SLA） |
| 6 | 安全通知 | `LoginRiskNoticeService`、`SecurityChangeNoticeService` | 走 `SystemNoticeDispatchEvent` 事件 |

### 2.2 已有可复用资产

| 资产 | 说明 |
| --- | --- |
| `outbox_event`(15列) | 事务发件箱，含 `status`/`retry_count`/`next_retry_at`/`locked_by`/`locked_until`/`last_error`。**天然适配"业务提交后可靠发消息"**，是本期发送可靠性的现成底座 |
| `SystemNoticeCreatedEvent` / `SystemNoticeDispatchEvent` | 已有事件模型，字段：`tenantId, recipientId, senderId, senderName, title, content, type` |
| `SystemNoticeDispatchEventConsumer` | OA 侧已有消费者 |
| WebSocket 推送 | `NotificationWebSocketHandler`（OA 与 workflow 各一份）+ `NotificationAuthHandshakeInterceptor` |
| `cloudflow-common-*` | 已有 16 个公共子模块，新增一个符合现有结构 |
| 前端 | `UnifiedMessageBell.tsx` 已存在（说明收口已在做），另有 `AnnouncementBell` / `NoticeBell` 并存 |

### 2.3 完全缺失

- **邮件发送**：全仓无 `JavaMailSender` / `MailSender` 痕迹
- **短信发送**：全仓无短信客户端痕迹
- 渠道配置表、模板表、统一发送记录表、用户订阅与免打扰

## 3. 范围

### 3.1 做
1. 新建 `cloudflow-common-message` 公共模块（含发送 SDK）
2. 五张表：渠道配置、消息模板、发送记录、用户订阅、短信验证码
3. **发送链路**：SDK 直写 `outbox_event`（与业务同事务）→ auth 统一消费 → 调渠道投递
4. 渠道适配层：
   - **站内**（WebSocket + 落库）—— **本批唯一实现的渠道**
   - **邮件**（SMTP）—— 本批**只做适配接口与配置字段，不接实际 SMTP**（2026-08-31 决策：无可用 SMTP 账号）
   - **短信** —— 本批只做适配接口与表字段，不接供应商
   - 企业 IM / Webhook —— 只做渠道类型预留（INT-02 负责实现）
   - **策略模式必须做扎实**：本批无任何外部渠道实现，适配层的正确性只能靠"新增一个实现类即可接入"来验证（见 AC-9C 的调整）
5. 统一发送接口（异步走 outbox + 同步直发两种模式）
6. 模板渲染与参数校验
7. 用户订阅与免打扰
8. 管理端接口：渠道、模板、发送记录查询与重发
9. 站内消息统一查询接口
10. **全部存量收口**（见 3.2，本批内完成）

### 3.2 存量收口（**已定为本批范围内一次做完**）

项目未上线，直接改建表 SQL，不做数据迁移。

| # | 存量 | 处理 | 影响面 |
| --- | --- | --- | --- |
| 1 | `wf_notice` + **两套** `ISysNoticeService`（OA 6 方法落库查询 / workflow 1 方法只发事件） | **删表 + 下线实体**，站内消息统一到 `sys_message_record` | **M0 实测 32 个 Java 文件引用**，其中 **21 个业务调用方**需改调 SDK（OA 9 + workflow 12）。这是本条目主要工作量，清单见 `A2-存量引用点排查.md` §2.1 |
| 2 | `hr_self_service_message`（11列） | **删表**，收口到 `sys_message_record`（`category`→`category`，`link_url` 保留，`summary`→`content`） | HR `HrSelfServiceMessage` 实体与 Mapper、ESS 门户相关接口 |
| 3 | `wf_notification_log`（14列） | **删表**，收口到 `sys_message_record` | workflow 通知发送与查询逻辑 |
| 4 | `wf_notification_config`（11列） | **删表**，收口到 `sys_message_template` + `sys_message_subscribe` | `WfNotificationConfig` 实体 + Mapper + `NotificationServiceImpl` + `P4Entities.java`（聚合文件，删时需确认其他实体不受影响）。<br>⚠️ **`NotificationConfigDTO` 不在范围内** —— M0 实测它服务于 `wf_deploy_notification`（流程发布通知，独立表不删），与本次收口无关 |
| 5 | CRM `CrmNotificationController` 5 个 dispatch 接口 + `CrmNotificationServiceImpl` | 改为调统一发送 SDK；内含的 2 个 `@Scheduled`（9点日报、每小时工单SLA）改由 SYS-02 纳管 | CRM 通知服务 |
| 6 | 安全通知：`LoginRiskNoticeService`、`SecurityChangeNoticeService`、`SystemNoticeDispatchEvent` + `SystemNoticeDispatchEventConsumer` | 消费者改为调统一发送 SDK；事件模型可保留（作为业务事件）或直接改为 SDK 调用 | auth 两个 Service、common-core 两个事件类、OA 侧消费者 |
| 7 | 前端铃铛 | **M0 实测收口已完成**：`MainLayout` 只用 `HeaderAnnouncementBell`，而它是兼容层内部已渲染 `UnifiedMessageBell`。`AnnouncementBell` / `NoticeBell` **无任何使用点**（仅在 `index.ts` 导出） | 本期只需删除两个无用组件 + 清理导出（零风险）。另需改 `services/api/notice.ts` 的 4 个端点指向消息中心 |
| — | `oa_announcement` + `oa_announcement_read` | **保留不动**。公告是"内容发布"（范围投递、置顶、有效期、已读统计），与"消息投递"是不同语义；但发布时**额外产生站内消息**通知到人 | — |

**收口前置动作（M0）—— ✅ 已完成（2026-08-31）**

排查结果见 **`A2-存量引用点排查.md`**。四处修正了本 PRD 的假设：
1. 现有已是 outbox 事件流，**无跨服务读表**（风险低于原估）
2. workflow 与 OA **各有一套** `ISysNoticeService`，职责不同需分别处理
3. `NotificationConfigDTO` **不在收口范围**（服务于发布通知独立表）
4. 前端铃铛收口**已完成**，只需清理 2 个无用组件

**净结论**：风险低于原估，但**工作量高于原估**（21 个业务调用方需逐个改，原 PRD 只写"改 6 处实现"）。另新增一项原 PRD 未提及的工作：`07.cloudflow-demo-seed.sql` 有约 2500+ 引用行，**必须用 `scripts/generate-demo-seed.ps1` 重新生成，不能手改**。

推荐的九步收口顺序见排查文档 §6（先建新模型 → 按服务逐个切换 → 最后删表）。

### 3.3 不做
| 项 | 原因 |
| --- | --- |
| 短信具体供应商对接 | 已定本批不做。四个被阻塞条目（CRM-02 群发走邮件、OA-03 询价走邮件、INT-02 走 IM、INT-07 走站内）均不强依赖短信；FR-6 短信验证码当前登录流程也不使用 |
| 企业 IM 对接 | INT-02 负责，本批只留渠道类型 |
| 营销级群发编排 | CRM-02 负责 |
| 独立消息中间件（novu 等） | 复用现有 `outbox_event` |

## 4. 角色与权限

| 角色 | 权限码 | 可做 |
| --- | --- | --- |
| 管理员 | `system:message:channel:*` | 渠道配置增删改查（含密钥，写操作需审计） |
| 管理员 | `system:message:template:*` | 模板增删改查 |
| 管理员 | `system:message:record:list` / `:resend` | 发送记录查询、失败重发 |
| 全部登录用户 | `system:message:mine:list` / `:read` | 查自己的站内消息、标记已读 |
| 全部登录用户 | `system:message:subscribe:*` | 管理自己的订阅与免打扰 |
| 内部服务 | `@Inner` | 发送消息 |

## 5. 功能需求

### FR-1 渠道管理
- FR-1.1 渠道类型：`INTERNAL`（站内）/ `EMAIL` / `SMS` / `WECOM` / `DINGTALK` / `FEISHU` / `WEBHOOK`
  - **本批实现**：仅 `INTERNAL`
  - **本批只做适配接口 + 配置字段，不接实际服务**：`EMAIL`（SMTP 配置字段齐、连通性测试接口留桩，拿到 SMTP 账号后补一个 `EmailChannelSender` 实现即可启用）、`SMS`
  - **本批只做类型预留**：`WECOM` / `DINGTALK` / `FEISHU` / `WEBHOOK`（INT-02 实现）
  - **未实现渠道的行为**：调用时返回明确错误"渠道未配置或未实现"，记录 `send_status=FAILED` + `error_msg`，**不静默丢弃也不抛异常崩溃**
- FR-1.1B 渠道适配层用策略模式，新增渠道实现只需注册一个 `MessageChannelSender` 实现，不改发送主流程
- FR-1.2 同一类型可配多个渠道（如两家短信供应商），按 `priority` 选主，主渠道失败可降级到次渠道
- FR-1.3 渠道级限流：`rate_limit_per_minute`
- FR-1.4 渠道连通性测试：`POST /channel/{id}/test`，发一条测试消息到指定接收方
- FR-1.5 **密钥字段加密存储**（`api_secret_encrypted`），列表与详情接口返回时脱敏（只回显后 4 位），日志不打印

### FR-2 模板管理
- FR-2.1 模板字段：`template_code`（业务方引用的唯一码）、`template_name`、`channel_type`、`title_template`、`content_template`、`params_declare`（JSON 声明参数名与是否必填）、`status`、`version`
- FR-2.2 占位符语法：`{{paramName}}`
- FR-2.3 发送时校验：`params_declare` 里必填参数缺失则拒绝发送并记失败原因
- FR-2.4 模板预览：传参数返回渲染结果
- FR-2.5 同一 `template_code` 可对应多渠道各一份模板（短信要短、邮件可长）

### FR-3 统一发送
- FR-3.1 发送入口（内部接口）：
  ```
  POST /inner/message/send
  {
    templateCode, channelTypes[],
    receivers[{receiverType(USER/PHONE/EMAIL/ROLE/DEPT), receiverId, receiverAddr}],
    params{}, bizType, bizId, sendMode(SYNC/ASYNC), scheduleTime?
  }
  ```
- FR-3.2 `sendMode=ASYNC`（默认，**已定链路**）：
  1. 业务方调 `cloudflow-common-message` 的 SDK 方法
  2. SDK **在业务当前事务内**直接写 `outbox_event`（各服务连同一库，无需 RPC）
  3. 业务事务提交后，auth 侧统一消费者拉取 outbox 记录
  4. auth 调渠道适配层投递，写 `sys_message_record`
  - **关键收益**：业务事务回滚则 outbox 记录一并回滚，消息不会误发；渠道密钥只在 auth 一处持有，不下发到 5 个服务
  - **需关注**：auth 是投递单点，消费吞吐需监控（见 NFR 与风险）
- FR-3.2B outbox 消费者复用现有 `OutboxScheduler` 机制（DB 行级 claim + `locked_by`/`locked_until`），按 `aggregate_type='MESSAGE'` 区分消息类事件
- FR-3.3 `sendMode=SYNC`：SDK 直调 auth 的 `/inner/message/send-sync`（仅用于短信验证码等必须即时且不能依赖事务的场景）
- FR-3.4 `receiverType=ROLE/DEPT` 时展开为具体用户（展开上限可配，超限拒绝并提示改用公告）
- FR-3.5 发送前依次校验：模板存在且启用 → 参数完整 → 用户订阅未关闭 → 不在免打扰时段 → 渠道限流未超 → 未命中去重
- FR-3.6 去重：同一 `template_code + receiver + bizId` 在可配窗口内（默认 5 分钟）只发一次
- FR-3.7 失败重试：站内不重试；邮件与短信按渠道配置重试（次数与间隔），最终失败落 `send_status=FAILED` + `error_msg`
- FR-3.8 定时发送：`scheduleTime` 非空时延迟到指定时间发送（依赖 SYS-02 任务平台）

### FR-4 站内消息
- FR-4.1 站内消息落 `sys_message_record` 并通过现有 WebSocket 实时推送
- FR-4.2 查询接口：`GET /system/message/mine`，支持按分类（待办/抄送/公告/系统/业务提醒）、已读状态、时间范围筛选，分页
- FR-4.3 未读数接口：`GET /system/message/mine/unread-count`，按分类返回
- FR-4.4 标记已读：单条 / 批量 / 按分类全部已读
- FR-4.5 消息带 `link_url`，前端点击可跳转到业务详情

### FR-5 订阅与免打扰
- FR-5.1 用户可按「消息类型 × 渠道」开关订阅（如"工单 SLA 提醒不要短信"）
- FR-5.2 免打扰时段：`quiet_start` / `quiet_end`，时段内非紧急消息延迟到时段结束后发送
- FR-5.3 强制消息：模板可标记 `force_send`（如安全告警、密码变更），忽略订阅与免打扰
- FR-5.4 默认策略：新用户默认全部订阅开启、无免打扰

### FR-6 短信验证码（**本批只做表与逻辑，实际发送待短信渠道接入后可用**）
- FR-6.1 独立表 `sys_sms_code`，**存哈希不存明文**
- FR-6.2 限制：同一手机号同一场景 60 秒内不可重发、单日上限可配、验证码有效期可配（默认 5 分钟）
- FR-6.3 校验成功后立即置 `used_flag`，防重放
- FR-6.4 记录 `send_ip`，同一 IP 频繁请求触发限流（复用 `sys_api_ratelimit_rule`）
- FR-6.5 **本批交付状态**：表结构、生成与校验逻辑、限流与防重放全部实现；发送环节调短信渠道适配接口，因本批无供应商实现，实际调用返回"渠道未配置"。接入供应商后无需改本模块代码即可启用

### FR-7 管理端
- FR-7.1 发送记录查询：按渠道、状态、模板、业务类型、时间、接收人筛选
- FR-7.2 失败重发：单条或批量重发，重发产生新记录并关联原记录
- FR-7.3 发送统计：按渠道与模板的成功率、失败原因 TOP

## 6. 数据模型

### 6.1 `sys_message_channel`
`channel_id` PK / `tenant_id` / `channel_type` / `channel_code` / `channel_name` / `provider` / `signature`（短信签名）/ `api_key` / `api_secret_encrypted` / `endpoint` / `smtp_host` / `smtp_port` / `smtp_ssl_flag` / `smtp_username` / `smtp_password_encrypted` / `from_address` / `from_name` / `callback_url` / `priority` / `rate_limit_per_minute` / `retry_count` / `retry_interval_seconds` / `status` / `remark` + 审计列

唯一索引 `uk_tenant_code(tenant_id, channel_code)`

### 6.2 `sys_message_template`
`template_id` PK / `tenant_id` / `template_code` / `template_name` / `channel_type` / `title_template` / `content_template`(TEXT) / `params_declare`(JSON) / `biz_module` / `force_send_flag` / `dedupe_window_seconds` / `status` / `version` / `remark` + 审计列

唯一索引 `uk_tenant_code_channel(tenant_id, template_code, channel_type)`

### 6.3 `sys_message_record`
`record_id` PK / `tenant_id` / `trace_id` / `template_code` / `channel_type` / `channel_id` / `receiver_type` / `receiver_id` / `receiver_addr`（邮箱手机脱敏存储或加密）/ `receiver_name` / `title` / `content`(TEXT) / `category`（TODO/CC/ANNOUNCEMENT/SYSTEM/BIZ_REMINDER）/ `biz_type` / `biz_id` / `link_url` / `send_status`（PENDING/SENDING/SUCCESS/FAILED/CANCELLED/SKIPPED）/ `skip_reason`（UNSUBSCRIBED/QUIET_HOURS/DEDUPED）/ `retry_count` / `error_msg` / `send_time` / `read_flag` / `read_time` / `resend_from_id` / `outbox_event_id` + 审计列

索引：`idx_receiver_read(tenant_id, receiver_id, read_flag, create_time)`、`idx_status_time(send_status, create_time)`、`idx_biz(biz_type, biz_id)`、`idx_trace(trace_id)`

**数据量预警**：这是全系统最大写入表之一，需配归档策略（可复用现有 `sys_audit_archive_policy` 模式）

### 6.4 `sys_message_subscribe`
`subscribe_id` PK / `tenant_id` / `user_id` / `message_category` / `channel_type` / `enabled_flag` / `quiet_start`(TIME) / `quiet_end`(TIME) + 审计列

唯一索引 `uk_user_cat_channel(tenant_id, user_id, message_category, channel_type)`

### 6.5 `sys_sms_code`
`code_id` PK / `tenant_id` / `phone` / `code_hash` / `biz_scene` / `expire_time` / `used_flag` / `used_time` / `send_ip` / `retry_count` / `create_time`

索引 `idx_phone_scene(phone, biz_scene, create_time)`

### 6.6 表删除与改动（本批内完成）

| 操作 | 对象 | 涉及脚本 |
| --- | --- | --- |
| 删除 | `wf_notice`、`wf_notification_log`、`wf_notification_config` | `DB/02.cloudflow-workflow.sql`（46→43 表） |
| 删除 | `hr_self_service_message` | `DB/03.cloudflow-hr.sql`（86→85 表） |
| 保留 | `oa_announcement` + `oa_announcement_read` | `DB/04.cloudflow-oa.sql` 不变 |
| 新增 | 五张新表 | `DB/01.cloudflow-common.sql`（32→37 表） |
| 净变化 | 244 → 245 表（删 4 增 5） | — |

**同步改动（M0 排查后补充）**：
- `06.cloudflow-business-seed.sql`：清理被删表的 INSERT/DELETE（`wf_notice` 5 处 INSERT + 6 处 DELETE、`wf_notification_log` 11 处、`wf_notification_config` 7 处、`hr_self_service_message` 3 处）；新增消息模板种子数据
- **字典 `wf_notice_type`**（"通知"/"公告"两项，出现 4 处）：**不直接删**。消息中心仍需分类字典，建议改名为 `sys_message_category` 并扩展取值（待办/抄送/公告/系统/业务提醒）
- **`07.cloudflow-demo-seed.sql`：必须用 `scripts/generate-demo-seed.ps1` 重新生成**（`wf_notice` 约 60 处 INSERT，三张表合计约 2500+ 引用行，手改不可行）；生成脚本本身可能也需同步改

## 7. 接口设计

**服务归属**：模型与管理端在 `cloudflow-auth`；发送 SDK 在 `cloudflow-common-message`，各服务通过 SDK 本地调用或走 auth 的 `@Inner` 接口

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/system/message/channel` | `system:message:channel:{list,add,edit,remove}` |
| POST | `/system/message/channel/{id}/test` | `system:message:channel:edit` |
| GET/POST/PUT/DELETE | `/system/message/template` | `system:message:template:{list,add,edit,remove}` |
| POST | `/system/message/template/preview` | `system:message:template:list` |
| GET | `/system/message/record` | `system:message:record:list` |
| POST | `/system/message/record/{ids}/resend` | `system:message:record:resend` |
| GET | `/system/message/record/statistics` | `system:message:record:list` |
| GET | `/system/message/mine` | `system:message:mine:list` |
| GET | `/system/message/mine/unread-count` | `system:message:mine:list` |
| PUT | `/system/message/mine/read` | `system:message:mine:read` |
| GET/PUT | `/system/message/subscribe/mine` | `system:message:subscribe:list/edit` |
| POST | `/inner/message/send-sync` | `@Inner`（同步直发，仅验证码等场景） |
| POST | `/sms/code/send` | 匿名（限流 + 图形验证码前置，复用现有 `SliderCaptcha`） |
| POST | `/sms/code/verify` | 匿名（限流） |

**注意**：异步发送**不走 HTTP 接口**，业务方直接用 `cloudflow-common-message` 的 SDK 写 `outbox_event`（FR-3.2）。只有同步直发才需要 `@Inner` 接口。

## 8. 非功能需求

| 项 | 要求 |
| --- | --- |
| 可靠性 | 异步发送必须走 `outbox_event` 且与业务同事务，业务事务回滚则消息不发 |
| 幂等 | 同一 `outbox_event_id` 重复投递只产生一条成功记录 |
| **投递吞吐** | auth 是统一投递方，需监控消费积压（`outbox_event` 中 `aggregate_type='MESSAGE'` 且 `status=PENDING` 的堆积量）；积压超阈值告警 |
| **投递单点** | auth 挂掉时消息只是堆积在 outbox 不丢失，恢复后继续投递（这是选此链路的可靠性优势）；但需保证 auth 多实例部署，且 outbox 的 `locked_by`/`locked_until` 保证多实例不重复投递 |
| 性能 | 单条站内消息发送 P95 < 200ms；批量展开（ROLE/DEPT）异步处理 |
| 密钥安全 | 渠道 `api_secret` / SMTP 密码加密存储；接口返回脱敏；日志不打印 |
| 验证码安全 | 存哈希、有效期、一次性、重发间隔、单日上限、IP 限流、图形验证码前置 |
| 接收方隐私 | `receiver_addr` 手机与邮箱在发送记录中脱敏展示（`138****8000`），完整值加密存储 |
| 外发内容 | 模板渲染结果外发前做基本转义，防止参数注入伪造邮件内容 |
| 限流 | 渠道级 + 用户级 + IP 级三层 |
| 数据量 | `sys_message_record` 配归档策略，默认保留 6 个月 |

## 9. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 通过 SDK 发站内消息，记录状态为 SUCCESS，WebSocket 实时推送到达 |
| AC-1B | 指定 `EMAIL` 或 `SMS` 渠道发送时，返回明确的"渠道未实现"错误，记录 `send_status=FAILED` + `error_msg`，**不崩溃不静默丢弃** |
| AC-2 | 业务事务回滚时 `outbox_event` 记录一并回滚，消息不发出（同事务语义验证） |
| AC-2B | auth 停机期间业务方发送的消息堆积在 outbox 不丢失；auth 恢复后自动投递成功 |
| AC-2C | auth 双实例部署时同一 outbox 记录只投递一次（`locked_by`/`locked_until` 验证） |
| AC-3 | 模板必填参数缺失时拒绝发送，记录状态 FAILED 且 `error_msg` 指明缺失参数名 |
| AC-4 | 用户关闭某类型短信订阅后，该类型短信不发，记录状态 SKIPPED + `skip_reason=UNSUBSCRIBED` |
| AC-5 | 免打扰时段内非强制消息延迟发送；`force_send_flag=1` 的消息立即发送 |
| AC-6 | 同一 `template_code + receiver + bizId` 在去重窗口内重复调用只发一次，第二次记 SKIPPED + `DEDUPED` |
| AC-7 | 渠道配置接口返回的 `api_secret` 已脱敏；数据库中为加密值；应用日志中无明文 |
| AC-8 | 短信验证码：60 秒内重发被拒；验证成功后再次使用同一码被拒；超期被拒 |
| AC-9 | 同类型多渠道时按 `priority` 选主；主渠道失败自动降级到次渠道（**本批用两个站内渠道配置模拟验证**，因无外部渠道可用） |
| AC-9B | 邮件与短信渠道的适配接口已定义、配置字段齐备、配置可存可测（连通性测试返回"未实现"） |
| AC-9C | **策略模式验证（本批重点）**：写一个最简 `MockChannelSender` 实现类并注册，无需改动发送主流程即可通过它发送成功。这是本批唯一能验证适配层正确性的手段 |
| AC-9D | 拿到 SMTP 账号后，**只需新增 `EmailChannelSender` 一个类**即可启用邮件（不改表、不改发送流程、不改模板机制）—— 设计评审时确认 |

**存量收口验收（本批范围内）**

| # | 验收项 |
| --- | --- |
| AC-10 | 四表已从建表脚本删除；`06` 中相关 INSERT/DELETE 已清理；**`07.cloudflow-demo-seed.sql` 已用生成脚本重新生成** |
| AC-10B | **21 个业务调用方全部改调 SDK**（OA 9 个 + workflow 12 个，清单见排查文档 §2.1）；两套 `ISysNoticeService` 及 OA 的实体/Mapper/两个 Controller 已下线 |
| AC-10C | HR ESS 门户的自助消息功能改由 `sys_message_record` 承载，前端表现不变；两个写入方（`EmployeeContractExpireJob`、`HrWorkflowCallbackServiceImpl`）已改调 SDK |
| AC-10D | workflow 的 `WfNotificationLog` / `WfNotificationConfig` 实体与 Mapper 已删除，`NotificationServiceImpl` 已改写；**`P4Entities.java` 内其他实体未受影响**（回归验证） |
| AC-10E | 字典 `wf_notice_type` 已改名为 `sys_message_category` 并扩展取值，消息分类展示正常 |
| AC-11 | CRM 5 个 dispatch 接口改为调统一发送 SDK；内含 2 个 `@Scheduled` 已交由 SYS-02 纳管 |
| AC-11B | `LoginRiskNoticeService`、`SecurityChangeNoticeService` 及 `SystemNoticeDispatchEventConsumer` 改为调统一发送 SDK |
| AC-12 | `UnifiedMessageBell` 展示全部分类消息与未读数，数据来自 `sys_message_record`；`services/api/notice.ts` 的 4 个端点已改指消息中心；`AnnouncementBell` / `NoticeBell` 两个无用组件与 `index.ts` 导出已删除 |
| AC-13 | 公告发布时额外产生站内消息，用户在消息中心可见 |
| AC-14 | 收口完成后全仓搜索 `wf_notice` / `wf_notification_` / `HrSelfServiceMessage` 无残留引用 |
| AC-15 | 全量回归：工作流待办通知、HR 提醒、CRM 跟进提醒、安全通知、公告五类场景端到端可用 |

## 10. 依赖与风险

### 10.1 依赖
| 依赖 | 说明 |
| --- | --- |
| `outbox_event` + `OutboxScheduler`（已有） | 异步发送底座，复用其 DB 行级 claim 机制 |
| SYS-02 任务平台 | FR-3.8 定时发送、免打扰延迟发送需要调度；**可先用现有 `@Scheduled` + `@DistributedJob` 实现，不强阻塞** |
| ~~邮件服务 SMTP~~ | **本批不做**（2026-08-31 决定：暂无可用 SMTP 账号）。适配接口与配置字段就绪，`spring-boot-starter-mail` 可暂不引入 |
| ~~短信供应商~~ | **本批不做**（已定）。适配接口就绪，后续接入无需改本模块 |
| SYS-07 代码生成器 | 五张表的 CRUD 由生成器产出（本批第 1 项已完成） |
| ~~收口前置排查（M0）~~ | ✅ **已完成**，见 `A2-存量引用点排查.md` |
| `scripts/generate-demo-seed.ps1` | 重新生成 `07.cloudflow-demo-seed.sql`（M0 新发现的依赖） |

### 10.2 风险

| 风险 | 应对 |
| --- | --- |
| **存量六套同时收口，回归面大（本批最大风险）** | ✅ M0 已完成排查。应对：① 按排查文档 §6 的九步顺序执行（先建新模型 → 按服务切换 → 最后删表）；② 每步独立提交便于回退定位；③ AC-15 五类场景端到端回归 |
| **21 个业务调用方需逐个改**（M0 实测，高于原估） | 这是本条目主要工作量。SDK 接口需设计得足够简单（一行替换 `sendNotice()`），降低改造成本与出错率 |
| ~~`wf_notice` 跨服务耦合影响面不清~~ | ✅ M0 已澄清：无跨服务读表，现有已是 outbox 事件流。风险低于原估 |
| **`07.cloudflow-demo-seed.sql` 约 2500+ 引用行**（M0 新发现） | 必须用 `scripts/generate-demo-seed.ps1` 重新生成；需先确认生成脚本能覆盖新表结构 |
| `P4Entities.java` 是聚合文件（M0 新发现） | 删两个通知实体时需确认该文件内其他实体不受影响（AC-10D） |
| auth 成为消息投递单点，消费积压 | outbox 天然不丢消息（AC-2B）；auth 多实例 + `locked_by` 防重（AC-2C）；积压量监控告警（NFR） |
| `sys_message_record` 写入量大成为性能瓶颈 | 配归档策略（默认保留 6 个月）；站内与外发是否分表留观察（§12-4） |
| 邮件发送量失控 | 渠道级限流 + 单日总量上限 + 发送量异常告警 |
| 手机号邮箱作为个人信息，明文存储合规风险 | 加密存储 + 展示脱敏（NFR） |
| 短信虽不实现，但表字段与验证码逻辑已建，可能被误认为可用 | AC-9B 明确要求返回"渠道未配置"的清晰错误；管理界面对未配置渠道的模板给出提示 |

## 11. 里程碑

> **收口阶段（M6-M9）的推荐执行顺序见 `A2-存量引用点排查.md` §6 的九步方案**（按服务逐个切换，每步可独立验证；删表必须最后做）。

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| ~~**M0**~~ | ✅ **已完成**：全仓排查四张待删表引用点，产出 `A2-存量引用点排查.md` | 清单已产出，四处修正已回写本 PRD |
| M1 | `cloudflow-common-message` 模块 + 五张表（SYS-07 生成）+ 渠道与模板管理接口 | AC-7 |
| M2 | 发送 SDK（写 outbox）+ auth 统一消费者 + 站内渠道 + WebSocket 推送 | AC-1（站内）、AC-2/2B/2C |
| M3 | 渠道适配层（策略模式）+ 邮件与短信适配接口留桩 + 降级 + 重试 + `MockChannelSender` 验证 | AC-1B/9/9B/9C/9D |
| M4 | 订阅、免打扰、去重、模板参数校验 | AC-3/4/5/6 |
| M5 | 短信验证码逻辑（表 + 生成校验 + 限流防重放） | AC-8 |
| M6 | 收口第一批：workflow 三表（`wf_notice` / `wf_notification_log` / `wf_notification_config`） | AC-10B/10D |
| M7 | 收口第二批：HR `hr_self_service_message` + CRM 5 个 dispatch + 安全通知 | AC-10C/11/11B |
| M8 | 收口第三批：前端三铃铛收口 + 公告联动站内消息 | AC-12/13 |
| M9 | 全量回归 + 残留引用扫描 | AC-10/14/15 |

## 12. 待确认

| # | 问题 | 状态 / 建议 |
| --- | --- | --- |
| 1 | ~~短信供应商用哪家~~ | **已定**：本批不做短信，只留适配抽象 |
| 2 | ~~发送 SDK 是本地调用还是走 `@Inner`~~ | **已定**：SDK 直写 `outbox_event`，auth 统一消费 |
| 3 | ~~存量收口放本批还是拆开~~ | **已定**：本批一次做完全部收口 |
| 4 | `oa_announcement` 是否也要收口 | **建议保留**（3.2 已说明理由）；仅在发布时联动产生站内消息 |
| 5 | `sys_message_record` 是否按站内/外发分表 | 本期单表 + 索引，量级观察后再定 |
| 6 | ~~SMTP 账号来源~~ | **已定**：本批不做邮件。**但这会连带阻塞 E5 营销群发（邮件是其唯一渠道）与 F5 询价邀请的邮件部分**，两者需等邮件渠道接入后才能完整交付。建议在批次 E 之前确定 SMTP 方案 |
| 7 | `SystemNoticeCreatedEvent` / `SystemNoticeDispatchEvent` 两个事件类是保留还是删除 | **M0 后建议直接下线**：SDK 已直写 outbox，`SystemNoticeDispatchEvent` + `SystemNoticeDispatchEventConsumer` 这一层变成多余的中转。21 个调用方本就要改，一并改成 SDK 更干净 |
| 8 | 字典 `wf_notice_type` 如何处理（M0 新发现） | 建议改名 `sys_message_category` 并扩展为五类取值（待办/抄送/公告/系统/业务提醒），不直接删 |
| 9 | 两套 `ISysNoticeService` 是否保留为兼容层（M0 新发现） | 建议**不保留**：项目未上线无兼容包袱，21 个调用方直接改成 SDK 调用比留兼容层干净 |
| 10 | `scripts/generate-demo-seed.ps1` 能否覆盖新表结构（M0 新发现） | 需确认；生成脚本本身可能也要改 |
