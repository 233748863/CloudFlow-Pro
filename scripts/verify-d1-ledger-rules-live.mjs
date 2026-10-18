import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = 'D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-ledger-rules'));
const output = path.resolve(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d1-ledger-rules-live-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, requests, database, rows, api, ok, sessions, sensitive, browserErrors } = runtime;
const marker = 'D1R-' + randomUUID().replaceAll('-', '').slice(0, 12);
const fixture = { marker, types: {}, components: {}, operations: {} };
const evidence = { allocation: false, negative: false, compensatory: false, encashment: false, component: false, preservation: false, secrets: false };
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const hash = value => createHash('sha256').update(value).digest('hex');
const save = () => fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify(fixture, null, 2));
const base = '/hr/attendance/leave';
const tables = [['hr_leave_ledger', 'ledger_id'], ['hr_leave_quota', 'id'], ['hr_time_request', 'id'], ['hr_comp_change', 'id'], ['hr_comp_component', 'id']];
const boundaries = tables.map(([table, key]) => [table, key, database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`)]);
const original = () => hash(JSON.stringify(boundaries.map(([table, key, limit]) => database(`SELECT * FROM ${table} WHERE ${key}<=${limit} ORDER BY ${key}`))));
const originalHash = original();
const bindings = database('SELECT id,user_id FROM hr_employee WHERE deleted=0 AND user_id IS NOT NULL ORDER BY id');
const beforeState = () => hash(JSON.stringify([
  database(`SELECT * FROM hr_leave_ledger WHERE employee_id=${id(fixture.employeeId)} ORDER BY ledger_id`),
  database(`SELECT * FROM hr_leave_quota WHERE employee_id=${id(fixture.employeeId)} ORDER BY id`),
  database(`SELECT * FROM hr_comp_change WHERE employee_id=${id(fixture.employeeId)} ORDER BY id`),
]));
async function type(suffix, fields = {}) {
  const body = { leaveCode: marker + '-' + suffix, leaveName: marker + '-' + suffix, needQuota: 1, isPaid: 1, unit: 'DAY', status: 1,
    maxDaysPerYear: 5, roundingMode: 'NONE', ...fields };
  const value = id(await ok('admin', '/hr/attendance/leave-types', 'POST', body));
  fixture.types[suffix] = { id: value, body }; save(); return value;
}
async function entry(typeId, suffix, kind, quantity, extra = {}) {
  const body = { employeeId: fixture.employeeId, leaveTypeId: typeId, periodId: fixture.periodId, transactionType: kind, quantity,
    sourceId: marker + '-' + suffix, remark: marker + '-' + suffix, ...extra };
  const value = id(await ok('admin', base + '/ledger', 'POST', body));
  fixture.operations[suffix] = { id: value, body }; save(); return value;
}
async function denied(body, label, code, actor = 'admin') {
  const prior = beforeState(); const response = await api(actor, base + '/ledger', { method: 'POST', body });
  check(label, response.status === (actor === 'employee' ? 403 : 400) && response.body?.code !== 200 && (!code || JSON.stringify(response.body).includes(code)));
  check(label + '_no_ledger_quota_or_salary_change', prior === beforeState());
}
const command = (typeId, suffix, kind, quantity, extra = {}) => ({ employeeId: fixture.employeeId, leaveTypeId: typeId,
  periodId: fixture.periodId, transactionType: kind, quantity, sourceId: marker + '-' + suffix, remark: marker, ...extra });
async function balance(typeId, expected, label) {
  const values = await ok('admin', base + '/ledger?employeeId=' + fixture.employeeId + '&leaveTypeId=' + typeId + '&periodId=' + fixture.periodId);
  let total = 0;
  for (const value of values) { total += Math.round(Number(value.leaveDays) * 100); check(label + '_running_' + value.ledgerId, Math.round(Number(value.runningBalance) * 100) === total); }
  check(label + '_ledger', total === expected * 100);
  const available = database(`SELECT available_quota FROM hr_leave_quota WHERE tenant_id=100000 AND employee_id=${id(fixture.employeeId)} AND leave_type_id=${id(typeId)} AND period_id=${id(fixture.periodId)} AND deleted=0`);
  check(label + '_materialized_balance', Number(available) === expected);
}
let failure;
try {
  const today = database('SELECT CURRENT_DATE()');
  const periods = (await ok('admin', base + '/periods')).filter(value => value.status === 'OPEN' && value.startDate <= today && value.endDate >= today);
  check('one_current_open_period', periods.length === 1); fixture.periodId = id(periods[0].periodId);
  const deptId = id(database(`SELECT dept_id FROM sys_user WHERE tenant_id=100000 AND user_id=${id(sessions.admin.identity.userId)}`));
  fixture.employeeId = id(await ok('admin', '/hr/employees', 'POST', { employeeNo: marker, name: marker + '规则员工', deptId,
    gender: 'MALE', employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate: periods[0].startDate })); save();
  const strict = await type('strict'), over = await type('over', { allowOverAllocationFlag: 1 }), negative = await type('negative', { allowNegativeFlag: 1 });
  for (const value of [strict, over, negative]) await entry(value, 'initial-' + value, 'ADJUSTMENT', 5);
  await denied(command(strict, 'excess-denied', 'ADJUSTMENT', 1), 'over_allocation_disabled', 'LEAVE_ALLOCATION_LIMIT');
  await entry(over, 'excess-allowed', 'ADJUSTMENT', 1); await balance(over, 6, 'over_allocation_enabled'); evidence.allocation = true;
  await denied(command(strict, 'negative-denied', 'ADJUSTMENT', -6), 'negative_balance_disabled', 'INSUFFICIENT_QUOTA');
  await entry(negative, 'negative-allowed', 'ADJUSTMENT', -6); await balance(negative, -1, 'negative_balance_enabled'); evidence.negative = true;
  const comp = await type('comp', { unit: 'HOUR', maxDaysPerYear: 20, compensatoryFlag: 1 });
  await denied(command(strict, 'comp-disabled', 'COMPENSATORY', 1), 'compensatory_disabled', 'COMPENSATORY_NOT_ALLOWED');
  await denied(command(comp, 'comp-negative', 'COMPENSATORY', -1), 'compensatory_negative_rejected', 'COMPENSATORY_NOT_ALLOWED');
  const compId = await entry(comp, 'comp-hours', 'COMPENSATORY', 8);
  const priorComp = beforeState();
  await new Promise(resolve => setTimeout(resolve, 5100));
  check('repeat_compensatory_returns_original', id(await ok('admin', base + '/ledger', 'POST', fixture.operations['comp-hours'].body)) === compId);
  check('repeat_compensatory_preserves_rows', priorComp === beforeState()); await balance(comp, 8, 'eight_hours_compensatory');
  check('compensatory_unit_is_hour', database(`SELECT quantity_unit FROM hr_leave_ledger WHERE ledger_id=${compId}`) === 'HOUR'); evidence.compensatory = true;
  const componentBody = { componentCode: marker + '-cash', componentName: marker + '-折现薪酬项', componentType: 'VARIABLE', category: 'EARNING', taxable: 1, status: 1, sortOrder: 999 };
  fixture.components.cash = id(await ok('admin', '/hr/compensation/components', 'POST', componentBody)); fixture.componentBody = componentBody; save();
  const cash = await type('cash', { encashmentFlag: 1, encashmentComponentId: fixture.components.cash });
  await entry(cash, 'cash-initial', 'ADJUSTMENT', 5);
  const cashExtra = { encashmentAmount: 123.45, effectiveDate: today };
  await denied(command(strict, 'cash-disabled', 'ENCASHMENT', 1, cashExtra), 'encashment_disabled', 'ENCASHMENT_NOT_ALLOWED');
  await denied(command(cash, 'cash-missing-amount', 'ENCASHMENT', 1, { effectiveDate: today }), 'encashment_amount_required', 'ENCASHMENT_NOT_ALLOWED');
  await denied(command(cash, 'cash-over-balance', 'ENCASHMENT', 6, cashExtra), 'encashment_insufficient_rolls_back_salary', 'INSUFFICIENT_QUOTA');
  const cashId = await entry(cash, 'cash-approved', 'ENCASHMENT', 2, cashExtra);
  await balance(cash, 3, 'encashment_two_days');
  const beforeRepeat = beforeState();
  await new Promise(resolve => setTimeout(resolve, 5100));
  check('repeat_encashment_returns_original', id(await ok('admin', base + '/ledger', 'POST', fixture.operations['cash-approved'].body)) === cashId);
  check('repeat_encashment_no_additional_salary', beforeRepeat === beforeState());
  const salary = (await ok('admin', '/hr/compensation/changes?employeeId=' + fixture.employeeId + '&pageSize=100')).rows;
  check('encashment_generates_exact_approved_amount_and_date', salary.length === 1 && salary[0].changeType === 'LEAVE_ENCASHMENT'
    && salary[0].status === 'APPROVED' && Number(salary[0].changeAmount) === 123.45 && salary[0].effectiveDate === today);
  check('encashment_additional_salary_totals', Number(salary[0].beforeTotal) === 0 && Number(salary[0].afterTotal) === 123.45);
  fixture.salaryChangeId = id(salary[0].id); save();
  check('encashment_salary_amounts_encrypted_at_rest', database(`SELECT COUNT(*) FROM hr_comp_change WHERE id=${fixture.salaryChangeId} AND before_total NOT REGEXP '^[0-9]+([.][0-9]+)?$' AND after_total NOT REGEXP '^[0-9]+([.][0-9]+)?$' AND change_amount NOT REGEXP '^[0-9]+([.][0-9]+)?$'`) === '1');
  await denied(command(cash, 'employee-denied', 'ENCASHMENT', 1, cashExtra), 'employee_cannot_encash', undefined, 'employee'); evidence.encashment = true;
  check('salary_change_keeps_selected_component', database(`SELECT COALESCE(CAST(salary_component_id AS CHAR),'NULL') FROM hr_comp_change WHERE id=${fixture.salaryChangeId}`) === fixture.components.cash);
  await ok('admin', '/hr/compensation/components/' + fixture.components.cash, 'PUT', { ...componentBody, status: 0 });
  fixture.componentDisabled = true; save();
  await denied(command(cash, 'disabled-component', 'ENCASHMENT', 1, cashExtra), 'disabled_salary_component_rejected', 'ENCASHMENT_COMPONENT_INVALID');
  const invalid = await api('admin', '/hr/attendance/leave-types', { method: 'POST', body: { ...fixture.types.cash.body, leaveCode: marker + '-invalid', encashmentComponentId: '9223372036854775806' } });
  check('nonexistent_salary_component_configuration_rejected', invalid.status === 400 && JSON.stringify(invalid.body).includes('ENCASHMENT_COMPONENT_INVALID'));
  evidence.component = true;
} catch (error) { failure = error; }
finally {
  try {
    if (fixture.componentDisabled) { await ok('admin', '/hr/compensation/components/' + fixture.components.cash, 'PUT', fixture.componentBody); fixture.componentDisabled = false; }
    check('prior_business_rows_preserved', originalHash === original());
    check('all_existing_employee_bindings_preserved', bindings === database('SELECT id,user_id FROM hr_employee WHERE deleted=0 AND user_id IS NOT NULL ORDER BY id'));
    check('browser_has_no_unhandled_errors', browserErrors.length === 0); evidence.preservation = true;
  } catch (error) { failure ||= error; }
  try { const result = await runtime.scan(); evidence.secrets = true; console.log('D1_LEDGER_RULES_LOG_SCAN: ' + JSON.stringify(result)); } catch (error) { failure ||= error; }
  await runtime.close(); save();
  const message = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safeMessage = message && [...sensitive].every(value => !message.includes(value)) ? message : failure ? 'D1 ledger rules failed' : undefined;
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ marker, passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length, failure: safeMessage }, null, 2));
  console.log(`D1_LEDGER_RULES_SUMMARY: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; preservation=${evidence.preservation}`);
  if (failure) { console.log('D1_LEDGER_RULES_FAILURE: ' + safeMessage); process.exitCode = 1; }
}
