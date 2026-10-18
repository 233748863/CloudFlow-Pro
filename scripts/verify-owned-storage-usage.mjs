import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const run = 'D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\9799534e1a3a47b5958330f14ae16dc7';
const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING'); assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const env = { ...process.env }; delete env.MYSQL_PWD;
const database = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, encoding: 'utf8', env, windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, 'Owned storage read failed'); return result.stdout.trim();
};
assert.equal(fs.realpathSync(database('SELECT @@datadir;')), fs.realpathSync(path.join(run, 'mysql-data')));
const result = JSON.parse(database(`SELECT JSON_OBJECT('cachedMiB',storage_used,'actualBytes',(
  SELECT COALESCE(SUM(physical.object_size),0) FROM (
    SELECT MAX(GREATEST(COALESCE(file_size,0),0)) AS object_size FROM sys_file WHERE tenant_id=100000 AND deleted=0
    GROUP BY storage_type,config_id,CAST(COALESCE(NULLIF(file_path,''),CAST(file_id AS CHAR)) AS BINARY)) physical))
  FROM sys_tenant WHERE tenant_id=100000 AND deleted=0;`));
assert.ok(Number.isSafeInteger(result.actualBytes) && result.actualBytes >= 0);
assert.equal(result.cachedMiB, Math.ceil(result.actualBytes / 1048576), 'Cached storage must use ceiling MiB, not bytes');
console.log(`OWNED_STORAGE_USAGE: tenant=100000; actual_bytes=${result.actualBytes}; cached_mib=${result.cachedMiB}; ceiling_mib_matches=true; database_writes=0`);
