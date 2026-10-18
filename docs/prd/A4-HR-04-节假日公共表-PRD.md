# PRD：节假日日历公共表

| 项 | 内容 |
| --- | --- |
| 条目编号 | HR-04 前半（节假日表部分） |
| 所属批次 | 批次 A（第 4 项） |
| 对标依据 | `docs/benchmark/04-hr-人力资源对标.md`、`docs/benchmark/03-crm-客户经营对标.md` |
| 优先级 | P0 |
| 预估工作量 | S |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 为什么单独拆出来先做

节假日日历被**三个模块的四个后续条目**同时依赖，是典型的公共前置：

| 依赖方 | 用途 |
| --- | --- |
| HR-02 假期类型规则 | 请假天数计算需扣除节假日（`include_holiday` 规则） |
| HR-04 后半 班次判定 | 判定某日是否应出勤、是否节假日加班 |
| HR-09 加班类型 | 区分工作日/休息日/法定节假日加班（倍率 1.5 / 2 / 3 不同） |
| CRM-03 SLA 计时 | SLA 只算工作时间，跳过节假日 |

如果不先统一，会出现 HR 一套节假日、CRM 一套工作日历的分裂局面。

### 1.2 目标
1. 建立**全系统唯一**的节假日日历数据源，放在公共库（`01.cloudflow-common.sql`）
2. 提供工作日判定、工作日天数计算、工作时长计算三类基础能力
3. 支持中国法定节假日的**调休**语义（周末上班、工作日放假）
4. 支持多日历（不同地区/不同租户可有不同日历）

### 1.3 非目标
- 不做 HR-02 的假期类型规则（本期只提供日历，规则由 HR-02 消费）
- 不做班次判定逻辑（HR-04 后半负责）
- 不自动同步外部节假日 API（本期人工维护 + 批量导入）

## 2. 现状基线（实测，2026-08-31）

### 2.1 完全没有节假日概念
全仓无节假日表、无节假日字段、无节假日判定逻辑。

### 2.2 现状如何处理"工作日"

| 位置 | 现状 | 问题 |
| --- | --- | --- |
| `hr_attendance_rule.work_days` | 存周几列表（`List<Integer>` 数字 1-7） | **只能表达"周一到周五上班"这种固定模式，无法表达法定节假日与调休** |
| `hr_time_request.duration` | 实测 `HrTimeRequestPayload` 里 `duration` 是**客户端传入**字段，后端无计算逻辑 | 请假 3 天跨国庆，天数由前端算或用户填，节假日不扣除；且客户端可任意传值 |
| `hr_attendance_monthly.work_days` | 应出勤天数字段 | 值从哪来不明，无节假日数据支撑 |
| `crm_service_ticket.due_time` | 录入时算死的固定时间 | 无工作日历概念（对标文档 CRM-03 已记录） |

**结论：`duration` 客户端传入是一个实际的数据可信问题** —— 请假天数不由服务端权威计算，既不准确也可被篡改。本 PRD 提供计算能力，HR-02 负责接管计算并让 `duration` 转为服务端计算结果。

## 3. 范围

### 3.1 做
1. 两张表：`sys_holiday_calendar`（日历主体）+ `sys_holiday_date`（日期明细）
2. 日历管理：新建日历、按年维护日期、批量导入
3. 判定与计算 API：是否工作日、区间工作日天数、区间工作时长
4. 内部 SDK：供 HR / CRM 各服务本地调用（避免每次判定走 RPC）
5. 缓存：日历数据按年缓存到 Redis（判定是高频操作）

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 自动同步国务院节假日安排 | 每年发布时间不定、格式非结构化；本期人工维护 + Excel 导入 |
| 假期规则（结转、累积、折现） | HR-02 负责 |
| 班次与打卡判定 | HR-04 后半负责 |
| 工时制度（标准/综合/不定时） | 超出本期范围 |

## 4. 角色与权限

| 角色 | 权限码 |
| --- | --- |
| 管理员 / HR | `system:holiday:list` / `:add` / `:edit` / `:remove` / `:import` |
| 全部登录用户 | `system:holiday:query`（查询判定结果，前端日期选择器需要） |
| 内部服务 | `@Inner` |

## 5. 功能需求

### FR-1 日历管理
- FR-1.1 一个租户可有多个日历（如"中国大陆"、"香港"、"某工厂两班制"），标记一个为默认
- FR-1.2 日历字段：编码、名称、地区、默认标记、每周固定休息日（周几列表，作为基础模式）、状态
- FR-1.3 删除日历前校验是否被引用（被班次/SLA 策略/假期类型引用时拒绝删除）

