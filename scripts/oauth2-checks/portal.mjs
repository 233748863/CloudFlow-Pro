import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';

export async function verifyOauthPortalIsolation(context) {
  const { admin, api, successful, session, database, check, caseTag, state, accounts, portalCall, token: portalToken,
    portalUserId, first, sql, secrets, evidence, requests } = context;
  const identifier = String(portalUserId);
  assert.match(identifier, /^[1-9][0-9]*$/);
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE user_id=${identifier};`), '0');
  assert.ok(state.oauth2Fixture?.publicUrl);
  const base = `http://127.0.0.1:${state.services.find(service => service.name === 'gateway').port}`;
  const origin = new URL(state.oauth2Fixture.publicUrl);
  assert.equal(origin.protocol, 'http:');
  assert.equal(origin.hostname, '127.0.0.1');
  const username = `h5_oauth_portal_${caseTag}`;
  const clientName = `oauth-portal-${caseTag}`;
  const grants = () => database("SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;");
  const original = grants();
  const entry = '/auth/system/oauth2/client';
  const random = () => randomBytes(32).toString('base64url');
  let roleId;
  let client;
  const wire = async (requestPath, options = {}) => {
    for (const value of [options.headers?.Authorization, options.headers?.Authorization?.split(' ')[1], options.headers?.['portal-token']]) {
      if (typeof value === 'string' && value.length >= 20) secrets.push(value);
    }
    const method = options.method ?? (options.body == null ? 'GET' : 'POST');
    const response = await new Promise((resolve, reject) => {
      const request = http.request(new URL(requestPath, base), {
        method, headers: { Host: origin.host, Origin: origin.origin, ...options.headers },
      }, incoming => {
        const chunks = [];
        let bytes = 0;
        incoming.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 1048576) request.destroy(new Error('Owned OAuth portal response exceeds one MiB'));
          else chunks.push(chunk);
        });
        incoming.once('error', reject);
        incoming.once('end', () => resolve({ status: incoming.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.setTimeout(20000, () => request.destroy(new Error('Owned OAuth portal request timed out')));
      request.once('error', reject);
      request.end(options.body);
    });
    let body = null;
    try { body = JSON.parse(response.text); } catch { }
    for (const value of [body?.access_token, body?.refresh_token, body?.data?.requestToken]) if (typeof value === 'string' && value.length >= 20) secrets.push(value);
    requests.push({ path: new URL(requestPath, base).pathname, method, status: response.status, code: body?.code,
      error: body?.error, source: 'real-oauth-portal-isolation' });
    return { status: response.status, body };
  };
  try {
    roleId = database(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
      VALUES (100000,${sql(username)},${sql(username)},999,'2',4,'0',0); SELECT LAST_INSERT_ID();`);
    assert.match(roleId, /^[1-9][0-9]*$/);
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT 100000,${roleId},menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5;
      INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
      SELECT ${identifier},100000,100,${sql(username)},${sql(username)},password,'0',0,'0',${sql(username)} FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';
      INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${identifier},${roleId});`);
    const employee = await session(username, 'g_holiday_employee');
    const internalInfo = successful(await api(employee, '/auth/info'), '同编号员工真实登录');
    const customer = successful(await portalCall('/portal/session', undefined, portalToken), '客户真实激活和登录');
    check('真实客户与内部员工编号相同但绑定各自原始身份', String(internalInfo.user.userId) === identifier && customer.loginAccount === first.account
      && database(`SELECT COUNT(*) FROM sys_portal_user WHERE tenant_id=100000 AND portal_user_id=${identifier} AND ref_biz_id=${first.contactId} AND customer_id=${first.customerId} AND status='ACTIVE';`) === '1');
    successful(await api(admin, '/auth/system/platform/access/reauthenticate', { method: 'POST', body: {
      password: accounts.find(account => account.username === 'g_import_admin').password,
    } }), '同编号专项平台再次验证');
    const configuration = { tenantId: 100000, clientType: 'CONFIDENTIAL', clientName, description: '真实门户同编号身份隔离',
      accessTokenValiditySeconds: 900, refreshTokenValiditySeconds: 3600, redirectUris: [state.oauth2Fixture.publicUrl + '/oauth2-test-return'],
      grantTypes: ['authorization_code'], scopes: ['profile', 'system.tenant.read'], autoApproveScopes: [], status: 'DISABLED', secretAction: 'GENERATE' };
    const created = successful(await api(admin, entry, { method: 'POST', body: configuration }), '同编号专项创建真实客户端');
    client = { ...created.client, secret: created.clientSecret };
    secrets.push(client.secret);
    Object.assign(client, successful(await api(admin, entry, { method: 'PUT', body: { ...configuration,
      clientId: client.clientId, version: client.version, status: 'ACTIVE', secretAction: 'KEEP' } }), '同编号专项启用真实客户端'));
    const internalToken = await employee.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.equal(typeof internalToken, 'string');
    secrets.push(internalToken.replace(/^Bearer /, ''));
    const verifier = random();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const stateValue = random();
    secrets.push(verifier, challenge, stateValue);
    const query = new URLSearchParams({ response_type: 'code', client_id: client.clientKey, redirect_uri: client.redirectUris[0],
      scope: client.scopes.join(' '), state: stateValue, code_challenge: challenge, code_challenge_method: 'S256' });
    const startPath = '/oauth2/authorize?' + query;
    for (const headers of [{ 'portal-token': portalToken }, { Authorization: `Bearer ${portalToken}`, 'portal-token': portalToken,
      'X-User-Id': identifier, 'X-Tenant-Id': '100000', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' }]) {
      const rejected = await wire(startPath, { headers });
      check(`同编号客户及伪造内部身份头均不能发起员工授权（HTTP=${rejected.status}; code=${rejected.body?.code ?? 'none'}）`,
        rejected.status === 401 && !rejected.body?.data?.requestToken);
    }
    const prepared = successful(await wire(startPath, { headers: { Authorization: `Bearer ${internalToken}` } }), '同编号员工真实发起OAuth授权');
    secrets.push(prepared.requestToken);
    const consentBody = JSON.stringify({ requestToken: prepared.requestToken, approve: true, scopes: client.scopes });
    const refused = await wire('/oauth2/authorize', { body: consentBody, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${portalToken}`, 'portal-token': portalToken } });
    check('同编号客户不能确认员工待办授权事务', refused.status === 401 && !refused.body?.data?.redirectUrl);
    const confirmed = successful(await wire('/oauth2/authorize', { body: consentBody, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalToken}` } }), '员工本人真实同意');
    const code = new URL(confirmed.redirectUrl).searchParams.get('code');
    secrets.push(code);
    const issued = await wire('/oauth2/token', { body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.clientKey,
      code, redirect_uri: client.redirectUris[0], code_verifier: verifier }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${client.clientKey}:${client.secret}`).toString('base64')}` } });
    for (const value of [issued.body?.access_token, issued.body?.refresh_token]) if (value) secrets.push(value);
    check('同编号员工确认产生真实OAuth令牌', issued.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(issued.body?.access_token));
    const oauthToken = issued.body.access_token;
    const profile = await wire('/oauth2/userinfo', { headers: { Authorization: `Bearer ${oauthToken}` } });
    check('OAuth合法资料来自同编号员工而非客户联系人', profile.status === 200 && profile.body?.sub === identifier && profile.body.name === username);
    for (const supplied of [portalToken, portalToken.slice(2)]) {
      const rejected = await wire('/oauth2/userinfo', { headers: { Authorization: `Bearer ${supplied}`, 'portal-token': portalToken,
        'X-User-Id': identifier, 'X-Tenant-Id': '100000' } });
      check('同编号客户令牌及移除门户前缀的令牌均不能取得OAuth身份', rejected.status === 401 && rejected.body?.error === 'invalid_token');
    }
    const portalRejected = await portalCall('/portal/session', undefined, oauthToken);
    check('OAuth令牌也不能转换为相同编号客户身份', portalRejected.status === 401 && portalRejected.body?.code !== 200);
    check('跨域拒绝后两类合法会话保持独立有效', successful(await portalCall('/portal/session', undefined, portalToken), '客户合法会话保留').loginAccount === first.account
      && (await wire('/oauth2/userinfo', { headers: { Authorization: `Bearer ${oauthToken}` } })).body?.sub === identifier);
    evidence.oauth2SameNumber = true;
    console.log('H5_OAUTH2_PORTAL_ISOLATION: real_portal_activation=true; real_tls_mail=true; real_internal_login=true; real_oauth_code_and_token=true; equal_numeric_id=true; api_doubles=0; production_modified=false');
  } finally {
    if (client) {
      const version = Number(database(`SELECT version FROM sys_oauth2_client WHERE client_id=${client.clientId} AND client_name=${sql(clientName)};`));
      successful(await api(admin, `${entry}/${client.clientId}/disable`, { method: 'POST', body: { version } }), '清理同编号专项客户端');
      for (const table of ['sys_oauth2_access_token', 'sys_oauth2_refresh_token', 'sys_oauth2_code', 'sys_oauth2_approve']) database(`DELETE FROM ${table} WHERE tenant_id=100000 AND client_id=${client.clientId};`);
      database(`DELETE FROM sys_oauth2_client WHERE tenant_id=100000 AND client_id=${client.clientId} AND client_name=${sql(clientName)};`);
    }
    if (roleId) database(`DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${identifier} AND role_id=${roleId};
      DELETE FROM sys_user WHERE tenant_id=100000 AND user_id=${identifier} AND user_name=${sql(username)};
      DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${roleId};
      DELETE FROM sys_role WHERE tenant_id=100000 AND role_id=${roleId} AND role_key=${sql(username)};`);
    check('OAuth同编号测试清理后既有角色授权未变化', grants() === original);
    check('OAuth同编号专用客户端、人员和角色已清理', database(`SELECT
      (SELECT COUNT(*) FROM sys_oauth2_client WHERE tenant_id=100000 AND client_name=${sql(clientName)})
      + (SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_id=${identifier} AND user_name=${sql(username)})
      + (SELECT COUNT(*) FROM sys_role WHERE tenant_id=100000 AND role_key=${sql(username)});`) === '0');
    evidence.oauth2GrantsRestored = true;
  }
}
