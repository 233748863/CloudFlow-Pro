# 批次 D 技术设计（HR 规则精度）

| 项 | 内容 |
| --- | --- |
| 覆盖 | D1（假期体系）· D2（考勤判定）· D3（薪资批量与个税）· D4（员工申诉） |
| 表改动 | **新增 15 张**，改 6 张 |
| 版本 | v1 · 2026-08-31 |

## 0. HR 模块架构特点（设计前补查，摸排未查项之一）

实测 HR 的 463 个端点分布与实现方式：

| Controller 文件 | 端点数 |
| --- | --- |
| `HrTalentResourceControllers` | 34 |
| `HrPerformanceResourceControllers` | 29 |
| `HrCompensationResourceControllers` | 29 |
| `HrTrainingResourceControllers` / `HrBenefitResourceControllers` / `HrAttendanceResourceControllers` | 25 各 |
| 其余 16 个文件 | 14-22 各 |

**两个关键架构特点**：

### ① 多 Controller 打包在单文件（package-private class）

```java
// HrAttendanceResourceControllers.java 一个文件里有 6 个 @RestController
@RestController @RequestMapping("/attendance")
class HrShiftController { ... }                    // 注意：class 不是 public

@RestController @RequestMapping("/attendance")
class HrAttendanceRuleController { ... }

@RestController @RequestMapping("/attendance")
class HrScheduleAssignmentController { ... }
// ... 还有 3 个
```

**影响**：本批新增的表（假期台账、政策、薪资批次等）应**按此惯例追加到对应的 `*ResourceControllers.java` 文件**，而非每表一个新文件。否则 HR 模块会出现两种组织方式。

### ② 泛型 `HrTypedCrudService` 承担多数 CRUD

```java
public class HrTypedCrudService {
    public <T> List<Map<String,Object>> list(Class<T> entityClass, Map<String,?> query);
    public <T> Map<String,Object> page(Class<T> entityClass, Map<String,?> query);
    public <T> Map<String,Object> get(Class<T> entityClass, Long id);
    public <T> Long create(Class<T> entityClass, Object payload);
    public <T> void update(Class<T> entityClass, Long id, Object payload);
    public <T> void updateProperties(Class<T> entityClass, Long id, Map<String,Object> payload);
    public <T> boolean updatePropertiesIfWorkflowInstanceMatches(...);          // 工作流回调用
    public <T> boolean updatePropertiesIfWorkflowInstanceMatchesAndCurrentStatusIn(...);
    public <T> void delete(Class<T> entityClass, Long id);
}
```

**影响（重要）**：
- 本批新表的**纯 CRUD 部分不需要写 Service 实现**，直接用 `HrTypedCrudService` + Entity 类即可
- **批次 A 的 SYS-07 代码生成器对 HR 模块适用性有限** —— HR 不需要生成 ServiceImpl，只需 Entity + Controller 方法。建议 SYS-07 增一个 `tpl_category=HR_TYPED` 模板变体，或 HR 表手工写（成本已很低）
- 有业务逻辑的部分（台账扣减、算薪批次、考勤判定）**必须写独立 Service**，不能塞进泛型 CRUD

---

## 1. D1 假期体系（6 新表 + 2 改表）

### 1.1 `hr_leave_ledger`（台账，核心）

```sql
-- 87. 假期台账表
DROP TABLE IF EXISTS hr_leave_ledger;
CREATE TABLE hr_leave_ledger (
  ledger_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  leave_type_id     BIGINT(20)      NOT NULL COMMENT '假期类型ID',
  leave_period_id   BIGINT(20)      DEFAULT NULL COMMENT '假期周期ID',
  transaction_type  VARCHAR(30)     NOT NULL COMMENT 'ALLOCATION分配/APPLICATION请假/CARRY_FORWARD结转/EXPIRY过期/ENCASHMENT折现/ADJUSTMENT调整/COMPENSATORY调休转入/FREEZE冻结/UNFREEZE解冻',
  source_biz_type   VARCHAR(50)     DEFAULT NULL COMMENT '来源单据类型',
  source_biz_id     VARCHAR(64)     DEFAULT NULL COMMENT '来源单据ID',
  leave_days        DECIMAL(8,2)    NOT NULL COMMENT '天数（正为增负为减）',
  from_date         DATE            DEFAULT NULL COMMENT '适用开始日',
  to_date           DATE            DEFAULT NULL COMMENT '适用结束日',
  carry_forward_flag TINYINT(1)     NOT NULL DEFAULT 0 COMMENT '是否结转产生',
  expired_flag      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否过期扣减',
  lwp_flag          TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否无薪假',
  reversal_of_id    BIGINT(20)      DEFAULT NULL COMMENT '冲正来源台账ID',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (ledger_id),
  KEY idx_hrll_emp_type (tenant_id, employee_id, leave_type_id, leave_period_id),
  KEY idx_hrll_source (source_biz_type, source_biz_id),
  KEY idx_hrll_type_time (transaction_type, create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='假期台账表';
```

