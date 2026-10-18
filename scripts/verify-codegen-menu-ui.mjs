import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const evidence = await fs.realpath(process.argv[2]);
assert.equal(path.dirname(evidence), await fs.realpath(path.join(workspace, '.cloudflow-runtime/codegen-db-checks')));
assert.match(path.basename(evidence), /^[a-f0-9]{32}$/);
const frontend = path.join(workspace, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(workspace, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const key = randomBytes(32).toString('hex');
const checks = [];
const errors = [];
const apiCalls = [];
const runtimeErrors = [];
const pages = new Map();
let backendOutput = '';
let browser;
let server;
let currentPage;
let backendOrigin;
let origin;
const check = (name, condition) => {
  checks.push({ name, passed: Boolean(condition) });
  if (!condition) errors.push(name);
};
const bounded = async (promise, milliseconds, message) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((unusedResolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
};
const child = spawn('java', [`@${path.join(evidence, 'run.args')}`, 'menu'], {
  cwd: workspace, env: { ...process.env, A1_CODEGEN_BROWSER_KEY: key }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
});
const exited = new Promise((resolve) => {
  child.once('error', (error) => resolve({ code: -1, error: error.message }));
  child.once('close', (code, signal) => resolve({ code, signal }));
});
child.stdin.on('error', (error) => { if (error.code !== 'EPIPE') errors.push(error.message); });
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (text) => { backendOutput += text; });
child.stderr.on('data', (text) => { backendOutput += text; });
const ready = new Promise((resolve) => child.stdout.on('data', () => {
  const match = backendOutput.match(/CODEGEN_BROWSER_BASE=(http:\/\/127\.0\.0\.1:\d+)\/system\/codegen/);
  if (match) resolve(match[1]);
}));
const fixturePlugin = {
  name: 'owned-codegen-menu-shell', enforce: 'pre',
  transform(source, identifier) {
    const normalized = identifier.replaceAll('\\', '/');
    if (normalized.endsWith('/src/context/AuthContext.tsx')) return `
      export const AuthProvider = ({ children }) => children;
      export const useAuth = () => {
        const user = globalThis.__a1MenuIdentity;
        return { user, loading: false, hasPermission: (required, all = false) => {
          const permissions = Array.isArray(required) ? required : [required];
          return all ? permissions.every(permission => user.permissions.includes(permission)) : permissions.some(permission => user.permissions.includes(permission));
        } };
      };`;
    const neutral = [
      ['/src/hooks/useWebSocket.ts', 'useWebSocket'],
      ['/src/components/TenantSwitcher.tsx', 'TenantSwitcher'],
      ['/src/components/header/HeaderAnnouncementBell.tsx', 'HeaderAnnouncementBell'],
      ['/src/components/header/HeaderUserMenu.tsx', 'HeaderUserMenu'],
      ['/src/components/common/AnnouncementHub.tsx', 'AnnouncementHub'],
    ].find(([suffix]) => normalized.endsWith(suffix));
    if (neutral) return `export const ${neutral[1]} = () => null;`;
  },
  configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      if (!request.url?.startsWith('/api/')) return next();
      response.statusCode = 403;
      response.end('Unrouted API request blocked');
    });
  },
};
const requestHeaders = (actor) => ({ 'X-A1-Verification-Key': key, 'X-A1-Menu-Actor': actor, Authorization: 'Bearer owned-menu-fixture-session' });
const mutation = async (action) => {
  const response = await fetch(`${backendOrigin}/__verification__/reviewer/${action}`, { method: 'POST', headers: requestHeaders('admin') });
  const payload = await response.json();
  apiCalls.push({ actor: 'admin', method: 'POST', path: `/__verification__/reviewer/${action}`, status: response.status, response: payload });
  assert.equal(payload.code, 200, `real role ${action}`);
  return payload.data;
};
const makePage = async (actor) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  context.setDefaultTimeout(20000);
  await context.routeWebSocket('**/*', (socket) => socket.close());
  await context.route('**/*', async (route) => {
    const request = route.request();
    const address = new URL(request.url());
    if (address.origin !== origin) {
      runtimeErrors.push(`external request blocked: ${address.origin}${address.pathname}`);
      return route.abort();
    }
    if (['/api/auth/getRouters', '/api/auth/__verification__/identity'].includes(address.pathname) && request.method() === 'GET') {
      const response = await route.fetch({ url: backendOrigin + address.pathname.slice('/api/auth'.length), headers: requestHeaders(actor), maxRedirects: 0, timeout: 20000 });
      const body = await response.body();
      apiCalls.push({ actor, method: request.method(), path: address.pathname, status: response.status(), response: JSON.parse(body.toString('utf8')) });
      return route.fulfill({ response, body });
    }
    if (address.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method())) {
      runtimeErrors.push(`unexpected request blocked: ${request.method()} ${address.pathname}`);
      return route.abort();
    }
    if (['/codegen-menu-check', '/supplier'].includes(address.pathname)) {
      const entry = `/@fs/${path.join(workspace, 'scripts/platform-checks/CodegenMenuBrowserCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body style="color:var(--cf-text)"><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    return route.continue();
  });
  const page = await context.newPage();
  currentPage = page;
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto(`${origin}/codegen-menu-check`, { waitUntil: 'networkidle' });
  pages.set(actor, page);
  return page;
};
const showGeneratedMenu = async (page) => {
  const parent = page.getByRole('button', { name: 'A1生成菜单验证', exact: true });
  await parent.waitFor();
  if (await parent.getAttribute('aria-expanded') !== 'true') await parent.click();
  const supplier = page.getByRole('button', { name: 'A1生成菜单验证 / 生成供应商验收', exact: true });
  await supplier.waitFor();
  return supplier;
};

try {
  backendOrigin = await bounded(Promise.race([ready, exited.then((result) => {
    throw new Error(`menu backend exited before readiness: ${JSON.stringify(result)}`);
  })]), 90000, 'menu backend readiness timed out');
  const missingKey = await fetch(`${backendOrigin}/getRouters`);
  check('隔离菜单接口拒绝缺少随机验证密钥的请求', missingKey.status === 403);
  const invalidActor = await fetch(`${backendOrigin}/getRouters`, { headers: requestHeaders('unknown') });
  check('隔离菜单接口拒绝未登记测试身份', invalidActor.status === 403);
  server = await createServer({
    root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error',
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') },
    plugins: [fixturePlugin], resolve: { dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] },
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, fs: { allow: [workspace] } },
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  for (const actor of ['admin', 'reviewer', 'foreign-admin']) {
    const page = await makePage(actor);
    const menu = await showGeneratedMenu(page);
    check(`${actor}实际主布局显示数据库生成的供应商菜单`, await menu.isVisible());
    for (const action of ['查询', '查看', '新增', '修改', '删除']) {
      check(`${actor}按钮权限${action}没有混入导航菜单`, await page.getByRole('button', { name: `${action}生成供应商验收`, exact: true }).count() === 0);
    }
    await page.screenshot({ path: path.join(evidence, `menu-${actor}.png`), fullPage: true });
    await page.getByRole('button', { name: '搜索功能（Ctrl 或 Command 加 K）', exact: true }).click();
    const search = page.getByPlaceholder('输入名称、拼音首字母或菜单路径');
    await search.fill('生成供应商验收');
    const result = page.getByRole('option').filter({ hasText: '生成供应商验收' });
    await result.waitFor();
    check(`${actor}实际菜单搜索可找到新生成的菜单`, await result.count() === 1);
    await result.click();
    await page.waitForURL('**/supplier');
    check(`${actor}点击菜单后进入真实生成的路由地址`, new URL(page.url()).pathname === '/supplier');
    await page.getByText('菜单路由未配置', { exact: true }).waitFor();
    check(`${actor}没有手写页面时明确显示未配置而非业务成功`, await page.getByText('菜单路由未配置', { exact: true }).isVisible());
  }
  const employee = await makePage('employee');
  await employee.getByText('暂无可用菜单', { exact: true }).waitFor();
  check('未授权员工主布局不显示供应商菜单', await employee.getByRole('button', { name: /生成供应商验收/ }).count() === 0);
  const identityCall = apiCalls.findLast((entry) => entry.actor === 'employee' && entry.path.endsWith('/identity'));
  check('员工页面权限来自真实数据库且没有写权限', identityCall?.response.data.user.permissions.length === 0);
  await employee.screenshot({ path: path.join(evidence, 'menu-employee.png'), fullPage: true });
  const revoked = await mutation('revoke');
  check('真实角色关联删除后审核人已无菜单授权', revoked.length === 0);
  const reviewer = pages.get('reviewer');
  currentPage = reviewer;
  await reviewer.reload({ waitUntil: 'networkidle' });
  await reviewer.getByText('暂无可用菜单', { exact: true }).waitFor();
  check('重新读取真实权限后审核人菜单消失', await reviewer.getByRole('button', { name: /生成供应商验收/ }).count() === 0);
  const restored = await mutation('grant');
  check('真实角色服务重新授予目录菜单和五个按钮', restored.length === 7 && restored.filter((entry) => entry.menuType === 'F').length === 5);
  await reviewer.reload({ waitUntil: 'networkidle' });
  check('重新授权后审核人菜单恢复显示', await (await showGeneratedMenu(reviewer)).isVisible());
  const restoredIdentity = apiCalls.findLast((entry) => entry.actor === 'reviewer' && entry.path.endsWith('/identity'));
  check('前端没有使用ADMIN自动放行绕过菜单权限过滤', restoredIdentity?.response.data.user.role === 'EMPLOYEE' && restoredIdentity.response.data.user.permissions.length === 4);
  check('菜单页面没有未捕获异常或未知外部调用', runtimeErrors.length === 0);
  console.log('CODEGEN_MENU_VISIBILITY: admin=true; assigned_reviewer=true; foreign_admin=true; employee=false; revoke_and_regrant=true');
  console.log('CODEGEN_MENU_DESTINATION: path=/supplier; component=null; generated_frontend=false; business_page_available=false; explicit_unconfigured=true');
} catch (error) {
  errors.push(error.stack || error.message);
  await currentPage?.screenshot({ path: path.join(evidence, 'menu-failure.png'), fullPage: true }).catch(() => {});
} finally {
  await browser?.close().catch((error) => errors.push(error.message));
  await server?.close().catch((error) => errors.push(error.message));
  child.stdin.end();
  const result = await bounded(exited, 60000, 'menu backend cleanup timed out').catch((error) => {
    errors.push(error.message);
    return { code: -1 };
  });
  check('菜单隔离HTTP服务正常关闭', result.code === 0 && backendOutput.includes('CODEGEN_BROWSER_HTTP_CLOSED:'));
  check('菜单独立库核验所有权后清理完毕', backendOutput.includes('CODEGEN_DB_REMOVED: ownership_verified=true; remaining=0; runtime_writes=0'));
  await fs.writeFile(path.join(evidence, 'menu-backend.log'), backendOutput);
  await fs.writeFile(path.join(evidence, 'menu-api.json'), JSON.stringify(apiCalls, null, 2));
  await fs.writeFile(path.join(evidence, 'menu-browser-results.json'), JSON.stringify({ checks, errors, runtimeErrors,
    limitations: { loginIdentityFixture: true, actualMenuService: true, actualAuthControllerRouterMethod: true,
      productionAuthenticationTested: false, productionCacheInvalidationTested: false, unrelatedHeaderFeaturesReplaced: true, runtimeWrites: 0 } }, null, 2));
}
for (const line of backendOutput.split(/\r?\n/).filter((line) => line.startsWith('CODEGEN_'))) console.log(line);
console.log(`CODEGEN_MENU_UI: assertions=${checks.length}; passed=${checks.filter((entry) => entry.passed).length}; failed=${checks.filter((entry) => !entry.passed).length}`);
console.log(`CODEGEN_MENU_HTTP: router_method_requests=${apiCalls.filter((entry) => entry.path.endsWith('/getRouters')).length}; database_identity_fixture_requests=${apiCalls.filter((entry) => entry.path.endsWith('/identity')).length}; role_assignment_fixture_requests=${apiCalls.filter((entry) => entry.method === 'POST').length}; total=${apiCalls.length}; production_authentication_tested=false; cache_invalidation_tested=false`);
console.log(`CODEGEN_MENU_EVIDENCE=${evidence}`);
for (const entry of checks) console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${entry.name}`);
for (const error of errors) console.error(`CODEGEN_MENU_FAILURE: ${error}`);
process.exitCode = errors.length ? 1 : 0;
