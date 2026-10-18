import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/auth-initialization-ui', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, fs: { allow: [root] } } });
const checks = [];
const errors = [];
const unexpected = [];
const cases = [];
let browser;
let origin;
let failure;
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const waitFor = async (condition, label) => {
  const deadline = Date.now() + 20000;
  while (!condition() && Date.now() < deadline) await pause(10);
  assert.ok(condition(), label);
};
const user = (username = '初始用户', tenantId = 100000) => ({ user: { userId: tenantId === 100000 ? 101 : 102, userName: username, nickName: username, tenantId, forcePasswordChange: false }, roles: ['EMPLOYEE'], permissions: [] });
const info = (username, tenantId) => ({ status: 200, data: user(username, tenantId) });
const begin = async (page, label, method, argument) => page.evaluate(({ label, method, argument }) => {
  window.authOperations ||= {};
  window.authOperations[label] = 'pending';
  window.authCheck[method](argument).then(() => { window.authOperations[label] = 'success'; }, error => { window.authOperations[label] = error.code || 'rejected'; });
}, { label, method, argument });
const settled = async (page, label) => {
  await page.waitForFunction(label => window.authOperations[label] !== 'pending', label);
  return page.evaluate(label => window.authOperations[label], label);
};
const identity = async (page, username, tenant = 100000) => {
  await page.waitForFunction(({ username, tenant }) => window.authCheck?.user?.username === username && window.authCheck?.user?.tenantId === tenant && !window.authCheck.loading, { username, tenant });
  return page.evaluate(async ({ username, tenant }) => {
    const storage = await import('/src/utils/authStorage.ts');
    return window.authCheck.user.username === username && storage.getCurrentUserSnapshot()?.tenantId === tenant && storage.getAuthToken() !== null;
  }, { username, tenant });
};
async function createCase(initial = info(), pathname = '/auth-check', width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const test = { context, page: await context.newPage(), plans: [initial], fallback: info(), requests: [], pending: [], logout: { status: 200, data: null }, switch: { status: 200, data: { token: 'auth-check-switched', tenantId: 100001 } } };
  cases.push(test);
  test.page.on('pageerror', error => errors.push(error.message));
  test.release = async () => { const pending = test.pending.splice(0); pending.forEach(entry => entry.release()); await Promise.all(pending.map(entry => entry.finished)); };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === pathname) {
      const entry = `/@fs/${path.join(root, 'scripts/auth-checks/AuthInitializationCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    test.requests.push(url.pathname);
    const plan = url.pathname === '/api/auth/info' ? test.plans.shift() || test.fallback
      : url.pathname === '/api/auth/logout' ? test.logout
        : url.pathname === '/api/auth/switchTenant' ? test.switch
          : url.pathname === '/api/auth/check-expired' ? test.expired : null;
    if (!plan) { unexpected.push(url.pathname); return route.abort(); }
    let finished;
    if (plan.held) {
      const entry = { finished: new Promise(resolve => { finished = resolve; }) };
      const held = new Promise(resolve => { entry.release = resolve; });
      test.pending.push(entry);
      await held;
    }
    try {
      if (plan.networkFailure) return await route.abort('connectionfailed');
      return await route.fulfill({ status: plan.status, contentType: 'application/json', body: JSON.stringify({ code: plan.code ?? plan.status, msg: plan.status === 200 ? 'success' : '受控身份读取故障', data: plan.data }) });
    } finally { finished?.(); }
  });
  await test.page.goto(`${origin}${pathname}`);
  return test;
}

try {
  await fs.mkdir(output, { recursive: true });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const strict = await createCase({ ...info(), held: true });
  await waitFor(() => strict.pending.length > 0, 'StrictMode initialization arrived');
  await pause(150);
  check('StrictMode重复初始化只发送一次身份请求', strict.requests.filter(route => route === '/api/auth/info').length === 1);
  await strict.release();
  check('共用请求成功后真实上下文和身份快照一致', await identity(strict.page, '初始用户'));
  const beforeRefresh = strict.requests.length;
  strict.fallback = { ...info('刷新用户'), held: true };
  await begin(strict.page, 'refresh-first', 'refreshUser');
  await begin(strict.page, 'refresh-second', 'refreshUser');
  await waitFor(() => strict.pending.length > 0, 'Concurrent refresh arrived');
  await pause(100);
  check('两个同时刷新共用一次请求且完成后不复用旧结果', strict.requests.length === beforeRefresh + 1);
  await strict.release();
  check('两次刷新均取得新身份', await settled(strict.page, 'refresh-first') === 'success' && await settled(strict.page, 'refresh-second') === 'success' && await identity(strict.page, '刷新用户'));
  strict.fallback = { status: 503, data: null };
  await begin(strict.page, 'failed-refresh', 'refreshUser');
  check('已有身份暂时刷新失败保留有效登录', await settled(strict.page, 'failed-refresh') !== 'success' && await identity(strict.page, '刷新用户'));
  await strict.context.close();

  for (const [name, plan, width] of [
    ['409', { status: 409, data: null }, 1440], ['503', { status: 503, data: null }, 375],
    ['断网', { networkFailure: true }, 1440], ['空响应', { status: 200, data: null }, 375],
    ['无效身份', { status: 200, data: { user: { userId: 0, userName: '' } } }, 1440],
  ]) {
    const test = await createCase(plan, '/auth-check', width);
    await test.page.getByRole('button', { name: '重新验证', exact: true }).waitFor();
    check(`${name}初始化失败不清除凭据且不显示业务数据`, await test.page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken() === 'auth-check-initial')
      && await test.page.getByTestId('protected-content').count() === 0);
    if (name === '503') {
      const button = await test.page.getByRole('button', { name: '重新验证', exact: true }).boundingBox();
      check('手机重试按钮至少44像素且页面无横向溢出', button.height >= 44 && await test.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await test.page.screenshot({ path: path.join(output, 'initialization-retry-375.png'), fullPage: true });
    }
    await test.page.getByRole('button', { name: '重新验证', exact: true }).click();
    check(`${name}人工重试恢复身份且无自动重复读取`, await identity(test.page, '初始用户') && test.requests.filter(route => route === '/api/auth/info').length === 2);
    await test.context.close();
  }

  for (const [name, oldResponse] of [['成功', info('旧用户')], ['401', { status: 401, data: null }], ['业务401', { status: 200, code: 401, data: null }], ['503', { status: 503, data: null }]]) {
    const test = await createCase({ ...oldResponse, held: true });
    await waitFor(() => test.pending.length === 1, 'Old identity request held');
    test.fallback = info('新用户', 100001);
    await begin(test.page, 'new-login', 'login', 'auth-check-new');
    check(`旧${name}返回前新登录独立读取身份`, await settled(test.page, 'new-login') === 'success' && await identity(test.page, '新用户', 100001));
    await test.release();
    await pause(100);
    check(`迟到的旧${name}不会覆盖或清除新登录`, await identity(test.page, '新用户', 100001)
      && await test.page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken() === 'auth-check-new'));
    await test.context.close();
  }

  const logout = await createCase({ ...info('已退出旧用户'), held: true });
  await waitFor(() => logout.pending.length === 1, 'Pre-logout request held');
  await begin(logout.page, 'logout', 'logout');
  check('退出接口完成后凭据清空', await settled(logout.page, 'logout') === 'success' && await logout.page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken() === null));
  await logout.release();
  await pause(100);
  check('退出前迟到成功不能恢复身份或快照', await logout.page.evaluate(async () => !window.authCheck.user && (await import('/src/utils/authStorage.ts')).getCurrentUserSnapshot() === null));
  await logout.context.close();

  const switcher = await createCase();
  await identity(switcher.page, '初始用户');
  switcher.plans.push({ ...info('旧租户'), held: true });
  await begin(switcher.page, 'old-refresh', 'refreshUser');
  await waitFor(() => switcher.pending.length === 1, 'Old tenant refresh held');
  switcher.fallback = info('新租户', 100001);
  await begin(switcher.page, 'switch', 'switchTenant', 100001);
  check('切换租户使用新会话读取身份', await settled(switcher.page, 'switch') === 'success' && await identity(switcher.page, '新租户', 100001));
  await switcher.release();
  check('旧租户刷新结果取消且新租户保持', await settled(switcher.page, 'old-refresh') === 'ERR_CANCELED' && await identity(switcher.page, '新租户', 100001));
  await switcher.context.close();

  for (const operation of ['logout', 'switchTenant']) {
    const test = await createCase();
    await identity(test.page, '初始用户');
    test[operation === 'logout' ? 'logout' : 'switch'].held = true;
    await begin(test.page, 'old-operation', operation, 100001);
    await waitFor(() => test.pending.length === 1, 'Old account operation held');
    test.fallback = info('新登录', 100001);
    await begin(test.page, 'new-login', 'login', 'auth-check-new');
    await settled(test.page, 'new-login');
    await test.release();
    await settled(test.page, 'old-operation');
    check(`迟到${operation}不能清空后来的新登录`, await identity(test.page, '新登录', 100001)
      && await test.page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken() === 'auth-check-new'));
    await test.context.close();
  }

  const unmounted = await createCase({ ...info(), held: true });
  await waitFor(() => unmounted.pending.length === 1, 'Unmount request held');
  await unmounted.page.getByRole('button', { name: '卸载身份检查' }).click();
  await unmounted.release();
  await pause(100);
  check('卸载后的初始化不写入身份快照', await unmounted.page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getCurrentUserSnapshot() === null));
  await unmounted.page.getByRole('button', { name: '载入身份检查' }).click();
  check('重新挂载发起新读取并正常恢复', await identity(unmounted.page, '初始用户') && unmounted.requests.length === 2);
  await unmounted.context.close();

  const remounted = await createCase({ ...info(), held: true });
  await waitFor(() => remounted.pending.length === 1, 'Remount request held');
  await remounted.page.getByRole('button', { name: '卸载身份检查' }).click();
  await remounted.page.getByRole('button', { name: '载入身份检查' }).click();
  await pause(100);
  check('未完成请求跨同会话重新挂载仍仅发送一次', remounted.requests.length === 1);
  await remounted.release();
  check('重新挂载仅由当前组件写入身份', await identity(remounted.page, '初始用户'));
  await remounted.context.close();

  const failedSwitch = await createCase();
  await identity(failedSwitch.page, '初始用户');
  failedSwitch.switch = { status: 503, data: null };
  await begin(failedSwitch.page, 'failed-switch', 'switchTenant', 100001);
  await settled(failedSwitch.page, 'failed-switch');
  await failedSwitch.page.getByRole('button', { name: '重新验证', exact: true }).waitFor();
  check('切换结果不明时保留凭据但禁止业务页面', await failedSwitch.page.getByTestId('protected-content').count() === 0
    && await failedSwitch.page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken() === 'auth-check-initial'));
  await failedSwitch.page.getByRole('button', { name: '重新验证', exact: true }).click();
  check('重新核实当前身份后恢复业务页面', await identity(failedSwitch.page, '初始用户'));
  failedSwitch.switch = { status: 200, data: { token: 'auth-check-switched', tenantId: 100001 } };
  failedSwitch.fallback = { status: 503, data: null };
  await begin(failedSwitch.page, 'failed-new-identity', 'switchTenant', 100001);
  await settled(failedSwitch.page, 'failed-new-identity');
  check('令牌已切换但新身份失败时不恢复旧租户身份', await failedSwitch.page.evaluate(async () => {
    const storage = await import('/src/utils/authStorage.ts');
    return !window.authCheck.user && !window.authCheck.loading && storage.getAuthToken() === null && storage.getCurrentUserSnapshot() === null;
  }));
  await failedSwitch.context.close();

  for (const status of [401, 200]) {
    const test = await createCase({ status, code: 401, data: null });
    await test.page.waitForFunction(() => window.authCheck && !window.authCheck.loading);
    check(`HTTP${status}首次身份失效清空会话且不进入故障重试`, await test.page.evaluate(async () => {
      const storage = await import('/src/utils/authStorage.ts');
      return !window.authCheck.user && storage.getAuthToken() === null && storage.getCurrentUserSnapshot() === null;
    }) && await test.page.getByRole('button', { name: '重新验证', exact: true }).count() === 0);
    await test.context.close();
  }

  for (const status of [401, 200]) {
    const test = await createCase();
    await identity(test.page, '初始用户');
    test.expired = { status, code: 401, data: null, held: true };
    await test.page.evaluate(() => {
      window.expiredDone = false;
      import('/src/services/api/request.ts').then(module => module.default.get('/auth/check-expired', { silent: true })).catch(() => {}).finally(() => { window.expiredDone = true; });
    });
    await waitFor(() => test.pending.length === 1, 'Old business 401 held');
    test.fallback = info('新业务身份', 100001);
    await begin(test.page, 'login-business', 'login', 'auth-check-new');
    await settled(test.page, 'login-business');
    await test.release();
    await test.page.waitForFunction(() => window.expiredDone);
    check(`HTTP${status}旧业务401不能清空新会话`, await identity(test.page, '新业务身份', 100001));
    test.fallback = { status, code: 401, data: null };
    await begin(test.page, 'current-expired', 'refreshUser');
    await settled(test.page, 'current-expired');
    check(`HTTP${status}当前会话401仍退出并清空快照`, await test.page.evaluate(async () => {
      const storage = await import('/src/utils/authStorage.ts');
      return !window.authCheck.user && !window.authCheck.loading && storage.getAuthToken() === null && storage.getCurrentUserSnapshot() === null;
    }));
    test.fallback = info('再次登录', 100001);
    await begin(test.page, 'again', 'login', 'auth-check-again');
    await settled(test.page, 'again');
    test.fallback = { status, code: 401, data: null };
    await begin(test.page, 'again-expired', 'refreshUser');
    await settled(test.page, 'again-expired');
    check(`HTTP${status}前次401去重不抑制新会话失效`, await test.page.evaluate(async () => !window.authCheck.user && (await import('/src/utils/authStorage.ts')).getAuthToken() === null));
    await test.context.close();
  }

  for (const width of [1440, 375]) {
    const restricted = { status: 200, data: { ...user(), roles: ['ADMIN'], permissions: ['system:auth:info', 'system:auth:logout', 'system:user:profile:password'] } };
    const test = await createCase(restricted, '/auth-check', width);
    await identity(test.page, '初始用户');
    check(`${width}管理员未选搜索时内容隐藏且按钮禁用`, await test.page.getByTestId('search-feature').count() === 0 && await test.page.getByTestId('search-button').isDisabled());
    test.fallback = { status: 200, data: { ...restricted.data, permissions: [...restricted.data.permissions, 'system:search:business'] } };
    await begin(test.page, 'enable-search', 'refreshUser');
    await settled(test.page, 'enable-search');
    await test.page.getByTestId('search-feature').waitFor();
    check(`${width}明确增加搜索后无需重新登录即可使用`, await test.page.getByTestId('search-button').isEnabled());
    check(`${width}管理员不能绕过全部权限同时满足规则`, await test.page.getByTestId('all-features').count() === 0);
    test.fallback = restricted;
    await begin(test.page, 'disable-search', 'refreshUser');
    await settled(test.page, 'disable-search');
    check(`${width}刷新后撤回搜索且保留登录`, await test.page.getByTestId('search-feature').count() === 0 && await test.page.getByTestId('search-button').isDisabled() && await identity(test.page, '初始用户'));
    test.fallback = { status: 200, data: { ...restricted.data, permissions: ['*:*:*'] } };
    await begin(test.page, 'legacy-grants', 'refreshUser');
    await settled(test.page, 'legacy-grants');
    await test.page.getByTestId('all-features').waitFor();
    check(`${width}服务器返回旧租户通配时保持原授权`, await test.page.getByTestId('search-button').isEnabled());
    await test.context.close();
  }

  for (const pathname of ['/login', '/register', '/portal', '/portal/tickets']) {
    const test = await createCase(info(), pathname);
    await test.page.waitForFunction(() => window.authCheck && !window.authCheck.loading);
    check(`${pathname}不自动探测内部登录`, test.requests.length === 0);
    await test.context.close();
  }
  check('确定性身份回归没有页面异常或非预期接口', errors.length === 0 && unexpected.length === 0);
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  for (const test of cases) await test.release().catch(() => {});
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors, unexpected, failure: failure?.message,
    requests: cases.map(test => test.requests), scope: '真实AuthProvider、存储、请求拦截器与StrictMode；接口响应为受控替身，不含真实后端或数据库' }, null, 2));
  await browser?.close();
  await server.close();
  console.log(`AUTH_INITIALIZATION_UI: checks=${checks.length}; failed=${failure ? 1 : 0}; strict_mode=true; actual_auth_provider=true; actual_request_interceptor=true; interface_double=true; mysql=false; production_modified=false; output=${output}`);
  if (failure) process.exitCode = 1;
}
