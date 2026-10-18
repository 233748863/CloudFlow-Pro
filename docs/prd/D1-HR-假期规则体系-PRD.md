# PRD：假期规则体系（HR-01 + HR-02 + HR-03）

| 项 | 内容 |
| --- | --- |
| 条目编号 | HR-01 假期台账 · HR-02 假期类型规则 · HR-03 假期政策与周期 |
| 所属批次 | 批次 D（第 1 份，**三项必须同批**：共用同一套数据模型，拆开做会返工） |
| 对标依据 | `docs/benchmark/04-hr-人力资源对标.md` |
| 优先级 | P0 |
| 预估工作量 | L |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 三个叠加的问题

**① ⚠️ 额度完全脱离业务流程，纯手工维护**（2026-08-31 摸排修正，比初版判断严重得多）

> 本 PRD 初版写"请假审批通过后**直接改 used_quota**"，**这是错的** —— 实测**根本没有扣减逻辑**。

实测结果：

| 检查项 | 结果 |
| --- | --- |
| `LeaveQuota` 引用文件 | 仅 6 个：Controller / Payload / Entity / VO / Mapper / `HrEssServiceImpl` —— **全是 CRUD 层** |
| service 层扣减逻辑 | **不存在**（`usedQuota` / `availableQuota` 只出现在 DTO/VO 与 ESS 门户汇总里） |
| `HrBusinessException.insufficientQuota()` | 异常方法**已定义，全仓零调用** |
| `HrWorkflowCallbackServiceImpl`（请假审批回调） | **完全不碰额度** |

**这意味着当前系统的实际行为**：
1. 请假申请时**不校验额度** —— 可以请超过额度的假
2. 审批通过后**不扣减额度** —— `used_quota` 永远是 HR 手工填的值
3. `insufficientQuota` 是"设计了但没接线"的遗留

**连带解释了 §1.1-④ 的问题**：`duration` 之所以由客户端传入，是因为**整条请假额度链路都没有服务端权威计算** —— 不校验额度自然也不需要准确的天数。

**影响本 PRD 范围**：除建台账外，还要**从零建立"申请校验 → 审批冻结 → 通过扣减 → 驳回释放"完整链路**（初版假设这条链路已存在只是实现方式不好）。工作量 **L → L+**。

**已定决策**（2026-08-31）：不单独先补校验，**等本条目一次性把台账 + 校验 + 扣减 + 释放建完**，避免先改快照再改台账的两次重构。代价是交付前额度数据持续不准；若届时已有真实使用数据，历史 `used_quota` 需人工校正或按台账重算基线。

**② 规则挤在 JSON 里，无法校验也无法配置**
`hr_leave_type`（12 列）规则只有 `need_quota` / `is_paid` / `unit` / `quota_rule(JSON)`。参考项目 `leave_type` 有 **20 个结构化规则字段**。规则在 JSON 里意味着：SQL 层校验不了、前端做不了配置表单、规则报表出不来。

**③ 无政策概念，批量调整靠逐条改**
`hr_leave_quota` 直接挂 `employee_id + leave_type_id + year`。给 200 人调年假额度只能逐条改；假期年度固定自然年（`year` 字段）；无按职级/入职年限自动套政策的能力。

**④ 请假天数由客户端传入（实测发现的额外问题）**
`HrTimeRequestPayload.duration` 是**入参字段**，全仓搜不到 `setDuration`，后端无计算逻辑。请假 3 天跨国庆，天数由前端算或用户填，节假日不扣除，且可被篡改。

### 1.2 目标
1. 余额从快照改为**台账推导**，任何余额争议可逐笔还原
2. 假期规则从 JSON 提取为**结构化字段**（20+ 项）
3. 引入**政策 + 周期**，支持按职级批量分配与非自然年周期
4. **后端接管请假天数计算**（用批次 A 的节假日日历），`duration` 不再信任客户端

### 1.3 非目标
- 不做考勤班次判定（D2 负责）
- 不做薪资联动的假期折现计算（D3 薪资批量负责，本期只提供 `allow_encashment` 规则字段）
- 不做加班转调休的加班侧建模（批次 H HR-09 负责，本期提供 `is_compensatory` 规则与台账写入能力）

## 2. 现状基线（实测）

