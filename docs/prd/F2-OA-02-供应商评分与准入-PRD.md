# PRD：供应商评分与准入拦截（OA-02）

| 项 | 内容 |
| --- | --- |
| 条目编号 | OA-02 |
| 所属批次 | 批次 F（第 2 份） |
| 对标依据 | `docs/benchmark/02-oa-协同办公对标.md` |
| 优先级 | P0 |
| 预估工作量 | M |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题：14 列的供应商表

`oa_supplier` 仅 **14 列**：`supplier_name, contact_name, contact_phone, bank_name, bank_account, status` + 审计列。

**没有资质、没有分类、没有评分、没有黑名单。** 采购申请（`biz_purchase_request`，33 列，已有 supplier 快照字段）可以选任意 `status` 正常的供应商 —— 采购合规缺一环。

对标 ERPNext `supplier_scorecard`（16 字段 + 8 个配套 doctype，GPL-3.0 仅借鉴设计）的关键设计：
- `criteria`（评分标准）+ `weighting_function`（加权）+ `supplier_score` + `indicator_color`（红黄绿）
- `standings`（分档：优秀/合格/观察/淘汰）
- **`warn_rfqs` / `warn_pos` / `prevent_rfqs` / `prevent_pos`** —— 分数低时**警告或直接阻止**发询价/下采购单，**评分不是摆设而是真拦截**
- `notify_supplier` / `notify_employee` 分数变动通知

### 1.2 目标
1. 供应商主数据补齐（资质、分类、信用代码等）
2. 资质证件管理与到期提醒
3. 周期性评分（多维度加权）
4. 分档与准入拦截（走现有规则中心）
5. 黑名单

### 1.3 非目标
- 不做供应商门户（供应商自助维护资料）
- 不做供应商对账与结算（走现有付款申请）
- 不做供应商绩效的自动数据采集（评分数据本期人工录入 + 部分自动，见 §9-2）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `oa_supplier` | 14 列（见 §1.1） |
| 采购申请 | `biz_purchase_request`(33 列)，含 `supplier_id, supplier_name, supplier_contact, supplier_phone, supplier_bank, supplier_account`（快照字段） |
| 采购明细 | `biz_purchase_item`、`biz_purchase_receipt` |
| 付款申请 | `biz_payment_request` |
| 合同 | `oa_contract`(37 列) |
| 证照到期提醒模式 | `oa_license` + `oa_license_expiry_reminder_log` + `OaBorrowOverdueJob.scanExpiringLicenses()`（**成熟模式，可直接照搬**） |
| 规则中心 | `sys_business_rule` 三表，现有规则码含 `oa.expense.amount.limit` / `oa.contract.risk.threshold` |
| 供应商接口 | `/oa/supplier` CRUD（`SupplierController`，80 行，标准 CRUD） |
| 供应商实体 | `SysSupplier`（`@TableName("oa_supplier")`） |

## 3. 范围

### 3.1 做
1. `oa_supplier` 增 15+ 字段
2. 新增 `oa_supplier_category`（分类）
3. 新增 `oa_supplier_qualification`（资质证件）
4. 新增 `oa_supplier_scorecard`（周期评分）
5. 新增 `oa_supplier_score_criteria`（评分维度明细）
6. 资质到期提醒（复用现有模式）
7. 准入拦截接入规则中心
8. 黑名单

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 供应商门户 | 需对外暴露面，成本与风险高；本期供应商资料由采购人员维护 |
| 供应商对账结算 | 现有付款申请已覆盖 |
| 评分数据全自动采集 | 部分维度可自动（如交付及时率从采购收货推导），部分需人工（服务质量）；见 §9-2 |
| 供应商准入审批流 | 可复用现有工作流，本期只提供 `instance_id` 字段 |

## 4. 功能需求

