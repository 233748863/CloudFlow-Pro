# PRD：营销活动闭环（CRM-02）

| 项 | 内容 |
| --- | --- |
| 条目编号 | CRM-02 |
| 所属批次 | 批次 E（第 5 份，**依赖批次 A SYS-01 消息中心**） |
| 对标依据 | `docs/benchmark/03-crm-客户经营对标.md` |
| 优先级 | P1 |
| 预估工作量 | L |
| 版本 | v2 · 2026-08-31 |
| ⛔ **阻塞状态** | **本 PRD 当前被阻塞**。批次 A A2 已定"本批不做邮件渠道"（无可用 SMTP 账号），而**邮件是本 PRD 唯一的发送渠道**（短信也未接）。→ 见 §0 |

## 0. ⛔ 阻塞说明与建议拆分

**批次 A A2 的决策变更影响本 PRD**：A2 原计划实现邮件渠道，2026-08-31 决定本批只做站内渠道（无可用 SMTP 账号）。本 PRD 的群发、追踪、退订、ROI 归因**全部依赖邮件**。

### 建议拆成两段交付

| 段 | 内容 | 是否被阻塞 |
| --- | --- | --- |
| **E5-a 可先做** | 活动实体与效果计数字段、目标名单（含条件筛选、排除名单）、活动与线索/商机的 `campaign_id` 关联、**ROI 归因链路**（活动→线索→商机→赢单→回款）、活动效果报表框架 | **不阻塞** —— 这些不依赖发送能力。线索可手工录入并关联活动（如展会、线下活动场景），归因与 ROI 分析立即可用 |
| **E5-b 需等邮件** | `crm_mass_email` 群发、打开/点击追踪端点、退订链接与处理、发送类计数（sent/opened/clicked/bounced/unsubscribed） | **阻塞** —— 等 SMTP 方案确定并在 A2 补 `EmailChannelSender` 后再做 |

**E5-a 本身有独立价值**：`campaign_type` 已含 `EVENT` / `WEBINAR` / `EXHIBITION` 三类**非邮件营销活动**，这些场景的线索归因与 ROI 分析不需要发送能力。

**前置条件**：SMTP 方案需在批次 E 开始前确定（A2 的 §12-6 已记录该阻塞）。

## 1. 背景与目标

### 1.1 问题

CRM 完全没有营销概念。`crm_lead.source` 是自由文本，**无法回答"这条线索来自哪次活动"**，因此也算不出营销 ROI。

对标 EspoCRM 的营销四件套（AGPL-3.0，仅借鉴设计）：
- `Campaign`（34 字段）：**内建 14 个效果计数字段** + `revenue` + `budget` 做 ROI
- `TargetList`（16 字段）：目标名单，支持排除名单
- `MassEmail`：群发配置
- `CampaignLogRecord`：每次发送/打开/点击/退订都是一条日志，计数由日志聚合

### 1.2 目标
1. 营销活动实体 + 效果计数
2. 目标名单（含排除名单）
3. 邮件群发（走批次 A SYS-01 邮件渠道）
4. 效果日志与 ROI 归因（活动 → 线索 → 商机 → 回款）
5. 退订处理

### 1.3 非目标
- 不做短信营销（批次 A 决定本期不接短信供应商）
- 不做营销自动化旅程（Journey / Workflow 式的多步触发）
- 不做 A/B 测试
- 不做落地页与表单收集
- 不做社交媒体投放对接

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| 营销能力 | **完全没有** |
| `crm_lead.source` | 自由文本，无活动关联 |
| `crm_lead.campaign_id` | CRM-04 已预留字段 |
| `crm_customer.unsubscribe_flag` | CRM-04 已预留字段 |
| 消息中心 | **批次 A SYS-01 已交付**：`sys_message_channel`（含 EMAIL 渠道已实现）、`sys_message_template`、`sys_message_record`、SDK 直写 outbox |
| 邮件渠道 | 批次 A 已实现（SMTP） |
| 短信渠道 | 批次 A **只做适配抽象未接供应商** |

## 3. 范围

### 3.1 做
1. 新增 `crm_campaign`（活动 + 效果计数）
2. 新增 `crm_target_list` + `crm_target_list_member`
3. 新增 `crm_campaign_log`（效果日志）
4. 新增 `crm_mass_email`（群发任务）
5. 邮件群发（调 SYS-01）
6. 打开/点击追踪
7. 退订链接与处理
8. ROI 归因报表

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 短信营销 | 批次 A 未接短信供应商；渠道适配就绪后可低成本补上 |
| 营销自动化旅程 | 多步条件触发复杂度高，本期先做单次群发 |
| A/B 测试 | 基础闭环都没有，超前建设 |
| 落地页 / 表单收集 | 需对外 Web 能力，属 CRM-08 客户门户范畴 |
| 社交媒体投放 | 超出范围 |

