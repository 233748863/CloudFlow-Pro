import { inspectOauthPage, secretsStayTransient, holdOauthResponse, oauthUiResponse } from './interface-tools.mjs';

export async function verifyOauthClientInterface(context, frame) {
  const { admin, origin, check, caseTag, clients, sensitive, successful, database, literal, budget, entry, accounts, evidence } = context;
  await admin.setViewportSize({ width: frame.width, height: frame.height });
  await admin.goto(`${origin}/system/oauth2-clients`, { waitUntil: 'domcontentloaded' });
  await admin.getByText(/再次验证平台身份|平台身份已验证/).first().waitFor();
  if (await admin.getByRole('button', { name: '重新验证身份', exact: true }).isVisible()) await admin.getByRole('button', { name: '重新验证身份', exact: true }).click();
  await admin.getByLabel('当前账号密码', { exact: true }).fill(accounts.find(account => account.username === 'g_import_admin').password);
  successful(await oauthUiResponse(admin, '/auth/system/platform/access/reauthenticate', 'POST', () => admin.getByRole('button', { name: '验证身份', exact: true }).click()), '页面真实平台再次验证');
  await admin.getByRole('button', { name: '新增应用', exact: true }).waitFor();
  await inspectOauthPage(context, admin, `${frame.name}-clients-light`);
  await admin.getByRole('button', { name: '新增应用', exact: true }).click();
  const dialog = admin.getByRole('dialog', { name: '新增第三方应用', exact: true });
  const name = `oauth-${caseTag}-ui-${frame.name}`;
  await dialog.getByLabel('应用名称', { exact: true }).fill(name);
  await dialog.getByLabel('用途说明', { exact: true }).fill('真实页面授权验收，保留非敏感草稿');
  await dialog.getByLabel('精确回调地址（每行一条）', { exact: true }).fill(`${origin}/oauth2-test-return`);
  await dialog.getByRole('checkbox', { name: '当前企业基本信息', exact: true }).check();
  await inspectOauthPage(context, admin, `${frame.name}-client-form`);
  let client;
  const saving = await holdOauthResponse(admin, entry, 'POST', result => {
    const saved = successful(result, '页面真实创建客户端');
    client = { ...saved.client, secret: saved.clientSecret };
    clients.push(client);
    sensitive.add(client.secret);
  });
  try {
    await budget('client-manage', 18);
    await dialog.getByRole('button', { name: '保存应用', exact: true }).click();
    await saving.arrived();
    check(`${frame.name}保存过程中阻止重复提交及关闭`, await dialog.getByRole('button', { name: '保存中…', exact: true }).isDisabled()
      && await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled());
    await admin.keyboard.press('Escape');
    check(`${frame.name}保存中按Escape仍保留表单`, await dialog.isVisible() && saving.count() === 1);
    saving.release();
    const secretDialog = admin.getByRole('dialog', { name: '客户端密钥仅展示一次', exact: true });
    await secretDialog.waitFor();
    const visible = await secretDialog.getByLabel('本次客户端密钥', { exact: true }).inputValue();
    check(`${frame.name}页面收到完整一次性密钥且应用默认停用`, /^[A-Za-z0-9_-]{43}$/.test(visible) && visible === client.secret && client.status === 'DISABLED');
    await secretsStayTransient(context, admin, [client.secret], `${frame.name}一次性密钥`);
    await inspectOauthPage(context, admin, `${frame.name}-client-secret-masked`);
    await secretDialog.getByRole('button', { name: '已安全保存', exact: true }).click();
  } finally { await saving.close(); }
  const card = admin.locator('article').filter({ has: admin.getByRole('heading', { name, exact: true }) });
  await card.getByRole('button', { name: '编辑应用', exact: true }).click();
  const editing = admin.getByRole('dialog', { name: '编辑第三方应用', exact: true });
  check(`${frame.name}重新编辑不回显历史客户端密钥`, !((await editing.textContent()) ?? '').includes(client.secret)
    && await admin.getByLabel('本次客户端密钥', { exact: true }).count() === 0);
  check(`${frame.name}编辑标签保持准确且读取已保存的说明与回调`, await editing.getByLabel('用途说明', { exact: true }).inputValue() === client.description
    && await editing.getByLabel('精确回调地址（每行一条）', { exact: true }).inputValue() === client.redirectUris[0]);
  await editing.getByLabel('精确回调地址（每行一条）', { exact: true }).fill('http://unapproved.invalid/callback');
  await budget('client-manage', 18);
  const rejected = await oauthUiResponse(admin, entry, 'PUT', () => editing.getByRole('button', { name: '保存应用', exact: true }).click());
  await editing.getByRole('alert').waitFor();
  check(`${frame.name}真实校验失败保留可修改的草稿`, rejected.status === 400 && await editing.getByLabel('应用名称', { exact: true }).inputValue() === name
    && await editing.getByLabel('精确回调地址（每行一条）', { exact: true }).inputValue() === 'http://unapproved.invalid/callback'
    && await editing.getByRole('button', { name: '保存应用', exact: true }).isEnabled());
  await admin.evaluate(() => document.documentElement.classList.add('dark'));
  await inspectOauthPage(context, admin, `${frame.name}-client-validation-dark`);
  await editing.getByLabel('精确回调地址（每行一条）', { exact: true }).fill(client.redirectUris[0]);
  await editing.getByRole('button', { name: '应用状态', exact: true }).click();
  await admin.getByRole('option', { name: '启用', exact: true }).click();
  await budget('client-manage', 18);
  const enabled = successful(await oauthUiResponse(admin, entry, 'PUT', () => editing.getByRole('button', { name: '保存应用', exact: true }).click()), '页面真实启用客户端');
  Object.assign(client, enabled);
  await editing.waitFor({ state: 'hidden' });
  check(`${frame.name}页面启用确实保存到数据库`, database(`SELECT status FROM sys_oauth2_client WHERE client_id=${client.clientId} AND client_name=${literal(name)};`) === 'ACTIVE');
  await card.getByText(`企业 ${client.tenantId} · 机密客户端 · v${client.version}`, { exact: true }).waitFor();
  await card.getByRole('button', { name: '编辑应用', exact: true }).click();
  check(`${frame.name}再次编辑标签未混入说明或回调内容`, await editing.getByLabel('用途说明', { exact: true }).inputValue() === client.description
    && await editing.getByLabel('精确回调地址（每行一条）', { exact: true }).inputValue() === client.redirectUris[0]);
  await editing.getByLabel('用途说明', { exact: true }).fill('结果丢失后保留本次非敏感说明');
  await editing.getByRole('checkbox', { name: '保存时生成并替换客户端密钥，仅展示一次', exact: true }).check();
  const previousVersion = client.version;
  const lost = await holdOauthResponse(admin, entry, 'PUT', result => {
    Object.assign(client, successful(result, '丢响应前服务端真实提交密钥更换'));
    client.secret = result.request.clientSecret;
    sensitive.add(client.secret);
  }, true);
  try {
    await budget('client-manage', 18);
    await editing.getByRole('button', { name: '保存应用', exact: true }).click();
    await lost.arrived();
    lost.release();
    await editing.getByText('非敏感输入已保留；请关闭并刷新核对实际版本，本次不会重复提交。', { exact: true }).waitFor();
    check(`${frame.name}真实保存丢响应后不重复更换密钥`, lost.count() === 1 && Number(client.version) === Number(previousVersion) + 1
      && await editing.getByRole('button', { name: '保存应用', exact: true }).isDisabled()
      && !(await editing.getByRole('checkbox', { name: '保存时生成并替换客户端密钥，仅展示一次', exact: true }).isChecked()));
    check(`${frame.name}不确定结果保留非敏感说明且不展示新密钥`, await editing.getByLabel('用途说明', { exact: true }).inputValue() === '结果丢失后保留本次非敏感说明'
      && await admin.getByLabel('本次客户端密钥', { exact: true }).count() === 0);
    await secretsStayTransient(context, admin, [client.secret], `${frame.name}丢响应密钥`);
    await inspectOauthPage(context, admin, `${frame.name}-client-uncertain-dark`);
    await editing.getByRole('button', { name: '取消', exact: true }).click();
  } finally { await lost.close(); }
  await admin.getByRole('button', { name: '刷新', exact: true }).click();
  await card.getByText(`企业 ${client.tenantId} · 机密客户端 · v${client.version}`, { exact: true }).waitFor();
  await admin.evaluate(() => document.documentElement.classList.remove('dark'));
  evidence.uiDrafts = true;
  return client;
}
