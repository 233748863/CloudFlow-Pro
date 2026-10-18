import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = 'D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d3-batch-scale'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d3-batch-scale-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const fixture = { marker: 'D3S-' + randomUUID().replaceAll('-', '').slice(0, 12), employees: [], batches: [], tasks: [], screenshots: [], restorations: {}, syntheticPolicy: true };
const save = () => fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify(fixture, null, 2));
const hash = value => createHash('sha256').update(value).digest('hex');
const literal = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
const id = value => { const valid = String(value); assert.match(valid, /^[1-9]\d*$/); return valid; };
const sameIds = (left, right) => JSON.stringify((left || []).map(String).sort()) === JSON.stringify((right || []).map(String).sort());
const cents = value => {
  const matched = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value)); assert.ok(matched, 'Exact nonnegative cents required');
  return BigInt(matched[1]) * 100n + BigInt((matched[2] || '').padEnd(2, '0'));
};
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, requests, database, sensitive, browserErrors } = runtime;
// Preserve the signed API helper while the UI restores the same session using cookies.
const origin = new URL(runtime.sessions.admin.page.url()).origin;
const page = await runtime.sessions.admin.context.newPage();
page.on('pageerror', () => browserErrors.push('admin-ui'));
page.setDefaultTimeout(30000);
const pay = '/hr/compensation/payroll';
const evidence = { selection: false, selectionPage: false, scale: false, progressPage: false, cancellation: false, preservation: false, restoration: false, secrets: false };
let failure, slabBody, performanceMet = false;
const tables = [['hr_employee', 'id'], ['hr_employee_comp', 'id'], ['hr_comp_component', 'id'], ['hr_comp_structure', 'id'],
  ['hr_comp_change', 'id'], ['hr_tax_profile', 'id'], ['hr_tax_deduction', 'id'], ['hr_tax_slab', 'slab_id'],
  ['hr_tax_slab_detail', 'slab_detail_id'], ['hr_payroll_period', 'period_id'], ['hr_payroll_batch', 'batch_id'],
  ['hr_payroll_batch_employee', 'batch_employee_id'], ['hr_salary_slip', 'id'], ['sys_dept', 'dept_id'], ['sys_holiday_calendar', 'calendar_id']];