## 4. 功能需求

### FR-1 营销活动
- FR-1.1 新增 `crm_campaign`：
  | 字段 | 说明 |
  | --- | --- |
  | campaign_id | PK |
  | tenant_id | 租户 |
  | campaign_code / campaign_name | 编码与名称 |
  | campaign_type | EMAIL 邮件 / EVENT 活动会议 / WEBINAR 线上研讨 / EXHIBITION 展会 / OTHER |
  | status | PLANNING 策划 / ACTIVE 进行中 / PAUSED 暂停 / COMPLETED 完成 / CANCELLED 取消 |
  | start_date / end_date | 起止日期 |
  | owner_id / owner_name | 负责人 |
  | description | 说明 |
  | **budget** | 预算 DECIMAL(14,2) |
  | **actual_cost** | 实际成本 DECIMAL(14,2) |
  | **revenue** | 带来收入 DECIMAL(14,2)（由归因计算回填） |
  | 效果计数（由日志聚合回填）： |
  | sent_count | 发送数 |
  | delivered_count | 送达数 |
  | opened_count | 打开数 |
  | clicked_count | 点击数 |
  | bounced_count | 退信数 |
  | unsubscribed_count | 退订数 |
  | lead_created_count | 产生线索数 |
  | opportunity_created_count | 产生商机数 |
  | won_opportunity_count | 赢单数 |
  | 计算字段（可存可算）： |
  | open_rate / click_rate / bounce_rate / unsubscribe_rate | 各率 DECIMAL(6,4) |
  | roi | ROI DECIMAL(10,4) = (revenue - actual_cost) / actual_cost |
  | + 审计列 | |

- FR-1.2 **计数字段落库而非每次聚合**（数据量大时聚合慢），由日志写入时增量更新或定时任务重算

### FR-2 目标名单
- FR-2.1 新增 `crm_target_list`：`list_id, tenant_id, list_code, list_name, description, member_count, opted_out_count, source_type(MANUAL 手工 / QUERY 条件筛选), query_condition(JSON), owner_id, status` + 审计列
- FR-2.2 新增 `crm_target_list_member`：`member_id, tenant_id, list_id, member_type(CUSTOMER/CONTACT/LEAD), member_id_ref, member_name, email, phone, opted_out_flag, add_time`
- FR-2.3 名单来源两种：
  - 手工：从客户/联系人/线索列表勾选加入
  - 条件筛选：按区域/行业/客户等级/线索评分等条件动态生成（CRM-04 的分层字段在此发挥价值）
- FR-2.4 活动可关联多个目标名单 + 多个**排除名单**（`crm_campaign_target_list` 关联表，含 `is_excluding_flag`）
- FR-2.5 实际发送对象 = 目标名单并集 - 排除名单 - 已退订 - 无邮箱

### FR-3 邮件群发
- FR-3.1 新增 `crm_mass_email`：`mass_email_id, tenant_id, campaign_id, subject, template_code, from_address, from_name, reply_to, scheduled_time, status(DRAFT/SCHEDULED/SENDING/SENT/CANCELLED), total_count, sent_count, failed_count, start_time, end_time` + 审计列
- FR-3.2 群发内容用批次 A 的 `sys_message_template`（EMAIL 渠道模板），支持个性化占位符（`{{contactName}}` / `{{companyName}}`）
- FR-3.3 发送走 SYS-01 的 SDK（写 outbox → auth 统一消费投递）
- FR-3.4 **发送限速**：复用 SYS-01 渠道级 `rate_limit_per_minute`，避免触发 SMTP 服务商限制
- FR-3.5 可定时发送（`scheduled_time`，依赖批次 A SYS-02）
- FR-3.6 发送前预览 + 测试发送（发给指定测试邮箱）
- FR-3.7 发送中可取消（未发送部分停止）

### FR-4 效果追踪
- FR-4.1 新增 `crm_campaign_log`：
  ```
  log_id, tenant_id, campaign_id, mass_email_id
  action        SENT / DELIVERED / OPENED / CLICKED / BOUNCED / UNSUBSCRIBED /
                LEAD_CREATED / OPPORTUNITY_CREATED / WON
  action_time
  target_type   CUSTOMER / CONTACT / LEAD
  target_id
  target_email
  click_url     点击的链接（CLICKED 用）
  user_agent / ip_address
  message_record_id   关联 sys_message_record
  test_flag     是否测试发送
  ```
  索引：`idx_campaign_action(campaign_id, action)`、`idx_target(target_type, target_id)`