### FR-1 供应商主数据扩展
- FR-1.1 `oa_supplier` 增字段：
  ```
  基础：
    supplier_code          供应商编号
    supplier_type          MANUFACTURER 生产商 / DEALER 经销商 / SERVICE 服务商 / INDIVIDUAL 个体
    category_id            分类引用
    short_name             简称
  工商信息：
    credit_code            统一社会信用代码
    legal_person           法人
    register_capital       注册资本 DECIMAL(14,2)
    register_date          成立日期
    business_scope         经营范围
    address                地址
    province / city
  联系与商务：
    contact_email
    tax_no                 税号
    tax_rate               默认税率 DECIMAL(6,4)
    payment_terms          付款条件（字典：预付/货到付款/月结30天/月结60天）
    currency               默认币种
  合作与评价：
    cooperation_start_date 合作起始日
    level_code             等级（字典）
    score                  当前评分 DECIMAL(5,2)
    standing               EXCELLENT 优秀 / QUALIFIED 合格 / WATCH 观察 / ELIMINATED 淘汰
    indicator_color        RED / YELLOW / GREEN（由 standing 推导）
    last_score_time        最近评分时间
  准入控制：
    blacklist_flag         是否黑名单
    blacklist_reason       拉黑原因
    blacklist_by / blacklist_time
    prevent_purchase_flag  是否禁止采购
    prevent_rfq_flag       是否禁止询价（OA-03 用）
  资质：
    qualification_expire_date  最早的资质到期日（冗余，便于提醒查询）
  审批：
    instance_id            准入审批实例
  ```
- FR-1.2 `credit_code` 唯一性校验（同租户内不允许重复）

### FR-2 供应商分类
- FR-2.1 新增 `oa_supplier_category`：`category_id, tenant_id, category_code, category_name, parent_id, level_path, sort_no, status, remark` + 审计列
- FR-2.2 树形（`parent_id` + `level_path`，与项目其他树形一致）

### FR-3 资质证件
- FR-3.1 新增 `oa_supplier_qualification`：
  ```
  qualification_id, tenant_id, supplier_id
  qualification_type   BUSINESS_LICENSE 营业执照 / TAX_REGISTRATION 税务登记 /
                       ISO 认证 / INDUSTRY_PERMIT 行业许可 / BANK_INFO 开户许可 /
                       CREDIT_REPORT 信用报告 / OTHER
  cert_name            证件名称
  cert_no              证件编号
  issue_org            发证机构
  issue_date           发证日期
  expire_date          到期日期（长期有效时为空）
  long_term_flag       是否长期有效
  file_url             证件扫描件
  verify_status        PENDING 待核验 / VERIFIED 已核验 / REJECTED 不通过 / EXPIRED 已过期
  verify_by / verify_time / reject_reason
  reminder_days        到期提前提醒天数
  + 审计列
  ```
- FR-3.2 资质到期提醒：复用 `oa_license_expiry_reminder_log` 的模式，新增 `oa_supplier_qualification_reminder_log`（或复用统一提醒日志，见 §9-3）
- FR-3.3 关键资质（营业执照）过期时自动置 `verify_status=EXPIRED` 并影响 standing
- FR-3.4 `oa_supplier.qualification_expire_date` 由最早到期的有效资质回填（便于列表提醒查询）

### FR-4 周期评分
- FR-4.1 新增 `oa_supplier_scorecard`：`scorecard_id, tenant_id, supplier_id, period_type(MONTHLY/QUARTERLY/YEARLY), period_start, period_end, total_score DECIMAL(5,2), standing, indicator_color, warn_flag, prevent_flag, calc_time, calc_by, remark, status(DRAFT/CONFIRMED)` + 审计列
- FR-4.2 新增 `oa_supplier_score_criteria`：`criteria_id, scorecard_id, criteria_code, criteria_name, weight DECIMAL(6,4), score DECIMAL(5,2), max_score DECIMAL(5,2), data_source(AUTO/MANUAL), auto_value, remark`
- FR-4.3 评分维度（可配置，预置四项）：
  | 维度 | 权重建议 | 数据来源 |
  | --- | --- | --- |
  | 交付及时率 | 30% | AUTO（从 `biz_purchase_receipt` 的实际收货日 vs 期望日推导） |
  | 质量合格率 | 30% | MANUAL（收货验收记录，本期人工） |
  | 价格竞争力 | 20% | MANUAL（或从 OA-03 询价比价数据推导） |
  | 服务响应 | 20% | MANUAL |
- FR-4.4 加权总分 = Σ(维度得分 × 权重)
- FR-4.5 分档规则（可配阈值）：≥90 EXCELLENT / ≥75 QUALIFIED / ≥60 WATCH / <60 ELIMINATED
- FR-4.6 评分确认后回填 `oa_supplier.score` / `standing` / `indicator_color` / `last_score_time`
- FR-4.7 评分周期由内置任务（批次 A SYS-02）按周期生成待评分记录并提醒

