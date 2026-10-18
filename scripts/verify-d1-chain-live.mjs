import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d1-chain'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d1-chain-live-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const resumeRound = process.argv.includes('--resume-source') ? process.argv[process.argv.indexOf('--resume-source') + 1] : null;
let resumeFixture, resumeChain, resumeCompleted = false;
if (resumeRound) {
  assert.match(resumeRound, /^r[1-9][0-9]*$/);
  const source = path.join(path.dirname(output), 'd1-chain-live-20261005-' + resumeRound);
  const readSource = name => JSON.parse(fs.readFileSync(path.join(source, name), 'utf8').replace(/^\uFEFF/, ''));
  const previous = readSource('result.json');
  assert.equal(previous.passed, false);
  resumeCompleted = previous.chain === true && previous.approval === true && previous.carry === true && previous.expiry === true && previous.page === false;
  if (resumeCompleted) assert.ok(previous.failure.startsWith('locator.click: Error: strict mode violation:'));
  else assert.equal(previous.failure, 'POST_/hr/ess/leave:status_400_code_INVALID_LEAVE_DURATION');
  assert.equal(previous.restoration, true); assert.equal(previous.preservation, true); assert.equal(previous.allocation, true);
  resumeFixture = readSource('fixture.json');
  if (resumeCompleted) { resumeChain = readSource('chain.json'); assert.equal(resumeChain.length, 8); }
  assert.equal(resumeFixture.requests.length, resumeCompleted ? 1 : 0); assert.equal(resumeFixture.instances.length, resumeCompleted ? 1 : 0); assert.equal(resumeFixture.executions.length, resumeCompleted ? 4 : 0);
}
const marker = resumeFixture?.marker || 'D1K-' + randomUUID().replaceAll('-', '').slice(0, 12);
const fixture = resumeFixture ? { ...structuredClone(resumeFixture), resumedFrom: resumeRound, restorations: {} } : { marker, types: {}, requests: [], instances: [], executions: [], restorations: {} };
const evidence = { allocation: false, approval: false, carry: false, expiry: false, chain: false, page: false, preservation: false, restoration: false, secrets: false };
const save = () => fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify(fixture, null, 2));
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const sql = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
const hash = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, accept, label, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await read(); if (accept(result)) return result; await delay(1000); }
  throw Error(label + ': observation deadline reached; retain original business IDs');
}
const runtime = await createD1LeaveRuntime(root, output);
const { run, checks, requests, sensitive, sessions, browserErrors, check, database, rows, api, success, ok } = runtime;
const base = '/hr/attendance/leave', ess = '/hr/ess/leave', wf = '/workflow/wf', holiday = '/auth/system/holiday';
let failure, employeeId, originalConfig, calendarId, calendarEnabled = true, employeeBody, employeeBound = false;
const reject = (response, label, code) => check(label, response.status >= 400 && response.body?.code !== 200 && (!code || JSON.stringify(response.body).includes(code)));
const requestRow = requestId => rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'instanceId',process_instance_id,'duration',duration,'unit',unit,'employeeId',CAST(employee_id AS CHAR),'requestNo',request_no) FROM hr_time_request WHERE tenant_id=100000 AND id=${id(requestId)}`)[0];
const ledger = typeId => rows(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'type',transaction_type,'days',leave_days,'source',source_biz_type,'sourceId',source_biz_id,'periodId',CAST(leave_period_id AS CHAR),'unit',quantity_unit) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${id(employeeId)} AND leave_type_id=${id(typeId)} ORDER BY ledger_id`);
const quota = typeId => rows(`SELECT JSON_OBJECT('total',total_quota,'used',used_quota,'frozen',frozen_quota,'available',available_quota) FROM hr_leave_quota WHERE tenant_id=100000 AND employee_id=${id(employeeId)} AND leave_type_id=${id(typeId)} AND period_id=${id(fixture.periodId)} AND deleted=0`)[0];
const quotaIs = (typeId, total, used, frozen, available, label) => { const value = quota(typeId); check(label, !!value && Number(value.total) === total && Number(value.used) === used && Number(value.frozen) === frozen && Number(value.available) === available); };
const payload = (typeId, suffix, start = '2026-10-08 09:00:00', end = '2026-10-08 18:00:00') => ({ leaveTypeId: typeId, startTime: start, endTime: end,
  duration: 1, unit: 'DAY', reason: `${marker}-${suffix}`, attachmentFileIds: [] });
