# PRD：资产全生命周期（OA-01）

| 项 | 内容 |
| --- | --- |
| 条目编号 | OA-01 |
| 所属批次 | 批次 F（第 1 份） |
| 对标依据 | `docs/benchmark/02-oa-协同办公对标.md` |
| 优先级 | P0 —— OA 模块"表面有实际空"最严重的一块 |
| 预估工作量 | L |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题：18 列 vs 52 字段

`oa_asset` 仅 **18 列**：`asset_code, name, category, model, status, price, purchase_date, owner_id, location, remark` + 审计列。

对标 ERPNext `asset`（**52 字段**，GPL-3.0 仅借鉴设计）缺的四大块：

| 缺失块 | 具体 |
| --- | --- |
| **折旧** | `calculate_depreciation` / `depreciation_method` / `total_number_of_depreciations` / `frequency_of_depreciation` / `next_depreciation_date` / `opening_accumulated_depreciation` / `value_after_depreciation` + `asset_depreciation_schedule` 逐期计划表 |
| **保险** | `policy_number` / `insurer` / `insured_value` / `insurance_start_date` / `insurance_end_date` |
| **维保维修** | `asset_maintenance` + `_task` + `_team` + `_log`；`asset_repair`（20 字段，含 `downtime` 停机时长 / `increase_in_asset_life` 维修延长寿命 / `capitalize_repair_cost`） |
| **归属与调拨** | `custodian`（保管人，与 `asset_owner` 分离）/ `location` 独立主数据（树形）/ `asset_movement` 带 `purpose` |

**实测确认**：全仓搜 `depreciat` 只命中车辆维保相关文件（`VehicleMaintenance` 等），资产折旧确实不存在。

### 1.1B 🟠 但状态操作**已实现**（2026-08-31 摸排修正）

**实测 `AssetServiceImpl`（223 行）已有 7 个方法**：
```java
generateQrCode(assetId, outputStream)   // ← 资产二维码标签（本 PRD §FR-8 想做的）
borrowAsset(assetId, userId)            // 借用
returnAsset(assetId)                    // 归还
repairAsset(assetId, remark)            // 报修
scrapAsset(assetId, remark)             // 报废
getStatistics()                         // 统计
getAllCategories()                      // 分类列表（从现有数据 distinct）
```

**双向影响**：

| 方面 | 修正 |
| --- | --- |
| 工作量**下降** | 借用/归还/维修/报废的**状态流转已实现**，不需从零做；二维码标签已有；分类列表已有（虽是 distinct 而非主数据表） |
| 工作量**不变** | 这些方法是"改 `oa_asset.status` + 记 `oa_asset_log`"，**无结构化记录**：维修无停机时长/维修费用/是否资本化字段，无维保计划，无折旧计划。本 PRD 的 18 列 → 42 列判断成立 |

**本 PRD §3.1 的定位调整**：从"新建维修/调拨能力"改为**"把现有状态操作扩展为结构化单据"**。工作量 **L → M+**。

**现状后果**（修正后）：资产有基本的借还修废状态流转，但无折旧、无保险、无维保计划、无维修明细记录、无停机统计。`oa_asset_log` 承担了状态变更日志但无结构化字段。

### 1.2 目标
1. 资产折旧（含逐期计划与过账）
2. 保险信息与到期提醒
3. 维保计划与维修记录
4. 资产分类主数据（带折旧默认值）
5. 保管人与位置结构化
6. 调拨结构化

