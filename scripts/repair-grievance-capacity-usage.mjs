import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Repairs only the owned fixture counter written with the wrong unit by R2-R5.
const root = 'D:\\CloudFlowPro';
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING'); assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const result = JSON.parse(fs.readFileSync(path.join(run, 'h5-grievance-archive-capacity-results-a3f26bf5f136.json'), 'utf8'));
assert.equal(result.passed, true); assert.equal(result.evidence.storageGrievanceArchiveCleanup, true);
const env = { ...process.env }; delete env.MYSQL_PWD;
const database = statement => {
  const sqlResult = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, encoding: 'utf8', env, windowsHide: true, timeout: 30000 });
  assert.equal(sqlResult.status, 0, 'Owned usage correction SQL failed'); return sqlResult.stdout.trim();
};
assert.equal(fs.realpathSync(database('SELECT @@datadir;')), fs.realpathSync(path.join(run, 'mysql-data')));
assert.equal(database("SELECT COUNT(*) FROM hr_grievance WHERE tenant_id=100000 AND grievance_id=110 AND subject='H5_GR_ARCHIVE_a3f26bf5f136' AND status='ESCALATED';"), '1');
const byteQuery = `SELECT COALESCE(SUM(physical.object_size),0) FROM (
  SELECT MAX(GREATEST(COALESCE(file_size,0),0)) AS object_size FROM sys_file WHERE tenant_id=100000 AND deleted=0
  GROUP BY storage_type,config_id,CAST(COALESCE(NULLIF(file_path,''),CAST(file_id AS CHAR)) AS BINARY)) physical`;
const bytes = Number(database(byteQuery + ';')); const usedMiB = Math.ceil(bytes / 1048576);
assert.ok(Number.isSafeInteger(bytes) && bytes > 0);
const tenant = JSON.parse(database("SELECT JSON_OBJECT('limit',storage_limit,'used',storage_used,'version',version) FROM sys_tenant WHERE tenant_id=100000 AND deleted=0;"));
assert.ok(tenant.used === bytes || tenant.used === usedMiB, 'Counter changed since owned verification; inspect before repair');
let changed = false;
if (tenant.used !== usedMiB) {
  assert.equal(database(`UPDATE sys_tenant SET storage_used=${usedMiB} WHERE tenant_id=100000 AND deleted=0
    AND version=${tenant.version} AND storage_used=${bytes} AND storage_limit <=> ${tenant.limit ?? 'NULL'}
    AND (${byteQuery})=${bytes}; SELECT ROW_COUNT();`), '1');
  changed = true;
}
assert.equal(Number(database('SELECT storage_used FROM sys_tenant WHERE tenant_id=100000;')), usedMiB);
assert.equal(Number(database(byteQuery + ';')), bytes);
console.log(`H5_GRIEVANCE_USAGE_REPAIR: tenant=100000; bytes=${bytes}; used_mib=${usedMiB}; changed=${changed}; limit_and_version_unchanged=true; files_unchanged=true; production_modified=false`);
