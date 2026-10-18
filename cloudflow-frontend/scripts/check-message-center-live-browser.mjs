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
assert.equal(path.basename(output), 'center-browser');
assert.equal(path.dirname(path.dirname(output)), path.join(path.dirname(frontend), '.cloudflow-runtime', 'batch-g-integration'));
for (const base of [input.authBase, input.oaBase]) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  assert.equal(new URL(base).protocol, 'http:');
}
const modulePath = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE;
assert.ok(modulePath && existsSync(modulePath), 'Installed Playwright module required');
const { chromium } = await import(pathToFileURL(modulePath).href);
const files = ['src/components/common/UnifiedMessageBell.tsx', 'src/pages/system/message/Mine.tsx',
  'src/pages/system/message/options.ts', 'src/services/api/message.ts', 'src/services/api/notice.ts',
  'src/services/api/announcement.ts', 'src/stores/announcementStore.ts', 'src/services/api/auth.ts',
  'src/services/api/request.ts', 'src/context/AuthContext.tsx', 'src/utils/authStorage.ts',
  'src/utils/navigation.ts', 'src/components/common/PermissionGuard.tsx',
  'src/pages/system/_components/InfrastructurePrimitives.tsx', 'src/pages/system/_components/useInfrastructurePage.ts',
  'src/components/common/Pagination.tsx', 'src/components/common/table.tsx',
  'src/components/common/BaseDialog.tsx', 'src/components/common/ModalOverlay.tsx',
  'src/components/common/AnnouncementDetailModal.tsx', 'src/components/common/announcement-overlays.css',
  'src/components/mobile/MobileListCard.tsx', 'src/hooks/useBreakpoint.ts',
  'src/index.css', 'src/styles/unity2-refresh.css', 'src/styles/mobile-foundation.css',
  'scripts/message-center-browser/fixture.tsx', 'scripts/message-center-browser/index.html',
  'scripts/check-message-center-live-browser.mjs'];
const hash = file => createHash('sha256').update(readFileSync(path.join(frontend, file))).digest('hex');
const sourceHashes = Object.fromEntries(files.map(file => [file, hash(file)]));
const checks = [], errors = [], requests = [], screenshots = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log('PASS ' + label); };
const minePath = '/api/auth/system/message/mine';
const config = { configFile: false, root: frontend, logLevel: 'warn', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(frontend, 'src') } },
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false,
    rollupOptions: { input: path.join(frontend, 'scripts/message-center-browser/index.html') } } };
