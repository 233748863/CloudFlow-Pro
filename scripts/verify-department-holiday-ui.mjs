import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createServer as createPortReservation } from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime', 'department-holiday-ui');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime', 'playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const reservation = createPortReservation();
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root] } } });
const checks = [];
const errors = [];
const requests = [];
const unexpectedRequests = [];
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };
const departmentId = 892201;
const defaultCalendarId = 892001;
const alternateCalendarId = 892002;
const disabledCalendarId = 892003;
const initialDepartment = () => ({ deptId: departmentId, parentId: 0, deptName: '日历验证部门', orderNum: 1, leader: '', phone: '', email: '', status: '0', holidayCalendarId: defaultCalendarId, version: 4, children: [] });
const initialCalendars = () => [
  { calendarId: defaultCalendarId, calendarCode: 'DEFAULT', calendarName: '租户标准日历', defaultFlag: 1, status: 'ENABLED' },
  { calendarId: alternateCalendarId, calendarCode: 'ALTERNATE', calendarName: '调班专用日历', defaultFlag: 0, status: 'ENABLED' },
  { calendarId: disabledCalendarId, calendarCode: 'DISABLED', calendarName: '停用历史日历', defaultFlag: 0, status: 'DISABLED' },
];
let departments = [initialDepartment()];
let calendars = initialCalendars();
let calendarPermission = true;
let calendarFailure = false;
let calendarGate;
let releaseCalendar;
let saveOutcome = 'success';
let saveGate;
let releaseSave;
let browser;
let page;
const calendarRequests = () => requests.filter((request) => request.path.endsWith('/holiday/calendar/list'));
const writes = () => requests.filter((request) => request.path === '/api/auth/system/dept' && ['POST', 'PUT'].includes(request.method));
const editDialog = () => page.getByRole('dialog', { name: '编辑部门', exact: true });
const calendarTrigger = () => page.getByRole('dialog').getByRole('button', { name: '节假日日历', exact: true });
const openEditor = async () => {
  await page.getByRole('button', { name: departments[0].deptName, exact: true }).click();
  await page.getByRole('button', { name: '编辑部门', exact: true }).first().click();
  await editDialog().waitFor();
};
const waitCalendarReady = () => page.waitForFunction(() => {
  const trigger = document.getElementById('department-holiday-calendar');
  return trigger && !trigger.disabled && trigger.getAttribute('aria-busy') === 'false';
});
const chooseCalendar = async (label) => {
  await calendarTrigger().click();
  await page.getByRole('option', { name: label, exact: true }).click();
};
const saveEdit = async () => {
  await editDialog().getByRole('button', { name: '保存', exact: true }).click();
  await editDialog().waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '编辑部门', exact: true }).first().waitFor();
};
const rectangle = (locator) => locator.evaluate((element) => {
  const bounds = element.getBoundingClientRect();
  return { width: bounds.width, height: bounds.height };
});