- FR-4.2 **打开追踪**：邮件内嵌 1×1 追踪像素，请求到达时记 OPENED
- FR-4.3 **点击追踪**：邮件内链接改写为追踪链接（`/crm/track/click?token=xxx`），跳转前记 CLICKED
- FR-4.4 追踪端点为**匿名对外接口**，安全要求见 §6
- FR-4.5 退信处理：SMTP 退信回执解析（能力有限，见 §9-3）

### FR-5 退订
- FR-5.1 邮件底部必带退订链接（`/crm/track/unsubscribe?token=xxx`）
- FR-5.2 退订后置 `crm_lead.unsubscribe_flag=1` 或 `crm_customer.unsubscribe_flag=1`（CRM-04 已预留字段）
- FR-5.3 退订页面提供确认与退订原因（可选）
- FR-5.4 已退订对象在后续群发中被自动排除（FR-2.5）
- FR-5.5 **合规要求**：退订链接必须存在且有效，这是商业邮件的基本合规要求

### FR-6 ROI 归因
- FR-6.1 `crm_lead.campaign_id`（CRM-04 已预留）：从活动产生的线索带上活动 ID
- FR-6.2 `crm_opportunity` 增 `campaign_id`：线索转化的商机继承活动 ID
- FR-6.3 归因链路：活动 → 线索 → 商机 → 赢单 → 回款金额
- FR-6.4 `crm_campaign.revenue` 由归因回填（赢单商机的回款金额求和）
- FR-6.5 ROI 报表：按活动展示 预算 / 实际成本 / 收入 / ROI / 各转化率
- FR-6.6 归因窗口：线索创建时间在活动期间 + N 天内（可配，默认 30 天）

### FR-7 报表
- FR-7.1 活动效果对比（多活动横向对比各率与 ROI）
- FR-7.2 转化漏斗：发送 → 送达 → 打开 → 点击 → 线索 → 商机 → 赢单
- FR-7.3 图表用批次 A LC-05（漏斗图在 LC-05 的预设组件中）

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `crm_campaign`、`crm_target_list`、`crm_target_list_member`、`crm_campaign_target_list`、`crm_mass_email`、`crm_campaign_log` |
| 改造 | `crm_opportunity`（增 `campaign_id`） |
| 复用 | `crm_lead.campaign_id`、`unsubscribe_flag`（CRM-04 已加） |
| 复用 | `sys_message_template` / `sys_message_record`（批次 A） |

`DB/05.cloudflow-crm.sql`：+6 表

## 6. 非功能需求（**本 PRD 安全与合规要求较多**）

