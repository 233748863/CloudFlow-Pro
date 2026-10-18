import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRepository, replayFormal } from './check-batch-h-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/tenant-package-ui', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, fs: { allow: [root] } } });
const optional = [876, 877, 878, 879, 880, 881, 882, 883, 884, 902, 903, 904, 905, 1206, 1207, 1208, 1762, 1985, 1986];
const fixed = [900, 901, 906];
const formal = replayFormal(loadRepository()).memory;
const catalog = { modules: ['WORKFLOW', 'OA', 'CRM', 'HR'], features: formal.rows('sys_menu').map(row => ({ menuId: Number(String(row.menu_id)), parentId: Number(String(row.parent_id)), menuName: row.menu_name, menuType: row.menu_type,
  permissions: row.perms, enabled: String(row.status) === '0', fixedAccountOperation: fixed.includes(Number(String(row.menu_id))), independentOperation: optional.includes(Number(String(row.menu_id))) })) };
const template = { packageId: 10, version: 3, packageCode: 'BASE', packageName: '测试基础套餐', menuIds: [2, ...fixed, 1986], enabledModules: [], maxUsers: 10, maxStorageMb: 20, price: 0, billingCycle: 'NONE', sortNo: 0, status: 'ACTIVE', remark: '', createTime: '2026-09-28 01:00:00', updateTime: '2026-09-28 01:00:00' };
const adjustments = { addMenuIds: [], removeMenuIds: [], maxUsers: null, maxStorageMb: null };
const tenant = { tenantId: 100001, tenantCode: 'legacy', tenantName: '旧授权租户', version: 7, status: '0', userLimit: 0, storageLimit: 0, packageId: null };
const allPermissions = ['system:tenant-package:list', 'system:tenant-package:manage', 'system:tenant-package:sync', ...['list', 'query', 'add', 'edit', 'remove'].map(action => `system:tenant:${action}`)];
const snapshot = { tenantId: 100001, packageId: 10, packageVersion: 2, tenantVersion: 7, adjustments, effective: { menuIds: [...fixed], permissions: ['system:auth:info'], quotas: { maxUsers: 8, maxStorageMb: 15 } } };
const makeView = () => ({ syncId: 88, status: 'PREVIEWED', preview: { platformTenantId: 100000, operatorId: 101, packageId: 10, packageVersion: 3,
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), hash: 'a'.repeat(64), items: [{ targetTenantId: 100001, before: snapshot,
    proposed: { ...snapshot, packageVersion: 3, tenantVersion: 8, effective: { menuIds: template.menuIds, permissions: ['system:auth:info', 'system:search:business'], quotas: { maxUsers: 10, maxStorageMb: 20 } } }, errorCode: null }] }, items: [{ tenantId: 100001, status: 'PREVIEWED', errorCode: null, appliedTime: null }] });
const checks = [];
const errors = [];
const unexpected = [];
const cases = [];
let origin;
let browser;
let failure;
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
async function waitFor(condition, label) {
  const deadline = Date.now() + 15000;
  while (!condition() && Date.now() < deadline) await pause(20);
  assert.ok(condition(), label);
}

