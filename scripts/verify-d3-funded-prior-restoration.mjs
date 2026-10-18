import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

assert.ok(process.argv.includes('--d3-funded-prior-restoration'));
const round=process.argv[process.argv.indexOf('--round')+1];assert.match(round,/^r[1-9][0-9]*$/);
const root='D:/CloudFlowPro',run=path.join(root,'.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const evidence=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output=path.join(evidence,'d3-funded-prior-restoration-20261006-'+round+'.json');assert.ok(!fs.existsSync(output));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const state=read(path.join(run,'state.json'));assert.equal(state.status,'RUNNING');assert.equal(fs.realpathSync(state.run),fs.realpathSync(run));
const env={...process.env};delete env.MYSQL_PWD;
const db=statement=>{assert.match(statement,/^SELECT /);const result=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1','--port='+state.mysqlPort,'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],{input:statement,encoding:'utf8',windowsHide:true,env,timeout:30000,maxBuffer:16*1024*1024});assert.equal(result.status,0,'Owned prior preservation read failed');return result.stdout.trim();};
assert.equal(fs.realpathSync(db('SELECT @@datadir')),fs.realpathSync(path.join(run,'mysql-data')));
const hash=value=>createHash('sha256').update(value).digest('hex');
const currentVersion=Number(db('SELECT version FROM hr_payroll_period WHERE period_id=104'));assert.ok(Number.isSafeInteger(currentVersion)&&currentVersion>=5&&currentVersion<=100);
const reports=[];
for(const prior of ['r3','r6']){
  const folder=path.join(evidence,'d3-funded-encashment-20261006-'+prior),fixture=read(path.join(folder,'fixture.json')),result=read(path.join(folder,'result.json'));
  assert.equal(result.passed,false);assert.equal(result.preservation,false);const tables=[];let originalVersion;
  for(const [table,limit]of Object.entries(fixture.originalBounds)){
    assert.match(table,/^[a-z][a-z0-9_]*$/);assert.match(String(limit),/^\d+$/);
    const key=db("SELECT column_name FROM information_schema.key_column_usage WHERE table_schema='cloud_flow_db' AND table_name='"+table+"' AND constraint_name='PRIMARY' AND ordinal_position=1");assert.match(key,/^[a-z][a-z0-9_]*$/);
    const columns=db("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='"+table+"' ORDER BY ordinal_position").split(/\r?\n/);assert.ok(columns.every(column=>/^[a-z][a-z0-9_]*$/.test(column)));
    const digest=version=>{const projection=columns.map(column=>table==='sys_dept'&&['version','update_by','update_time'].includes(column)?'IF(dept_id=100,NULL,`'+column+'`) AS `'+column+'`':table==='hr_payroll_period'&&column==='version'?'IF(period_id=104,'+version+',version) AS version':'`'+column+'`').join(',');const accumulator=createHash('sha256');let cursor='0';for(;;){const end=db('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+limit+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;accumulator.update(db('SELECT '+projection+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}return accumulator.digest('hex');};
    if(table==='hr_payroll_period'){
      const matches=[];for(let version=0;version<=currentVersion;version++)if(digest(version)===fixture.originalDigests[table])matches.push(version);
      assert.equal(matches.length,1,'Exactly one original period version must reproduce the full pre-run table');originalVersion=matches[0];
    }else assert.equal(digest(currentVersion),fixture.originalDigests[table],'Original table differs: '+prior+' '+table);
    tables.push(table);
  }
  reports.push({round:prior,tables:tables.length,originalVersion,currentVersion,originalBusinessFieldsPreserved:true,departmentRestorationVerified:prior==='r3',periodRevisionRetained:true,originalFailureRetained:true});
}
assert.equal(read(path.join(evidence,'d3-funded-department-restoration-20261006-r1.json')).passed,true);
const recovery=read(path.join(evidence,'d3-funded-payment-recovery-20261006-r3.json'));
assert.equal(recovery.passed,true);assert.equal(recovery.fundedAudits,1);
assert.equal(hash(db("SELECT payload_json FROM outbox_event WHERE tenant_id=100000 AND aggregate_id='9043' AND event_type='HR_ADVANCE_PAYMENT_PAID'")),recovery.originalEventDigest);
assert.equal(db("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_ADVANCE' AND business_id=199 AND operation_type='FUNDED'"),'1');
const report={passed:true,reports,originalPaymentEventUnchanged:true,fundedAudits:1,readOnly:true,productionModified:false};fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log('D3_FUNDED_PRIOR_RESTORATION: '+JSON.stringify(report));
