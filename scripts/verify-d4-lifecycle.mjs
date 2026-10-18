import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

// Reuse the owned three-account browser runtime; D4 requests are explicitly bounded below.
const root='D:/CloudFlowPro', mine='/hr/ess/grievances', manage='/hr/grievances';
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d4-lifecycle'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d4-lifecycle-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;};
const literal=value=>"CONVERT(X'"+Buffer.from(String(value)).toString('hex')+"' USING utf8mb4)";
const fixture={marker:'D4L-'+randomUUID().replaceAll('-','').slice(0,12),grievances:[],files:[],screenshots:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={submission:false,transitions:false,records:false,confirmation:false,targets:false,privacy:false,escalation:false,notifications:false,audits:false,browser:false,preservation:false,restoration:false,secrets:false};
const tables=[['hr_employee','id'],['hr_grievance','grievance_id'],['hr_grievance_record','record_id'],['hr_labor_dispute','id'],['hr_dispute_evidence','id'],['hr_salary_slip','id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_correction','correction_id']];
let runtime,failure,api,ok,action,current,originalDigests,originalRoles,preserved,roles,screenshot;
try {
  runtime=await createD1LeaveRuntime(root,output);
  const {check,database,rows,sessions}=runtime;
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{const digest=createHash('sha256');let cursor='0';for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}return[table,digest.digest('hex')];}));
  roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  const interval=Math.max(5000,Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis'")))+150;
  check('bounded_repeat_interval',Number.isSafeInteger(interval)&&interval<=60150);fixture.repeatIntervalMillis=interval;
  const clocks=new Map();
  api=async(actor,url,method='GET',body,options={})=>{
    assert.match(url,/^\/hr\/(?:ess\/grievances|grievances|employees)(?:\/|\?|$)/);
    const key=actor+' '+method+' '+url.split('?')[0];
    if(method!=='GET'&&!options.immediate){const remaining=interval-(Date.now()-(clocks.get(key)||0));if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
    try {
      const response=await sessions[actor].page.evaluate(async supplied=>{
        const token=(await import('/src/utils/authStorage.ts')).getAuthToken();
        const headers={Authorization:token.startsWith('Bearer ')?token:'Bearer '+token};
        const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
        let payload;
        if(supplied.file){payload=new FormData();payload.append('file',new Blob([Uint8Array.from(atob(supplied.file.base64),character=>character.charCodeAt(0))],{type:'text/plain'}),supplied.file.name);}
        else if(supplied.body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(supplied.body);}
        const result=await fetch('/api'+supplied.url,{method:supplied.method,credentials:'same-origin',headers,body:payload});
        const json=(result.headers.get('Content-Type')||'').includes('json');
        return {status:result.status,traceId:result.headers.get('X-Trace-Id'),...(json?{body:await result.json()}:{base64:btoa(String.fromCharCode(...new Uint8Array(await result.arrayBuffer()))),cache:result.headers.get('Cache-Control')})};
      },{url,method,body,file:options.file});
      runtime.requests.push({actor,path:url,method,status:response.status,code:response.body?.code,traceId:response.traceId});return response;
    } finally {if(method!=='GET')clocks.set(key,Date.now());}
  };
  ok=async(actor,url,method='GET',body,options)=>runtime.success(await api(actor,url,method,body,options),actor+'_'+method+'_'+url.split('?')[0]);
  if(process.argv.includes('--recover-r2')){
    const sourceFolder=path.join(path.dirname(output),'d4-lifecycle-20261006-r2');
    const prior=JSON.parse(fs.readFileSync(path.join(sourceFolder,'fixture.json'),'utf8'));
    const priorResult=JSON.parse(fs.readFileSync(path.join(sourceFolder,'result.json'),'utf8'));
    check('prior_recovery_scope',/^D4L-[a-f0-9]{12}$/.test(prior.marker)&&prior.grievances.length===1&&!priorResult.passed&&priorResult.preservation&&priorResult.secrets&&prior.restorations.employeeBinding&&!prior.restorations.grievances);
    const source=prior.grievances[0],priorEmployee=id(prior.employeeId),account=id(sessions.employee.identity.userId);
    check('prior_owned_employee_identity',database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND id=${priorEmployee} AND employee_no=${literal(prior.marker)} AND user_id IS NULL AND deleted=0`)==='1'&&prior.employeeBody.userId===account);
    check('prior_owned_grievance_still_submitted',database(`SELECT COUNT(*) FROM hr_grievance WHERE tenant_id=100000 AND grievance_id=${id(source.id)} AND employee_id=${priorEmployee} AND subject=${literal(source.body.subject)} AND status='SUBMITTED' AND deleted=0`)==='1');
    try {
      await ok('admin','/hr/employees/'+priorEmployee,'PUT',prior.employeeBody);
      await ok('employee',mine+'/'+id(source.id)+'/withdraw','POST',{content:prior.marker+'前轮页面会话验证失败，本轮正常撤回收尾'});
      check('prior_grievance_withdrawn',database(`SELECT status FROM hr_grievance WHERE tenant_id=100000 AND grievance_id=${id(source.id)}`)==='WITHDRAWN');
      fixture.recovery={source:'d4-lifecycle-20261006-r2',employeeId:priorEmployee,grievanceId:source.id,withdrawn:true};save();
    } finally {
      await ok('admin','/hr/employees/'+priorEmployee,'PUT',{...prior.employeeBody,userId:null});
      check('prior_employee_binding_restored',database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${account} AND deleted=0`)==='0');
    }
    console.log('D4_LIFECYCLE_PHASE: prior_r2_grievance_withdrawn=true; original_evidence_retained=true');
  }
  // Previous failed-run recovery is accounted separately; protect all business rows from this point.
  for(const [table,key]of tables)bounds[table]=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);
  originalDigests=preserved();originalRoles=roles();fixture.originalBounds=bounds;fixture.originalDigests=originalDigests;fixture.originalRoles=originalRoles;save();
  current=grievanceId=>rows(`SELECT JSON_OBJECT('id',CAST(grievance_id AS CHAR),'status',status,'satisfied',satisfied_flag,'disputeId',CAST(escalated_dispute_id AS CHAR),'handler',CAST(handler_id AS CHAR),'accepted',accept_time,'resolutionDate',resolution_date) FROM hr_grievance WHERE tenant_id=100000 AND grievance_id=${id(grievanceId)} AND subject LIKE ${literal(fixture.marker+'%')}`)[0];
  const records=grievanceId=>rows(`SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'type',record_type,'operator',CAST(operator_id AS CHAR),'role',operator_role,'name',operator_name,'time',CAST(create_time AS CHAR),'visible',visible_to_employee_flag,'content',content,'attachments',attachment_url) FROM hr_grievance_record WHERE tenant_id=100000 AND grievance_id=${id(grievanceId)} ORDER BY record_id`);
  const auditCount=(grievanceId,operation,actor)=>Number(database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='GRIEVANCE' AND business_id=${id(grievanceId)} AND operation_type=${literal(operation)} AND operator_id=${id(sessions[actor].identity.userId)}`));
  const digest=grievanceId=>hash(database(`SELECT * FROM hr_grievance WHERE tenant_id=100000 AND grievance_id=${id(grievanceId)}`)+database(`SELECT * FROM hr_grievance_record WHERE tenant_id=100000 AND grievance_id=${id(grievanceId)} ORDER BY record_id`));
  const deny=async(actor,url,method,body,grievanceId,label,options)=>{const before=grievanceId?digest(grievanceId):null;const response=await api(actor,url,method,body,options);check(label+'_rejected',[400,403,404,409,429].includes(response.status)&&response.body?.code!==200);if(before)check(label+'_business_unchanged',digest(grievanceId)===before);return response;};
  const origin=new URL(sessions.employee.page.url()).origin;
  for(const session of Object.values(sessions))session.page.setDefaultTimeout(30000);
  const uiPages={};
  for(const actor of ['employee','hr']){uiPages[actor]=await sessions[actor].context.newPage();uiPages[actor].setDefaultTimeout(30000);uiPages[actor].on('pageerror',()=>runtime.browserErrors.push(actor+'-ui'));}
  screenshot=async(actor,name)=>{await uiPages[actor].screenshot({path:path.join(output,name),fullPage:true});fixture.screenshots.push(name);save();};
  const open=async(actor,grievanceId)=>{await uiPages[actor].goto(origin+(actor==='employee'?'/hr/ess/grievances':'/hr/grievances')+'?id='+grievanceId,{waitUntil:'networkidle'});await uiPages[actor].getByRole('dialog').waitFor();};
  const submitBody=name=>({grievanceType:'OTHER',priority:'NORMAL',subject:fixture.marker+'-'+name,description:fixture.marker+'完整描述\n第二行事实',cause:fixture.marker+'起因',expectation:fixture.marker+'期望',againstType:'NONE',fileIds:[]});
  const submitted=(grievanceId,body)=>{
    const sample={id:id(grievanceId),body};fixture.grievances.push(sample);save();
    const actual=rows(`SELECT JSON_OBJECT('type',grievance_type,'subject',subject,'description',description,'cause',cause,'expectation',expectation,'against',against_type,'againstName',against_name,'employee',CAST(employee_id AS CHAR),'files',attachment_url) FROM hr_grievance WHERE tenant_id=100000 AND grievance_id=${sample.id}`)[0];
    check('complete_submission_'+sample.id,actual.subject===body.subject&&actual.description===body.description&&actual.cause===body.cause&&actual.expectation===body.expectation&&actual.type===body.grievanceType&&actual.against===body.againstType&&actual.employee===fixture.employeeId);
    check('submission_record_'+sample.id,records(sample.id).length===1&&records(sample.id)[0].type==='STATUS_CHANGE'&&records(sample.id)[0].operator===sessions.employee.identity.userId&&Boolean(records(sample.id)[0].time));
    check('submission_audit_'+sample.id,auditCount(sample.id,'SUBMIT','employee')===1);return sample;
  };
  const make=async(name,extra={})=>{const body={...submitBody(name),...extra};return submitted(await ok('employee',mine,'POST',body),body);};
  const upload=async(actor,label)=>{const bytes=Buffer.from(fixture.marker+'-'+label+'\n仅隔离验收材料','utf8'),name=fixture.marker+'-'+label+'.txt';const result=await ok(actor,(actor==='employee'?mine:manage)+'/files','POST',undefined,{file:{name,base64:bytes.toString('base64')}});const file={id:id(result.fileId),name,hash:hash(bytes),owner:actor};fixture.files.push(file);save();return file;};
  const fileMatches=async(actor,grievanceId,file)=>{const result=await api(actor,(actor==='employee'?mine:manage)+'/'+grievanceId+'/files/'+file.id);check('private_file_'+actor+'_'+file.id,result.status===200&&result.cache==='no-store'&&hash(Buffer.from(result.base64||'','base64'))===file.hash);};
  action=async(actor,sample,name,body,next)=>{
    const before=current(sample.id),beforeRecords=records(sample.id),beforeAudits=auditCount(sample.id,name.toUpperCase(),'employee'===actor?'employee':actor);
    await ok(actor,(actor==='employee'?mine:manage)+'/'+sample.id+'/'+name,'POST',body);
    const after=current(sample.id),afterRecords=records(sample.id),record=afterRecords.at(-1);
    check('state_'+sample.id+'_'+name,after.status===next);
    check('record_'+sample.id+'_'+name,afterRecords.length===beforeRecords.length+1&&record.operator===sessions[actor].identity.userId&&Boolean(record.time)&&Boolean(record.name)&&record.content.includes(before.status+' → '+next));
    check('audit_'+sample.id+'_'+name,auditCount(sample.id,name.toUpperCase(),actor)===beforeAudits+1);
    sample.status=after.status;save();return after;
  };
  const userId=id(sessions.employee.identity.userId);
  check('employee_account_unbound',database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId} AND deleted=0`)==='0');
  fixture.employeeBody={employeeNo:fixture.marker,name:fixture.marker+'员工',gender:'UNKNOWN',deptId:'100',employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2026-01-01',userId};
  fixture.employeeId=id(await ok('admin','/hr/employees','POST',fixture.employeeBody));save();
  const page=uiPages.employee;
  await page.goto(origin+'/hr/ess/grievances',{waitUntil:'networkidle'});await page.getByRole('button',{name:'提交申诉',exact:true}).click();
  const form=page.getByRole('dialog'),body=submitBody('电脑提交');body.grievanceType='SALARY';body.priority='HIGH';
  for(const [label,value] of [['申诉类型',body.grievanceType],['优先级',body.priority]])await form.locator('select').and(form.getByLabel(label)).selectOption(value);
  for(const [label,value] of [['标题',body.subject],['详细描述',body.description],['起因',body.cause],['期望结果',body.expectation]])await form.locator('input,textarea').and(form.getByLabel(label)).fill(value);
  const uploadBytes=Buffer.from(fixture.marker+'-原始附件\n完整保留','utf8'),uploadName=fixture.marker+'-原始附件.txt';
  const uploadResponse=page.waitForResponse(response=>response.url().endsWith('/api'+mine+'/files')&&response.request().method()==='POST');
  await form.locator('input[type=file]').setInputFiles({name:uploadName,mimeType:'text/plain',buffer:uploadBytes});
  const uploadResult=await (await uploadResponse).json();check('desktop_actual_upload',uploadResult.code===200);body.fileIds=[id(uploadResult.data.fileId)];
  const originalFile={id:body.fileIds[0],name:uploadName,hash:hash(uploadBytes),owner:'employee'};fixture.files.push(originalFile);save();
  await form.getByText(uploadName,{exact:true}).waitFor();await screenshot('employee','desktop-submission.png');
  const submitResponse=page.waitForResponse(response=>response.url().endsWith('/api'+mine)&&response.request().method()==='POST');
  await form.getByRole('button',{name:'确认提交',exact:true}).click();const submitResult=await (await submitResponse).json();check('desktop_actual_submission',submitResult.code===200);await form.waitFor({state:'hidden'});
  const main=submitted(submitResult.data,body);await fileMatches('employee',main.id,originalFile);await fileMatches('hr',main.id,originalFile);evidence.submission=true;
  await deny('employee',mine+'/'+main.id+'/resolve','POST',{content:'无权提前结论'},main.id,'employee_cannot_resolve');
  await deny('hr',manage+'/'+main.id+'/resolve','POST',{content:'未调查'},main.id,'cannot_resolve_submitted');
  await deny('employee',mine+'/'+main.id+'/confirm','POST',{satisfied:true},main.id,'cannot_confirm_submitted');
  const beforeView=auditCount(main.id,'VIEW','hr');await ok('hr',manage+'/'+main.id);check('view_audit_exactly_one',auditCount(main.id,'VIEW','hr')===beforeView+1);evidence.audits=true;
  await action('hr',main,'accept',{content:fixture.marker+'受理'},'ACCEPTED');check('accept_time_and_default_handler',Boolean(current(main.id).accepted)&&current(main.id).handler===sessions.hr.identity.userId);
  await deny('hr',manage+'/'+main.id+'/accept','POST',{},main.id,'repeat_accept_has_no_record');
  await deny('employee',mine+'/'+main.id+'/withdraw','POST',{},main.id,'accepted_cannot_withdraw');
  const internalFile=await upload('hr','内部附件'),internalContent=fixture.marker+'仅人事内部调查';
  await ok('hr',manage+'/'+main.id+'/comment','POST',{content:internalContent,visibleToEmployee:false,fileIds:[internalFile.id]});
  const employeeDetail=await ok('employee',mine+'/'+main.id),hrDetail=await ok('hr',manage+'/'+main.id);
  check('internal_record_projection',!JSON.stringify(employeeDetail).includes(internalContent)&&hrDetail.records.some(record=>record.content===internalContent));
  await deny('employee',mine+'/'+main.id+'/files/'+internalFile.id,'GET',undefined,main.id,'employee_internal_file_denied');await fileMatches('hr',main.id,internalFile);
  await deny('admin',manage+'/'+main.id,'GET',undefined,main.id,'unassigned_admin_private_detail_denied');await deny('admin',manage+'/'+main.id+'/files/'+originalFile.id,'GET',undefined,main.id,'unassigned_admin_private_file_denied');
  await open('employee',main.id);check('desktop_internal_record_hidden',!(await page.getByRole('dialog').innerText()).includes(internalContent));await screenshot('employee','desktop-private-detail.png');
  await page.setViewportSize({width:390,height:844});await open('employee',main.id);check('mobile_internal_record_hidden',!(await page.getByRole('dialog').innerText()).includes(internalContent));await screenshot('employee','mobile-private-detail.png');await page.setViewportSize({width:1440,height:1000});
  await action('hr',main,'investigate',{content:fixture.marker+'调查'},'INVESTIGATING');
  await action('hr',main,'resolve',{content:fixture.marker+'核实完成，结论完整保留'},'RESOLVED');
  await open('employee',main.id);await page.getByRole('dialog').getByRole('button',{name:'确认处理结论',exact:true}).click();
  const confirmation=page.getByRole('dialog',{name:'确认处理结论',exact:true});await confirmation.locator('input[type=checkbox]').and(confirmation.getByLabel('认可结论并关闭申诉',{exact:true})).check();await confirmation.locator('textarea').and(confirmation.getByLabel('说明',{exact:true})).fill(fixture.marker+'本人认可');await screenshot('employee','employee-confirmation.png');
  const confirmResponse=page.waitForResponse(response=>response.url().endsWith('/'+main.id+'/confirm')&&response.request().method()==='POST');
  await confirmation.getByRole('button',{name:'确认提交',exact:true}).click();check('ui_confirmation_success',(await (await confirmResponse).json()).code===200);await confirmation.waitFor({state:'hidden'});
  check('ui_confirmation_closed',current(main.id).status==='CLOSED'&&current(main.id).satisfied===1&&records(main.id).at(-1).content.includes('RESOLVED → CLOSED'));main.status='CLOSED';save();
  await deny('employee',mine+'/'+main.id+'/comment','POST',{content:'结束后追加'},main.id,'closed_immutable');evidence.privacy=true;
  console.log('D4_LIFECYCLE_PHASE: desktop_submission_and_private_records=passed; confirmed_closed=true');
  const reopen=await make('一次退回',{againstType:'POLICY',againstName:fixture.marker+'制度'});
  await action('hr',reopen,'accept',{},'ACCEPTED');await action('hr',reopen,'investigate',{},'INVESTIGATING');await action('hr',reopen,'resolve',{content:fixture.marker+'首次结论'},'RESOLVED');
  const originalCount=records(reopen.id).length;
  const racing=await Promise.all([api('employee',mine+'/'+reopen.id+'/confirm','POST',{satisfied:false,content:fixture.marker+'退回甲'},{immediate:true}),api('employee',mine+'/'+reopen.id+'/confirm','POST',{satisfied:false,content:fixture.marker+'退回乙'},{immediate:true})]);
  check('concurrent_reject_once',racing.filter(result=>result.status===200&&result.body?.code===200).length===1&&racing.filter(result=>[400,409,429].includes(result.status)).length===1&&records(reopen.id).length===originalCount+1&&current(reopen.id).status==='INVESTIGATING'&&current(reopen.id).satisfied===0);
  await action('hr',reopen,'resolve',{content:fixture.marker+'再次调查结论'},'RESOLVED');
  await deny('employee',mine+'/'+reopen.id+'/confirm','POST',{satisfied:false,content:fixture.marker+'第二次退回'},reopen.id,'second_disagreement_rejected');
  await action('employee',reopen,'confirm',{satisfied:true,content:fixture.marker+'再次结论认可'},'CLOSED');evidence.confirmation=true;
  const withdrawn=await make('撤回',{againstType:'DEPT',againstId:'100'});
  await action('employee',withdrawn,'withdraw',{content:fixture.marker+'主动撤回'},'WITHDRAWN');await deny('hr',manage+'/'+withdrawn.id+'/accept','POST',{},withdrawn.id,'withdrawn_cannot_accept');
  const targeted=await make('被指向人隔离',{againstType:'USER',againstId:sessions.hr.identity.userId,fileIds:[originalFile.id]});
  await deny('hr',manage+'/'+targeted.id,'GET',undefined,targeted.id,'targeted_hr_detail_denied');await deny('hr',manage+'/'+targeted.id+'/files/'+originalFile.id,'GET',undefined,targeted.id,'targeted_hr_file_denied');await deny('hr',manage+'/'+targeted.id+'/accept','POST',{},targeted.id,'targeted_hr_action_denied');
  check('targeted_hr_list_excluded',!(await ok('hr',manage+'?pageNum=1&pageSize=100')).rows.some(row=>String(row.grievanceId)===targeted.id));
  await action('employee',targeted,'withdraw',{content:fixture.marker+'隔离验证完成'},'WITHDRAWN');evidence.targets=true;
  for(const investigateFirst of [false,true]){
    const sample=await make(investigateFirst?'调查后升级':'受理后升级',{fileIds:[originalFile.id]});
    await action('hr',sample,'accept',{},'ACCEPTED');if(investigateFirst)await action('hr',sample,'investigate',{},'INVESTIGATING');
    await ok('hr',manage+'/'+sample.id+'/comment','POST',{content:internalContent,visibleToEmployee:false,fileIds:[internalFile.id]});
    const history=(await ok('hr',manage+'/'+sample.id)).records;
    const beforeCount=records(sample.id).length,beforeAudits=auditCount(sample.id,'ESCALATE','hr'),reason=fixture.marker+'涉及劳动争议需升级';
    await ok('hr',manage+'/'+sample.id+'/escalate','POST',{content:reason});
    const after=current(sample.id);sample.status=after.status;sample.disputeId=id(after.disputeId);save();
    check('escalation_status_and_records_'+sample.id,after.status==='ESCALATED'&&records(sample.id).length===beforeCount+2&&records(sample.id).at(-1).type==='ESCALATE'&&auditCount(sample.id,'ESCALATE','hr')===beforeAudits+1);
    const attached=rows(`SELECT JSON_OBJECT('fileId',CAST(file_id AS CHAR)) FROM hr_dispute_evidence WHERE tenant_id=100000 AND dispute_id=${sample.disputeId} AND deleted=0 ORDER BY id`);
    const fileSet=attached.map(item=>item.fileId);check('escalation_original_and_internal_files_'+sample.id,fileSet.length===3&&fileSet.includes(originalFile.id)&&fileSet.includes(internalFile.id));
    const archiveId=id(fileSet.find(fileId=>!fixture.files.some(file=>file.id===fileId))),archiveResponse=await api('hr',manage+'/'+sample.id+'/files/'+archiveId);
    check('archive_download_'+sample.id,archiveResponse.status===200&&Boolean(archiveResponse.base64));
    const archive=JSON.parse(Buffer.from(archiveResponse.base64,'base64').toString('utf8'));
    check('archive_full_original_content_'+sample.id,archive.grievance.description===sample.body.description&&archive.grievance.expectation===sample.body.expectation&&archive.grievance.cause===sample.body.cause&&archive.escalationReason===reason&&JSON.stringify(archive.records)===JSON.stringify(history));
    sample.archiveId=archiveId;save();await deny('employee',mine+'/'+sample.id+'/files/'+archiveId,'GET',undefined,sample.id,'employee_archive_denied_'+sample.id);
    const disputeCount=database('SELECT COUNT(*) FROM hr_labor_dispute'),evidenceCount=database('SELECT COUNT(*) FROM hr_dispute_evidence');
    await deny('hr',manage+'/'+sample.id+'/escalate','POST',{content:reason},sample.id,'repeat_escalation_'+sample.id);
    check('repeat_escalation_no_new_dispute_'+sample.id,database('SELECT COUNT(*) FROM hr_labor_dispute')===disputeCount&&database('SELECT COUNT(*) FROM hr_dispute_evidence')===evidenceCount);
    await open('hr',sample.id);await screenshot('hr',investigateFirst?'investigated-escalation.png':'accepted-escalation.png');
  }
  evidence.escalation=true;evidence.transitions=true;evidence.records=true;
  const messages=()=>rows(`SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'receiver',CAST(receiver_id AS CHAR),'status',send_status,'title',title,'content',content,'url',link_url,'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='HR_GRIEVANCE' AND biz_id=${literal(main.id)} ORDER BY record_id`);
  let delivered;
  for(let attempt=0;attempt<90;attempt++){delivered=messages();if(delivered.filter(message=>message.channel==='INTERNAL'&&message.receiver===userId&&message.status==='SUCCESS').length>=2)break;if(attempt>0&&attempt%30===0)console.log('D4_LIFECYCLE_PHASE: waiting_for_owned_in_app_notifications');await new Promise(resolve=>setTimeout(resolve,1000));}
  const hrUsers=rows(`SELECT DISTINCT JSON_OBJECT('id',CAST(u.user_id AS CHAR)) FROM sys_user u JOIN sys_user_role ur ON ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=u.tenant_id WHERE u.tenant_id=100000 AND u.deleted=0 AND u.status='0' AND r.deleted=0 AND r.status='0' AND r.role_key='hr'`).map(row=>row.id).filter(value=>value!==userId);
  const inApp=delivered.filter(message=>message.channel==='INTERNAL');
  check('submission_notifications_each_hr_once',hrUsers.every(receiver=>inApp.filter(message=>message.receiver===receiver&&message.title==='有新的员工申诉待受理'&&message.status==='SUCCESS').length===1));
  check('acceptance_and_resolution_notifications_each_once',inApp.filter(message=>message.receiver===userId&&message.title==='您的申诉处理进度已更新'&&message.status==='SUCCESS').length===2);
  check('notification_no_private_description',delivered.every(message=>![body.subject,body.description,internalContent].some(value=>String(message.content).includes(value))));
  check('notification_recipient_scope',inApp.every(message=>[userId,...hrUsers].includes(message.receiver)));
  fixture.notifications=inApp.map(({id,receiver,status,title,url})=>({id,receiver,status,title,url}));save();evidence.notifications=true;
  check('no_browser_runtime_errors',runtime.browserErrors.length===0);evidence.browser=true;
  console.log('D4_LIFECYCLE_PHASE: transitions=6; target_types=4; disagreement_once=passed; escalation_paths=2; notifications=passed');
} catch(error){failure=error;try{if(screenshot)await screenshot('employee','failure.png');}catch{}}
finally {
  const restore=async(label,operation)=>{try{await operation();fixture.restorations[label]=true;}catch(error){fixture.restorations[label]=false;failure||=error;}save();};
  await restore('grievances',async()=>{
    for(const sample of fixture.grievances){let state=current(sample.id);if(['CLOSED','WITHDRAWN','ESCALATED'].includes(state.status))continue;
      if(state.status==='SUBMITTED'){await ok('employee',mine+'/'+sample.id+'/withdraw','POST',{content:fixture.marker+'本轮验证收尾'});}
      else {if(state.status==='ACCEPTED')await ok('hr',manage+'/'+sample.id+'/investigate','POST',{content:fixture.marker+'本轮收尾调查'});state=current(sample.id);if(state.status==='INVESTIGATING')await ok('hr',manage+'/'+sample.id+'/resolve','POST',{content:fixture.marker+'本轮隔离验证结束'});await ok('employee',mine+'/'+sample.id+'/confirm','POST',{satisfied:true,content:fixture.marker+'本轮收尾认可'});}
      sample.cleanupStatus=current(sample.id).status;save();
    }
  });
  await restore('employeeBinding',async()=>{if(!fixture.employeeId)return;runtime.check('only_owned_employee_unbound',runtime.database(`SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND id=${fixture.employeeId}`)===fixture.employeeBody.userId);await ok('admin','/hr/employees/'+fixture.employeeId,'PUT',{...fixture.employeeBody,userId:null});runtime.check('employee_account_restored_unbound',runtime.database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${fixture.employeeBody.userId} AND deleted=0`)==='0');});
  evidence.restoration=Object.values(fixture.restorations).every(Boolean);
  if(runtime){
    try{const final=preserved();for(const [table]of tables)runtime.check('original_'+table+'_unchanged',final[table]===originalDigests[table]);runtime.check('original_grants_unchanged',roles()===originalRoles);evidence.preservation=true;}catch(error){failure||=error;}
    try{console.log('D4_LIFECYCLE_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();const raw=failure?String(failure.message).split('\n')[0].slice(0,220):undefined;
  const safe=raw&&[...(runtime?.sensitive||[])].every(value=>!raw.includes(value))?raw:failure?'D4 lifecycle verification failed':undefined;
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,grievances:fixture.grievances.length,all13Complete:false,globalComplete:false,remaining:['Full cross-tenant and unrelated-employee permission matrix','Related salary and performance navigation','Workday reminders and statistics','Mobile full form submission'],failure:safe},null,2));
  console.log(`D4_LIFECYCLE_SUMMARY: checks=${runtime?.checks.length||0}; failed=${failure?1:0}; requests=${runtime?.requests.length||0}; grievances=${fixture.grievances.length}; preservation=${evidence.preservation}; restoration=${evidence.restoration}; all13_complete=false`);
  if(failure){console.log('D4_LIFECYCLE_FAILURE: '+safe);process.exitCode=1;}
}