**无 `update_time` / `update_by` / `deleted`** —— 台账不可修改（D1 的 AC-16）。冲正靠追加 `reversal_of_id` 指向原记录的反向记录。

### 1.2 其余 5 张表（字段略，结构见 D1 的 PRD §5）

```
hr_leave_period            假期周期（period_name/start_date/end_date/default_flag/status）
hr_leave_policy            政策主体（policy_code/policy_name/description/status）
hr_leave_policy_detail     政策明细（policy_id/leave_type_id/annual_days）
hr_leave_policy_assignment 政策分配（employee_id/policy_id/leave_period_id/assignment_basis/
                                    effective_from/effective_to/carry_forward_flag/allocated_flag）
hr_earned_leave_schedule   按月累积执行台账（employee_id/leave_type_id/leave_period_id/
                                    schedule_date/earned_days/executed_flag/ledger_id）
```

### 1.3 `hr_leave_type` 增 20 列

```sql
  max_days_per_year         DECIMAL(8,2)  DEFAULT NULL COMMENT '年度上限',
  applicable_after_days     INT           DEFAULT 0    COMMENT '入职满N天可用',
  max_continuous_days       INT           DEFAULT NULL COMMENT '单次连续上限',
  carry_forward_flag        TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否可结转',
  max_carry_forward_days    DECIMAL(8,2)  DEFAULT NULL COMMENT '结转上限',
  carry_forward_expire_days INT           DEFAULT NULL COMMENT '结转后N天过期',
  earned_leave_flag         TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否按月累积',
  earned_leave_frequency    VARCHAR(20)   DEFAULT NULL COMMENT 'MONTHLY/QUARTERLY/HALF_YEARLY/YEARLY',
  rounding_mode             VARCHAR(20)   DEFAULT 'NONE' COMMENT 'NONE/HALF_DAY/FULL_DAY',
  encashment_flag           TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否可折现',
  encashment_component_id   BIGINT(20)    DEFAULT NULL COMMENT '折现薪酬项ID',
  lwp_flag                  TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否无薪假',
  partial_paid_flag         TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否部分带薪',
  salary_fraction_per_day   DECIMAL(5,4)  DEFAULT NULL COMMENT '部分带薪比例（如病假0.6）',
  compensatory_flag         TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否调休假',
  optional_leave_flag       TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否可选节假日',
  include_holiday_flag      TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '天数是否含节假日',
  allow_negative_flag       TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否允许负余额',
  allow_over_allocation_flag TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否允许超额分配',
  need_attachment_flag      TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否需附件',
```

### 1.4 `hr_leave_quota` 降级为读模型

```sql
-- 改：year → leave_period_id
  leave_period_id   BIGINT(20)      DEFAULT NULL COMMENT '假期周期ID',
-- 增：
  last_calc_time    DATETIME        DEFAULT NULL COMMENT '最近重算时间',
```

### 1.5 ⚠️ 额度业务链路（摸排发现从零建立）

**这是 D1 最大的工作量，PRD 初版遗漏**。四个接线点：

