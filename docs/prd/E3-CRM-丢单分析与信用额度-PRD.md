# PRD：丢单原因结构化与客户信用额度（CRM-05 + CRM-06）

| 项 | 内容 |
| --- | --- |
| 条目编号 | CRM-05 丢单原因与竞对 · CRM-06 客户信用额度 |
| 所属批次 | 批次 E（第 3 份，两项都是 S 且都复用现有机制，合并交付） |
| 对标依据 | `docs/benchmark/03-crm-客户经营对标.md` |
| 优先级 | P1 —— 两项都是小改动、直接见效 |
| 预估工作量 | S+S |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 CRM-05：丢单原因是自由文本，无法分析

`crm_opportunity.lost_reason` 是自由文本字段，`POST /opportunity/{id}/lose` 存文本。后果：
- 无法回答"我们主要输给谁、因为什么"
- `CrmDashboardController` 的 `/dashboard/summary` 因此没有可分析内容
- 无竞争对手主数据

### 1.2 CRM-06：有完整回款账龄，但没有额度控制

已有 `crm_receivable`（25 列）+ `GET /receivable/aging` 账龄分析，但**没有额度概念** —— 客户欠款再多也不阻止新报价、新合同。

**这一项的实现成本极低**：项目已有 `sys_business_rule` 规则中心（含草稿/版本/发布/回滚/命中记录，三态 BLOCK/WARN/PASS），只需新增规则码并接入校验点。

### 1.3 目标
1. 丢单原因结构化为主数据 + 明细，支持多原因与竞对关联
2. 竞争对手主数据
3. 客户信用额度与超期欠款阈值
4. 报价/合同前置额度校验（走现有规则中心）
5. 喂给现有 dashboard 可分析内容

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `crm_opportunity` | 27 列，`lost_reason` 为自由文本；有 `stage` / `win_rate` / `expected_amount` / `stage_changed_time` |
| 丢单接口 | `POST /crm/opportunity/{id}/lose` |
| `crm_receivable` | 25 列：`planned_amount, received_amount, outstanding_amount, due_date, received_date, invoice_status` + 审计列 |
| 账龄接口 | `GET /crm/receivable/aging` |
| 报价提交 | `POST /crm/quote/submit/{id}` |
| 合同草稿 | `POST /crm/quote/{id}/contract-draft`、`POST /crm/customer/{id}/workspace/contract-draft` |
| 规则中心 | `sys_business_rule`(14列) + `sys_business_rule_version` + `sys_business_rule_hit_record`；现有规则码 `hr.leave.quota.limit` / `oa.expense.amount.limit` / `oa.contract.risk.threshold`；三态 BLOCK/WARN/PASS |
| Dashboard | `CrmDashboardController` 的 `/summary` 与 `/workplace` |
| 竞对 | **无** |

## 3. 范围

### 3.1 做（CRM-05）
1. 新增 `crm_lost_reason`（丢单原因主数据）
2. 新增 `crm_competitor`（竞争对手）
3. 新增 `crm_opportunity_lost_detail`（丢单明细，多原因 + 竞对）
4. `POST /opportunity/{id}/lose` 入参结构化
5. Dashboard 增丢单原因 TOP 与竞对胜负比

### 3.2 做（CRM-06）
1. 新增 `crm_customer_credit`（客户信用额度）
2. 新增规则码 `crm.credit.limit` 接入规则中心
3. 报价提交与合同草稿前置额度校验
4. 命中写 `sys_business_rule_hit_record`
5. 额度使用情况视图

### 3.3 不做
| 项 | 原因 |
| --- | --- |
| 自建规则引擎 | 复用 `sys_business_rule`（项目已有且带版本回滚，PLAN.md 明确不引入第二套规则平台） |
| 竞对情报管理（竞品对比表、报价情报） | 超出本期；只做基础主数据 |
| 信用评分模型 | 只做额度阈值，不做评分算法 |
| 赢单原因分析 | 本期只做丢单（赢单原因价值较低，可后续对称补充） |

## 4. 功能需求（CRM-05）

### FR-1 丢单原因主数据
- FR-1.1 新增 `crm_lost_reason`：`reason_id, tenant_id, reason_code, reason_name, reason_category(PRICE 价格 / PRODUCT 产品 / SERVICE 服务 / COMPETITOR 竞对 / TIMING 时机 / BUDGET 预算 / RELATIONSHIP 关系 / OTHER), sort_no, status, remark` + 审计列
- FR-1.2 种子数据预置常用原因（价格过高、功能不满足、竞对中标、预算取消、项目延期、决策人变更等）

### FR-2 竞争对手
- FR-2.1 新增 `crm_competitor`：`competitor_id, tenant_id, competitor_code, competitor_name, website, industry, scale, strength, weakness, our_advantage, our_disadvantage, threat_level(HIGH/MEDIUM/LOW), status, remark` + 审计列
- FR-2.2 竞对可在商机丢单与赢单时关联