### 1.3 非目标
- 不做会计科目与总账过账（我们不是 ERP，只算折旧额不过账）
- 不做资产资本化与在建工程
- 不做资产盘点（可后续评估）
- 不做耗材库存（OA-08，批次 H）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `oa_asset` | 18 列（见 §1.1） |
| `oa_asset_log` | 通用资产日志 |
| `oa_consumable` | 耗材（OA-08 处理） |
| `oa_supplier` | 14 列（OA-02 处理） |
| 车辆体系 | `oa_vehicle` + `_usage` + `_expense` + `_maintenance` + `_violation` + `_fuel_log`（6 表，**很完整，维保模式可参照**） |
| 到期提醒模式 | `oa_seal_expiry_reminder_log`、`oa_license_expiry_reminder_log`、`oa_borrow_reminder_log`（**成熟模式，可直接照搬**） |
| 风险告警 | `oa_risk_alert`（可复用） |
| 时间线 | `oa_trace_event` + `/oa/timeline`（可复用） |
| 定时任务 | `OaBorrowOverdueJob`（含借用超期/证照到期/合同风险三个任务，模式可参照） |
| 资产接口 | `/oa/asset` CRUD（`AssetController`） |
| **资产 service** | **`AssetServiceImpl`（223 行）已有 7 方法**：`generateQrCode` / `borrowAsset` / `returnAsset` / `repairAsset` / `scrapAsset` / `getStatistics` / `getAllCategories`（详见 §1.1B） |
| 前端 | `pages/admin/asset/AssetForm.tsx` |

## 3. 范围

### 3.1 做
1. `oa_asset` 增 20+ 字段（折旧/保险/归属）
2. 新增 `oa_asset_category`（分类主数据 + 折旧默认值）
3. 新增 `oa_asset_depreciation_schedule`（折旧计划）
4. 新增 `oa_asset_maintenance_plan` + `oa_asset_maintenance_task`
5. 新增 `oa_asset_repair`
6. 新增 `oa_asset_movement`
7. 折旧计算与过账任务
8. 保险与维保到期提醒（复用现有模式）

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 会计科目 / 总账过账 | 不是 ERP；只算折旧额，不做 `asset_category_account` / `journal_entry_for_scrap` |
| 一物多账（finance_books） | 我们无税务账与会计账分离需求 |
| 资产资本化 / 在建工程 | 超出范围 |
| 资产盘点 | 可后续评估（需扫码等配套） |
| 位置树形主数据 | 用文本 + 可选的简单枚举（见 §9-2） |

## 4. 功能需求

### FR-1 资产分类主数据
- FR-1.1 新增 `oa_asset_category`：`category_id, tenant_id, category_code, category_name, parent_id, level_path, default_useful_life_months, default_depreciation_method, default_salvage_rate DECIMAL(6,4), maintenance_required_flag, sort_no, status, remark` + 审计列
- FR-1.2 树形（`parent_id` + `level_path` 物化路径，与项目其他树形方案一致）
- FR-1.3 新建资产选分类后自动带入折旧默认值（可覆盖）
- FR-1.4 `oa_asset.category` 文本字段改为 `category_id` 引用（项目未上线直接改）

### FR-2 资产主表扩展
- FR-2.1 `oa_asset` 增字段：
  ```
  归属：
    category_id            分类引用
    custodian_id / custodian_name    保管人（与 owner 分离：owner 是使用人，custodian 是保管责任人）
    dept_id / dept_name    归属部门
    location_detail        位置详情
  金额与折旧：
    purchase_amount        购入金额 DECIMAL(14,2)
    salvage_value          残值 DECIMAL(14,2)
    useful_life_months     使用寿命（月）
    available_from_date    可用起始日（折旧起算日）
    disposal_date          处置日期
    depreciation_flag      是否计提折旧
    depreciation_method    STRAIGHT_LINE 直线法 / DOUBLE_DECLINING 双倍余额递减 / SUM_OF_YEARS 年数总和
    depreciation_frequency MONTHLY / QUARTERLY / YEARLY
    accumulated_depreciation  累计折旧 DECIMAL(14,2)
    net_book_value         净值 DECIMAL(14,2)
    next_depreciation_date 下次折旧日
    depreciation_completed_flag  折旧是否完成
  保险：
    insurance_policy_no, insurer_name, insured_value,
    insurance_start_date, insurance_end_date, insurance_reminder_days
  维保：
    maintenance_required_flag
    warranty_expire_date   保修到期
  状态：
    status 扩展取值：IN_USE 在用 / IDLE 闲置 / MAINTENANCE 维修中 /
                    SCRAPPED 已报废 / DISPOSED 已处置 / LOST 丢失
  ```
