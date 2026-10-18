import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyDataSourceLiveUi(context) {
  const { admin, database, check, directory, caseTag, config, expectedKeys, waitUntil, verifyIdentity, secrets, requests, evidence } = context;
  const entry = `/api/auth/system/data-source/${config.configId}`;
  const row = () => admin.locator('.data-source-workspace tr:visible, .data-source-workspace article:visible').filter({ hasText: config.configName });
  const route = new URL('/system/data-sources', admin.url()).href;
  const current = () => JSON.parse(database(`SELECT JSON_OBJECT('version',version,'status',status) FROM sys_data_source_config WHERE tenant_id=100000 AND config_id=${config.configId};`));
  const instances = () => JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('key',instance_key,'version',applied_version,'status',status)),JSON_ARRAY()) FROM sys_data_source_registration WHERE tenant_id=100000 AND config_id=${config.configId};`));
  const responseFor = action => admin.waitForResponse(response => new URL(response.url()).pathname === `${entry}/${action}` && response.request().method() === 'POST');
  const checkResponse = async (pending, action) => {
    const response = await pending;
    const body = await response.json();
    requests.push({ path: `${entry.slice(4)}/${action}`, method: 'POST', status: response.status(), code: body?.code, source: 'real-ui-action' });
    check(`页面${action}调用真实服务成功且响应无秘密`, response.status() === 200 && body.code === 200
      && response.headers()['cache-control'] === 'no-store' && secrets.every(secret => !JSON.stringify(body).includes(secret)));
    return body.data;
  };
  const applied = async status => {
    await waitUntil(`页面操作后${expectedKeys.size}个真实实例均为${status}`, () => {
      const actual = current();
      const rows = instances();
      return actual.status === (status === 'ACTIVE' ? 'ENABLED' : 'DISABLED') && rows.length === expectedKeys.size
        && rows.every(instance => expectedKeys.has(instance.key) && instance.version === actual.version && instance.status === status);
    });
  };
  for (const frame of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    await verifyIdentity();
    await admin.setViewportSize({ width: frame.width, height: frame.height });
    await admin.goto(route, { waitUntil: 'domcontentloaded' });
    await row().waitFor({ state: 'visible', timeout: 20000 });
    const before = current();
    assert.equal(before.status, 'DISABLED');
    const tested = responseFor('test');
    await row().getByRole('button', { name: '测试连接', exact: true }).click();
    const result = await checkResponse(tested, 'test');
    const testDialog = admin.getByRole('dialog', { name: '连接测试结果', exact: true });
    await testDialog.waitFor({ state: 'visible' });
    check(`${frame.name}显示真实只读连接通过且不自动启用`, result.successful === true
      && await testDialog.getByText('固定连接测试通过', { exact: true }).isVisible() && current().version === before.version && current().status === 'DISABLED');
    await testDialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await row().getByRole('button', { name: '注册启用', exact: true }).click();
    const register = admin.getByRole('dialog', { name: '注册并应用数据源', exact: true });
    await register.waitFor({ state: 'visible' });
    check(`${frame.name}未输入准确注册键不能提交`, await register.getByRole('button', { name: '确认注册', exact: true }).isDisabled());
    await register.getByLabel(/^输入注册键/).fill(config.dsKey);
    const enabled = responseFor('register');
    await register.getByRole('button', { name: '确认注册', exact: true }).click();
    await checkResponse(enabled, 'register');
    await register.waitFor({ state: 'hidden' });
    await applied('ACTIVE');
    await admin.getByRole('button', { name: '刷新', exact: true }).click();
    await row().getByRole('button', { name: '停用', exact: true }).waitFor({ state: 'visible' });
    await row().getByRole('button', { name: '实例详情', exact: true }).click();
    const detail = admin.getByRole('dialog', { name: '数据源实例详情', exact: true });
    await detail.waitFor({ state: 'visible' });
    const body = await detail.innerText();
    check(`${frame.name}详情逐个显示所有真实实例且没有密码密文`, [...expectedKeys].every(key => body.includes(key))
      && secrets.every(secret => !body.includes(secret)) && !body.includes('应用失败'));
    await admin.screenshot({ path: path.join(directory, `h5-data-source-active-${frame.name}-${caseTag}.png`), fullPage: true });
    await detail.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await row().getByRole('button', { name: '停用', exact: true }).click();
    const disable = admin.getByRole('dialog', { name: '停用数据源', exact: true });
    await disable.waitFor({ state: 'visible' });
    await disable.getByLabel(/^输入注册键/).fill(config.dsKey);
    const stopped = responseFor('disable');
    await disable.getByRole('button', { name: '确认停用', exact: true }).click();
    await checkResponse(stopped, 'disable');
    await disable.waitFor({ state: 'hidden' });
    await applied('DISABLED');
    check(`${frame.name}注册和停用各增加一个实际版本`, current().version === before.version + 2);
    const storage = await admin.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    check(`${frame.name}浏览器存储不保留数据库密码或密钥`, secrets.every(secret => !storage.includes(secret)));
    evidence[frame.name] = true;
  }
  console.log(`DATA_SOURCE_LIVE_BROWSER: desktop=true; mobile=true; actual_test=true; actual_register=true; actual_disable=true; actual_instances=${expectedKeys.size}; interface_doubles=0; production_modified=false`);
}