### FR-3 丢单明细
- FR-3.1 新增 `crm_opportunity_lost_detail`：`detail_id, tenant_id, opportunity_id, lost_reason_id, competitor_id, amount_lost DECIMAL(14,2), is_primary_flag(主因), remark` + 审计列
  - 一个商机可有多条（多原因），其中一条标 `is_primary_flag=1` 为主因
- FR-3.2 `crm_opportunity` 保留 `lost_reason` 文本字段作为补充说明（不删，改为"其他说明"语义）

### FR-4 丢单接口改造
- FR-4.1 `POST /crm/opportunity/{id}/lose` 入参改为：
  ```
  { reasons: [{reasonId, competitorId?, amountLost?, isPrimary, remark?}], comment? }
  ```
- FR-4.2 校验：至少一条原因、必须有且仅有一条 `isPrimary=true`
- FR-4.3 兼容：`comment` 存入 `crm_opportunity.lost_reason` 作为补充说明

### FR-5 Dashboard 增强
- FR-5.1 `/crm/dashboard/summary` 增：
  - 丢单原因 TOP N（按数量与金额两个维度）
  - 竞对胜负比（对每个竞对的赢单数 vs 丢单数）
  - 丢单金额趋势
- FR-5.2 图表用批次 A LC-05 的组件（柱状 + 饼图）

## 5. 功能需求（CRM-06）

### FR-6 客户信用额度
- FR-6.1 新增 `crm_customer_credit`：
  | 字段 | 说明 |
  | --- | --- |
  | credit_id | PK |
  | tenant_id | 租户 |
  | customer_id | 客户 |
  | credit_limit | 信用额度 DECIMAL(14,2) |
  | overdue_threshold | 超期欠款阈值 DECIMAL(14,2) |
  | currency | 币种 |
  | bypass_flag | 例外放行开关 |
  | bypass_reason | 放行原因 |
  | bypass_by / bypass_time | 放行人与时间 |
  | bypass_expire_date | 放行有效期 |
  | effective_start / effective_end | 额度生效期 |
  | status | ENABLED / DISABLED |
  | remark | 备注 |
  | instance_id | 额度审批实例 |
  | + 审计列 | |

  唯一索引 `uk_customer(tenant_id, customer_id)`（一客户一条有效额度）
- FR-6.2 额度变更走审批（复用工作流，`instance_id`）
- FR-6.3 `bypass_flag` 放行需填原因、记录放行人、可设有效期（防永久放行）

### FR-7 额度占用计算
- FR-7.1 已占用额度 = 未回款金额（`crm_receivable.outstanding_amount` 求和，状态非已关闭）+ 在途合同金额（可选，见 §9-2）
- FR-7.2 超期欠款 = 已过 `due_date` 且未回款的金额求和
- FR-7.3 可用额度 = `credit_limit` - 已占用额度
- FR-7.4 额度视图：客户详情页展示额度、已占用、可用、超期欠款

### FR-8 规则中心接入
- FR-8.1 新增规则码：
  | 规则码 | 判定 | 建议默认效果 |
  | --- | --- | --- |
  | `crm.credit.limit` | 新单金额 + 已占用 > 信用额度 | WARN |
  | `crm.credit.overdue` | 超期欠款 > `overdue_threshold` | BLOCK |
- FR-8.2 规则的 `threshold_value` 与效果（BLOCK/WARN/PASS）在规则中心配置，**支持草稿/发布/回滚**（现有能力）
- FR-8.3 校验点：
  - `POST /crm/quote/submit/{id}`（报价提交）
  - `POST /crm/quote/{id}/contract-draft`（合同草稿生成）
  - `POST /crm/customer/{id}/workspace/contract-draft`
- FR-8.4 `BLOCK` 时拒绝并返回明确提示（含额度、已占用、超期金额）；`WARN` 时允许但提示并记录
- FR-8.5 `bypass_flag=1` 且未过期时跳过校验，但**仍记录命中**（便于审计放行行为）
- FR-8.6 命中写 `sys_business_rule_hit_record`（表已存在）

## 6. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `crm_lost_reason`、`crm_competitor`、`crm_opportunity_lost_detail`、`crm_customer_credit` |
| 改造 | `crm_opportunity`（`lost_reason` 语义改为补充说明） |
| 复用 | `sys_business_rule` + `_version` + `_hit_record` |

`DB/05.cloudflow-crm.sql`：+4 表

## 7. 非功能需求

