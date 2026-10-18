import assert from 'node:assert/strict';
import { createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { verifyDataSourceInterface } from './verify-data-source-real-ui.mjs';

export async function verifyDataSource(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, state, accounts, requests, evidence } = context;
  const disabledOnly = process.argv.includes('--data-source-disabled-only');
  const uiOnly = process.argv.includes('--data-source-foundation-ui-only');
  const httpOnly = process.argv.includes('--data-source-foundation-http-only');
  evidence.mode = disabledOnly ? 'disabled' : uiOnly ? 'foundation-ui' : httpOnly ? 'foundation-http' : 'foundation';
  const entry = '/auth/system/data-source';
  const platform = '/auth/system/platform/access';
  const credential = accounts.find(account => account.username === 'g_import_admin');
  assert.ok(credential?.password);
  const operator = JSON.parse(database("SELECT JSON_OBJECT('userId',user_id,'tenantId',tenant_id) FROM sys_user WHERE user_name='g_import_admin' AND deleted=0;"));
  assert.ok(Number.isSafeInteger(operator.userId) && operator.tenantId === 100000);
  const token = (await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken())).replace(/^Bearer /, '');
  const redis = await ownedGatewayRedis(state);
  const proofKey = `auth:platform:recent:internal:${createHash('sha256').update(token).digest('hex')}`;
  const secret = `Datasource-${caseTag}-${randomBytes(24).toString('base64url')}`;
  const replacement = `Replacement-${caseTag}-${randomBytes(24).toString('base64url')}`;
  const sensitive = new Set([credential.password, token, secret, replacement]);
  const boundaries = { log: database('SELECT COALESCE(MAX(log_id),0) FROM sys_log;'),
    error: database('SELECT COALESCE(MAX(error_id),0) FROM sys_api_error_log;'),
    audit: database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;') };
  const grants = () => database("SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;");
  const grantsBefore = grants();
  const prefix = `h5-ds-${caseTag}-`;
  const ownedPredicate = `tenant_id=100000 AND ds_key LIKE '${prefix}%'`;
  const preexisting = database('SELECT COUNT(*) FROM sys_data_source_config;');
  assert.equal(database(`SELECT COUNT(*) FROM sys_data_source_config WHERE ${ownedPredicate};`), '0');
  const config = (suffix, overrides = {}) => ({ configName: `${prefix}${suffix}`, dsKey: `${prefix}${suffix}`,
    url: `jdbc:mysql://127.0.0.1:${state.mysqlPort}/cloud_flow_db`, username: 'h5_source_ro',
    secretAction: 'REPLACE', password: secret, maxActive: 5, targetServices: ['cloudflow-auth', 'cloudflow-service-hr'], ...overrides });
  const current = configId => JSON.parse(database(`SELECT JSON_OBJECT('configId',config_id,'version',version,'status',status,'cipher',password_encrypted,'dsKey',ds_key,'name',config_name,'maxActive',max_active) FROM sys_data_source_config WHERE ${ownedPredicate} AND config_id=${configId};`));
  const noLeak = value => [...sensitive].every(secretValue => !JSON.stringify(value).includes(secretValue));
  const rejected = (response, expected, label) => check(label,
    response.status === expected && response.body?.code === expected && response.body.data == null && noLeak(response));
  const clean = (response, label) => {
    const result = successful(response, label);
    check(`${label}禁止缓存且响应没有密码或密文`, response.cacheControl === 'no-store' && noLeak(response)
      && !/"(?:password|passwordEncrypted|password_encrypted|secretKey|controlKey)"\s*:/.test(JSON.stringify(result)));
    return result;
  };
  const waitUntil = async (label, condition, milliseconds = 20000) => {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) {
      if (await condition()) { check(label, true); return; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    check(label, false);
  };
  const logStarts = new Map();
  for (const service of state.services) for (const logName of ['stdout.log', 'stderr.log']) {
    const filename = path.join(directory, service.name, logName);
    try { logStarts.set(filename, (await fs.stat(filename)).size); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let firstMutationAt = 0;
  let mutations = 0;
  const saveRequest = async (body, method = 'POST') => {
    if (mutations >= 17 && Date.now() - firstMutationAt < 61000) {
      console.log('WAIT 保留数据源每分钟20次保存限制，等待原窗口结束');
      await new Promise(resolve => setTimeout(resolve, 61000 - (Date.now() - firstMutationAt)));
    }
    if (!firstMutationAt || Date.now() - firstMutationAt >= 61000) { firstMutationAt = Date.now(); mutations = 0; }
    mutations++;
    return api(admin, entry, { method, body });
  };
  const verifyIdentity = async () => {
    const result = clean(await api(admin, `${platform}/reauthenticate`, { method: 'POST', body: { password: credential.password } }), '真实密码再次验证平台身份');
    check('平台身份凭据绑定当前真实会话且在五分钟内有效', result.verified && result.verifiedUntil > Date.now()
      && result.verifiedUntil <= Date.now() + 300000 && redis('EXISTS', proofKey) === '1');
  };
  let encryptionKey;
  let controlKey;
  const decrypt = encrypted => {
    assert.match(encrypted, /^ds1:/);
    const payload = Buffer.from(encrypted.slice(4), 'base64');
    const key = createHash('sha256').update(`cloudflow:data-source:password:v1:${encryptionKey.trim()}`).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(-16));
    return Buffer.concat([decipher.update(payload.subarray(12, -16)), decipher.final()]).toString('utf8');
  };
  const rememberCipher = configId => { const cipher = current(configId).cipher; if (cipher) sensitive.add(cipher); return cipher; };
  const edit = (saved, overrides = {}) => config(saved.dsKey.slice(prefix.length), {
    configId: saved.configId, version: saved.version, secretAction: 'KEEP', password: undefined, ...overrides,
  });
  const directApply = async (service, body, changes = {}) => {
    const requestPath = `/inner/${service.name}/data-source/apply`;
    const target = createHash('sha256').update(`${service.application}\n127.0.0.1\n${service.port}\nfalse`).digest('hex');
    const timestamp = String(Date.now());
    const nonce = randomBytes(16).toString('hex');
    const material = `data-source:apply:v1\ncloudflow-auth\nPOST\n${requestPath}\n${target}\n${body.configId}\n${body.version}\n${timestamp}\n${nonce}`;
    const signature = createHmac('sha256', controlKey.trim()).update(material).digest('base64url');
    sensitive.add(signature);
    const headers = { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth',
      'X-DataSource-Time': timestamp, 'X-DataSource-Nonce': nonce, 'X-DataSource-Target': target, 'X-DataSource-Signature': signature, ...changes };
    const send = async supplied => {
      const response = await fetch(`http://127.0.0.1:${service.port}${requestPath}`, { method: 'POST', headers: supplied, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const result = { status: response.status, body: await response.json() };
      requests.push({ path: requestPath, method: 'POST', status: result.status, code: result.body?.code, source: 'signed-service-direct' });
      return result;
    };
    return { response: await send(headers), repeat: () => send(headers), target };
  };
  try {
    redis('DEL', proofKey);
    const initial = clean(await api(admin, platform), '读取真实平台部署状态');
    if (disabledOnly) {
      check('默认停用专项没有平台部署授权', initial.configured === false && !initial.verified);
      rejected(await api(admin, `${entry}/list`), 503, '默认平台未配置时数据源目录明确拒绝');
      rejected(await api(admin, entry, { method: 'POST', body: config('disabled') }), 503, '默认平台未配置时不能保存数据源');
      rejected(await api(admin, `${entry}/1/register`, { method: 'POST', body: { version: 0, confirmation: 'disabled', targetServices: ['cloudflow-auth'] } }), 503, '默认平台未配置时不能注册数据源');
      await verifyDataSourceInterface({ ...context, entry, platform, credential, proofKey, redis, config, current, rememberCipher, sensitive, verifyIdentity, disabledOnly, waitUntil });
      evidence.disabled = true;
      return;
    }
    const properties = await fs.readFile(path.join(directory, 'auth/integration.properties'), 'utf8');
    const value = key => properties.split(/\r?\n/).filter(line => line.startsWith(`${key}=`)).at(-1)?.slice(key.length + 1);
    encryptionKey = value('cloudflow.datasource.runtime.secret-key');
    controlKey = value('cloudflow.datasource.runtime.control-key');
    assert.ok(encryptionKey?.length >= 32 && controlKey?.length >= 32 && encryptionKey !== controlKey);
    sensitive.add(encryptionKey); sensitive.add(controlKey);
    const totpKey = value('cloudflow.auth.totp.encryption-key');
    if (totpKey) sensitive.add(totpKey);
    check('基础专项使用独立密钥及已获准的平台测试身份', initial.configured && !initial.verified && !initial.totpRequired);
    rejected(await api(admin, `${entry}/list`), 403, '管理员未再次验证不能读取数据源目录');
    await verifyIdentity();
    const overview = clean(await api(admin, `${entry}/list`), '读取数据源基础目录');
    check('部署完整后已接通真实只读账号核验器', overview.configured && overview.accountVerificationReady && /按实例分别应用/.test(overview.message));
    check('可选服务仅来自五个部署允许服务', overview.allowedServices.length === 5
      && overview.allowedServices.every(service => state.services.some(actual => actual.application === service && actual.name !== 'gateway')));
    if (!uiOnly) {
      let saved = clean(await saveRequest(config('main')), '真实HTTP创建停用数据源');
      check('新增版本从0开始且默认停用、初始连接数0、最大连接数5', saved.version === 0 && saved.status === 'DISABLED'
        && saved.initSize === 0 && saved.maxActive === 5 && saved.passwordConfigured);
      const encrypted = rememberCipher(saved.configId);
      check('真实数据库非空密文能被独立解密且与提交密码一致', decrypt(encrypted) === secret && encrypted !== secret);
      saved = clean(await saveRequest(edit(saved, { secretAction: 'REPLACE', password: secret }), 'PUT'), '替换相同密码产生新版本');
      const rerandomized = rememberCipher(saved.configId);
      check('相同非空密码再次加密采用不同随机量', rerandomized !== encrypted && decrypt(rerandomized) === secret);
      saved = clean(await saveRequest(edit(saved, { configName: `${prefix}keep` }), 'PUT'), '保留已有密码修改配置');
      check('KEEP原样保留密文并更新版本', current(saved.configId).cipher === rerandomized && saved.version === 2);
      saved = clean(await saveRequest(edit(saved, { secretAction: 'REPLACE', password: replacement }), 'PUT'), '替换为不同数据库密码');
      check('REPLACE真实变更密码且旧密码不残留', decrypt(rememberCipher(saved.configId)) === replacement && saved.version === 3);
      saved = clean(await saveRequest(edit(saved, { secretAction: 'CLEAR' }), 'PUT'), '清除停用配置密码');
      check('CLEAR清空数据库密文且接口只显示未配置', current(saved.configId).cipher === '' && saved.passwordConfigured === false);
      saved = clean(await saveRequest(edit(saved, { secretAction: 'REPLACE', password: secret }), 'PUT'), '补回新的数据库密码');
      rememberCipher(saved.configId);
      evidence.encryption = true;
      const test = clean(await api(admin, `${entry}/${saved.configId}/test`, { method: 'POST', body: { version: saved.version } }), '真实HTTP无效凭据连接结果');
      check('无法认证的账号固定测试明确失败而非假通过', test.successful === false && test.errorCode === 'CONNECTION_FAILED');
      rejected(await api(admin, `${entry}/${saved.configId}/register`, { method: 'POST', body: { version: saved.version,
        confirmation: 'incorrect-confirmation', targetServices: saved.targetServices } }), 400, '未正确二次确认时真实注册被拒绝');
      check('被拒绝的测试和注册不能改变期望版本或状态', current(saved.configId).version === saved.version && current(saved.configId).status === 'DISABLED');
      evidence.disabled = true;
      const source = edit(saved);
      const competitors = await Promise.all(['first', 'second'].map(suffix => saveRequest({ ...source, configName: `${prefix}${suffix}` }, 'PUT')));
      check('并发保存同一版本仅一次成功另一次409', competitors.filter(response => response.status === 200 && response.body?.code === 200).length === 1
        && competitors.filter(response => response.status === 409 && response.body?.code === 409).length === 1);
      saved = clean(await api(admin, `${entry}/${saved.configId}`), '并发后重新读取实际配置');
      check('并发保存只增加一个版本', saved.version === source.version + 1 && current(saved.configId).version === saved.version);
      rejected(await saveRequest({ ...source, configName: `${prefix}stale` }, 'PUT'), 409, '过期版本不能覆盖新配置');
      evidence.versions = true;
      const invalids = [
        ['主数据库注册键', { dsKey: 'master' }, 409],
        ['默认数据库注册键', { dsKey: 'default' }, 409],
        ['下划线数据源组', { dsKey: 'unapproved_group' }, 400],
        ['额外JDBC参数', { url: `${config('x').url}?allowLoadLocalInfile=true` }, 400],
        ['非部署账号', { username: 'root' }, 400],
        ['非部署主机', { url: 'jdbc:mysql://127.0.0.2:3306/cloud_flow_db' }, 400],
        ['浏览器指定驱动类', { driverClass: 'arbitrary.Driver' }, 400],
        ['浏览器指定启用状态', { status: 'ENABLED' }, 400],
        ['超过20个连接', { maxActive: 21 }, 400],
        ['保存星号密码', { password: '********' }, 400],
        ['未批准服务', { targetServices: ['cloudflow-gateway'] }, 400],
        ['CLEAR携带密码', { secretAction: 'CLEAR' }, 400],
      ];
      for (let index = 0; index < invalids.length; index++) {
        const [label, overrides, status] = invalids[index];
        rejected(await saveRequest(config(`invalid-${index}`, overrides)), status, `拒绝${label}`);
      }
      check('全部非法输入没有新增数据库配置', database(`SELECT COUNT(*) FROM sys_data_source_config WHERE ${ownedPredicate};`) === '1');
      rejected(await saveRequest(edit(saved, { dsKey: `${prefix}changed` }), 'PUT'), 409, '已创建注册键不可更换');
      rejected(await api(admin, `${entry}/${saved.configId}/disable`, { method: 'POST', body: { version: saved.version, confirmation: 'wrong' } }), 400, '停用要求准确二次确认');
      const preservedVersion = saved.version;
      saved = clean(await api(admin, `${entry}/${saved.configId}/disable`, { method: 'POST', body: { version: saved.version, confirmation: saved.dsKey } }), '真实HTTP保存停用指令');
      check('停用指令保存新的期望版本', saved.version === preservedVersion + 1 && saved.status === 'DISABLED');
      await waitUntil('auth和HR分别真实落库停用版本', () => database(`SELECT COUNT(*) FROM sys_data_source_registration WHERE tenant_id=100000 AND config_id=${saved.configId} AND status='DISABLED' AND applied_version=${saved.version} AND service_name IN ('cloudflow-auth','cloudflow-service-hr');`) === '2');
      const authService = state.services.find(service => service.name === 'auth');
      const body = { configId: saved.configId, version: saved.version };
      const valid = await directApply(authService, body);
      check('有效签名只应用数据库已有的停用配置', valid.response.status === 200 && valid.response.body?.data?.status === 'DISABLED'
        && valid.response.body.data.appliedVersion === saved.version && valid.response.body.data.instanceKey === valid.target);
      rejected(await valid.repeat(), 403, '同一内部签名不可重放');
      rejected((await directApply(authService, body, { 'X-DataSource-Signature': randomBytes(32).toString('base64url') })).response, 403, '随机内部签名被拒绝');
      rejected((await directApply(authService, body, { 'X-DataSource-Target': '0'.repeat(64) })).response, 403, '不属于该实例的签名被拒绝');
      rejected((await directApply(authService, { ...body, version: saved.version - 1 })).response, 409, '正确签名仍不能回放旧配置版本');
      rejected((await directApply(authService, { ...body, url: config('x').url })).response, 400, '内部指令不能携带任意连接地址');
      evidence.signedDisable = true;
      for (const username of ['g_holiday_employee', 'g_import_tenant']) {
        const other = await session(username);
        try {
          const spoof = { 'X-User-Id': String(operator.userId), 'X-Tenant-Id': '100000', 'X-User-Roles': 'ADMIN' };
          rejected(await api(other, `${entry}/list`, { headers: spoof }), 403, `${username}伪造平台身份不能读取配置`);
          rejected(await api(other, `${entry}/${saved.configId}`, { headers: spoof }), 403, `${username}不能读取已知编号的配置`);
          rejected(await api(other, entry, { method: 'POST', headers: spoof, body: config('unauthorized') }), 403, `${username}不能新增配置`);
          rejected(await api(other, entry, { method: 'PUT', headers: spoof, body: edit(saved) }), 403, `${username}不能修改配置`);
          for (const action of ['test', 'register', 'disable']) {
            const body = action === 'test' ? { version: saved.version } : { version: saved.version, confirmation: saved.dsKey,
              ...(action === 'register' ? { targetServices: saved.targetServices } : {}) };
            rejected(await api(other, `${entry}/${saved.configId}/${action}`, { method: 'POST', headers: spoof, body }), 403, `${username}不能执行${action}`);
          }
        } finally { await other.context().close(); }
      }
      evidence.permissions = true;
      const auditRecords = JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',audit_id,'action',audit_name,'before',before_val,'after',after_val,'highRisk',high_risk,'risk',risk_level,'operator',create_by)),JSON_ARRAY()) FROM sys_audit_log WHERE audit_id>${boundaries.audit} AND tenant_id=100000 AND audit_field='data_source:${saved.configId}' AND audit_name IN ('DATA_SOURCE_CREATE','DATA_SOURCE_UPDATE','DATA_SOURCE_TEST','DATA_SOURCE_DISABLE');`));
      auditRecords.sort((left, right) => left.id - right.id);
      const stateAt = version => `version=${version};status=DISABLED`;
      const expectedAudits = [
        { action: 'CREATE', before: '', after: stateAt(0) },
        ...Array.from({ length: 5 }, (unused, index) => ({ action: 'UPDATE', before: stateAt(index), after: stateAt(index + 1) })),
        { action: 'TEST', before: stateAt(5), after: 'CONNECTION_FAILED' },
        { action: 'UPDATE', before: stateAt(5), after: stateAt(6) },
        { action: 'DISABLE', before: stateAt(6), after: stateAt(7) },
      ];
      check('9笔配置操作与连接测试逐条匹配操作人、版本和高风险审计', auditRecords.length === expectedAudits.length
        && auditRecords.every((record, index) => record.action === `DATA_SOURCE_${expectedAudits[index].action}`
          && record.before === expectedAudits[index].before && record.after === expectedAudits[index].after
          && record.highRisk === 1 && record.risk === 'HIGH' && record.operator === String(operator.userId)));
      const falseSuccesses = database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${boundaries.audit} AND audit_name='DATA_SOURCE_TEST' AND after_val='CONNECTION_VERIFIED';`);
      check('无法认证的账号没有虚假连接成功审计', falseSuccesses === '0');
      console.log(`DATA_SOURCE_AUDIT_CHECK: records=${auditRecords.length}; create=1; update=6; test=1; disable=1; high_risk=true; exact_versions=true; false_connection_successes=${falseSuccesses}`);
    }
    if (!httpOnly) await verifyDataSourceInterface({ ...context, entry, platform, credential, proofKey, redis, config, current, rememberCipher,
      sensitive, verifyIdentity, disabledOnly, waitUntil });
  } finally {
    const records = JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',config_id,'status',status)),JSON_ARRAY()) FROM sys_data_source_config WHERE ${ownedPredicate};`));
    check('本专项产生的配置始终保持停用', records.every(record => record.status === 'DISABLED'));
    database(`START TRANSACTION; DELETE FROM sys_data_source_registration WHERE tenant_id=100000 AND config_id IN (SELECT config_id FROM sys_data_source_config WHERE ${ownedPredicate}); DELETE FROM sys_data_source_config WHERE ${ownedPredicate}; COMMIT;`);
    redis('DEL', proofKey);
    check('结束只清理本次停用测试配置，已有配置数量和角色授权不变', database('SELECT COUNT(*) FROM sys_data_source_config;') === preexisting && grants() === grantsBefore);
    evidence.cleanup = true;
    await new Promise(resolve => setTimeout(resolve, 2000));
    const auditScan = await scanOwnedAuditLogs(state, [...sensitive], boundaries);
    check('实际操作、错误和审计日志均无本次密码、密文或签名', auditScan.leaks === 0 && auditScan.bytes > 0);
    let runtimeBytes = 0;
    for (const [filename, start] of logStarts) {
      const size = (await fs.stat(filename)).size;
      assert.ok(size >= start, 'Service logs must not rotate during verification');
      if (size === start) continue;
      const scanned = await scanSecretStream(createReadStream(filename, { start, end: size - 1 }), [...sensitive]);
      check(`${path.basename(path.dirname(filename))}/${path.basename(filename)}真实新增日志无秘密`, scanned.leaks === 0);
      runtimeBytes += scanned.bytes;
    }
    evidence.secrets = true;
    console.log(`DATA_SOURCE_SECRET_SCAN: values=${sensitive.size}; audit_bytes=${auditScan.bytes}; runtime_bytes=${runtimeBytes}; leaks=0; credential_output=false`);
    console.log('DATA_SOURCE_FOUNDATION_BOUNDARY: account_permission_queries=0; database_accounts_created=0; real_read_only_connection_verified=false; enabled_pool_acceptance=false; production_modified=false');
  }
}