| 表/项 | 现状 |
| --- | --- |
| `hr_leave_quota` | 15 列：`employee_id, leave_type_id, year, total_quota, used_quota, frozen_quota, available_quota, expiry_date` + 审计列 |
| `hr_leave_type` | 12 列：`leave_code, leave_name, need_quota, is_paid, unit, quota_rule(JSON), status, version` + 时间列 |
| `hr_time_request` | 19 列：`request_no, request_type, employee_id, leave_type_id, start_time, end_time, duration, unit, reason, status, process_instance_id` + 审计列 |
| `duration` 来源 | **实测为客户端传入**（`HrTimeRequestPayload` 有该字段，无后端计算） |
| 服务实现 | `HrEssServiceImpl` 涉及额度逻辑；`HrAttendanceResourceControllers` 承载假期相关端点 |
| 节假日 | **批次 A HR-04 已交付**（`sys_holiday_calendar` + `sys_holiday_date` + `calcLeaveDays` 等能力） |
| 规则中心 | `sys_business_rule` 已有 `hr.leave.quota.limit` 规则码，含 BLOCK/WARN/PASS 三态与命中记录 |

## 3. 范围

### 3.1 做
0. **⚠️ 从零建立额度业务链路**（§1.1-① 摸排新增）：申请校验 → 审批冻结 → 通过扣减 → 驳回释放。接线点在 `HrWorkflowCallbackServiceImpl`（请假审批回调，现在完全不碰额度）与请假提交入口；`insufficientQuota` 异常已定义可直接用
1. 新增 `hr_leave_ledger`（假期台账）
2. `hr_leave_quota` 降级为读模型（物化余额），由台账重算
3. `hr_leave_type` 增 20 个结构化规则字段
4. 新增 `hr_leave_period`（假期周期）
5. 新增 `hr_leave_policy` + `hr_leave_policy_detail` + `hr_leave_policy_assignment`
6. 新增 `hr_earned_leave_schedule`（按月累积执行台账）
7. **后端接管请假天数计算**（对接批次 A 节假日日历）
8. 请假校验器读结构化规则；命中冲突走 `sys_business_rule`
9. 批量政策分配

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 数据迁移 | 项目未上线，直接改建表 SQL 与种子数据 |
| 加班转调休的加班侧 | HR-09（批次 H）；本期提供台账写入能力 |
| 假期折现的薪资计算 | D3 薪资批量；本期提供 `allow_encashment` + `encashment_component_id` 字段 |
| 班次与打卡 | D2 |

## 4. 功能需求

### FR-1 假期台账（HR-01）
- FR-1.1 新增 `hr_leave_ledger`：
  | 字段 | 说明 |
  | --- | --- |
  | ledger_id | PK |
  | tenant_id | 租户 |
  | employee_id | 员工 |
  | leave_type_id | 假期类型 |
  | leave_period_id | 假期周期 |
  | transaction_type | ALLOCATION 分配 / APPLICATION 请假 / CARRY_FORWARD 结转 / EXPIRY 过期 / ENCASHMENT 折现 / ADJUSTMENT 调整 / COMPENSATORY 调休转入 / FREEZE 冻结 / UNFREEZE 解冻 |
  | source_biz_type | 来源单据类型 |
  | source_biz_id | 来源单据 ID |
  | leave_days | DECIMAL(8,2)，**正为增负为减** |
  | from_date / to_date | 适用区间 |
  | carry_forward_flag | 结转标记 |
  | expired_flag | 过期标记 |
  | lwp_flag | 无薪假标记 |
  | operator_id | 操作人 |
  | remark | 备注 |
  | + 审计列 | |

  索引：`idx_emp_type_period(tenant_id, employee_id, leave_type_id, leave_period_id)`、`idx_source(source_biz_type, source_biz_id)`
- FR-1.2 `hr_leave_quota` 保留为**读模型**（查询性能考虑），增 `last_calc_time`；余额由台账 `SUM(leave_days)` 重算刷新
- FR-1.3 所有额度变动**必须走台账**：请假审批通过、政策分配、结转、过期、折现、调整、调休转入
- FR-1.4 提供余额重算接口与内置任务（批次 A SYS-02 纳管），可按员工/按假期类型/全量重算
- FR-1.5 台账查询接口：按员工按假期类型查流水，含运行余额（running balance）

