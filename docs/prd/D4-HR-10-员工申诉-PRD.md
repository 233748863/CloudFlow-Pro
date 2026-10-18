# PRD：员工申诉（HR-10）

| 项 | 内容 |
| --- | --- |
| 条目编号 | HR-10 |
| 所属批次 | 批次 D（第 4 份） |
| 对标依据 | `docs/benchmark/04-hr-人力资源对标.md` |
| 优先级 | P1 —— 改动小，补上"员工声音"链路的中间层 |
| 预估工作量 | S |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题：中间层缺失

现有员工诉求渠道两头重、中间空：

| 层级 | 现状 | 适用场景 |
| --- | --- | --- |
| 轻 | `hr_attendance_appeal` 考勤申诉 | 只能申诉考勤 |
| **中** | **无** | 对薪资、绩效、管理行为的一般性申诉 |
| 重 | `hr_labor_dispute` + `hr_dispute_mediation` + `hr_dispute_arbitration` + `hr_dispute_evidence`（4 表，含调解仲裁，比参考项目完整） | 劳动争议 |

结果：员工对绩效评分不满、对薪资有疑问、对管理行为有意见，**要么升级成劳动争议（过重），要么走线下（无留痕）**。

### 1.2 目标
1. 补一个轻量申诉实体，覆盖薪资/绩效/管理/其他类诉求
2. 支持多态指向（可针对人、部门、制度、任意业务单据）
3. 可升级为劳动争议（保留链路引用）
4. 入口挂现有 ESS 门户

### 1.3 非目标
- 不替代考勤申诉（`hr_attendance_appeal` 保留，两者场景不同）
- 不替代劳动争议（`hr_labor_dispute` 保留）
- 不做匿名申诉（见 §9-1）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `hr_attendance_appeal` | 考勤申诉，D2 已改造为挂日考勤结论 |
| `hr_labor_dispute` | 劳动争议主表 |
| `hr_dispute_mediation` / `hr_dispute_arbitration` / `hr_dispute_evidence` | 调解 / 仲裁 / 证据 |
| ESS 门户 | `HrEssPortalController`、`HrEssResourceControllers`、`HrEssWorkflowControllers`、`HrEssSupport`、`IHrEssService` |
| 通用申诉 | **无** |
| 字典 | `sys_dict_data` 可承载申诉类型，无需独立表 |
| 工作流 | 可复用（处理流程走审批） |

## 3. 范围

### 3.1 做
1. 新增 `hr_grievance`（申诉主表）
2. 新增 `hr_grievance_record`（处理记录/沟通轨迹）
3. 申诉类型用 `sys_dict_data` 承载
4. 提交、受理、调查、处理、关闭全流程
5. 升级为劳动争议的链路
6. ESS 门户入口 + HR 管理端

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 独立申诉类型表 | 用 `sys_dict_data`，避免建无必要的小表 |
| 匿名申诉 | 见 §9-1（涉及身份隔离设计，另议） |
| 申诉满意度调查 | 可后续评估 |
| 与考勤申诉合并 | 两者场景与处理流程不同 |

## 4. 功能需求

### FR-1 申诉主表
- FR-1.1 新增 `hr_grievance`：
  | 字段 | 说明 |
  | --- | --- |
  | grievance_id | PK |
  | tenant_id | 租户 |
  | grievance_no | 申诉编号 |
  | employee_id | 申诉人 |
  | employee_name | 申诉人姓名 |
  | dept_id | 所属部门 |
  | grievance_type | 申诉类型（字典：SALARY 薪资 / PERFORMANCE 绩效 / MANAGEMENT 管理行为 / WORKPLACE 工作环境 / POLICY 制度 / OTHER 其他） |
  | subject | 标题 |
  | description | 详细描述 |
  | cause | 起因 |
  | expectation | 期望结果 |
  | against_type | 指向类型：USER / DEPT / POLICY / NONE |
  | against_id | 指向对象 ID |
  | against_name | 指向对象名称 |
  | related_biz_type | 关联业务类型（SALARY_SLIP / PERFORMANCE_RESULT / ATTENDANCE / 等） |
  | related_biz_id | 关联业务 ID |
  | attachment_url | 附件 |
  | priority | 优先级 |
  | status | SUBMITTED / ACCEPTED / INVESTIGATING / RESOLVED / CLOSED / ESCALATED / WITHDRAWN |
  | handler_id / handler_name | 处理人（HR） |
  | accept_time | 受理时间 |
  | resolution_detail | 处理结论 |
  | resolution_date | 处理日期 |
  | satisfied_flag | 申诉人是否认可结论 |
  | escalated_dispute_id | 升级后的劳动争议 ID |
  | instance_id | 审批流实例（如需审批） |
  | + 审计列 | |

  索引：`idx_emp(tenant_id, employee_id)`、`idx_status(tenant_id, status)`、`idx_handler(handler_id)`