```java
@Service
public class HrLeaveQuotaService {

    /** ① 请假提交时校验（现在完全没有） */
    public void assertQuotaSufficient(Long employeeId, Long leaveTypeId, BigDecimal days) {
        HrLeaveType type = leaveTypeMapper.selectById(leaveTypeId);
        if (!Boolean.TRUE.equals(type.getNeedQuota())) return;

        BigDecimal available = calcAvailableFromLedger(employeeId, leaveTypeId, currentPeriodId());
        if (available.compareTo(days) < 0 && !Boolean.TRUE.equals(type.getAllowNegativeFlag())) {
            // 复用已定义但从未调用的异常（摸排发现）
            throw HrBusinessException.insufficientQuota(type.getLeaveName(), available, days);
        }
    }

    /** ② 审批提交时冻结 */
    @Transactional
    public void freeze(HrTimeRequest req) {
        writeLedger(req, "FREEZE", req.getDuration().negate());
        refreshQuotaReadModel(req.getEmployeeId(), req.getLeaveTypeId());
    }

    /** ③ 审批通过时把冻结转为实扣 */
    @Transactional
    public void confirmDeduct(HrTimeRequest req) {
        writeLedger(req, "UNFREEZE", req.getDuration());          // 释放冻结
        writeLedger(req, "APPLICATION", req.getDuration().negate()); // 实际扣减
        refreshQuotaReadModel(...);
    }

    /** ④ 驳回/撤销时解冻 */
    @Transactional
    public void release(HrTimeRequest req) {
        writeLedger(req, "UNFREEZE", req.getDuration());
        refreshQuotaReadModel(...);
    }
}
```

**接线位置**：
| 时机 | 接线点 | 说明 |
| --- | --- | --- |
| 提交校验 + 冻结 | `HrAttendanceResourceControllers` 的请假提交方法 / `HrEssWorkflowControllers` | 现在直接 create 不校验 |
| 通过实扣 | **`HrWorkflowCallbackServiceImpl`**（摸排确认它现在完全不碰额度） | 用现有 `updatePropertiesIfWorkflowInstanceMatchesAndCurrentStatusIn` 保证幂等 |
| 驳回解冻 | 同上回调的驳回分支 | — |
| 手工调整 | `hr_leave_quota` 的 CRUD 接口 | 改为写台账 `ADJUSTMENT` 而非直接改数 |

**并发控制**（D1 的 AC-15）：
```java
String lockKey = "lock:hr:quota:" + employeeId + ":" + leaveTypeId;
RLock lock = redissonClient.getLock(lockKey);
if (!lock.tryLock(3, 30, TimeUnit.SECONDS)) throw new HrBusinessException("QUOTA_BUSY", "额度操作繁忙");
try { ... } finally { lock.unlock(); }
```

### 1.6 请假天数服务端计算（D1 的 FR-4）

```java
public BigDecimal computeLeaveDays(Long employeeId, Long leaveTypeId,
                                   LocalDateTime start, LocalDateTime end) {
    HrLeaveType type = leaveTypeMapper.selectById(leaveTypeId);
    boolean includeHoliday = Boolean.TRUE.equals(type.getIncludeHolidayFlag());

    // 跨多日时逐日解析日历（可能跨排班变更）
    BigDecimal total = BigDecimal.ZERO;
    for (LocalDate d = start.toLocalDate(); !d.isAfter(end.toLocalDate()); d = d.plusDays(1)) {
        Long calendarId = holidayResolver.resolveCalendarId(employeeId, d);   // 批次 A A4 的三级回退
        total = total.add(holidayService.calcLeaveDaysForSingleDay(calendarId, d, start, end, includeHoliday));
    }
    return total;
}
```

**`duration` 忽略客户端传值**（AC-11）：在提交入口 `req.setDuration(computeLeaveDays(...))` 覆盖，不一致时记 warn 日志。

**日历不可用时拒绝提交**（AC-13）：`resolveCalendarId` 抛异常 → 直接向上抛，不 catch 后按自然日兜底。

---

## 2. D2 考勤判定（1 新表 + 4 改表）

### 2.1 `hr_attendance_checkin`（原始打卡）

