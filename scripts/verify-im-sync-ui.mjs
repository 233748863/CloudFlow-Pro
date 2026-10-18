import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/im-sync-ui', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, fs: { allow: [root] } } });
const checks = [];
const errors = [];
const cases = [];
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
const config = { configId: 101, imType: 'WECOM', corpId: 'ui_corp', agentId: '1000001', appKeyConfigured: true, appSecretConfigured: true, tokenConfigured: true, aesKeyConfigured: true,
  callbackUrl: null, expectedCallbackUrl: null, syncEnabled: false, syncCron: null, loginEnabled: false, messageEnabled: false, todoEnabled: false, syncScope: null, status: 'ENABLED', version: 3, lastSyncTime: null, updateTime: '2026-09-29 05:00:00' };
const scope = { localRootDeptId: 1000, remoteDepartmentIds: [2], primaryDepartments: {} };
const configuration = { configId: 101, corpId: 'ui_corp', agentId: '1000001', version: 3, status: 'ENABLED', scope };
const header = { syncRunId: 201, configId: 101, configVersion: 3, mode: 'PREVIEW', status: 'PREVIEWED', fullSnapshot: true, requestedBy: 1, createdAt: '2026-09-29T05:00:00' };
const report = { header, hash: 'a'.repeat(64), configurationChanged: false, failureCode: null,
  summary: { departmentsCreated: 1, departmentsUpdated: 0, departmentsUnchanged: 0, departmentConflicts: 0, usersCreated: 0, usersUpdated: 1, usersDisabled: 0, usersUnchanged: 1, userConflicts: 1 },
  entries: { rows: [{ kind: 'DEPARTMENT', externalId: '2', localId: null, action: 'CREATE', reasons: [], before: {}, after: { name: '外部销售', parentLocalId: '1000' } },
    { kind: 'USER', externalId: 'alpha', localId: null, action: 'CONFLICT', reasons: ['PRIMARY_DEPARTMENT_REQUIRED'], before: {}, after: { name: '甲员工', mobile: '***', email: 'NOT_PROVIDED', status: '0' } },
    { kind: 'USER', externalId: 'preserved', localId: 1002, action: 'UPDATE', reasons: [], before: { name: '原姓名', mobile: '***', email: '***', status: '1' }, after: { name: '新姓名', mobile: 'LOCAL_PRESERVED', email: 'LOCAL_PRESERVED', avatar: 'LOCAL_PRESERVED', status: '1' } },
    { kind: 'USER', externalId: 'moved', localId: 1003, action: 'RELEASE', reasons: ['SCOPE_EXIT_ACCOUNT_PRESERVED'], before: { name: '范围退出员工', mobile: '***', status: '0', syncManagement: 'ACTIVE' }, after: { name: '范围退出员工', mobile: '***', status: '0', syncManagement: 'OUT_OF_SCOPE' } }], total: 4, pageNum: 1, pageSize: 50 } };
