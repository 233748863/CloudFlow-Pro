# PRD：CRM 增强项合集（CRM-07/08/09/10）

| 项 | 内容 |
| --- | --- |
| 条目编号 | CRM-07 销售团队分成 · CRM-08 客户门户 · CRM-09 商机明细与阶段规则 · CRM-10 邮件归档 |
| 所属批次 | 批次 H（P2 增强项，**按诉求挑选**） |
| 对标依据 | `docs/benchmark/03-crm-客户经营对标.md` |
| 优先级 | P2 |
| 预估工作量 | CRM-07 M / CRM-08 L / CRM-09 M / CRM-10 L |
| 版本 | v1 · 2026-08-31 |

## 0. 定位与优先级建议

| 顺序 | 条目 | 理由 |
| --- | --- | --- |
| 1 | **CRM-09 商机明细与阶段规则**（M） | 现有 `crm_opportunity` 已有 `win_rate` / `stage_changed_time`（加权预测字段齐了），补阶段主数据与明细成本适中 |
| 2 | **CRM-07 销售团队分成**（M） | 协作成单无法分账是实际问题；与 HR 绩效联动有价值 |
| 3 | **CRM-10 邮件归档**（L） | 依赖 SYS-01 邮件；单向归档价值有限，双向收信成本高 |
| 4 | **CRM-08 客户门户**（L） | **引入外网暴露面，须先过安全评审**；建议最后或与 F5 的供应商门户统一设计 |

---

# CRM-09 商机产品明细与阶段推进规则

## 1. 背景

`crm_opportunity`（27 列）有 `stage` / `win_rate` / `stage_changed_time`（**加权预测所需字段已齐**），但：
- 阶段是自由值，无主数据，无阶段推进的合法性校验
- 无 `last_stage`（上一阶段），无法分析阶段回退
- 无产品明细（报价有 `crm_quote_line` 22 列，商机没有）
- `PUT /opportunity/stage` 无阶段跳转合法性校验

## 2. 功能需求
- FR-1 新增 `crm_sales_stage`：`stage_id, tenant_id, stage_code, stage_name, sort_no, default_win_rate DECIMAL(6,4), allow_skip_flag(是否允许跳过), required_fields(JSON，进入该阶段必填字段), required_activity_flag(是否需有跟进记录), is_won_flag, is_lost_flag, status` + 审计列
  - 预置：初步接触 10% → 需求确认 30% → 方案报价 50% → 商务谈判 70% → 赢单 100% / 丢单 0%
- FR-2 `crm_opportunity` 增：`last_stage`、`weighted_amount DECIMAL(14,2)`（= `expected_amount` × `win_rate`，落库便于报表）、`stage_duration_days`（当前阶段停留天数）
- FR-3 新增 `crm_opportunity_item`：字段结构参照现有 `crm_quote_line`（`product_id, product_no, product_name, spec, unit, quantity, unit_price, discount_rate, tax_rate, line_amount, remark`）
- FR-4 `PUT /opportunity/stage` 增校验：
  - 目标阶段存在且启用
  - `allow_skip_flag=0` 时不允许跳阶段（只能进入下一阶段）
  - `required_fields` 声明的字段必须已填
  - `required_activity_flag=1` 时必须有跟进记录或活动（批次 E CRM-01）
  - 阶段回退需填原因（记入 `crm_follow_up` 或活动）
- FR-5 阶段变更时更新 `last_stage`、`stage_changed_time`、重算 `weighted_amount`
- FR-6 阶段停留超期提醒（各阶段可配超期天数，走批次 A SYS-01）
- FR-7 报表：阶段漏斗（用批次 A LC-05 的漏斗图）、各阶段平均停留时长、阶段转化率、加权预测金额

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-1 | 阶段主数据可维护；预置六个阶段可用 |
| AC-2 | `allow_skip_flag=0` 时跳阶段被拒绝 |
| AC-3 | `required_fields` 未填时进入该阶段被拒绝 |
| AC-4 | `required_activity_flag=1` 时无跟进记录进入该阶段被拒绝 |
| AC-5 | 商机可添加产品明细；金额与报价明细口径一致 |
| AC-6 | 阶段变更后 `last_stage` / `weighted_amount` 正确更新 |
| AC-7 | 阶段停留超期触发提醒 |
| AC-8 | 漏斗、停留时长、转化率、加权预测报表正确 |

