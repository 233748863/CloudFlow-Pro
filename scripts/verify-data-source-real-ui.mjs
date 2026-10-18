import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import path from 'node:path';

export async function verifyDataSourceInterface(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, entry, platform, credential,
    proofKey, redis, config, current, rememberCipher, sensitive, verifyIdentity, disabledOnly, waitUntil, evidence } = context;
  const origin = new URL(admin.url()).origin;
  const route = `${origin}/system/data-sources`;
  const listPattern = '**/api/auth/system/data-source/list?*';
  const savePattern = '**/api/auth/system/data-source';
  const frames = [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }];
  const row = name => admin.locator('.data-source-workspace tr:visible, .data-source-workspace article:visible').filter({ hasText: name });
  const recordByKey = key => JSON.parse(database(`SELECT JSON_OBJECT('configId',config_id,'version',version,'status',status,'cipher',password_encrypted,'dsKey',ds_key) FROM sys_data_source_config WHERE tenant_id=100000 AND ds_key='${key}';`));
  const fill = async data => {
    const dialog = admin.getByRole('dialog', { name: '新增数据源配置', exact: true });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByLabel('配置名称', { exact: true }).fill(data.configName);
    await dialog.getByLabel(/^注册键/).fill(data.dsKey);
    await dialog.getByLabel(/^MySQL连接地址/).fill(data.url);
    await dialog.getByLabel('专用只读账号', { exact: true }).fill(data.username);
    await dialog.getByLabel('新数据库密码', { exact: true }).fill(data.password);
    await dialog.getByRole('checkbox', { name: '认证服务', exact: true }).check();
    await dialog.getByRole('checkbox', { name: '人力资源服务', exact: true }).check();
    return dialog;
  };
  const arrive = async () => {
    await admin.goto(route, { waitUntil: 'domcontentloaded' });
    await admin.getByRole('button', { name: '新增配置', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
    await waitUntil('数据源页面读取真实目录后可新增', () => admin.getByRole('button', { name: '新增配置', exact: true }).isEnabled());
  };
  const assertLayout = async label => {
    const measures = await admin.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
      buttons: [...document.querySelectorAll('.data-source-workspace button, .data-source-dialog .btn, .data-source-dialog .select-trigger, .data-source-dialog .modal-close')]
        .filter(element => element.getClientRects().length > 0).map(element => ({ label: element.getAttribute('aria-label') || element.textContent.trim(),
          height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width })) }));
    const valid = measures.overflow <= 1 && measures.buttons.length > 0
      && measures.buttons.every(button => button.height >= 43.5 && button.width >= 43.5);
    console.log(`DATA_SOURCE_LAYOUT_CHECK: label=${label}; measurements=${JSON.stringify(measures)}`);
    if (!valid) await admin.screenshot({ path: path.join(directory, `h5-data-source-layout-failure-${caseTag}-${Date.now()}.png`), fullPage: true });
    check(`${label}无横向溢出且主要操作至少44像素`, valid);
  };
  for (const frame of frames) {
    await admin.setViewportSize({ width: frame.width, height: frame.height });
    if (disabledOnly) {
      await admin.goto(route, { waitUntil: 'domcontentloaded' });
      await admin.getByRole('button', { name: '重新核验', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
      check(`${frame.name}默认停用页面明确说明且没有配置表单`, await admin.getByLabel('平台管理未开放').isVisible()
        && await admin.getByRole('button', { name: '新增配置', exact: true }).count() === 0
        && await admin.locator('input[type="password"]').count() === 0);
      await admin.screenshot({ path: path.join(directory, `h5-data-source-disabled-${frame.name}-${caseTag}.png`), fullPage: true });
      evidence[frame.name] = true;
      continue;
    }
    const identity = successful(await api(admin, platform), '读取页面操作前的真实平台身份');
    if (!identity.verified) await verifyIdentity();
    await arrive();
    check(`${frame.name}页面明确显示逐实例应用说明`, await admin.getByText('保存配置后按实例分别应用；默认业务数据库不受影响', { exact: true }).isVisible());
    const created = config(`${frame.name}-saved`);
    await admin.getByRole('button', { name: '新增配置', exact: true }).click();
    const dialog = await fill(created);
    await assertLayout(`${frame.name}新增表单`);
    let release;
    let received;
    const held = new Promise(resolve => { received = resolve; });
    const released = new Promise(resolve => { release = resolve; });
    let saves = 0;
    const delay = async intercepted => {
      if (intercepted.request().method() !== 'POST') return intercepted.continue();
      saves++;
      const response = await intercepted.fetch();
      assert.equal(response.status(), 200, 'Real UI save must succeed before delaying its response');
      received();
      await released;
      await intercepted.fulfill({ response });
    };
    await admin.route(savePattern, delay);
    try {
      await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
      await Promise.race([held, new Promise((resolve, reject) => setTimeout(() => reject(new Error('Real UI save did not reach its response boundary')), 20000))]);
      check(`${frame.name}保存中禁止再次保存和关闭`, await dialog.getByRole('button', { name: '保存中…', exact: true }).isDisabled()
        && await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled());
      await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await admin.keyboard.press('Escape');
      check(`${frame.name}保存中点击关闭和Escape都保留原表单`, await dialog.isVisible());
      await dialog.getByRole('button', { name: '保存中…', exact: true }).evaluate(button => { button.click(); button.click(); });
      check(`${frame.name}重复点击仅实际保存一次`, saves === 1 && recordByKey(created.dsKey).version === 0);
      release();
      await dialog.waitFor({ state: 'hidden' });
    } finally { release(); await admin.unroute(savePattern, delay); }
    await row(created.configName).waitFor({ state: 'visible' });
    const saved = recordByKey(created.dsKey);
    rememberCipher(saved.configId);
    check(`${frame.name}创建后仍为停用且须主动测试或注册`, saved.status === 'DISABLED'
      && await row(created.configName).getByRole('button', { name: '测试连接', exact: true }).isEnabled()
      && await row(created.configName).getByRole('button', { name: '注册启用', exact: true }).isEnabled());
    await row(created.configName).getByRole('button', { name: '编辑', exact: true }).click();
    const edit = admin.getByRole('dialog', { name: '编辑数据源配置', exact: true });
    await edit.waitFor({ state: 'visible' });
    check(`${frame.name}编辑默认保留密码且注册键锁定`, await edit.getByLabel(/^注册键/).isDisabled()
      && await edit.getByLabel('密码操作').innerText() === '保留已有密码' && await edit.getByLabel('新数据库密码', { exact: true }).count() === 0);
    await edit.getByLabel('密码操作').click();
    await admin.getByRole('option', { name: '清除密码（仅停用配置）', exact: true }).click();
    const clearedResponse = admin.waitForResponse(response => new URL(response.url()).pathname === `/api${entry}` && response.request().method() === 'PUT');
    await edit.getByRole('button', { name: '保存配置', exact: true }).click();
    check(`${frame.name}页面清除密码实际保存成功`, (await clearedResponse).status() === 200);
    await edit.waitFor({ state: 'hidden' });
    check(`${frame.name}数据库密文实际清空`, current(saved.configId).cipher === '' && current(saved.configId).version === 1);
    await row(created.configName).getByRole('button', { name: '实例详情', exact: true }).click();
    const details = admin.getByRole('dialog', { name: '数据源实例详情', exact: true });
    await details.waitFor({ state: 'visible' });
    const detailText = await details.innerText();
    check(`${frame.name}详情显示真实版本和未配置密码状态`, detailText.includes('密码未配置') && detailText.includes('期望版本v1')
      && detailText.includes('认证服务') && detailText.includes('人力资源服务'));
    check(`${frame.name}详情正文无密码或密文`, [...sensitive].every(value => !detailText.includes(value)));
    await details.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await assertLayout(`${frame.name}列表`);
    await admin.screenshot({ path: path.join(directory, `h5-data-source-${frame.name}-${caseTag}.png`), fullPage: true });
    const lost = config(`${frame.name}-lost`);
    await admin.getByRole('button', { name: '新增配置', exact: true }).click();
    const uncertainDialog = await fill(lost);
    let lostSaves = 0;
    const lose = async intercepted => {
      if (intercepted.request().method() !== 'POST') return intercepted.continue();
      lostSaves++;
      const response = await intercepted.fetch();
      assert.equal(response.status(), 200, 'Lost response scenario requires an actual successful save');
      await intercepted.abort('connectionfailed');
    };
    await admin.route(savePattern, lose);
    try {
      await uncertainDialog.getByRole('button', { name: '保存配置', exact: true }).click();
      await uncertainDialog.getByText('当前结果或版本需要重新核对，请关闭表单、刷新列表后再操作；不会自动重复提交。', { exact: true }).waitFor({ state: 'visible' });
      check(`${frame.name}丢失真实成功响应后清空密码并禁止重复提交`, await uncertainDialog.getByLabel('新数据库密码', { exact: true }).inputValue() === ''
        && await uncertainDialog.getByRole('button', { name: '保存配置', exact: true }).isDisabled());
      await uncertainDialog.getByRole('button', { name: '保存配置', exact: true }).evaluate(button => button.click());
      await new Promise(resolve => setTimeout(resolve, 350));
      check(`${frame.name}结果未明时仅产生一笔真实停用配置`, lostSaves === 1 && recordByKey(lost.dsKey).version === 0
        && recordByKey(lost.dsKey).status === 'DISABLED');
      rememberCipher(recordByKey(lost.dsKey).configId);
      await uncertainDialog.getByRole('button', { name: '取消', exact: true }).click();
    } finally { await admin.unroute(savePattern, lose); }
    await admin.getByRole('button', { name: '刷新', exact: true }).click();
    await row(lost.configName).waitFor({ state: 'visible' });
    evidence.lostResponse = true;
    const browserStores = await admin.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    check(`${frame.name}浏览器存储未保存数据库密码`, !browserStores.includes(created.password) && !browserStores.includes(lost.password));
    evidence[frame.name] = true;
  }
  if (disabledOnly) return;
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await arrive();
  const staleInput = config('stale-list');
  let releaseOld;
  let sawOld;
  let retainedResponse;
  const oldReady = new Promise(resolve => { sawOld = resolve; });
  const oldRelease = new Promise(resolve => { releaseOld = resolve; });
  let listCount = 0;
  const delayList = async intercepted => {
    if (++listCount !== 1) return intercepted.continue();
    retainedResponse = await intercepted.fetch();
    assert.equal(retainedResponse.status(), 200);
    sawOld();
    await oldRelease;
    await intercepted.fulfill({ response: retainedResponse }).catch(() => {});
  };
  await admin.route(listPattern, delayList);
  try {
    await admin.getByRole('button', { name: '刷新', exact: true }).click();
    await Promise.race([oldReady, new Promise((resolve, reject) => setTimeout(() => reject(new Error('Real list response did not arrive')), 20000))]);
    await admin.getByRole('button', { name: '新增配置', exact: true }).click();
    const dialog = await fill(staleInput);
    await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await row(staleInput.configName).waitFor({ state: 'visible' });
    rememberCipher(recordByKey(staleInput.dsKey).configId);
    releaseOld();
    await new Promise(resolve => setTimeout(resolve, 400));
    check('旧的真实列表响应迟到不会覆盖已保存的新配置', await row(staleInput.configName).isVisible() && listCount >= 2);
  } finally { releaseOld(); await admin.unroute(listPattern, delayList); }
  const proof = JSON.parse(redis('GET', proofKey));
  assert.ok(proof?.expiresAt > Date.now());
  proof.expiresAt = Date.now() + 10000;
  proof.authenticatedAt = proof.expiresAt - 300000;
  redis('SET', proofKey, JSON.stringify(proof), 'PX', 10000);
  await arrive();
  await row(staleInput.configName).getByRole('button', { name: '编辑', exact: true }).click();
  const expiryDialog = admin.getByRole('dialog', { name: '编辑数据源配置', exact: true });
  await expiryDialog.waitFor({ state: 'visible' });
  await expiryDialog.getByLabel('密码操作').click();
  await admin.getByRole('option', { name: '替换为新密码', exact: true }).click();
  await expiryDialog.getByLabel('新数据库密码', { exact: true }).fill(staleInput.password);
  await admin.getByLabel('平台操作身份验证').waitFor({ state: 'visible', timeout: 15000 });
  check('真实凭据到期卸载表单并清空未提交数据库密码', await admin.getByRole('dialog').count() === 0
    && await admin.getByLabel('当前账号密码', { exact: true }).inputValue() === '');
  const expired = await api(admin, `${entry}/list`);
  check('真实凭据过期后后端同时拒绝数据源读取', expired.status === 403 && expired.body?.code === 403);
  await admin.getByLabel('当前账号密码', { exact: true }).fill(credential.password);
  await admin.getByRole('button', { name: '验证身份', exact: true }).click();
  await admin.getByRole('button', { name: '新增配置', exact: true }).waitFor({ state: 'visible' });
  check('页面重新验证通过后不恢复旧密码表单', await admin.getByRole('dialog').count() === 0 && redis('EXISTS', proofKey) === '1');
  evidence.expiredIdentity = true;
  const employee = await session('g_holiday_employee');
  try {
    for (const frame of frames) {
      await employee.setViewportSize({ width: frame.width, height: frame.height });
      await employee.goto(`${new URL(employee.url()).origin}/system/data-sources`, { waitUntil: 'domcontentloaded' });
      await waitUntil(`${frame.name}员工直达数据源页面被权限保护`, async () =>
        await employee.getByRole('heading', { name: '权限不足', exact: true }).isVisible()
        && await employee.getByText('您没有访问此页面的权限', { exact: true }).isVisible());
      check(`${frame.name}员工页面没有平台身份或配置表单`, await employee.getByRole('button', { name: '新增配置', exact: true }).count() === 0
        && await employee.getByLabel('当前账号密码', { exact: true }).count() === 0);
    }
  } finally { await employee.context().close(); }
  const stores = await admin.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  check('身份过期及重新验证均未将数据库密码写入浏览器存储', !stores.includes(staleInput.password));
  const totpStatus = successful(await api(admin, '/auth/profile/totp/status'), '读取动态验证码测试条件');
  check('平台页面专项启用真实动态验证码能力且测试账号未登记', totpStatus.featureEnabled && !totpStatus.enabled);
  const userId = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin' AND deleted=0;");
  assert.match(userId, /^[1-9][0-9]*$/);
  const totpPredicate = `tenant_id=100000 AND user_id=${userId}`;
  assert.equal(database(`SELECT COUNT(*) FROM sys_user_totp WHERE ${totpPredicate};`), '0');
  try {
    await admin.getByRole('button', { name: '重新验证身份', exact: true }).click();
    await admin.getByLabel('当前账号密码', { exact: true }).waitFor({ state: 'visible' });
    check('原页面挑战尚不要求动态验证码', await admin.getByLabel('六位动态验证码', { exact: true }).count() === 0);
    const setup = successful(await api(admin, '/auth/profile/totp/setup', { method: 'POST', body: { password: credential.password } }), '通过真实HTTP为当前测试账号准备动态验证码');
    assert.match(setup.manualEntryKey, /^[A-Z2-7]{32}$/);
    sensitive.add(setup.manualEntryKey); sensitive.add(setup.otpAuthUri);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bits = [...setup.manualEntryKey].map(character => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('');
    const key = Buffer.from(bits.match(/.{8}/g).map(chunk => Number.parseInt(chunk, 2)));
    const codeAt = step => {
      const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
      const digest = createHmac('sha1', key).update(counter).digest();
      return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
    };
    sensitive.add(database(`SELECT secret_ciphertext FROM sys_user_totp WHERE ${totpPredicate};`));
    if (Date.now() % 30000 > 26000) await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
    const enabled = successful(await api(admin, '/auth/profile/totp/enable', { method: 'POST', body: { password: credential.password,
      code: codeAt(Math.floor(Date.now() / 30000) - 1) } }), '通过真实动态验证码启用本人二次验证');
    check('数据库实际登记本人动态验证码', enabled.enabled && database(`SELECT enabled FROM sys_user_totp WHERE ${totpPredicate};`) === '1');
    await admin.getByLabel('当前账号密码', { exact: true }).fill(credential.password);
    await admin.getByRole('button', { name: '验证身份', exact: true }).click();
    await admin.getByLabel('六位动态验证码', { exact: true }).waitFor({ state: 'visible' });
    check('密码单独验证被拒绝后页面重新读取真实挑战并清空密码', await admin.getByLabel('当前账号密码', { exact: true }).inputValue() === ''
      && redis('EXISTS', proofKey) === '0');
    if (Date.now() % 30000 > 26000) await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
    await admin.getByLabel('当前账号密码', { exact: true }).fill(credential.password);
    await admin.getByLabel('六位动态验证码', { exact: true }).fill(codeAt(Math.floor(Date.now() / 30000)));
    await admin.getByRole('button', { name: '验证身份', exact: true }).click();
    await admin.getByRole('button', { name: '新增配置', exact: true }).waitFor({ state: 'visible' });
    check('真实密码和动态验证码通过后才恢复数据源页面', redis('EXISTS', proofKey) === '1'
      && await admin.getByLabel('六位动态验证码', { exact: true }).count() === 0);
    evidence.totpChallenge = true;
  } finally {
    if (database(`SELECT COUNT(*) FROM sys_user_totp WHERE ${totpPredicate};`) !== '0') {
      successful(await api(admin, '/auth/profile/totp/disable', { method: 'POST', body: { password: credential.password } }), '恢复本次测试账号原动态验证码状态');
    }
    check('真实页面专项结束恢复账号原登记状态', database(`SELECT COUNT(*) FROM sys_user_totp WHERE ${totpPredicate};`) === '0');
    redis('DEL', proofKey);
  }
  console.log('DATA_SOURCE_BROWSER_FOUNDATION: desktop=true; mobile=true; saves_are_real=true; delayed_real_response=true; lost_real_response=true; stale_real_list=true; expired_redis_proof=true; connection_enabled=false; interface_doubles=0');
}
