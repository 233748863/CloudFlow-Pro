# CRM 模块对标调研

> 本文档独立可用。调研时间 2026-08-31，对标源已克隆源码并读取实体定义（EspoCRM entityDefs、ERPNext doctype JSON）。

## 一、许可证规则

| 分类 | 项目 | 使用方式 |
| --- | --- | --- |
| 仅借鉴业务设计 | espocrm(AGPL-3.0)、erpnext(GPL-3.0) | **只提取实体与字段语义，禁止复制代码** |
| 需逐项复核 | twenty(NOASSERTION)、chatwoot(NOASSERTION)、WukongCRM(NOASSERTION，2021-08 已停更) | 借鉴前确认条款 |
| 可读可借鉴实现 | ruoyi-vue-pro / yudao-cloud 的 `yudao-module-crm`(MIT) | 可参照代码结构 |

本模块主力语义来源是 EspoCRM 与 ERPNext，两者都是 copyleft，落地时**只搬概念不搬代码**。

## 二、我们的现状基线（实测）

- Controller 文件 20 个，HTTP 端点 156 个
- 结构表 **17 张**（`DB/05.cloudflow-crm.sql`）——五个业务服务里最少的
- 对比参照：HR 86 表 / 463 端点，OA 63 表 / 416 端点。**CRM 的表数只有 HR 的 1/5**

现有 17 张表：`crm_lead`、`crm_customer`(36列)、`crm_contact`、`crm_follow_up`、`crm_opportunity`、`crm_quote` + `crm_quote_line`、`crm_product`、`crm_price_book`、`crm_receivable`、`crm_renewal`、`crm_service_ticket`、`crm_sales_target`、`crm_handover_task`、`crm_approval`、`crm_customer_pool_log`、`crm_assignment_rule`

已有能力（不需重复建设）：线索转化、客户公海（含自动释放与认领、分配规则 `inactive_days`/`max_per_owner`）、客户健康度（`health_level`/`health_reason`）、报价到合同联动、回款账龄、续约、工单、销售目标、离职交接（`crm_handover_task` 带 trigger_source）、CRM 内部审批（`crm_approval` 带 payload_json）、与 OA 打通的客户工作台（合同/项目/预算/发票草稿）。

**结论：CRM 的"单据链路"做得不错（线索→商机→报价→合同→回款→续约闭环完整），缺的是"客户经营深度"——活动管理、营销、SLA、销售过程量化几乎空白。**

## 三、功能深度差距矩阵

深度等级：`0`=无 / `1`=有雏形 / `2`=可用 / `3`=完整

| 能力项 | 我们 | EspoCRM | ERPNext | 差距判定 |
| --- | --- | --- | --- | --- |
| 活动管理（会议/通话/任务） | **0**（只有 `crm_follow_up` 17 列） | 3（Meeting/Call/Task 三实体，含参会人接受状态、提醒、时长） | 2 | **重点缺口** |
| 营销活动（Campaign） | **0** | 3（Campaign 34 字段 + TargetList + MassEmail + CampaignLogRecord + TrackingUrl） | 2（campaign + email_campaign） | **重点缺口** |
| SLA 服务等级 | 1（工单有 due_time 字段） | 1 | **3**（ServiceLevelAgreement 16 字段 + priorities + pause_sla_on + sla_fulfilled_on） | **重点缺口** |
| 邮件集成 | **0** | 3（InboundEmail/EmailTemplate/EmailQueueItem/EmailFilter/EmailFolder） | 2 | 重点缺口 |
| 线索资质与评分 | 1（status + source） | 2（status/source/industry/opportunityAmount/acceptanceStatus） | **2**（qualified_by/qualified_on/qualification_status/annual_revenue/no_of_employees/market_segment/territory） | 缺口 |
| 商机丢单原因结构化 | 1（`lost_reason` 纯文本） | 1 | **3**（opportunity_lost_reason + lost_reason_detail + competitor 关联） | 缺口 |
| 竞争对手管理 | **0** | 0 | 2（competitor + competitor_detail） | 缺口 |
| 客户信用额度 | **0** | 0 | 2（customer_credit_limit：credit_limit / overdue_billing_threshold / bypass 开关） | 缺口 |
| 销售团队与提成 | 1（owner + dept） | 1（assignedUser + teams） | **2**（sales_team：allocated_percentage / commission_rate / incentives） | 缺口 |
| 客户分层（区域/细分市场） | 1（level_code/industry/tags） | 2 | **2**（territory + market_segment + customer_group + industry_type） | 缺口 |
| 知识库（客户可见） | 0（OA 有内部知识库） | 2（KnowledgeBaseArticle 关联 Case） | 0 | 缺口 |
| 客户门户 | **0** | 2（Portal + portalUsers） | 2 | 缺口 |
| 预约排期 | 0 | 0 | 2（appointment + booking_slots + availability_of_slots） | 小缺口 |
| 商机产品明细 | 1（报价有明细，商机无） | 0 | 2（opportunity_item） | 小缺口 |
| 潜客池（Prospect） | 1（公海机制思路相近） | 0 | 2（prospect + prospect_lead + prospect_opportunity） | 小缺口 |
| 公海 / 分配规则 | **3（已完整）** | 0 | 0 | 我们领先 |
| 离职交接自动化 | **2（已有）** | 0 | 0 | 我们领先 |
| 与 OA 单据联动 | **3（已完整）** | 1 | 2 | 我们领先 |

