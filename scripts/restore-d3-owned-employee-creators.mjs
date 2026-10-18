import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = 'D:/CloudFlowPro';
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const state = read(path.join(run, 'state.json'));
assert.equal(state.status, 'RUNNING'); assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const env = { ...process.env }; delete env.MYSQL_PWD;
const db = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], { input: statement, encoding: 'utf8', windowsHide: true, env, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Owned employee restoration query failed'); return result.stdout.trim();
};
assert.equal(fs.realpathSync(db('SELECT @@datadir')), fs.realpathSync(path.join(run, 'mysql-data')));
const fixture = read(path.join(evidence, 'd3-payroll-deductions-20261006-r2/fixture.json'));
const privacy = read(path.join(evidence, 'd3-salary-privacy-20261006-r2/fixture.json'));
assert.equal(fixture.marker, 'D3D-b38126e08b99');
assert.deepEqual(fixture.employees.map(employee => String(employee.id)), ['98209282285', '98209282286']);
const output = path.join(evidence, 'd3-employee-creator-restoration-20261006-r1.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const allColumns = db("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cloud_flow_db' AND TABLE_NAME='hr_employee' ORDER BY ORDINAL_POSITION").split(/\r?\n/);
assert.ok(allColumns.every(column => /^[a-z_][a-z0-9_]*$/.test(column)));
const quoted = columns => columns.map(column => '`' + column + '`').join(',');
const creator = 'g_import_admin';
if (process.argv.includes('--complete-timestamp-recovery')) {
  const initial = read(output), completion = output.replace('-r1.json', '-r2.json');
  assert.equal(initial.passed, false); assert.ok(!fs.existsSync(completion));
  const recovered = initial.records.map(record => {
    const selected = record.selected; assert.ok(['98209282285','98209282286'].includes(selected));
    const originalTime = db(`SELECT JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.updateTime')) FROM hr_audit_log WHERE business_domain='hr_employee' AND business_id=${selected} AND operation_type='UPDATE' ORDER BY id DESC LIMIT 1`);
    assert.match(originalTime, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    const projected = allColumns.filter(column => column !== 'create_by').map(column => column === 'update_time' ? `CAST('${originalTime}' AS DATETIME)` : '`' + column + '`').join(',');
    assert.equal(hash(db(`SELECT ${projected} FROM hr_employee WHERE id=${selected}`)), record.unchangedColumns, 'All original columns reconstructed before timestamp repair');
    assert.equal(db(`SELECT COUNT(*) FROM hr_employee WHERE id=${selected} AND tenant_id=100000 AND create_by='${creator}' AND user_id IS NULL AND deleted=0`), '1');
    return { ...record, originalTime };
  });
  assert.equal(hash(db('SELECT * FROM hr_employee WHERE id NOT IN (98209282285,98209282286) ORDER BY id')), initial.unrelatedBefore);
  db('START TRANSACTION; ' + recovered.map(record => `UPDATE hr_employee SET update_time='${record.originalTime}' WHERE id=${record.selected} AND tenant_id=100000 AND create_by='${creator}' AND user_id IS NULL;`).join(' ') + ' COMMIT;');
  for (const record of recovered) {
    assert.equal(hash(db(`SELECT ${quoted(allColumns.filter(column => column !== 'create_by'))} FROM hr_employee WHERE id=${record.selected}`)), record.unchangedColumns);
    assert.equal(hash(db(`SELECT ${quoted(allColumns.filter(column => !['user_id','update_time','update_by'].includes(column)))} FROM hr_employee WHERE id=${record.selected}`)), record.reconstructedDigest);
  }
  assert.equal(hash(db('SELECT * FROM hr_employee WHERE id NOT IN (98209282285,98209282286) ORDER BY id')), initial.unrelatedBefore);
  fs.writeFileSync(completion, JSON.stringify({ passed: true, records: recovered, restored: 2, onlyCreateByChanged: true, originalRestorationFailure: 'Database ON UPDATE timestamp advanced; original audit timestamp reconstructed and restored with full-column hashes', originalR2FailureRetained: true, productionModified: false }, null, 2), { flag: 'wx' });
  console.log('D3_EMPLOYEE_CREATOR_RESTORATION: restored=2; original_timestamps_restored=true; all_original_column_hashes_verified=true; unrelated_rows_changed=0; other_columns_changed=0; production_modified=false');
  process.exit(0);
}
assert.ok(!fs.existsSync(output), 'Keep previous restoration evidence');
const records = fixture.employees.map(employee => {
  const selected = String(employee.id);
  assert.equal(db(`SELECT COUNT(*) FROM hr_employee WHERE id=${selected} AND tenant_id=100000 AND employee_no='${employee.body.employeeNo}' AND create_by IS NULL AND user_id IS NULL AND deleted=0`), '1');
  const createAudit = JSON.parse(db(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'creator',JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.createBy')),'created',JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.createTime'))) FROM hr_audit_log WHERE business_domain='hr_employee' AND business_id=${selected} AND operation_type='CREATE' AND tenant_id=100000`));
  assert.equal(createAudit.creator, creator);
  assert.equal(db(`SELECT DATE_FORMAT(create_time,'%Y-%m-%d %H:%i:%s') FROM hr_employee WHERE id=${selected}`), createAudit.created);
  const protectedColumns = allColumns.filter(column => !['user_id','update_time','update_by'].includes(column));
  const projected = protectedColumns.map(column => column === 'create_by' ? `'${creator}'` : '`' + column + '`').join(',');
  const reconstructedDigest = hash(db(`SELECT ${projected} FROM hr_employee WHERE id=${selected}`));
  if (selected === '98209282286') assert.equal(reconstructedDigest, privacy.protectedDigest['hr_employee:' + selected], 'Original protected digest must be reconstructed exactly');
  return { selected, createAudit, before: hash(db(`SELECT * FROM hr_employee WHERE id=${selected}`)), unchangedColumns: hash(db(`SELECT ${quoted(allColumns.filter(column => column !== 'create_by'))} FROM hr_employee WHERE id=${selected}`)), reconstructedDigest };
});
const unrelatedBefore = hash(db('SELECT * FROM hr_employee WHERE id NOT IN (98209282285,98209282286) ORDER BY id'));
const report = { passed: false, records, action: 'Restore only creator from original CREATE audit on two owned synthetic employees', originalR2FailureRetained: true, unrelatedBefore };
fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
assert.equal(db("START TRANSACTION; UPDATE hr_employee SET create_by='g_import_admin',update_time=update_time WHERE id IN (98209282285,98209282286) AND tenant_id=100000 AND create_by IS NULL AND user_id IS NULL AND deleted=0; SELECT ROW_COUNT(); COMMIT;"), '2');
for (const record of records) {
  assert.equal(hash(db(`SELECT ${quoted(allColumns.filter(column => column !== 'create_by'))} FROM hr_employee WHERE id=${record.selected}`)), record.unchangedColumns);
  assert.equal(hash(db(`SELECT ${quoted(allColumns.filter(column => !['user_id','update_time','update_by'].includes(column)))} FROM hr_employee WHERE id=${record.selected}`)), record.reconstructedDigest);
  record.after = hash(db(`SELECT * FROM hr_employee WHERE id=${record.selected}`));
}
assert.equal(hash(db('SELECT * FROM hr_employee WHERE id NOT IN (98209282285,98209282286) ORDER BY id')), unrelatedBefore);
report.passed = true; report.restored = 2; report.onlyCreateByChanged = true; report.productionModified = false;
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log('D3_EMPLOYEE_CREATOR_RESTORATION: restored=2; create_audit_verified=true; peer_original_digest_reconstructed=true; unrelated_rows_changed=0; other_columns_changed=0; production_modified=false');