async function createCase({ width = 1440, mode = 'package', permissions = allPermissions, verified = true, assigned = false, tenantCount = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const test = { context, page: await context.newPage(), requests: [], saves: [], assignments: [], confirmations: [], cancellations: [], verified, failure: false, tenants: [{ ...tenant, ...(assigned ? { packageId: 10, packageVersion: 2, packageOverride: JSON.stringify({ ...adjustments, addMenuIds: [1762], maxUsers: 5 }), userLimit: 5, storageLimit: 20 } : {}) }], view: makeView(), infoPermissions: permissions };
  cases.push(test);
  for (let index = 1; index < tenantCount; index++) test.tenants.push({ ...tenant, tenantId: 100001 + index, tenantCode: `tenant-${index}`, tenantName: `第${index + 1}户` });
  test.page.on('pageerror', error => errors.push(error.message));
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
    if (['/package-ui-check', '/tenant-ui-check'].includes(url.pathname)) {
      const entry = `/@fs/${path.join(root, 'scripts/tenant-package-checks/TenantPackageUiCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const method = route.request().method();
    const body = route.request().postDataJSON();
    test.requests.push(`${method} ${url.pathname}`);
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, msg: status === 200 ? 'success' : '受控拒绝', data }) });
    if (url.pathname === '/api/auth/info') return respond({ user: { userId: 101, userName: 'platform-check', nickName: '平台测试账号', tenantId: 100000, forcePasswordChange: false }, roles: ['ADMIN'], permissions: test.infoPermissions });
    if (url.pathname === '/api/auth/system/platform/access/reauthenticate') { test.verified = true; return respond({ configured: true, verified: true, totpRequired: false, verifiedUntil: Date.now() + 300000 }); }
    if (url.pathname === '/api/auth/system/platform/access') return respond({ configured: true, verified: test.verified, totpRequired: false, verifiedUntil: test.verified ? Date.now() + 300000 : null });
    if (url.pathname === '/api/auth/system/tenant-package/catalog') return respond(catalog);
    if (url.pathname === '/api/auth/system/tenant-package/list') return respond({ rows: [template], total: 1, pageNum: 1, pageSize: 10 });
    if (url.pathname === '/api/auth/system/tenant-package/10') return respond(template);
    if (url.pathname === '/api/auth/system/tenant-package') { test.saves.push(body); if (test.failure) return route.abort('connectionfailed'); return respond({ ...template, ...body, packageId: body.packageId ?? 11 }); }
    if (url.pathname === '/api/auth/system/tenant/list') {
      const current = Number(url.searchParams.get('current') ?? 1);
      const size = Number(url.searchParams.get('size') ?? 10);
      return respond({ records: test.tenants.slice((current - 1) * size, current * size), total: test.tenants.length, current, size });
    }
    if (url.pathname === '/api/auth/system/tenant/statistics') return respond(test.tenants.map(item => ({ tenantId: item.tenantId, expired: false, disabled: false, userLimitReached: false, userCount: 1 })));
    if (url.pathname === '/api/auth/system/tenant') { test.assignments.push(body); return respond(null); }
    if (url.pathname === '/api/auth/system/tenant-package/10/sync-preview') { check('预览请求仅包含明确勾选租户', JSON.stringify(body) === JSON.stringify({ tenantIds: [100001] })); return respond(test.view); }
    if (url.pathname === '/api/auth/system/tenant-package/sync/88') return respond(test.view);
    if (url.pathname === '/api/auth/system/tenant-package/sync/88/confirm') { test.confirmations.push(body); if (test.failure) return route.abort('connectionfailed'); test.view = { ...test.view, status: 'PARTIAL', items: [{ tenantId: 100001, status: 'CONFLICT', errorCode: 'TENANT_VERSION_CONFLICT', appliedTime: null }] }; return respond(test.view); }
    if (url.pathname === '/api/auth/system/tenant-package/sync/88/cancel') { test.cancellations.push(body); test.view = { ...test.view, status: 'CANCELLED' }; return respond(test.view); }
    unexpected.push(`${method} ${url.pathname}`); return route.abort();
  });
  await test.page.goto(`${origin}/${mode === 'tenant' ? 'tenant' : 'package'}-ui-check`);
  return test;
}

try {
  await fs.mkdir(output, { recursive: true });
  await server.listen(); origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const secured = await createCase({ verified: false });
  await secured.page.getByRole('button', { name: '验证身份', exact: true }).waitFor();
  check('再次验证前不读取套餐列表或目录', !secured.requests.some(item => item.includes('/tenant-package/')));
  await secured.page.getByLabel('当前账号密码').fill('controlled-password');
  await secured.page.getByRole('button', { name: '验证身份', exact: true }).click();
  await secured.page.getByRole('button', { name: '新增套餐', exact: true }).waitFor();
  await secured.page.getByRole('button', { name: '新增套餐', exact: true }).click();
  for (const menuId of fixed) {
    const checkbox = secured.page.locator(`[data-menu-id="${menuId}"] input`);
    check(`固定操作${menuId}已选且不可取消`, await checkbox.isChecked() && await checkbox.isDisabled());
  }
  check('独立功能目录精确19项', await secured.page.locator('details').filter({ has: secured.page.locator('summary', { hasText: '独立可选功能' }) }).locator('[data-menu-id]').count() === 19);
  for (const menuId of optional) check(`独立功能${menuId}默认不选`, !await secured.page.locator(`[data-menu-id="${menuId}"] input`).isChecked());
  await secured.page.getByLabel('套餐编码', { exact: true }).fill('OPTIONAL');
  await secured.page.getByLabel('套餐名称', { exact: true }).fill('明确独立功能');
  await secured.page.getByLabel('查找功能').fill('1986');
  await secured.page.locator('[data-menu-id="1986"] input').check();
  await secured.page.getByRole('button', { name: '保存套餐', exact: true }).click();
  await waitFor(() => secured.saves.length === 1, 'create received');
  check('新增仅提交勾选业务功能，不隐含租户切换', JSON.stringify(secured.saves[0].menuIds) === '[1986]' && !secured.saves[0].menuIds.includes(903));
  check('新增未携带后台只读字段', !('createTime' in secured.saves[0]) && !('packageId' in secured.saves[0]) && !('version' in secured.saves[0]));
  await secured.page.getByRole('button', { name: '编辑套餐', exact: true }).filter({ visible: true }).click();
  secured.failure = true;
  await secured.page.getByRole('button', { name: '保存套餐', exact: true }).click();
  await secured.page.getByText('保存结果或版本未确认；请关闭后刷新列表，核对实际内容再编辑，勿重复提交。').waitFor();
  check('写入结果不明时禁止盲重试', await secured.page.getByRole('button', { name: '保存套餐', exact: true }).isDisabled());
  check('编辑提交精确版本并排除详情字段', secured.saves[1].version === 3 && !('updateTime' in secured.saves[1]));

  const readonly = await createCase({ permissions: ['system:tenant-package:list'] });
  await readonly.page.getByText('测试基础套餐', { exact: true }).filter({ visible: true }).waitFor();
  check('仅有ADMIN名称无写权限不显示编辑新增同步', await readonly.page.getByRole('button', { name: '新增套餐' }).count() === 0 && await readonly.page.getByRole('button', { name: '编辑套餐' }).count() === 0 && await readonly.page.getByRole('button', { name: '同步租户' }).count() === 0);
  const denied = await createCase({ permissions: [] });
  await denied.page.getByText('您没有权限访问此内容').waitFor();
  check('没有套餐入口权限不调用平台接口', !denied.requests.some(item => item.includes('/system/platform/') || item.includes('/tenant-package/')));

  const sync = await createCase({ assigned: true });
  await sync.page.getByRole('button', { name: '同步租户', exact: true }).filter({ visible: true }).click();
  await sync.page.getByLabel(/旧授权租户/).check();
  await sync.page.getByRole('button', { name: '生成逐户预览' }).click();
  await sync.page.getByText('批次88 · 待确认 · 共1户 · 已应用0户').waitFor();
  check('生成预览不调用确认', sync.confirmations.length === 0);
  check('未核对前禁止提交', await sync.page.getByRole('button', { name: '确认应用本批变更' }).isDisabled());
  check('逐户展示额度差异', await sync.page.getByText('用户上限：8 → 10；存储上限：15 → 20 MB', { exact: true }).count() === 1);
  await sync.page.getByLabel(/已逐户核对功能增减/).check();
  await sync.page.getByRole('button', { name: '确认应用本批变更' }).click();
  await sync.page.getByText('批次88 · 未全部成功 · 共1户 · 已应用0户').waitFor();
  check('确认携带服务器原摘要', JSON.stringify(sync.confirmations[0]) === JSON.stringify({ previewHash: 'a'.repeat(64) }));
  check('冲突结果展示准确原因', await sync.page.getByText(/冲突或失败代码：TENANT_VERSION_CONFLICT/).count() === 1);
  await sync.page.getByLabel(/已逐户核对功能增减/).check();
  await sync.page.getByRole('button', { name: '取消未应用项' }).click();
  await sync.page.getByText('批次88 · 已取消 · 共1户 · 已应用0户').waitFor();
  check('取消原摘要且终态不再允许提交', sync.cancellations[0].previewHash === 'a'.repeat(64) && await sync.page.getByRole('button', { name: '继续未完成项' }).isDisabled());
  const expired = await createCase();
  expired.view.preview.expiresAt = new Date(Date.now() - 1000).toISOString();
  await expired.page.getByLabel('同步批次编号').fill('88');
  await expired.page.getByRole('button', { name: '读取同步结果' }).click();
  await expired.page.getByText('预览已过期，禁止确认；请重新生成预览。').waitFor();
  await expired.page.getByLabel(/已逐户核对功能增减/).check();
  check('过期预览禁止首次确认', await expired.page.getByRole('button', { name: '确认应用本批变更' }).isDisabled());

  for (const assigned of [false, true]) {
    const edit = await createCase({ mode: 'tenant', assigned });
    await edit.page.getByRole('button', { name: '编辑租户', exact: true }).click();
    if (!assigned) check('旧无限额度保留0', await edit.page.getByLabel('用户数量限制', { exact: true }).inputValue() === '0' && await edit.page.getByLabel('存储空间限制 (MB)', { exact: true }).inputValue() === '0');
    await edit.page.getByRole('button', { name: '保存修改' }).click();
    await waitFor(() => edit.assignments.length === 1, 'assignment received');
    const payload = edit.assignments[0];
    check(`${assigned ? '已分配' : '旧未分配'}租户资料编辑不携带套餐选择`, !('packageSelection' in payload) && payload.version === 7);
    check('租户保存不提交后台计算字段', !['effectiveMenuIds', 'packageId', 'packageVersion', 'packageOverride', 'storageUsed', 'deleted'].some(key => key in payload));
    if (assigned) check('已分配租户不直接写入配额', !('userLimit' in payload) && !('storageLimit' in payload));
  }
  const create = await createCase({ mode: 'tenant' });
  await create.page.getByRole('button', { name: '新增租户', exact: true }).click();
  check('新租户未选套餐禁止保存', await create.page.getByRole('button', { name: '创建租户' }).isDisabled());
  await create.page.getByLabel(/租户编码/).fill('new-tenant');
  await create.page.getByLabel(/租户名称/).fill('新租户');
  await create.page.getByRole('radio', { name: /测试基础套餐/ }).check();
  await create.page.getByRole('button', { name: '创建租户' }).click();
  await waitFor(() => create.assignments.length === 1, 'new assignment received');
  check('新租户提交明确套餐版本及覆盖', create.assignments[0].packageSelection.packageId === 10 && create.assignments[0].packageSelection.packageVersion === 3 && JSON.stringify(create.assignments[0].packageSelection.adjustments) === JSON.stringify(adjustments));
  check('新租户不提交旧配额或空日期', !('userLimit' in create.assignments[0]) && !('storageLimit' in create.assignments[0]) && !('expireTime' in create.assignments[0]));
  const reassigned = await createCase({ mode: 'tenant', assigned: true });
  await reassigned.page.getByRole('button', { name: '编辑租户', exact: true }).click();
  await reassigned.page.getByLabel('明确改选套餐或调整个别覆盖').check();
  check('改选后未明确选择版本前禁止保存', await reassigned.page.getByRole('button', { name: '保存修改' }).isDisabled());
  await reassigned.page.getByRole('radio', { name: /测试基础套餐/ }).check();
  await reassigned.page.getByRole('button', { name: '保存修改' }).click();
  await waitFor(() => reassigned.assignments.length === 1, 'explicit reassignment received');
  check('明确改选保留原功能与配额覆盖', JSON.stringify(reassigned.assignments[0].packageSelection.adjustments) === JSON.stringify({ ...adjustments, addMenuIds: [1762], maxUsers: 5 }));
  const buttonPage = await createCase();
  await buttonPage.page.getByRole('button', { name: '新增套餐', exact: true }).click();
  await buttonPage.page.getByLabel('查找功能').fill('1801');
  await buttonPage.page.locator('[data-menu-id="1801"] input').check();
  check('普通按钮未选页面时禁止保存', await buttonPage.page.getByRole('button', { name: '保存套餐', exact: true }).isDisabled());
  await buttonPage.page.getByLabel('查找功能').fill('1800');
  await buttonPage.page.locator('[data-menu-id="1800"] input').check();
  check('所属模块未启用时禁止保存', await buttonPage.page.getByRole('button', { name: '保存套餐', exact: true }).isDisabled());
  await buttonPage.page.getByLabel('审批流程', { exact: true }).check();
  check('明确选齐页面和模块后可保存', await buttonPage.page.getByRole('button', { name: '保存套餐', exact: true }).isEnabled());
  const lost = await createCase();
  await lost.page.getByLabel('同步批次编号').fill('88');
  await lost.page.getByRole('button', { name: '读取同步结果' }).click();
  await lost.page.getByLabel(/已逐户核对功能增减/).check();
  lost.failure = true;
  await lost.page.getByRole('button', { name: '确认应用本批变更' }).click();
  await lost.page.getByText('提交结果未确认，请先刷新实际结果；当前禁止重复提交。').waitFor();
  check('确认结果丢失时禁用确认与取消', await lost.page.getByRole('button', { name: '确认应用本批变更' }).isDisabled() && await lost.page.getByRole('button', { name: '取消未应用项' }).isDisabled());
  lost.failure = false; lost.view.status = 'COMPLETED'; lost.view.items[0].status = 'APPLIED';
  await lost.page.getByRole('button', { name: '刷新实际结果' }).click();
  await lost.page.getByText('批次88 · 全部完成 · 共1户 · 已应用1户').waitFor();
  check('按批次恢复实际结果不重发确认', lost.confirmations.length === 1);
  const mobile = await createCase({ width: 390 });
  await mobile.page.getByRole('button', { name: '新增套餐', exact: true }).click();
  await mobile.page.screenshot({ path: path.join(output, 'mobile-package.png'), fullPage: true });
  check('390像素手机页面没有横向溢出', await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('手机保存按钮触控高度至少44像素', (await mobile.page.getByRole('button', { name: '保存套餐', exact: true }).boundingBox()).height >= 44);
  const paged = await createCase({ mode: 'tenant', tenantCount: 11 });
  await paged.page.getByRole('button', { name: '下一页', exact: true }).filter({ visible: true }).click();
  await paged.page.getByText('第11户', { exact: true }).waitFor();
  check('租户第二页读取服务器分页且不再次裁剪', await paged.page.getByRole('button', { name: '编辑租户', exact: true }).count() === 1);
  await sync.page.screenshot({ path: path.join(output, 'desktop-sync-result.png'), fullPage: true });
  check('浏览器无未捕获异常', errors.length === 0);
  check('未访问外部地址或未登记接口', unexpected.length === 0);
} catch (error) { failure = error; console.error(error.stack); }
finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors, unexpected, failure: failure?.message, real_browser: true, real_components: true, api: 'controlled_double', real_backend: false }, null, 2));
  await Promise.all(cases.map(test => test.context.close()));
  await browser?.close(); await server.close();
}
console.log(`TENANT_PACKAGE_UI_CHECKS: assertions=${checks.length}; failed=${failure ? 1 : 0}; real_browser=true; real_components=true; formal_catalog=${catalog.features.length}; api=controlled_double; real_backend=false; output=${output}`);
if (failure) process.exitCode = 1;