## 4. 依赖
批次 E CRM-01（活动，`required_activity_flag` 校验）、E3（丢单原因，`is_lost_flag` 联动）、批次 A LC-05 / SYS-01

---

# CRM-07 销售团队分成与提成

## 1. 背景

`crm_customer` / `crm_opportunity` / `crm_quote` 都是单一 `owner_id`；`crm_sales_target`（21 列）只能按单人或单部门考核。**协作成单无法分账**。

已有 `CrmPerformanceInnerController`（`/inner/crm/performance/owners`、`/top-owners`、`/depts`、`/top-depts`）与 HR 侧 `HrCrmPerformanceController`，说明业绩数据已在跨服务流转 —— 但都是按单一 owner 统计。

## 2. 功能需求
- FR-8 新增 `crm_deal_team`：`team_id, tenant_id, biz_type(OPPORTUNITY/QUOTE/CONTRACT/RECEIVABLE), biz_id, sales_user_id, sales_user_name, dept_id, role_type(OWNER 主责 / CO_SELLER 协同销售 / PRE_SALES 售前 / SUPPORT 支持 / MANAGER 管理者), allocated_percentage DECIMAL(6,4), allocated_amount DECIMAL(14,2), commission_rate DECIMAL(6,4), commission_amount DECIMAL(14,2), remark` + 审计列
- FR-9 分成比例之和必须为 100%（保存校验）
- FR-10 `OWNER` 角色必须有且仅有一个
- FR-11 商机/合同创建时默认按 `owner_id` 生成一条 100% 的 OWNER 记录（保证兼容）
- FR-12 `CrmPerformanceInnerController` 的业绩聚合改为**按分成比例计算**
- FR-13 提成计算：回款确认后按 `commission_rate` 算提成金额
- FR-14 与 HR 联动：提成结果可作为薪资变动项输入（对接 D3 的变动项，走现有 `HrCrmPerformanceController` 通道）
- FR-15 `crm_sales_target` 考核口径同步改为按分成后的业绩

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-9 | 一个商机可添加多个团队成员并分配比例 |
| AC-10 | 分成比例之和不为 100% 时保存被拒绝 |
| AC-11 | OWNER 角色必须唯一 |
| AC-12 | 未配置团队时默认按 owner 100% 计（兼容） |
| AC-13 | **业绩聚合按分成比例正确计算**（`/inner/crm/performance/owners` 验证） |
| AC-14 | 回款确认后提成金额正确计算 |
| AC-15 | 提成可作为薪资变动项传给 HR |
| AC-16 | 销售目标考核按分成后业绩计 |

## 4. 依赖与风险
- 依赖：现有 `CrmPerformanceInnerController` / `HrCrmPerformanceController`、D3（薪资变动项）
- 风险：**业绩口径变更影响已有考核数据与报表**。项目未上线影响小，但需确认 HR 侧的绩效计算是否同步调整

---

# CRM-10 邮件往来归档到客户时间线

## 1. 背景

无邮件能力。对标 EspoCRM 把 Email 做成一等公民实体（可挂 parent 客户/商机/工单，`InboundEmail` 收件后自动关联并可自动建工单）。

批次 A SYS-01 已交付邮件**发送**能力（SMTP），本条目是**归档**（把往来邮件记录到客户时间线）。

## 2. 范围决策：只做单向归档

**建议只做发出邮件的归档，不做双向收信解析**。理由：
- 收信需配置 IMAP、解析 MIME、处理编码与附件、识别关联对象（按邮箱匹配客户），成本高
- 收信涉及员工邮箱隐私（读取员工邮箱内容）
- 单向归档已能覆盖"给客户发了什么"的追溯需求