```sql
-- 93. 原始打卡记录表
DROP TABLE IF EXISTS hr_attendance_checkin;
CREATE TABLE hr_attendance_checkin (
  checkin_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  log_type          VARCHAR(10)     NOT NULL COMMENT 'IN上班/OUT下班',
  check_time        DATETIME        NOT NULL COMMENT '打卡时间',
  shift_id          BIGINT(20)      DEFAULT NULL COMMENT '所属班次ID',
  attendance_date   DATE            NOT NULL COMMENT '归属考勤日（跨夜班次按班次开始日归属）',
  device_id         VARCHAR(100)    DEFAULT NULL COMMENT '设备标识',
  check_method      VARCHAR(20)     NOT NULL DEFAULT 'APP' COMMENT 'APP/FACE/CARD/WIFI/GPS/MANUAL',
  latitude          DECIMAL(10,7)   DEFAULT NULL COMMENT '纬度',
  longitude         DECIMAL(10,7)   DEFAULT NULL COMMENT '经度',
  location_name     VARCHAR(200)    DEFAULT NULL COMMENT '位置名称',
  location_valid_flag TINYINT(1)    DEFAULT NULL COMMENT '位置是否在围栏内',
  offshift_flag     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否非本班次打卡',
  overtime_type_id  BIGINT(20)      DEFAULT NULL COMMENT '加班类型ID（H2 预留）',
  skip_auto_flag    TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否跳过自动考勤',
  attendance_record_id BIGINT(20)   DEFAULT NULL COMMENT '回指生成的日考勤结论ID',
  photo_file_id     BIGINT(20)      DEFAULT NULL COMMENT '打卡照片文件ID',
  remark            VARCHAR(200)    DEFAULT NULL COMMENT '备注',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (checkin_id),
  KEY idx_hrac_emp_date (tenant_id, employee_id, attendance_date),
  KEY idx_hrac_emp_time (employee_id, check_time),
  KEY idx_hrac_record (attendance_record_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='原始打卡记录表';
```

**无 `update_*` / `deleted`** —— 原始打卡不可变（D2 的 AC-6）。补卡走新增 `check_method=MANUAL` 记录。

### 2.2 `hr_shift` 增 13 列

```sql
  checkin_window_before_minutes  INT  DEFAULT 120 COMMENT '班次开始前多久可打卡',
  checkout_window_after_minutes  INT  DEFAULT 120 COMMENT '班次结束后多久可打卡',
  late_grace_minutes             INT  DEFAULT 0   COMMENT '迟到宽容期（分钟）',
  early_exit_grace_minutes       INT  DEFAULT 0   COMMENT '早退宽容期（分钟）',
  half_day_hours_threshold       DECIMAL(4,2) DEFAULT NULL COMMENT '工时不足X判半天',
  absent_hours_threshold         DECIMAL(4,2) DEFAULT NULL COMMENT '工时不足Y判缺勤',
  working_hours_calc_mode        VARCHAR(20) DEFAULT 'FIRST_LAST' COMMENT 'FIRST_LAST首末打卡/PAIRED每次进出配对',
  checkin_determine_mode         VARCHAR(20) DEFAULT 'EARLIEST_LATEST' COMMENT 'EARLIEST_LATEST最早最晚/ALTERNATING交替',
  holiday_calendar_id            BIGINT(20)  DEFAULT NULL COMMENT '绑定节假日日历ID',
  auto_attendance_flag           TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '是否自动生成考勤',
  process_attendance_after       DATE        DEFAULT NULL COMMENT '从哪天开始自动处理',
  mark_on_holiday_flag           TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '节假日是否也判考勤',
  overtime_threshold_minutes     INT         DEFAULT NULL COMMENT '超出多少分钟算加班（H2 预留）',
```

### 2.3 `hr_attendance_record` 重构为日结论

```sql
-- 移除（迁到 hr_attendance_checkin）
  -- check_type, check_time, expected_time, check_method, location
-- 新增
  work_minutes           INT  DEFAULT NULL COMMENT '实际工时（分钟）',
  expected_minutes       INT  DEFAULT NULL COMMENT '应出勤工时（分钟）',
  late_minutes           INT  NOT NULL DEFAULT 0 COMMENT '迟到分钟',
  early_exit_minutes     INT  NOT NULL DEFAULT 0 COMMENT '早退分钟',
  overtime_minutes       INT  NOT NULL DEFAULT 0 COMMENT '加班分钟（H2 用）',
  first_checkin_time     DATETIME DEFAULT NULL COMMENT '首次打卡时间',
  last_checkout_time     DATETIME DEFAULT NULL COMMENT '末次打卡时间',
  checkin_count          INT  NOT NULL DEFAULT 0 COMMENT '打卡次数',
  half_day_flag          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '半天标记',
  absent_flag            TINYINT(1) NOT NULL DEFAULT 0 COMMENT '缺勤标记',
  date_type              VARCHAR(20) DEFAULT NULL COMMENT 'WORKDAY/HOLIDAY/REST（取自日历）',
  recalc_time            DATETIME DEFAULT NULL COMMENT '最近重算时间',
  manual_adjusted_flag   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否人工调整过',
  appeal_id              BIGINT(20) DEFAULT NULL COMMENT '关联申诉ID',
-- 唯一索引（一员工一天一条）
  UNIQUE KEY uk_hrar_emp_date (tenant_id, employee_id, attendance_date)
```

