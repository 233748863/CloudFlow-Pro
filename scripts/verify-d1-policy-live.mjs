import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { authenticateFormTest } from './runtime-checks/form-browser-auth.mjs';
import { scanSecretStream, scanOwnedAuditLogs } from './portal-checks/scan-access-logs.mjs';

// Real HTTP writes only. SQL is restricted to reads against the fixed owned loopback fixture.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(fs.realpathSync(root).toLowerCase(), fs.realpathSync('D:/CloudFlowPro').toLowerCase());
assert.ok(process.argv.includes('--d1-policy'));
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.equal(path.dirname(output), fs.realpathSync(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
assert.match(path.basename(output), /^d1-policy-live-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const marker = `D1-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const checks = [], requests = [], sensitive = new Set(), sessions = {}, browserErrors = [];
const fixture = { marker, employees: [], types: [], policies: [], periods: [] };
const evidence = { batch: false, proration: false, configuration: false, ledger: false, recalculation: false, permissions: false, secrets: false };
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const save = () => write('fixture.json', fixture);
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const textSql = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
const hash = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const env = { ...process.env }; delete env.MYSQL_PWD;
function database(statement) {
  assert.match(statement, /^SELECT\s/i, 'D1 SQL access must be read-only');
  assert.ok(!/;\s*\S|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(statement), 'One read statement only');
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, encoding: 'utf8', windowsHide: true, env, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Owned D1 database read failed');
  return result.stdout.trim();
}
const rows = statement => { const result = database(statement); return result ? result.split(/\r?\n/).map(line => JSON.parse(line)) : []; };
assert.equal(fs.realpathSync(database('SELECT @@datadir;')), fs.realpathSync(path.join(run, 'mysql-data')));
check('owned_schema_has_374_tables', database("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") === '374');
const boundaries = rows("SELECT JSON_OBJECT('log',CAST(COALESCE((SELECT MAX(log_id) FROM sys_log),0) AS CHAR),'error',CAST(COALESCE((SELECT MAX(error_id) FROM sys_api_error_log),0) AS CHAR),'audit',CAST(COALESCE((SELECT MAX(audit_id) FROM sys_audit_log),0) AS CHAR));")[0];
const accounts = JSON.parse(fs.readFileSync(path.join(run, 'private/accounts.json'), 'utf8'));
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const gateway = state.services.find(service => service.name === 'gateway');
assert.ok(gateway && Number.isInteger(gateway.port));
let browser, server, origin, failure;

async function api(actor, requestPath, options = {}) {
  assert.match(requestPath, /^\/hr\/(attendance|organization|employees)(\/|\?|$)/);
  const result = await sessions[actor].page.evaluate(async supplied => {
    const storage = await import('/src/utils/authStorage.ts');
    const token = storage.getAuthToken();
    const headers = { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` };
    const csrf = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('XSRF-TOKEN='));
    if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
    if (supplied.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`/api${supplied.requestPath}`, { method: supplied.method || 'GET', credentials: 'same-origin', headers,
      ...(supplied.body === undefined ? {} : { body: JSON.stringify(supplied.body) }) });
    const body = (response.headers.get('Content-Type') || '').includes('json') ? await response.json() : null;
    return { status: response.status, traceId: response.headers.get('X-Trace-Id'), body };
  }, { requestPath, ...options });
  requests.push({ actor, path: requestPath, method: options.method || 'GET', status: result.status, code: result.body?.code, traceId: result.traceId });
  return result;
}
function success(result, label) {
  check(`${label}:status_${result.status}_code_${result.body?.code}`, result.status === 200 && result.body?.code === 200);
  return result.body.data;
}
function rejected(result, label, expected) {
  check(label, result.status >= 400 && result.body?.code !== 200
    && (!expected || JSON.stringify(result.body).includes(expected)));
}
const get = async (url, label) => success(await api('admin', url), label);
const post = async (url, body, label) => success(await api('admin', url, { method: 'POST', body }), label);
const base = '/hr/attendance/leave';
const ledger = (employee, type, period) => get(`${base}/ledger?employeeId=${employee}&leaveTypeId=${type}&periodId=${period}`, 'read_ledger');
const ledgerSql = filter => `SELECT JSON_OBJECT('id',ledger_id,'tenant',tenant_id,'employee',employee_id,'type',leave_type_id,'period',leave_period_id,'transaction',transaction_type,'source',source_biz_type,'sourceId',source_biz_id,'event',source_event_key,'quantity',leave_days,'unit',quantity_unit,'from',from_date,'to',to_date,'carry',carry_forward_flag,'expired',expired_flag,'lwp',lwp_flag,'reversal',reversal_of_id,'remark',remark,'operator',operator_id,'createBy',create_by,'createTime',create_time) FROM hr_leave_ledger WHERE ${filter} ORDER BY ledger_id`;
async function createEmployee(suffix, position, hireDate, dept) {
  const employee = id(await post('/hr/employees', { employeeNo: `${marker}-${suffix}`, name: `假期验收${suffix}`, gender: 'MALE',
    deptId: dept, positionId: position, employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate }, `create_employee_${suffix}`));
  fixture.employees.push(employee); save(); return employee;
}
async function policy(suffix, details) {
  const policyId = id(await post(`${base}/policies`, { policyCode: `${marker}-${suffix}`, policyName: `假期验收${suffix}`, status: 'ACTIVE' }, `create_policy_${suffix}`));
  fixture.policies.push(policyId); save();
  success(await api('admin', `${base}/policies/${policyId}/details`, { method: 'PUT', body: details }), 'configure_policy_details');
  return policyId;
}
async function type(suffix, fields = {}) {
  const typeId = id(await post('/hr/attendance/leave-types', { leaveCode: `${marker}-${suffix}`, leaveName: `假期验收${suffix}`, unit: 'DAY',
    needQuota: 1, isPaid: 1, status: 1, maxDaysPerYear: 20, roundingMode: 'NONE', ...fields }, `create_type_${suffix}`));
  fixture.types.push(typeId); save(); return typeId;
}

