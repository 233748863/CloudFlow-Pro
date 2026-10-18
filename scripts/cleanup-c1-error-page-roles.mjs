import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Retire only roles recorded by completed owned C1 page runs; retain fixtures and business history.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rounds = process.argv.slice(2);
assert.ok(rounds.length > 0 && rounds.every(round => /^r[1-9][0-9]*$/.test(round)));
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING'); assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const sqlText = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
const database = statement => {
  const env = { ...process.env }; delete env.MYSQL_PWD;
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
    { input: statement, encoding: 'utf8', windowsHide: true, timeout: 30000, env });
  assert.equal(result.status, 0, 'Owned C1 role retirement query failed'); return result.stdout.trim();
};
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(fs.realpathSync(database('SELECT @@datadir;')), fs.realpathSync(path.join(run, 'mysql-data')));
const retired = [];
for (const round of rounds) {
  const result = JSON.parse(fs.readFileSync(path.join(evidence, `c1-form-live-20261005-${round}/result.json`), 'utf8'));
  assert.equal(result.isolated, true); assert.equal(result.scope, 'FULL_C'); assert.match(result.runId, /^[a-f0-9]{32}$/);
  const fixture = JSON.parse(fs.readFileSync(path.join(run, `private/live-${result.runId}.json`), 'utf8'));
  assert.equal(fixture.runId, result.runId);
  if (!fixture.roles?.length) continue;
  assert.equal(fixture.roles.length, 1);
  const account = fixture.accounts.legacy;
  const roleId = String(fixture.roles[0]), userId = account ? String(account.userId) : null;
  assert.match(roleId, /^990[0-9]{6,}$/);
  if (account) {
    assert.match(userId, /^[0-9]+$/); assert.equal(String(account.roleId), roleId); assert.equal(account.tenantId, 100000);
  }
  const suffix = result.runId.slice(0, 8), marker = 'C-LIVE-' + suffix, key = 'C1_ERROR_' + suffix;
  const role = database(`SELECT JSON_OBJECT('id',role_id,'tenant',tenant_id,'marker',create_by,'key',role_key,'status',status,'deleted',deleted) FROM sys_role WHERE role_id=${roleId}`);
  assert.ok(role, 'Recorded test role must exist');
  const observed = JSON.parse(role);
  assert.equal(observed.tenant, 100000); assert.equal(observed.marker, marker); assert.equal(observed.key, key); assert.equal(observed.deleted, 0);
  assert.equal(database(`SELECT CONCAT(user_id,':',tenant_id) FROM sys_user_role WHERE role_id=${roleId}`), account ? userId + ':100000' : '');
  if (account) assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE user_id=${userId} AND tenant_id=100000 AND create_by=${sqlText(marker)} AND user_name=${sqlText(account.username)}`), '1');
  const menus = database(`SELECT CONCAT(tenant_id,':',menu_id) FROM sys_role_menu WHERE role_id=${roleId} ORDER BY tenant_id,menu_id`);
  const unrelated = () => database(`SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu WHERE role_id<>${roleId} ORDER BY tenant_id,role_id,menu_id`);
  const otherBefore = hash(unrelated());
  const snapshotFile = path.join(run, `private/c1-role-retirement-${result.runId}.json`);
  if (!fs.existsSync(snapshotFile)) fs.writeFileSync(snapshotFile, JSON.stringify({ role: observed, userId, menus, unrelatedGrantsSha256: otherBefore }, null, 2), { flag: 'wx' });
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  assert.equal(String(snapshot.role.id), roleId); assert.equal(snapshot.role.marker, marker); assert.equal(snapshot.role.key, key); assert.equal(snapshot.userId, userId);
  assert.ok(menus === snapshot.menus || menus === '' && observed.status === '1', 'Test role grants changed after snapshot');
  const owned = `tenant_id=100000 AND role_id=${roleId} AND create_by=${sqlText(marker)} AND role_key=${sqlText(key)} AND deleted=0`;
  database(`START TRANSACTION; SELECT role_id FROM sys_role WHERE ${owned} FOR UPDATE; DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${roleId} AND EXISTS (SELECT 1 FROM sys_role WHERE ${owned}); UPDATE sys_role SET status='1' WHERE ${owned}; COMMIT;`);
  assert.equal(database(`SELECT COUNT(*) FROM sys_role_menu WHERE role_id=${roleId}`), '0');
  assert.equal(database(`SELECT status FROM sys_role WHERE ${owned}`), '1');
  assert.equal(hash(unrelated()), otherBefore, 'All unrelated grants must remain unchanged');
  retired.push({ round, runId: result.runId, roleId, removedGrants: snapshot.menus ? snapshot.menus.split(/\r?\n/).length : 0, unrelatedGrantsUnchanged: true, roleDisabled: true });
}
const reportFile = path.join(evidence, `c1-error-page-role-retirement-${rounds.join('-')}.json`);
const report = { passed: true, retired, productionModified: false };
if (fs.existsSync(reportFile)) assert.deepEqual(JSON.parse(fs.readFileSync(reportFile, 'utf8')), report, 'Previous retirement evidence must match');
else fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(`C1_ROLE_RETIREMENT: roles=${retired.length}; removed_grants=${retired.reduce((sum, role) => sum + role.removedGrants, 0)}; unrelated_grants_unchanged=true; business_history_preserved=true; production_modified=false`);