## 四、可移植条目

### [CRM-01] 活动管理三实体（会议 / 通话 / 任务）
- **参考来源**：`espocrm/espocrm` → `application/Espo/Modules/Crm/Resources/metadata/entityDefs/{Meeting,Call,Task}.json`（AGPL-3.0，仅借鉴设计）
- **参考实现怎么做的**：实测三个实体的关键设计
  - `Meeting`：`status, dateStart, dateEnd, isAllDay, duration, reminders(jsonArray), parent(linkParent), account, joinUrl, externalService, acceptanceStatus(enum), users/contacts/leads(linkMultiple)`
  - `Call`：同上再加 `direction(enum 呼入/呼出)`、`phoneNumbersMap(jsonObject)`
  - `Task`：`status, priority, dateStart, dateEnd, dateCompleted, isOverdue, reminders, parent, contact, collaborators, attachments`
  - 三个关键设计点：① `parent:linkParent` 多态挂载（同一活动可挂客户/商机/线索/工单）；② `acceptanceStatus` 参会人逐人接受状态；③ `reminders` JSON 数组支持多提醒。
- **我们现状**：只有 `crm_follow_up`（17 列：follow_up_type/follow_up_time/content/result_summary），把所有互动压成一张"跟进记录"。没有参会人、没有接受状态、没有提醒、不能挂到工单/线索上（只有 customer_id + opportunity_id 两个固定外键）。
- **落地改动**：
  - 新增 `crm_activity`：`activity_id, tenant_id, activity_type(MEETING/CALL/TASK), subject, status, priority, direction, start_time, end_time, all_day_flag, duration_minutes, biz_type(CUSTOMER/OPPORTUNITY/LEAD/TICKET/CONTRACT), biz_id, customer_id, owner_id, description, join_url, reminders(JSON), complete_time, overdue_flag` + 标准审计列
  - 新增 `crm_activity_participant`：`activity_id, participant_type(USER/CONTACT/LEAD), participant_id, participant_name, acceptance_status(NONE/ACCEPTED/DECLINED/TENTATIVE), response_time`
  - `crm_follow_up` 保留（跟进记录仍有独立业务含义），新增活动与它并行；客户 360 视图时间线同时聚合两者
  - API：`/crm/activity` CRUD + `/crm/activity/{id}/accept|decline` + `/crm/activity/calendar`（按人按周取）
  - 前端：客户/商机详情页加"活动"页签；复用已有 FullCalendar（前端已装 6.1.20）做日程视图
- **工作量**：L（2 表 + 约 12 接口 + 前端日历集成）
- **优先级**：P0 —— 这是 CRM 从"记录客户"升级到"经营客户"的分界线，也是本模块最大单点缺口

