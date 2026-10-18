import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/im-binding-ui', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
await fs.mkdir(output, { recursive: true });
const certificatePassword = randomBytes(24).toString('hex');
const certificate = path.join(output, 'tls.p12');
await promisify(execFile)('keytool', ['-genkeypair', '-alias', 'owned-binding-ui', '-dname', 'CN=localhost', '-ext', 'SAN=dns:localhost,ip:127.0.0.1', '-validity', '2', '-keyalg', 'RSA', '-keysize', '2048', '-storetype', 'PKCS12', '-keystore', certificate, '-storepass:env', 'IM_UI_CERT_PASSWORD', '-noprompt'], { windowsHide: true, env: { ...process.env, IM_UI_CERT_PASSWORD: certificatePassword } });
const pagePath = '/workspace/im-bindings';
const entry = `/@fs/${path.join(root, 'scripts/im-checks/ImBindingUiCheck.tsx').replaceAll('\\', '/')}`;
const entryPlugin = () => ({ name: 'owned-binding-page', configureServer(vite) {
  vite.middlewares.use(async (request, response, next) => {
    if (![pagePath, '/system/im/bindings'].includes(new URL(request.url, 'https://localhost').pathname)) return next();
    try {
      const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`);
      response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html);
    } catch (failure) { next(failure); }
  });
} });
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), plugins: [entryPlugin()], cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, https: { pfx: await fs.readFile(certificate), passphrase: certificatePassword }, hmr: false, watch: null, fs: { allow: [root] } } });
const base = '/api/auth/system/im/binding/mine';
const csrf = randomBytes(32).toString('base64url');
const browserProof = randomBytes(32).toString('base64url');
const memberProof = randomBytes(32).toString('base64url');
const password = randomBytes(24).toString('base64url');
const binding = { mappingId: 101, configId: 100, externalAccount: '受控企业成员', bindType: 'SCAN_BIND', status: 'ACTIVE', version: 0, bindTime: '2026-09-30 03:00:00' };
const cases = [];
const checks = [];
const errors = [];
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
let origin;
let browser;

async function createCase({ width = 1440, permissions = ['system:im:binding:mine', 'system:im:binding:bind'], enabled = true, totp = true,
  bound = null, loseResponse = false, wrongPassword = false, badProvider = false, lifetime = 300000 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1080 }, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  const test = { context, page: await context.newPage(), calls: [], external: [], permissions, enabled, bound, verified: false, expiresAt: 0,
    pending: false, loseResponse, wrongPassword, badProvider, tenantId: 100000, holdVerify: false, releases: [] };
  cases.push(test);
  test.release = () => test.releases.splice(0).forEach(release => release());
  test.page.on('pageerror', error => errors.push(error.message));
  await context.addCookies([{ name: 'XSRF-TOKEN', value: csrf, url: origin, secure: origin.startsWith('https:'), sameSite: 'Lax' }]);
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(); const address = new URL(request.url());
    if (address.hostname === 'open.work.weixin.qq.com') {
      test.external.push(address.hostname);
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><a href="${origin}/api/auth/im/WECOM/binding-callback?state=fixture&code=fixture">完成企业微信身份核实</a>` });
    }
    if (address.origin !== origin) { test.external.push(address.origin); return route.abort(); }
    if (!address.pathname.startsWith('/api/')) return route.continue();
    const headers = await request.allHeaders();
    const body = request.postData() ? request.postDataJSON() : null;
    test.calls.push({ path: address.pathname, method: request.method(), body, headers });
    const result = (data, status = 200, extra = {}) => route.fulfill({ status, headers: { 'cache-control': 'no-store', ...extra }, contentType: 'application/json', body: JSON.stringify({ code: status, msg: status === 200 ? 'success' : '受控验证失败', data }) });
    if (address.pathname === '/api/auth/info') return result({ user: { userId: 1, userName: 'binding-ui', nickName: '本人绑定检查', tenantId: test.tenantId, forcePasswordChange: false }, roles: ['employee'], permissions: test.permissions });
    if (address.pathname === base) return result({ binding: test.bound, canBind: test.enabled && !test.bound && test.permissions.includes('system:im:binding:bind'), reasonCode: test.enabled ? null : 'IM_DISABLED', message: test.enabled ? null : '企业微信绑定未配置，当前停用', canUnbind: !!test.bound && test.bound.bindType !== 'AUTO_SYNC' && test.permissions.includes('system:im:binding:unbind') });
    if ([`${base}/identity`, `${base}/unbind/identity`].includes(address.pathname) && request.method() === 'GET') return result({ verified: test.verified && test.expiresAt > Date.now(), totpRequired: totp, expiresAt: test.verified ? test.expiresAt : null });
    if ([`${base}/identity`, `${base}/unbind/identity`].includes(address.pathname) && request.method() === 'POST') {
      if (test.holdVerify) await new Promise(resolve => test.releases.push(resolve));
      if (test.wrongPassword) return result(null, 403);
      assert.deepEqual(body, { password, totpCode: totp ? '123456' : null });
      assert.equal(headers['x-csrf-token'], csrf);
      test.verified = true; test.expiresAt = Date.now() + lifetime; test.pending = false;
      return result({ verified: true, totpRequired: totp, expiresAt: test.expiresAt });
    }
    if (address.pathname === `${base}/unbind`) {
      assert.deepEqual(body, { mappingId: test.bound.mappingId, version: test.bound.version });
      assert.equal(headers['x-csrf-token'], csrf);
      assert.ok(test.verified && test.bound.bindType !== 'AUTO_SYNC');
      test.bound = null; test.verified = false;
      if (test.loseResponse) return route.abort('failed');
      return result(null);
    }
    if (address.pathname === `${base}/authorization`) {
      assert.deepEqual(body, {});
      const destination = test.badProvider ? 'https://foreign.example.test/' : `https://open.work.weixin.qq.com/fixture?${new URLSearchParams({ redirect_uri: `${origin}/api/auth/im/WECOM/binding-callback` })}`;
      return result({ authorizationUrl: destination, expiresIn: 300 }, 200, { 'set-cookie': `__Host-CloudFlowIM=${browserProof}; Path=/; Secure; HttpOnly; SameSite=Lax` });
    }
    if (address.pathname === '/api/auth/im/WECOM/binding-callback') {
      assert.ok(headers.cookie?.includes(`__Host-CloudFlowIM=${browserProof}`));
      test.pending = true;
      return route.fulfill({ status: 303, headers: { location: `${origin}${pagePath}?imBinding=ready`, 'set-cookie': `__Host-CloudFlowIMBinding=${memberProof}; Path=/; Secure; HttpOnly; SameSite=Strict`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: '' });
    }
    if (address.pathname === `${base}/pending`) {
      if (test.pending) assert.ok(headers.cookie?.includes(`__Host-CloudFlowIMBinding=${memberProof}`));
      return result(test.pending ? { externalAccount: binding.externalAccount, expiresAt: test.expiresAt } : null);
    }
    if (address.pathname === `${base}/confirm`) {
      assert.deepEqual(body, {}); assert.equal(headers['x-csrf-token'], csrf);
      assert.ok(headers.cookie?.includes(`__Host-CloudFlowIMBinding=${memberProof}`));
      test.bound = binding; test.pending = false; test.verified = false;
      if (test.loseResponse) return route.abort('failed');
      return result(binding, 200, { 'set-cookie': '__Host-CloudFlowIMBinding=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0' });
    }
    return route.abort();
  });
  await test.page.goto(`${origin}${pagePath}`);
  if (permissions.includes('system:im:binding:mine')) {
    await test.page.getByRole('heading', { name: '我的通信绑定', exact: true }).waitFor();
    await test.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '刷新' && !button.disabled));
  } else await test.page.getByText('您没有查看本人通信绑定的权限。', { exact: true }).waitFor();
  return test;
}

