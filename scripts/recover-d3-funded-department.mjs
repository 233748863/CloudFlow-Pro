import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Restore only two synthetic seed fields, after proving the complete reconstructed
// department projection equals the pre-run SHA-256. Retain the failed R3 evidence.
assert.ok(process.argv.includes('--recover-d3-funded-department'));
const root='D:/CloudFlowPro',run=path.join(root,'.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const evidence=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const state=read(path.join(run,'state.json')),folder=path.join(evidence,'d3-funded-encashment-20261006-r3');
const fixture=read(path.join(folder,'fixture.json')),failed=read(path.join(folder,'result.json'));
assert.equal(state.status,'RUNNING');assert.equal(fs.realpathSync(state.run),fs.realpathSync(run));
assert.equal(failed.passed,false);assert.equal(failed.preservation,false);assert.equal(fixture.restorations.department,true);
const output=path.join(evidence,'d3-funded-department-restoration-20261006-r1.json');assert.ok(!fs.existsSync(output));
const env={...process.env};delete env.MYSQL_PWD;
const db=statement=>{const result=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1','--port='+state.mysqlPort,'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],{input:statement,encoding:'utf8',windowsHide:true,env,timeout:30000,maxBuffer:16*1024*1024});assert.equal(result.status,0,'Owned restoration query failed');return result.stdout.trim();};
assert.equal(fs.realpathSync(db('SELECT @@datadir')),fs.realpathSync(path.join(run,'mysql-data')));
const hash=value=>createHash('sha256').update(value).digest('hex');
const sql=value=>"CONVERT(X'"+Buffer.from(value).toString('hex')+"' USING utf8mb4)";
const seed=fs.readFileSync(path.join(root,'cloudflow-backend/DB/06.cloudflow-business-seed.sql'),'utf8').split(/\r?\n/).find(line=>line.includes('sys_dept ')&&line.includes('VALUES(100,'));
const match=/'admin',\s*'([^']+)',\s*'([^']+)',\s*'0'/.exec(seed);assert.ok(match,'Exact department seed unavailable');
const recovered={phone:match[1],email:match[2]};
const columns=db("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='sys_dept' ORDER BY ordinal_position").split(/\r?\n/);assert.ok(columns.every(value=>/^[a-z][a-z0-9_]*$/.test(value)));
const projection=(restore)=>columns.map(column=>{
  if(['version','update_by','update_time'].includes(column))return 'IF(dept_id=100,NULL,`'+column+'`) AS `'+column+'`';
  if(restore&&Object.hasOwn(recovered,column))return 'IF(dept_id=100,'+sql(recovered[column])+',`'+column+'`) AS `'+column+'`';
  return '`'+column+'`';
}).join(',');
const limit=String(fixture.originalBounds.sys_dept);assert.match(limit,/^\d+$/);
const before=db('SELECT '+projection(false)+' FROM sys_dept WHERE dept_id>0 AND dept_id<='+limit+' ORDER BY dept_id');
const candidate=db('SELECT '+projection(true)+' FROM sys_dept WHERE dept_id>0 AND dept_id<='+limit+' ORDER BY dept_id');
assert.notEqual(hash(before),fixture.originalDigests.sys_dept);
assert.equal(hash(candidate),fixture.originalDigests.sys_dept,'Two restored seed fields must reconstruct the entire original department projection');
const current=JSON.parse(db("SELECT JSON_OBJECT('phone',phone,'email',email,'version',version) FROM sys_dept WHERE tenant_id=100000 AND dept_id=100"));
assert.ok(current.phone.includes('*')&&current.email.includes('*'));assert.equal(current.version,fixture.departmentVersionAfter);
const otherColumns=columns.filter(column=>!['phone','email'].includes(column)).map(column=>'`'+column+'`').join(',');
const otherBefore=hash(db('SELECT '+otherColumns+' FROM sys_dept WHERE dept_id=100 AND tenant_id=100000'));
const update='UPDATE sys_dept SET phone='+sql(recovered.phone)+',email='+sql(recovered.email)+',update_time=update_time WHERE tenant_id=100000 AND dept_id=100 AND version='+current.version+' AND phone='+sql(current.phone)+' AND email='+sql(current.email)+'; SELECT ROW_COUNT();';
assert.equal(db(update),'1');
assert.equal(hash(db('SELECT '+otherColumns+' FROM sys_dept WHERE dept_id=100 AND tenant_id=100000')),otherBefore,'Restoration must preserve every other department field');
assert.equal(hash(db('SELECT '+projection(false)+' FROM sys_dept WHERE dept_id>0 AND dept_id<='+limit+' ORDER BY dept_id')),fixture.originalDigests.sys_dept);
const report={passed:true,sourceRound:'r3',failedEvidenceRetained:true,rows:1,fields:['phone','email'],source:'original synthetic department seed, verified against full pre-run projection hash',originalDepartmentProjectionRestored:true,otherFieldsUnchanged:true,versionUnchanged:true,productionModified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log('D3_FUNDED_DEPARTMENT_RECOVERY: '+JSON.stringify(report));
