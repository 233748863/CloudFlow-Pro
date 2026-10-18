import assert from 'node:assert/strict';
import { createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyConfiguration({ admin, api, successful, session, database, check, directory, caseTag }) {
  const channelPath = '/auth/system/message/channel';
  const storagePath = '/auth/system/file/config';
  const code = `configuration_${caseTag}`;
  const secrets = { api: randomBytes(24).toString('base64url'), smtp: randomBytes(24).toString('base64url'), storage: randomBytes(24).toString('base64url') };
  const sensitive = new Set(Object.values(secrets));
  const properties = await fs.readFile(path.join(directory, 'auth', 'integration.properties'), 'utf8');
  const property = name => properties.split(/\r?\n/).find(line => line.startsWith(`${name}=`))?.slice(name.length + 1);
  const messageKey = property('cloudflow.message.secret-key');
  const storageKey = property('cloudflow.file-storage.secret-key');
  check('验收使用独立随机消息与存储加密口令', messageKey?.length >= 32 && storageKey?.length >= 32 && messageKey !== storageKey);
  sensitive.add(messageKey); sensitive.add(storageKey);
  const decrypted = (encoded, key) => {
    const payload = Buffer.from(encoded, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(-16));
    return Buffer.concat([decipher.update(payload.subarray(12, -16)), decipher.final()]).toString('utf8');
  };
  const encrypted = (encoded, plain, key) => {
    if (typeof encoded !== 'string' || Buffer.from(encoded, 'base64').length !== Buffer.byteLength(plain) + 28 || encoded.includes(plain)) return false;
    try { return decrypted(encoded, key) === plain; } catch { return false; }
  };
  const clean = value => [...sensitive].every(secret => !JSON.stringify(value).includes(secret));
  const denied = result => result.status === 403 || result.body?.code === 403;
  const queryRow = statement => JSON.parse(database(statement));
  const authLog = path.join(directory, 'auth', 'logs', 'auth-service.log');
  const logSizeBefore = (await fs.stat(authLog)).size;
  const auditBefore = database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');
  const operationLogBefore = database('SELECT COALESCE(MAX(log_id),0) FROM sys_log;');
  const masterBefore = database('SELECT config_id FROM sys_file_config WHERE tenant_id=100000 AND master_flag=1 AND deleted=0 ORDER BY config_id;');
  const messageBefore = database('SELECT COUNT(*) FROM sys_message_record;');
  const channelBody = { channelType: 'EMAIL', channelCode: code, channelName: code, status: 'DISABLED', smtpHost: '127.0.0.1', smtpPort: 9, smtpUsername: 'disabled-test', apiSecret: secrets.api, smtpPwd: secrets.smtp };
  const storageBody = { configCode: code, configName: code, storageType: 'MINIO', masterFlag: 0, status: 'DISABLED', endpoint: 'http://127.0.0.1:9', region: 'us-east-1', bucket: 'configuration-check', accessKey: 'disabled-test', secretKey: secrets.storage, accessPolicy: '0' };
  let channelId;
  let configId;
  let operationFailure;
  const cleanupFailures = [];
  const cleanup = async operation => { try { await operation(); } catch (error) { cleanupFailures.push(error); } };
  try {
    successful(await api(admin, channelPath, { method: 'POST', body: channelBody }), '真实HTTP新增含非空密钥的停用消息渠道');
    channelId = database(`SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND channel_code='${code}' AND deleted=0;`);
    assert.match(channelId, /^\d+$/);
    const channelStatement = `SELECT JSON_OBJECT('api',api_secret_cipher,'smtp',smtp_pwd_cipher,'status',status) FROM sys_message_channel WHERE tenant_id=100000 AND channel_id=${channelId};`;
    const storedChannel = queryRow(channelStatement);
    sensitive.add(storedChannel.api); sensitive.add(storedChannel.smtp);
    check('消息两项密钥均为可独立解密验证的数据库密文', storedChannel.status === 'DISABLED' && encrypted(storedChannel.api, secrets.api, messageKey) && encrypted(storedChannel.smtp, secrets.smtp, messageKey));
    const channel = successful(await api(admin, `${channelPath}/${channelId}`), '读取消息渠道');
    console.log(`CONFIGURATION_SECRET_PROJECTION: api_mask_present=${typeof channel.apiSecret === 'string'}; api_last_four_match=${channel.apiSecret === `****${secrets.api.slice(-4)}`}; smtp_mask_present=${typeof channel.smtpPwd === 'string'}; smtp_last_four_match=${channel.smtpPwd === `****${secrets.smtp.slice(-4)}`}; protected_fields_absent=${!Object.hasOwn(channel, 'apiSecretCipher') && !Object.hasOwn(channel, 'smtpPwdCipher')}; secret_values_absent=${clean(channel)}`);
    check('消息详情只返回每项密钥后四位且不暴露密文', channel.apiSecret === `****${secrets.api.slice(-4)}` && channel.smtpPwd === `****${secrets.smtp.slice(-4)}` && !Object.hasOwn(channel, 'apiSecretCipher') && !Object.hasOwn(channel, 'smtpPwdCipher') && clean(channel));
    successful(await api(admin, channelPath, { method: 'PUT', body: { ...channelBody, channelId, apiSecret: channel.apiSecret, smtpPwd: channel.smtpPwd, channelName: `${code}_updated` } }), '保留脱敏密钥修改渠道');
    const preservedChannel = queryRow(channelStatement);
    check('回传脱敏占位保留原消息密文', preservedChannel.api === storedChannel.api && preservedChannel.smtp === storedChannel.smtp);
    const storage = successful(await api(admin, storagePath, { method: 'POST', body: storageBody }), '真实HTTP新增含非空密钥的停用存储');
    configId = String(storage.configId);
    assert.match(configId, /^\d+$/);
    const storageStatement = `SELECT JSON_OBJECT('cipher',secret_key_cipher,'status',status,'master',master_flag) FROM sys_file_config WHERE tenant_id=100000 AND config_id=${configId};`;
    const storedStorage = queryRow(storageStatement);
    sensitive.add(storedStorage.cipher);
    check('存储密钥为可独立解密验证的数据库密文', encrypted(storedStorage.cipher, secrets.storage, storageKey) && storedStorage.status === 'DISABLED' && storedStorage.master === 0);
    check('消息加密口令不能解密存储密钥', !encrypted(storedStorage.cipher, secrets.storage, messageKey));
    const detail = successful(await api(admin, `${storagePath}/${configId}`), '读取存储详情');
    check('存储创建与详情响应均不含明文或密文', [storage, detail].every(record => !Object.hasOwn(record, 'secretKey') && !Object.hasOwn(record, 'secretKeyCipher') && clean(record)));
    const { secretKey: omittedSecret, ...storageUpdate } = storageBody;
    successful(await api(admin, storagePath, { method: 'PUT', body: { ...storageUpdate, configId, version: detail.version, configName: `${code}_updated` } }), '未提交密钥时修改存储名称');
    check('省略存储密钥保留原密文', queryRow(storageStatement).cipher === storedStorage.cipher);
    for (const route of [`${channelPath}/list?pageSize=100`, `${storagePath}/list?pageSize=100`]) {
      const page = successful(await api(admin, route), '管理员读取配置列表');
      check(`${route}列表无明文或密文泄漏`, clean(page));
    }
    for (const username of ['g_holiday_employee', 'g_import_tenant']) {
      const other = await session(username);
      try {
        for (const route of [`${channelPath}/${channelId}`, `${storagePath}/${configId}`]) {
          const response = await api(other, route);
          const expectedCode = username === 'g_import_tenant' && route.startsWith(channelPath) ? 404 : 403;
          check(`${username}不能读取本租户受保护密钥配置`, (response.status === expectedCode || response.body?.code === expectedCode) && !response.body?.data && clean(response));
        }
        if (username === 'g_holiday_employee') {
          check('EMPLOYEE不能新增消息渠道', denied(await api(other, channelPath, { method: 'POST', body: { ...channelBody, channelCode: `${code}_denied` } })));
          check('EMPLOYEE不能新增存储配置', denied(await api(other, storagePath, { method: 'POST', body: { ...storageBody, configCode: `${code}_denied` } })));
        }
      } finally { await other.context().close(); }
    }
    check('拒绝写入未产生额外配置记录', database(`SELECT (SELECT COUNT(*) FROM sys_message_channel WHERE channel_code='${code}_denied') + (SELECT COUNT(*) FROM sys_file_config WHERE config_code='${code}_denied');`) === '0');
    check('停用配置未触发外部消息发送', database('SELECT COUNT(*) FROM sys_message_record;') === messageBefore);
  } catch (error) {
    operationFailure = error;
  } finally {
    if (channelId) {
      await cleanup(async () => {
        successful(await api(admin, `${channelPath}/${channelId}`, { method: 'DELETE' }), '清理本次隔离消息渠道');
        check('本次消息渠道已逻辑删除', database(`SELECT COUNT(*) FROM sys_message_channel WHERE channel_id=${channelId} AND channel_code='${code}' AND deleted=1;`) === '1');
      });
    }
    if (configId) {
      await cleanup(async () => {
        successful(await api(admin, `${storagePath}/${configId}`, { method: 'DELETE' }), '清理本次隔离存储配置');
        check('本次存储配置已逻辑删除', database(`SELECT COUNT(*) FROM sys_file_config WHERE config_id=${configId} AND config_code='${code}' AND deleted=1;`) === '1');
      });
    }
    check('默认存储配置未变更', database('SELECT config_id FROM sys_file_config WHERE tenant_id=100000 AND master_flag=1 AND deleted=0 ORDER BY config_id;') === masterBefore);
  }
  if (operationFailure || cleanupFailures.length) {
    const failures = [operationFailure, ...cleanupFailures].filter(Boolean);
    throw new AggregateError(failures, failures.map(error => error.message).join('; '));
  }
  const logFiles = [];
  async function collectLogs(parent) {
    for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['private', 'mysql-data', 'profile'].includes(entry.name)) continue;
      const filename = path.join(parent, entry.name);
      if (entry.isDirectory()) await collectLogs(filename);
      else if (entry.name.endsWith('.log')) logFiles.push(filename);
    }
  }
  await collectLogs(directory);
  let scannedBytes = 0;
  let leaks = 0;
  for (const filename of logFiles) {
    const content = await fs.readFile(filename, 'utf8');
    scannedBytes += Buffer.byteLength(content);
    for (const value of sensitive) if (content.includes(value)) leaks++;
  }
  const auditRows = database(`SELECT CONCAT_WS('|',before_val,after_val,before_json,after_json,diff_json) FROM sys_audit_log WHERE audit_id>${auditBefore};`);
  const operationRows = database(`SELECT CONCAT_WS('|',params,exception,request_uri) FROM sys_log WHERE log_id>${operationLogBefore};`);
  check('实际认证日志记录本次请求且所有运行日志均无明文或密文', (await fs.stat(authLog)).size > logSizeBefore && logFiles.length > 0 && leaks === 0);
  check('本次数据库审计与操作日志内容没有秘密值', clean(auditRows) && clean(operationRows));
  console.log('CONFIGURATION_SECRETS_AT_REST: encrypted_fields=3; verified_decryptions=3; plaintext_fields=0; http_secret_leaks=0; external_send_requests=0; real_http=true; isolated_mysql=true; isolated_redis=true');
  console.log(`CONFIGURATION_LOG_SCAN: files=${logFiles.length}; bytes=${scannedBytes}; sensitive_values=${sensitive.size}; leaks=${leaks}; production_modified=false`);
}