### [CRM-02] 营销活动闭环（Campaign + 目标名单 + 群发 + 效果日志）
- **参考来源**：`espocrm/espocrm` → `entityDefs/{Campaign,TargetList,MassEmail,CampaignLogRecord,CampaignTrackingUrl}.json`（AGPL-3.0，仅借鉴设计）
- **参考实现怎么做的**：实测四件套
  - `Campaign`（34 字段）：除 name/status/type/日期外，**内建 14 个效果计数字段**：`sentCount, openedCount, clickedCount, optedInCount, optedOutCount, bouncedCount, hardBouncedCount, softBouncedCount, leadCreatedCount, openedPercentage, clickedPercentage, optedOutPercentage, bouncedPercentage`，再加 `revenue` 与 `budget` 做 ROI
  - `TargetList`（16 字段）：`entryCount, optedOutCount, includingActionList, excludingActionList, targetStatus`，可同时挂 accounts/contacts/leads/users，且 Campaign 支持 `excludingTargetLists` 排除名单
  - `MassEmail`：`fromAddress, replyToAddress, startAt, emailTemplate, targetLists, excludingTargetLists, storeSentEmails, optOutEntirely`
  - `CampaignLogRecord`：`action(enum), actionDate, parent(linkParent), object(linkParent), queueItem, isTest` —— 每一次发送/打开/点击/退订都是一条日志，计数字段由日志聚合
- **我们现状**：完全没有营销概念。`crm_lead.source` 是自由文本，无法回答"这条线索来自哪次活动"。
- **落地改动**：
  - 新增 `crm_campaign`：基础字段 + budget/revenue + 上述计数字段（计数落库避免每次聚合）
  - 新增 `crm_target_list` + `crm_target_list_member`（member_type: CUSTOMER/CONTACT/LEAD）
  - 新增 `crm_campaign_log`：`campaign_id, action(SENT/OPENED/CLICKED/BOUNCED/OPTED_OUT/LEAD_CREATED), action_time, target_type, target_id, mass_email_id, test_flag`
  - `crm_lead` 增 `campaign_id`，`crm_opportunity` 增 `campaign_id`，实现"活动→线索→商机→回款"的 ROI 归因
  - 群发依赖消息通道，与 `07-integration` 文档的消息中心条目共用底座（不要在 CRM 内自建邮件发送）
  - API：`/crm/campaign` CRUD + `/crm/campaign/{id}/statistics` + `/crm/target-list` CRUD + `/crm/campaign/{id}/send`
- **工作量**：L（3-4 表 + 依赖消息中心）
- **优先级**：P1（依赖消息中心先落地，见 07 文档 INT-01）

### [CRM-03] SLA 服务等级协议
- **参考来源**：`frappe/erpnext` → `erpnext/support/doctype/service_level_agreement/`（GPL-3.0，仅借鉴设计），配套 doctype：`service_level_priority`、`pause_sla_on_status`、`sla_fulfilled_on_status`、`service_day`、`issue_priority`、`issue_type`
- **参考实现怎么做的**：实测 SLA 主体 16 字段的关键设计
  - `entity_type` + `entity`（Dynamic Link）：SLA 可绑到**客户/客户组/区域**，不是全局一刀切
  - `priorities`（Table → service_level_priority）：**每个优先级各自的响应时长与解决时长**
  - `pause_sla_on`（Table）：进入指定状态时**暂停 SLA 计时**（例如"等待客户回复"不算超时）
  - `sla_fulfilled_on`（Table）：命中哪些状态算履约完成
  - `holiday_list` + `service_day`：SLA 计时**只算工作时间**，跳过节假日
  - `condition`（Code）：条件表达式决定该 SLA 是否适用
  - `apply_sla_for_resolution` 开关：可只考核响应不考核解决
