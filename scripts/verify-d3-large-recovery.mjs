import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';

assert.ok(process.argv.includes('--d3-large-recovery'));
const root='D:/CloudFlowPro',output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
const source=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime/d3-large-amounts-20261006-r5');
const fixture=JSON.parse(fs.readFileSync(path.join(source,'fixture.json'),'utf8'));
assert.equal(fixture.marker,'D3L-5feb6d5efff9');assert.deepEqual(fixture.batches,['157','158','159']);assert.equal(fixture.slabId,'1517');
const hash=value=>createHash('sha256').update(value).digest('hex');
const originalFiles=fs.readdirSync(source).filter(name=>fs.statSync(path.join(source,name)).isFile()).map(name=>({name,hash:hash(fs.readFileSync(path.join(source,name)))}));
let runtime,failure;
const evidence={preservation:false,restoration:false,secrets:false};
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {database,check}=runtime;
  const pay='/hr/compensation/payroll',ok=async(url,method='GET',body)=>runtime.success(await runtime.api('admin',url,{method,body}),method+'_'+url);
  for(const task of fixture.tasks){const current=await ok(pay+'/tasks/'+task.executeNo);check('original_task_terminal_'+task.batchId,['SUCCESS','FAILED','TIMEOUT'].includes(current.executeStatus));}
  const roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  const originalRoles=roles();
  for(const batchId of fixture.batches){
    const detail=await ok(pay+'/batches/'+batchId);check('owned_period_'+batchId,String(detail.batch.payrollPeriodId)===fixture.periodId);
    check('owned_draft_'+batchId,['CALCULATED','DRAFT','FAILED'].includes(detail.batch.status));
    await ok(pay+'/batches/'+batchId+'/cancel','POST',{});
    check('cancelled_'+batchId,(await ok(pay+'/batches/'+batchId)).batch.status==='CANCELLED');
  }
  const slabs=await ok(pay+'/config/tax-slabs');const slab=slabs.find(row=>String(row.slabId)===fixture.slabId);
  check('owned_synthetic_slab',slab?.slabName===fixture.marker+'-合成10%');
  await ok(pay+'/tax-slabs/'+fixture.slabId,'PUT',{...slab,status:'INACTIVE'});
  check('owned_synthetic_slab_inactive',database('SELECT status FROM hr_tax_slab WHERE slab_id=1517')==='INACTIVE');
  evidence.restoration=true;
  const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_tax_deduction','id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id']];
  for(const [table,key]of tables){let cursor='0';const digest=createHash('sha256');const bound=fixture.bounds[table];assert.match(bound,/^\d+$/);
    for(;;){const end=database(`SELECT COALESCE(MAX(${key}),0) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${bound} ORDER BY ${key} LIMIT 1000) selected`);if(end==='0')break;digest.update(database(`SELECT * FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${end} ORDER BY ${key}`));cursor=end;}
    check('original_r5_'+table+'_preserved',digest.digest('hex')===fixture.originalDigests[table]);
  }
  check('recovery_roles_unchanged',roles()===originalRoles);
  for(const file of originalFiles)check('original_evidence_'+file.name,hash(fs.readFileSync(path.join(source,file.name)))===file.hash);
  evidence.preservation=true;
  console.log('D3_LARGE_RECOVERY_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;
}catch(error){failure=String(error.message).split('\n')[0].slice(0,180);}
finally{
  await runtime?.close();const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests||[],originalFiles,failure,all18Complete:false,globalComplete:false,officialTaxPolicyVerified:false};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log('D3_LARGE_RECOVERY: '+JSON.stringify({passed:result.passed,...evidence,checks:result.checks.length,requests:result.requests.length,failure}));if(!result.passed)process.exitCode=1;
}
