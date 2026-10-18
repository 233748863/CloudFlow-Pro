import { createHash } from 'node:crypto';

// Populate only the current peer employee through the existing checkin and monthly APIs.
export async function prepareHrOvertimePayrollAttendance(context) {
  const { fixture, employeeId, cards, ok, call, check, database, jsonRows, sqlText, save, pause } = context;
  const owner = employeeId('peer'), start = '2026-08-01', end = '2026-08-31';
  const scope = `tenant_id=100000 AND employee_id=${sqlText(owner)}`;
  const dateScope = `attendance_date BETWEEN '${start}' AND '${end}'`;
  const dates = Array.from({ length: 31 }, (_, index) => '2026-08-' + String(index + 1).padStart(2, '0'));
  const workdays = dates.filter(date => ![0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay()));
  check('独立日历预期8月31天含21个工作日及10个休息日', workdays.length === 21 && dates.length - workdays.length === 10);
  const hash = statement => createHash('sha256').update(database(statement)).digest('hex');
  const punchesBeforeMonth = () => hash(`SELECT * FROM hr_attendance_checkin WHERE ${scope} AND NOT (${dateScope}) ORDER BY checkin_id`);
  const originalPunches = punchesBeforeMonth();
  const originalEmpty = () => ({
    punches: database(`SELECT COUNT(*) FROM hr_attendance_checkin WHERE ${scope} AND ${dateScope}`),
    days: database(`SELECT COUNT(*) FROM hr_attendance_record WHERE ${scope} AND ${dateScope}`),
    months: database(`SELECT COUNT(*) FROM hr_attendance_monthly WHERE ${scope} AND year=2026 AND month=8`),
  });
  check('本轮工资员工原8月没有打卡日考勤或月汇总', Object.values(originalEmpty()).every(value => value === '0'));
  const monthPath = '/hr/attendance/monthly/confirm?employeeId=' + owner + '&month=2026-08';
  const incomplete = await call('hr', monthPath, 'POST');
  check('工作日考勤未生成时真实封账拒绝且不保存月记录', incomplete.status === 400 && incomplete.body?.code === 'ATTENDANCE_INCOMPLETE'
    && Object.values(originalEmpty()).every(value => value === '0'));
  const denied = await call('peer', monthPath, 'POST');
  check('工资员工不能自行办理月考勤封账', denied.status === 403 && Object.values(originalEmpty()).every(value => value === '0'));
  for (const date of workdays) await cards('peer', date, '08:00:00', '16:00:00');
  const raw = jsonRows(`SELECT JSON_OBJECT('date',CAST(attendance_date AS CHAR),'time',DATE_FORMAT(check_time,'%H:%i:%s'),
    'type',log_type,'method',check_method,'linked',CAST(attendance_record_id AS CHAR)) FROM hr_attendance_checkin WHERE ${scope} AND ${dateScope} ORDER BY check_time,checkin_id`);
  check('真实接口登记42条独立进出卡，尚未生成日结论', raw.length === 42 && raw.every(row => row.method === 'MANUAL' && row.linked === null)
    && workdays.every(date => raw.filter(row => row.date === date).length === 2
      && raw.some(row => row.date === date && row.type === 'IN' && row.time === '08:00:00')
      && raw.some(row => row.date === date && row.type === 'OUT' && row.time === '16:00:00')));
  const punchFacts = () => hash(`SELECT checkin_id,employee_id,check_time,log_type,check_method,shift_id,attendance_date,skip_auto_flag,offshift_flag
    FROM hr_attendance_checkin WHERE ${scope} AND ${dateScope} ORDER BY checkin_id`);
  const rawFacts = punchFacts();
  const body = { employeeIds: [owner], startDate: start, endDate: end, confirmed: true, forceOverwrite: false };
  const result = await ok('hr', '/hr/attendance/recalculate', 'POST', body);
  check('单员工31天真实重算按既有500日阈值同步完成', result.asynchronous === false && result.affected === 31 && !result.executeNo);
  const daily = jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'date',CAST(attendance_date AS CHAR),'status',status,'type',date_type,
    'minutes',work_minutes,'expected',expected_minutes,'count',checkin_count,'manual',manual_adjusted_flag,'late',late_minutes,
    'early',early_exit_minutes,'absent',absent_flag,'half',half_day_flag,'overtime',overtime_minutes) FROM hr_attendance_record
    WHERE ${scope} AND ${dateScope} AND deleted=0 ORDER BY attendance_date`);
  check('31天日考勤完整唯一且全部为真实计算结论', daily.length === 31 && new Set(daily.map(row => row.date)).size === 31
    && dates.every(date => daily.some(row => row.date === date)) && daily.every(row => Number(row.manual) === 0));
  for (const row of daily) {
    const working = workdays.includes(row.date);
    check(row.date + ' 日状态、分钟和原始卡数量符合独立日历', row.type === (working ? 'WORKDAY' : 'REST')
      && row.status === (working ? 'NORMAL' : 'REST') && Number(row.minutes) === (working ? 480 : 0)
      && Number(row.expected) === (working ? 480 : 0) && Number(row.count) === (working ? 2 : 0)
      && ['late', 'early', 'absent', 'half', 'overtime'].every(key => Number(row[key]) === 0));
  }
  const linked = Number(database(`SELECT COUNT(*) FROM hr_attendance_checkin punch JOIN hr_attendance_record day
    ON day.id=punch.attendance_record_id AND day.tenant_id=punch.tenant_id AND day.employee_id=punch.employee_id
      AND day.attendance_date=punch.attendance_date WHERE punch.tenant_id=100000 AND punch.employee_id=${sqlText(owner)}
      AND punch.attendance_date BETWEEN '${start}' AND '${end}' AND day.deleted=0`));
  check('42条原始卡精确关联本员工本日结论且原始事实不改', linked === 42 && punchFacts() === rawFacts && punchesBeforeMonth() === originalPunches);
  const month = await ok('hr', '/hr/attendance/monthly/summarize?employeeId=' + owner + '&month=2026-08', 'POST');
  const checkMonth = (row, status, text) => check(text, String(row.employeeId) === owner && Number(row.year) === 2026 && Number(row.month) === 8
    && row.status === status && Number(row.workDays) === 21 && Number(row.actualDays) === 21 && Number(row.attendanceRate) === 100
    && ['lateTimes', 'earlyTimes', 'absentDays', 'leaveDays', 'overtimeHours'].every(key => Number(row[key]) === 0));
  checkMonth(month, 'DRAFT', '真实月汇总为应出勤21天、实出勤21天、100%出勤率');
  const pending = await ok('admin', '/hr/compensation/payroll/batches/preview', 'POST', {
    payrollPeriodId: fixture.payroll.periodId, employeeIds: [owner], validateAttendanceFlag: 1, deductUnverifiedFlag: 0 });
  check('日考勤已齐但月汇总未确认时仍阻断算薪', pending.length === 1 && pending[0].calcStatus === 'SKIPPED' && /考勤未封账/.test(pending[0].errorMessage));
  const confirmed = await ok('hr', monthPath, 'POST');
  checkMonth(confirmed, 'CONFIRMED', '人事实际确认月度封账并保留21天出勤');
  check('月封账沿用原汇总且只自然推进一次版本', String(confirmed.id) === String(month.id) && confirmed.version === month.version + 1);
  const frozen = () => ({
    punches: hash(`SELECT * FROM hr_attendance_checkin WHERE ${scope} AND ${dateScope} ORDER BY checkin_id`),
    days: hash(`SELECT * FROM hr_attendance_record WHERE ${scope} AND ${dateScope} ORDER BY id`),
    month: hash(`SELECT * FROM hr_attendance_monthly WHERE ${scope} AND year=2026 AND month=8 ORDER BY id`),
  });
  const before = frozen();
  await pause(5100);
  const repeated = await ok('hr', monthPath, 'POST');
  checkMonth(repeated, 'CONFIRMED', '重复月确认保留封账结果');
  check('重复封账不推进版本且不改任何原始卡、日或月记录', JSON.stringify(frozen()) === JSON.stringify(before));
  const skipped = await ok('hr', '/hr/attendance/recalculate', 'POST', { ...body, forceOverwrite: true });
  check('封账后即使选择强制重算也跳过本月', skipped.asynchronous === false && skipped.affected === 0 && JSON.stringify(frozen()) === JSON.stringify(before));
  const write = await call('hr', '/hr/attendance/checkins', 'POST', { employeeId: owner, logType: 'IN', checkTime: '2026-08-03 08:01:00',
    shiftId: fixture.ids['shift-early'], checkMethod: 'MANUAL', deviceId: context.label, remark: context.note });
  check('封账后拒绝新增原始卡且日月及原卡不变', write.status === 400 && write.body?.code === 'ATTENDANCE_CLOSED'
    && JSON.stringify(frozen()) === JSON.stringify(before));
  const confirmAudits = Number(database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='ATTENDANCE_MONTHLY'
    AND business_id=${sqlText(String(confirmed.id))} AND operation_type='CONFIRM'`));
  check('实际月封账仅登记一条确认审计', confirmAudits === 1);
  const accepted = await ok('admin', '/hr/compensation/payroll/batches/preview', 'POST', {
    payrollPeriodId: fixture.payroll.periodId, employeeIds: [owner], validateAttendanceFlag: 1, deductUnverifiedFlag: 0 });
  check('封账后开启考勤校验的工资预检真实放行本员工', accepted.length === 1 && accepted[0].calcStatus === 'PENDING' && String(accepted[0].employeeId) === owner);
  fixture.payroll.attendance = { passed: true, source: 'real-admin-checkin-api', month: '2026-08', employeeId: owner, workdays: 21, restDays: 10,
    punches: 42, dailyRecords: 31, workMinutes: 10080, monthId: String(confirmed.id), status: confirmed.status,
    automaticDailyResults: true, incompleteConfirmationDenied: true, employeeConfirmationDenied: true, draftPayrollBlocked: true,
    repeatedConfirmationKept: true, closedRecalculationSkipped: true, closedCheckinDenied: true, confirmAudits, before };
  await save();
  return async () => {
    check('取消重算及发薪后封账考勤、原始卡和月汇总全部列不变', JSON.stringify(frozen()) === JSON.stringify(before) && punchesBeforeMonth() === originalPunches);
    fixture.payroll.attendance.keptAfterPayroll = true; await save();
  };
}
