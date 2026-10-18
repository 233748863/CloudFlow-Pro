# PRD：线索资质评估与客户分层（CRM-04）

| 项 | 内容 |
| --- | --- |
| 条目编号 | CRM-04 |
| 所属批次 | 批次 E（第 4 份） |
| 对标依据 | `docs/benchmark/03-crm-客户经营对标.md` |
| 优先级 | P1 |
| 预估工作量 | M |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题

**① 线索画像字段太少，资质判定无处记录**
`crm_lead`（27 列）画像字段只有 `source` / `industry` / `company_name`。**谁在什么时候判定这条线索合格、判定结果是什么，全部无处记录。**

对标 ERPNext `lead`（44 字段）缺的一组资质字段：`qualified_by` / `qualified_on` / `qualification_status` / `annual_revenue` / `no_of_employees` / `market_segment` / `territory` / `job_title` / `unsubscribed`。

**② 客户分层维度不足**
`crm_customer`（36 列）有 `level_code` / `industry` / `customer_tags` / `health_level`，但缺**区域（territory）**与**细分市场（market_segment）**两个标准分层维度，且线索与客户的分层口径不一致（转化时信息丢失）。

### 1.2 目标
1. 线索补齐资质评估字段与判定动作
2. 引入区域（树形）与细分市场两个分层维度
3. 线索与客户分层口径统一（转化时信息不丢）
4. 线索评分（可选，见 §9-1）
5. 退订标记（为 CRM-02 营销做准备）

### 1.3 非目标
- 不做自动评分模型（机器学习类）
- 不做线索来源渠道成本核算（属营销分析）
- 不做客户 360 画像标签体系（现有 `customer_tags` 已够）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `crm_lead` | 27 列：`lead_no, lead_name, company_name, contact_name, mobile, phone, email, source, industry, status, owner_id, dept_id, next_follow_up_time, last_follow_up_time, converted_customer_id, converted_time, remark` + 审计列 |
| `crm_customer` | 36 列：含 `customer_code, customer_name, customer_type, industry, level_code, source, customer_tags, health_level, health_reason, pool_flag, original_owner_id` 等 |
| 线索转化 | `POST /crm/lead/convert` |
| 服务实现 | `CrmLeadServiceImpl`、`CrmCustomerServiceImpl`、`CrmHealthCalculator`（健康度计算） |
| 分配规则 | `crm_assignment_rule`(21列)：含 `rule_type, priority, inactive_days, max_per_owner, customer_level, customer_tags` |
| 区域 / 细分市场 | **无** |
| 字典 | `sys_dict_data` 可承载细分市场 |

## 3. 范围

### 3.1 做
1. `crm_lead` 增资质与画像字段
2. `crm_customer` 增 `territory_id` / `market_segment`
3. 新增 `crm_territory`（树形区域主数据）
4. 细分市场用 `sys_dict_data` 承载
5. 线索资质判定动作（qualify / disqualify）
6. 线索转化时分层信息传递
7. 线索评分（规则式，见 §9-1）
8. 退订标记

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 独立细分市场表 | 用 `sys_dict_data`，避免建小表 |
| 自动评分模型 | 只做规则式打分 |
| 区域与销售人员的自动分配绑定 | 现有 `crm_assignment_rule` 可扩展，本期只提供区域字段 |
| 潜客池（Prospect）实体 | 现有客户公海机制思路相近，暂不新建实体 |

## 4. 功能需求

### FR-1 线索资质与画像字段
- FR-1.1 `crm_lead` 增字段：
  ```
  资质判定：
    qualification_status   UNQUALIFIED 未评估 / QUALIFYING 评估中 /
                           QUALIFIED 合格 / DISQUALIFIED 不合格
    qualified_by / qualified_by_name    判定人
    qualified_time                       判定时间
    disqualify_reason                    不合格原因
  企业画像：
    annual_revenue         年营收 DECIMAL(14,2)
    employee_scale         员工规模（字典：1-10/11-50/51-200/201-500/501-1000/1000+）
    market_segment         细分市场（字典）
    territory_id           区域（引用 crm_territory）
    job_title              联系人职位
    website                企业官网
  营销：
    campaign_id            来源营销活动（CRM-02 预留）
    unsubscribe_flag       是否退订
    unsubscribe_time       退订时间
  评分：
    lead_score             线索评分 INT
    score_updated_time     评分更新时间
  ```
