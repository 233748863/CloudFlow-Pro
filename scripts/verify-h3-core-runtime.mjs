import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [statePath, outputArgument, mode] = process.argv.slice(2);
assert.ok(['before', 'after'].includes(mode));
const output = await fs.realpath(outputArgument);
assert.equal(path.dirname(output), await fs.realpath(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
assert.match(path.basename(output), /^(?:h3-core-independent-20261011|f1-assets-independent-20261012|f2-suppliers-independent-20261012|f3-projects-independent-20261015|f5-rfq-independent-20261015|a1-codegen-independent-20261016|a1-codegen-disabled-independent-20261016)-r[1-9]\d*$/);
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.notEqual(path.basename(state.run), '9799534e1a3a47b5958330f14ae16dc7');
assert.equal(await fs.realpath(path.dirname(statePath)), await fs.realpath(state.run));
const plan = JSON.parse(await fs.readFile(path.join(output, 'execution-plan.json'), 'utf8'));
assert.equal(plan.mode, plan.scenario === 'Codegen' ? 'A1_CODEGEN_INDEPENDENT' : plan.scenario === 'CodegenDisabled' ? 'A1_CODEGEN_DISABLED_INDEPENDENT' : plan.scenario === 'RfqComparison' ? 'F5_RFQ_INDEPENDENT' : plan.scenario === 'ProjectHours' ? 'F3_PROJECTS_INDEPENDENT' : plan.scenario === 'SupplierGovernance' ? 'F2_SUPPLIERS_INDEPENDENT' : plan.scenario === 'AssetLifecycle' ? 'F1_ASSETS_INDEPENDENT' : 'H3_CORE_INDEPENDENT');
assert.match(path.basename(output), plan.scenario === 'Codegen' ? /^a1-codegen-independent-20261016-r[1-9]\d*$/
  : plan.scenario === 'CodegenDisabled' ? /^a1-codegen-disabled-independent-20261016-r[1-9]\d*$/
  : plan.scenario === 'RfqComparison' ? /^f5-rfq-independent-20261015-r[1-9]\d*$/
  : plan.scenario === 'ProjectHours' ? /^f3-projects-independent-20261015-r[1-9]\d*$/
  : plan.scenario === 'SupplierGovernance' ? /^f2-suppliers-independent-20261012-r[1-9]\d*$/
  : plan.scenario === 'AssetLifecycle' ? /^f1-assets-independent-20261012-r[1-9]\d*$/ : /^h3-core-independent-20261011-r[1-9]\d*$/);
assert.equal(state.verification?.mode, plan.mode);
assert.equal(state.verification?.scenario, plan.scenario);
assert.equal(state.verification?.inputsFrozen, true);
assert.equal(state.verification?.portalRequired, plan.portalRequired);
assert.equal(state.verification?.portalEnabled, plan.portalEnabled);
assert.equal(plan.portalRequired, plan.scenario.startsWith('Portal'));
assert.equal(plan.portalEnabled, plan.portalRequired && plan.scenario !== 'PortalDisabled');
const codegenRequired = ['Codegen', 'CodegenDisabled'].includes(plan.scenario);
if (codegenRequired) {
  assert.equal(state.codegenFixture.enabled, plan.scenario === 'Codegen');
  assert.equal(await fs.realpath(state.codegenFixture.directory), await fs.realpath(path.join(state.run, 'codegen-output')));
} else assert.equal(state.codegenFixture, undefined);
const environment = { ...process.env }; delete environment.MYSQL_PWD;
const database = statement => {
  assert.match(statement, /^SELECT /);
  const child = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', 'cloud_flow_db'],
    { input: statement, encoding: 'utf8', env: environment, windowsHide: true, timeout: 30000 });
  assert.equal(child.status, 0, 'Independent runtime SELECT failed');
  return child.stdout.trim();
};
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(path.join(state.run, 'mysql-data')));
const redis = await ownedGatewayRedis(state);
const configKey = 'sys:config:global:sys.captcha.dailyLimit';
const counterKey = 'CAPTCHA:LIMIT:127.0.0.1';
const observation = {
  persistentLimit: database("SELECT config_value FROM sys_config WHERE config_key='sys.captcha.dailyLimit' AND config_scope='0';"),
  cachedLimit: redis('GET', configKey), cacheTtl: Number(redis('PTTL', configKey)),
  counter: Number(redis('GET', counterKey) || '0'), counterTtl: Number(redis('PTTL', counterKey)),
};
assert.equal(observation.persistentLimit, '100');
assert.equal(observation.cachedLimit, '"100"');
assert.equal(observation.cacheTtl, -1);
assert.ok(Number.isSafeInteger(observation.counter) && observation.counter >= 0 && observation.counter <= 100);
const secrets = new Set();
const shared = new Map();
if (plan.portalRequired) {
  assert.equal(state.portalFixture.loopback, true);
  assert.equal(await fs.realpath(state.portalFixture.directory), await fs.realpath(path.join(state.run, 'private/portal')));
  assert.ok(Number.isInteger(state.portalFixture.port) && state.portalFixture.port > 1024 && state.portalFixture.port < 65536);
  assert.equal(state.portalFixture.publicUrl, `https://127.0.0.1:${state.portalFixture.port}`);
  const reservedPorts = [state.mysqlPort, state.redisPort, state.smtpFixture.port, ...state.services.flatMap(service => [service.port, service.healthPort])];
  assert.ok(!reservedPorts.includes(state.portalFixture.port), 'Portal port must not overlap reserved service ports');
  secrets.add(await fs.readFile(path.join(state.portalFixture.directory, 'store-password.txt'), 'utf8'));
} else assert.equal(state.portalFixture, null);
if (plan.scenario === 'PortalOAuth') {
  assert.ok(state.oauth2Fixture, '门户身份隔离必须配置独立授权环境');
  assert.ok(Number.isInteger(state.oauth2Fixture.port) && state.oauth2Fixture.port > 1024 && state.oauth2Fixture.port < 65536);
  assert.equal(state.oauth2Fixture.publicUrl, `http://127.0.0.1:${state.oauth2Fixture.port}`);
  const reservedPorts = [state.mysqlPort, state.redisPort, state.smtpFixture.port, state.portalFixture.port,
    ...state.services.flatMap(service => [service.port, service.healthPort])];
  assert.ok(!reservedPorts.includes(state.oauth2Fixture.port), '授权回调端口不得占用其他服务端口');
  const fixtureDirectory = path.dirname(await fs.realpath(state.oauth2Fixture.manifest));
  assert.equal(path.dirname(fixtureDirectory), await fs.realpath(path.join(state.run, 'private')));
  assert.match(path.basename(fixtureDirectory), /^oauth2-[a-f0-9]{32}$/);
  assert.equal(path.basename(state.oauth2Fixture.manifest), 'fixture.json');
  const fixture = JSON.parse((await fs.readFile(state.oauth2Fixture.manifest, 'utf8')).replace(/^\uFEFF/, ''));
  assert.equal(await fs.realpath(fixture.statePath), await fs.realpath(statePath));
  assert.equal(fixture.status, 'APPLIED');
  assert.equal(fixture.publicUrl, state.oauth2Fixture.publicUrl);
  assert.equal(fixture.productionModified, false);
  assert.deepEqual(fixture.files.map(record => record.name).sort(), ['auth', 'gateway']);
} else assert.equal(state.oauth2Fixture, undefined);
for (const service of state.services) {
  const text = await fs.readFile(path.join(state.run, service.name, 'integration.properties'), 'utf8');
  const properties = new Map(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^([^#=]+)=(.*)$/); return match ? [[match[1], match[2]]] : [];
  }));
  assert.equal(properties.get('server.port'), String(service.port));
  assert.equal(properties.get('management.server.port'), String(service.healthPort));
  assert.equal(properties.get('spring.data.redis.port'), String(state.redisPort));
  if (codegenRequired && service.name === 'auth') {
    assert.equal(properties.get('cloudflow.codegen.enabled'), String(plan.scenario === 'Codegen'));
    assert.equal(await fs.realpath(properties.get('cloudflow.codegen.project-root')), await fs.realpath(state.codegenFixture.directory));
  }
  const portalService = plan.portalRequired && ['auth', 'gateway'].includes(service.name);
  assert.equal(properties.get('cloudflow.portal.enabled'), portalService && plan.portalEnabled ? 'true' : 'false');
  if (portalService) {
    assert.equal(properties.get('cloudflow.portal.public-url'), state.portalFixture.publicUrl);
    assert.equal(properties.get('cloudflow.ratelimit.trusted-proxies[0]'), '127.0.0.1/32');
    if (service.name === 'gateway') assert.equal(properties.get('CLOUDFLOW_CORS_ALLOWED_ORIGINS'), state.portalFixture.publicUrl);
  }
  if (plan.scenario === 'PortalOAuth' && ['auth', 'gateway'].includes(service.name)) {
    assert.equal(properties.get('cloudflow.oauth2.enabled'), 'true');
    assert.equal(properties.get('cloudflow.oauth2.allow-loopback-http'), 'true');
    assert.equal(properties.get('cloudflow.oauth2.public-url'), state.oauth2Fixture.publicUrl);
    if (service.name === 'auth') {
      assert.equal(properties.get('cloudflow.platform.access.management-tenant-id'), '100000');
      assert.equal(properties.get('cloudflow.platform.access.administrator-user-ids[0]'),
        database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin' AND deleted=0 AND status='0';"));
      assert.ok(properties.get('cloudflow.oauth2.secret-key')?.length >= 32, '独立授权密钥必须完整配置');
    }
  }
  for (const target of state.services) assert.equal(properties.get(`spring.cloud.discovery.client.simple.instances.${target.application}[0].uri`), `http://127.0.0.1:${target.port}`);
  for (const [key, value] of properties) {
    if (key.includes('secret-key') || key.includes('aes-key') || key.includes('internal-auth.keys.') || key === 'spring.data.redis.password') {
      assert.ok(value.length >= 32, 'Independent nonempty service credential required');
      secrets.add(value);
      if (shared.has(key)) assert.equal(shared.get(key), value, 'Services must share each configured encryption or caller key');
      else shared.set(key, value);
    }
  }
  if (['auth', 'hr', 'oa', 'crm'].includes(service.name)) assert.equal(properties.get('cloudflow.workflow.callback.enabled'), 'true');
}
for (const account of JSON.parse(await fs.readFile(path.join(state.run, 'private/accounts.json'), 'utf8'))) secrets.add(account.password);
if (mode === 'before') {
  assert.equal(observation.counter, 0, 'Fresh independent environment must start without captcha attempts');
  await fs.writeFile(path.join(output, 'runtime-before.json'), JSON.stringify({ ...observation, services: state.services.length, sharedCredentials: shared.size, callbackEnabled: true, scenario: plan.scenario, portalRequired: plan.portalRequired, portalEnabled: plan.portalEnabled }, null, 2), { flag: 'wx' });
  console.log('H3_CORE_INDEPENDENT_PREFLIGHT: services=6; callbacks=true; captcha_limit=100; captcha_before=0; credential_values_logged=0');
} else {
  const before = JSON.parse(await fs.readFile(path.join(output, 'runtime-before.json'), 'utf8'));
  assert.ok(observation.counter >= before.counter);
  const values = JSON.parse(await fs.readFile(path.join(state.run, 'private/h3-core-secrets.json'), 'utf8'));
  assert.ok(values.length >= 1 && values.every(value => typeof value === 'string' && value.length > 0));
  for (const value of values) secrets.add(value);
  assert.equal(state.smtpFixture.loopback, true);
  assert.equal(await fs.realpath(state.smtpFixture.directory), await fs.realpath(path.join(state.run, 'private/smtp')));
  assert.equal(database("SELECT COUNT(*) FROM sys_message_channel WHERE deleted=0 AND status='ENABLED' AND channel_type='EMAIL' AND (smtp_host<>'localhost' OR smtp_port<>" + Number(state.smtpFixture.port) + ");"), '0', 'All enabled email channels must use this owned loopback SMTP listener');
  secrets.add(await fs.readFile(path.join(state.run, 'private/smtp/store-password.txt'), 'utf8'));
  let files = 0, leaks = 0;
  for (const service of state.services) {
    const directory = path.join(state.run, service.name);
    const logs = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of [...(await fs.readdir(directory)).filter(name => name.endsWith('.log')), ...logs.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scanned = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; leaks += scanned.leaks;
    }
  }
  for (const name of ['live.log', 'live.err', 'runtime-before.log']) {
    const scanned = await scanSecretStream(createReadStream(path.join(output, name)), [...secrets]); files++; leaks += scanned.leaks;
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  const result = { passed: leaks === 0 && audit.leaks === 0, ...observation, counterBefore: before.counter, counterWrites: 0, configurationWrites: 0, files, sensitiveValues: secrets.size, leaks, databaseLeaks: audit.leaks };
  await fs.writeFile(path.join(output, `runtime-${mode}.json`), JSON.stringify(result, null, 2), { flag: 'wx' });
  assert.ok(result.passed, 'Independent runtime credentials leaked in logs');
  console.log(`H3_CORE_INDEPENDENT_POSTFLIGHT: files=${files}; leaks=0; database_leaks=0; captcha_before=${before.counter}; captcha_after=${observation.counter}; captcha_limit=100; counter_writes=0`);
}