let browser, server, failure = null, browserVersion;
mkdirSync(output);
const entry = () => 'http://127.0.0.1:' + server.httpServer.address().port + '/scripts/message-center-browser/index.html';
async function open(name, width, height, user) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies(input.sessions[user]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) errors.push(name + ': failed ' + new URL(request.url()).pathname
      + ': ' + request.failure()?.errorText);
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) requests.push({ name, method: request.method(), path: url.pathname,
      query: Object.fromEntries(url.searchParams), body: request.postData() });
  });
  await page.goto(entry());
  await page.getByTestId('message-fixture-ready').waitFor();
  await page.waitForLoadState('networkidle');
  return { page, context };
}
async function listAction(page, action, predicate = () => true) {
  const pending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === minePath && predicate(url);
  });
  await action();
  const document = await (await pending).json();
  assert.equal(document.code, 200);
  await page.getByText('正在加载消息', { exact: true }).waitFor({ state: 'hidden' });
  if (document.data.rows.length) await page.getByRole('checkbox', { name: '选择消息 ' + document.data.rows[0].recordId, exact: true }).waitFor();
  return document.data;
}
async function select(page, index, label) {
  await page.locator('button[aria-haspopup="listbox"]').nth(index).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function readAction(page, action, name) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === minePath + '/read'
    && response.request().method() === 'PUT');
  await action();
  const response = await pending;
  const document = await response.json();
  check(document.code === 200 && Boolean((await response.request().allHeaders())['x-csrf-token']),
    name + ': real read request succeeds with actual CSRF cookie token');
}
async function count(page, value) {
  const trigger = page.getByRole('button', { name: '消息中心', exact: true });
  if (value) await trigger.getByText(String(value), { exact: true }).waitFor();
  else await page.waitForFunction(() => document.querySelector('button[aria-label="消息中心"]')?.textContent === '');
  assert.equal((await trigger.innerText()).trim(), value ? String(value) : '');
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.jpg'), type: 'jpeg' });
  screenshots.push(name + '.jpg');
}
const row = (page, id) => page.locator('tbody tr').filter({ has: page.getByRole('checkbox', { name: '选择消息 ' + id, exact: true }) });
const item = (page, dialog, title) => dialog.getByRole('button').filter({ has: page.getByText(title, { exact: true }) });
try {
  await build(config);
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, open: false, proxy: {
    '/api/auth': { target: input.authBase, changeOrigin: true, rewrite: value => value.replace(/^\/api\/auth/, '') },
    '/api/oa': { target: input.oaBase, changeOrigin: true, rewrite: value => value.replace(/^\/api\/oa/, '') },
  } } });
  browser = await chromium.launch({ headless: true,
    ...(process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  for (const [name, width, height, user] of [['desktop', 1440, 1000, 'admin'], ['mobile', 390, 844, 'other']]) {
    const { context, page } = await open(name, width, height, user);
    const sources = input.sources[user];
    await count(page, 16);
    check(true, name + ': unread total equals fifteen actual SDK messages plus one OA publication');
    await page.getByRole('button', { name: '消息中心', exact: true }).click();
    const bell = page.getByRole('dialog');
    await bell.getByText(sources[14].title, { exact: true }).waitFor();
    await bell.getByText(input.announcement, { exact: true }).waitFor();
    for (const [index, label] of [[10, '待办'], [11, '抄送'], [12, '公告'], [13, '系统'], [14, '业务提醒']]) {
      check(await item(page, bell, sources[index].title).getByText(label, { exact: true }).count() === 1,
        name + ': bell displays actual ' + sources[index].category + ' category');
    }
    check(await bell.getByText(input.announcement, { exact: true }).count() === 1, name + ': OA and unified linked announcement deduplicated');
    await bell.getByRole('button', { name: /^公告[0-9]+$/ }).click();
    check(await bell.getByText(input.announcement, { exact: true }).count() === 1
      && await bell.getByText(sources[10].title, { exact: true }).count() === 0, name + ': announcement tab scopes actual rows');
    await bell.getByRole('button', { name: /^通知[0-9]+$/ }).click();
    check(await bell.getByText(input.announcement, { exact: true }).count() === 0
      && await bell.getByText(sources[10].title, { exact: true }).count() === 1, name + ': notice tab excludes OA announcement');
    await bell.getByRole('button', { name: /^全部[0-9]+$/ }).click();
    await shot(page, name + '-bell');
    await readAction(page, () => item(page, bell, sources[14].title).click(), name + '-bell');
    await bell.getByRole('heading', { name: '通知详情', exact: true }).waitFor();
    check((await bell.innerText()).includes('A2 independent delivery verification'), name + ': bell reads actual stored body');
    await bell.getByRole('button', { name: '返回消息列表', exact: true }).click();
    await count(page, 15);
    const writes = requests.filter(request => request.name === name && request.method === 'PUT').length;
    await item(page, bell, sources[14].title).click();
    await bell.getByRole('heading', { name: '通知详情', exact: true }).waitFor();
    check(requests.filter(request => request.name === name && request.method === 'PUT').length === writes, name + ': rereading does not write twice');
    await bell.getByRole('button', { name: '查看详情', exact: true }).click();
    await page.getByTestId('business-target').waitFor();
    check(await page.getByTestId('business-target').innerText() === '/approval/detail/301?from=message#history',
      name + ': bell business navigation preserves path query and hash');
    const initial = await listAction(page, () => page.goto(entry() + '?view=mine'));
    check(initial.total > 15 && initial.rows.length === 10, name + ': personal page loads actual paginated rows');
    const foreign = input.sources[user === 'admin' ? 'other' : 'admin'].map(source => source.id);
    check(initial.rows.every(message => !foreign.includes(String(message.recordId))), name + ': another real user sources excluded');
    for (const [index, label] of [[10, '待办'], [11, '抄送'], [12, '公告'], [13, '系统'], [14, '业务提醒']])
      check(await row(page, sources[index].id).getByText(label, { exact: true }).count() === 1, name + ': personal page displays actual ' + sources[index].category);
    check(await page.getByRole('button', { name: '所选标为已读', exact: true }).isDisabled(), name + ': empty selection disables batch read');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ': personal page fits viewport');
    if (name === 'mobile') {
      check(await page.locator('table.cf-mobile-table').count() === 1, name + ': formal mobile cards applied');
      check(await page.locator('tbody tr').first().evaluate(element => Array.from(element.querySelectorAll('td')).every((cell, index, cells) => {
        const box = cell.getBoundingClientRect(), previous = cells[index - 1]?.getBoundingClientRect();
        return cell.hasAttribute('data-cf-mobile-label') && box.left >= 0 && box.right <= innerWidth + 1 && (!previous || box.top >= previous.bottom - 1);
      })), name + ': card labels and fields fit without overlap');
    }
    await shot(page, name + '-mine');
    await readAction(page, () => row(page, sources[13].id).getByRole('button').click(), name + '-detail');
    const detail = page.getByRole('dialog');
    await detail.getByText('已读', { exact: true }).waitFor();
    check(await detail.getByText('未读', { exact: true }).count() === 0, name + ': successful detail read updates visible status');
    check(await detail.evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1; }), name + ': detail fits viewport');
    await shot(page, name + '-detail');
    await detail.getByRole('button', { name: '查看业务详情', exact: true }).click();
    await page.getByTestId('business-target').waitFor();
    check(await page.getByTestId('business-target').innerText() === '/approval/detail/301?from=message#history', name + ': personal detail preserves business navigation');
    await listAction(page, () => page.goto(entry() + '?view=mine'));
    await count(page, 14);
    for (const index of [11, 12]) await page.getByRole('checkbox', { name: '选择消息 ' + sources[index].id, exact: true }).check();
    await readAction(page, () => page.getByRole('button', { name: '所选标为已读', exact: true }).click(), name + '-batch');
    await count(page, 12);
    await row(page, sources[11].id).getByText('已读', { exact: true }).waitFor();
    check(await row(page, sources[10].id).getByText('未读', { exact: true }).count() === 1, name + ': batch read keeps unselected source unread');
    const category = await listAction(page, () => select(page, 0, '待办'), url => url.searchParams.get('category') === 'TODO');
    check(category.total === 3 && category.rows.every(message => message.messageCategory === 'TODO'), name + ': category filter reaches real backend');
    await readAction(page, () => page.getByRole('button', { name: '本分类全部已读', exact: true }).click(), name + '-category');
    await count(page, 9);
    await page.locator('tbody').getByText('未读', { exact: true }).waitFor({ state: 'hidden' });
    await listAction(page, () => select(page, 0, '全部分类'), url => !url.searchParams.get('category'));
    const unread = await listAction(page, () => select(page, 1, '未读'), url => url.searchParams.get('readFlag') === '0');
    check(unread.total === 9 && unread.rows.every(message => message.readFlag === 0 && message.messageCategory !== 'TODO'), name + ': unread state and category read persist');
    await listAction(page, () => select(page, 1, '全部状态'), url => !url.searchParams.has('readFlag'));
    await listAction(page, () => page.getByLabel('开始日期', { exact: true }).fill('2031-03-15'));
    const date = await listAction(page, () => page.getByLabel('结束日期', { exact: true }).fill('2031-03-15'));
    check(date.total === 5 && date.rows.every(message => sources.slice(10).some(source => source.id === String(message.recordId))),
      name + ': inclusive date boundaries include midnight and 23:59:59 real sources');
    await listAction(page, () => page.getByLabel('开始日期', { exact: true }).fill(''));
    await listAction(page, () => page.getByLabel('结束日期', { exact: true }).fill(''));
    const second = await listAction(page, () => page.getByRole('button', { name: '下一页', exact: true }).click(), url => url.searchParams.get('pageNum') === '2');
    check(second.rows.length > 0 && second.rows.every(message => !initial.rows.some(first => first.recordId === message.recordId)), name + ': next page contains distinct actual records');
    await readAction(page, () => page.getByRole('button', { name: '全部已读', exact: true }).click(), name + '-all');
    await count(page, 0);
    const empty = await listAction(page, () => select(page, 1, '未读'), url => url.searchParams.get('readFlag') === '0');
    check(empty.total === 0 && empty.rows.length === 0, name + ': all-read includes records outside current page');
    await page.getByText('暂无消息', { exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
    await context.close();
  }
  for (const user of ['tenant', 'readonly']) {
    const { page, context } = await open(user, 390, 844, user);
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === minePath);
    await page.goto(entry() + '?view=mine');
    const document = await (await pending).json();
    if (user === 'tenant') check(document.code === 200 && document.data.rows.every(message =>
      !Object.values(input.sources).flat().some(source => source.id === String(message.recordId)))
      && !document.data.rows.some(message => message.title === input.announcement), 'real tenant personal page excludes owned sources and actual announcement');
    else {
      check(document.code === 403, 'real readonly personal list denied by backend');
      check(await page.getByRole('button', { name: '全部已读', exact: true }).count() === 0
        && await page.getByRole('button', { name: '所选标为已读', exact: true }).count() === 0, 'real readonly exposes no read actions');
    }
    await page.waitForLoadState('networkidle');
    await context.close();
  }
  check(requests.some(request => request.path === '/api/oa/announcement/my-list'), 'bell fetched actual OA announcement endpoint');
  check(requests.every(request => request.path === '/api/auth/info' || request.path.startsWith(minePath)
    || request.path.startsWith('/api/oa/announcement/')), 'all browser data uses declared actual service endpoints');
  check(errors.length === 0, 'no browser runtime or API transport errors');
  check(files.every(file => hash(file) === sourceHashes[file]), 'all declared frontend input hashes unchanged');
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack };
  console.error(error.stack);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, assertions: checks.length,
    checks, failure, errors, requests, screenshots, browserVersion, sourceHashes,
    backend: 'owned real authenticated HTTP; no route mocks', liveWebSocketBrowserCovered: false, globalComplete: false }, null, 2));
}
if (failure) process.exitCode = 1;
