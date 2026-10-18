import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(path.dirname(frontend), '.cloudflow-runtime', `a2-message-subscribe-browser-${Date.now()}`);
const modulePath = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE;
const executablePath = process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE;
assert.ok(modulePath && existsSync(modulePath), 'Installed browser module is required');
assert.ok(!executablePath || existsSync(executablePath), 'Browser executable must exist');
const { chromium } = await import(pathToFileURL(modulePath).href);
const sourceFiles = ['src/pages/system/message/Subscribe.tsx', 'src/pages/system/message/options.ts',
  'src/services/api/message.ts', 'src/context/AuthContext.tsx', 'src/components/common/PermissionGuard.tsx',
  'src/pages/system/_components/InfrastructurePrimitives.tsx', 'src/components/common/switch.tsx',
  'src/components/common/input.tsx', 'src/index.css', 'src/styles/unity2-refresh.css',
  'src/styles/mobile-foundation.css', 'scripts/message-subscribe-browser/fixture.tsx',
  'scripts/message-subscribe-browser/index.html', 'scripts/check-message-subscribe-browser.mjs'];
const hashFile = file => createHash('sha256').update(readFileSync(path.join(frontend, file))).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, hashFile(file)]));
const categories = ['TODO', 'CC', 'ANNOUNCEMENT', 'SYSTEM', 'BIZ_REMINDER'];
const categoryLabels = ['待办', '抄送', '公告', '系统', '业务提醒'];
const channels = ['INTERNAL', 'EMAIL', 'SMS'];
const channelLabels = ['站内消息', '邮件', '短信'];
const defaults = categories.flatMap(messageCategory => channels.map(channelType =>
  ({ messageCategory, channelType, enabledFlag: 1, quietStart: null, quietEnd: null })));
const fullPermissions = ['system:message:subscribe:list', 'system:message:subscribe:edit'];
const checks = [];
const errors = [];
const requests = [];
const rendering = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
const config = { configFile: false, root: frontend, logLevel: 'warn', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(frontend, 'src') } },
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false,
    rollupOptions: { input: path.join(frontend, 'scripts/message-subscribe-browser/index.html') } } };
let browser;
let server;
let failure = null;
mkdirSync(output);
console.log(`MESSAGE_SUBSCRIBE_BROWSER_RUN=${output}`);