- FR-1.2 新增 `hr_grievance_record`（沟通与处理轨迹）：`record_id, grievance_id, record_type(COMMENT/STATUS_CHANGE/ASSIGN/ESCALATE), operator_id, operator_name, operator_role(EMPLOYEE/HR/MANAGER), content, attachment_url, visible_to_employee_flag, create_time`
  - `visible_to_employee_flag`：HR 内部记录可标记为不对申诉人可见

### FR-2 状态流转
- FR-2.1 状态机：
  ```
  SUBMITTED ──受理──> ACCEPTED ──开始调查──> INVESTIGATING ──给出结论──> RESOLVED ──关闭──> CLOSED
      │                   │                      │                         │
      └──撤回──> WITHDRAWN │                      └──升级──> ESCALATED       └──不认可──> INVESTIGATING
                          └──升级──> ESCALATED
  ```
- FR-2.2 每次状态变更写 `hr_grievance_record`
- FR-2.3 申诉人在 RESOLVED 后可确认认可（`satisfied_flag=1` → CLOSED）或不认可（回到 INVESTIGATING，仅允许一次）
- FR-2.4 SUBMITTED 状态下申诉人可撤回

### FR-3 指向与关联
- FR-3.1 `against_type` 多态指向：
  - `USER`：针对某人（如"对直属上级的管理方式有意见"）
  - `DEPT`：针对某部门
  - `POLICY`：针对某项制度（可关联 `sys_legal_document` 或纯文本）
  - `NONE`：无明确指向
- FR-3.2 `related_biz_type` + `related_biz_id` 关联任意业务单据（工资单、绩效结果、考勤记录等），便于处理人直接查看争议对象
- FR-3.3 **敏感性处理**：`against_type=USER` 时，被指向人**默认不可见该申诉**（避免二次冲突），仅 HR 与指定处理人可见

### FR-4 升级为劳动争议
- FR-4.1 HR 可将申诉升级为劳动争议：创建 `hr_labor_dispute` 记录并回填 `escalated_dispute_id`
- FR-4.2 升级时携带申诉的描述、附件、处理轨迹
- FR-4.3 申诉状态置 ESCALATED（终态，后续在劳动争议侧跟进）

### FR-5 ESS 门户与管理端
- FR-5.1 ESS 门户（员工侧）：提交申诉、查看自己的申诉列表与进度、补充说明、撤回、确认结论
- FR-5.2 HR 管理端：申诉列表（按状态/类型/部门/处理人筛选）、受理、分派处理人、记录调查过程、给出结论、升级、关闭
- FR-5.3 处理人可见性：默认 HR 角色可见全部；分派后指定处理人可见
- FR-5.4 统计视图：按类型、按部门、按处理时长的申诉分布（用批次 A 的 ECharts）

### FR-6 通知
- FR-6.1 走批次 A SYS-01：提交后通知 HR、受理后通知申诉人、结论后通知申诉人、超时未受理提醒 HR
- FR-6.2 超时规则：提交后 N 个工作日未受理触发提醒（N 可配，工作日用批次 A 节假日日历计算）

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `hr_grievance` |
| 新增 | `hr_grievance_record` |
| 复用 | `sys_dict_data`（申诉类型字典） |
| 关联 | `hr_labor_dispute`（升级目标） |

