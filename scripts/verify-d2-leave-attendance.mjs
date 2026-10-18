import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d2-leave-attendance'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d2-leave-attendance-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const profiling = process.env.CLOUDFLOW_D2_PROFILE_FIRST === '1';
const resumeRound = process.argv.includes('--resume-source') ? process.argv[process.argv.indexOf('--resume-source') + 1] : null;
let resumeFixture;
if (resumeRound) {
  assert.match(resumeRound, /^r[1-9][0-9]*$/);
  const source = path.join(path.dirname(output), 'd2-leave-attendance-20261005-' + resumeRound);
  const readSource = name => JSON.parse(fs.readFileSync(path.join(source, name), 'utf8').replace(/^\uFEFF/, ''));
  const previous = readSource('result.json');
  const resumeReadFailure = previous.passed === false && previous.failure === 'Owned D1 read failed';
  const resumePerformance = previous.passed === true && previous.correctness === true && previous.performanceMet === false;
  assert.ok(resumeReadFailure || resumePerformance, 'Resume only the retained read failure or incomplete performance case');
  assert.equal(previous.approval, true); assert.equal(previous.preservation, true); assert.equal(previous.restoration, true);
  resumeFixture = readSource('fixture.json');
  assert.equal(resumeFixture.requests.length, 34); assert.equal(resumeFixture.measurements.length, resumeReadFailure ? 1 : 4);
  assert.ok(resumeFixture.ownedFactDigest);
}
const marker = resumeFixture?.marker || 'D2L-' + randomUUID().replaceAll('-', '').slice(0, 12);
const fixture = resumeFixture ? { ...structuredClone(resumeFixture), resumedFrom: resumeRound, measurements: [], restorations: {}, configChanged: false }
  : { marker, requests: [], measurements: [], restorations: {} };
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const save = () => write('fixture.json', fixture);
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const sql = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
const hash = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, database, rows, api, ok, sessions, requests, browserErrors, sensitive } = runtime;
const base = '/hr/attendance', leave = base + '/leave', ess = '/hr/ess/leave', wf = '/workflow/wf', holiday = '/auth/system/holiday';
const tables = [['hr_employee','id'], ['hr_shift','id'], ['hr_schedule_assignment','id'], ['hr_attendance_checkin','checkin_id'],
  ['hr_attendance_record','id'], ['hr_attendance_monthly','id'], ['hr_time_request','id'], ['hr_leave_ledger','ledger_id'],
  ['hr_leave_quota','id'], ['hr_leave_type','id'], ['sys_holiday_calendar','calendar_id'], ['sys_holiday_date','date_id']];
const bounds = {};
const preserved = () => Object.fromEntries(tables.map(([table, key]) => [table,
  hash(database('SELECT * FROM ' + table + ' WHERE ' + key + '<=' + bounds[table] + ' ORDER BY ' + key))]));
