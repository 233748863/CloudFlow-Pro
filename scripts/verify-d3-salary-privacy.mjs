import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { authenticateD2PrivacyAccount } from './runtime-checks/d2-privacy-browser-auth.mjs';

const root = 'D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d3-salary-privacy'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d3-salary-privacy-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
assert.ok(process.argv.includes('--source-deduction-round'));
const sourceRound = process.argv[process.argv.indexOf('--source-deduction-round') + 1];
assert.match(sourceRound || '', /^r[1-9][0-9]*$/);
const sourceFolder = 'd3-payroll-deductions-20261006-' + sourceRound;
const prior = read(path.join(path.dirname(output), sourceFolder, 'fixture.json'));
const priorResult = read(path.join(path.dirname(output), sourceFolder, 'result.json'));
for (const flag of ['passed', 'approval', 'attendance', 'deductions', 'mixedBatch', 'snapshot', 'preservation', 'restoration', 'secrets']) assert.equal(priorResult[flag], true);
assert.match(prior.marker, /^D3D-[a-f0-9]{12}$/);
assert.match(prior.month, /^\d{4}-\d{2}$/);
const preparation = read(path.join(path.dirname(output), 'd3-salary-privacy-preparation-20261006-r1/result.json'));
assert.equal(preparation.passed,true);assert.equal(preparation.exactGrants,true);assert.equal(preparation.jobRecovered,true);
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const hash = value => createHash('sha256').update(value).digest('hex');
const literal = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
const fixture = { marker: 'D3P-' + randomUUID().replaceAll('-', '').slice(0,12), source: sourceFolder, targets: {}, bindings: [], slabs: [], batches: [], jobs: [], tasks: [], matrix: [], audits: [], restorations: {}, screenshots: [] };
const save = () => fs.writeFileSync(path.join(output,'fixture.json'), JSON.stringify(fixture,null,2));
save();
const runtime = await createD1LeaveRuntime(root,output);
const { check, checks, requests, rows, database, sessions, sensitive, browserErrors } = runtime;
const browser = sessions.admin.context.browser(), origin = new URL(sessions.admin.page.url()).origin;
const pay = '/hr/compensation/payroll', ess = '/hr/ess/salary-slips';
const evidence = { scope:false, tenant:false, unpublished:false, downloads:false, confirmation:false, audits:false, preservation:false, restoration:false, secrets:false };
const main = fixture.targets.main = { id:id(prior.slipId), employeeId:id(prior.employees[0].id), deptId:id(prior.deptId), batchId:id(prior.batchId), tenant:'100000', net:'2371.74', actor:'employee' };
const peerEmployeeId = id(prior.employees[1].id);
fixture.targets.hrDepartment = { id:'98209280378', employeeId:'98209280500', deptId:'100', batchId:'125', tenant:'100000', net:'2683.45' };
const writeTimes = new Map();
const interval = Math.max(5000, Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.common.repeatSubmit.intervalMillis'"))) + 150;
assert.ok(Number.isFinite(interval) && interval <= 60150);
async function api(actor,url,method='GET',body) {
  assert.match(url,/^(?:\/hr\/(?:employees|compensation|ess\/salary-slips)(?:\/|\?|$)|\/auth\/system\/job(?:\/\d+)?$)/);
  if(url.startsWith('/auth/system/job')) {
    assert.equal(actor,'foreign');
    assert.ok(method==='POST'&&url==='/auth/system/job'&&body.jobName===fixture.marker&&body.handlerName==='hrPayrollBatchCalculate'&&body.status==='PAUSED' || method==='DELETE'&&fixture.jobs.some(job=>url==='/auth/system/job/'+job.id));
  }
  const key = hash(JSON.stringify([actor,url,method,body??null]));
  if(method!=='GET'){const wait=(writeTimes.get(key)||0)+interval-Date.now();if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));}
  try {
    const response = await sessions[actor].page.evaluate(async supplied=>{
      const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),headers={};
      if(token)headers.Authorization=token.startsWith('Bearer ')?token:'Bearer '+token;
      const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));
      if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
      if(supplied.body!==undefined)headers['Content-Type']='application/json';
      const response=await fetch('/api'+supplied.url,{method:supplied.method,credentials:'same-origin',headers,...(supplied.body===undefined?{}:{body:JSON.stringify(supplied.body)})});
      const type=response.headers.get('Content-Type')||'';
      return {status:response.status,traceId:response.headers.get('X-Trace-Id'),type,body:type.includes('json')?await response.json():null,
        bytes:type.includes('application/pdf')?Array.from(new Uint8Array(await response.arrayBuffer())):null};
    },{url,method,body});
    requests.push({actor,path:url,method,status:response.status,code:response.body?.code,traceId:response.traceId});return response;
  }finally{if(method!=='GET')writeTimes.set(key,Date.now());}
}
const ok=async(actor,url,method='GET',body)=>runtime.success(await api(actor,url,method,body),actor+'_'+method+'_'+url.split('?')[0]);
const stage=name=>{fixture.stage=name;save();console.log('D3_PRIVACY_PHASE: '+name);};
const auditCount=(actor,domain,businessId,operation)=>Number(database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=${id(sessions[actor].identity.tenantId)} AND operator_id=${id(sessions[actor].identity.userId)} AND business_domain=${literal(domain)} AND business_id ${businessId?'='+literal(businessId):'IS NULL'} AND operation_type=${literal(operation)}`));
async function audited(actor,domain,businessId,operation,action){
  const before=auditCount(actor,domain,businessId,operation),value=await action(),after=auditCount(actor,domain,businessId,operation);
  check('audit_'+actor+'_'+operation+'_'+(businessId||'list'),after===before+1);
  fixture.audits.push({actor,domain,businessId,operation,added:after-before});save();return value;
}
async function identity(actor,username,tenant){
  const account=read(path.join(runtime.run,'private/accounts.json')).find(value=>value.username===username);assert.ok(account);sensitive.add(account.password);
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',()=>browserErrors.push(actor));await page.goto(origin,{waitUntil:'domcontentloaded'});
  const who=await authenticateD2PrivacyAccount(page,account,origin);check('real_login_'+actor,who.authenticated&&who.tenantId===tenant);
  const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());sensitive.add(token);sensitive.add(token.replace(/^Bearer /,''));
  sessions[actor]={context,page,identity:who};
}
const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_tax_profile','id'],['hr_tax_deduction','id'],
  ['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],
  ['hr_attendance_record','id'],['hr_attendance_monthly','id'],['hr_time_request','id']];
const excluded={hr_employee:[main.employeeId,peerEmployeeId],hr_tax_slab:[id(prior.slabId)],hr_payroll_period:[id(prior.periodId)],hr_salary_slip:[main.id]};
const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`)]));
function preserved(){
  return Object.fromEntries(tables.map(([table,key])=>{
    const digest=createHash('sha256');let cursor='0';
    const omit=excluded[table]?.length?` AND ${key} NOT IN (${excluded[table].join(',')})`:'';
    for(;;){
      const end=database(`SELECT COALESCE(MAX(${key}),0) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${bounds[table]} ORDER BY ${key} LIMIT 1000) selected`);
      if(end==='0')break;
      digest.update(database(`SELECT * FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${end}${omit} ORDER BY ${key}`));cursor=end;
    }return [table,digest.digest('hex')];
  }));
}
const protectedSpec=[
  ['hr_employee',main.employeeId,['user_id','update_time','update_by']],['hr_employee',peerEmployeeId,['user_id','update_time','update_by']],
  ['hr_tax_slab',id(prior.slabId),['status','version','update_time','update_by']],['hr_payroll_period',id(prior.periodId),['status','version','update_time','update_by']],
  ['hr_salary_slip',main.id,['employee_confirmed','confirmed_time','update_time']]];
