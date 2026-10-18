# PRD：合同履约清单与签署留痕（OA-06）

| 项 | 内容 |
| --- | --- |
| 条目编号 | OA-06 |
| 所属批次 | 批次 F（第 4 份） |
| 对标依据 | `docs/benchmark/02-oa-协同办公对标.md` |
| 优先级 | P1 |
| 预估工作量 | M |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题

`oa_contract` 已有 **37 列**（字段相当丰富：`invoice_status` / `risk_level` / `seal_application_id` / `archive_attachment_url` / `template_id` / `budget_subject_code` 等），配套 4 张表（`oa_contract_template` / `oa_contract_milestone` / `oa_contract_payment_schedule` / `oa_contract_amount_threshold`）。

**但缺两块**：

**① 无逐条履约清单**
`oa_contract_milestone` 是**节点**（时间点 + 金额），不是**条款验收**。合同里"乙方应在 30 日内提供培训"这类条款，无法逐条打勾确认履约。

**② 无签署留痕**
HR 侧有 `hr_contract_signature`（员工合同签署），但 OA 商务合同**没有签署人、签署时间、签署 IP**。对标 ERPNext `contract` 的 `is_signed` / `signee` / `signed_on` / **`ip_address`** —— IP 地址是电子签署的取证要素。

### 1.2 目标
1. 合同履约条款清单（逐条验收）
2. 履约状态由清单完成度推导
3. 签署留痕（签署人、时间、IP、方式）
4. 模板自带履约条款
5. 履约超期写风险告警

### 1.3 非目标
- 不做第三方电子签章对接（法大大/e签宝），只做留痕字段
- 不做合同全文条款解析（不做 NLP 提取条款）
- 不做合同变更与补充协议（可后续评估）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `oa_contract` | 37 列：`contract_no, contract_name, counterparty_name, contract_type, amount, currency, owner_id, dept_id, project_id, customer_id, budget_subject_code, invoice_status, start_date, end_date, attachment_url, archive_attachment_url, instance_id, seal_application_id, status, risk_level, source_type, template_id` + 审计列 |
| `oa_contract_template` | 合同模板 |
| `oa_contract_milestone` | 合同里程碑（时间点 + 金额） |
| `oa_contract_payment_schedule` | 付款计划 |
| `oa_contract_amount_threshold` | 金额阈值（配合规则中心） |
| HR 签署 | `hr_contract_signature`（**可参照其字段设计**） |
| 风险告警 | `oa_risk_alert`（可复用） |
| 时间线 | `oa_trace_event` + `/oa/timeline`（可复用） |
| 定时任务 | `OaBorrowOverdueJob.scanContractRisks()`（合同风险扫描，已有） |
| 规则中心 | 已有 `oa.contract.risk.threshold` 规则码 |
| 接口 | `/oa/contract` CRUD、`/oa/contract-template`、`/oa/contract-amount-threshold` |

## 3. 范围

### 3.1 做
1. 新增 `oa_contract_fulfilment_term`（履约条款）
2. 新增 `oa_contract_template_term`（模板履约条款）
3. `oa_contract` 增履约与签署字段
4. 履约状态推导
5. 履约超期告警（复用现有机制）
6. 签署留痕

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 第三方电子签章对接 | 需商务采购与合规评估；本期只做留痕字段，为后续对接留位置 |
| 合同条款 NLP 提取 | 超出范围 |
| 合同变更与补充协议 | 可后续评估（需版本化设计） |
| 合同全生命周期归档策略 | 现有 `archive_attachment_url` 已覆盖基础归档 |

## 4. 功能需求

### FR-1 履约条款清单
- FR-1.1 新增 `oa_contract_fulfilment_term`：
  | 字段 | 说明 |
  | --- | --- |
  | term_id | PK |
  | tenant_id | 租户 |
  | contract_id | 合同 |
  | term_no | 条款序号 |
  | term_category | DELIVERY 交付 / PAYMENT 付款 / SERVICE 服务 / QUALITY 质量 / CONFIDENTIALITY 保密 / IP 知识产权 / OTHER |
  | term_content | 条款内容 |
  | requirement | 履约要求（具体要做什么） |
  | responsible_party | OUR 我方 / COUNTERPARTY 对方 / BOTH 双方 |
  | responsible_id / responsible_name | 我方责任人 |
  | deadline_date | 履约期限 |
  | fulfilled_flag | 是否已履约 |
  | fulfilled_date | 履约日期 |
  | fulfilled_by / fulfilled_by_name | 确认人 |
  | evidence_file_url | 履约证据（附件） |
  | evidence_remark | 证据说明 |
  | overdue_flag | 是否超期 |
  | waived_flag | 是否豁免（协商免除） |
  | waived_reason | 豁免原因 |
  | sort_no | 排序 |
  | remark | 备注 |
  | + 审计列 | |