`status` 取值扩展：`NORMAL/LATE/EARLY_EXIT/LATE_AND_EARLY/HALF_DAY/ABSENT/LEAVE/HOLIDAY/REST/BUSINESS_TRIP/PENDING`

### 2.4 `hr_attendance_rule` 移除 `work_days`

```sql
  -- work_days 删除（工作日判定统一走 holiday_calendar_id）
```

**⚠️ 摸排提示的坑**：`hr_attendance_monthly.work_days` 是"**应出勤天数**"（数值），与 `hr_attendance_rule.work_days`（周几列表）**语义不同，不要误删**。前者改为按日历计算。

### 2.5 自动考勤生成器（6 步）

```java
@Service
public class HrAttendanceCalculator {

    public HrAttendanceRecord calculate(Long employeeId, LocalDate date) {
        // 1. 解析班次与日历
        HrShift shift = resolveShift(employeeId, date);
        Long calendarId = shift.getHolidayCalendarId() != null
                ? shift.getHolidayCalendarId()
                : holidayResolver.resolveCalendarId(employeeId, date);   // 三级回退

        // 2. 判定日期类型
        DayTypeInfo dayType = holidayService.getDateType(calendarId, date);
        if (!dayType.isWorkday() && !Boolean.TRUE.equals(shift.getMarkOnHolidayFlag())) {
            return buildNonWorkdayRecord(employeeId, date, dayType);     // HOLIDAY/REST
        }

        // 3. 请假优先（AC-12）
        if (hasApprovedLeave(employeeId, date)) {
            return buildLeaveRecord(employeeId, date);                   // status=LEAVE
        }

        // 4. 取原始打卡
        List<HrAttendanceCheckin> checkins = checkinMapper.selectByEmpDate(employeeId, date);
        if (checkins.isEmpty()) {
            return buildAbsentOrPending(employeeId, date, shift);
        }

        // 5. 按 checkin_determine_mode 定上下班
        CheckinPair pair = determineCheckinPair(checkins, shift);

        // 6. 按 working_hours_calc_mode 算工时 → 判迟到/早退/半天/缺勤
        return judge(pair, shift, checkins);
    }

    private HrAttendanceRecord judge(CheckinPair pair, HrShift shift, List<...> checkins) {
        int workMinutes = "PAIRED".equals(shift.getWorkingHoursCalcMode())
                ? sumPairedMinutes(checkins) - shift.getBreakMinutes()
                : minutesBetween(pair.in(), pair.out()) - shift.getBreakMinutes();

        int lateMin = Math.max(0, minutesBetween(shift.getStartTime(), pair.in())
                                  - shift.getLateGraceMinutes());
        int earlyMin = Math.max(0, minutesBetween(pair.out(), shift.getEndTime())
                                  - shift.getEarlyExitGraceMinutes());

        String status;
        if (shift.getAbsentHoursThreshold() != null
            && workMinutes < shift.getAbsentHoursThreshold().multiply(BD_60).intValue()) {
            status = "ABSENT";
        } else if (shift.getHalfDayHoursThreshold() != null
            && workMinutes < shift.getHalfDayHoursThreshold().multiply(BD_60).intValue()) {
            status = "HALF_DAY";
        } else if (lateMin > 0 && earlyMin > 0) { status = "LATE_AND_EARLY"; }
        else if (lateMin > 0)  { status = "LATE"; }
        else if (earlyMin > 0) { status = "EARLY_EXIT"; }
        else                   { status = "NORMAL"; }
        ...
    }
}
```

### 2.6 跨夜班次归属（AC-8）

```java
/** 打卡归属考勤日：按班次开始时间所在日归属 */
LocalDate resolveAttendanceDate(LocalDateTime checkTime, HrShift shift) {
    if (!isOvernightShift(shift)) return checkTime.toLocalDate();   // 非跨夜直接取日期
    // 跨夜（如 22:00-06:00）：checkTime 在 endTime 之前的算前一日
    LocalTime t = checkTime.toLocalTime();
    return t.isBefore(shift.getEndTime())
            ? checkTime.toLocalDate().minusDays(1)
            : checkTime.toLocalDate();
}
boolean isOvernightShift(HrShift s) { return s.getEndTime().isBefore(s.getStartTime()); }
```

