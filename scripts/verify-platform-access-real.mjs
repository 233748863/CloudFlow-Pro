import assert from 'node:assert/strict';
import { createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyPlatformAccess({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, evidence }) {
  const totpOnly = process.argv.includes('--platform-access-totp-only');
  const entry = '/auth/system/platform/access';
  const reauthenticate = `${entry}/reauthenticate`;
  const credentials = accounts.find(account => account.username === 'g_import_admin');
  assert.ok(credentials?.password, 'Owned integration administrator credentials required');
  const user = JSON.parse(database("SELECT JSON_OBJECT('userId',user_id,'tenantId',tenant_id,'version',version) FROM sys_user WHERE user_name='g_import_admin' AND deleted=0;"));
  assert.ok(Number.isSafeInteger(user.userId) && user.userId > 0 && user.tenantId === 100000 && Number.isSafeInteger(user.version));
  const accountPredicate = `user_id=${user.userId} AND tenant_id=100000 AND user_name='g_import_admin' AND deleted=0`;
  const rawToken = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  const token = rawToken.replace(/^Bearer /, '');
  assert.ok(token.length >= 24);
  const wrongPassword = `Wrong-${caseTag}-${randomBytes(16).toString('hex')}`;
  const sensitive = new Set([credentials.password, token, wrongPassword]);
  const redis = await ownedGatewayRedis(state);
  const proofKey = `auth:platform:recent:internal:${createHash('sha256').update(token).digest('hex')}`;
  const operationBefore = database('SELECT COALESCE(MAX(log_id),0) FROM sys_log;');
  const auditBefore = database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');
  const errorBefore = database('SELECT COALESCE(MAX(error_id),0) FROM sys_api_error_log;');
  const grantsBefore = database("SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;");
  const logBaseline = new Map();
  async function logs(parent, destination) {
    for (const item of await fs.readdir(parent, { withFileTypes: true })) {
      if (item.isSymbolicLink() || ['mysql-data', 'profile', 'private'].includes(item.name)) continue;
      const filename = path.join(parent, item.name);
      if (item.isDirectory()) await logs(filename, destination);
      else if (item.name.endsWith('.log')) destination.set(filename, (await fs.stat(filename)).size);
    }
  }
  await logs(directory, logBaseline);
  const containsSensitive = content => [...sensitive].some(value => /^[0-9]{6}$/.test(value)
    ? new RegExp(`(?<![0-9])${value}(?![0-9])`).test(content) : content.includes(value));
  const safeResponse = response => !containsSensitive(JSON.stringify(response));
  const rejected = (response, code, label) => {
    check(label, response.status === code && response.body?.code === code && response.body?.data == null && safeResponse(response));
  };
  const status = async label => {
    const response = await api(admin, entry);
    const result = successful(response, label);
    check(`${label}仅返回明确的身份状态`, safeResponse(response)
      && Object.keys(result).every(key => ['configured', 'verified', 'totpRequired', 'verifiedUntil', 'message'].includes(key)));
    return result;
  };
  const verifyTotp = async () => {
    const properties = await fs.readFile(path.join(directory, 'auth', 'integration.properties'), 'utf8');
    const property = name => properties.split(/\r?\n/).find(line => line.startsWith(`${name}=`))?.slice(name.length + 1);
    const encryptionKey = property('cloudflow.auth.totp.encryption-key');
    check('真实动态验证码使用独立测试加密密钥', property('cloudflow.auth.totp.enabled') === 'true'
      && encryptionKey?.length >= 32 && encryptionKey !== property('cloudflow.message.secret-key')
      && encryptionKey !== property('cloudflow.file-storage.secret-key'));
    sensitive.add(encryptionKey);
    const challengePredicate = `user_id=${user.userId} AND tenant_id=${user.tenantId}`;
    check('仅使用未登记动态验证码的自有验收账号', database(`SELECT COUNT(*) FROM sys_user_totp WHERE ${challengePredicate};`) === '0');
    const totpEntry = '/auth/profile/totp';
    const readRecord = () => JSON.parse(database(`SELECT JSON_OBJECT('id',id,'cipher',secret_ciphertext,'enabled',enabled,'step',last_used_step) FROM sys_user_totp WHERE ${challengePredicate};`));
    let secretBytes;
    const generateCode = step => {
      const counter = Buffer.alloc(8);
      counter.writeBigUInt64BE(BigInt(step));
      const digest = createHmac('sha1', secretBytes).update(counter).digest();
      return String((digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
    };
    const rememberCode = step => {
      const code = generateCode(step);
      sensitive.add(code);
      return code;
    };
    try {
      const initialTotp = successful(await api(admin, `${totpEntry}/status`), '读取真实动态验证码登记状态');
      check('测试部署可登记且账号尚未开启动态验证码', initialTotp.featureEnabled && !initialTotp.enabled);
      const passwordOnly = successful(await api(admin, reauthenticate, { method: 'POST', body: { password: credentials.password } }), '登记验证码前真实密码验证');
      const firstAttemptAt = Date.now();
      check('未登记验证码时真实密码产生可撤回凭据', passwordOnly.verified && !passwordOnly.totpRequired && redis('EXISTS', proofKey) === '1');
      const setup = successful(await api(admin, `${totpEntry}/setup`, { method: 'POST', body: { password: credentials.password } }), '真实HTTP创建动态验证码密钥');
      check('只有本人登记响应返回标准动态验证码密钥', /^[A-Z2-7]{32}$/.test(setup.manualEntryKey)
        && setup.otpAuthUri.startsWith('otpauth://totp/'));
      sensitive.add(setup.manualEntryKey);
      sensitive.add(setup.otpAuthUri);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      const bits = [...setup.manualEntryKey].map(character => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('');
      secretBytes = Buffer.from(bits.match(/.{8}/g).map(chunk => Number.parseInt(chunk, 2)));
      const enrolled = readRecord();
      sensitive.add(enrolled.cipher);
      check('真实登记只保存带版本的密文', enrolled.enabled === 0 && enrolled.cipher.startsWith('v1:')
        && !enrolled.cipher.includes(setup.manualEntryKey));
      const encrypted = Buffer.from(enrolled.cipher.slice(3), 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(encryptionKey.trim()).digest(), encrypted.subarray(0, 12));
      decipher.setAuthTag(encrypted.subarray(-16));
      check('独立解密数据库密文与本人登记密钥一致', Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]).toString('utf8') === setup.manualEntryKey);
      if (Date.now() % 30000 > 26000) await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
      const enabledStep = Math.floor(Date.now() / 30000) - 1;
      const enabledCode = rememberCode(enabledStep);
      const enabled = successful(await api(admin, `${totpEntry}/enable`, { method: 'POST', body: { password: credentials.password, code: enabledCode } }), '真实HTTP启用动态验证码');
      check('实际验证码验证后登记状态与消费时间步入库', enabled.featureEnabled && enabled.enabled
        && readRecord().enabled === 1 && readRecord().step === enabledStep);
      const changed = await status('开启动态验证码后原平台凭据检查');
      check('开启动态验证码立即撤销原密码凭据', changed.totpRequired && !changed.verified && redis('EXISTS', proofKey) === '0');
      rejected(await api(admin, reauthenticate, { method: 'POST', body: { password: credentials.password } }), 403, '真实已登记账号不能只提交正确密码');
      const currentStep = Math.floor(Date.now() / 30000);
      const allowed = new Set([-1, 0, 1].map(offset => generateCode(currentStep + offset)));
      let incorrect = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, '0');
      while (allowed.has(incorrect)) incorrect = String((Number(incorrect) + 1) % 1000000).padStart(6, '0');
      sensitive.add(incorrect);
      rejected(await api(admin, reauthenticate, { method: 'POST', body: { password: credentials.password, totpCode: incorrect } }), 403, '真实错误动态验证码拒绝平台身份');
      check('缺失和错误验证码均不消耗正确时间步或发放凭据', readRecord().step === enabledStep && redis('EXISTS', proofKey) === '0');
      const validStep = Math.floor(Date.now() / 30000);
      const validCode = rememberCode(validStep);
      const verified = successful(await api(admin, reauthenticate, { method: 'POST', body: { password: credentials.password, totpCode: validCode } }), '真实密码和动态验证码同时验证');
      check('真实双因素核验写凭据并消费验证码时间步', verified.verified && verified.totpRequired && safeResponse(verified)
        && readRecord().step === validStep && redis('EXISTS', proofKey) === '1');
      rejected(await api(admin, reauthenticate, { method: 'POST', body: { password: credentials.password, totpCode: validCode } }), 403, '同一真实动态验证码不能重放');
      check('验证码重放失败不能保留高风险凭据', redis('EXISTS', proofKey) === '0');
      const remaining = Math.max(0, firstAttemptAt + 61000 - Date.now());
      if (remaining > 0) {
        console.log('WAIT 保留再次验证每分钟五次限制，等待下一窗口后测试真实验证码并发');
        await new Promise(resolve => setTimeout(resolve, remaining));
      }
      const concurrentStep = Math.floor(Date.now() / 30000);
      check('并发验证使用尚未消费的新时间步', concurrentStep > readRecord().step);
      const concurrentCode = rememberCode(concurrentStep);
      const competing = await Promise.all([0, 1].map(() => api(admin, reauthenticate, {
        method: 'POST', body: { password: credentials.password, totpCode: concurrentCode },
      })));
      check('同一验证码并发请求仅一次成功且另一次明确拒绝', competing.filter(response => response.status === 200 && response.body?.code === 200 && response.body.data?.verified).length === 1
        && competing.filter(response => response.status === 403 && response.body?.code === 403 && response.body.data == null).length === 1
        && competing.every(safeResponse) && readRecord().step === concurrentStep);
      check('成功核验有三笔高风险审计，错误和重放没有成功记录', database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${auditBefore} AND tenant_id=${user.tenantId} AND create_by='${user.userId}' AND audit_name='PLATFORM_REAUTHENTICATION' AND after_val='IDENTITY_VERIFIED' AND high_risk=1 AND risk_level='HIGH';`) === '3');
      database(`UPDATE sys_user_totp SET secret_ciphertext='v1:invalid-owned-platform-fixture' WHERE ${challengePredicate} AND id=${enrolled.id};`);
      const damaged = await status('自有验证码密文损坏后读取');
      check('验证码配置变动仍要求双因素并使凭据失效', damaged.totpRequired && !damaged.verified);
      rejected(await api(admin, reauthenticate, { method: 'POST', body: { password: credentials.password, totpCode: rememberCode(Math.floor(Date.now() / 30000) + 1) } }), 403, '真实验证码解密失败不会退回只验证密码');
      evidence.realTotp = true;
      evidence.totpEncrypted = true;
      evidence.totpReplay = true;
      evidence.totpConcurrent = true;
      evidence.totpFailClosed = true;
      evidence.audit = true;
      console.log('PLATFORM_TOTP_REAL: setup_http=true; enable_http=true; encrypted_fields=1; verified_decryptions=1; missing_code_rejected=true; wrong_code_rejected=true; replay_rejected=true; concurrent_success=1; concurrent_rejected=1; corrupt_cipher_fixture=owned_row_only; password_fallback=false; success_audits=3');
    } finally {
      if (database(`SELECT COUNT(*) FROM sys_user_totp WHERE ${challengePredicate};`) !== '0') {
        successful(await api(admin, `${totpEntry}/disable`, { method: 'POST', body: { password: credentials.password } }), '恢复本次自有账号原验证码登记状态');
      }
      check('自有测试账号恢复为未登记验证码且未保留密文', database(`SELECT COUNT(*) FROM sys_user_totp WHERE ${challengePredicate};`) === '0');
      redis('DEL', proofKey);
      const restored = await status('恢复验证码登记状态后检查');
      check('账号恢复后仍需再次验证且不残留高风险凭据', !restored.totpRequired && !restored.verified);
      evidence.totpAccountRestored = true;
    }
  };
  let originalVersionRestored = true;
  try {
    const initial = await status('读取平台管理状态');
    check('首次读取不具有再次身份验证凭据', initial.verified === false && initial.verifiedUntil == null);
    evidence.mode = totpOnly ? 'totp' : initial.configured ? 'enabled' : 'disabled';
    for (const username of ['g_holiday_employee', 'g_import_tenant']) {
      const other = await session(username);
      try {
        const expected = username === 'g_holiday_employee' || initial.configured;
        const response = await api(other, entry, { headers: { 'X-User-Id': String(user.userId), 'X-Tenant-Id': '100000', 'X-User-Roles': 'ADMIN' } });
        if (expected) rejected(response, 403, `${username}不能使用伪造身份取得平台入口`);
        else check('停用状态不包含平台管理员或租户名单', successful(response, '普通租户查看停用状态').configured === false && safeResponse(response));
        rejected(await api(other, reauthenticate, { method: 'POST', body: { password: wrongPassword },
          headers: { 'X-User-Id': String(user.userId), 'X-Tenant-Id': '100000', 'X-User-Roles': 'ADMIN' } }),
        expected ? 403 : 503, `${username}不能通过再次验证扩大权限`);
      } finally { await other.context().close(); }
    }
    evidence.roleBoundaries = true;
    if (totpOnly) {
      check('动态验证码专项要求明确启用的平台部署', initial.configured && !initial.totpRequired);
      await verifyTotp();
    } else if (!initial.configured) {
      check('部署未配置时明确停用且不给出验证码挑战', initial.totpRequired === false && /停用/.test(initial.message));
      rejected(await api(admin, reauthenticate, { method: 'POST', body: { password: credentials.password } }), 503, '真实管理员密码正确也不能绕过空部署名单');
      check('停用路径不写入任何平台凭据', redis('EXISTS', proofKey) === '0');
      check('停用路径没有身份通过审计', database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${auditBefore} AND audit_name='PLATFORM_REAUTHENTICATION';`) === '0');
      evidence.defaultDisabled = true;
    } else {
      rejected(await api(admin, reauthenticate, { method: 'POST', body: { password: wrongPassword } }), 403, '真实错误密码不能取得平台凭据');
      const verify = async label => {
        const response = await api(admin, reauthenticate, { method: 'POST', body: { password: credentials.password } });
        const result = successful(response, label);
        check(`${label}通过且只返回五分钟状态`, result.configured && result.verified && !result.totpRequired
          && result.verifiedUntil > Date.now() && result.verifiedUntil <= Date.now() + 300000 && safeResponse(response));
        return result;
      };
      await verify('真实密码再次验证');
      let proof = JSON.parse(redis('GET', proofKey));
      check('真实Redis只保存会话哈希键和凭据指纹', proof.userId === user.userId && proof.tenantId === user.tenantId
        && /^[a-f0-9]{64}$/.test(proof.credentialStamp) && proof.expiresAt - proof.authenticatedAt === 300000
        && [...sensitive].every(value => !JSON.stringify(proof).includes(value)) && !proofKey.includes(token));
      const ttl = Number(redis('TTL', proofKey));
      check('真实Redis有效期为300秒以内', ttl > 290 && ttl <= 300);
      check('原会话可读取已通过状态', (await status('读取再次验证状态')).verified === true);
      evidence.realProof = true;
      redis('PEXPIRE', proofKey, '1');
      await new Promise(resolve => setTimeout(resolve, 25));
      check('仅提前到期自有测试凭据后访问立即要求重验', (await status('真实Redis到期后读取')).verified === false && redis('EXISTS', proofKey) === '0');
      await verify('凭据到期后再次验证');
      proof = JSON.parse(redis('GET', proofKey));
      redis('SET', proofKey, JSON.stringify({ ...proof, tenantId: user.tenantId + 1 }), 'EX', '300');
      check('数据库外注入的错租户凭据被拒绝并移除', (await status('错租户凭据检查')).verified === false && redis('EXISTS', proofKey) === '0');
      await verify('错租户凭据清除后再次验证');
      database(`UPDATE sys_user SET version=version+1 WHERE ${accountPredicate} AND version=${user.version};`);
      originalVersionRestored = false;
      check('账户版本变动立即要求再次验证', (await status('真实账户版本变动')).verified === false);
      database(`UPDATE sys_user SET version=${user.version} WHERE ${accountPredicate} AND version=${user.version + 1};`);
      check('测试账号版本按原值恢复', database(`SELECT version FROM sys_user WHERE ${accountPredicate};`) === String(user.version));
      originalVersionRestored = true;
      await verify('账号版本恢复后再次验证');
      rejected(await api(admin, reauthenticate, { method: 'POST', body: { password: credentials.password } }), 429, '同一用户一分钟第六次真实再次验证被限流');
      evidence.lifetime = true;
      evidence.rateLimit = true;
      check('真实成功身份验证逐次追加高风险审计', database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${auditBefore} AND tenant_id=100000 AND create_by='${user.userId}' AND audit_name='PLATFORM_REAUTHENTICATION' AND audit_field='platform_identity' AND before_val='REAUTHENTICATION_REQUIRED' AND after_val='IDENTITY_VERIFIED' AND high_risk=1 AND risk_level='HIGH';`) === '4');
      evidence.audit = true;
      redis('DEL', proofKey);
      check('只清理本次会话凭据后恢复待验证状态', (await status('清理本次平台凭据')).verified === false);
      evidence.proofBoundaries = true;
      console.log(`PLATFORM_REAUTH_REAL_LIMIT: allowed=5; rejected_request=6; http=429; code=429; configured_ttl_seconds=300; measured_ttl_seconds=${ttl}; expiry_fixture=owned_key_shortened`);
    }
  } finally {
    if (!originalVersionRestored) {
      database(`UPDATE sys_user SET version=${user.version} WHERE ${accountPredicate} AND version=${user.version + 1};`);
      assert.equal(database(`SELECT version FROM sys_user WHERE ${accountPredicate};`), String(user.version), 'Owned account version restoration required');
    }
    redis('DEL', proofKey);
    const grantsAfter = database("SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;");
    check('所有角色菜单授权保持逐行不变', grantsAfter === grantsBefore);
  }
  await new Promise(resolve => setTimeout(resolve, 1500));
  const logAfter = new Map();
  await logs(directory, logAfter);
  let scannedBytes = 0;
  let scannedFiles = 0;
  let leaks = 0;
  for (const [filename, size] of logAfter) {
    const before = logBaseline.get(filename) || 0;
    const start = size >= before ? before : 0;
    if (start === size) continue;
    const file = await fs.open(filename, 'r');
    try {
      const content = Buffer.alloc(size - start);
      await file.read(content, 0, content.length, start);
      scannedBytes += content.length;
      scannedFiles++;
      if (containsSensitive(content.toString('utf8'))) leaks++;
    } finally { await file.close(); }
  }
  const operations = database(`SELECT CONCAT_WS('|',params,exception,request_uri) FROM sys_log WHERE log_id>${operationBefore};`);
  const audits = database(`SELECT CONCAT_WS('|',before_val,after_val,before_json,after_json,diff_json) FROM sys_audit_log WHERE audit_id>${auditBefore};`);
  const errors = database(`SELECT CONCAT_WS('|',request_params,exception_message,exception_stack) FROM sys_api_error_log WHERE error_id>${errorBefore};`);
  check('真实请求产生操作日志', Number(database(`SELECT COUNT(*) FROM sys_log WHERE log_id>${operationBefore} AND request_uri='/system/platform/access/reauthenticate';`)) > 0);
  check('本轮新增服务日志及操作、审计、错误记录不泄漏凭据', scannedFiles > 0 && scannedBytes > 0 && leaks === 0
    && [operations, audits, errors].every(content => !containsSensitive(content)));
  evidence.secrets = true;
  check('本专项未创建任何套餐表或菜单', database("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name LIKE 'sys_tenant_package%';") === '0'
    && database('SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1970 AND 1972;') === '0');
  console.log(`PLATFORM_ACCESS_LOG_SCAN: mode=${evidence.mode}; service_files_with_new_bytes=${scannedFiles}; new_bytes=${scannedBytes}; sensitive_values=${sensitive.size}; leaks=${leaks}; database_audit_checked=true; historical_logs_recertified=false; production_modified=false`);
}
