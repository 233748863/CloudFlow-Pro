// Ordinary deployed-page checks. Session cookies enter through stdin and remain in memory.
// No intercepted API, independent runtime, screenshot, video or trace is created.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const settings = JSON.parse(input);
input = '';
const moduleFile = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE
  || path.resolve('../.cloudflow-runtime/playwright/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(moduleFile).href);
const candidates = [1194, 1181].map(version => path.join(process.env.LOCALAPPDATA,
  `ms-playwright/chromium-${version}/chrome-win/chrome.exe`));
const executablePath = process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE || candidates.find(file => fs.existsSync(file));
assert(executablePath, 'A previously installed Chromium is required');
const browser = await chromium.launch({ headless: true, executablePath });
const routes = [
  ['/', /待办|工作台|快捷/],
  ['/tasks', /我的任务|审批待办/],
  ['/hr/ess/attendance', /考勤|打卡/],
  ['/leave/apply', /请假/],
  ['/hr/ess/overtime', /加班/],
  ['/announcement', /公告/],
  ['/schedule', /日程/],
  ['/meeting-room', /会议/],
  ['/office/crm/activity', /活动|跟进/],
  ['/office/crm/tickets', /工单/],
];
const errors = new Set();
const exceptions = [];
let currentRoute = '';
let completed = 0;
let page;
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 850 } });
  await context.addCookies(settings.cookies);
  page = await context.newPage();
  const responses = [];
  let recentTrace;
  page.on('pageerror', error => exceptions.push(error.message.slice(0, 200)));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 400)
      errors.add(`${currentRoute} ${response.status()} ${url.pathname}`);
    if (url.pathname.startsWith('/api/')) responses.push(url.pathname);
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/oa/error-report') {
      const trace = response.headers()['x-trace-id'];
      if (trace) recentTrace = { traceId: trace, path: url.pathname };
    }
  });
  if (settings.errorOnly) {
    currentRoute = 'trace:/';
    await page.goto(settings.entry + '/', { waitUntil: 'networkidle', timeout: 25000 });
    assert(!new URL(page.url()).pathname.startsWith('/login'), 'Active app session required');
    assert(recentTrace, 'A real business response must provide a trace identifier');
    const message = `ordinary-error-verification-${settings.tag}-${Date.now()}`;
    const lastBusiness = { ...recentTrace };
    const sent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/oa/error-report', { timeout: 15000 });
    await page.evaluate(message => window.dispatchEvent(new ErrorEvent('error', {
      message, error: new Error(message),
    })), message);
    const reported = await sent;
    const payload = reported.request().postDataJSON();
    assert.equal(payload.message, message);
    assert.equal(payload.traceId, lastBusiness.traceId, 'Ordinary errors must carry the latest real request trace');
    assert.equal(reported.status(), 200);
    assert.equal((await reported.json()).code, 200);
    assert.equal(exceptions.length, 0);
    console.log('BROWSER_ERROR_REPORT', JSON.stringify({ message, traceId: payload.traceId,
      businessPath: lastBusiness.path, reportHttp: reported.status() }));
    await context.close();
  } else if (settings.printOnly || settings.hrPrintOnly) {
    const item = settings.printCase;
    const expectedRoutes = settings.hrPrintOnly
      ? { SALARY_SLIP: '/hr/ess/slips', CERTIFICATE: '/hr/ess/certificates' }
      : { EXPENSE_CLAIM: '/expense/claim', PURCHASE_ORDER: '/office/purchase-request' };
    assert(item && expectedRoutes[item.bizType] === item.route, 'Only the selected missing print page is in scope');
    assert(Number.isSafeInteger(item.bizId) && item.bizId > 0 && item.documentNo && item.templateName);
    currentRoute = `1440:${item.route}`;
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.goto(settings.entry + item.route, { waitUntil: 'networkidle', timeout: 25000 });
    assert(!new URL(page.url()).pathname.startsWith('/login'), 'An active app session is required');
    assert.equal(await page.getByRole('dialog', { name: '首次登录需修改密码', exact: true }).count(), 0,
      'The dedicated account must complete its normal password-change prerequisite');
    for (let pageNumber = 2; pageNumber <= item.pageNum; pageNumber++) {
      const [listed] = await Promise.all([
        page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === `/api/oa/${item.bizType === 'EXPENSE_CLAIM' ? 'expense/claim' : 'purchase/request'}/list`
            && url.searchParams.get('pageNum') === String(pageNumber);
        }),
        page.getByRole('button', { name: '下一页', exact: true }).click(),
      ]);
      assert.equal(listed.status(), 200);
    }
    const row = page.getByRole('row').filter({ has: page.getByText(item.documentNo, { exact: true }) });
    if (settings.hrPrintOnly) {
      await row.waitFor({ state: 'visible', timeout: 10000 });
      assert.equal(await row.count(), 1, 'One owned HR sample must be visible');
      if (item.bizType === 'SALARY_SLIP') {
        const [detailLoaded] = await Promise.all([
          page.waitForResponse(response => new URL(response.url()).pathname
            === `/api/hr/ess/salary-slips/${item.bizId}`),
          row.getByRole('button', { name: '查看工资单', exact: true }).click(),
        ]);
        assert.equal(detailLoaded.status(), 200);
        const detail = page.getByRole('dialog', { name: `工资单 ${item.documentNo}`, exact: true });
        await detail.getByRole('button', { name: '打印', exact: true }).click();
      } else {
        await row.getByRole('button', { name: '打印', exact: true }).click();
      }
    } else {
    await row.getByRole('button', { name: '详情', exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    const [detailLoaded] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname
        === `/api/oa/${item.bizType === 'EXPENSE_CLAIM' ? 'expense/claim' : 'purchase/request'}/${item.bizId}`),
      row.getByRole('button', { name: '详情', exact: true }).click(),
    ]);
    assert.equal(detailLoaded.status(), 200, 'The real business detail must load');
    const detail = page.getByRole('dialog', { name: item.documentNo, exact: true });
    await detail.getByRole('button', { name: '打印', exact: true }).click();
    }
    const printDialog = page.getByRole('dialog', { name: '打印业务单据', exact: true });
    await printDialog.getByRole('button', { name: '打印模板', exact: true }).click();
    await page.getByRole('option', { name: item.templateName, exact: true }).click();
    const outputFormat = item.outputFormat || 'PDF';
    assert(['PDF', 'EXCEL'].includes(outputFormat), 'Only the requested missing format is in scope');
    await printDialog.getByRole('button', { name: '输出格式', exact: true })
      .getByText(outputFormat === 'EXCEL' ? 'Excel' : 'PDF', { exact: true }).waitFor();
    const [result] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname
        === `/api/auth/system/print/${item.bizType}/${item.bizId}` && response.request().method() === 'POST'),
      printDialog.getByRole('button', { name: '生成并下载', exact: true }).click(),
    ]);
    assert.equal(result.status(), 200, 'The real print request must succeed');
    const bytes = await result.body();
    if (outputFormat === 'EXCEL') {
      assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'The button must return a real workbook');
      assert.match(result.headers()['content-type'] || '', /spreadsheetml/);
    } else assert.equal(bytes.subarray(0, 5).toString(), '%PDF-', 'The button must return a real PDF');
    assert.match(result.headers()['cache-control'] || '', /no-store/);
    await printDialog.waitFor({ state: 'hidden' });
    await page.getByText('打印文件已生成，打印记录已保存', { exact: true }).waitFor();
    assert.equal(errors.size, 0, 'No failed API responses in this print page scope');
    assert.equal(exceptions.length, 0, 'No uncaught page exceptions');
    console.log('BROWSER_PRINT', JSON.stringify({ bizType: item.bizType, bizId: item.bizId,
      documentNo: item.documentNo, width: 1440, detailHttp: 200, printHttp: result.status(),
      bytes: bytes.length, format: outputFormat, noStore: true,
      ...(outputFormat === 'EXCEL' ? { workbook: bytes.toString('base64') } : {}),
      realDetailButton: item.bizType !== 'CERTIFICATE', realListButton: item.bizType === 'CERTIFICATE' }));
    await context.close();
  } else if (settings.importOnly) {
    assert(Number.isSafeInteger(settings.importTask) && settings.importTask > 0, 'Existing import task required');
    const route = `/system/import?bizType=SUPPLIER&taskId=${settings.importTask}`;
    currentRoute = `1440:${route}`;
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.goto(settings.entry + route, { waitUntil: 'networkidle', timeout: 25000 });
    assert.equal(await page.getByRole('dialog', { name: '首次登录需修改密码', exact: true }).count(), 0,
      'Use a dedicated account with its password-change prerequisite completed');
    const dialog = page.getByRole('dialog', { name: '供应商导入', exact: true });
    await dialog.getByText('错误明细（1 条）', { exact: true }).waitFor();
    assert((await dialog.innerText()).includes(settings.importStatus === 'VALIDATED' ? '待导入' : '部分成功'),
      'Real task status must be visible');
    const badRow = dialog.getByRole('row').filter({ has: page.getByRole('cell', { name: '供应商名称', exact: true }) });
    assert.equal(await badRow.count(), 1, 'One real supplier error row');
    assert.equal(await badRow.getByRole('cell').first().innerText(), '3', 'Actual source row number');
    assert((await badRow.innerText()).includes('不能为空'), 'Actual required-field error');
    assert((await dialog.innerText()).includes('必填 1'), 'Error classification count must be visible');
    const downloaded = page.waitForResponse(response => new URL(response.url()).pathname
      === `/api/oa/system/import/${settings.importTask}/errors/file`, { timeout: 15000 });
    await dialog.getByRole('button', { name: '下载错误文件', exact: true }).click();
    const report = await downloaded;
    assert.equal(report.status(), 200);
    const bytes = await report.body();
    assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'Real error workbook returned by the button');
    console.log('BROWSER_IMPORT_DESKTOP', JSON.stringify({ taskId: settings.importTask, status: settings.importStatus || 'PARTIAL',
      errorRow: 3, column: '供应商名称', classification: '必填 1', downloadHttp: report.status(), bytes: bytes.length }));
    currentRoute = `375:${route}`;
    await page.setViewportSize({ width: 375, height: 850 });
    await page.getByRole('dialog', { name: '批量导入', exact: true }).getByText('请到桌面端导入', { exact: true }).waitFor();
    assert((await page.locator('body').innerText()).includes('手机端可查看进度，请到桌面端导入和核对文件。'));
    assert.equal(await page.locator('input[type=file]').count(), 0, 'Mobile must not present an upload input');
    assert.equal(exceptions.length, 0, 'No uncaught page exceptions');
    assert.equal(errors.size, 0, 'No failed API responses in the import page scope');
    console.log('BROWSER_IMPORT_MOBILE', JSON.stringify({ width: 375, guidance: true, fileInputs: 0 }));
    console.log('BROWSER_IMPORT_PASS', JSON.stringify({ pages: 2, widths: [1440, 375],
      scope: 'existing supplier task, real error table, download button and mobile guidance; no reimport' }));
    await context.close();
  } else {
  let started = !settings.start;
  for (const width of [375, 320, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const [route, expected] of routes) {
      if (`${width}:${route}` === settings.start) started = true;
      if (!started) continue;
      currentRoute = `${width}:${route}`;
      const before = responses.length;
      await page.goto(settings.entry + route, { waitUntil: 'networkidle', timeout: 25000 });
      assert(!new URL(page.url()).pathname.startsWith('/login'), 'Session must be accepted by the deployed app');
      const body = await page.locator('body').innerText();
      assert(expected.test(body), `Expected business content: ${width} ${route}`);
      assert(!/页面加载失败|应用发生错误|强制修改密码|请先修改密码/.test(body), `Page failed: ${width} ${route}`);
      const size = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert(size.scroll <= size.viewport + 2, `Page overflow: ${width} ${route} ${JSON.stringify(size)}`);
      if (width === 375 && route === '/tasks') {
        await page.getByRole('button', { name: '筛选', exact: true }).click();
        await page.getByLabel('流程标题或编号', { exact: true }).fill(settings.tag);
        await page.getByRole('button', { name: '查看结果', exact: true }).click();
        await page.getByText('当前筛选：', { exact: false }).waitFor();
      }
      console.log('BROWSER_PAGE', JSON.stringify({ width, route, apiResponses: responses.length - before,
        employeePrerequisite: /未关联员工|尚未关联员工|未绑定员工|没有关联员工|找不到员工/.test(body) }));
      completed++;
    }
  }
  await page.setViewportSize({ width: 1440, height: 850 });
  for (const [route, expected] of [['/system/import', /批量导入/], ['/system/print/template', /打印模板|模板管理/]]) {
    currentRoute = `1440:${route}`;
    await page.goto(settings.entry + route, { waitUntil: 'networkidle', timeout: 25000 });
    assert(expected.test(await page.locator('body').innerText()), `Expected management page ${route}`);
    console.log('BROWSER_MANAGEMENT', route);
    completed++;
  }
  assert.equal(exceptions.length, 0, 'No uncaught page exceptions: ' + JSON.stringify(exceptions));
  console.log('BROWSER_PASS', JSON.stringify({ pages: completed, widths: [320, 375, 1440],
    scope: 'rendering, real HTTP, task filter; no real-device camera/location or PWA claim' }));
  await context.close();
  }
} catch (error) {
  console.error('BROWSER_FAILURE', String(error.message).slice(0, 700));
  if (page && (settings.printOnly || settings.hrPrintOnly)) console.error('BROWSER_PRINT_DIALOGS',
    JSON.stringify(await page.getByRole('dialog').allTextContents().catch(() => [])));
  if (page) console.error('BROWSER_BODY', (await page.locator('main').innerText().catch(() => '')).slice(0, 1800));
  process.exitCode = 1;
} finally {
  console.log('BROWSER_HTTP_ERRORS', JSON.stringify([...errors]));
  console.log('BROWSER_EXCEPTIONS', JSON.stringify(exceptions));
  await browser.close();
}
