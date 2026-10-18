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
assert.equal(path.basename(output), 'subscribe-browser');
assert.equal(path.dirname(path.dirname(output)), path.join(path.dirname(frontend), '.cloudflow-runtime', 'batch-g-integration'));
assert.equal(new URL(input.authBase).hostname, '127.0.0.1');
assert.equal(new URL(input.authBase).protocol, 'http:');
const modulePath = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE;
assert.ok(modulePath && existsSync(modulePath), 'Installed browser module required');
const { chromium } = await import(pathToFileURL(modulePath).href);
const files = ['src/pages/system/message/Subscribe.tsx', 'src/pages/system/message/options.ts',
  'src/services/api/message.ts', 'src/services/api/auth.ts', 'src/services/api/request.ts',
  'src/context/AuthContext.tsx', 'src/utils/authStorage.ts', 'src/utils/navigation.ts',
  'src/components/common/PermissionGuard.tsx', 'src/pages/system/_components/InfrastructurePrimitives.tsx',
  'src/components/common/switch.tsx', 'src/components/common/input.tsx', 'src/index.css',
  'src/styles/unity2-refresh.css', 'src/styles/mobile-foundation.css',
  'scripts/message-subscribe-browser/fixture.tsx', 'scripts/message-subscribe-browser/index.html',
  'scripts/check-message-subscribe-live-browser.mjs'];
const hash = file => createHash('sha256').update(readFileSync(path.join(frontend, file))).digest('hex');
const sourceHashes = Object.fromEntries(files.map(file => [file, hash(file)]));
const checks = [], errors = [], requests = [], screenshots = [], finalSettings = {};
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log('PASS ' + label); };
const endpoint = '/api/auth/system/message/subscribe/mine';
const config = { configFile: false, root: frontend, logLevel: 'warn', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(frontend, 'src') } },
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false,
    rollupOptions: { input: path.join(frontend, 'scripts/message-subscribe-browser/index.html') } } };
