import assert from 'node:assert/strict';
import { createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { scanOwnedAuditLogs } from './portal-checks/scan-access-logs.mjs';
import { oauthRuntimeOffsets, scanOauthRuntime } from './oauth2-checks/logs.mjs';
import { verifyOauth2Boundaries } from './oauth2-checks/boundaries.mjs';
import { verifyOauth2Interface } from './oauth2-checks/interface.mjs';
import { prepareOauthActors } from './oauth2-checks/fixtures.mjs';
import { verifyOauthUserRace } from './oauth2-checks/race.mjs';
import { verifyOauthLimits } from './oauth2-checks/limits.mjs';
import { verifyOauthResources } from './oauth2-checks/resources.mjs';
import { verifyOauthLifecycle } from './oauth2-checks/lifecycle.mjs';

export async function verifyOauth2(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, state, accounts, requests, evidence } = context;
  const disabledOnly = process.argv.includes('--oauth2-disabled-only');
  const httpOnly = process.argv.includes('--oauth2-http-only');
  const uiOnly = process.argv.includes('--oauth2-ui-only');
  const gateway = state.services.find(service => service.name === 'gateway');
  const base = `http://127.0.0.1:${gateway.port}`;
  const origin = new URL(admin.url()).origin;
  const entry = '/auth/system/oauth2/client';
  const grants = '/auth/system/oauth2/grant';
  const platform = '/auth/system/platform/access';
  const literal = value => value == null ? 'NULL' : `CONVERT(0x${Buffer.from(String(value), 'utf8').toString('hex')} USING utf8mb4)`;
  const hash = value => createHash('sha256').update(value).digest('hex');
  const random = () => randomBytes(32).toString('base64url');
  const sensitive = new Set(accounts.map(account => account.password).filter(Boolean));
  const clients = [];
  const credentials = accounts.find(account => account.username === 'g_import_admin');
  assert.ok(credentials);
  const redis = await ownedGatewayRedis(state);
  const budgets = new Map();
  const users = new Map([[admin, 'g_import_admin']]);
  const cleanups = [];
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const budget = async (key, maximum) => {
    let window = budgets.get(key);
    if (window && window.count >= maximum && Date.now() - window.start < 61500) {
      console.log(`WAIT OAuth真实限流窗口：${key.split(':')[0]}，保留服务端原限制`);
      await pause(61500 - (Date.now() - window.start));
    }
    if (!window || Date.now() - window.start >= 61500) { window = { start: Date.now(), count: 0 }; budgets.set(key, window); }
    window.count++;
  };
  const login = async (username, source = username) => {
    const page = await session(username, source);
    users.set(page, username);
    return page;
  };
  const json = query => JSON.parse(database(query));
  const grantsDigest = () => database("SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;");
  const originalGrants = grantsDigest();
  const boundaries = json("SELECT JSON_OBJECT('log',CAST(COALESCE((SELECT MAX(log_id) FROM sys_log),0) AS CHAR),'error',CAST(COALESCE((SELECT MAX(error_id) FROM sys_api_error_log),0) AS CHAR),'audit',CAST(COALESCE((SELECT MAX(audit_id) FROM sys_audit_log),0) AS CHAR));");
  const logStarts = await oauthRuntimeOffsets(directory);
  const wire = async (requestPath, options = {}) => {
    const headers = { ...(options.headers ?? {}) };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.client?.secret) headers.Authorization = `Basic ${Buffer.from(`${options.client.clientKey}:${options.client.secret}`).toString('base64')}`;
    let body = options.raw;
    if (options.form) { body = new URLSearchParams(options.form).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    if (body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    for (const value of [options.token, options.client?.secret, headers.Authorization, headers.Authorization?.split(' ')[1]]) {
      if (typeof value === 'string' && value.length >= 20) sensitive.add(value);
    }
    if (typeof body === 'string' && headers['Content-Type'] === 'application/x-www-form-urlencoded') {
      for (const [name, value] of new URLSearchParams(body)) {
        if (['code', 'code_verifier', 'refresh_token', 'token', 'client_secret'].includes(name) && value.length >= 20) sensitive.add(value);
      }
    }
    const response = await fetch(`${base}${requestPath}`, { method: options.method ?? (body == null ? 'GET' : 'POST'), headers, body, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const parsed = await response.json().catch(() => null);
    for (const value of [parsed?.access_token, parsed?.refresh_token, parsed?.data?.requestToken]) {
      if (typeof value === 'string' && value.length >= 20) sensitive.add(value);
    }
    const cacheRaw = response.headers.get('Cache-Control');
    const cache = cacheRaw == null ? null : [...new Set(cacheRaw.split(',').map(value => value.trim().toLowerCase()))].join(', ');
    const result = { status: response.status, body: parsed, cache, cacheRaw, cookie: response.headers.get('Set-Cookie'), location: response.headers.get('Location'), challenge: response.headers.get('WWW-Authenticate'), retryAfter: response.headers.get('Retry-After') };
    requests.push({ path: new URL(requestPath, base).pathname, method: options.method ?? (body == null ? 'GET' : 'POST'), status: result.status, error: parsed?.error, source: 'real-oauth-client' });
    return result;
  };
  const denied = (result, status, code, label) => check(`${label}（HTTP=${result.status}; error=${result.body?.error ?? result.body?.code ?? 'none'}）`,
    result.status === status && result.body?.error === code && !result.body?.access_token);
  const tokenRequest = async (client, values) => {
    await budget('token-ip', 55); await budget(`token-client:${client.clientKey}`, 9);
    return wire('/oauth2/token', { client, form: { client_id: client.clientKey, ...values } });
  };
  const rememberTokens = (result, label) => {
    for (const value of [result.body?.access_token, result.body?.refresh_token]) if (typeof value === 'string' && value.length >= 20) sensitive.add(value);
    check(label, result.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(result.body?.access_token) && result.body.token_type === 'Bearer');
    check(`${label}不缓存且不产生登录Cookie`, result.cache === 'no-store' && result.cookie === null);
    sensitive.add(result.body.access_token);
    if (result.body.refresh_token) sensitive.add(result.body.refresh_token);
    return result.body;
  };
  let verifiedAt = 0;
  const verifyIdentity = async () => {
    if (Date.now() - verifiedAt < 230000) return;
    const status = successful(await api(admin, `${platform}/reauthenticate`, { method: 'POST', body: { password: credentials.password } }), '平台真实密码再次验证');
    check('平台客户端操作绑定当前内部会话及五分钟验证', status.verified === true && status.verifiedUntil > Date.now() && status.verifiedUntil <= Date.now() + 300000);
    verifiedAt = Date.now();
  };
  const manage = async (requestPath, options) => {
    await verifyIdentity(); await budget('client-manage', 18);
    return api(admin, requestPath, options);
  };
  const config = (suffix, overrides = {}) => ({ tenantId: 100000, clientType: 'CONFIDENTIAL', clientName: `oauth-${caseTag}-${suffix}`,
    description: '隔离真实第三方应用', accessTokenValiditySeconds: 900, refreshTokenValiditySeconds: 3600,
    redirectUris: [`${origin}/oauth2-test-return`], grantTypes: ['authorization_code'], scopes: ['profile', 'system.tenant.read'],
    autoApproveScopes: [], status: 'DISABLED', secretAction: 'GENERATE', ...overrides });
  const create = async (suffix, overrides = {}) => {
    const body = config(suffix, overrides);
    const result = successful(await manage(entry, { method: 'POST', body }), '创建真实客户端');
    const client = { ...result.client, secret: result.clientSecret };
    clients.push(client);
    check('客户端首次返回完整随机密钥或明确无密钥', body.clientType === 'PUBLIC' ? client.secret == null : /^[A-Za-z0-9_-]{43}$/.test(client.secret));
    if (client.secret) sensitive.add(client.secret);
    check('创建客户端默认停用且有独立随机编号', client.status === 'DISABLED' && /^cf_[A-Za-z0-9_-]{43}$/.test(client.clientKey));
    const enabled = successful(await manage(entry, { method: 'PUT', body: { ...body, clientId: client.clientId, version: client.version, status: 'ACTIVE', secretAction: 'KEEP' } }), '启用真实客户端');
    Object.assign(client, enabled);
    return client;
  };
  const update = async (client, overrides = {}) => {
    const body = { tenantId: client.tenantId, clientId: client.clientId, version: client.version, clientType: client.clientType,
      clientName: client.clientName, description: client.description, logoFileId: client.logoFileId, serviceUserId: client.serviceUserId,
      accessTokenValiditySeconds: client.accessTokenValiditySeconds, refreshTokenValiditySeconds: client.refreshTokenValiditySeconds,
      redirectUris: client.redirectUris, grantTypes: client.grantTypes, scopes: client.scopes, autoApproveScopes: client.autoApproveScopes,
      status: client.status, secretAction: 'KEEP', ...overrides };
    const result = successful(await manage(entry, { method: 'PUT', body }), '更新真实客户端策略');
    Object.assign(client, result);
    if (body.secretAction === 'REPLACE') { client.secret = body.clientSecret; sensitive.add(client.secret); }
    return client;
  };
  const begin = async (page, client, overrides = {}) => {
    await budget(`authorize:${users.get(page)}`, 9);
    const verifier = random(); const challenge = createHash('sha256').update(verifier).digest('base64url'); const stateValue = random();
    sensitive.add(verifier); sensitive.add(challenge); sensitive.add(stateValue);
    const values = { response_type: 'code', client_id: client.clientKey, redirect_uri: client.redirectUris[0],
      scope: client.scopes.join(' '), state: stateValue, code_challenge: challenge, code_challenge_method: 'S256', ...overrides };
    const query = '?' + new URLSearchParams(values);
    const result = await api(page, `/oauth2/authorize${query}`);
    if (result.body?.data?.requestToken) sensitive.add(result.body.data.requestToken);
    return { result, verifier, stateValue, query, values, client, page };
  };
  const consent = async (flow, approve = true, scopes = flow.client.scopes, page = flow.page) => {
    const view = successful(flow.result, '准备真实用户授权');
    sensitive.add(view.requestToken);
    await budget(`authorize:${users.get(page)}`, 9);
    return api(page, '/oauth2/authorize', { method: 'POST', body: { requestToken: view.requestToken, approve, scopes } });
  };
  const codeFrom = (flow, view) => {
    const destination = new URL(view.redirectUrl);
    const code = destination.searchParams.get('code');
    check('授权码与state通过精确回调返回', destination.origin === new URL(flow.client.redirectUris[0]).origin
      && destination.pathname === new URL(flow.client.redirectUris[0]).pathname && destination.searchParams.get('state') === flow.stateValue && /^[A-Za-z0-9_-]{43}$/.test(code));
    sensitive.add(code);
    return { ...flow, code };
  };
  const issued = async (page, client, scopes = client.scopes) => {
    const flow = await begin(page, client);
    const prepared = successful(flow.result, '准备真实用户授权');
    const view = prepared.redirectUrl ? prepared : successful(await consent(flow, true, scopes), '用户本人同意第三方授权');
    return codeFrom(flow, view);
  };
  const redeem = flow => tokenRequest(flow.client, { grant_type: 'authorization_code', code: flow.code, redirect_uri: flow.client.redirectUris[0], code_verifier: flow.verifier });
  const resource = async (token, resourcePath = '/oauth2/userinfo') => {
    await budget(`resource:${hash(token)}`, 55);
    return wire(resourcePath, { token });
  };
  const expire = async (client, kind, value) => {
    const definitions = {
      code: ['sys_oauth2_code', 'create_time', 'code_hash'],
      request: ['sys_oauth2_code', 'create_time', 'request_hash'],
      access: ['sys_oauth2_access_token', 'issued_time', 'token_hash'],
      refresh: ['sys_oauth2_refresh_token', 'issued_time', 'token_hash'],
      approval: ['sys_oauth2_approve', 'approved_time', 'user_id'],
    };
    assert.ok(Object.hasOwn(definitions, kind));
    assert.ok(clients.some(owned => String(owned.clientId) === String(client.clientId) && String(owned.tenantId) === String(client.tenantId)));
    assert.match(String(value), kind === 'approval' ? /^[1-9][0-9]*$/ : /^[a-f0-9]{64}$/);
    const [table, started, identity] = definitions[kind];
    const where = `tenant_id=${client.tenantId} AND client_id=${client.clientId} AND ${identity}=${literal(value)}`;
    assert.equal(database(`UPDATE ${table} SET expires_time=DATE_ADD(${started},INTERVAL 1 SECOND) WHERE ${where}; SELECT ROW_COUNT();`), '1');
    const deadline = Date.now() + 5000;
    let expired;
    do {
      expired = database(`SELECT expires_time>${started} AND expires_time<NOW() FROM ${table} WHERE ${where};`) === '1';
      if (expired) break;
      await pause(100);
    } while (Date.now() < deadline);
    check(`${kind}到期输入保留真实创建或签发时间，仅缩短本次记录有效期并等待到期`, expired);
    console.log(`H5_OAUTH2_EXPIRY_FIXTURE: kind=${kind}; changed_rows=1; chronological_order=true; expired=true; production_modified=false`);
  };
  const fixture = state.oauth2Fixture;
  const shared = { ...context, origin, entry, grants, platform, literal, hash, random, sensitive, clients, redis, budgets, users, cleanups,
    pause, budget, login, json, wire, denied, tokenRequest, rememberTokens, verifyIdentity, manage, config, create, update, begin, consent, codeFrom, issued, redeem, resource, expire, fixture };
  let verificationFailure;
  try {
    if (disabledOnly) {
      const authorizing = await api(admin, '/oauth2/authorize?response_type=code');
      check('外部授权未配置时明确停用，不建立授权事务', authorizing.status === 503 && authorizing.body?.error === 'temporarily_unavailable');
      denied(await wire('/oauth2/token', { form: { grant_type: 'client_credentials', client_id: 'unconfigured' } }), 503, 'temporarily_unavailable', '未配置令牌端点明确返回503');
      denied(await wire('/oauth2/userinfo', { token: random() }), 503, 'temporarily_unavailable', '未配置资源端点明确返回503');
      evidence.disabled = true;
      await verifyOauth2Interface({ ...shared, disabledOnly: true });
      return;
    }
    assert.ok(fixture && fixture.publicUrl === origin, 'Owned OAuth deployment fixture must match the real browser origin');
    const authProperties = await fs.readFile(path.join(directory, 'auth/integration.properties'), 'utf8');
    const master = [...authProperties.matchAll(/^cloudflow\.oauth2\.secret-key=(.+)$/gm)].at(-1)?.[1]?.trim();
    assert.ok(master && master.length >= 32, 'Independent fixture encryption key is configured');
    sensitive.add(master);
    const employee = await login('g_holiday_employee');
    const other = await login('g_import_other');
    for (const page of [employee, other]) check('员工及普通租户管理员均不能管理平台客户端', (await api(page, `${entry}/list`)).status === 403);
    evidence.clientPolicy = true;
    if (process.argv.includes('--oauth2-race-check') || process.argv.includes('--oauth2-limits-check') || process.argv.includes('--oauth2-resources-check') || process.argv.includes('--oauth2-lifecycle-check')) {
      const actors = await prepareOauthActors(shared, process.argv.includes('--oauth2-resources-check') || process.argv.includes('--oauth2-lifecycle-check'));
      if (process.argv.includes('--oauth2-race-check')) await verifyOauthUserRace({ ...shared, actors });
      if (process.argv.includes('--oauth2-limits-check')) await verifyOauthLimits({ ...shared, actors });
      if (process.argv.includes('--oauth2-resources-check')) await verifyOauthResources({ ...shared, actors });
      if (process.argv.includes('--oauth2-lifecycle-check')) await verifyOauthLifecycle({ ...shared, actors });
      return;
    }
    if (!uiOnly) {
      const client = await create('code');
      const encrypted = database(`SELECT client_secret_encrypted FROM sys_oauth2_client WHERE tenant_id=100000 AND client_id=${client.clientId};`);
      sensitive.add(encrypted);
      const payload = Buffer.from(encrypted.slice(7), 'base64');
      const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(`cloudflow:oauth2:client-secret:v1:${master}`).digest(), payload.subarray(0, 12));
      decipher.setAuthTag(payload.subarray(-16));
      const decrypted = Buffer.concat([decipher.update(payload.subarray(12, -16)), decipher.final()]).toString('utf8');
      check('非空客户端密钥在数据库独立加密并能正确解密', encrypted.startsWith('oauth1:') && encrypted !== client.secret && decrypted === client.secret);
      const listed = successful(await api(admin, `${entry}/list`), '平台查看客户端');
      check('客户端列表只显示密钥配置状态，不返回明文或密文', listed.scopeRegistry.length === 4 && !JSON.stringify(listed).includes(client.secret) && !JSON.stringify(listed).includes(encrypted)
        && !/"(?:clientSecret|clientSecretEncrypted)"\s*:/.test(JSON.stringify(listed)));
      const flow = await issued(employee, client, ['profile']);
      const codeHash = database(`SELECT code_hash FROM sys_oauth2_code WHERE tenant_id=100000 AND client_id=${client.clientId} ORDER BY code_id DESC LIMIT 1;`);
      check('数据库授权码只保存SHA256', codeHash === hash(flow.code));
      denied(await tokenRequest(client, { grant_type: 'authorization_code', code: flow.code, redirect_uri: client.redirectUris[0], code_verifier: random() }), 400, 'invalid_grant', '错误PKCE验证不能消费授权码');
      const tokens = rememberTokens(await redeem(flow), '真实授权码兑换访问和刷新令牌');
      check('授权令牌仅包含本人选择的范围', tokens.scope === 'profile' && /^[A-Za-z0-9_-]{43}$/.test(tokens.refresh_token));
      const profile = await resource(tokens.access_token);
      const employeeId = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0;");
      check('真实用户资料只有本人编号和姓名', profile.status === 200 && profile.body?.sub === employeeId && JSON.stringify(Object.keys(profile.body).sort()) === '["name","sub"]' && !profile.cookie);
      check('数据库令牌只保存哈希', database(`SELECT token_hash FROM sys_oauth2_access_token WHERE client_id=${client.clientId} ORDER BY access_token_id DESC LIMIT 1;`) === hash(tokens.access_token)
        && database(`SELECT token_hash FROM sys_oauth2_refresh_token WHERE client_id=${client.clientId} ORDER BY refresh_token_id DESC LIMIT 1;`) === hash(tokens.refresh_token));
      denied(await resource(tokens.access_token, '/oauth2/api/system/tenant'), 403, 'insufficient_scope', '未同意的企业范围不能访问');
      denied(await resource(hash(tokens.access_token)), 401, 'invalid_token', '数据库哈希不能作为外部令牌');
      const ordinary = await wire('/auth/auth/userInfo', { token: tokens.access_token });
      check('OAuth访问令牌不能作为内部普通登录凭据', ordinary.status === 401 && ordinary.body?.code !== 200);
      const internal = await api(employee, '/oauth2/userinfo');
      check('内部登录凭据不能投射成第三方身份', internal.status === 401);
      evidence.authorization = true;
      await verifyOauth2Boundaries({ ...shared, employee, other, client, master, tokens, employeeId });
    }
    if (!httpOnly) await verifyOauth2Interface({ ...shared, employee, other, disabledOnly: false });
  } catch (failure) {
    verificationFailure = failure;
    throw failure;
  } finally {
    const cleanupFailures = [];
    const attempt = async operation => { try { await operation(); } catch (failure) { cleanupFailures.push(failure); } };
    for (const client of clients) {
      await attempt(async () => {
        const row = json(`SELECT JSON_OBJECT('version',version,'status',status) FROM sys_oauth2_client WHERE tenant_id=${client.tenantId} AND client_id=${client.clientId} AND client_name LIKE ${literal(`oauth-${caseTag}-%`)};`);
        if (row.status === 'ACTIVE') successful(await manage(`${entry}/${client.clientId}/disable`, { method: 'POST', body: { version: row.version } }), '清理时撤销本次应用令牌');
      });
      await attempt(() => {
        for (const table of ['sys_oauth2_access_token', 'sys_oauth2_refresh_token', 'sys_oauth2_code', 'sys_oauth2_approve']) database(`DELETE FROM ${table} WHERE tenant_id=${client.tenantId} AND client_id=${client.clientId};`);
        database(`DELETE FROM sys_oauth2_client WHERE tenant_id=${client.tenantId} AND client_id=${client.clientId} AND client_name LIKE ${literal(`oauth-${caseTag}-%`)};`);
      });
    }
    for (const cleanup of cleanups.reverse()) await attempt(cleanup);
    await attempt(() => check('OAuth专项未改变既有角色菜单授权', grantsDigest() === originalGrants));
    await attempt(() => check('本次客户端及授权测试数据已清理', database(`SELECT COUNT(*) FROM sys_oauth2_client WHERE client_name LIKE ${literal(`oauth-${caseTag}-%`)};`) === '0'));
    evidence.cleanup = cleanupFailures.length === 0;
    await attempt(async () => {
      await pause(1500);
      sensitive.delete(null); sensitive.delete(undefined);
      const audit = await scanOwnedAuditLogs(state, sensitive, boundaries);
      const runtime = await scanOauthRuntime(directory, logStarts, sensitive);
      const leaks = audit.leaks + runtime.leaks;
      const bytes = audit.bytes + runtime.bytes;
      console.log(`H5_OAUTH2_SECRET_SCAN: values=${sensitive.size}; bytes=${bytes}; leaks=${leaks}; includes_database_audits=true; includes_runtime_logs=true; discovered_log_files=${runtime.discoveredFiles}; files_with_new_bytes=${runtime.files}; historical_logs_recertified=false`);
      check('授权码、挑战、密钥及访问刷新令牌不出现在运行和审计日志', leaks === 0);
      evidence.secrets = true;
    });
    if (cleanupFailures.length) throw new AggregateError([...(verificationFailure ? [verificationFailure] : []), ...cleanupFailures], 'OAuth专项收尾检查失败，已继续执行其他清理与敏感值检查');
  }
}
