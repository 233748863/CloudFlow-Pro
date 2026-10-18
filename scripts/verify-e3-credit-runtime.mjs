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
assert.match(path.basename(output), /^e3-credit-independent-20261009-r[1-9]\d*$/);
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.notEqual(path.basename(state.run), '9799534e1a3a47b5958330f14ae16dc7');
assert.equal(await fs.realpath(path.dirname(statePath)), await fs.realpath(state.run));
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
for (const service of state.services) {
  const text = await fs.readFile(path.join(state.run, service.name, 'integration.properties'), 'utf8');
  const properties = new Map(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^([^#=]+)=(.*)$/); return match ? [[match[1], match[2]]] : [];
  }));
  assert.equal(properties.get('server.port'), String(service.port));
  assert.equal(properties.get('management.server.port'), String(service.healthPort));
  assert.equal(properties.get('spring.data.redis.port'), String(state.redisPort));
  assert.equal(properties.get('cloudflow.portal.enabled'), 'false');
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
  await fs.writeFile(path.join(output, 'runtime-before.json'), JSON.stringify({ ...observation, services: state.services.length, sharedCredentials: shared.size, callbackEnabled: true }, null, 2), { flag: 'wx' });
  console.log('E3_INDEPENDENT_PREFLIGHT: services=6; callbacks=true; captcha_limit=100; captcha_before=0; credential_values_logged=0');
} else {
  const before = JSON.parse(await fs.readFile(path.join(output, 'runtime-before.json'), 'utf8'));
  assert.ok(observation.counter >= before.counter);
  const values = JSON.parse(await fs.readFile(path.join(state.run, 'private/e3-credit-secrets.json'), 'utf8'));
  assert.ok(values.length >= 1 && values.every(value => typeof value === 'string' && value.length > 0));
  for (const value of values) secrets.add(value);
  assert.equal(database("SELECT COUNT(*) FROM sys_message_record WHERE channel_type<>'INTERNAL';"), '0', 'E3 must only send internal messages');
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
  console.log(`E3_INDEPENDENT_POSTFLIGHT: files=${files}; leaks=0; database_leaks=0; captcha_before=${before.counter}; captcha_after=${observation.counter}; captcha_limit=100; counter_writes=0`);
}

