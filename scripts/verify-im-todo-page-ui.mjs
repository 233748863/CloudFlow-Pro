import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/im-todo-page-ui', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
await fs.mkdir(output, { recursive: true });
const entry = `/@fs/${path.join(root, 'scripts/im-checks/ImTodoPageUiCheck.tsx').replaceAll('\\', '/')}`;
const entryPlugin = () => ({ name: 'owned-todo-page', configureServer(vite) {
  vite.middlewares.use(async (request, response, next) => {
    if (!new URL(request.url, 'http://localhost').pathname.startsWith('/workflow/task/')) return next();
    try {
      const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`);
      response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html);
    } catch (failure) { next(failure); }
  });
} });
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), plugins: [entryPlugin()], cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, fs: { allow: [root] } } });
const cases = [];
const checks = [];
const errors = [];
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
let browser;
let origin;
async function createCase({ width = 1440, loggedIn = true, allowed = true, failed = false, assignee = 1, identifier = 'owned-todo' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const test = { context, page: await context.newPage(), calls: [], permissions: allowed ? ['workflow:task:todo', 'workflow:task:complete', 'workflow:process:view', 'workflow:task:read'] : [], failed, userId: 1 };
  cases.push(test);
  test.page.on('pageerror', error => errors.push(error.message));
  await context.addCookies([{ name: 'XSRF-TOKEN', value: 'im-todo-ui-csrf', url: origin, sameSite: 'Lax' }]);
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(); const address = new URL(request.url());
    if (address.origin !== origin) return route.abort();
    if (!address.pathname.startsWith('/api/')) return route.continue();
    test.calls.push({ path: address.pathname, query: address.searchParams.toString(), method: request.method(), body: request.postData() ? request.postDataJSON() : null });
    const result = (data, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify({ code, msg: code === 200 ? 'success' : '任务已处理、已转交或无权查看。', data }) });
    if (address.pathname === '/api/auth/info') return loggedIn ? result({ user: { userId: test.userId, userName: 'todo-ui', nickName: '受控审批人', tenantId: 100000, forcePasswordChange: false }, roles: ['employee'], permissions: test.permissions }) : result(null, 401);
    if (address.pathname === `/api/workflow/wf/todo/${identifier}`) return test.failed ? result(null, 409) : result({ taskId: identifier, instanceId: 'owned-instance', assignee, status: 'TODO', taskType: 'APPROVAL', nodeKey: 'review', nodeName: '审批', processName: '卡片详情流程', startUserId: '2', startUserName: '发起人', allowEdit: true, version: 0, formId: 'owned-form', variables: { reason: '受控申请内容' } });
    if (address.pathname === '/api/workflow/wf/instance/owned-instance') return result({ instanceId: 'owned-instance', variables: { reason: '受控申请内容' }, formId: 'owned-form', formNodeKey: 'review', fieldPermissions: [], formDefinition: { formId: 'owned-form', formName: '审批表单', version: 1, fieldsJson: JSON.stringify([{ id: 'reason', label: '申请说明', type: 'TEXT', required: true }]) } });
    if (address.pathname === `/api/workflow/wf/task/read/${identifier}`) return result(null);
    if (address.pathname === '/api/workflow/wf/complete') return result(null);
    return result(null, 404);
  });
  await test.page.goto(`${origin}/workflow/task/${identifier}`);
  await test.page.getByRole('heading', { name: '待办详情', exact: true }).waitFor();
  return test;
}
try {
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CLOUDFLOW_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const width of [1440, 390]) {
    const test = await createCase({ width });
    if (width === 1440) await test.page.evaluate(() => document.documentElement.classList.add('dark'));
    await test.page.getByPlaceholder('请输入审批意见...').waitFor();
    await test.page.locator('#input-reason').waitFor();
    check(`指定任务在${width}px显示原表单和办理入口`, await test.page.getByRole('button', { name: '同意', exact: true }).count() === 1);
    check(`指定任务${width}px按任务上下文读取表单`, test.calls.some(call => call.path.endsWith('/instance/owned-instance') && call.query === 'taskId=owned-todo'));
    check(`页面${width}px没有横向溢出`, await test.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await test.page.screenshot({ path: path.join(output, `todo-${width}.png`), fullPage: true });
    test.permissions = [];
    await test.page.evaluate(() => window.imTodoUiRefresh());
    await test.page.getByText('当前账号没有查看此待办的权限。', { exact: true }).waitFor();
    check(`撤权${width}px立即移除表单`, await test.page.getByPlaceholder('请输入审批意见...').count() === 0 && await test.page.locator('#input-reason').count() === 0);
  }
  const retry = await createCase({ failed: true });
  await retry.page.getByText('任务已处理、已转交或无权查看。', { exact: true }).waitFor();
  check('失效任务不显示办理窗口', await retry.page.getByPlaceholder('请输入审批意见...').count() === 0);
  retry.failed = false;
  await retry.page.getByRole('button', { name: '重试', exact: true }).click();
  await retry.page.getByPlaceholder('请输入审批意见...').waitFor();
  check('重试重新核对指定任务', retry.calls.filter(call => call.path === '/api/workflow/wf/todo/owned-todo').length >= 2);
  await retry.page.locator('#input-reason').fill('从卡片详情补充申请');
  await retry.page.getByPlaceholder('请输入审批意见...').fill('已核对');
  await retry.page.getByRole('button', { name: '同意', exact: true }).click();
  await retry.page.getByRole('button', { name: '确认', exact: true }).click();
  await retry.page.getByText('待办列表入口', { exact: true }).waitFor();
  const approvals = retry.calls.filter(call => call.path === '/api/workflow/wf/complete');
  check('原办理窗口提交指定任务和填写内容后返回列表', approvals.length === 1 && approvals[0].body.taskId === 'owned-todo'
    && approvals[0].body.action === 'APPROVE' && approvals[0].body.comment === '已核对' && approvals[0].body.variables.reason === '从卡片详情补充申请');
  const other = await createCase({ assignee: 9 });
  await other.page.getByText('当前账号已无法办理此任务。', { exact: true }).waitFor();
  check('错误接收人不读取表单或执行操作', !other.calls.some(call => call.path.includes('/instance/') || call.path.endsWith('/complete')));
  const anonymous = await createCase({ loggedIn: false });
  const login = anonymous.page.getByRole('link', { name: '登录并返回待办', exact: true });
  await login.waitFor();
  check('登录入口保存指定任务地址', await login.getAttribute('href') === '/login?redirect=%2Fworkflow%2Ftask%2Fowned-todo');
  const denied = await createCase({ allowed: false });
  await denied.page.getByText('当前账号没有查看此待办的权限。', { exact: true }).waitFor();
  check('缺少读取权限不请求任务', !denied.calls.some(call => call.path.includes('/wf/todo/')));
  const invalid = await createCase({ identifier: 'invalid.task' });
  await invalid.page.getByText('待办链接无效。', { exact: true }).waitFor();
  check('无效任务编号不请求任务', !invalid.calls.some(call => call.path.includes('/wf/todo/')));
  check('全部页面没有未捕获错误', errors.length === 0);
  await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify({ checks, errors }));
  console.log(`G4_IM_TODO_PAGE_UI: assertions=${checks.length}; failed=0; actual_components=true; api_transport=controlled; desktop_mobile=true; vendor_service=false`);
} catch (failure) {
  for (let index = 0; index < cases.length; index++) {
    await cases[index].page.screenshot({ path: path.join(output, `failure-${index}.png`), fullPage: true }).catch(() => undefined);
    await fs.writeFile(path.join(output, `failure-${index}.json`), JSON.stringify({ text: await cases[index].page.locator('body').innerText(), calls: cases[index].calls }));
  }
  throw failure;
} finally {
  for (const test of cases) await test.context.close();
  await browser?.close();
  await server.close();
}