`DB/03.cloudflow-hr.sql`：+2 表

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **隐私（本 PRD 最重要）** | 申诉内容仅申诉人、HR、指定处理人可见；`against_type=USER` 时被指向人不可见；HR 内部记录可标记不对员工可见 |
| 权限 | `hr:grievance:mine:*`（员工自己的）与 `hr:grievance:manage:*`（HR 管理）严格区分 |
| 审计 | 所有状态变更、分派、升级记 `hr_audit_log`；**查看他人申诉也需记审计**（防滥用） |
| 数据保留 | 申诉记录长期保留（劳动争议举证可能需要），不做自动清理 |
| 附件安全 | 附件走 `sys_file`，访问需权限校验（配合批次 G SYS-04 签名 URL） |
| 工作日计算 | 超时提醒用节假日日历，不用自然日 |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 员工可在 ESS 提交申诉，选择类型、填写描述与期望、上传附件 |
| AC-2 | 状态机六个流转路径正确（受理/调查/结论/关闭/升级/撤回） |
| AC-3 | 每次状态变更写 `hr_grievance_record` |
| AC-4 | 申诉人在 RESOLVED 后可确认认可或不认可；不认可仅允许一次 |
| AC-5 | 四种 `against_type` 均可指向；`related_biz_type` 可关联工资单/绩效结果并跳转查看 |
| AC-6 | **`against_type=USER` 时被指向人无法看到该申诉** |
| AC-7 | HR 内部记录标记不可见后，员工侧看不到该条记录 |
| AC-8 | 升级为劳动争议后创建 `hr_labor_dispute` 并回填 ID，携带原申诉内容与附件 |
| AC-9 | **员工只能看自己的申诉；越权查他人返回 403** |
| AC-10 | 查看他人申诉（HR 行为）被记入审计 |
| AC-11 | 超时未受理按工作日计算触发提醒（跨周末与节假日正确） |
| AC-12 | 通知在提交/受理/结论三个节点正确发出（依赖 SYS-01） |
| AC-13 | 统计视图按类型/部门/处理时长正确展示（图表用 LC-05 组件） |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A SYS-01 消息中心** | 通知；强依赖 |
| **批次 A HR-04 节假日日历** | 超时提醒的工作日计算 |
| **批次 A LC-05 图表库** | 统计视图 |
| 现有 ESS 门户 | 入口 |
| 现有 `hr_labor_dispute` | 升级目标 |
| 现有 `sys_dict_data` | 类型字典 |
| 批次 G SYS-04 | 附件签名 URL（弱依赖） |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **隐私泄露：申诉内容被无关人员看到，会直接打消员工使用意愿** | NFR 隐私要求 + AC-6/7/9/10；被指向人不可见是关键设计 |
| HR 滥用查看权限 | AC-10 查看记审计 |
| 申诉与考勤申诉、劳动争议三者边界不清，用户不知该用哪个 | ESS 入口做引导：考勤问题引导到考勤申诉、涉法争议提示可升级；申诉类型字典里不含考勤类 |
| 申诉长期无人处理 | 超时提醒（FR-6.2）+ 统计视图暴露处理时长 |
| 无匿名渠道导致员工不敢提 | §9-1 待确认；本期至少保证被指向人不可见，降低顾虑 |

## 9. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 是否需要匿名申诉 | 本期不做。匿名涉及身份隔离（提交时不存 employee_id 但要防重复滥用）、无法回复申诉人等设计问题。**建议先上实名版（被指向人不可见已能降低多数顾虑），观察使用情况再评估** |
| 2 | 申诉是否需要走工作流审批 | 建议不走。申诉是"处理流程"而非"审批流程"，用状态机 + 处理记录即可；`instance_id` 字段预留，特殊类型（如涉及赔偿）可挂审批 |
| 3 | 处理时限是否强制 | 建议只做提醒不做强制（申诉复杂度差异大）；统计视图暴露时长供管理层关注 |
| 4 | 申诉类型是否需要按类型分派不同处理人 | 建议本期手工分派；若量大再加自动分派规则（可参考 CRM 的 `crm_assignment_rule` 模式） |
