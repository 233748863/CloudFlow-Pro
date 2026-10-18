import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = path.resolve(input.output);
assert.equal(path.basename(output), 'record-browser');
assert.equal(path.dirname(path.dirname(output)), path.join(path.dirname(frontend), '.cloudflow-runtime', 'batch-g-integration'));
const upstream = new URL(input.authBase);
assert.equal(upstream.hostname, '127.0.0.1');
assert.equal(upstream.protocol, 'http:');
const modulePath = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE;
assert.ok(modulePath && existsSync(modulePath), 'Installed Playwright module required');
const { chromium } = await import(pathToFileURL(modulePath).href);
const sourceFiles = ['src/pages/system/message/Record.tsx', 'src/pages/system/message/DeliveryDetail.tsx',
  'src/pages/system/message/options.ts', 'src/services/api/message.ts', 'src/services/api/auth.ts',
  'src/services/api/request.ts', 'src/context/AuthContext.tsx', 'src/utils/authStorage.ts',
  'src/components/common/PermissionGuard.tsx', 'src/components/common/WarningConfirmDialog.tsx',
  'src/pages/system/_components/InfrastructurePrimitives.tsx', 'src/pages/system/_components/useInfrastructurePage.ts',
  'src/components/common/Pagination.tsx', 'src/components/common/table.tsx',
  'src/components/common/BaseDialog.tsx', 'src/components/common/ModalOverlay.tsx',
  'src/components/mobile/MobileListCard.tsx', 'src/hooks/useBreakpoint.ts',
  'src/index.css', 'src/styles/unity2-refresh.css', 'src/styles/mobile-foundation.css',
  'scripts/message-record-browser/fixture.tsx', 'scripts/message-record-browser/index.html',
  'scripts/check-message-record-live-browser.mjs'];
const hash = file => createHash('sha256').update(readFileSync(path.join(frontend, file))).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, hash(file)]));
const checks = [], errors = [], requests = [], screenshots = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log('PASS ' + label); };
const recordPath = '/api/auth/system/message/record/';
const config = { configFile: false, root: frontend, logLevel: 'warn', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(frontend, 'src') } },
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false,
    rollupOptions: { input: path.join(frontend, 'scripts/message-record-browser/index.html') } } };
