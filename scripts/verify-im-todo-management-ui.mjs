import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/im-todo-management-ui', randomUUID().replaceAll('-', ''));
await fs.mkdir(output, { recursive: true });
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const entry = `/@fs/${path.join(root, 'scripts/im-checks/ImTodoManagementUiCheck.tsx').replaceAll('\\', '/')}`;
const plugin = { name: 'owned-todo-management', configureServer(server) { server.middlewares.use(async (request, response, next) => {
  if (new URL(request.url, 'http://localhost').pathname !== '/system/im/config') return next();
  try { const html = await server.transformIndexHtml(request.url, `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`); response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
  catch (failure) { next(failure); }
}); } };
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), plugins: [plugin], cacheDir: path.join(output, 'vite-cache'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, fs: { allow: [root] } } });
const config = { configId: 99, imType: 'WECOM', corpId: '受控企业', agentId: '10001', status: 'ENABLED', version: 1, todoEnabled: true };
const record = { mappingId: 991, taskId: 'owned-task', receiverName: '测试接收员工', status: 'SENT', updateStatus: 'MISSING', version: 2, createTime: '2026-09-30 12:00:00' };
const contexts = [];
const checks = [];
const errors = [];
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CLOUDFLOW_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' }); contexts.push(context);
    const page = await context.newPage(); page.on('pageerror', failure => errors.push(failure.message));
    let permissions = ['system:im:config:list', 'system:im:todo:reconcile'];
    let current = { ...record }; let fail = false; const writes = [];
    await context.addCookies([{ name: 'XSRF-TOKEN', value: 'todo-management-csrf', url: origin, sameSite: 'Lax' }]);
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request(); const address = new URL(request.url());
      if (address.origin !== origin) return route.abort();
      if (!address.pathname.startsWith('/api/')) return route.continue();
      const result = (data, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify({ code, msg: code === 200 ? 'success' : '核对结果暂不可用', data }) });
      if (address.pathname === '/api/auth/info') return result({ user: { userId: 1, userName: 'admin', nickName: '管理员', tenantId: 100000 }, roles: ['admin'], permissions });
      if (address.pathname === '/api/auth/system/im/config/list') return result({ deploymentEnabled: true, canConfigure: true, reason: '受控接入', providers: [], page: { rows: [config], total: 1, pageNum: 1, pageSize: 10 } });
      if (address.pathname === '/api/auth/system/im/todo/list') return result({ enabled: true, rows: [current], total: 1, pageNum: 1, pageSize: 10 });
      if (address.pathname === '/api/auth/system/im/todo/reconcile') {
        writes.push(request.postDataJSON());
        if (fail) return result(null, 503);
        current = { ...current, status: 'COMPLETED', updateStatus: 'APPLIED', version: 3 };
        return result({ changed: true, entry: current });
      }
      return result(null, 404);
    });
    await page.goto(`${origin}/system/im/config`);
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), width === 1440);
    await page.getByRole('button', { name: '核对待办状态', exact: true }).filter({ visible: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('测试接收员工', { exact: true }).waitFor();
    check(`${width}展示真实组件和待办记录`, await dialog.isVisible());
    check(`${width}无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const action = dialog.getByRole('button', { name: '核对这条待办', exact: true });
    check(`${width}触控区域至少44像素`, (await action.boundingBox()).height >= 44);
    await action.click();
    await dialog.getByText('卡片状态已更新并确认', { exact: true }).waitFor();
    check(`${width}精确提交映射与版本`, writes.length === 1 && writes[0].mappingId === 991 && writes[0].version === 2);
    check(`${width}办结记录禁止重复操作`, await action.isDisabled());
    current = { ...record }; fail = true;
    await dialog.getByRole('button', { name: '刷新记录', exact: true }).click();
    await action.waitFor();
    await action.click();
    await dialog.getByRole('alert').waitFor();
    check(`${width}未知结果阻止重复提交`, await action.isDisabled());
    current = { ...record, updateStatus: 'UNKNOWN' }; fail = false;
    await dialog.getByRole('button', { name: '刷新记录', exact: true }).click();
    await dialog.getByText('卡片更新：更新结果待核验', { exact: true }).waitFor();
    check(`${width}不确定消费保留核验状态`, await action.isDisabled());
    await page.screenshot({ path: path.join(output, `todo-${width}.png`), fullPage: true });
    permissions = ['system:im:config:list'];
    await page.evaluate(() => window.imTodoManagementRefresh());
    await page.getByRole('alert').filter({ hasText: '您没有权限查看待办卡片' }).waitFor();
    check(`${width}撤权后清除旧记录`, await page.getByText('测试接收员工', { exact: true }).count() === 0);
    await context.close();
  }
  check('无未捕获界面错误', errors.length === 0);
  await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify({ checks, errors }));
  console.log(`G4_IM_TODO_MANAGEMENT_UI: assertions=${checks.length}; failed=0; actual_components=true; transport=controlled; desktop_mobile=true; vendor_service=false`);
} finally { for (const context of contexts) await context.close().catch(() => undefined); await browser?.close(); await server.close(); }