- FR-1.2 履约确认需填日期，可选上传证据附件
- FR-1.3 豁免需填原因并记审计

### FR-2 合同履约字段
- FR-2.1 `oa_contract` 增：
  ```
  requires_fulfilment_flag   是否需要履约跟踪
  fulfilment_status          NOT_STARTED 未开始 / ONGOING 履约中 /
                             FULFILLED 已履约 / PARTIALLY_BREACHED 部分违约 / BREACHED 违约
  fulfilment_deadline        整体履约期限
  fulfilled_term_count       已履约条款数
  total_term_count           总条款数
  fulfilment_progress        履约进度 DECIMAL(6,2)
  ```
- FR-2.2 `fulfilment_status` 由清单推导：
  - 无条款或 `requires_fulfilment_flag=0` → `NOT_STARTED`
  - 部分已履约 → `ONGOING`
  - 全部已履约（含豁免） → `FULFILLED`
  - 有超期未履约但未全超 → `PARTIALLY_BREACHED`
  - 整体期限已过且有未履约 → `BREACHED`
- FR-2.3 条款状态变更时实时重算合同履约状态

### FR-3 签署留痕
- FR-3.1 `oa_contract` 增：
  ```
  signed_flag              是否已签署
  sign_method              OFFLINE 线下纸质 / ESIGN 电子签章 / SCAN 扫描件确认
  our_signee_id / our_signee_name    我方签署人
  our_sign_time            我方签署时间
  our_sign_ip              我方签署 IP
  counterparty_signee      对方签署人姓名
  counterparty_sign_time   对方签署时间
  sign_place               签署地点
  sign_remark              签署备注
  signed_file_url          已签署文件
  esign_provider           电子签章服务商（预留）
  esign_transaction_id     电子签章流水号（预留）
  ```
- FR-3.2 我方签署时自动记录当前登录用户与请求 IP（**不由前端传，服务端取**）
- FR-3.3 签署后合同关键字段（金额、期限、对方）锁定不可改（需变更走另外流程）
- FR-3.4 可参照 `hr_contract_signature` 的字段设计保持一致性

### FR-4 模板履约条款
- FR-4.1 新增 `oa_contract_template_term`：`template_term_id, template_id, term_no, term_category, term_content, requirement, responsible_party, deadline_offset_days, sort_no`
  - `deadline_offset_days`：相对合同起始日的偏移天数，套模板时换算为实际日期
- FR-4.2 从模板创建合同时自动生成履约条款清单
- FR-4.3 可从现有合同反向保存条款为模板

### FR-5 履约提醒与告警
- FR-5.1 条款到期前提醒责任人（提前天数可配）
- FR-5.2 条款超期时置 `overdue_flag=1` 并写 `oa_risk_alert`（复用现有表）
- FR-5.3 合同整体履约违约时告警给合同负责人与其上级
- FR-5.4 扫描任务复用现有 `scanContractRisks()` 扩展（或新增，交由批次 A SYS-02 纳管）
- FR-5.5 到期时间计算用工作日（批次 A 节假日日历）还是自然日，见 §9-2

### FR-6 时间线与审计
- FR-6.1 条款履约确认、豁免、签署事件写 `oa_trace_event`（复用现有统一时间线）
- FR-6.2 签署、豁免、条款变更记 `sys_audit_log`

### FR-7 报表
- FR-7.1 履约看板：进行中合同的履约进度、超期条款清单
- FR-7.2 履约率统计（按合同类型、按负责人、按对方）
- FR-7.3 图表用批次 A LC-05

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `oa_contract_fulfilment_term`、`oa_contract_template_term` |
| 改造 | `oa_contract`（37 列 → 约 55 列） |
| 复用 | `oa_risk_alert`、`oa_trace_event` |

