import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createServer as createPortReservation } from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime', 'holiday-date-ui');
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
const year = new Date().getFullYear();
const month = new Date().getMonth() + 1;
const monthText = String(month).padStart(2, '0');
const nonTripleDate = `${year}-${monthText}-16`;
const tripleDate = `${year}-${monthText}-17`;
const makeupDate = `${year}-${monthText}-19`;
const calendarId = 896001;
const calendars = [{ calendarId, calendarCode: 'UI_CHECK', calendarName: '年度日历界面样本', region: '隔离检查', defaultFlag: 1, weeklyRestDays: '6,7', workStartTime: '09:00', workEndTime: '18:00', lunchStartTime: '12:00', lunchEndTime: '13:00', status: 'ENABLED' }];
let rows = [
  { dateId: 896101, calendarId, holidayDate: nonTripleDate, dateType: 'HOLIDAY', holidayName: '非三倍样本', triplePayFlag: 0, yearNo: year },
  { dateId: 896102, calendarId, holidayDate: tripleDate, dateType: 'HOLIDAY', holidayName: '三倍样本', triplePayFlag: 1, yearNo: year },
  { dateId: 896103, calendarId, holidayDate: makeupDate, dateType: 'WORKDAY', holidayName: '调休样本', triplePayFlag: 0, yearNo: year },
];
let canEdit = true;
let saveFailure = false;
let readFailure = false;
let heldYear;
let yearGate;
let releaseYear;
let browser;
let page;
const dateRow = (date) => page.getByRole('row').filter({ has: page.getByRole('button', { name: date, exact: true }) });
const writes = () => requests.filter((request) => request.path.endsWith('/date/batch'));
const editor = () => page.getByRole('dialog', { name: '编辑例外日期', exact: true });
const openEditor = async (date) => {
  await dateRow(date).getByRole('button', { name: date, exact: true }).click();
  await editor().waitFor();
};
const stageEditor = async () => {
  await editor().getByRole('button', { name: '暂存日期', exact: true }).click();
  await editor().waitFor({ state: 'detached' });
};
const saveYear = async () => {
  const finished = page.waitForResponse((response) => response.url().includes('/date/batch'));
  await page.getByRole('button', { name: '保存全年配置', exact: true }).click();
  await finished;
};

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
    if (url.pathname === '/holiday-date-check') {
      const entry = `/@fs/${path.join(root, 'scripts/platform-checks/HolidayDateCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body style="color:var(--cf-text)"><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
    const body = request.postData() ? request.postDataJSON() : null;
    requests.push({ path: url.pathname, query: url.search, method: request.method(), body });
    const respond = (data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data }) });
    if (url.pathname === '/api/auth/info') return respond({ user: { userId: 896201, tenantId: 100000, userName: 'holiday-date-ui-check' }, roles: ['USER'], permissions: ['system:holiday:list', 'system:holiday:query', ...(canEdit ? ['system:holiday:edit'] : [])] });
    if (url.pathname.endsWith('/holiday/calendar/list')) return respond({ rows: calendars, total: calendars.length, pageNum: 1, pageSize: 200 });
    if (url.pathname.endsWith('/holiday/date/list')) {
      if (readFailure) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, msg: '日期读取失败样本' }) });
      const requestedYear = Number(url.searchParams.get('yearNo'));
      const responseRows = rows.filter((row) => row.yearNo === requestedYear);
      if (requestedYear === heldYear && yearGate) await yearGate;
      return respond(responseRows);
    }
    if (url.pathname.endsWith('/holiday/query/month')) {
      const requestedYear = Number(url.searchParams.get('year'));
      const requestedMonth = Number(url.searchParams.get('month'));
      const dates = Array.from({ length: new Date(requestedYear, requestedMonth, 0).getDate() }, (_, index) => {
        const date = `${requestedYear}-${String(requestedMonth).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
        const explicit = rows.find((row) => row.holidayDate === date);
        const weekday = new Date(requestedYear, requestedMonth - 1, index + 1).getDay();
        return { date, dateType: explicit?.dateType || (weekday === 0 || weekday === 6 ? 'REST' : 'WORKDAY'), holidayName: explicit?.holidayName || '', triplePayFlag: explicit?.triplePayFlag || 0 };
      });
      return respond(dates);
    }
    if (url.pathname.endsWith('/holiday/date/batch') && request.method() === 'POST') {
      if (saveFailure) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, msg: '日期保存失败样本' }) });
      rows = [...rows.filter((row) => row.yearNo !== body.yearNo), ...body.dates.map((row, index) => ({ ...row, dateId: 896101 + index, calendarId: body.calendarId, yearNo: body.yearNo }))];
      return respond(null);
    }
    unexpectedRequests.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/holiday-date-check?calendarId=${calendarId}`);
  await dateRow(nonTripleDate).waitFor();
  check('加载HOLIDAY显式0时显示非三倍，不得改成3倍', await dateRow(nonTripleDate).getByText('非三倍', { exact: true }).count() === 1);
  check('加载HOLIDAY显式1时保留三倍', await dateRow(tripleDate).getByText('3 倍', { exact: true }).count() === 1);
  check('月视图显式0不显示三倍工资标记', await page.getByRole('button', { name: `${nonTripleDate}，法定节假日`, exact: true }).getByText('三倍工资日', { exact: true }).count() === 0);
  check('月视图调休日期保留类型', await page.getByRole('button', { name: `${makeupDate}，调休上班`, exact: true }).isVisible());
  await openEditor(nonTripleDate);
  check('编辑器回显显式0且允许有权限者选择', await editor().getByRole('switch', { name: '三倍工资日', exact: true }).getAttribute('aria-checked') === 'false' && await editor().getByRole('switch', { name: '三倍工资日', exact: true }).isEnabled());
  await editor().getByPlaceholder('例如 春节', { exact: true }).fill('保留非三倍修改名称');
  await stageEditor();
  check('暂存名称不擅改工资标记', await dateRow(nonTripleDate).getByText('非三倍', { exact: true }).count() === 1);
  await saveYear();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('保存全年配置') && button.disabled));
  check('保存载荷保留0且不带数据库或租户字段', writes().at(-1).body.dates.find((row) => row.holidayDate === nonTripleDate).triplePayFlag === 0 && writes().at(-1).body.dates.every((row) => !Object.hasOwn(row, 'dateId') && !Object.hasOwn(row, 'tenantId')));
  await openEditor(nonTripleDate);
  await editor().getByRole('switch', { name: '三倍工资日', exact: true }).click();
  await stageEditor();
  check('显式设置1在暂存列表显示三倍', await dateRow(nonTripleDate).getByText('3 倍', { exact: true }).count() === 1);
  await openEditor(tripleDate);
  await editor().getByRole('switch', { name: '三倍工资日', exact: true }).click();
  await stageEditor();
  check('显式取消三倍工资日后保持0', await dateRow(tripleDate).getByText('非三倍', { exact: true }).count() === 1);
  await openEditor(nonTripleDate);
  await editor().getByRole('button', { name: '日期类型', exact: true }).click();
  await page.getByRole('option', { name: '调休上班', exact: true }).click();
  check('改为工作日时标记归零且不允许开启三倍', await editor().getByRole('switch', { name: '三倍工资日', exact: true }).getAttribute('aria-checked') === 'false' && await editor().getByRole('switch', { name: '三倍工资日', exact: true }).isDisabled());
  await editor().getByRole('button', { name: '日期类型', exact: true }).click();
  await page.getByRole('option', { name: '法定节假日', exact: true }).click();
  check('改回节假日不自动认定为三倍工资日', await editor().getByRole('switch', { name: '三倍工资日', exact: true }).getAttribute('aria-checked') === 'false');
  await editor().getByRole('button', { name: '取消', exact: true }).click();
  await saveYear();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('保存全年配置') && button.disabled));
  check('显式1和0同时到达保存接口', writes().at(-1).body.dates.find((row) => row.holidayDate === nonTripleDate).triplePayFlag === 1 && writes().at(-1).body.dates.find((row) => row.holidayDate === tripleDate).triplePayFlag === 0);

  await page.getByRole('button', { name: '批量录入', exact: true }).click();
  const batch = page.getByRole('dialog', { name: '批量录入例外日期', exact: true });
  const batchDate = `${year}-${monthText}-20`;
  const beforeBatchWrites = writes().length;
  await batch.getByRole('textbox').fill(`\n${batchDate},HOLIDAY,批量非三倍,0,隔离样本\n${year}-${monthText}-21,WORKDAY,,1,非法工资标记`);
  await batch.getByRole('button', { name: '解析并暂存', exact: true }).click();
  await page.getByText('第 3 行工作日或休息日的三倍工资标记必须为 0', { exact: true }).first().waitFor();
  check('批量错误保留原始空行行号且不部分暂存', await batch.isVisible() && await dateRow(batchDate).count() === 0 && writes().length === beforeBatchWrites);
  await batch.getByRole('textbox').fill(`${batchDate},HOLIDAY,缺少标记`);
  await batch.getByRole('button', { name: '解析并暂存', exact: true }).click();
  await page.getByText('第 1 行必须明确填写是否三倍工资日：0 或 1；格式为日期,类型,名称,是否三倍工资日,备注', { exact: true }).first().waitFor();
  check('批量必须显式提供工资标记', await batch.isVisible() && await dateRow(batchDate).count() === 0);
  await batch.getByRole('textbox').fill(`${batchDate},HOLIDAY,重复日期,0\n${batchDate},HOLIDAY,重复日期,1`);
  await batch.getByRole('button', { name: '解析并暂存', exact: true }).click();
  await page.getByText(`第 2 行日期重复：${batchDate}`, { exact: true }).first().waitFor();
  check('批量重复日期不合并为不确定工资标记', await dateRow(batchDate).count() === 0);
  await batch.getByRole('textbox').fill(`${year}-02-30,HOLIDAY,非法日期,0`);
  await batch.getByRole('button', { name: '解析并暂存', exact: true }).click();
  await page.getByText(`第 1 行日期无效或不属于 ${year} 年`, { exact: true }).first().waitFor();
  check('批量非法公历日期不被自动进位', await batch.isVisible());
  await batch.getByRole('textbox').fill(`${batchDate},HOLIDAY,批量非三倍,0,隔离样本\n${year}-${monthText}-21,HOLIDAY,批量三倍,1,隔离样本\n${year}-${monthText}-22,WORKDAY,,0,调休样本\n${year}-${monthText}-23,REST,,0,休息样本`);
  await batch.getByRole('button', { name: '解析并暂存', exact: true }).click();
  await batch.waitFor({ state: 'detached' });
  check('批量暂存保留逐行工资标记', await dateRow(batchDate).getByText('非三倍', { exact: true }).count() === 1 && await dateRow(`${year}-${monthText}-21`).getByText('3 倍', { exact: true }).count() === 1);
  saveFailure = true;
  await saveYear();
  await page.getByText('日期保存失败样本', { exact: true }).first().waitFor();
  check('全年保存失败保留草稿及原服务端数据', await dateRow(batchDate).count() === 1 && !rows.some((row) => row.holidayDate === batchDate));
  saveFailure = false;
  await saveYear();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('保存全年配置') && button.disabled));
  check('重试后逐行0与1到达保存接口', rows.find((row) => row.holidayDate === batchDate).triplePayFlag === 0 && rows.find((row) => row.holidayDate === `${year}-${monthText}-21`).triplePayFlag === 1);

  canEdit = false;
  await page.reload();
  await dateRow(nonTripleDate).waitFor();
  check('只读角色没有保存、新增或批量入口', await page.getByRole('button', { name: '保存全年配置', exact: true }).count() === 0 && await page.getByRole('button', { name: '新增日期', exact: true }).count() === 0 && await page.getByRole('button', { name: '批量录入', exact: true }).count() === 0);
  await dateRow(nonTripleDate).getByRole('button', { name: nonTripleDate, exact: true }).click();
  await page.getByRole('dialog', { name: '节假日日期详情', exact: true }).waitFor();
  check('只读角色点日期仅查看详情', await editor().count() === 0 && await page.getByRole('button', { name: '暂存日期', exact: true }).count() === 0);
  canEdit = true;
  readFailure = true;
  await page.reload();
  await page.getByRole('alert').filter({ hasText: '日期读取失败样本' }).first().waitFor();
  check('年度读取失败时禁止用空列表覆盖', await page.getByRole('button', { name: '新增日期', exact: true }).isDisabled() && await page.getByRole('button', { name: '批量录入', exact: true }).isDisabled() && await page.getByRole('button', { name: '保存全年配置', exact: true }).isDisabled());
  readFailure = false;
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await dateRow(nonTripleDate).waitFor();

  heldYear = year + 1;
  rows.push({ holidayDate: `${year + 1}-01-01`, dateType: 'HOLIDAY', holidayName: '陈旧响应样本', triplePayFlag: 0, yearNo: year + 1 });
  yearGate = new Promise((resolve) => { releaseYear = resolve; });
  const heldRequest = page.waitForRequest((request) => request.url().includes('/date/list') && new URL(request.url()).searchParams.get('yearNo') === String(year + 1));
  await page.getByRole('spinbutton').fill(String(year + 1));
  await page.getByRole('spinbutton').press('Enter');
  await heldRequest;
  check('年度读取未完成时禁用写入', await page.getByRole('button', { name: '新增日期', exact: true }).isDisabled());
  await page.getByRole('spinbutton').fill(String(year + 2));
  await page.getByRole('spinbutton').press('Enter');
  await page.getByText('本年度暂无例外日期', { exact: true }).waitFor();
  const releasedResponse = page.waitForResponse((response) => response.url().includes('/date/list') && new URL(response.url()).searchParams.get('yearNo') === String(year + 1));
  releaseYear();
  yearGate = undefined;
  await releasedResponse;
  await page.getByText('本年度暂无例外日期', { exact: true }).waitFor();
  check('陈旧年度响应不能覆盖新年度', await page.getByText('陈旧响应样本', { exact: true }).count() === 0 && await page.getByRole('spinbutton').inputValue() === String(year + 2));
  await page.getByRole('spinbutton').fill(String(year));
  await page.getByRole('spinbutton').press('Enter');
  await dateRow(nonTripleDate).waitFor();
  await openEditor(nonTripleDate);
  await editor().locator('.cf-date-trigger').click();
  const picker = page.locator('.cf-date-dropdown');
  await picker.waitFor();
  check('日期选择器以文字和可访问说明标出节假日', await picker.getByRole('button', { name: `${tripleDate}，法定节假日，三倍样本`, exact: true }).getByText('假', { exact: true }).isVisible());
  check('日期选择器标出调休上班', await picker.getByRole('button', { name: `${makeupDate}，调休上班，调休样本`, exact: true }).getByText('班', { exact: true }).isVisible());
  check('日期选择器保留工资标记差异', (await picker.getByRole('button', { name: new RegExp(`^${nonTripleDate}，`) }).getAttribute('aria-label')).includes('三倍工资日') && !(await picker.getByRole('button', { name: new RegExp(`^${tripleDate}，`) }).getAttribute('aria-label')).includes('三倍工资日'));
  for (const [theme, width] of [['light', 1440], ['dark', 1440], ['light', 375], ['dark', 375], ['light', 320]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
    check(`${theme}/${width}px日期选择器不超出窗口`, await picker.evaluate((element) => { const bounds = element.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= window.innerWidth; }));
    await page.screenshot({ path: path.join(output, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  check('页面运行时异常为零', errors.length === 0);
  check('没有请求真实外部服务', unexpectedRequests.length === 0);
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ scope: 'actual HolidayDatePage with controlled HTTP responses; not real server authorization or database E2E', checks, errors, requests, unexpectedRequests }, null, 2));
  console.log(`HOLIDAY_DATE_UI: assertions=${checks.length}; failed=0; controlled_http=true; production_data_modified=false`);
  console.log(`HOLIDAY_DATE_UI_EVIDENCE=${output}`);
} catch (error) {
  await page?.screenshot({ path: path.join(output, 'failed.png'), fullPage: true });
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify({ checks, errors, requests, unexpectedRequests, failure: error.message }, null, 2));
  throw error;
} finally {
  releaseYear?.();
  await browser?.close();
  await server.close();
  console.log('HOLIDAY_DATE_UI_LISTENER_STOPPED=true');
}
