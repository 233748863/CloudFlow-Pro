# PRD：项目工时成本与任务树（OA-04 + OA-05）

| 项 | 内容 |
| --- | --- |
| 条目编号 | OA-04 项目工时与成本双轨 · OA-05 项目任务树与依赖 |
| 所属批次 | 批次 F（第 3 份，**两项必须同批**：工时要挂到任务上才有意义） |
| 对标依据 | `docs/benchmark/02-oa-协同办公对标.md` |
| 优先级 | P0（OA-04）+ P1（OA-05） |
| 预估工作量 | L+L |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题

**① 项目有 5 张表，但成本是手填的**
`oa_project`（36 列）有 `budget_amount` / `actual_cost_amount` / `progress` / `baseline_version`，但**没有工时表**。实际成本从哪来？只能手工填。结果：项目毛利、人力投入、人均产出全部算不出来。

实测确认：全仓搜 `timesheet` / `workHour` **无任何痕迹**。

**② 里程碑平铺，无任务树**
`oa_project_milestone`（20 列）平铺无层级；`oa_project_dependency` 有依赖表但挂在里程碑上；`oa_work_task` 是通用任务（有 `parentId` 父子与级联，但不挂项目 WBS）。项目进度（`oa_project.progress`）靠手填。无项目模板。

### 1.2 目标
1. 工时填报与审批
2. **成本与计费双轨**（内部成本 vs 对客计费，差额即毛利）
3. 项目任务树（WBS）与依赖
4. 项目进度由任务加权自动算
5. 项目模板（一键生成任务树）
6. 项目成本分析

### 1.3 非目标
- 不做资源排程与产能规划（甘特图排程优化）
- 不做与 CRM 的收入确认联动（`oa_invoice` 已有开票）
- 不做敏捷看板（`oa_work_task` 已有 `TaskBoard.tsx`）
- 不做工时与 HR 考勤的强制对账（见 §9-3）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `oa_project` | 36 列：`project_no, project_name, project_type, customer_id, contract_id, owner_id, dept_id, start_date, end_date, actual_start_date, actual_end_date, budget_amount, actual_cost_amount, progress, priority, status, risk_level, source_type, baseline_version` + 审计列 |
| `oa_project_member` | 项目成员 |
| `oa_project_milestone` | 20 列：`milestone_name, milestone_code, owner_id, planned_date, baseline_date, actual_date, progress, sort_order, status` + 审计列（**平铺无层级**） |
| `oa_project_risk` | 项目风险 |
| `oa_project_dependency` | 依赖（当前挂里程碑） |
| `oa_work_task` | 通用任务，**实测有 `parentId` 父子结构**：`WorkTaskServiceImpl` 有 `hasUnfinishedChildren()` 与 `cascadeToParent()` 级联逻辑 |
| 工时 | **完全没有** |
| 前端 | `pages/ProjectManagementPage.tsx` + CSS、`TaskBoard.tsx` |
| 接口 | `/oa/project` CRUD（`ProjectController`）、`/oa/work-task`（`WorkTaskController`） |

## 3. 范围

### 3.1 做
1. 新增 `oa_activity_type` + `oa_activity_cost`（活动类型与单价）
2. 新增 `oa_timesheet` + `oa_timesheet_detail`（工时）
3. 新增 `oa_project_task`（任务树）
4. 新增 `oa_project_template` + `oa_project_template_task`
5. `oa_project` 增成本与毛利字段
6. `oa_project_dependency` 改挂任务
7. 工时审批（复用工作流）
8. 项目进度自动汇总
9. 成本分析报表

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 资源排程与产能规划 | 复杂度高，需求不明确 |
| 甘特图排程优化算法 | 只做展示不做优化 |
| 与 CRM 收入确认联动 | 现有 `oa_invoice` 已覆盖开票 |
| 工时与考勤强制对账 | §9-3（只做交叉校验提示，不强制） |
| `oa_work_task` 与 `oa_project_task` 合并 | 两者语义不同（通用任务 vs 项目 WBS），见 §9-1 |

## 4. 功能需求（OA-04 工时与成本）

### FR-1 活动类型与单价
- FR-1.1 新增 `oa_activity_type`：`type_id, tenant_id, type_code, type_name, billable_default_flag, sort_no, status, remark` + 审计列
  - 预置：开发 / 设计 / 测试 / 需求分析 / 项目管理 / 售前支持 / 差旅 / 培训 / 内部会议
- FR-1.2 新增 `oa_activity_cost`：`cost_id, tenant_id, activity_type_id, employee_id, job_level_id, costing_rate DECIMAL(12,2), billing_rate DECIMAL(12,2), currency, effective_start, effective_end, status` + 审计列
  - 单价可按**员工**或按**职级**配置（`employee_id` 与 `job_level_id` 二选一）
  - 匹配优先级：员工级 > 职级 > 默认