**需覆盖测试**：22:00-06:00、00:00-08:00、23:30-07:30 三种跨夜形态。

### 2.7 重算保护（AC-10）

```java
public int recalculate(RecalcRequest req) {
    // 大范围走异步（批次 A SYS-02）
    if (estimateCount(req) > 500) { return jobService.triggerAsync("attendanceRecalc", req); }

    for (...) {
        HrAttendanceRecord old = recordMapper.selectByEmpDate(empId, date);
        if (old != null && Boolean.TRUE.equals(old.getManualAdjustedFlag())
            && !req.isForceOverwrite()) {
            skipped++; continue;                    // 默认不覆盖人工调整
        }
        HrAttendanceRecord fresh = calculator.calculate(empId, date);
        fresh.setRecalcTime(LocalDateTime.now());
        upsert(fresh);
    }
    auditLog.record("ATTENDANCE_RECALC", req, affected, skipped);   // AC-9 审计
}
```

---

## 3. D3 薪资批量与个税（6 新表 + 3 改表）

### 3.1 关键：包在现有 `generateSalarySlips` 外面

摸排确认 `HrEssServiceImpl.generateSalarySlips(periodMonth, employeeId)` 已支持全员批量 + 幂等。**本批不重写它，而是包一层批次管理**：

```java
@Service
public class HrPayrollBatchService {

    /** 建批次：筛人 + 前置校验（不算薪） */
    @Transactional
    public Long createBatch(PayrollBatchCreateDTO dto) {
        HrPayrollBatch batch = buildBatch(dto);
        batchMapper.insert(batch);

        List<Long> empIds = filterEmployees(dto);          // 按部门/职级/岗位/类型筛
        for (Long empId : empIds) {
            PreCheckResult chk = preCheck(empId, dto.getPayrollPeriodId(), dto.isValidateAttendance());
            batchEmpMapper.insert(HrPayrollBatchEmployee.builder()
                    .batchId(batch.getBatchId()).employeeId(empId)
                    .calcStatus(chk.pass() ? "PENDING" : "SKIPPED")
                    .errorMessage(chk.reason())            // AC-6：SKIPPED 带原因
                    .build());
        }
        batch.setEmployeeCount(empIds.size());
        return batch.getBatchId();
    }

    /** 算薪：异步逐人调现有逻辑 */
    public void calculate(Long batchId) {
        updateStatus(batchId, "CALCULATING");
        List<HrPayrollBatchEmployee> pendings = batchEmpMapper.selectPending(batchId);
        for (var be : pendings) {
            try {
                // ★ 复用现有算薪逻辑，只是改为单人调用 + 关联 batchId
                Long slipId = essService.generateSalarySlipForBatch(
                        be.getEmployeeId(), period, batchId);
                be.setSalarySlipId(slipId); be.setCalcStatus("SUCCESS");
            } catch (Exception e) {
                be.setCalcStatus("FAILED");
                be.setErrorMessage(truncate(e.getMessage(), 500));   // AC-3：错误清单
            }
            batchEmpMapper.updateById(be);                            // 单人一事务
        }
        aggregateTotals(batchId);
        updateStatus(batchId, "CALCULATED");
    }

    /** 重跑：只处理 FAILED（AC-3） */
    public void retry(Long batchId) {
        batchEmpMapper.resetFailedToPending(batchId);
        calculate(batchId);
    }

    /** 取消：按 batch_id 精确清理（AC-5） */
    @Transactional
    public void cancel(Long batchId) {
        salarySlipMapper.deleteByBatchId(batchId);      // 只删本批次生成的
        batchEmpMapper.deleteByBatchId(batchId);
        updateStatus(batchId, "CANCELLED");
    }
}
```

**对现有 `generateSalarySlips` 的改动**：新增一个 `generateSalarySlipForBatch(employeeId, period, batchId)` 单人方法，内部调现有 `composeSlip`，只是把 `batch_id` 写进工资单。**现有全员批量方法保留**（供不需要批次管理的场景用）。

### 3.2 前置校验（AC-6）

```java
private PreCheckResult preCheck(Long empId, Long periodId, boolean validateAttendance) {
    if (!hasActiveComp(empId))         return fail("未分配薪资结构");
    if (!hasTaxProfile(empId))         return fail("未配置税档");
    if (isTerminated(empId))           return fail("已离职，需走离职结算");
    if (hasUnclearedAdvance(empId))    return warn("有未结清借款");     // H2 的 HR-14
    if (validateAttendance && !attendanceComplete(empId, periodId))
                                       return fail("考勤未齐备");        // 依赖 D2
    return pass();
}
```

