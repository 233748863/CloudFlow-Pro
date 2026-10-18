import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run=path.join(root,'.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const state=JSON.parse((await fs.readFile(path.join(run,'state.json'),'utf8')).replace(/^\uFEFF/,''));
assert.equal(state.status,'RUNNING');assert.equal(await fs.realpath(state.run),await fs.realpath(run));
const env={...process.env};delete env.MYSQL_PWD;
const database=statement=>{
  const result=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1',`--port=${state.mysqlPort}`,
    '--user=root','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],
    {input:statement,encoding:'utf8',windowsHide:true,env,timeout:30000});
  assert.equal(result.status,0,'Owned archive inspection failed');return result.stdout.trim();
};
assert.equal(await fs.realpath(database('SELECT @@datadir;')),await fs.realpath(path.join(run,'mysql-data')));
const policies=database(`SELECT JSON_OBJECT('id',p.id,'module',p.biz_module,'days',p.retain_days,'table',p.archive_table,'status',p.status,
  'eligible',(SELECT COUNT(*) FROM sys_audit_log a JOIN sys_tenant t ON t.tenant_id=a.tenant_id
    WHERE t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) AND a.biz_module=p.biz_module AND p.retain_days>0 AND a.create_time<DATE_SUB(NOW(),INTERVAL p.retain_days DAY)),
  'tableExists',(SELECT COUNT(*) FROM information_schema.tables x WHERE x.table_schema=DATABASE() AND x.table_name=p.archive_table))
  FROM sys_audit_archive_policy p ORDER BY p.id;`).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const properties=await fs.readFile(path.join(run,'auth/integration.properties'),'utf8');
const configured=properties.split(/\r?\n/).filter(line=>/^cloudflow\.audit\.archive\.dry-run=/.test(line));
console.log('A3_AUDIT_ARCHIVE_READONLY: '+JSON.stringify({policies,dryRunConfiguration:configured.length?configured:['default=true'],
  jobs:database("SELECT job_id,handler_name,status FROM sys_job WHERE handler_name='auditLogArchive' AND deleted=0 ORDER BY job_id;").split(/\r?\n/).filter(Boolean),
  formalTables:Number(database('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();')),databaseWrites:0,productionModified:false}));
