import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d2-month-performance'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d2-month-performance-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const marker = 'D2M-' + randomUUID().replaceAll('-', '').slice(0, 12);
const fixture = { marker, employees: [], measurements: [], profiles: [] };
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const save = () => write('fixture.json', fixture);
const hash = value => createHash('sha256').update(value).digest('hex');
const id = value => { const text = String(value); assert.match(text, /^[1-9]\d*$/); return text; };
const sql = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, database, rows, api, ok, requests, sessions, browserErrors, sensitive } = runtime;
const base = '/hr/attendance', holiday = '/auth/system/holiday';
const tables = [['hr_employee','id'],['hr_shift','id'],['hr_attendance_rule','id'],['hr_schedule_assignment','id'],
  ['hr_attendance_checkin','checkin_id'],['hr_attendance_record','id'],['hr_attendance_monthly','id'],['sys_holiday_calendar','calendar_id'],['sys_holiday_date','date_id']];
const bounds = {};
const snapshot = () => Object.fromEntries(tables.map(([table, key]) => [table, hash(database(`SELECT * FROM ${table} WHERE ${key}<=${bounds[table]} ORDER BY ${key}`))]));
const last = new Map();
let failure, original, preservation = false, secrets = false;
function controlProfile(service, start) {
  const owned = runtime.state.processes.find(value => value.name === service);
  assert.ok(owned && Number.isInteger(owned.id));
  const filename = path.join(output, `${service}.jfr`).replaceAll('\\','/');
  const args = start ? [String(owned.id), 'JFR.start', 'name=D2Month', 'settings=profile', `filename=${filename}`, 'dumponexit=true']
    : [String(owned.id), 'JFR.stop', 'name=D2Month'];
  const result = spawnSync('jcmd', args, { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${service} profiling command failed`);
  assert.ok(!/Could not|Error|Exception/.test(result.stdout), `${service} profiling rejected`);
  if (start) fixture.profiles.push(service);
  else fixture.profiles = fixture.profiles.filter(value => value !== service);
  save();
}
async function measure(employeeId, stage) {
  const remaining = 5100 - (Date.now() - (last.get(employeeId) || 0));
  if (remaining > 0) await delay(remaining);
  const started = performance.now();
  const response = await api('admin', base + '/recalculate', { method: 'POST', body: {
    employeeIds: [employeeId], startDate: '2025-09-01', endDate: '2025-09-30', confirmed: true, forceOverwrite: false } });
  const milliseconds = Number((performance.now() - started).toFixed(2));
  last.set(employeeId, Date.now());
  const result = runtime.success(response, 'monthly recalculation');
  check('synchronous_30_days_' + stage, result.asynchronous === false && result.affected === 30);
  fixture.measurements.push({ employeeId, stage, milliseconds, traceId: response.traceId, meets500ms: milliseconds < 500 }); save();
  check('one_result_per_day_' + stage, database(`SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=${employeeId} AND attendance_date BETWEEN '2025-09-01' AND '2025-09-30' AND deleted=0`) === '30');
}
try {
  for (const [table, key] of tables) bounds[table] = database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`);
  original = snapshot(); fixture.originalBounds = bounds; fixture.originalDigest = original; save();
  fixture.deptId = id(database(`SELECT dept_id FROM sys_user WHERE tenant_id=100000 AND user_id=${id(sessions.admin.identity.userId)}`));
  await ok('admin', holiday + '/calendar', 'POST', { calendarCode: marker, calendarName: marker, defaultFlag: 0,
    weeklyRestDays: '6,7', workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' });
  fixture.calendarId = id(database(`SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=${sql(marker)}`)); save();
  await ok('admin', holiday + '/date/batch', 'POST', { calendarId: fixture.calendarId, yearNo: 2025,
    dates: Array.from({length:30}, (_, index) => ({ holidayDate: `2025-09-${String(index + 1).padStart(2,'0')}`, dateType: 'WORKDAY', triplePayFlag: 0 })) });
  fixture.shiftId = id(await ok('admin', base + '/shifts', 'POST', { shiftCode: marker, shiftName: marker, startTime: '09:00:00', endTime: '18:00:00',
    breakMinutes: 60, workMinutes: 480, checkinWindowBeforeMinutes: 30, checkoutWindowAfterMinutes: 30, lateGraceMinutes: 10, earlyExitGraceMinutes: 10,
    halfDayHoursThreshold: 4, absentHoursThreshold: 2, workingHoursCalcMode: 'FIRST_LAST', checkinDetermineMode: 'EARLIEST_LATEST', holidayCalendarId: fixture.calendarId,
    autoAttendanceFlag: 1, processAttendanceAfter: '2025-01-01', markOnHolidayFlag: 0, overtimeThresholdMinutes: 0, status: 1 })); save();
  for (const name of ['no-punches','full-punches']) {
    const employeeId = id(await ok('admin','/hr/employees','POST',{employeeNo:marker+'-'+name,name:marker+'-'+name,gender:'MALE',deptId:fixture.deptId,employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2025-01-01'}));
    fixture.employees.push({name,employeeId}); save();
    await ok('admin',base+'/schedules','POST',{targetType:'EMPLOYEE',targetId:employeeId,shiftId:fixture.shiftId,effectiveStart:'2025-09-01',effectiveEnd:'2025-09-30',status:'ACTIVE'});
    if (name === 'full-punches') {
      for (let day = 1; day <= 30; day++) for (const [time, logType] of [['09:00:00','IN'],['18:00:00','OUT']]) {
        await ok('admin',base+'/checkins','POST',{employeeId,logType,checkTime:`2025-09-${String(day).padStart(2,'0')} ${time}`,checkMethod:'APP',deviceId:marker,remark:marker});
      }
    }
  }
  const punchFacts = () => hash(database(`SELECT employee_id,attendance_date,check_time,log_type,check_method,device_id,remark FROM hr_attendance_checkin WHERE employee_id IN (${fixture.employees.map(value=>value.employeeId).join(',')}) ORDER BY checkin_id`));
  fixture.punchDigest = punchFacts(); save();
  for (const stage of ['baseline-insert','baseline-repeat']) for (const employee of fixture.employees) await measure(employee.employeeId, stage);
  for (const employee of fixture.employees) {
    const status = employee.name === 'no-punches' ? 'ABSENT' : 'NORMAL';
    check('expected_all_month_' + employee.name, database(`SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id=${employee.employeeId} AND status=${sql(status)}`) === '30');
  }
  for (const service of ['hr','gateway']) controlProfile(service, true);
  for (let round = 0; round < 3; round++) for (const employee of fixture.employees) await measure(employee.employeeId, 'profile-' + round);
  for (const service of [...fixture.profiles]) controlProfile(service, false);
  check('raw_punch_facts_unchanged', fixture.punchDigest === punchFacts());
  for (const measurement of fixture.measurements) {
    measurement.serviceTimings = rows(`SELECT JSON_OBJECT('service',service_name,'durationMs',duration_ms,'operationMs',time) FROM sys_log WHERE trace_id=${sql(measurement.traceId)} ORDER BY log_id`);
  }
  check('browser_no_unhandled_errors', browserErrors.length === 0);
} catch (error) { failure = error; }
finally {
  for (const service of [...fixture.profiles]) { try { controlProfile(service, false); } catch (error) { failure ||= error; } }
  try { check('preexisting_business_rows_unchanged', original && JSON.stringify(original) === JSON.stringify(snapshot())); preservation = true; } catch (error) { failure ||= error; }
  try { const scan = await runtime.scan(); secrets = true; console.log('D2_MONTH_LOG_SCAN: ' + JSON.stringify(scan)); } catch (error) { failure ||= error; }
  await runtime.close(); save(); write('requests.json', requests);
  const baseline = fixture.measurements.filter(value => value.stage.startsWith('baseline'));
  const performanceMet = baseline.length === 4 && baseline.every(value=>value.meets500ms);
  const raw = failure ? String(failure.message).split('\n')[0].slice(0,200) : undefined;
  const message = raw && [...sensitive].every(value => !raw.includes(value)) ? raw : failure ? 'Month performance verification failed' : undefined;
  write('result.json', { passed: !failure && preservation && secrets, correctness: !failure, preservation, secrets, checks, requests: requests.length,
    measurements: fixture.measurements, performanceMet, requirementMilliseconds: 500, baselineCount: baseline.length, profilingSeparate: true,
    all17Complete: false, globalComplete: false, failure: message });
  console.log(`D2_MONTH_SUMMARY: checks=${checks.length}; requests=${requests.length}; correctness=${!failure}; performance_met=${performanceMet}; baseline_count=${baseline.length}; preservation=${preservation}`);
  if (failure) { console.log('D2_MONTH_FAILURE: ' + message); process.exitCode = 1; }
}