### FR-2 日期明细维护
- FR-2.1 日期类型三类：
  - `WORKDAY`：工作日（用于**调休上班**，如某个周六因调休需上班）
  - `HOLIDAY`：法定节假日（不上班，请假不计天数）
  - `REST`：休息日（周末，不上班）
- FR-2.2 只需录入**例外日期**：日历的每周固定休息日已由 FR-1.2 表达，明细表只存"与固定模式不同的日期"+ 法定节假日
- FR-2.3 法定节假日额外字段：节假日名称（春节/国庆）、是否三倍工资日（法定节假日当天 3 倍，调休日 2 倍 —— 这个区分对 HR-09 加班倍率是必需的）
- FR-2.4 按年批量维护：选年份 → 展示日历视图 → 点选日期改类型
- FR-2.5 Excel 批量导入：模板列为 日期 / 类型 / 名称 / 是否三倍工资日；导入前校验并回传错误行

### FR-3 判定与计算能力
- FR-3.1 `isWorkday(calendarId, date)` → boolean
  - 判定顺序：先查 `sys_holiday_date` 明细，命中则按明细类型；未命中则按日历的每周固定休息日模式判定
- FR-3.2 `countWorkdays(calendarId, startDate, endDate)` → int，闭区间工作日天数
- FR-3.3 `calcLeaveDays(calendarId, startTime, endTime, includeHoliday)` → BigDecimal
  - `includeHoliday=false`（默认）：跳过非工作日
  - 支持半天：按 0.5 粒度（起止时间落在上午/下午）
- FR-3.4 `calcWorkMinutes(calendarId, startTime, endTime, workStartTime, workEndTime)` → long
  - 用于 CRM-03 SLA 计时：只累计工作日的工作时段内分钟数
- FR-3.5 `nextWorkday(calendarId, date, n)` → date，第 n 个工作日（用于"3 个工作日内处理完"这类到期时间计算）
- FR-3.6 `getDateType(calendarId, date)` → 类型 + 节假日名称 + 是否三倍工资日（供 HR-09 判定加班倍率）

### FR-4 缓存
- FR-4.1 日历某年的日期明细整年加载并缓存到 Redis，key 含日历 ID 与年份
- FR-4.2 明细变更时精确失效对应年份缓存
- FR-4.3 缓存未命中时回源数据库并重建

### FR-4B 日历归属解析（**已定决策：以班次为准，回退部门/租户默认**）

用户 2026-08-31 决定日历归属链。这是 D1（请假天数计算）与 D2（考勤判定）的共用前提，本 PRD 提供统一解析能力。

- FR-4B.1 解析优先级（三级回退）：
  ```
  1. 员工当前生效班次绑定的日历   → hr_shift.holiday_calendar_id（D2 已设计该字段）
  2. 员工所在部门配置的日历       → sys_dept.holiday_calendar_id（本 PRD 新增该字段）
  3. 租户默认日历                 → sys_holiday_calendar.default_flag = 1
  ```
- FR-4B.2 `sys_dept` 增 `holiday_calendar_id`（可空，空表示继承租户默认）
- FR-4B.3 提供统一解析方法 `resolveCalendarId(employeeId, date)`：
  - 按日期查该员工当日排班（`hr_schedule_assignment` → `hr_shift`），取班次绑定日历
  - 无排班时查员工所在部门（`hr_employee.dept_id` → `sys_dept.holiday_calendar_id`）
  - 仍为空时取租户默认日历
  - 全部为空时**抛出明确异常**（不静默按自然日计算，见 NFR 与 AC-13）
- FR-4B.4 解析结果缓存（员工 + 日期粒度，短 TTL），避免请假天数计算时逐日查排班
- FR-4B.5 **D1 与 D2 必须调用本方法**，不各自实现归属逻辑

### FR-5 SDK 与调用方式
- FR-5.1 判定能力放 `cloudflow-common-*` 公共模块，各服务本地调用（读同库 + 走 Redis 缓存），**不走 RPC**
- FR-5.2 同时提供 `@Inner` 接口供跨服务兜底调用
- FR-5.3 对前端提供查询接口：某月各日类型（日期选择器要标出节假日）

## 6. 数据模型