### 3.3 中国累计预扣预缴（AC-9，本批最易算错处）

```java
/**
 * 本期个税 = (年度累计应税所得 × 适用税率 − 速算扣除数) − 年度累计已缴税额
 */
public TaxResult computeTax(Long empId, String periodMonth, BigDecimal currentTaxable) {
    int year = Integer.parseInt(periodMonth.substring(0, 4));

    // 取本年之前各月累计
    CumulativeSnapshot prev = slipMapper.selectCumulative(empId, year, periodMonth);
    BigDecimal cumTaxable   = prev.taxable().add(currentTaxable);
    BigDecimal cumPaid      = prev.taxPaid();

    // 按累计应税所得匹配税率档（用速算扣除数）
    HrTaxSlabDetail slab = taxSlabService.matchByCumulative(empId, cumTaxable);
    BigDecimal cumPayable = cumTaxable.multiply(slab.getTaxRate())
                                      .subtract(slab.getQuickDeduction())
                                      .setScale(2, RoundingMode.HALF_UP);
    if (cumPayable.signum() < 0) cumPayable = BigDecimal.ZERO;

    BigDecimal currentTax = cumPayable.subtract(cumPaid);
    if (currentTax.signum() < 0) currentTax = BigDecimal.ZERO;      // 累计法可能出现负数，本期不退

    return new TaxResult(cumTaxable, cumPayable, cumPaid, currentTax);
}
```

**年度首月重置 + 中途入职按入职月起算**（AC-10）：`selectCumulative` 的 SQL 条件为 `period_month >= GREATEST(入职年月, 本年1月) AND period_month < 当期`。

**税率快照**（AC-11）：`hr_salary_slip.components` JSON 里存计算时用的 `taxRate` / `quickDeduction`，税表变更不影响历史工资单。

### 3.4 6 张新表

```
hr_payroll_period          薪资周期
hr_payroll_batch           批次（含筛选条件 JSON、状态机、汇总金额、error_message）
hr_payroll_batch_employee  批次明细（employee_id/salary_slip_id/calc_status/error_message）
hr_payroll_correction      补正（original_slip_id/correction_slip_id/reason/diff_amount）
hr_tax_slab                税率表主数据（region/effective_from/effective_to/threshold_amount）
hr_tax_slab_detail         税率档明细（from_amount/to_amount/tax_rate/quick_deduction）
```

`hr_salary_slip` 增：`batch_id` + 5 个累计字段（`cumulative_taxable_income` / `cumulative_deduction` / `cumulative_tax_payable` / `cumulative_tax_paid` / `current_tax`）

`hr_tax_profile` 增 `tax_slab_id`；`hr_tax_deduction` 增 5 个举证字段。

---

## 4. D4 员工申诉（2 新表）

```
hr_grievance         申诉主表（含 against_type/against_id 多态指向、escalated_dispute_id 升级链路）
hr_grievance_record  处理轨迹（record_type/operator_role/visible_to_employee_flag）
```

**隐私实现要点**（D4 的 AC-6，本条目最重要）：

```java
/** against_type=USER 时被指向人不可见 */
public IPage<HrGrievance> pageForUser(Long currentUserId, GrievanceQuery q) {
    LambdaQueryWrapper<HrGrievance> w = new LambdaQueryWrapper<>();
    if (isHrRole(currentUserId)) {
        // HR 可见全部，但查看行为记审计（AC-10）
        auditLog.record("GRIEVANCE_VIEW_ALL", currentUserId, q);
    } else {
        // 非 HR：只能看自己提的
        w.eq(HrGrievance::getEmployeeId, resolveEmployeeId(currentUserId));
        // ★ 关键：即使被指向，也看不到（不加 or against_id = me）
    }
    return grievanceMapper.selectPage(page, w);
}
```

`hr_grievance_record.visible_to_employee_flag=0` 的记录在员工侧查询时过滤掉（AC-7）。

申诉类型用 `sys_dict_data`（新增字典 `hr_grievance_type`），不建独立表。

---

## 5. 表数与脚本变化