- FR-2.2 `price` 字段保留或改名为 `purchase_amount`（统一命名，项目未上线直接改）

### FR-3 折旧
- FR-3.1 新增 `oa_asset_depreciation_schedule`：`schedule_id, tenant_id, asset_id, period_no, period_date, depreciation_amount DECIMAL(14,2), accumulated_amount DECIMAL(14,2), net_value DECIMAL(14,2), status(PLANNED/POSTED/CANCELLED), post_time, post_by, remark` + 审计列
- FR-3.2 资产启用折旧时生成完整折旧计划（按 `useful_life_months` / `depreciation_frequency` / 方法计算每期金额）
- FR-3.3 三种折旧方法：
  - 直线法：(购入金额 - 残值) / 期数
  - 双倍余额递减法：净值 × 2/年限，最后两期改直线法
  - 年数总和法：(购入金额-残值) × 剩余年数/年数总和
- FR-3.4 折旧过账：内置任务（批次 A SYS-02 纳管）按 `next_depreciation_date` 过账当期，更新 `accumulated_depreciation` / `net_book_value` / `next_depreciation_date`
- FR-3.5 折旧完成（净值 = 残值）时置 `depreciation_completed_flag`
- FR-3.6 资产处置/报废时，未过账的计划置 `CANCELLED`
- FR-3.7 折旧计划可预览（生成前查看每期金额）
- FR-3.8 已过账期次不可修改（需冲正，见 §9-3）

### FR-4 维保
- FR-4.1 新增 `oa_asset_maintenance_plan`：`plan_id, tenant_id, asset_id, plan_name, maintenance_type(PREVENTIVE 预防性 / CALIBRATION 校准 / INSPECTION 检查), frequency(MONTHLY/QUARTERLY/HALF_YEARLY/YEARLY/CUSTOM), custom_interval_days, responsible_id, responsible_name, supplier_id, next_due_date, last_completed_date, reminder_days, status` + 审计列
- FR-4.2 新增 `oa_asset_maintenance_task`：`task_id, plan_id, asset_id, planned_date, actual_date, executor_id, executor_name, result(NORMAL/ABNORMAL/NEED_REPAIR), cost DECIMAL(12,2), description, attachment_url, status(PENDING/COMPLETED/SKIPPED)` + 审计列
- FR-4.3 内置任务按计划生成待执行维保任务并提醒（复用现有提醒模式）
- FR-4.4 维保结果为 `NEED_REPAIR` 时可一键创建维修单

### FR-5 维修
- FR-5.1 新增 `oa_asset_repair`：
  ```
  repair_id, tenant_id, repair_no, asset_id, asset_name
  failure_date            故障日期
  report_by               报修人
  fault_description       故障描述
  repair_status           REPORTED 已报修 / DIAGNOSING 诊断中 / REPAIRING 维修中 /
                          COMPLETED 已完成 / CANNOT_REPAIR 无法维修
  actions_performed       维修措施
  completion_date         完成日期
  downtime_hours          停机时长 DECIMAL(8,2)
  repair_cost             维修费用 DECIMAL(12,2)
  capitalize_flag         是否资本化（计入资产原值）
  life_extension_months   延长寿命（月）
  supplier_id             维修供应商
  repairer_name           维修人
  attachment_url
  instance_id             审批实例（费用需审批时）
  + 审计列
  ```
- FR-5.2 维修期间资产状态自动置 `MAINTENANCE`，完成后恢复
- FR-5.3 `capitalize_flag=1` 时维修费用计入资产原值并**重算剩余折旧计划**
- FR-5.4 `life_extension_months` 延长寿命时重算折旧计划
- FR-5.5 `CANNOT_REPAIR` 时可一键发起报废

