import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyStorageInterface(harness) {
  const { admin, api, successful, session, database, check, directory, caseTag, requests } = harness;
  const origin = new URL(admin.url()).origin;
  const base = '/auth/system/file/config';
  const screenshots = path.join(directory, 'storage-ui');
  await fs.mkdir(screenshots, { recursive: true });
  const credentials = JSON.parse((await fs.readFile(path.join(directory, 'private', 'storage.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const masterQuery = "SELECT COALESCE(GROUP_CONCAT(config_id ORDER BY config_id),'') FROM sys_file_config WHERE tenant_id=100000 AND master_flag=1 AND deleted=0;";
  const originalMasters = database(masterQuery);
  assert.match(originalMasters, /^(?:[1-9][0-9]*(?:,[1-9][0-9]*)*)?$/);
  const created = [];
  const errors = [];
  const responseWork = [];
  let responseLeaksCredentials = false;
  let tenant;
  let readonly;
  const onPageError = error => errors.push(error.message);
  const onResponse = response => {
    const pathname = new URL(response.url()).pathname;
    if (!pathname.startsWith(`/api${base}`)) return;
    responseWork.push((async () => {
      let code;
      try {
        const body = await response.json();
        code = body.code;
        const encoded = JSON.stringify(body);
        responseLeaksCredentials ||= encoded.includes(credentials.secretKey) || encoded.includes(credentials.accessKey);
      } catch { }
      requests.push({ path: pathname, method: response.request().method(), status: response.status(), code, traceId: response.headers()['x-trace-id'] });
    })());
  };
  admin.on('pageerror', onPageError);
  admin.on('response', onResponse);
  const responseFor = async (pathname, method, action) => {
    const response = admin.waitForResponse(candidate => new URL(candidate.url()).pathname === `/api${pathname}` && candidate.request().method() === method, { timeout: 120000 });
    await action();
    const completed = await response;
    return successful({ status: completed.status(), body: await completed.json() }, pathname);
  };
  const denied = response => response.status >= 400 || response.body?.code !== 200;
  const numeric = value => { assert.match(String(value), /^[1-9][0-9]*$/); return value; };
  const findRow = async config => {
    const pagination = admin.locator('.pagination-desktop');
    const selected = pagination.locator('button[aria-current="page"]');
    if (await selected.count() && (await selected.innerText()) !== '1') {
      await responseFor(`${base}/list`, 'GET', () => pagination.getByRole('button', { name: '1', exact: true }).click());
    }
    let listed = await responseFor(`${base}/list`, 'GET', () => admin.getByRole('button', { name: '刷新', exact: true }).click());
    for (let pageNumber = 1; pageNumber <= Math.max(1, Math.ceil(listed.total / 10)); pageNumber++) {
      if (listed.rows.some(candidate => String(candidate.configId) === String(config.configId))) {
        const row = admin.getByRole('row').filter({ has: admin.getByText(config.configCode, { exact: true }) });
        await row.waitFor({ state: 'visible', timeout: 120000 });
        return row;
      }
      const next = pagination.getByRole('button', { name: '下一页', exact: true });
      if (await next.isDisabled()) break;
      listed = await responseFor(`${base}/list`, 'GET', () => next.click());
    }
    throw new Error(`Created configuration is not visible: ${config.configCode}`);
  };
  const edit = async (config, action) => {
    const row = await findRow(config);
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '编辑存储配置', exact: true });
    await action(dialog);
    const saved = await responseFor(base, 'PUT', () => dialog.getByRole('button', { name: '保存配置', exact: true }).click());
    await dialog.waitFor({ state: 'hidden', timeout: 120000 });
    return saved;
  };
  const create = async storageType => {
    await admin.getByRole('button', { name: '新增配置', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '新增存储配置', exact: true });
    await dialog.getByLabel('配置编码', { exact: true }).fill(`G_UI_${caseTag}_${storageType}`);
    await dialog.getByLabel('配置名称', { exact: true }).fill(`界面存储-${storageType}-${caseTag}`);
    await dialog.getByLabel('基础路径', { exact: true }).fill(`g-storage-ui/${caseTag}/${storageType.toLowerCase()}`);
    await dialog.getByLabel('单文件上限（字节）', { exact: true }).fill('1048576');
    await dialog.getByLabel('允许的扩展名', { exact: true }).fill('txt,csv');
    await dialog.getByLabel('签名有效期（秒）', { exact: true }).fill('60');
    if (storageType === 'MINIO') {
      await dialog.getByRole('button', { name: '存储类型', exact: true }).click();
      await admin.getByRole('option', { name: 'MinIO', exact: true }).click();
      await dialog.getByLabel('服务端点', { exact: true }).fill(credentials.endpoint);
      await dialog.getByLabel('区域', { exact: true }).fill('us-east-1');
      await dialog.getByLabel('桶名', { exact: true }).fill(credentials.bucket);
      await dialog.getByLabel('AccessKey', { exact: true }).fill(credentials.accessKey);
      await dialog.getByLabel('SecretKey', { exact: true }).fill(credentials.secretKey);
      check('真实新增页面以密码输入框接收存储密钥', await dialog.getByLabel('SecretKey', { exact: true }).getAttribute('type') === 'password');
    } else {
      check('真实本地配置页面不要求对象存储密钥', await dialog.getByLabel('SecretKey', { exact: true }).count() === 0);
    }
    const saved = await responseFor(base, 'POST', () => dialog.getByRole('button', { name: '保存配置', exact: true }).click());
    numeric(saved.configId);
    created.push(saved);
    await dialog.waitFor({ state: 'hidden', timeout: 120000 });
    check(`${storageType}真实页面保存独立私有配置`, saved.storageType === storageType && saved.accessPolicy === '0' && database(`SELECT CONCAT_WS('|',storage_type,access_policy,master_flag) FROM sys_file_config WHERE config_id=${saved.configId} AND tenant_id=100000 AND deleted=0;`) === `${storageType}|0|0`);
    return saved;
  };
  try {
    await admin.goto(`${origin}/system/file-config`, { waitUntil: 'domcontentloaded' });
    await admin.getByRole('heading', { name: '存储配置', level: 2, exact: true }).waitFor({ state: 'visible', timeout: 120000 });
    let local = await create('LOCAL');
    local = await edit(local, async dialog => {
      await dialog.getByLabel('配置名称', { exact: true }).fill(`界面本地修改-${caseTag}`);
      await dialog.getByLabel('设为本租户主用存储', { exact: true }).check();
    });
    check('真实页面编辑名称并切换为唯一主用存储', local.configName === `界面本地修改-${caseTag}` && database(masterQuery) === String(local.configId));
    let localRow = await findRow(local);
    check('真实页面禁止删除当前主用配置', await localRow.getByRole('button', { name: '删除', exact: true }).isDisabled());
    await responseFor(`${base}/${local.configId}/test`, 'POST', () => localRow.getByRole('button', { name: '测试连接', exact: true }).click());
    check('真实页面完成本地存储连接测试', true);
    let object = await create('MINIO');
    const cipher = database(`SELECT secret_key_cipher FROM sys_file_config WHERE config_id=${object.configId} AND tenant_id=100000;`);
    check('真实页面提交的存储密钥加密落库且响应不回显', cipher.length > credentials.secretKey.length && !cipher.includes(credentials.secretKey) && !object.secretKey && !object.secretKeyCipher && object.accessKey !== credentials.accessKey);
    object = await edit(object, async dialog => {
      check('真实编辑页面密钥为空且访问标识已隐藏', await dialog.getByLabel('SecretKey', { exact: true }).inputValue() === '' && await dialog.getByLabel('AccessKey', { exact: true }).inputValue() !== credentials.accessKey);
      await dialog.getByLabel('配置名称', { exact: true }).fill(`界面对象修改-${caseTag}`);
      await dialog.getByLabel('设为本租户主用存储', { exact: true }).check();
    });
    check('真实编辑留空保留原密钥并切换主用存储', database(`SELECT secret_key_cipher FROM sys_file_config WHERE config_id=${object.configId};`) === cipher && database(masterQuery) === String(object.configId));
    const objectRow = await findRow(object);
    await responseFor(`${base}/${object.configId}/test`, 'POST', () => objectRow.getByRole('button', { name: '测试连接', exact: true }).click());
    check('真实页面保留密钥后仍能连接隔离MinIO', true);
    local = await edit(local, dialog => dialog.getByLabel('设为本租户主用存储', { exact: true }).check());
    check('真实页面切回本地存储后对象配置不再主用', database(masterQuery) === String(local.configId) && database(`SELECT master_flag FROM sys_file_config WHERE config_id=${object.configId};`) === '0');
    const removable = await findRow(object);
    await removable.getByRole('button', { name: '删除', exact: true }).click();
    const confirmation = admin.getByRole('dialog', { name: '删除存储配置', exact: true });
    await responseFor(`${base}/${object.configId}`, 'DELETE', () => confirmation.getByRole('button', { name: '确认删除', exact: true }).click());
    await confirmation.waitFor({ state: 'hidden', timeout: 120000 });
    check('真实页面确认删除无引用的非主用配置', database(`SELECT deleted FROM sys_file_config WHERE config_id=${object.configId};`) === '1');
    localRow = await findRow(local);
    await admin.screenshot({ path: path.join(screenshots, `desktop-${caseTag}.png`), fullPage: true });
    await admin.setViewportSize({ width: 390, height: 844 });
    const card = admin.getByRole('article').filter({ has: admin.getByRole('heading', { name: local.configName, exact: true }) });
    await card.waitFor({ state: 'visible', timeout: 120000 });
    check('真实移动页面使用存储卡片且无整页横向溢出', await card.isVisible() && await admin.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await card.getByRole('button', { name: '编辑', exact: true }).click();
    const mobileDialog = admin.getByRole('dialog', { name: '编辑存储配置', exact: true });
    check('真实移动编辑弹窗适配视口', await mobileDialog.evaluate(element => element.getBoundingClientRect().width <= window.innerWidth && element.getBoundingClientRect().height <= window.innerHeight));
    await mobileDialog.screenshot({ path: path.join(screenshots, `mobile-edit-${caseTag}.png`) });
    await mobileDialog.getByRole('button', { name: '取消', exact: true }).click();
    await admin.setViewportSize({ width: 1440, height: 1000 });
    tenant = await session('g_import_tenant');
    const otherConfigs = successful(await api(tenant, `${base}/list?pageNum=1&pageSize=50`), '其他租户配置列表');
    check('其他租户不能列出或读取本租户存储配置', otherConfigs.rows.every(config => config.configCode !== local.configCode) && denied(await api(tenant, `${base}/${local.configId}`)));
    readonly = await session('g_import_readonly');
    await readonly.goto(`${origin}/system/file-config`, { waitUntil: 'domcontentloaded' });
    const deniedList = await api(readonly, `${base}/list`);
    check('无存储管理权限的真实账号被接口拒绝', denied(deniedList) && denied(await api(readonly, `${base}/${local.configId}/test`, { method: 'POST' })));
    check('无权限真实页面不提供存储管理操作', await readonly.getByRole('button', { name: /^(新增配置|编辑|测试连接|删除)$/ }).count() === 0);
    await Promise.all(responseWork);
    check('存储页面所有配置响应均未暴露明文凭据', !responseLeaksCredentials);
    check('存储管理页面无未处理浏览器异常', errors.length === 0);
  } catch (error) {
    await admin.screenshot({ path: path.join(screenshots, `failure-${caseTag}.png`), fullPage: true, mask: [admin.getByLabel('AccessKey', { exact: true }), admin.getByLabel('SecretKey', { exact: true })] }).catch(() => { });
    throw error;
  } finally {
    admin.off('pageerror', onPageError);
    admin.off('response', onResponse);
    await Promise.all(responseWork);
    try {
      const restore = originalMasters ? `UPDATE sys_file_config SET master_flag=1 WHERE config_id IN (${originalMasters}) AND tenant_id=100000 AND deleted=0;` : '';
      database(`START TRANSACTION; SELECT tenant_id FROM sys_tenant WHERE tenant_id=100000 FOR UPDATE; UPDATE sys_file_config SET master_flag=0 WHERE tenant_id=100000 AND deleted=0; ${restore} COMMIT;`);
      check('存储界面验收后还原原有主用配置', database(masterQuery) === originalMasters);
      for (const config of created) {
        if (database(`SELECT deleted FROM sys_file_config WHERE config_id=${numeric(config.configId)};`) === '0') {
          successful(await api(admin, `${base}/${config.configId}`, { method: 'DELETE' }), '清理本次无引用界面配置');
        }
      }
    } finally {
      await tenant?.context().close();
      await readonly?.context().close();
    }
  }
}