### FR-2 假期类型规则结构化（HR-02）
- FR-2.1 `hr_leave_type` 增字段（对标 `frappe/hrms` 的 `leave_type` 20 字段，**仅借鉴设计，GPL-3.0 不抄代码**）：
  ```
  max_days_per_year            年度上限
  applicable_after_days        入职满 N 天才可用
  max_continuous_days          单次连续上限
  carry_forward_flag           是否可结转
  max_carry_forward_days       结转上限
  carry_forward_expire_days    结转后 N 天过期
  earned_leave_flag            是否按月累积型
  earned_leave_frequency       MONTHLY/QUARTERLY/HALF_YEARLY/YEARLY
  rounding_mode                NONE/HALF_DAY/FULL_DAY
  encashment_flag              是否可折现
  encashment_component_id      折现走哪个薪酬项（引用 hr_comp_component）
  lwp_flag                     是否无薪假
  partial_paid_flag            是否部分带薪
  salary_fraction_per_day      部分带薪比例 DECIMAL(5,4)（如病假 0.6）
  compensatory_flag            是否调休假
  optional_leave_flag          是否可选节假日
  include_holiday_flag         请假天数是否含节假日
  allow_negative_flag          是否允许负余额
  allow_over_allocation_flag   是否允许超额分配
  need_attachment_flag         是否需附件（如病假需病假单）
  ```
- FR-2.2 `quota_rule` JSON 保留作扩展位，但上述规则**全部提取为列**
- FR-2.3 前端提供规则配置表单（分组：基础 / 额度 / 结转 / 累积 / 薪资影响 / 校验）

### FR-3 假期周期与政策（HR-03）
- FR-3.1 新增 `hr_leave_period`：`period_id, tenant_id, period_name, start_date, end_date, default_flag, status` + 审计列
  - 替换 `hr_leave_quota.year` 的语义，支持非自然年（如 4月-次年3月）
- FR-3.2 新增 `hr_leave_policy`：`policy_id, tenant_id, policy_code, policy_name, description, status` + 审计列
- FR-3.3 新增 `hr_leave_policy_detail`：`policy_id, leave_type_id, annual_days DECIMAL(8,2), remark`
- FR-3.4 新增 `hr_leave_policy_assignment`：
  ```
  employee_id, policy_id, leave_period_id
  assignment_basis   PERIOD 按周期 / JOINING_DATE 按入职日
  effective_from, effective_to
  carry_forward_flag
  allocated_flag     是否已生成分配台账
  ```
- FR-3.5 批量分配接口：按部门 / 职级（`hr_job_level`）/ 岗位 / 员工类型 / 员工列表批量分配政策
  - 分配时按 `hr_leave_policy_detail` 逐个假期类型写 `hr_leave_ledger`（`transaction_type=ALLOCATION`）
  - 按入职日分配时，额度按入职日期起算并按比例折算（入职半年给一半年假）
- FR-3.6 新增 `hr_earned_leave_schedule`：`employee_id, leave_type_id, leave_period_id, schedule_date, earned_days, executed_flag, ledger_id`
  - 按月累积型假期由内置任务（SYS-02 纳管）按 `earned_leave_frequency` 执行，写台账

### FR-4 后端接管请假天数计算（**实测发现的问题修复**）
- FR-4.1 `hr_time_request.duration` **改为服务端计算，忽略客户端传值**
- FR-4.2 计算逻辑调批次 A 的 `calcLeaveDays(calendarId, startTime, endTime, includeHoliday)`：
  - `includeHoliday` 取自 `hr_leave_type.include_holiday_flag`
  - 半天粒度支持（按日历 `lunch_start_time` 分界）
  - **员工所属日历必须调批次 A A4 的统一解析方法 `resolveCalendarId(employeeId, date)`**（三级回退：班次 → 部门 → 租户默认，A4 的 FR-4B），**不自行实现归属逻辑**
  - 跨多日请假时逐日解析（同一次请假可能跨排班变更）
- FR-4.3 提交请假时返回计算结果供前端展示确认；最终以服务端计算值落库
- FR-4.4 若客户端传的 `duration` 与服务端计算不一致，**以服务端为准并记日志**（可能是前端 bug 或篡改）

### FR-5 请假校验器
- FR-5.1 提交请假时按 `hr_leave_type` 结构化规则依次校验：
  | 校验 | 规则字段 |
  | --- | --- |
  | 入职时长是否满足 | `applicable_after_days` |
  | 单次连续天数 | `max_continuous_days` |
  | 年度累计上限 | `max_days_per_year` |
  | 余额是否充足 | 台账余额 + `allow_negative_flag` |
  | 是否需附件 | `need_attachment_flag` |
  | 政策是否已分配 | `hr_leave_policy_assignment` |