- **我们现状**：`crm_service_ticket` 有 `severity` 和 `due_time`，但 due_time 是录入时算死的固定值；无优先级分档时长、无暂停计时、无工作日历、无履约判定。`CrmNotificationController` 有 `POST /dispatch/ticket-sla` 说明已有 SLA 提醒动作，但底层没有真正的 SLA 模型支撑。
- **落地改动**：
  - 新增 `crm_sla_policy`：`policy_id, policy_name, entity_type(GLOBAL/CUSTOMER/CUSTOMER_LEVEL/INDUSTRY), entity_id, holiday_calendar_id, apply_for_resolution, default_flag, condition_expr, effective_start, effective_end, status`
  - 新增 `crm_sla_priority`：`policy_id, priority_code, first_response_minutes, resolution_minutes`
  - 新增 `crm_sla_status_rule`：`policy_id, rule_type(PAUSE/FULFILL), ticket_status`
  - `crm_service_ticket` 增：`sla_policy_id, first_response_due, resolution_due, first_response_time, sla_paused_minutes, sla_status(ONGOING/PAUSED/FULFILLED/BREACHED)`
  - 工作日历复用 OA 已有的值班排班表（`oa_duty_schedule`）或新建节假日表，二选一时优先复用
  - `POST /dispatch/ticket-sla` 改为读真实 SLA 模型计算
- **工作量**：M（3 表 + 计时器逻辑 + 与现有通知打通）
- **优先级**：P0 —— 工单已有但 SLA 是空的，属于"看起来有能力实际不可考核"，优先补齐

### [CRM-04] 线索资质评估与结构化画像
- **参考来源**：`frappe/erpnext` → `crm/doctype/lead/lead.json`（44 字段，GPL-3.0 仅借鉴）、`crm/doctype/market_segment`、`crm/doctype/prospect`
- **参考实现怎么做的**：Lead 的 44 字段里有一组资质字段是我们完全没有的：`qualified_by(Link 用户)`、`qualified_on(Date)`、`qualification_status(Select)`、`annual_revenue(Currency)`、`no_of_employees(Select 分档)`、`market_segment(Link)`、`territory(Link)`、`request_type(Select)`、`unsubscribed(Check)`、`job_title`。另外 `prospect` 实体把「还不是线索但值得跟」的公司单独建模，一个 prospect 下可挂多条 lead 与 opportunity。
- **我们现状**：`crm_lead` 27 列，画像字段只有 `source/industry/company_name`。谁在什么时候判定这条线索合格、判定结果是什么，全部无处记录。
- **落地改动**：
  - `crm_lead` 增：`qualified_by, qualified_by_name, qualified_time, qualification_status(UNQUALIFIED/QUALIFYING/QUALIFIED/DISQUALIFIED), disqualify_reason, annual_revenue, employee_scale, market_segment, territory_id, job_title, unsubscribe_flag, campaign_id`
  - `crm_customer` 同步增 `territory_id, market_segment`（客户分层要与线索口径一致）
  - 新增 `crm_territory`（支持树形：`parent_id`）与 `crm_market_segment` 两张字典型表；也可评估用现有 `sys_dict_data` 承载，表结构更省但树形区域不好表达，建议区域独立建表、细分市场用字典
  - API：`POST /crm/lead/{id}/qualify`、`POST /crm/lead/{id}/disqualify`
- **工作量**：M
- **优先级**：P1

### [CRM-05] 丢单原因结构化 + 竞争对手
- **参考来源**：`frappe/erpnext` → `crm/doctype/{opportunity_lost_reason,lost_reason_detail,competitor,competitor_detail}`（GPL-3.0 仅借鉴）
- **参考实现怎么做的**：丢单原因是独立主数据（`opportunity_lost_reason`），商机与原因之间用明细表多对多（`lost_reason_detail`），**同时挂竞争对手明细**（`competitor_detail`）。这样能回答"我们主要输给谁、因为什么"。
- **我们现状**：`crm_opportunity.lost_reason` 是自由文本；`POST /opportunity/{id}/lose` 存文本。无法做丢单分析，`CrmDashboardController` 也就没法出这类看板。
- **落地改动**：
  - 新增 `crm_lost_reason`（主数据字典型）、`crm_competitor`（competitor_name/website/industry/strength/weakness/status）
  - 新增 `crm_opportunity_lost_detail`：`opportunity_id, lost_reason_id, competitor_id, amount_lost, remark`
  - `POST /opportunity/{id}/lose` 入参改为结构化（reasonIds[] + competitorId），保留 remark 文本
  - `/crm/dashboard/summary` 增丢单原因 TOP、竞对胜负比
- **工作量**：S
- **优先级**：P1 —— 改动小，直接让现有 dashboard 有可分析内容