### 6.1 `sys_holiday_calendar`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| calendar_id | BIGINT PK AUTO | |
| tenant_id | BIGINT | |
| calendar_code | VARCHAR(50) | 编码 |
| calendar_name | VARCHAR(100) | 名称 |
| region | VARCHAR(50) | 地区 |
| default_flag | TINYINT | 是否默认日历 |
| weekly_rest_days | VARCHAR(20) | 每周固定休息日，如 `6,7`（周六周日） |
| work_start_time | TIME | 标准工作开始时间（SLA 计时用，如 09:00） |
| work_end_time | TIME | 标准工作结束时间（如 18:00） |
| lunch_start_time | TIME | 午休开始（工作时长计算需扣除） |
| lunch_end_time | TIME | 午休结束 |
| status | VARCHAR(20) | ENABLED / DISABLED |
| remark | VARCHAR(500) | |
| + 审计列 | | deleted/version/create_by/create_time/update_by/update_time |

唯一索引 `uk_tenant_code(tenant_id, calendar_code)`
约束：同一租户仅一条 `default_flag=1`

### 6.2 `sys_holiday_date`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| date_id | BIGINT PK AUTO | |
| tenant_id | BIGINT | |
| calendar_id | BIGINT | |
| holiday_date | DATE | 日期 |
| date_type | VARCHAR(20) | WORKDAY / HOLIDAY / REST |
| holiday_name | VARCHAR(50) | 节假日名称 |
| triple_pay_flag | TINYINT | 是否三倍工资日（法定节假日当天=1，调休日=0） |
| year_no | SMALLINT | 年份（冗余，便于按年查询与缓存） |
| remark | VARCHAR(200) | |
| + 审计列 | | |

唯一索引 `uk_calendar_date(tenant_id, calendar_id, holiday_date)`
索引 `idx_calendar_year(calendar_id, year_no)`

**放置位置**：`DB/01.cloudflow-common.sql`（公共表，HR 与 CRM 共用）

### 6.2B `sys_dept` 改动
增 `holiday_calendar_id BIGINT DEFAULT NULL COMMENT '节假日日历ID，空表示继承租户默认'`（FR-4B.2，用于日历归属的第二级回退）

### 6.3 种子数据
`06.cloudflow-business-seed.sql` 写入：
- 一条默认日历"中国大陆"（`weekly_rest_days=6,7`，工作时段 09:00-18:00，午休 12:00-13:00）
- 当年（2026）的法定节假日与调休日明细

## 7. 接口设计

