import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/tenant-navigation-ui', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, fs: { allow: [root] } } });
const entries = [
  ['/system/tenant-packages', 'system:tenant-package:list', '/auth/system/tenant-package/list', '租户套餐'],
  ['/system/tenant', 'system:tenant:list', '/auth/system/tenant/list', '租户管理'],
  ['/system/data-sources', 'system:data-source:list', '/auth/system/data-source/list', '数据源管理'],
  ['/system/oauth2-clients', 'system:oauth2:client:list', '/auth/system/oauth2/client/list', '第三方客户端'],
];
const pageResult = { rows: [], total: 0, pageNum: 1, pageSize: 10 };
const tenant = { tenantId: 100000, tenantCode: 'current', tenantName: '当前公司', userLimit: 2, storageLimit: 3, storageUsed: 4, version: 1, status: '0' };
const tenants = Array.from({ length: 22 }, (_, index) => ({ tenantId: 100000 + index, tenantCode: `company-${index}`, tenantName: index ? `候选公司${index}` : '当前公司' }));
const businessTypes = ['CUSTOMER', 'CONTRACT', 'EMPLOYEE', 'WORKFLOW_INSTANCE', 'TICKET', 'ASSET'];
const checks = [], errors = [], unexpected = [], cases = [];
let origin, browser, failure;
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(condition, label) {
  const deadline = Date.now() + 20000;
  while (!condition() && Date.now() < deadline) await pause(20);
  assert.ok(condition(), label);
}
async function createCase({ routePath = entries[0][0], width = 1440, permissions = entries.map(entry => entry[1]), verified = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 768, isMobile: width < 768, serviceWorkers: 'block' });
  const test = { context, page: await context.newPage(), requests: [], permissions, verified, tenantId: 100000, switches: [], pending: [], holdDirectory: false, directoryFailure: false, switchFailure: false };
  cases.push(test);
  test.page.on('pageerror', error => errors.push(error.message));
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
    if (route.request().resourceType() === 'document') {
      const entry = `/@fs/${path.join(root, 'scripts/tenant-package-checks/TenantNavigationUiCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const api = url.pathname.slice(4);
    const body = route.request().postDataJSON();
    test.requests.push(`${route.request().method()} ${url.pathname}${url.search}`);
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, msg: status === 200 ? 'success' : '受控拒绝', data }) });
    if (api === '/auth/login' && route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (api === '/auth/info') return respond({ user: { userId: 101, userName: 'navigation-check', nickName: '导航测试账号', tenantId: test.tenantId, tenantName: test.tenantId === 100000 ? '当前公司' : `候选公司${test.tenantId - 100000}`, forcePasswordChange: false }, roles: ['ADMIN'], permissions: test.permissions });
    if (api === '/auth/system/platform/access') return respond({ configured: true, verified: test.verified, totpRequired: false, verifiedUntil: test.verified ? Date.now() + 300000 : null });
    if (api === '/auth/system/platform/access/reauthenticate') { test.verified = true; return respond({ configured: true, verified: true, totpRequired: false, verifiedUntil: Date.now() + 300000 }); }
    if (api === '/auth/system/message/mine/unread-count') return respond({ total: 0 });
    if (api === '/auth/system/tenant-package/catalog') return respond({ modules: [], features: [] });
    if (api === '/auth/system/tenant-package/list') return respond(pageResult);
    if (api === '/auth/system/tenant/list') return respond({ records: [tenant], total: 1, current: 1, size: 10 });
    if (api === '/auth/system/tenant/statistics') return respond([{ tenantId: 100000, userCount: 3, userLimitReached: true, expired: false, disabled: false }]);
    if (api === '/auth/system/data-source/list') return respond({ configured: true, accountVerificationReady: true, message: '', allowedServices: [], page: pageResult });
    if (api === '/auth/system/oauth2/client/list') return respond({ enabled: true, message: '', scopeRegistry: [], page: pageResult });
    if (api === '/auth/tenant/switch-options') {
      if (test.directoryFailure) return respond(null, 503);
      const selected = tenants.filter(item => item.tenantName.includes(url.searchParams.get('keyword') || ''));
      const current = Number(url.searchParams.get('current')), size = Number(url.searchParams.get('size'));
      const data = { records: selected.slice((current - 1) * size, current * size), total: selected.length, current, size };
      if (test.holdDirectory) { test.pending.push(() => respond(data)); return; }
      return respond(data);
    }
    if (api === '/auth/switchTenant') {
      test.switches.push(body);
      if (test.switchFailure) return route.abort('connectionfailed');
      test.tenantId = body.tenantId;
      test.permissions = test.permissions.filter(permission => permission !== 'system:tenant:switch');
      return respond({ token: 'controlled-new-tenant-token' });
    }
    if (api === '/auth/getRouters') return respond([
      { menuId: 100, parentId: 0, orderNum: 1, path: '/system/user', component: 'pages/system/UserList', menuName: '用户管理', menuType: 'C', visible: '0', status: '0', perms: 'system:user:list', icon: 'Users' },
      { menuId: 101, parentId: 0, orderNum: 2, path: '/system/role', component: 'pages/system/RoleList', menuName: '角色管理', menuType: 'C', visible: '0', status: '0', perms: 'system:role:list', icon: 'Shield' },
    ]);
    if (api === '/auth/system/user/list' || api === '/auth/system/role/list') return respond(pageResult);
    if (['/auth/system/dept/tree', '/auth/system/menu/list', '/auth/system/role/optionselect', '/auth/system/role/mutex/list'].includes(api)) return respond([]);
    if (api === '/auth/system/search/business') return respond({ keyword: url.searchParams.get('keyword'), limitPerType: 5, groups: businessTypes.map(type => ({ type, state: 'AVAILABLE', hasMore: false, items: [] })) });
    unexpected.push(`${route.request().method()} ${api}`); return route.abort();
  });
  await test.page.goto(`${origin}${routePath}`);
  return test;
}
const received = (test, api) => test.requests.some(item => item.startsWith(`GET /api${api}`));
try {
  await fs.mkdir(output, { recursive: true });
  await server.listen(); origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 390]) {
    for (const [routePath, permission, api, label] of entries) {
      const secured = await createCase({ routePath, width, permissions: [permission] });
      await secured.page.getByRole('button', { name: '验证身份', exact: true }).waitFor();
      check(`${width}px ${label}真实路由无需902且仍要求平台再认证`, !received(secured, api) && !received(secured, '/auth/getRouters'));
      check(`${width}px ${label}仅显示已获授权的直接入口`, await secured.page.getByRole('link', { name: label, exact: true }).count() === 1 && await secured.page.locator('[aria-label="平台管理入口"] a').count() === 1);
      await secured.page.getByLabel('当前账号密码').fill('controlled-password');
      await secured.page.getByRole('button', { name: '验证身份', exact: true }).click();
      await waitFor(() => received(secured, api), `${label} list requested`);
      check(`${width}px ${label}再认证后读取页面数据`, !received(secured, '/auth/getRouters'));
      if (routePath === '/system/tenant') {
        await secured.page.getByText('已超额，禁止新增用户').waitFor();
        await secured.page.getByText('已超额，禁止新增文件').waitFor();
        check(`${width}px 超额保留列表读取并分别标明用户与文件限制`, await secured.page.getByText('当前公司', { exact: true }).count() > 0);
      }
      const denied = await createCase({ routePath, width, permissions: [] });
      await denied.page.getByText('您没有访问此页面的权限').waitFor();
      check(`${width}px ADMIN名称不能绕过${label}权限`, !received(denied, api) && !received(denied, '/auth/system/platform/access'));
      await secured.context.close(); await denied.context.close();
    }
  }
  const switcher = await createCase({ width: 390, permissions: ['system:tenant-package:list', 'system:tenant:switch'] });
  const trigger = switcher.page.getByRole('button', { name: '当前租户：当前公司', exact: true });
  await trigger.waitFor();
  check('未展开切换器不读取候选或平台租户详情', !received(switcher, '/auth/tenant/switch-options') && !received(switcher, '/auth/system/tenant/list'));
  const bounds = await trigger.boundingBox();
  check('手机切换按钮至少44像素', bounds.width >= 44 && bounds.height >= 44);
  await trigger.click();
  await switcher.page.getByText('第1页 · 共22户').waitFor();
  check('切换器首屏20条服务端分页', await switcher.page.getByRole('button', { name: /^切换到/ }).count() === 20);
  await switcher.page.getByRole('button', { name: '下一页', exact: true }).click();
  await switcher.page.getByText('第2页 · 共22户').waitFor();
  check('切换器第二页仅剩两条', await switcher.page.getByRole('button', { name: /^切换到/ }).count() === 2);
  await switcher.page.getByLabel('查找可切换租户').fill('候选公司21');
  await switcher.page.getByText('第1页 · 共1户').waitFor();
  check('搜索请求重置页码且按关键字过滤', switcher.requests.some(item => item.includes('current=1') && item.includes('size=20') && item.includes(encodeURIComponent('候选公司21'))));
  await switcher.page.keyboard.press('Escape');
  check('Escape关闭并归还焦点，无隐藏可选项', await trigger.evaluate(element => element === document.activeElement) && await switcher.page.getByRole('button', { name: /^切换到/ }).count() === 0);
  await trigger.click();
  await switcher.page.getByRole('button', { name: '切换到候选公司21 ID 100021', exact: true }).click();
  await waitFor(() => switcher.switches.length === 1, 'single switch');
  await switcher.page.getByRole('button', { name: '验证身份', exact: true }).waitFor();
  await switcher.page.waitForFunction(() => !document.querySelector('[aria-label^="当前租户："]'));
  check('成功切换重新加载权限，目标无903时切换器消失', switcher.tenantId === 100021 && switcher.switches.length === 1);
  const stale = await createCase({ permissions: ['system:tenant-package:list', 'system:tenant:switch'] });
  await stale.page.getByRole('button', { name: '当前租户：当前公司' }).click();
  await stale.page.getByText('第1页 · 共22户').waitFor();
  stale.holdDirectory = true;
  await stale.page.getByLabel('查找可切换租户').fill('候选公司1');
  await waitFor(() => stale.pending.length === 1, 'held directory response');
  stale.permissions = ['system:tenant-package:list'];
  await stale.page.getByTestId('refresh-identity').click();
  await stale.page.waitForFunction(() => !document.querySelector('[aria-label^="当前租户："]'));
  await stale.pending.shift()();
  check('撤销903后迟到候选不得回填或继续切换', await stale.page.getByRole('button', { name: /^切换到/ }).count() === 0 && stale.switches.length === 0);
  const failed = await createCase({ permissions: ['system:tenant-package:list', 'system:tenant:switch'] });
  failed.directoryFailure = true;
  await failed.page.getByRole('button', { name: '当前租户：当前公司' }).click();
  await failed.page.getByRole('button', { name: '重新读取', exact: true }).waitFor();
  check('候选接口失败显示重试，不伪装无结果', await failed.page.getByRole('alert').count() === 1);
  failed.directoryFailure = false;
  await failed.page.getByRole('button', { name: '重新读取', exact: true }).click();
  await failed.page.getByText('第1页 · 共22户').waitFor();
  failed.switchFailure = true;
  await failed.page.getByRole('button', { name: '切换到候选公司1 ID 100001', exact: true }).click();
  await failed.page.getByText('身份验证暂不可用', { exact: true }).waitFor();
  check('切换结果不明时关闭业务页面，禁止带旧身份重试', await failed.page.getByRole('button', { name: /^当前租户：/ }).count() === 0 && failed.switches.length === 1);
  await failed.page.getByRole('button', { name: '重新验证', exact: true }).click();
  await failed.page.getByRole('button', { name: '当前租户：当前公司' }).waitFor();
  check('重新确认原身份后恢复页面且不自动重发切换', failed.switches.length === 1);
  for (const [routePath, permission, action] of [['/system/user', 'system:user', '新增用户'], ['/system/role', 'system:role', '新增角色']]) {
    const ordinary = await createCase({ routePath, permissions: ['system:auth:router', `${permission}:list`, `${permission}:add`] });
    await ordinary.page.getByRole('button', { name: action, exact: true }).click();
    const field = ordinary.page.getByLabel('所属租户', { exact: true });
    await field.waitFor();
    check(`${action}仅当前租户且不可编辑`, await field.inputValue() === '当前公司' && await field.evaluate(element => element.readOnly));
    check(`${action}不请求平台租户列表或切换目录`, !received(ordinary, '/auth/system/tenant/list') && !received(ordinary, '/auth/tenant/switch-options'));
  }
  const search = await createCase({ permissions: ['system:tenant-package:list', 'system:search:business'] });
  await search.page.getByRole('button', { name: '搜索功能（Ctrl 或 Command 加 K）', exact: true }).click();
  await search.page.getByRole('combobox').fill('测试业务');
  await waitFor(() => received(search, '/auth/system/search/business'), 'business search without menus');
  check('独立1986无需902即可搜索且不请求菜单', !received(search, '/auth/getRouters'));
  search.permissions = ['system:tenant-package:list'];
  await search.page.getByRole('button', { name: '关闭搜索' }).click();
  await search.page.getByTestId('refresh-identity').click();
  await search.page.waitForFunction(() => document.querySelector('[aria-label="搜索功能（Ctrl 或 Command 加 K）"]')?.disabled);
  check('撤销1986且无902后搜索按钮禁用', await search.page.getByRole('button', { name: '搜索功能（Ctrl 或 Command 加 K）' }).isDisabled());
  check('没有未登记外部或业务接口访问', unexpected.length === 0);
  check('没有浏览器脚本异常', errors.length === 0);
} catch (error) { failure = error; console.error(error); }
finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors, unexpected, failure: failure?.stack, real_router: true, api_double: true, real_backend: false }, null, 2));
  for (const test of cases) { for (const release of test.pending) await release().catch(() => {}); await test.context.close(); }
  await browser?.close(); await server.close();
}
console.log(`TENANT_NAVIGATION_UI_CHECKS: assertions=${checks.length}; failed=${failure ? 1 : 0}; real_router=true; real_browser=true; api_double=true; real_backend=false; evidence=${output}`);
if (failure) process.exitCode = 1;