- FR-1.3 `costing_rate`（内部成本单价）与 `billing_rate`（对客计费单价）分离 —— **这是成本与计费双轨的基础**

### FR-2 工时填报
- FR-2.1 新增 `oa_timesheet`（工时单，按周或按月）：`timesheet_id, tenant_id, timesheet_no, employee_id, employee_name, dept_id, start_date, end_date, total_hours DECIMAL(8,2), billable_hours DECIMAL(8,2), costing_amount DECIMAL(14,2), billing_amount DECIMAL(14,2), status(DRAFT/SUBMITTED/APPROVING/APPROVED/REJECTED), instance_id, submit_time, approve_time, reject_reason` + 审计列
- FR-2.2 新增 `oa_timesheet_detail`：
  ```
  detail_id, tenant_id, timesheet_id
  project_id, project_name
  task_id                    关联 oa_project_task
  activity_type_id
  work_date
  from_time / to_time        可选（精确时段）
  hours                      DECIMAL(6,2)
  billable_flag              是否可计费
  costing_rate / costing_amount
  billing_rate / billing_amount
  description                工作内容
  + 审计列
  ```
- FR-2.3 填报界面：按周展示（周一到周日 × 项目/任务矩阵），可快速填数
- FR-2.4 单日工时上限校验（默认 24 小时，可配；超 12 小时提示）
- FR-2.5 单价在填报时按 FR-1.2 优先级自动带入，提交后锁定（后续改单价不影响已提交工时）

### FR-3 工时审批
- FR-3.1 提交后走审批（复用工作流，`instance_id`）
- FR-3.2 审批人默认为项目经理（`oa_project.owner_id`）；跨多项目时需多人审批（见 §9-2）
- FR-3.3 审批通过后回写项目汇总（FR-5）
- FR-3.4 驳回后可修改重提
- FR-3.5 已审批工时不可修改（需冲正：新增负数工时记录）

### FR-4 项目成本字段
- FR-4.1 `oa_project` 增：
  ```
  estimated_cost           预估成本 DECIMAL(14,2)
  labor_cost_amount        人力成本（由工时汇总）DECIMAL(14,2)
  purchase_cost_amount     采购成本（由采购单汇总）DECIMAL(14,2)
  other_cost_amount        其他成本 DECIMAL(14,2)
  billable_amount          可计费金额 DECIMAL(14,2)
  billed_amount            已开票金额 DECIMAL(14,2)
  gross_margin             毛利 DECIMAL(14,2)
  gross_margin_rate        毛利率 DECIMAL(6,4)
  actual_hours             实际工时 DECIMAL(10,2)
  percent_complete_mode    MANUAL 手工 / TASK_COMPLETION 按任务完成数 / TASK_PROGRESS 按任务加权进度
  ```
- FR-4.2 `actual_cost_amount` = 人力 + 采购 + 其他
- FR-4.3 `gross_margin` = `billable_amount` - `actual_cost_amount`

### FR-5 汇总回写
- FR-5.1 工时审批通过时增量回写项目 `labor_cost_amount` / `billable_amount` / `actual_hours`
- FR-5.2 采购单完成时回写 `purchase_cost_amount`（读 `biz_purchase_request`）
- FR-5.3 开票时回写 `billed_amount`（读 `oa_invoice`）
- FR-5.4 提供全量重算接口与内置任务（批次 A SYS-02），防增量回写偏差

## 5. 功能需求（OA-05 任务树）

### FR-6 项目任务树
- FR-6.1 新增 `oa_project_task`：
  ```
  task_id, tenant_id, project_id
  parent_task_id            父任务
  level_path VARCHAR(500)   物化路径（与项目其他树形方案一致，不用 lft/rgt）
  task_no                   任务编号（WBS 编号，如 1.2.3）
  subject                   任务名称
  task_type_id              任务类型（字典）
  is_group_flag             是否分组节点（有子任务）
  is_milestone_flag         是否里程碑
  status                    NOT_STARTED / IN_PROGRESS / COMPLETED / CANCELLED / BLOCKED
  priority
  assignee_id / assignee_name
  task_weight DECIMAL(6,2)  任务权重（用于加权进度）
  progress                  进度 0-100
  planned_start / planned_end
  planned_hours DECIMAL(8,2)
  actual_start / actual_end
  actual_hours DECIMAL(8,2) 由工时汇总
  sort_no
  description
  + 审计列
  ```
  索引：`idx_project(tenant_id, project_id)`、`idx_parent(parent_task_id)`、`idx_path(level_path)`
