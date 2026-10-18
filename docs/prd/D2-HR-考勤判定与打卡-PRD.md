# PRD：考勤判定规则与原始打卡分离（HR-04 后半 + HR-05）

| 项 | 内容 |
| --- | --- |
| 条目编号 | HR-04 后半（班次判定规则）· HR-05（原始打卡与考勤结论分离） |
| 所属批次 | 批次 D（第 2 份，两项共用考勤数据模型，合并交付） |
| 对标依据 | `docs/benchmark/04-hr-人力资源对标.md` |
| 优先级 | P0（HR-04 后半）+ P1（HR-05） |
| 预估工作量 | M+ |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 两个叠加的问题

**① 班次只有时间没有判定规则**
`hr_shift`（13 列）只有 `start_time` / `end_time` / `break_minutes` / `work_minutes`。判定规则塞在 `hr_attendance_rule.config_json` 里。参考项目 `shift_type` 有 **16+ 个判定字段**：迟到宽容期、早退宽容期、半天阈值、缺勤阈值、有效打卡窗口、自动考勤开关、工时计算方式。

**② 原始打卡与考勤结论混在一张表**
`hr_attendance_record`（19 列）同时承担打卡记录与考勤结论：有 `check_type` / `check_time` / `check_method` / `location` / `status` / `deviation_minutes`。后果：
- **改考勤规则后无法重算历史**（原始时间与结论在同一行，重算有污染原始数据的风险）
- 有 `location` 但无经纬度、无设备 ID，移动打卡的位置校验做不了

### 1.2 目标
1. 班次承载完整判定规则（16+ 字段）
2. 原始打卡（不可变事实）与日考勤结论（可重算）分离为两张表
3. 支持按日期范围重算考勤
4. 统一工作日判定到批次 A 的节假日日历，消除 `work_days` 的并存

### 1.3 非目标
- 不做加班单独建模（批次 H HR-09）
- 不做排班优化算法（只做排班数据管理）
- 不做人脸识别/设备对接（只定义 `check_method` 与设备 ID 字段）

## 2. 现状基线（实测）

| 表/项 | 现状 |
| --- | --- |
| `hr_shift` | 13 列：`shift_code, shift_name, start_time, end_time, break_minutes, work_minutes, color, status, version` + 时间列 |
| `hr_attendance_rule` | 13 列：`rule_code, rule_name, rule_type, shift_id, work_days, check_methods, config_json, status, version` + 时间列 |
| `work_days` | 实测为 `List<Integer>`（周几 1-7），**只能表达固定周模式，无法表达法定节假日与调休** |
| `hr_attendance_record` | 19 列：`employee_id, attendance_date, shift_id, check_type, check_time, expected_time, deviation_minutes, check_method, location, status, remark` + 审计列 |
| `hr_attendance_monthly` | 月度汇总，含 `work_days`（应出勤天数，来源不明） |
| `hr_schedule_assignment` | 排班分配 |
| `hr_attendance_appeal` | 考勤申诉（已有） |
| 节假日日历 | **批次 A HR-04 前半已交付**（`isWorkday` / `getDateType` / `calcWorkMinutes`） |

## 3. 范围

### 3.1 做
1. `hr_shift` 增 12 个判定规则字段
2. 新增 `hr_attendance_checkin`（原始打卡）
3. `hr_attendance_record` 收敛为日考勤结论（一员工一天一条）
4. 自动考勤生成器（按班次规则从打卡推导结论）
5. 考勤重算接口（按日期范围）
6. 工作日判定统一到节假日日历，`work_days` 收口
7. 考勤申诉挂到日结论

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 加班建模 | HR-09（批次 H）；本期 `hr_attendance_checkin` 预留 `overtime_type_id` 字段 |
| 设备对接 | 只定义字段，实际对接按需 |
| 排班算法 | 只做数据管理 |
| 综合工时/不定时工时制 | 本期只支持标准工时制 |

## 4. 功能需求

