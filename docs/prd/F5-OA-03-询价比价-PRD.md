# PRD：采购询价比价（OA-03）

| 项 | 内容 |
| --- | --- |
| 条目编号 | OA-03 |
| 所属批次 | 批次 F（第 5 份，**依赖 OA-02 供应商主数据**） |
| 对标依据 | `docs/benchmark/02-oa-协同办公对标.md` |
| 优先级 | P1 |
| 预估工作量 | L |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题：采购申请时供应商已定，没有比价环节

`biz_purchase_request`（33 列）直接填一个 `supplier_id` 及其快照字段（`supplier_contact` / `supplier_phone` / `supplier_bank` / `supplier_account`）。

**这意味着采购合规缺一环** —— 谁决定用这家供应商？比过几家？为什么选它？全部无记录。

对标 ERPNext 的 RFQ 流程（GPL-3.0 仅借鉴设计）：一次询价（`request_for_quotation`，30 字段）发给多个供应商（`_supplier` 明细），每家回一份报价（`supplier_quotation`），系统横向比价选定。

### 1.2 目标
1. 询价单（一次询价对多家供应商）
2. 供应商报价录入（采购员代录或供应商自填，见 §9-1）
3. 横向比价视图
4. 定标与理由记录
5. 定标结果带入采购申请
6. 与 OA-02 的供应商准入联动

### 1.3 非目标
- 不做供应商门户（供应商自助报价）—— 见 §9-1
- 不做招投标流程（公开招标、投标保证金等）
- 不做电子招采平台对接
- 不做报价的自动评标算法（只做数据呈现，人工定标）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `biz_purchase_request` | 33 列：`purchase_no, supplier_id, supplier_name, supplier_contact, supplier_phone, supplier_bank, supplier_account, total_amount, expected_date, reason, status, payment_status, payment_request_id, attachment_url, dept_id, project_id, customer_id, budget_subject_code` + 审计列 |
| `biz_purchase_item` | 采购明细 |
| `biz_purchase_receipt` | 采购收货 |
| `oa_supplier` | **OA-02 已扩展**（含 `prevent_rfq_flag` / `standing` / `blacklist_flag`） |
| 询价 | **完全没有** |
| 接口 | `/oa/purchase-request` CRUD（`PurchaseRequestController`） |
| 前端 | `pages/PurchaseRequestPage.tsx` + CSS |
| 消息中心 | 批次 A SYS-01 已交付（邮件渠道可用） |

## 3. 范围

### 3.1 做
1. 新增 `oa_purchase_rfq`（询价单）
2. 新增 `oa_purchase_rfq_item`（询价物料明细）
3. 新增 `oa_purchase_rfq_supplier`（被邀供应商）
4. 新增 `oa_supplier_quotation` + `oa_supplier_quotation_item`（供应商报价）
5. 比价视图
6. 定标与采购申请联动
7. 邀请通知（走 SYS-01 邮件）
8. 与 OA-02 准入联动

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 供应商门户自助报价 | 需对外暴露面与独立鉴权域，风险与成本高；本期采购员代录（§9-1） |
| 招投标流程 | 公开招标涉及法规要求，超出办公协同范畴 |
| 自动评标算法 | 只做数据呈现，定标由人工决策 |
| 报价议价轮次 | 本期一轮报价；多轮议价可后续评估 |

## 4. 功能需求

### FR-1 询价单
- FR-1.1 新增 `oa_purchase_rfq`：
  | 字段 | 说明 |
  | --- | --- |
  | rfq_id | PK |
  | tenant_id | 租户 |
  | rfq_no | 询价单号 |
  | title | 询价标题 |
  | purchase_request_id | 关联采购申请（可为空，先询价后申请） |
  | dept_id / dept_name | 需求部门 |
  | project_id / project_name | 关联项目 |
  | owner_id / owner_name | 采购负责人 |
  | quote_deadline | 报价截止日期 |
  | expected_delivery_date | 期望交付日期 |
  | delivery_address | 交付地址 |
  | payment_terms | 付款条件 |
  | terms_content | 询价条款说明 |
  | invited_count | 邀请供应商数 |
  | responded_count | 已报价数 |
  | status | DRAFT 草稿 / SENT 已发出 / QUOTING 报价中 / COMPARING 比价中 / AWARDED 已定标 / CANCELLED 已取消 / FAILED 流标 |
  | awarded_supplier_id / awarded_supplier_name | 中标供应商 |
  | awarded_quotation_id | 中标报价 |
  | awarded_amount | 中标金额 DECIMAL(14,2) |
  | award_reason | 定标理由 |
  | award_by / award_time | 定标人与时间 |
  | instance_id | 审批实例（定标需审批时） |
  | attachment_url | 附件（技术要求文档等） |
  | + 审计列 | |
