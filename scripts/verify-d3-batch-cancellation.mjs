import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';
import {authenticateD2PrivacyAccount} from './runtime-checks/d2-privacy-browser-auth.mjs';
import {authenticateFormTest} from './runtime-checks/form-browser-auth.mjs';

const root='D:/CloudFlowPro',pay='/hr/compensation/payroll';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-batch-cancellation'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-batch-cancellation-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const previous=path.join(path.dirname(output),'d3-salary-privacy-20261006-r5');
assert.equal(read(path.join(previous,'result.json')).passed,true);
const targets=read(path.join(previous,'fixture.json')).targets;
assert.equal(targets.hrDepartment.employeeId,'98209280500');
assert.equal(targets.peer.employeeId,'98209282286');
assert.equal(targets.foreign.employeeId,'98209282289');
const id=value=>{const result=String(value);assert.match(result,/^[1-9][0-9]*$/);return result;};
const hash=value=>createHash('sha256').update(value).digest('hex');
const fixture={marker:'D3C-'+randomUUID().replaceAll('-','').slice(0,12),periods:[],batches:[],matrix:[],audits:[],restorations:{},identities:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={roles:false,scope:false,tenant:false,anonymous:false,atomicDenial:false,exactCancellation:false,audits:false,preservation:false,restoration:false,secrets:false};
let runtime,failure,original,preserved,ok,api;
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {check,database,sessions}=runtime;
  const origin=new URL(sessions.admin.page.url()).origin,browser=sessions.admin.context.browser();
  const accounts=read(path.join(runtime.run,'private/accounts.json'));
  const identity=async(actor,account,tenant,auth)=>{
    runtime.sensitive.add(account.password);
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',()=>runtime.browserErrors.push(actor));
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    const who=await auth(page,account,origin);check('real_login_'+actor,who.authenticated&&who.tenantId===tenant);
    const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());runtime.sensitive.add(token);runtime.sensitive.add(token.replace(/^Bearer /,''));
    sessions[actor]={context,page,identity:who};
  };
  await identity('manager',accounts.find(account=>account.username==='g_holiday_manager'),'100000',authenticateD2PrivacyAccount);
  await identity('foreign',accounts.find(account=>account.username==='g_import_tenant'),'100001',authenticateD2PrivacyAccount);
  const financeName='h2adv_finance_870861120861';
  check('owned_finance_identity',database("SELECT COUNT(*) FROM sys_user u JOIN sys_user e ON e.user_name='g_holiday_employee' AND e.tenant_id=u.tenant_id JOIN sys_user_role ur ON ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE u.user_id=990001030 AND u.user_name='h2adv_finance_870861120861' AND u.create_by='advance-payroll-fixture' AND u.status='0' AND u.deleted=0 AND u.pwd_reset_required='0' AND u.password=e.password AND r.role_key='finance'")==='1');
  console.log('D3_CANCEL_AUTH_WINDOW_WAIT: seconds=61; counter_writes=0');await delay(30000);await delay(31000);
  await identity('finance',{...accounts.find(account=>account.username==='g_holiday_employee'),username:financeName},'100000',authenticateFormTest);
  const anonymousContext=await browser.newContext();
  await anonymousContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const anonymousPage=await anonymousContext.newPage();await anonymousPage.goto(origin,{waitUntil:'domcontentloaded'});
  sessions.anonymous={context:anonymousContext,page:anonymousPage};
  for(const actor of ['admin','hr','finance','manager','employee','foreign']){
    const who=sessions[actor].identity,permitted=who.permissions.includes('hr:payroll:cancel')||who.permissions.includes('*:*:*');
    fixture.identities[actor]={userId:who.userId,tenantId:who.tenantId,cancelPermission:permitted};
    check('expected_cancel_permission_'+actor,permitted===['admin','hr','finance','foreign'].includes(actor));
  }save();
  const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_comp_change','id'],['hr_tax_profile','id'],['hr_tax_deduction','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id']];
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries([...tables.map(([table,key])=>{
    const digest=createHash('sha256');let cursor='0';
    for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 500) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}
    return[table,digest.digest('hex')];
  }),['roles',hash(database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id')+database('SELECT * FROM sys_user_role ORDER BY tenant_id,user_id,role_id'))]]);
  original=preserved();fixture.original=original;fixture.bounds=bounds;save();
  const configured=Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.common.repeatSubmit.intervalMillis'"));assert.ok(Number.isSafeInteger(configured)&&configured>=0&&configured<=60000);
  const interval=Math.max(5000,configured)+150,times=new Map();
  api=async(actor,url,method='GET',body)=>{
    assert.match(url,/^\/hr\/compensation\/payroll(?:\/|\?|$)/);
    const key=hash(JSON.stringify([actor,url,method,body??null]));
    if(method!=='GET'){const wait=(times.get(key)||0)+interval-Date.now();if(wait>0)await delay(wait);}
    try{
      const response=await sessions[actor].page.evaluate(async supplied=>{
        const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),headers={};
        if(token)headers.Authorization=token.startsWith('Bearer ')?token:'Bearer '+token;
        const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice(11));
        if(supplied.body!==undefined)headers['Content-Type']='application/json';
        const response=await fetch('/api'+supplied.url,{method:supplied.method,headers,credentials:'same-origin',...(supplied.body===undefined?{}:{body:JSON.stringify(supplied.body)})});
        return {status:response.status,traceId:response.headers.get('X-Trace-Id'),body:(response.headers.get('Content-Type')||'').includes('json')?await response.json():null};
      },{url,method,body});
      runtime.requests.push({actor,path:url,method,status:response.status,code:response.body?.code,traceId:response.traceId});return response;
    }finally{if(method!=='GET')times.set(key,Date.now());}
  };
  ok=async(actor,url,method='GET',body)=>runtime.success(await api(actor,url,method,body),actor+'_'+method+'_'+url);
  check('hr_department_fixture_owned',database('SELECT COUNT(*) FROM hr_employee e JOIN sys_user u ON u.tenant_id=e.tenant_id AND u.dept_id=e.dept_id WHERE e.id=98209280500 AND e.tenant_id=100000 AND e.dept_id=100 AND e.deleted=0 AND u.user_id='+id(sessions.hr.identity.userId))==='1');
  check('outside_department_fixture_owned',database('SELECT COUNT(*) FROM hr_employee WHERE id=98209282286 AND tenant_id=100000 AND dept_id=990000164 AND deleted=0')==='1');
  check('foreign_employee_fixture_owned',database('SELECT COUNT(*) FROM hr_employee WHERE id=98209282289 AND tenant_id=100001 AND dept_id=990000165 AND deleted=0')==='1');
  for(const actor of ['admin','foreign']){
    const periods=await ok(actor,pay+'/config/periods');
    const month=Array.from({length:60},(_,index)=>`${2044+Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`).find(value=>!periods.some(period=>period.startDate<=value+'-31'&&period.endDate>=value+'-01'));check('available_owned_period_'+actor,Boolean(month));
    const [year,monthNumber]=month.split('-').map(Number),end=month+'-'+new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
    const period={actor,tenant:sessions[actor].identity.tenantId,month,end,id:id(await ok(actor,pay+'/periods','POST',{periodName:fixture.marker+'-'+actor,frequency:'MONTHLY',startDate:month+'-01',endDate:end,payDate:end}))};fixture.periods.push(period);save();
  }
  const create=async(label,actor,employees)=>{
    const period=fixture.periods.find(value=>value.actor===actor);
    const batch={label,actor,tenant:period.tenant,periodId:period.id,employeeIds:employees,id:id(await ok(actor,pay+'/batches','POST',{payrollPeriodId:period.id,employeeIds:employees,validateAttendanceFlag:0,deductUnverifiedFlag:0}))};fixture.batches.push(batch);save();
    const detail=await ok(actor,pay+'/batches/'+batch.id);batch.no=detail.batch.batchNo;save();
    check('draft_employee_list_'+label,detail.batch.status==='DRAFT'&&JSON.stringify(detail.employees.map(value=>String(value.employeeId)).sort())===JSON.stringify([...employees].sort()));return batch;
  };
  const inside=await create('inside','admin',[targets.hrDepartment.employeeId]);
  const outside=await create('outside','admin',[targets.peer.employeeId]);
  const mixed=await create('mixed','admin',[targets.hrDepartment.employeeId,targets.peer.employeeId]);
  const finance=await create('finance','admin',[targets.hrDepartment.employeeId]);
  const foreign=await create('foreign','foreign',[targets.foreign.employeeId]);
  const batchState=batch=>hash(database('SELECT * FROM hr_payroll_batch WHERE batch_id='+batch.id)+database('SELECT * FROM hr_payroll_batch_employee WHERE batch_id='+batch.id+' ORDER BY batch_employee_id')+database('SELECT * FROM hr_salary_slip WHERE batch_id='+batch.id+' ORDER BY id'));
  const auditCount=(actor,batch)=>Number(database("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id="+id(sessions[actor].identity.tenantId)+" AND operator_id="+id(sessions[actor].identity.userId)+" AND business_domain='PAYROLL_BATCH' AND operation_type='CANCEL' AND business_id='"+batch.id+"'"));
  const deny=async(actor,batch)=>{
    const before=batchState(batch),periodBefore=database('SELECT * FROM hr_payroll_period WHERE period_id='+batch.periodId);
    const auditsBefore=Number(database("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='PAYROLL_BATCH' AND operation_type='CANCEL' AND business_id='"+batch.id+"'"));
    const response=await api(actor,pay+'/batches/'+batch.id+'/cancel','POST',{});
    check('cancel_denied_'+actor+'_'+batch.label,[401,403,404].includes(response.status)&&response.body?.code!==200);
    check('denial_preserves_batch_period_and_salary_'+actor+'_'+batch.label,batchState(batch)===before&&database('SELECT * FROM hr_payroll_period WHERE period_id='+batch.periodId)===periodBefore);
    check('denial_has_no_success_audit_'+actor+'_'+batch.label,Number(database("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='PAYROLL_BATCH' AND operation_type='CANCEL' AND business_id='"+batch.id+"'"))===auditsBefore);
    check('denial_discloses_no_payroll_'+actor+'_'+batch.label,!/"(?:employees|salarySlipId|grossTotal|netTotal|batchNo)"/.test(JSON.stringify(response.body)));
    fixture.matrix.push({actor,batchId:batch.id,label:batch.label,allowed:false,status:response.status,code:response.body?.code});save();
  };
  for(const actor of ['employee','manager','anonymous'])for(const batch of [inside,outside,mixed,foreign])await deny(actor,batch);
  for(const batch of [outside,mixed,foreign])await deny('hr',batch);
  for(const batch of [inside,outside,mixed])await deny('foreign',batch);
  await deny('admin',foreign);await deny('finance',foreign);
  evidence.roles=true;evidence.scope=true;evidence.tenant=true;evidence.anonymous=true;evidence.atomicDenial=true;
  const cancel=async(actor,batch)=>{
    const otherBefore=fixture.batches.filter(value=>value.id!==batch.id).map(value=>[value.id,batchState(value)]),beforeAudit=auditCount(actor,batch);
    await ok(actor,pay+'/batches/'+batch.id+'/cancel','POST',{});
    check('only_owned_batch_cancelled_'+actor+'_'+batch.label,database('SELECT status FROM hr_payroll_batch WHERE batch_id='+batch.id)==='CANCELLED'&&database('SELECT COUNT(*) FROM hr_payroll_batch_employee WHERE batch_id='+batch.id)==='0');
    check('other_batches_all_fields_unchanged_'+batch.label,JSON.stringify(otherBefore)===JSON.stringify(fixture.batches.filter(value=>value.id!==batch.id).map(value=>[value.id,batchState(value)])));
    check('one_cancel_audit_'+actor+'_'+batch.label,auditCount(actor,batch)===beforeAudit+1);
    fixture.audits.push({actor,batchId:batch.id,added:1});fixture.matrix.push({actor,batchId:batch.id,label:batch.label,allowed:true,status:200});fixture.restorations[batch.id]=true;save();
  };
  await cancel('hr',inside);await cancel('finance',finance);await cancel('admin',outside);await cancel('admin',mixed);await cancel('foreign',foreign);
  evidence.exactCancellation=true;evidence.audits=true;
}catch(error){failure=error;}
finally{
  if(runtime){
    for(const batch of fixture.batches){try{
      const status=runtime.database('SELECT status FROM hr_payroll_batch WHERE batch_id='+id(batch.id));assert.ok(['DRAFT','CANCELLED'].includes(status));
      if(status==='DRAFT')await ok(batch.actor,pay+'/batches/'+batch.id+'/cancel','POST',{});
      runtime.check('owned_batch_restored_'+batch.id,runtime.database('SELECT status FROM hr_payroll_batch WHERE batch_id='+batch.id)==='CANCELLED');fixture.restorations[batch.id]=true;save();
    }catch(error){fixture.restorations[batch.id]=false;failure||=error;save();}}
    for(const period of fixture.periods){try{
      assert.equal(runtime.database("SELECT COUNT(*) FROM hr_payroll_period WHERE period_id="+period.id+" AND tenant_id="+period.tenant+" AND period_name='"+fixture.marker+'-'+period.actor+"'"),'1');
      if(runtime.database('SELECT status FROM hr_payroll_period WHERE period_id='+period.id)!=='CLOSED')await ok(period.actor,pay+'/periods/'+period.id+'/close','POST',{});
      runtime.check('owned_period_closed_'+period.id,runtime.database('SELECT status FROM hr_payroll_period WHERE period_id='+period.id)==='CLOSED');period.closed=true;save();
    }catch(error){failure||=error;}}
    evidence.restoration=fixture.batches.every(batch=>fixture.restorations[batch.id])&&fixture.periods.every(period=>period.closed);
    if(original){try{runtime.check('original_business_and_grants_unchanged',JSON.stringify(original)===JSON.stringify(preserved()));evidence.preservation=true;}catch(error){failure||=error;}}
    try{runtime.check('no_browser_errors',runtime.browserErrors.length===0);console.log('D3_CANCEL_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,matrix:fixture.matrix.length,batches:fixture.batches.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:failure?String(failure.message).split('\n')[0].slice(0,180):undefined};
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log('D3_CANCEL_RESULT: '+JSON.stringify({...result,checks:result.checks.length}));if(!result.passed)process.exitCode=1;
}