async function openFixture(name, width, height, options = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const state = { settings: structuredClone(defaults), permissions: fullPermissions, rejectLoad: false,
    rejectSave: false, loadGate: null, saveGate: null, ...options };
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON();
    requests.push({ scenario: name, method, path: pathname, body });
    let data = null;
    if (pathname === '/api/auth/info' && method === 'GET') {
      data = { user: { userId: 702, userName: 'subscription-browser-check', tenantId: 1 }, permissions: state.permissions, roles: ['user'] };
    } else if (pathname === '/api/auth/system/message/subscribe/mine' && method === 'GET') {
      if (state.loadGate) await state.loadGate;
      if (state.rejectLoad) {
        await route.fulfill({ json: { code: 500, msg: '验收模拟读取订阅失败' } });
        return;
      }
      data = state.settings;
    } else if (pathname === '/api/auth/system/message/subscribe/mine' && method === 'PUT') {
      if (state.saveGate) await state.saveGate;
      if (state.rejectSave) {
        await route.fulfill({ json: { code: 500, msg: '验收模拟保存订阅失败' } });
        return;
      }
      assert.ok(state.permissions.includes('system:message:subscribe:edit'), `${name}: edit permission required`);
      assert.ok(Array.isArray(body), `${name}: subscription body is an array`);
      state.settings = structuredClone(body);
    } else {
      errors.push(`${name}: unexpected ${method} ${pathname}`);
      await route.fulfill({ status: 500, json: { code: 500, msg: 'Unexpected fixture request' } });
      return;
    }
    await route.fulfill({ json: { code: 200, msg: 'success', data } });
  });
  const address = server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/scripts/message-subscribe-browser/index.html`);
  await page.getByTestId('subscription-fixture-ready').waitFor();
  return { page, context, state, name };
}
const card = (page, label) => page.getByRole('region', { name: `${label}订阅`, exact: true });
const writes = name => requests.filter(row => row.scenario === name && row.method === 'PUT');
async function ready(page) { await card(page, '待办').getByRole('switch').waitFor(); }
async function verifyRendering(page, name) {
  const expectedInputHeight = page.viewportSize().width <= 640 ? 44 : 36;
  const rendered = await page.locator('section[aria-label$="订阅"]').evaluateAll(sections => sections.map(section => {
    const describe = element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, background: style.backgroundColor,
        border: style.borderTopWidth, radius: style.borderTopLeftRadius, opacity: style.opacity };
    };
    const control = section.querySelector('[role="switch"]');
    return { label: section.getAttribute('aria-label'), switch: describe(control),
      thumb: describe(control.querySelector('.cf-switch-thumb')),
      inputs: Array.from(section.querySelectorAll('input')).map(describe) };
  }));
  rendering.push({ name, rendered });
  const painted = control => control.background !== 'rgba(0, 0, 0, 0)' && control.background !== 'transparent';
  check(rendered.length === 5 && rendered.every(row => row.switch.width === 44 && row.switch.height === 24
    && painted(row.switch) && row.switch.radius !== '0px'), `${name}: all five switches have visible painted tracks and expected dimensions`);
  check(rendered.every(row => row.thumb.width === 20 && row.thumb.height === 20 && painted(row.thumb)),
    `${name}: all switch thumbs are painted at expected dimensions`);
  check(rendered.every(row => row.inputs.length === 2 && row.inputs.every(input => input.height === expectedInputHeight
    && Number.parseFloat(input.border) > 0 && painted(input))), `${name}: all ten time inputs have visible borders and backgrounds`);
}
async function selectChannel(page, label) {
  await page.locator('button[aria-haspopup="listbox"]').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function save(page) {
  const response = page.waitForResponse(row => row.url().endsWith('/api/auth/system/message/subscribe/mine') && row.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await response;
  await page.getByRole('button', { name: '保存设置', exact: true }).waitFor();
}
async function reload(page) {
  const response = page.waitForResponse(row => row.url().endsWith('/api/auth/system/message/subscribe/mine') && row.request().method() === 'GET');
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await response;
  await ready(page);
}
const settingsRow = (state, category, channel) => state.settings.find(row => row.messageCategory === category && row.channelType === channel);
async function screenshot(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(output, `${name}.jpg`), type: 'jpeg', fullPage });
}

try {
  await build(config);
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const main = await openFixture(name, width, height);
    const { page, state } = main;
    await ready(page);
    await verifyRendering(page, name);
    for (let i = 0; i < channels.length; i++) {
      await selectChannel(page, channelLabels[i]);
      check(await page.locator('section[aria-label$="订阅"]').count() === 5, `${name}: ${channels[i]} shows five categories`);
      for (const label of categoryLabels) {
        check(await card(page, label).getByRole('switch', { name: `接收${label}`, exact: true }).getAttribute('aria-checked') === 'true', `${name}: ${channels[i]} ${label} defaults enabled`);
      }
      if (channels[i] !== 'INTERNAL') check(await page.getByText(`${channelLabels[i]}通知需管理员配置并启用对应渠道后才能送达。`, { exact: true }).count() === 1, `${name}: ${channels[i]} explains channel configuration without obsolete claim`);
    }
    await selectChannel(page, '站内消息');
    const todo = card(page, '待办');
    await todo.getByRole('switch').click();
    check(await todo.getByText('已关闭此类订阅', { exact: true }).count() === 1, `${name}: disabling subscription updates its description`);
    await todo.getByLabel('免打扰开始', { exact: true }).fill('22:30');
    const beforeIncomplete = writes(name).length;
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByText('免打扰开始与结束时间须同时填写，或同时清空', { exact: true }).first().waitFor();
    check(writes(name).length === beforeIncomplete, `${name}: incomplete quiet hours make no save request`);
    await todo.getByLabel('免打扰结束', { exact: true }).fill('07:15');
    await selectChannel(page, '邮件');
    await card(page, '抄送').getByLabel('免打扰开始', { exact: true }).fill('09:00');
    await card(page, '抄送').getByLabel('免打扰结束', { exact: true }).fill('17:00');
    await selectChannel(page, '站内消息');
    check(await todo.getByLabel('免打扰开始', { exact: true }).inputValue() === '22:30' && await todo.getByRole('switch').getAttribute('aria-checked') === 'false', `${name}: channel switching preserves unsaved settings`);
    await screenshot(page, `${name}-subscriptions`, name === 'desktop');
    if (name === 'mobile') {
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: page fits viewport width`);
      check(await todo.evaluate(section => Array.from(section.querySelectorAll('input,button')).every(control => { const box = control.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1; })), `${name}: all subscription controls fit the mobile card`);
      await todo.screenshot({ path: path.join(output, 'mobile-subscription-card.jpg'), type: 'jpeg' });
    }
    await save(page);
    check(state.settings.length === 15 && writes(name).length === 1, `${name}: save submits all fifteen settings once`);
    check(settingsRow(state, 'TODO', 'INTERNAL').enabledFlag === 0 && settingsRow(state, 'TODO', 'INTERNAL').quietStart === '22:30:00'
      && settingsRow(state, 'TODO', 'INTERNAL').quietEnd === '07:15:00', `${name}: cross-midnight values preserve seconds and disabled preference`);
    check(settingsRow(state, 'CC', 'EMAIL').quietStart === '09:00:00' && settingsRow(state, 'CC', 'EMAIL').quietEnd === '17:00:00', `${name}: inactive channel changes persist in the same save`);
    check(defaults.filter(row => !(row.messageCategory === 'TODO' && row.channelType === 'INTERNAL') && !(row.messageCategory === 'CC' && row.channelType === 'EMAIL'))
      .every(row => JSON.stringify(row) === JSON.stringify(settingsRow(state, row.messageCategory, row.channelType))), `${name}: unrelated settings remain unchanged`);
    await reload(page);
    check(await todo.getByLabel('免打扰开始', { exact: true }).inputValue() === '22:30' && await todo.getByLabel('免打扰结束', { exact: true }).inputValue() === '07:15', `${name}: reload restores saved cross-midnight hours`);
    await todo.getByLabel('免打扰开始', { exact: true }).fill('');
    await selectChannel(page, '邮件');
    const beforeHiddenInvalid = writes(name).length;
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByText('免打扰开始与结束时间须同时填写，或同时清空', { exact: true }).first().waitFor();
    check(writes(name).length === beforeHiddenInvalid, `${name}: validation includes incomplete hours on an inactive channel`);
    await selectChannel(page, '站内消息');
    await todo.getByLabel('免打扰结束', { exact: true }).fill('');
    await save(page);
    check(settingsRow(state, 'TODO', 'INTERNAL').quietStart === null && settingsRow(state, 'TODO', 'INTERNAL').quietEnd === null, `${name}: clearing quiet hours submits explicit nulls`);
    await selectChannel(page, '短信');
    await card(page, '系统').getByLabel('免打扰开始', { exact: true }).fill('00:00');
    await card(page, '系统').getByLabel('免打扰结束', { exact: true }).fill('00:00');
    await save(page);
    check(settingsRow(state, 'SYSTEM', 'SMS').quietStart === '00:00:00' && settingsRow(state, 'SYSTEM', 'SMS').quietEnd === '00:00:00', `${name}: equal midnight values are preserved with documented no-quiet semantics`);
    let releaseSave;
    state.saveGate = new Promise(resolve => { releaseSave = resolve; });
    const requestStarted = page.waitForRequest(row => row.method() === 'PUT');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await requestStarted;
    await page.getByRole('button', { name: '保存中…', exact: true }).waitFor();
    check(await page.getByRole('button', { name: '保存中…', exact: true }).isDisabled() && await page.getByRole('button', { name: '重新加载', exact: true }).isDisabled(), `${name}: pending save disables repeat save and reload`);
    check(await page.getByRole('switch').evaluateAll(nodes => nodes.every(node => node.disabled))
      && await page.locator('input[type=time]').evaluateAll(nodes => nodes.every(node => node.disabled)), `${name}: pending save disables all editors`);
    releaseSave();
    state.saveGate = null;
    await page.getByRole('button', { name: '保存设置', exact: true }).waitFor();
    check(writes(name).length === 4, `${name}: pending save produces exactly one additional write`);
    state.rejectSave = true;
    await card(page, '系统').getByRole('switch').click();
    await save(page);
    await page.getByText('验收模拟保存订阅失败', { exact: true }).first().waitFor();
    check(settingsRow(state, 'SYSTEM', 'SMS').enabledFlag === 1 && await card(page, '系统').getByRole('switch').getAttribute('aria-checked') === 'false', `${name}: failed save preserves local edits and stored state`);
    state.rejectSave = false;
    await save(page);
    check(settingsRow(state, 'SYSTEM', 'SMS').enabledFlag === 0, `${name}: failed save can be retried successfully`);
    await page.getByRole('button', { name: '我的消息', exact: true }).click();
    await page.getByTestId('my-messages-target').waitFor();
    check(await page.getByTestId('my-messages-target').innerText() === '我的消息入口', `${name}: return action follows my-messages route`);
    await main.context.close();

    const readonly = await openFixture(`${name}-readonly`, width, height, { permissions: ['system:message:subscribe:list'] });
    await ready(readonly.page);
    await verifyRendering(readonly.page, `${name}-readonly`);
    check(await readonly.page.getByRole('button', { name: '保存设置', exact: true }).count() === 0, `${name}: read-only user has no save action`);
    check(await readonly.page.getByRole('switch').evaluateAll(nodes => nodes.length === 5 && nodes.every(node => node.disabled))
      && await readonly.page.locator('input[type=time]').evaluateAll(nodes => nodes.length === 10 && nodes.every(node => node.disabled)), `${name}: read-only switches and time editors are disabled`);
    await selectChannel(readonly.page, '邮件');
    check(await readonly.page.getByText('您当前仅可查看订阅设置，修改需消息订阅编辑权限。', { exact: true }).count() === 1
      && writes(readonly.name).length === 0, `${name}: read-only user can browse channels without writes`);
    if (name === 'mobile') await screenshot(readonly.page, 'mobile-readonly');
    await readonly.context.close();

    const single = await openFixture(`${name}-email-only`, width, height, { settings: structuredClone(defaults.filter(row => row.channelType === 'EMAIL')) });
    await ready(single.page);
    check(await single.page.locator('button[aria-haspopup="listbox"]').innerText() === '邮件'
      && await single.page.locator('section[aria-label$="订阅"]').count() === 5, `${name}: first available channel is selected when INTERNAL is absent`);
    single.state.settings = structuredClone(defaults.filter(row => row.channelType === 'SMS'));
    await reload(single.page);
    check(await single.page.locator('button[aria-haspopup="listbox"]').innerText() === '短信', `${name}: reload selects replacement channel when current channel disappears`);
    await single.context.close();

    const empty = await openFixture(`${name}-empty`, width, height, { settings: [] });
    await empty.page.getByRole('status').filter({ hasText: '暂无可配置的消息订阅' }).waitFor();
    check(await empty.page.getByRole('button', { name: '保存设置', exact: true }).isDisabled()
      && await empty.page.locator('button[aria-haspopup="listbox"]').count() === 0, `${name}: empty response shows explanation and disables save`);
    empty.state.settings = structuredClone(defaults);
    await reload(empty.page);
    check(await empty.page.getByRole('switch').count() === 5, `${name}: empty response can recover through reload`);
    await empty.context.close();

    const rejected = await openFixture(`${name}-load-failure`, width, height, { rejectLoad: true });
    await rejected.page.getByRole('alert').filter({ hasText: '验收模拟读取订阅失败' }).waitFor();
    check(await rejected.page.getByRole('button', { name: '保存设置', exact: true }).isDisabled()
      && await rejected.page.getByRole('switch').count() === 0, `${name}: failed load displays error without editable stale settings`);
    rejected.state.rejectLoad = false;
    await reload(rejected.page);
    check(await rejected.page.getByRole('alert').count() === 0 && await rejected.page.getByRole('switch').count() === 5, `${name}: failed load recovers without remounting`);
    await rejected.context.close();

    let releaseLoad;
    const gate = new Promise(resolve => { releaseLoad = resolve; });
    const loading = await openFixture(`${name}-loading`, width, height, { loadGate: gate });
    await loading.page.getByText('正在读取订阅设置', { exact: true }).waitFor();
    check(await loading.page.getByRole('button', { name: '保存设置', exact: true }).isDisabled()
      && await loading.page.getByRole('button', { name: '重新加载', exact: true }).isDisabled(), `${name}: initial loading disables save and duplicate reload`);
    releaseLoad();
    await ready(loading.page);
    check(await loading.page.getByRole('button', { name: '保存设置', exact: true }).isEnabled(), `${name}: completion of initial load restores actions`);
    await loading.context.close();
  }
  check(errors.length === 0, `No browser errors or unexpected requests: ${JSON.stringify(errors)}`);
  check(sourceFiles.every(file => sourceHashes[file] === hashFile(file)), 'All checked source hashes remain unchanged');
} catch (error) {
  failure = error.stack || String(error);
  console.error(failure);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve());
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, assertions: checks.length, checks, failure,
    errors, requests, sourceHashes, rendering, browserVersion: browser?.version(),
    scope: 'Production subscription page and AuthProvider, controlled HTTP; not backend end-to-end or actual delivery' }, null, 2));
}