`DB/04.cloudflow-oa.sql`：+2 表（OA-01/02/04/05 后为 80 → 82）

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **签署 IP 由服务端取** | 不信任前端传值（FR-3.2），从请求上下文获取；需处理反向代理场景（读 `X-Forwarded-For` 首个可信值） |
| 签署后锁定 | FR-3.3，关键字段不可改 |
| 状态一致性 | 条款变更时实时重算合同履约状态（FR-2.3） |
| 证据文件安全 | 履约证据走 `sys_file`，访问需权限（配合批次 G SYS-04） |
| 审计 | 签署、豁免、条款变更记审计（FR-6.2） |
| 权限 | 合同管理 `oa:contract:*`；豁免建议限管理者角色 |
| 精度 | 履约进度 DECIMAL(6,2) |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 履约条款可逐条录入、分类、指定责任人与期限 |
| AC-2 | 条款可确认履约并上传证据附件 |
| AC-3 | 条款可豁免，需填原因并记审计 |
| AC-4 | **合同履约状态由清单正确推导**（五种状态逐个验证） |
| AC-5 | 条款状态变更时合同履约状态与进度实时更新 |
| AC-6 | 条款到期前提醒责任人 |
| AC-7 | 条款超期置 `overdue_flag` 并写 `oa_risk_alert` |
| AC-8 | 合同整体违约时告警给负责人与上级 |
| AC-9 | **签署时服务端记录当前用户与真实 IP（前端传假 IP 无效）** |
| AC-10 | 签署后金额、期限、对方等关键字段不可修改 |
| AC-11 | 三种签署方式均可记录 |
| AC-12 | 从模板创建合同时自动生成履约条款，`deadline_offset_days` 正确换算为实际日期 |
| AC-13 | 可从现有合同反向保存条款为模板 |
| AC-14 | 履约确认、豁免、签署事件在统一时间线可见 |
| AC-15 | 履约看板与履约率报表正确 |
| AC-16 | 履约证据附件访问需权限 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A SYS-01 消息中心** | 到期提醒与违约告警 |
| **批次 A SYS-02 任务平台** | 履约扫描任务 |
| **批次 A LC-05 图表库** | 报表 |
| 现有 `oa_risk_alert` / `oa_trace_event` | 告警与时间线（直接复用） |
| 现有 `scanContractRisks()` | 扫描任务可扩展 |
| 现有 `hr_contract_signature` | 签署字段设计参照 |
| 批次 A HR-04 节假日日历 | 到期计算（若用工作日，见 §9-2） |
| 批次 G SYS-04 | 证据文件签名 URL（弱依赖） |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| 履约条款需人工逐条录入，落地阻力 | 模板自带条款（FR-4）大幅降低录入量；标准合同类型预置模板 |
| `requires_fulfilment_flag=0` 时功能形同不存在 | 默认值需谨慎：建议默认 0（不强制），由业务按合同重要性开启，避免给所有合同增加负担 |
| 签署 IP 在反向代理场景下取错 | NFR 明确处理方式；需确认网关是否正确透传 `X-Forwarded-For` |
| 签署后锁定字段可能阻碍正常修正 | 提供"合同变更"通道（走审批修改），而非允许直接改 |
| 履约状态五态推导逻辑易错 | AC-4 逐态验证 |
| 与 `oa_contract_milestone` 职能混淆 | 产品上明确：里程碑是**时间与金额节点**（关联付款），履约条款是**义务清单**（关联验收）。两者并存不冲突 |
| 无第三方签章对接，`signed_flag` 仅为人工标记 | 明确定位为"留痕"而非"电子签"；`esign_*` 字段预留便于后续对接 |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 两张表（SYS-07 生成）+ 合同字段扩展 | — |
| M2 | 履约条款 CRUD + 确认 + 豁免 + 状态推导 | AC-1/2/3/4/5 |
| M3 | 签署留痕（含服务端 IP 获取 + 字段锁定） | AC-9/10/11 |
| M4 | 模板条款 + 套用 + 反向保存 | AC-12/13 |
| M5 | 提醒与告警 + 时间线 + 审计 | AC-6/7/8/14 |
| M6 | 报表 + 权限 | AC-15/16 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | `requires_fulfilment_flag` 默认值 | 建议默认 **0**（不强制履约跟踪）。理由：给所有合同强制录条款会造成负担与形式化打勾；由业务按合同金额或重要性开启（可用 `oa_contract_amount_threshold` 联动：超一定金额自动开启） |
| 2 | 条款到期用工作日还是自然日 | 建议**自然日**（合同期限通常按自然日约定），与 CRM SLA 的工作日逻辑不同。若个别条款需工作日，可在条款上加标记 |
| 3 | 是否对接第三方电子签章 | 本期不做。若后续对接，`esign_provider` / `esign_transaction_id` 字段已预留；需先做合规评估与商务采购 |
| 4 | 合同变更与补充协议是否需要 | 本期不做。若需要，建议按"合同版本化"设计（类似流程定义版本机制），是一个独立条目 |
| 5 | 履约条款是否需要对方确认 | 本期只做我方内部确认。若需对方确认，涉及客户门户（CRM-08），依赖对外暴露面 |