async function submit(body) {
  const requestId = id(await ok('employee', ess, 'POST', body)); fixture.requests.push(requestId); save(); return requestId;
}
async function bound(requestId) {
  const row = await until(() => requestRow(requestId), value => !!value?.instanceId, 'Leave workflow binding');
  if (!fixture.instances.includes(row.instanceId)) { fixture.instances.push(row.instanceId); save(); }
  const process = rows(`SELECT JSON_OBJECT('definitionId',definition_id,'startUserId',CAST(start_user_id AS CHAR)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(row.instanceId)}`)[0];
  check('workflow_uses_owned_two_stage_definition_and_real_applicant', process?.definitionId === fixture.definitionId && process.startUserId === sessions.employee.identity.userId);
  return row.instanceId;
}
async function taskFor(instanceId, actor, node) {
  const task = await until(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'node',node_key) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sql(instanceId)} AND status='TODO'`),
    values => values.length === 1 && values[0].node === node, 'Sequential leave task ' + node);
  check('task_belongs_to_' + actor, task[0].assignee === sessions[actor].identity.userId);
  const todo = await ok(actor, wf + '/todo?pageNum=1&pageSize=100');
  check('actual_todo_contains_expected_task', (todo.rows || []).some(value => String(value.taskId || value.id) === task[0].id));
  return task[0];
}
async function complete(actor, task, action = 'APPROVE') {
  return ok(actor, wf + '/complete', 'POST', { taskId: task.id, action, comment: marker + '-' + action, variables: {} });
}
async function approve(requestId, typeId, beforeUsed, total, quantity) {
  const instanceId = await bound(requestId);
  const managerTask = await taskFor(instanceId, 'admin', 'manager');
  const forbidden = await api('employee', wf + '/complete', { method: 'POST', body: { taskId: managerTask.id, action: 'APPROVE', comment: marker, variables: {} } });
  check('applicant_cannot_handle_manager_task', forbidden.status === 403);
  await complete('admin', managerTask);
  const hrTask = await taskFor(instanceId, 'hr', 'hr');
  check('first_stage_does_not_mark_leave_approved', requestRow(requestId).status !== 'APPROVED');
  quotaIs(typeId, total, beforeUsed, quantity, total - beforeUsed - quantity, 'first_stage_keeps_frozen_quota');
  await complete('hr', hrTask);
  await until(() => requestRow(requestId), value => value.status === 'APPROVED', 'Final leave approval callback');
  quotaIs(typeId, total, beforeUsed + quantity, 0, total - beforeUsed - quantity, 'final_approval_deducts_once_and_unfreezes');
  const entries = ledger(typeId).filter(value => value.source === 'HR_TIME_REQUEST' && value.sourceId === requestId);
  check('approved_request_has_exact_freeze_application_unfreeze', entries.length === 3
    && entries.filter(value => value.type === 'FREEZE' && Number(value.days) === -quantity).length === 1
    && entries.filter(value => value.type === 'APPLICATION' && Number(value.days) === -quantity).length === 1
    && entries.filter(value => value.type === 'UNFREEZE' && Number(value.days) === quantity).length === 1);
  const beforeReplay = hash(JSON.stringify(ledger(typeId)));
  reject(await api('hr', wf + '/complete', { method: 'POST', body: { taskId: hrTask.id, action: 'APPROVE', comment: marker + '-repeat', variables: {} } }), 'completed_task_replay_rejected');
  check('completed_task_replay_does_not_change_ledger', beforeReplay === hash(JSON.stringify(ledger(typeId))));
}
async function cancel(requestId) {
  await ok('employee', `${ess}/${requestId}/cancel`, 'POST');
  check('employee_cancel_marks_original_request', requestRow(requestId).status === 'CANCELLED');
}


const jobs = '/auth/system/job';
let originalDigest;
const prior = {};
const preservedSnapshot = () => hash(JSON.stringify([
  database('SELECT * FROM hr_leave_ledger WHERE ledger_id<=' + id(prior.ledger) + ' ORDER BY ledger_id'),
  database('SELECT * FROM hr_leave_quota WHERE id<=' + id(prior.quota) + ' ORDER BY id'),
  database('SELECT * FROM hr_time_request WHERE id<=' + id(prior.request) + ' ORDER BY id'),
  database('SELECT * FROM hr_leave_period WHERE period_id<=' + id(prior.period) + ' ORDER BY period_id'),
  database("SELECT tenant_id,job_id,job_name,handler_name,COALESCE(handler_param,''),status,trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),deleted FROM sys_job ORDER BY tenant_id,job_id"),
]));
async function verifyBalances(label) {
  const entries = await ok('admin', base + '/ledger?employeeId=' + employeeId + '&leaveTypeId=' + fixture.types.base);
  const totals = new Map();
  for (const entry of entries) {
    const key = String(entry.periodId), balance = (totals.get(key) || 0) + Math.round(Number(entry.leaveDays) * 100);
    totals.set(key, balance);
    check(label + '_running_' + entry.ledgerId, Math.round(Number(entry.runningBalance) * 100) === balance);
  }
  const own = await ok('employee', ess + '/quotas');
  check(label + '_only_owned_quotas', own.length === totals.size && own.every(value => String(value.employeeId) === employeeId && String(value.leaveTypeId) === fixture.types.base));
  for (const value of own) check(label + '_balance_equals_ledger_' + value.periodId, Math.round(Number(value.availableQuota) * 100) === totals.get(String(value.periodId)));
  return entries;
}
async function verifyPage(entries) {
  const page = await sessions.admin.context.newPage();
  page.on('pageerror', () => browserErrors.push('chain_page'));
  await page.goto(new URL('/hr/leave-rules', sessions.admin.page.url()).href, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '假期政策与台账', exact: true }).waitFor();
  await page.getByRole('tab', { name: '额度台账', exact: true }).click();
  await page.getByRole('combobox', { name: '选择员工', exact: true }).click();
  await page.getByPlaceholder('搜索员工姓名 / 工号 / 部门...').fill(marker);
  await page.getByRole('listbox', { name: '选择员工', exact: true }).getByRole('option').filter({ hasText: marker }).click();
  await page.getByPlaceholder('搜索员工姓名 / 工号 / 部门...').waitFor({ state: 'hidden' });
  await page.getByRole('combobox', { name: /^假期\s*\*?$/ }).selectOption(fixture.types.base);
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/hr/attendance/leave/ledger');
  await page.getByRole('button', { name: '查询台账', exact: true }).click();
  const response = await responsePromise;
  check('chain_page_receives_real_ledger', response.status() === 200 && (await response.json()).data.length === 8);
  await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 8, undefined, { timeout: 30000 });
  const rendered = await page.locator('table:visible tbody tr').evaluateAll(lines => lines.map(line => [...line.querySelectorAll('td')].map(cell => cell.textContent.trim())));
  const names = { ALLOCATION: '额度分配', APPLICATION: '请假扣减', CARRY_FORWARD: '周期结转', EXPIRY: '额度过期', FREEZE: '审批冻结', UNFREEZE: '审批解冻' };
  check('chain_page_eight_rows', rendered.length === entries.length);
  for (const [index, entry] of entries.entries()) {
    const expected = [marker + (String(entry.periodId) === fixture.periodId ? '-2006' : '-2007'), names[entry.transactionType],
      Number(entry.leaveDays).toFixed(2) + ' 天', Number(entry.runningBalance).toFixed(2) + ' 天'];
    check('chain_page_cells_' + entry.ledgerId, expected.every((value, column) => value === rendered[index][column]));
  }
  await page.screenshot({ path: path.join(output, 'complete-chain-desktop.png'), fullPage: true });
}

const lastTriggers = new Map();
async function trigger(jobId, expected, label) {
  const remaining = 5500 - (Date.now() - (lastTriggers.get(jobId) || 0));
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  const accepted = await ok('admin', `${jobs}/${jobId}/trigger`, 'POST', {});
  check(label + '_accepted', accepted.accepted === true && typeof accepted.executeNo === 'string');
  fixture.executions.push({ jobId, executeNo: accepted.executeNo, label }); save(); lastTriggers.set(jobId, Date.now());
  const deadline = Date.now() + 180000;
  let result;
  do {
    result = rows(`SELECT JSON_OBJECT('status',execute_status,'trigger',trigger_type,'actor',trigger_by,'affected',affected_rows,'start',start_time,'end',end_time,'report',report_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=${jobId} AND execute_no=${sql(accepted.executeNo)}`)[0];
    if (result && ['SUCCESS','FAILED','TIMEOUT','DISPATCH_FAILED'].includes(result.status)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  check(label + '_real_execution_and_report', result?.status === 'SUCCESS' && result.trigger === 'MANUAL' && result.actor === 'g_import_admin'
    && result.start && result.end && result.report && Number(result.affected) === expected);
  console.log(`D1_CHAIN_JOB: label=${label}; affected=${result.affected}; status=${result.status}`);
}

try {
  if (!resumeFixture) {
  check('historical_range_unused', database("SELECT COUNT(*) FROM hr_leave_period WHERE tenant_id=100000 AND deleted=0 AND start_date<='2008-03-31' AND end_date>='2006-04-01'") === '0');
  check('historical_period_neighbors_absent', database("SELECT COUNT(*) FROM hr_leave_period WHERE tenant_id=100000 AND deleted=0 AND status='OPEN' AND (end_date='2006-03-31' OR start_date='2008-04-01')") === '0');
  check('employee_account_initially_unbound', database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=' + id(sessions.employee.identity.userId) + ' AND deleted=0') === '0');
  check('no_original_due_unexpired_carry_credit', database("SELECT COUNT(*) FROM hr_leave_ledger c WHERE c.tenant_id=100000 AND c.transaction_type='CARRY_FORWARD' AND c.leave_days>0 AND c.to_date<CURRENT_DATE AND NOT EXISTS (SELECT 1 FROM hr_leave_ledger d WHERE d.tenant_id=c.tenant_id AND d.transaction_type='EXPIRY' AND d.source_biz_type='LEAVE_LEDGER' AND d.source_biz_id=CAST(c.ledger_id AS CHAR))") === '0');
  for (const [key, table, column] of [['ledger','hr_leave_ledger','ledger_id'],['quota','hr_leave_quota','id'],['request','hr_time_request','id'],['period','hr_leave_period','period_id']]) {
    prior[key] = id(database('SELECT COALESCE(MAX(' + column + '),1) FROM ' + table));
  }
  originalDigest = preservedSnapshot(); fixture.prior = prior; fixture.originalDigest = originalDigest; save();
  for (const [jobId, handler] of [[1451,'hrLeaveCarryForward'],[1452,'hrLeaveExpiry']]) {
    const job = await ok('admin', jobs + '/' + jobId);
    check('original_job_' + jobId + '_paused', job.handlerName === handler && job.status === 'PAUSED');
  }
  fixture.periodId = id(await ok('admin', base + '/periods', 'POST', { periodName: marker + '-2006', startDate: '2006-04-01', endDate: '2007-03-31', status: 'OPEN', defaultFlag: 0 })); save();
  fixture.nextPeriod = id(await ok('admin', base + '/periods', 'POST', { periodName: marker + '-2007', startDate: '2007-04-01', endDate: '2008-03-31', status: 'OPEN', defaultFlag: 0 })); save();
  fixture.defaultCalendarBefore = database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND deleted=0 ORDER BY calendar_id');
  await ok('admin', holiday + '/calendar', 'POST', { calendarCode: marker, calendarName: marker + '请假日历', region: '隔离验收', defaultFlag: 0,
    weeklyRestDays: '6,7', workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' });
  calendarId = id(database(`SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=${sql(marker)} AND deleted=0`)); fixture.calendarId = calendarId; save();
  await ok('admin', holiday + '/date/batch', 'POST', { calendarId, yearNo: 2006, dates: Array.from({ length: 7 }, (_, index) => ({ holidayDate: `2006-10-0${index + 1}`, dateType: 'HOLIDAY', triplePayFlag: index < 3 ? 1 : 0, holidayName: '国庆验收样本' })) });
  await ok('admin', '/auth/system/dept', 'POST', { deptName: marker, parentId: 0, orderNum: 0, status: '0', holidayCalendarId: calendarId });
  const deptId = id(database(`SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name=${sql(marker)} AND deleted=0`));
  employeeBody = { employeeNo: marker, name: marker + '请假员工', gender: 'MALE', deptId, employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate: '2006-01-01', userId: sessions.employee.identity.userId };
  employeeId = id(await ok('admin', '/hr/employees', 'POST', employeeBody)); employeeBound = true; fixture.employeeId = employeeId; fixture.employeeBody = employeeBody; save();
  check('ess_resolves_only_the_new_owned_employee', Array.isArray(await ok('employee', ess + '/mine')));

  fixture.types.base = id(await ok('admin', '/hr/attendance/leave-types', 'POST', { leaveCode: marker, leaveName: marker + '-完整流水',
    unit: 'DAY', needQuota: 1, isPaid: 1, status: 1, maxDaysPerYear: 10, roundingMode: 'NONE', includeHolidayFlag: 0,
    allowNegativeFlag: 0, earnedLeaveFlag: 0, carryForwardFlag: 1, maxCarryForwardDays: 2, carryForwardExpireDays: 30 })); save();
  fixture.policyId = id(await ok('admin', base + '/policies', 'POST', { policyCode: marker, policyName: marker, status: 'ACTIVE' })); save();
  await ok('admin', base + '/policies/' + fixture.policyId + '/details', 'PUT', [{ leaveTypeId: fixture.types.base, annualDays: 5 }]);
  check('one_employee_assigned', await ok('admin', base + '/assignments', 'POST', { employeeIds: [employeeId], policyId: fixture.policyId, periodId: fixture.periodId, assignmentBasis: 'PERIOD', carryForwardFlag: 1 }) === 1);
  quotaIs(fixture.types.base, 5, 0, 0, 5, 'allocated_five_days');
  check('single_real_allocation', (await verifyBalances('allocation')).length === 1); evidence.allocation = true;
  const configId = id(database("SELECT config_id FROM sys_config WHERE tenant_id=100000 AND config_key='sys.hr.leave.processKey' AND config_scope='1'"));
  const config = await ok('admin', '/auth/system/config/' + configId);
  const fields = ['configId','tenantId','configScope','configKey','configName','configType','configValue','remark'];
  originalConfig = Object.fromEntries(fields.map(field => [field, config[field] ?? null])); fixture.originalConfig = originalConfig; save();
  const definitions = rows(`SELECT JSON_OBJECT('id',definition_id,'digest',SHA2(model_json,256)) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sql(originalConfig.configValue)} AND status='PUBLISHED' AND deleted=0 ORDER BY version DESC`);
  check('original_leave_definition_available', definitions.length >= 1); fixture.originalDefinition = definitions[0];
  const original = await ok('admin', wf + '/definition/' + definitions[0].id);
  const model = typeof original.modelJson === 'string' ? JSON.parse(original.modelJson) : structuredClone(original.modelJson);
  const approvalNodes = model.nodes.filter(value => value.type === 'APPROVAL');
  check('existing_leave_model_has_two_ordered_stages', approvalNodes.length === 2 && approvalNodes[0].id === 'manager' && approvalNodes[1].id === 'hr');
  for (const [index, actor] of ['admin', 'hr'].entries()) { approvalNodes[index].approverType = 'USER'; approvalNodes[index].approverValue = sessions[actor].identity.userId; }
  const definition = await ok('admin', wf + '/definition/save', 'POST', { processKey: marker, processName: marker, modelJson: JSON.stringify(model), formId: null, startPermissionType: 'ALL', startPermissionValue: '[]' });
  fixture.definitionId = definition.definitionId || definition.id; check('owned_definition_id_returned', typeof fixture.definitionId === 'string'); save();
  await ok('admin', wf + '/definition/deploy/' + fixture.definitionId, 'POST');
  fixture.configurationChanged = true; save();
  await ok('admin', '/auth/system/config', 'PUT', { ...originalConfig, configValue: marker });
  check('owned_workflow_configuration_visible', (await ok('admin', '/auth/system/config/' + configId)).configValue === marker);

  } else {

    employeeId = id(fixture.employeeId); employeeBody = fixture.employeeBody; calendarId = id(fixture.calendarId);
    check('resumed_fixture_belongs_to_same_test_actor', String(employeeBody.userId) === sessions.employee.identity.userId && employeeBody.employeeNo === marker);
    Object.assign(prior, fixture.prior); originalDigest = fixture.originalDigest;
    check('resumed_original_business_rows_unchanged', originalDigest === preservedSnapshot());
    check('resumed_account_is_unbound', database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=' + id(sessions.employee.identity.userId) + ' AND deleted=0') === '0');
    check('resumed_employee_identity_and_unbound_state', database('SELECT CONCAT(employee_no,CHAR(9),COALESCE(CAST(user_id AS CHAR),\'NULL\')) FROM hr_employee WHERE tenant_id=100000 AND id=' + employeeId + ' AND deleted=0') === marker + '\tNULL');
    check('resumed_request_count_matches_stage', database('SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000 AND employee_id=' + employeeId) === (resumeCompleted ? '1' : '0'));
    if (!resumeCompleted) check('resumed_periods_still_open', database('SELECT COUNT(*) FROM hr_leave_period WHERE tenant_id=100000 AND period_id IN (' + id(fixture.periodId) + ',' + id(fixture.nextPeriod) + ") AND status='OPEN' AND deleted=0") === '2');
    check('resumed_original_allocation_and_stage_rows', ledger(fixture.types.base).length === (resumeCompleted ? 8 : 1) && ledger(fixture.types.base)[0].type === 'ALLOCATION' && Number(ledger(fixture.types.base)[0].days) === 5);
    employeeBound = true;
    await ok('admin', '/hr/employees/' + employeeId, 'PUT', employeeBody);
    if (!resumeCompleted) quotaIs(fixture.types.base, 5, 0, 0, 5, 'resumed_allocation_preserved');
    await verifyBalances('resumed_allocation'); evidence.allocation = true;
    if (!resumeCompleted) {
    originalConfig = fixture.originalConfig;
    const current = await ok('admin', '/auth/system/config/' + originalConfig.configId);
    check('original_configuration_still_restored_before_resume', current.configValue === originalConfig.configValue);
    const definition = await ok('admin', wf + '/definition/' + fixture.definitionId);
    check('resumed_definition_matches_original_test_process', definition.processKey === marker && definition.status === 'PUBLISHED');
    fixture.configurationChanged = true; save();
    await ok('admin', '/auth/system/config', 'PUT', { ...originalConfig, configValue: marker });
  }
    }
  let entries;
  if (!resumeCompleted) {
  const calculated = await ok('employee', ess + '/calculate?' + new URLSearchParams({ leaveTypeId: fixture.types.base, startTime: '2006-09-29T09:00:00', endTime: '2006-09-29T18:00:00' }));
  check('historical_workday_calculates_one_day_before_submit', Number(calculated) === 1);
  const requestId = await submit(payload(fixture.types.base, 'one-day', '2006-09-29 09:00:00', '2006-09-29 18:00:00'));
  quotaIs(fixture.types.base, 5, 0, 1, 4, 'request_freezes_one_day');
  await verifyBalances('frozen');
  await approve(requestId, fixture.types.base, 0, 5, 1);
  await verifyBalances('approved'); evidence.approval = true;
  check('other_eligible_carry_groups_absent', database("SELECT COUNT(*) FROM hr_leave_quota q JOIN hr_leave_period p ON p.period_id=q.period_id AND p.tenant_id=q.tenant_id JOIN hr_leave_period n ON n.tenant_id=p.tenant_id AND n.start_date=DATE_ADD(p.end_date,INTERVAL 1 DAY) AND n.status='OPEN' AND n.deleted=0 WHERE p.tenant_id=100000 AND p.status='OPEN' AND p.deleted=0 AND p.end_date<CURRENT_DATE AND q.deleted=0 AND q.available_quota>0 AND q.employee_id<>" + employeeId) === '0');
  await trigger(1451, 1, 'carry');
  entries = await verifyBalances('carried');
  check('same_group_four_required_types', ['ALLOCATION','APPLICATION','CARRY_FORWARD','EXPIRY'].every(kind => entries.some(entry => String(entry.periodId) === fixture.periodId && entry.transactionType === kind)));
  check('old_period_available_zero', Number(quota(fixture.types.base).available) === 0);
  check('two_day_transfer_and_old_two_day_expiry', entries.some(entry => String(entry.periodId) === fixture.periodId && entry.transactionType === 'CARRY_FORWARD' && Number(entry.leaveDays) === -2)
    && entries.some(entry => String(entry.periodId) === fixture.periodId && entry.transactionType === 'EXPIRY' && Number(entry.leaveDays) === -2));
  const credit = entries.find(entry => String(entry.periodId) === fixture.nextPeriod && entry.transactionType === 'CARRY_FORWARD');
  check('new_period_credit_and_thirty_day_expiry', !!credit && Number(credit.leaveDays) === 2 && Number(credit.runningBalance) === 2 && credit.fromDate === '2007-04-01' && credit.toDate === '2007-04-30');
  const carriedDigest = hash(JSON.stringify(entries));
  await trigger(1451, 0, 'carry-repeat');
  check('repeat_carry_preserves_chain', carriedDigest === hash(JSON.stringify(await verifyBalances('carry_repeat'))));
  evidence.carry = true;
  await trigger(1452, 1, 'expiry');
  entries = await verifyBalances('expired');
  const debit = entries.find(entry => String(entry.periodId) === fixture.nextPeriod && entry.transactionType === 'EXPIRY');
  check('expiry_links_original_credit', !!debit && Number(debit.leaveDays) === -2 && Number(debit.runningBalance) === 0 && debit.sourceBizType === 'LEAVE_LEDGER' && String(debit.sourceBizId) === String(credit.ledgerId));
  const expiredDigest = hash(JSON.stringify(entries));
  await trigger(1452, 0, 'expiry-repeat');
  check('repeat_expiry_preserves_chain', expiredDigest === hash(JSON.stringify(await verifyBalances('expiry_repeat'))));
  evidence.expiry = true;
  } else {
    entries = await verifyBalances('completed_chain_review');
    check('completed_review_preserves_original_eight_entries', JSON.stringify(entries) === JSON.stringify(resumeChain));
    const restoredConfig = await ok('admin', '/auth/system/config/' + fixture.originalConfig.configId);
    check('completed_review_keeps_original_workflow_configuration', restoredConfig.configValue === fixture.originalConfig.configValue);
    const approved = requestRow(fixture.requests[0]);
    check('completed_chain_retains_actual_approved_request', approved.status === 'APPROVED' && approved.employeeId === employeeId && Number(approved.duration) === 1 && approved.instanceId === fixture.instances[0]);
    const process = rows('SELECT JSON_OBJECT(\'definitionId\',definition_id,\'startUserId\',CAST(start_user_id AS CHAR)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(approved.instanceId))[0];
    check('completed_chain_retains_original_workflow_identity', process.definitionId === fixture.definitionId && process.startUserId === sessions.employee.identity.userId);
    check('completed_chain_has_no_pending_tasks', database("SELECT COUNT(*) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(approved.instanceId) + " AND status='TODO'") === '0');
    for (const [index, execution] of fixture.executions.entries()) {
      const recorded = rows("SELECT JSON_OBJECT('status',execute_status,'actor',trigger_by,'affected',affected_rows,'reported',report_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + id(execution.jobId) + ' AND execute_no=' + sql(execution.executeNo))[0];
      check('completed_chain_job_report_' + execution.label, recorded?.status === 'SUCCESS' && recorded.actor === 'g_import_admin' && recorded.reported && Number(recorded.affected) === [1,0,1,0][index]);
    }
    check('completed_chain_has_same_period_four_required_types', ['ALLOCATION','APPLICATION','CARRY_FORWARD','EXPIRY'].every(kind => entries.some(entry => String(entry.periodId) === fixture.periodId && entry.transactionType === kind)));
    const credit = entries.find(entry => String(entry.periodId) === fixture.nextPeriod && entry.transactionType === 'CARRY_FORWARD');
    const debit = entries.find(entry => String(entry.periodId) === fixture.nextPeriod && entry.transactionType === 'EXPIRY');
    check('completed_chain_transfer_and_expiry_link', Number(credit?.leaveDays) === 2 && credit.fromDate === '2007-04-01' && credit.toDate === '2007-04-30'
      && Number(debit?.leaveDays) === -2 && debit.sourceBizType === 'LEAVE_LEDGER' && String(debit.sourceBizId) === String(credit.ledgerId));
    evidence.allocation = true; evidence.approval = true; evidence.carry = true; evidence.expiry = true;
  }
  check('one_employee_one_type_two_periods_eight_entries', entries.length === 8 && new Set(entries.map(entry => String(entry.periodId))).size === 2);
  check('first_period_closed', database('SELECT status FROM hr_leave_period WHERE tenant_id=100000 AND period_id=' + fixture.periodId) === 'CLOSED');
  const final = await ok('employee', ess + '/quotas');
  check('both_periods_end_with_zero_available_and_five_days_consumed', final.length === 2 && final.every(value => Number(value.availableQuota) === 0 && Number(value.frozenQuota) === 0)
    && final.reduce((total, value) => total + Number(value.usedQuota), 0) === 5);
  check('consumption_separates_actual_leave_and_expiry', entries.filter(entry => entry.transactionType === 'APPLICATION').reduce((sum, entry) => sum + Number(entry.leaveDays), 0) === -1
    && entries.filter(entry => entry.transactionType === 'EXPIRY').reduce((sum, entry) => sum + Number(entry.leaveDays), 0) === -4);
  evidence.chain = true;
  fs.writeFileSync(path.join(output, 'chain.json'), JSON.stringify(entries, null, 2));
  await verifyPage(entries); evidence.page = true;
  check('browser_has_no_unhandled_errors', browserErrors.length === 0);
  console.log('D1_CHAIN_COMPLETE: employee_count=1; type_count=1; periods=2; ledger_rows=8; allocated=5; approved=1; carried=2; expired=4; final_available=0');
} catch (error) { failure = error; }

finally {
  const restorationErrors = [];
  const restore = async (label, action) => { try { await action(); fixture.restorations[label] = true; } catch { restorationErrors.push(label); fixture.restorations[label] = false; } save(); };
  await restore('calendar', async () => {
    if (calendarId && !calendarEnabled) { const current = await ok('admin', holiday + '/calendar/' + calendarId); await ok('admin', holiday + '/calendar', 'PUT', { ...current, status: 'ENABLED' }); calendarEnabled = true; }
  });
  await restore('pendingRequests', async () => {
    for (const requestId of fixture.requests) {
      let row = requestRow(requestId);
      if (['PENDING','SUBMITTED','APPROVING','APPLYING'].includes(row.status)) { await ok('admin', `/hr/attendance/time-requests/${requestId}/cancel`, 'POST'); row = requestRow(requestId); }
      if (row.status === 'CANCELLED' && row.instanceId) {
        await until(() => database(`SELECT COUNT(*) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sql(row.instanceId)} AND status='TODO'`), value => value === '0', 'Original cancelled workflow tasks');
      }
    }
  });
  await restore('workflowConfiguration', async () => {
    if (originalConfig && fixture.configurationChanged) {
      const current = await ok('admin', '/auth/system/config/' + originalConfig.configId);
      check('temporary_workflow_configuration_has_not_been_replaced', current.configValue === marker || current.configValue === originalConfig.configValue);
      await ok('admin', '/auth/system/config', 'PUT', originalConfig);
      const restored = await ok('admin', '/auth/system/config/' + originalConfig.configId);
      check('workflow_configuration_restored_field_by_field', Object.keys(originalConfig).every(key => String(restored[key] ?? '') === String(originalConfig[key] ?? '')));
      check('original_workflow_model_unchanged', database(`SELECT SHA2(model_json,256) FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=${sql(fixture.originalDefinition.id)}`) === fixture.originalDefinition.digest);
    }
  });
  await restore('accountBinding', async () => {
    if (employeeId && employeeBound) {
      check('owned_employee_binding_still_matches_before_detach', database(`SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId} AND employee_no=${sql(marker)}`) === sessions.employee.identity.userId);
      await ok('admin', '/hr/employees/' + employeeId, 'PUT', { ...employeeBody, userId: null });
      check('original_unbound_account_state_restored', database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${id(sessions.employee.identity.userId)} AND deleted=0`) === '0');
    }
  });
  if (fixture.defaultCalendarBefore) await restore('tenantDefault', async () => check('tenant_default_calendar_never_changed', fixture.defaultCalendarBefore === database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND deleted=0 ORDER BY calendar_id')));
  if (fixture.quotaRuleDigest) await restore('quotaRule', async () => check('original_quota_rule_unchanged', fixture.quotaRuleDigest === hash(JSON.stringify(await ok('admin', '/auth/system/rules/effective/hr.leave.quota.limit')))));
  evidence.restoration = restorationErrors.length === 0; if (restorationErrors.length) failure ||= Error('Restoration incomplete: ' + restorationErrors.join(','));
  try {
    check('original_business_and_job_rows_preserved', !!originalDigest && originalDigest === preservedSnapshot());
    if (resumeCompleted) check('completed_review_has_no_application_or_job_mutation', requests.every(request => request.method === 'GET' || request.method === 'PUT' && request.path === '/hr/employees/' + employeeId));
    evidence.preservation = true;
  } catch (error) { failure ||= error; }
  try { const scan = await runtime.scan(); evidence.secrets = true; console.log('D1_CHAIN_LOG_SCAN: ' + JSON.stringify(scan)); } catch (error) { failure ||= error; }
  await runtime.close();
  const message = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safeMessage = message && [...sensitive].every(value => !message.includes(value)) ? message : failure ? 'D1 chain failed; inspect bounded evidence' : undefined;
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2)); save();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ marker, passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length, browserErrors: browserErrors.length, failure: safeMessage }, null, 2));
  console.log(`D1_CHAIN_SUMMARY: passed=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; restoration=${evidence.restoration}; browser_errors=${browserErrors.length}`);
  if (failure) { console.log('D1_CHAIN_FAILURE: ' + safeMessage); process.exitCode = 1; }
}
