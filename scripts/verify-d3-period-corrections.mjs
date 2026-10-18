import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';
import {authenticateFormTest} from './runtime-checks/form-browser-auth.mjs';

const root='D:/CloudFlowPro',pay='/hr/compensation/payroll',wf='/workflow/wf';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-payroll-corrections'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-period-corrections-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const previous=path.join(path.dirname(output),'d3-batch-scale-20261006-r3');
assert.equal(read(path.join(previous,'result.json')).passed,true);
const prior=read(path.join(previous,'fixture.json'));
assert.equal(prior.marker,'D3S-fbd24ea29573');
const id=value=>{const text=String(value);assert.match(text,/^[1-9][0-9]*$/);return text;};
const literal=value=>"CONVERT(X'"+Buffer.from(String(value)).toString('hex')+"' USING utf8mb4)";
const hash=value=>createHash('sha256').update(value).digest('hex');
const fixture={marker:'D3PC-'+randomUUID().replaceAll('-','').slice(0,12),periods:[],corrections:[],tasks:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));
save();
const evidence={pending:false,rejected:false,approvedUnpaid:false,paid:false,closed:false,preservation:false,restoration:false,secrets:false};
let runtime,failure,originalConfig,configChanged=false,slabBody,original,protectedRows,originalSalary;
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {database,rows,check,sessions}=runtime;
  const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_comp_change','id'],
    ['hr_tax_profile','id'],['hr_tax_deduction','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],
    ['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],
    ['hr_salary_slip','id'],['hr_payroll_correction','correction_id'],['hr_advance_repayment','repayment_id'],['hr_employee_advance','advance_id'],
    ['hr_attendance_record','id'],['hr_attendance_monthly','id']];
  fixture.bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  protectedRows=()=>Object.fromEntries([...tables.map(([table,key])=>{
    const digest=createHash('sha256');let cursor='0';
    for(;;){
      const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+fixture.bounds[table]+' ORDER BY '+key+' LIMIT 500) selected');
      if(end==='0')break;
      digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;
    }
    return[table,digest.digest('hex')];
  }),['roles',hash(database('SELECT * FROM sys_role_menu ORDER BY role_id,menu_id')+database('SELECT * FROM sys_user_role ORDER BY user_id,role_id'))]]);
  original=protectedRows();fixture.original=original;save();
  const configured=Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.common.repeatSubmit.intervalMillis'"));
  assert.ok(Number.isSafeInteger(configured)&&configured>=0&&configured<=60000);
  const interval=Math.max(5000,configured)+150,times=new Map();
  const api=runtime.boundaryApi=async(actor,url,method='GET',body)=>{
    const key=hash(JSON.stringify([actor,url,method,body??null]));
    if(method!=='GET'){const remaining=(times.get(key)||0)+interval-Date.now();if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
    try{return await runtime.api(actor,url,{method,body});}finally{if(method!=='GET')times.set(key,Date.now());}
  };
  const ok=runtime.boundaryOk=async(actor,url,method='GET',body)=>runtime.success(await api(actor,url,method,body),actor+'_'+method+'_'+url);
  const until=runtime.boundaryUntil=async(probe,accept,label)=>{
    for(let attempt=0;;attempt++){
      const value=await probe();if(accept(value))return value;
      if(attempt>0&&attempt%30===0)console.log('D3_PERIOD_CORRECTIONS_PHASE: observing_original='+label);
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
  };
  const financeId='990001030',financeName='h2adv_finance_870861120861';
  check('owned_finance_identity',database("SELECT COUNT(*) FROM sys_user u JOIN sys_user e ON e.user_name='g_holiday_employee' AND e.tenant_id=u.tenant_id JOIN sys_user_role ur ON ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE u.user_id="+financeId+" AND u.user_name="+literal(financeName)+" AND u.create_by='advance-payroll-fixture' AND u.status='0' AND u.deleted=0 AND u.pwd_reset_required='0' AND u.password=e.password AND r.role_key='finance'")==='1');
  const account=read(path.join(runtime.run,'private/accounts.json')).find(value=>value.username==='g_holiday_employee');
  const origin=new URL(sessions.admin.page.url()).origin;
  const context=await sessions.admin.context.browser().newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',()=>runtime.browserErrors.push('period-finance'));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  const identity=await authenticateFormTest(page,{...account,username:financeName},origin);
  check('real_finance_login',identity.authenticated&&identity.userId===financeId&&identity.tenantId==='100000');
  const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());
  runtime.sensitive.add(token);runtime.sensitive.add(token.replace(/^Bearer /,''));
  sessions.finance={page,context,identity};
  const configId=id(database("SELECT config_id FROM sys_config WHERE tenant_id=100000 AND config_key='sys.hr.payroll.correctionProcessKey' AND config_scope='1'"));
  const config=await ok('admin','/auth/system/config/'+configId);
  originalConfig=Object.fromEntries(['configId','tenantId','configScope','configKey','configName','configType','configValue','remark'].map(key=>[key,config[key]??null]));
  fixture.originalConfig=originalConfig;save();
  const definitions=rows("SELECT JSON_OBJECT('id',definition_id,'digest',SHA2(model_json,256)) FROM wf_process_definition WHERE tenant_id=100000 AND process_key="+literal(config.configValue)+" AND status='PUBLISHED' AND deleted=0 ORDER BY version DESC");
  check('original_definition_found',definitions.length>0);fixture.originalDefinition=definitions[0];
  const definition=await ok('admin',wf+'/definition/'+definitions[0].id);
  const model=typeof definition.modelJson==='string'?JSON.parse(definition.modelJson):structuredClone(definition.modelJson);
  const approvals=model.nodes.filter(node=>node.type==='APPROVAL');
  check('original_single_finance_approval',approvals.length===1&&approvals[0].approverType==='ROLE'&&approvals[0].approverValue==='finance');
  approvals[0].approverType='USER';approvals[0].approverValue=financeId;
  const saved=await ok('admin',wf+'/definition/save','POST',{processKey:fixture.marker,processName:fixture.marker,modelJson:JSON.stringify(model),formId:null,startPermissionType:'ALL',startPermissionValue:'[]'});
  fixture.definitionId=saved.definitionId||saved.id;save();
  await ok('admin',wf+'/definition/deploy/'+fixture.definitionId,'POST');
  configChanged=true;await ok('admin','/auth/system/config','PUT',{...originalConfig,configValue:fixture.marker});
  check('owned_structure_enabled',database('SELECT status FROM hr_comp_structure WHERE id='+id(prior.structureId)+" AND tenant_id=100000 AND structure_code='D3S-fbd24ea29573'")==='1');
  const periods=await ok('admin',pay+'/config/periods');
  const months=Array.from({length:60},(_,index)=>String(2043+Math.floor(index/12))+'-'+String(index%12+1).padStart(2,'0'));
  const available=month=>!periods.some(period=>period.startDate<=month+'-31'&&period.endDate>=month+'-01');
  const first=months.findIndex((month,index)=>index<months.length-1&&available(month)&&available(months[index+1]));
  check('two_owned_months_available',first>=0);
  for(const month of months.slice(first,first+2)){
    const [year,number]=month.split('-').map(Number),end=month+'-'+new Date(Date.UTC(year,number,0)).getUTCDate();
    const period={month,end,id:id(await ok('admin',pay+'/periods','POST',{periodName:fixture.marker+'-'+month,frequency:'MONTHLY',startDate:month+'-01',endDate:end,payDate:end}))};
    fixture.periods.push(period);save();
  }
  const [firstPeriod,nextPeriod]=fixture.periods;
  slabBody={slabName:fixture.marker+'合成测试',region:'隔离合成测试',effectiveFrom:firstPeriod.month+'-01',effectiveTo:nextPeriod.end,thresholdAmount:'0.00',status:'DRAFT',remark:'仅验证补正审批与周期关闭，不代表正式税率'};
  fixture.slabId=id(await ok('admin',pay+'/tax-slabs','POST',slabBody));fixture.slabBody=slabBody;save();
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId+'/details','PUT',Array.from({length:7},(_,index)=>({levelNo:index+1,fromAmount:String(index*10000),toAmount:index===6?null:String((index+1)*10000),taxRate:'0.1000',quickDeduction:'0.00'})));
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...slabBody,status:'ACTIVE'});
  fixture.employeeId=id(await ok('admin','/hr/employees','POST',{employeeNo:fixture.marker,name:fixture.marker+'员工',deptId:id(prior.departments[0]),gender:'UNKNOWN',employeeStatus:'REGULAR',employeeType:'FULL_TIME',hireDate:firstPeriod.month+'-01'}));save();
  fixture.assignmentId=id(await ok('admin','/hr/compensation/employee-compensations','POST',{employeeId:fixture.employeeId,structureId:prior.structureId,componentValues:{[prior.componentId]:'15000.01'},totalSalary:'15000.01',effectiveDate:firstPeriod.month+'-01',status:'ACTIVE'}));save();
  fixture.taxProfileId=id(await ok('admin','/hr/compensation/tax-profiles','POST',{employeeId:fixture.employeeId,taxSlabId:fixture.slabId,taxResidenceCity:'隔离合成测试',status:'ACTIVE'}));save();
  fixture.batchId=id(await ok('admin',pay+'/batches','POST',{payrollPeriodId:firstPeriod.id,employeeIds:[fixture.employeeId],deptIds:[],positionIds:[],jobLevelIds:[],employeeType:'',postingDate:firstPeriod.end,validateAttendanceFlag:0,deductUnverifiedFlag:0}));save();
  const task={executeNo:await ok('admin',pay+'/batches/'+fixture.batchId+'/calculate','POST',{})};fixture.tasks.push(task);save();
  const result=await until(()=>ok('admin',pay+'/tasks/'+encodeURIComponent(task.executeNo)),value=>['SUCCESS','FAILED','TIMEOUT'].includes(value.executeStatus),'initial_salary');
  task.terminal=result.executeStatus;task.affectedRows=Number(result.affectedRows);save();
  check('original_actual_task_success',task.terminal==='SUCCESS'&&task.affectedRows===1);
  const batch=await ok('admin',pay+'/batches/'+fixture.batchId);
  check('single_employee_calculated',batch.batch.status==='CALCULATED'&&batch.employees.length===1&&batch.employees[0].calcStatus==='SUCCESS');
  fixture.originalSlipId=id(batch.employees[0].salarySlipId);save();
  await ok('admin',pay+'/batches/'+fixture.batchId+'/submit','POST',{});
  await ok('admin',pay+'/batches/'+fixture.batchId+'/pay','POST',{});
  check('owned_original_paid',(await ok('admin',pay+'/slips/'+fixture.originalSlipId)).status==='PAID');
  originalSalary=hash(database('SELECT * FROM hr_salary_slip WHERE id='+fixture.originalSlipId));fixture.originalSalary=originalSalary;save();
  const correctionRow=runtime.boundaryRow=identifier=>rows("SELECT JSON_OBJECT('id',CAST(correction_id AS CHAR),'slipId',CAST(correction_slip_id AS CHAR),'status',status,'instanceId',instance_id) FROM hr_payroll_correction WHERE correction_id="+id(identifier)+" AND tenant_id=100000")[0];
  const tasks=runtime.boundaryTasks=instance=>rows("SELECT JSON_OBJECT('id',task_id,'actor',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id="+literal(instance)+" AND status='TODO'");
  const denyClose=async(correction,label)=>{
    const before=hash(database('SELECT * FROM hr_payroll_period WHERE period_id='+correction.periodId)+database('SELECT * FROM hr_salary_slip WHERE id IN ('+fixture.originalSlipId+','+correction.slipId+') ORDER BY id')+database('SELECT * FROM hr_payroll_correction WHERE correction_id='+correction.id));
    const reply=await api('admin',pay+'/periods/'+correction.periodId+'/close','POST',{});
    check(label+'_close_rejected',reply.status===400&&reply.body?.code==='PAYROLL_SLIP_PENDING');
    check(label+'_business_rows_preserved',before===hash(database('SELECT * FROM hr_payroll_period WHERE period_id='+correction.periodId)+database('SELECT * FROM hr_salary_slip WHERE id IN ('+fixture.originalSlipId+','+correction.slipId+') ORDER BY id')+database('SELECT * FROM hr_payroll_correction WHERE correction_id='+correction.id)));
    check(label+'_no_successful_close_audit',database("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='PAYROLL_PERIOD' AND business_id="+correction.periodId+" AND operation_type='CLOSE'")==='0');
  };
  const make=async(period,name)=>{
    const correction={periodId:period.id,name,id:id(await ok('admin',pay+'/corrections','POST',{originalSlipId:fixture.originalSlipId,payrollPeriodId:period.id,grossAdjustment:'10.01',deductionAdjustment:'0.00',reason:fixture.marker+'-'+name}))};
    fixture.corrections.push(correction);save();
    const row=await until(()=>correctionRow(correction.id),value=>Boolean(value?.instanceId),name+'_binding');Object.assign(correction,{slipId:row.slipId,instanceId:row.instanceId});save();
    const pending=await until(()=>tasks(row.instanceId),value=>value.length===1,name+'_finance_task');
    check(name+'_independent_finance',pending[0].actor===financeId&&pending[0].actor!==sessions.admin.identity.userId);
    check(name+'_pending_wage',(await ok('admin',pay+'/slips/'+correction.slipId)).status==='PENDING');
    await denyClose(correction,name+'_pending');return correction;
  };
  const decide=runtime.boundaryDecide=async(correction,action)=>{
    const pending=await until(()=>tasks(correction.instanceId),value=>value.length===1,'decision_task');
    check('decision_owned_finance_task',pending[0].actor===financeId);
    await ok('finance',wf+'/complete','POST',{taskId:pending[0].id,action,comment:fixture.marker,variables:{}});
    const row=await until(()=>correctionRow(correction.id),value=>value.status===(action==='APPROVE'?'APPLIED':'REJECTED'),'actual_callback');
    correction.decision=row.status;save();return row;
  };
  const rejected=await make(firstPeriod,'reject');evidence.pending=true;
  await decide(rejected,'REJECT');
  check('rejected_wage_cancelled',(await ok('admin',pay+'/slips/'+rejected.slipId)).status==='CANCELLED');
  await ok('admin',pay+'/periods/'+firstPeriod.id+'/close','POST',{});
  check('rejection_releases_period',database('SELECT status FROM hr_payroll_period WHERE period_id='+firstPeriod.id)==='CLOSED');evidence.rejected=true;
  const approved=await make(nextPeriod,'approve');
  await decide(approved,'APPROVE');
  const unpaid=await ok('admin',pay+'/slips/'+approved.slipId);
  check('approved_wage_submitted',unpaid.status==='SUBMITTED');
  await denyClose(approved,'approved_unpaid');evidence.approvedUnpaid=true;
  await ok('admin',pay+'/corrections/'+approved.id+'/pay','POST',{});
  approved.paid=true;save();
  const paid=await ok('admin',pay+'/slips/'+approved.slipId);
  check('correction_paid_same_amounts',paid.status==='PAID'&&['grossTotal','deductionTotal','netTotal','taxAmount','currentTax'].every(key=>String(paid[key])===String(unpaid[key])));evidence.paid=true;
  await ok('admin',pay+'/periods/'+nextPeriod.id+'/close','POST',{});
  const denied=await api('admin',pay+'/corrections','POST',{originalSlipId:fixture.originalSlipId,payrollPeriodId:nextPeriod.id,grossAdjustment:'10.02',deductionAdjustment:'0.00',reason:fixture.marker+'-closed'});
  check('closed_period_rejects_new_correction',denied.status===400&&denied.body?.code==='PAYROLL_PERIOD_CLOSED');
  for(const period of fixture.periods){
    const before=database('SELECT * FROM hr_payroll_period WHERE period_id='+period.id);
    await ok('admin',pay+'/periods/'+period.id+'/close','POST',{});
    check('repeat_close_preserved_'+period.id,before===database('SELECT * FROM hr_payroll_period WHERE period_id='+period.id));
    check('one_close_audit_'+period.id,database("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='PAYROLL_PERIOD' AND business_id="+period.id+" AND operation_type='CLOSE'")==='1');
  }
  check('original_paid_salary_entire_row_preserved',originalSalary===hash(database('SELECT * FROM hr_salary_slip WHERE id='+fixture.originalSlipId)));
  evidence.closed=true;
}catch(error){failure=error;}
finally{
  if(runtime){
    const {database,check}=runtime,ok=runtime.boundaryOk;
    const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;failure||=error;}save();};
    await restore('corrections',async()=>{
      for(const correction of fixture.corrections){
        let row=runtime.boundaryRow(correction.id);
        if(['PENDING','APPROVING'].includes(row.status)){
          row=await runtime.boundaryUntil(()=>runtime.boundaryRow(correction.id),value=>Boolean(value?.instanceId),'recovery_binding');
          correction.instanceId=row.instanceId;correction.slipId=row.slipId;save();
          await runtime.boundaryDecide(correction,'REJECT');row=runtime.boundaryRow(correction.id);
        }
        if(row.status==='APPLIED'){
          const salary=await ok('admin',pay+'/slips/'+row.slipId);
          if(salary.status==='SUBMITTED')await ok('admin',pay+'/corrections/'+correction.id+'/pay','POST',{});
          check('owned_applied_correction_paid_'+correction.id,(await ok('admin',pay+'/slips/'+row.slipId)).status==='PAID');
        }else check('owned_correction_rejected_'+correction.id,row.status==='REJECTED');
      }
    });
    await restore('batch',async()=>{
      if(!fixture.batchId)return;
      let current=await runtime.boundaryUntil(()=>ok('admin',pay+'/batches/'+fixture.batchId),value=>value.batch.status!=='CALCULATING','recovery_batch');
      if(['DRAFT','CALCULATED','FAILED'].includes(current.batch.status))await ok('admin',pay+'/batches/'+fixture.batchId+'/cancel','POST',{});
      if(current.batch.status==='SUBMITTED')await ok('admin',pay+'/batches/'+fixture.batchId+'/pay','POST',{});
      current=await ok('admin',pay+'/batches/'+fixture.batchId);
      check('owned_batch_terminal',['PAID','CANCELLED'].includes(current.batch.status));
    });
    await restore('periods',async()=>{
      for(const period of fixture.periods){
        if(database('SELECT status FROM hr_payroll_period WHERE period_id='+period.id)!=='CLOSED')await ok('admin',pay+'/periods/'+period.id+'/close','POST',{});
        check('owned_period_closed_'+period.id,database('SELECT status FROM hr_payroll_period WHERE period_id='+period.id)==='CLOSED');
      }
    });
    await restore('tax',async()=>{if(fixture.slabId){await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...slabBody,status:'INACTIVE'});check('owned_tax_inactive',database('SELECT status FROM hr_tax_slab WHERE slab_id='+fixture.slabId)==='INACTIVE');}});
    await restore('workflow',async()=>{
      if(configChanged){await ok('admin','/auth/system/config','PUT',originalConfig);check('original_workflow_config_restored',database('SELECT config_value FROM sys_config WHERE config_id='+id(originalConfig.configId))===originalConfig.configValue);}
      if(fixture.originalDefinition)check('original_definition_preserved',database('SELECT SHA2(model_json,256) FROM wf_process_definition WHERE definition_id='+literal(fixture.originalDefinition.id))===fixture.originalDefinition.digest);
    });
    await restore('preservation',async()=>{
      if(!original)return;
      const current=protectedRows();for(const key of Object.keys(original))check('original_'+key+'_preserved',current[key]===original[key]);
      if(originalSalary)check('owned_original_salary_preserved',originalSalary===hash(database('SELECT * FROM hr_salary_slip WHERE id='+fixture.originalSlipId)));
      evidence.preservation=true;
    });
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{check('browser_no_unhandled_errors',runtime.browserErrors.length===0);console.log('D3_PERIOD_CORRECTIONS_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  const message=failure?String(failure.message).split('\n')[0].slice(0,180):undefined;
  const passed=!failure&&Object.values(evidence).every(Boolean);
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed,...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,corrections:fixture.corrections.length,tasks:fixture.tasks.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:message},null,2));
  console.log('D3_PERIOD_CORRECTIONS_RESULT: '+JSON.stringify({passed,...evidence,checks:runtime?.checks.length||0,requests:runtime?.requests.length||0,corrections:fixture.corrections.length,failure:message}));
  if(!passed)process.exitCode=1;
}