- FR-1.2 询价单可由采购申请发起（带入明细），或独立发起后关联采购申请

### FR-2 询价物料明细
- FR-2.1 新增 `oa_purchase_rfq_item`：`item_id, tenant_id, rfq_id, sort_no, item_name, spec, unit, quantity DECIMAL(12,2), expected_price DECIMAL(12,2), brand_requirement, technical_requirement, remark` + 审计列
- FR-2.2 明细可从采购申请的 `biz_purchase_item` 带入

### FR-3 被邀供应商
- FR-3.1 新增 `oa_purchase_rfq_supplier`：`rfq_supplier_id, tenant_id, rfq_id, supplier_id, supplier_name, contact_name, contact_email, contact_phone, invite_time, invite_channel(EMAIL/PHONE/OFFLINE), respond_time, quote_status(INVITED 已邀请 / RESPONDED 已报价 / DECLINED 已拒绝 / NO_RESPONSE 未响应), decline_reason, remark` + 审计列
- FR-3.2 **邀请前校验供应商准入**（联动 OA-02）：
  - `blacklist_flag=1` 或 `prevent_rfq_flag=1` → 拒绝邀请
  - `standing=ELIMINATED` → 拒绝邀请
  - `standing=WATCH` → 警告但允许
  - 走 `sys_business_rule`（OA-02 已定义规则码，本 PRD 新增校验点）
- FR-3.3 **最少邀请数校验**：可配置（默认 3 家），少于阈值时警告（走规则中心，新增规则码 `oa.rfq.min.suppliers`）
- FR-3.4 报价截止后未响应的自动置 `NO_RESPONSE`

### FR-4 供应商报价
- FR-4.1 新增 `oa_supplier_quotation`：`quotation_id, tenant_id, quotation_no, rfq_id, supplier_id, supplier_name, quote_date, valid_until, total_amount DECIMAL(14,2), tax_amount DECIMAL(14,2), currency, payment_terms, delivery_days, delivery_date, warranty_months, attachment_url, remark, status(DRAFT/SUBMITTED/WITHDRAWN), entry_by(录入人), entry_time` + 审计列
- FR-4.2 新增 `oa_supplier_quotation_item`：`item_id, quotation_id, rfq_item_id, sort_no, item_name, spec, unit, quantity, unit_price DECIMAL(12,2), discount_rate DECIMAL(6,4), tax_rate DECIMAL(6,4), line_amount DECIMAL(14,2), brand, model, delivery_days, remark`
  - 结构参照现有 `crm_quote_line`（22 列）保持一致性
- FR-4.3 报价由采购员代录（`entry_by` 记录录入人），附上供应商正式报价单扫描件
- FR-4.4 报价明细需对应询价明细（`rfq_item_id`），便于横向对比

### FR-5 比价视图
- FR-5.1 `GET /oa/rfq/{id}/comparison`：按物料横向对比各家报价
  ```
  返回结构：
  {
    items: [{ rfqItemId, itemName, spec, quantity, expectedPrice,
               quotes: [{ supplierId, supplierName, unitPrice, lineAmount,
                          deliveryDays, brand, isLowest }] }],
    suppliers: [{ supplierId, supplierName, totalAmount, taxAmount,
                  deliveryDays, warrantyMonths, paymentTerms,
                  standing, score,          // 联动 OA-02 评分
                  isLowestTotal, rank }],
    summary: { lowestTotal, highestTotal, avgTotal, priceSpread }
  }
  ```
- FR-5.2 比价视图标注：最低单价、最低总价、交期最短
- FR-5.3 **同时展示供应商评分与分档**（OA-02 数据），避免只看价格
- FR-5.4 支持按物料维度或按供应商维度两种视角切换
- FR-5.5 可导出比价表（Excel，用现有 FastExcel）

