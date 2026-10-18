import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = 'D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d3-payroll-deductions'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d3-payroll-deductions-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const fixture = { marker: 'D3D-' + randomUUID().replaceAll('-', '').slice(0, 12), employees: [], requests: [], types: {}, tasks: [], restorations: {}, cases: [], screenshots: [] };
const save = () => fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify(fixture, null, 2));
save();
const hash = value => createHash('sha256').update(value).digest('hex');
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const literal = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
const cents = value => { const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value)); assert.ok(match, 'Exact cents required'); return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0')); };
const rounded = (numerator, denominator) => (2n * numerator + denominator) / (2n * denominator);
// Independent expected amounts: daily 100.01, missed work 1/8+1/4+3/8+1+1/2 days, leave 1+2/5 days.
const expected = { gross: 300030n, attendance: rounded(10001n * 9n, 4n), leave: rounded(10001n * 7n, 5n) };
expected.tax = rounded(expected.gross - expected.attendance - expected.leave, 10n);
expected.net = expected.gross - expected.attendance - expected.leave - expected.tax;
fixture.expectedCents = Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, String(value)])); save();
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, requests, database, rows, sessions, sensitive, browserErrors } = runtime;
const pay = '/hr/compensation/payroll', attendance = '/hr/attendance', leave = attendance + '/leave', ess = '/hr/ess/leave', wf = '/workflow/wf';
const origin = new URL(sessions.admin.page.url()).origin;
const page = await sessions.admin.context.newPage(); page.on('pageerror', () => browserErrors.push('deductions-ui')); page.setDefaultTimeout(30000);
const evidence = { approval: false, attendance: false, deductions: false, mixedBatch: false, snapshot: false, preservation: false, restoration: false, secrets: false };
const tables = [['hr_employee', 'id'], ['hr_employee_comp', 'id'], ['hr_comp_component', 'id'], ['hr_comp_structure', 'id'], ['hr_comp_change', 'id'],
  ['hr_tax_profile', 'id'], ['hr_tax_deduction', 'id'], ['hr_tax_slab', 'slab_id'], ['hr_tax_slab_detail', 'slab_detail_id'],
  ['hr_payroll_period', 'period_id'], ['hr_payroll_batch', 'batch_id'], ['hr_payroll_batch_employee', 'batch_employee_id'], ['hr_salary_slip', 'id'],
  ['hr_shift', 'id'], ['hr_schedule_assignment', 'id'], ['hr_attendance_checkin', 'checkin_id'], ['hr_attendance_record', 'id'], ['hr_attendance_monthly', 'id'],
  ['hr_time_request', 'id'], ['hr_leave_type', 'id'], ['hr_leave_period', 'period_id'], ['hr_leave_ledger', 'ledger_id'], ['hr_leave_quota', 'id'],
  ['sys_dept', 'dept_id'], ['sys_holiday_calendar', 'calendar_id'], ['sys_holiday_date', 'date_id']];
