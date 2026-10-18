import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { verifyDataSourceLiveUi } from './verify-data-source-live-ui.mjs';

export async function verifyDataSourceLive(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, state, accounts, evidence } = context;
  const liveUi = process.argv.includes('--data-source-recovery-ui-only');
  const recovery = process.argv.includes('--data-source-recovery-http-only') || liveUi;
  evidence.mode = liveUi ? 'recovery-ui' : recovery ? 'recovery-http' : 'live-http';
  const entry = '/auth/system/data-source';
  const platform = '/auth/system/platform/access';
  const credential = accounts.find(account => account.username === 'g_import_admin');
  assert.ok(credential?.password);
  const token = (await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken())).replace(/^Bearer /, '');
  const redis = await ownedGatewayRedis(state);
  const proofKey = `auth:platform:recent:internal:${createHash('sha256').update(token).digest('hex')}`;
  const readonlyPassword = randomBytes(36).toString('base64url');
  const writablePassword = randomBytes(36).toString('base64url');
  const wrongPassword = randomBytes(36).toString('base64url');
  const role = `dsrole_${caseTag}`;
  const users = ['h5_source_ro', 'h5_source_rw'];
  assert.match(role, /^dsrole_[a-f0-9]{12}$/);
  const sensitive = new Set([credential.password, token, readonlyPassword, writablePassword, wrongPassword]);
  const properties = await fs.readFile(path.join(directory, 'auth/integration.properties'), 'utf8');
  for (const key of ['cloudflow.datasource.runtime.secret-key', 'cloudflow.datasource.runtime.control-key']) {
    const value = properties.split(/\r?\n/).filter(line => line.startsWith(`${key}=`)).at(-1)?.slice(key.length + 1);
    assert.ok(value?.length >= 32);
    sensitive.add(value);
  }
  const services = state.services.filter(service => service.name !== 'gateway');
  assert.equal(services.length, 5);
  let peer;
  let peerPath;
  if (recovery) {
    peerPath = await fs.realpath(process.env.CLOUDFLOW_DATASOURCE_PEER_FIXTURE || '');
    assert.equal(path.dirname(path.dirname(peerPath)), await fs.realpath(path.join(directory, 'private')));
    assert.match(path.basename(path.dirname(peerPath)), /^data-source-peer-[a-f0-9]{32}$/);
    assert.equal(path.basename(peerPath), 'peer.json');
    peer = JSON.parse(await fs.readFile(peerPath, 'utf8'));
    assert.equal(peer.directory, path.dirname(peerPath));
    assert.equal(peer.statePath, path.join(directory, 'state.json'));
    assert.equal(peer.application, 'cloudflow-service-hr');
    assert.equal(peer.status, 'RUNNING');
    assert.ok(Number.isInteger(peer.port) && peer.port > 1024 && peer.port < 65536);
    assert.equal((await (await fetch(`http://127.0.0.1:${peer.healthPort}/actuator/health`)).json()).status, 'UP');
  }
  const targets = services.map(service => service.application).sort();
  const instanceKey = service => createHash('sha256').update(`${service.application}\n127.0.0.1\n${service.port}\nfalse`).digest('hex');
  const expectedKeys = new Set((peer ? [...services, peer] : services).map(instanceKey));
  const instanceCount = expectedKeys.size;
  assert.equal(instanceCount, recovery ? 6 : 5);
  const controlPeer = async action => {
    assert.ok(recovery && ['Stop', 'Start', 'ExcludeDiscovery', 'IncludeDiscovery'].includes(action));
    const root = path.resolve(directory, '../../..');
    const outputPath = path.join(peer.directory, `control-${action}-${randomBytes(12).toString('hex')}.log`);
    const output = await fs.open(outputPath, 'wx');
    let result;
    try {
      result = spawnSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe', ['-NoProfile', '-NonInteractive', '-File',
        path.join(root, 'scripts/configure-data-source-peer.ps1'), '-StatePath', path.join(directory, 'state.json'),
        '-FixturePath', peerPath, '-Action', action], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 400000,
        stdio: ['ignore', output.fd, output.fd] });
    } finally { await output.close(); }
    console.log((await fs.readFile(outputPath, 'utf8')).trim());
    assert.ok(!result.error && result.status === 0, `Owned peer ${action} failed: exit=${result.status}; error=${result.error?.code || 'none'}`);
  };
  const prefix = `h5-live-${caseTag}-`;
  const predicate = `tenant_id=100000 AND ds_key LIKE '${prefix}%'`;
  const existingCount = database('SELECT COUNT(*) FROM sys_data_source_config;');
  const grants = () => database("SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;");
  const previousGrants = grants();
  const boundaries = { log: database('SELECT COALESCE(MAX(log_id),0) FROM sys_log;'),
    error: database('SELECT COALESCE(MAX(error_id),0) FROM sys_api_error_log;'),
    audit: database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;') };
  const logStarts = new Map();
  const authLogNames = new Set(await fs.readdir(path.join(directory, 'auth')));
  for (const service of state.services) for (const name of ['stdout.log', 'stderr.log']) {
    const filename = path.join(directory, service.name, name);
    logStarts.set(filename, (await fs.stat(filename)).size);
  }
  const noLeak = value => [...sensitive].every(secret => !JSON.stringify(value).includes(secret));
  const clean = (response, label) => {
    const result = successful(response, label);
    check(`${label}响应禁止缓存且无秘密`, response.cacheControl === 'no-store' && noLeak(response)
      && !/"(?:password|passwordEncrypted|password_encrypted|secretKey|controlKey)"\s*:/.test(JSON.stringify(result)));
    return result;
  };
  const rejected = (response, code, label) => check(label, response.status === code && response.body?.code === code && response.body.data == null && noLeak(response));
  const waitUntil = async (label, condition, milliseconds = 45000) => {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) {
      if (await condition()) { check(label, true); return; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    check(label, false);
  };
  const userQuery = users.map(username => `'${username}'`).join(',');
  check('只创建无冲突的自有专项账号和角色', database(`SELECT COUNT(*) FROM mysql.user WHERE User IN (${userQuery},'${role}');`) === '0');
  check('本轮配置前缀无冲突', database(`SELECT COUNT(*) FROM sys_data_source_config WHERE ${predicate};`) === '0');
  const fixtureSql = statement => {
    const environment = { ...process.env };
    delete environment.MYSQL_PWD;
    const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
      '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], {
      input: statement, encoding: 'utf8', timeout: 30000, windowsHide: true, env: environment,
    });
    assert.ok(result.status === 0, `Owned account fixture failed: exit=${result.status}; stderr_bytes=${Buffer.byteLength(result.stderr || '')}`);
  };
  const connections = () => JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',ID,'user',USER,'database',DB)),JSON_ARRAY()) FROM information_schema.PROCESSLIST WHERE USER IN (${userQuery});`));
  const connectionIds = () => connections().map(connection => String(connection.id)).sort();
  const rows = configId => JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('service',service_name,'instance',instance_key,'version',applied_version,'status',status,'error',error_code)),JSON_ARRAY()) FROM sys_data_source_registration WHERE tenant_id=100000 AND config_id=${configId};`));
  const applied = async (config, status, version = config.version, error = null) => {
    await waitUntil(`${instanceCount}个实例记录实际${status}及版本${version}`, () => {
      const instances = rows(config.configId);
      return instances.length === instanceCount && instances.every(instance => expectedKeys.has(instance.instance) && instance.status === status
        && instance.version === version && instance.error === error) && new Set(instances.map(instance => instance.instance)).size === instanceCount;
    });
    const detail = clean(await api(admin, `${entry}/${config.configId}`), '平台详情读取实际实例状态');
    check('平台详情与数据库实例版本状态逐条一致', detail.version === config.version && detail.status === config.status && detail.instances.length === instanceCount
      && detail.instances.every(instance => expectedKeys.has(instance.instanceKey) && instance.appliedVersion === version && instance.status === status && instance.errorCode === error));
  };
  const rememberCipher = configId => {
    const encrypted = database(`SELECT password_encrypted FROM sys_data_source_config WHERE ${predicate} AND config_id=${configId};`);
    assert.match(encrypted, /^ds1:/);
    sensitive.add(encrypted);
  };
  const save = async (config, changes, label) => {
    const body = { configId: config.configId, version: config.version, configName: config.configName, dsKey: config.dsKey, url: config.url,
      username: config.username, maxActive: config.maxActive, targetServices: config.targetServices, secretAction: 'KEEP', ...changes };
    const result = clean(await api(admin, entry, { method: 'PUT', body }), label);
    rememberCipher(result.configId);
    check(`${label}仅增加一个期望版本`, result.version === config.version + 1);
    return result;
  };
  const verifyIdentity = async () => {
    const result = clean(await api(admin, `${platform}/reauthenticate`, { method: 'POST', body: { password: credential.password } }), '本人真实密码再次验证');
    check('平台验证只绑定当前会话且有效期不超过五分钟', result.verified && result.verifiedUntil > Date.now()
      && result.verifiedUntil <= Date.now() + 300000 && redis('EXISTS', proofKey) === '1');
  };
  const createdUsers = [];
  let createdRole = false;
  let successLogFlag;
  let discoveryExcluded = false;
  try {
    if (recovery) {
      successLogFlag = database("SELECT log_success_flag FROM sys_job WHERE job_id=1973 AND tenant_id=100000 AND handler_name='dataSourceReconcile' AND deleted=0;");
      assert.match(successLogFlag, /^[01]$/);
      fixtureSql(`UPDATE sys_job SET log_success_flag=1 WHERE job_id=1973 AND tenant_id=100000 AND log_success_flag=${successLogFlag};`);
      check('专项临时保留集中核对成功日志以核对真实执行编号', database('SELECT log_success_flag FROM sys_job WHERE job_id=1973;') === '1');
    }
    fixtureSql(`CREATE ROLE '${role}'@'127.0.0.1';`);
    createdRole = true;
    for (const [username, password] of [[users[0], readonlyPassword], [users[1], writablePassword]]) {
      fixtureSql(`CREATE USER '${username}'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '${password}';`);
      createdUsers.push(username);
    }
    fixtureSql(`GRANT SELECT ON cloud_flow_db.sys_dict_type TO '${role}'@'127.0.0.1'; GRANT '${role}'@'127.0.0.1' TO '${users[0]}'@'127.0.0.1'; SET DEFAULT ROLE ALL TO '${users[0]}'@'127.0.0.1'; GRANT SELECT, UPDATE ON cloud_flow_db.sys_dict_type TO '${users[1]}'@'127.0.0.1';`);
    check('测试开始前没有专项账号连接', connections().length === 0);
    redis('DEL', proofKey);
    await verifyIdentity();
    const overview = clean(await api(admin, `${entry}/list`), '真实只读启用前读取平台配置');
    check('运行版本已接通权限核验且仅开放五个部署服务', overview.configured && overview.accountVerificationReady
      && JSON.stringify([...overview.allowedServices].sort()) === JSON.stringify(targets));
    let config = clean(await api(admin, entry, { method: 'POST', body: { configName: `${prefix}main`, dsKey: `${prefix}main`,
      url: `jdbc:mysql://127.0.0.1:${state.mysqlPort}/cloud_flow_db`, username: users[0], secretAction: 'REPLACE',
      password: readonlyPassword, maxActive: 5, targetServices: targets } }), '创建真实角色只读账号配置');
    rememberCipher(config.configId);
    check('新配置默认停用且版本为0', config.status === 'DISABLED' && config.version === 0);
    const test = clean(await api(admin, `${entry}/${config.configId}/test`, { method: 'POST', body: { version: config.version } }), '真实角色只读账号连接测试');
    check('真实角色权限核验及SELECT 1通过', test.successful === true && test.errorCode == null);
    await waitUntil('单次测试连接池已关闭且未注册任何实例', () => connections().length === 0 && rows(config.configId).length === 0);
    const employee = await session('g_holiday_employee');
    for (const operation of ['test', 'register', 'disable']) {
      const body = operation === 'test' ? { version: 0 } : { version: 0, confirmation: config.dsKey, ...(operation === 'register' ? { targetServices: targets } : {}) };
      rejected(await api(employee, `${entry}/${config.configId}/${operation}`, { method: 'POST', body }), 403, `EMPLOYEE不能${operation}平台数据源`);
    }
    evidence.permissions = true;
    config = clean(await api(admin, `${entry}/${config.configId}/register`, { method: 'POST', body: { version: config.version,
      confirmation: config.dsKey, targetServices: targets } }), '真实注册五个目标服务');
    check('注册保存期望启用版本1', config.version === 1 && config.status === 'ENABLED');
    await applied(config, 'ACTIVE');
    await waitUntil(`${instanceCount}个实际连接池各持有一个MySQL只读账号连接`, () => connections().length === instanceCount && connections().every(connection => connection.user === users[0] && connection.database === 'cloud_flow_db'));
    evidence.connectionEnabled = true;
    evidence.multiServiceApplication = true;
    if (recovery) {
      check('同一人事服务的两个真实实例分别登记', rows(config.configId).filter(instance => instance.service === 'cloudflow-service-hr' && instance.status === 'ACTIVE').length === 2);
      const peerKey = instanceKey(peer);
      await controlPeer('Stop');
      config = await save(config, { maxActive: 7 }, '一个人事实例离线时更新期望版本');
      await waitUntil('离线实例保留旧版本并明确失败其余五实例应用新版本', () => {
        const instances = rows(config.configId);
        return instances.length === instanceCount && instances.every(instance => instance.instance === peerKey
          ? instance.version === 1 && instance.status === 'FAILED' && instance.error === 'INSTANCE_UNAVAILABLE'
          : expectedKeys.has(instance.instance) && instance.version === config.version && instance.status === 'ACTIVE' && instance.error == null);
      });
      await controlPeer('Start');
      const restarted = JSON.parse(await fs.readFile(peerPath, 'utf8'));
      check('重启使用同一实例地址及新的已核验进程', restarted.port === peer.port && restarted.processId !== peer.processId && restarted.status === 'RUNNING');
      await verifyIdentity();
      await applied(config, 'ACTIVE');
      check('重启实际执行主库配置恢复', /运行时数据源启动恢复：configId=/.test(await fs.readFile(path.join(peer.directory, 'stdout.log'), 'utf8')));
      config = await save(config, { maxActive: 8 }, '双实例恢复后刷新全部连接池版本');
      await applied(config, 'ACTIVE');
      await waitUntil('双实例恢复后全部真实连接池可用', () => connections().length === instanceCount);
      evidence.sameServiceMultipleInstances = true;
      evidence.restartRecovery = true;
      const beforeDiscovery = JSON.parse(await fs.readFile(peerPath, 'utf8'));
      const beforeDiscoveryIds = connectionIds();
      const beforeDiscoveryVersion = config.version;
      const peerLogPath = path.join(peer.directory, 'stdout.log');
      const beforeDiscoveryLogLength = (await fs.readFile(peerLogPath, 'utf8')).length;
      discoveryExcluded = true;
      await controlPeer('ExcludeDiscovery');
      await verifyIdentity();
      config = await save(config, { maxActive: 9 }, '存活实例移出发现列表后更新期望版本');
      await waitUntil('移出发现列表的实例记录STALE和原版本其余实例应用新版本', () => {
        const instances = rows(config.configId);
        return instances.length === instanceCount && instances.every(instance => instance.instance === peerKey
          ? instance.version === beforeDiscoveryVersion && instance.status === 'STALE' && instance.error === 'INSTANCE_OFFLINE'
          : expectedKeys.has(instance.instance) && instance.version === config.version && instance.status === 'ACTIVE' && instance.error == null);
      });
      const staleDetail = clean(await api(admin, `${entry}/${config.configId}`), '详情显示真实发现列表移除状态');
      check('详情明确显示唯一STALE实例和INSTANCE_OFFLINE原因', staleDetail.instances.length === instanceCount
        && staleDetail.instances.filter(instance => instance.status === 'STALE').length === 1
        && staleDetail.instances.some(instance => instance.instanceKey === peerKey && instance.status === 'STALE'
          && instance.appliedVersion === beforeDiscoveryVersion && instance.errorCode === 'INSTANCE_OFFLINE'));
      const removedLog = (await fs.readFile(peerLogPath, 'utf8')).slice(beforeDiscoveryLogLength);
      check('发现移除期间该实例未关闭原池也未创建新版本池', !removedLog.includes(`runtime-ds-${config.configId}-v${beforeDiscoveryVersion} - Shutdown`)
        && !removedLog.includes(`runtime-ds-${config.configId}-v${config.version} - Starting`));
      console.log('DATA_SOURCE_DISCOVERY_IDLE_BOUNDARY: minimum_idle=0; idle_timeout_ms=60000; permanent_idle_connection_not_required=true; old_pool_not_closed=true; undiscovered_version_not_created=true');
      await controlPeer('IncludeDiscovery');
      discoveryExcluded = false;
      await verifyIdentity();
      const rediscovered = successful(await api(admin, '/auth/system/job/1973/trigger', { method: 'POST', body: {} }), '重新发现后触发真实集中补应用');
      assert.match(rediscovered.executeNo, /^[a-f0-9-]+$/i);
      check('重新发现后的集中补应用已接受', rediscovered.accepted === true);
      await applied(config, 'ACTIVE');
      await waitUntil('重新发现后的真实任务执行成功', () => database(`SELECT execute_status FROM sys_job_log WHERE job_id=1973 AND execute_no='${rediscovered.executeNo}';`) === 'SUCCESS');
      await waitUntil('重新发现后无需重启该实例即可创建新池并关闭旧池', async () => {
        const recoveredLog = (await fs.readFile(peerLogPath, 'utf8')).slice(beforeDiscoveryLogLength);
        return recoveredLog.includes(`runtime-ds-${config.configId}-v${config.version} - Start completed.`)
          && recoveredLog.includes(`runtime-ds-${config.configId}-v${beforeDiscoveryVersion} - Shutdown completed.`)
          && connections().length > 0 && connectionIds().every(identity => !beforeDiscoveryIds.includes(identity));
      });
      const afterDiscovery = JSON.parse(await fs.readFile(peerPath, 'utf8'));
      check('发现移除和恢复期间人事实例进程与启动时间不变', beforeDiscovery.processId === afterDiscovery.processId
        && beforeDiscovery.processCreated === afterDiscovery.processCreated);
      evidence.discoveryStale = true;
      evidence.rediscoveryRecovery = true;
      console.log('DATA_SOURCE_DISCOVERY_RECOVERY: removed_from_discovery=true; stale=true; stale_error=INSTANCE_OFFLINE; retained_version=true; rediscovered=true; same_version_reapplied=true; peer_restart=false; actual_mysql_connections=true');
      config = await save(config, { maxActive: 10 }, '发现恢复后刷新全部连接池以验证后续失败保留');
      await applied(config, 'ACTIVE');
      await waitUntil('发现恢复后六实例均创建新版本实际连接', () => connections().length === instanceCount);
    }
    let previousIds = connectionIds();
    let retainedVersion = config.version;
    config = await save(config, { secretAction: 'REPLACE', password: wrongPassword }, '已启用配置改为无法认证密码');
    await applied(config, 'FAILED', retainedVersion, 'CONNECTION_FAILED');
    check('全部实例更新失败仍保留原版本的实际连接', JSON.stringify(connectionIds()) === JSON.stringify(previousIds));
    if (recovery) {
      fixtureSql(`ALTER USER '${users[0]}'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '${wrongPassword}';`);
      const dispatched = successful(await api(admin, '/auth/system/job/1973/trigger', { method: 'POST', body: {} }), '真实调度中心触发失败版本重新应用');
      check('集中核对由真实调度中心接受', dispatched.accepted === true);
      assert.match(dispatched.executeNo, /^[a-f0-9-]+$/i);
      await applied(config, 'ACTIVE');
      await waitUntil('集中核对有对应执行编号的真实成功任务记录', () => database(`SELECT execute_status FROM sys_job_log WHERE job_id=1973 AND execute_no='${dispatched.executeNo}';`) === 'SUCCESS');
      await waitUntil('未更改配置版本时重新核验并替换所有旧连接', () => connections().length === instanceCount && connectionIds().every(identity => !previousIds.includes(identity)));
      fixtureSql(`ALTER USER '${users[0]}'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '${readonlyPassword}';`);
      previousIds = connectionIds();
      retainedVersion = config.version;
      evidence.reconcileRecovery = true;
    }
    config = await save(config, { username: users[1], secretAction: 'REPLACE', password: writablePassword }, '已启用配置改为含UPDATE的账号');
    await applied(config, 'FAILED', retainedVersion, 'ACCOUNT_NOT_READ_ONLY');
    check('可写账号没有留下连接池且旧连接未替换', JSON.stringify(connectionIds()) === JSON.stringify(previousIds));
    const writableTest = clean(await api(admin, `${entry}/${config.configId}/test`, { method: 'POST', body: { version: config.version } }), '真实可写账号连接测试');
    check('真实HTTP明确拒绝可写账号', writableTest.successful === false && writableTest.errorCode === 'ACCOUNT_NOT_READ_ONLY');
    evidence.accountPermissionVerification = true;
    evidence.failedKeepsConnections = true;
    config = await save(config, { username: users[0], secretAction: 'REPLACE', password: readonlyPassword, maxActive: 6 }, '修正账号并更新真实连接池');
    await applied(config, 'ACTIVE');
    await waitUntil('全部新连接池替换成功且旧的空闲连接均关闭', () => connections().length === instanceCount && connectionIds().every(identity => !previousIds.includes(identity)));
    evidence.poolReplacement = true;
    previousIds = connectionIds();
    config = await save(config, { targetServices: ['cloudflow-auth', 'cloudflow-service-hr'] }, '目标服务缩减为认证与人事');
    await waitUntil('保留的认证与人事实例启用且移除的三实例明确停用', () => {
      const instances = rows(config.configId);
      return instances.length === instanceCount && instances.every(instance => expectedKeys.has(instance.instance) && instance.version === config.version
        && instance.error == null && instance.status === (config.targetServices.includes(instance.service) ? 'ACTIVE' : 'DISABLED'));
    });
    await waitUntil('移除服务关闭连接且保留服务使用新版本连接', () => connections().length === instanceCount - 3 && connectionIds().every(identity => !previousIds.includes(identity)));
    rejected(await api(admin, entry, { method: 'PUT', body: { configId: config.configId, version: config.version, configName: config.configName,
      dsKey: config.dsKey, url: config.url, username: config.username, secretAction: 'CLEAR', maxActive: config.maxActive,
      targetServices: config.targetServices } }), 409, '仍启用的数据源不能清空密码');
    evidence.targetRemoval = true;
    config = await save(config, { targetServices: targets }, '重新纳入全部五个服务');
    await applied(config, 'ACTIVE');
    await waitUntil('全部服务恢复实际只读连接', () => connections().length === instanceCount && connections().every(connection => connection.user === users[0]));
    const beforeDisable = config.version;
    config = clean(await api(admin, `${entry}/${config.configId}/disable`, { method: 'POST', body: { version: config.version, confirmation: config.dsKey } }), '真实停用五个实例');
    check('停用版本只增加1且期望状态停用', config.version === beforeDisable + 1 && config.status === 'DISABLED');
    await applied(config, 'DISABLED');
    await waitUntil('停用后所有实际MySQL连接已关闭', () => connections().length === 0);
    evidence.disabled = true;
    if (recovery) {
      check('真实MySQL启用累计连接计数', database('SELECT @@performance_schema;') === '1');
      const connectionTotals = () => database(`SELECT USER,SUM(TOTAL_CONNECTIONS) FROM performance_schema.accounts WHERE USER IN (${userQuery}) GROUP BY USER ORDER BY USER;`);
      const disabledConnectionTotals = connectionTotals();
      check('停用重启前两个专项账号均有可核对的累计连接历史', users.every(username => disabledConnectionTotals.split('\n')
        .some(line => line.startsWith(`${username}\t`) && Number(line.split('\t')[1]) > 0)));
      const disabledSnapshot = database(`SELECT JSON_OBJECT('version',version,'status',status,'password',password_encrypted) FROM sys_data_source_config WHERE ${predicate} AND config_id=${config.configId};`);
      const beforeRestart = JSON.parse(await fs.readFile(peerPath, 'utf8'));
      await controlPeer('Stop');
      await controlPeer('Start');
      const afterRestart = JSON.parse(await fs.readFile(peerPath, 'utf8'));
      check('保留停用记录后同一地址启动新进程', afterRestart.port === beforeRestart.port
        && afterRestart.processId !== beforeRestart.processId && afterRestart.processCreated !== beforeRestart.processCreated);
      check('重启期间停用记录版本和密文保持不变', database(`SELECT JSON_OBJECT('version',version,'status',status,'password',password_encrypted) FROM sys_data_source_config WHERE ${predicate} AND config_id=${config.configId};`) === disabledSnapshot);
      check('重启日志确认从主库恢复该停用记录', (await fs.readFile(path.join(peer.directory, 'stdout.log'), 'utf8'))
        .includes(`运行时数据源启动恢复：configId=${config.configId}, version=${config.version}, status=DISABLED`));
      await verifyIdentity();
      await applied(config, 'DISABLED');
      const observationStart = Date.now();
      let observedConnections = 0;
      while (Date.now() - observationStart < 5000) {
        observedConnections += connections().length;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      check('停用记录保留时重启就绪后连续五秒没有只读或可写连接', observedConnections === 0);
      const disabledReconcile = successful(await api(admin, '/auth/system/job/1973/trigger', { method: 'POST', body: {} }), '停用记录重启后再次集中核对');
      assert.match(disabledReconcile.executeNo, /^[a-f0-9-]+$/i);
      check('停用记录集中核对已接受', disabledReconcile.accepted === true);
      await waitUntil('停用记录集中核对真实任务成功', () => database(`SELECT execute_status FROM sys_job_log WHERE job_id=1973 AND execute_no='${disabledReconcile.executeNo}';`) === 'SUCCESS');
      await applied(config, 'DISABLED');
      check('停用记录集中核对后仍未创建连接', connections().length === 0);
      check('从停用重启前至集中核对后累计连接数不增加含瞬时连接', connectionTotals() === disabledConnectionTotals);
      evidence.disabledRestart = true;
      console.log('DATA_SOURCE_DISABLED_RESTART: record_retained=true; version_unchanged=true; ciphertext_unchanged=true; runtime_enabled=true; startup_restored_disabled=true; ready_observation_ms=5000; observed_connections=0; reconciled=true; connections_after_reconcile=0; cumulative_new_connections=0');
    }
    evidence.versions = true;
    const successes = database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${boundaries.audit} AND audit_name='DATA_SOURCE_TEST' AND audit_field='data_source:${config.configId}' AND after_val='CONNECTION_VERIFIED';`);
    const denied = database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${boundaries.audit} AND audit_name='DATA_SOURCE_TEST' AND audit_field='data_source:${config.configId}' AND after_val='ACCOUNT_NOT_READ_ONLY';`);
    check('真实只读通过与可写拒绝各有一笔高风险测试审计', successes === '1' && denied === '1'
      && database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${boundaries.audit} AND audit_field='data_source:${config.configId}' AND audit_name IN ('DATA_SOURCE_TEST','DATA_SOURCE_REGISTER','DATA_SOURCE_UPDATE','DATA_SOURCE_DISABLE') AND (high_risk<>1 OR risk_level<>'HIGH');`) === '0');
    if (liveUi) await verifyDataSourceLiveUi({ ...context, config, expectedKeys, waitUntil, verifyIdentity,
      secrets: [...sensitive].filter(secret => secret !== token) });
    evidence.multiInstancePoolAcceptance = recovery && evidence.sameServiceMultipleInstances && evidence.restartRecovery && evidence.reconcileRecovery
      && evidence.discoveryStale && evidence.rediscoveryRecovery && evidence.disabledRestart;
    console.log(`DATA_SOURCE_LIVE_HTTP_BOUNDARY: role_readonly=true; writable_rejected=true; services=5; instances=${instanceCount}; actual_mysql_connections=true; idle_pool_replacement=true; failed_pool_preserved=true; target_removal=true; held_connection_retirement=false; same_service_multi_instance=${recovery}; restart_recovery=${recovery}; reconcile_recovery=${recovery}; production_modified=false`);
  } finally {
    if (peer && JSON.parse(await fs.readFile(peerPath, 'utf8')).status === 'STOPPED') await controlPeer('Start');
    if (discoveryExcluded) await controlPeer('IncludeDiscovery');
    const configs = JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',config_id,'version',version,'key',ds_key,'status',status)),JSON_ARRAY()) FROM sys_data_source_config WHERE ${predicate};`));
    for (const config of configs) {
      if (config.status !== 'DISABLED') {
        await verifyIdentity();
        clean(await api(admin, `${entry}/${config.id}/disable`, { method: 'POST', body: { version: config.version, confirmation: config.key } }), '失败恢复时通过真实接口停用自有配置');
      }
      await waitUntil('清理前全部已知实例均停用', () => rows(config.id).every(instance => instance.status === 'DISABLED'));
    }
    await waitUntil('清理自有账号前全部专项连接关闭', () => connections().length === 0);
    database(`START TRANSACTION; DELETE FROM sys_data_source_registration WHERE tenant_id=100000 AND config_id IN (SELECT config_id FROM sys_data_source_config WHERE ${predicate}); DELETE FROM sys_data_source_config WHERE ${predicate}; COMMIT;`);
    for (const username of createdUsers) fixtureSql(`DROP USER '${username}'@'127.0.0.1';`);
    if (createdRole) fixtureSql(`DROP ROLE '${role}'@'127.0.0.1';`);
    if (successLogFlag !== undefined) {
      assert.equal(database('SELECT log_success_flag FROM sys_job WHERE job_id=1973;'), '1', 'Success log fixture changed outside this verification');
      fixtureSql(`UPDATE sys_job SET log_success_flag=${successLogFlag} WHERE job_id=1973 AND tenant_id=100000 AND log_success_flag=1;`);
      check('集中核对成功日志开关恢复原值', database('SELECT log_success_flag FROM sys_job WHERE job_id=1973;') === successLogFlag);
    }
    redis('DEL', proofKey);
    check('只清理本轮配置账号角色且原配置及菜单授权不变', database(`SELECT COUNT(*) FROM mysql.user WHERE User IN (${userQuery},'${role}');`) === '0'
      && database('SELECT COUNT(*) FROM sys_data_source_config;') === existingCount && grants() === previousGrants);
    evidence.cleanup = true;
    await new Promise(resolve => setTimeout(resolve, 2000));
    const audited = await scanOwnedAuditLogs(state, [...sensitive], boundaries);
    check('真实启用及拒绝的审计错误日志无秘密泄漏', audited.leaks === 0 && audited.bytes > 0);
    let runtimeBytes = 0;
    for (const [filename, start] of logStarts) {
      if (recovery && path.basename(path.dirname(filename)) === 'auth') continue;
      const size = (await fs.stat(filename)).size;
      assert.ok(size >= start, 'Service logs must not rotate during verification');
      if (size === start) continue;
      const scanned = await scanSecretStream(createReadStream(filename, { start, end: size - 1 }), [...sensitive]);
      check(`${path.basename(path.dirname(filename))}/${path.basename(filename)}启用专项运行日志无秘密`, scanned.leaks === 0);
      runtimeBytes += scanned.bytes;
    }
    if (recovery) {
      const authDirectory = path.join(directory, 'auth');
      const authLogs = (await fs.readdir(authDirectory)).filter(name => /^(stdout|stderr)(-before-[a-f0-9]{32})?\.log$/.test(name)
        && (!authLogNames.has(name) || /^(stdout|stderr)\.log$/.test(name)));
      for (const name of authLogs) {
        const scanned = await scanSecretStream(createReadStream(path.join(authDirectory, name)), [...sensitive]);
        check(`发现配置重启认证日志${name}无秘密`, scanned.leaks === 0);
        runtimeBytes += scanned.bytes;
      }
    }
    if (peer) {
      const logs = (await fs.readdir(peer.directory)).filter(name => /^(?:(stdout|stderr)(-before-[a-f0-9]{32})?|control-(Start|Stop|ExcludeDiscovery|IncludeDiscovery)-[a-f0-9]{24})\.log$/.test(name));
      for (const name of logs) {
        const scanned = await scanSecretStream(createReadStream(path.join(peer.directory, name)), [...sensitive]);
        check(`真实双实例恢复日志${name}无秘密`, scanned.leaks === 0);
        runtimeBytes += scanned.bytes;
      }
    }
    evidence.secrets = true;
    console.log(`DATA_SOURCE_LIVE_SECRET_SCAN: values=${sensitive.size}; audit_bytes=${audited.bytes}; runtime_bytes=${runtimeBytes}; leaks=0; credential_output=false`);
  }
}
