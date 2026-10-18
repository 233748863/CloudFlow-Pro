import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/im-config-ui', randomUUID().replaceAll('-', ''));
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
  callbackUrl: null, expectedCallbackUrl: 'https://im-ui.example.invalid/api/auth/im/callback/101', syncEnabled: false, syncCron: null, loginEnabled: false, messageEnabled: false, todoEnabled: false, syncScope: null, status: 'DISABLED', version: 0, lastSyncTime: null, updateTime: '2026-09-29 02:00:00' };
let browser;
let origin;
let failure;
const waitUntil = async condition => {
  const deadline = Date.now() + 15000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(condition(), '受控请求未到达');
};
async function createCase({ width = 1440, rows = [config], permissions = ['system:im:config:list', 'system:im:config:manage', 'system:im:config:test'] } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const test = { context, page: await context.newPage(), rows: structuredClone(rows), permissions, tenantId: 100000, calls: [], pending: [], writeStatus: 200, writeHeld: false, successful: true };
  cases.push(test);
  test.page.on('pageerror', error => errors.push(error.message));
  test.release = () => test.pending.splice(0).forEach(release => release());
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/im-config-check') {
      const entry = `/@fs/${path.join(root, 'scripts/im-checks/ImConfigUiCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const pathname = url.pathname;
    const body = route.request().postDataJSON();
    test.calls.push({ pathname, body, method: route.request().method() });
    let data;
    let status = 200;
    if (pathname === '/api/auth/info') data = { user: { userId: 1, userName: 'im-ui', nickName: '通信配置检查', tenantId: test.tenantId, forcePasswordChange: false }, roles: ['admin'], permissions: test.permissions };
    else if (pathname === '/api/auth/system/im/config/list') data = { deploymentEnabled: true, canConfigure: true, reason: '受控页面：允许保存与测试，不代表厂商联调', providers: [{ type: 'WECOM', name: '企业微信', implemented: true }], page: { rows: test.rows, total: test.rows.length, pageNum: 1, pageSize: 10 } };
    else if (/\/config\/\d+\/test$/.test(pathname)) data = { successful: test.successful, reasonCode: test.successful ? 'IM_CONNECTION_VERIFIED' : 'IM_PROVIDER_REJECTED', message: test.successful ? '企业微信凭据验证通过' : '企业通信提供商未接受请求', elapsedMillis: 15, version: 0 };
    else if (pathname === '/api/auth/system/im/config' && ['POST', 'PUT'].includes(route.request().method())) {
      status = test.writeStatus;
      data = { ...config, corpId: body.corpId, version: body.version == null ? 0 : body.version + 1 };
      if (status === 200) test.rows = [data];
      if (test.writeHeld) await new Promise(resolve => test.pending.push(resolve));
    } else return route.abort();
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, msg: status === 200 ? 'success' : `受控保存故障${status}`, data }) });
  });
  await test.page.goto(`${origin}/im-config-check`);
  if (permissions.includes('system:im:config:list')) {
    await test.page.getByRole('heading', { name: '企业微信配置', exact: true }).waitFor();
    await test.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '刷新' && !button.disabled));
  } else await test.page.getByText('您没有权限访问企业微信配置', { exact: true }).waitFor();
  return test;
}

try {
  await fs.mkdir(output, { recursive: true }); await server.listen(); origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const denied = await createCase({ permissions: [] });
  check('无读取权限不发配置请求', denied.calls.every(call => !call.pathname.includes('/system/im/')));
  const readonly = await createCase({ permissions: ['system:im:config:list'] });
  check('只读身份隐藏新增编辑与测试', await readonly.page.getByRole('button', { name: /新增配置|编辑|测试连接/ }).count() === 0);
  const noSchedule = await createCase();
  await noSchedule.page.getByRole('button', { name: '编辑', exact: true }).click();
  check('配置维护权限不能单独开启自动写入', await noSchedule.page.getByRole('checkbox', { name: '按已选范围自动同步', exact: true }).isDisabled());
  const schedulePermissions = ['system:im:config:list', 'system:im:config:manage', 'system:im:sync:preview', 'system:im:sync:run'];
  for (const width of [1440, 320]) {
    const scheduled = await createCase({ width, permissions: schedulePermissions, rows: [{ ...config,
      syncScope: { localRootDeptId: 100, remoteDepartmentIds: [2], primaryDepartments: {} } }] });
    await scheduled.page.getByRole('button', { name: '编辑', exact: true }).click();
    const dialog = scheduled.page.getByRole('dialog', { name: '编辑企业微信配置', exact: true });
    await dialog.getByRole('checkbox', { name: '按已选范围自动同步', exact: true }).check();
    await dialog.getByLabel('执行时间表达式', { exact: true }).fill('0 0 2 * * *');
    check(`${width}px开启前明确自动应用及新账号零角色`, (await dialog.innerText()).includes('无需逐轮确认') && (await dialog.innerText()).includes('新增账号不授予角色'));
    check(`${width}px停用配置准确提示任务仍暂停`, await dialog.getByText('配置处于停用状态，保存后定时任务仍暂停。', { exact: true }).isVisible());
    await scheduled.page.screenshot({ path: path.join(output, `schedule-${width}.png`), fullPage: true });
    await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
    await waitUntil(() => scheduled.calls.some(call => call.method === 'PUT'));
    const payload = scheduled.calls.find(call => call.method === 'PUT').body;
    check(`${width}px保存所选时间与范围`, payload.syncEnabled && payload.syncCron === '0 0 2 * * *' && payload.syncScope.localRootDeptId === 100 && payload.syncScope.remoteDepartmentIds[0] === 2);
  }
  const stopSchedule = await createCase({ rows: [{ ...config, syncEnabled: true, syncCron: '0 0 2 * * *' }] });
  await stopSchedule.page.getByRole('button', { name: '编辑', exact: true }).click();
  await stopSchedule.page.getByRole('checkbox', { name: '按已选范围自动同步', exact: true }).uncheck();
  await stopSchedule.page.getByRole('dialog').getByRole('button', { name: '保存配置', exact: true }).click();
  await waitUntil(() => stopSchedule.calls.some(call => call.method === 'PUT'));
  check('失去执行权限后仍能关闭定时同步', stopSchedule.calls.find(call => call.method === 'PUT').body.syncEnabled === false);
  for (const width of [1440, 320]) {
    const test = await createCase({ width, rows: [] });
    const page = test.page;
    await page.getByRole('button', { name: '新增配置', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: '新增企业微信配置', exact: true });
    await dialog.getByLabel('企业ID', { exact: true }).fill('draft_corp');
    await dialog.getByLabel('应用ID', { exact: true }).fill('1000002');
    await dialog.getByLabel('新应用Secret', { exact: true }).fill('ui_secret_only');
    await dialog.getByLabel('回调Token操作', { exact: true }).click(); await page.getByRole('option', { name: '替换为新值', exact: true }).click();
    await dialog.getByLabel('新回调Token', { exact: true }).fill('UIToken');
    await dialog.getByLabel('回调Token操作', { exact: true }).click(); await page.getByRole('option', { name: '清除已有值', exact: true }).click();
    check(`${width}px切换密钥动作立即清空输入`, await dialog.getByLabel('新回调Token', { exact: true }).count() === 0);
    test.writeStatus = 400;
    await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    check(`${width}px明确失败保留企业草稿且清除密钥`, await dialog.getByLabel('企业ID', { exact: true }).inputValue() === 'draft_corp' && await dialog.getByLabel('新应用Secret', { exact: true }).inputValue() === '' && await dialog.getByRole('button', { name: '保存配置', exact: true }).isEnabled());
    const submitted = test.calls.find(call => call.pathname.endsWith('/config') && call.method === 'POST').body;
    check(`${width}px只替换Secret不为CLEAR发送旧值且新建不带编号回调`, submitted.appSecret.value === 'ui_secret_only' && !('value' in submitted.token) && !('configId' in submitted) && !('callbackUrl' in submitted) && !submitted.loginEnabled && !submitted.todoEnabled);
    await dialog.getByLabel('新应用Secret', { exact: true }).fill('ui_secret_second');
    test.writeStatus = 503;
    await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
    await dialog.getByText('结果或版本未确认，已禁止重复提交；请关闭表单、刷新列表并核对当前记录后再操作。', { exact: true }).waitFor();
    check(`${width}px不确定失败禁止提交且密钥清空`, await dialog.getByRole('button', { name: '保存配置', exact: true }).isDisabled() && await dialog.getByLabel('新应用Secret', { exact: true }).inputValue() === '');
    await page.screenshot({ path: path.join(output, `uncertain-${width}.png`), fullPage: true });
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    test.rows = [structuredClone(config)]; await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.getByRole('button', { name: '测试连接', exact: true }).waitFor();
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '企业微信连接测试结果', exact: true });
    await dialog.waitFor();
    check(`${width}px成功结果显示核验版本并明确未启用业务`, (await dialog.innerText()).includes('版本 0') && (await dialog.innerText()).includes('凭据验证通过') && (await dialog.innerText()).includes('不自动启用组织'));
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click(); test.successful = false;
    await page.getByRole('button', { name: '测试连接', exact: true }).click(); await dialog.waitFor();
    check(`${width}px厂商拒绝显示失败且不标成功`, (await dialog.innerText()).includes('连接测试失败') && !(await dialog.innerText()).includes('凭据验证通过'));
  }
  const revoked = await createCase();
  await revoked.page.getByRole('button', { name: '编辑', exact: true }).click();
  const revokedDialog = revoked.page.getByRole('dialog', { name: '编辑企业微信配置', exact: true });
  await revokedDialog.getByLabel('应用Secret操作').click(); await revoked.page.getByRole('option', { name: '替换为新值', exact: true }).click();
  await revokedDialog.getByLabel('新应用Secret', { exact: true }).fill('revoked_secret'); revoked.writeStatus = 403;
  await revokedDialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await revoked.page.getByLabel('企业微信配置访问受限').waitFor();
  check('服务端撤权关闭表单并清除所有密钥控件', await revoked.page.getByRole('dialog').count() === 0 && await revoked.page.locator('input[type=password]').count() === 0);
  const callsAfterDenial = revoked.calls.length;
  await new Promise(resolve => setTimeout(resolve, 200));
  check('拒绝后不自动重查或解除访问限制', revoked.calls.length === callsAfterDenial && await revoked.page.getByLabel('企业微信配置访问受限').isVisible());
  const staleCallback = await createCase({ rows: [{ ...config, callbackUrl: config.expectedCallbackUrl, expectedCallbackUrl: null }] });
  await staleCallback.page.getByRole('button', { name: '编辑', exact: true }).click();
  const oldAddress = staleCallback.page.getByRole('checkbox', { name: '保存系统生成的回调地址', exact: true });
  await oldAddress.uncheck();
  check('部署地址取消后仍能清除旧回调且不能重新勾选无效地址', await oldAddress.isDisabled() && !(await oldAddress.isChecked()));
  const stale = await createCase();
  await stale.page.getByRole('button', { name: '编辑', exact: true }).click(); stale.writeHeld = true;
  await stale.page.getByRole('dialog').getByRole('button', { name: '保存配置', exact: true }).click(); await waitUntil(() => stale.pending.length === 1);
  stale.tenantId = 100001; stale.rows = [{ ...config, configId: 102, corpId: 'second_tenant', version: 7 }];
  await stale.page.evaluate(() => window.imUiIdentity());
  stale.release();
  await stale.page.getByText('企业微信 · second_tenant', { exact: true }).first().waitFor();
  check('切换公司后丢弃旧保存响应且新身份不继承表单', await stale.page.getByRole('dialog').count() === 0 && !(await stale.page.locator('body').innerText()).includes('ui_corp'));
  check('受控页面无未捕获异常', errors.length === 0);
} catch (error) { failure = error; process.exitCode = 1; console.error(error.stack); }
finally {
  cases.forEach(test => test.release());
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, passed: !failure, failure: failure?.message, real_backend: false, interface_doubles: true }, null, 2));
  console.log(`G4_IM_CONFIG_UI_CHECKS: assertions=${checks.length}; failed=${failure ? 1 : 0}; controlled_api=true; real_backend=false; vendor_service=false; output=${output}`);
  await browser?.close(); await server.close();
}