let original, originalConfig, employeeBody, employeeId, failure, lastRecalc = 0;
const evidence = { correctness: false, approval: false, exclusion: false, fractions: false, preservation: false, restoration: false, secrets: false };
async function until(read, accept, label) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) { const value = await read(); if (accept(value)) return value; await delay(600); }
  throw Error(label + ': observation deadline; retain original request and task IDs');
}
const requestRow = requestId => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'instanceId',process_instance_id,'duration',duration,'unit',unit) FROM hr_time_request WHERE tenant_id=100000 AND id=" + id(requestId))[0];
async function submit(typeId, date, label, end = '18:00:00', quantity = 1, unit = 'DAY') {
  const requestId = id(await ok('employee', ess, 'POST', { leaveTypeId: typeId, startTime: date + ' 09:00:00', endTime: date + ' ' + end,
    duration: quantity, unit, reason: marker + '-' + label, attachmentFileIds: [] }));
  fixture.requests.push(requestId); save();
  const row = await until(() => requestRow(requestId), value => !!value?.instanceId, 'Leave workflow binding');
  const process = rows("SELECT JSON_OBJECT('definition',definition_id,'applicant',CAST(start_user_id AS CHAR)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(row.instanceId))[0];
  check(label + '_actual_applicant_and_owned_definition', process.definition === fixture.definitionId && process.applicant === sessions.employee.identity.userId);
  check(label + '_calculated_quantity', Number(row.duration) === quantity && row.unit === unit);
  return requestId;
}
async function taskFor(requestId, actor, node) {
  const row = requestRow(requestId);
  const tasks = await until(() => rows("SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'node',node_key) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(row.instanceId) + " AND status='TODO'"),
    values => values.length === 1 && values[0].node === node, 'Leave task ' + node);
  check('actual_assignee_' + actor, tasks[0].assignee === sessions[actor].identity.userId);
  return tasks[0];
}
async function complete(requestId, actor, node, action = 'APPROVE') {
  const task = await taskFor(requestId, actor, node);
  await ok(actor, wf + '/complete', 'POST', { taskId: task.id, action, comment: marker, variables: {} });
}
async function approved(requestId, quantity) {
  await until(() => requestRow(requestId), value => value.status === 'APPROVED', 'Approval callback');
  const ledger = rows("SELECT JSON_OBJECT('type',transaction_type,'quantity',leave_days) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=" + employeeId + " AND source_biz_type='HR_TIME_REQUEST' AND source_biz_id=" + sql(requestId));
  check('real_approval_deducted_once_' + requestId, ledger.length === 3
    && ledger.filter(value => value.type === 'FREEZE' && Number(value.quantity) === -quantity).length === 1
    && ledger.filter(value => value.type === 'APPLICATION' && Number(value.quantity) === -quantity).length === 1
    && ledger.filter(value => value.type === 'UNFREEZE' && Number(value.quantity) === quantity).length === 1);
}
async function approve(requestId, quantity = 1) {
  await complete(requestId, 'admin', 'manager');
  check('first_stage_not_approved_' + requestId, requestRow(requestId).status !== 'APPROVED');
  await complete(requestId, 'hr', 'hr'); await approved(requestId, quantity);
}
async function recalc(from, to, label, expectedDays, measured = false) {
  const remaining = 5100 - (Date.now() - lastRecalc); if (remaining > 0) await delay(remaining);
  const startedAt = Date.now();
  const start = performance.now();
  const response = await api('admin', base + '/recalculate', { method: 'POST', body: {
    employeeIds: [employeeId], startDate: from, endDate: to, confirmed: true, forceOverwrite: false } });
  const milliseconds = Number((performance.now() - start).toFixed(2)); lastRecalc = Date.now();
  const value = runtime.success(response, 'recalculate_' + label);
  check(label + '_complete_synchronous_range', value.asynchronous === false && value.affected === expectedDays);
  if (measured) { fixture.measurements.push({ stage: label, milliseconds, startedAt, endedAt: Date.now(), traceId: response.traceId, meets500ms: milliseconds < 500 }); save(); }
}
function day(date, status, label) {
  const values = rows("SELECT JSON_OBJECT('status',status,'late',late_minutes,'early',early_exit_minutes,'absent',absent_flag,'half',half_day_flag) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=" + employeeId + " AND attendance_date=" + sql(date) + " AND deleted=0");
  check(label + '_one_day_expected_status', values.length === 1 && values[0].status === status);
  if (status === 'LEAVE') check(label + '_no_late_early_absence', [values[0].late, values[0].early, values[0].absent, values[0].half].every(value => Number(value) === 0));
}
function month(monthNo, work, leaveDays, actual, absent) {
  const values = rows("SELECT JSON_OBJECT('work',work_days,'leave',leave_days,'actual',actual_days,'absent',absent_days,'late',late_times,'early',early_times) FROM hr_attendance_monthly WHERE tenant_id=100000 AND employee_id=" + employeeId + " AND year=2026 AND month=" + monthNo);
  check('month_' + monthNo + '_exact_totals', values.length === 1 && Number(values[0].work) === work && Number(values[0].leave) === leaveDays
    && Number(values[0].actual) === actual && Number(values[0].absent) === absent && Number(values[0].late) === 0 && Number(values[0].early) === 0);
}
try {
  if (resumeFixture) {
    Object.assign(bounds, resumeFixture.originalBounds); original = resumeFixture.originalDigest;
    employeeId = id(resumeFixture.employeeId); employeeBody = resumeFixture.employeeBody;
    check('resumed_employee_marker_and_unbound', database('SELECT CONCAT(employee_no,\':\',COALESCE(CAST(user_id AS CHAR),\'NULL\')) FROM hr_employee WHERE tenant_id=100000 AND id=' + employeeId + ' AND deleted=0') === marker + ':NULL');
    check('resumed_original_business_preserved', JSON.stringify(original) === JSON.stringify(preserved()));
    check('resumed_32_approved_and_two_closed_requests', database("SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000 AND employee_id=" + employeeId + " AND status='APPROVED'") === '32'
      && database("SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000 AND employee_id=" + employeeId + " AND status IN ('REJECTED','CANCELLED')") === '2');
    evidence.approval = true; save();
  } else {
  for (const [table, key] of tables) bounds[table] = database('SELECT COALESCE(MAX(' + key + '),0) FROM ' + table);
  original = preserved(); fixture.originalBounds = bounds; fixture.originalDigest = original; save();
  check('employee_account_unbound', database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=' + id(sessions.employee.identity.userId) + ' AND deleted=0') === '0');
  const periods = await ok('admin', leave + '/periods');
  const period = periods.find(value => value.startDate === '2026-01-01' && value.endDate === '2026-12-31' && value.status === 'OPEN');
  check('owned_2026_open_period', !!period); fixture.periodId = id(period.periodId);
  fixture.deptId = id(database('SELECT dept_id FROM sys_user WHERE tenant_id=100000 AND user_id=' + id(sessions.admin.identity.userId)));
  await ok('admin', holiday + '/calendar', 'POST', { calendarCode: marker, calendarName: marker, defaultFlag: 0, weeklyRestDays: '6,7',
    workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' });
  fixture.calendarId = id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=' + sql(marker))); save();
  const dates = ['08','09'].flatMap(monthNo => Array.from({ length: monthNo === '08' ? 31 : 30 }, (_, index) => ({
    holidayDate: '2026-' + monthNo + '-' + String(index + 1).padStart(2,'0'), dateType: 'WORKDAY', triplePayFlag: 0 })));
  await ok('admin', holiday + '/date/batch', 'POST', { calendarId: fixture.calendarId, yearNo: 2026, dates });
  fixture.shiftId = id(await ok('admin', base + '/shifts', 'POST', { shiftCode: marker, shiftName: marker, startTime: '09:00:00', endTime: '18:00:00',
    breakMinutes: 60, workMinutes: 480, checkinWindowBeforeMinutes: 30, checkoutWindowAfterMinutes: 30, lateGraceMinutes: 10, earlyExitGraceMinutes: 10,
    halfDayHoursThreshold: 4, absentHoursThreshold: 2, workingHoursCalcMode: 'FIRST_LAST', checkinDetermineMode: 'EARLIEST_LATEST',
    holidayCalendarId: fixture.calendarId, autoAttendanceFlag: 1, processAttendanceAfter: '2025-01-01', markOnHolidayFlag: 0, overtimeThresholdMinutes: 0, status: 1 })); save();
  employeeBody = { employeeNo: marker, name: marker, gender: 'MALE', deptId: fixture.deptId, employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate: '2025-01-01' };
  employeeId = id(await ok('admin', '/hr/employees', 'POST', { ...employeeBody, userId: sessions.employee.identity.userId }));
  fixture.employeeId = employeeId; fixture.employeeBody = employeeBody; save();
  await ok('admin', base + '/schedules', 'POST', { targetType: 'EMPLOYEE', targetId: employeeId, shiftId: fixture.shiftId, effectiveStart: '2026-08-01', effectiveEnd: '2026-09-30', status: 'ACTIVE' });
  for (const [name, unit] of [['days','DAY'],['hours','HOUR']]) {
    fixture[name] = id(await ok('admin', base + '/leave-types', 'POST', { leaveCode: marker + '-' + name, leaveName: marker + '-' + name,
      unit, needQuota: 1, isPaid: 1, status: 1, maxDaysPerYear: 100, includeHolidayFlag: 0, allowNegativeFlag: 0, roundingMode: 'NONE' })); save();
  }
  fixture.policyId = id(await ok('admin', leave + '/policies', 'POST', { policyCode: marker, policyName: marker, status: 'ACTIVE' })); save();
  await ok('admin', leave + '/policies/' + fixture.policyId + '/details', 'PUT', [{ leaveTypeId: fixture.days, annualDays: 60 }, { leaveTypeId: fixture.hours, annualDays: 8 }]);
  check('one_policy_assignment', Number(await ok('admin', leave + '/assignments', 'POST', { employeeIds: [employeeId], policyId: fixture.policyId, periodId: fixture.periodId, assignmentBasis: 'PERIOD', carryForwardFlag: 0 })) === 1);
  const configId = id(database("SELECT config_id FROM sys_config WHERE tenant_id=100000 AND config_key='sys.hr.leave.processKey' AND config_scope='1'"));
  const config = await ok('admin', '/auth/system/config/' + configId);
  originalConfig = Object.fromEntries(['configId','tenantId','configScope','configKey','configName','configType','configValue','remark'].map(key => [key, config[key] ?? null]));
  fixture.originalConfig = originalConfig; save();
  const definitions = rows("SELECT JSON_OBJECT('id',definition_id,'digest',SHA2(model_json,256)) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=" + sql(config.configValue) + " AND status='PUBLISHED' AND deleted=0 ORDER BY version DESC");
  check('original_workflow_available', definitions.length > 0); fixture.originalDefinition = definitions[0]; save();
  const definition = await ok('admin', wf + '/definition/' + definitions[0].id);
  const model = typeof definition.modelJson === 'string' ? JSON.parse(definition.modelJson) : structuredClone(definition.modelJson);
  const stages = model.nodes.filter(value => value.type === 'APPROVAL');
  check('real_two_stage_workflow', stages.length === 2 && stages[0].id === 'manager' && stages[1].id === 'hr');
  for (const [index, actor] of ['admin','hr'].entries()) { stages[index].approverType = 'USER'; stages[index].approverValue = sessions[actor].identity.userId; }
  const created = await ok('admin', wf + '/definition/save', 'POST', { processKey: marker, processName: marker, modelJson: JSON.stringify(model), formId: null, startPermissionType: 'ALL', startPermissionValue: '[]' });
  fixture.definitionId = created.definitionId || created.id; save(); await ok('admin', wf + '/definition/deploy/' + fixture.definitionId, 'POST');
  fixture.configChanged = true; save(); await ok('admin', '/auth/system/config', 'PUT', { ...originalConfig, configValue: marker });

  await recalc('2026-09-01','2026-09-01','before_submission',1); day('2026-09-01','ABSENT','before_submission');
  const first = await submit(fixture.days, '2026-09-01', 'first');
  await recalc('2026-09-01','2026-09-01','pending',1); day('2026-09-01','ABSENT','pending');
  await complete(first, 'admin', 'manager');
  check('manager_only_still_not_approved', requestRow(first).status !== 'APPROVED');
  await recalc('2026-09-01','2026-09-01','manager_only',1); day('2026-09-01','ABSENT','manager_only');
  await complete(first, 'hr', 'hr'); await approved(first, 1);
  for (const [time, logType] of [['11:00:00','IN'],['17:00:00','OUT']]) await ok('admin', base + '/checkins', 'POST', {
    employeeId, logType, checkTime: '2026-09-01 ' + time, checkMethod: 'APP', deviceId: marker, remark: marker });
  await recalc('2026-09-01','2026-09-01','approved_with_late_punch',1); day('2026-09-01','LEAVE','approved_with_late_punch');
  for (let index = 2; index <= 30; index++) {
    const requestId = await submit(fixture.days, '2026-09-' + String(index).padStart(2,'0'), 'daily-' + index); await approve(requestId);
  }
  evidence.approval = true;
  const half = await submit(fixture.days, '2026-08-01', 'half', '11:00:00', 0.5); await approve(half, 0.5);
  const hours = await submit(fixture.hours, '2026-08-02', 'hours', '14:00:00', 4, 'HOUR'); await approve(hours, 4);
  const rejected = await submit(fixture.days, '2026-08-03', 'rejected');
  await complete(rejected, 'admin', 'manager', 'REJECT'); await until(() => requestRow(rejected), value => value.status === 'REJECTED', 'Rejection callback');
  const cancelled = await submit(fixture.days, '2026-08-04', 'cancelled');
  await ok('employee', ess + '/' + cancelled + '/cancel', 'POST'); check('cancelled_original_request', requestRow(cancelled).status === 'CANCELLED');
  }
  const ownedFacts = () => hash(JSON.stringify([
    database('SELECT * FROM hr_time_request WHERE tenant_id=100000 AND employee_id=' + employeeId + ' ORDER BY id'),
    database('SELECT * FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=' + employeeId + ' ORDER BY ledger_id'),
    database('SELECT * FROM hr_leave_quota WHERE tenant_id=100000 AND employee_id=' + employeeId + ' ORDER BY id'),
    database('SELECT employee_id,attendance_date,check_time,log_type,check_method,device_id,remark FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id=' + employeeId + ' ORDER BY checkin_id')
  ]));
  if (resumeFixture) check('resumed_request_ledger_quota_and_raw_facts_unchanged', fixture.ownedFactDigest === ownedFacts());
  fixture.ownedFactDigest = ownedFacts(); save();
  for (const stage of resumeFixture ? ['resume-repeat-1','resume-repeat-2'] : ['first-full-month','repeat-full-month']) {
    await recalc('2026-09-01','2026-09-30','thirty_approved_' + stage,30,true); month(9,30,30,0,0);
    check('thirty_leave_days_' + stage, database("SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=" + employeeId + " AND attendance_date BETWEEN '2026-09-01' AND '2026-09-30' AND status='LEAVE' AND late_minutes=0 AND early_exit_minutes=0 AND absent_flag=0 AND half_day_flag=0 AND deleted=0") === '30');
    await recalc('2026-08-01','2026-08-31','mixed_' + stage,31,true); month(8,31,1,1,29);
    day('2026-08-01','LEAVE','half_' + stage); day('2026-08-02','LEAVE','hours_' + stage);
    day('2026-08-03','ABSENT','rejected_' + stage); day('2026-08-04','ABSENT','cancelled_' + stage);
  }
  check('recalculation_preserves_requests_ledger_quota_and_raw_punches', fixture.ownedFactDigest === ownedFacts());
  evidence.exclusion = true; evidence.fractions = true; evidence.correctness = true;
} catch (error) { failure = error; }
finally {
  const restore = async (label, action) => { try { await action(); fixture.restorations[label] = true; } catch (error) { fixture.restorations[label] = false; failure ||= error; } save(); };
  await restore('pendingRequests', async () => {
    for (const requestId of fixture.requests) {
      let value = requestRow(requestId);
      if (['PENDING','SUBMITTED','APPROVING','APPLYING'].includes(value.status)) {
        await ok('admin', base + '/time-requests/' + requestId + '/cancel', 'POST'); value = requestRow(requestId);
      }
      if (value.status === 'CANCELLED' && value.instanceId) await until(() => database("SELECT COUNT(*) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(value.instanceId) + " AND status='TODO'"), count => count === '0', 'Original cancelled tasks');
    }
  });
  await restore('workflowConfiguration', async () => {
    if (fixture.configChanged) {
      const current = await ok('admin', '/auth/system/config/' + originalConfig.configId);
      check('owned_workflow_config_still_current', current.configValue === marker);
      await ok('admin', '/auth/system/config', 'PUT', originalConfig);
      const restored = await ok('admin', '/auth/system/config/' + originalConfig.configId);
      check('original_workflow_configuration_restored', Object.keys(originalConfig).every(key => String(restored[key] ?? '') === String(originalConfig[key] ?? '')));
      check('original_workflow_definition_unchanged', database('SELECT SHA2(model_json,256) FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(fixture.originalDefinition.id)) === fixture.originalDefinition.digest);
    }
  });
  await restore('employeeBinding', async () => {
    if (employeeId && !resumeFixture) {
      check('owned_employee_binding', database('SELECT user_id FROM hr_employee WHERE tenant_id=100000 AND id=' + employeeId) === sessions.employee.identity.userId);
      await ok('admin', '/hr/employees/' + employeeId, 'PUT', { ...employeeBody, userId: null });
      check('employee_account_unbound_again', database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=' + id(sessions.employee.identity.userId) + ' AND deleted=0') === '0');
    }
  });
  evidence.restoration = Object.values(fixture.restorations).every(Boolean);
  try { check('preexisting_business_preserved', original && JSON.stringify(original) === JSON.stringify(preserved())); check('browser_no_errors', browserErrors.length === 0); evidence.preservation = true; } catch (error) { failure ||= error; }
  try { const scan = await runtime.scan(); evidence.secrets = true; console.log('D2_LEAVE_LOG_SCAN: ' + JSON.stringify(scan)); } catch (error) { failure ||= error; }
  await runtime.close(); save(); write('requests.json', requests);
  const performanceMet = !profiling && fixture.measurements.length === 4 && fixture.measurements.every(value => value.meets500ms);
  const raw = failure ? String(failure.message).split('\n')[0].slice(0,220) : undefined;
  const message = raw && [...sensitive].every(value => !raw.includes(value)) ? raw : failure ? 'D2 leave attendance verification failed' : undefined;
  write('result.json', { passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length,
    measurements: fixture.measurements, performanceMet, requirementMilliseconds: 500, profiling, resumedFrom: resumeRound, all17Complete: false, globalComplete: false, failure: message });
  console.log('D2_LEAVE_SUMMARY: checks=' + checks.length + '; requests=' + requests.length + '; correctness=' + evidence.correctness + '; performance_met=' + performanceMet + '; preservation=' + evidence.preservation + '; restoration=' + evidence.restoration);
  if (failure) { console.log('D2_LEAVE_FAILURE: ' + message); process.exitCode = 1; }
}
