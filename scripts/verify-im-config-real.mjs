import assert from 'node:assert/strict';
import { createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { verifyImRecoveryJob } from './verify-im-recovery-real.mjs';
import { verifyImMessageDisabled } from './verify-im-message-real.mjs';

export async function verifyImConfig(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, state, accounts, evidence } = context;
  const disabledOnly = process.argv.includes('--im-config-disabled-only');
  const entry = '/auth/system/im/config';
  const list = `${entry}/list?pageNum=1&pageSize=10`;
  const origin = new URL(admin.url()).origin;
  const route = `${origin}/system/im/config`;
  const overview = () => api(admin, list).then(result => successful(result, '读取真实企业微信配置'));
  const prefix = `im_${caseTag.replaceAll('-', '_')}`;
  assert.match(prefix, /^[A-Za-z0-9_]{1,85}$/);
  const owner = JSON.parse(database("SELECT JSON_OBJECT('userId',user_id,'tenantId',tenant_id) FROM sys_user WHERE user_name='g_import_admin' AND deleted=0;"));
  assert.equal(owner.tenantId, 100000);
  const ids = new Set();
  const secret = randomBytes(24).toString('base64url');
  const callbackToken = randomBytes(12).toString('hex');
  const aesKey = randomBytes(32).toString('base64').replace(/=$/, '');
  const appKey = randomBytes(24).toString('hex');
  const sensitive = new Set([secret, callbackToken, aesKey, appKey, ...accounts.map(account => account.password).filter(Boolean)]);
  const boundaries = { log: database('SELECT COALESCE(MAX(log_id),0) FROM sys_log;'), error: database('SELECT COALESCE(MAX(error_id),0) FROM sys_api_error_log;'), audit: database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;') };
  const current = configId => JSON.parse(database(`SELECT JSON_OBJECT('id',config_id,'tenantId',tenant_id,'corpId',corp_id,'status',status,'version',version,'appKey',app_key_encrypted,'appSecret',app_secret_encrypted,'token',token_encrypted,'aesKey',aes_key_encrypted) FROM sys_im_config WHERE config_id=${configId} AND tenant_id=100000;`));
  const payload = overrides => ({ imType: 'WECOM', corpId: `${prefix}_base`, agentId: '1000001', appKey: { action: 'REPLACE', value: appKey },
    appSecret: { action: 'REPLACE', value: secret }, token: { action: 'REPLACE', value: callbackToken }, aesKey: { action: 'REPLACE', value: aesKey },
    syncEnabled: false, syncCron: null, loginEnabled: false, messageEnabled: false, todoEnabled: false, syncScope: null, status: 'DISABLED', ...overrides });
  const edit = (saved, overrides) => payload({ configId: saved.configId, version: saved.version, corpId: saved.corpId, callbackUrl: saved.callbackUrl,
    appKey: { action: 'KEEP' }, appSecret: { action: 'KEEP' }, token: { action: 'KEEP' }, aesKey: { action: 'KEEP' }, ...overrides });
  const safe = result => [...sensitive].every(value => !JSON.stringify(result).includes(value));
  const waitUntil = async (label, condition) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error(label);
  };
  const assertLayout = async label => {
    const measures = await admin.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
      controls: [...document.querySelectorAll('.im-config-workspace .btn, .im-config-workspace .pagination-btn, .im-config-dialog .btn, .im-config-dialog .select-trigger, .im-config-dialog .modal-close')]
        .filter(element => element.getClientRects().length).map(element => ({ height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width })) }));
    check(`${label}无横向溢出且主要操作至少44像素`, measures.overflow <= 1 && measures.controls.length > 0 && measures.controls.every(control => control.height >= 43.5 && control.width >= 43.5));
  };
  const arrive = async () => { await admin.goto(route, { waitUntil: 'domcontentloaded' }); await admin.getByRole('heading', { name: '企业微信配置', exact: true, level: 2 }).waitFor({ timeout: 30000 }); await waitUntil('配置列表未就绪', () => admin.getByRole('button', { name: '刷新', exact: true }).isEnabled()); };
  let revoked = false;
  let packageFixture = null;
  const restorePackage = () => {
    if (!packageFixture) return;
    const { packageId, version } = packageFixture;
    assert.equal(database(`SELECT COUNT(*) FROM sys_tenant WHERE tenant_id=100000 AND package_id=${packageId} AND version=${version + 1};`), '1', '套餐边界夹具已被外部改动，拒绝覆盖');
    database(`UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL,version=${version} WHERE tenant_id=100000 AND package_id=${packageId} AND version=${version + 1};`);
    packageFixture = null;
  };
  try {
    const initial = await overview();
    check('真实默认部署关闭企业微信外部请求', initial.deploymentEnabled === false);
    check('其他厂商明确未实现', initial.providers.filter(provider => provider.type !== 'WECOM').every(provider => !provider.implemented));
    check('IM不依赖H5平台名单和近期再认证即可读取', initial.page.rows.length === 0);
    const employee = await session('g_holiday_employee');
    for (const [requestPath, options] of [[list, {}], [entry, { method: 'POST', body: payload() }], [entry, { method: 'PUT', body: payload({ configId: 1, version: 0 }) }], [`${entry}/1/test`, { method: 'POST', body: { version: 0 } }]]) {
      const denied = await api(employee, requestPath, options);
      check(`员工拒绝${options.method ?? 'GET'} ${requestPath.split('?')[0]}`, denied.status === 403 && safe(denied));
    }
    evidence.permissions = true;
    if (disabledOnly) {
      const management = '/auth/system/im/binding';
      const managed = successful(await api(admin, `${management}/list`), '管理员读取本租户绑定列表');
      check('接入停用仍可读取本地管理记录', managed.total === 0 && managed.rows.length === 0);
      for (const [requestPath, options] of [[`${management}/list`, {}],
        [`${management}/manage/unbind/identity`, {}], [`${management}/manage/resume/identity`, {}],
        [`${management}/manage/unbind`, { method: 'POST', body: { mappingId: 1, version: 0 } }],
        [`${management}/manage/resume`, { method: 'POST', body: { mappingId: 1, version: 0 } }]]) {
        check(`员工拒绝管理绑定${requestPath}`, (await api(employee, requestPath, options)).status === 403);
      }
      for (const action of ['unbind', 'resume']) {
        check(`接入停用时管理员验证${action}明确拒绝`, (await api(admin, `${management}/manage/${action}/identity`)).status === 503);
      }
      for (const width of [1440, 320]) {
        await admin.setViewportSize({ width, height: 1000 });
        await admin.goto(`${origin}/system/im/bindings`, { waitUntil: 'domcontentloaded' });
        await admin.getByRole('heading', { name: '通信绑定管理', exact: true, level: 2 }).waitFor();
        await admin.getByText('暂无通信绑定记录。', { exact: true }).waitFor();
        check(`${width}px真实管理列表正常且无横向溢出`, await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      const binding = '/auth/system/im/binding/mine';
      const bindingOverview = successful(await api(employee, binding), '本人读取已开放绑定入口');
      check('已授权本人读取真实停用绑定状态', bindingOverview.binding === null && bindingOverview.canBind === false && bindingOverview.canUnbind === false);
      for (const [requestPath, options] of [[`${binding}/identity`, {}],
        [`${binding}/identity`, { method: 'POST', body: { password: 'unused-binding-input', totpCode: null } }],
        [`${binding}/authorization`, { method: 'POST', body: {} }], [`${binding}/confirm`, { method: 'POST', body: {} }],
        [`${binding}/unbind/identity`, {}], [`${binding}/unbind/identity`, { method: 'POST', body: { password: 'unused-binding-input', totpCode: null } }],
        [`${binding}/unbind`, { method: 'POST', body: { mappingId: 1, version: 0 } }]]) {
        const denied = await api(employee, requestPath, options);
        check(`接入停用时本人拒绝${options.method ?? 'GET'} ${requestPath}`, denied.status === (options.method === 'POST' ? 403 : 503) && safe(denied));
      }
      check('无外部证明时待确认身份为空', successful(await api(employee, `${binding}/pending`), '本人读取待确认状态') === null);
      for (const width of [1440, 320]) {
        await employee.setViewportSize({ width, height: 1000 });
        await employee.goto(`${origin}/workspace/im-bindings`, { waitUntil: 'domcontentloaded' });
        await employee.getByRole('heading', { name: '我的通信绑定', exact: true, level: 2 }).waitFor();
        await employee.getByText('未绑定', { exact: true }).waitFor();
        check(`${width}px真实本人入口停用且无横向溢出`, await employee.getByRole('button', { name: '验证本人身份', exact: true }).count() === 0
          && await employee.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      check('拒绝本人绑定操作后原登录保持有效', (await api(employee, '/auth/info')).status === 200);
      check('独立密钥未配置时禁止写入', initial.canConfigure === false && (await api(admin, entry, { method: 'POST', body: payload() })).status === 503);
      const beforeRuns = database('SELECT COUNT(*) FROM sys_im_sync_run;');
      for (const [requestPath, options] of [[`${entry}/1/sync-preview`, { method: 'POST', body: { version: 0 } }],
        ['/auth/system/im/sync/configurations', {}], ['/auth/system/im/sync/list?configId=1', {}], ['/auth/system/im/sync/1', {}],
        ['/auth/system/im/sync/1/apply', { method: 'POST', body: { version: 0, hash: 'a'.repeat(64) } }],
        [`${entry}/local-departments`, {}], [`${entry}/1/remote-departments`, { method: 'POST', body: { version: 0 } }]]) {
        const denied = await api(employee, requestPath, options);
        check(`员工拒绝同步入口${requestPath.split('?')[0]}`, denied.status === 403 && safe(denied));
      }
      const syncOverview = successful(await api(admin, '/auth/system/im/sync/configurations'), '真实同步目录');
      check('管理员同步目录独立可读且准确显示停用和空配置', !syncOverview.deploymentEnabled && !syncOverview.canConfigure && syncOverview.configurations.length === 0);
      for (const [requestPath, options, expected] of [[`${entry}/1/sync-preview`, { method: 'POST', body: { version: 0 } }, 503],
        [`${entry}/1/remote-departments`, { method: 'POST', body: { version: 0 } }, 503],
        ['/auth/system/im/sync/list?configId=1', {}, 404], ['/auth/system/im/sync/1', {}, 404]]) {
        const response = await api(admin, requestPath, options);
        check(`管理员停用或不存在资源${requestPath.split('?')[0]}`, response.status === expected && safe(response));
      }
      check('已有1784授权的管理员在接入停用时仍不能执行同步', (await api(admin, '/auth/system/im/sync/1/apply', {
        method: 'POST', body: { version: 0, hash: 'a'.repeat(64) },
      })).status === 503);
      const departments = successful(await api(admin, `${entry}/local-departments?pageNum=1&pageSize=1`), '真实本地范围候选');
      check('管理员本地候选分页且只返回三个字段', departments.rows.length <= 1 && departments.total > 0 && departments.rows.every(row => Object.keys(row).sort().join() === 'id,name,parentId'));
      check('停用与未授权请求不新增同步批次', database('SELECT COUNT(*) FROM sys_im_sync_run;') === beforeRuns);
      for (const width of [1440, 320]) {
        await admin.setViewportSize({ width, height: 1000 }); await arrive();
        check(`${width}px页面明确密钥缺失且禁止新增`, await admin.getByText('独立加密密钥未配置，禁止保存', { exact: true }).isVisible() && await admin.getByRole('button', { name: '新增配置', exact: true }).isDisabled());
        await assertLayout(`${width}px默认停用列表`);
        await admin.screenshot({ path: path.join(directory, `g4-im-disabled-${width}-${caseTag}.png`), fullPage: true });
        await admin.goto(`${origin}/system/im/sync`, { waitUntil: 'domcontentloaded' });
        await admin.getByRole('heading', { name: '企业微信组织同步', exact: true, level: 2 }).waitFor();
        await waitUntil('同步页面未就绪', () => admin.getByRole('button', { name: '刷新', exact: true }).isEnabled());
        check(`${width}px真实同步页面停用且无自动预览`, await admin.getByRole('button', { name: '生成预览', exact: true }).isDisabled()
          && (await admin.getByLabel('组织同步状态').innerText()).includes('企业通信接入未启用，原账号登录和审批照常使用'));
        const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        check(`${width}px真实同步页面无横向溢出`, overflow <= 1);
        await admin.screenshot({ path: path.join(directory, `g4-im-sync-disabled-${width}-${caseTag}.png`), fullPage: true });
      }
      await verifyImRecoveryJob(context, employee);
      await verifyImMessageDisabled(context, employee);
      evidence.disabled = true; evidence.desktop = true; evidence.mobile = true;
      return;
    }
    check('独立密钥存在时允许停用草稿', initial.canConfigure === true);
    const configuration = await fs.readFile(path.join(directory, 'auth/integration.properties'), 'utf8');
    const masterKey = configuration.match(/^cloudflow\.im\.secret-key=(.+)$/m)?.[1].trim();
    assert.ok(masterKey?.length >= 32);
    sensitive.add(masterKey);
    const created = successful(await api(admin, entry, { method: 'POST', body: payload() }), '创建真实四密钥配置');
    ids.add(created.configId);
    check('创建结果只含configured标志且默认停用', created.status === 'DISABLED' && created.version === 0 && created.appKeyConfigured && created.appSecretConfigured && created.tokenConfigured && created.aesKeyConfigured && safe(created));
    const encrypted = current(created.configId);
    for (const [field, key, value] of [['appKey', 'APP_KEY', appKey], ['appSecret', 'APP_SECRET', secret], ['token', 'TOKEN', callbackToken], ['aesKey', 'AES_KEY', aesKey]]) {
      const cipher = encrypted[field]; sensitive.add(cipher);
      assert.match(cipher, /^im1:/);
      const bytes = Buffer.from(cipher.slice(4), 'base64');
      const derived = createHash('sha256').update(`cloudflow:im:v1:100000:WECOM:${key}:${masterKey}`).digest();
      const decipher = createDecipheriv('aes-256-gcm', derived, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(-16));
      check(`${field}真实库独立解密吻合且未存明文`, Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8') === value && cipher !== value);
    }
    evidence.encryption = true;
    check('重复企业微信配置拒绝', (await api(admin, entry, { method: 'POST', body: payload({ corpId: `${prefix}_duplicate` }) })).status === 409);
    check('未配置外部连接时真实测试接口明确停用', (await api(admin, `${entry}/${created.configId}/test`, { method: 'POST', body: { version: 0 } })).status === 503);
    check('客户端冒传租户字段拒绝', (await api(admin, entry, { method: 'PUT', body: edit(created, { tenantId: 100001 }) })).status === 400);
    check('替换回调为任意地址拒绝', (await api(admin, entry, { method: 'PUT', body: edit(created, { callbackUrl: 'https://other.example.invalid/callback' }) })).status === 400);
    check('应用Secret不可清除', (await api(admin, entry, { method: 'PUT', body: edit(created, { appSecret: { action: 'CLEAR' } }) })).status === 400);
    let saved = successful(await api(admin, entry, { method: 'PUT', body: edit(created, { callbackUrl: created.expectedCallbackUrl }) }), '保存系统固定回调地址');
    check('保留动作不改变四密文且版本递增', saved.version === 1 && ['appKey', 'appSecret', 'token', 'aesKey'].every(field => current(created.configId)[field] === encrypted[field]));
    check('旧版本拒绝覆盖', (await api(admin, entry, { method: 'PUT', body: edit(created) })).status === 409);
    database('DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=1 AND menu_id=1781;'); revoked = true;
    check('已登录管理员撤回管理授权后立即拒写', (await api(admin, entry, { method: 'PUT', body: edit(saved) })).status === 403);
    database('INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1781,100000);'); revoked = false;
    const tenant = JSON.parse(database("SELECT JSON_OBJECT('packageId',package_id,'packageVersion',package_version,'menus',effective_menu_ids,'version',version) FROM sys_tenant WHERE tenant_id=100000;"));
    assert.ok(tenant.packageId === null && tenant.packageVersion === null && tenant.menus === null && Number.isSafeInteger(tenant.version), '套餐夹具要求未分配基线');
    const packageId = 178000000 + randomBytes(3).readUIntBE(0, 3);
    assert.equal(database(`SELECT (SELECT COUNT(*) FROM sys_tenant_package WHERE package_id=${packageId})+(SELECT COUNT(*) FROM sys_tenant WHERE package_id=${packageId});`), '0');
    packageFixture = { packageId, version: tenant.version };
    database(`UPDATE sys_tenant SET package_id=${packageId},package_version=0,effective_menu_ids='[6,1780]',version=version+1 WHERE tenant_id=100000 AND package_id IS NULL AND version=${tenant.version};`);
    check('套餐只选读取时原管理员仍可读配置', (await api(admin, list)).status === 200);
    check('套餐未选管理时原管理员立即拒写', (await api(admin, entry, { method: 'PUT', body: edit(saved, { corpId: `${prefix}_package_rejected` }) })).status === 403);
    check('套餐未选测试时原管理员立即拒绝测试', (await api(admin, `${entry}/${created.configId}/test`, { method: 'POST', body: { version: saved.version } })).status === 403);
    check('受限套餐仍保留本人登录信息', (await api(admin, '/auth/info')).status === 200);
    restorePackage();
    check('套餐边界夹具恢复原版本及未分配状态', database(`SELECT COUNT(*) FROM sys_tenant WHERE tenant_id=100000 AND package_id IS NULL AND package_version IS NULL AND effective_menu_ids IS NULL AND version=${tenant.version};`) === '1');
    evidence.management = true; evidence.disabled = true;
    for (const [name, width] of [['desktop', 1440], ['mobile', 320]]) {
      await admin.setViewportSize({ width, height: 1000 }); await arrive();
      check(`${name}已有配置禁止重复新增且连接按钮停用`, await admin.getByRole('button', { name: '新增配置', exact: true }).isDisabled() && await admin.getByRole('button', { name: '测试连接', exact: true }).isDisabled());
      await admin.getByRole('button', { name: '编辑', exact: true }).click();
      const dialog = admin.getByRole('dialog', { name: '编辑企业微信配置', exact: true });
      await dialog.waitFor();
      check(`${name}编辑无密钥输入默认保留`, await dialog.locator('input[type=password]').count() === 0 && await dialog.getByLabel('应用Secret操作').innerText() === '保留已有值');
      await dialog.getByLabel('企业ID', { exact: true }).fill(`${prefix}_${name}`);
      await assertLayout(`${name}编辑表单`);
      let release;
      let saves = 0;
      let arrived = false;
      const released = new Promise(resolve => { release = resolve; });
      const hold = async intercepted => {
        if (intercepted.request().method() !== 'PUT') return intercepted.continue();
        saves++;
        const response = await intercepted.fetch();
        assert.equal(response.status(), 200);
        arrived = true;
        await released;
        if (name === 'mobile') return intercepted.abort('connectionfailed');
        return intercepted.fulfill({ response });
      };
      await admin.route(`**/api${entry}`, hold);
      try {
        await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
        await waitUntil('真实保存未到达延迟边界', () => arrived);
        check(`${name}保存中禁止取消及重复提交`, await dialog.getByRole('button', { name: '保存中…', exact: true }).isDisabled() && await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled());
        await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click(); await admin.keyboard.press('Escape');
        check(`${name}保存中关闭与Escape保持原表单`, await dialog.isVisible());
        release();
        if (name === 'mobile') {
          await dialog.getByText('结果或版本未确认，已禁止重复提交；请关闭表单、刷新列表并核对当前记录后再操作。', { exact: true }).waitFor();
          check('手机丢失真实成功响应后禁止自动重试且保存结果已落库', saves === 1 && current(created.configId).corpId === `${prefix}_${name}` && await dialog.getByRole('button', { name: '保存配置', exact: true }).isDisabled());
          await dialog.getByRole('button', { name: '取消', exact: true }).click(); evidence.lostResponse = true;
        }
        await dialog.waitFor({ state: 'hidden' });
      } finally { release(); await admin.unroute(`**/api${entry}`, hold); }
      await admin.getByRole('button', { name: '刷新', exact: true }).click();
      await waitUntil('刷新后未恢复操作', () => admin.getByRole('button', { name: '编辑', exact: true }).isEnabled());
      check(`${name}刷新核对真实版本并只提交一次`, saves === 1 && safe(await overview()));
      await assertLayout(`${name}配置列表`);
      if (name === 'mobile') {
        const lastPageButton = admin.getByRole('button', { name: '下一页', exact: true });
        await lastPageButton.evaluate(button => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
        const paginationPosition = await lastPageButton.evaluate(button => ({ bottom: button.getBoundingClientRect().bottom, navigationTop: document.querySelector('.cf-mobile-tab-bar').getBoundingClientRect().top }));
        console.log(`G4_IM_MOBILE_PAGINATION: bottom=${paginationPosition.bottom}; navigation_top=${paginationPosition.navigationTop}`);
        if (paginationPosition.bottom > paginationPosition.navigationTop) await admin.screenshot({ path: path.join(directory, `g4-im-pagination-failure-${caseTag}.png`), fullPage: true });
        check('手机滚动到列表底部时分页不被固定导航遮挡', paginationPosition.bottom <= paginationPosition.navigationTop);
      }
      await admin.screenshot({ path: path.join(directory, `g4-im-config-${name}-${caseTag}.png`), fullPage: true });
      evidence[name] = true;
    }
    saved = (await overview()).page.rows[0];
    const cleared = successful(await api(admin, entry, { method: 'PUT', body: edit(saved, { appKey: { action: 'CLEAR' }, token: { action: 'CLEAR' }, aesKey: { action: 'CLEAR' } }) }), '清除可选密钥');
    check('可选密钥真实清空且应用Secret保留', !cleared.appKeyConfigured && !cleared.tokenConfigured && !cleared.aesKeyConfigured && cleared.appSecretConfigured && ['appKey', 'token', 'aesKey'].every(field => current(created.configId)[field] === null));
    await new Promise(resolve => setTimeout(resolve, 2000));
    const auditScan = await scanOwnedAuditLogs(state, sensitive, boundaries);
    check('本轮真实访问日志异常日志及审计无密钥和密文', auditScan.leaks === 0);
    let logFiles = 0;
    for (const service of state.services) {
      for (const file of await fs.readdir(path.join(directory, service.name))) {
        if (!file.endsWith('.log')) continue;
        const scanned = await scanSecretStream(createReadStream(path.join(directory, service.name, file)), sensitive);
        assert.equal(scanned.leaks, 0, `${service.name}日志含敏感值`); logFiles++;
      }
    }
    console.log(`G4_IM_HTTP_SECRET_CHECKS: fields=4; database_decrypted=true; ordinary_responses_safe=true; log_files=${logFiles}; leaks=0`);
  } finally {
    restorePackage();
    if (revoked) database('INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1781,100000);');
    const rows = JSON.parse(`[${database(`SELECT JSON_OBJECT('id',config_id,'corpId',corp_id,'createBy',create_by) FROM sys_im_config WHERE tenant_id=100000 AND corp_id LIKE '${prefix.replaceAll('_', '\\_')}%';`).split(/\r?\n/).filter(Boolean).join(',')}]`);
    for (const row of rows) {
      assert.ok(row.corpId.startsWith(prefix) && String(row.createBy) === String(owner.userId));
      ids.add(row.id);
    }
    for (const configId of ids) {
      assert.ok(Number.isSafeInteger(configId));
      const owned = current(configId);
      assert.ok(owned.corpId.startsWith(prefix) && owned.tenantId === 100000);
      database(`DELETE FROM sys_im_config WHERE tenant_id=100000 AND config_id=${configId} AND create_by='${owner.userId}';`);
    }
    check('只清理本轮配置且IM其他业务表仍无事实', database('SELECT COUNT(*) FROM sys_im_config;') === '0' && database('SELECT (SELECT COUNT(*) FROM sys_im_user_mapping)+(SELECT COUNT(*) FROM sys_im_dept_mapping)+(SELECT COUNT(*) FROM sys_im_sync_run)+(SELECT COUNT(*) FROM sys_im_todo_mapping)+(SELECT COUNT(*) FROM sys_im_callback_event);') === '0');
    check('管理员十一项授权恢复且员工仅有三项本人授权', database('SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_role_menu WHERE role_id=1 AND tenant_id=100000 AND menu_id BETWEEN 1780 AND 1799;') === '1780,1781,1782,1783,1784,1785,1786,1787,1788,1789,1790' && database('SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_role_menu WHERE role_id=5 AND tenant_id=100000 AND menu_id BETWEEN 1780 AND 1799;') === '1788,1789,1790');
    evidence.cleanup = true;
  }
}