### FR-1 班次判定规则（HR-04 后半）
- FR-1.1 `hr_shift` 增字段（对标 `frappe/hrms` 的 `shift_type`，**仅借鉴设计**）：
  ```
  checkin_window_before_minutes   班次开始前多久可打卡
  checkout_window_after_minutes   班次结束后多久可打卡
  late_grace_minutes              迟到宽容期
  early_exit_grace_minutes        早退宽容期
  half_day_hours_threshold        工时不足 X 判半天 DECIMAL(4,2)
  absent_hours_threshold          工时不足 Y 判缺勤 DECIMAL(4,2)
  working_hours_calc_mode         FIRST_LAST 首末打卡 / PAIRED 每次进出配对
  checkin_determine_mode          EARLIEST_LATEST 最早最晚 / ALTERNATING 交替进出
  holiday_calendar_id             绑定节假日日历（引用 sys_holiday_calendar）
  auto_attendance_flag            是否自动生成考勤
  process_attendance_after        从哪天开始自动处理
  mark_on_holiday_flag            节假日是否也判考勤
  overtime_threshold_minutes      超出多少分钟算加班（HR-09 用，本期预留）
  ```
- FR-1.2 `hr_attendance_rule.config_json` 中的判定规则**提取到 `hr_shift`**（规则应挂班次，不挂规则表）
- FR-1.3 `hr_attendance_rule` 保留，职责收敛为"规则适用范围"（哪些人/哪些部门用哪个班次），`work_days` 字段**移除**，工作日判定改由 `holiday_calendar_id` 决定
- FR-1.4 班次配置界面按分组展示（时间 / 打卡窗口 / 宽容期 / 判定阈值 / 自动化）

### FR-2 原始打卡表（HR-05）
- FR-2.1 新增 `hr_attendance_checkin`：
  | 字段 | 说明 |
  | --- | --- |
  | checkin_id | PK |
  | tenant_id | 租户 |
  | employee_id | 员工 |
  | log_type | IN 上班 / OUT 下班 |
  | check_time | 打卡时间 |
  | shift_id | 所属班次（推导） |
  | attendance_date | 归属考勤日（跨夜班次时可能与 check_time 的日期不同） |
  | device_id | 设备标识 |
  | check_method | APP / FACE / CARD / WIFI / GPS / MANUAL |
  | latitude / longitude | DECIMAL(10,7) |
  | location_name | 位置名称 |
  | location_valid_flag | 位置是否在允许范围内 |
  | offshift_flag | 非本班次打卡 |
  | overtime_type_id | 加班类型（HR-09 预留） |
  | skip_auto_flag | 跳过自动考勤 |
  | attendance_record_id | **回指生成的日考勤结论** |
  | remark | 备注 |
  | + 审计列 | |

  索引：`idx_emp_date(tenant_id, employee_id, attendance_date)`、`idx_emp_time(employee_id, check_time)`
- FR-2.2 **原始打卡不可修改**（补卡走新增一条 `check_method=MANUAL` 的记录 + 申诉流程），保证原始事实可追溯
- FR-2.3 跨夜班次的 `attendance_date` 归属规则：按班次开始时间所在日归属（如 22:00-06:00 班次，次日 02:00 的打卡归属前一日）

### FR-3 日考勤结论表改造（HR-05）
- FR-3.1 `hr_attendance_record` 收敛为**一员工一天一条**：
  ```
  保留：employee_id, attendance_date, shift_id, status, remark + 审计列
  新增：work_minutes          实际工时
       expected_minutes      应出勤工时
       late_minutes          迟到分钟
       early_exit_minutes    早退分钟
       overtime_minutes      加班分钟（HR-09 用）
       first_checkin_time    首次打卡
       last_checkout_time    末次打卡
       checkin_count         打卡次数
       half_day_flag         半天标记
       absent_flag           缺勤标记
       date_type             WORKDAY/HOLIDAY/REST（取自日历）
       recalc_time           最近重算时间
       manual_adjusted_flag  是否人工调整过
       appeal_id             关联申诉
  移除：check_type, check_time, expected_time, check_method, location
        （这些移到 hr_attendance_checkin）
  ```
  唯一索引 `uk_emp_date(tenant_id, employee_id, attendance_date)`
- FR-3.2 `status` 取值：`NORMAL` / `LATE` / `EARLY_EXIT` / `LATE_AND_EARLY` / `HALF_DAY` / `ABSENT` / `LEAVE`（请假）/ `HOLIDAY` / `REST` / `BUSINESS_TRIP` / `PENDING`（待打卡）
- FR-3.3 与请假联动：当日有已批准请假时 `status=LEAVE`，不判迟到缺勤（读 D1 的 `hr_time_request`）

