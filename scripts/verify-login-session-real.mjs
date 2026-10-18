import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { verifyLoginTotp } from './verify-login-totp-real.mjs';

export async function verifyLoginSession({ admin, api, successful, session, authenticate, database, check, state, accounts, caseTag, requests }) {
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  const username = `g_session_${caseTag}`;
  const redis = await ownedGatewayRedis(state);
  const pages = [];
  const tokens = new Set();
  const totpSecrets = new Set();
  const password = accounts.find(account => account.username === 'g_import_admin').password;
  const newPassword = `Session${caseTag}Aa7`;
  const finalPassword = `SessionR${caseTag}Aa8`;
  const boundaries = { log: database('SELECT COALESCE(MAX(log_id),0) FROM sys_log;'), error: database('SELECT COALESCE(MAX(error_id),0) FROM sys_api_error_log;'), audit: database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;') };
  const routes = [
    ['auth', '/auth/info', '/info'],
    ['hr', '/hr/employees?pageNum=1&pageSize=1', '/employees?pageNum=1&pageSize=1'],
    ['oa', '/oa/asset/list?pageNum=1&pageSize=1', '/asset/list?pageNum=1&pageSize=1'],
    ['crm', '/crm/customer/list?pageNum=1&pageSize=1', '/customer/list?pageNum=1&pageSize=1'],
    ['workflow', '/workflow/wf/tasks/count', '/wf/tasks/count'],
  ];
  const grantsBefore = database("SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;");
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE user_name='${username}';`), '0');
  database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,version,pwd_reset_required,create_by)
    SELECT 100000,dept_id,'${username}','登录保护专项',password,'0',0,0,'0','${username}' FROM sys_user WHERE user_name='g_import_admin' AND tenant_id=100000 AND deleted=0;`);
  const userId = Number(database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='${username}';`));
  assert.ok(Number.isSafeInteger(userId) && userId > 0);
  const predicate = `user_id=${userId} AND tenant_id=100000 AND user_name='${username}' AND create_by='${username}'`;
  const runPredicate = `requested_by=${userId} AND create_by='${username}'`;
  database(`INSERT INTO sys_user_role(user_id,tenant_id,role_id) VALUES (${userId},100000,1);`);
  const tokenOf = async page => (await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken())).replace(/^Bearer /, '');
  const login = async () => {
    const page = await session(username, 'g_import_admin');
    pages.push(page);
    tokens.add(await tokenOf(page));
    return page;
  };
  const rejected = (response, label) => check(label, [401, 403].includes(response.status) && [401, 403].includes(response.body?.code) && response.body?.data == null);
  const direct = async (serviceName, route, token) => {
    const service = state.services.find(item => item.name === serviceName);
    assert.ok(service && Number.isInteger(service.port));
    const response = await fetch(`http://127.0.0.1:${service.port}${route}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    const body = await response.json();
    requests.push({ path: route.split('?')[0], service: serviceName, direct: true, method: 'GET', status: response.status, code: body.code });
    return { status: response.status, body };
  };
  try {
    let page = await login();
    if (process.argv.includes('--login-session-totp-only')) {
      await verifyLoginTotp({ page, api, successful, authenticate, database, check, redis, userId, username, tokens, sensitive: totpSecrets,
        credentials: { ...accounts.find(account => account.username === 'g_import_admin'), username } });
      page = await login();
    }
    for (const [service, route, local] of routes) {
      successful(await api(page, route), `${service}经网关读取成功`);
      successful(await direct(service, local, await tokenOf(page)), `${service}直连读取成功`);
      check(`${service}真实服务接受当前登录`, true);
    }
    const oldToken = await tokenOf(page);
    const ownedTokenKeys = redis('--scan', '--pattern', `*${oldToken}*`).split(/\r?\n/).filter(Boolean);
    check('旧会话在真实Redis中存在', ownedTokenKeys.length > 0);
    database(`UPDATE sys_user SET version=version+1 WHERE ${predicate};`);
    for (const [service, route, local] of routes) {
      rejected(await api(page, route), `${service}经网关拒绝旧版本登录`);
      rejected(await direct(service, local, oldToken), `${service}直连拒绝旧版本登录，数据库策略确实注入`);
    }
    check('未删除Redis会话也立即阻止旧权限使用', ownedTokenKeys.some(key => redis('EXISTS', key) === '1'));
    page = await login();
    successful(await api(page, '/auth/info'), '组织变化后重新登录可用');
    database(`INSERT INTO sys_im_sync_run(tenant_id,config_id,config_version,mode,snapshot_hash,result_summary,status,requested_by,create_by)
      VALUES(100000,${userId},0,'APPLY',REPEAT('a',64),JSON_OBJECT('effectsPending',TRUE),'RUNNING',${userId},'${username}');`);
    for (const [service, route] of routes) rejected(await api(page, route), `${service}待安全清理期间拒绝业务访问`);
    const pendingContext = await page.context().browser().newContext({ serviceWorkers: 'block' });
    try {
      const origin = new URL(page.url()).origin;
      await pendingContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const pendingPage = await pendingContext.newPage();
      await pendingPage.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
      const responses = [];
      const observations = [];
      pendingPage.on('response', response => { if (new URL(response.url()).pathname === '/api/auth/login') responses.push(response); });
      pendingPage.on('response', response => {
        const route = new URL(response.url()).pathname;
        if (route.startsWith('/api/')) observations.push({ path: route, status: response.status() });
      });
      pendingPage.on('requestfailed', request => {
        const route = new URL(request.url()).pathname;
        if (route.startsWith('/api/')) observations.push({ path: route, failed: request.failure()?.errorText });
      });
      await assert.rejects(() => authenticate(pendingPage, { ...accounts.find(account => account.username === 'g_import_admin'), username }));
      assert.equal(responses.length, 1, `Expected actual login rejection; observed=${JSON.stringify(observations)}`);
      const deniedLogin = { status: responses[0].status(), body: await responses[0].json() };
      requests.push({ path: '/auth/login', method: 'POST', status: deniedLogin.status, code: deniedLogin.body.code });
      check('待安全清理期间真实验证码和密码登录不能签发新会话', deniedLogin.status === 401 && deniedLogin.body.code === 401
        && deniedLogin.body.data == null && /账号或组织信息已变化/.test(deniedLogin.body.msg || deniedLogin.body.message));
    } finally { await pendingContext.close(); }
    database(`UPDATE sys_im_sync_run SET result_summary='{"effectsPending":false}' WHERE ${runPredicate};`);
    successful(await api(page, '/auth/info'), '明确清理完成标记恢复未变更版本的登录');
    database(`UPDATE sys_im_sync_run SET tenant_id=100001,result_summary='{"effectsPending":true}' WHERE ${runPredicate};`);
    successful(await api(page, '/auth/info'), '其他租户待清理不影响本租户');
    database(`DELETE FROM sys_im_sync_run WHERE ${runPredicate};`);
    const switched = successful(await api(page, '/auth/switchTenant', { method: 'POST', body: { tenantId: 100001 } }), '当前管理员切换租户');
    tokens.add(switched.token.replace(/^Bearer /, ''));
    await page.evaluate(async token => (await import('/src/utils/authStorage.ts')).setAuthToken(token), switched.token);
    check('切换后账号归属与目标租户正确分离', successful(await api(page, '/auth/info'), '读取切换身份').user.tenantId === 100001);
    database(`DELETE FROM sys_user_role WHERE user_id=${userId} AND tenant_id=100000 AND role_id=1;`);
    rejected(await api(page, '/auth/info'), '删除真实管理员角色后旧跨租户会话失效');
    database(`INSERT INTO sys_user_role(user_id,tenant_id,role_id) VALUES (${userId},100000,1);`);
    page = await login();
    successful(await api(page, '/auth/profile', { method: 'PUT', body: { nickName: '登录保护资料修改', email: '', phonenumber: '' } }), '保存本人资料');
    check('本人资料保存后账号操作仍可用', successful(await api(page, '/auth/info'), '保存后读取账号').user.nickName === '登录保护资料修改');
    successful(await api(page, '/auth/profile/password', { method: 'PUT', body: { oldPassword: password, newPassword } }), '修改本人密码');
    successful(await api(page, '/auth/info'), '修改密码后账号读取保持可用');
    successful(await api(page, '/auth/profile/password', { method: 'PUT', body: { oldPassword: newPassword, newPassword: finalPassword } }), '使用新密码再次修改专项账号密码');
    successful(await api(page, '/auth/logout', { method: 'POST' }), '本人退出');
    rejected(await api(page, '/auth/info'), '退出后不可读取账号');
    const finalCredentials = { ...accounts.find(account => account.username === 'g_import_admin'), username, password: finalPassword };
    try { await authenticate(page, finalCredentials); }
    catch (failure) {
      if (!/请求过于频繁|登录尝试过于频繁/.test(failure.message)) throw failure;
      console.log('WAIT 保留认证限流，等待61秒后使用修改后的密码重新登录');
      await new Promise(resolve => setTimeout(resolve, 61000));
      await authenticate(page, finalCredentials);
    }
    tokens.add(await tokenOf(page));
    successful(await api(page, '/auth/info'), '修改后的密码可以重新登录并读取账号');
    successful(await api(page, '/auth/logout', { method: 'POST' }), '专项账号最后退出');
    successful(await api(admin, '/auth/info'), '现有管理员账号未受专项影响');
    check('本人资料、密码、退出及相邻账号通过真实接口回归', true);
  } finally {
    database(`DELETE FROM sys_im_sync_run WHERE ${runPredicate};`);
    database(`DELETE FROM sys_user_role WHERE user_id=${userId} AND tenant_id=100000; DELETE FROM sys_user WHERE ${predicate};`);
    const patterns = [`*${username}*`, `*:login:session:${userId}`, `*user:datascope:100000:${userId}`, `*user_menus::${userId}`, ...[...tokens].map(token => `*${token}*`)];
    for (const pattern of patterns) {
      for (const key of redis('--scan', '--pattern', pattern).split(/\r?\n/).filter(Boolean)) redis('DEL', key);
    }
    for (const page of pages) await page.context().close();
    check('仅清理本轮自有账号和待清理标记', database(`SELECT (SELECT COUNT(*) FROM sys_user WHERE ${predicate})+(SELECT COUNT(*) FROM sys_im_sync_run WHERE ${runPredicate});`) === '0');
    check('菜单与角色授权集合未变更', grantsBefore === database("SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;"));
    const secrets = [password, newPassword, finalPassword, ...tokens, ...totpSecrets];
    await new Promise(resolve => setTimeout(resolve, 2000));
    const audit = await scanOwnedAuditLogs(state, secrets, boundaries);
    check('本轮访问、异常及审计日志无密码和登录凭据', audit.leaks === 0);
    let logFiles = 0;
    for (const service of state.services) {
      for (const file of await fs.readdir(path.join(state.run, service.name))) {
        if (!file.endsWith('.log')) continue;
        const scanned = await scanSecretStream(createReadStream(path.join(state.run, service.name, file)), secrets);
        assert.equal(scanned.leaks, 0, `${service.name}日志含本轮敏感值`);
        logFiles++;
      }
    }
    console.log(`G4_LOGIN_SESSION_SECRET_SCAN: service_log_files=${logFiles}; sensitive_values=${secrets.length}; leaks=0; owned_audit_logs=true`);
  }
}