try {
  await fs.mkdir(output, { recursive: true });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object', 'isolated Vite listener has a port');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', (socket) => socket.close());
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) { unexpectedRequests.push(url.origin); return route.abort(); }
    if (url.pathname === '/department-holiday-check') {
      const entry = `/@fs/${path.join(root, 'scripts/platform-checks/DepartmentHolidayCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body style="color:var(--cf-text)"><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
    const body = request.postData() ? request.postDataJSON() : null;
    requests.push({ path: url.pathname, query: url.search, method: request.method(), body });
    const respond = (data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data }) });
    if (url.pathname === '/api/auth/info') return respond({ user: { userId: 892101, tenantId: 100000, userName: 'department-ui-check', nickName: '部门界面检查' }, roles: ['USER'], permissions: ['system:dept:list', 'system:dept:edit', 'system:dept:add', ...(calendarPermission ? ['system:holiday:list'] : [])] });
    if (url.pathname === '/api/auth/system/dept/tree') return respond(departments);
    if (url.pathname === '/api/auth/system/user/list') return respond({ rows: [], total: 0 });
    if (url.pathname === '/api/auth/system/holiday/calendar/list') {
      if (calendarGate) await calendarGate;
      if (calendarFailure) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, msg: '日历服务暂不可用' }) });
      return respond({ rows: calendars, total: calendars.length, pageNum: 1, pageSize: 200 });
    }
    if (url.pathname === '/api/auth/system/dept' && ['POST', 'PUT'].includes(request.method())) {
      if (saveGate) await saveGate;
      if (saveOutcome === 'conflict') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 409, msg: '部门已被其他操作修改，请刷新后重试' }) });
      if (saveOutcome === 'false') return respond(false);
      if (request.method() === 'POST') departments.push({ ...body, deptId: departmentId + 1, version: 0, children: [] });
      else departments = departments.map((department) => department.deptId === body.deptId ? { ...department, ...body, version: department.version + 1 } : department);
      return respond(true);
    }
    unexpectedRequests.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/department-holiday-check`);
  await page.getByRole('button', { name: '编辑部门', exact: true }).first().waitFor();
  check('未打开弹窗不请求日历列表', calendarRequests().length === 0);
  calendarGate = new Promise((resolve) => { releaseCalendar = resolve; });
  await openEditor();
  await page.getByText('正在加载可用日历，原日历配置保持不变。', { exact: true }).waitFor();
  check('日历加载期间禁止替换原配置', await calendarTrigger().isDisabled() && await calendarTrigger().getAttribute('aria-busy') === 'true');
  releaseCalendar();
  calendarGate = undefined;
  await waitCalendarReady();
  check('编辑回显当前日历并标出租户默认', (await calendarTrigger().textContent()).includes('租户标准日历（租户默认）'));
  check('日历标签和帮助说明关联真实按钮', await calendarTrigger().evaluate((element) => element.id === 'department-holiday-calendar' && element.getAttribute('aria-describedby') === 'department-holiday-help' && [...element.labels].some((label) => label.textContent === '节假日日历')));
  await calendarTrigger().focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('option', { name: '调班专用日历', exact: true }).waitFor();
  check('键盘展开且停用日历不能新选', await page.getByRole('option', { name: /停用历史日历/ }).count() === 0);
  await page.getByRole('option', { name: '调班专用日历', exact: true }).click();
  await saveEdit();
  check('保存发送部门ID、日历ID和读取版本', writes().at(-1).body.deptId === departmentId && writes().at(-1).body.holidayCalendarId === alternateCalendarId && writes().at(-1).body.version === 4);
  check('请求不发送内部字段标记或租户字段', !Object.hasOwn(writes().at(-1).body, 'holidayCalendarIdSpecified') && !Object.hasOwn(writes().at(-1).body, 'tenantId'));
  await openEditor();
  await waitCalendarReady();
  check('重新打开使用已保存配置', (await calendarTrigger().textContent()).includes('调班专用日历'));
  await chooseCalendar('继承租户默认日历');
  await saveEdit();
  check('清空发送显式JSON null及新版本', Object.hasOwn(writes().at(-1).body, 'holidayCalendarId') && writes().at(-1).body.holidayCalendarId === null && writes().at(-1).body.version === 5);
  await openEditor();
  await waitCalendarReady();
  check('清空后重新打开回显继承', (await calendarTrigger().textContent()).includes('继承租户默认日历'));
  await editDialog().getByPlaceholder('请输入部门名称', { exact: true }).fill('冲突后保留名称');
  await chooseCalendar('调班专用日历');
  saveOutcome = 'conflict';
  await editDialog().getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('部门已被其他操作修改，请刷新后重试', { exact: true }).first().waitFor();
  check('冲突保留名称与日历输入', await editDialog().getByPlaceholder('请输入部门名称', { exact: true }).inputValue() === '冲突后保留名称' && (await calendarTrigger().textContent()).includes('调班专用日历'));
  check('保存失败后允许重试且不写入替身状态', await editDialog().getByRole('button', { name: '保存', exact: true }).isEnabled() && departments[0].holidayCalendarId === null);
  saveOutcome = 'false';
  await editDialog().getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('部门未保存成功，请刷新后重试', { exact: true }).first().waitFor();
  check('接口返回false明确报错并保持弹窗', await editDialog().isVisible() && departments[0].holidayCalendarId === null);
  saveOutcome = 'success';
  saveGate = new Promise((resolve) => { releaseSave = resolve; });
  const beforeHeldSave = writes().length;
  const heldSaveRequest = page.waitForRequest((request) => request.url().endsWith('/api/auth/system/dept') && request.method() === 'PUT');
  await editDialog().getByRole('button', { name: '保存', exact: true }).click();
  await heldSaveRequest;
  check('保存期间禁用按钮及表单字段', await editDialog().getByRole('button', { name: '保存中…', exact: true }).isDisabled() && await editDialog().getByPlaceholder('请输入部门名称', { exact: true }).isDisabled() && await editDialog().getByRole('button', { name: '取消', exact: true }).isDisabled());
  await editDialog().getByRole('button', { name: '保存中…', exact: true }).evaluate((element) => { element.click(); element.click(); });
  await page.keyboard.press('Escape');
  check('保存期间重复点击不重发且Escape不关闭', writes().length === beforeHeldSave + 1 && await editDialog().isVisible() && await editDialog().getByRole('button', { name: '关闭弹窗', exact: true }).count() === 0);
  releaseSave();
  saveGate = undefined;
  await editDialog().waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '编辑部门', exact: true }).first().waitFor();

  calendarFailure = true;
  await openEditor();
  await editDialog().getByRole('button', { name: '重新加载日历', exact: true }).waitFor();
  check('日历请求失败明确提示并保留当前绑定', await calendarTrigger().isDisabled() && (await editDialog().getByRole('alert').textContent()).includes('原日历配置保持不变'));
  const beforeRetry = calendarRequests().length;
  calendarFailure = false;
  await editDialog().getByRole('button', { name: '重新加载日历', exact: true }).click();
  await waitCalendarReady();
  check('重新加载成功恢复选择且不重置绑定', calendarRequests().length === beforeRetry + 1 && (await calendarTrigger().textContent()).includes('调班专用日历'));
  await editDialog().getByRole('button', { name: '取消', exact: true }).click();
  calendars = initialCalendars().map((calendar) => ({ ...calendar, defaultFlag: 0 }));
  await openEditor();
  await waitCalendarReady();
  check('没有启用的默认日历时说明继承不可计算', await page.getByText('尚无启用的租户默认日历，选择继承后将无法按默认日历计算工作日。', { exact: true }).isVisible());
  await editDialog().getByRole('button', { name: '取消', exact: true }).click();

  calendars = initialCalendars();
  departments = [{ ...initialDepartment(), holidayCalendarId: disabledCalendarId }];
  await page.reload();
  await openEditor();
  await waitCalendarReady();
  check('已有停用绑定回显保留原配置', (await calendarTrigger().textContent()).includes('停用历史日历（保留原配置）'));
  await calendarTrigger().click();
  check('停用绑定选项禁止再次选择', await page.getByRole('option', { name: '停用历史日历（保留原配置）', exact: true }).getAttribute('aria-disabled') === 'true');
  await calendarTrigger().click();
  await editDialog().getByPlaceholder('请输入部门名称', { exact: true }).fill('保留停用日历改名');
  await saveEdit();
  check('无关修改保留停用日历ID', writes().at(-1).body.holidayCalendarId === disabledCalendarId);
  await openEditor();
  await waitCalendarReady();
  await chooseCalendar('继承租户默认日历');
  await saveEdit();
  check('已有停用绑定可以显式清空', writes().at(-1).body.holidayCalendarId === null);

  calendarPermission = false;
  departments = [initialDepartment()];
  const beforeDenied = calendarRequests().length;
  await page.reload();
  await openEditor();
  await page.getByText('当前账号没有日历列表权限，原日历配置保持不变。', { exact: true }).waitFor();
  check('没有列表权限不请求日历接口且控件禁用', calendarRequests().length === beforeDenied && await calendarTrigger().isDisabled());
  await editDialog().getByPlaceholder('请输入部门名称', { exact: true }).fill('仅修改部门名称');
  await saveEdit();
  check('没有列表权限保存时不改变原绑定', writes().at(-1).body.holidayCalendarId === defaultCalendarId && calendarRequests().length === beforeDenied);

  calendarPermission = true;
  departments = [initialDepartment()];
  await page.reload();
  await page.getByRole('button', { name: '新增根部门', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: '新增部门', exact: true });
  await waitCalendarReady();
  check('新增部门默认继承', (await calendarTrigger().textContent()).includes('继承租户默认日历'));
  await createDialog.getByPlaceholder('请输入部门名称', { exact: true }).fill('新增日历部门');
  await chooseCalendar('调班专用日历');
  await createDialog.getByRole('button', { name: '创建', exact: true }).click();
  await createDialog.waitFor({ state: 'detached' });
  check('新增提交日历且不伪造部门ID和版本', writes().at(-1).method === 'POST' && writes().at(-1).body.holidayCalendarId === alternateCalendarId && !Object.hasOwn(writes().at(-1).body, 'deptId') && !Object.hasOwn(writes().at(-1).body, 'version'));

  await openEditor();
  await waitCalendarReady();
  for (const [theme, width] of [['light', 1440], ['dark', 1440], ['light', 375], ['dark', 375], ['light', 320]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
    check(`${theme}/${width}px部门弹窗不超出窗口`, (await rectangle(editDialog().locator('.cf-dialog-panel'))).width <= width);
    check(`${theme}/${width}px日历与保存触控高度至少44px`, (await rectangle(calendarTrigger())).height >= 44 && (await rectangle(editDialog().getByRole('button', { name: '保存', exact: true }))).height >= 44);
    await calendarTrigger().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check('减少动画设置停用日历按钮过渡', await calendarTrigger().evaluate((element) => getComputedStyle(element).transitionDuration === '0s'));
  check('所有API均为本机隔离响应，无额外服务调用', unexpectedRequests.length === 0);
  check('页面运行时异常为零', errors.length === 0);
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ scope: 'actual OrgStructure and AuthProvider with controlled HTTP responses; not real server authorization or database E2E', checks, errors, requests, unexpectedRequests }, null, 2));
  console.log(`DEPARTMENT_HOLIDAY_UI: assertions=${checks.length}; failed=0; controlled_http=true; production_data_modified=false`);
  console.log(`DEPARTMENT_HOLIDAY_UI_EVIDENCE=${output}`);
} catch (error) {
  await page?.screenshot({ path: path.join(output, 'failed.png'), fullPage: true });
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify({ checks, errors, requests, unexpectedRequests, failure: error.message }, null, 2));
  throw error;
} finally {
  releaseCalendar?.();
  releaseSave?.();
  await browser?.close();
  await server.close();
  console.log('DEPARTMENT_HOLIDAY_UI_LISTENER_STOPPED=true');
}