## 3. 功能需求
- FR-16 新增 `crm_email_record`：`email_id, tenant_id, message_record_id(关联 SYS-01 的 sys_message_record), direction(OUTBOUND/INBOUND), subject, content_summary, from_address, to_addresses(JSON), cc_addresses(JSON), biz_type(CUSTOMER/OPPORTUNITY/TICKET/QUOTE), biz_id, customer_id, contact_id, sender_user_id, send_time, attachment_count, attachment_urls(JSON), read_flag(对方是否已读，依赖追踪), remark` + 审计列
- FR-17 从客户/商机/工单详情页发邮件：选模板 → 填内容 → 发送（走 SYS-01）→ 自动归档
- FR-18 归档记录进客户 360 时间线（批次 E CRM-01 FR-6 已建时间线聚合）
- FR-19 邮件模板复用 SYS-01 的 `sys_message_template`
- FR-20 打开追踪：复用批次 E CRM-02 的追踪像素机制（若 CRM-02 已落地）
- FR-21 `INBOUND` 方向预留字段但本期不实现自动收信；**支持手工归档**（销售把重要客户回复手工粘贴归档）

## 4. 验收标准
| # | 验收项 |
| --- | --- |
| AC-17 | 从客户详情页可发邮件并自动归档 |
| AC-18 | 归档记录出现在客户 360 时间线 |
| AC-19 | 邮件模板可选用 |
| AC-20 | 附件正确关联 |
| AC-21 | 打开追踪生效（若 CRM-02 已落地） |
| AC-22 | 可手工归档客户回复内容 |

## 5. 依赖
批次 A SYS-01（邮件发送）、批次 E CRM-01（时间线）、批次 E CRM-02（追踪，可选）

---

# CRM-08 客户门户与对外知识库

## 1. 背景与风险前置

对标 EspoCRM 的 `Portal` + `KnowledgeBaseArticle`：客户联系人可注册为门户用户，自助查文章、提工单、看进度。

**但这引入新的外网暴露面**，对标文档已明确标注"门户需先过安全评审"。

## 2. 范围决策

**建议与 F5（OA-03 询价）的供应商门户需求统一设计一套对外门户框架**，而不是各建一套。两者共同需求：
- 独立鉴权域（不能复用内部 Sa-Token 会话模型）
- 外部用户账号体系
- 严格的数据可见范围控制
- 限流与审计

## 3. 功能需求（框架层）
- FR-22 新增 `sys_portal_user`（对外门户用户，通用）：`portal_user_id, tenant_id, user_type(CUSTOMER_CONTACT/SUPPLIER_CONTACT), ref_biz_type, ref_biz_id(关联 crm_contact 或 oa_supplier 联系人), login_account, password_hash, email, phone, status(PENDING/ACTIVE/DISABLED/LOCKED), last_login_time, last_login_ip, fail_count, locked_until, activate_token, activate_expire_time` + 审计列
- FR-23 **独立鉴权域**：门户会话与内部会话完全隔离（独立 token 前缀、独立会话存储、独立超时策略）
- FR-24 门户用户只能访问自己关联对象的数据（客户联系人只能看自己公司的工单与合同）
- FR-25 数据可见范围白名单：明确哪些字段对外可见（如工单的内部处理意见**不可外露**）

## 4. 功能需求（CRM 门户功能）
- FR-26 客户自助提工单、查工单进度、查看解决方案
- FR-27 对外知识库：`oa_knowledge_document` 增 `external_visible_flag`，复用现有版本机制对外发布
- FR-28 客户可查看自己的合同列表与关键节点（履约条款、付款计划）
- FR-29 客户可查看回款与开票记录

