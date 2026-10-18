import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createE1ActivityRuntime } from './runtime-checks/e1-activity-runtime.mjs';

assert.ok(process.argv.includes('--e1-conflicts'));
const output=process.argv[process.argv.indexOf('--output')+1];assert.ok(output);
const runtime=await createE1ActivityRuntime('D:/CloudFlowPro',output);
const {check,ok,api,database,sessions}=runtime;
const marker='E1CON_'+randomUUID().replaceAll('-','').slice(0,12);
const digest=value=>createHash('sha256').update(value).digest('hex');
const at=value=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,19).replace('T',' ');};
const begin=new Date();begin.setFullYear(begin.getFullYear()+10);begin.setMilliseconds(0);
const start=at(begin),end=at(begin.getTime()+3600000);
const owned=new Set(),originals=[],uiRequests=[];
const result={marker,passed:false,conflicts:false,privacy:false,states:false,ui:false,preservation:false,secrets:false,allAcceptanceComplete:false};
for(const [table,key] of [['crm_activity','activity_id'],['crm_activity_participant','participant_id'],['crm_activity_reminder','reminder_id'],['crm_customer','customer_id'],['crm_follow_up','follow_up_id']]){
  const maximum=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);assert.match(maximum,/^\d+$/);
  const query='SELECT * FROM '+table+' WHERE '+key+'<='+maximum+' ORDER BY '+key;
  originals.push({table,query,hash:digest(database(query))});
}
const grants=digest(database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
const member={participantType:'USER',participantRefId:Number(sessions.manager.identity.userId),acceptanceStatus:'NONE'};
const create=async(actor,suffix)=>{
  const detail=await ok(actor,'/crm/activity','POST',{activity:{activityType:'MEETING',subject:marker+'_'+suffix,status:'PLANNED',priority:'MEDIUM',bizType:'NONE',startTime:start,endTime:end,description:marker+'_private_description'},participants:[member],reminders:[]});
  check('saved_'+suffix,detail.activity.activityId>0);owned.add(detail.activity.activityId);return detail;
};
const detail=(id,actor='sales')=>ok(actor,'/crm/activity/'+id);
const denied=(value,label)=>check(label,[400,403,404,409].includes(value.status)||[400,403,404,409].includes(value.body?.code));
let failure,page;
try{
  const other=await create('admin','private_other');
  let source=await create('sales','source');
  const sourceId=source.activity.activityId,otherId=other.activity.activityId;
  check('shared_participant_conflict_saved',source.conflicts.length===1);
  const busy=source.conflicts[0];
  check('private_busy_period_only',busy.subject==='忙碌时段'&&busy.startTime===start&&busy.endTime===end&&Object.entries(busy).every(([key,value])=>['subject','startTime','endTime'].includes(key)||value===null));
  check('admin_sees_authorized_conflict',(await detail(sourceId,'admin')).conflicts.some(value=>value.activityId===otherId&&value.subject===other.activity.subject));
  check('participant_sees_both_activities',(await detail(sourceId,'manager')).conflicts.some(value=>value.activityId===otherId&&value.subject===other.activity.subject));
  denied(await api('sales','/crm/activity/'+otherId),'private_detail_remains_denied');
  denied(await api('foreign','/crm/activity/'+sourceId),'foreign_detail_denied');
  denied(await api('employee','/crm/activity/'+sourceId),'employee_detail_denied');
  result.conflicts=true;result.privacy=true;
  const origin=new URL(sessions.sales.page.url()).origin;
  for(const actor of ['sales','manager']){
    page=await sessions[actor].context.newPage();page.setDefaultTimeout(30000);
    page.on('pageerror',()=>runtime.browserErrors.push('conflicts_'+actor));
    page.on('response',response=>{const url=new URL(response.url());if(url.pathname.startsWith('/api/'))uiRequests.push({actor,path:url.pathname,method:response.request().method(),status:response.status()});});
    await page.goto(origin+'/office/crm/activity?activityId='+sourceId,{waitUntil:'networkidle'});
    const dialog=page.getByRole('dialog',{name:source.activity.subject,exact:true});await dialog.waitFor();
    const notice=dialog.locator('.crm-ops-warning');await notice.waitFor();
    const message=await notice.innerText();
    check('ui_conflict_'+actor,actor==='sales'?message.includes('忙碌时段')&&!message.includes(other.activity.subject):message.includes(other.activity.subject));
    if(actor==='sales'){
      await dialog.locator('textarea').first().fill('存在时间冲突时仍可保存');
      const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/crm/activity'&&response.request().method()==='PUT');
      await dialog.getByRole('button',{name:'保存活动',exact:true}).click();
      const response=await pending,body=await response.json();
      check('ui_conflict_does_not_block_save',response.status()===200&&body.code===200&&body.data.conflicts.length===1);
      check('ui_saved_description_persisted',database('SELECT description FROM crm_activity WHERE activity_id='+sourceId)==='存在时间冲突时仍可保存');
      await page.reload({waitUntil:'networkidle'});await page.getByRole('dialog',{name:source.activity.subject,exact:true}).locator('.crm-ops-warning').waitFor();
      check('ui_reopened_keeps_private_notice',!(await page.getByRole('dialog',{name:source.activity.subject,exact:true}).innerText()).includes(other.activity.subject));
    }
    await page.screenshot({path:path.join(output,'conflicts-'+actor+'.png'),fullPage:true});
  }
  result.ui=true;
  const respond=(id,state)=>ok('manager','/crm/activity/'+id+'/respond','POST',{acceptanceStatus:state});
  await respond(sourceId,'DECLINED');
  check('declined_source_participant_releases_conflict',(await detail(sourceId)).conflicts.length===0);
  await respond(sourceId,'NONE');await respond(otherId,'DECLINED');
  check('declined_other_participant_releases_conflict',(await detail(sourceId)).conflicts.length===0);
  await respond(otherId,'TENTATIVE');
  check('tentative_participant_keeps_conflict',(await detail(sourceId)).conflicts.length===1);
  source=await detail(sourceId);
  source=await ok('sales','/crm/activity','PUT',{activity:source.activity,participants:[],reminders:[]});
  check('removed_source_participant_releases_conflict',source.conflicts.length===0);
  source=await ok('sales','/crm/activity','PUT',{activity:source.activity,participants:[member],reminders:[]});
  check('rejoined_participant_restores_conflict',source.conflicts.length===1);
  source=await ok('sales','/crm/activity/'+sourceId+'/complete','POST',{version:source.activity.version,generateFollowUp:false});
  check('completed_source_has_no_conflict',source.conflicts.length===0);
  result.states=true;
  check('browser_no_runtime_errors',runtime.browserErrors.length===0);
  check('ui_requests_all_successful',uiRequests.every(value=>value.status<400));
}catch(error){
  failure=error instanceof Error?error.message:'E1 conflicts failed';
  if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'conflicts-failure.png'),fullPage:true}).catch(()=>{});
}finally{
  const finalFailures=[];
  const finalize=async task=>{try{await task();}catch(error){const message=error instanceof Error?error.message:'Conflict final verification failed';finalFailures.push(message);failure||=message;}};
  for(const id of owned)await finalize(()=>ok('admin','/crm/activity/'+id,'DELETE'));
  for(const original of originals)await finalize(()=>check('original_rows_preserved_'+original.table,digest(database(original.query))===original.hash));
  await finalize(()=>check('role_grants_preserved',digest(database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'))===grants));
  result.preservation=finalFailures.length===0;
  await finalize(async()=>{result.secretScan=await runtime.scan();result.secrets=true;});result.finalFailures=finalFailures;
  await runtime.close();result.passed=!failure;result.failure=failure;result.checks=runtime.checks;result.requests=runtime.requests;result.uiRequests=uiRequests;result.verifiedAt=new Date().toISOString();
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log('E1_CONFLICTS: passed='+result.passed+'; checks='+runtime.checks.length+'; requests='+runtime.requests.length+'; ui_requests='+uiRequests.length+'; conflicts='+result.conflicts+'; privacy='+result.privacy+'; states='+result.states+'; ui='+result.ui+'; all_acceptance_complete=false');
}
if(failure)throw new Error(failure);