### [CRM-06] 客户信用额度与超期控制
- **参考来源**：`frappe/erpnext` → `selling/doctype/customer_credit_limit`（GPL-3.0 仅借鉴），实测 4 字段：`credit_limit, overdue_billing_threshold, company, bypass_credit_limit_check`
- **参考实现怎么做的**：额度是**按公司维度挂在客户下的明细表**（多公司各自额度），并且区分「总额度」与「超期欠款阈值」两个独立控制点，另有 bypass 开关做例外授权。
- **我们现状**：有 `crm_receivable` 完整回款与账龄（`GET /receivable/aging`），但没有额度概念——客户欠款再多也不阻止新报价/新合同。
- **落地改动**：
  - 新增 `crm_customer_credit`：`customer_id, credit_limit, overdue_threshold, currency, bypass_flag, bypass_reason, bypass_by, effective_start, effective_end, status`
  - 报价提交（`POST /quote/submit/{id}`）与合同草稿生成前增额度校验，超限走 `sys_business_rule` 规则中心（已有 BLOCK/WARN/PASS 三态语义，直接复用，新增规则码 `crm.credit.limit`）
  - 校验命中写 `sys_business_rule_hit_record`（表已存在）
- **工作量**：S（复用现有规则中心，成本低）
- **优先级**：P1 —— 与现有规则中心天然契合，投入产出比高

### [CRM-07] 销售团队分成与提成
- **参考来源**：`frappe/erpnext` → `selling/doctype/sales_team`（GPL-3.0 仅借鉴），实测 6 字段：`sales_person, contact_no, allocated_percentage, allocated_amount, commission_rate, incentives`
- **参考实现怎么做的**：一个单据可以挂多个销售人员，各自 `allocated_percentage` 分成，按 `commission_rate` 算提成。解决"团队单/协作单"的业绩归属。
- **我们现状**：`crm_customer`/`crm_opportunity`/`crm_quote` 都是单一 `owner_id`；`crm_sales_target` 只能按单人或单部门考核。协作成单无法分账。
- **落地改动**：
  - 新增 `crm_deal_team`：`biz_type(OPPORTUNITY/QUOTE/CONTRACT), biz_id, sales_user_id, sales_user_name, role_type(OWNER/CO_SELLER/PRE_SALES/SUPPORT), allocated_percentage, allocated_amount, commission_rate, remark`
  - `CrmPerformanceInnerController`（已有 `/inner/crm/performance/owners`、`/top-owners`）业绩聚合改为按分成比例计算
  - 与 HR 打通：HR 侧已有 `HrCrmPerformanceController`，提成结果可作为薪酬变动输入（对应 04 文档的绩效条目）
- **工作量**：M
- **优先级**：P2

### [CRM-08] 客户门户与对外知识库
- **参考来源**：`espocrm/espocrm` → `entityDefs/{Portal,KnowledgeBaseArticle,KnowledgeBaseCategory}.json`（AGPL-3.0 仅借鉴）
- **参考实现怎么做的**：Portal 是独立的对外访问入口，客户联系人可注册为 `portalUsers`；`Case`（工单）与 `KnowledgeBaseArticle` 关联，客户自助查文章、提工单、看进度。
- **我们现状**：无对外入口。OA 已有内部知识库（`oa_knowledge_document` + 版本 + 模板），工单是纯内部视角。
- **落地改动**：
  - 新增 `crm_portal_user`：`contact_id, customer_id, login_account, password_hash, status, last_login_time`（**注意：这是新增对外网络暴露面，必须独立鉴权域，不能复用内部 Sa-Token 会话模型**）
  - `oa_knowledge_document` 增 `external_visible` 标记，复用现有版本机制对外发布
  - 工单增客户可见字段过滤（内部处理意见不可外露）
  - **安全前置**：门户上线前需明确限流（`sys_api_ratelimit_rule` 已存在可复用）、IP 策略（`sys_ip_acl` 已存在）、独立登录审计
- **工作量**：L
- **优先级**：P2 —— 价值明确但引入外网暴露面，须在安全评审后再排

