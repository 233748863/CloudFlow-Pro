import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = 'D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d3-batch-lifecycle'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d3-batch-lifecycle-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const sourceRound = process.argv[process.argv.indexOf('--source-scale-round') + 1];
assert.ok(process.argv.includes('--source-scale-round'));
assert.match(sourceRound || '', /^r[1-9][0-9]*$/);
const priorFolder = path.join(path.dirname(output), 'd3-batch-scale-20261006-' + sourceRound);
const prior = read(path.join(priorFolder, 'fixture.json'));
const priorResult = read(path.join(priorFolder, 'result.json'));
for (const flag of ['passed', 'selection', 'scale', 'cancellation', 'preservation', 'restoration', 'secrets']) assert.equal(priorResult[flag], true);
assert.match(prior.marker, /^D3S-[a-f0-9]{12}$/);
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const hash = value => createHash('sha256').update(value).digest('hex');
const literal = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
const fixture = { marker: 'D3L-' + randomUUID().replaceAll('-', '').slice(0, 12), source: path.basename(priorFolder),
  periodId: id(prior.periodId), slabId: id(prior.slabId), month: prior.month, batches: [], tasks: [], races: [], restorations: {}, screenshots: [] };
const save = () => fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify(fixture, null, 2));
save();
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, requests, database, browserErrors, sensitive } = runtime;
const origin = new URL(runtime.sessions.admin.page.url()).origin;
const page = await runtime.sessions.admin.context.newPage();
page.on('pageerror', () => browserErrors.push('lifecycle-ui'));
page.setDefaultTimeout(30000);
const pay = '/hr/compensation/payroll';
const evidence = { duplicate: false, competing: false, attendance: false, immutable: false, closed: false, preservation: false, restoration: false, secrets: false };
const tables = [['hr_employee', 'id'], ['hr_employee_comp', 'id'], ['hr_comp_component', 'id'], ['hr_comp_structure', 'id'],
  ['hr_comp_change', 'id'], ['hr_tax_profile', 'id'], ['hr_tax_deduction', 'id'], ['hr_tax_slab', 'slab_id'], ['hr_tax_slab_detail', 'slab_detail_id'],
  ['hr_payroll_period', 'period_id'], ['hr_payroll_batch', 'batch_id'], ['hr_payroll_batch_employee', 'batch_employee_id'], ['hr_salary_slip', 'id'],
  ['sys_dept', 'dept_id'], ['sys_holiday_calendar', 'calendar_id']];