- FR-1.2 `qualification_status` 默认 `UNQUALIFIED`

### FR-2 客户分层字段
- FR-2.1 `crm_customer` 增：`territory_id`、`market_segment`、`employee_scale`、`annual_revenue`、`unsubscribe_flag`
- FR-2.2 与线索字段**同名同义**，保证转化时可直接映射

### FR-3 区域主数据
- FR-3.1 新增 `crm_territory`：`territory_id, tenant_id, territory_code, territory_name, parent_id, level_path VARCHAR(500), sort_no, owner_id(区域负责人), status, remark` + 审计列
- FR-3.2 树形结构用 `parent_id` + `level_path`（物化路径，与 OA-05 项目任务树同一方案，避免 lft/rgt 维护成本）
- FR-3.3 区域可设负责人（为后续按区域自动分配预留）
- FR-3.4 种子数据：按中国省级行政区预置一级区域（可选，见 §9-3）

### FR-4 资质判定动作
- FR-4.1 `POST /crm/lead/{id}/qualify`：入参可带评估说明；置 `qualification_status=QUALIFIED`、记 `qualified_by` / `qualified_time`
- FR-4.2 `POST /crm/lead/{id}/disqualify`：必填 `disqualifyReason`；置 `DISQUALIFIED`
- FR-4.3 `POST /crm/lead/{id}/start-qualifying`：置 `QUALIFYING`（表示正在评估）
- FR-4.4 只有 `QUALIFIED` 状态的线索可转化为客户（`POST /crm/lead/convert` 增此前置校验）
- FR-4.5 `DISQUALIFIED` 线索可重新评估（回到 `QUALIFYING`）

### FR-5 线索评分（规则式）
- FR-5.1 新增 `crm_lead_score_rule`：`rule_id, tenant_id, rule_name, field_name, operator, field_value, score, enabled_flag, sort_no` + 审计列
  - 例：`annual_revenue >= 10000000` → +20 分；`employee_scale = '1000+'` → +15 分；`industry = 'FINANCE'` → +10 分
- FR-5.2 评分计算：线索创建或更新时按启用规则累加得 `lead_score`
- FR-5.3 评分可手工重算（单条或批量）
- FR-5.4 线索列表可按评分排序与筛选
- FR-5.5 评分只作参考，**不自动改变 `qualification_status`**（判定仍需人工）

### FR-6 转化信息传递
- FR-6.1 `POST /crm/lead/convert` 时将线索的分层与画像字段映射到客户：
  `territory_id` / `market_segment` / `industry` / `employee_scale` / `annual_revenue` / `source` / `campaign_id` / `unsubscribe_flag`
- FR-6.2 转化后线索保留（`converted_customer_id` 已有字段），可追溯来源
- FR-6.3 联系人信息转为 `crm_contact`（现有逻辑，确认是否已实现）

### FR-7 退订
- FR-7.1 `unsubscribe_flag=1` 的线索与客户，在 CRM-02 营销群发时被排除
- FR-7.2 退订可由销售手工标记，或后续由营销邮件的退订链接触发（CRM-02）
- FR-7.3 退订状态不影响正常业务往来（只影响营销触达）

### FR-8 报表
- FR-8.1 线索资质漏斗：未评估 → 评估中 → 合格 → 已转化
- FR-8.2 按区域/细分市场/行业/评分区间的线索与客户分布
- FR-8.3 图表用批次 A LC-05

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `crm_territory`、`crm_lead_score_rule` |
| 改造 | `crm_lead`（增 15 字段） |
| 改造 | `crm_customer`（增 5 字段） |
| 复用 | `sys_dict_data`（细分市场、员工规模） |

