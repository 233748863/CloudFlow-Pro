import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';

const root='D:/CloudFlowPro',pay='/hr/compensation/payroll';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-batch-filters'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-batch-filters-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const priorFolder=path.join(path.dirname(output),'d3-batch-scale-20261006-r3');
assert.equal(read(path.join(priorFolder,'result.json')).passed,true);
const prior=read(path.join(priorFolder,'fixture.json'));assert.equal(prior.marker,'D3S-fbd24ea29573');
const id=value=>{const result=String(value);assert.match(result,/^[1-9][0-9]*$/);return result;};
const hash=value=>createHash('sha256').update(value).digest('hex');
const same=(left,right)=>JSON.stringify(left.map(String).sort())===JSON.stringify(right.map(String).sort());
const fixture={marker:'D3F-'+randomUUID().replaceAll('-','').slice(0,12),employees:[],levels:[],positions:[],batches:[],tasks:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={filters:false,persisted:false,failurePage:false,retry:false,cancelPermission:false,closed:false,preservation:false,restoration:false,secrets:false};
let runtime,failure,original,preserved,slabBody;
try {
  runtime=await createD1LeaveRuntime(root,output);
  const {check,database}=runtime;
  const priorFailureFolder=path.join(path.dirname(output),'d3-batch-filters-20261006-r1');
  if(path.basename(output)!=='d3-batch-filters-20261006-r1'&&fs.existsSync(path.join(priorFailureFolder,'result.json'))){
    const failed=read(path.join(priorFailureFolder,'result.json')),leftover=read(path.join(priorFailureFolder,'fixture.json'));
    assert.ok(!failed.passed&&failed.preservation&&failed.restoration&&failed.tasks===0&&leftover.employees.length===0&&leftover.levels.length===0&&leftover.batches.length===0);
    assert.equal(leftover.marker,'D3F-d82134d1f499');assert.equal(leftover.periodId,'146');
    check('prior_empty_period_owned',database("SELECT COUNT(*) FROM hr_payroll_period WHERE period_id=146 AND tenant_id=100000 AND period_name='D3F-d82134d1f499' AND deleted=0")==='1'&&database('SELECT COUNT(*) FROM hr_payroll_batch WHERE payroll_period_id=146')==='0');
    if(database('SELECT status FROM hr_payroll_period WHERE period_id=146')!=='CLOSED')await runtime.ok('admin',pay+'/periods/146/close','POST',{});
    check('prior_empty_period_closed',database('SELECT status FROM hr_payroll_period WHERE period_id=146')==='CLOSED');fixture.recoveredPriorPeriod='146';save();
  }
  const priorPageFailureFolder=path.join(path.dirname(output),'d3-batch-filters-20261006-r3');
  if(Number(path.basename(output).match(/-r([0-9]+)$/)[1])>3&&fs.existsSync(path.join(priorPageFailureFolder,'result.json'))){
    const failed=read(path.join(priorPageFailureFolder,'result.json')),leftover=read(path.join(priorPageFailureFolder,'fixture.json'));
    assert.ok(!failed.passed&&failed.preservation&&failed.restoration&&leftover.tasks.every(task=>task.terminal==='SUCCESS'));
    assert.equal(leftover.periodId,'148');assert.match(leftover.marker,/^D3F-[a-f0-9]{12}$/);
    check('prior_failed_page_period_owned',database("SELECT COUNT(*) FROM hr_payroll_period WHERE period_id=148 AND tenant_id=100000 AND period_name='"+leftover.marker+"' AND deleted=0")==='1'&&database("SELECT COUNT(*) FROM hr_payroll_batch WHERE payroll_period_id=148 AND status<>'CANCELLED'")==='0');
    if(database('SELECT status FROM hr_payroll_period WHERE period_id=148')!=='CLOSED')await runtime.ok('admin',pay+'/periods/148/close','POST',{});
    check('prior_failed_page_period_closed',database('SELECT status FROM hr_payroll_period WHERE period_id=148')==='CLOSED');fixture.recoveredPriorPagePeriod='148';save();
  }
  const tables=[['hr_employee','id'],['hr_position','id'],['hr_job_level','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],
    ['hr_comp_change','id'],['hr_tax_profile','id'],['hr_tax_deduction','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],
    ['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['sys_dept','dept_id'],['sys_holiday_calendar','calendar_id']];
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries([...tables.map(([table,key])=>{
    const digest=createHash('sha256');let cursor='0';
    for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 500) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}
    return[table,digest.digest('hex')];
  }),['roles',hash(database('SELECT * FROM sys_role_menu ORDER BY role_id,menu_id')+database('SELECT * FROM sys_user_role ORDER BY user_id,role_id'))]]);
  original=preserved();fixture.original=original;fixture.bounds=bounds;save();
  const times=new Map();
  const configured=Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.common.repeatSubmit.intervalMillis'"));
  assert.ok(Number.isSafeInteger(configured)&&configured>=0&&configured<=60000);
  const interval=Math.max(5000,configured)+150;
  const api=async(actor,url,method='GET',body)=>{
    const key=hash(JSON.stringify([actor,url,method,body??null]));
    if(method!=='GET'){const remaining=(times.get(key)||0)+interval-Date.now();if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
    try{return await runtime.api(actor,url,{method,body});}finally{if(method!=='GET')times.set(key,Date.now());}
  };
  const ok=async(url,method='GET',body)=>runtime.success(await api('admin',url,method,body),method+'_'+url);
  runtime.fixtureOk=ok;
  const departments=prior.departments.map(id);assert.equal(departments.length,2);
  check('owned_existing_calendar_enabled',database('SELECT status FROM sys_holiday_calendar WHERE calendar_id='+id(prior.calendarId)+" AND tenant_id=100000 AND calendar_code='D3S-fbd24ea29573'")==='ENABLED');
  check('owned_existing_structure',database('SELECT status FROM hr_comp_structure WHERE id='+id(prior.structureId)+" AND tenant_id=100000 AND structure_code='D3S-fbd24ea29573'")==='1');
  const periods=await ok(pay+'/config/periods');
  fixture.month=Array.from({length:60},(_,index)=>`${2043+Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`).find(month=>!periods.some(period=>period.startDate<=month+'-31'&&period.endDate>=month+'-01'));
  check('new_owned_period_available',Boolean(fixture.month));
  const [year,month]=fixture.month.split('-').map(Number);fixture.end=fixture.month+'-'+new Date(Date.UTC(year,month,0)).getUTCDate();
  fixture.periodId=id(await ok(pay+'/periods','POST',{periodName:fixture.marker,frequency:'MONTHLY',startDate:fixture.month+'-01',endDate:fixture.end,payDate:fixture.end}));save();
  for(let index=0;index<2;index++){
    fixture.levels.push(id(await ok('/hr/organization/levels','POST',{levelCode:fixture.marker+'-'+index,levelName:fixture.marker+'职级'+index,levelSeries:'T',levelRank:index+1,status:1})));save();
    fixture.positions.push(id(await ok('/hr/organization/positions','POST',{positionCode:fixture.marker+'-'+index,positionName:fixture.marker+'岗位'+index,levelId:fixture.levels[index],status:1})));save();
  }
  slabBody={slabName:fixture.marker+'合成测试',region:'隔离合成测试',effectiveFrom:fixture.month+'-01',effectiveTo:fixture.end,thresholdAmount:'0.00',status:'DRAFT',remark:'仅检查批次机制，不代表正式税率'};
  fixture.slabId=id(await ok(pay+'/tax-slabs','POST',slabBody));fixture.slabBody=slabBody;save();
  await ok(pay+'/tax-slabs/'+fixture.slabId+'/details','PUT',Array.from({length:7},(_,index)=>({levelNo:index+1,fromAmount:String(index*10000),toAmount:index===6?null:String((index+1)*10000),taxRate:'0.1000',quickDeduction:'0.00'})));
  await ok(pay+'/tax-slabs/'+fixture.slabId,'PUT',{...slabBody,status:'ACTIVE'});
  for(let index=0;index<3;index++){
    const employee={name:fixture.marker+'员工'+index,deptId:departments[index===2?1:0],positionId:fixture.positions[index===1?1:0],employeeType:index===1?'PART_TIME':'FULL_TIME'};
    employee.id=id(await ok('/hr/employees','POST',{employeeNo:fixture.marker+'-'+index,...employee,gender:'UNKNOWN',employeeStatus:'REGULAR',hireDate:fixture.month+'-01'}));fixture.employees.push(employee);save();
    employee.assignmentId=id(await ok('/hr/compensation/employee-compensations','POST',{employeeId:employee.id,structureId:prior.structureId,componentValues:{[prior.componentId]:'15000.01'},totalSalary:'15000.01',effectiveDate:fixture.month+'-01',status:'ACTIVE'}));save();
    employee.taxProfileId=id(await ok('/hr/compensation/tax-profiles','POST',{employeeId:employee.id,taxSlabId:fixture.slabId,taxResidenceCity:'隔离合成测试',status:'ACTIVE'}));save();
  }
  const selected=fixture.employees.map(row=>row.id);
  const base={payrollPeriodId:fixture.periodId,employeeIds:selected,deptIds:[],positionIds:[],jobLevelIds:[],employeeType:'',postingDate:fixture.end,validateAttendanceFlag:0,deductUnverifiedFlag:0};
  const cases=[['all',{},selected],['department',{deptIds:[departments[0]]},selected.slice(0,2)],['position',{positionIds:[fixture.positions[0]]},[selected[0],selected[2]]],
    ['level',{jobLevelIds:[fixture.levels[1]]},[selected[1]]],['type',{employeeType:'PART_TIME'},[selected[1]]],
    ['intersection',{deptIds:[departments[0]],jobLevelIds:[fixture.levels[0]],employeeType:'FULL_TIME'},[selected[0]]],
    ['incompatible',{positionIds:[fixture.positions[0]],jobLevelIds:[fixture.levels[1]]},[]],['outside',{deptIds:[departments[1]],employeeType:'PART_TIME'},[]]];
  for(const [label,filter,wanted] of cases){const rows=await ok(pay+'/batches/preview','POST',{...base,...filter});check('filter_'+label,same(rows.map(row=>row.employeeId),wanted)&&rows.every(row=>row.calcStatus==='PENDING'));}
  evidence.filters=true;
  const create=async(label,selection)=>{const batch={label,id:id(await ok(pay+'/batches','POST',selection))};fixture.batches.push(batch);save();batch.no=(await ok(pay+'/batches/'+batch.id)).batch.batchNo;save();return batch;};
  const filterBatch=await create('filters',{...base,deptIds:[departments[0]],jobLevelIds:[fixture.levels[1]],employeeType:'PART_TIME'});
  const replacement={...base,deptIds:[departments[1]],positionIds:[fixture.positions[0]],jobLevelIds:[fixture.levels[0]],employeeType:'FULL_TIME'};
  await ok(pay+'/batches/'+filterBatch.id+'/employees','PUT',replacement);
  const saved=await ok(pay+'/batches/'+filterBatch.id);
  check('all_selection_fields_and_actual_rows_persist',same(saved.batch.filterDeptIds,replacement.deptIds)&&same(saved.batch.filterPositionIds,replacement.positionIds)&&same(saved.batch.filterJobLevelIds,replacement.jobLevelIds)&&same(saved.batch.filterEmployeeIds,selected)&&saved.batch.filterEmployeeType==='FULL_TIME'&&same(saved.employees.map(row=>row.employeeId),[selected[2]]));evidence.persisted=true;
  const cancelDenied=await api('employee',pay+'/batches/'+filterBatch.id+'/cancel','POST',{});
  check('ordinary_employee_cancel_denied',cancelDenied.status===403&&(await ok(pay+'/batches/'+filterBatch.id)).batch.status==='DRAFT');evidence.cancelPermission=true;
  const close=await api('admin',pay+'/periods/'+fixture.periodId+'/close','POST',{});
  check('created_batch_blocks_close',close.status===400&&close.body?.code==='PAYROLL_BATCH_PENDING');
  await ok(pay+'/batches/'+filterBatch.id+'/cancel','POST',{});
  const first=await create('first',{...base,employeeIds:[selected[0]]});
  const observe=async(batch,retry=false)=>{
    const task={batchId:batch.id,executeNo:await ok(pay+'/batches/'+batch.id+(retry?'/retry':'/calculate'),'POST',{})};fixture.tasks.push(task);save();
    for(let attempt=0;;attempt++){
      const result=await ok(pay+'/tasks/'+encodeURIComponent(task.executeNo));
      if(['SUCCESS','FAILED','TIMEOUT'].includes(result.executeStatus)){task.terminal=result.executeStatus;task.affectedRows=Number(result.affectedRows);save();check('original_background_task_success_'+fixture.tasks.length,task.terminal==='SUCCESS');return await ok(pay+'/batches/'+batch.id);}
      if(attempt>0&&attempt%30===0)console.log('D3_FILTERS_PHASE: observing_original_task=true');
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
  };
  const firstResult=await observe(first);check('first_batch_generates_one_salary',firstResult.employees.length===1&&firstResult.employees[0].calcStatus==='SUCCESS');
  const mixed=await create('mixed',{...base,employeeIds:selected.slice(0,2)});
  const mixedResult=await observe(mixed);
  check('mixed_batch_success_and_failure',mixedResult.batch.status==='CALCULATED'&&mixedResult.employees.find(row=>String(row.employeeId)===selected[0]).errorMessage==='PAYROLL_ALREADY_CALCULATED'&&mixedResult.employees.find(row=>String(row.employeeId)===selected[1]).calcStatus==='SUCCESS');
  const successfulSlip=id(mixedResult.employees.find(row=>row.calcStatus==='SUCCESS').salarySlipId);
  const beforeSuccessful=database('SELECT * FROM hr_salary_slip WHERE id='+successfulSlip);
  const page=await runtime.sessions.admin.context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>runtime.browserErrors.push('batch-filter-page'));
  await page.goto(new URL('/hr/payroll',runtime.sessions.admin.page.url()).href,{waitUntil:'networkidle'});
  await page.locator('table tbody tr').filter({hasText:mixed.no}).getByRole('button',{name:'员工清单与进度',exact:true}).click();
  const message='该周期已有工资单，请核对原批次；原草稿可取消后重算，已发放工资请通过补正处理。';
  const dialog=page.getByRole('dialog',{name:new RegExp(mixed.no)});await dialog.getByText(message,{exact:true}).waitFor();
  check('desktop_error_uses_business_language',!(await dialog.innerText()).includes('PAYROLL_ALREADY_CALCULATED'));
  await page.screenshot({path:path.join(output,'mixed-failure-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  const mobileReason=dialog.getByText('原因：'+message,{exact:true});await mobileReason.waitFor({state:'visible'});
  const reasonBounds=await mobileReason.boundingBox();
  fixture.mobileReasonBounds=reasonBounds;save();
  await page.screenshot({path:path.join(output,'mixed-failure-mobile.png')});
  check('mobile_failure_reason_fits_viewport',reasonBounds&&reasonBounds.x>=0&&reasonBounds.x+reasonBounds.width<=390);
  await dialog.locator('dd').filter({hasText:/^13500\.01$/}).waitFor({state:'visible'});
  fixture.failurePageText=(await dialog.innerText()).slice(0,3000);save();evidence.failurePage=true;
  const submit=await api('admin',pay+'/batches/'+mixed.id+'/submit','POST',{});check('mixed_failure_blocks_submit',submit.status===400&&submit.body?.code==='PAYROLL_ERRORS_REMAIN');
  await ok(pay+'/batches/'+first.id+'/cancel','POST',{});
  const retried=await observe(mixed,true);
  check('only_failed_employee_retried',fixture.tasks.at(-1).affectedRows===1&&retried.employees.every(row=>row.calcStatus==='SUCCESS'));
  check('previous_successful_salary_all_fields_unchanged',database('SELECT * FROM hr_salary_slip WHERE id='+successfulSlip)===beforeSuccessful);
  await dialog.getByRole('button',{name:'刷新进度',exact:true}).click();await mobileReason.waitFor({state:'hidden'});
  check('real_page_refresh_clears_resolved_error',!(await dialog.innerText()).includes(message));
  await page.screenshot({path:path.join(output,'mixed-retry-mobile.png')});await page.close();evidence.retry=true;
  await ok(pay+'/batches/'+mixed.id+'/cancel','POST',{});
  await ok(pay+'/periods/'+fixture.periodId+'/close','POST',{});
  check('owned_period_closed_after_all_batches_cancelled',(await ok(pay+'/config/periods')).find(row=>String(row.periodId)===fixture.periodId).status==='CLOSED');
  const deniedCreate=await api('admin',pay+'/batches','POST',base);check('closed_period_rejects_new_batch',deniedCreate.status===400&&deniedCreate.body?.code==='PAYROLL_PERIOD_CLOSED');evidence.closed=true;
}catch(error){failure=error;}
finally{
  if(runtime){
    const ok=runtime.fixtureOk;
    for(const batch of fixture.batches){try{
      let row=await ok(pay+'/batches/'+batch.id);
      while(row.batch.status==='CALCULATING'){await new Promise(resolve=>setTimeout(resolve,1000));row=await ok(pay+'/batches/'+batch.id);}
      if(['DRAFT','CALCULATED','FAILED'].includes(row.batch.status))await ok(pay+'/batches/'+batch.id+'/cancel','POST',{});
      runtime.check('owned_batch_cancelled_'+batch.id,(await ok(pay+'/batches/'+batch.id)).batch.status==='CANCELLED');fixture.restorations[batch.id]=true;
    }catch(error){fixture.restorations[batch.id]=false;failure||=error;}save();}
    try{
      if(fixture.slabId){await ok(pay+'/tax-slabs/'+fixture.slabId,'PUT',{...slabBody,status:'INACTIVE'});runtime.check('owned_tax_disabled',runtime.database('SELECT status FROM hr_tax_slab WHERE slab_id='+fixture.slabId)==='INACTIVE');}
      if(fixture.periodId&&Object.values(fixture.restorations).every(Boolean)){
        if(runtime.database('SELECT status FROM hr_payroll_period WHERE period_id='+fixture.periodId)!=='CLOSED')await ok(pay+'/periods/'+fixture.periodId+'/close','POST',{});
        runtime.check('owned_test_period_closed',runtime.database('SELECT status FROM hr_payroll_period WHERE period_id='+fixture.periodId)==='CLOSED');
      }
      evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    }catch(error){failure||=error;}
    try{runtime.check('all_original_business_rows_and_grants_preserved',original&&JSON.stringify(original)===JSON.stringify(preserved()));runtime.check('no_browser_javascript_errors',runtime.browserErrors.length===0);evidence.preservation=true;}catch(error){failure||=error;}
    try{console.log('D3_FILTERS_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,tasks:fixture.tasks.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:failure?String(failure.message).split('\n')[0].slice(0,180):undefined};
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log('D3_FILTERS_RESULT: '+JSON.stringify({...result,checks:result.checks.length}));if(!result.passed)process.exitCode=1;
}