try {
  server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null,
      proxy: { '/api': { target: `http://127.0.0.1:${gateway.port}`, changeOrigin: false, rewrite: value => value.replace(/^\/api/, '') } } } });
  await server.listen(); origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  for (const [actor, username] of [['admin', 'g_import_admin'], ['employee', 'g_holiday_employee']]) {
    const account = accounts.find(value => value.username === username); assert.ok(account, 'Owned account missing'); sensitive.add(account.password);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', () => browserErrors.push(actor));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const identity = await authenticateFormTest(page, account, origin);
    check(`real_captcha_login_${actor}`, identity.authenticated && identity.tenantId === '100000');
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken()); sensitive.add(token); sensitive.add(token.replace(/^Bearer /, ''));
    sessions[actor] = { page, context, identity };
  }
  const dept = id(database(`SELECT dept_id FROM sys_user WHERE tenant_id=100000 AND user_id=${id(sessions.admin.identity.userId)};`));
  const periods = await get(`${base}/periods`, 'read_current_periods');
  const today = database('SELECT CURRENT_DATE();');
  const current = periods.filter(value => value.status === 'OPEN' && value.startDate <= today && value.endDate >= today);
  check('one_current_open_period', current.length === 1);
  const periodId = id(current[0].periodId);
  const levelId = id(await post('/hr/organization/levels', { levelCode: marker, levelName: '假期验收职级', levelSeries: 'P', levelRank: 99, status: 1 }, 'create_owned_level'));
  fixture.levelId = levelId; save();
  const position = id(await post('/hr/organization/positions', { positionCode: marker, positionName: '假期验收职位', levelId, status: 1 }, 'create_owned_position'));
  fixture.positionId = position; save();
  const annual = await type('annual'), care = await type('care');
  const employees = [];
  for (let index = 1; index <= 50; index++) employees.push(await createEmployee(String(index).padStart(2, '0'), position, current[0].startDate, dept));
  const outsider = await createEmployee('outside', null, current[0].startDate, dept);
  check('50_employees_have_exact_owned_level', database(`SELECT COUNT(*) FROM hr_employee e JOIN hr_position p ON p.id=e.position_id AND p.tenant_id=e.tenant_id WHERE e.tenant_id=100000 AND e.deleted=0 AND p.level_id=${levelId}`) === '50');
  const policyId = await policy('batch', [{ leaveTypeId: annual, annualDays: 10 }, { leaveTypeId: care, annualDays: 6 }]);
  const assignment = { policyId, periodId, assignmentBasis: 'PERIOD', jobLevelIds: [levelId], carryForwardFlag: 0 };
  check('batch_assignment_returns_50', Number(await post(`${base}/assignments`, assignment, 'assign_by_level')) === 50);
  const assignments = await get(`${base}/policy-assignments?policyId=${policyId}&leavePeriodId=${periodId}`, 'read_batch_assignments');
  check('exactly_50_assignments_marked_allocated', assignments.length === 50 && assignments.every(value => Number(value.allocatedFlag) === 1 && employees.includes(String(value.employeeId))));
  for (const employee of employees) {
    for (const [leaveTypeId, quantity] of [[annual, 10], [care, 6]]) {
      const entries = await ledger(employee, leaveTypeId, periodId);
      check(`allocation_${employee}_${leaveTypeId}`, entries.length === 1 && entries[0].transactionType === 'ALLOCATION'
        && entries[0].sourceBizType === 'POLICY_ASSIGNMENT' && Number(entries[0].leaveDays) === quantity && Number(entries[0].runningBalance) === quantity);
    }
  }
  check('outside_level_has_zero_assignments', database(`SELECT COUNT(*) FROM hr_leave_policy_assignment WHERE tenant_id=100000 AND employee_id=${outsider}`) === '0');
  const batchFilter = `tenant_id=100000 AND employee_id IN (${employees.join(',')})`;
  const batchBefore = hash(database(ledgerSql(batchFilter)));
  await delay(5100);
  check('repeated_assignment_returns_zero', Number(await post(`${base}/assignments`, assignment, 'repeat_batch_assignment')) === 0);
  check('repeat_keeps_all_100_ledger_rows_identical', batchBefore === hash(database(ledgerSql(batchFilter)))
    && database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE ${batchFilter}`) === '100');
  rejected(await api('admin', `${base}/policies/${policyId}/details`, { method: 'PUT', body: [{ leaveTypeId: annual, annualDays: 19 }] }), 'assigned_policy_details_are_immutable', 'POLICY_IN_USE');
  const preservedDetails = await get(`${base}/policy-details?policyId=${policyId}`, 'read_preserved_policy_details');
  check('failed_policy_edit_retains_both_quotas', preservedDetails.length === 2 && preservedDetails.some(value => String(value.leaveTypeId) === annual && Number(value.annualDays) === 10)
    && preservedDetails.some(value => String(value.leaveTypeId) === care && Number(value.annualDays) === 6));
  evidence.batch = true; console.log('D1_BATCH: employees=50; leave_types=2; allocation_entries=100; duplicate_entries=0; outside_scope_entries=0');

  const component = id(database('SELECT id FROM hr_comp_component WHERE tenant_id=100000 AND status=1 ORDER BY id LIMIT 1'));
  const rules = { maxDaysPerYear: 24, applicableAfterDays: 30, maxContinuousDays: 5, carryForwardFlag: 1, maxCarryForwardDays: 4,
    carryForwardExpireDays: 90, earnedLeaveFlag: 1, earnedLeaveFrequency: 'MONTHLY', roundingMode: 'HALF_DAY', encashmentFlag: 1,
    encashmentComponentId: component, lwpFlag: 1, partialPaidFlag: 1, salaryFractionPerDay: 0.6, compensatoryFlag: 1,
    optionalLeaveFlag: 1, includeHolidayFlag: 1, allowNegativeFlag: 1, allowOverAllocationFlag: 1, needAttachmentFlag: 1 };
  check('exactly_20_rule_fields', Object.keys(rules).length === 20);
  const ruleType = await type('rules', rules);
  const ruleRows = await get('/hr/attendance/leave-types', 'read_rule_configuration');
  const readRule = ruleRows.find(value => String(value.id) === ruleType); check('configured_rule_type_is_visible', !!readRule);
  for (const [field, value] of Object.entries(rules)) check(`rule_round_trip_${field}`, String(readRule[field]) === String(value));
  const ruleBody = { leaveCode: `${marker}-rules`, leaveName: '假期验收rules', unit: 'DAY', needQuota: 1, isPaid: 1, status: 1, ...rules };
  for (const [changes, code] of [[{ maxDaysPerYear: -1 }, 'INVALID_LEAVE_LIMIT'], [{ applicableAfterDays: -1 }, 'INVALID_LEAVE_LIMIT'],
    [{ carryForwardExpireDays: 0 }, 'INVALID_LEAVE_LIMIT'], [{ salaryFractionPerDay: 1.0001 }, 'INVALID_SALARY_FRACTION'],
    [{ earnedLeaveFrequency: 'WEEKLY' }, 'INVALID_ACCRUAL_FREQUENCY'], [{ unit: 'HOUR' }, 'INVALID_ROUNDING'], [{ encashmentComponentId: null }, 'ENCASHMENT_COMPONENT_REQUIRED']]) {
    rejected(await api('admin', `/hr/attendance/leave-types/${ruleType}`, { method: 'PUT', body: { ...ruleBody, ...changes } }), `invalid_rule_${Object.keys(changes)[0]}`, code);
  }
  const afterInvalid = (await get('/hr/attendance/leave-types', 'read_rules_after_rejections')).find(value => String(value.id) === ruleType);
  check('invalid_rule_updates_leave_original_configuration_intact', JSON.stringify(readRule) === JSON.stringify(afterInvalid));
  evidence.configuration = true; console.log('D1_CONFIGURATION: fields_saved_and_read=20; invalid_cases=7; behavior_coverage=partial');

  // July 2 through December 31 in 2024 is exactly 183 of 366 inclusive days.
  let leap = periods.find(value => value.startDate === '2024-01-01' && value.endDate === '2024-12-31' && value.status === 'OPEN');
  if (!leap) {
    check('leap_sample_has_no_existing_period_overlap', !periods.some(value => value.startDate <= '2024-12-31' && value.endDate >= '2024-01-01'));
    const leapId = id(await post(`${base}/periods`, { periodName: `${marker}-leap`, startDate: '2024-01-01', endDate: '2024-12-31', defaultFlag: 0, status: 'OPEN' }, 'create_leap_period'));
    leap = { periodId: leapId }; fixture.periods.push(leapId); save();
  }
  const leapPeriod = id(leap.periodId);
  const proportional = await policy('joining', [{ leaveTypeId: annual, annualDays: 10 }]);
  for (const [suffix, hireDate, quantity] of [['year', '2024-01-01', 10], ['half', '2024-07-02', 5], ['last', '2024-12-31', 0.03]]) {
    const employee = await createEmployee(suffix, null, hireDate, dept);
    check(`joining_assignment_${suffix}`, Number(await post(`${base}/assignments`, { policyId: proportional, periodId: leapPeriod, assignmentBasis: 'JOINING_DATE', employeeIds: [employee] }, `assign_joining_${suffix}`)) === 1);
    const entries = await ledger(employee, annual, leapPeriod);
    check(`joining_quantity_${suffix}`, entries.length === 1 && Number(entries[0].leaveDays) === quantity && Number(entries[0].runningBalance) === quantity && entries[0].fromDate === hireDate);
  }
  evidence.proration = true; console.log('D1_PRORATION: period_days=366; half_days=183; full_quota=10; half_quota=5; final_day_quota=0.03');

  const employee = employees[0], sourceId = `${marker}-adjust`;
  const original = await ledger(employee, annual, periodId);
  const originalHash = hash(database(ledgerSql(`ledger_id=${id(original[0].ledgerId)}`)));
  const adjustment = { employeeId: employee, leaveTypeId: annual, periodId, transactionType: 'ADJUSTMENT', sourceId, quantity: 2.25, remark: '假期验收调整' };
  const adjustmentId = id(await post(`${base}/ledger`, adjustment, 'append_adjustment'));
  const afterAdjustment = await ledger(employee, annual, periodId);
  check('append_adjustment_has_running_balance_12_25', afterAdjustment.length === 2 && Number(afterAdjustment[1].leaveDays) === 2.25 && Number(afterAdjustment[1].runningBalance) === 12.25);
  const adjustmentHash = hash(database(ledgerSql(`ledger_id=${adjustmentId}`)));
  await delay(5100);
  check('same_operation_returns_same_ledger_id', id(await post(`${base}/ledger`, adjustment, 'repeat_adjustment')) === adjustmentId);
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const response = await api('admin', `${base}/ledger/${adjustmentId}`, { method, ...(method === 'DELETE' ? {} : { body: { quantity: 999, leaveDays: 999 } }) });
    rejected(response, `ledger_${method.toLowerCase()}_unavailable`);
    check(`ledger_${method.toLowerCase()}_keeps_original_bytes`, adjustmentHash === hash(database(ledgerSql(`ledger_id=${adjustmentId}`))));
  }
  const beforeForged = hash(database(ledgerSql(batchFilter)));
  for (const transactionType of ['ALLOCATION', 'APPLICATION', 'FREEZE', 'UNFREEZE', 'CARRY_FORWARD', 'EXPIRY']) {
    rejected(await api('admin', `${base}/ledger`, { method: 'POST', body: { ...adjustment, sourceId: `${marker}-${transactionType}`, transactionType } }), `cannot_forge_${transactionType}`);
  }
  check('forged_system_entries_leave_all_ledger_rows_intact', beforeForged === hash(database(ledgerSql(batchFilter))));
  const reversalId = id(await post(`${base}/ledger/${adjustmentId}/reverse`, { reason: '验收冲正保留原账' }, 'reverse_adjustment'));
  const afterReversal = await ledger(employee, annual, periodId);
  check('reversal_appends_linked_negative_entry', afterReversal.length === 3 && String(afterReversal[2].ledgerId) === reversalId
    && String(afterReversal[2].reversalOfId) === adjustmentId && Number(afterReversal[2].leaveDays) === -2.25 && Number(afterReversal[2].runningBalance) === 10);
  check('allocation_and_adjustment_remain_byte_identical_after_reversal', originalHash === hash(database(ledgerSql(`ledger_id=${id(original[0].ledgerId)}`)))
    && adjustmentHash === hash(database(ledgerSql(`ledger_id=${adjustmentId}`))));
  rejected(await api('admin', `${base}/ledger/${adjustmentId}/reverse`, { method: 'POST', body: { reason: '重复冲正必须拒绝' } }), 'duplicate_reversal_rejected', 'ALREADY_REVERSED');
  check('duplicate_reversal_adds_no_entry', (await ledger(employee, annual, periodId)).length === 3);
  for (const [url, options] of [[`${base}/assignments`, { method: 'POST', body: assignment }], [`${base}/ledger`, { method: 'POST', body: { ...adjustment, sourceId: `${marker}-denied` } }],
    [`${base}/ledger/${adjustmentId}/reverse`, { method: 'POST', body: { reason: '员工无权冲正' } }], [`${base}/recalculate`, { method: 'POST' }],
    [`${base}/ledger?employeeId=${employee}&leaveTypeId=${annual}&periodId=${periodId}`, {}]]) {
    const response = await api('employee', url, options); check('ordinary_employee_cannot_manage_other_leave', response.status === 403);
  }
  evidence.permissions = true; evidence.ledger = true;
  console.log('D1_LEDGER: adjustment=2.25; reversal=-2.25; final_balance=10; original_rows_changed=0; forbidden_methods=3; forged_types=6; denied_employee_entries=5');

  const allLedgerBefore = hash(database(ledgerSql('tenant_id=100000')));
  const groups = Number(database('SELECT COUNT(*) FROM (SELECT employee_id,leave_type_id,leave_period_id FROM hr_leave_ledger WHERE tenant_id=100000 GROUP BY employee_id,leave_type_id,leave_period_id) ledger_groups'));
  const recalculated = Number(await post(`${base}/recalculate`, undefined, 'recalculate_all_owned_tenant_balances'));
  check('full_recalculation_covers_every_ledger_group', recalculated >= groups);
  const mismatch = database('SELECT COUNT(*) FROM (SELECT employee_id,leave_type_id,leave_period_id,SUM(leave_days) expected FROM hr_leave_ledger WHERE tenant_id=100000 GROUP BY employee_id,leave_type_id,leave_period_id) l LEFT JOIN hr_leave_quota q ON q.tenant_id=100000 AND q.employee_id=l.employee_id AND q.leave_type_id=l.leave_type_id AND q.period_id<=>l.leave_period_id AND q.deleted=0 WHERE q.id IS NULL OR q.available_quota<>l.expected');
  check('every_ledger_sum_matches_recalculated_available_balance', mismatch === '0');
  check('full_recalculation_does_not_mutate_any_ledger_record', allLedgerBefore === hash(database(ledgerSql('tenant_id=100000'))));
  const quotas = await get(`/hr/attendance/leave-quotas?employeeId=${employee}`, 'read_recalculated_employee_balances');
  check('http_quota_matches_reversed_annual_balance', quotas.some(value => String(value.leaveTypeId) === annual && String(value.periodId) === periodId && Number(value.availableQuota) === 10));
  evidence.recalculation = true; evidence.recalculationGroups = groups;
  console.log(`D1_RECALCULATION: ledger_groups=${groups}; recalculated=${recalculated}; balance_mismatches=0; ledger_rows_changed=0`);
  check('browser_has_no_unhandled_errors', browserErrors.length === 0);
} catch (error) {
  failure = error;
} finally {
  try {
    if (sensitive.size) {
      // Scan both the actual service logs and current persisted audit records without emitting their contents.
      await delay(1500);
      const logPaths = state.services.flatMap(service => {
        const directory = path.join(run, service.name, 'logs');
        return fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => name.endsWith('.log')).map(name => path.join(directory, name)) : [];
      });
      let bytes = 0, leaks = 0;
      for (const logPath of logPaths) { const scan = await scanSecretStream(fs.createReadStream(logPath), [...sensitive]); bytes += scan.bytes; leaks += scan.leaks; }
      const audit = await scanOwnedAuditLogs(state, [...sensitive], boundaries); bytes += audit.bytes; leaks += audit.leaks;
      check('service_and_persisted_audit_logs_do_not_expose_login_secrets', logPaths.length >= 6 && bytes > 0 && leaks === 0);
      evidence.secrets = true;
      console.log(`D1_LOG_SCAN: files=${logPaths.length}; bytes=${bytes}; sensitive_values=${sensitive.size}; plaintext_hits=${leaks}`);
    }
  } catch (error) { failure ||= error; }
  await browser?.close(); await server?.close();
  const message = failure ? String(failure.message).split('\n')[0].replace(/[\r\n]/g, ' ').slice(0, 220) : undefined;
  const safeMessage = message && [...sensitive].every(value => !message.includes(value)) ? message : failure ? 'D1 verification failed; inspect local bounded evidence' : undefined;
  write('requests.json', requests); save();
  write('result.json', { marker, passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length, browserErrors: browserErrors.length, failure: safeMessage });
  console.log(`D1_SUMMARY: passed=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; browser_errors=${browserErrors.length}`);
  if (failure) { console.log(`D1_FAILURE: ${safeMessage}`); process.exitCode = 1; }
}