| 脚本 | 改前 | 改后 | 变化 |
| --- | --- | --- | --- |
| `03.cloudflow-hr.sql` | 85（批次 A 删 1 后） | **100** | +15（D1 六 + D2 一 + D3 六 + D4 二） |
| 全库 | 254（批次 B 后） | **269** | +15 |

**改动表**：`hr_leave_type`(+20列) / `hr_leave_quota`(改 year→period_id, +1列) / `hr_shift`(+13列) / `hr_attendance_record`(重构) / `hr_attendance_rule`(-work_days) / `hr_attendance_monthly`(work_days 来源改) / `hr_salary_slip`(+6列) / `hr_tax_profile`(+1列) / `hr_tax_deduction`(+5列) / `hr_attendance_appeal`(挂日结论)

---

## 6. 新增内置任务（批次 A SYS-02 纳管）

| handler | 频率 | 用途 |
| --- | --- | --- |
| `hrEarnedLeaveAccrual` | 每月 1 日 1:00 | 按月累积假期，写台账 |
| `hrLeaveCarryForward` | 周期结束次日 2:00 | 结转 |
| `hrLeaveExpiry` | 每日 2:30 | 结转额度过期作废 |
| `hrLeaveQuotaReconcile` | 每日 3:00 | 台账与读模型对账，不一致告警 |
| `hrAttendanceDailyCalc` | 每日 5:00 | 前一日自动考勤生成 |
| `hrAttendanceRecalcAsync` | 手动触发 | 大范围重算 |

---

## 7. 实施顺序

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| M1 | D1 六表 + `hr_leave_type` 20 列 + `hr_leave_quota` 改造 | 批次 A 完成 |
| M2 | **D1 额度业务链路**（校验/冻结/扣减/释放 + 四个接线点 + Redisson 锁） | M1 |
| M3 | **D1 请假天数服务端计算**（接批次 A 日历三级回退） | M1、批次 A A4 |
| M4 | D1 政策与周期 + 批量分配 + 按入职日折算 | M2 |
| M5 | D1 四个内置任务（累积/结转/过期/对账） | M2、批次 A SYS-02 |
| M6 | D2 `hr_shift` 13 列 + `hr_attendance_rule` 去 `work_days` | 批次 A A4 |
| M7 | D2 `hr_attendance_checkin` 新表 + 打卡接口 + 跨夜归属 | M6 |
| M8 | D2 `hr_attendance_record` 重构 + 自动考勤生成器 6 步 | M7、M3（请假联动） |
| M9 | D2 重算 + 人工调整保护 + 围栏 + 申诉联动 | M8 |
| M10 | D3 六表 + 税率表 + **累计预扣算法** | — |
| M11 | D3 批次管理层（包在现有 `generateSalarySlips` 外） | M10、M9（考勤扣款）、M2（无薪假） |
| M12 | D3 前置校验 + 异步 + 补正 | M11 |
| M13 | D4 两表 + 状态机 + 隐私过滤 | 批次 A SYS-01 |

**关键依赖链**：批次 A A4 日历 → M3/M6 → M8 → M11（薪资要考勤与假期都就绪）

---

## 8. 待确认（4 项已定案，1 项待外部输入）

**决策记录见 `01-决策汇总.md` §4**

| # | 问题 | ✅ 决策 |
| --- | --- | --- |
| 1 | 新表 Controller 归属 | **追加到现有 `*ResourceControllers.java`**（遵循 HR 惯例：一文件多 `@RestController`）。假期台账 → `HrAttendanceResourceControllers`，薪资批次 → `HrCompensationResourceControllers` |
| 2 | 是否用 `HrTypedCrudService` | **配置类表用**（假期政策/周期/税率表/技能主数据）；**业务逻辑类写独立 Service**（台账扣减/薪资批次/考勤计算 —— 需事务+锁+并发控制，泛型 CRUD 会绕弯路） |
| 3 | SYS-07 对 HR 的适用性 | **增 `tpl_category=HR_TYPED` 模板变体**，只生成 Entity + Controller 方法片段。理由：HR 后续还会持续新增表（D 批 15 张 + H2 批 13 张），一次投入多次收益 |
| 4 | 2026 年税率表数据 | ⛔ **待财务提供**（7 档税率 + 速算扣除数）。可先用占位值实现，上线前替换 |
| 5 | 累计预扣负数处理 | **本期税额为负时按 0 处理，不退税**（年度汇算清缴另处理）。⚠️ 需财务复核 |

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
