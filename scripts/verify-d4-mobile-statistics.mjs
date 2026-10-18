import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { createD4GrievanceRuntime } from './runtime-checks/d4-grievance-runtime.mjs';

const root='D:/CloudFlowPro',mine='/hr/ess/grievances',manage='/hr/grievances';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d4-mobile-statistics'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);assert.match(path.basename(output),/^d4-mobile-statistics-20261006-r[1-9][0-9]*$/);assert.ok(!fs.existsSync(path.join(output,'result.json')));
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;},hash=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>"CONVERT(X'"+Buffer.from(String(value)).toString('hex')+"' USING utf8mb4)";
const fixture={marker:'D4S-'+randomUUID().replaceAll('-','').slice(0,12),employees:[],grievances:[],screenshots:[],statistics:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={mobileSubmission:false,mobileWithdrawal:false,filters:false,statistics:false,scope:false,charts:false,preservation:false,restoration:false,secrets:false};
const tables=[['hr_employee','id'],['hr_grievance','grievance_id'],['hr_grievance_record','record_id'],['hr_labor_dispute','id'],['hr_dispute_evidence','id'],['hr_salary_slip','id']];
let runtime,failure,ok,preserved,roles,originalDigests,originalRoles,employeePage,hrPage;
try{
  runtime=await createD4GrievanceRuntime(root,output);ok=runtime.grievanceOk;
  const {database,rows,check,sessions}=runtime;
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{const digest=createHash('sha256');let cursor='0';for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}return[table,digest.digest('hex')];}));
  roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  originalDigests=preserved();originalRoles=roles();fixture.originalBounds=bounds;fixture.originalDigests=originalDigests;fixture.originalRoles=originalRoles;save();
  const origin=new URL(sessions.employee.page.url()).origin,userId=id(sessions.employee.identity.userId);
  check('test_account_unbound',database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId} AND deleted=0`)==='0');
  const snapshots=()=>rows("SELECT JSON_OBJECT('id',CAST(g.grievance_id AS CHAR),'employeeId',CAST(g.employee_id AS CHAR),'deptId',CAST(g.dept_id AS CHAR),'deptName',d.dept_name,'type',g.grievance_type,'status',g.status,'againstType',g.against_type,'againstId',CAST(g.against_id AS CHAR),'handlerId',CAST(g.handler_id AS CHAR),'created',DATE_FORMAT(g.create_time,'%Y-%m-%d'),'resolved',DATE_FORMAT(g.resolution_date,'%Y-%m-%d')) FROM hr_grievance g LEFT JOIN sys_dept d ON d.tenant_id=g.tenant_id AND d.dept_id=g.dept_id AND d.deleted=0 WHERE g.tenant_id=100000 AND g.deleted=0 ORDER BY g.grievance_id");
  const visible=(all,actor,query={})=>{
    const account=sessions[actor].identity.userId;
    const employee=database(`SELECT CAST(id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND user_id=${id(account)} AND deleted=0`);
    return all.filter(row=>!(row.againstType==='USER'&&row.againstId===account)&&row.employeeId!==employee&&(actor==='hr'||row.handlerId===account)
      &&(!query.status||row.status===query.status)&&(!query.grievanceType||row.type===query.grievanceType)&&(!query.deptId||row.deptId===query.deptId)&&(!query.handlerId||row.handlerId===query.handlerId));
  };
  const normalize=values=>values.map(value=>({name:value.name,value:Number(value.value)})).sort((a,b)=>a.name.localeCompare(b.name));
  const expected=values=>{
    const byType=new Map(),byDept=new Map(),byDuration=new Map([['0–3天',0],['4–7天',0],['8天及以上',0]]);
    for(const row of values){byType.set(row.type,(byType.get(row.type)||0)+1);const dept=row.deptName||'未分配部门';byDept.set(dept,(byDept.get(dept)||0)+1);
      if(row.resolved){const days=(Date.parse(row.resolved+'T00:00:00Z')-Date.parse(row.created+'T00:00:00Z'))/86400000;const bucket=days<=3?'0–3天':days<=7?'4–7天':'8天及以上';byDuration.set(bucket,byDuration.get(bucket)+1);}}
    const chart=map=>normalize([...map].map(([name,value])=>({name,value})));return{total:values.length,byType:chart(byType),byDept:chart(byDept),byDuration:chart(byDuration)};
  };
  const actualStats=async(actor,query={})=>ok(actor,manage+'/statistics?'+new URLSearchParams(query));
  const assertStats=(actual,wanted,label)=>{check(label+'_total',actual.total===wanted.total);for(const key of ['byType','byDept','byDuration'])check(label+'_'+key,JSON.stringify(normalize(actual[key]))===JSON.stringify(wanted[key]));};
  const baseline=snapshots();assertStats(await actualStats('hr'),expected(visible(baseline,'hr')),'baseline');fixture.baselineCount=visible(baseline,'hr').length;
  const makeEmployee=async(deptId)=>{
    for(const previous of fixture.employees){if(!previous.bound)continue;await ok('admin','/hr/employees/'+previous.id,'PUT',{...previous.body,userId:null});previous.bound=false;save();}
    const body={employeeNo:fixture.marker+'-'+deptId,name:fixture.marker+'-'+deptId,gender:'UNKNOWN',deptId,employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2026-01-01',userId};
    const employee={id:id(await ok('admin','/hr/employees','POST',body)),body,bound:true};fixture.employees.push(employee);save();return employee;
  };
  const first=await makeEmployee('100');employeePage=await runtime.createUiPage('employee',{width:390,height:844});
  const screenshot=async(page,name)=>{await page.screenshot({path:path.join(output,name),fullPage:true});fixture.screenshots.push(name);save();};
  await employeePage.goto(origin+'/hr/ess/grievances',{waitUntil:'networkidle'});await employeePage.getByRole('button',{name:'提交申诉',exact:true}).click();
  const form=employeePage.getByRole('dialog',{name:'提交本人申诉',exact:true});
  const body={grievanceType:'WORKPLACE',priority:'HIGH',subject:fixture.marker+'手机完整提交',againstType:'POLICY',againstName:fixture.marker+'办公环境制度',description:fixture.marker+'手机填写第一行\n手机填写第二行',cause:fixture.marker+'手机填写起因',expectation:fixture.marker+'手机填写期望'};
  for(const [label,value]of [['申诉类型',body.grievanceType],['优先级',body.priority],['指向对象',body.againstType]])await form.locator('select').and(form.getByLabel(label)).selectOption(value);
  for(const [label,value]of [['标题',body.subject],['制度名称',body.againstName],['详细描述',body.description],['起因',body.cause],['期望结果',body.expectation]])await form.locator('input,textarea').and(form.getByLabel(label)).fill(value);
  const bytes=Buffer.from(fixture.marker+'手机附件内容\n完整保留','utf8'),name=fixture.marker+'-mobile.txt';
  const uploadWait=employeePage.waitForResponse(response=>response.url().endsWith('/api'+mine+'/files')&&response.request().method()==='POST');
  await form.locator('input[type=file]').setInputFiles({name,mimeType:'text/plain',buffer:bytes});const upload=await (await uploadWait).json();check('mobile_actual_upload',upload.code===200);fixture.file={id:id(upload.data.fileId),hash:hash(bytes)};save();
  await form.getByText(name,{exact:true}).waitFor();await screenshot(employeePage,'mobile-form-attachment.png');
  await form.locator('input').and(form.getByLabel('标题')).scrollIntoViewIfNeeded();await screenshot(employeePage,'mobile-form-top.png');
  const submitWait=employeePage.waitForResponse(response=>response.url().endsWith('/api'+mine)&&response.request().method()==='POST');await form.getByRole('button',{name:'确认提交',exact:true}).click();const submitted=await (await submitWait).json();check('mobile_actual_submission',submitted.code===200);await form.waitFor({state:'hidden'});
  const firstCase={id:id(submitted.data),employeeId:first.id,body,status:'SUBMITTED'};fixture.grievances.push(firstCase);save();
  const detail=await ok('employee',mine+'/'+firstCase.id);for(const [key,value]of Object.entries(body))check('mobile_saved_'+key,detail.grievance[key]===value);
  check('mobile_saved_owned_attachment',JSON.parse(detail.grievance.attachmentUrl).map(String).includes(fixture.file.id));
  const fileResponse=await runtime.grievanceApi('employee',mine+'/'+firstCase.id+'/files/'+fixture.file.id);check('mobile_attachment_bytes',fileResponse.status===200&&hash(Buffer.from(fileResponse.base64,'base64'))===fixture.file.hash);evidence.mobileSubmission=true;
  await employeePage.goto(origin+'/hr/ess/grievances?id='+firstCase.id,{waitUntil:'networkidle'});const ownDetail=employeePage.getByRole('dialog',{name:body.subject,exact:true});await ownDetail.waitFor();await screenshot(employeePage,'mobile-submitted-detail.png');
  await ownDetail.getByRole('button',{name:'撤回',exact:true}).click();const withdrawForm=employeePage.getByRole('dialog',{name:'撤回',exact:true});await withdrawForm.locator('textarea').and(withdrawForm.getByLabel('说明')).fill(fixture.marker+'手机撤回');
  const withdrawal=employeePage.waitForResponse(response=>response.url().endsWith('/'+firstCase.id+'/withdraw')&&response.request().method()==='POST');await withdrawForm.getByRole('button',{name:'确认提交',exact:true}).click();check('mobile_withdraw_success',(await (await withdrawal).json()).code===200);await withdrawForm.waitFor({state:'hidden'});
  check('mobile_withdraw_saved',(await ok('employee',mine+'/'+firstCase.id)).grievance.status==='WITHDRAWN');firstCase.status='WITHDRAWN';save();evidence.mobileWithdrawal=true;
  const second=await makeEmployee('101');
  for(const [name,type]of [['待受理','POLICY'],['已给结论','MANAGEMENT']]){
    const request={grievanceType:type,priority:'NORMAL',subject:fixture.marker+name,description:fixture.marker+'统计来源',againstType:'NONE',fileIds:[]};
    const sample={id:id(await ok('employee',mine,'POST',request)),employeeId:second.id,body:request,status:'SUBMITTED'};fixture.grievances.push(sample);save();
    if(type==='MANAGEMENT'){await ok('hr',manage+'/'+sample.id+'/accept','POST',{});await ok('hr',manage+'/'+sample.id+'/investigate','POST',{});await ok('hr',manage+'/'+sample.id+'/resolve','POST',{content:fixture.marker+'统计用真实结论'});sample.status='RESOLVED';save();}
  }
  const all=snapshots(),allExpected=expected(visible(all,'hr'));
  check('new_cases_increment_total',allExpected.total===fixture.baselineCount+3);
  for(const [type,dept]of [['WORKPLACE','CloudFlow 科技'],['POLICY','研发部'],['MANAGEMENT','研发部']])check('controlled_type_increment_'+type,allExpected.byType.find(item=>item.name===type).value===(expected(visible(baseline,'hr')).byType.find(item=>item.name===type)?.value||0)+1);
  check('controlled_department_increment',allExpected.byDept.find(item=>item.name==='研发部').value===(expected(visible(baseline,'hr')).byDept.find(item=>item.name==='研发部')?.value||0)+2);
  check('resolved_duration_increment',allExpected.byDuration.find(item=>item.name==='0–3天').value===expected(visible(baseline,'hr')).byDuration.find(item=>item.name==='0–3天').value+1);
  const queries=[{},...['SUBMITTED','ACCEPTED','INVESTIGATING','RESOLVED','CLOSED','ESCALATED','WITHDRAWN'].map(status=>({status})),...['SALARY','PERFORMANCE','MANAGEMENT','WORKPLACE','POLICY','OTHER'].map(grievanceType=>({grievanceType})),{deptId:'100'},{deptId:'101'},{handlerId:sessions.hr.identity.userId},{status:'RESOLVED',grievanceType:'MANAGEMENT',deptId:'101',handlerId:sessions.hr.identity.userId}];
  for(const [index,query]of queries.entries()){
    const wanted=visible(all,'hr',query),stats=await actualStats('hr',query);assertStats(stats,expected(wanted),'filter_'+index);
    const page=await ok('hr',manage+'?'+new URLSearchParams({...query,pageNum:'1',pageSize:'100'}));check('filtered_list_'+index,page.total===wanted.length&&JSON.stringify(page.rows.map(row=>String(row.grievanceId)).sort())===JSON.stringify(wanted.map(row=>row.id).sort()));
    fixture.statistics.push({query,total:stats.total});
  }
  evidence.filters=true;evidence.statistics=true;
  assertStats(await actualStats('admin'),expected(visible(all,'admin')),'unassigned_admin');
  check('employee_has_existing_handler_menu_permission',sessions.employee.identity.permissions.includes('hr:grievance:manage:list'));
  assertStats(await actualStats('employee'),expected(visible(all,'employee')),'employee_assigned_case_scope');evidence.scope=true;
  const labels=Object.fromEntries(rows("SELECT JSON_OBJECT('value',dict_value,'label',dict_label) FROM sys_dict_data WHERE dict_type='hr_grievance_type' AND status='0'").map(row=>[row.value,row.label]));
  hrPage=await runtime.createUiPage('hr');
  for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
    await hrPage.setViewportSize({width:viewport.width,height:viewport.height});await hrPage.goto(origin+'/hr/grievances',{waitUntil:'networkidle'});await hrPage.getByRole('button',{name:'查看统计',exact:true}).click();
    const dialog=hrPage.getByRole('dialog',{name:'申诉分布（仅包含有权查看的记录）',exact:true});await dialog.waitFor();
    for(const [key,title]of [['byType','按类型'],['byDept','按部门'],['byDuration','已给结论的处理时长']]){
      const section=dialog.locator('section').filter({has:hrPage.getByRole('heading',{name:title,exact:true})});const chart=section.getByRole('img',{name:title,exact:true});await chart.scrollIntoViewIfNeeded();await chart.waitFor();await chart.locator('canvas').waitFor();
      const box=await chart.boundingBox();check(viewport.name+'_'+key+'_chart_fits',box&&box.width>0&&box.x>=0&&box.x+box.width<=viewport.width+1);
      await screenshot(hrPage,viewport.name+'-'+key+'-chart.png');await section.getByRole('button',{name:'查看数据表',exact:true}).click();
      const data=await section.locator('tbody tr').evaluateAll(rows=>rows.map(row=>Array.from(row.querySelectorAll('td')).map(cell=>cell.textContent)));
      const wanted=allExpected[key].map(row=>[key==='byType'?labels[row.name]||row.name:row.name,String(row.value)]);
      check(viewport.name+'_'+key+'_data_matches_actual',JSON.stringify(data.sort((a,b)=>a[0].localeCompare(b[0])))===JSON.stringify(wanted.sort((a,b)=>a[0].localeCompare(b[0]))));
    }
  }
  check('no_browser_errors',runtime.browserErrors.length===0);evidence.charts=true;save();
  console.log('D4_MOBILE_STATISTICS_PHASE: mobile_submit_with_attachment=true; mobile_withdraw=true; actual_filters=18; three_charts_both_viewports=true');
}catch(error){failure=error;try{if(hrPage)await hrPage.screenshot({path:path.join(output,'failure.png'),fullPage:true});else if(employeePage)await employeePage.screenshot({path:path.join(output,'failure.png'),fullPage:true});}catch{}}
finally{
  const restore=async(label,operation)=>{try{await operation();fixture.restorations[label]=true;}catch(error){fixture.restorations[label]=false;failure||=error;}save();};
  await restore('grievances',async()=>{
    for(const employee of fixture.employees){const open=fixture.grievances.filter(sample=>sample.employeeId===employee.id&&!['WITHDRAWN','CLOSED'].includes(sample.status));if(!open.length)continue;
      if(!employee.bound){for(const other of fixture.employees){if(other.bound){await ok('admin','/hr/employees/'+other.id,'PUT',{...other.body,userId:null});other.bound=false;}}await ok('admin','/hr/employees/'+employee.id,'PUT',employee.body);employee.bound=true;save();}
      for(const sample of open){const actual=await ok('employee',mine+'/'+sample.id);if(actual.grievance.status==='SUBMITTED')await ok('employee',mine+'/'+sample.id+'/withdraw','POST',{content:fixture.marker+'验证结束'});else if(actual.grievance.status==='RESOLVED')await ok('employee',mine+'/'+sample.id+'/confirm','POST',{satisfied:true,content:fixture.marker+'确认收尾'});else throw new Error('Unexpected owned grievance status during cleanup');sample.status=(await ok('employee',mine+'/'+sample.id)).grievance.status;save();}
    }
  });
  await restore('bindings',async()=>{for(const employee of fixture.employees){if(!employee.bound)continue;await ok('admin','/hr/employees/'+employee.id,'PUT',{...employee.body,userId:null});employee.bound=false;save();}if(runtime)runtime.check('account_unbound_after_mobile',runtime.database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${id(runtime.sessions.employee.identity.userId)} AND deleted=0`)==='0');});
  evidence.restoration=Object.values(fixture.restorations).every(Boolean);
  if(runtime){try{const final=preserved();for(const [table]of tables)runtime.check('original_'+table+'_unchanged',final[table]===originalDigests[table]);runtime.check('original_grants_unchanged',roles()===originalRoles);evidence.preservation=true;}catch(error){failure||=error;}
    try{console.log('D4_MOBILE_STATISTICS_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}await runtime.close();}
  save();const raw=failure?String(failure.message).split('\n')[0].slice(0,220):undefined,safe=raw&&[...(runtime?.sensitive||[])].every(value=>!raw.includes(value))?raw:failure?'D4 mobile statistics verification failed':undefined;
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,grievances:fixture.grievances.length,filterCases:fixture.statistics.length,all13Complete:false,globalComplete:false,remaining:['Complete privacy matrix','Related business navigation','Working-day reminders','Controlled duration-bin boundaries'],failure:safe},null,2));
  console.log(`D4_MOBILE_STATISTICS_SUMMARY: checks=${runtime?.checks.length||0}; failed=${failure?1:0}; requests=${runtime?.requests.length||0}; filter_cases=${fixture.statistics.length}; preservation=${evidence.preservation}; restoration=${evidence.restoration}; all13_complete=false`);if(failure){console.log('D4_MOBILE_STATISTICS_FAILURE: '+safe);process.exitCode=1;}
}
