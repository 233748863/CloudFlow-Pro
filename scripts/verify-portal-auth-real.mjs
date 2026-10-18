import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { verifyPortalInterface } from './verify-portal-auth-ui.mjs';
import { verifyPortalBoundaries } from './verify-portal-auth-boundaries.mjs';
import { verifyPortalKnowledge } from './verify-portal-knowledge-real.mjs';
import { verifyPortalTickets } from './verify-portal-ticket-real.mjs';
import { verifyPortalContracts } from './verify-portal-contract-real.mjs';
import { verifyPortalFinance } from './verify-portal-finance-real.mjs';
import { scanOwnedAuditLogs } from './portal-checks/scan-access-logs.mjs';
import { oauthRuntimeOffsets, scanOauthRuntime } from './oauth2-checks/logs.mjs';

export async function verifyPortalAuthentication({ admin, api, successful, session, database, check, directory, caseTag, state, browser, origin, requests, evidence, disabledOnly, uiOnly, knowledgeOnly, knowledgeEvidence, ticketOnly, ticketEvidence, contractOnly, contractEvidence, financeOnly, financeEvidence, searchOnly, searchEvidence, previewOnly, previewEvidence, accounts }) {
  const sql = value => value == null ? 'NULL' : `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const json = statement => JSON.parse(database(statement));
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const oauthCheck = process.argv.includes('--oauth2-portal-check');
  const oauthAudit = oauthCheck || financeOnly ? json("SELECT JSON_OBJECT('log',CAST(COALESCE((SELECT MAX(log_id) FROM sys_log),0) AS CHAR),'error',CAST(COALESCE((SELECT MAX(error_id) FROM sys_api_error_log),0) AS CHAR),'audit',CAST(COALESCE((SELECT MAX(audit_id) FROM sys_audit_log),0) AS CHAR));") : null;
  const oauthLogStarts = oauthCheck ? await oauthRuntimeOffsets(directory) : null;
  const minute = async () => { console.log('WAIT 门户保留真实分钟限流，等待61秒'); await pause(61000); };
  const waitFor = async (read, accepts, label, milliseconds = 60000) => {
    const deadline = Date.now() + milliseconds;
    do {
      const value = await read();
      if (accepts(value)) return value;
      await pause(300);
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const tenantCode = database('SELECT tenant_code FROM sys_tenant WHERE tenant_id=100000;');
  const foreignCode = database('SELECT tenant_code FROM sys_tenant WHERE tenant_id=100001;');
  const employeeBefore = database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,role_id,menu_id;');
  const grantsBefore = database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const auditBefore = Number(database('SELECT IFNULL(MAX(audit_id),0) FROM sys_audit_log;'));
  const operationLogBefore = Number(database('SELECT IFNULL(MAX(log_id),0) FROM sys_log;'));
  const redis = await ownedGatewayRedis(state);
  const refreshFixtureAuthority = (username, tenantId, roleId) => {
    assert.ok(['g_portal_manager', 'g_portal_ops', 'g_import_tenant'].includes(username));
    assert.ok([100000, 100001].includes(tenantId) && Number.isSafeInteger(roleId) && roleId > 0);
    const userId = Number(database(`SELECT user.user_id FROM sys_user user JOIN sys_user_role role ON role.user_id=user.user_id AND role.tenant_id=user.tenant_id WHERE user.user_name=${sql(username)} AND user.tenant_id=${tenantId} AND role.role_id=${roleId};`));
    assert.ok(Number.isSafeInteger(userId) && userId >= 990000000, 'Only owned fixture authority caches may be refreshed');
    const keys = [`${tenantId}:user_details::${tenantId}:${username}`, `${tenantId}:user_menus::${userId}`, `${tenantId}:menu_details::${roleId}`, `${tenantId}:menu_details::perms:${roleId}`];
    const removed = Number(redis('DEL', ...keys));
    console.log(`H3_PORTAL_FIXTURE_AUTHORITY_REFRESH: user=${username}; exact_keys=${keys.length}; removed=${removed}; rate_keys_modified=0; production_modified=false`);
  };
  const contexts = [];
  const secrets = oauthCheck || financeOnly ? accounts.map(account => account.password).filter(Boolean) : [];
  const rememberToken = token => {
    assert.ok(typeof token === 'string' && /^p_[A-Za-z0-9_-]{43}$/.test(token), '真实界面会话凭据必须有效才能检查日志');
    secrets.push(token);
  };
  const changes = [];
  let channelId;
  let smtpDirectory;
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  contexts.push(anonymous);
  const portalCall = async (route, body, token, extra = {}) => {
    const response = await anonymous.request.fetch(`${origin}/api${route}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(token ? { 'portal-token': token } : {}), ...extra },
      ...(body === undefined ? {} : { data: body }), timeout: 30000, maxRedirects: 0,
    });
    const result = { status: response.status(), body: response.headers()['content-type']?.includes('json') ? await response.json() : undefined, headers: response.headers() };
    if (!result.body) { const bytes = await response.body(); result.size = bytes.length; result.sha256 = createHash('sha256').update(bytes).digest('hex'); }
    requests.push({ path: new URL(route, origin).pathname, method: body === undefined ? 'GET' : 'POST', status: result.status, code: result.body?.code, source: 'portal-https' });
    return result;
  };
  const denied = (response, code, label) => check(`${label} HTTP=${response.status} code=${response.body?.code ?? 'none'}`, response.status === code && (response.body === undefined || response.body?.code === code));
  const manage = async (route, options = {}, page = admin) => {
    let response = await api(page, `/auth/system/portal-user${route}`, options);
    if (response.status === 429 || response.body?.code === 429) { await minute(); response = await api(page, `/auth/system/portal-user${route}`, options); }
    return response;
  };
  const list = async (account, page = admin) => successful(await manage(`/list?${new URLSearchParams({ keyword: account, pageSize: '100' })}`, {}, page), '门户管理列表');
  const row = async account => (await list(account)).rows.find(value => value.loginAccount === account);
  const createBusiness = async (suffix, overrides = {}) => {
    const code = `H3_PORTAL_${caseTag}_${suffix}`;
    successful(await api(admin, '/crm/customer', { method: 'POST', body: { customerCode: code, customerName: code, status: 'ACTIVE', ...overrides } }), '通过CRM创建门户邀请客户');
    const customerId = Number(database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=${sql(code)} AND deleted=0;`));
    assert.ok(Number.isSafeInteger(customerId) && customerId > 0);
    const email = `${suffix}-${caseTag}@example.test`;
    successful(await api(admin, '/crm/contact', { method: 'POST', body: { customerId, contactName: code, email, status: 'ACTIVE' } }), '通过CRM创建可信门户联系人');
    const contactId = Number(database(`SELECT contact_id FROM crm_contact WHERE tenant_id=100000 AND customer_id=${customerId} AND deleted=0;`));
    assert.ok(Number.isSafeInteger(contactId) && contactId > 0);
    return { customerId, contactId, email, name: code, account: `${suffix}.${caseTag}` };
  };
  const createOperator = (username, roleId) => {
    assert.ok(username === 'g_portal_manager' && roleId === 8 || username === 'g_portal_ops' && roleId === 10);
    const existing = database(`SELECT create_by FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)};`);
    assert.ok(!existing || existing === 'isolated-portal-fixture', 'Portal operator fixture name is already owned elsewhere');
    if (!existing) {
      database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
        SELECT 100000,101,${sql(username)},${sql(username)},password,'0',0,'0','isolated-portal-fixture'
        FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';`);
      database(`INSERT INTO sys_user_role (user_id,role_id,tenant_id)
        SELECT user_id,${roleId},100000 FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)};`);
    }
    const id = Number(database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)} AND dept_id=101 AND status='0' AND deleted=0;`));
    assert.ok(Number.isSafeInteger(id) && id >= 990000000);
    check(`${username}仅使用批准角色${roleId}和101部门`, database(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_user_role WHERE tenant_id=100000 AND user_id=${id};`) === String(roleId));
    database(`INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by)
      SELECT 100000,${sql(`H3_PORTAL_${id}`)},${sql(username)},'MALE',101,'REGULAR',${id},'isolated-portal-fixture'
      WHERE NOT EXISTS (SELECT 1 FROM hr_employee WHERE tenant_id=100000 AND user_id=${id} AND deleted=0);`);
    refreshFixtureAuthority(username, 100000, roleId);
    return id;
  };
  const invite = async business => successful(await manage('/invite', { method: 'POST', body: { contactId: business.contactId, loginAccount: business.account } }), '保存真实门户邀请');
  const action = async (account, name) => {
    const current = await row(account);
    assert.ok(current, '门户操作前记录存在');
    return successful(await manage(`/${current.portalUserId}/${name}`, { method: 'POST', body: { version: current.version } }), `真实门户${name}`);
  };
  const snapshot = async () => JSON.parse(await fs.readFile(path.join(smtpDirectory, 'snapshot.json'), 'utf8'));
  const message = async (business, previous = new Set()) => waitFor(async () => {
    const current = await snapshot();
    return current.messages.find(value => value.to?.length === 1 && value.to[0] === business.email && !previous.has(value.messageId));
  }, Boolean, '门户邀请未到达真实TLS邮件服务');
  const messageIds = async () => new Set((await snapshot()).messages.map(value => value.messageId));
  const activation = mail => {
    const token = mail.body.match(/\/portal\/[A-Za-z0-9_-]+\/activate#token=([A-Za-z0-9_-]{43})/)?.[1];
    assert.ok(token, '实际邮件包含一次性激活令牌');
    secrets.push(token);
    return token;
  };
  const password = 'R7!mF2$qN9#vL4' + randomBytes(4).toString('hex');
  const replacement = 'T8!pK3$nB5#xM6' + randomBytes(4).toString('hex');
  secrets.push(password, replacement);
  const login = async (business, suppliedPassword = password) => {
    let response = await portalCall(`/portal/${tenantCode}/login`, { loginAccount: business.account, password: suppliedPassword });
    if (response.status === 429) { await minute(); response = await portalCall(`/portal/${tenantCode}/login`, { loginAccount: business.account, password: suppliedPassword }); }
    const result = successful(response, '门户独立登录');
    assert.ok(/^p_[A-Za-z0-9_-]{43}$/.test(result.portalToken), '门户令牌使用独立随机格式');
    secrets.push(result.portalToken);
    check('登录响应明确8小时绝对和30分钟空闲有效期', result.expiresIn === 28800 && result.idleSeconds === 1800 && result.tokenHeader === 'portal-token');
    return result.portalToken;
  };
  const direct = (serviceName, route, headers = {}, localAddress = '127.0.0.2') => new Promise((resolve, reject) => {
    const service = state.services.find(value => value.name === serviceName);
    const request = http.request({ hostname: '127.0.0.1', port: service.port, path: route, localAddress, headers, timeout: 10000 }, response => {
      let content = '';
      response.setEncoding('utf8');
      response.on('data', value => { content += value; });
      response.on('end', () => { try { resolve({ status: response.statusCode, body: JSON.parse(content), headers: response.headers }); } catch { reject(new Error('隔离HTTP入口未返回JSON')); } });
    });
    request.on('timeout', () => request.destroy(new Error('隔离HTTP入口超时')));
    request.on('error', reject);
    request.end();
  });
  const prepareMail = async () => {
    secrets.push('fixture-password');
    smtpDirectory = await fs.realpath(path.join(directory, 'private/smtp'));
    assert.equal(smtpDirectory, await fs.realpath(state.smtpFixture.directory));
    assert.equal(state.smtpFixture.loopback, true);
    check('隔离库没有任何启用的正式邮件渠道', database("SELECT COUNT(*) FROM sys_message_channel WHERE channel_type='EMAIL' AND status='ENABLED' AND deleted=0;") === '0');
    await fs.writeFile(path.join(smtpDirectory, 'control.json'), JSON.stringify({ mode: 'ACCEPT' }));
    await waitFor(snapshot, value => value.mode === 'ACCEPT', '隔离邮件协议模式未生效');
    const channelCode = `h3_portal_${caseTag}`;
    successful(await api(admin, '/auth/system/message/channel', { method: 'POST', body: { channelType: 'EMAIL', channelCode, channelName: channelCode, provider: 'SMTP', status: 'ENABLED', smtpHost: 'localhost', smtpPort: state.smtpFixture.port, smtpSslFlag: 0, smtpUsername: 'fixture-user', smtpPwd: 'fixture-password', fromAddress: 'sender@example.com', fromName: 'CloudFlow Portal', priority: 1, rateLimitMinute: 1000, dailyLimit: 10000, retryCount: 1, retryIntervalSec: 120 } }), '配置自有TLS邮件协议渠道');
    channelId = Number(database(`SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND channel_code=${sql(channelCode)} AND deleted=0;`));
    if (financeOnly) {
      check('财务门户邮件密码保存为非明文且数据库不含原值', database(`SELECT COUNT(*) FROM sys_message_channel WHERE channel_id=${channelId} AND smtp_pwd_cipher IS NOT NULL AND smtp_pwd_cipher<>'' AND smtp_pwd_cipher<>${sql('fixture-password')} AND LOCATE(${sql('fixture-password')},smtp_pwd_cipher)=0;`) === '1');
      const channel = successful(await api(admin, `/auth/system/message/channel/${channelId}`), '读取脱敏的财务门户邮件渠道');
      check('财务门户邮件接口仅回显密码末四位', /^\*+word$/.test(channel.smtpPwd) && !JSON.stringify(channel).includes('fixture-password') && !('smtpPwdCipher' in channel));
    }
    check('门户真实TLS邮件认证成功', successful(await api(admin, `/auth/system/message/channel/${channelId}/test`, { method: 'POST', body: {} }), '测试隔离TLS邮件').success === true);
    check('入口与邮件均配置后才报告可邀请', successful(await manage('/readiness'), '门户准备状态').available === true);
  };
  try {
    for (const id of [1912, 1913]) check(`业务租户100000门户菜单${id}严格只授予管理员、销售主管和营销运营`, database(`SELECT GROUP_CONCAT(CONCAT(tenant_id,':',role_id) ORDER BY tenant_id,role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=${id};`) === '100000:1,100000:8,100000:10');
    check('客户门户菜单全部在1900—1949内且员工无门户授权', database('SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id IN (1912,1913);') === '0');
    const readiness = successful(await manage('/readiness'), '检查真实门户可用状态');
    const first = await createBusiness('main', financeOnly ? {
      ownerId: Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';")), deptId: 101,
    } : {});
    const pending = await invite(first);
    check('门户邀请绑定保留可信联系人的完整邮箱，公开响应仍只显示隐藏值', database(`SELECT email FROM sys_portal_user WHERE tenant_id=100000 AND portal_user_id=${pending.portalUserId};`) === first.email
      && !JSON.stringify(pending).includes(first.email));
    check('外部邮件未配置时保留PENDING且不生成激活凭据', !readiness.available && pending.status === 'PENDING' && pending.deliveryStatus === 'NOT_SENT' && !pending.activateExpireTime
      && database(`SELECT CONCAT(status,':',IFNULL(activate_token_hash,''),':',IFNULL(password_hash,'')) FROM sys_portal_user WHERE portal_user_id=${pending.portalUserId};`) === 'PENDING::');
    check('未配置邀请没有消息占位、普通列表不暴露明文邮箱或凭据', database(`SELECT COUNT(*) FROM sys_message_record WHERE biz_type='PORTAL_ACTIVATION' AND biz_id=${sql(pending.portalUserId)};`) === '0'
      && !JSON.stringify(pending).includes(first.email) && !/passwordHash|activateTokenHash|portalToken|activationToken/.test(JSON.stringify(pending)));
    if (financeOnly) {
      await prepareMail();
      const beforeMessages = await messageIds(); await action(first.account, 'resend');
      const activationToken = activation(await message(first, beforeMessages));
      successful(await portalCall(`/portal/${tenantCode}/activate`, { activationToken, password }), '真实激活财务门户账号');
      const token = await login(first);
      check('财务客户使用真实独立门户会话', successful(await portalCall('/portal/session', undefined, token), '读取财务门户身份').loginAccount === first.account);
      const employee = await session('g_holiday_employee'); const sales = await session('g_opportunity_sales');
      await verifyPortalFinance({ admin, employee, sales, api, successful, session, database, check, directory, caseTag, state, browser, origin,
        token, portalUserId: pending.portalUserId, portalCall, tenantCode, first, password, secrets, sql, waitFor, minute, denied,
        createBusiness, invite, messageIds, message, activation, login, action, requests, auditBoundaries: oauthAudit, evidence: financeEvidence });
      return;
    }
    if (disabledOnly) {
      for (const [route, body] of [[`/portal/${tenantCode}/status`, undefined], [`/portal/${tenantCode}/login`, { loginAccount: first.account, password }], [`/portal/${tenantCode}/activate`, { activationToken: randomBytes(32).toString('base64url'), password }], ['/portal/session', undefined], ['/portal/logout', {}],
        ['/portal/oa/knowledge/list', undefined], ['/portal/oa/knowledge/1', undefined],
        ['/portal/crm/contract/list', undefined], ['/portal/crm/contract/1', undefined],
        ['/portal/crm/ticket/list', undefined], ['/portal/crm/ticket/1', undefined],
        ['/portal/crm/ticket/submission/00000000-0000-4000-8000-000000000001', undefined],
        ['/portal/crm/ticket', { requestKey: '00000000-0000-4000-8000-000000000001', title: '关闭门户不允许提交', description: '停用边界检查', fileIds: [] }],
        ['/portal/file/upload/00000000-0000-4000-8000-000000000001', undefined],
        ['/portal/file/access', { documentId: 1, versionId: 1, fileId: 1 }], ['/portal/file/download', { downloadTicket: 'kf_' + randomBytes(32).toString('base64url') }],
        ['/portal/file/access', { resourceType: 'TICKET', ticketId: 1, fileId: 1 }], ['/portal/file/download', { downloadTicket: 'tf_' + randomBytes(32).toString('base64url') }]]) {
        denied(await portalCall(route, body), 503, `关闭门户拒绝${route}`);
      }
      const upload = await anonymous.request.post(`${origin}/api/portal/file/upload`, {
        headers: { Origin: origin }, multipart: { requestKey: '00000000-0000-4000-8000-000000000001',
          file: { name: 'disabled-portal.txt', mimeType: 'text/plain', buffer: Buffer.from('disabled-portal') } },
        timeout: 30000, maxRedirects: 0,
      });
      const uploadResult = { status: upload.status(), body: await upload.json() };
      requests.push({ path: '/portal/file/upload', method: 'POST', status: uploadResult.status, code: uploadResult.body?.code, source: 'portal-https' });
      denied(uploadResult, 503, '关闭门户拒绝真实multipart附件上传');
      const deletionId = '900000000000000000';
      assert.equal(database(`SELECT COUNT(*) FROM sys_file WHERE file_id=${deletionId};`), '0', 'Disabled deletion check requires an unused file identifier');
      const removal = await anonymous.request.delete(`${origin}/api/portal/file/${deletionId}`, {
        headers: { Origin: origin }, timeout: 30000, maxRedirects: 0,
      });
      const removalResult = { status: removal.status(), body: await removal.json() };
      requests.push({ path: '/portal/file/' + deletionId, method: 'DELETE', status: removalResult.status, code: removalResult.body?.code, source: 'portal-https' });
      denied(removalResult, 503, '关闭门户拒绝附件删除');
      const page = await anonymous.newPage();
      await page.goto(`${origin}/portal/${tenantCode}/login`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('alert').filter({ hasText: '客户门户入口未启用' }).waitFor();
      check('独立登录页明确停用并禁止提交', await page.getByRole('button', { name: '登录', exact: true }).isDisabled());
      for (const width of [1440, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const loginButton = page.getByRole('button', { name: '登录', exact: true });
        const bounds = await loginButton.boundingBox();
        check(`停用门户${width}像素保留停用提示、禁用提交且页面不横向溢出`, await page.getByRole('alert').filter({ hasText: '客户门户入口未启用' }).isVisible()
          && await loginButton.isDisabled() && bounds && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1
          && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(directory, `h3-portal-disabled-${width}-${caseTag}.png`), fullPage: true });
      }
      check('关闭外部门户不影响内部会话', (await list(first.account)).total === 1);
      evidence.disabled = true;
      evidence.desktop = true;
      evidence.mobile = true;
      return;
    }
    const second = await createBusiness('other');
    const duplicates = await Promise.all(Array.from({ length: 3 }, () => manage('/invite', { method: 'POST', body: { contactId: first.contactId, loginAccount: first.account.toUpperCase() } })));
    check('重复邀请规范化账号并恢复同一条记录', duplicates.every(value => value.status === 200 && value.body?.code === 200 && value.body.data.portalUserId === pending.portalUserId)
      && database(`SELECT COUNT(*) FROM sys_portal_user WHERE tenant_id=100000 AND ref_biz_id=${first.contactId};`) === '1');
    denied(await manage('/invite', { method: 'POST', body: { contactId: second.contactId, loginAccount: first.account } }), 409, '不同联系人不能占用已有账号');
    denied(await manage('/invite', { method: 'POST', body: { contactId: first.contactId, loginAccount: second.account } }), 409, '同一联系人不能产生第二个账号');
    for (const fields of [{ customerId: second.customerId }, { email: second.email }, { tenantId: 100001 }, { status: 'ACTIVE' }]) {
      denied(await manage('/invite', { method: 'POST', body: { contactId: second.contactId, loginAccount: second.account, ...fields } }), 400, '邀请拒绝覆盖服务端客户、邮箱、租户和状态');
    }
    const concurrentBusiness = await createBusiness('concurrent');
    const firstInvitations = await Promise.all(Array.from({ length: 4 }, () => manage('/invite', { method: 'POST', body: { contactId: concurrentBusiness.contactId, loginAccount: concurrentBusiness.account } })));
    check('四个首次邀请并发恢复同一账号且没有重复邮件', firstInvitations.every(value => value.status === 200 && value.body?.code === 200)
      && new Set(firstInvitations.map(value => value.body.data.portalUserId)).size === 1
      && database(`SELECT COUNT(*) FROM sys_portal_user WHERE tenant_id=100000 AND ref_biz_id=${concurrentBusiness.contactId};`) === '1');
    const employee = await session('g_holiday_employee');
    const sales = await session('g_opportunity_sales');
    const managerId = createOperator('g_portal_manager', 8);
    const opsId = createOperator('g_portal_ops', 10);
    const manager = await session('g_portal_manager', 'g_import_admin');
    const ops = await session('g_portal_ops', 'g_import_admin');
    const managerDepartment = Number(database(`SELECT dept_id FROM sys_user WHERE user_id=${managerId};`));
    const otherDepartment = Number(database(`SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_id<>${managerDepartment} AND parent_id=(SELECT parent_id FROM sys_dept WHERE tenant_id=100000 AND dept_id=${managerDepartment}) AND deleted=0 AND status='0' ORDER BY dept_id LIMIT 1;`));
    assert.ok(Number.isSafeInteger(otherDepartment) && otherDepartment > 0);
    check('主管真实ds_type=2，仅本级及下级部门；营销运营ds_type=4，仅本人', database('SELECT GROUP_CONCAT(CONCAT(role_id,\':\',ds_type) ORDER BY role_id) FROM sys_role WHERE tenant_id=100000 AND role_id IN (8,10);') === '8:2,10:4');
    const visible = await createBusiness('visible', { ownerId: managerId, deptId: managerDepartment });
    const hidden = await createBusiness('hidden', { ownerId: opsId, deptId: otherDepartment });
    successful(await manage('/invite', { method: 'POST', body: { contactId: visible.contactId, loginAccount: visible.account } }, manager), '主管可邀请范围内联系人');
    await invite(hidden);
    const choices = successful(await manage(`/contacts?${new URLSearchParams({ keyword: `H3_PORTAL_${caseTag}_`, pageSize: '100' })}`, {}, manager), '销售主管按客户范围搜索联系人');
    check('联系人候选和总数按主管部门范围过滤', choices.rows.some(value => value.contactId === visible.contactId)
      && !choices.rows.some(value => value.contactId === hidden.contactId) && choices.total === choices.rows.length);
    check('主管门户账号列表及分页总数先按客户范围过滤', (await list(visible.account, manager)).total === 1 && (await list(hidden.account, manager)).total === 0);
    denied(await manage('/invite', { method: 'POST', body: { contactId: hidden.contactId, loginAccount: hidden.account } }, manager), 403, '有邀请权限但无客户范围仍拒绝');
    const hiddenUser = await row(hidden.account);
    denied(await manage(`/${hiddenUser.portalUserId}/disable`, { method: 'POST', body: { version: hiddenUser.version } }, manager), 403, '有管理权限不能停用范围外账号');
    const operationsBusiness = await createBusiness('operations', { ownerId: opsId, deptId: managerDepartment });
    const operationsInvitation = successful(await manage('/invite', { method: 'POST', body: { contactId: operationsBusiness.contactId, loginAccount: operationsBusiness.account } }, ops), '营销运营可邀请本人负责客户');
    check('营销运营可管理本人客户且不能列出同部门其他负责人账号', operationsInvitation.contactId === operationsBusiness.contactId
      && (await list(operationsBusiness.account, ops)).total === 1 && (await list(visible.account, ops)).total === 0);
    denied(await manage('/invite', { method: 'POST', body: { contactId: visible.contactId, loginAccount: visible.account } }, ops), 403, '营销运营不能借邀请权限越过本人客户范围');
    for (const [name, actor] of [['员工', employee], ['销售代表', sales]]) {
      denied(await manage('/list', {}, actor), 403, `${name}没有门户管理读取权限`);
      denied(await manage('/invite', { method: 'POST', body: { contactId: second.contactId, loginAccount: second.account } }, actor), 403, `${name}没有门户邀请写权限`);
      denied(await manage(`/${pending.portalUserId}/disable`, { method: 'POST', body: { version: pending.version } }, actor), 403, `${name}没有门户停用权限`);
    }
    const foreignRole = Number(database("SELECT role_id FROM sys_user_role WHERE tenant_id=100001 AND user_id=(SELECT user_id FROM sys_user WHERE tenant_id=100001 AND user_name='g_import_tenant');"));
    assert.ok(Number.isSafeInteger(foreignRole) && foreignRole > 11);
    changes.push(() => refreshFixtureAuthority('g_import_tenant', 100001, foreignRole));
    for (const id of [1912, 1913]) {
      if (database(`SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id=${id};`) === '0') {
        database(`INSERT INTO sys_role_menu(tenant_id,role_id,menu_id) VALUES(100001,${foreignRole},${id});`);
        changes.push(() => database(`DELETE FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id=${id};`));
      }
    }
    refreshFixtureAuthority('g_import_tenant', 100001, foreignRole);
    const foreign = await session('g_import_tenant');
    check('外租户即使拥有门户管理权限也无法列出本租户账号', (await list(first.account, foreign)).total === 0);
    denied(await manage('/invite', { method: 'POST', body: { contactId: first.contactId, loginAccount: first.account } }, foreign), 403, '外租户不能邀请本租户联系人');
    denied(await manage(`/${pending.portalUserId}/disable`, { method: 'POST', body: { version: pending.version } }, foreign), 403, '外租户不能停用本租户账号');
    evidence.permissions = true;
    for (const service of ['gateway', 'auth']) {
      denied(await direct(service, `/portal/${tenantCode}/status`, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '127.0.0.1', Forwarded: 'proto=https;for=127.0.0.1' }), 403, `${service}不信任非代理来源伪造的HTTPS头`);
    }
    denied(await portalCall(`/portal/${tenantCode}/status`, undefined, undefined, { Origin: 'https://foreign.example.test' }), 403, '来源地址不在配置内时拒绝');
    denied(await portalCall(`/auth/portal/${tenantCode}/login`, { loginAccount: first.account, password }), 404, 'auth别名不能绕过门户入口检查');
    denied(await portalCall(`/portal/${tenantCode}/login/`, { loginAccount: first.account, password }), 404, '门户非规范路径拒绝');
    await prepareMail();
    let beforeMessages = await messageIds();
    await action(first.account, 'resend');
    let firstMail = await message(first, beforeMessages);
    const acceptedInvitation = await waitFor(() => row(first.account), value => value?.deliveryStatus === 'SUCCESS', '实际邮件成功记录未回到门户管理查询');
    check('真实发送成功后管理查询准确提示等待收件人激活', acceptedInvitation.pendingReason === '邮件服务已接纳，等待收件人设置密码激活');
    const oldActivation = activation(firstMail);
    check('激活链接使用配置HTTPS地址、片段令牌且只发送所选邮箱', firstMail.body.includes(`${origin}/portal/${tenantCode}/activate#token=`) && !firstMail.cc && !firstMail.bcc);
    beforeMessages = await messageIds();
    const currentPending = await row(first.account);
    const resends = await Promise.all(Array.from({ length: 2 }, () => manage(`/${currentPending.portalUserId}/resend`, { method: 'POST', body: { version: currentPending.version } })));
    check('同版本并发重发只成功一次', resends.filter(value => value.status === 200 && value.body?.code === 200).length === 1 && resends.filter(value => value.status === 409 && value.body?.code === 409).length === 1);
    firstMail = await message(first, beforeMessages);
    const activationToken = activation(firstMail);
    check('重发使旧令牌失效且数据库仅存SHA256', activationToken !== oldActivation && database(`SELECT activate_token_hash FROM sys_portal_user WHERE portal_user_id=${pending.portalUserId};`) === createHash('sha256').update(activationToken).digest('hex'));
    const activationPage = await anonymous.newPage();
    await activationPage.goto(`${origin}/portal/${tenantCode}/activate#token=${activationToken}`, { waitUntil: 'domcontentloaded' });
    await activationPage.getByRole('button', { name: '设置密码并激活', exact: true }).waitFor();
    check('GET展示邀请不消费令牌且页面移除地址令牌', database(`SELECT status FROM sys_portal_user WHERE portal_user_id=${pending.portalUserId};`) === 'PENDING' && !new URL(activationPage.url()).hash);
    denied(await portalCall(`/portal/${tenantCode}/activate`, { activationToken: oldActivation, password }), 400, '旧邀请不能激活');
    denied(await portalCall(`/portal/${foreignCode}/activate`, { activationToken, password }), 400, '跨租户邀请不能激活');
    denied(await portalCall(`/portal/${tenantCode}/activate`, { activationToken, password: 'Password123!' }), 400, '常见弱密码不能激活');
    check('失败激活不消费一次性令牌', database(`SELECT COUNT(*) FROM sys_portal_user WHERE portal_user_id=${pending.portalUserId} AND status='PENDING' AND activate_consumed_time IS NULL;`) === '1');
    const activations = await Promise.all(Array.from({ length: 2 }, () => portalCall(`/portal/${tenantCode}/activate`, { activationToken, password })));
    check('同一激活令牌并发只有一次成功', activations.filter(value => value.status === 200 && value.body?.code === 200).length === 1 && activations.filter(value => value.status === 400 && value.body?.code === 400).length === 1);
    check('激活使用BCrypt成本12并留下消费时间', database(`SELECT CONCAT(LEFT(password_hash,7),':',status,':',activate_consumed_time IS NOT NULL) FROM sys_portal_user WHERE portal_user_id=${pending.portalUserId};`) === '$2a$12$:ACTIVE:1');
    denied(await portalCall(`/portal/${tenantCode}/register`, { activationToken, password }), 400, '注册别名不能再次消费已激活邀请');
    evidence.invitation = true;
    evidence.concurrency = true;
    evidence.smtp = true;
    let token = await login(first);
    const profile = successful(await portalCall('/portal/session', undefined, token), '保护门户会话');
    check('门户会话仅返回账号、客户及联系人白名单', Object.keys(profile).sort().join(',') === 'contactName,customerName,loginAccount' && profile.loginAccount === first.account);
    const protectedResponse = await portalCall('/portal/session', undefined, token, { 'X-Tenant-Id': '100001', 'X-User-Id': '1', Authorization: 'Bearer forged', Cookie: 'cloudflow_token=forged' });
    check('伪造内部身份及租户头不改变门户归属', successful(protectedResponse, '门户独立可信身份').loginAccount === first.account && protectedResponse.headers['cache-control']?.includes('no-store') && !protectedResponse.headers['set-cookie']);
    const internalToken = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    denied(await portalCall('/portal/session', undefined, internalToken?.replace(/^Bearer /, '')), 401, '内部令牌不能用于门户');
    denied(await portalCall('/portal/session', undefined, undefined, { Cookie: `portal-token=${token}` }), 401, '门户不从Cookie读取令牌');
    denied(await portalCall(`/portal/session?portal-token=${encodeURIComponent(token)}`), 401, '门户不从查询参数读取令牌');
    const internalRejected = await anonymous.request.get(`${origin}/api/auth/system/portal-user/list`, { headers: { Authorization: `Bearer ${token}` } });
    check('门户令牌不能获得内部管理权限', internalRejected.status() === 401);
    check('门户失败不注销同浏览器内部账号', (await list(first.account)).total === 1);
    const otherToken = await login(first);
    successful(await portalCall('/portal/logout', {}, token), '注销当前门户会话');
    denied(await portalCall('/portal/session', undefined, token), 401, '注销后的门户令牌失效');
    check('门户退出只注销当前令牌且不影响内部账号', successful(await portalCall('/portal/session', undefined, otherToken), '保留其他门户会话').loginAccount === first.account && (await list(first.account)).total === 1);
    token = otherToken;
    evidence.domainIsolation = true;
    if (process.argv.includes('--oauth2-portal-check')) {
      const { verifyOauthPortalIsolation } = await import('./oauth2-checks/portal.mjs');
      await verifyOauthPortalIsolation({ admin, api, successful, session, database, check, caseTag, state, accounts, portalCall,
        token, portalUserId: pending.portalUserId, first, sql, secrets, evidence, requests });
      return;
    }
    if (previewOnly) {
      const { verifyPreviewPortal } = await import('./verify-file-preview-portal.mjs');
      await verifyPreviewPortal({ api, successful, session, database, check, directory, caseTag, state, first,
        portalUserId: pending.portalUserId, portalCall, token, sql, secrets, requests, evidence: previewEvidence });
      return;
    }
    if (searchOnly) {
      const { verifyBusinessSearchPortal } = await import('./verify-business-search-portal.mjs');
      await verifyBusinessSearchPortal({ api, successful, session, database, check, directory, caseTag, state, first,
        portalUserId: pending.portalUserId, portalCall, token, direct, sql, secrets, waitFor, evidence: searchEvidence });
      return;
    }
    await minute();
    if (contractOnly) {
      await verifyPortalContracts({ admin, employee, sales, api, successful, session, database, check, directory, caseTag, state, browser, origin,
        token, portalUserId: pending.portalUserId, portalCall, tenantCode, first, password, secrets, sql, waitFor, minute, denied,
        createBusiness, invite, messageIds, message, activation, login, action, requests, evidence: contractEvidence });
      return;
    }
    if (ticketOnly) {
      await verifyPortalTickets({ admin, employee, sales, api, successful, session, database, check, directory, caseTag, state, browser, origin,
        token, portalUserId: pending.portalUserId, portalCall, tenantCode, first, password, secrets, sql, waitFor, minute, denied,
        createBusiness, invite, messageIds, message, activation, login, action, requests, evidence: ticketEvidence });
      return;
    }
    if (knowledgeOnly) {
      await verifyPortalKnowledge({ admin, employee, sales, api, successful, session, database, check, directory, caseTag, state, browser, origin,
        token, portalUserId: pending.portalUserId, portalCall, tenantCode, first, password, secrets, sql, waitFor, minute, denied,
        createBusiness, invite, messageIds, message, activation, login, action, evidence: knowledgeEvidence });
      return;
    }
    await verifyPortalInterface({ admin, employee, browser, origin, tenantCode, createBusiness, messageIds, message, activation, password, check, database, sql, waitFor, directory, caseTag, evidence, action, rememberToken });
    if (uiOnly) return;
    await action(first.account, 'disable');
    denied(await portalCall('/portal/session', undefined, token), 401, '停用撤销已登录的门户会话');
    beforeMessages = await messageIds();
    await action(first.account, 'reset-password');
    const resetToken = activation(await message(first, beforeMessages));
    check('重设密码转回PENDING并清除原密码', database(`SELECT CONCAT(status,':',password_hash IS NULL) FROM sys_portal_user WHERE portal_user_id=${pending.portalUserId};`) === 'PENDING:1');
    await minute();
    successful(await portalCall(`/portal/${tenantCode}/activate`, { activationToken: resetToken, password: replacement }), '重设后新邀请激活');
    denied(await portalCall(`/portal/${tenantCode}/login`, { loginAccount: first.account, password }), 401, '重设后旧密码不能登录');
    token = await login(first, replacement);
    const contactBefore = json(`SELECT JSON_OBJECT('status',status,'version',version) FROM crm_contact WHERE tenant_id=100000 AND contact_id=${first.contactId};`);
    const updateContact = async status => successful(await api(admin, '/crm/contact', { method: 'PUT', body: { contactId: first.contactId, customerId: first.customerId, contactName: `H3_PORTAL_${caseTag}_main`, email: first.email, status, version: Number(database(`SELECT version FROM crm_contact WHERE contact_id=${first.contactId};`)) } }), '真实更新联系人状态');
    await updateContact('INACTIVE');
    await updateContact(contactBefore.status);
    denied(await portalCall('/portal/session', undefined, token), 401, '联系人停用再启用后旧会话仍失效');
    token = await login(first, replacement);
    check('联系人版本重新核验后可重新登录', successful(await portalCall('/portal/session', undefined, token), '新会话读取').loginAccount === first.account);
    await minute();
    const failureAttempts = [];
    const failureState = () => json(`SELECT JSON_OBJECT('databaseNow',CAST(NOW(6) AS CHAR),'status',status,
      'failCount',fail_count,'sessionVersion',session_version,'version',version,'updatedAt',update_time,
      'lockedUntil',locked_until,'lockSecondsAfterUpdate',TIMESTAMPDIFF(SECOND,update_time,locked_until))
      FROM sys_portal_user WHERE tenant_id=100000 AND portal_user_id=${pending.portalUserId};`);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const before = failureState();
      denied(await portalCall(`/portal/${tenantCode}/login`, { loginAccount: first.account, password }), 401, `第${attempt}次错误密码统一返回401`);
      const after = failureState();
      failureAttempts.push({ attempt, before, after });
      await fs.writeFile(path.join(directory, `h3-portal-lock-timing-${caseTag}.json`), JSON.stringify(failureAttempts, null, 2));
      check(`第${attempt}次登录失败计数实际提交`, before.failCount === attempt - 1 && after.failCount === attempt);
      check(`第${attempt}次失败状态和会话撤销版本准确变化`, before.status === 'ACTIVE' && before.lockedUntil === null
        && after.status === (attempt === 5 ? 'LOCKED' : 'ACTIVE') && after.version === before.version + 1
        && after.sessionVersion === before.sessionVersion + (attempt === 5 ? 1 : 0)
        && (attempt === 5 || after.lockedUntil === null));
    }
    const fifthFailure = failureAttempts[4];
    // Compare the 900-second deadline with the entire request window at the actual DATETIME(0) storage precision.
    // NOW() alone discards fractional seconds and cannot reliably measure the remaining lock duration.
    const lockWindow = json(`SELECT JSON_OBJECT('durationSeconds',900,'storagePrecision',column_info.datetime_precision,
      'earliestDeadline',CAST(DATE_ADD(${sql(fifthFailure.before.databaseNow)},INTERVAL 900 SECOND) AS DATETIME(0)),
      'latestDeadline',CAST(DATE_ADD(${sql(fifthFailure.after.databaseNow)},INTERVAL 900 SECOND) AS DATETIME(0)),
      'matches',portal.locked_until BETWEEN CAST(DATE_ADD(${sql(fifthFailure.before.databaseNow)},INTERVAL 900 SECOND) AS DATETIME(0))
        AND CAST(DATE_ADD(${sql(fifthFailure.after.databaseNow)},INTERVAL 900 SECOND) AS DATETIME(0)))
      FROM sys_portal_user portal JOIN information_schema.columns column_info
        ON column_info.table_schema=DATABASE() AND column_info.table_name='sys_portal_user' AND column_info.column_name='locked_until'
      WHERE portal.tenant_id=100000 AND portal.portal_user_id=${pending.portalUserId};`);
    await fs.writeFile(path.join(directory, `h3-portal-lock-timing-${caseTag}.json`), JSON.stringify({ attempts: failureAttempts, lockWindow }, null, 2));
    check('第五次失败按请求前后高精度时间及数据库秒精度持久锁定900秒', lockWindow.storagePrecision === 0 && lockWindow.matches === true);
    denied(await portalCall('/portal/session', undefined, token), 401, '失败锁定同步撤销旧会话');
    denied(await portalCall(`/portal/${tenantCode}/login`, { loginAccount: first.account, password: replacement }), 429, '同账号第六次请求触发每分钟五次限制');
    await minute();
    denied(await portalCall(`/portal/${tenantCode}/login`, { loginAccount: first.account, password: replacement }), 401, '分钟限流恢复后锁定仍然有效');
    database(`UPDATE sys_portal_user SET locked_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE tenant_id=100000 AND portal_user_id=${pending.portalUserId} AND status='LOCKED';`);
    token = await login(first, replacement);
    check('锁定截止边界输入后正确登录重置连续失败数', database(`SELECT CONCAT(status,':',fail_count,':',locked_until IS NULL) FROM sys_portal_user WHERE portal_user_id=${pending.portalUserId};`) === 'ACTIVE:0:1');
    await minute();
    for (let attempt = 0; attempt < 10; attempt++) denied(await portalCall(`/portal/${tenantCode}/login`, { loginAccount: `absent.${caseTag}.${attempt}`, password }), 401, '不存在账号与错误密码保持同一响应');
    denied(await portalCall(`/portal/${tenantCode}/login`, { loginAccount: `absent.${caseTag}.extra`, password }), 429, '同IP第十一次登录请求受限');
    await minute();
    for (let attempt = 0; attempt < 60; attempt++) successful(await portalCall('/portal/session', undefined, token), '门户每用户分钟限流边界内');
    denied(await portalCall('/portal/session', undefined, token), 429, '同门户用户第六十一次访问受限');
    check('真实Redis门户限流使用独立命名空间', Number(redis('EXISTS', `cloudflow:portal:rate:user:100000:${pending.portalUserId}`)) === 1);
    const counterAccount = `counter.${caseTag}`;
    const counterKey = `cloudflow:portal:rate:account:${createHash('sha256').update(tenantCode.toLowerCase() + '\n' + counterAccount).digest('hex')}`;
    assert.equal(redis('EXISTS', counterKey), '0', 'Only a new owned portal rate key may be modified');
    try {
      redis('SET', counterKey, 'invalid-owned-counter', 'EX', 60);
      denied(await portalCall(`/portal/${tenantCode}/login`, { loginAccount: counterAccount, password }), 503, '真实Redis限流脚本错误时停止认证');
    } finally { redis('DEL', counterKey); }
    evidence.rateLimits = true;
    evidence.authentication = true;
    await minute();
    await verifyPortalBoundaries({ createBusiness, invite, row, action, message, messageIds, activation, portalCall, login,
      successful, denied, api, admin, database, check, sql, waitFor, snapshot, smtpDirectory, tenantCode, password, caseTag, evidence });
    const encrypted = database("SELECT delivery.payload_encrypted FROM sys_message_delivery delivery JOIN sys_message_record record ON record.record_id=delivery.record_id WHERE record.biz_type='PORTAL_ACTIVATION';");
    const ordinary = database("SELECT CONCAT_WS('|',title,content,link_url,error_msg) FROM sys_message_record WHERE biz_type='PORTAL_ACTIVATION';");
    const queued = database("SELECT payload_json FROM outbox_event WHERE event_type='MESSAGE_SEND' AND event_id IN (SELECT outbox_event_id FROM sys_message_record WHERE biz_type='PORTAL_ACTIVATION');");
    check('邀请正文仅保留在加密载荷，普通记录不含密码或令牌', encrypted.length > 100 && secrets.every(value => !encrypted.includes(value) && !ordinary.includes(value)));
    check('邀请发送事件加密保存且不泄漏密码或令牌', queued.includes('MESSAGE_ENCRYPTED_V1:') && secrets.every(value => !queued.includes(value)));
    const logFiles = [];
    const collectLogs = async parent => {
      for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || ['private', 'mysql-data', 'profile'].includes(entry.name)) continue;
        const filename = path.join(parent, entry.name);
        if (entry.isDirectory()) await collectLogs(filename);
        else if (entry.name.endsWith('.log')) logFiles.push(filename);
      }
    };
    await collectLogs(directory);
    let scannedBytes = 0;
    let leaks = 0;
    const uniqueSecrets = [...new Set(secrets)];
    for (const filename of logFiles) {
      const content = await fs.readFile(filename, 'utf8');
      scannedBytes += Buffer.byteLength(content);
      for (const value of uniqueSecrets) if (content.includes(value)) leaks++;
    }
    check('全部隔离运行日志未泄漏本次密码、激活及含丢响应的电脑手机会话令牌', logFiles.length > 0 && leaks === 0);
    const auditRows = database(`SELECT CONCAT_WS('|',before_val,after_val,before_json,after_json,diff_json) FROM sys_audit_log WHERE audit_id>${auditBefore};`);
    const operationRows = database(`SELECT CONCAT_WS('|',params,exception,request_uri) FROM sys_log WHERE log_id>${operationLogBefore};`);
    check('本次门户数据库审计与操作记录没有明文密码或令牌', uniqueSecrets.every(value => !auditRows.includes(value) && !operationRows.includes(value)));
    console.log(`H3_PORTAL_LOG_SCAN: files=${logFiles.length}; bytes=${scannedBytes}; sensitive_values=${uniqueSecrets.length}; leaks=${leaks}; ui_tokens_included=true; database_audit_checked=true; production_modified=false`);
    const audited = await waitFor(() => database(`SELECT COUNT(*) FROM sys_log WHERE log_id>${operationLogBefore}
      AND create_by=${sql('portal:' + pending.portalUserId)} AND request_uri='/portal/session'
      AND service_name='cloudflow-auth' AND result_code=200;`), value => Number(value) > 0, '本次门户访问审计未落库');
    check('本次新门户账号读取具有独立命名空间的真实访问审计', Number(audited) > 0);
    console.log(`H3_PORTAL_PROTOCOL_EVIDENCE: https=true; smtp_tls=true; provider=owned_loopback_fixture; lock_expiry_input=true; api_doubles=0; ui_requested=${uiOnly}; production_modified=false`);
  } finally {
    try {
      for (const restore of changes.reverse()) restore();
      if (channelId) successful(await api(admin, `/auth/system/message/channel/${channelId}`, { method: 'DELETE' }), '清理本次隔离邮件渠道');
      check('门户测试没有改变EMPLOYEE任何授权', employeeBefore === database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,role_id,menu_id;'));
      check('门户测试恢复全部租户原有角色菜单授权', grantsBefore === database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;'));
      if (oauthCheck) evidence.oauth2Cleanup = evidence.oauth2GrantsRestored === true;
    } finally {
      for (const context of contexts) await context.close();
      if (state.verification?.mode === 'H3_CORE_INDEPENDENT') {
        const secretFile = path.join(directory, 'private/h3-core-secrets.json');
        const registered = JSON.parse(await fs.readFile(secretFile, 'utf8'));
        const values = [...new Set([...registered, ...secrets])].filter(value => typeof value === 'string' && value.length > 0);
        await fs.writeFile(secretFile, JSON.stringify(values));
      }
      if (oauthCheck) {
        await pause(1500);
        const values = [...new Set(secrets)].filter(value => typeof value === 'string' && value.length > 5);
        const audit = await scanOwnedAuditLogs(state, values, oauthAudit);
        const runtime = await scanOauthRuntime(directory, oauthLogStarts, values);
        const leaks = audit.leaks + runtime.leaks;
        console.log(`H5_OAUTH2_PORTAL_SECRET_SCAN: values=${values.length}; bytes=${audit.bytes + runtime.bytes}; leaks=${leaks}; includes_activation_and_login=true; database_audits=true; discovered_log_files=${runtime.discoveredFiles}; files_with_new_bytes=${runtime.files}; historical_logs_recertified=false`);
        check('本次客户激活、内部登录及同编号OAuth凭据未泄漏到运行与审计日志', leaks === 0);
        evidence.oauth2Secrets = true;
      }
    }
  }
}