### FR-5 准入拦截（接入规则中心）
- FR-5.1 新增规则码：
  | 规则码 | 判定 | 建议默认效果 |
  | --- | --- | --- |
  | `oa.supplier.standing.limit` | 供应商 standing 为 WATCH | WARN |
  | `oa.supplier.eliminated.block` | 供应商 standing 为 ELIMINATED | BLOCK |
  | `oa.supplier.blacklist.block` | 供应商在黑名单 | BLOCK |
  | `oa.supplier.qualification.expired` | 关键资质已过期 | BLOCK |
- FR-5.2 校验点：
  - `POST /oa/purchase-request`（采购申请提交）
  - `POST /oa/rfq`（询价发起，OA-03 落地后）
  - 合同创建时选供应商（`oa_contract`）
- FR-5.3 `BLOCK` 时拒绝并返回明确原因（含 standing / 黑名单原因 / 过期资质名称）
- FR-5.4 `WARN` 时允许但提示并记录
- FR-5.5 命中写 `sys_business_rule_hit_record`
- FR-5.6 效果与阈值在规则中心配置，支持草稿/发布/回滚（现有能力）

### FR-6 黑名单
- FR-6.1 拉黑操作：填原因、记录操作人与时间，置 `blacklist_flag=1` + `prevent_purchase_flag=1`
- FR-6.2 拉黑建议走审批（`instance_id`）
- FR-6.3 解除黑名单同样需审批与记录
- FR-6.4 黑名单供应商在选择列表中标红并禁选（前端）+ 服务端拦截（FR-5）

### FR-7 通知
- FR-7.1 资质到期提醒（提前 `reminder_days`）
- FR-7.2 评分周期到期提醒（提醒采购人员评分）
- FR-7.3 standing 降级通知（如从 QUALIFIED 降为 WATCH）
- FR-7.4 全部走批次 A SYS-01

### FR-8 报表
- FR-8.1 供应商分档分布（红黄绿饼图）
- FR-8.2 评分趋势（按供应商按周期）
- FR-8.3 资质到期预警清单
- FR-8.4 采购金额 TOP 供应商 vs 其评分（发现"大额采购但评分低"的风险）
- FR-8.5 图表用批次 A LC-05

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `oa_supplier_category`、`oa_supplier_qualification`、`oa_supplier_scorecard`、`oa_supplier_score_criteria` |
| 改造 | `oa_supplier`（14 列 → 约 40 列） |
| 复用 | `sys_business_rule` 三表 |