### FR-6 定标
- FR-6.1 定标操作：选中标供应商 + 填定标理由（**必填**）
- FR-6.2 若中标价非最低价，定标理由为**强制必填且需更详细**（走规则中心，规则码 `oa.rfq.non-lowest.award`，效果 WARN）
- FR-6.3 定标可走审批（`instance_id`），金额超阈值时强制审批（复用 `oa_contract_amount_threshold` 模式或新增配置）
- FR-6.4 定标后回写 `oa_purchase_rfq` 的中标信息
- FR-6.5 定标后可一键生成/更新采购申请：带入中标供应商与报价明细到 `biz_purchase_request` + `biz_purchase_item`
- FR-6.6 流标（所有报价都不满意）时置 `FAILED`，可重新发起询价

### FR-7 邀请通知
> ⚠️ **本节部分阻塞**：批次 A A2 已定本批不做邮件渠道（无可用 SMTP）。**邮件邀请（FR-7.1/7.2/7.3/7.4）需等邮件渠道接入**。
> **不阻塞本 PRD 主体**：`invite_channel` 已设计 `PHONE` / `OFFLINE` 两种线下渠道（FR-7.5），采购员线下联系供应商并记录邀请，询价、报价录入、比价、定标全流程可正常运转。邮件只是邀请触达方式之一。

- FR-7.1 询价发出时向被邀供应商发邮件（走批次 A SYS-01 EMAIL 渠道）—— **等邮件渠道就绪**
- FR-7.2 邮件内容：询价单号、物料清单、报价截止日期、联系人、条款说明
- FR-7.3 报价截止前提醒未响应的供应商
- FR-7.4 定标后可选通知中标与未中标供应商
- FR-7.5 供应商无邮箱时 `invite_channel=PHONE/OFFLINE`，由采购员线下联系并记录

### FR-8 报表
- FR-8.1 询价统计：询价数、平均邀请家数、平均响应率、平均比价节省金额
- FR-8.2 供应商响应率排行（响应积极度是评分维度之一，可回流 OA-02）
- FR-8.3 非最低价定标清单（合规审查用）
- FR-8.4 图表用批次 A LC-05

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `oa_purchase_rfq`、`oa_purchase_rfq_item`、`oa_purchase_rfq_supplier`、`oa_supplier_quotation`、`oa_supplier_quotation_item` |
| 改造 | `biz_purchase_request`（增 `rfq_id`） |
| 复用 | `sys_business_rule`（准入与最少家数校验） |