### FR-6 调拨
- FR-6.1 新增 `oa_asset_movement`：`movement_id, tenant_id, movement_no, asset_id, purpose(ISSUE 领用 / RETURN 归还 / TRANSFER 调拨 / SCRAP 报废 / DISPOSE 处置 / LOST 丢失登记), from_custodian_id, from_custodian_name, to_custodian_id, to_custodian_name, from_dept_id, to_dept_id, from_location, to_location, movement_date, reason, attachment_url, status(DRAFT/APPROVING/COMPLETED/REJECTED), instance_id` + 审计列
- FR-6.2 调拨完成后更新 `oa_asset` 的保管人、部门、位置
- FR-6.3 报废/处置调拨完成后置资产状态并取消未过账折旧（FR-3.6）
- FR-6.4 `oa_asset_log` 保留作通用变更日志（记录所有字段变更），与结构化调拨表并存
- FR-6.5 时间线事件写 `oa_trace_event`（复用现有机制）

### FR-7 提醒与告警
- FR-7.1 保险到期提醒（按 `insurance_reminder_days`）
- FR-7.2 保修到期提醒
- FR-7.3 维保任务到期提醒
- FR-7.4 折旧过账失败告警
- FR-7.5 全部复用现有提醒模式（参照 `oa_license_expiry_reminder_log` 与 `OaBorrowOverdueJob`），走批次 A SYS-01 发送、SYS-02 调度
- FR-7.6 风险写 `oa_risk_alert`（复用现有表）

### FR-8 报表
- FR-8.1 资产台账（含原值、累计折旧、净值）
- FR-8.2 资产分类分布、部门分布、状态分布
- FR-8.3 折旧汇总（按期间、按分类）
- FR-8.4 维修成本与停机时长统计
- FR-8.5 图表用批次 A LC-05

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `oa_asset_category`、`oa_asset_depreciation_schedule`、`oa_asset_maintenance_plan`、`oa_asset_maintenance_task`、`oa_asset_repair`、`oa_asset_movement` |
| 改造 | `oa_asset`（18 列 → 约 42 列） |
| 保留 | `oa_asset_log`（通用变更日志） |