let browser, server, failure = null, browserVersion;
mkdirSync(output);
async function open(name, width, height, user = 'admin') {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies(input.sessions[user]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) errors.push(name + ': failed ' + new URL(request.url()).pathname);
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      requests.push({ name, method: request.method(), path: url.pathname, query: Object.fromEntries(url.searchParams) });
    }
  });
  const loaded = page.waitForResponse(res => res.url().includes(recordPath + 'list'))
    .then(response => ({ response }), error => ({ error }));
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/scripts/message-record-browser/index.html');
  await page.getByTestId('record-fixture-ready').waitFor();
  const loadedResult = await loaded;
  if (loadedResult.error) throw loadedResult.error;
  const response = loadedResult.response;
  const document = await response.json();
  return { context, page, initial: document, name };
}
async function listAction(page, action, predicate = () => true) {
  const response = page.waitForResponse(res => res.url().includes(recordPath + 'list') && predicate(new URL(res.url())));
  await action();
  const document = await (await response).json();
  assert.equal(document.code, 200);
  await page.getByText('正在加载记录', { exact: true }).waitFor({ state: 'hidden' });
  return document.data;
}
async function select(page, index, label) {
  await page.locator('form button[aria-haspopup="listbox"]').nth(index).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function dates(page, begin, end = begin) {
  await page.locator('form input[type=date]').nth(0).fill(begin);
  await page.locator('form input[type=date]').nth(1).fill(end);
}
async function query(page) {
  return listAction(page, () => page.getByRole('button', { name: '查询记录', exact: true }).click());
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.jpg'), type: 'jpeg' });
  screenshots.push(name + '.jpg');
}
const row = (page, id) => page.locator('tbody tr').filter({
  has: page.getByRole('checkbox', { name: '选择消息 ' + id, exact: true }),
});
async function resend(page, action, expected, name, capture = false) {
  await action();
  const dialog = page.getByRole('dialog', { name: '确认重发失败消息' });
  await dialog.waitFor();
  if (capture) await shot(page, name + '-confirm');
  const pending = page.waitForResponse(res => res.request().method() === 'POST' && res.url().endsWith('/resend'));
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  const response = await pending;
  const document = await response.json();
  check(document.code === 200 && document.data.requested === expected && document.data.accepted === expected,
    name + ': real browser resend accepted ' + expected + ' sources');
  const headers = await response.request().allHeaders();
  check(Boolean(headers['x-csrf-token']), name + ': formal request attaches actual CSRF token');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '刷新', exact: true }).waitFor({ state: 'visible' });
  await page.getByText('正在加载记录', { exact: true }).waitFor({ state: 'hidden' });
}
async function waitForLinkedRecords(page, sources, name) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await listAction(page, () => page.getByRole('button', { name: '刷新', exact: true }).click());
    if (sources.every(source => result.rows.some(record => String(record.resendFromId) === source.id))) {
      check(true, name + ': actual queued deliveries appear as linked records before next viewport');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(name + ': linked delivery records did not appear within 30000ms');
}
try {
  await build(config);
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, open: false,
    proxy: { '/api/auth': { target: input.authBase, changeOrigin: true,
      rewrite: value => value.replace(/^\/api\/auth/, '') } } } });
  browser = await chromium.launch({ headless: true,
    ...(process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  for (const [index, name, width, height] of [[0, 'desktop', 1440, 1000], [1, 'mobile', 390, 844]]) {
    const { context, page, initial } = await open(name, width, height);
    check(initial.code === 200 && initial.data.total > 10, name + ': real session loads paginated records');
    await page.locator('tbody tr').first().waitFor();
    const firstIds = initial.data.rows.map(record => String(record.recordId));
    const secondPage = await listAction(page, () => page.getByRole('button', { name: '下一页', exact: true }).click(),
      url => url.searchParams.get('pageNum') === '2');
    check(secondPage.rows.length > 0 && secondPage.rows.every(record => !firstIds.includes(String(record.recordId))),
      name + ': pagination reaches different real records');
    await dates(page, '2031-01-15');
    const statisticResponse = page.waitForResponse(res => res.url().includes(recordPath + 'statistics')
      && new URL(res.url()).searchParams.get('beginTime') === '2031-01-15');
    const datePage = await query(page);
    const stats = (await (await statisticResponse).json()).data;
    check(datePage.total === 7 && datePage.rows.length === 7
      && !datePage.rows.some(record => ['970008', '970009', '970010'].includes(String(record.recordId))),
    name + ': page date range excludes midnight and foreign tenant');
    check(stats.total === 7 && stats.success === 2 && stats.failed === 2 && stats.unknown === 1,
      name + ': page statistics use actual seven-record database scope');
    await page.getByText('接纳率 28.6%', { exact: true }).waitFor();
    await page.getByText('各渠道成功率', { exact: true }).click();
    await page.getByText('各模板成功率', { exact: true }).click();
    await page.getByText('主要失败原因', { exact: true }).click();
    check(await page.locator('details').nth(0).getByText('25.0%', { exact: true }).count() === 1
      && await page.locator('details').nth(1).getByText('50.0%', { exact: true }).count() === 1
      && await page.getByText('REJECTED：2 条', { exact: true }).count() === 1,
    name + ': actual rates and FAILED-only reason are rendered');
    check(await page.getByRole('checkbox', { name: '选择消息 970001', exact: true }).isEnabled()
      && await page.getByRole('checkbox', { name: '选择消息 970003', exact: true }).isDisabled(),
    name + ': actual failed record selectable and unknown disabled');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ': no horizontal overflow');
    await shot(page, name + '-statistics');
    const filtered = await listAction(page, () => select(page, 0, '邮件'));
    check(filtered.total === 4, name + ': channel filter reaches actual backend');
    await listAction(page, () => select(page, 1, '发送失败'));
    await page.locator('form input').nth(0).fill('PA');
    await page.locator('form input').nth(1).fill('A');
    await page.locator('form input').nth(2).fill('701');
    const combined = await query(page);
    check(combined.total === 1 && String(combined.rows[0].recordId) === '970001',
      name + ': all seven UI filters combine through real HTTP');
    check(await page.getByText('接纳率 28.6%', { exact: true }).count() === 1,
      name + ': non-date filters preserve full-date statistics');
    await page.getByRole('button', { name: '查看详情', exact: true }).click();
    const detail = page.getByRole('dialog', { name: '发送记录详情' });
    await detail.waitFor();
    check((await detail.innerText()).includes('record-content') && (await detail.innerText()).includes('970001'),
      name + ': real record details show matching content and id');
    check(await detail.evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1; }),
      name + ': real detail fits viewport');
    await shot(page, name + '-detail');
    await detail.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await listAction(page, () => select(page, 0, '短信'));
    await page.locator('form input').nth(0).fill('');
    await page.locator('form input').nth(1).fill('');
    await page.locator('form input').nth(2).fill('');
    await dates(page, '');
    await query(page);
    const sources = input.sources.slice(index * 3, index * 3 + 3);
    const [single, ...batch] = sources;
    await resend(page, () => row(page, single.id).getByRole('button', { name: '重新发送', exact: true }).click(),
      1, name + '-single', true);
    for (const source of batch) await page.getByRole('checkbox', { name: '选择消息 ' + source.id, exact: true }).check();
    await resend(page, () => page.getByRole('button', { name: '重发所选（2）', exact: true }).click(), 2, name + '-batch');
    check(await page.getByRole('button', { name: '重发所选（0）', exact: true }).isDisabled(),
      name + ': accepted batch clears page selection');
    await waitForLinkedRecords(page, sources, name);
    await dates(page, '2031-02-01');
    const empty = await query(page);
    check(empty.total === 0, name + ': real empty query returns no rows');
    await page.getByText('暂无匹配记录', { exact: true }).waitFor();
    check(await page.locator('tbody input[type=checkbox]').count() === 0, name + ': empty page has no selectable records');
    await context.close();
  }
  const tenant = await open('tenant', 1440, 1000, 'tenant');
  await dates(tenant.page, '2031-01-15');
  const tenantRows = await query(tenant.page);
  check(tenantRows.total === 1 && String(tenantRows.rows[0].recordId) === '970010',
    'real tenant browser sees only its own record');
  await tenant.context.close();
  const readonly = await open('readonly', 390, 844, 'readonly');
  check(readonly.initial.code === 403, 'real readonly browser list denied by backend');
  check(await readonly.page.getByRole('button', { name: /^重发所选/ }).count() === 0
    && await readonly.page.getByRole('checkbox').count() === 0, 'real readonly browser exposes no resend controls');
  await readonly.context.close();
  check(requests.filter(item => item.method === 'POST' && item.path.endsWith('/resend')).length === 4,
    'exactly two single and two batch real resend requests');
  check(requests.every(item => item.path === '/api/auth/info' || item.path.startsWith(recordPath)),
    'all browser business requests use the actual auth service paths');
  check(errors.length === 0, 'no browser runtime or API transport errors');
  check(sourceFiles.every(file => hash(file) === sourceHashes[file]), 'all declared frontend input hashes unchanged');
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack };
  console.error(error.stack);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, assertions: checks.length,
    checks, failure, errors, requests, screenshots, browserVersion, sourceHashes,
    backend: 'owned real authenticated HTTP; no route mocks', globalComplete: false }, null, 2));
}
if (failure) process.exitCode = 1;