- FR-5.2 校验失败按 `sys_business_rule` 的 BLOCK / WARN / PASS 三态处理（扩展现有 `hr.leave.quota.limit` 为多规则码：`hr.leave.continuous.limit`、`hr.leave.annual.limit`、`hr.leave.probation.limit`）
- FR-5.3 命中记录写 `sys_business_rule_hit_record`（表已存在）
- FR-5.4 请假审批通过时写台账（`transaction_type=APPLICATION`，`leave_days` 为负）；审批中先写冻结（`FREEZE`），驳回时解冻（`UNFREEZE`）

### FR-6 结转、过期、折现
- FR-6.1 周期结束时按 `carry_forward_flag` + `max_carry_forward_days` 结转到下一周期（写台账 `CARRY_FORWARD`）
- FR-6.2 结转额度按 `carry_forward_expire_days` 到期作废（写台账 `EXPIRY`）
- FR-6.3 折现申请：按 `encashment_flag` 允许，折现额度写台账 `ENCASHMENT`，并生成薪酬变动数据（对接 D3 薪资批量的 `additional_salary` 类型）
- FR-6.4 三者均由内置任务（SYS-02 纳管）触发，可手动补跑

## 5. 数据模型汇总

| 操作 | 表 | 说明 |
| --- | --- | --- |
| 新增 | `hr_leave_ledger` | 台账（核心） |
| 新增 | `hr_leave_period` | 假期周期 |
| 新增 | `hr_leave_policy` | 政策主体 |
| 新增 | `hr_leave_policy_detail` | 政策明细（假期类型 × 额度） |
| 新增 | `hr_leave_policy_assignment` | 政策与员工绑定 |
| 新增 | `hr_earned_leave_schedule` | 按月累积执行台账 |
| 改造 | `hr_leave_quota` | 降级为读模型，`year` → `leave_period_id`，增 `last_calc_time` |
| 改造 | `hr_leave_type` | 增 20 个规则字段 |
| 改造 | `hr_time_request` | `duration` 改服务端计算（字段不变，语义变） |

