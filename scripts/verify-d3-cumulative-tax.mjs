import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = 'D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d3-cumulative-tax'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d3-cumulative-tax-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const marker = 'D3T-' + randomUUID().replaceAll('-', '').slice(0, 12);
const fixture = { marker, syntheticPolicy: true, employees: {}, periods: {}, batches: [], tasks: [], slips: [], restorations: {} };
const write = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2));
const save = () => write('fixture.json', fixture);
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const literal = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
const hash = value => createHash('sha256').update(value).digest('hex');
const cents = value => {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  assert.ok(match, 'Exact decimal cents required');
  return (match[1] ? -1n : 1n) * (BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0')));
};
const decimal = value => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;
const rates = [500n, 1000n, 1500n, 2000n, 2500n, 3000n, 3500n];
const quick = ['0.00', '500.00', '1500.00', '3000.00', '5000.00', '7500.00', '10500.00'];
// Independent oracle integrates each marginal band, then rounds once to cents.
// It does not use the product's taxable * rate - quick deduction implementation.
function payable(taxable, uplift = 0n) {
  let remaining = taxable > 0n ? taxable : 0n, numerator = 0n;
  for (let index = 0; index < rates.length && remaining > 0n; index++) {
    const portion = index === rates.length - 1 || remaining < 1000000n ? remaining : 1000000n;
    numerator += portion * (rates[index] + uplift); remaining -= portion;
  }
  return (numerator + 5000n) / 10000n;
}
function expected(gross, priorRaw = '0.00', priorDeduction = '0.00', priorTax = '0.00', special = '0.00', uplift = 0n) {
  const deduction = 300000n + cents(special);
  const raw = cents(gross) - deduction;
  const cumulative = cents(priorRaw) + raw;
  const total = payable(cumulative, uplift);
  const tax = total > cents(priorTax) ? total - cents(priorTax) : 0n;
  const bracket = Math.min(6, Number(((cumulative > 0n ? cumulative : 1n) - 1n) / 1000000n));
  return { gross, tax: decimal(tax), net: decimal(cents(gross) - tax), raw: decimal(raw),
    cumulative: decimal(cumulative > 0n ? cumulative : 0n), deduction: decimal(deduction),
    cumulativeDeduction: decimal(cents(priorDeduction) + deduction), payable: decimal(total), paid: priorTax,
    special, rate: `${(rates[bracket] + uplift) / 10000n}.${String((rates[bracket] + uplift) % 10000n).padStart(4, '0')}`,
    quick: quick[bracket], uplift: String(uplift) };
}
assert.equal(expected('15000.01').tax, '700.00');
assert.equal(expected('15000.01', '12000.01', '3000.00', '700.00').tax, '1400.00');
assert.equal(expected('15000.01', '24000.02', '6000.00', '2100.00').tax, '2100.01');
assert.equal(expected('7500.01').tax, '225.00');
assert.equal(expected('15000.01', '4500.01', '3000.00', '225.00').tax, '925.00');

const runtime = await createD1LeaveRuntime(root, output);
const { checks, check, requests, database, rows, sensitive, browserErrors } = runtime;
// Separate intentional business-state checks from the existing five-second
// duplicate-submit guard. Wait before a repeated write; never retry a mutation.
const configuredRepeatMillis = Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.common.repeatSubmit.intervalMillis'"));
assert.ok(Number.isSafeInteger(configuredRepeatMillis) && configuredRepeatMillis >= 0 && configuredRepeatMillis <= 60000);
const repeatMillis = Math.max(5000, configuredRepeatMillis) + 150;
const writeFinished = new Map();
fixture.requestPacing = { repeatMillis, waits: [] };
async function api(actor, url, options = {}) {
  const method = options.method || 'GET';
  if (method === 'GET') return runtime.api(actor, url, options);
  const key = hash(JSON.stringify([actor, method, url, options.body ?? null]));
  const wait = Math.max(0, (writeFinished.get(key) || 0) + repeatMillis - Date.now());
  if (wait) {
    fixture.requestPacing.waits.push({ method, url, milliseconds: wait }); save();
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  try { return await runtime.api(actor, url, options); }
  finally { writeFinished.set(key, Date.now()); }
}
const ok = async (actor, url, method = 'GET', body) => runtime.success(await api(actor, url, { method, body }), `${method}_${url.split('?')[0]}`);
const pay = '/hr/compensation/payroll';
const tables = [['hr_employee', 'id'], ['hr_employee_comp', 'id'], ['hr_comp_component', 'id'], ['hr_comp_structure', 'id'],
  ['hr_comp_change', 'id'], ['hr_tax_profile', 'id'], ['hr_tax_deduction', 'id'], ['hr_tax_slab', 'slab_id'],
  ['hr_tax_slab_detail', 'slab_detail_id'], ['hr_payroll_period', 'period_id'], ['hr_payroll_batch', 'batch_id'],
  ['hr_payroll_batch_employee', 'batch_employee_id'], ['hr_salary_slip', 'id'], ['sys_dept', 'dept_id'], ['sys_holiday_calendar', 'calendar_id']];
const bounds = Object.fromEntries(tables.map(([table, key]) => [table, database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`)]));
const preserved = () => Object.fromEntries(tables.map(([table, key]) => [table,
  hash(database(`SELECT * FROM ${table} WHERE ${key}<=${bounds[table]} ORDER BY ${key}`))]));
fixture.originalBounds = bounds; fixture.originalDigest = preserved();
const roleHash = () => hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')
  + database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
fixture.originalRoleHash = roleHash(); save();
const evidence = { cumulative: false, retry: false, yearReset: false, midHire: false, snapshot: false,
  taxTableReplacement: false, unverifiedDeduction: false, cancellation: false, preservation: false, restoration: false, secrets: false };
const rowsDigest = ids => hash(database(`SELECT * FROM hr_salary_slip WHERE id IN (${ids.map(id).join(',')}) ORDER BY id`));
const readSlip = slipId => ok('admin', pay + '/slips/' + id(slipId));
const expectations = new Map();
let failure, slabBody;
async function until(probe, accept, label, milliseconds = 180000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const value = await probe(); if (accept(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  throw Error(label + ': original operation observation deadline; retain original IDs');
}
async function denied(url, method, body, code) {
  const response = await api('admin', url, { method, body });
  check('denied_' + code, response.status === 400 && response.body?.code === code);
}
function verifySlip(slip, wanted, label, employeeId) {
  check(label + '_employee', String(slip.employeeId) === id(employeeId));
  const fields = { grossTotal: wanted.gross, currentTax: wanted.tax, taxAmount: wanted.tax, netTotal: wanted.net,
    cumulativeTaxableIncome: wanted.cumulative, cumulativeDeduction: wanted.cumulativeDeduction,
    cumulativeTaxPayable: wanted.payable, cumulativeTaxPaid: wanted.paid, benefitAmount: '0.00', deductionTotal: wanted.tax };
  for (const [field, value] of Object.entries(fields)) check(label + '_' + field, cents(slip[field]) === cents(value));
  const snapshots = slip.components.filter(value => value.type === 'TAX_SNAPSHOT');
  check(label + '_single_tax_snapshot', snapshots.length === 1);
  const snapshot = snapshots[0];
  check(label + '_current_taxable', cents(snapshot.currentTaxableIncome) === cents(wanted.raw));
  check(label + '_current_deduction', cents(snapshot.currentDeduction) === cents(wanted.deduction));
  check(label + '_threshold_once', cents(snapshot.thresholdApplied) === 300000n);
  check(label + '_selected_synthetic_rate', Number(snapshot.taxRate) === Number(wanted.rate) && cents(snapshot.quickDeduction) === cents(wanted.quick));
  check(label + '_all_seven_rate_snapshots', snapshot.brackets.length === 7 && snapshot.brackets.every((band, index) =>
    cents(band.from) === BigInt(index) * 1000000n && (index === 6 ? band.to === null : cents(band.to) === BigInt(index + 1) * 1000000n)
      && Number(band.rate) === Number(rates[index] + BigInt(wanted.uplift)) / 10000 && cents(band.quickDeduction) === cents(quick[index])));
  const special = Object.values(snapshot.specialDeductions).reduce((sum, value) => sum + cents(value), 0n);
  check(label + '_special_deduction', special === cents(wanted.special));
  check(label + '_real_fixed_component', slip.components.some(value => value.sourceType === 'EMPLOYEE_COMPENSATION'
    && String(value.salaryComponentId) === fixture.componentId && value.salaryComponentIdentity === 'VERIFIED'));
}
async function createBatch(label, month, employeeKeys, deductUnverified = 0) {
  const employeeIds = employeeKeys.map(key => fixture.employees[key]);
  const batchId = id(await ok('admin', pay + '/batches', 'POST', { payrollPeriodId: fixture.periods[month],
    employeeIds, validateAttendanceFlag: 0, deductUnverifiedFlag: deductUnverified }));
  const batch = { label, id: batchId, month, employeeIds, deductUnverified, tasks: [] };
  fixture.batches.push(batch); save(); return batch;
}
async function calculate(batch, count, retry = false) {
  const startedAt = Date.now();
  const executeNo = await ok('admin', `${pay}/batches/${batch.id}/${retry ? 'retry' : 'calculate'}`, 'POST', {});
  const requestMilliseconds = Date.now() - startedAt;
  check(batch.label + '_actual_async_number_' + retry, typeof executeNo === 'string' && executeNo.length > 0);
  batch.tasks.push(executeNo); fixture.tasks.push({ batchId: batch.id, executeNo, retry, requestMilliseconds }); save();
  const terminal = await until(() => ok('admin', pay + '/tasks/' + encodeURIComponent(executeNo)),
    value => ['SUCCESS', 'FAILED', 'TIMEOUT'].includes(value.executeStatus), batch.label + ' original task');
  check(batch.label + '_original_task_success_' + retry, terminal.executeStatus === 'SUCCESS' && Number(terminal.affectedRows) === count);
  const detail = await ok('admin', pay + '/batches/' + batch.id);
  check(batch.label + '_batch_calculated_' + retry, detail.batch.status === 'CALCULATED' && detail.employees.length === batch.employeeIds.length);
  batch.lastDetail = detail; save(); console.log('D3_TAX_PHASE: batch=' + batch.label + '; retry=' + retry + '; terminal=SUCCESS');
  return detail;
}
async function collect(batch, expectedByKey, label) {
  const detail = await ok('admin', pay + '/batches/' + batch.id);
  for (const [key, wanted] of Object.entries(expectedByKey)) {
    const employeeId = fixture.employees[key];
    const found = detail.employees.filter(value => String(value.employeeId) === employeeId);
    check(label + '_' + key + '_one_success', found.length === 1 && found[0].calcStatus === 'SUCCESS');
    const slipId = id(found[0].salarySlipId); const slip = await readSlip(slipId);
    verifySlip(slip, wanted, label + '_' + key, employeeId);
    expectations.set(slipId, { wanted, employeeId });
    if (!fixture.slips.some(value => value.id === slipId)) fixture.slips.push({ id: slipId, batchId: batch.id, employeeId, month: batch.month, wanted });
    save();
  }
}
async function submit(batch) {
  await ok('admin', pay + '/batches/' + batch.id + '/submit', 'POST', {});
  for (const entry of fixture.slips.filter(value => value.batchId === batch.id)) {
    const slip = await readSlip(entry.id);
    check(batch.label + '_submitted_' + entry.employeeId, slip.status === 'SUBMITTED');
    verifySlip(slip, entry.wanted, batch.label + '_submitted_' + entry.employeeId, entry.employeeId);
    check(batch.label + '_sealed_digest_' + entry.employeeId, /^[a-f0-9]{64}$/i.test(database(`SELECT digest_sha256 FROM hr_salary_slip WHERE id=${entry.id}`)));
  }
  batch.submitted = true; save();
}
const details = (uplift = 0n) => rates.map((rate, index) => ({ levelNo: index + 1, fromAmount: String(index * 10000),
  toAmount: index === 6 ? null : String((index + 1) * 10000),
  taxRate: `${(rate + uplift) / 10000n}.${String((rate + uplift) % 10000n).padStart(4, '0')}`, quickDeduction: quick[index] }));
try {
  // Select two entirely unused years, so no existing payroll period is changed.
  const periods = await ok('admin', pay + '/config/periods');
  const year = [2031, 2033, 2035, 2037, 2039].find(value => !periods.some(period =>
    period.startDate <= `${value + 1}-12-31` && period.endDate >= `${value}-01-01`));
  check('two_unused_synthetic_years_available', year !== undefined); fixture.year = year; save();
  const jan = `${year}-01`, feb = `${year}-02`, mar = `${year}-03`, nextJan = `${year + 1}-01`, nextFeb = `${year + 1}-02`;
  for (const month of [jan, feb, mar, nextJan, nextFeb]) {
    const [yyyy, mm] = month.split('-').map(Number);
    const end = `${month}-${new Date(Date.UTC(yyyy, mm, 0)).getUTCDate()}`;
    fixture.periods[month] = id(await ok('admin', pay + '/periods', 'POST', { periodName: marker + '-' + month,
      frequency: 'MONTHLY', startDate: month + '-01', endDate: end, payDate: end })); save();
  }
  await ok('admin', '/auth/system/holiday/calendar', 'POST', { calendarCode: marker, calendarName: marker + '-合成工资日历',
    defaultFlag: 0, weeklyRestDays: '6,7', workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' });
  fixture.calendarId = id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=' + literal(marker))); save();
  await ok('admin', '/auth/system/dept', 'POST', { deptName: marker, parentId: 0, orderNum: 0, status: '0', holidayCalendarId: fixture.calendarId });
  fixture.deptId = id(database('SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name=' + literal(marker) + ' AND deleted=0')); save();
  fixture.componentId = id(await ok('admin', '/hr/compensation/components', 'POST', { componentCode: marker, componentName: marker + '-固定工资',
    componentType: 'FIXED', category: 'EARNING', taxable: 1, status: 1, sortOrder: 999 })); save();
  fixture.structureId = id(await ok('admin', '/hr/compensation/structures', 'POST', { structureCode: marker, structureName: marker, status: 1, componentConfig: {} })); save();
  await ok('admin', pay + '/structures/' + fixture.structureId, 'PUT', { salaryBasis: 'MONTHLY', prorationBasis: 'CALENDAR_DAYS', benefitTiming: 'FIRST_PAYROLL' });
  slabBody = { slabName: marker + '-仅合成验收', region: '隔离合成测试', effectiveFrom: `${year}-01-01`, effectiveTo: `${year + 1}-12-31`,
    thresholdAmount: '3000.00', status: 'DRAFT', remark: '七档合成边际税率，仅用于本机机制验收，不代表正式适用政策' };
  fixture.slabId = id(await ok('admin', pay + '/tax-slabs', 'POST', slabBody)); save();
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId + '/details', 'PUT', details());
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'ACTIVE' });
  for (const key of ['main', 'peer', 'mid']) {
    const hireDate = key === 'mid' ? feb + '-15' : jan + '-01';
    const employeeId = id(await ok('admin', '/hr/employees', 'POST', { employeeNo: marker + '-' + key, name: marker + '-' + key,
      gender: 'UNKNOWN', deptId: fixture.deptId, employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate }));
    fixture.employees[key] = employeeId; save();
    await ok('admin', '/hr/compensation/employee-compensations', 'POST', { employeeId, structureId: fixture.structureId,
      componentValues: { [fixture.componentId]: '15000.01' }, totalSalary: '15000.01', effectiveDate: hireDate, status: 'ACTIVE' });
    await ok('admin', '/hr/compensation/tax-profiles', 'POST', { employeeId, taxSlabId: fixture.slabId, taxResidenceCity: '隔离合成测试', status: 'ACTIVE' });
    check('actual_encrypted_compensation_' + key, database(`SELECT COUNT(*) FROM hr_employee_comp WHERE tenant_id=100000 AND employee_id=${employeeId} AND total_salary NOT REGEXP '^[0-9]+([.][0-9]+)?$'`) === '1');
  }
  const first = expected('15000.01');
  const second = expected('15000.01', '12000.01', '3000.00', '700.00');
  const third = expected('15000.01', '24000.02', '6000.00', '2100.00');
  const midFirst = expected('7500.01'), midSecond = expected('15000.01', '4500.01', '3000.00', '225.00');
  const mainJan = await createBatch('main-january', jan, ['main']); await calculate(mainJan, 1); await collect(mainJan, { main: first }, 'jan-main'); await submit(mainJan);
  const peerJan = await createBatch('peer-january-pending', jan, ['peer']); await calculate(peerJan, 1); await collect(peerJan, { peer: first }, 'jan-peer');
  const february = await createBatch('february-partial-failure', feb, ['main', 'peer', 'mid']);
  const partial = await calculate(february, 2);
  const failed = partial.employees.filter(value => value.calcStatus === 'FAILED');
  check('one_real_generation_failure_prior_draft', failed.length === 1 && String(failed[0].employeeId) === fixture.employees.peer && failed[0].errorMessage === 'PRIOR_PAYROLL_DRAFT');
  check('failed_employee_has_no_slip', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE tenant_id=100000 AND batch_id=${february.id} AND employee_id=${fixture.employees.peer} AND deleted=0`) === '0');
  await collect(february, { main: second, mid: midFirst }, 'feb-before-retry');
  const successIds = partial.employees.filter(value => value.calcStatus === 'SUCCESS').map(value => id(value.salarySlipId));
  const successDigest = rowsDigest(successIds);
  await denied(pay + '/batches/' + february.id + '/submit', 'POST', {}, 'PAYROLL_ERRORS_REMAIN');
  await submit(peerJan);
  await calculate(february, 1, true);
  check('retry_keeps_successful_slips_all_fields', rowsDigest(successIds) === successDigest);
  await collect(february, { main: second, peer: second, mid: midFirst }, 'feb-after-retry'); await submit(february);
  const finalFebruary = await ok('admin', pay + '/batches/' + february.id);
  check('retry_clears_error_list', finalFebruary.batch.errorMessage === '' && finalFebruary.employees.every(value => value.calcStatus === 'SUCCESS' && !value.errorMessage));
  const februaryDigest = rowsDigest(fixture.slips.filter(value => value.batchId === february.id).map(value => value.id));
  await denied(pay + '/batches/' + february.id + '/calculate', 'POST', {}, 'INVALID_PAYROLL_STATE');
  check('second_calculation_rejected_without_slip_change', rowsDigest(fixture.slips.filter(value => value.batchId === february.id).map(value => value.id)) === februaryDigest);
  evidence.retry = true;
  const march = await createBatch('march-cross-brackets', mar, ['main', 'peer', 'mid']); await calculate(march, 3);
  await collect(march, { main: third, peer: third, mid: midSecond }, 'march'); await submit(march);
  evidence.cumulative = true; evidence.midHire = true;
  const reset = await createBatch('next-year-reset', nextJan, ['main']); await calculate(reset, 1); await collect(reset, { main: first }, 'new-year'); await submit(reset); evidence.yearReset = true;
  const historicalIds = fixture.slips.map(value => value.id); const historicalDigest = rowsDigest(historicalIds);
  check('nine_generated_historical_slips', historicalIds.length === 9);
  await denied(pay + '/tax-slabs/' + fixture.slabId + '/details', 'PUT', details(100n), 'TAX_TABLE_ACTIVE');
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'INACTIVE' });
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId + '/details', 'PUT', details(100n));
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId + '/details', 'PUT', details(100n));
  const detailDigest = () => hash(database(`SELECT * FROM hr_tax_slab_detail WHERE slab_id=${fixture.slabId} ORDER BY slab_detail_id`));
  const replacedDigest = detailDigest();
  check('replacement_has_exactly_seven_current_rows', database(`SELECT COUNT(*) FROM hr_tax_slab_detail WHERE slab_id=${fixture.slabId}`) === '7');
  // Fail the second insert after the first replacement row has been inserted.
  // This deliberately exceeds the existing decimal column in this synthetic fixture.
  const oversized = details(100n).map((band, index) => index === 1 ? { ...band, quickDeduction: '100000000000000000000.00' } : band);
  const rollback = await api('admin', pay + '/tax-slabs/' + fixture.slabId + '/details', { method: 'PUT', body: oversized });
  check('replacement_database_failure_rejected', rollback.status === 500 && rollback.body?.code === 500);
  assert.match(rollback.traceId || '', /^[a-f0-9]{32}$/);
  await until(() => database('SELECT COUNT(*) FROM sys_api_error_log WHERE trace_id=' + literal(rollback.traceId)
    + " AND exception_class LIKE '%DataIntegrityViolationException' AND exception_message LIKE '%Out of range value%'"),
  value => value === '1', 'Original replacement database failure audit', 15000);
  check('replacement_failure_rolls_back_all_rows_and_versions', detailDigest() === replacedDigest);
  check('replacement_failure_preserves_all_historical_slips', rowsDigest(historicalIds) === historicalDigest);
  fixture.replacementFailure = { traceId: rollback.traceId, secondInsertOverflow: true, originalRowsRestored: true }; save();
  evidence.taxTableReplacement = true;
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'ACTIVE' });
  check('tax_table_update_preserves_historical_ciphertext_and_digest', rowsDigest(historicalIds) === historicalDigest);
  for (const slipId of historicalIds) {
    const item = expectations.get(slipId); verifySlip(await readSlip(slipId), item.wanted, 'historical-after-rate-change-' + slipId, item.employeeId);
  }
  fixture.deductionId = id(await ok('admin', '/hr/compensation/tax-deductions', 'POST', { employeeId: fixture.employees.main,
    deductionType: 'OTHER', amount: '500.01', startDate: nextFeb + '-01', endDate: `${year + 1}-12-31`, remark: marker + '-无举证合成扣除' })); save();
  const falseExpected = expected('15000.01', '12000.01', '3000.00', '700.00', '0.00', 100n);
  const trueExpected = expected('15000.01', '12000.01', '3000.00', '700.00', '500.01', 100n);
  check('independent_changed_rate_totals', falseExpected.tax === '1640.00' && trueExpected.tax === '1560.00');
  for (const [flag, wanted] of [[false, falseExpected], [true, trueExpected]]) {
    const preview = await ok('admin', pay + '/slips/preview?' + new URLSearchParams({ employeeId: fixture.employees.main, periodId: fixture.periods[nextFeb], deductUnverified: String(flag) }));
    verifySlip(preview, wanted, 'unverified-preview-' + flag, fixture.employees.main);
  }
  const disallow = await createBatch('unverified-false', nextFeb, ['main'], 0); await calculate(disallow, 1); await collect(disallow, { main: falseExpected }, 'unverified-false-actual');
  const cancelledIds = fixture.slips.filter(value => value.batchId === disallow.id).map(value => value.id);
  await ok('admin', pay + '/batches/' + disallow.id + '/cancel', 'POST', {}); disallow.cancelled = true; save();
  check('cancel_removes_only_owned_batch_slip', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE id IN (${cancelledIds.join(',')}) AND deleted=0`) === '0' && rowsDigest(historicalIds) === historicalDigest);
  const allow = await createBatch('unverified-true', nextFeb, ['main'], 1); await calculate(allow, 1); await collect(allow, { main: trueExpected }, 'unverified-true-actual'); await submit(allow);
  check('unproved_deduction_remains_declared_and_encrypted', database(`SELECT COUNT(*) FROM hr_tax_deduction WHERE id=${fixture.deductionId} AND declare_status='DECLARED' AND proof_file_url IS NULL AND amount NOT REGEXP '^[0-9]+([.][0-9]+)?$'`) === '1');
  check('all_prior_slips_still_unchanged_after_new_rate_and_batch_flags', rowsDigest(historicalIds) === historicalDigest);
  evidence.snapshot = true; evidence.unverifiedDeduction = true; evidence.cancellation = true;
} catch (error) { failure = error; }
finally {
  for (const batch of fixture.batches) {
    try {
      const detail = await until(() => ok('admin', pay + '/batches/' + batch.id), value => value.batch.status !== 'CALCULATING', 'Cleanup original batch ' + batch.label);
      if (['DRAFT', 'CALCULATED', 'FAILED'].includes(detail.batch.status)) await ok('admin', pay + '/batches/' + batch.id + '/cancel', 'POST', {});
      const restored = await ok('admin', pay + '/batches/' + batch.id);
      fixture.restorations[batch.id] = ['SUBMITTED', 'CANCELLED'].includes(restored.batch.status);
      check('owned_batch_terminal_' + batch.label, fixture.restorations[batch.id]);
    } catch (error) { fixture.restorations[batch.id] = false; failure ||= error; }
    save();
  }
  try {
    if (fixture.slabId) {
      await ok('admin', pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slabBody, status: 'INACTIVE' });
      check('synthetic_table_inactive_after_check', database(`SELECT status FROM hr_tax_slab WHERE slab_id=${fixture.slabId}`) === 'INACTIVE');
    }
    evidence.restoration = Object.values(fixture.restorations).every(Boolean);
  } catch (error) { failure ||= error; }
  try {
    const after = preserved(); for (const [table] of tables) check('preexisting_' + table + '_unchanged', after[table] === fixture.originalDigest[table]);
    check('original_roles_unchanged', roleHash() === fixture.originalRoleHash);
    check('new_test_employees_never_bound_to_accounts', Object.values(fixture.employees).length === 0 || database(`SELECT COUNT(*) FROM hr_employee WHERE id IN (${Object.values(fixture.employees).join(',')}) AND user_id IS NOT NULL`) === '0');
    check('browser_no_errors', browserErrors.length === 0); evidence.preservation = true;
  } catch (error) { failure ||= error; }
  try { const scan = await runtime.scan(); evidence.secrets = true; console.log('D3_TAX_LOG_SCAN: ' + JSON.stringify(scan)); } catch (error) { failure ||= error; }
  await runtime.close(); save();
  const message = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safe = message && [...sensitive].every(value => !message.includes(value)) ? message : failure ? 'D3 cumulative verification failed' : undefined;
  write('requests.json', requests);
  write('result.json', { marker, passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length,
    tasks: fixture.tasks.length, syntheticPolicy: true, officialTaxPolicyVerified: false, all18Complete: false, globalComplete: false, failure: safe });
  console.log(`D3_TAX_SUMMARY: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; tasks=${fixture.tasks.length}; preservation=${evidence.preservation}; restoration=${evidence.restoration}; all18_complete=false`);
  if (failure) { console.log('D3_TAX_FAILURE: ' + safe); process.exitCode = 1; }
}
