import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {prepareSettlementReferral} from './verify-hr-settlement-referral-source.mjs';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';
import {authenticateFormTest} from './runtime-checks/form-browser-auth.mjs';

const attendance='/hr/attendance',overtime='/hr/attendance/overtime-requests',types='/hr/attendance/overtime-types';
const root='D:/CloudFlowPro',pay='/hr/compensation/payroll',advance='/hr/advance',leave='/hr/attendance/leave',wf='/workflow/wf',rules='/auth/system/rules';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-approved-income'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-approved-income-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;};
const literal=value=>"CONVERT(X'"+Buffer.from(String(value)).toString('hex')+"' USING utf8mb4)";
const hash=value=>createHash('sha256').update(value).digest('hex');
const cents=value=>{const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));assert.ok(match,'Exact money required');return (match[1]?-1n:1n)*(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')));};
const fixture={marker:'D3A-'+randomUUID().replaceAll('-','').slice(0,12),rules:[],configs:[],batches:[],tasks:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={overtime:false,referral:false,mixedPayroll:false,cancellation:false,payment:false,duplicates:false,browser:false,preservation:false,restoration:false,secrets:false};
const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_comp_change','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id'],['hr_employee_advance','advance_id'],['hr_advance_repayment','repayment_id'],['biz_payment_request','id'],['hr_leave_type','id'],['hr_leave_quota','id'],['hr_leave_ledger','ledger_id'],['sys_dept','dept_id'],['sys_config','config_id'],['hr_overtime_type','type_id'],['hr_overtime_request','request_id'],['hr_employee_referral','referral_id'],['hr_comp_grade','id'],['hr_shift','id'],['hr_schedule_assignment','id'],['hr_attendance_checkin','checkin_id'],['hr_candidate','id'],['hr_offer','id'],['hr_recruitment_requisition','id'],['hr_position','id'],['sys_tenant','tenant_id']];
let originalType,typeChanged=false,componentChanged=false,limitChanged=false,publishLimit,configRestore;
let runtime,failure,ok,api,observe,preserved,roles,originalDigests,originalRoles,taxBody,employeeBody,loanRow,until,departmentChanged=false;
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {database,rows,check,sessions}=runtime;
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  // Allow only real configuration revision metadata, preserving each business value.
  const projection=(table,condition,omitted)=>database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name="+literal(table)+" ORDER BY ordinal_position").split(/\r?\n/).map(column=>{assert.match(column,/^[a-z][a-z0-9_]*$/);return omitted.includes(column)?'IF('+condition+',NULL,`'+column+'`) AS `'+column+'`':'`'+column+'`';}).join(',');
  const projections={
    hr_comp_component:projection('hr_comp_component','id=103',['version','update_time']),
    hr_payroll_period:projection('hr_payroll_period','period_id=104',['version']),
    hr_overtime_type:projection('hr_overtime_type','type_id=100',['version','update_by','update_time']),
    sys_config:projection('sys_config',"config_key IN ('sys.hr.overtime.processKey','sys.hr.overtime.approvalUsers','sys.hr.referral.processKey','sys.hr.referral.approvalUsers','sys.hr.offer.processKey')",['version','update_by','update_time']),
    sys_tenant:projection('sys_tenant','tenant_id=100000',['update_time'])
  };
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{const digest=createHash('sha256');let cursor='0';for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;digest.update(database('SELECT '+(projections[table]||'*')+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}return[table,digest.digest('hex')];}));
  roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  originalDigests=preserved();originalRoles=roles();fixture.originalBounds=bounds;fixture.originalDigests=originalDigests;save();
  const clock=new Map(),interval=Math.max(5000,Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis'")))+150;
  assert.ok(Number.isSafeInteger(interval)&&interval<=60150);fixture.repeatIntervalMillis=interval;
  api=async(actor,url,method='GET',body,headers)=>{
    const key=actor+' '+method+' '+url.split('?')[0];if(method!=='GET'){const remaining=interval-(Date.now()-(clock.get(key)||0));if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
    try{
      if(!/^\/(?:hr\/(?:advance|ess\/salary-slips|attendance\/overtime-requests|referral|recruitment)|oa\/payment\/request)(?:\/|\?|$)/.test(url))return await runtime.api(actor,url,{method,body});
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
  observe=async task=>{if(task.terminal)return;for(let attempt=0;;attempt++){const result=await ok('admin',pay+'/tasks/'+encodeURIComponent(task.executeNo));if(['SUCCESS','FAILED','TIMEOUT'].includes(result.executeStatus)){task.terminal=result.executeStatus;save();return;}if(attempt>0&&attempt%30===0)console.log('D3_APPROVED_INCOME_PHASE: observing original payroll task');await new Promise(resolve=>setTimeout(resolve,1000));}};
  const financeId='990001030',financeName='h2adv_finance_870861120861';
  check('existing_owned_finance_identity',database(`SELECT COUNT(*) FROM sys_user u JOIN sys_user e ON e.user_name='g_holiday_employee' AND e.tenant_id=u.tenant_id JOIN sys_user_role ur ON ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE u.user_id=${financeId} AND u.user_name=${literal(financeName)} AND u.create_by='advance-payroll-fixture' AND u.status='0' AND u.deleted=0 AND u.pwd_reset_required='0' AND u.password=e.password AND r.role_key='finance'`)==='1');
  const account=read(path.join(runtime.run,'private/accounts.json')).find(value=>value.username==='g_holiday_employee');
  const origin=new URL(sessions.admin.page.url()).origin,context=await sessions.admin.context.browser().newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',()=>runtime.browserErrors.push('finance'));await page.goto(origin,{waitUntil:'domcontentloaded'});
  const identity=await authenticateFormTest(page,{...account,username:financeName},origin);
  check('real_finance_login',identity.authenticated&&identity.userId===financeId&&identity.tenantId==='100000');
  const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());runtime.sensitive.add(token);runtime.sensitive.add(token.replace(/^Bearer /,''));sessions.finance={page,context,identity};

  fixture.today=database('SELECT CURRENT_DATE()');fixture.month='2026-10';fixture.workDate='2026-10-04';fixture.periodId='104';fixture.deptId='100';
  check('actual_source_date_in_past',fixture.today>fixture.workDate);
  const period=(await ok('admin',pay+'/config/periods')).find(value=>String(value.periodId)===fixture.periodId);
  check('original_open_october_period',period?.status==='OPEN'&&period.startDate==='2026-10-05'&&period.endDate==='2026-10-31');fixture.originalPeriodVersion=period.version;
  check('employee_account_unbound',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND user_id='+id(sessions.employee.identity.userId))==='0');
  employeeBody={employeeNo:fixture.marker,name:fixture.marker+'审批收入员工',gender:'UNKNOWN',deptId:fixture.deptId,employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2026-10-01'};
  fixture.employeeId=id(await ok('admin','/hr/employees','POST',{...employeeBody,userId:sessions.employee.identity.userId}));save();
  fixture.structureId=id(await ok('admin','/hr/compensation/structures','POST',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{}}));save();
  await ok('admin',pay+'/structures/'+fixture.structureId,'PUT',{salaryBasis:'MONTHLY',prorationBasis:'CALENDAR_DAYS',benefitTiming:'FIRST_PAYROLL'});
  fixture.gradeId=id(await ok('admin','/hr/compensation/grades','POST',{gradeCode:fixture.marker,gradeName:fixture.marker,minSalary:'31000.00',midSalary:'31000.00',maxSalary:'31000.00',currency:'CNY',status:1}));save();
  fixture.fixedComponentId=id(await ok('admin','/hr/compensation/components','POST',{componentCode:fixture.marker+'-fixed',componentName:fixture.marker+'固定工资',componentType:'FIXED',category:'EARNING',taxable:1,status:1,sortOrder:998}));save();
  fixture.compensationId=id(await ok('admin','/hr/compensation/employee-compensations','POST',{employeeId:fixture.employeeId,structureId:fixture.structureId,gradeId:fixture.gradeId,componentValues:{[fixture.fixedComponentId]:'31000.00'},totalSalary:'31000.00',effectiveDate:'2026-10-01',status:'ACTIVE'}));save();
  taxBody={slabName:fixture.marker+'-合成10%',region:fixture.marker,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',thresholdAmount:'0.00',status:'DRAFT',remark:'仅验证实际加班与内推审批来源，不代表正式政策'};
  fixture.slabId=id(await ok('admin',pay+'/tax-slabs','POST',taxBody));save();
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId+'/details','PUT',Array.from({length:7},(_,index)=>({levelNo:index+1,fromAmount:String(index*10000),toAmount:index===6?null:String((index+1)*10000),taxRate:'0.1000',quickDeduction:'0.00'})));
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'ACTIVE'});
  await ok('admin','/hr/compensation/tax-profiles','POST',{employeeId:fixture.employeeId,taxSlabId:fixture.slabId,taxResidenceCity:'隔离测试',status:'ACTIVE'});
  await ok('admin','/auth/system/holiday/calendar','POST',{calendarCode:fixture.marker,calendarName:fixture.marker,defaultFlag:0,weeklyRestDays:'6,7',workStartTime:'09:00:00',workEndTime:'18:00:00',lunchStartTime:'12:00:00',lunchEndTime:'13:00:00',status:'ENABLED'});
  fixture.calendarId=id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code='+literal(fixture.marker)));save();
  await ok('admin','/auth/system/holiday/date/batch','POST',{calendarId:fixture.calendarId,yearNo:2026,dates:Array.from({length:31},(_,index)=>({holidayDate:'2026-10-'+String(index+1).padStart(2,'0'),dateType:'WORKDAY',triplePayFlag:0,holidayName:fixture.marker}))});
  fixture.shiftId=id(await ok('admin',attendance+'/shifts','POST',{shiftCode:fixture.marker,shiftName:fixture.marker,startTime:'09:00:00',endTime:'18:00:00',breakMinutes:60,workMinutes:480,checkinWindowBeforeMinutes:30,checkoutWindowAfterMinutes:180,lateGraceMinutes:10,earlyExitGraceMinutes:10,halfDayHoursThreshold:4,absentHoursThreshold:2,workingHoursCalcMode:'FIRST_LAST',checkinDetermineMode:'EARLIEST_LATEST',holidayCalendarId:fixture.calendarId,autoAttendanceFlag:1,processAttendanceAfter:'2026-01-01',markOnHolidayFlag:0,overtimeThresholdMinutes:0,status:1}));save();
  fixture.attendanceRuleId=id(await ok('admin',attendance+'/rules','POST',{ruleCode:fixture.marker,ruleName:fixture.marker,ruleType:'FIXED',shiftId:fixture.shiftId,checkMethods:['APP'],configJson:{breakStartTime:'12:00',breakEndTime:'13:00'},status:1}));save();
  await ok('admin',attendance+'/schedules','POST',{targetType:'EMPLOYEE',targetId:fixture.employeeId,shiftId:fixture.shiftId,ruleId:fixture.attendanceRuleId,effectiveStart:'2026-10-01',effectiveEnd:'2026-10-31',status:'PUBLISHED'});
  for(const [index,time]of ['09:00:00','20:00:00'].entries())await ok('admin',attendance+'/checkins','POST',{employeeId:fixture.employeeId,logType:index===0?'IN':'OUT',checkTime:fixture.workDate+' '+time,checkMethod:'APP',deviceId:fixture.marker,remark:fixture.marker});
  fixture.punchDigest=hash(database('SELECT * FROM hr_attendance_checkin WHERE employee_id='+fixture.employeeId+' ORDER BY checkin_id'));
  originalType=await ok('admin',types+'/100');fixture.originalType=originalType;save();
  check('original_workday_type_disabled',originalType.typeCode==='WORKDAY'&&originalType.applicableDayType==='WORKDAY'&&originalType.status===0);
  const component=(await ok('admin','/hr/compensation/components')).find(value=>String(value.id)==='103');
  check('original_owned_overtime_component',component?.componentCode==='OVERTIME'&&component.componentType==='VARIABLE'&&component.taxable===1&&component.status===0);
  fixture.originalComponent=Object.fromEntries(['componentCode','componentName','componentType','category','taxable','sortOrder','status','version'].map(key=>[key,component[key]??null]));componentChanged=true;save();
  await ok('admin','/hr/compensation/components/103','PUT',{...fixture.originalComponent,status:1});
  const typeBody=value=>Object.fromEntries(['typeCode','typeName','applicableDayType','rateMultiplier','salaryComponentId','compensatoryFlag','compensatoryRatio','compensatoryLeaveTypeId','maxHoursPerMonth','maxHoursPerDay','needApprovalFlag','remark','version'].map(key=>[key,value[key]??null]));
  fixture.originalTypeBody=typeBody(originalType);typeChanged=true;save();
  let enabled=await ok('admin',types+'/100','PUT',{...typeBody(originalType),rateMultiplier:'1.50',maxHoursPerDay:'8.00',maxHoursPerMonth:'40.00',needApprovalFlag:1});
  enabled=await ok('admin',types+'/100/status','POST',{version:enabled.version,status:1,reason:fixture.marker});
  const limitRule=(await ok('admin',rules+'/list?ruleCode=hr.overtime.hours.limit&pageSize=100')).records.filter(value=>value.ruleCode==='hr.overtime.hours.limit');
  check('one_existing_overtime_rule',limitRule.length===1&&limitRule[0].module==='hr');
  fixture.originalLimitRule=Object.fromEntries(['id','ruleCode','ruleName','module','enabled','effect','thresholdValue','priority','remark'].map(key=>[key,limitRule[0][key]??null]));save();
  publishLimit=async body=>{const draft=await ok('admin',rules+'/draft','POST',body);await ok('admin',rules+'/versions/'+id(draft.id)+'/publish','POST',{});return ok('admin',rules+'/'+body.id);};
  limitChanged=true;await publishLimit({...fixture.originalLimitRule,enabled:1,effect:'BLOCK',thresholdValue:null,remark:fixture.marker});
  const model={nodes:[{id:'start',type:'START',title:'提交'},{id:'leader',type:'APPROVAL',title:'负责人审核',approverType:'VARIABLE_USER',approverValue:'responsibleApproverIds',allowDelegate:false,allowAddSign:false},{id:'hr',type:'APPROVAL',title:'人事复核',approverType:'VARIABLE_USER',approverValue:'hrApproverIds',allowDelegate:false,allowAddSign:false},{id:'end',type:'END',title:'完成'}],edges:[{id:'a',source:'start',target:'leader'},{id:'b',source:'leader',target:'hr'},{id:'c',source:'hr',target:'end'}]};
  const definition=await ok('admin',wf+'/definition/save','POST',{processKey:fixture.marker,processName:fixture.marker,modelJson:JSON.stringify(model),formId:null,startPermissionType:'ALL',startPermissionValue:'[]'});
  fixture.definitionId=definition.definitionId||definition.id;save();await ok('admin',wf+'/definition/deploy/'+fixture.definitionId,'POST');
  configRestore=async()=>{for(const original of [...fixture.configs].reverse()){await ok('admin','/auth/system/config','PUT',original);const restored=await ok('admin','/auth/system/config/'+original.configId);for(const key of ['configKey','configValue','configScope','configName','configType','remark'])check('restored_overtime_config_'+key,JSON.stringify(restored[key]??null)===JSON.stringify(original[key]??null));}};
  for(const [configKey,configValue]of [['sys.hr.overtime.processKey',fixture.marker],['sys.hr.overtime.approvalUsers',JSON.stringify({responsibleUserId:financeId,hrUserId:sessions.hr.identity.userId})]]){
    const listed=(await ok('admin','/auth/system/config/list?configKey='+configKey+'&pageSize=100')).records.filter(value=>value.configKey===configKey);check('one_original_overtime_config',listed.length===1);
    const current=await ok('admin','/auth/system/config/'+listed[0].configId),original=Object.fromEntries(['configId','tenantId','configScope','configKey','configName','configType','configValue','remark'].map(key=>[key,current[key]??null]));
    fixture.configs.push(original);save();await ok('admin','/auth/system/config','PUT',{...original,configValue});
  }
  let request=await ok('employee',overtime,'POST',{startTime:fixture.workDate+'T18:00:00',endTime:fixture.workDate+'T20:00:00',settleMode:'PAY',reason:fixture.marker},{'Idempotency-Key':fixture.marker});
  fixture.overtimeId=id(request.requestId);save();
  request=await ok('employee',overtime+'/'+fixture.overtimeId+'/submit','POST',{version:request.version});
  check('real_two_hour_evidence',request.status==='SUBMITTED'&&request.actualMinutes===120&&request.approvedMinutes===null);
  request=await ok('hr',overtime+'/'+fixture.overtimeId+'/review-hours','POST',{version:request.version,approvedMinutes:120,note:fixture.marker});
  check('real_hr_verifies_before_pricing',request.approvedMinutes===120&&!request.instanceId);
  request=await ok('finance',overtime+'/'+fixture.overtimeId+'/review-pay','POST',{version:request.version,hourlyRate:'20.01',payrollPeriodId:fixture.periodId,note:fixture.marker});
  const pending=await ok('finance',overtime+'/'+fixture.overtimeId+'/settlement');
  check('frozen_finance_price',String(pending.pricedBy)===financeId&&cents(pending.hourlyRate)===2001n&&cents(pending.settlementAmount)===6003n&&String(pending.payrollPeriodId)===fixture.periodId);
  const pendingPreview=await ok('admin',pay+'/batches/preview','POST',{payrollPeriodId:fixture.periodId,employeeIds:[fixture.employeeId],validateAttendanceFlag:0,deductUnverifiedFlag:0});
  check('pending_overtime_blocks_payroll',pendingPreview.length===1&&pendingPreview[0].calcStatus==='SKIPPED'&&String(pendingPreview[0].errorMessage).includes('加班'));
  fixture.overtimeInstance=(await until(()=>ok('employee',overtime+'/'+fixture.overtimeId),value=>Boolean(value.instanceId),'Original overtime instance missing')).instanceId;save();
  const tasks=instance=>rows("SELECT JSON_OBJECT('id',task_id,'actor',CAST(assignee AS CHAR),'node',node_key) FROM wf_task WHERE tenant_id=100000 AND instance_id="+literal(instance)+" AND status='TODO'");
  for(const [node,actor]of [['leader','finance'],['hr','hr']]){
    const task=await until(()=>tasks(fixture.overtimeInstance),value=>value.length===1&&value[0].node===node,'Original overtime task missing');
    check('actual_overtime_actor_'+node,task[0].actor===sessions[actor].identity.userId);
    await ok(actor,wf+'/complete','POST',{taskId:task[0].id,action:'APPROVE',comment:fixture.marker});
  }
  const settled=await until(()=>ok('finance',overtime+'/'+fixture.overtimeId+'/settlement'),value=>['SETTLED','FAILED','NEEDS_RESOLUTION'].includes(value.settlementStatus),'Original overtime result missing');
  check('actual_overtime_source_settled',settled.settlementStatus==='SETTLED'&&cents(settled.settlementAmount)===6003n&&Boolean(settled.compChangeId));fixture.overtimeChangeId=id(settled.compChangeId);save();evidence.overtime=true;
  console.log('D3_APPROVED_INCOME_PHASE: actual overtime approved and settled');
  // Reuse the previously verified true hiring/bonus flow. Only prerequisites and
  // its owned temporary account capacity/access use its explicit fixture writes.
  const referralDatabase=statement=>{
    if(/^SELECT\s/.test(statement))return database(statement.replace(/;\s*$/,''));
    const key=fixture.marker+'_referral',encoded=Buffer.from(key).toString('hex');
    const allowed=/^(?:INSERT INTO (?:wf_process_definition|hr_position|hr_recruitment_requisition|hr_comp_component)\b|UPDATE (?:sys_tenant|sys_user|wf_process_definition)\b)/.test(statement);
    assert.ok(allowed,'Unexpected referral fixture write');
    if(!/^UPDATE sys_tenant/.test(statement))assert.ok(statement.includes(encoded)||statement.includes(Buffer.from(key+'_hire').toString('hex'))||statement.includes(Buffer.from(key+'_offer').toString('hex'))||statement.includes(Buffer.from(key+'_bonus').toString('hex')),'Referral write must name its owned fixture');
    if(/^UPDATE sys_tenant/.test(statement))assert.match(statement,/^UPDATE sys_tenant SET user_limit=\d+ WHERE tenant_id=100000 AND user_limit=\d+ AND package_id IS NULL;$/);
    const env={...process.env};delete env.MYSQL_PWD;
    const response=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1','--port='+runtime.state.mysqlPort,'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],{input:statement,encoding:'utf8',windowsHide:true,env,timeout:30000,maxBuffer:16*1024*1024});
    assert.equal(response.status,0,'Owned referral prerequisite write failed');return response.stdout.trim();
  };
  const referralApi=async(actor,url,options={})=>{
    if(!options.file&&!url.endsWith('/resume'))return api(actor,url,options.method||'GET',options.body);
    const response=await sessions[actor].page.evaluate(async supplied=>{
      const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),headers={Authorization:token.startsWith('Bearer ')?token:'Bearer '+token};
      const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
      let body;if(supplied.file){body=new FormData();body.append('file',new File([Uint8Array.from(atob(supplied.file.content),char=>char.charCodeAt(0))],supplied.file.name,{type:supplied.file.type}));}
      const result=await fetch('/api'+supplied.url,{method:supplied.method||'GET',headers,credentials:'same-origin',body}),contentType=result.headers.get('Content-Type')||'';
      return{status:result.status,traceId:result.headers.get('X-Trace-Id'),cacheControl:result.headers.get('Cache-Control'),...(contentType.includes('json')?{body:await result.json()}:{sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await result.arrayBuffer())),value=>value.toString(16).padStart(2,'0')).join('')})};
    },{url,...options});
    runtime.requests.push({actor,path:url,method:options.method||'GET',status:response.status,code:response.body?.code,traceId:response.traceId});return response;
  };
  fixture.referral=await prepareSettlementReferral({admin:'admin',hr:'hr',employee:'employee',leader:'finance',api:referralApi,successful:runtime.success,database:referralDatabase,check,marker:fixture.marker,employeeId:fixture.employeeId,hrPerson:sessions.hr.identity,leaderPerson:sessions.finance.identity,periodId:fixture.periodId,endDate:'2026-10-05'});save();evidence.referral=true;
  console.log('D3_APPROVED_INCOME_PHASE: actual referral hiring and bonus approvals completed');
  const sourceDigest=()=>hash(database('SELECT * FROM hr_comp_change WHERE employee_id='+fixture.employeeId+' ORDER BY id')+database('SELECT * FROM hr_overtime_request WHERE request_id='+fixture.overtimeId));
  const originalSources=sourceDigest();
  const referralRow=()=>rows("SELECT JSON_OBJECT('status',bonus_status,'paid',CAST(bonus_pay_date AS CHAR),'change',CAST(comp_change_id AS CHAR)) FROM hr_employee_referral WHERE referral_id="+fixture.referral.referralId)[0];
  const verify=(slip,label)=>{
    for(const[field,value]of Object.entries({grossTotal:2829459n,taxAmount:282946n,currentTax:282946n,benefitAmount:0n,deductionTotal:282946n,netTotal:2546513n}))check(label+'_'+field,cents(slip[field])===value);
    for(const [type,change,source,field,amount]of [['HR_OVERTIME',fixture.overtimeChangeId,fixture.overtimeId,'overtimeRequestId',6003n],['HR_REFERRAL',fixture.referral.changeId,fixture.referral.referralId,'referralId',123456n]]){
      const included=slip.components.filter(item=>item.sourceBizType===type);check(label+'_'+type,included.length===1&&String(included[0].changeId)===change&&String(included[0][field])===source&&cents(included[0].amount)===amount);
    }
    const basis=slip.components.find(row=>row.type==='PAYROLL_BASIS');check(label+'_fixed_portion',basis&&cents(basis.postedFixedGross)===2700000n);
  };
  verify(await ok('admin',pay+'/slips/preview?'+new URLSearchParams({employeeId:fixture.employeeId,periodId:fixture.periodId,deductUnverified:'false'})),'preview');
  check('preview_keeps_referral_unpaid',referralRow().status==='APPROVED'&&referralRow().paid===null);
  const calculate=async()=>{
    const batch={id:id(await ok('admin',pay+'/batches','POST',{payrollPeriodId:fixture.periodId,employeeIds:[fixture.employeeId],validateAttendanceFlag:0,deductUnverifiedFlag:0}))};fixture.batches.push(batch);save();
    const task={batchId:batch.id,executeNo:await ok('admin',pay+'/batches/'+batch.id+'/calculate','POST',{})};fixture.tasks.push(task);save();await observe(task);check('original_calculation_success',task.terminal==='SUCCESS');
    const detail=await ok('admin',pay+'/batches/'+batch.id);check('only_owned_employee_calculated',detail.batch.status==='CALCULATED'&&detail.employees.length===1&&detail.employees[0].calcStatus==='SUCCESS'&&String(detail.employees[0].employeeId)===fixture.employeeId);
    batch.slipId=id(detail.employees[0].salarySlipId);save();verify(await ok('admin',pay+'/slips/'+batch.slipId),'actual_'+batch.id);return batch;
  };
  const cancelled=await calculate();await ok('admin',pay+'/batches/'+cancelled.id+'/cancel','POST',{});
  check('cancel_keeps_approved_sources',sourceDigest()===originalSources&&referralRow().status==='APPROVED'&&referralRow().paid===null);
  check('cancel_removes_only_owned_salary',database('SELECT deleted FROM hr_salary_slip WHERE id='+cancelled.slipId)==='1');evidence.cancellation=true;
  const published=await calculate();evidence.mixedPayroll=true;
  await ok('admin',pay+'/batches/'+published.id+'/submit','POST',{});
  verify(await ok('employee','/hr/ess/salary-slips/'+published.slipId),'employee_submitted');
  check('submission_keeps_referral_unpaid',referralRow().status==='APPROVED'&&referralRow().paid===null);
  await ok('admin',pay+'/batches/'+published.id+'/pay','POST',{});
  const paid=await ok('admin',pay+'/slips/'+published.slipId);verify(paid,'paid');check('salary_paid',paid.status==='PAID');
  check('actual_salary_posts_referral',referralRow().status==='PAID'&&Boolean(referralRow().paid)&&referralRow().change===fixture.referral.changeId);
  const audits=rows("SELECT after_data FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_REFERRAL' AND business_id="+fixture.referral.referralId+" AND operation_type='BONUS_PAID'");
  check('single_actual_referral_payment_audit',audits.length===1&&String(audits[0].salarySlipId)===published.slipId&&String(audits[0].compChangeId)===fixture.referral.changeId&&cents(audits[0].amount)===123456n);evidence.payment=true;
  const financialDigest=()=>hash(database('SELECT * FROM hr_salary_slip WHERE id='+published.slipId)+database('SELECT * FROM hr_employee_referral WHERE referral_id='+fixture.referral.referralId));
  const originalPaid=financialDigest(),duplicate=await api('admin',pay+'/batches/'+published.id+'/pay','POST',{});
  check('duplicate_salary_rejected',duplicate.status===400&&duplicate.body?.code==='INVALID_PAYROLL_STATE');check('duplicate_keeps_financial_records',financialDigest()===originalPaid);
  check('sources_and_checkins_unchanged',sourceDigest()===originalSources&&hash(database('SELECT * FROM hr_attendance_checkin WHERE employee_id='+fixture.employeeId+' ORDER BY checkin_id'))===fixture.punchDigest);evidence.duplicates=true;
  check('period_expected_five_revisions',Number(database('SELECT version FROM hr_payroll_period WHERE period_id=104'))===fixture.originalPeriodVersion+5);
  fs.writeFileSync(path.join(output,'paid-salary.json'),JSON.stringify(paid,null,2));
  const ui=await sessions.admin.context.newPage();await ui.goto(origin+'/hr/payroll?id='+published.slipId,{waitUntil:'networkidle'});const dialog=ui.getByRole('dialog');await dialog.waitFor();const content=await dialog.innerText();
  check('actual_salary_page_sources',content.includes('28294.59')&&content.includes('25465.13')&&content.includes('60.03')&&content.includes('1234.56'));await ui.screenshot({path:path.join(output,'paid-salary-page.png')});await ui.close();evidence.browser=true;
  console.log('D3_APPROVED_INCOME_PHASE: combined payroll cancellation and actual payment passed');
}catch(error){failure=error;}
finally{
  if(runtime){
    const {database,check}=runtime;
    const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;failure||=error;}save();};
    await restore('batches',async()=>{for(const task of fixture.tasks)await observe(task);for(const batch of fixture.batches){const detail=await ok('admin',pay+'/batches/'+batch.id);assert.notEqual(detail.batch.status,'CALCULATING');if(['DRAFT','CALCULATED','FAILED'].includes(detail.batch.status))await ok('admin',pay+'/batches/'+batch.id+'/cancel','POST',{});check('owned_batch_terminal_'+batch.id,['CANCELLED','PAID','SUBMITTED'].includes((await ok('admin',pay+'/batches/'+batch.id)).batch.status));}});
    await restore('overtimeWorkflow',async()=>{if(fixture.overtimeId){const row=await ok('employee',overtime+'/'+fixture.overtimeId);if(['SUBMITTED','PENDING','APPROVING'].includes(row.status))await ok('employee',overtime+'/'+fixture.overtimeId+'/cancel','POST',{version:row.version,reason:fixture.marker+'-收尾'});if(fixture.overtimeInstance){await until(()=>database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id='+literal(fixture.overtimeInstance)),status=>!['RUNNING','PAUSED','PENDING','FAILED','RESTARTED'].includes(status),'Original overtime workflow remains active');check('original_overtime_terminal',true);}}});
    await restore('binding',async()=>{if(fixture.employeeId){await ok('admin','/hr/employees/'+fixture.employeeId,'PUT',{...employeeBody,userId:null});check('owned_employee_unbound',database('SELECT COUNT(*) FROM hr_employee WHERE id='+fixture.employeeId+' AND user_id IS NULL')==='1');}});
    await restore('syntheticTax',async()=>{if(fixture.slabId)await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'INACTIVE'});});
    await restore('overtimeConfig',async()=>{if(configRestore)await configRestore();});
    await restore('overtimeLimit',async()=>{if(limitChanged){const restored=await publishLimit(fixture.originalLimitRule);for(const[key,value]of Object.entries(fixture.originalLimitRule))check('restored_overtime_limit_'+key,String(restored[key]??'')===String(value??''));}});
    await restore('overtimeType',async()=>{if(typeChanged){let current=await ok('admin',types+'/100');if(current.status!==0)current=await ok('admin',types+'/100/status','POST',{version:current.version,status:0,reason:fixture.marker+'-恢复'});const restored=await ok('admin',types+'/100','PUT',{...fixture.originalTypeBody,version:current.version});for(const[key,value]of Object.entries(fixture.originalTypeBody))if(key!=='version')check('restored_overtime_type_'+key,JSON.stringify(restored[key]??null)===JSON.stringify(value));check('original_type_disabled',restored.status===0);}});
    await restore('overtimeComponent',async()=>{if(componentChanged){const current=(await ok('admin','/hr/compensation/components')).find(value=>String(value.id)==='103');await ok('admin','/hr/compensation/components/103','PUT',{...fixture.originalComponent,version:current.version});const restored=(await ok('admin','/hr/compensation/components')).find(value=>String(value.id)==='103');for(const[key,value]of Object.entries(fixture.originalComponent))if(key!=='version')check('restored_overtime_component_'+key,JSON.stringify(restored[key]??null)===JSON.stringify(value));}});
    await restore('originalBusiness',async()=>{if(originalDigests){const after=preserved();for(const[table,digest]of Object.entries(originalDigests))check('original_'+table+'_preserved',after[table]===digest);check('original_roles_preserved',roles()===originalRoles);evidence.preservation=true;}});
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{check('no_unhandled_browser_errors',runtime.browserErrors.length===0);console.log('D3_APPROVED_INCOME_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,tasks:fixture.tasks.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:failure?String(failure.message).split('\n')[0].slice(0,180):undefined};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));console.log('D3_APPROVED_INCOME_RESULT: '+JSON.stringify({...result,checks:result.checks.length}));if(!result.passed)process.exitCode=1;
}