### FR-4 自动考勤生成器
- FR-4.1 按班次规则从 `hr_attendance_checkin` 推导日结论：
  1. 按 `checkin_determine_mode` 确定上下班打卡
  2. 按 `working_hours_calc_mode` 计算工时（扣除 `break_minutes`）
  3. 按 `late_grace_minutes` / `early_exit_grace_minutes` 判迟到早退
  4. 按 `half_day_hours_threshold` / `absent_hours_threshold` 判半天缺勤
  5. 查节假日日历（`isWorkday` / `getDateType`）决定是否应出勤 —— 日历 ID 调批次 A A4 的 `resolveCalendarId(employeeId, date)`（三级回退：班次 → 部门 → 租户默认），**不自行实现归属逻辑**
  6. 查请假记录决定是否为 LEAVE
- FR-4.2 由内置任务（批次 A SYS-02 纳管）每日执行，处理前一日考勤
- FR-4.3 `auto_attendance_flag=0` 的班次不自动生成，由 HR 手工录入
- FR-4.4 `process_attendance_after` 之前的日期不处理

### FR-5 考勤重算
- FR-5.1 `POST /hr/attendance/recalculate`，入参：员工范围（全部/部门/指定员工）+ 日期范围
- FR-5.2 重算基于 `hr_attendance_checkin`（原始打卡不变），覆盖 `hr_attendance_record`
- FR-5.3 `manual_adjusted_flag=1` 的记录**默认不被重算覆盖**（保护人工调整结果），可通过参数强制覆盖
- FR-5.4 重算记 `hr_audit_log`（操作人、范围、影响条数）
- FR-5.5 重算是高影响操作，需二次确认；大范围重算走异步任务

### FR-6 打卡位置校验
- FR-6.1 班次或规则可配置允许打卡的地理围栏（中心点经纬度 + 半径米数）
- FR-6.2 打卡时校验位置，超出范围时 `location_valid_flag=0` 并标记异常（不直接拒绝，由 HR 判定）
- FR-6.3 围栏配置存 `hr_attendance_rule.config_json`（此类配置适合留在 JSON）

### FR-7 申诉联动
- FR-7.1 `hr_attendance_appeal` 挂到日结论（`attendance_record_id`）而非单条打卡
- FR-7.2 申诉通过后修正日结论并置 `manual_adjusted_flag=1`
- FR-7.3 补卡类申诉通过后追加一条 `check_method=MANUAL` 的原始打卡并触发该日重算

## 5. 数据模型汇总

| 操作 | 表 |
| --- | --- |
| 新增 | `hr_attendance_checkin` |
| 改造 | `hr_shift`（增 13 字段） |
| 改造 | `hr_attendance_record`（字段重构，一员工一天一条） |
| 改造 | `hr_attendance_rule`（移除 `work_days`，职责收敛） |
| 改造 | `hr_attendance_appeal`（挂日结论） |