`DB/03.cloudflow-hr.sql`：86 → 92 表（SYS-01 已删 `hr_self_service_message` 后为 85 → 91）

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **台账是唯一真相源** | 余额只能由台账推导；任何直接改 `hr_leave_quota` 的代码路径必须消除 |
| 精度 | `leave_days` 用 DECIMAL(8,2)，支持 0.5 天；累计计算不用浮点 |
| 并发 | 同一员工同一假期类型的余额扣减需加锁（Redisson 已有），防并发超额 |
| 性能 | 台账重算：单员工 < 100ms；全量重算走批处理与内置任务 |
| 审计 | 台账记录不可修改不可删除（只能追加冲正记录）；调整类操作记 `hr_audit_log` |
| 服务端权威 | `duration` 忽略客户端传值（FR-4.1） |
| 数据准确性 | 假期数据错误影响薪资，政策分配与调整类操作需记审计；建议高风险操作走审批 |
| 依赖降级 | 节假日日历不可用时，请假天数计算失败应**拒绝提交**而非按自然日计算（避免算错） |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 请假审批通过后台账新增负数记录，`hr_leave_quota` 余额由重算刷新一致 |
| AC-2 | **余额可逐笔还原**：查台账能看到分配、请假、结转、过期各笔明细与运行余额 |
| AC-3 | 审批中冻结、驳回解冻，余额正确恢复 |
| AC-4 | 20 个规则字段均可配置并在校验中生效（逐条验证） |
| AC-5 | 政策批量分配：按职级给 50 人分配政策，台账正确生成 50 × N 条分配记录 |
| AC-6 | 按入职日分配时额度按比例折算正确（入职半年给一半年假） |
| AC-7 | 非自然年周期（4月-次年3月）正确工作 |
| AC-8 | 按月累积型假期由任务按月写台账，`rounding_mode` 生效 |
| AC-9 | 周期结束时结转按 `max_carry_forward_days` 上限执行；结转额度按 `carry_forward_expire_days` 到期作废 |
| AC-10 | **请假天数由服务端计算：跨国庆请假 3 天，节假日不计入**（`include_holiday_flag=0`） |
| AC-11 | 客户端传错 `duration` 时以服务端计算为准并记日志 |
| AC-12 | 半天请假返回 0.5 天 |
| AC-13 | 节假日日历不可用时请假提交被拒绝（不静默按自然日算） |
| AC-14 | 六类校验（入职时长/连续天数/年度上限/余额/附件/政策）逐条验证；命中写 `sys_business_rule_hit_record` |
| AC-15 | 并发提交同一员工请假，余额不超扣 |
| AC-16 | 台账记录无法被修改或删除；冲正只能追加 |
| AC-17 | 全量余额重算后与台账 SUM 完全一致 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A HR-04 节假日日历** | `calcLeaveDays` / `isWorkday`；**强依赖，无它 FR-4 无法实现** |
| **批次 A SYS-02 任务平台** | 按月累积、结转、过期、余额重算四类任务 |
| **批次 A SYS-01 消息中心** | 额度变动、结转到期提醒 |
| 现有 `sys_business_rule` | 校验三态与命中记录 |
| `hr_job_level`（已有） | 按职级批量分配 |
| `hr_comp_component`（已有） | 折现薪酬项引用 |
| D3 薪资批量 | 折现与无薪假的薪资联动（弱依赖，可后接） |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **额度链路从零建立，工作量高于初版估计** | §1.1-① 摸排已澄清。范围加 §3.1-0；里程碑 M3 需含审批回调接线 |
| **交付前额度数据持续不准** | 已定决策接受此代价（不单独先补校验）。交付时若已有真实数据，需按台账重算基线或人工校正 |
| **台账与读模型不一致**（余额刷新遗漏或失败） | AC-17 全量对账；提供重算接口；建议加每日对账任务，不一致时告警 |
| ~~遗留代码路径直接改 `hr_leave_quota` 绕过台账~~ | **摸排已确认不存在此风险**：现有无任何 service 层扣减逻辑，不存在需要改造的旁路（只有 CRUD 接口，本身应保留供 HR 手工调整，但要改为走台账 `ADJUSTMENT` 类型） |
| 20 个规则字段的校验组合复杂，易漏或冲突 | AC-4 逐条验证；校验器用责任链，每规则一个校验器 |
| 并发超额扣减 | Redisson 锁（NFR）+ AC-15 |
| 假期数据错误直接影响薪资 | 台账不可改（AC-16）；调整操作审计；高风险操作建议审批 |
| 三项合并交付工作量大（L），周期长 | 里程碑拆分（§9）；M1-M3 完成后台账与规则已可用，政策批量可稍后 |
| 与 `hr_attendance_rule.work_days` 的工作日判定并存 | D2 负责统一收口到日历；本 PRD 的请假计算直接用日历，不用 `work_days` |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 六张新表 + `hr_leave_type` 规则字段（SYS-07 生成 CRUD） | 表结构与规则配置可用 |
| M2 | 台账写入 + 余额重算 + 现有额度修改点全部改走台账 | AC-1/2/3/16/17 |
| M3 | **服务端请假天数计算**（对接节假日日历）+ 六类校验器 | AC-10/11/12/13/14 |
| M4 | 政策与周期 + 批量分配 + 按入职日折算 | AC-5/6/7 |
| M5 | 按月累积 + 结转 + 过期 + 折现（四个内置任务） | AC-8/9 |
| M6 | 并发加锁 + 每日对账任务 + 前端规则配置与台账查询页 | AC-15 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | ~~员工所属节假日日历如何确定~~ | **已定**（2026-08-31）：班次 → 部门 → 租户默认三级回退，由批次 A A4 的 `resolveCalendarId()` 统一提供（A4 FR-4B）。本 PRD 直接调用，不自行实现 |
| 2 | 台账是否需要冲正机制（红冲） | 建议需要：错误的台账记录不删除，追加一条反向记录（`transaction_type=ADJUSTMENT`，`remark` 注明冲正来源），保证审计完整 |
| 3 | 高风险操作（额度调整、政策变更）是否走审批 | 建议额度手工调整走审批（可复用工作流），政策变更记审计即可 |
| 4 | 冻结机制是否必要（审批中先冻结） | 建议必要，否则并发提交多张请假单可能超额；FR-5.4 已含 |
