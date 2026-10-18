import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root='D:/CloudFlowPro';
const run=path.join(root,'.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const evidence=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const state=read(path.join(run,'state.json'));
assert.equal(state.status,'RUNNING');assert.equal(fs.realpathSync(state.run),fs.realpathSync(run));
const env={...process.env};delete env.MYSQL_PWD;
function db(statement){
  assert.match(statement,/^SELECT\s/i);assert.ok(!/;\s*\S|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(statement));
  const result=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1',`--port=${state.mysqlPort}`,'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],{input:statement,encoding:'utf8',windowsHide:true,env,timeout:30000,maxBuffer:16*1024*1024});
  assert.equal(result.status,0,'Owned audit read failed');return result.stdout.trim();
}
assert.equal(fs.realpathSync(db('SELECT @@datadir')),fs.realpathSync(path.join(run,'mysql-data')));
const rows=statement=>db(statement).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const source=path.join(evidence,'d3-salary-privacy-20261006-r5/requests.json');
const requests=read(source).filter(request=>request.method==='GET'&&/^\/hr\/(?:ess\/salary-slips|compensation\/payroll\/(?:slips|batches))/.test(request.path));
assert.ok(requests.length>60);assert.ok(requests.every(request=>/^[a-f0-9]{32}$/.test(request.traceId)));
const traceIds=[...new Set(requests.map(request=>request.traceId))].map(value=>"'"+value+"'").join(',');
const access=rows(`SELECT JSON_OBJECT('traceId',trace_id,'tenant',CAST(tenant_id AS CHAR),'actor',create_by,'method',request_method,'path',request_url,'code',result_code,'type',log_type,'paramsAbsent',params IS NULL OR params='') FROM sys_log WHERE trace_id IN (${traceIds}) ORDER BY log_id`);
const errors=rows(`SELECT JSON_OBJECT('traceId',trace_id,'tenant',CAST(tenant_id AS CHAR),'actor',user_name,'method',request_method,'path',request_url,'exception',exception_class,'paramsAbsent',request_params IS NULL OR request_params='','messageAbsent',exception_message IS NULL OR exception_message='') FROM sys_api_error_log WHERE trace_id IN (${traceIds}) ORDER BY error_id`);
const result=requests.map(request=>({...request,access:access.filter(entry=>entry.traceId===request.traceId),errors:errors.filter(entry=>entry.traceId===request.traceId)}));
const denied=result.filter(request=>request.status>=400);
const domainOperations=rows("SELECT JSON_OBJECT('operation',operation_type,'count',COUNT(*)) FROM hr_audit_log WHERE business_domain IN ('SALARY_SLIP','PAYROLL_BATCH') GROUP BY operation_type ORDER BY operation_type");
const report={readOnly:true,sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),queries:result.length,denied:denied.length,deniedWithAccess:denied.filter(request=>request.access.length>0).length,deniedWithErrors:denied.filter(request=>request.errors.length>0).length,deniedWithNoPersistedTrace:denied.filter(request=>request.access.length+request.errors.length===0).length,domainOperations,requests:result,dedicatedDeniedHrAuditVerified:false};
const output=path.join(evidence,'d3-denied-query-audit-inventory-20261006-r1.json');
fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});
console.log('D3_DENIED_AUDIT_INVENTORY: '+JSON.stringify({queries:report.queries,denied:report.denied,withAccess:report.deniedWithAccess,withError:report.deniedWithErrors,noPersistedTrace:report.deniedWithNoPersistedTrace,byActor:Object.fromEntries([...new Set(denied.map(request=>request.actor))].map(actor=>[actor,{total:denied.filter(request=>request.actor===actor).length,missing:denied.filter(request=>request.actor===actor&&request.access.length+request.errors.length===0).length}]))}));