const bounds = Object.fromEntries(tables.map(([table, key]) => [table, database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`)]));
const excluded = { hr_tax_slab: fixture.slabId, hr_payroll_period: fixture.periodId };
const preserved = () => Object.fromEntries(tables.map(([table, key]) => [table,
  hash(database(`SELECT * FROM ${table} WHERE ${key}<=${bounds[table]}${excluded[table] ? ` AND ${key}<>${excluded[table]}` : ''} ORDER BY ${key}`))]));
const roles = () => hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')
  + database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
const protectedRows = () => Object.fromEntries(Object.entries(excluded).map(([table, selected]) => {
  const columns = database(`SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND COLUMN_NAME NOT IN ('status','version','update_by','update_time') ORDER BY ORDINAL_POSITION`).split(/\r?\n/);
  assert.ok(columns.every(column => /^[a-z_]+$/.test(column)));
  const key = tables.find(entry => entry[0] === table)[1];
  return [table, hash(database(`SELECT ${columns.map(column => '`' + column + '`').join(',')} FROM ${table} WHERE ${key}=${selected}`))];
}));
fixture.originalBounds = bounds; fixture.originalDigest = preserved(); fixture.originalRoles = roles(); fixture.protectedRows = protectedRows(); save();
const writeTimes = new Map();
const configured = Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.common.repeatSubmit.intervalMillis'"));
assert.ok(Number.isSafeInteger(configured) && configured >= 0 && configured <= 60000);
const interval = Math.max(5000, configured) + 150;
const requestKey = (url, method, body) => hash(JSON.stringify([url, method, body ?? null]));
async function api(url, method = 'GET', body, raw = false) {
  const key = requestKey(url, method, body);
  if (!raw && method !== 'GET') {
    const wait = (writeTimes.get(key) || 0) + interval - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  }
  try { return await runtime.api('admin', url, { method, body }); }
  finally { if (method !== 'GET') writeTimes.set(key, Date.now()); }
}
const successful = response => response.status === 200 && response.body?.code === 200;
const ok = async (url, method = 'GET', body) => runtime.success(await api(url, method, body), `${method}_${url.split('?')[0]}`);
async function denied(url, method, body, code) {
  const response = await api(url, method, body);
  check('denied_' + code + '_' + method + '_' + url.split('?')[0], response.status === 400 && response.body?.code === code);
}
const selection = (employees, attendance = 0) => ({ payrollPeriodId: fixture.periodId, employeeIds: employees.map(value => id(value.id)),
  deptIds: [], positionIds: [], jobLevelIds: [], employeeType: '', validateAttendanceFlag: attendance, deductUnverifiedFlag: 0, postingDate: prior.periodEnd });
async function create(label, selected) {
  const batch = { label, id: id(await ok(pay + '/batches', 'POST', selected)), selected }; fixture.batches.push(batch); save();
  const detail = await ok(pay + '/batches/' + batch.id); batch.no = detail.batch.batchNo; save(); return batch;
}
const detail = batch => ok(pay + '/batches/' + batch.id);
const slips = batch => database(`SELECT * FROM hr_salary_slip WHERE batch_id=${batch.id} ORDER BY id`);
function taskFrom(batch, response) {
  if (!successful(response)) return null;
  const executeNo = response.body.data; assert.equal(typeof executeNo, 'string'); assert.ok(executeNo.length > 0);
  const task = { batchId: batch.id, executeNo }; fixture.tasks.push(task); save(); return task;
}
async function observe(task) {
  if (task.terminal) return;
  for (let attempt = 0; ; attempt++) {
    const state = await ok(pay + '/tasks/' + encodeURIComponent(task.executeNo));
    if (['SUCCESS', 'FAILED', 'TIMEOUT'].includes(state.executeStatus)) {
      task.terminal = state.executeStatus; task.affectedRows = Number(state.affectedRows); save(); return;
    }
    if (attempt > 0 && attempt % 30 === 0) console.log('D3_LIFECYCLE_PHASE: observing_original_task=' + task.executeNo);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
async function start(batch) {
  const response = await api(pay + '/batches/' + batch.id + '/calculate', 'POST', {});
  const task = taskFrom(batch, response); check('calculation_request_accepted_' + batch.label, Boolean(task));
  await observe(task); check('original_task_completed_' + batch.label, task.terminal === 'SUCCESS'); return task;
}
async function cancel(batch) {
  await ok(pay + '/batches/' + batch.id + '/cancel', 'POST', {});
  check('cancelled_owned_' + batch.label, (await detail(batch)).batch.status === 'CANCELLED'
    && database(`SELECT COUNT(*) FROM hr_salary_slip WHERE batch_id=${batch.id} AND deleted=0`) === '0');
  fixture.restorations[batch.id] = true; save();
}
function verifyMoney(slip) {
  check('one_salary_exact_amounts', String(slip.grossTotal) === '15000.01' && Number(slip.taxAmount) === 1500 && String(slip.netTotal) === '13500.01');
  check('one_cumulative_tax_snapshot', slip.components.filter(value => value.type === 'TAX_SNAPSHOT').length === 1 && Number(slip.cumulativeTaxPaid) === 0);
}
async function screenshot(name) { await page.screenshot({ path: path.join(output, name), fullPage: false }); fixture.screenshots.push(name); save(); }
let failure, slabBody, ownedVerified = false;
try {
  check('source_has_501_employees_and_original_500_slips', prior.employees.length === 501 && prior.slipIds.length === 500);
  check('all_reused_employees_owned_unlinked', database(`SELECT COUNT(*) FROM hr_employee WHERE id IN (${prior.employees.map(value => id(value.id)).join(',')}) AND employee_no LIKE ${literal(prior.marker + '-%')} AND user_id IS NULL AND deleted=0`) === '501');
  const period = (await ok(pay + '/config/periods')).find(value => String(value.periodId) === fixture.periodId);
  check('reused_period_open_owned_dates_match', period?.periodName === prior.marker && period.status === 'OPEN' && period.startDate === fixture.month + '-01' && period.endDate === prior.periodEnd);
  check('original_500_batch_remains_cancelled', database(`SELECT COUNT(*) FROM hr_payroll_batch WHERE batch_id=${id(prior.batches[0].id)} AND batch_no=${literal(prior.batches[0].no)} AND status='CANCELLED'`) === '1');
  check('original_500_cancelled_slips_retained', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE id IN (${prior.slipIds.map(id).join(',')}) AND deleted=1`) === '500');
  slabBody = (await ok(pay + '/config/tax-slabs')).find(value => String(value.slabId) === fixture.slabId);
  check('reused_synthetic_tax_owned_inactive', slabBody?.slabName.startsWith(prior.marker + '-') && slabBody.status === 'INACTIVE');
  const selected = prior.employees.filter(value => String(value.deptId) === String(prior.departments[0])).slice(0, 3);
  check('three_selected_employees_in_owned_department', selected.length === 3 && database(`SELECT COUNT(*) FROM hr_employee WHERE id IN (${selected.map(value => id(value.id)).join(',')}) AND dept_id=${id(prior.departments[0])}`) === '3');
  fixture.selectedEmployees = selected; save(); ownedVerified = true;
  await ok(pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'ACTIVE' });

  const duplicate = await create('duplicate', selection(selected.slice(0, 2)));
  const duplicateResponses = await Promise.all([0, 1].map(() => api(pay + '/batches/' + duplicate.id + '/calculate', 'POST', {}, true)));
  const duplicateTasks = duplicateResponses.map(response => taskFrom(duplicate, response)).filter(Boolean);
  fixture.races.push({ kind: 'same_batch', outcomes: duplicateResponses.map(response => ({ status: response.status, code: response.body?.code })) }); save();
  for (const task of duplicateTasks) await observe(task);
  check('same_batch_one_actual_execution', duplicateTasks.length === 1 && duplicateTasks[0].terminal === 'SUCCESS' && duplicateTasks[0].affectedRows === 2);
  const rejectedDuplicate = duplicateResponses.find(response => !successful(response));
  check('same_batch_duplicate_rejected', Boolean(rejectedDuplicate) && (rejectedDuplicate.body?.code === 409
    || rejectedDuplicate.status === 400 && rejectedDuplicate.body?.code === 'INVALID_PAYROLL_STATE'));
  const duplicateDetail = await detail(duplicate);
  check('same_batch_exactly_two_successful_slips', duplicateDetail.employees.length === 2 && duplicateDetail.employees.every(value => value.calcStatus === 'SUCCESS')
    && database(`SELECT COUNT(*) FROM hr_salary_slip WHERE batch_id=${duplicate.id} AND deleted=0`) === '2');
  for (const employee of duplicateDetail.employees) verifyMoney(await ok(pay + '/slips/' + id(employee.salarySlipId)));
  const duplicateDigest = hash(slips(duplicate));
  await denied(pay + '/batches/' + duplicate.id + '/calculate', 'POST', {}, 'INVALID_PAYROLL_STATE');
  await denied(pay + '/batches/' + duplicate.id + '/retry', 'POST', {}, 'NO_FAILED_EMPLOYEES');
  check('later_duplicate_preserves_complete_salary_rows', hash(slips(duplicate)) === duplicateDigest);
  await cancel(duplicate); evidence.duplicate = true;
  console.log('D3_LIFECYCLE_PHASE: same_batch_duplicate=passed');

  const left = await create('race_left', selection([selected[0]]));
  const right = await create('race_right', selection([selected[0]]));
  const competingResponses = await Promise.all([left, right].map(batch => api(pay + '/batches/' + batch.id + '/calculate', 'POST', {}, true)));
  const competingTasks = competingResponses.map((response, index) => taskFrom([left, right][index], response)).filter(Boolean);
  fixture.races.push({ kind: 'two_batches', outcomes: competingResponses.map(response => ({ status: response.status, code: response.body?.code })) }); save();
  for (const task of competingTasks) await observe(task);
  check('both_competing_requests_reach_background', competingTasks.length === 2 && competingTasks.every(task => task.terminal === 'SUCCESS'));
  const competingDetails = await Promise.all([detail(left), detail(right)]);
  const winnerIndex = competingDetails.findIndex(value => value.employees[0]?.calcStatus === 'SUCCESS');
  check('exactly_one_competing_employee_success', competingDetails.filter(value => value.employees[0]?.calcStatus === 'SUCCESS').length === 1);
  const winner = [left, right][winnerIndex], loser = [left, right][1 - winnerIndex];
  const won = competingDetails[winnerIndex], lost = competingDetails[1 - winnerIndex];
  check('loser_reports_existing_salary_without_any_amount', lost.batch.status === 'CALCULATED' && lost.employees[0].calcStatus === 'FAILED'
    && lost.employees[0].errorMessage === 'PAYROLL_ALREADY_CALCULATED' && !lost.employees[0].salarySlipId && Number(lost.batch.totalGross) === 0 && Number(lost.batch.totalTax) === 0 && Number(lost.batch.totalNet) === 0);
  check('two_batches_only_one_live_salary', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE batch_id IN (${left.id},${right.id}) AND deleted=0`) === '1');
  check('task_counts_match_one_success_zero_failure', competingTasks.find(task => task.batchId === winner.id).affectedRows === 1 && competingTasks.find(task => task.batchId === loser.id).affectedRows === 0);
  const slipId = id(won.employees[0].salarySlipId); fixture.winner = { batchId: winner.id, slipId }; save();
  verifyMoney(await ok(pay + '/slips/' + slipId));
  const winnerDigest = hash(slips(winner));
  await denied(pay + '/batches/' + loser.id + '/submit', 'POST', {}, 'PAYROLL_ERRORS_REMAIN');
  await cancel(loser);
  check('loser_cancel_preserves_winner_entire_salary', hash(slips(winner)) === winnerDigest); evidence.competing = true;
  console.log('D3_LIFECYCLE_PHASE: competing_batches=passed');

  await ok(pay + '/batches/' + winner.id + '/submit', 'POST', {});
  const submitted = await ok(pay + '/slips/' + slipId);
  check('submitted_salary_sealed', submitted.status === 'SUBMITTED' && typeof submitted.digestSha256 === 'string' && submitted.digestSha256.length === 64);
  const submittedDigest = hash(slips(winner));
  for (const action of ['calculate', 'retry', 'cancel']) await denied(pay + '/batches/' + winner.id + '/' + action, 'POST', {}, 'INVALID_PAYROLL_STATE');
  await denied(pay + '/batches/' + winner.id + '/employees', 'PUT', selection([selected[1]]), 'INVALID_PAYROLL_STATE');
  for (const prefix of [pay + '/slips/', '/hr/ess/salary-slips/']) {
    const response = await api(prefix + slipId, 'PUT', { grossTotal: '1.00', taxAmount: '0.00', netTotal: '1.00' });
    check('direct_salary_update_method_rejected_' + prefix, response.status === 405 || response.status === 404);
  }
  const legacy = await ok('/hr/ess/salary-slips/generate?periodMonth=' + fixture.month + '&employeeId=' + id(selected[0].id), 'POST');
  check('existing_submitted_salary_generation_skipped', Number(legacy.createdCount ?? legacy.created) === 0);
  check('submitted_all_fields_remain_unchanged', hash(slips(winner)) === submittedDigest);
  await denied(pay + '/periods/' + fixture.periodId + '/close', 'POST', {}, 'PAYROLL_BATCH_PENDING');
  await ok(pay + '/batches/' + winner.id + '/pay', 'POST', {});
  check('owned_salary_paid', (await ok(pay + '/slips/' + slipId)).status === 'PAID');
  fixture.restorations[winner.id] = true; fixture.paidDigest = hash(slips(winner)); save(); evidence.immutable = true;

  const skipped = await create('attendance_enabled', selection([selected[1]], 1));
  let attendance = await detail(skipped);
  check('missing_attendance_precheck_skipped_with_reason', attendance.employees[0].calcStatus === 'SKIPPED' && attendance.employees[0].errorMessage.includes(fixture.month + '考勤未封账'));
  const skippedTask = await start(skipped); attendance = await detail(skipped);
  check('all_skipped_batch_completes_without_salary', skippedTask.affectedRows === 0 && attendance.batch.status === 'CALCULATED'
    && attendance.employees[0].calcStatus === 'SKIPPED' && Number(attendance.processed) === 1 && slips(skipped) === '');
  await page.goto(new URL('/hr/payroll', origin).href, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '薪资批次与累计个税', exact: true }).waitFor();
  const row = page.locator('table tbody tr').filter({ hasText: skipped.no });
  await row.getByRole('button', { name: '员工清单与进度', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: skipped.no });
  await dialog.getByText(fixture.month + '考勤未封账', { exact: true }).waitFor();
  check('attendance_page_shows_employee_and_reason', (await dialog.innerText()).includes(selected[1].name) && (await dialog.innerText()).includes('跳过'));
  await dialog.getByRole('button', { name: '刷新进度', exact: true }).click();
  await screenshot('attendance-skipped.png');
  await denied(pay + '/batches/' + skipped.id + '/submit', 'POST', {}, 'PAYROLL_ERRORS_REMAIN');
  await denied(pay + '/batches/' + skipped.id + '/retry', 'POST', {}, 'NO_FAILED_EMPLOYEES');
  await cancel(skipped);
  const unchecked = await create('attendance_disabled', selection([selected[1]], 0));
  check('same_employee_pending_when_attendance_check_disabled', (await detail(unchecked)).employees[0].calcStatus === 'PENDING');
  check('attendance_disabled_calculation_succeeds', (await start(unchecked)).affectedRows === 1);
  verifyMoney(await ok(pay + '/slips/' + id((await detail(unchecked)).employees[0].salarySlipId)));
  await cancel(unchecked); evidence.attendance = true;
  console.log('D3_LIFECYCLE_PHASE: immutable_and_attendance=passed');

  // Either permitted serialization is acceptable; a closed period with a live draft is never acceptable.
  const raceSelection = selection([selected[2]]);
  const closeUrl = pay + '/periods/' + fixture.periodId + '/close';
  await new Promise(resolve => setTimeout(resolve, interval));
  const closeRace = await Promise.all([api(pay + '/batches', 'POST', raceSelection, true), api(closeUrl, 'POST', {}, true)]);
  let raceBatch;
  if (successful(closeRace[0])) { raceBatch = { label: 'close_race', id: id(closeRace[0].body.data), selected: raceSelection }; fixture.batches.push(raceBatch); }
  fixture.races.push({ kind: 'create_and_close', outcomes: closeRace.map(response => ({ status: response.status, code: response.body?.code })) }); save();
  check('create_close_race_exactly_one_wins', closeRace.filter(successful).length === 1);
  if (raceBatch) {
    check('create_wins_close_rejects_pending', closeRace[1].status === 400 && closeRace[1].body?.code === 'PAYROLL_BATCH_PENDING');
    await cancel(raceBatch); await ok(closeUrl, 'POST', {});
  } else check('close_wins_create_rejects_closed', closeRace[0].status === 400 && closeRace[0].body?.code === 'PAYROLL_PERIOD_CLOSED');
  check('owned_period_closed', database(`SELECT status FROM hr_payroll_period WHERE period_id=${fixture.periodId}`) === 'CLOSED');
  const closedDigest = hash(database(`SELECT * FROM hr_payroll_period WHERE period_id=${fixture.periodId}`));
  await denied(pay + '/batches', 'POST', raceSelection, 'PAYROLL_PERIOD_CLOSED');
  await denied(pay + '/batches/preview', 'POST', raceSelection, 'PAYROLL_PERIOD_CLOSED');
  await denied(pay + '/periods/' + fixture.periodId, 'PUT', { ...period, periodName: fixture.marker }, 'PAYROLL_PERIOD_CLOSED');
  await denied(pay + '/batches/' + winner.id + '/employees', 'PUT', raceSelection, 'PAYROLL_PERIOD_CLOSED');
  for (const action of ['calculate', 'retry', 'submit', 'pay', 'cancel']) await denied(pay + '/batches/' + winner.id + '/' + action, 'POST', {}, 'PAYROLL_PERIOD_CLOSED');
  await denied('/hr/ess/salary-slips/generate?periodMonth=' + fixture.month + '&employeeId=' + id(selected[2].id), 'POST', undefined, 'PAYROLL_PERIOD_CLOSED');
  await ok(closeUrl, 'POST', {});
  check('repeated_close_preserves_period_entire_row', hash(database(`SELECT * FROM hr_payroll_period WHERE period_id=${fixture.periodId}`)) === closedDigest);
  check('closed_period_salary_readable_and_unchanged', (await ok(pay + '/slips/' + slipId)).status === 'PAID' && hash(slips(winner)) === fixture.paidDigest);
  evidence.closed = true;
  console.log('D3_LIFECYCLE_PHASE: closed_period_all_selected_writes=passed');
} catch (error) { failure = error; try { await screenshot('failure.png'); } catch {} }
finally {
  for (const task of fixture.tasks) { try { await observe(task); } catch (error) { failure ||= error; } }
  for (const batch of fixture.batches) {
    try {
      const current = await detail(batch);
      if (current.batch.status === 'SUBMITTED') await ok(pay + '/batches/' + batch.id + '/pay', 'POST', {});
      else if (['DRAFT', 'CALCULATED', 'FAILED'].includes(current.batch.status)) await cancel(batch);
      const final = await detail(batch);
      fixture.restorations[batch.id] = ['PAID', 'CANCELLED'].includes(final.batch.status);
      check('owned_batch_terminal_' + batch.label, fixture.restorations[batch.id]);
    } catch (error) { fixture.restorations[batch.id] = false; failure ||= error; }
    save();
  }
  try {
    if (ownedVerified) {
      await ok(pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'INACTIVE' });
      check('reused_tax_table_restored_inactive', database(`SELECT status FROM hr_tax_slab WHERE slab_id=${fixture.slabId}`) === 'INACTIVE');
    }
    evidence.restoration = ownedVerified && Object.values(fixture.restorations).every(Boolean) && fixture.tasks.every(task => Boolean(task.terminal));
  } catch (error) { failure ||= error; }
  try {
    const after = preserved(), protectedAfter = protectedRows();
    for (const [table] of tables) check('historical_' + table + '_complete_rows_unchanged', after[table] === fixture.originalDigest[table]);
    for (const table of Object.keys(excluded)) check('reused_' + table + '_only_declared_status_audit_changes', protectedAfter[table] === fixture.protectedRows[table]);
    check('original_role_assignments_unchanged', roles() === fixture.originalRoles);
    check('no_browser_javascript_errors', browserErrors.length === 0); evidence.preservation = true;
  } catch (error) { failure ||= error; }
  try { console.log('D3_LIFECYCLE_LOG_SCAN: ' + JSON.stringify(await runtime.scan())); evidence.secrets = true; } catch (error) { failure ||= error; }
  await runtime.close(); save();
  const raw = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safe = raw && [...sensitive].every(value => !raw.includes(value)) ? raw : failure ? 'D3 lifecycle verification failed' : undefined;
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure && Object.values(evidence).every(Boolean), ...evidence,
    checks, requests: requests.length, tasks: fixture.tasks.length, syntheticPolicy: true, officialTaxPolicyVerified: false, all18Complete: false, globalComplete: false, failure: safe }, null, 2));
  console.log(`D3_LIFECYCLE_SUMMARY: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; tasks=${fixture.tasks.length}; preservation=${evidence.preservation}; restoration=${evidence.restoration}; all18_complete=false`);
  if (failure) { console.log('D3_LIFECYCLE_FAILURE: ' + safe); process.exitCode = 1; }
}
