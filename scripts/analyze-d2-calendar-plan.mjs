import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert.equal(fs.realpathSync(root).toLowerCase(), 'd:\\cloudflowpro');
const round = process.argv[2] || 'r1';
assert.match(round, /^r[1-9][0-9]*$/);
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidence, 'd2-calendar-query-plan-20261007-' + round);
assert.ok(!fs.existsSync(output), 'Retain earlier diagnostic');
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const state = read(path.join(run, 'state.json'));
assert.equal(state.status, 'RUNNING');
assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const env = { ...process.env }; delete env.MYSQL_PWD;
function query(statement) {
  assert.match(statement, /^(SELECT |EXPLAIN ANALYZE SELECT )/);
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1',
    '--port=' + state.mysqlPort, '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names',
    '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, encoding: 'utf8', env, windowsHide: true, timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Owned read-only plan query failed');
  return result.stdout.trim();
}
assert.equal(fs.realpathSync(query('SELECT @@datadir')), fs.realpathSync(path.join(run, 'mysql-data')));
const digest = value => createHash('sha256').update(value).digest('hex');
const source = path.join(root, 'cloudflow-backend/cloudflow-common/cloudflow-common-holiday/src/main/resources/mapper/holiday/HolidayResolverMapper.xml');
const fixturePath = path.join(evidence, 'd2-leave-attendance-20261005-r20/fixture.json');
const fixture = read(fixturePath);
assert.match(String(fixture.employeeId), /^[1-9][0-9]*$/);
const baselinePath = path.join(evidence, 'd2-calendar-target-originals-20261007-r1/HolidayResolverMapper.xml');
const baseline = fs.readFileSync(baselinePath, 'utf8');
const priorPath = path.join(evidence, 'd2-calendar-query-plan-20261007-r1/result.json');
const prior = read(priorPath);
assert.equal(prior.passed, true);
assert.equal(digest(baseline), prior.inputs.find(input => input.path === source)?.hash,
  'Baseline must match the retained pre-change query');
const xml = fs.readFileSync(source, 'utf8');
const dates = Array.from({ length: 30 }, (_, index) => '2026-09-' + String(index + 1).padStart(2, '0'));
function boundQuery(document) {
  const matched = document.match(/<select id="selectEmployeeCalendarDays"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(matched);
  const fragments = new Map(Array.from(document.matchAll(/<sql id="([^"]+)">([\s\S]*?)<\/sql>/g), item => [item[1], item[2]]));
  let body = matched[1];
  for (let count = 0; count < 4 && body.includes('<include'); count++) {
    body = body.replace(/<include refid="([^"]+)"\s*\/>/g, (_, name) => {
      assert.ok(fragments.has(name), 'Only declared local SQL fragments are allowed');
      return fragments.get(name);
    });
  }
  body = body.replace(/<foreach collection="dates" item="date" separator=",">[\s\S]*?<\/foreach>/,
    dates.map(date => "ROW(CAST('" + date + "' AS DATE))").join(', '))
    .replaceAll('#{employeeId}', String(fixture.employeeId)).replaceAll('#{tenantId}', '100000')
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').trim();
  assert.ok(!body.includes('#{') && !body.includes('<foreach') && !body.includes('<include'));
  return body;
}
const original = boundQuery(baseline);
const candidate = boundQuery(xml);
assert.notEqual(candidate, original);
const preserve = () => Object.fromEntries(['hr_employee', 'hr_schedule_assignment', 'hr_attendance_rule', 'hr_shift']
  .map(table => [table, digest(query('SELECT * FROM ' + table + ' ORDER BY id'))]));
const before = preserve();
const inputs = [fileURLToPath(import.meta.url), source, fixturePath, baselinePath, priorPath].map(file => ({ path: file, hash: digest(fs.readFileSync(file)) }));
fs.mkdirSync(output);
fs.copyFileSync(fileURLToPath(import.meta.url), path.join(output, 'original-analyzer.mjs'));
fs.writeFileSync(path.join(output, 'original.sql'), original + ';\n');
fs.writeFileSync(path.join(output, 'candidate.sql'), candidate + ';\n');
const originalRows = query(original);
const candidateRows = query(candidate);
assert.equal(candidateRows, originalRows, 'Candidate differs for the retained September employee');
assert.equal(originalRows.split('\n').length, 30);
const plans = [];
for (const name of ['original', 'candidate', 'candidate', 'original']) {
  const plan = query('EXPLAIN ANALYZE ' + (name === 'original' ? original : candidate));
  const file = String(plans.length + 1) + '-' + name + '.log';
  fs.writeFileSync(path.join(output, file), plan + '\n');
  const first = plan.split('\n').find(line => line.includes('actual time='));
  assert.ok(first, 'Actual database plan required');
  plans.push({ name, file, hash: digest(plan + '\n'), root: first.trim() });
}
assert.deepEqual(preserve(), before, 'Existing rows changed during read-only diagnostics');
for (const input of inputs) assert.equal(digest(fs.readFileSync(input.path)), input.hash);
const result = { passed: true, employeeId: String(fixture.employeeId), month: '2026-09', rows: 30,
  sameResult: true, candidateFromCurrentMapper: true, databaseVersion: query('SELECT VERSION()'), plans, inputs, preservation: before,
  productModified: false, actualTenantInterceptor: false, ordinaryHttpPerformanceMeasured: false,
  candidateBusinessCoverageComplete: false, globalComplete: false };
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: true, rows: 30, plans: plans.map(plan => ({ name: plan.name, root: plan.root })),
  productModified: false, actualTenantInterceptor: false, ordinaryHttpPerformanceMeasured: false }));