async function verify(test, totp = true) {
  await test.page.getByLabel('当前账号密码', { exact: true }).fill(password);
  if (totp) await test.page.getByLabel('六位动态验证码', { exact: true }).fill('123456');
  await test.page.getByRole('button', { name: '验证本人身份', exact: true }).click();
  await test.page.getByText(/身份已验证，有效至/).waitFor();
}
async function pending(test) {
  await verify(test);
  await test.page.getByRole('button', { name: '前往企业微信扫码', exact: true }).click();
  await test.page.getByRole('link', { name: '完成企业微信身份核实' }).click();
  await test.page.getByRole('button', { name: '确认绑定此企业微信账号', exact: true }).waitFor();
  assert.equal(await test.page.evaluate(() => typeof window.imBindingUiIdentity), 'function', '回跳继续使用受控页面身份上下文');
}
async function waitUntil(condition) {
  const deadline = Date.now() + 15000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(condition(), '受控请求没有到达');
}

async function managementCases() {
  const adminBase = '/api/auth/system/im/binding';
  async function create({ width = 1440, readable = true, writable = true, enabled = true, loseResponse = false, lifetime = 300000 } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1080 }, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
    const test = { context, page: await context.newPage(), calls: [], release() {}, row: { ...binding, bindType: 'AUTO_SYNC', userId: 2, account: 'managed-user', name: '已纳入员工', lastSyncTime: null, canUnbind: true, canResume: false }, verified: null };
    cases.push(test);
    test.page.on('pageerror', error => errors.push(error.message));
    await context.addCookies([{ name: 'XSRF-TOKEN', value: csrf, url: origin, secure: true, sameSite: 'Lax' }]);
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request(); const address = new URL(request.url());
      if (address.origin !== origin) return route.abort();
      if (!address.pathname.startsWith('/api/')) return route.continue();
      const body = request.postData() ? request.postDataJSON() : null;
      test.calls.push({ path: address.pathname, method: request.method(), body });
      const result = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, msg: status === 200 ? 'success' : '企业通信未配置，当前停用', data }) });
      if (address.pathname === '/api/auth/info') return result({ user: { userId: 1, userName: 'admin-ui', nickName: '管理验证', tenantId: 100000, role: 'ADMIN' }, roles: ['admin'], permissions: [...(readable ? ['system:im:binding:list'] : []), ...(writable ? ['system:im:binding:manage'] : [])] });
      if (address.pathname === `${adminBase}/list`) return result({ rows: [test.row], total: 1 });
      const match = address.pathname.match(/\/manage\/(unbind|resume)(\/identity)?$/);
      assert.ok(match, '仅请求定义的管理接口');
      if (!enabled) return result(null, 503);
      if (request.method() === 'GET') return result({ verified: false, totpRequired: true, expiresAt: null });
      assert.equal((await request.allHeaders())['x-csrf-token'], csrf);
      if (match[2]) {
        assert.deepEqual(body, { password, totpCode: '123456' }); test.verified = match[1];
        return result({ verified: true, totpRequired: true, expiresAt: Date.now() + lifetime });
      }
      assert.equal(test.verified, match[1]);
      assert.deepEqual(body, { mappingId: test.row.mappingId, version: test.row.version });
      const stopped = match[1] === 'unbind';
      test.row = { ...test.row, status: stopped ? 'DISABLED' : 'ACTIVE', version: test.row.version + 1, canUnbind: !stopped, canResume: stopped };
      test.verified = null;
      return loseResponse ? route.abort('failed') : result(null);
    });
    await test.page.goto(`${origin}/system/im/bindings`);
    if (readable) await test.page.getByRole('heading', { name: '已纳入员工', exact: true }).waitFor();
    else await test.page.getByRole('alert').waitFor();
    return test;
  }
  async function authenticate(test) {
    await test.page.getByLabel('当前密码', { exact: true }).fill(password);
    await test.page.getByLabel('动态验证码', { exact: true }).fill('123456');
    await test.page.getByRole('button', { name: '验证管理员身份', exact: true }).click();
    await test.page.getByText('管理员身份已验证，仅用于本次操作。', { exact: true }).waitFor();
  }
  const denied = await create({ readable: false, writable: false });
  check('无管理读取权限不请求绑定列表', denied.calls.every(call => !call.path.startsWith(adminBase)));
  const reader = await create({ writable: false });
  check('管理只读权限不提供解除按钮', await reader.page.getByRole('button', { name: '解除绑定', exact: true }).count() === 0);
  const disabled = await create({ enabled: false });
  await disabled.page.getByRole('button', { name: '解除绑定', exact: true }).click();
  await disabled.page.getByText('企业通信未配置，当前停用', { exact: true }).waitFor();
  check('未配置时明确停用管理写入', !disabled.calls.some(call => call.method === 'POST') && await disabled.page.getByRole('button', { name: '确认解除绑定', exact: true }).count() === 0);
  for (const width of [1440, 320]) {
    const test = await create({ width });
    await test.page.getByRole('button', { name: '解除绑定', exact: true }).click(); await authenticate(test);
    check(`管理员解除须再次勾选${width}`, await test.page.getByRole('button', { name: '确认解除绑定', exact: true }).isDisabled());
    await test.page.getByRole('checkbox').check();
    check(`管理页面无横向溢出${width}`, await test.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await test.page.screenshot({ path: path.join(output, `management-unbind-${width}.png`), fullPage: true });
    await test.page.getByRole('button', { name: '确认解除绑定', exact: true }).click();
    await test.page.getByText('已解除绑定，停止管理', { exact: true }).waitFor();
    check(`解除后显示停止管理并只提交编号版本${width}`, test.row.status === 'DISABLED' && test.calls.filter(call => call.path === `${adminBase}/manage/unbind`).length === 1);
    await test.page.getByRole('button', { name: '重新纳入', exact: true }).click(); await authenticate(test); await test.page.getByRole('checkbox').check();
    await test.page.screenshot({ path: path.join(output, `management-resume-${width}.png`), fullPage: true });
    await test.page.getByRole('button', { name: '确认重新纳入', exact: true }).click();
    await test.page.getByRole('button', { name: '解除绑定', exact: true }).waitFor();
    check(`重新纳入使用独立用途并保持原绑定${width}`, test.row.status === 'ACTIVE' && test.row.mappingId === binding.mappingId && test.row.version === 2);
  }
  const lost = await create({ loseResponse: true });
  await lost.page.getByRole('button', { name: '解除绑定', exact: true }).click(); await authenticate(lost); await lost.page.getByRole('checkbox').check();
  await lost.page.getByRole('button', { name: '确认解除绑定', exact: true }).click();
  await lost.page.getByText(/结果或版本尚未确认/).waitFor();
  check('管理响应丢失禁止重复提交', lost.calls.filter(call => call.path === `${adminBase}/manage/unbind`).length === 1);
  await lost.page.getByRole('button', { name: '关闭', exact: true }).last().click();
  await lost.page.getByRole('button', { name: '刷新', exact: true }).click();
  await lost.page.getByText('已解除绑定，停止管理', { exact: true }).waitFor();
  check('管理响应丢失后刷新核对实际状态', lost.calls.filter(call => call.path === `${adminBase}/manage/unbind`).length === 1);
  const expired = await create({ lifetime: 300 });
  await expired.page.getByRole('button', { name: '解除绑定', exact: true }).click(); await authenticate(expired);
  await expired.page.getByLabel('当前密码', { exact: true }).waitFor();
  check('管理验证到期自动要求重新验证', await expired.page.getByRole('button', { name: '确认解除绑定', exact: true }).count() === 0);
}

