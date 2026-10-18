import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { hundredths } from './batch-h/hr09-evidence.mjs';

// Browser-authenticated business writes; database access is read-only and confined to the owned fixture.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d2-rules'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d2-rules-live-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const marker = 'D2R-' + randomUUID().replaceAll('-', '').slice(0, 12);
const fixture = { marker, employees: [], shifts: [], schedules: [], rules: [], cases: [], timings: [] };
const evidence = { configuration: false, rules: false, rawFacts: false, recalculation: false, calendar: false, geofence: false, preservation: false, secrets: false };
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const save = () => write('fixture.json', fixture);
const hash = value => createHash('sha256').update(value).digest('hex');
const id = value => { const text = String(value); assert.match(text, /^[1-9]\d*$/); return text; };
const sql = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, database, databaseDigest, rows, api, ok, sensitive, requests, sessions, browserErrors } = runtime;
const base = '/hr/attendance', holiday = '/auth/system/holiday';
let failure, originalDigest;
const bounds = {};
const preservedTables = [['hr_employee','id'],['hr_shift','id'],['hr_attendance_rule','id'],['hr_schedule_assignment','id'],
  ['hr_attendance_checkin','checkin_id'],['hr_attendance_record','id'],['hr_attendance_monthly','id'],['sys_holiday_calendar','calendar_id'],['sys_holiday_date','date_id']];