let protectedColumns=[];
function captureOriginal(){
protectedColumns=protectedSpec.map(([table,selected,allowed])=>{
  const columns=database(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cloud_flow_db' AND TABLE_NAME=${literal(table)} ORDER BY ORDINAL_POSITION`).split(/\r?\n/).filter(column=>!allowed.includes(column));
  assert.ok(columns.every(column=>/^[a-z_][a-z0-9_]*$/.test(column)));return {table,selected,columns,allowed};
});
fixture.bounds=bounds;fixture.originalDigest=preserved();fixture.protectedDigest=protectedRows();fixture.originalRoles=roles();fixture.allowedChanges=protectedColumns.map(({table,selected,allowed})=>({table,selected,allowed}));save();
}
const protectedRows=()=>Object.fromEntries(protectedColumns.map(({table,selected,columns})=>[table+':'+selected,hash(database(`SELECT ${columns.map(column=>'`'+column+'`').join(',')} FROM ${table} WHERE ${tables.find(value=>value[0]===table)[1]}=${selected}`))]));
const roles=()=>hash(database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id')+database('SELECT * FROM sys_user_role ORDER BY tenant_id,user_id,role_id'));
async function bind(actor,employee,owner='admin'){
  const user=id(sessions[actor].identity.userId),tenant=id(sessions[actor].identity.tenantId);
  check(actor+'_initially_unbound',database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${tenant} AND user_id=${user} AND deleted=0`)==='0');
  check(actor+'_employee_initially_unbound',database(`SELECT user_id IS NULL FROM hr_employee WHERE tenant_id=${tenant} AND id=${employee.id}`)==='1');
  const binding={actor,owner,tenant,employee,user,changed:false};fixture.bindings.push(binding);save();
  await ok(owner,'/hr/employees/'+employee.id,'PUT',{...employee.body,userId:user});binding.changed=true;save();
  check(actor+'_real_employee_binding',database(`SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE tenant_id=${tenant} AND id=${employee.id}`)===user);
}
async function observe(task){
  if(task.terminal)return;
  for(let attempt=0;;attempt++){
    const status=await ok(task.actor,pay+'/tasks/'+encodeURIComponent(task.executeNo));
    if(['SUCCESS','FAILED','TIMEOUT'].includes(status.executeStatus)){task.terminal=status.executeStatus;task.affectedRows=Number(status.affectedRows);save();return;}
    if(attempt>0&&attempt%40===0)console.log('D3_PRIVACY_PHASE: observing_original_task');
    await new Promise(resolve=>setTimeout(resolve,750));
  }
}
async function generate(actor,employeeId,periodId,target){
  const batch={actor,id:id(await ok(actor,pay+'/batches','POST',{payrollPeriodId:periodId,employeeIds:[employeeId],validateAttendanceFlag:0,deductUnverifiedFlag:0}))};
  fixture.batches.push(batch);target.batchId=batch.id;save();
  const task={actor,batchId:batch.id,executeNo:await ok(actor,pay+'/batches/'+batch.id+'/calculate','POST',{})};fixture.tasks.push(task);save();await observe(task);
  const result=await ok(actor,pay+'/batches/'+batch.id);
  task.businessResult={status:result.batch.status,employees:result.employees.map(employee=>({employeeId:String(employee.employeeId),calcStatus:employee.calcStatus,errorMessage:employee.errorMessage}))};save();
  check(actor+'_actual_salary_task_complete',task.terminal==='SUCCESS'&&task.affectedRows===1);
  check(actor+'_actual_salary_generated',result.batch.status==='CALCULATED'&&result.employees.length===1&&result.employees[0].calcStatus==='SUCCESS');
  target.id=id(result.employees[0].salarySlipId);save();
}
async function deny(actor,url,target,method='GET',allowedStatuses=[401,403,404]){
  const response=await api(actor,url,method,method==='GET'?undefined:{});
  check('denied_'+actor+'_'+method+'_'+url.split('?')[0],allowedStatuses.includes(response.status)&&response.body?.code!==200&&!response.bytes);
  const payload=JSON.stringify(response.body);
  check('no_salary_disclosure_'+actor+'_'+url.split('?')[0],!payload.includes(target.net)&&!payload.includes('"components"')&&!payload.includes('"grossTotal"'));
  fixture.matrix.push({actor,path:url,method,allowed:false,status:response.status,code:response.body?.code});save();
}
async function detail(actor,target,self,allow){
  const url=(self?ess:pay+'/slips')+'/'+target.id;
  if(!allow){await deny(actor,url,target);await deny(actor,url+'/pdf',target);return;}
  const value=await audited(actor,'SALARY_SLIP',target.id,self?'READ_MINE':'READ_HR',()=>ok(actor,url));
  check('authorized_detail_'+actor+'_'+target.id,String(value.employeeId)===target.employeeId&&Number(value.netTotal).toFixed(2)===target.net&& (self||String(value.tenantId)===target.tenant));
  const pdf=await audited(actor,'SALARY_SLIP',target.id,self?'READ_MINE':'READ_HR',()=>audited(actor,'SALARY_SLIP',target.id,'EXPORT_PDF',()=>api(actor,url+'/pdf')));
  check('authorized_pdf_'+actor+'_'+target.id,pdf.status===200&&pdf.type.includes('application/pdf')&&Buffer.from(pdf.bytes||[]).subarray(0,5).toString()==='%PDF-');
  fs.writeFileSync(path.join(output,actor+(self?'-self-':'-management-')+target.id+'.pdf'),Buffer.from(pdf.bytes));
  fixture.matrix.push({actor,path:url,allowed:true,status:200},{actor,path:url+'/pdf',allowed:true,status:200});save();
}
async function mine(actor,target,suffix=''){
  const result=await audited(actor,'SALARY_SLIP',null,'READ_MINE',()=>ok(actor,ess+'?pageNum=1&pageSize=100'+suffix));
  check('self_list_only_own_'+actor+'_'+suffix,Number(result.total)===1&&result.rows.length===1&&result.rows.every(row=>String(row.id)===target.id&&String(row.employeeId)===target.employeeId));return result;
}
let failure,page;
try{
  captureOriginal();
  await identity('manager','g_holiday_manager','100000');await identity('foreign','g_import_tenant','100001');
  fixture.originalJobConfigDigest=hash(database("SELECT job_id,tenant_id,job_name,service_name,handler_name,handler_param,status FROM sys_job WHERE deleted=0 ORDER BY job_id"));save();
  check('foreign_generic_payroll_task_not_preconfigured',database("SELECT COUNT(*) FROM sys_job WHERE tenant_id=100001 AND deleted=0 AND service_name IN ('hr','cloudflow-service-hr') AND handler_name='hrPayrollBatchCalculate' AND (handler_param IS NULL OR handler_param='')")==='0');
  await ok('foreign','/auth/system/job','POST',{jobName:fixture.marker,jobGroup:'HR',serviceName:'hr',handlerName:'hrPayrollBatchCalculate',handlerParam:null,triggerType:'CRON',cronExpression:'0 0 0 1 1 ?',status:'PAUSED',concurrentFlag:1,misfireStrategy:'IGNORE',retryCount:0,dispatchRetryCount:0,timeoutSeconds:3600,lockTimeSeconds:3600,criticalFlag:0,logSuccessFlag:1,alarmOnFailFlag:0,remark:'自有工资权限验证临时配置，保持暂停'});
  fixture.jobs.push({id:id(database(`SELECT job_id FROM sys_job WHERE tenant_id=100001 AND job_name=${literal(fixture.marker)} AND handler_name='hrPayrollBatchCalculate' AND deleted=0`))});save();
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const anonymous=await context.newPage();await anonymous.goto(origin,{waitUntil:'domcontentloaded'});sessions.anonymous={context,page:anonymous};
  check('paid_unconfirmed_original_sample',database(`SELECT COUNT(*) FROM hr_salary_slip WHERE id=${main.id} AND status='PAID' AND employee_confirmed=0 AND net_total=2371.74`)==='1');
  check('hr_same_department_reference',database(`SELECT COUNT(*) FROM hr_employee e JOIN sys_user u ON u.dept_id=e.dept_id AND u.tenant_id=e.tenant_id WHERE e.id=98209280500 AND e.dept_id=100 AND u.user_id=${id(sessions.hr.identity.userId)}`)==='1');
  await bind('employee',prior.employees[0]);await bind('manager',prior.employees[1]);
  check('coworkers_share_employee_department',database(`SELECT COUNT(DISTINCT dept_id) FROM hr_employee WHERE id IN (${main.employeeId},${peerEmployeeId})`)==='1');
  const tax=(await ok('admin',pay+'/config/tax-slabs')).find(value=>String(value.slabId)===String(prior.slabId));check('owned_original_tax_table_inactive',tax?.status==='INACTIVE');
  const taxFields=['slabName','region','effectiveFrom','effectiveTo','thresholdAmount','status','remark'];
  const slab={actor:'admin',id:id(prior.slabId),body:Object.fromEntries(taxFields.map(key=>[key,tax[key]??null]))};fixture.slabs.push(slab);save();
  await ok('admin',pay+'/tax-slabs/'+slab.id,'PUT',{...slab.body,status:'ACTIVE'});
  const peer=fixture.targets.peer={employeeId:peerEmployeeId,deptId:main.deptId,tenant:'100000',actor:'manager',net:'2700.27'};
  const existingPeer=rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'batchId',CAST(batch_id AS CHAR),'status',status) FROM hr_salary_slip WHERE employee_id=${peerEmployeeId} AND tenant_id=100000 AND deleted=0`);
  if(existingPeer.length){
    check('one_prior_peer_salary',existingPeer.length===1&&existingPeer[0].status==='PAID');
    const ownPrior=fs.readdirSync(path.dirname(output)).filter(name=>/^d3-salary-privacy-20261006-r[1-9][0-9]*$/.test(name)&&name!==path.basename(output))
      .filter(name=>fs.existsSync(path.join(path.dirname(output),name,'fixture.json'))).map(name=>read(path.join(path.dirname(output),name,'fixture.json')));
    check('reused_peer_salary_owned_by_previous_privacy_run',ownPrior.some(value=>value.targets?.peer?.id===existingPeer[0].id&&value.targets.peer.employeeId===peerEmployeeId));
    Object.assign(peer,existingPeer[0]);fixture.reusedPeer=true;save();
  }else{
    await generate('admin',peerEmployeeId,id(prior.periodId),peer);
    const draft=await audited('manager','SALARY_SLIP',null,'READ_MINE',()=>ok('manager',ess));check('draft_salary_absent_from_self_list',Number(draft.total)===0);
    await deny('manager',ess+'/'+peer.id,peer);await deny('manager',ess+'/'+peer.id+'/pdf',peer);
    await ok('admin',pay+'/batches/'+peer.batchId+'/submit','POST',{});await detail('manager',peer,true,true);await ok('admin',pay+'/batches/'+peer.batchId+'/pay','POST',{});
  }
  const foreignDept=id(preparation.deptId);
  check('owned_foreign_calendar_assignment',database(`SELECT COUNT(*) FROM sys_dept WHERE tenant_id=100001 AND dept_id=${foreignDept} AND holiday_calendar_id=${id(preparation.calendarId)} AND deleted=0`)==='1');
  const employeeBody={employeeNo:fixture.marker,name:fixture.marker,gender:'UNKNOWN',deptId:foreignDept,employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2026-01-01'};
  const foreignEmployee={id:id(await ok('foreign','/hr/employees','POST',employeeBody)),body:employeeBody};fixture.foreignEmployee=foreignEmployee;save();await bind('foreign',foreignEmployee,'foreign');
  const foreignPeriods=await ok('foreign',pay+'/config/periods');
  const month=['2026-06','2026-04','2026-03','2026-09','2026-11','2026-05','2026-07','2026-08'].find(value=>!foreignPeriods.some(period=>period.startDate<=value+'-30'&&period.endDate>=value+'-01'));check('foreign_owned_period_available',Boolean(month));
  const monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
  fixture.foreignPeriod=id(await ok('foreign',pay+'/periods','POST',{periodName:fixture.marker,frequency:'MONTHLY',startDate:month+'-01',endDate:monthEnd,payDate:monthEnd}));save();
  const componentId=id(await ok('foreign','/hr/compensation/components','POST',{componentCode:fixture.marker,componentName:fixture.marker,componentType:'FIXED',category:'EARNING',taxable:1,status:1,sortOrder:999}));
  const structureId=id(await ok('foreign','/hr/compensation/structures','POST',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{}}));
  await ok('foreign',pay+'/structures/'+structureId,'PUT',{salaryBasis:'MONTHLY',prorationBasis:'CALENDAR_DAYS',benefitTiming:'FIRST_PAYROLL'});
  const foreignSlabBody={slabName:fixture.marker,region:'隔离测试',effectiveFrom:month+'-01',effectiveTo:monthEnd,thresholdAmount:'0.00',status:'DRAFT',remark:'合成10%税率，仅验证工资权限'};
  const foreignSlab={actor:'foreign',id:id(await ok('foreign',pay+'/tax-slabs','POST',foreignSlabBody)),body:{...foreignSlabBody,status:'INACTIVE'}};fixture.slabs.push(foreignSlab);save();
  await ok('foreign',pay+'/tax-slabs/'+foreignSlab.id+'/details','PUT',Array.from({length:7},(_,index)=>({levelNo:index+1,fromAmount:String(index*10000),toAmount:index===6?null:String((index+1)*10000),taxRate:'0.1000',quickDeduction:'0.00'})));
  await ok('foreign',pay+'/tax-slabs/'+foreignSlab.id,'PUT',{...foreignSlabBody,status:'ACTIVE'});
  await ok('foreign','/hr/compensation/employee-compensations','POST',{employeeId:foreignEmployee.id,structureId,componentValues:{[componentId]:'4000.40'},totalSalary:'4000.40',effectiveDate:month+'-01',status:'ACTIVE'});
  await ok('foreign','/hr/compensation/tax-profiles','POST',{employeeId:foreignEmployee.id,taxSlabId:foreignSlab.id,taxResidenceCity:'隔离测试',status:'ACTIVE'});
  const foreign=fixture.targets.foreign={employeeId:foreignEmployee.id,deptId:foreignDept,tenant:'100001',actor:'foreign',net:'3600.36'};
  await generate('foreign',foreignEmployee.id,fixture.foreignPeriod,foreign);
  const foreignDraft=await audited('foreign','SALARY_SLIP',null,'READ_MINE',()=>ok('foreign',ess));check('foreign_draft_absent_from_self_list',Number(foreignDraft.total)===0);
  await deny('foreign',ess+'/'+foreign.id,foreign);await deny('foreign',ess+'/'+foreign.id+'/pdf',foreign);
  await deny('foreign',ess+'/'+foreign.id+'/confirm',foreign,'POST',[400]);
  await ok('foreign',pay+'/batches/'+foreign.batchId+'/submit','POST',{});await ok('foreign',pay+'/batches/'+foreign.batchId+'/pay','POST',{});
  evidence.unpublished=true;stage('owned_peer_and_foreign_salaries_paid');
  const salaryDigestBeforeReads=hash(database('SELECT * FROM hr_salary_slip ORDER BY id'));
  for(const actor of ['admin','hr','employee','manager','foreign','anonymous'])for(const[name,target]of Object.entries(fixture.targets)){
    const allowed=actor==='admin'&&target.tenant==='100000'||actor==='hr'&&name==='hrDepartment'||actor==='foreign'&&name==='foreign';
    await detail(actor,target,false,allowed);
    if(['employee','manager','foreign','anonymous'].includes(actor))await detail(actor,target,true,actor===target.actor);
  }
  for(const[actor,target]of [['employee',main],['manager',peer],['foreign',foreign]]){
    await mine(actor,target);
    for(const other of Object.values(fixture.targets).filter(value=>value.id!==target.id))await mine(actor,target,'&employeeId='+other.employeeId+'&tenantId='+other.tenant);
    for(const other of Object.values(fixture.targets).filter(value=>value.id!==target.id))await deny(actor,ess+'/'+other.id+'/confirm',other,'POST');
  }
  for(const actor of ['admin','hr','foreign']){
    const batches=await audited(actor,'PAYROLL_BATCH',null,'READ_LIST',()=>ok(actor,pay+'/batches'));
    const expected=actor==='foreign'?[foreign.batchId]:actor==='hr'?[fixture.targets.hrDepartment.batchId]:[main.batchId,peer.batchId,fixture.targets.hrDepartment.batchId];
    for(const target of Object.values(fixture.targets)){
      const allowed=expected.includes(target.batchId);check('batch_list_scope_'+actor+'_'+target.batchId,batches.some(batch=>String(batch.batchId)===target.batchId)===allowed);
      if(allowed)await audited(actor,'PAYROLL_BATCH',target.batchId,'READ_DETAIL',()=>ok(actor,pay+'/batches/'+target.batchId));
      else await deny(actor,pay+'/batches/'+target.batchId,target);
    }
  }
  for(const actor of ['employee','manager','anonymous'])await deny(actor,pay+'/batches',main);
  await deny('anonymous',ess,main);
  check('all_salary_rows_unchanged_by_reads_and_denied_writes',hash(database('SELECT * FROM hr_salary_slip ORDER BY id'))===salaryDigestBeforeReads);
  evidence.scope=true;evidence.tenant=true;evidence.downloads=true;evidence.audits=true;stage('all_role_tenant_reads_and_confirm_denials');
  page=await sessions.employee.context.newPage();page.on('pageerror',()=>browserErrors.push('employee-ui'));page.setDefaultTimeout(30000);
  await page.goto(new URL('/hr/ess/slips',origin).href,{waitUntil:'domcontentloaded'});
  const row=page.locator('table tbody tr').filter({hasText:prior.month});await row.getByRole('button',{name:'查看工资单',exact:true}).click();
  const dialog=page.getByRole('dialog').filter({hasText:'工资单 '+prior.month});await dialog.waitFor();
  check('self_salary_page_money_correct',(await dialog.innerText()).includes('2371.74'));
  await page.screenshot({path:path.join(output,'self-before-confirm.png')});fixture.screenshots.push('self-before-confirm.png');save();
  const confirmButton=dialog.getByRole('button',{name:'确认收悉',exact:true});
  fixture.confirmButtonCount=await confirmButton.count();fixture.employeeConfirmPermission=sessions.employee.identity.permissions.includes('hr:ess:slip:confirm');save();
  if(fixture.confirmButtonCount!==1){
    const response=await api('employee',ess+'/'+main.id+'/confirm','POST',{});fixture.unavailableConfirmStatus=response.status;fixture.unavailableConfirmCode=response.body?.code;save();
    check('employee_self_confirm_button_available',false);
  }
  const confirmationBefore=auditCount('employee','SALARY_SLIP',main.id,'EMPLOYEE_CONFIRM');
  await confirmButton.click();await dialog.waitFor({state:'hidden'});await row.getByText('已确认',{exact:true}).waitFor();
  check('employee_confirmed_only_receipt',database(`SELECT COUNT(*) FROM hr_salary_slip WHERE id=${main.id} AND employee_confirmed=1 AND confirmed_time IS NOT NULL AND status='PAID' AND net_total=2371.74`)==='1');
  check('employee_confirmation_audit_once',auditCount('employee','SALARY_SLIP',main.id,'EMPLOYEE_CONFIRM')===confirmationBefore+1);
  await page.screenshot({path:path.join(output,'self-confirmed.png')});fixture.screenshots.push('self-confirmed.png');save();
  await row.getByRole('button',{name:'查看工资单',exact:true}).click();await dialog.waitFor();
  check('confirmed_receipt_button_absent_on_reopen',await dialog.getByRole('button',{name:'确认收悉',exact:true}).count()===0);
  const download=page.waitForEvent('download').then(value=>({value}),error=>({error}));
  await dialog.getByRole('button',{name:'下载 PDF',exact:true}).click();const downloaded=await download;if(downloaded.error)throw downloaded.error;
  await downloaded.value.saveAs(path.join(output,'self-confirmed-ui.pdf'));
  check('confirmed_self_actual_page_download',(await downloaded.value.failure())===null&&fs.readFileSync(path.join(output,'self-confirmed-ui.pdf')).subarray(0,5).toString()==='%PDF-');
  evidence.confirmation=true;stage('employee_receipt_and_page_download');
}catch(error){failure=error;}
finally{
  const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;fixture.restorationFailures||={};fixture.restorationFailures[name]=String(error.message).split('\n')[0].slice(0,240);failure||=error;}save();};
  await restore('originalTasks',async()=>{for(const task of fixture.tasks)await observe(task);});
  await restore('ownedBatches',async()=>{for(const batch of fixture.batches){
    const state=(await ok(batch.actor,pay+'/batches/'+batch.id)).batch.status;
    if(state==='SUBMITTED')await ok(batch.actor,pay+'/batches/'+batch.id+'/pay','POST',{});
    else if(['DRAFT','CALCULATED','FAILED'].includes(state))await ok(batch.actor,pay+'/batches/'+batch.id+'/cancel','POST',{});
    check('owned_batch_terminal_'+batch.id,['PAID','CANCELLED'].includes((await ok(batch.actor,pay+'/batches/'+batch.id)).batch.status));
  }});
  await restore('bindings',async()=>{for(const binding of fixture.bindings){
    if(!binding.changed)continue;
    check('only_owned_binding_restored_'+binding.actor,database(`SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE tenant_id=${binding.tenant} AND id=${binding.employee.id}`)===binding.user);
    await ok(binding.owner,'/hr/employees/'+binding.employee.id,'PUT',{...binding.employee.body,userId:null});
    check('account_unbound_'+binding.actor,database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${binding.tenant} AND user_id=${binding.user} AND deleted=0`)==='0');
  }});
  await restore('syntheticTax',async()=>{for(const slab of fixture.slabs){
    await ok(slab.actor,pay+'/tax-slabs/'+slab.id,'PUT',slab.body);check('synthetic_tax_inactive_'+slab.id,database(`SELECT status FROM hr_tax_slab WHERE slab_id=${slab.id}`)==='INACTIVE');
  }});
  await restore('ownedJobConfiguration',async()=>{
    for(const job of fixture.jobs){
      check('only_owned_job_removed_'+job.id,database(`SELECT COUNT(*) FROM sys_job WHERE job_id=${job.id} AND tenant_id=100001 AND job_name=${literal(fixture.marker)} AND status='PAUSED' AND deleted=0`)==='1');
      await ok('foreign','/auth/system/job/'+job.id,'DELETE');
      check('owned_job_removed_'+job.id,database(`SELECT deleted FROM sys_job WHERE job_id=${job.id}`)==='1');
    }
    if(fixture.originalJobConfigDigest)check('original_job_configuration_preserved',hash(database("SELECT job_id,tenant_id,job_name,service_name,handler_name,handler_param,status FROM sys_job WHERE deleted=0 ORDER BY job_id"))===fixture.originalJobConfigDigest);
  });
  evidence.restoration=Object.values(fixture.restorations).every(Boolean);
  try{
    const final=preserved();for(const[table]of tables)check('original_'+table+'_rows_preserved',final[table]===fixture.originalDigest[table]);
    const protectedFinal=protectedRows();for(const[key,value]of Object.entries(fixture.protectedDigest))check('allowed_fields_only_'+key,protectedFinal[key]===value);
    check('all_role_grants_unchanged',roles()===fixture.originalRoles);check('original_period_open',database(`SELECT status FROM hr_payroll_period WHERE period_id=${id(prior.periodId)}`)==='OPEN');
    check('browser_has_no_unhandled_errors',browserErrors.length===0);evidence.preservation=true;
  }catch(error){failure||=error;}
  try{console.log('D3_PRIVACY_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
  await runtime.close();save();let message=failure?String(failure.message).split('\n')[0].slice(0,240):undefined;
  if(message)for(const value of sensitive)if(value)message=message.split(value).join('[REDACTED]');
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(requests,null,2));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks,requests:requests.length,tasks:fixture.tasks.length,matrix:fixture.matrix.length,auditedOperations:fixture.audits.length,deniedQueryAuditVerified:false,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:message},null,2));
  console.log('D3_PRIVACY_SUMMARY: checks='+checks.length+'; requests='+requests.length+'; matrix='+fixture.matrix.length+'; tasks='+fixture.tasks.length+'; preservation='+evidence.preservation+'; restoration='+evidence.restoration);
  if(failure){console.log('D3_PRIVACY_FAILURE: '+message);process.exitCode=1;}
}