try {
  await server.listen(); origin = `https://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  await managementCases();
  const denied = await createCase({ permissions: [] });
  check('无本人读取权限不请求绑定接口', denied.calls.every(call => !call.path.startsWith(base)));
  const reader = await createCase({ permissions: ['system:im:binding:mine'] });
  check('仅查看权限不请求身份或写入', reader.calls.filter(call => call.path.startsWith(base)).every(call => call.path === base && call.method === 'GET'));
  const disabled = await createCase({ enabled: false });
  check('未配置明确停用且无身份请求', await disabled.page.getByText('企业微信绑定未配置，当前停用', { exact: true }).isVisible() && disabled.calls.filter(call => call.path.startsWith(base)).every(call => call.path === base));
  const failed = await createCase({ wrongPassword: true });
  await failed.page.getByLabel('当前账号密码', { exact: true }).fill(password); await failed.page.getByLabel('六位动态验证码', { exact: true }).fill('123456');
  await failed.page.getByRole('button', { name: '验证本人身份', exact: true }).click();
  await failed.page.getByText('受控验证失败', { exact: true }).waitFor();
  check('验证失败清空密码和动态码', await failed.page.getByLabel('当前账号密码', { exact: true }).inputValue() === '' && await failed.page.getByLabel('六位动态验证码', { exact: true }).inputValue() === '');
  check('验证失败不能扫码或自动绑定', await failed.page.getByRole('button', { name: '前往企业微信扫码', exact: true }).isDisabled() && !failed.calls.some(call => call.path.endsWith('/confirm')));
  const desktop = await createCase();
  check('验证前扫码按钮停用', await desktop.page.getByRole('button', { name: '前往企业微信扫码', exact: true }).isDisabled());
  await pending(desktop);
  check('扫码回跳不自动提交绑定', !desktop.calls.some(call => call.path.endsWith('/confirm')) && desktop.bound === null);
  check('回跳后删除状态查询参数', new URL(desktop.page.url()).search === '');
  check('外部证明不可被脚本或页面存储读取', await desktop.page.evaluate(proof => !document.cookie.includes(proof) && !JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes(proof), memberProof));
  check('密码和证明不进入页面地址', !desktop.page.url().includes(password) && !desktop.page.url().includes(memberProof));
  await desktop.page.screenshot({ path: path.join(output, 'desktop-pending.png'), fullPage: true });
  await desktop.page.getByRole('button', { name: '确认绑定此企业微信账号', exact: true }).click();
  await desktop.page.getByText('企业微信账号：受控企业成员', { exact: true }).waitFor();
  check('最终点击仅提交一次且不提交身份参数', desktop.calls.filter(call => call.path.endsWith('/confirm')).length === 1 && Object.keys(desktop.calls.find(call => call.path.endsWith('/confirm')).body).length === 0);
  const mobile = await createCase({ width: 390 }); await pending(mobile);
  check('手机无横向溢出', await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('手机操作高度至少44像素', await mobile.page.getByRole('button').evaluateAll(buttons => buttons.filter(button => button.getClientRects().length).every(button => button.getBoundingClientRect().height >= 44)));
  await mobile.page.screenshot({ path: path.join(output, 'mobile-pending.png'), fullPage: true });
  const lost = await createCase({ loseResponse: true }); await pending(lost);
  await lost.page.getByRole('button', { name: '确认绑定此企业微信账号', exact: true }).click();
  await lost.page.getByText(/提交结果尚未确认，请点击刷新/).waitFor();
  check('响应丢失不自动重复提交', lost.calls.filter(call => call.path.endsWith('/confirm')).length === 1);
  await lost.page.getByRole('button', { name: '刷新', exact: true }).click();
  await lost.page.getByText('企业微信账号：受控企业成员', { exact: true }).waitFor();
  check('刷新从服务器核对实际绑定', lost.calls.filter(call => call.path.endsWith('/confirm')).length === 1);
  const expired = await createCase({ totp: false, lifetime: 300 }); await verify(expired, false);
  await expired.page.getByLabel('当前账号密码', { exact: true }).waitFor();
  check('验证到期自动停用扫码并要求重新验证', await expired.page.getByRole('button', { name: '前往企业微信扫码', exact: true }).isDisabled());
  const hostile = await createCase({ badProvider: true }); await verify(hostile);
  await hostile.page.getByRole('button', { name: '前往企业微信扫码', exact: true }).click();
  await hostile.page.getByRole('alert').waitFor();
  check('非企业微信授权地址禁止跳转', hostile.external.length === 0);
  const switched = await createCase(); switched.holdVerify = true;
  await switched.page.getByLabel('当前账号密码', { exact: true }).fill(password); await switched.page.getByLabel('六位动态验证码', { exact: true }).fill('123456');
  await switched.page.getByRole('button', { name: '验证本人身份', exact: true }).click();
  await waitUntil(() => switched.releases.length > 0); switched.tenantId = 100001; switched.enabled = false;
  await switched.page.evaluate(() => window.imBindingUiIdentity()); switched.release();
  await switched.page.getByText('企业微信绑定未配置，当前停用', { exact: true }).waitFor();
  check('切换本人身份后旧验证结果不能启用操作', await switched.page.getByRole('button', { name: '前往企业微信扫码', exact: true }).count() === 0);
  const unbindPermissions = ['system:im:binding:mine', 'system:im:binding:unbind'];
  const managed = await createCase({ permissions: unbindPermissions, bound: { ...binding, bindType: 'AUTO_SYNC' } });
  check('组织同步绑定明确要求管理员且无本人解绑请求', await managed.page.getByText('组织同步建立的绑定仅可由管理员通过管理入口解除。', { exact: true }).isVisible() && !managed.calls.some(call => call.path.includes('/unbind')));
  const unbindReader = await createCase({ permissions: ['system:im:binding:mine'], bound: binding });
  check('只读本人不能请求解绑验证', !unbindReader.calls.some(call => call.path.includes('/identity')));
  for (const width of [1440, 320]) {
    const removable = await createCase({ width, permissions: unbindPermissions, bound: binding, enabled: false });
    check(`外部配置停用仍可验证本地解绑${width}`, await removable.page.getByLabel('当前账号密码', { exact: true }).isVisible());
    check(`解绑验证前按钮停用${width}`, await removable.page.getByRole('button', { name: '确认解除绑定', exact: true }).isDisabled());
    await verify(removable);
    check(`解绑要求单独用途的身份验证${width}`, removable.calls.some(call => call.path === `${base}/unbind/identity` && call.method === 'POST') && !removable.calls.some(call => call.path === `${base}/identity`));
    check(`验证后仍需明确勾选${width}`, await removable.page.getByRole('button', { name: '确认解除绑定', exact: true }).isDisabled());
    await removable.page.getByRole('checkbox').check();
    await removable.page.screenshot({ path: path.join(output, `unbind-${width}.png`), fullPage: true });
    check(`解绑页面无横向溢出${width}`, await removable.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await removable.page.getByRole('button', { name: '确认解除绑定', exact: true }).click();
    await removable.page.getByText('未绑定', { exact: true }).waitFor();
    check(`解绑仅提交当前编号版本并刷新实际结果${width}`, removable.calls.filter(call => call.path === `${base}/unbind`).length === 1 && removable.bound === null);
  }
  const lostUnbind = await createCase({ permissions: unbindPermissions, bound: binding, loseResponse: true });
  await verify(lostUnbind); await lostUnbind.page.getByRole('checkbox').check();
  await lostUnbind.page.getByRole('button', { name: '确认解除绑定', exact: true }).click();
  await lostUnbind.page.getByText(/提交结果尚未确认，请点击刷新/).waitFor();
  check('解绑响应丢失禁止重复操作', lostUnbind.calls.filter(call => call.path === `${base}/unbind`).length === 1 && await lostUnbind.page.getByRole('button', { name: '确认解除绑定', exact: true }).count() === 0);
  await lostUnbind.page.getByRole('button', { name: '刷新', exact: true }).click(); await lostUnbind.page.getByText('未绑定', { exact: true }).waitFor();
  check('刷新确认解绑结果不重发写请求', lostUnbind.calls.filter(call => call.path === `${base}/unbind`).length === 1);
  const insecureServer = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), plugins: [entryPlugin()], cacheDir: path.join(output, 'http-cache'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, fs: { allow: [root] } } });
  const secureOrigin = origin;
  try {
    await insecureServer.listen(); origin = `http://127.0.0.1:${insecureServer.httpServer.address().port}`;
    const insecure = await createCase();
    check('HTTP页面明确停用身份验证与绑定', await insecure.page.getByText(/本人绑定需通过本系统HTTPS页面操作/).isVisible() && insecure.calls.filter(call => call.path.startsWith(base)).every(call => call.path === base));
    await insecure.context.close();
  } finally { origin = secureOrigin; await insecureServer.close(); }
  check('浏览器运行错误为零', errors.length === 0);
  console.log(`G4_IM_BINDING_UI: assertions=${checks.length}; failed=0; real_browser=true; real_https=true; desktop_and_mobile=true; cross_site_cookie_roundtrip=true; api_responses=fixture; vendor_service=false; screenshots=${output}`);
} catch (failure) {
  const page = cases.at(-1)?.page;
  if (page && !page.isClosed()) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); console.log('IM_BINDING_UI_FAILURE', JSON.stringify({ errors, output, styles: await page.evaluate(() => [...document.styleSheets].map(sheet => ({ href: sheet.href, rules: sheet.cssRules.length, source: sheet.ownerNode?.getAttribute('data-vite-dev-id') }))) })); }
  throw failure;
} finally {
  cases.forEach(test => test.release());
  await Promise.all(cases.map(test => test.context.close())); await browser?.close(); await server.close();
}