const bounds = Object.fromEntries(tables.map(([table, key]) => [table, database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`)]));
function preserved() {
  return Object.fromEntries(tables.map(([table, key]) => {
    const digest = createHash('sha256'); let cursor = '0';
    for (;;) {
      const end = database(`SELECT COALESCE(MAX(${key}),0) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${bounds[table]} ORDER BY ${key} LIMIT 2000) selected`);
      if (end === '0') break;
      digest.update(database(`SELECT * FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${end} ORDER BY ${key}`)); cursor = end;
    }
    return [table, digest.digest('hex')];
  }));
}
const roles = () => hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')
  + database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
fixture.originalBounds = bounds; fixture.originalDigest = preserved(); fixture.originalRoles = roles(); save();
const writeTimes = new Map();
const configured = Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.common.repeatSubmit.intervalMillis'"));
assert.ok(Number.isSafeInteger(configured) && configured >= 0 && configured <= 60000);
const interval = Math.max(5000, configured) + 150;
async function api(actor, url, method = 'GET', body) {
  const key = hash(JSON.stringify([actor, url, method, body ?? null]));
  if (method !== 'GET') { const wait = (writeTimes.get(key) || 0) + interval - Date.now(); if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait)); }
  try { return await runtime.api(actor, url, { method, body }); }
  finally { if (method !== 'GET') writeTimes.set(key, Date.now()); }
}
const ok = async (actor, url, method = 'GET', body) => runtime.success(await api(actor, url, method, body), `${actor}_${method}_${url.split('?')[0]}`);
async function until(probe, accept, label) {
  for (let attempt = 0; ; attempt++) {
    const value = await probe(); if (accept(value)) return value;
    if (attempt > 0 && attempt % 40 === 0) console.log('D3_DEDUCTIONS_PHASE: observing_original=' + label);
    await new Promise(resolve => setTimeout(resolve, 750));
  }
}
const requestRow = requestId => rows(`SELECT JSON_OBJECT('status',status,'instanceId',process_instance_id,'duration',duration) FROM hr_time_request WHERE tenant_id=100000 AND id=${id(requestId)}`)[0];
async function approve(type, dayNo) {
  const date = fixture.month + '-' + String(dayNo).padStart(2, '0');
  const duration = await ok('employee', ess + '/calculate?' + new URLSearchParams({ leaveTypeId: type.id, startTime: date + 'T09:00:00', endTime: date + 'T18:00:00' }));
  check('one_day_leave_calculated_' + dayNo, Number(duration) === 1);
  const requestId = id(await ok('employee', ess, 'POST', { leaveTypeId: type.id, startTime: date + ' 09:00:00', endTime: date + ' 18:00:00', duration: 1, unit: 'DAY', reason: fixture.marker, attachmentFileIds: [] }));
  fixture.requests.push(requestId); save();
  const request = await until(() => requestRow(requestId), value => Boolean(value?.instanceId), 'leave_binding');
  const process = rows(`SELECT JSON_OBJECT('definition',definition_id,'applicant',CAST(start_user_id AS CHAR)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${literal(request.instanceId)}`)[0];
  check('real_leave_applicant_and_definition_' + dayNo, process.definition === fixture.definitionId && process.applicant === sessions.employee.identity.userId);
  for (const [actor, node] of [['admin', 'manager'], ['hr', 'hr']]) {
    const tasks = await until(() => rows(`SELECT JSON_OBJECT('id',task_id,'actor',CAST(assignee AS CHAR),'node',node_key) FROM wf_task WHERE tenant_id=100000 AND instance_id=${literal(request.instanceId)} AND status='TODO'`),
      value => value.length === 1 && value[0].node === node, 'approval_' + node);
    check('assigned_approver_' + dayNo + '_' + node, tasks[0].actor === sessions[actor].identity.userId);
    await ok(actor, wf + '/complete', 'POST', { taskId: tasks[0].id, action: 'APPROVE', comment: fixture.marker, variables: {} });
  }
  await until(() => requestRow(requestId), value => value.status === 'APPROVED', 'approved_callback');
  check('one_leave_ledger_application_' + dayNo, database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${fixture.employees[0].id} AND source_biz_type='HR_TIME_REQUEST' AND source_biz_id=${literal(requestId)} AND transaction_type='APPLICATION' AND leave_days=-1`) === '1');
}
async function observeTask(task) {
  if (task.terminal) return;
  const result = await until(() => ok('admin', pay + '/tasks/' + encodeURIComponent(task.executeNo)), value => ['SUCCESS', 'FAILED', 'TIMEOUT'].includes(value.executeStatus), 'payroll_' + task.executeNo);
  task.terminal = result.executeStatus; task.affectedRows = Number(result.affectedRows); save();
}
function verifySlip(slip, label) {
  const components = slip.components || [];
  const attendanceRows = components.filter(value => value.name === '考勤扣款');
  const leaveRows = components.filter(value => value.name === '无薪及部分带薪假扣款');
  check(label + '_attendance_exact_cents', attendanceRows.length === 1 && cents(attendanceRows[0].amount) === expected.attendance);
  check(label + '_leave_submission_snapshot_exact_cents', leaveRows.length === 1 && cents(leaveRows[0].amount) === expected.leave);
  for (const [field, expectedKey] of [['grossTotal', 'gross'], ['taxAmount', 'tax'], ['currentTax', 'tax'], ['netTotal', 'net']]) check(label + '_' + field, cents(slip[field]) === expected[expectedKey]);
  check(label + '_all_deductions_reconcile', cents(slip.deductionTotal) === expected.attendance + expected.leave + expected.tax);
  check(label + '_one_tax_snapshot_and_no_prior_tax', components.filter(value => value.type === 'TAX_SNAPSHOT').length === 1 && Number(slip.cumulativeTaxPaid) === 0);
}
async function screenshot(name) { await page.screenshot({ path: path.join(output, name), fullPage: false }); fixture.screenshots.push(name); save(); }
let failure, originalConfig, slabBody, configChanged = false;
try {
  const accountId = id(sessions.employee.identity.userId);
  check('test_employee_account_initially_unbound', database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${accountId} AND deleted=0`) === '0');
  const salaryPeriods = await ok('admin', pay + '/config/periods');
  fixture.month = ['2026-06', '2026-04'].find(month => !salaryPeriods.some(period => period.startDate <= month + '-30' && period.endDate >= month + '-01'));
  check('past_thirty_day_salary_period_available', Boolean(fixture.month));
  const startDate = fixture.month + '-01', endDate = fixture.month + '-30';
  fixture.periodId = id(await ok('admin', pay + '/periods', 'POST', { periodName: fixture.marker, frequency: 'MONTHLY', startDate, endDate, payDate: endDate })); save();
  const leavePeriod = (await ok('admin', leave + '/periods')).find(value => value.startDate === '2026-01-01' && value.endDate === '2026-12-31' && value.status === 'OPEN');
  check('existing_2026_leave_period_open', Boolean(leavePeriod)); fixture.leavePeriodId = id(leavePeriod.periodId);
  await ok('admin', '/auth/system/holiday/calendar', 'POST', { calendarCode: fixture.marker, calendarName: fixture.marker, defaultFlag: 0, weeklyRestDays: '6,7',
    workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' });
  fixture.calendarId = id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=' + literal(fixture.marker))); save();
  await ok('admin', '/auth/system/holiday/date/batch', 'POST', { calendarId: fixture.calendarId, yearNo: 2026,
    dates: Array.from({ length: 30 }, (_, index) => ({ holidayDate: fixture.month + '-' + String(index + 1).padStart(2, '0'), dateType: index === 28 ? 'REST' : index === 29 ? 'HOLIDAY' : 'WORKDAY', triplePayFlag: 0, holidayName: fixture.marker })) });
  await ok('admin', '/auth/system/dept', 'POST', { deptName: fixture.marker, parentId: 0, orderNum: 0, status: '0', holidayCalendarId: fixture.calendarId });
  fixture.deptId = id(database('SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name=' + literal(fixture.marker) + ' AND deleted=0')); save();
  fixture.shiftId = id(await ok('admin', attendance + '/shifts', 'POST', { shiftCode: fixture.marker, shiftName: fixture.marker,
    startTime: '09:00:00', endTime: '18:00:00', breakMinutes: 60, workMinutes: 480, checkinWindowBeforeMinutes: 30, checkoutWindowAfterMinutes: 30,
    lateGraceMinutes: 10, earlyExitGraceMinutes: 10, halfDayHoursThreshold: 4, absentHoursThreshold: 2, workingHoursCalcMode: 'FIRST_LAST', checkinDetermineMode: 'EARLIEST_LATEST',
    holidayCalendarId: fixture.calendarId, autoAttendanceFlag: 1, processAttendanceAfter: '2026-01-01', markOnHolidayFlag: 0, overtimeThresholdMinutes: 0, status: 1 })); save();
  for (const name of ['main', 'incomplete']) {
    const body = { employeeNo: fixture.marker + '-' + name, name: fixture.marker + '-' + name, gender: 'UNKNOWN', deptId: fixture.deptId, employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate: '2026-01-01' };
    const employeeId = id(await ok('admin', '/hr/employees', 'POST', { ...body, ...(name === 'main' ? { userId: accountId } : {}) }));
    fixture.employees.push({ id: employeeId, body }); save();
    await ok('admin', attendance + '/schedules', 'POST', { targetType: 'EMPLOYEE', targetId: employeeId, shiftId: fixture.shiftId, effectiveStart: startDate, effectiveEnd: endDate, status: 'ACTIVE' });
  }
  const employeeId = fixture.employees[0].id;
  const configId = id(database("SELECT config_id FROM sys_config WHERE tenant_id=100000 AND config_key='sys.hr.leave.processKey' AND config_scope='1'"));
  const config = await ok('admin', '/auth/system/config/' + configId);
  originalConfig = Object.fromEntries(['configId', 'tenantId', 'configScope', 'configKey', 'configName', 'configType', 'configValue', 'remark'].map(key => [key, config[key] ?? null]));
  fixture.originalConfig = originalConfig; save();
  const definitions = rows(`SELECT JSON_OBJECT('id',definition_id,'digest',SHA2(model_json,256)) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${literal(config.configValue)} AND status='PUBLISHED' AND deleted=0 ORDER BY version DESC`);
  check('original_leave_workflow_available', definitions.length > 0); fixture.originalDefinition = definitions[0]; save();
  const definition = await ok('admin', wf + '/definition/' + definitions[0].id);
  const model = typeof definition.modelJson === 'string' ? JSON.parse(definition.modelJson) : structuredClone(definition.modelJson);
  const stages = model.nodes.filter(value => value.type === 'APPROVAL');
  check('existing_two_approval_stages', stages.length === 2 && stages[0].id === 'manager' && stages[1].id === 'hr');
  for (const [index, actor] of ['admin', 'hr'].entries()) { stages[index].approverType = 'USER'; stages[index].approverValue = sessions[actor].identity.userId; }
  const created = await ok('admin', wf + '/definition/save', 'POST', { processKey: fixture.marker, processName: fixture.marker, modelJson: JSON.stringify(model), formId: null, startPermissionType: 'ALL', startPermissionValue: '[]' });
  fixture.definitionId = created.definitionId || created.id; save(); await ok('admin', wf + '/definition/deploy/' + fixture.definitionId, 'POST');
  configChanged = true; await ok('admin', '/auth/system/config', 'PUT', { ...originalConfig, configValue: fixture.marker });
  for (const [name, fields] of Object.entries({ unpaid: { lwpFlag: 1 }, partial: { partialPaidFlag: 1, salaryFractionPerDay: 0.6 }, paid: {} })) {
    const body = { leaveCode: fixture.marker + '-' + name, leaveName: fixture.marker + '-' + name, unit: 'DAY', needQuota: 1, isPaid: 1, status: 1,
      maxDaysPerYear: 10, roundingMode: 'NONE', includeHolidayFlag: 0, ...fields };
    fixture.types[name] = { id: id(await ok('admin', attendance + '/leave-types', 'POST', body)), body }; save();
  }
  fixture.policyId = id(await ok('admin', leave + '/policies', 'POST', { policyCode: fixture.marker, policyName: fixture.marker, status: 'ACTIVE' })); save();
  await ok('admin', leave + '/policies/' + fixture.policyId + '/details', 'PUT', Object.values(fixture.types).map(type => ({ leaveTypeId: type.id, annualDays: 5 })));
  check('one_employee_leave_policy_assignment', Number(await ok('admin', leave + '/assignments', 'POST', { employeeIds: [employeeId], policyId: fixture.policyId, periodId: fixture.leavePeriodId, assignmentBasis: 'PERIOD', carryForwardFlag: 0 })) === 1);
  for (const [index, type] of Object.values(fixture.types).entries()) await approve(type, index + 1);
  evidence.approval = true;
  for (const [name, changes] of [['unpaid', { lwpFlag: 0 }], ['partial', { salaryFractionPerDay: 0.2 }], ['paid', { lwpFlag: 1 }]]) {
    const type = fixture.types[name]; await ok('admin', attendance + '/leave-types/' + type.id, 'PUT', { ...type.body, ...changes });
  }
  console.log('D3_DEDUCTIONS_PHASE: three_real_leaves_approved; later_policy_changes_saved=true');
  const special = { 4: ['10:10:00', '18:00:00'], 5: ['09:00:00', '15:50:00'], 6: ['10:10:00', '15:50:00'], 8: ['09:00:00', '12:00:00'], 9: ['09:10:00', '18:00:00'], 10: ['09:00:00', '17:50:00'] };
  for (let day = 4; day <= 28; day++) {
    if (day === 7) continue;
    const date = fixture.month + '-' + String(day).padStart(2, '0');
    for (const [index, time] of (special[day] || ['09:00:00', '18:00:00']).entries()) {
      await ok('admin', attendance + '/checkins', 'POST', { employeeId, logType: index === 0 ? 'IN' : 'OUT', checkTime: date + ' ' + time, checkMethod: 'APP', deviceId: fixture.marker, remark: fixture.marker });
    }
  }
  const recalculated = await ok('admin', attendance + '/recalculate', 'POST', { employeeIds: [employeeId], startDate, endDate, forceOverwrite: false, confirmed: true });
  check('actual_thirty_day_attendance_calculated', recalculated.asynchronous === false && Number(recalculated.affected) === 30);
  const records = rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'date',attendance_date,'status',status,'late',late_minutes,'early',early_exit_minutes,'absent',absent_flag,'half',half_day_flag,'expected',expected_minutes,'manual',manual_adjusted_flag) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=${employeeId} AND deleted=0 ORDER BY attendance_date`);
  check('exact_thirty_actual_daily_conclusions', records.length === 30 && records.every(value => Number(value.manual) === 0));
  for (const [day, state, lateMinutes, earlyMinutes, absent, half] of [[1,'LEAVE',0,0,0,0],[2,'LEAVE',0,0,0,0],[3,'LEAVE',0,0,0,0],
    [4,'LATE',60,0,0,0],[5,'EARLY_EXIT',0,120,0,0],[6,'LATE_AND_EARLY',60,120,0,0],[7,'ABSENT',0,0,1,0],[8,'HALF_DAY',0,350,0,1],[9,'NORMAL',0,0,0,0],[10,'NORMAL',0,0,0,0]]) {
    const row = records[day - 1];
    check('actual_day_' + day + '_deduction_inputs', row.status === state && Number(row.late) === lateMinutes && Number(row.early) === earlyMinutes && Number(row.absent) === absent && Number(row.half) === half && Number(row.expected) === 480);
    fixture.cases.push({ day, ...row });
  }
  for (const row of records.slice(10, 28)) check('normal_day_no_deduction_' + row.date, row.status === 'NORMAL' && Number(row.late) === 0 && Number(row.early) === 0 && Number(row.absent) === 0 && Number(row.half) === 0);
  check('rest_and_holiday_have_no_expected_work', records.slice(28).every(value => Number(value.expected) === 0 && Number(value.absent) === 0 && Number(value.half) === 0)); save();
  const confirmed = await ok('admin', attendance + '/monthly/confirm?employeeId=' + employeeId + '&month=' + fixture.month, 'POST');
  check('real_month_confirmed', confirmed.status === 'CONFIRMED');
  const incomplete = await api('admin', attendance + '/monthly/confirm?employeeId=' + fixture.employees[1].id + '&month=' + fixture.month, 'POST');
  check('missing_daily_records_cannot_confirm_month', incomplete.status === 400 && incomplete.body?.code === 'ATTENDANCE_INCOMPLETE'); evidence.attendance = true;
  fixture.attendanceDigest = hash(database(`SELECT * FROM hr_attendance_record WHERE employee_id=${employeeId} ORDER BY id`));
  fixture.punchDigest = hash(database(`SELECT * FROM hr_attendance_checkin WHERE employee_id=${employeeId} ORDER BY checkin_id`));
  fixture.leaveDigest = hash(database(`SELECT * FROM hr_time_request WHERE employee_id=${employeeId} ORDER BY id`)); save();

  fixture.componentId = id(await ok('admin', '/hr/compensation/components', 'POST', { componentCode: fixture.marker, componentName: fixture.marker, componentType: 'FIXED', category: 'EARNING', taxable: 1, status: 1, sortOrder: 999 }));
  fixture.structureId = id(await ok('admin', '/hr/compensation/structures', 'POST', { structureCode: fixture.marker, structureName: fixture.marker, status: 1, componentConfig: {} })); save();
  await ok('admin', pay + '/structures/' + fixture.structureId, 'PUT', { salaryBasis: 'MONTHLY', prorationBasis: 'CALENDAR_DAYS', benefitTiming: 'FIRST_PAYROLL' });
  slabBody = { slabName: fixture.marker + '-合成机制税表', region: '隔离测试', effectiveFrom: startDate, effectiveTo: endDate, thresholdAmount: '0.00', status: 'DRAFT', remark: '合成10%税率，仅验证扣款与计税衔接，不代表正式政策' };
  fixture.slabId = id(await ok('admin', pay + '/tax-slabs', 'POST', slabBody)); save();
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId + '/details', 'PUT', Array.from({ length: 7 }, (_, index) => ({ levelNo: index + 1, fromAmount: String(index * 10000), toAmount: index === 6 ? null : String((index + 1) * 10000), taxRate: '0.1000', quickDeduction: '0.00' })));
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'ACTIVE' });
  for (const employee of fixture.employees) {
    await ok('admin', '/hr/compensation/employee-compensations', 'POST', { employeeId: employee.id, structureId: fixture.structureId, componentValues: { [fixture.componentId]: '3000.30' }, totalSalary: '3000.30', effectiveDate: startDate, status: 'ACTIVE' });
    await ok('admin', '/hr/compensation/tax-profiles', 'POST', { employeeId: employee.id, taxSlabId: fixture.slabId, taxResidenceCity: '隔离测试', status: 'ACTIVE' });
  }
  const preview = await ok('admin', pay + '/slips/preview?employeeId=' + employeeId + '&periodId=' + fixture.periodId); verifySlip(preview, 'preview');
  const selection = { payrollPeriodId: fixture.periodId, employeeIds: fixture.employees.map(employee => employee.id), validateAttendanceFlag: 1, deductUnverifiedFlag: 0 };
  const precheck = await ok('admin', pay + '/batches/preview', 'POST', selection);
  check('mixed_precheck_one_pending_one_skipped', precheck.length === 2 && precheck.find(value => String(value.employeeId) === employeeId)?.calcStatus === 'PENDING'
    && precheck.find(value => String(value.employeeId) === fixture.employees[1].id)?.calcStatus === 'SKIPPED');
  fixture.batchId = id(await ok('admin', pay + '/batches', 'POST', selection)); save();
  const task = { executeNo: await ok('admin', pay + '/batches/' + fixture.batchId + '/calculate', 'POST', {}), batchId: fixture.batchId }; fixture.tasks.push(task); save(); await observeTask(task);
  check('original_mixed_task_completed_one_salary', task.terminal === 'SUCCESS' && task.affectedRows === 1);
  const batch = await ok('admin', pay + '/batches/' + fixture.batchId);
  check('mixed_batch_calculated_success_and_skipped', batch.batch.status === 'CALCULATED' && Number(batch.processed) === 2 && batch.employees.length === 2
    && batch.employees.filter(value => value.calcStatus === 'SUCCESS').length === 1 && batch.employees.filter(value => value.calcStatus === 'SKIPPED' && value.errorMessage.includes(fixture.month + '考勤未封账')).length === 1);
  fixture.slipId = id(batch.employees.find(value => value.calcStatus === 'SUCCESS').salarySlipId); fixture.batchNo = batch.batch.batchNo; save();
  verifySlip(await ok('admin', pay + '/slips/' + fixture.slipId), 'actual_draft'); evidence.deductions = true;
  check('skipped_employee_has_no_salary', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE batch_id=${fixture.batchId} AND employee_id=${fixture.employees[1].id}`) === '0');
  await page.goto(new URL('/hr/payroll', origin).href, { waitUntil: 'domcontentloaded' });
  const row = page.locator('table tbody tr').filter({ hasText: fixture.batchNo });
  await row.getByRole('button', { name: '员工清单与进度', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: fixture.batchNo });
  await dialog.getByText(fixture.month + '考勤未封账', { exact: true }).waitFor();
  check('mixed_page_has_success_and_skipped_employee', (await dialog.innerText()).includes('成功') && (await dialog.innerText()).includes('跳过') && (await dialog.innerText()).includes('2371.74'));
  await screenshot('mixed-deductions.png');
  await ok('admin', pay + '/batches/' + fixture.batchId + '/submit', 'POST', {});
  const submitted = await ok('admin', pay + '/slips/' + fixture.slipId); verifySlip(submitted, 'submitted');
  check('mixed_batch_can_submit_successful_salary', submitted.status === 'SUBMITTED' && /^[a-f0-9]{64}$/i.test(submitted.digestSha256)); evidence.mixedBatch = true;
  await ok('admin', pay + '/batches/' + fixture.batchId + '/pay', 'POST', {});
  const paid = await ok('admin', pay + '/slips/' + fixture.slipId); verifySlip(paid, 'paid');
  check('deductions_paid_salary_preserved', paid.status === 'PAID');
  check('payroll_preserves_source_daily_conclusions', hash(database(`SELECT * FROM hr_attendance_record WHERE employee_id=${employeeId} ORDER BY id`)) === fixture.attendanceDigest);
  check('payroll_preserves_original_punches', hash(database(`SELECT * FROM hr_attendance_checkin WHERE employee_id=${employeeId} ORDER BY checkin_id`)) === fixture.punchDigest);
  check('payroll_preserves_approved_leave_sources', hash(database(`SELECT * FROM hr_time_request WHERE employee_id=${employeeId} ORDER BY id`)) === fixture.leaveDigest); evidence.snapshot = true;
  console.log('D3_DEDUCTIONS_PHASE: gross=3000.30; attendance=225.02; leave=140.01; synthetic_tax=263.53; net=2371.74; mixed_submit=passed');
} catch (error) { failure = error; try { await screenshot('failure.png'); } catch {} }
finally {
  const restore = async (label, action) => { try { await action(); fixture.restorations[label] = true; } catch (error) { fixture.restorations[label] = false; failure ||= error; } save(); };
  await restore('originalTasks', async () => { for (const task of fixture.tasks) await observeTask(task); });
  await restore('batch', async () => {
    if (!fixture.batchId) return;
    const current = await ok('admin', pay + '/batches/' + fixture.batchId);
    if (current.batch.status === 'SUBMITTED') await ok('admin', pay + '/batches/' + fixture.batchId + '/pay', 'POST', {});
    else if (['DRAFT', 'CALCULATED', 'FAILED'].includes(current.batch.status)) await ok('admin', pay + '/batches/' + fixture.batchId + '/cancel', 'POST', {});
    check('owned_batch_terminal', ['PAID', 'CANCELLED'].includes((await ok('admin', pay + '/batches/' + fixture.batchId)).batch.status));
  });
  await restore('requests', async () => {
    for (const requestId of fixture.requests) {
      const current = requestRow(requestId);
      if (['PENDING', 'SUBMITTED', 'APPROVING', 'APPLYING'].includes(current.status)) await ok('admin', attendance + '/time-requests/' + requestId + '/cancel', 'POST');
    }
  });
  await restore('workflowConfig', async () => {
    if (!configChanged) return;
    const current = await ok('admin', '/auth/system/config/' + originalConfig.configId);
    check('only_owned_workflow_override_restored', current.configValue === fixture.marker);
    await ok('admin', '/auth/system/config', 'PUT', originalConfig);
    const final = await ok('admin', '/auth/system/config/' + originalConfig.configId);
    check('original_workflow_configuration_fields_restored', Object.entries(originalConfig).every(([key, value]) => String(final[key] ?? null) === String(value)));
  });
  await restore('account', async () => {
    const employee = fixture.employees[0]; if (!employee) return;
    check('only_owned_employee_binding_removed', database(`SELECT user_id FROM hr_employee WHERE tenant_id=100000 AND id=${employee.id}`) === sessions.employee.identity.userId);
    await ok('admin', '/hr/employees/' + employee.id, 'PUT', { ...employee.body, userId: null });
    check('test_account_unbound_again', database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${id(sessions.employee.identity.userId)} AND deleted=0`) === '0');
  });
  await restore('syntheticTax', async () => { if (fixture.slabId) { await ok('admin', pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'INACTIVE' }); check('owned_tax_restored_inactive', database(`SELECT status FROM hr_tax_slab WHERE slab_id=${fixture.slabId}`) === 'INACTIVE'); } });
  evidence.restoration = Object.values(fixture.restorations).every(Boolean);
  try {
    const final = preserved(); for (const [table] of tables) check('all_original_' + table + '_rows_unchanged', final[table] === fixture.originalDigest[table]);
    check('original_roles_unchanged', roles() === fixture.originalRoles);
    if (fixture.originalDefinition) check('original_workflow_model_unchanged', database(`SELECT SHA2(model_json,256) FROM wf_process_definition WHERE definition_id=${literal(fixture.originalDefinition.id)}`) === fixture.originalDefinition.digest);
    check('no_browser_javascript_errors', browserErrors.length === 0); evidence.preservation = true;
  } catch (error) { failure ||= error; }
  try { console.log('D3_DEDUCTIONS_LOG_SCAN: ' + JSON.stringify(await runtime.scan())); evidence.secrets = true; } catch (error) { failure ||= error; }
  await runtime.close(); save();
  const raw = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safe = raw && [...sensitive].every(value => !raw.includes(value)) ? raw : failure ? 'D3 payroll deductions verification failed' : undefined;
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length,
    tasks: fixture.tasks.length, syntheticPolicy: true, officialTaxPolicyVerified: false, all18Complete: false, globalComplete: false, failure: safe }, null, 2));
  console.log(`D3_DEDUCTIONS_SUMMARY: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; tasks=${fixture.tasks.length}; preservation=${evidence.preservation}; restoration=${evidence.restoration}; all18_complete=false`);
  if (failure) { console.log('D3_DEDUCTIONS_FAILURE: ' + safe); process.exitCode = 1; }
}
