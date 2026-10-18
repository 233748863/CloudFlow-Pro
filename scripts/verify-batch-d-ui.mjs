import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime', 'playwright'), 'package.json'));
const { chromium } = requireBrowser('playwright-core');
const origin = process.env.CLOUDFLOW_UI_PREVIEW || 'http://127.0.0.1:4187';
assert.equal(new URL(origin).hostname, '127.0.0.1', 'Only an isolated loopback preview is allowed');
const pages = [
  ['/hr/leave-rules', 'pages/hr/rules/HrLeaveRulesPage', '假期规则', /假期/],
  ['/hr/attendance', 'pages/hr/rules/HrAttendanceRulesPage', '考勤规则', /考勤规则/],
  ['/hr/payroll', 'pages/hr/rules/HrPayrollPage', '薪资批次', /薪资/],
  ['/hr/grievances', 'pages/hr/rules/HrGrievancePage', '员工申诉', /申诉/],
  ['/hr/ess/leave-balance', 'pages/hr/ess/HrEssLeaveBalancePage', '我的假期', /假期|请假/],
  ['/hr/ess/payroll', 'pages/hr/ess/HrEssPayrollPage', '我的工资', /工资|薪资/],
  ['/hr/ess/grievances', 'pages/hr/ess/HrEssGrievancePage', '我的申诉', /申诉/],
];
const menus = pages.map(([routePath, component, menuName], index) => ({ menuId: 1450 + index, parentId: 0, orderNum: index, path: routePath, component, menuName, menuType: 'C', visible: '0', status: '0', icon: 'Users' }));
const sampleShift = { id: 900020, shiftCode: 'D-NIGHT', shiftName: '夜班验收', startTime: '22:00', endTime: '06:00', breakMinutes: 60, workMinutes: 420, status: 1 };
const sampleRule = { id: 900020, ruleCode: 'D-NIGHT', ruleName: '夜班规则验收', shiftId: 900020, checkMethods: ['APP'], status: 1, configJson: { breakStartTime: '00:00', breakEndTime: '01:00', geofence: { latitude: 31.2, longitude: 121.4, radiusMeters: 150 }, retainedSetting: 'preserve-me' } };
const sampleSchedule = { id: 900020, targetType: 'EMPLOYEE', targetId: 900020, targetName: '夜班验收员工', shiftId: 900020, ruleId: 900020, status: 'ACTIVE' };
const results = [];
const errors = [];
const requests = new Set();
const writes = [];
let permissions = ['*:*:*'];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await context.addCookies([{ name: 'XSRF-TOKEN', value: 'batch-d-local-only', url: origin }]);
await context.routeWebSocket('**/*', socket => socket.close());
await context.route('**/*', async route => {
  const request = route.request();
  const address = new URL(request.url());
  if (address.origin !== origin) return route.abort();
  if (!address.pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
    return route.continue();
  }
  const apiPath = address.pathname.substring(4);
  requests.add(apiPath);
  let data = [];
  if (!['GET', 'HEAD'].includes(request.method())) {
    writes.push({ path: apiPath, method: request.method(), body: request.postDataJSON() });
    data = 900020;
  } else if (apiPath === '/auth/info') {
    data = { user: { userId: 900020, userName: 'isolated-check', nickName: '隔离验收', tenantId: 100000, deptId: 103, status: '0' }, roles: ['hr'], permissions };
  } else if (apiPath === '/auth/getRouters') data = menus;
  else if (apiPath === '/auth/system/dict/data/type/hr_grievance_type') data = ['SALARY', 'PERFORMANCE', 'MANAGEMENT', 'WORKPLACE', 'POLICY', 'OTHER'].map((value, index) => ({ dictCode: index + 1, dictSort: index + 1, dictValue: value, dictLabel: index === 0 ? '薪资（统一字典验收）' : value, dictType: 'hr_grievance_type', status: '0' }));
  else if (apiPath === '/hr/attendance/shifts') data = [sampleShift];
  else if (apiPath === '/hr/attendance/rules') data = [sampleRule];
  else if (apiPath === '/hr/attendance/schedules') data = [sampleSchedule];
  else if (['/hr/grievances', '/hr/ess/grievances', '/hr/ess/salary-slips'].includes(apiPath)) data = { rows: [], total: 0 };
  else if (/unread.*count|unreadCount/i.test(apiPath)) data = 0;
  else if (/\/list$|\/page$/.test(apiPath)) data = { records: [], rows: [], list: [], total: 0 };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, msg: '隔离模拟响应', data }) });
});