服务：`cloudflow-auth`，路径前缀 `/system/holiday`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/calendar/list` | `system:holiday:list` | 日历列表 |
| GET | `/calendar/{id}` | `system:holiday:list` | 日历详情 |
| POST | `/calendar` | `system:holiday:add` | 新建日历 |
| PUT | `/calendar` | `system:holiday:edit` | 修改日历 |
| DELETE | `/calendar/{ids}` | `system:holiday:remove` | 删除（含引用校验） |
| GET | `/date/list` | `system:holiday:list` | 按日历与年份查明细 |
| POST | `/date/batch` | `system:holiday:edit` | 批量保存某年明细 |
| POST | `/date/import` | `system:holiday:import` | Excel 导入 |
| GET | `/date/import/template` | `system:holiday:import` | 下载导入模板 |
| DELETE | `/date/{ids}` | `system:holiday:remove` | 删除明细 |
| GET | `/query/month` | `system:holiday:query` | 某月各日类型（前端日期选择器用） |
| GET | `/query/is-workday` | `system:holiday:query` | 单日判定 |
| GET | `/query/count-workdays` | `system:holiday:query` | 区间工作日天数 |
| GET | `/inner/holiday/**` | `@Inner` | 跨服务判定兜底 |

## 8. 非功能需求

| 项 | 要求 |
| --- | --- |
| 性能 | 判定操作 P99 < 5ms（Redis 缓存命中）；区间计算按天遍历，一年内区间 < 20ms |
| 缓存一致性 | 明细变更后缓存失效 ≤ 1 秒；多实例通过 Redis 共享缓存，无本地缓存不一致问题 |
| 并发 | 判定为纯读操作，无并发写冲突；批量保存某年明细用事务 |
| 数据准确性 | 法定节假日数据错误会直接导致薪资与请假算错，明细变更**必须记审计日志**；建议变更走审批（可复用现有 `sys_dict_change_approval` 模式，本期先只做审计） |
| 多租户 | 日历按 `tenant_id` 隔离；平台可提供 `tenant_id=0` 的公共日历供租户继承 |
| 时区 | 统一按服务器时区，不做多时区（当前项目为国内单时区场景） |

## 9. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 默认日历"中国大陆"与 2026 年法定节假日明细种子数据可执行且数据正确 |
| AC-2 | `isWorkday` 对以下四种情况判定正确：普通工作日=true、普通周末=false、法定节假日=false、**调休上班的周六=true** |
| AC-3 | `countWorkdays` 跨国庆假期区间返回值扣除了节假日与调休后的正确天数 |
| AC-4 | `calcLeaveDays` 请假跨节假日时天数不含节假日；半天请假返回 0.5 |
| AC-5 | `calcWorkMinutes` 跨夜、跨周末、跨节假日时只累计工作时段分钟数，且扣除午休 |
| AC-6 | `nextWorkday(date, 3)` 跨周末与节假日时返回正确的第 3 个工作日 |
| AC-7 | `getDateType` 对法定节假日当天返回 `triple_pay_flag=1`，对调休日返回 0 |
| AC-8 | Excel 导入 2027 年节假日，错误行（日期格式错、类型非法、重复日期）被拒绝并回传行号 |
| AC-9 | 明细变更后 1 秒内判定结果更新（缓存失效验证） |
| AC-10 | 删除被引用的日历被拒绝并提示引用方 |
| AC-11 | 同一租户设置第二个默认日历时，原默认自动取消（唯一性保证） |
| AC-12 | 前端日期选择器可正确标出节假日与调休日 |
| AC-13B | **日历归属三级回退正确**：员工有排班时取班次日历；无排班时取部门日历；部门未配时取租户默认 |
| AC-13C | 三级全空时抛出明确异常，**不静默按自然日计算** |
| AC-13D | D1 与 D2 均调用统一解析方法，不各自实现归属逻辑（代码审查） |

## 10. 依赖与风险

### 10.1 依赖
| 依赖 | 说明 |
| --- | --- |
| Redis（已有） | 缓存 |
| FastExcel 1.0.0（已有） | Excel 导入 |
| SYS-07 代码生成器 | 两张表 CRUD 由生成器产出 |

### 10.2 被依赖（本条目的价值所在）
| 后续条目 | 消费什么 |
| --- | --- |
| HR-02 假期类型规则 | `calcLeaveDays` + `include_holiday` 规则，并接管 `hr_time_request.duration` 的服务端计算 |
| HR-04 后半 班次判定 | `isWorkday` + `getDateType` |
| HR-09 加班类型 | `getDateType` 的 `triple_pay_flag` 决定加班倍率 |
| CRM-03 SLA | `calcWorkMinutes` + `nextWorkday` |
| OA 各类到期提醒 | `nextWorkday`（"3 个工作日内"类到期计算） |

### 10.3 风险

| 风险 | 应对 |
| --- | --- |
| **节假日数据错误直接导致薪资/请假算错** | 明细变更记审计日志；建议后续接入变更审批；每年数据录入后由 HR 复核确认（流程性保障） |
| 每年国务院节假日安排发布后需人工更新，可能漏更 | 提供"某年份未维护"提醒：当查询的年份无明细数据时在管理页告警；可加一个内置任务（SYS-02）每年 11 月提醒维护次年数据 |
| `hr_attendance_rule.work_days` 与新日历并存造成两套工作日判定 | 本期只建表与能力，HR-04 后半改造班次时统一收口到日历；PRD 需在 HR-04 后半明确 `work_days` 的去留 |
| 多租户各自维护日历，数据重复且易错 | 提供 `tenant_id=0` 公共日历，租户默认继承，仅需覆盖差异 |
| 半天粒度的上午/下午边界如何定义 | 用日历的 `lunch_start_time` 作为分界（默认 12:00），见 §12 待确认-2 |

## 11. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 两张表（SYS-07 生成）+ 日历与明细 CRUD + 种子数据 | AC-1/10/11 |
| M2 | 判定与计算六个方法 + Redis 缓存 + 公共 SDK | AC-2~AC-7、AC-9 |
| M3 | Excel 导入 + 模板下载 + 年度维护提醒 | AC-8 |
| M4 | 前端日历维护页面与日期选择器集成（手写） | AC-12 |

## 12. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 0 | ~~员工所属日历如何确定~~ | **已定**：班次 → 部门 → 租户默认 三级回退（FR-4B）。`sys_dept` 需增 `holiday_calendar_id` 字段 |
| 1 | 明细变更是否走审批 | 本期只记审计日志；若 HR 认为薪资风险高，后续复用 `sys_dict_change_approval` 模式加审批 |
| 2 | 半天请假的上午/下午分界点 | 用日历 `lunch_start_time`（默认 12:00）作为分界；起止时间在 12:00 前算上午 |
| 3 | 是否需要"工作时段"支持多段（如上午 9-12、下午 13-18 之外还有晚班） | 本期只支持单工作时段 + 午休扣除；多段需求出现时扩展为子表 |
| 4 | `tenant_id=0` 公共日历的继承规则 | 租户未建日历时自动使用公共日历；租户建了同编码日历则覆盖 |