const bounds = Object.fromEntries(tables.map(([table, key]) => [table, database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`)]));
const preserved = () => Object.fromEntries(tables.map(([table, key]) => [table, hash(database(`SELECT * FROM ${table} WHERE ${key}<=${bounds[table]} ORDER BY ${key}`))]));
const roles = () => hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')
  + database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
fixture.originalBounds = bounds; save();
const writeTimes = new Map();
const configuredInterval = Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.common.repeatSubmit.intervalMillis'"));
assert.ok(Number.isSafeInteger(configuredInterval) && configuredInterval >= 0 && configuredInterval <= 60000);
const interval = Math.max(5000, configuredInterval) + 150;
async function api(actor, url, options = {}) {
  const method = options.method || 'GET';
  if (method === 'GET') return runtime.api(actor, url, options);
  const key = hash(JSON.stringify([actor, method, url, options.body ?? null]));
  const wait = (writeTimes.get(key) || 0) + interval - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  try { return await runtime.api(actor, url, options); }
  finally { writeTimes.set(key, Date.now()); }
}
const ok = async (actor, url, method = 'GET', body) => runtime.success(await api(actor, url, { method, body }), `${method}_${url.split('?')[0]}`);
async function until(probe, accept, label, milliseconds = 240000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const value = await probe(); if (accept(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw Error(label + ': observation expired; keep observing original operation without restart');
}
async function screenshot(name) { await page.screenshot({ path: path.join(output, name), fullPage: false }); fixture.screenshots.push(name); save(); }
async function observed(url, method, action) {
  // Attach a rejection handler immediately so page closure cannot hide the original action failure.
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api' + url && response.request().method() === method,
    { timeout: 90000 }).then(response => ({ response }), error => ({ error }));
  await action();
  const settled = await pending; if (settled.error) throw settled.error;
  const response = settled.response; const body = await response.json();
  requests.push({ actor: 'admin-page', path: url, method, status: response.status(), code: body?.code, traceId: response.headers()['x-trace-id'] });
  check('page_' + method + '_' + url, response.status() === 200 && body?.code === 200);
  return { data: body.data, request: response.request(), response };
}
async function employee(index, deptId) {
  const name = fixture.marker + '-' + String(index).padStart(3, '0');
  const employeeId = id(await ok('admin', '/hr/employees', 'POST', { employeeNo: name, name, gender: 'UNKNOWN', deptId,
    employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate: fixture.month + '-01' }));
  const item = { id: employeeId, name, deptId }; fixture.employees.push(item); save();
  await ok('admin', '/hr/compensation/employee-compensations', 'POST', { employeeId, structureId: fixture.structureId,
    componentValues: { [fixture.componentId]: '15000.01' }, totalSalary: '15000.01', effectiveDate: fixture.month + '-01', status: 'ACTIVE' });
  await ok('admin', '/hr/compensation/tax-profiles', 'POST', { employeeId, taxSlabId: fixture.slabId, taxResidenceCity: '隔离合成测试', status: 'ACTIVE' });
  item.configured = true; save(); return item;
}
async function loadPage(batch) {
  await observed(pay + '/batches', 'GET', () => page.goto(new URL('/hr/payroll', origin).href, { waitUntil: 'domcontentloaded' }));
  await page.getByRole('heading', { name: '薪资批次与累计个税', exact: true }).waitFor();
  const row = page.locator('table tbody tr').filter({ hasText: batch.no });
  await row.waitFor(); return row;
}
async function edit(batch) {
  const row = page.locator('table tbody tr').filter({ hasText: batch.no });
  await row.getByRole('button', { name: '调整员工清单', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '预检并保存员工清单', exact: true });
  await dialog.waitFor(); return dialog;
}
async function selector(dialog) {
  await dialog.getByRole('combobox', { name: '选择员工', exact: true }).click();
  const selected = page.getByRole('dialog', { name: '选择员工', exact: true });
  await selected.getByRole('searchbox').fill(fixture.marker);
  await selected.getByRole('option').first().waitFor(); return selected;
}
async function saveSelection(dialog, batch, wanted) {
  const preview = await observed(pay + '/batches/preview', 'POST', () => dialog.getByRole('button', { name: '预检员工清单', exact: true }).click());
  check('page_preview_exact_employee_ids', sameIds(preview.data.map(value => value.employeeId), wanted));
  const saved = await observed(pay + '/batches/' + batch.id + '/employees', 'PUT', () => dialog.getByRole('button', { name: '确认', exact: true }).click());
  check('page_save_submits_selected_ids', sameIds(saved.request.postDataJSON().employeeIds, wanted));
  await dialog.waitFor({ state: 'hidden' });
  const detail = await ok('admin', pay + '/batches/' + batch.id);
  check('actual_saved_employee_rows_match_page', sameIds(detail.employees.map(value => value.employeeId), wanted));
  return detail;
}
try {
  const priorFolder = path.join(path.dirname(output), 'd3-batch-scale-20261006-r1');
  if (path.basename(output) !== path.basename(priorFolder) && fs.existsSync(path.join(priorFolder, 'result.json'))) {
    const priorResult = JSON.parse(fs.readFileSync(path.join(priorFolder, 'result.json'), 'utf8'));
    const prior = JSON.parse(fs.readFileSync(path.join(priorFolder, 'fixture.json'), 'utf8'));
    check('r1_owned_failed_browser_round', !priorResult.passed && priorResult.preservation && priorResult.tasks === 0 && prior.employees.length === 4 && /^D3S-[a-f0-9]{12}$/.test(prior.marker));
    check('r1_employee_ownership_verified', database(`SELECT COUNT(*) FROM hr_employee WHERE id IN (${prior.employees.map(value => id(value.id)).join(',')}) AND employee_no LIKE ${literal(prior.marker + '-%')} AND user_id IS NULL`) === '4');
    fixture.r1Recovery = { marker: prior.marker, batches: [], taxInactive: false }; save();
    for (const priorBatch of prior.batches) {
      const detail = await ok('admin', pay + '/batches/' + id(priorBatch.id));
      check('r1_batch_owned_and_never_started', detail.batch.batchNo === priorBatch.no && ['DRAFT', 'CANCELLED'].includes(detail.batch.status)
        && detail.employees.every(value => prior.employees.some(employee => employee.id === String(value.employeeId))));
      if (detail.batch.status === 'DRAFT') await ok('admin', pay + '/batches/' + id(priorBatch.id) + '/cancel', 'POST', {});
      check('r1_batch_cancelled', (await ok('admin', pay + '/batches/' + id(priorBatch.id))).batch.status === 'CANCELLED');
      fixture.r1Recovery.batches.push(String(priorBatch.id)); save();
    }
    const priorSlab = (await ok('admin', pay + '/config/tax-slabs')).find(value => String(value.slabId) === id(prior.slabId));
    check('r1_synthetic_tax_table_owned', Boolean(priorSlab) && priorSlab.slabName.startsWith(prior.marker + '-'));
    if (priorSlab.status !== 'INACTIVE') await ok('admin', pay + '/tax-slabs/' + id(prior.slabId), 'PUT', { ...priorSlab, status: 'INACTIVE' });
    check('r1_synthetic_tax_table_inactive', database(`SELECT status FROM hr_tax_slab WHERE slab_id=${id(prior.slabId)}`) === 'INACTIVE');
    fixture.r1Recovery.taxInactive = true; save();
    console.log('D3_SCALE_PHASE: r1_owned_recovery=complete; original_evidence_retained=true');
  }
  fixture.originalDigest = preserved(); fixture.originalRoles = roles(); save();
  const periods = await ok('admin', pay + '/config/periods');
  fixture.month = Array.from({ length: 24 }, (_, index) => `${2041 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`)
    .find(month => !periods.some(period => period.startDate <= month + '-31' && period.endDate >= month + '-01'));
  check('unused_scale_period_available', Boolean(fixture.month));
  const [year, monthNo] = fixture.month.split('-').map(Number);
  fixture.periodEnd = fixture.month + '-' + new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  fixture.periodId = id(await ok('admin', pay + '/periods', 'POST', { periodName: fixture.marker, frequency: 'MONTHLY',
    startDate: fixture.month + '-01', endDate: fixture.periodEnd, payDate: fixture.periodEnd })); save();
  await ok('admin', '/auth/system/holiday/calendar', 'POST', { calendarCode: fixture.marker, calendarName: fixture.marker + '-合成日历', defaultFlag: 0,
    weeklyRestDays: '6,7', workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' });
  fixture.calendarId = id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=' + literal(fixture.marker))); save();
  fixture.departments = [];
  for (const suffix of ['target', 'outside']) {
    const name = fixture.marker + '-' + suffix;
    await ok('admin', '/auth/system/dept', 'POST', { deptName: name, parentId: 0, orderNum: 0, status: '0', holidayCalendarId: fixture.calendarId });
    fixture.departments.push(id(database('SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name=' + literal(name) + ' AND deleted=0'))); save();
  }
  fixture.componentId = id(await ok('admin', '/hr/compensation/components', 'POST', { componentCode: fixture.marker, componentName: fixture.marker + '-固定工资', componentType: 'FIXED', category: 'EARNING', taxable: 1, status: 1, sortOrder: 999 })); save();
  fixture.structureId = id(await ok('admin', '/hr/compensation/structures', 'POST', { structureCode: fixture.marker, structureName: fixture.marker, status: 1, componentConfig: {} })); save();
  await ok('admin', pay + '/structures/' + fixture.structureId, 'PUT', { salaryBasis: 'MONTHLY', prorationBasis: 'CALENDAR_DAYS', benefitTiming: 'FIRST_PAYROLL' });
  slabBody = { slabName: fixture.marker + '-合成规模测试税表', region: '隔离合成测试', effectiveFrom: fixture.month + '-01', effectiveTo: fixture.periodEnd,
    thresholdAmount: '0.00', status: 'DRAFT', remark: '仅合成机制与规模验收，不代表正式适用税率' };
  fixture.slabId = id(await ok('admin', pay + '/tax-slabs', 'POST', slabBody)); save();
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId + '/details', 'PUT', Array.from({ length: 7 }, (_, index) => ({ levelNo: index + 1,
    fromAmount: String(index * 10000), toAmount: index === 6 ? null : String((index + 1) * 10000), taxRate: '0.1000', quickDeduction: '0.00' })));
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'ACTIVE' });
  for (let index = 0; index < 3; index++) await employee(index, fixture.departments[0]);
  await employee(500, fixture.departments[1]);
  const initial = fixture.employees.filter(value => value.deptId === fixture.departments[0]);
  const selection = { payrollPeriodId: fixture.periodId, deptIds: [fixture.departments[0]], employeeIds: [], positionIds: [], jobLevelIds: [], employeeType: 'FULL_TIME', validateAttendanceFlag: 0, deductUnverifiedFlag: 0 };
  const initialPreview = await ok('admin', pay + '/batches/preview', 'POST', selection);
  check('department_preview_excludes_other_department', sameIds(initialPreview.map(value => value.employeeId), initial.map(value => value.id)) && initialPreview.every(value => value.calcStatus === 'PENDING'));
  const batch = { id: id(await ok('admin', pay + '/batches', 'POST', selection)) }; fixture.batches.push(batch); save();
  batch.no = (await ok('admin', pay + '/batches/' + batch.id)).batch.batchNo; save();
  await loadPage(batch);
  let dialog = await edit(batch); let selected = await selector(dialog);
  for (const item of initial.slice(0, 2)) await selected.getByRole('option').filter({ hasText: item.name }).click();
  await selected.getByRole('searchbox').press('Escape'); await selected.waitFor({ state: 'hidden' });
  const two = initial.slice(0, 2).map(value => value.id);
  const reduced = await saveSelection(dialog, batch, two);
  dialog = await edit(batch); selected = await selector(dialog);
  const visibleCount = await selected.getByRole('option', { selected: true }).count();
  fixture.selectionObservation = { wantedIds: two, actualRows: reduced.employees.map(value => String(value.employeeId)), persistedIds: reduced.batch.filterEmployeeIds || [], reopenedSelectedCount: visibleCount }; save();
  await screenshot('selection-reopened.png');
  check('saved_selection_metadata_matches_actual_rows', sameIds(reduced.batch.filterEmployeeIds, two));
  check('reopened_page_restores_both_selected_employees', visibleCount === 2);
  for (const item of initial.slice(0, 2)) check('reopened_selected_' + item.id, await selected.getByRole('option').filter({ hasText: item.name }).getAttribute('aria-selected') === 'true');
  await selected.getByRole('option').filter({ hasText: initial[2].name }).click();
  await selected.getByRole('searchbox').press('Escape'); await selected.waitFor({ state: 'hidden' });
  const restored = await saveSelection(dialog, batch, initial.map(value => value.id));
  check('added_employee_and_metadata_persist', sameIds(restored.batch.filterEmployeeIds, initial.map(value => value.id)) && sameIds(restored.batch.filterDeptIds, [fixture.departments[0]]));
  const outsideId = fixture.employees.find(value => value.deptId === fixture.departments[1]).id;
  await ok('admin', pay + '/batches/' + batch.id + '/employees', 'PUT', { ...selection, deptIds: [fixture.departments[1]], employeeIds: [outsideId] });
  const moved = await ok('admin', pay + '/batches/' + batch.id);
  check('changed_department_saved_with_matching_employee', sameIds(moved.batch.filterDeptIds, [fixture.departments[1]]) && sameIds(moved.employees.map(value => value.employeeId), [outsideId]));
  await ok('admin', pay + '/batches/' + batch.id + '/employees', 'PUT', { ...selection, deptIds: null, employeeIds: [outsideId], positionIds: null, jobLevelIds: null, employeeType: null });
  const cleared = await ok('admin', pay + '/batches/' + batch.id);
  check('null_optional_filters_clear_previous_values', cleared.batch.filterDeptIds.length === 0 && cleared.batch.filterPositionIds.length === 0 && cleared.batch.filterJobLevelIds.length === 0
    && cleared.batch.filterEmployeeType === '' && sameIds(cleared.batch.filterEmployeeIds, [outsideId]) && sameIds(cleared.employees.map(value => value.employeeId), [outsideId]));
  await ok('admin', pay + '/batches/' + batch.id + '/employees', 'PUT', { ...selection, deptIds: [fixture.departments[1]], employeeIds: null });
  const clearedEmployees = await ok('admin', pay + '/batches/' + batch.id);
  check('null_employee_filter_clears_previous_ids', clearedEmployees.batch.filterEmployeeIds.length === 0 && sameIds(clearedEmployees.employees.map(value => value.employeeId), [outsideId]));
  evidence.selection = true; evidence.selectionPage = true; save();
  console.log('D3_SCALE_PHASE: selection_page=passed; configured_employees=4');

  for (let index = 3; index < 500; index++) {
    await employee(index, fixture.departments[0]);
    if ((index + 1) % 25 === 0) console.log('D3_SCALE_PHASE: target_employees_configured=' + (index + 1));
  }
  const targetIds = fixture.employees.filter(value => value.deptId === fixture.departments[0]).map(value => value.id);
  check('five_hundred_target_employees_and_one_outside', targetIds.length === 500 && fixture.employees.length === 501);
  await ok('admin', pay + '/batches/' + batch.id + '/employees', 'PUT', selection);
  const expanded = await ok('admin', pay + '/batches/' + batch.id);
  check('saved_batch_exactly_five_hundred_selected_employees', expanded.batch.employeeCount === 500 && sameIds(expanded.employees.map(value => value.employeeId), targetIds)
    && expanded.employees.every(value => value.calcStatus === 'PENDING') && sameIds(expanded.batch.filterDeptIds, selection.deptIds) && (expanded.batch.filterEmployeeIds || []).length === 0);
  const row = await loadPage(batch);
  await row.getByRole('button', { name: '开始计算', exact: true }).click();
  const calculateDialog = page.getByRole('dialog', { name: '确认薪资操作', exact: true });
  await calculateDialog.getByRole('checkbox').check();
  const requestTimes = new WeakMap();
  page.on('request', request => { if (new URL(request.url()).pathname === '/api' + pay + '/batches/' + batch.id + '/calculate') requestTimes.set(request, performance.now()); });
  const began = performance.now();
  const started = await observed(pay + '/batches/' + batch.id + '/calculate', 'POST', () => calculateDialog.getByRole('button', { name: '确认', exact: true }).click());
  const responseMilliseconds = performance.now() - requestTimes.get(started.request);
  const executeNo = started.data; check('real_background_execution_number', typeof executeNo === 'string' && executeNo.length > 0);
  const task = { batchId: batch.id, executeNo, responseMilliseconds, observations: [] }; fixture.tasks.push(task); save();
  let done = false; let observedRunning = false;
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    const state = await ok('admin', pay + '/tasks/' + encodeURIComponent(executeNo));
    const detail = await ok('admin', pay + '/batches/' + batch.id);
    task.observations.push({ status: state.executeStatus, processed: detail.processed, batchStatus: detail.batch.status, elapsedMilliseconds: performance.now() - began }); save();
    if (state.executeStatus === 'RUNNING') {
      observedRunning = true;
      const status = page.getByRole('status').filter({ hasText: executeNo });
      await status.waitFor(); check('page_reports_original_running_task', (await status.innerText()).includes('执行中'));
      if (!fixture.screenshots.includes('scale-running.png')) await screenshot('scale-running.png');
    }
    if (['SUCCESS', 'FAILED', 'TIMEOUT'].includes(state.executeStatus)) {
      task.terminal = state.executeStatus; task.elapsedMilliseconds = performance.now() - began; task.affectedRows = state.affectedRows; save();
      check('original_five_hundred_task_completed_successfully', state.executeStatus === 'SUCCESS' && Number(state.affectedRows) === 500);
      check('all_five_hundred_rows_successful', detail.batch.status === 'CALCULATED' && Number(detail.processed) === 500 && sameIds(detail.employees.map(value => value.employeeId), targetIds)
        && detail.employees.every(value => value.calcStatus === 'SUCCESS' && !value.errorMessage));
      check('batch_total_gross_in_exact_cents', cents(detail.batch.totalGross) === 1500001n * 500n);
      check('batch_total_tax_in_exact_cents', cents(detail.batch.totalTax) === 150000n * 500n);
      check('batch_total_net_in_exact_cents', cents(detail.batch.totalNet) === 1350001n * 500n);
      fixture.slipIds = detail.employees.map(value => id(value.salarySlipId)); save();
      const taskText = page.getByRole('status').filter({ hasText: executeNo });
      await until(() => taskText.innerText(), value => value.includes('已完成') && value.includes('500'), 'Original page completion', 30000);
      await screenshot('scale-completed.png'); evidence.progressPage = true;
      done = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!done) throw Error('Original 500employee task still unconfirmed; retain task ID and keep observing, do not restart');
  check('request_returned_before_original_background_completion', observedRunning && Number.isFinite(responseMilliseconds) && responseMilliseconds < task.elapsedMilliseconds);
  performanceMet = task.elapsedMilliseconds < 180000;
  console.log(`D3_SCALE_PHASE: original_task=${task.terminal}; employees=500; response_ms=${responseMilliseconds.toFixed(2)}; elapsed_ms=${task.elapsedMilliseconds.toFixed(2)}; under180000ms=${performanceMet}`);
  for (const [index, slipId] of fixture.slipIds.entries()) {
    const slip = await ok('admin', pay + '/slips/' + slipId);
    check('slip_' + index + '_exact_employee_and_money', targetIds.includes(String(slip.employeeId)) && String(slip.batchId) === batch.id && cents(slip.grossTotal) === 1500001n
      && cents(slip.currentTax) === 150000n && cents(slip.netTotal) === 1350001n && slip.components.filter(value => value.type === 'TAX_SNAPSHOT').length === 1);
    if ((index + 1) % 100 === 0) console.log('D3_SCALE_PHASE: actual_slips_verified=' + (index + 1));
  }
  check('outside_department_has_no_generated_slip', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE employee_id=${fixture.employees.find(value => value.deptId === fixture.departments[1]).id}`) === '0');
  evidence.scale = true;
  await ok('admin', pay + '/batches/' + batch.id + '/cancel', 'POST', {});
  check('cancel_clears_all_five_hundred_owned_slips', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE batch_id=${batch.id} AND deleted=0`) === '0');
  evidence.cancellation = true;
} catch (error) { failure = error; try { await screenshot('failure.png'); } catch {} }
finally {
  for (const batch of fixture.batches) {
    try {
      const detail = await until(() => ok('admin', pay + '/batches/' + batch.id), value => value.batch.status !== 'CALCULATING', 'Cleanup original batch', 600000);
      if (['DRAFT', 'CALCULATED', 'FAILED'].includes(detail.batch.status)) await ok('admin', pay + '/batches/' + batch.id + '/cancel', 'POST', {});
      const final = await ok('admin', pay + '/batches/' + batch.id);
      fixture.restorations[batch.id] = final.batch.status === 'CANCELLED';
      check('owned_batch_cancelled_' + batch.id, fixture.restorations[batch.id]);
    } catch (error) { fixture.restorations[batch.id] = false; failure ||= error; }
    save();
  }
  try {
    if (fixture.slabId) {
      await ok('admin', pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'INACTIVE' });
      check('owned_synthetic_tax_table_inactive', database(`SELECT status FROM hr_tax_slab WHERE slab_id=${fixture.slabId}`) === 'INACTIVE');
    }
    evidence.restoration = Object.values(fixture.restorations).every(Boolean);
  } catch (error) { failure ||= error; }
  try {
    const after = preserved(); for (const [table] of tables) check('preexisting_' + table + '_unchanged', after[table] === fixture.originalDigest[table]);
    check('original_role_assignments_unchanged', roles() === fixture.originalRoles);
    check('test_employees_never_linked_to_accounts', fixture.employees.length === 0 || database(`SELECT COUNT(*) FROM hr_employee WHERE id IN (${fixture.employees.map(value => value.id).join(',')}) AND user_id IS NOT NULL`) === '0');
    check('browser_no_javascript_errors', browserErrors.length === 0); evidence.preservation = true;
  } catch (error) { failure ||= error; }
  try { const scan = await runtime.scan(); evidence.secrets = true; console.log('D3_SCALE_LOG_SCAN: ' + JSON.stringify(scan)); } catch (error) { failure ||= error; }
  await runtime.close(); save();
  const raw = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safe = raw && [...sensitive].every(value => !raw.includes(value)) ? raw : failure ? 'D3 batch scale verification failed' : undefined;
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks,
    requests: requests.length, employees: fixture.employees.length, tasks: fixture.tasks.length, performanceMet, syntheticPolicy: true,
    officialTaxPolicyVerified: false, all18Complete: false, globalComplete: false, failure: safe }, null, 2));
  console.log(`D3_SCALE_SUMMARY: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; employees=${fixture.employees.length}; tasks=${fixture.tasks.length}; preservation=${evidence.preservation}; restoration=${evidence.restoration}; performance=${performanceMet}; all18_complete=false`);
  if (failure) { console.log('D3_SCALE_FAILURE: ' + safe); process.exitCode = 1; }
}