| 项 | 要求 |
| --- | --- |
| **追踪端点安全** | `/crm/track/*` 是匿名对外接口，属新增外网暴露面：① token 用不可预测的随机值（不用自增 ID）；② 限流（复用 `sys_api_ratelimit_rule`）；③ 不回显任何客户数据；④ 点击追踪的跳转目标必须在白名单内（**防开放重定向**） |
| **退订合规** | 退订链接必须存在、必须有效、退订必须立即生效（FR-5） |
| 发送限速 | 复用 SYS-01 渠道限流，避免 SMTP 服务商封禁 |
| 发送量控制 | 单次群发上限（可配，默认 5000）；超限需二次确认 |
| 个人信息 | 目标名单含邮箱手机，属个人信息：加密存储或脱敏展示（对齐 SYS-01 的处理）；名单导出需权限 + 审计 |
| 数据量 | `crm_campaign_log` 是高写入表（1 万人群发产生 1 万+ 条），需归档策略 |
| 幂等 | 同一 `mass_email_id` 重复触发不重复发送 |
| 计数准确性 | 计数字段与日志聚合值需一致，提供重算 |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 活动可创建并维护预算与实际成本 |
| AC-2 | 目标名单支持手工加入与条件筛选两种来源 |
| AC-3 | 活动关联目标名单 + 排除名单；实际发送对象为 并集-排除-已退订-无邮箱 |
| AC-4 | 邮件群发成功，个性化占位符正确替换 |
| AC-5 | 测试发送只发给指定邮箱，日志 `test_flag=1` 且不计入正式计数 |
| AC-6 | 定时发送在指定时间执行（依赖 SYS-02） |
| AC-7 | 发送中可取消，未发送部分停止 |
| AC-8 | 发送限速生效，不超过渠道 `rate_limit_per_minute` |
| AC-9 | 打开追踪：邮件被打开后日志记 OPENED，活动 `opened_count` 增加 |
| AC-10 | 点击追踪：点击链接后记 CLICKED 并正确跳转 |
| AC-11 | **开放重定向防护：点击追踪的跳转目标不在白名单时被拒绝** |
| AC-12 | **追踪 token 不可预测；伪造 token 无效；追踪端点限流生效** |
| AC-13 | 退订链接有效，退订后 `unsubscribe_flag=1` 立即生效 |
| AC-14 | 已退订对象在下次群发中被排除 |
| AC-15 | 活动产生的线索带 `campaign_id`；转化的商机继承 |
| AC-16 | ROI 报表正确计算（收入由赢单回款归因回填） |
| AC-17 | 归因窗口生效（活动期间 + 30 天内的线索计入） |
| AC-18 | 转化漏斗报表正确（发送→送达→打开→点击→线索→商机→赢单） |
| AC-19 | 计数字段与日志聚合值一致；可重算 |
| AC-20 | 单次群发超上限时需二次确认 |
| AC-21 | 名单导出需权限并记审计 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| ⛔ **批次 A SYS-01 的邮件渠道** | **强依赖且当前未满足**：A2 本批只做站内渠道，邮件只留适配接口。**E5-b 段全部阻塞**（见 §0）。需先确定 SMTP 方案并在 A2 补 `EmailChannelSender` |
| **批次 A SYS-02 任务平台** | 定时发送、计数重算、归因回填 |
| **批次 A LC-05 图表库** | 漏斗与 ROI 报表 |
| **CRM-04（线索资质与分层）** | `campaign_id` / `unsubscribe_flag` 字段、条件筛选名单用到的分层字段 |
| 现有 `sys_api_ratelimit_rule` | 追踪端点限流 |
| SMTP 服务 | 批次 A 的待确认项（SMTP 账号来源）直接影响本 PRD 可用性 |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **追踪端点是新增外网暴露面**（开放重定向、token 伪造、限流缺失） | NFR 四条要求 + AC-11/12 专项验证。**这是本 PRD 最高风险项** |
| **邮件群发合规风险**（无退订、发送过频可能被判垃圾邮件） | 退订链接强制（FR-5.5 + AC-13）；发送限速（AC-8）；单次上限（AC-20） |
| SMTP 服务商封禁导致群发失败 | 限速 + 分批发送；SYS-01 的渠道降级机制可切备用 SMTP |
| 打开追踪准确性低（邮件客户端屏蔽图片） | 行业普遍问题，无法完全解决；报表需注明"打开率受客户端影响，仅供参考" |
| 退信处理能力有限（SMTP 退信回执解析复杂） | §9-3；本期只处理同步失败（SMTP 直接拒收），异步退信（bounce 邮件）暂不解析 |
| `crm_campaign_log` 写入量大 | 归档策略（NFR）；1 万人群发约 1-3 万条日志，需评估保留期 |
| 计数字段与日志不一致 | 增量更新 + 定时重算（AC-19） |
| 目标名单含个人信息，导出泄露风险 | 权限 + 审计（AC-21） |

## 9. 里程碑

### E5-a（不阻塞，可立即执行）

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 六张表（SYS-07 生成）+ 活动与名单管理 | AC-1/2/3 |
| M2 | `campaign_id` 关联（线索/商机）+ ROI 归因链路 + 归因窗口 | AC-15/16/17 |
| M3 | 效果报表框架 + 漏斗（发送类指标先留空） | AC-18（部分） |
| M4 | 名单权限与审计 | AC-21 |

### E5-b（⛔ 等邮件渠道）

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M5 | 邮件群发（调 SYS-01）+ 限速 + 测试发送 + 取消 | AC-4/5/7/8/20 |
| M6 | **追踪端点（打开/点击）+ 安全加固** | AC-9/10/11/12 |
| M7 | 退订链接与处理 | AC-13/14 |
| M8 | 定时发送 + 计数聚合与重算 + 漏斗完整指标 | AC-6/19/18（完整） |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 短信营销何时补 | 批次 A 已把短信适配层做好，接入供应商后本 PRD 只需增一个 `campaign_type=SMS` 与对应模板，成本很低。建议等有明确短信需求时再补 |
| 2 | 追踪链接的域名 | 建议用与主站同域的路径（`/crm/track/*`），避免额外域名与证书成本；但需注意主站域名被邮件客户端标记的风险 |
| 3 | 退信（bounce）如何处理 | 本期只处理同步失败。异步退信需配置 SMTP 的 bounce 邮箱并解析退信邮件，成本高。建议后续单独评估 |
| 4 | 归因窗口 30 天是否合适 | 建议 30 天起步，可配置；B2B 长周期业务可能需要 90 天 |
| 5 | `crm_campaign_log` 保留期 | 建议 12 个月（营销效果分析需要同比），之后归档 |
| 6 | 群发是否需要审批 | 建议超过一定人数（如 1000）时走审批，防误发。可用 `sys_business_rule` 配阈值 |
