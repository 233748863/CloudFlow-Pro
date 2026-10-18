import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { digestOwnedSelect } from './runtime-checks/owned-select-digest.mjs';

const root = 'D:/CloudFlowPro';
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const output = path.resolve(process.argv[2] || '');
assert.equal(fs.realpathSync(path.dirname(output)), fs.realpathSync(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
assert.match(path.basename(output), /^owned-select-digest-checks-20261009-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(output));
fs.mkdirSync(output);
const files = ['scripts/verify-owned-select-digest.mjs', 'scripts/runtime-checks/owned-select-digest.mjs', 'scripts/runtime-checks/d1-leave-runtime.mjs'];
for (const name of ['rules-live', 'attendance-privacy', 'attendance-appeals', 'scale-attendance', 'attendance-config', 'month-appeal-page']) {
  files.push(`scripts/verify-d2-${name}.mjs`, `scripts/run-d2-${name}.ps1`);
}
const fileHash = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const inputs = files.map(file => ({ path: file, hash: fileHash(file) }));
fs.writeFileSync(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
for (const file of files) {
  const target = path.join(output, 'originals', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target, fs.constants.COPYFILE_EXCL);
}
const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const environment = { ...process.env };
delete environment.MYSQL_PWD;
const argumentsList = ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
  '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'];
const buffered = statement => {
  assert.match(statement, /^SELECT\s/i);
  const result = spawnSync('mysql.exe', argumentsList, { input: statement, windowsHide: true, env: environment, timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Bounded reference read failed');
  return result.stdout;
};
assert.equal(fs.realpathSync(buffered('SELECT @@datadir').toString().trim()), fs.realpathSync(path.join(run, 'mysql-data')));
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let failure;
const observations = [];
try {
  for (const statement of ['UPDATE hr_attendance_record SET id=id', 'SELECT 1; SELECT 2', "SELECT 1 INTO OUTFILE 'rejected'"]) {
    await assert.rejects(digestOwnedSelect(statement), /One owned read statement required/);
    checks.push('reject_non_read_or_multiple_statement');
  }
  for (const [name, statement] of [['empty', 'SELECT 1 WHERE 1=0'], ['unicode_whitespace', "SELECT CONCAT('  汉字',CHAR(9),'x',CHAR(10),'tail  ')"]]) {
    const reference = buffered(statement);
    const actual = await digestOwnedSelect(statement);
    check(name + '_complete_bytes', actual.bytes === reference.length && actual.hash === hash(reference) && actual.exactBytes);
  }
  const boundary = buffered('SELECT id FROM hr_attendance_record ORDER BY id LIMIT 19999,1').toString().trim();
  assert.match(boundary, /^[1-9]\d*$/);
  const row = buffered("SELECT REPEAT('x',1024)");
  const finalRow = buffered("SELECT CONCAT(REPEAT('x',1023),'y')");
  const completeDigest = createHash('sha256');
  const changedDigest = createHash('sha256');
  for (let index = 0; index < 20000; index++) {
    completeDigest.update(row);
    changedDigest.update(index === 19999 ? finalRow : row);
  }
  const large = await digestOwnedSelect(`SELECT REPEAT('x',1024) FROM hr_attendance_record WHERE id<=${boundary} ORDER BY id`);
  const changed = await digestOwnedSelect(`SELECT CONCAT(REPEAT('x',1023),IF(id=${boundary},'y','x')) FROM hr_attendance_record WHERE id<=${boundary} ORDER BY id`);
  check('over_old_limit_complete', large.bytes > 16777216 && large.bytes === row.length * 20000 && large.hash === completeDigest.digest('hex'));
  check('last_byte_after_old_limit_detected', changed.bytes === large.bytes && changed.hash !== large.hash && changed.hash === changedDigest.digest('hex'));
  for (const [table, key] of [['hr_employee', 'id'], ['hr_shift', 'id'], ['hr_attendance_rule', 'id'], ['hr_schedule_assignment', 'id'],
    ['hr_attendance_checkin', 'checkin_id'], ['hr_attendance_record', 'id'], ['hr_attendance_monthly', 'id'], ['sys_holiday_calendar', 'calendar_id'], ['sys_holiday_date', 'date_id']]) {
    const statement = `SELECT * FROM ${table} ORDER BY ${key}`;
    const reference = buffered(statement);
    const actual = await digestOwnedSelect(statement);
    check(table + '_all_rows_exact_bytes', actual.bytes === reference.length && actual.hash === hash(reference));
    observations.push({ table, bytes: actual.bytes });
  }
  await assert.rejects(digestOwnedSelect('SELECT cloudflow_missing_column FROM hr_attendance_record'), /^Error: Owned SELECT stream failed$/);
  checks.push('query_failure_rejects_without_raw_output');
  const cli = spawnSync(process.execPath, [path.join(root, 'scripts/runtime-checks/owned-select-digest.mjs'), '--d1-owned-digest'],
    { input: 'SELECT 1', encoding: 'utf8', windowsHide: true, env: environment, timeout: 65000, maxBuffer: 65536 });
  check('synchronous_caller_uses_bounded_digest_only', cli.status === 0 && JSON.parse(cli.stdout).hash === hash(buffered('SELECT 1')) && cli.stdout.length < 256);
} catch (error) {
  failure = String(error.message).split('\n')[0];
} finally {
  const unchanged = inputs.every(input => fileHash(input.path) === input.hash);
  const result = { passed: !failure && unchanged, checks, observations, inputs: inputs.length, inputsUnchanged: unchanged, actualDatabase: true,
    readOnly: true, rawOutputRetained: false, productModified: false, failure };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(`OWNED_SELECT_DIGEST_CHECKS: passed=${result.passed}; checks=${checks.length}; inputs=${inputs.length}; unchanged=${unchanged}; database_writes=0; raw_output_retained=false`);
  if (!result.passed) process.exitCode = 1;
}