`DB/04.cloudflow-oa.sql`：+4 表（OA-01 后为 69 → 73）

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| 规则一致性 | 拦截必须走 `sys_business_rule`，不硬编码阈值 |
| 评分精度 | DECIMAL(5,2)，权重 DECIMAL(6,4)；加权计算不用浮点 |
| 权重校验 | 同一评分卡的维度权重之和必须为 1（或 100%），保存时校验 |
| 自动数据准确性 | AUTO 维度的计算逻辑需可追溯（记录计算依据的单据范围） |
| 审计 | 拉黑/解黑、评分确认、standing 变更、BLOCK 拦截全部记 `sys_audit_log` |
| 权限 | 供应商管理 `oa:supplier:*`；拉黑与评分确认建议限管理者角色 |
| 唯一性 | `credit_code` 同租户唯一（FR-1.2） |
| 资质文件安全 | 证件扫描件走 `sys_file`，访问需权限（配合批次 G SYS-04 签名 URL） |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 供应商新增字段均可录入；`credit_code` 重复被拒绝 |
| AC-2 | 供应商分类树可维护 |
| AC-3 | 资质证件可录入、上传扫描件、核验 |
| AC-4 | 资质到期按 `reminder_days` 提醒；到期后自动置 `EXPIRED` |
| AC-5 | `oa_supplier.qualification_expire_date` 由最早到期资质正确回填 |
| AC-6 | 评分卡可创建，四个维度可录入；权重之和不为 1 时保存被拒绝 |
| AC-7 | 加权总分计算正确；分档按阈值正确判定 |
| AC-8 | AUTO 维度（交付及时率）从采购收货数据正确推导，计算依据可追溯 |
| AC-9 | 评分确认后回填供应商 `score` / `standing` / `indicator_color` |
| AC-10 | **`oa.supplier.eliminated.block` 生效时，淘汰级供应商无法提交采购申请** |
| AC-11 | **黑名单供应商无法提交采购申请；前端列表标红禁选** |
| AC-12 | 关键资质过期的供应商无法提交采购申请 |
| AC-13 | `WARN` 级（WATCH 档）允许提交但有提示并记录命中 |
| AC-14 | 在规则中心改效果（BLOCK→WARN）后即时生效 |
| AC-15 | 拉黑与解黑走审批并记审计 |
| AC-16 | standing 降级时发出通知 |
| AC-17 | 报表：分档分布、评分趋势、资质预警、采购额 vs 评分对比正确 |
| AC-18 | 命中记录写入 `sys_business_rule_hit_record` |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| 现有 `sys_business_rule` 三表 | 准入拦截；**这是本 PRD 成本可控的关键** |
| **批次 A SYS-01 消息中心** | 各类提醒与通知 |
| **批次 A SYS-02 任务平台** | 资质到期扫描、评分周期生成 |
| **批次 A LC-05 图表库** | 报表 |
| 现有 `biz_purchase_receipt` | AUTO 维度（交付及时率）数据源 |
| 现有证照到期提醒模式 | 直接照搬 |
| 批次 F OA-03 询价 | `prevent_rfq_flag` 生效点（弱依赖） |
| 批次 G SYS-04 | 资质文件签名 URL（弱依赖） |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **准入拦截过严影响正常采购** | 默认只对 ELIMINATED 与黑名单 BLOCK，WATCH 仅 WARN；规则中心可随时调整（AC-14）；紧急采购需通道见 §9-4 |
| AUTO 维度计算逻辑可能与业务理解不一致 | 计算依据可追溯（NFR）；先只做交付及时率一个 AUTO 维度，其余人工 |
| 评分需人工录入，可能长期不评导致 standing 失真 | 评分周期提醒（FR-7.2）；报表暴露"长期未评分"供应商 |
| 供应商主数据字段增加多，录入负担重 | 多数字段可选；表单分区（配合批次 C 的 LC-02 布局） |
| 资质文件属敏感材料 | 权限 + 签名 URL（NFR） |
| 现有 `SysSupplier` 实体与快照字段改造影响采购流程 | 项目未上线可直接改；`biz_purchase_request` 的供应商快照字段保留（快照设计是合理的，不改） |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 分类 + 供应商字段扩展 + 唯一性（SYS-07 生成） | AC-1/2 |
| M2 | 资质管理 + 核验 + 到期提醒 + 回填 | AC-3/4/5 |
| M3 | 评分卡 + 维度 + 加权 + 分档 + AUTO 维度 | AC-6/7/8/9 |
| M4 | **准入拦截（规则中心接入）+ 黑名单** | AC-10/11/12/13/14/18 |
| M5 | 审批 + 通知 + 审计 | AC-15/16 |
| M6 | 报表 | AC-17 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 评分维度是否需要按供应商类型差异化 | 建议本期统一四维度；若服务商与生产商考核差异大，后续可在 `oa_supplier_category` 上挂维度模板 |
| 2 | AUTO 维度本期做几个 | 建议只做**交付及时率**一个（数据源 `biz_purchase_receipt` 明确）。价格竞争力需 OA-03 询价数据，等 OA-03 落地后补 |
| 3 | 资质到期提醒日志是否复用统一表 | 建议新增 `oa_supplier_qualification_reminder_log`（与现有 seal/license 模式一致）。若觉得提醒日志表过多，可考虑后续统一为 `oa_expiry_reminder_log` + `biz_type`，但那是重构不在本期 |
| 4 | 紧急采购如何绕过拦截 | 建议提供"例外放行"：类似 CRM-06 的 bypass 机制（填原因 + 记录人 + 有效期 + 审计），而非直接改规则 |
| 5 | 供应商准入是否走审批 | 建议新增供应商走审批（`instance_id` 已预留），需在 seed 脚本预置"供应商准入"流程模板 |