`DB/05.cloudflow-crm.sql`：+2 表

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| 树形性能 | 区域树用 `level_path` 物化路径，查子树用 `LIKE 'path%'`；层级限制 5 层 |
| 评分性能 | 规则数量有限（预期 < 50 条），线索更新时同步计算；批量重算走异步任务 |
| 数据一致性 | 线索与客户的同名字段取值范围必须一致（同一字典） |
| 权限 | 资质判定需 `crm:lead:qualify` 权限；区域主数据需 `crm:territory:*` |
| 审计 | 资质判定、退订标记记 `sys_audit_log` |
| 转化完整性 | 转化时字段映射不能丢失（AC-8 验证） |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 线索 15 个新字段均可录入与查询 |
| AC-2 | 三个资质判定动作正确流转状态并记录判定人与时间 |
| AC-3 | `disqualify` 必填原因；未填被拒绝 |
| AC-4 | **只有 `QUALIFIED` 线索可转化；其他状态转化被拒绝** |
| AC-5 | `DISQUALIFIED` 线索可重新评估回到 `QUALIFYING` |
| AC-6 | 区域树可维护（增删改、拖拽调整层级）；层级超 5 层被拒绝 |
| AC-7 | 区域按 `level_path` 查子树正确 |
| AC-8 | **线索转化时分层与画像字段完整映射到客户，无丢失** |
| AC-9 | 评分规则可配置；线索评分按规则正确累加 |
| AC-10 | 评分可批量重算；列表可按评分排序筛选 |
| AC-11 | 评分变化不自动改变 `qualification_status` |
| AC-12 | 退订标记的线索与客户在营销群发时被排除（CRM-02 落地后验证） |
| AC-13 | 线索资质漏斗与分层分布报表正确 |
| AC-14 | 资质判定与退订标记记审计 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A LC-05 图表库** | 漏斗与分布报表 |
| 现有 `sys_dict_data` | 细分市场、员工规模字典 |
| 批次 A SYS-07 | 两张表 CRUD 生成 |
| CRM-02 营销闭环 | `campaign_id` 与退订联动（弱依赖，字段先预留） |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| 字段增加过多导致线索录入负担重 | 大部分字段可选；表单分区（基础信息 / 企业画像 / 资质评估）；配合批次 C 的 LC-02 布局容器 |
| 「只有 QUALIFIED 可转化」的约束可能阻碍现有工作方式 | AC-4 是产品决策；若阻碍太大可改为"警告但允许"（走 `sys_business_rule`）。建议先按严格版，观察反馈 |
| 评分规则配错导致评分失真 | 评分只作参考不影响判定（FR-5.5）；提供试算（给定线索看得分明细） |
| 区域主数据初始化工作量 | §9-3 建议预置省级区域种子数据 |
| 线索与客户字段口径不一致导致转化映射错乱 | NFR 要求同一字典；AC-8 专项验证 |

## 9. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 线索评分本期是否做 | 建议做**规则式简版**（FR-5）。成本低（1 表 + 累加逻辑），且能立刻让销售按优先级跟进。不做自动模型 |
| 2 | 「只有 QUALIFIED 可转化」是否过严 | 建议先严格（AC-4），因为这是资质评估能落地的关键约束；若反馈阻碍大，改走 `sys_business_rule` 的 WARN 态 |
| 3 | 区域是否预置省级种子数据 | 建议预置（34 个省级行政区），减少初始化工作量；租户可自行调整 |
| 4 | 是否需要 Prospect（潜客）实体 | 建议不新建。现有客户公海（`pool_flag` + `crm_customer_pool_log` + `crm_assignment_rule`）机制已覆盖"暂不跟进但保留"的场景 |
| 5 | 区域负责人是否用于自动分配 | 本期只存字段；自动分配需扩展 `crm_assignment_rule` 增区域维度，可后续小改动补上 |
