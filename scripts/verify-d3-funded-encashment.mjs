import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';
import {authenticateFormTest} from './runtime-checks/form-browser-auth.mjs';

const root='D:/CloudFlowPro',pay='/hr/compensation/payroll',advance='/hr/advance',leave='/hr/attendance/leave',wf='/workflow/wf',rules='/auth/system/rules';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-funded-encashment'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-funded-encashment-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;};
const literal=value=>"CONVERT(X'"+Buffer.from(String(value)).toString('hex')+"' USING utf8mb4)";
const hash=value=>createHash('sha256').update(value).digest('hex');
const cents=value=>{const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));assert.ok(match,'Exact money required');return (match[1]?-1n:1n)*(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')));};
const fixture={marker:'D3F-'+randomUUID().replaceAll('-','').slice(0,12),rules:[],batches:[],tasks:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={funding:false,encashment:false,mixedPayroll:false,cancellation:false,payment:false,duplicates:false,browser:false,preservation:false,restoration:false,secrets:false};
const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_comp_change','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id'],['hr_employee_advance','advance_id'],['hr_advance_repayment','repayment_id'],['biz_payment_request','id'],['hr_leave_type','id'],['hr_leave_quota','id'],['hr_leave_ledger','ledger_id'],['sys_dept','dept_id'],['sys_config','config_id']];
let runtime,failure,ok,api,observe,preserved,roles,originalDigests,originalRoles,taxBody,employeeBody,loanRow,until,departmentChanged=false;
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {database,rows,check,sessions}=runtime;
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  // Department 100 is within the existing finance role's scope. Preserve its business fields;
  // only the real configuration updates' version and modification metadata may advance.
  const deptColumns=database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='sys_dept' ORDER BY ordinal_position").split(/\r?\n/);
  assert.ok(deptColumns.every(value=>/^[a-z][a-z0-9_]*$/.test(value)));
  const deptProjection=deptColumns.map(column=>['version','update_by','update_time'].includes(column)?'IF(dept_id=100,NULL,`'+column+'`) AS `'+column+'`':'`'+column+'`').join(',');
  const periodColumns=database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='hr_payroll_period' ORDER BY ordinal_position").split(/\r?\n/);
  assert.ok(periodColumns.every(value=>/^[a-z][a-z0-9_]*$/.test(value)));
  const periodProjection=periodColumns.map(column=>column==='version'?'IF(period_id=104,NULL,version) AS version':'`'+column+'`').join(',');
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{const digest=createHash('sha256');let cursor='0';for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;digest.update(database('SELECT '+(table==='sys_dept'?deptProjection:table==='hr_payroll_period'?periodProjection:'*')+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}return[table,digest.digest('hex')];}));
  roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  originalDigests=preserved();originalRoles=roles();fixture.originalBounds=bounds;fixture.originalDigests=originalDigests;save();
  const clock=new Map(),interval=Math.max(5000,Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis'")))+150;
  assert.ok(Number.isSafeInteger(interval)&&interval<=60150);fixture.repeatIntervalMillis=interval;
  api=async(actor,url,method='GET',body,headers)=>{
    const key=actor+' '+method+' '+url.split('?')[0];if(method!=='GET'){const remaining=interval-(Date.now()-(clock.get(key)||0));if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
    try{
      if(!/^\/(?:hr\/(?:advance|ess\/salary-slips)|oa\/payment\/request)(?:\/|\?|$)/.test(url))return await runtime.api(actor,url,{method,body});
      const response=await sessions[actor].page.evaluate(async supplied=>{
        const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),requestHeaders={...supplied.headers,Authorization:token.startsWith('Bearer ')?token:'Bearer '+token};
        const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));if(csrf)requestHeaders['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
        if(supplied.body!==undefined)requestHeaders['Content-Type']='application/json';
        const result=await fetch('/api'+supplied.url,{method:supplied.method,credentials:'same-origin',headers:requestHeaders,...(supplied.body===undefined?{}:{body:JSON.stringify(supplied.body)})});
        return{status:result.status,traceId:result.headers.get('X-Trace-Id'),body:(result.headers.get('Content-Type')||'').includes('json')?await result.json():null};
      },{url,method,body,headers});
      runtime.requests.push({actor,path:url,method,status:response.status,code:response.body?.code,traceId:response.traceId});return response;
    }finally{if(method!=='GET')clock.set(key,Date.now());}
  };
  ok=async(actor,url,method='GET',body,headers)=>runtime.success(await api(actor,url,method,body,headers),method+'_'+url.split('?')[0]);
  until=async(probe,accept,label)=>{const deadline=Date.now()+120000;do{const value=await probe();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,500));}while(Date.now()<deadline);throw Error(label);};
  observe=async task=>{if(task.terminal)return;for(let attempt=0;;attempt++){const result=await ok('admin',pay+'/tasks/'+encodeURIComponent(task.executeNo));if(['SUCCESS','FAILED','TIMEOUT'].includes(result.executeStatus)){task.terminal=result.executeStatus;save();return;}if(attempt>0&&attempt%30===0)console.log('D3_FUNDED_PHASE: observing original payroll task');await new Promise(resolve=>setTimeout(resolve,1000));}};
  const financeId='990001030',financeName='h2adv_finance_870861120861';
  check('existing_owned_finance_identity',database(`SELECT COUNT(*) FROM sys_user u JOIN sys_user e ON e.user_name='g_holiday_employee' AND e.tenant_id=u.tenant_id JOIN sys_user_role ur ON ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE u.user_id=${financeId} AND u.user_name=${literal(financeName)} AND u.create_by='advance-payroll-fixture' AND u.status='0' AND u.deleted=0 AND u.pwd_reset_required='0' AND u.password=e.password AND r.role_key='finance'`)==='1');
  const account=read(path.join(runtime.run,'private/accounts.json')).find(value=>value.username==='g_holiday_employee');
  const origin=new URL(sessions.admin.page.url()).origin,context=await sessions.admin.context.browser().newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',()=>runtime.browserErrors.push('finance'));await page.goto(origin,{waitUntil:'domcontentloaded'});
  const identity=await authenticateFormTest(page,{...account,username:financeName},origin);
  check('real_finance_login',identity.authenticated&&identity.userId===financeId&&identity.tenantId==='100000');
  const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());runtime.sensitive.add(token);runtime.sensitive.add(token.replace(/^Bearer /,''));sessions.finance={page,context,identity};
  fixture.today=database('SELECT CURRENT_DATE()');fixture.month=fixture.today.slice(0,7);
  check('known_current_october',fixture.month==='2026-10');
  const period=(await ok('admin',pay+'/config/periods')).find(value=>String(value.periodId)==='104');
  check('original_open_october_period',period?.status==='OPEN'&&period.startDate==='2026-10-05'&&period.endDate==='2026-10-31');fixture.periodId='104';fixture.originalPeriodVersion=period.version;
  const leavePeriods=(await ok('admin',leave+'/periods')).filter(value=>value.status==='OPEN'&&value.startDate<=fixture.today&&value.endDate>=fixture.today);
  check('one_current_open_leave_period',leavePeriods.length===1);fixture.leavePeriodId=id(leavePeriods[0].periodId);
  check('template_calendar_owned',database("SELECT COUNT(*) FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_id=990000746 AND calendar_code='D3D-b38126e08b99' AND deleted=0")==='1');
  const originalDepartment=await ok('admin','/auth/system/dept/100');
  fixture.originalDepartment=Object.fromEntries(['deptId','tenantId','parentId','ancestors','deptName','orderNum','leader','phone','email','holidayCalendarId','status','version'].map(key=>[key,originalDepartment[key]??null]));
  check('original_department_100',String(originalDepartment.deptId)==='100'&&originalDepartment.leader==='admin');
  fixture.deptId='100';departmentChanged=true;save();
  // Contact fields returned by the management API are masked; never send them back.
  await ok('admin','/auth/system/dept','PUT',{deptId:'100',parentId:0,version:fixture.originalDepartment.version,leader:sessions.admin.identity.userId,holidayCalendarId:'990000746'});
  check('employee_account_unbound',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND user_id='+id(sessions.employee.identity.userId))==='0');
  employeeBody={employeeNo:fixture.marker,name:fixture.marker+'组合员工',gender:'UNKNOWN',deptId:fixture.deptId,employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2026-10-01'};
  fixture.employeeId=id(await ok('admin','/hr/employees','POST',{...employeeBody,userId:sessions.employee.identity.userId}));save();
  fixture.structureId=id(await ok('admin','/hr/compensation/structures','POST',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{}}));save();
  await ok('admin',pay+'/structures/'+fixture.structureId,'PUT',{salaryBasis:'MONTHLY',prorationBasis:'CALENDAR_DAYS',benefitTiming:'FIRST_PAYROLL'});
  fixture.fixedComponentId=id(await ok('admin','/hr/compensation/components','POST',{componentCode:fixture.marker+'-fixed',componentName:fixture.marker+'固定工资',componentType:'FIXED',category:'EARNING',taxable:1,status:1,sortOrder:998}));save();
  fixture.compensationId=id(await ok('admin','/hr/compensation/employee-compensations','POST',{employeeId:fixture.employeeId,structureId:fixture.structureId,componentValues:{[fixture.fixedComponentId]:'31000.00'},totalSalary:'31000.00',effectiveDate:'2026-10-01',status:'ACTIVE'}));save();
  taxBody={slabName:fixture.marker+'-合成10%',region:fixture.marker,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',thresholdAmount:'0.00',status:'DRAFT',remark:'仅验证真实放款与折现组合，不代表正式政策'};
  fixture.slabId=id(await ok('admin',pay+'/tax-slabs','POST',taxBody));save();
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId+'/details','PUT',Array.from({length:7},(_,index)=>({levelNo:index+1,fromAmount:String(index*10000),toAmount:index===6?null:String((index+1)*10000),taxRate:'0.1000',quickDeduction:'0.00'})));
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'ACTIVE'});
  await ok('admin','/hr/compensation/tax-profiles','POST',{employeeId:fixture.employeeId,taxSlabId:fixture.slabId,taxResidenceCity:'隔离测试',status:'ACTIVE'});
  const codes=['hr.advance.salary.multiplier','hr.advance.payroll.maximumNetRatio','hr.advance.payroll.minimumNetAmount'];
  check('no_existing_advance_rules',database('SELECT COUNT(*) FROM sys_business_rule WHERE rule_code IN ('+codes.map(literal).join(',')+')')==='0');
  for(const[index,code]of codes.entries()){
    await ok('admin',rules,'POST',{ruleCode:code,ruleName:fixture.marker,module:'hr',thresholdValue:['0.02','0.50','100.00'][index],effect:'BLOCK',enabled:1,priority:100,remark:fixture.marker});
    const rule=(await ok('admin',rules+'/list?ruleCode='+code+'&pageSize=100')).records.find(value=>value.ruleCode===code);fixture.rules.push({id:id(rule.id),code});save();
    const draft=await ok('admin',rules+'/draft','POST',{...rule,remark:fixture.marker+'-已发布合成规则'});await ok('admin',rules+'/versions/'+id(draft.id)+'/publish','POST',{});
  }
  const configKey='sys.hr.advance.processKey';
  check('no_original_advance_process_override',(await ok('admin','/auth/system/config/list?configKey='+configKey+'&pageSize=100')).records.filter(value=>value.configKey===configKey).length===0);
  const model={nodes:[{id:'start',type:'START',title:'员工申请'},{id:'leader',type:'APPROVAL',title:'部门负责人',approverType:'VARIABLE_USER',approverValue:'responsibleApproverIds',allowDelegate:false,allowAddSign:false},{id:'finance',type:'APPROVAL',title:'财务复核',approverType:'VARIABLE_USER',approverValue:'financeApproverIds',signType:'ANY',allowDelegate:false,allowAddSign:false},{id:'end',type:'END',title:'完成'}],edges:[{id:'first',source:'start',target:'leader'},{id:'second',source:'leader',target:'finance'},{id:'third',source:'finance',target:'end'}]};
  const definition=await ok('admin',wf+'/definition/save','POST',{processKey:fixture.marker,processName:fixture.marker,modelJson:JSON.stringify(model),formId:null,startPermissionType:'ALL',startPermissionValue:'[]'});fixture.definitionId=definition.definitionId||definition.id;save();
  await ok('admin',wf+'/definition/deploy/'+fixture.definitionId,'POST');
  await ok('admin','/auth/system/config','POST',{configKey,configValue:fixture.marker,configName:fixture.marker,configType:'N',configScope:'1'});
  fixture.configId=id((await ok('admin','/auth/system/config/list?configKey='+configKey+'&pageSize=100')).records.find(value=>value.configKey===configKey).configId);save();
  fixture.loanId=id(await ok('employee',advance,'POST',{amount:'100.01',purpose:fixture.marker,repayMode:'SALARY_DEDUCT',repayStartMonth:fixture.month,repayMonths:1,monthlyDeductAmount:'100.01'},{'Idempotency-Key':fixture.marker}));save();
  loanRow=()=>rows(`SELECT JSON_OBJECT('approval',approval_status,'status',status,'version',version,'instance',instance_id,'payment',CAST(payment_request_id AS CHAR),'paid',paid_time,'outstanding',CAST(outstanding_amount AS CHAR),'repaid',CAST(repaid_amount AS CHAR),'reserved',CAST(reserved_amount AS CHAR)) FROM hr_employee_advance WHERE tenant_id=100000 AND advance_id=${fixture.loanId}`)[0];
  const tasks=instance=>rows('SELECT JSON_OBJECT(\'id\',task_id,\'actor\',CAST(assignee AS CHAR),\'node\',node_key) FROM wf_task WHERE tenant_id=100000 AND status=\'TODO\' AND instance_id='+literal(instance));
  const draft=(await ok('employee',advance+'/mine/'+fixture.loanId)).advance;
  await ok('employee',advance+'/'+fixture.loanId+'/submit','POST',{version:draft.version});
  const started=await until(loanRow,value=>Boolean(value?.instance),'Actual loan instance missing');fixture.loanInstance=started.instance;save();
  const first=await until(()=>tasks(started.instance),value=>value.length===1&&value[0].node==='leader','Leader task missing');
  check('actual_department_leader_first',first[0].actor===sessions.admin.identity.userId&&cents(loanRow().outstanding)===0n);
  await ok('admin',wf+'/complete','POST',{taskId:first[0].id,action:'APPROVE',comment:fixture.marker});
  const second=await until(()=>tasks(started.instance).find(task=>task.actor===financeId&&task.node==='finance'),Boolean,'Existing finance task missing');
  check('unfunded_after_first_approval',loanRow().payment===null&&cents(loanRow().outstanding)===0n);
  await ok('finance',wf+'/complete','POST',{taskId:second.id,action:'APPROVE',comment:fixture.marker});
  const approved=await until(loanRow,value=>Boolean(value?.payment),'Approved loan payment missing');fixture.paymentId=id(approved.payment);save();
  check('actual_approvals_still_unfunded',approved.approval==='APPROVED'&&cents(approved.outstanding)===0n&&approved.paid===null);
  const preview=()=>ok('admin',pay+'/slips/preview?'+new URLSearchParams({employeeId:fixture.employeeId,periodId:fixture.periodId,deductUnverified:'false'}));
  const beforeFunding=await preview();check('unfunded_loan_excluded',beforeFunding.components.filter(row=>row.sourceBizType==='HR_ADVANCE').length===0);
  const unauthorized=await api('employee','/oa/payment/request/'+fixture.paymentId+'/pay','POST',{});check('employee_cannot_fund',[403,404].includes(unauthorized.status));
  await ok('finance','/oa/payment/request/'+fixture.paymentId+'/pay','POST',{});
  const funded=await until(loanRow,value=>value?.status==='PAID','Actual funding callback missing');
  check('actual_funding_creates_exact_principal',cents(funded.outstanding)===10001n&&cents(funded.repaid)===0n&&cents(funded.reserved)===0n&&Boolean(funded.paid));
  await ok('finance','/oa/payment/request/'+fixture.paymentId+'/pay','POST',{});
  check('funding_event_and_audit_once',database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='HR_ADVANCE_PAYMENT_PAID' AND aggregate_id=${fixture.paymentId}`)==='1'&&database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_ADVANCE' AND business_id=${fixture.loanId} AND operation_type='FUNDED'`)==='1'&&cents(loanRow().outstanding)===10001n);
  evidence.funding=true;console.log('D3_FUNDED_PHASE: actual approval and OA funding passed');
  fixture.cashComponentId=id(await ok('admin','/hr/compensation/components','POST',{componentCode:fixture.marker+'-cash',componentName:fixture.marker+'假期折现',componentType:'VARIABLE',category:'EARNING',taxable:1,status:1,sortOrder:999}));save();
  fixture.leaveTypeBody={leaveCode:fixture.marker,leaveName:fixture.marker+'折现假期',needQuota:1,isPaid:1,unit:'DAY',status:1,maxDaysPerYear:5,roundingMode:'NONE',encashmentFlag:1,encashmentComponentId:fixture.cashComponentId};
  fixture.leaveTypeId=id(await ok('admin','/hr/attendance/leave-types','POST',fixture.leaveTypeBody));save();
  const ledger={employeeId:fixture.employeeId,leaveTypeId:fixture.leaveTypeId,periodId:fixture.leavePeriodId,remark:fixture.marker};
  fixture.grantId=id(await ok('admin',leave+'/ledger','POST',{...ledger,transactionType:'ADJUSTMENT',quantity:5,sourceId:fixture.marker+'-grant'}));save();
  const cashBody={...ledger,transactionType:'ENCASHMENT',quantity:2,sourceId:fixture.marker+'-cash',encashmentAmount:'123.45',effectiveDate:fixture.today};
  fixture.cashLedgerId=id(await ok('admin',leave+'/ledger','POST',cashBody));save();
  const sourceDigest=()=>hash(database('SELECT * FROM hr_leave_ledger WHERE employee_id='+fixture.employeeId+' ORDER BY ledger_id')+database('SELECT * FROM hr_leave_quota WHERE employee_id='+fixture.employeeId+' ORDER BY id')+database('SELECT * FROM hr_comp_change WHERE employee_id='+fixture.employeeId+' ORDER BY id'));
  const beforeRepeat=sourceDigest();check('duplicate_encashment_same_ledger',id(await ok('admin',leave+'/ledger','POST',cashBody))===fixture.cashLedgerId);check('duplicate_encashment_no_source_changes',sourceDigest()===beforeRepeat);
  const changes=(await ok('admin','/hr/compensation/changes?employeeId='+fixture.employeeId+'&pageSize=100')).rows;
  check('exact_actual_encashment_source',changes.length===1&&changes[0].changeType==='LEAVE_ENCASHMENT'&&changes[0].status==='APPROVED'&&cents(changes[0].changeAmount)===12345n&&changes[0].effectiveDate===fixture.today);fixture.changeId=id(changes[0].id);save();
  check('encashment_retains_selected_component',database('SELECT CAST(salary_component_id AS CHAR) FROM hr_comp_change WHERE tenant_id=100000 AND id='+fixture.changeId)===fixture.cashComponentId);
  check('encashment_available_three_days',database(`SELECT available_quota FROM hr_leave_quota WHERE employee_id=${fixture.employeeId} AND leave_type_id=${fixture.leaveTypeId} AND period_id=${fixture.leavePeriodId} AND deleted=0`)==='3.00');
  check('encashment_amount_stored_encrypted',database(`SELECT COUNT(*) FROM hr_comp_change WHERE id=${fixture.changeId} AND change_amount NOT REGEXP '^[0-9]+([.][0-9]+)?$'`)==='1');evidence.encashment=true;
  function verify(slip,label){
    for(const[field,value]of Object.entries({grossTotal:2712345n,taxAmount:271235n,currentTax:271235n,benefitAmount:0n,deductionTotal:281236n,netTotal:2431109n,cumulativeTaxableIncome:2712345n}))check(label+'_'+field,cents(slip[field])===value);
    const variables=slip.components.filter(row=>row.sourceType==='COMPENSATION_CHANGE'),deductions=slip.components.filter(row=>row.sourceBizType==='HR_ADVANCE');
    check(label+'_unique_encashment_component',variables.length===1&&String(variables[0].changeId)===fixture.changeId&&String(variables[0].salaryComponentId)===fixture.cashComponentId&&cents(variables[0].amount)===12345n);
    check(label+'_unique_funded_loan_component',deductions.length===1&&String(deductions[0].advanceId)===fixture.loanId&&cents(deductions[0].amount)===10001n);
    const basis=slip.components.filter(row=>row.type==='PAYROLL_BASIS');check(label+'_actual_month_portion',basis.length===1&&cents(basis[0].postedFixedGross)===2700000n&&basis[0].periodStart==='2026-10-05'&&basis[0].periodEnd==='2026-10-31');
  }
  verify(await preview(),'mixed_preview');check('preview_does_not_reserve',cents(loanRow().reserved)===0n&&cents(loanRow().repaid)===0n);
  const repaymentRows=slipId=>rows(`SELECT JSON_OBJECT('id',CAST(repayment_id AS CHAR),'loan',CAST(advance_id AS CHAR),'amount',CAST(repay_amount AS CHAR),'month',repay_month,'status',status) FROM hr_advance_repayment WHERE tenant_id=100000 AND salary_slip_id=${slipId} ORDER BY repayment_id`);
  const calculate=async()=>{const batch={id:id(await ok('admin',pay+'/batches','POST',{payrollPeriodId:fixture.periodId,employeeIds:[fixture.employeeId],validateAttendanceFlag:0,deductUnverifiedFlag:0}))};fixture.batches.push(batch);save();const task={batchId:batch.id,executeNo:await ok('admin',pay+'/batches/'+batch.id+'/calculate','POST',{})};fixture.tasks.push(task);save();await observe(task);check('original_calculation_task_success',task.terminal==='SUCCESS');const detail=await ok('admin',pay+'/batches/'+batch.id);check('only_owned_employee_calculated',detail.batch.status==='CALCULATED'&&detail.employees.length===1&&detail.employees[0].calcStatus==='SUCCESS'&&String(detail.employees[0].employeeId)===fixture.employeeId);batch.slipId=id(detail.employees[0].salarySlipId);save();verify(await ok('admin',pay+'/slips/'+batch.slipId),'actual_'+batch.id);const entries=repaymentRows(batch.slipId);check('calculation_reserves_once_'+batch.id,entries.length===1&&entries[0].loan===fixture.loanId&&cents(entries[0].amount)===10001n&&entries[0].status==='RESERVED'&&entries[0].month===fixture.month&&cents(loanRow().reserved)===10001n&&cents(loanRow().repaid)===0n);return batch;};
  const cancelled=await calculate();await ok('admin',pay+'/batches/'+cancelled.id+'/cancel','POST',{});
  check('cancel_releases_original_reservation',repaymentRows(cancelled.slipId).length===1&&repaymentRows(cancelled.slipId)[0].status==='RELEASED'&&cents(loanRow().reserved)===0n&&cents(loanRow().outstanding)===10001n&&cents(loanRow().repaid)===0n);
  check('cancel_keeps_encashment_source',sourceDigest()===beforeRepeat);check('cancel_soft_deletes_only_owned_slip',database('SELECT deleted FROM hr_salary_slip WHERE id='+cancelled.slipId)==='1');evidence.cancellation=true;
  const published=await calculate();evidence.mixedPayroll=true;
  await ok('admin',pay+'/batches/'+published.id+'/submit','POST',{});const submitted=await ok('employee','/hr/ess/salary-slips/'+published.slipId);verify(submitted,'employee_submitted');
  check('submission_preserves_unpaid_principal',cents(loanRow().outstanding)===10001n&&cents(loanRow().reserved)===10001n&&cents(loanRow().repaid)===0n);
  await ok('admin',pay+'/batches/'+published.id+'/pay','POST',{});const paid=await ok('admin',pay+'/slips/'+published.slipId);verify(paid,'paid');check('actual_salary_paid',paid.status==='PAID');
  check('actual_payment_clears_once',loanRow().status==='CLEARED'&&cents(loanRow().outstanding)===0n&&cents(loanRow().reserved)===0n&&cents(loanRow().repaid)===10001n&&repaymentRows(published.slipId).length===1&&repaymentRows(published.slipId)[0].status==='POSTED');evidence.payment=true;
  const paidDigest=hash(database('SELECT * FROM hr_salary_slip WHERE id='+published.slipId)+database('SELECT * FROM hr_employee_advance WHERE advance_id='+fixture.loanId)+database('SELECT * FROM hr_advance_repayment WHERE advance_id='+fixture.loanId+' ORDER BY repayment_id'));
  const repeatPay=await api('admin',pay+'/batches/'+published.id+'/pay','POST',{});
  check('already_paid_batch_rejected',repeatPay.status===400&&repeatPay.body?.code==='INVALID_PAYROLL_STATE');
  check('repeat_salary_pay_preserves_all_financial_rows',paidDigest===hash(database('SELECT * FROM hr_salary_slip WHERE id='+published.slipId)+database('SELECT * FROM hr_employee_advance WHERE advance_id='+fixture.loanId)+database('SELECT * FROM hr_advance_repayment WHERE advance_id='+fixture.loanId+' ORDER BY repayment_id')));
  check('single_post_audit',database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_ADVANCE' AND business_id=${fixture.loanId} AND operation_type='SALARY_POST'`)==='1');
  check('sources_unchanged_after_payment',sourceDigest()===beforeRepeat);evidence.duplicates=true;
  check('period_five_expected_revision_updates',Number(database('SELECT version FROM hr_payroll_period WHERE period_id=104'))===fixture.originalPeriodVersion+5);
  fs.writeFileSync(path.join(output,'paid-salary.json'),JSON.stringify(paid,null,2),{flag:'wx'});
  const ui=await sessions.admin.context.newPage();ui.on('pageerror',()=>runtime.browserErrors.push('salary-ui'));ui.setDefaultTimeout(30000);
  await ui.goto(origin+'/hr/payroll?id='+published.slipId,{waitUntil:'networkidle'});const dialog=ui.getByRole('dialog');await dialog.waitFor();const body=await dialog.innerText();check('salary_page_actual_amounts',body.includes('27123.45')&&body.includes('24311.09')&&body.includes('100.01')&&body.includes('123.45'));await ui.screenshot({path:path.join(output,'paid-salary-page.png')});await ui.close();evidence.browser=true;
  console.log('D3_FUNDED_PHASE: source combination, cancellation and actual payroll payment passed');
}catch(error){failure=error;}
finally{
  if(runtime){
    const {database,check,rows}=runtime;
    const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;failure||=error;}save();};
    await restore('batches',async()=>{for(const task of fixture.tasks)await observe(task);for(const batch of fixture.batches){const detail=await ok('admin',pay+'/batches/'+batch.id);assert.notEqual(detail.batch.status,'CALCULATING');if(['DRAFT','CALCULATED','FAILED'].includes(detail.batch.status))await ok('admin',pay+'/batches/'+batch.id+'/cancel','POST',{});check('owned_batch_terminal_'+batch.id,['CANCELLED','PAID','SUBMITTED'].includes((await ok('admin',pay+'/batches/'+batch.id)).batch.status));}});
    await restore('loanWorkflow',async()=>{if(fixture.loanId&&loanRow){const loan=loanRow();if(loan.approval==='SUBMITTED'){await until(loanRow,value=>Boolean(value?.instance),'Recovery loan instance missing');await ok('employee',advance+'/'+fixture.loanId+'/withdraw','POST',{version:loanRow().version,reason:fixture.marker+'-验证收尾'});}if(fixture.loanInstance)check('original_workflow_terminal',rows('SELECT JSON_OBJECT(\'status\',status) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id='+literal(fixture.loanInstance)).every(value=>!['RUNNING','PAUSED','PENDING','FAILED','RESTARTED'].includes(value.status)));}});
    await restore('binding',async()=>{if(fixture.employeeId){await ok('admin','/hr/employees/'+fixture.employeeId,'PUT',{...employeeBody,userId:null});check('owned_employee_unbound',database('SELECT COUNT(*) FROM hr_employee WHERE id='+fixture.employeeId+' AND user_id IS NULL')==='1');}});
    await restore('syntheticTax',async()=>{if(fixture.slabId)await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'INACTIVE'});});
    await restore('advanceRules',async()=>{for(const rule of fixture.rules)await ok('admin',rules+'/'+rule.id,'DELETE');if(fixture.rules.length)check('temporary_rules_removed',database('SELECT COUNT(*) FROM sys_business_rule WHERE id IN ('+fixture.rules.map(rule=>rule.id).join(',')+')')==='0');});
    await restore('advanceConfig',async()=>{if(fixture.configId){await ok('admin','/auth/system/config/'+fixture.configId,'DELETE');check('temporary_advance_config_removed',database('SELECT COUNT(*) FROM sys_config WHERE config_id='+fixture.configId)==='0');}});
    await restore('department',async()=>{if(departmentChanged){const current=await ok('admin','/auth/system/dept/100');check('restore_only_owned_department_setting',current.leader===runtime.sessions.admin.identity.userId&&String(current.holidayCalendarId)==='990000746');await ok('admin','/auth/system/dept','PUT',{deptId:'100',parentId:0,leader:fixture.originalDepartment.leader,holidayCalendarId:fixture.originalDepartment.holidayCalendarId,version:current.version});const restored=await ok('admin','/auth/system/dept/100');for(const[key,value]of Object.entries(fixture.originalDepartment))if(key!=='version')check('original_department_'+key,JSON.stringify(restored[key]??null)===JSON.stringify(value));check('department_two_real_version_updates',restored.version===fixture.originalDepartment.version+2);fixture.departmentVersionAfter=restored.version;}});
    await restore('originalBusiness',async()=>{if(originalDigests){const after=preserved();for(const[table,digest]of Object.entries(originalDigests))check('original_'+table+'_preserved',after[table]===digest);check('original_roles_preserved',roles()===originalRoles);evidence.preservation=true;}});
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{check('no_unhandled_browser_errors',runtime.browserErrors.length===0);console.log('D3_FUNDED_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,tasks:fixture.tasks.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:failure?String(failure.message).split('\n')[0].slice(0,180):undefined};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));console.log('D3_FUNDED_RESULT: '+JSON.stringify({...result,checks:result.checks.length}));if(!result.passed)process.exitCode=1;
}