### [CRM-09] 商机产品明细与阶段推进规则
- **参考来源**：`frappe/erpnext` → `crm/doctype/{opportunity_item,sales_stage}`（GPL-3.0 仅借鉴）；`espocrm` → `Opportunity.json`（`stage/lastStage/probability/amountWeightedConverted`）
- **参考实现怎么做的**：EspoCRM 保留 `lastStage` 记录上一阶段、`amountWeightedConverted` 做加权预测金额；ERPNext 用 `sales_stage` 主数据 + `opportunity_item` 明细。
- **我们现状**：`crm_opportunity` 有 `stage/win_rate/stage_changed_time`（加权预测所需字段齐了），但阶段是自由值、无上一阶段、无产品明细；`PUT /opportunity/stage` 无阶段跳转合法性校验。
- **落地改动**：
  - 新增 `crm_sales_stage` 主数据：`stage_code, stage_name, sort_no, default_win_rate, allow_skip, required_fields(JSON)`
  - `crm_opportunity` 增 `last_stage, weighted_amount`（可由 expected_amount × win_rate 落库便于报表）
  - 新增 `crm_opportunity_item`（复用 `crm_quote_line` 字段结构）
  - `PUT /opportunity/stage` 增阶段合法性与必填项校验
- **工作量**：M
- **优先级**：P2

### [CRM-10] 邮件往来归档到客户时间线
- **参考来源**：`espocrm/espocrm` → `entityDefs/{Email,InboundEmail,EmailTemplate,EmailQueueItem,EmailFilter,EmailFolder}.json`（AGPL-3.0 仅借鉴）
- **参考实现怎么做的**：Email 是一等公民实体，可挂 parent（客户/商机/工单），`InboundEmail` 收件后自动关联并可自动建工单（Case 的 `inboundEmail`/`originalEmail` 字段），形成完整往来记录。
- **我们现状**：无邮件能力。
- **落地改动**：先做**单向归档**（发出的邮件记录进时间线），双向收信解析成本高；依赖 07 文档的消息中心；客户 360 时间线可复用 OA 已有的 `oa_trace_event` + `/oa/timeline` 模式在 CRM 侧建 `crm_trace_event`
- **工作量**：L
- **优先级**：P2

## 五、不建议移植

| 项 | 原因 |
| --- | --- |
| WukongCRM 代码 | 2021-08 后停更，Spring Cloud 版本与我们（Spring Boot 3.2.6 / JDK 17）差距过大；仅可看国内销售习惯的字段命名 |
| ERPNext 的会计/库存/制造联动 | 我们不是 ERP，`crm_receivable` 到 OA 发票的链路已够用；引入总账科目体系是另一个项目 |
| EspoCRM 的 formula / 动态逻辑引擎 | 我们已有 `sys_business_rule` 规则中心（含版本/发布/回滚/命中记录），不需要第二套规则引擎 |
| twenty 的 GraphQL / 元数据驱动架构 | 与我们 MyBatis-Plus + 固定表结构的技术栈冲突，属重写 |
| chatwoot 全渠道会话 | 独立的客服系统问题域，若真要做应作为独立服务而非塞进 CRM |
| Campaign 的 A/B 测试与自动化旅程 | CRM-02 基础营销闭环都还没有，超前建设 |

## 六、建议批次

**P0（补齐"看起来有实际空"的能力）**
1. CRM-01 活动管理三实体 —— 本模块最大缺口
2. CRM-03 SLA 模型 —— 工单已有但不可考核

**P1（客户经营深度）**
3. CRM-05 丢单原因与竞对（S，直接喂给现有 dashboard）
4. CRM-06 信用额度（S，复用规则中心）
5. CRM-04 线索资质与客户分层
6. CRM-02 营销闭环（**依赖 07-INT-01 消息中心**）

**P2（增强）**
7. CRM-09 商机明细与阶段规则
8. CRM-07 销售团队分成（与 HR 绩效联动）
9. CRM-10 邮件归档、CRM-08 客户门户（**门户需先过安全评审**）

依赖关系：CRM-02 → 消息中心（07 文档）；CRM-07 → HR 绩效（04 文档）；CRM-06 复用现有 `sys_business_rule`，无外部依赖。