`DB/04.cloudflow-oa.sql`：63 → 69 表

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **金额精度** | 全部 DECIMAL(14,2)，折旧计算**不用浮点**；末期需处理舍入差额（最后一期补齐到残值） |
| 折旧幂等 | 同一资产同一期次不重复过账（唯一索引 `uk_asset_period`） |
| 折旧准确性 | 三种方法需用真实案例验证；提供计划预览（FR-3.7）便于财务核对 |
| 过账不可逆 | 已过账期次不可改（AC-8），需冲正机制 |
| 性能 | 1000 资产月度折旧过账走异步任务（SYS-02），单资产计划生成 < 100ms |
| 状态一致性 | 资产状态与维修/调拨状态需联动，不能出现"维修单已完成但资产仍是维修中" |
| 审计 | 折旧过账、资产处置报废、调拨、维修费用资本化全部记 `sys_audit_log` |
| 权限 | 资产管理需 `oa:asset:*`；折旧过账与处置建议限管理者角色 |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 资产分类树可维护；新建资产选分类后自动带入折旧默认值 |
| AC-2 | **三种折旧方法计算正确**（用真实案例逐个验证：直线法、双倍余额递减、年数总和） |
| AC-3 | 折旧计划可预览；生成的每期金额之和 + 残值 = 购入金额（末期舍入正确） |
| AC-4 | 折旧过账任务按 `next_depreciation_date` 正确过账，累计折旧与净值更新 |
| AC-5 | 同一资产同一期次不重复过账（幂等） |
| AC-6 | 折旧完成时置 `depreciation_completed_flag`，不再过账 |
| AC-7 | 资产处置报废后未过账计划置 CANCELLED |
| AC-8 | **已过账期次不可修改** |
| AC-9 | 保险与保修到期按提醒天数触发提醒 |
| AC-10 | 维保计划按频率生成待执行任务并提醒 |
| AC-11 | 维保结果 `NEED_REPAIR` 可一键创建维修单 |
| AC-12 | 维修期间资产状态自动置 MAINTENANCE，完成后恢复 |
| AC-13 | `capitalize_flag=1` 时维修费用计入原值并重算剩余折旧计划 |
| AC-14 | `life_extension_months` 延长寿命后折旧计划正确重算 |
| AC-15 | 六种调拨用途均正确；完成后资产保管人/部门/位置更新 |
| AC-16 | 调拨与维修事件写 `oa_trace_event`，在统一时间线可见 |
| AC-17 | 1000 资产月度过账走异步任务不阻塞接口 |
| AC-18 | 资产台账报表原值/累计折旧/净值三栏正确 |
| AC-19 | 折旧过账、处置、调拨、资本化记审计 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A SYS-02 任务平台** | 折旧过账、维保任务生成、到期提醒；强依赖 |
| **批次 A SYS-01 消息中心** | 各类提醒 |
| **批次 A LC-05 图表库** | 报表 |
| 现有 `oa_risk_alert` / `oa_trace_event` | 告警与时间线 |
| 现有到期提醒模式 | 直接照搬（印章证照已有成熟实现） |
| 批次 F OA-02 供应商 | 维修与维保供应商引用（弱依赖） |
| 批次 A SYS-07 | 六张表 CRUD 生成 |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **折旧算错影响财务数据** | AC-2 用真实案例逐方法验证；计划预览（FR-3.7）让财务提前核对；末期舍入处理明确（AC-3） |
| 三种折旧方法实现复杂度被低估 | 独立里程碑 M2；每方法单测覆盖边界（首期、末期、中途变更） |
| 已过账数据被误改 | AC-8；已过账期次只读 |
| 资产状态与维修/调拨状态不一致 | NFR 状态一致性；维修与调拨完成时统一更新资产状态 |
| 维修资本化后重算折旧的逻辑复杂 | AC-13/14 专项验证；重算时保留已过账期次不变，只重算未过账部分 |
| `oa_asset.category` 从文本改引用影响现有数据与前端 | 项目未上线可直接改；需同步改 `AssetForm.tsx` |
| 与车辆体系的重叠（车辆也是资产） | 车辆保持独立 6 表（已很完整）；车辆不纳入 `oa_asset`，避免大改。若需统一台账，报表层做 union |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 分类主数据 + `oa_asset` 字段扩展（SYS-07 生成）| AC-1 |
| M2 | **折旧计算三方法 + 计划生成 + 预览** | AC-2/3 |
| M3 | 折旧过账任务 + 幂等 + 完成判定 + 取消 | AC-4/5/6/7/8/17 |
| M4 | 维保计划与任务 + 提醒 | AC-9/10/11 |
| M5 | 维修单 + 状态联动 + 资本化与寿命延长重算 | AC-12/13/14 |
| M6 | 调拨 + 时间线 + 审计 | AC-15/16/19 |
| M7 | 报表 | AC-18 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 车辆是否纳入资产统一管理 | 建议**不纳入**。车辆已有 6 表完整体系（使用/费用/维保/违章/加油），纳入会导致大改且收益有限。若需统一台账视图，报表层 union 即可 |
| 2 | 位置是否需要树形主数据 | 建议本期用文本 `location` + `location_detail`。若后续有多园区多楼层管理需求再建 `oa_location` 树形表 |
| 3 | 已过账折旧如何冲正 | 建议：不允许修改已过账期次，但允许通过"资产价值调整"单据（新增一条调整记录）修正净值，保留完整轨迹。本期可先只做不可改，冲正需求出现时再补 |
| 4 | 折旧是否需要与 OA 预算/费用联动 | 本期不做。折旧是账面计算，不产生实际付款；若财务需要计入部门成本，可在报表层按部门汇总 |
| 5 | 资产盘点是否需要 | 本期不做（§3.2）。盘点通常需扫码/RFID 配套，建议单独评估 |