## 5. 安全要求（**本条目的核心**）
| 项 | 要求 |
| --- | --- |
| 独立鉴权域 | FR-23，绝不复用内部会话模型 |
| 密码策略 | 强密码 + 加盐哈希 + 失败锁定（`fail_count` / `locked_until`） |
| 限流 | 复用 `sys_api_ratelimit_rule`，门户接口独立限流规则 |
| IP 策略 | 可选复用 `sys_ip_acl` |
| 数据隔离 | FR-24/25，每个查询强制注入门户用户的关联对象条件 |
| 字段过滤 | 内部字段（处理意见、成本、内部备注）一律不下发 |
| 审计 | 门户登录与数据访问全部记审计 |
| 无枚举 | 不允许通过 ID 遍历他人数据（所有查询带归属校验） |
| 激活流程 | 邮件激活链接，token 一次性且有效期短 |

## 6. 验收标准
| # | 验收项 |
| --- | --- |
| AC-23 | 门户用户可注册（邮件激活）与登录 |
| AC-24 | **门户会话与内部会话完全隔离**（门户 token 无法访问内部接口，反之亦然） |
| AC-25 | **门户用户只能看自己公司的数据**；改 ID 遍历他人数据被拒绝 |
| AC-26 | **工单的内部处理意见不下发到门户** |
| AC-27 | 客户可提工单、查进度、看方案 |
| AC-28 | 对外知识库只展示 `external_visible_flag=1` 的文档 |
| AC-29 | 密码失败达阈值后锁定 |
| AC-30 | 门户接口限流生效 |
| AC-31 | 门户登录与数据访问记审计 |
| AC-32 | 激活 token 一次性且过期失效 |

## 7. 依赖与风险
- 依赖：批次 A SYS-01（激活与通知邮件）、现有 `sys_api_ratelimit_rule` / `sys_ip_acl`、E2 CRM-03（工单 SLA，门户展示进度）、F4 OA-06（合同履约，门户展示）
- 风险：
  - **新增外网暴露面是本合集最高风险项**。建议在实施前做一次专门的安全评审
  - 部署环境需公网入口（与 G4 INT-02 同一前置条件）
  - 与 F5 供应商门户的框架统一（§2）需在设计阶段就确定，否则后期难合并

---

## 综合依赖汇总

| 依赖 | 被哪几项用 |
| --- | --- |
| **批次 E CRM-01（活动）** | CRM-09（阶段校验需活动）、CRM-10（时间线） |
| **批次 E CRM-02（营销追踪）** | CRM-10（打开追踪，可选） |
| **批次 E CRM-03（工单 SLA）** | CRM-08（门户查进度） |
| **批次 A SYS-01** | CRM-10（发信）、CRM-08（激活邮件）、CRM-09（超期提醒） |
| **批次 A LC-05** | CRM-09（漏斗报表） |
| **批次 D D3** | CRM-07（提成进薪资） |
| **批次 F OA-06** | CRM-08（门户查合同履约） |
| **批次 F OA-03** | CRM-08（门户框架统一） |

## 综合待确认

| # | 问题 | 建议 |
| --- | --- | --- |
| 1 | 四项各自是否有真实诉求 | 需业务确认。优先级建议见 §0 |
| 2 | CRM-08 客户门户是否与 F5 供应商门户统一框架 | **强烈建议统一**。两者安全要求相同，分别实现会产生两套外部鉴权体系，安全面翻倍 |
| 3 | CRM-08 是否具备公网部署条件 | 与 G4 INT-02 同一前置问题，需提前确认 |
| 4 | CRM-10 是否需要双向收信 | 建议不做（§2 已说明理由）。手工归档 + 单向发送归档已覆盖主要需求 |
| 5 | CRM-07 的业绩口径变更是否需要 HR 侧同步 | 需确认 `HrCrmPerformanceController` 的消费方式；若 HR 绩效直接用 CRM 业绩数据，需同步调整 |
| 6 | CRM-09 的阶段主数据预置是否合适 | 建议按 §FR-1 预置六阶段；各公司销售流程不同，应由销售负责人确认 |
