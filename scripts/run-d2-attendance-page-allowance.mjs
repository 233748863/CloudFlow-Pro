import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

// A bounded configuration override for this owned fixture only. Counters are never changed.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [round, backendRound, frontendRound, sourceRound = 'r4'] = process.argv.slice(2);
for (const value of [round, backendRound, frontendRound, sourceRound]) assert.match(value || '', /^r[1-9][0-9]*$/);
const requestedMode = 'd2-attendance-page';
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const state = JSON.parse((await fs.readFile(path.join(run, 'state.json'), 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(await fs.realpath(state.run), await fs.realpath(run));
const env = { ...process.env }; delete env.MYSQL_PWD;
const database = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, encoding: 'utf8', windowsHide: true, env, timeout: 30000 });
  assert.equal(result.status, 0, 'Owned captcha fixture query failed');
  return result.stdout.trim();
};
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(path.join(run, 'mysql-data')));
const databaseValue = () => database("SELECT config_value FROM sys_config WHERE config_key='sys.captcha.dailyLimit' AND config_scope='0';");
const originalDatabase = databaseValue();
assert.equal(originalDatabase, '100');
const redis = await ownedGatewayRedis(state);
const key = 'sys:config:global:sys.captcha.dailyLimit';
const counterKey = 'CAPTCHA:LIMIT:127.0.0.1';
const original = redis('GET', key);
assert.equal(original, JSON.stringify(originalDatabase));
assert.equal(redis('PTTL', key), '-1', 'Expected persistent configuration cache');
const before = Number(redis('GET', counterKey) || '0');
assert.ok(Number.isSafeInteger(before) && before >= 0);
const allowance = Math.max(100, before) + 50;
const temporary = JSON.stringify(String(allowance));
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const snapshot = path.join(evidence, `owned-captcha-${requestedMode}-20261005-${round}.json`);
await fs.writeFile(snapshot, JSON.stringify({ key, original, originalTtl: -1, temporary, counterBefore: before,
  counterTtlBefore: Number(redis('PTTL', counterKey)), databaseValue: originalDatabase, expiresInSeconds: 1800 }, null, 2), { flag: 'wx' });
assert.equal(redis('EVAL', "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2],'EX',1800) return 1", 1, key, original, temporary), '1');
console.log(`OWNED_CAPTCHA_ALLOWANCE: before=${before}; original_limit=100; temporary_limit=${allowance}; expiry_seconds=1800; counter_writes=0; database_writes=0`);
let status;
try {
  status = await new Promise((resolve, reject) => {
    const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe', ['-NoLogo', '-NoProfile', '-File',
      'scripts/run-d2-attendance-page.ps1', '-Round', round, '-BackendRound', backendRound, '-FrontendRound', frontendRound, '-SourceRound', sourceRound],
      { cwd: root, env: process.env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', resolve);
  });
} finally {
  // Refuse to replace another writer's configuration. Expiry safely falls back to the product default.
  assert.equal(redis('EVAL', "local v=redis.call('GET',KEYS[1]); if v and v~=ARGV[1] and v~=ARGV[2] then return 0 end redis.call('SET',KEYS[1],ARGV[2]) return 1", 1, key, temporary, original), '1');
  assert.equal(redis('GET', key), original); assert.equal(redis('PTTL', key), '-1');
  assert.equal(databaseValue(), originalDatabase);
  const after = Number(redis('GET', counterKey) || '0');
  assert.ok(Number.isSafeInteger(after) && after >= before && after <= allowance);
  console.log(`OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=${before}; counter_after=${after}; counter_writes=0; database_unchanged=true; production_modified=false`);
}
assert.equal(status, 0, 'Verification failed; captcha configuration restored');
