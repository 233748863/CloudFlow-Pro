import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d1-pages') && process.argv.includes('--d1-leave'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d1-pages-live-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const evidenceRoot = path.dirname(output);
const read = relative => JSON.parse(fs.readFileSync(path.join(evidenceRoot, relative), 'utf8').replace(/^\uFEFF/, ''));
const cycle = read('d1-cycle-live-20261005-r2/fixture.json');
const leave = read('d1-leave-live-20261005-r3/fixture.json');
assert.equal(read('d1-cycle-live-20261005-r2/result.json').passed, true);
assert.equal(read('d1-leave-live-20261005-r3/result.json').passed, true);
const runtime = await createD1LeaveRuntime(root, output);
const { database, rows, ok, check, checks, requests, sessions, browserErrors, sensitive } = runtime;
const evidence = { adminDesktop: false, adminMobile: false, employeeDesktop: false, employeeMobile: false, preservation: false, bindingRestored: false, secrets: false };
const screenshots = [], uiRequests = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const employeeId = id(leave.employeeId), cycleEmployee = id(cycle.employees[0]);
const accountId = id(sessions.employee.identity.userId);
const base = '/hr/attendance/leave';
const transactionNames = { ALLOCATION: '额度分配', APPLICATION: '请假扣减', CARRY_FORWARD: '周期结转', EXPIRY: '额度过期', ENCASHMENT: '假期折现', ADJUSTMENT: '人工调整', COMPENSATORY: '调休转入', FREEZE: '审批冻结', UNFREEZE: '审批解冻' };
let failure, originalHash, bound = false, activePage;
const mobileContexts = [];
const businessSnapshot = () => hash(JSON.stringify([
  database('SELECT * FROM hr_leave_ledger ORDER BY ledger_id'),
  database('SELECT * FROM hr_leave_quota ORDER BY id'),
  database('SELECT * FROM hr_time_request ORDER BY id'),
]));
const origin = actor => new URL(sessions[actor].page.url()).origin;
function trackPage(actor, page) {
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/hr/')) uiRequests.push({ actor, path: url.pathname, method: response.request().method(), status: response.status() });
  });
}
for (const [actor, session] of Object.entries(sessions)) trackPage(actor, session.page);
// Keep the real login pages available for signed API calls; navigation pages restore the same session using its cookies.
const desktopPages = {};
for (const actor of ['admin', 'employee']) {
  const page = await sessions[actor].context.newPage();
  desktopPages[actor] = page; trackPage(actor + '_desktop', page);
  page.on('pageerror', () => browserErrors.push(actor + '_desktop'));
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  screenshots.push(name + '.png');
}
async function waitRows(page, count) {
  await page.waitForFunction(expected => {
    const table = [...document.querySelectorAll('table')].find(value => value.getBoundingClientRect().width && value.getBoundingClientRect().height);
    const lines = table?.querySelectorAll('tbody tr');
    return lines?.length === expected && [...lines].every(row => row.querySelectorAll('td').length > 1);
  }, count, { timeout: 30000 });
}
async function tableRows(page) {
  return page.locator('table:visible tbody tr').evaluateAll(values => values.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent.trim())));
}
async function selectEmployee(page, employeeNo) {
  await page.getByRole('combobox', { name: '选择员工', exact: true }).click();
  await page.getByPlaceholder('搜索员工姓名 / 工号 / 部门...').fill(employeeNo);
  await page.getByRole('option').filter({ hasText: employeeNo }).click();
  await page.getByPlaceholder('搜索员工姓名 / 工号 / 部门...').waitFor({ state: 'hidden' });
}
async function loadLedger(page, selectedEmployee, typeId, periodId = '') {
  await page.getByRole('combobox', { name: /^假期\s*\*?$/ }).selectOption(id(typeId));
  await page.getByRole('combobox', { name: '周期', exact: true }).selectOption(String(periodId));
  const responsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/hr/attendance/leave/ledger' && url.searchParams.get('employeeId') === String(selectedEmployee)
      && url.searchParams.get('leaveTypeId') === String(typeId) && (url.searchParams.get('periodId') || '') === String(periodId);
  });
  await page.getByRole('button', { name: '查询台账', exact: true }).click();
  const response = await responsePromise, body = await response.json();
  check('ledger_page_real_response', response.status() === 200 && body.code === 200 && body.data.length > 0);
  await waitRows(page, body.data.length);
  return body.data;
}
async function verifyLedger(page, values, periods, label) {
  const rendered = await tableRows(page);
  check(label + '_row_count', rendered.length === values.length);
  const balances = new Map();
  for (const [index, row] of values.entries()) {
    const key = String(row.periodId), sum = (balances.get(key) || 0) + Math.round(Number(row.leaveDays) * 100);
    balances.set(key, sum);
    check(label + '_balance_math_' + row.ledgerId, Math.round(Number(row.runningBalance) * 100) === sum);
    const unit = row.quantityUnit === 'HOUR' ? '小时' : '天';
    const expected = [periods.find(period => String(period.periodId) === key)?.periodName, transactionNames[row.transactionType],
      Number(row.leaveDays).toFixed(2) + ' ' + unit, (sum / 100).toFixed(2) + ' ' + unit];
    check(label + '_cells_' + row.ledgerId, expected.every((value, column) => value && rendered[index][column] === value));
  }
}
async function mobileTable(page, label) {
  const dimensions = await page.locator('table:visible').evaluate(table => {
    const wrapper = table.closest('.admin-horizontal-scroll');
    wrapper.scrollLeft = wrapper.scrollWidth;
    return { viewport: window.innerWidth, document: document.documentElement.scrollWidth, available: wrapper.clientWidth,
      content: wrapper.scrollWidth, scrolled: wrapper.scrollLeft };
  });
  check(label + '_horizontal_scroll', dimensions.content > dimensions.available && dimensions.scrolled > 0);
  check(label + '_page_has_no_horizontal_overflow', dimensions.document <= dimensions.viewport);
  await page.locator('table:visible').evaluate(table => { table.closest('.admin-horizontal-scroll').scrollLeft = 0; });
}
async function verifyAdmin(periods) {
  const page = desktopPages.admin, label = 'admin_desktop', mobile = false;
  activePage = page;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin('admin') + '/hr/leave-rules', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '假期政策与台账', exact: true }).waitFor();
  if (!mobile) {
    for (const [tab, endpoint] of [['周期','/periods'], ['政策明细','/policies'], ['政策分配','/policy-assignments'], ['请假申请','/attendance/time-requests']]) {
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(endpoint));
      await page.getByRole('tab', { name: tab, exact: true }).click();
      const response = await responsePromise, body = await response.json();
      check('admin_tab_' + tab + '_loads', response.status() === 200 && body.code === 200);
    }
  }
  await page.getByRole('tab', { name: '额度台账', exact: true }).click();
  await selectEmployee(page, cycle.marker + '-carry');
  const all = await loadLedger(page, cycleEmployee, cycle.types.monthly);
  check(label + '_two_periods_16_rows', all.length === 16 && new Set(all.map(row => String(row.periodId))).size === 2);
  await verifyLedger(page, all, periods, label + '_all');
  if (mobile) await mobileTable(page, label);
  await screenshot(page, label + '-ledger');
  const next = await loadLedger(page, cycleEmployee, cycle.types.monthly, cycle.nextPeriod);
  check(label + '_period_filter', next.length === 2 && next.every(row => String(row.periodId) === String(cycle.nextPeriod)));
  await verifyLedger(page, next, periods, label + '_next');
  check(label + '_zero_balance_visible', (await tableRows(page)).at(-1)[3] === '0.00 天');
  await screenshot(page, label + '-zero-balance');
  if (!mobile) {
    await selectEmployee(page, leave.marker);
    const hours = await loadLedger(page, employeeId, leave.types.hours, leave.periodId);
    check('admin_hour_allocation', hours.length === 1 && Number(hours[0].runningBalance) === 8 && hours[0].quantityUnit === 'HOUR');
    await verifyLedger(page, hours, periods, 'admin_hours');
    await screenshot(page, 'admin-desktop-hours');
    const actual = await loadLedger(page, employeeId, leave.types.base, leave.periodId);
    check('admin_real_approval_transactions', ['ALLOCATION','APPLICATION','FREEZE','UNFREEZE'].every(kind => actual.some(row => row.transactionType === kind)));
    await verifyLedger(page, actual, periods, 'admin_real_approval');
    await page.getByRole('button', { name: '调整 / 调休转入 / 折现', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: '追加额度变动', exact: true }).waitFor();
    check('manual_entry_types_available', (await dialog.getByRole('combobox', { name: /^变动类型/ }).locator('option').allTextContents()).join('|') === '请选择|人工调整|调休转入|假期折现');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
}
async function verifyEmployee(mobile, quotas, applications, types, mobilePage) {
  const page = mobile ? mobilePage : desktopPages.employee, label = mobile ? 'employee_mobile' : 'employee_desktop';
  const activate = locator => mobile ? tapB2Mobile(locator) : locator.click();
  activePage = page;
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/hr/ess/leave/quotas')
    .then(async response => ({ status: response.status(), body: await response.json() }));
  await page.goto(origin('employee') + '/hr/ess/leave-balance', { waitUntil: 'domcontentloaded' });
  const response = await responsePromise;
  check(label + '_real_quota_response', response.status === 200 && response.body.code === 200);
  await page.getByRole('heading', { name: '我的假期与请假', exact: true }).waitFor();
  await waitRows(page, quotas.length);
  const renderedQuotas = await tableRows(page);
  for (const quota of quotas) {
    const type = types.find(value => String(value.id) === String(quota.leaveTypeId));
    const expected = [type.leaveName, String(quota.periodId), String(quota.totalQuota), String(quota.usedQuota), String(quota.frozenQuota), String(quota.availableQuota), type.unit === 'HOUR' ? '小时' : '天'];
    check(label + '_quota_' + quota.leaveTypeId, renderedQuotas.some(row => expected.every((value, index) => value === row[index])));
  }
  if (mobile) await mobileTable(page, label + '_quotas');
  await screenshot(page, label + '-quotas');
  await activate(page.getByRole('tab', { name: '请假申请', exact: true }));
  await waitRows(page, applications.length);
  const renderedApplications = await tableRows(page);
  const statuses = { APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已撤回' };
  for (const request of applications) {
    const row = renderedApplications.find(value => value[0] === request.requestNo);
    check(label + '_application_' + request.id, row && row[4] === Number(request.duration).toFixed(2) + (request.unit === 'HOUR' ? ' 小时' : ' 天') && row[5] === statuses[request.status]);
  }
  check(label + '_finished_requests_have_no_cancel_action', await page.getByRole('button', { name: '撤回申请', exact: true }).count() === 0);
  if (mobile) await mobileTable(page, label + '_requests');
  await screenshot(page, label + '-requests');
  await activate(page.getByRole('button', { name: '申请请假', exact: true }));
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: /^假期类型/ }).selectOption(id(leave.types.base));
  await dialog.getByLabel('开始时间', { exact: false }).and(dialog.locator('input')).fill('2026-09-28T09:00');
  await dialog.getByLabel('结束时间', { exact: false }).and(dialog.locator('input')).fill('2026-09-28T11:00');
  await dialog.getByRole('textbox', { name: /^请假事由/ }).fill('页面验收试算，不提交');
  await activate(dialog.getByRole('button', { name: '试算请假数量', exact: true }));
  await dialog.getByRole('status').filter({ hasText: '0.50 天（按工作日历计算）' }).waitFor();
  check(label + '_half_day_calculation_visible', true);
  await screenshot(page, label + '-calculate');
  await dialog.getByRole('combobox', { name: /^假期类型/ }).selectOption(id(leave.types.hours));
  check(label + '_stale_calculation_cleared', await dialog.getByRole('status').innerText() === '');
  await dialog.getByLabel('结束时间', { exact: false }).and(dialog.locator('input')).fill('2026-09-28T18:00');
  await activate(dialog.getByRole('button', { name: '试算请假数量', exact: true }));
  await dialog.getByRole('status').filter({ hasText: '8.00 小时（按工作日历计算）' }).waitFor();
  check(label + '_hour_calculation_visible', true);
  await activate(dialog.getByRole('button', { name: '取消', exact: true }));
  await dialog.waitFor({ state: 'hidden' });
}
try {
  check('employee_account_originally_unbound', database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${accountId} AND deleted=0`) === '0');
  const originalEmployee = rows(`SELECT JSON_OBJECT('employeeNo',employee_no,'userId',CAST(user_id AS CHAR)) FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId} AND deleted=0`)[0];
  check('historical_owned_employee_is_unbound', originalEmployee?.employeeNo === leave.marker && originalEmployee.userId === null);
  originalHash = businessSnapshot();
  const periods = await ok('admin', base + '/periods');
  await verifyAdmin(periods); evidence.adminDesktop = true;
  console.log('D1_PAGES_ADMIN: desktop=true; ledger_periods=2; rows=16; hours=true; zero=true');
  const adminMobile = await createB2MobileBrowser({ admin: sessions.admin.page, secrets: sensitive, check, landingPath: '/tasks', landingHeading: '我的任务' });
  mobileContexts.push(adminMobile); activePage = adminMobile.page; trackPage('admin_mobile', adminMobile.page);
  adminMobile.page.on('pageerror', () => browserErrors.push('admin_mobile'));
  await adminMobile.page.goto(origin('admin') + '/hr/leave-rules', { waitUntil: 'domcontentloaded' });
  await adminMobile.page.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true }).waitFor();
  check('admin_mobile_keeps_existing_desktop_guidance', await adminMobile.page.getByRole('button', { name: '查询台账', exact: true }).count() === 0);
  await screenshot(adminMobile.page, 'admin-mobile-guidance'); evidence.adminMobile = true;
  console.log('D1_PAGES_ADMIN: mobile_guidance=true; width=390; touch=true');
  bound = true;
  await ok('admin', '/hr/employees/' + employeeId, 'PUT', { ...leave.employeeBody, userId: accountId });
  check('temporary_binding_verified', database(`SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId}`) === accountId);
  const quotas = await ok('employee', '/hr/ess/leave/quotas'), applications = await ok('employee', '/hr/ess/leave/mine'), types = await ok('employee', '/hr/ess/leave/types');
  console.log(`D1_PAGES_OWN_RECORDS: quotas=${quotas.length}; applications=${applications.length}; foreign_rows=${[...quotas, ...applications].filter(row => String(row.employeeId) !== employeeId).length}`);
  check('employee_api_only_owned_records', quotas.length === 10 && applications.length === 5 && [...quotas, ...applications].every(row => String(row.employeeId) === employeeId));
  for (const [resource, originals] of [['quotas', quotas], ['mine', applications]]) {
    const tampered = await ok('employee', '/hr/ess/leave/' + resource + '?employeeId=' + cycleEmployee + '&tenantId=200000');
    check('self_service_ignores_forged_owner_' + resource, JSON.stringify(tampered) === JSON.stringify(originals));
  }
  check('three_final_approval_outcomes', ['APPROVED','REJECTED','CANCELLED'].every(status => applications.some(row => row.status === status)));
  await verifyEmployee(false, quotas, applications, types); evidence.employeeDesktop = true;
  console.log('D1_PAGES_EMPLOYEE: desktop=true; quotas=10; applications=5; calculation=true');
  // Start on a different route so the observed quota response belongs to the navigation under test.
  const employeeMobile = await createB2MobileBrowser({ admin: sessions.employee.page, secrets: sensitive, check, landingPath: '/tasks', landingHeading: '我的任务' });
  mobileContexts.push(employeeMobile); trackPage('employee_mobile', employeeMobile.page);
  employeeMobile.page.on('pageerror', () => browserErrors.push('employee_mobile'));
  await verifyEmployee(true, quotas, applications, types, employeeMobile.page); evidence.employeeMobile = true;
  console.log('D1_PAGES_EMPLOYEE: mobile=true; width=390; scroll=true; calculation=true');
  check('no_unhandled_browser_error', browserErrors.length === 0);
  check('no_failed_hr_page_response', uiRequests.length > 0 && uiRequests.every(request => request.status < 400));
  check('pages_did_not_submit_business_mutations', uiRequests.filter(request => request.method !== 'GET').every(request => request.method === 'PUT' && request.path === '/api/hr/employees/' + employeeId));
} catch (error) {
  failure = error;
  try {
    if (activePage) await activePage.screenshot({ path: path.join(output, 'failure-page.png'), fullPage: true });
    const diagnostic = String(error.stack || error.message).slice(0, 6000);
    if ([...sensitive].every(value => !diagnostic.includes(value))) fs.writeFileSync(path.join(output, 'failure.txt'), diagnostic);
  } catch { /* Preserve the original failure. */ }
}
finally {
  try {
    if (bound) {
      check('owned_binding_matches_before_restore', database(`SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId}`) === accountId);
      await ok('admin', '/hr/employees/' + employeeId, 'PUT', { ...leave.employeeBody, userId: null });
    }
    check('original_account_binding_restored', database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${accountId} AND deleted=0`) === '0');
    const unbound = await runtime.api('employee', '/hr/ess/leave/quotas');
    check('unbound_account_cannot_read_leave_quotas', (unbound.status !== 200 || unbound.body?.code !== 200) && !Array.isArray(unbound.body?.data));
    evidence.bindingRestored = true;
  } catch (error) { failure ||= error; }
  try { check('all_ledger_quota_and_application_rows_preserved', !!originalHash && originalHash === businessSnapshot()); evidence.preservation = true; } catch (error) { failure ||= error; }
  for (const context of mobileContexts) { try { await context.close(); } catch (error) { failure ||= error; } }
  try { const scan = await runtime.scan(); evidence.secrets = true; console.log('D1_PAGES_LOG_SCAN: ' + JSON.stringify(scan)); } catch (error) { failure ||= error; }
  await runtime.close();
  const message = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safeMessage = message && [...sensitive].every(value => !message.includes(value)) ? message : failure ? 'D1 pages failed; inspect bounded evidence' : undefined;
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify({ direct: requests, pages: uiRequests }, null, 2));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length, pageRequests: uiRequests.length, screenshots, originalBusinessHash: originalHash, browserErrors: browserErrors.length, failure: safeMessage }, null, 2));
  console.log(`D1_PAGES_SUMMARY: passed=${checks.length}; failed=${failure ? 1 : 0}; screenshots=${screenshots.length}; preservation=${evidence.preservation}; binding_restored=${evidence.bindingRestored}; browser_errors=${browserErrors.length}`);
  if (failure) { console.log('D1_PAGES_FAILURE: ' + safeMessage); process.exitCode = 1; }
}