`DB/04.cloudflow-oa.sql`：+5 表（OA-01/02/04/05/06 后为 82 → 87）

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **报价保密** | 报价截止前，各供应商报价**互相不可见**；比价视图仅采购负责人与审批人可见（`oa:rfq:comparison` 权限）。这是询价的基本合规要求 |
| 金额精度 | DECIMAL(14,2)，单价 DECIMAL(12,2)，税率与折扣 DECIMAL(6,4) |
| 定标可追溯 | 定标理由必填、定标人与时间记录、非最低价定标特别标记（FR-6.2） |
| 审计 | 邀请、报价录入、定标、流标全部记 `sys_audit_log` |
| 权限 | 询价管理 `oa:rfq:*`；比价视图与定标建议限采购负责人与管理者 |
| 邮件内容 | 不在邮件中泄露其他供应商信息 |
| 数据一致性 | 报价明细必须对应询价明细（FR-4.4），防对不上无法比价 |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 询价单可创建，明细可从采购申请带入 |
| AC-2 | 可邀请多家供应商；邀请记录邀请时间与渠道 |
| AC-3 | **黑名单/淘汰级/禁止询价的供应商无法被邀请**（联动 OA-02） |
| AC-4 | `standing=WATCH` 的供应商邀请时警告但允许 |
| AC-5 | 邀请少于最少家数阈值时警告（走规则中心） |
| AC-6 | 报价可录入（含明细），明细对应询价明细 |
| AC-7 | **比价视图横向对比正确**，标注最低单价、最低总价、最短交期 |
| AC-8 | 比价视图同时展示供应商评分与分档 |
| AC-9 | 比价视图支持物料维度与供应商维度切换 |
| AC-10 | 比价表可导出 Excel |
| AC-11 | 定标必填理由；非最低价定标时给出更强提示并记录 |
| AC-12 | 定标后回写中标信息；可一键生成采购申请并带入中标供应商与明细 |
| AC-13 | 流标可置 FAILED 并重新发起 |
| AC-14 | 询价发出时供应商收到邮件（含物料清单与截止日期） |
| AC-15 | 截止前提醒未响应供应商；截止后未响应自动置 NO_RESPONSE |
| AC-16 | **报价截止前各供应商报价互不可见** |
| AC-17 | 非授权用户无法查看比价视图 |
| AC-18 | 邮件中不含其他供应商信息 |
| AC-19 | 邀请、报价、定标、流标记审计 |
| AC-20 | 报表：询价统计、响应率排行、非最低价定标清单正确 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **OA-02 供应商评分与准入** | **强依赖**：准入校验、评分展示、`prevent_rfq_flag` |
| ⚠️ **批次 A SYS-01 邮件渠道** | 邮件邀请与提醒。**当前未满足**（A2 本批只做站内）。**但不阻塞主体**：可用 `invite_channel=PHONE/OFFLINE` 线下邀请 + 站内通知采购员，询价比价定标全流程仍可跑通 |
| **批次 A SYS-02 任务平台** | 截止提醒、未响应标记 |
| **批次 A LC-05 图表库** | 报表 |
| 现有 `sys_business_rule` | 准入与最少家数校验 |
| 现有 FastExcel | 比价表导出 |
| 现有 `biz_purchase_request` / `biz_purchase_item` | 定标后生成采购申请 |
| 现有 `crm_quote_line` | 报价明细字段结构参照 |
| 批次 A SYS-07 | 五张表 CRUD 生成 |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **报价泄露破坏询价公正性** | NFR 报价保密 + AC-16/17/18；截止前报价不可见是硬要求 |
| 采购员代录报价可能录错或作弊 | 要求上传供应商正式报价单扫描件（FR-4.3）；`entry_by` 记录录入人；审计留痕。**这是不做供应商门户的必然代价**（§9-1） |
| 询价流程增加采购周期，业务方抵触 | 提供"紧急采购免询价"通道（走审批 + 记录理由），而非强制所有采购询价；可按金额阈值决定是否必须询价 |
| 供应商无邮箱导致无法邀请 | FR-7.5 支持线下渠道记录 |
| 报价明细对不上询价明细导致无法比价 | FR-4.4 强制关联 + NFR 数据一致性 |
| 定标后采购申请已存在时如何处理 | FR-6.5 支持"生成或更新"；已提交审批的采购申请需先撤回 |
| OA-02 未完成时本 PRD 无法交付 | 强依赖已列；批次内顺序必须 OA-02 → OA-03 |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 五张表（SYS-07 生成）+ 询价单与明细 CRUD | AC-1 |
| M2 | 供应商邀请 + 准入校验 + 最少家数（联动 OA-02） | AC-2/3/4/5 |
| M3 | 报价录入 + 明细关联 | AC-6 |
| M4 | **比价视图 + 保密控制 + 导出** | AC-7/8/9/10/16/17 |
| M5 | 定标 + 理由校验 + 生成采购申请 + 流标 | AC-11/12/13 |
| M6 | 邮件邀请与提醒 + 未响应标记 | AC-14/15/18 |
| M7 | 报表 + 审计 | AC-19/20 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 供应商是否自助报价（需门户） | 建议本期**不做门户**，采购员代录 + 上传正式报价单。理由：门户需对外暴露面、独立鉴权域、供应商账号管理，成本与风险远超收益。若后续确需，应与 CRM-08 客户门户统一设计一套对外门户框架 |
| 2 | 什么金额以上必须询价 | 建议用 `sys_business_rule` 配阈值（如超 5 万必须询价，走 BLOCK；1-5 万建议询价，走 WARN）。具体金额由财务确定 |
| 3 | 最少邀请家数默认几家 | 建议 3 家（常见合规要求）；用规则中心可配 |
| 4 | 是否支持多轮议价 | 本期一轮。若需要，可通过"新建一轮询价并关联上一轮"实现，不改模型 |
| 5 | 定标是否必须审批 | 建议按金额阈值：超阈值强制审批。需在 seed 脚本预置"采购定标"流程模板 |
| 6 | 供应商响应率是否回流 OA-02 评分 | 建议回流（作为"服务响应"维度的 AUTO 数据源之一）。OA-02 的 §9-2 提到价格竞争力可从询价数据推导，本 PRD 落地后可补上这两个 AUTO 维度 |