let browser;
let origin;
let failure;
async function waitUntil(condition) {
  const deadline = Date.now() + 15000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 15));
  assert.ok(condition(), '受控请求未到达');
}
async function createCase({ width = 1440, mode = 'sync', permissions = ['system:im:sync:list', 'system:im:sync:preview'], history = [], configs = [configuration], deployment = true, holdHistory = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const test = { context, page: await context.newPage(), permissions, history: structuredClone(history), configs: structuredClone(configs), configuration: structuredClone(config),
    report: structuredClone(report), calls: [], pending: [], held: [], holdPaths: new Set(holdHistory ? ['/sync/list'] : []), hold: false, previewStatus: 200, reportStatus: 200, applyStatus: 200, remoteStatus: 200, tenantId: 100000, deployment };
  test.release = () => test.pending.splice(0).forEach(release => release()); cases.push(test);
  test.releasePath = suffix => {
    const matching = test.held.filter(request => request.pathname.endsWith(suffix));
    test.held = test.held.filter(request => !matching.includes(request));
    matching.forEach(request => request.release());
  };
  test.page.on('pageerror', error => errors.push(error.message));
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/im-sync-check') {
      const entry = `/@fs/${path.join(root, 'scripts/im-checks/ImSyncUiCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const pathname = url.pathname; const body = route.request().postDataJSON();
    test.calls.push({ pathname, body, method: route.request().method(), search: url.search });
    let data; let status = 200;
    if (pathname === '/api/auth/info') data = { user: { userId: 1, userName: 'im-sync-ui', nickName: '同步检查', tenantId: test.tenantId, forcePasswordChange: false }, roles: ['admin'], permissions: test.permissions };
    else if (pathname.endsWith('/sync/configurations')) data = { deploymentEnabled: test.deployment, canConfigure: true, reason: '受控页面，不代表厂商联调', configurations: test.configs };
    else if (pathname.endsWith('/sync/list')) data = { rows: test.history, total: test.history.length, pageNum: 1, pageSize: 10 };
    else if (/\/config\/\d+\/sync-preview$/.test(pathname)) {
      status = test.previewStatus; data = structuredClone(test.report);
      if (status === 200) test.history = [data.header];
      if (test.hold) await new Promise(resolve => test.pending.push(resolve));
    } else if (/\/sync\/\d+\/apply$/.test(pathname)) {
      status = test.applyStatus;
      const progress = { processed: 2, total: 4, remaining: 2, effectsPending: false,
        actual: { ...report.summary, usersUpdated: 0, usersUnchanged: 0 } };
      data = { runId: 201, status: 'RUNNING', progress, recoveryReason: null };
      if (status === 200) {
        test.report.header = { ...test.report.header, mode: 'APPLY', status: 'RUNNING' }; test.report.progress = progress;
        test.report.entries.rows = test.report.entries.rows.map((entry, index) => ({ ...entry, processed: index < 2, localId: index === 0 ? 1004 : entry.localId }));
      }
    } else if (/\/sync\/\d+$/.test(pathname)) { status = test.reportStatus; data = test.report; }
    else if (pathname.endsWith('/config/list')) data = { deploymentEnabled: test.deployment, canConfigure: true, reason: '受控配置', providers: [], page: { rows: [test.configuration], total: 1, pageNum: 1, pageSize: 10 } };
    else if (pathname.endsWith('/config/local-departments')) data = { rows: [{ id: 1000, parentId: 0, name: '本地接入根' }], total: 1, pageNum: 1, pageSize: 50 };
    else if (pathname.endsWith('/remote-departments')) { status = test.remoteStatus; data = { configId: 101, version: 3, departments: [{ id: 2, parentId: 1, name: '外部销售' }, { id: 3, parentId: 2, name: '销售二组' }] }; }
    else if (pathname.endsWith('/im/config') && route.request().method() === 'PUT') { data = { ...test.configuration, ...body, version: body.version + 1 }; test.configuration = data; }
    else return route.abort();
    const response = JSON.stringify({ code: status, msg: status === 200 ? 'success' : `受控失败${status}`, data });
    if ([...test.holdPaths].some(suffix => pathname.endsWith(suffix))) await new Promise(release => test.held.push({ pathname, release }));
    return route.fulfill({ status, contentType: 'application/json', body: response });
  });
  await test.page.goto(`${origin}/im-sync-check?mode=${mode}`);
  if (permissions.includes(`system:im:${mode === 'sync' ? 'sync' : 'config'}:list`)) {
    await test.page.getByRole('heading', { name: mode === 'sync' ? '企业微信组织同步' : '企业微信配置', exact: true }).waitFor();
    await test.page.getByRole('button', { name: '刷新', exact: true }).waitFor();
    if (!holdHistory) await test.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '刷新' && !button.disabled));
  } else await test.page.getByText('您没有权限访问组织同步', { exact: true }).waitFor();
  return test;
}

try {
  await fs.mkdir(output, { recursive: true }); await server.listen(); origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const denied = await createCase({ permissions: [] });
  check('无同步读取权限不发业务请求', denied.calls.every(call => !call.pathname.includes('/system/im/')));
  const readonly = await createCase({ permissions: ['system:im:sync:list'], history: [header] });
  check('只读套餐能读同步目录且无配置页依赖', readonly.calls.every(call => !call.pathname.includes('/im/config')) && await readonly.page.getByRole('button', { name: '生成预览', exact: true }).count() === 0);
  const disabled = await createCase({ deployment: false });
  check('部署关闭预览按钮停用且不请求厂商', await disabled.page.getByRole('button', { name: '生成预览', exact: true }).isDisabled() && disabled.calls.every(call => !call.pathname.endsWith('/sync-preview')));
  for (const width of [1440, 320]) {
    const test = await createCase({ width }); const page = test.page;
    test.hold = true;
    await page.getByRole('button', { name: '生成预览', exact: true }).click(); await waitUntil(() => test.pending.length === 1);
    check(`${width}px读取期间阻止重复生成和配置切换`, await page.getByRole('button', { name: '正在生成预览…', exact: true }).isDisabled() && await page.getByLabel('同步应用配置', { exact: true }).isDisabled());
    test.release(); test.hold = false;
    const dialog = page.getByRole('dialog', { name: '组织同步预览报告', exact: true });
    await dialog.getByText('多部门成员需要指定主部门', { exact: true }).waitFor();
    check(`${width}px显示预期变更并明确未写组织`, (await dialog.innerText()).includes('尚未写入本地组织') && (await dialog.innerText()).includes('拟新增 1'));
    check(`${width}px缺字段保留且主部门冲突有具体说明`, (await dialog.innerText()).includes('未返回，保留本地已有值') && (await dialog.innerText()).includes('已遮挡') && (await dialog.innerText()).includes('alpha'));
    const releaseEntry = dialog.locator('article').filter({ hasText: '范围退出员工' });
    check(`${width}px范围退出明确保留账号和绑定且不显示停用`, (await releaseEntry.innerText()).includes('拟退出范围管理') && (await releaseEntry.innerText()).includes('退出本范围，保留账号') && !(await releaseEntry.innerText()).includes('拟停用'));
    check(`${width}px预览只提交版本且不自动执行`, test.calls.filter(call => call.pathname.endsWith('/sync-preview')).length === 1 && Object.keys(test.calls.find(call => call.pathname.endsWith('/sync-preview')).body).join() === 'version' && test.calls.every(call => !call.pathname.endsWith('/apply')));
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
      controls: [...document.querySelectorAll('.im-sync-dialog .btn,.im-sync-dialog .pagination-btn,.im-sync-dialog .modal-close')].filter(element => element.getClientRects().length).map(element => element.getBoundingClientRect().height) }));
    check(`${width}px报告无横向溢出且主要控件44像素`, layout.overflow <= 1 && layout.controls.length > 0 && layout.controls.every(height => height >= 43.5));
    await page.screenshot({ path: path.join(output, `preview-${width}.png`), fullPage: true });
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    test.report.configurationChanged = true;
    await page.getByRole('button', { name: '查看报告', exact: true }).filter({ visible: true }).first().click();
    await dialog.getByText('配置已发生变化；本报告保留生成时的数据，不能用于执行新配置。', { exact: true }).waitFor();
    check(`${width}px历史配置变化不隐瞒`, await dialog.isVisible());
  }
  const executionPermissions = ['system:im:sync:list', 'system:im:sync:preview', 'system:im:sync:run'];
  await readonly.page.getByRole('button', { name: '查看报告', exact: true }).filter({ visible: true }).first().click();
  await readonly.page.getByRole('dialog').waitFor();
  check('只读报告没有执行确认入口', await readonly.page.getByLabel('确认组织同步执行', { exact: true }).count() === 0);
  for (const width of [1440, 320]) {
    const test = await createCase({ width, permissions: executionPermissions, history: [header] });
    test.report.entries.total = 104;
    await test.page.getByRole('button', { name: '查看报告', exact: true }).filter({ visible: true }).first().click();
    const dialog = test.page.getByRole('dialog');
    const execute = dialog.getByRole('button', { name: '执行本批', exact: true });
    await execute.waitFor();
    check(`${width}px未经勾选不能执行且不自动提交`, await execute.isDisabled() && test.calls.every(call => !call.pathname.endsWith('/apply')));
    await dialog.getByRole('checkbox', { name: '我已核对变更，确认执行本批', exact: true }).check();
    test.holdPaths.add('/apply');
    await execute.click(); await waitUntil(() => test.held.length === 1);
    const readCount = test.calls.filter(call => /\/sync\/\d+$/.test(call.pathname)).length;
    await dialog.getByRole('button', { name: '下一页', exact: true }).filter({ visible: true }).click();
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await test.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check(`${width}px执行中切页和关闭不会卸载执行面板`, await dialog.isVisible() && test.calls.filter(call => /\/sync\/\d+$/.test(call.pathname)).length === readCount);
    check(`${width}px执行中重复提交和原批次查询均停用`, await dialog.getByRole('button', { name: '正在提交执行…', exact: true }).isDisabled()
      && await dialog.getByRole('button', { name: '查询原批次进度', exact: true }).isDisabled() && test.calls.filter(call => call.pathname.endsWith('/apply')).length === 1);
    const submitted = test.calls.find(call => call.pathname.endsWith('/apply'));
    check(`${width}px只提交当前批次精确版本和摘要`, submitted.pathname.endsWith('/201/apply') && submitted.body.version === 3
      && submitted.body.hash === report.hash && Object.keys(submitted.body).sort().join() === 'hash,version');
    test.holdPaths.clear(); test.releasePath('/apply');
    await dialog.getByLabel('实际执行进度', { exact: true }).waitFor();
    check(`${width}px真实处理标记与剩余预期区分显示`, (await dialog.innerText()).includes('已处理 2 / 4') && (await dialog.innerText()).includes('已新增')
      && (await dialog.innerText()).includes('冲突，未写入') && (await dialog.innerText()).includes('拟更新'));
    check(`${width}px继续执行前重新确认且已释放忙碌状态`, await dialog.getByRole('button', { name: '继续执行本批', exact: true }).isDisabled()
      && await dialog.getByRole('button', { name: '查询原批次进度', exact: true }).isEnabled());
    await dialog.locator('.modal-body').evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
    await test.page.screenshot({ path: path.join(output, `execution-${width}.png`), fullPage: true });
    test.report.progress.effectsPending = true;
    await dialog.getByRole('button', { name: '查询原批次进度', exact: true }).click();
    await dialog.getByText('已提交变更正在等待安全清理，后台将自动恢复；此时不能继续业务写入。', { exact: true }).waitFor();
    check(`${width}px安全清理待完成禁止继续业务写入`, await dialog.getByRole('checkbox', { name: '我已核对变更，确认执行本批', exact: true }).isDisabled());
  }
  for (const scenario of ['changed', 'incomplete', 'finished', 'disabled']) {
    const test = await createCase({ permissions: executionPermissions, history: [header], deployment: scenario !== 'disabled' });
    if (scenario === 'changed') test.report.configurationChanged = true;
    if (scenario === 'incomplete') test.report.header.fullSnapshot = false;
    if (scenario === 'finished') test.report.header.status = 'COMPLETED';
    await test.page.getByRole('button', { name: '查看报告', exact: true }).filter({ visible: true }).first().click();
    const checkbox = test.page.getByRole('checkbox', { name: '我已核对变更，确认执行本批', exact: true });
    await checkbox.waitFor();
    check(`${scenario}报告不能确认执行`, await checkbox.isDisabled() && test.calls.every(call => !call.pathname.endsWith('/apply')));
  }
  const applyUncertain = await createCase({ permissions: executionPermissions, history: [header] });
  applyUncertain.applyStatus = 503;
  await applyUncertain.page.getByRole('button', { name: '查看报告', exact: true }).filter({ visible: true }).first().click();
  await applyUncertain.page.getByRole('checkbox', { name: '我已核对变更，确认执行本批', exact: true }).check();
  await applyUncertain.page.getByRole('button', { name: '执行本批', exact: true }).click();
  await applyUncertain.page.getByText('已禁止重复提交，请先点击“查询原批次进度”核对结果。', { exact: true }).waitFor();
  check('执行响应不确定禁止自动重试', await applyUncertain.page.getByRole('button', { name: '执行本批', exact: true }).isDisabled()
    && applyUncertain.calls.filter(call => call.pathname.endsWith('/apply')).length === 1);
  await applyUncertain.page.getByRole('button', { name: '查询原批次进度', exact: true }).click();
  await applyUncertain.page.getByRole('checkbox', { name: '我已核对变更，确认执行本批', exact: true }).check();
  check('查询原批次后才允许重新确认且不生成新预览', await applyUncertain.page.getByRole('button', { name: '执行本批', exact: true }).isEnabled()
    && applyUncertain.calls.every(call => !call.pathname.endsWith('/sync-preview')));
  const applyDenied = await createCase({ permissions: executionPermissions, history: [header] });
  applyDenied.applyStatus = 403;
  await applyDenied.page.getByRole('button', { name: '查看报告', exact: true }).filter({ visible: true }).first().click();
  await applyDenied.page.getByRole('checkbox', { name: '我已核对变更，确认执行本批', exact: true }).check();
  await applyDenied.page.getByRole('button', { name: '执行本批', exact: true }).click();
  await applyDenied.page.getByLabel('组织同步访问受限').waitFor();
  check('执行撤权清除报告并提示重新登录查原批次', await applyDenied.page.getByRole('dialog').count() === 0
    && (await applyDenied.page.getByRole('alert').innerText()).includes('重新登录查询原批次进度'));
  await applyDenied.page.getByRole('button', { name: '重新核验权限', exact: true }).click();
  await applyDenied.page.getByRole('heading', { name: '企业微信组织同步', exact: true }).waitFor();
  check('执行撤权后不残留忙碌锁阻止权限核验', applyDenied.calls.filter(call => call.pathname.endsWith('/sync/configurations')).length >= 2);
  const lateApply = await createCase({ permissions: executionPermissions, history: [header] });
  lateApply.holdPaths.add('/apply');
  await lateApply.page.getByRole('button', { name: '查看报告', exact: true }).filter({ visible: true }).first().click();
  await lateApply.page.getByRole('checkbox', { name: '我已核对变更，确认执行本批', exact: true }).check();
  await lateApply.page.getByRole('button', { name: '执行本批', exact: true }).click(); await waitUntil(() => lateApply.held.length === 1);
  lateApply.tenantId = 100001; lateApply.configs = [{ ...configuration, configId: 102, corpId: 'second_company' }]; lateApply.history = [];
  await lateApply.page.evaluate(() => window.imUiIdentity()); lateApply.holdPaths.clear(); lateApply.releasePath('/apply');
  await lateApply.page.getByLabel('同步应用配置', { exact: true }).getByText('second_company · 应用 1000001', { exact: true }).waitFor();
  check('执行晚到响应不能在切换公司后恢复报告', await lateApply.page.getByRole('dialog').count() === 0
    && !(await lateApply.page.locator('body').innerText()).includes('批次 201 已确认'));
  const failed = await createCase({ history: [{ ...header, status: 'FAILED', fullSnapshot: false }] });
  failed.report = { ...report, header: { ...header, status: 'FAILED', fullSnapshot: false }, failureCode: 'IM_ORG_SCOPE_UNVERIFIED', summary: null, entries: { rows: [], total: 0, pageNum: 1, pageSize: 50 } };
  await failed.page.getByRole('button', { name: '查看报告', exact: true }).filter({ visible: true }).first().click();
  await failed.page.getByRole('dialog').getByRole('alert').waitFor();
  check('失败报告无伪造成功数量', await failed.page.getByLabel('成员预期变更').count() === 0 && (await failed.page.getByRole('dialog').innerText()).includes('未能确认完整部门授权'));
  const uncertain = await createCase(); uncertain.previewStatus = 503;
  await uncertain.page.getByRole('button', { name: '生成预览', exact: true }).click();
  await uncertain.page.getByText('结果未确认，已禁止重复生成；请刷新并核对历史记录。再次生成会创建新的预览。', { exact: true }).waitFor();
  check('不确定结果禁止重试且必须先刷新记录', await uncertain.page.getByRole('button', { name: '生成预览', exact: true }).isDisabled() && await uncertain.page.getByRole('button', { name: '已核对记录，允许重新预览', exact: true }).isDisabled());
  await uncertain.page.getByRole('button', { name: '刷新', exact: true }).click();
  await uncertain.page.getByRole('button', { name: '已核对记录，允许重新预览', exact: true }).click();
  check('人工核对后允许新预览但不自动提交', await uncertain.page.getByRole('button', { name: '生成预览', exact: true }).isEnabled() && uncertain.calls.filter(call => call.pathname.endsWith('/sync-preview')).length === 1);
  const staleHistory = await createCase({ holdHistory: true }); staleHistory.previewStatus = 503;
  await waitUntil(() => staleHistory.held.length === 1);
  await staleHistory.page.getByRole('button', { name: '生成预览', exact: true }).click();
  await staleHistory.page.getByText('结果未确认，已禁止重复生成；请刷新并核对历史记录。再次生成会创建新的预览。', { exact: true }).waitFor();
  staleHistory.holdPaths.clear(); staleHistory.releasePath('/sync/list');
  await staleHistory.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '刷新' && !button.disabled));
  check('预览之前发出的历史请求不能充当失败后的核对', await staleHistory.page.getByRole('button', { name: '已核对记录，允许重新预览', exact: true }).isDisabled());
  const revoked = await createCase({ history: [header] }); revoked.reportStatus = 403;
  await revoked.page.getByRole('button', { name: '查看报告', exact: true }).filter({ visible: true }).first().click();
  await revoked.page.getByLabel('组织同步访问受限').waitFor();
  check('服务端撤权清除报告和配置摘要', await revoked.page.getByRole('dialog').count() === 0 && !(await revoked.page.locator('body').innerText()).includes('ui_corp'));
  const stale = await createCase(); stale.hold = true;
  await stale.page.getByRole('button', { name: '生成预览', exact: true }).click(); await waitUntil(() => stale.pending.length === 1);
  stale.tenantId = 100001; stale.configs = [{ ...configuration, configId: 102, corpId: 'second_company' }]; stale.history = [];
  await stale.page.evaluate(() => window.imUiIdentity()); stale.release();
  await stale.page.getByLabel('同步应用配置', { exact: true }).getByText('second_company · 应用 1000001', { exact: true }).waitFor();
  check('切换公司丢弃旧预览响应', await stale.page.getByRole('dialog').count() === 0 && !(await stale.page.locator('body').innerText()).includes('ui_corp'));
  for (const width of [1440, 320]) {
    const test = await createCase({ width, mode: 'config', permissions: ['system:im:config:list', 'system:im:config:manage'] }); const page = test.page;
    await page.getByRole('button', { name: '编辑', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '编辑企业微信配置', exact: true });
    await dialog.getByRole('checkbox', { name: '设置组织同步范围', exact: true }).check();
    await dialog.getByLabel('本地接入部门', { exact: true }).click(); await page.getByRole('option', { name: '本地接入根 · #1000', exact: true }).click();
    check(`${width}px部门候选不自动连接厂商`, test.calls.every(call => !call.pathname.endsWith('/remote-departments')));
    await dialog.getByRole('button', { name: '读取已保存配置的授权部门', exact: true }).click();
    await dialog.getByRole('checkbox', { name: '外部销售 · #2', exact: true }).check();
    await dialog.getByLabel('企业微信成员账号', { exact: true }).fill('alpha');
    await dialog.getByLabel('成员主部门', { exact: true }).click(); await page.getByRole('option', { name: '销售二组 · #3', exact: true }).click();
    await dialog.getByRole('button', { name: '添加主部门选择', exact: true }).click();
    await page.screenshot({ path: path.join(output, `scope-${width}.png`), fullPage: true });
    await dialog.getByRole('button', { name: '保存配置', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    const saved = test.calls.find(call => call.method === 'PUT').body;
    check(`${width}px保存明确范围与成员主部门且保持业务开关`, saved.syncScope.localRootDeptId === 1000 && saved.syncScope.remoteDepartmentIds.join() === '2' && saved.syncScope.primaryDepartments.alpha === 3 && !saved.syncEnabled && !saved.loginEnabled && !saved.messageEnabled);
    check(`${width}px范围编辑不回传密钥`, ['appKey', 'appSecret', 'token', 'aesKey'].every(field => saved[field].action === 'KEEP' && !('value' in saved[field])));
  }
  const configRace = await createCase({ mode: 'config', permissions: ['system:im:config:list', 'system:im:config:manage'] });
  await configRace.page.getByRole('button', { name: '编辑', exact: true }).filter({ visible: true }).first().click();
  const raceDialog = configRace.page.getByRole('dialog');
  await raceDialog.getByRole('checkbox', { name: '设置组织同步范围', exact: true }).check();
  configRace.remoteStatus = 403; configRace.holdPaths.add('/remote-departments');
  await raceDialog.getByRole('button', { name: '读取已保存配置的授权部门', exact: true }).click();
  await waitUntil(() => configRace.held.length === 1);
  await raceDialog.getByRole('checkbox', { name: '设置组织同步范围', exact: true }).uncheck();
  configRace.holdPaths.add('/im/config');
  await raceDialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await waitUntil(() => configRace.held.length === 2);
  const listsBeforeRevocation = configRace.calls.filter(call => call.pathname.endsWith('/config/list')).length;
  configRace.releasePath('/remote-departments');
  await configRace.page.getByLabel('企业微信配置访问受限').waitFor();
  const saveResponse = configRace.page.waitForResponse(response => response.url().endsWith('/im/config') && response.request().method() === 'PUT');
  configRace.releasePath('/im/config'); await saveResponse;
  await configRace.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check('候选撤权后晚到的保存响应不能恢复配置或触发刷新', await configRace.page.getByLabel('企业微信配置访问受限').isVisible()
    && configRace.calls.filter(call => call.pathname.endsWith('/config/list')).length === listsBeforeRevocation && await configRace.page.getByRole('dialog').count() === 0);
  check('受控同步页面无未捕获异常', errors.length === 0);
} catch (error) { failure = error; process.exitCode = 1; console.error(error.stack); }
finally {
  cases.forEach(test => { test.release(); test.releasePath(''); });
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors, passed: !failure, failure: failure?.message, real_backend: false, interface_doubles: true }, null, 2));
  console.log(`G4_IM_SYNC_UI_CHECKS: assertions=${checks.length}; failed=${failure ? 1 : 0}; controlled_api=true; real_backend=false; vendor_service=false; output=${output}`);
  await browser?.close(); await server.close();
}