- FR-6.2 层级限制 5 层（WBS 通常不超过）
- FR-6.3 `is_group_flag=1` 的任务进度由子任务加权汇总，不可手工填
- FR-6.4 里程碑作为任务的属性（`is_milestone_flag`），不再是独立实体
- FR-6.5 `oa_project_milestone` 的处理见 §9-4

### FR-7 任务依赖
- FR-7.1 `oa_project_dependency` 改挂 `oa_project_task`（当前挂里程碑）
- FR-7.2 依赖类型：`FINISH_TO_START`（前置完成才能开始，最常用）/ `START_TO_START` / `FINISH_TO_FINISH`
- FR-7.3 前置任务未完成时，后置任务开始被拦截（提示而非强制阻止，见 §9-5）
- FR-7.4 **循环依赖检测**：保存依赖时检测是否成环，成环则拒绝

### FR-8 项目进度自动汇总
- FR-8.1 `percent_complete_mode` 三种模式：
  - `MANUAL`：手工填（保持现状兼容）
  - `TASK_COMPLETION`：已完成任务数 / 总任务数
  - `TASK_PROGRESS`：Σ(任务进度 × 权重) / Σ权重
- FR-8.2 任务进度变更时触发项目进度重算
- FR-8.3 分组任务进度由子任务汇总（FR-6.3）

### FR-9 项目模板
- FR-9.1 新增 `oa_project_template`：`template_id, tenant_id, template_code, template_name, project_type, description, status` + 审计列
- FR-9.2 新增 `oa_project_template_task`：`template_task_id, template_id, parent_template_task_id, level_path, task_no, subject, task_type_id, is_milestone_flag, task_weight, planned_hours, start_offset_days, duration_days, assignee_role, sort_no`
  - **用相对天数偏移**（`start_offset_days` / `duration_days`），套模板时按项目开始日期换算为实际日期
- FR-9.3 套模板：选模板 + 项目开始日期 → 生成完整任务树
- FR-9.4 可从现有项目反向保存为模板

### FR-10 报表
- FR-10.1 项目成本分析：预算 vs 实际（人力/采购/其他分项）、毛利与毛利率
- FR-10.2 人力投入分析：按项目/按人/按活动类型的工时分布
- FR-10.3 工时填报率（团队成员按期填报情况）
- FR-10.4 任务甘特图（展示，不做排程优化）
- FR-10.5 图表用批次 A LC-05

## 6. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `oa_activity_type`、`oa_activity_cost`、`oa_timesheet`、`oa_timesheet_detail`、`oa_project_task`、`oa_project_template`、`oa_project_template_task` |
| 改造 | `oa_project`（增 10 字段） |
| 改造 | `oa_project_dependency`（改挂任务） |
| 待定 | `oa_project_milestone`（§9-4） |

`DB/04.cloudflow-oa.sql`：+7 表（OA-01/02 后为 73 → 80）

## 7. 非功能需求

| 项 | 要求 |
| --- | --- |
| 金额精度 | DECIMAL(14,2)，单价 DECIMAL(12,2)，工时 DECIMAL(8,2)；不用浮点 |
| 单价锁定 | 工时提交后单价锁定（FR-2.5），历史成本不受单价调整影响 |
| 树形性能 | `level_path` 物化路径，查子树用 `LIKE 'path%'`；层级限制 5 层 |
| 循环依赖 | 保存时检测（FR-7.4），必须拒绝 |
| 汇总一致性 | 增量回写 + 全量重算兜底（FR-5.4） |
| 权限 | 工时本人填报；审批需项目经理；**成本单价数据敏感**，`oa_activity_cost` 需 `oa:activity-cost:*` 权限限管理者 |
| 审计 | 工时审批、单价配置、成本重算记 `sys_audit_log` |
| 已审批不可改 | FR-3.5，需冲正 |

## 8. 验收标准

### OA-04
| # | 验收项 |
| --- | --- |
| AC-1 | 活动类型与单价可配置；单价按 员工 > 职级 > 默认 优先级匹配 |
| AC-2 | 工时按周填报，可选项目与任务，单日工时超限被拒绝 |
| AC-3 | **成本与计费双轨：同一工时同时算出 costing_amount 与 billing_amount** |
| AC-4 | 工时提交后走审批；审批通过回写项目汇总 |
| AC-5 | 单价调整后，已提交工时的金额不变（单价锁定） |
| AC-6 | 已审批工时不可修改；冲正通过新增负数工时实现 |
| AC-7 | 项目 `labor_cost_amount` / `billable_amount` / `actual_hours` 由工时正确汇总 |
| AC-8 | `gross_margin` = billable - actual_cost 计算正确 |
| AC-9 | 采购成本与已开票金额正确回写 |
| AC-10 | 全量重算后与明细汇总一致 |
| AC-11 | 成本单价数据非管理者不可见 |