| 项 | 要求 |
| --- | --- |
| 额度计算实时性 | 每次校验实时计算已占用（不缓存），保证准确；单客户计算 < 100ms |
| 额度精度 | DECIMAL(14,2)，不用浮点 |
| 审计 | 额度设置与变更、bypass 放行、BLOCK 拦截全部记 `sys_audit_log` |
| 规则一致性 | 必须走 `sys_business_rule`，不在代码里硬编码阈值 |
| 权限 | 额度管理需 `crm:credit:*` 权限；bypass 放行建议限管理者角色 |
| 幂等 | 同一单据重复校验不产生重复命中记录（或命中记录可去重查询） |

## 8. 验收标准

### CRM-05
| # | 验收项 |
| --- | --- |
| AC-1 | 丢单时可选多个原因并指定主因；无原因或多个主因时被拒绝 |
| AC-2 | 丢单可关联竞对与丢单金额 |
| AC-3 | Dashboard 展示丢单原因 TOP（数量与金额两维度） |
| AC-4 | Dashboard 展示竞对胜负比 |
| AC-5 | `comment` 补充说明存入 `crm_opportunity.lost_reason` |
| AC-6 | 丢单原因与竞对主数据可维护（含停用） |

### CRM-06
| # | 验收项 |
| --- | --- |
| AC-7 | 客户额度可设置并走审批 |
| AC-8 | 额度视图正确展示额度/已占用/可用/超期欠款 |
| AC-9 | 已占用额度计算正确（未回款金额求和） |
| AC-10 | 超期欠款计算正确（已过 due_date 且未回款） |
| AC-11 | **`crm.credit.overdue` 设为 BLOCK 时，超期欠款超阈值的客户无法提交报价** |
| AC-12 | `crm.credit.limit` 设为 WARN 时允许提交但有提示 |
| AC-13 | 在规则中心改效果（BLOCK→WARN）后即时生效，无需发版 |
| AC-14 | 规则版本回滚后校验行为回到旧版本 |
| AC-15 | `bypass_flag=1` 时跳过校验但仍记录命中 |
| AC-16 | bypass 过期后恢复校验 |
| AC-17 | 命中记录写入 `sys_business_rule_hit_record` |
| AC-18 | BLOCK 拦截与 bypass 放行均记 `sys_audit_log` |

## 9. 依赖与风险

### 9.1 依赖
| 依赖 | 说明 |
| --- | --- |
| 现有 `sys_business_rule` 三表 | 规则配置与命中记录；**这是 CRM-06 成本低的关键** |
| 现有 `crm_receivable` | 额度占用计算数据源 |
| **批次 A LC-05 图表库** | Dashboard 丢单分析图表 |
| 现有工作流 | 额度变更审批 |
| 批次 A SYS-07 | 四张表 CRUD 生成 |

### 9.2 风险

| 风险 | 应对 |
| --- | --- |
| 额度校验拦截影响销售正常工作（配置过严） | 默认 `crm.credit.limit` 为 WARN、`crm.credit.overdue` 为 BLOCK；规则中心可随时调整（AC-13）；bypass 提供例外通道 |
| bypass 被滥用成常态放行 | bypass 需填原因 + 记录放行人 + 可设有效期（FR-6.3）；放行行为记审计（AC-18）；建议定期审查 bypass 记录 |
| 已占用额度计算口径争议（是否含在途合同） | §9-2 待确认；建议先只算未回款，口径简单清晰 |
| 丢单原因主数据设计不合理导致销售乱选 | 种子数据预置常用原因（FR-1.2）；`reason_category` 分类便于选择；后续按使用情况优化 |
| 商机丢单接口改造影响前端 | 入参结构变化需前端同步；项目未上线，直接改 |

## 10. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 四张表（SYS-07 生成）+ 主数据维护 | AC-6 |
| M2 | 丢单接口改造 + 明细落库 | AC-1/2/5 |
| M3 | Dashboard 丢单分析 | AC-3/4 |
| M4 | 额度管理 + 占用计算 + 额度视图 | AC-7/8/9/10 |
| M5 | 规则中心接入 + 三个校验点 + bypass | AC-11~AC-18 |

## 11. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 赢单原因是否也要结构化 | 建议本期不做。丢单分析价值更高；若后续需要可对称新增 `crm_win_reason` 与明细表 |
| 2 | 已占用额度是否含在途合同金额 | 建议**只算未回款**（口径清晰、计算简单）。若业务要求含在途合同，需定义"在途"边界（已签未回款？已报价未签？），复杂度上升 |
| 3 | 额度是否按币种分别管理 | 本期单币种（字段预留 `currency`）；多币种需汇率折算，无需求不做 |
| 4 | bypass 有效期默认多长 | 建议默认 30 天，最长 90 天，强制填写 |
| 5 | 额度变更审批走哪个流程模板 | 需在 `06.cloudflow-business-seed.sql` 预置一个"客户额度调整"流程模板 |
