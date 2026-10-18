import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

const root = 'D:/CloudFlowPro';
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const [round, frontendRound] = process.argv.slice(2);
assert.match(round || '', /^r[1-9]\d*$/);
assert.match(frontendRound || '', /^r[1-9]\d*$/);
const output = path.join(evidence, `d2-employee-selector-read-20261009-${round}`);
assert.ok(!fs.existsSync(output));
fs.mkdirSync(output);
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const environment = { ...process.env };
delete environment.MYSQL_PWD;
const read = statement => {
  assert.match(statement, /^SELECT\s/i);
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, encoding: 'utf8', windowsHide: true, env: environment, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Owned selector diagnostic read failed');
  return result.stdout.trim();
};
assert.equal(fs.realpathSync(read('SELECT @@datadir')), fs.realpathSync(path.join(run, 'mysql-data')));
const originals = ['scripts/diagnose-d2-employee-selector.mjs', 'scripts/runtime-checks/d1-leave-runtime.mjs',
  'scripts/runtime-checks/owned-select-digest.mjs', 'scripts/runtime-checks/form-browser-auth.mjs', 'scripts/owned-gateway-redis.mjs', 'scripts/portal-checks/scan-access-logs.mjs'];
const product = ['backend-r136', `frontend-${frontendRound}`].flatMap(build => JSON.parse(fs.readFileSync(path.join(evidence, `h3-portal-finance-20261002-${build}-inputs.json`), 'utf8').replace(/^\uFEFF/, '')));
const fileHash = file => createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex').toUpperCase();
const inputs = [...product, ...originals.map(file => ({ Path: file, Hash: fileHash(file) }))];
assert.ok(inputs.every(input => fileHash(input.Path) === input.Hash));
fs.writeFileSync(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
for (const file of originals) {
  const target = path.join(output, 'originals', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target, fs.constants.COPYFILE_EXCL);
}
const redis = await ownedGatewayRedis(state);
const configKey = 'sys:config:global:sys.captcha.dailyLimit';
const counterKey = 'CAPTCHA:LIMIT:127.0.0.1';
const persistent = () => read("SELECT config_value FROM sys_config WHERE config_key='sys.captcha.dailyLimit' AND config_scope='0'");
assert.equal(persistent(), '100');
const original = redis('GET', configKey);
assert.equal(original, '"100"');
assert.equal(redis('PTTL', configKey), '-1');
const before = Number(redis('GET', counterKey) || 0);
assert.ok(Number.isSafeInteger(before) && before >= 0);
const temporary = JSON.stringify(String(Math.max(100, before) + 10));
fs.writeFileSync(path.join(output, 'captcha-original.json'), JSON.stringify({ original, originalTtl: -1, counterBefore: before, temporary, counterWrites: 0 }, null, 2));
assert.equal(redis('EVAL', "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2],'EX',1800) return 1", 1, configKey, original, temporary), '1');
let runtime;
let failure;
let observed;
let baseline;
let preservation = false;
let restored = false;
let secrets = false;
const requests = [];
const responseReaders = [];
const pending = new Set();
let maximumConcurrent = 0;
const started = new Map();
try {
  runtime = await createD1LeaveRuntime(root, output);
  baseline = runtime.databaseDigest('SELECT * FROM hr_employee ORDER BY id');
  const page = runtime.sessions.admin.page;
  const selected = request => new URL(request.url()).pathname === '/api/hr/employees';
  page.on('request', request => {
    if (!selected(request)) return;
    assert.equal(request.method(), 'GET');
    pending.add(request);
    started.set(request, performance.now());
    maximumConcurrent = Math.max(maximumConcurrent, pending.size);
  });
  page.on('response', response => {
    const request = response.request();
    if (!selected(request)) return;
    pending.delete(request);
    responseReaders.push((async () => {
      const url = new URL(request.url());
      const body = await response.json().catch(() => null);
      requests.push({ page: Number(url.searchParams.get('pageNum')), requestedSize: Number(url.searchParams.get('pageSize')),
        status: response.status(), code: body?.code, rows: body?.data?.records?.length ?? body?.data?.rows?.length,
        total: body?.data?.total, actualSize: body?.data?.pageSize ?? body?.data?.size,
        milliseconds: Math.round(performance.now() - started.get(request)),
        message: response.status() === 200 ? undefined : String(body?.msg || body?.message || '').slice(0, 160) });
    })());
  });
  page.on('requestfailed', request => {
    if (!selected(request)) return;
    pending.delete(request);
    requests.push({ page: Number(new URL(request.url()).searchParams.get('pageNum')), networkFailure: request.failure()?.errorText });
  });
  observed = await page.evaluate(async () => {
    try {
      const module = await import('/src/services/api/hr/employee.ts');
      const rows = await module.listEmployeesForSelect();
      return { fetchPassed: true, employees: rows.length, uniqueIds: new Set(rows.map(row => String(row.id))).size };
    } catch (error) {
      return { fetchPassed: false, message: String(error.message).slice(0, 180) };
    }
  });
  const waitUntil = Date.now() + 35000;
  while (pending.size && Date.now() < waitUntil) await new Promise(resolve => setTimeout(resolve, 100));
  await Promise.all(responseReaders);
  assert.equal(pending.size, 0, 'Selector requests have not settled');
} catch (error) {
  failure = String(error.message).split('\n')[0].slice(0, 160);
} finally {
  try {
    if (runtime && baseline) preservation = runtime.databaseDigest('SELECT * FROM hr_employee ORDER BY id') === baseline;
    if (runtime) { await runtime.scan(); secrets = true; }
  } catch { failure ||= 'Selector diagnostic preservation or secret scan failed'; }
  if (runtime) await runtime.close();
  try {
    assert.equal(redis('EVAL', "local value=redis.call('GET',KEYS[1]); if value and value~=ARGV[1] and value~=ARGV[2] then return 0 end redis.call('SET',KEYS[1],ARGV[2]) return 1", 1, configKey, temporary, original), '1');
    assert.equal(redis('GET', configKey), original);
    assert.equal(redis('PTTL', configKey), '-1');
    assert.equal(persistent(), '100');
    restored = true;
  } catch { failure ||= 'Selector captcha restoration failed'; }
  const after = Number(redis('GET', counterKey) || 0);
  const unchanged = inputs.every(input => fileHash(input.Path) === input.Hash);
  const result = { passed: !failure && unchanged && preservation && restored && secrets, purpose: 'read_only_diagnosis', backend: 'r136', frontend: frontendRound,
    observed, requests: requests.sort((left, right) => left.page - right.page), maximumConcurrent, businessWrites: 0, preservation, restored, secrets,
    inputs: inputs.length, inputsUnchanged: unchanged, captchaBefore: before, captchaAfter: after, counterWrites: 0, failure };
  const encoded = JSON.stringify(result, null, 2);
  assert.ok(!runtime || [...runtime.sensitive].every(secret => !encoded.includes(secret)), 'Diagnostic output contains secret');
  fs.writeFileSync(path.join(output, 'result.json'), encoded);
  console.log(`D2_SELECTOR_DIAGNOSIS: passed=${result.passed}; fetch_passed=${observed?.fetchPassed}; pages=${requests.length}; peak_requests=${maximumConcurrent}; preservation=${preservation}; captcha_restored=${restored}; counter_writes=0`);
  if (!result.passed) process.exitCode = 1;
}
