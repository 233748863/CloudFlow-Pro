import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createD4PrivacyRuntime } from './runtime-checks/d4-privacy-runtime.mjs';

assert.ok(process.argv.includes('--d4-linked'));
const root='D:/CloudFlowPro',output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d4-linked-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const id=value=>{const result=String(value);assert.match(result,/^[1-9]\d*$/);return result;};
const hash=value=>createHash('sha256').update(value).digest('hex');
const money=value=>{const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));assert.ok(match,'Exact salary amount required');return match[1]+match[2]+'.'+(match[3]||'').padEnd(2,'0');};
const fixture={marker:'D4L-'+randomUUID().replaceAll('-','').slice(0,12),grievances:[],screenshots:[],bound:false,restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={salary:false,performance:false,browser:false,scope:false,preservation:false,restoration:false,secrets:false};
const tables=[['hr_employee','id'],['hr_salary_slip','id'],['hr_performance_result','id'],['hr_performance_objective','id'],['hr_performance_assignment','id'],['hr_grievance','grievance_id'],['hr_grievance_record','record_id'],['hr_labor_dispute','id'],['hr_dispute_evidence','id']];
let runtime,failure,employeeBody,originalEmployee,originalRoles,originalDigests,preserved,employeeDigest,roles,ui;
try{
  runtime=await createD4PrivacyRuntime(root,output);
  const {database,rows,check,sessions}=runtime,ok=runtime.privacyOk;
  const origin=new URL(sessions.hr.page.url()).origin;
  // Read a completed, explicitly owned payroll fixture. Only its account binding is temporarily changed.
  const source=rows("SELECT JSON_OBJECT('slipId',CAST(s.id AS CHAR),'employeeId',CAST(e.id AS CHAR),'period',s.period_month,'status',s.status) FROM hr_salary_slip s JOIN hr_employee e ON e.id=s.employee_id AND e.tenant_id=s.tenant_id WHERE s.id=98209281550 AND s.tenant_id=100000 AND s.status='PAID' AND e.employee_no='D3A-34202f68ee38' AND e.deleted=0 AND e.user_id IS NULL");
  check('owned_paid_payroll_source',source.length===1);Object.assign(fixture,source[0]);save();
  const columns=database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='hr_employee' ORDER BY ordinal_position").split(/\r?\n/).filter(column=>!['user_id','version','update_by','update_time'].includes(column));
  for(const column of columns)assert.match(column,/^[a-z_]+$/);
  employeeDigest=()=>hash(database('SELECT '+columns.map(column=>'`'+column+'`').join(',')+' FROM hr_employee WHERE id='+id(fixture.employeeId)));
  originalEmployee=employeeDigest();
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{const digest=createHash('sha256');let cursor='0';for(;;){const exclusion=table==='hr_employee'?' AND id<>'+id(fixture.employeeId):'';const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+exclusion+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+exclusion+' ORDER BY '+key));cursor=end;}return[table,digest.digest('hex')];}));
  roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  originalDigests=preserved();originalRoles=roles();fixture.originalBounds=bounds;fixture.originalDigests=originalDigests;fixture.originalRoles=originalRoles;fixture.employeeBusinessDigest=originalEmployee;save();
  const read=async(actor,url)=>{
    assert.match(url,/^\/hr\/(?:performance\/results|ess\/salary-slips|compensation\/payroll\/slips)(?:\/|\?|$)/);
    const response=await sessions[actor].page.evaluate(async supplied=>{const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),headers={};if(token)headers.Authorization=token.startsWith('Bearer ')?token:'Bearer '+token;const result=await fetch('/api'+supplied,{credentials:'same-origin',headers});return{status:result.status,traceId:result.headers.get('X-Trace-Id'),body:(result.headers.get('Content-Type')||'').includes('json')?await result.json():null};},url);
    runtime.requests.push({actor,path:url,method:'GET',status:response.status,code:response.body?.code,traceId:response.traceId});return response;
  };
  const readOk=async(actor,url)=>runtime.success(await read(actor,url),actor+'_read_'+url);
  check('employee_account_initially_unbound',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND user_id='+id(sessions.employee.identity.userId))==='0');
  employeeBody=await ok('admin','/hr/employees/'+fixture.employeeId);
  check('source_employee_identity',String(employeeBody.id)===fixture.employeeId&&!employeeBody.userId);
  fixture.bound=true;save();
  await ok('admin','/hr/employees/'+fixture.employeeId,'PUT',{...employeeBody,userId:sessions.employee.identity.userId});
  const salary=await readOk('employee','/hr/ess/salary-slips/'+fixture.slipId);
  check('employee_reads_owned_paid_slip',String(salary.id)===fixture.slipId&&salary.periodMonth===fixture.period&&salary.status==='PAID');
  const hrSalary=await readOk('hr','/hr/compensation/payroll/slips/'+fixture.slipId);
  for(const key of ['id','employeeId','periodMonth','grossTotal','deductionTotal','taxAmount','netTotal'])check('salary_shared_value_'+key,String(hrSalary[key])===String(salary[key]));evidence.salary=true;
  const results=await readOk('hr','/hr/performance/results');
  const performance=results.find(result=>String(result.id)==='9204');check('existing_result_is_visible',Boolean(performance));fixture.resultId=id(performance.id);save();
  const detail=await readOk('hr','/hr/performance/results/'+fixture.resultId);
  for(const key of ['id','objectiveId','assignmentId','employeeId','score','grade','summary','status'])check('result_detail_matches_list_'+key,JSON.stringify(detail[key])===JSON.stringify(performance[key]));
  check('result_id_differs_from_objective_id',String(detail.id)!==String(detail.objectiveId));
  check('result_response_no_tenant_id',!Object.hasOwn(detail,'tenantId'));evidence.performance=true;
  for(const actor of ['employee','admin','manager','foreign','anonymous']){
    const listed=await read(actor,'/hr/performance/results'),response=await read(actor,'/hr/performance/results/'+fixture.resultId);
    if(listed.status===200&&listed.body?.code===200){const matching=listed.body.data.find(row=>String(row.id)===fixture.resultId);check(actor+'_same_existing_result_read_scope',response.status===200&&response.body?.code===200&&(matching?String(response.body.data?.id)===fixture.resultId:!response.body.data?.id));}
    else check(actor+'_same_existing_result_menu_rejection',[401,403].includes(response.status)||[401,403].includes(response.body?.code));
  }
  for(const actor of ['foreign','anonymous']){const response=await read(actor,'/hr/compensation/payroll/slips/'+fixture.slipId);check(actor+'_salary_unavailable',response.body?.data?.id===undefined&&response.status!==500);}
  const missing=await readOk('hr','/hr/performance/results/9223372036854775807');check('missing_result_empty',!missing?.id);evidence.scope=true;
  for(const [type,sourceId]of [['SALARY_SLIP',fixture.slipId],['PERFORMANCE_RESULT',fixture.resultId]]){
    const body={grievanceType:type==='SALARY_SLIP'?'SALARY':'PERFORMANCE',subject:fixture.marker+'-'+type,description:fixture.marker+'关联单据查看验证',againstType:'NONE',relatedBizType:type,relatedBizId:sourceId,fileIds:[]};
    const sample={id:id(await ok('employee','/hr/ess/grievances','POST',body)),body,status:'SUBMITTED'};fixture.grievances.push(sample);save();
  }
  const screenshot=async(page,name)=>{await page.screenshot({path:path.join(output,name),fullPage:true});fixture.screenshots.push(name);save();};
  for(const view of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
    for(const actor of ['hr','employee']){
      ui=await runtime.createPrivacyUiPage(actor,{width:view.width,height:view.height});
      for(const sample of fixture.grievances){
        const base=actor==='employee'?'/hr/ess/grievances':'/hr/grievances';
        await ui.goto(origin+base+'?id='+sample.id,{waitUntil:'networkidle'});
        const sourceDialog=ui.getByRole('dialog',{name:sample.body.subject,exact:true});await sourceDialog.waitFor();
        const link=sourceDialog.getByRole('link',{name:'查看关联单据 #'+sample.body.relatedBizId,exact:true});
        if(sample.body.relatedBizType==='PERFORMANCE_RESULT'&&actor==='employee'&&!sessions.employee.identity.permissions.includes('hr:performance:list')){
          check(view.name+'_employee_unavailable_result_not_linked',await link.count()===0);
          await sourceDialog.getByText('关联绩效结果 #'+fixture.resultId+'（暂无查看权限）',{exact:true}).waitFor();
          await screenshot(ui,view.name+'-employee-result-link-unavailable.png');
          await ui.goto(origin+'/hr/performance?id='+fixture.resultId,{waitUntil:'networkidle'});
        }else await link.click();
        await ui.waitForLoadState('networkidle');
        check(view.name+'_'+actor+'_'+sample.body.relatedBizType+'_keeps_id',new URL(ui.url()).searchParams.get('id')===String(sample.body.relatedBizId));
        if(sample.body.relatedBizType==='SALARY_SLIP'){
          const dialog=ui.getByRole('dialog',{name:actor==='hr'?'工资单 #'+fixture.slipId:'工资单 '+fixture.period,exact:true});await dialog.waitFor();
          await dialog.getByText(money(salary.netTotal),{exact:true}).waitFor();
          check(view.name+'_'+actor+'_salary_amounts',await dialog.getByText(money(salary.netTotal),{exact:true}).count()===1);
        }else if(actor==='employee'&&!sessions.employee.identity.permissions.includes('hr:performance:list')){
          await ui.getByText(/您没有访问此页面的权限|没有权限访问|权限不足|菜单路由未配置/).first().waitFor();
          check(view.name+'_employee_result_menu_still_denied',await ui.locator('article dl').count()===0);
        }else{
          await ui.getByRole('heading',{name:'绩效结果',exact:true}).waitFor();
          for(const [label,value]of [['结果编号',detail.id],['目标编号',detail.objectiveId],['得分',detail.score],['等级',detail.grade]]){
            const item=ui.locator('dl > div').filter({has:ui.locator('dt').filter({hasText:new RegExp('^'+label+'$')})});
            check(view.name+'_'+actor+'_result_'+label,(await item.locator('dd').innerText())===String(value));
          }
          check(view.name+'_'+actor+'_no_result_mutation_controls',await ui.getByRole('button',{name:/保存|提交|填报|调薪/}).count()===0);
          check(view.name+'_'+actor+'_result_fits',await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          if(view.name==='mobile'){
            const heading=await ui.getByRole('heading',{name:'绩效结果',exact:true}).boundingBox();
            const back=await ui.getByRole('link',{name:'返回绩效管理',exact:true}).boundingBox();
            check('mobile_result_header_aligned',heading&&heading.x>=16&&heading.x<=32);
            check('mobile_result_back_touch_height',back&&back.height>=44);
          }
        }
        await screenshot(ui,view.name+'-'+actor+'-'+sample.body.relatedBizType+'.png');
      }
      await ui.close();ui=null;
    }
  }
  ui=await runtime.createPrivacyUiPage('hr',{width:390,height:844});
  for(const value of ['0','abc','9223372036854775808']){
    await ui.goto(origin+'/hr/performance?id='+value,{waitUntil:'networkidle'});await ui.getByRole('alert').filter({hasText:'绩效结果编号无效'}).waitFor();check('invalid_result_'+value,await ui.locator('article dl').count()===0);
  }
  await ui.goto(origin+'/hr/performance?id=9223372036854775807',{waitUntil:'networkidle'});await ui.getByRole('alert').filter({hasText:'绩效结果不存在或无权查看'}).waitFor();await screenshot(ui,'mobile-missing-result.png');
  await ui.close();ui=null;check('no_browser_errors',runtime.browserErrors.length===0);evidence.browser=true;
  console.log('D4_LINKED_PHASE: salary_and_result=true; both_actors_both_viewports=true; existing_read_scope_preserved=true');
}catch(error){failure=error;try{if(ui)await ui.screenshot({path:path.join(output,'failure.png'),fullPage:true});}catch{}}
finally{
  const restore=async(label,operation)=>{try{await operation();fixture.restorations[label]=true;}catch(error){fixture.restorations[label]=false;failure||=error;}save();};
  if(runtime){
    await restore('grievances',async()=>{for(const sample of fixture.grievances){if(sample.status==='WITHDRAWN')continue;await runtime.privacyOk('employee','/hr/ess/grievances/'+sample.id+'/withdraw','POST',{content:fixture.marker+'验证结束'});sample.status=(await runtime.privacyOk('employee','/hr/ess/grievances/'+sample.id)).grievance.status;runtime.check('grievance_terminal_'+sample.id,sample.status==='WITHDRAWN');save();}});
    await restore('binding',async()=>{if(fixture.bound){await runtime.privacyOk('admin','/hr/employees/'+fixture.employeeId,'PUT',{...employeeBody,userId:null});fixture.bound=false;save();}if(fixture.employeeId)runtime.check('employee_binding_restored',runtime.database('SELECT COUNT(*) FROM hr_employee WHERE id='+id(fixture.employeeId)+' AND user_id IS NULL')==='1');});
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{if(!originalDigests)throw new Error('No preservation baseline');const actual=preserved();for(const [table]of tables)runtime.check('original_'+table+'_unchanged',actual[table]===originalDigests[table]);runtime.check('owned_employee_business_preserved',employeeDigest()===originalEmployee);runtime.check('original_roles_preserved',roles()===originalRoles);evidence.preservation=true;}catch(error){failure||=error;}
    try{console.log('D4_LINKED_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}await runtime.close();
  }
  const raw=failure?String(failure.message).split('\n')[0].slice(0,220):undefined,safe=raw&&[...(runtime?.sensitive||[])].every(value=>!raw.includes(value))?raw:failure?'D4 linked verification failed':undefined;
  save();fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,all13Complete:false,globalComplete:false,remaining:['Working-day reminders','Controlled duration-bin boundaries','D4 current-version unified verification'],failure:safe},null,2));
  console.log(`D4_LINKED_SUMMARY: checks=${runtime?.checks.length||0}; failed=${failure?1:0}; requests=${runtime?.requests.length||0}; preservation=${evidence.preservation}; restoration=${evidence.restoration}; all13_complete=false`);if(failure){console.log('D4_LINKED_FAILURE: '+safe);process.exitCode=1;}
}
