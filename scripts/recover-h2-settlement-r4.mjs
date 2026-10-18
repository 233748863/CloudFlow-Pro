import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

// One interrupted owned verification only. Never change settled business facts.
const root = 'D:/CloudFlowPro';
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const round = process.argv[process.argv.indexOf('--round') + 1];
assert.match(round || '', /^r[1-9]\d*$/);
const output = path.join(evidence, `h2-settlement-r4-recovery-20261006-${round}`);
const marker = 'h2ap_d000885f18dc';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = value => createHash('sha256').update(value).digest('hex');
const state = read(path.join(run, 'state.json'));
assert.equal(state.status, 'RUNNING');
assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const env = { ...process.env }; delete env.MYSQL_PWD;
const database = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
    { input: statement, encoding: 'utf8', env, windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
  assert.equal(result.status, 0, 'Owned recovery statement failed'); return result.stdout.trim();
};
assert.equal(fs.realpathSync(database('SELECT @@datadir')), fs.realpathSync(path.join(run, 'mysql-data')));
const rolesSql = 'SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id';
const menusSql = 'SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id';
const expectedRoles = '52f6d4b3fccd776b3444b8a2b96438aa8d873f00416cad277f88543c1cfd2bd6';
const sources = ['d4-linked-20261006-r3', 'd4-lifecycle-20261006-r5', 'd4-privacy-20261006-r8'];
for (const source of sources) assert.equal(read(path.join(evidence, source, 'fixture.json')).originalRoles, expectedRoles);
const finances = JSON.parse(database("SELECT JSON_EXTRACT(rule_snapshot,'$.workflow.financeApproverIds') FROM hr_employee_advance WHERE advance_id=203"));
finances.push(...Array.from({ length: 12 }, (_, index) => String(990001093 + index)), '3');
assert.equal(new Set(finances).size, 44);
finances.forEach(value => assert.match(value, /^[1-9]\d*$/));
const currentRoles = database(rolesSql), currentMenus = database(menusSql);
const projectedRoles = currentRoles.split(/\r?\n/).filter(line => !line.split('\t').slice(1, 2).some(value => BigInt(value) >= 990001579n && BigInt(value) <= 990001584n));
projectedRoles.push(...finances.map(value => `100000\t${value}\t3`));
projectedRoles.sort((left, right) => { const a = left.split('\t').map(BigInt), b = right.split('\t').map(BigInt); for (let i = 0; i < 3; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; });
const projectedMenus = currentMenus.split(/\r?\n/).filter(line => !['990000768', '990000769'].includes(line.split('\t')[1])).join('\r\n');
assert.equal(hash(projectedRoles.join('\r\n') + projectedMenus), expectedRoles, 'Exact historical permission projection required');
assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_id BETWEEN 990001579 AND 990001584 AND create_by='${marker}' AND status='0'`), '6');
assert.equal(database("SELECT leader FROM sys_dept WHERE tenant_id=100000 AND dept_id=100"), '990001581');
const originalDepartment = read(path.join(evidence, 'd3-funded-encashment-20261006-r7/fixture.json'));
assert.equal(originalDepartment.originalDepartment.leader, 'admin');
const deptColumns = database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='sys_dept' ORDER BY ordinal_position").split(/\r?\n/);
deptColumns.forEach(column => assert.match(column, /^[a-z][a-z0-9_]*$/));
const deptProjection = deptColumns.map(column => ['version', 'update_by', 'update_time'].includes(column) ? `IF(dept_id=100,NULL,\`${column}\`) AS \`${column}\`` : column === 'leader' ? "IF(dept_id=100,'admin',leader) AS leader" : `\`${column}\``).join(',');
assert.equal(hash(database(`SELECT ${deptProjection} FROM sys_dept WHERE dept_id>0 AND dept_id<=${originalDepartment.originalBounds.sys_dept} ORDER BY dept_id`)), originalDepartment.originalDigests.sys_dept, 'Historical department projection required');
assert.equal(database("SELECT COUNT(*) FROM sys_config WHERE (config_id=294 AND config_key='sys.hr.advance.processKey' AND config_value='h2ap_d000885f18dc' OR config_id=295 AND config_key='sys.hr.settlement.processKey' AND config_value='h2as_d000885f18dc_approval') AND update_time IS NULL"), '2');
assert.equal(database(`SELECT COUNT(*) FROM sys_business_rule WHERE id IN (211,212,213) AND rule_name='${marker}' AND remark='${marker}_published'`), '3');
assert.equal(database("SELECT COUNT(*) FROM wf_process_instance WHERE definition_id IN ('h2ap_d000885f18dc','h2as_d000885f18dc_approval','h2as_d000885f18dc_training') AND status NOT IN ('PASSED','REJECTED','INVALIDATED','TERMINATED')"), '0');
assert.equal(database("SELECT COUNT(*) FROM sys_role WHERE tenant_id=100000 AND (role_id=990000768 AND role_key='h2ap_d000885f18dc' OR role_id=990000769 AND role_key='h2ap_d000885f18dc_training')"), '2');
assert.equal(database(`SELECT COUNT(*) FROM sys_menu WHERE menu_id=2024 AND create_by='${marker}'`), '1');
const tables = [['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_change','id'],['hr_salary_slip','id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_payroll_period','period_id'],['hr_final_settlement','settlement_id'],['hr_final_settlement_item','item_id'],['hr_employee_advance','advance_id'],['hr_advance_repayment','repayment_id'],['hr_training_recovery','recovery_id'],['hr_employee_referral','referral_id'],['hr_offer','id'],['hr_leave_ledger','ledger_id'],['hr_leave_quota','id'],['biz_payment_request','id']];
const bounds = Object.fromEntries(tables.map(([table,key]) => [table, database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`)]));
const columns = Object.fromEntries(tables.map(([table]) => [table, database(`SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='${table}' ORDER BY ordinal_position`).split(/\r?\n/)]));
const preserved = () => Object.fromEntries(tables.map(([table,key]) => {
  columns[table].forEach(column => assert.match(column, /^[a-z][a-z0-9_]*$/));
  const digest = createHash('sha256'); let cursor = '0';
  for (;;) {
    const end = database(`SELECT COALESCE(MAX(${key}),0) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${bounds[table]} ORDER BY ${key} LIMIT 1000) selected`);
    if (end === '0') break;
    digest.update(database(`SELECT ${key},SHA2(CAST(JSON_ARRAY(${columns[table].map(column => `HEX(\`${column}\`)`).join(',')}) AS CHAR),256) FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${end} ORDER BY ${key}`)); cursor = end;
  }
  return [table, digest.digest('hex')];
}));
const before = preserved();
console.log('H2_R4_RECOVERY_PREFLIGHT: exact_finance_bindings=44; historical_permissions_match=true; department_projection_match=true; terminal_workflows=true; business_tables=17');
if (process.argv.includes('--apply')) {
  assert.ok(process.argv.includes('--d1-leave'), 'Explicit owned browser account scope required');
  assert.ok(!fs.existsSync(output), 'Keep previous recovery evidence'); fs.mkdirSync(output);
  const inputs = read(path.join(evidence, 'h2-settlement-all-sources-20261004-inputs-r4.json'));
  const checkInputs = () => { for (const item of inputs) { const file = path.resolve(root, item.Path); assert.ok(file.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)); assert.equal(hash(fs.readFileSync(file)).toUpperCase(), item.Hash.toUpperCase(), 'Original execution input changed'); } };
  checkInputs();
  fs.copyFileSync(new URL(import.meta.url), path.join(output, 'original-recover-h2-settlement-r4.mjs'));
  fs.writeFileSync(path.join(output, 'before.json'), JSON.stringify({ marker, finances, expectedRoles, currentRoles, currentMenus, bounds, columns, before, historicalSources: sources }, null, 2), { flag: 'wx' });
  const redis = await ownedGatewayRedis(state), key = 'sys:config:global:sys.captcha.dailyLimit', counterKey = 'CAPTCHA:LIMIT:127.0.0.1';
  const original = redis('GET', key), counterBefore = Number(redis('GET', counterKey) || '0');
  assert.equal(original, '"100"'); assert.equal(redis('PTTL', key), '-1'); assert.ok(Number.isSafeInteger(counterBefore));
  assert.equal(database("SELECT config_value FROM sys_config WHERE config_key='sys.captcha.dailyLimit' AND config_scope='0'"), '100');
  const temporary = JSON.stringify(String(Math.max(100, counterBefore) + 10));
  fs.writeFileSync(path.join(output, 'captcha-before.json'), JSON.stringify({ original, temporary, counterBefore, originalTtl: -1 }), { flag: 'wx' });
  let runtime, failure; const result = { permissions: false, configuration: false, preservation: false, secrets: false, captchaRestored: false };
  try {
    assert.equal(redis('EVAL', "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2],'EX',1800) return 1", 1, key, original, temporary), '1');
    runtime = await createD1LeaveRuntime(root, output);
    for (const configId of [294, 295]) await runtime.ok('admin', `/auth/system/config/${configId}`, 'DELETE');
    for (const ruleId of [211, 212, 213]) await runtime.ok('admin', `/auth/system/rules/${ruleId}`, 'DELETE');
    assert.equal(database('SELECT COUNT(*) FROM sys_config WHERE config_id IN (294,295)'), '0');
    assert.equal(database('SELECT COUNT(*) FROM sys_business_rule WHERE id IN (211,212,213)'), '0'); result.configuration = true;
    assert.equal(database(rolesSql), currentRoles); assert.equal(database(menusSql), currentMenus);
    database(`START TRANSACTION;
      UPDATE sys_dept SET leader='admin' WHERE tenant_id=100000 AND dept_id=100 AND leader='990001581';
      UPDATE wf_process_definition SET status='DRAFT',is_archived=1,is_latest=0 WHERE tenant_id=100000 AND definition_id IN ('h2ap_d000885f18dc','h2as_d000885f18dc_approval');
      UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id BETWEEN 990001579 AND 990001584 AND create_by='${marker}';
      DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id BETWEEN 990001579 AND 990001584;
      INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES ${finances.map(value => `(100000,${value},3)`).join(',')};
      DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id IN (990000768,990000769);
      DELETE FROM sys_role WHERE tenant_id=100000 AND role_id IN (990000768,990000769);
      DELETE FROM sys_menu WHERE menu_id=2024 AND create_by='${marker}';
      COMMIT;`);
    assert.equal(hash(database(rolesSql) + database(menusSql)), expectedRoles); result.permissions = true;
    assert.equal(database('SELECT leader FROM sys_dept WHERE tenant_id=100000 AND dept_id=100'), 'admin');
    assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE user_id BETWEEN 990001579 AND 990001584 AND status='1' AND create_by='${marker}'`), '6');
    assert.deepEqual(preserved(), before); result.preservation = true;
    result.scan = await runtime.scan(); result.secrets = true;
  } catch (error) { failure = String(error.message).split('\n')[0].slice(0, 200); }
  finally {
    try { await runtime?.close(); } finally {
      assert.equal(redis('EVAL', "local v=redis.call('GET',KEYS[1]); if v and v~=ARGV[1] and v~=ARGV[2] then return 0 end redis.call('SET',KEYS[1],ARGV[2]) return 1", 1, key, temporary, original), '1');
      assert.equal(redis('GET', key), original); assert.equal(redis('PTTL', key), '-1');
      assert.equal(database("SELECT config_value FROM sys_config WHERE config_key='sys.captcha.dailyLimit' AND config_scope='0'"), '100');
      result.counterBefore = counterBefore; result.counterAfter = Number(redis('GET', counterKey) || '0');
      assert.ok(result.counterAfter >= counterBefore && result.counterAfter <= counterBefore + 10); result.captchaRestored = true;
      checkInputs(); result.originalInputs = inputs.length;
      result.failure = failure; result.passed = !failure && result.permissions && result.configuration && result.preservation && result.secrets && result.captchaRestored;
      result.requests = runtime?.requests || []; result.globalComplete = false;
      fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
      console.log('H2_R4_RECOVERY: ' + JSON.stringify({ ...result, requests: result.requests.length }));
    }
  }
  if (!result.passed) process.exitCode = 1;
} else assert.ok(process.argv.includes('--preflight'));