`DB/03.cloudflow-hr.sql`：+1 表

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **原始打卡不可变** | 只能追加不能修改删除（FR-2.2），保证审计与重算基础 |
| 重算幂等 | 同一范围重复重算结果一致 |
| 重算保护 | 人工调整结果默认不被覆盖（FR-5.3） |
| 性能 | 单员工单月重算 < 500ms；1000 员工全月重算走异步批处理 |
| 工作日判定唯一 | 统一走节假日日历，`work_days` 移除后无第二套判定 |
| 跨夜班次 | `attendance_date` 归属规则明确（FR-2.3）并有测试覆盖 |
| 位置精度 | 经纬度 DECIMAL(10,7)（约 1cm 精度，足够） |
| 隐私 | 打卡位置属个人信息，查询接口需权限控制；不对非管理者暴露他人位置 |
| 审计 | 重算、人工调整、申诉修正均记 `hr_audit_log` |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 13 个班次判定字段均可配置并在自动考勤中生效（逐条验证） |
| AC-2 | 迟到宽容期 10 分钟时，迟到 8 分钟判正常、12 分钟判迟到 |
| AC-3 | 工时不足半天阈值判 HALF_DAY，不足缺勤阈值判 ABSENT |
| AC-4 | 打卡窗口外的打卡被标记 `offshift_flag` |
| AC-5 | 原始打卡表记录经纬度、设备 ID、打卡方式 |
| AC-6 | **原始打卡无法被修改或删除**；补卡通过追加 MANUAL 记录实现 |
| AC-7 | 日考勤结论一员工一天一条（唯一索引验证） |
| AC-8 | 跨夜班次（22:00-06:00）次日 02:00 打卡正确归属前一日 |
| AC-9 | **改班次规则后重算历史考勤，原始打卡数据不变，结论按新规则更新** |
| AC-10 | `manual_adjusted_flag=1` 的记录重算时默认不被覆盖 |
| AC-11 | 节假日与调休日的考勤判定正确（联动批次 A 日历）：法定节假日不判缺勤，调休上班日正常判定 |
| AC-12 | 当日有已批准请假时 `status=LEAVE`，不判迟到缺勤 |
| AC-13 | 打卡位置超出围栏时标记 `location_valid_flag=0` 但不拒绝打卡 |
| AC-14 | 申诉通过后日结论被修正并置 `manual_adjusted_flag` |
| AC-15 | `hr_attendance_rule.work_days` 已移除，工作日判定全部走日历（无第二套判定） |
| AC-16 | 1000 员工全月重算走异步任务不阻塞接口 |
| AC-17 | 非管理者无法查询他人打卡位置 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A HR-04 前半（节假日日历）** | `isWorkday` / `getDateType`；强依赖 |
| **批次 A SYS-02 任务平台** | 每日自动考勤生成、异步重算 |
| **D1 假期规则体系** | 请假联动（FR-3.3）；弱依赖，可先按现有 `hr_time_request` 对接 |
| 批次 G INT-03 移动端 | 移动打卡（含定位与拍照）；本期只做后端字段与校验 |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **`hr_attendance_record` 字段重构，影响面大** | 项目未上线可直接改；需梳理现有读写该表的全部代码路径（`HrAttendanceResourceControllers`、月度汇总逻辑等） |
| 跨夜班次归属逻辑易错 | FR-2.3 明确规则 + AC-8 专项验证；需覆盖 22:00-06:00、00:00-08:00 等多种跨夜形态 |
| 自动考勤规则组合多，判定结果与预期不符 | AC-1/2/3 逐条验证；提供"试算"功能（给定打卡数据看判定结果）便于 HR 校验规则配置 |
| `work_days` 移除后现有依赖它的逻辑报错 | AC-15；移除前全仓搜 `workDays` 引用点（实测有 4 处：`HrAttendanceRulePayload`、`HrAttendanceRuleVO`、`HrAttendanceMonthlyPayload`、`HrAttendanceMonthlyVO`），注意 `hr_attendance_monthly.work_days` 是"应出勤天数"语义不同，不要误删 |
| 月度汇总（`hr_attendance_monthly`）的应出勤天数来源不明 | 本期明确为：按日历计算的当月工作日数；需改造汇总逻辑 |
| 重算覆盖人工调整导致 HR 工作白做 | FR-5.3 默认保护 + AC-10 |
| 打卡位置属个人信息 | NFR 权限控制 + AC-17 |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | `hr_shift` 增字段 + `hr_attendance_rule` 收敛 + `work_days` 移除 | AC-1/15 |
| M2 | `hr_attendance_checkin` 新表 + 打卡接口 + 不可变约束 | AC-5/6 |
| M3 | `hr_attendance_record` 重构为日结论 + 跨夜归属 | AC-7/8 |
| M4 | 自动考勤生成器（含节假日与请假联动）+ 试算功能 | AC-2/3/4/11/12 |
| M5 | 重算接口（含人工调整保护 + 异步）+ 审计 | AC-9/10/16 |
| M6 | 位置围栏 + 申诉联动 + 权限 + 月度汇总改造 | AC-13/14/17 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | ~~员工所属节假日日历如何确定~~ | **已定**（2026-08-31）：**以班次为准**（本 PRD 的 `hr_shift.holiday_calendar_id`），无排班时回退部门（`sys_dept.holiday_calendar_id`，A4 新增）再回退租户默认。统一解析方法由批次 A A4 提供（`resolveCalendarId()`，A4 FR-4B），本 PRD 与 D1 均调用它 |
| 2 | 综合工时/不定时工时制是否需要 | 本期只做标准工时制（§3.2）。若有制造业等场景需求，需扩展 `hr_shift` 增工时制类型 |
| 3 | 打卡方式是否需要实际设备对接 | 本期只定义字段与校验；实际对接（考勤机/人脸）按需另立条目 |
| 4 | `hr_attendance_monthly` 是否也需重构 | 建议本期只改造"应出勤天数"的计算来源（改为按日历算），完整重构留待观察 |