let browser, server, failure = null, browserVersion;
mkdirSync(output);
const card = (page, label) => page.getByRole('region', { name: label + '订阅', exact: true });
const writes = name => requests.filter(row => row.name === name && row.method === 'PUT');
async function ready(page) { await card(page, '待办').getByRole('switch').waitFor(); }
async function select(page, label) {
  await page.locator('button[aria-haspopup="listbox"]').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function read(page, action) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'GET');
  await action();
  const document = await (await pending).json();
  assert.equal(document.code, 200);
  await ready(page);
  return document.data;
}
async function save(page, name) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  const response = await pending;
  const document = await response.json();
  const body = response.request().postDataJSON();
  check(document.code === 200 && Boolean((await response.request().allHeaders())['x-csrf-token']),
    name + ': save accepted with real login and CSRF cookie token');
  check(Array.isArray(body) && body.length === 15 && new Set(body.map(row => row.channelType + ':' + row.messageCategory)).size === 15,
    name + ': saves all fifteen unique channel/category settings together');
  await page.getByRole('button', { name: '保存设置', exact: true }).waitFor();
  return body;
}
const find = (rows, category, channel) => rows.find(row => row.messageCategory === category && row.channelType === channel);
async function shot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.jpg'), type: 'jpeg', fullPage: true });
  screenshots.push(name + '.jpg');
}
async function open(name, width, height, user, denied = false) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies(input.sessions[user]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) errors.push(name + ': ' + request.failure()?.errorText);
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) requests.push({ name, method: request.method(), path: url.pathname, body: request.postData() });
  });
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'GET');
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/scripts/message-subscribe-browser/index.html');
  await page.getByTestId('subscription-fixture-ready').waitFor();
  const document = await (await pending).json();
  check(document.code === (denied ? 403 : 200), name + ': real subscription load permission enforced');
  if (!denied) await ready(page);
  await page.waitForLoadState('networkidle');
  return { page, context, settings: document.data };
}
try {
  await build(config);
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, open: false, proxy: {
    '/api/auth': { target: input.authBase, changeOrigin: true, rewrite: value => value.slice('/api/auth'.length) },
  } } });
  browser = await chromium.launch({ headless: true,
    ...(process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  for (const [name, width, height, user, start, end] of [
    ['desktop', 1440, 1000, 'admin', '22:30', '07:15'], ['mobile', 390, 844, 'other', '23:40', '08:05']]) {
    const { page, context, settings } = await open(name, width, height, user);
    check(settings.length === 15 && settings.every(row => row.enabledFlag === 1 && row.quietStart == null && row.quietEnd == null),
      name + ': initial real account has fifteen enabled defaults');
    for (const label of ['站内消息', '邮件', '短信']) {
      await select(page, label);
      check(await page.locator('section[aria-label$="订阅"]').count() === 5, name + ': ' + label + ' displays five categories');
    }
    await select(page, '站内消息');
    const todo = card(page, '待办');
    await todo.getByRole('switch').click();
    await todo.getByLabel('免打扰开始', { exact: true }).fill(start);
    const before = writes(name).length;
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByText('免打扰开始与结束时间须同时填写，或同时清空', { exact: true }).waitFor();
    check(writes(name).length === before, name + ': incomplete time pair blocks real write');
    await todo.getByLabel('免打扰结束', { exact: true }).fill(end);
    await select(page, '邮件');
    await card(page, '公告').getByRole('switch').click();
    await select(page, '短信');
    await card(page, '业务提醒').getByRole('switch').click();
    await select(page, '站内消息');
    check(await todo.getByRole('switch').getAttribute('aria-checked') === 'false'
      && await todo.getByLabel('免打扰开始', { exact: true }).inputValue() === start, name + ': unsaved channel changes survive switching');
    await save(page, name + '-cross-channel');
    let loaded = await read(page, () => page.getByRole('button', { name: '重新加载', exact: true }).click());
    check(find(loaded, 'TODO', 'INTERNAL').enabledFlag === 0 && find(loaded, 'TODO', 'INTERNAL').quietStart === start + ':00'
      && find(loaded, 'TODO', 'INTERNAL').quietEnd === end + ':00', name + ': disabled and cross-midnight time persisted');
    check(find(loaded, 'ANNOUNCEMENT', 'EMAIL').enabledFlag === 0 && find(loaded, 'BIZ_REMINDER', 'SMS').enabledFlag === 0,
      name + ': hidden channel changes persisted together');
    const snapshot = JSON.stringify(loaded);
    loaded = await read(page, () => page.reload());
    check(JSON.stringify(loaded) === snapshot, name + ': full browser reload reads identical database settings');
    await todo.getByLabel('免打扰开始', { exact: true }).fill('');
    await todo.getByLabel('免打扰结束', { exact: true }).fill('');
    const system = card(page, '系统');
    await system.getByLabel('免打扰开始', { exact: true }).fill(input.activeQuiet.start);
    await system.getByLabel('免打扰结束', { exact: true }).fill(input.activeQuiet.end);
    const cc = card(page, '抄送');
    await cc.getByLabel('免打扰开始', { exact: true }).fill('12:34');
    await cc.getByLabel('免打扰结束', { exact: true }).fill('12:34');
    const body = await save(page, name + '-clear-and-active-quiet');
    check(find(body, 'TODO', 'INTERNAL').quietStart === null && find(body, 'TODO', 'INTERNAL').quietEnd === null,
      name + ': clearing both times sends explicit nulls');
    loaded = await read(page, () => page.getByRole('button', { name: '重新加载', exact: true }).click());
    check(find(loaded, 'TODO', 'INTERNAL').quietStart == null && find(loaded, 'TODO', 'INTERNAL').quietEnd == null,
      name + ': database removed previous cross-midnight window');
    check(find(loaded, 'CC', 'INTERNAL').quietStart === '12:34:00' && find(loaded, 'CC', 'INTERNAL').quietEnd === '12:34:00',
      name + ': equal start/end persisted without inventing a duration');
    check(await system.getByLabel('免打扰开始', { exact: true }).inputValue() === input.activeQuiet.start
      && await system.getByLabel('免打扰结束', { exact: true }).inputValue() === input.activeQuiet.end, name + ': active quiet window restored in formal controls');
    const boxes = await page.locator('section[aria-label$="订阅"]').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, right: box.right, top: box.top, bottom: box.bottom };
    }));
    check(boxes.length === 5 && boxes.every((box, index) => box.x >= 0 && box.right <= width
      && (!index || box.top >= boxes[index - 1].bottom))
      && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ': all five cards fit without horizontal overflow or overlap');
    await shot(page, name + '-subscription-saved');
    await page.waitForLoadState('networkidle');
    finalSettings[user] = loaded;
    await page.getByRole('button', { name: '我的消息', exact: true }).click();
    await page.getByTestId('my-messages-target').waitFor();
    check(true, name + ': formal my-message navigation works');
    await context.close();
  }
  const tenant = await open('tenant', 390, 844, 'tenant');
  check(tenant.settings.every(row => row.enabledFlag === 1 && row.quietStart == null && row.quietEnd == null),
    'tenant: other users and tenant changes excluded from defaults');
  await card(tenant.page, '公告').getByRole('switch').click();
  await save(tenant.page, 'tenant-save');
  finalSettings.tenant = await read(tenant.page, () => tenant.page.reload());
  check(find(finalSettings.tenant, 'ANNOUNCEMENT', 'INTERNAL').enabledFlag === 0, 'tenant: own independent setting persists');
  await tenant.page.waitForLoadState('networkidle');
  await tenant.context.close();
  const readonly = await open('readonly', 390, 844, 'readonly', true);
  await readonly.page.getByRole('alert').waitFor();
  check(await readonly.page.getByRole('button', { name: '保存设置', exact: true }).count() === 0
    && await readonly.page.getByRole('switch').count() === 0 && writes('readonly').length === 0,
    'readonly: denied account exposes no editable settings or save action');
  await shot(readonly.page, 'readonly-subscription-denied');
  await readonly.page.waitForLoadState('networkidle');
  await readonly.context.close();
  check(requests.every(row => row.path === '/api/auth/info' || row.path === endpoint), 'all browser data reaches declared actual auth service endpoints');
  check(errors.length === 0, 'no browser runtime or API transport errors');
  check(files.every(file => hash(file) === sourceHashes[file]), 'all declared frontend input hashes unchanged');
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack };
  console.error(error.stack);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, assertions: checks.length,
    checks, failure, errors, requests, screenshots, finalSettings, browserVersion, sourceHashes,
    backend: 'owned real authenticated HTTP; no route mocks', globalComplete: false }, null, 2));
}
if (failure) process.exitCode = 1;