### OA-05
| # | 验收项 |
| --- | --- |
| AC-12 | 任务树可创建、拖拽调整层级、5 层限制生效 |
| AC-13 | 分组任务进度由子任务加权汇总，不可手工填 |
| AC-14 | 三种依赖类型可配置；**循环依赖被拒绝** |
| AC-15 | 前置任务未完成时后置任务开始有提示 |
| AC-16 | 三种进度模式正确：手工/按完成数/按加权进度 |
| AC-17 | 项目模板可创建；套模板按项目开始日期正确换算任务日期 |
| AC-18 | 可从现有项目反向保存为模板 |
| AC-19 | 工时可挂到具体任务；任务 `actual_hours` 由工时汇总 |
| AC-20 | 甘特图正确展示任务与依赖 |
| AC-21 | 成本分析与人力投入报表正确 |

## 9. 依赖与风险

### 9.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A SYS-02 任务平台** | 汇总重算任务 |
| **批次 A LC-05 图表库** | 报表与甘特图 |
| **批次 A SYS-01 消息中心** | 工时填报提醒、审批通知 |
| 现有工作流 | 工时审批 |
| 现有 `hr_job_level` | 按职级配单价（跨服务调 HR） |
| 现有 `biz_purchase_request` / `oa_invoice` | 采购成本与开票金额回写 |
| 批次 A SYS-07 | 七张表 CRUD 生成 |

### 9.2 风险

| 风险 | 应对 |
| --- | --- |
| **工时填报是持续性负担，落地阻力大** | 填报界面必须高效（FR-2.3 按周矩阵快填）；提供填报提醒；填报率报表暴露问题。这是产品推行问题而非技术问题 |
| 成本单价数据敏感（能反推薪资） | 权限限管理者（NFR + AC-11） |
| 双轨金额计算复杂，易算错 | AC-3 专项验证；单价锁定（AC-5）避免历史数据变动 |
| 增量回写偏差累积 | 全量重算兜底（AC-10）+ 定期重算任务 |
| 循环依赖导致进度计算死循环 | FR-7.4 保存时检测 + AC-14 |
| 任务树与 `oa_work_task` 职能重叠，用户困惑 | §9-1；`oa_project_task` 是项目 WBS（有工时、权重、依赖），`oa_work_task` 是通用待办；产品上明确区分 |
| `oa_project_milestone` 与 `is_milestone_flag` 两套里程碑 | §9-4 待确认；建议收敛为一套 |
| 两项合并交付工作量大（L+L） | 里程碑拆分；M1-M4 完成 OA-04 可先上工时，M5-M8 再上任务树。但工时挂任务是核心价值，建议不拆 |

## 10. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 活动类型与单价（SYS-07 生成） | AC-1/11 |
| M2 | 任务树 + 依赖 + 循环检测（**先做任务树，工时才有挂载点**） | AC-12/13/14/15 |
| M3 | 工时填报 + 双轨计算 + 单价锁定 | AC-2/3/5/19 |
| M4 | 工时审批 + 汇总回写 + 冲正 | AC-4/6/7/8 |
| M5 | 项目进度三模式 + 采购与开票回写 + 全量重算 | AC-9/10/16 |
| M6 | 项目模板 + 反向保存 | AC-17/18 |
| M7 | 报表 + 甘特图 | AC-20/21 |

## 11. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | `oa_project_task` 与 `oa_work_task` 是否合并 | 建议**不合并**。`oa_work_task` 是通用待办（已有父子与级联，且有 `TaskBoard.tsx` 看板），`oa_project_task` 是项目 WBS（需工时、权重、依赖、模板）。合并会让通用任务背上项目字段。产品上明确区分：项目内工作用项目任务，零散待办用工作任务 |
| 2 | 跨多项目的工时单如何审批 | 建议：一张工时单可含多项目明细，审批时按明细拆分给各项目经理分别审（会签形态）。或简化为"只需直属上级审"。**建议后者（直属上级审）**，实现简单且符合多数公司实践 |
| 3 | 工时是否与 HR 考勤对账 | 建议只做**交叉校验提示**（工时总数与考勤工时差异超阈值时提示），不强制一致。两者口径本就不同（考勤是在岗时长，工时是投入时长） |
| 4 | `oa_project_milestone` 如何处理 | 建议**收敛为视图**：里程碑改为 `oa_project_task.is_milestone_flag=1` 的任务，`oa_project_milestone` 表删除（项目未上线，直接改）。理由：两套里程碑数据必然不一致。若对外汇报需要独立里程碑视图，用查询过滤即可 |
| 5 | 前置任务未完成是否强制阻止后置开始 | 建议只提示不强制（实际项目中常有并行推进）；可通过 `sys_business_rule` 配置为 BLOCK 供严格管理的项目使用 |