const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.setDefaultTimeout(10000);
try {
  for (const [routePath, , , heading] of pages) {
    await page.goto(origin + routePath, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: heading }).first().waitFor();
    const labels = await page.locator('.cf-tabs .cf-tab').allTextContents();
    for (const label of labels) {
      const tab = page.locator('.cf-tabs').getByRole('button', { name: label, exact: true });
      await tab.click();
      await page.waitForLoadState('networkidle');
      assert.ok((await tab.getAttribute('class')).includes('cf-tab-active'));
    }
    results.push({ route: routePath, tabs: labels });
  }
  await page.getByRole('button', { name: '提交申诉', exact: true }).click();
  const grievanceDialog = page.getByRole('dialog');
  const grievanceType = grievanceDialog.locator('select').and(grievanceDialog.getByLabel('申诉类型'));
  assert.equal(await grievanceType.locator('option').count(), 7);
  assert.equal(await grievanceType.locator('option[value="SALARY"]').innerText(), '薪资（统一字典验收）');
  await grievanceDialog.getByRole('button', { name: '取消', exact: true }).click();
  results.push({ check: 'grievance-form-uses-shared-dictionary', passed: true });
  await page.goto(origin + '/hr/attendance', { waitUntil: 'networkidle' });
  await page.locator('.cf-tabs').getByRole('button', { name: '打卡规则', exact: true }).click();
  const ruleRow = page.getByRole('row').filter({ hasText: '夜班规则验收' });
  await ruleRow.getByRole('button', { name: '修改', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const breakStart = dialog.locator('input').and(dialog.getByLabel('班内休息开始（夜班部分请假必填）'));
  const breakEnd = dialog.locator('input').and(dialog.getByLabel('班内休息结束', { exact: true }));
  assert.equal(await breakStart.inputValue(), '00:00');
  assert.equal(await breakEnd.inputValue(), '01:00');
  await breakStart.fill('00:15');
  await breakEnd.fill('01:15');
  await page.screenshot({ path: path.join(root, '.cloudflow-runtime', 'playwright', 'batch-d-night-breaks.png'), fullPage: true });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const saved = writes.find(write => write.path === '/hr/attendance/rules/900020' && write.method === 'PUT');
  assert.ok(saved, 'Editing the night break submits the existing rule');
  assert.equal(saved.body.configJson.breakStartTime, '00:15');
  assert.equal(saved.body.configJson.breakEndTime, '01:15');
  assert.equal(saved.body.configJson.geofence.radiusMeters, 150);
  assert.equal(saved.body.configJson.retainedSetting, 'preserve-me');
  assert.equal(Object.hasOwn(saved.body, 'breakStartTime'), false);
  results.push({ check: 'night-break-edit-preserves-existing-configuration', passed: true });
  permissions = ['hr:attendance:list', 'hr:attendance:add'];
  await page.reload({ waitUntil: 'networkidle' });
  for (const [tabName, title] of [['班次', '班次'], ['打卡规则', '打卡规则'], ['排班', '排班']]) {
    await page.locator('.cf-tabs').getByRole('button', { name: tabName, exact: true }).click();
    await page.getByRole('button', { name: `新增${title}`, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '修改', exact: true }).count(), 0);
  }
  results.push({ check: 'create-only-permissions-never-expose-edit-actions', passed: true });
  assert.deepEqual(errors, [], 'No browser runtime or console errors');
  console.log(`PASS: ${pages.length} HR pages, ${results.filter(result => result.tabs).reduce((total, result) => total + result.tabs.length, 0)} tabs, grievance dictionary, night-break payload and create/edit permission checks`);
} finally {
  await fs.writeFile(path.join(root, '.cloudflow-runtime', 'batch-d-ui-results.json'), JSON.stringify({ results, errors, requests: [...requests], writes }, null, 2));
  await context.close();
  await browser.close();
}