function originalSnapshot() {
  return Object.fromEntries(preservedTables.map(([table, column]) => [table, databaseDigest(`SELECT * FROM ${table} WHERE ${column}<=${bounds[table]} ORDER BY ${column}`)]));
}
const record = (employee, date) => rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'workMinutes',work_minutes,'lateMinutes',late_minutes,'earlyExitMinutes',early_exit_minutes,'halfDayFlag',half_day_flag,'absentFlag',absent_flag,'manualAdjustedFlag',manual_adjusted_flag,'checkinCount',checkin_count,'dateType',date_type,'remark',remark,'version',version) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=${id(employee)} AND attendance_date=${sql(date)} AND deleted=0`);
const raw = (employee, date) => ok('admin', `${base}/checkins?employeeId=${employee}&from=${date}&to=${date}`);
const rawFacts = entries => entries.map(({ attendanceRecordId, ...fact }) => fact).sort((a,b) => String(a.checkinId).localeCompare(String(b.checkinId)));
const calculation = (employee, date) => ok('admin', `${base}/records/calculate?employeeId=${employee}&date=${date}`);
const lastRecalc = new Map();
async function recalc(employee, date, endDate = date, forceOverwrite = false) {
  const body = { employeeIds: [employee], startDate: date, endDate, forceOverwrite, confirmed: true };
  const key = JSON.stringify(body), remaining = 5100 - (Date.now() - (lastRecalc.get(key) || 0));
  if (remaining > 0) await delay(remaining);
  const start = performance.now();
  const result = await ok('admin', base + '/recalculate', 'POST', body);
  fixture.timings.push({ employee, date, endDate, milliseconds: Number((performance.now() - start).toFixed(2)), asynchronous: result.asynchronous });
  lastRecalc.set(key, Date.now()); save(); return result;
}
async function employee(name, shiftId, ruleId, from = '2025-09-01', to = '2025-09-30') {
  const employeeId = id(await ok('admin', '/hr/employees', 'POST', { employeeNo: `${marker}-${name}`, name: `考勤验收${name}`, gender: 'MALE',
    deptId: fixture.deptId, employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate: '2025-01-01' }));
  fixture.employees.push(employeeId); save();
  const scheduleId = id(await ok('admin', base + '/schedules', 'POST', { targetType: 'EMPLOYEE', targetId: employeeId,
    shiftId, ...(ruleId ? { ruleId } : {}), effectiveStart: from, effectiveEnd: to, status: 'ACTIVE' }));
  fixture.schedules.push(scheduleId); save(); return employeeId;
}
async function shift(name, overrides = {}) {
  const body = { shiftCode: marker + '-' + name, shiftName: '考勤规则' + name, startTime: '09:00:00', endTime: '18:00:00', breakMinutes: 60, workMinutes: 480,
    checkinWindowBeforeMinutes: 30, checkoutWindowAfterMinutes: 30, lateGraceMinutes: 10, earlyExitGraceMinutes: 10,
    halfDayHoursThreshold: 4, absentHoursThreshold: 2, workingHoursCalcMode: 'FIRST_LAST', checkinDetermineMode: 'EARLIEST_LATEST',
    holidayCalendarId: fixture.calendarId, autoAttendanceFlag: 1, processAttendanceAfter: '2025-01-01', markOnHolidayFlag: 0, overtimeThresholdMinutes: 30, status: 1, ...overrides };
  const shiftId = id(await ok('admin', base + '/shifts', 'POST', body));
  fixture.shifts.push({ id: shiftId, body }); save(); return shiftId;
}
async function changeShift(shiftId, changes) {
  const all = await ok('admin', base + '/shifts');
  const current = all.find(value => String(value.id) === shiftId); check('owned_shift_found_for_update', !!current);
  await ok('admin', `${base}/shifts/${shiftId}`, 'PUT', { ...current, ...changes });
}
async function punch(employeeId, date, time, logType, changes = {}) {
  const body = { employeeId, logType, checkTime: date + ' ' + time, checkMethod: 'APP', deviceId: marker + '-device',
    latitude: 31.2304167, longitude: 121.4737001, locationName: '隔离验收位置', remark: marker, ...changes };
  const checkinId = id(await ok('admin', base + '/checkins', 'POST', body)); return { checkinId, body };
}
async function day(name, shiftId, date, times, expected, ruleId) {
  const employeeId = await employee(name, shiftId, ruleId);
  for (const [time, logType, changes] of times) await punch(employeeId, date, time, logType, changes);
  const preview = await calculation(employeeId, date);
  for (const [field, value] of Object.entries(expected)) check(`${name}_preview_${field}`, preview[field] === value);
  const execution = await recalc(employeeId, date);
  check(name + '_synchronous_single_day', execution.asynchronous === false && Number(execution.affected) === 1);
  const saved = record(employeeId, date); check(name + '_one_saved_record', saved.length === 1);
  for (const [field, value] of Object.entries(expected)) check(`${name}_saved_${field}`, saved[0][field] === value);
  const cards = await raw(employeeId, date);
  check(name + '_all_raw_cards_link_to_actual_conclusion', cards.every(card => String(card.attendanceRecordId) === saved[0].id));
  fixture.cases.push({ name, employeeId, date, recordId: saved[0].id, expected }); save(); return { employeeId, date, record: saved[0] };
}
function denied(response, name, statuses = [400,403,404,405]) {
  check(name, statuses.includes(response.status) && response.body?.code !== 200);
}

try {
  for (const [table,column] of preservedTables) bounds[table] = database(`SELECT COALESCE(MAX(${column}),0) FROM ${table}`);
  originalDigest = originalSnapshot(); fixture.originalBounds = bounds; fixture.originalDigest = originalDigest; save();
  fixture.defaultCalendarBefore = database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND deleted=0 ORDER BY calendar_id');
  fixture.deptId = id(database(`SELECT dept_id FROM sys_user WHERE tenant_id=100000 AND user_id=${id(sessions.admin.identity.userId)}`));
  await ok('admin', holiday + '/calendar', 'POST', { calendarCode: marker, calendarName: marker + '专用日历', region: '隔离验收', defaultFlag: 0,
    weeklyRestDays: '6,7', workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' });
  fixture.calendarId = id(database(`SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=${sql(marker)} AND deleted=0`)); save();
  await ok('admin', holiday + '/date/batch', 'POST', { calendarId: fixture.calendarId, yearNo: 2025,
    dates: Array.from({ length: 30 }, (_,index) => ({ holidayDate: `2025-09-${String(index+1).padStart(2,'0')}`,
      dateType: index === 14 ? 'HOLIDAY' : index === 15 ? 'REST' : 'WORKDAY', triplePayFlag: index === 14 ? 1 : 0, holidayName: marker })) });
  const ordinary = await shift('day'); fixture.ordinaryShiftId = ordinary;
  const configured = (await ok('admin', base + '/shifts')).find(value => String(value.id) === ordinary);
  const fields = ['checkinWindowBeforeMinutes','checkoutWindowAfterMinutes','lateGraceMinutes','earlyExitGraceMinutes','halfDayHoursThreshold',
    'absentHoursThreshold','workingHoursCalcMode','checkinDetermineMode','holidayCalendarId','autoAttendanceFlag','processAttendanceAfter','markOnHolidayFlag','overtimeThresholdMinutes'];
  const decimalHours = new Set(['halfDayHoursThreshold', 'absentHoursThreshold']);
  fixture.configurationObservations = fields.map(field => ({ field, input: fixture.shifts[0].body[field], actual: configured[field] }));
  save();
  for (const { field, input, actual } of fixture.configurationObservations) {
    // Preserve exact hundredths; HTTP decimal strings retain database scale.
    check('configured_field_' + field, decimalHours.has(field)
      ? hundredths(actual) === hundredths(input) : String(actual) === String(input));
  }
  evidence.configuration = true;

  const late8 = await day('late8', ordinary, '2025-09-01', [['09:08:00','IN'],['18:00:00','OUT']], { status: 'NORMAL', lateMinutes: 0, workMinutes: 472 });
  await day('late10', ordinary, '2025-09-02', [['09:10:00','IN'],['18:00:00','OUT']], { status: 'NORMAL', lateMinutes: 0 });
  await day('late12', ordinary, '2025-09-03', [['09:12:00','IN'],['18:00:00','OUT']], { status: 'LATE', lateMinutes: 2, workMinutes: 468 });
  await day('early8', ordinary, '2025-09-04', [['09:00:00','IN'],['17:52:00','OUT']], { status: 'NORMAL', earlyExitMinutes: 0 });
  await day('early10', ordinary, '2025-09-05', [['09:00:00','IN'],['17:50:00','OUT']], { status: 'NORMAL', earlyExitMinutes: 0 });
  await day('early12', ordinary, '2025-09-06', [['09:00:00','IN'],['17:48:00','OUT']], { status: 'EARLY_EXIT', earlyExitMinutes: 2, dateType: 'WORKDAY' });
  for (const [name, time, workMinutes, status, halfDayFlag, absentFlag] of [
    ['absent119','11:59:00',119,'ABSENT',0,1], ['half120','12:00:00',120,'HALF_DAY',1,0],
    ['half121','12:01:00',121,'HALF_DAY',1,0], ['half239','13:59:00',239,'HALF_DAY',1,0],
    ['full240','14:00:00',240,'EARLY_EXIT',0,0], ['full241','14:01:00',241,'EARLY_EXIT',0,0]]) {
    await day(name, ordinary, '2025-09-08', [['09:00:00','IN'],[time,'OUT']], { status, workMinutes, halfDayFlag, absentFlag });
  }
  const windows = await day('windows', ordinary, '2025-09-09', [['08:29:59','IN'],['08:30:00','IN'],['18:30:00','OUT'],['18:30:01','OUT']],
    { status: 'NORMAL', workMinutes: 540, checkinCount: 2 });
  const windowCards = await raw(windows.employeeId, windows.date);
  check('both_exact_window_edges_included_and_outside_seconds_marked', windowCards.map(value => value.offshiftFlag).join(',') === '1,0,0,1');
  const methods = ['APP','FACE','CARD','WIFI','GPS','MANUAL'];
  const methodEmployee = await employee('methods', ordinary);
  for (const [index,method] of methods.entries()) await punch(methodEmployee, '2025-09-10', `09:0${index}:00`, 'IN', { checkMethod: method });
  const methodCards = await raw(methodEmployee, '2025-09-10');
  check('six_methods_devices_and_seven_decimal_coordinates_preserved', methodCards.length === 6 && methodCards.every((value,index) => value.checkMethod === methods[index]
    && value.deviceId === marker + '-device' && Number(value.latitude) === 31.2304167 && Number(value.longitude) === 121.4737001 && value.locationName === '隔离验收位置'));
  const originalMethodFacts = hash(JSON.stringify(rawFacts(methodCards)));
  for (const method of ['PUT','DELETE']) denied(await api('admin', `${base}/checkins/${id(methodCards[0].checkinId)}`,
    { method, ...(method === 'PUT' ? { body: { checkTime: '2025-09-10 08:00:00' } } : {}) }), 'raw_card_' + method + '_not_supported', [404,405]);
  check('unsupported_writes_keep_original_raw_facts', originalMethodFacts === hash(JSON.stringify(rawFacts(await raw(methodEmployee, '2025-09-10')))));
  const appended = await punch(methodEmployee, '2025-09-10', '18:00:00', 'OUT', { checkMethod: 'MANUAL' });
  const withManual = await raw(methodEmployee, '2025-09-10');
  check('manual_punch_only_appends_original_six_retained', withManual.length === 7 && withManual.some(value => String(value.checkinId) === appended.checkinId && value.checkMethod === 'MANUAL')
    && originalMethodFacts === hash(JSON.stringify(rawFacts(withManual.filter(value => String(value.checkinId) !== appended.checkinId)))));
  await delay(5100);
  const repeated = id(await ok('admin', base + '/checkins', 'POST', appended.body));
  check('repeated_punch_returns_original_id_without_duplicate', repeated === appended.checkinId && (await raw(methodEmployee,'2025-09-10')).length === 7);
  evidence.rawFacts = true;

  const paired = await shift('paired', { workingHoursCalcMode: 'PAIRED' });
  const alternating = await shift('alternating', { checkinDetermineMode: 'ALTERNATING' });
  const breaks = [['09:00:00','IN'],['12:00:00','OUT'],['14:00:00','IN'],['18:00:00','OUT']];
  await day('firstlast', ordinary, '2025-09-11', breaks, { status: 'NORMAL', workMinutes: 480 });
  await day('paired', paired, '2025-09-11', breaks, { status: 'NORMAL', workMinutes: 420 });
  const stray = [['08:45:00','OUT'],...breaks];
  await day('earliest', ordinary, '2025-09-12', stray, { status: 'NORMAL', workMinutes: 495 });
  await day('alternating', alternating, '2025-09-12', stray, { status: 'NORMAL', workMinutes: 480 });
  const night = await shift('night', { startTime: '22:00:00', endTime: '06:00:00', breakMinutes: 0, workMinutes: 480 });
  const nightEmployee = await employee('night', night);
  await punch(nightEmployee, '2025-09-17', '22:00:00', 'IN');
  await punch(nightEmployee, '2025-09-18', '02:00:00', 'OUT');
  await punch(nightEmployee, '2025-09-18', '06:00:00', 'OUT');
  check('night_0200_and_0600_belong_to_previous_day', (await raw(nightEmployee,'2025-09-17')).length === 3 && (await raw(nightEmployee,'2025-09-18')).length === 0);
  await recalc(nightEmployee,'2025-09-17');
  check('night_actual_conclusion_480_minutes', record(nightEmployee,'2025-09-17')[0]?.workMinutes === 480 && record(nightEmployee,'2025-09-17')[0]?.status === 'NORMAL');

  await day('holiday', ordinary, '2025-09-15', [], { status: 'HOLIDAY', absentFlag: 0, dateType: 'HOLIDAY' });
  await day('rest', ordinary, '2025-09-16', [], { status: 'REST', absentFlag: 0, dateType: 'REST' });
  await day('makeup', ordinary, '2025-09-06', [], { status: 'ABSENT', absentFlag: 1, dateType: 'WORKDAY' });
  const markHoliday = await shift('holiday-mark', { markOnHolidayFlag: 1 });
  await day('holiday-mark', markHoliday, '2025-09-15', [], { status: 'ABSENT', absentFlag: 1, dateType: 'HOLIDAY' });
  for (const [name, changes] of [['auto-off',{ autoAttendanceFlag: 0 }],['start-after',{ processAttendanceAfter: '2025-09-21' }]]) {
    const selectedShift = await shift(name, changes), selectedEmployee = await employee(name, selectedShift);
    const result = await recalc(selectedEmployee,'2025-09-20');
    check(name + '_skips_actual_generation', result.affected === 0 && record(selectedEmployee,'2025-09-20').length === 0);
    await changeShift(selectedShift, { autoAttendanceFlag: 1, processAttendanceAfter: '2025-09-20' });
    const enabled = await recalc(selectedEmployee,'2025-09-20');
    check(name + '_enabled_or_exact_start_day_generates', enabled.affected === 1 && record(selectedEmployee,'2025-09-20')[0]?.status === 'ABSENT');
  }
  const overtime = await calculation(windows.employeeId, windows.date);
  check('overtime_threshold30_trial_yields30', overtime.overtimeMinutes === 30);
  await changeShift(ordinary,{ overtimeThresholdMinutes: 60 });
  check('overtime_threshold60_trial_yields0', (await calculation(windows.employeeId, windows.date)).overtimeMinutes === 0);
  await changeShift(ordinary,{ overtimeThresholdMinutes: 30 });
  evidence.rules = true; evidence.calendar = true;

  const fenceRule = id(await ok('admin',base + '/rules','POST',{ ruleCode: marker, ruleName: marker + '围栏', ruleType: 'FIXED', shiftId: ordinary,
    checkMethods: ['APP','FACE','CARD','WIFI','GPS'], status: 1, configJson: { geofence: { latitude: 31.2304167, longitude: 121.4737001, radiusMeters: 100 } } }));
  fixture.rules.push(fenceRule); save();
  const fenced = await day('fence',ordinary,'2025-09-22', [['09:00:00','IN'],['18:00:00','OUT',{latitude:31.2404167,locationValidFlag:1}]],
    { status: 'NORMAL', workMinutes: 480 },fenceRule);
  const fenceCards = await raw(fenced.employeeId,fenced.date);
  check('outside_fence_kept_and_client_valid_flag_ignored', fenceCards.length === 2 && fenceCards[0].locationValidFlag === 1 && fenceCards[1].locationValidFlag === 0);
  check('outside_fence_marks_saved_conclusion_for_hr', record(fenced.employeeId,fenced.date)[0].remark.includes('位置异常'));
  denied(await api('admin',base + '/checkins',{method:'POST',body:{...appended.body,employeeId:fenced.employeeId,checkTime:'2025-09-22 12:00:00',checkMethod:'GPS',latitude:91}}),'invalid_latitude_rejected');
  evidence.geofence = true;

  const beforeRules = hash(JSON.stringify(rawFacts(await raw(late8.employeeId,late8.date))));
  await changeShift(ordinary,{ lateGraceMinutes: 5 });
  await recalc(late8.employeeId,late8.date);
  check('rule_change_recalculates_same_record_late3', record(late8.employeeId,late8.date)[0]?.id === late8.record.id
    && record(late8.employeeId,late8.date)[0]?.status === 'LATE' && record(late8.employeeId,late8.date)[0]?.lateMinutes === 3);
  check('rule_change_preserves_all_original_punch_facts', beforeRules === hash(JSON.stringify(rawFacts(await raw(late8.employeeId,late8.date)))));
  const manual = { status:'NORMAL',workMinutes:480,lateMinutes:0,earlyExitMinutes:0,remark:marker + '人工核正' };
  await ok('admin',`${base}/records/${late8.record.id}/adjust`,'PUT',manual);
  const adjusted = record(late8.employeeId,late8.date)[0];
  check('adjustment_marks_manual',adjusted.manualAdjustedFlag === 1 && adjusted.status === 'NORMAL');
  const protectedResult = await recalc(late8.employeeId,late8.date);
  check('default_recalculation_preserves_exact_manual_record', protectedResult.affected === 0 && JSON.stringify(adjusted) === JSON.stringify(record(late8.employeeId,late8.date)[0]));
  denied(await api('employee',`${base}/records/${late8.record.id}/adjust`,{method:'PUT',body:manual}),'employee_cannot_adjust', [403]);
  denied(await api('employee',base + '/recalculate',{method:'POST',body:{employeeIds:[late8.employeeId],startDate:late8.date,endDate:late8.date,confirmed:true,forceOverwrite:true}}),'employee_cannot_force_recalculate',[403]);
  await recalc(late8.employeeId,late8.date,late8.date,true);
  check('explicit_override_restores_rule_result_and_clears_manual_mark', record(late8.employeeId,late8.date)[0]?.status === 'LATE'
    && record(late8.employeeId,late8.date)[0]?.manualAdjustedFlag === 0 && record(late8.employeeId,late8.date)[0]?.lateMinutes === 3);
  check('adjustment_and_override_preserve_punch_facts',beforeRules === hash(JSON.stringify(rawFacts(await raw(late8.employeeId,late8.date)))));
  const raceEmployee = await employee('unique',ordinary);
  // Intentional two-request concurrency is the acceptance stimulus for the same employee/date lock and unique index.
  const race = await Promise.all([false,true].map(forceOverwrite=>api('admin',base + '/recalculate',{method:'POST',body:{employeeIds:[raceEmployee],startDate:'2025-09-29',endDate:'2025-09-29',confirmed:true,forceOverwrite}})));
  check('two_different_concurrent_recalculations_succeed',race.every(value=>value.status===200 && value.body?.code===200));
  check('concurrent_recalculation_creates_exactly_one_daily_record',record(raceEmployee,'2025-09-29').length===1);
  const beforeUnconfirmed = hash(JSON.stringify(record(raceEmployee,'2025-09-29')));
  denied(await api('admin',base + '/recalculate',{method:'POST',body:{employeeIds:[raceEmployee],startDate:'2025-09-29',endDate:'2025-09-29',confirmed:false}}),'unconfirmed_recalculation_rejected');
  check('unconfirmed_request_does_not_change_conclusion',beforeUnconfirmed === hash(JSON.stringify(record(raceEmployee,'2025-09-29'))));
  check('rule_table_work_days_removed',database("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='hr_attendance_rule' AND column_name='work_days'")==='0');
  check('daily_unique_index_covers_tenant_employee_date',database("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND table_name='hr_attendance_record' AND index_name='uk_hr_att_record_employee_date' AND non_unique=0")==='tenant_id,employee_id,attendance_date');
  check('manual_adjustment_audit_present',Number(database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='ATTENDANCE' AND business_id=${sql(late8.record.id)} AND operation_type='MANUAL_ADJUST'`))>=1);
  evidence.recalculation = true;
  const month = await recalc(raceEmployee,'2025-09-01','2025-09-30');
  check('one_employee_full_month_has_30_conclusions',month.affected===30 && database(`SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=${raceEmployee} AND attendance_date BETWEEN '2025-09-01' AND '2025-09-30' AND deleted=0`)==='30');
  fixture.singleEmployeeMonthPerformance = { milliseconds:fixture.timings.at(-1).milliseconds, requirementMilliseconds:500, meetsRequirement:fixture.timings.at(-1).milliseconds<500 };
  check('browser_has_no_unhandled_errors',browserErrors.length===0);
} catch(error) { failure = error; }
finally {
  try {
    check('preexisting_business_rows_unchanged',!!originalDigest && JSON.stringify(originalDigest)===JSON.stringify(originalSnapshot()));
    check('tenant_default_calendar_unchanged',fixture.defaultCalendarBefore===database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND deleted=0 ORDER BY calendar_id'));
    evidence.preservation=true;
  } catch(error) { failure ||= error; }
  try { const scan=await runtime.scan(); evidence.secrets=true; console.log('D2_RULES_LOG_SCAN: '+JSON.stringify(scan)); } catch(error) { failure ||= error; }
  await runtime.close(); save(); write('requests.json',requests);
  const message=failure?String(failure.message).split('\n')[0].slice(0,220):undefined;
  const safeMessage=message && [...sensitive].every(value=>!message.includes(value))?message:failure?'D2 rules failed; inspect bounded evidence':undefined;
  write('result.json',{marker,passed:!failure && Object.values(evidence).every(Boolean),...evidence,checks,requests:requests.length,browserErrors:browserErrors.length,
    singleEmployeeMonthPerformance:fixture.singleEmployeeMonthPerformance,all17Complete:false,globalComplete:false,failure:safeMessage});
  console.log(`D2_RULES_SUMMARY: passed=${checks.length}; failed=${failure?1:0}; requests=${requests.length}; preservation=${evidence.preservation}; browser_errors=${browserErrors.length}`);
  if(failure){console.log('D2_RULES_FAILURE: '+safeMessage);process.exitCode=1;}
}
