import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createE1ActivityRuntime } from './runtime-checks/e1-activity-runtime.mjs';

assert.ok(process.argv.includes('--e1-activity'));
const output=process.argv[process.argv.indexOf('--output')+1];assert.ok(output);
const runtime=await createE1ActivityRuntime('D:/CloudFlowPro',output);
const {check,ok,rows,database,sessions,state,run}=runtime;
const recipientId=Number(sessions.admin.identity.userId);
assert.ok(Number.isSafeInteger(recipientId)&&recipientId>0);
const marker='E1I_'+randomUUID().replaceAll('-','').slice(0,12);
const quote=value=>"CONVERT(UNHEX('"+Buffer.from(String(value)).toString('hex')+"') USING utf8mb4)";
const digest=value=>createHash('sha256').update(value).digest('hex');
const owned=new Set(),deleted=new Set(),originals=[],executions=[],observations=[];
const result={marker,passed:false,queuedRevocations:false,ordinaryEdit:false,newSchedule:false,queuedInternalActualCheckComplete:false,preservation:false,secrets:false,allAcceptanceComplete:false};
for(const[table,key]of[['crm_activity','activity_id'],['crm_activity_participant','participant_id'],['crm_activity_reminder','reminder_id'],['crm_customer','customer_id'],['crm_follow_up','follow_up_id'],['sys_message_channel','channel_id'],['sys_message_template','template_id'],['sys_message_subscribe','subscribe_id'],['sys_message_record','record_id'],['sys_message_delivery','delivery_id']]){
  const last=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);assert.match(last,/^\d+$/);
  const columns=database("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name="+quote(table)+' ORDER BY ordinal_position').split(/\r?\n/);
  assert.ok(columns.length>0&&columns.every(column=>/^[a-z_]+$/.test(column)));
  const query='SELECT '+key+',SHA2(JSON_ARRAY('+columns.map(column=>'`'+column+'`').join(',')+'),256) FROM '+table+' WHERE '+key+'<='+last+' ORDER BY '+key;
  originals.push({table,last,query,hash:digest(database(query))});
}
const grantsQuery='SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id';
const usersQuery='SELECT user_id,tenant_id,user_name,nick_name,email,phonenumber,status,deleted FROM sys_user ORDER BY user_id';
const jobQuery="SELECT job_id,tenant_id,job_name,job_group,service_name,handler_name,handler_param,trigger_type,cron_expression,interval_ms,status,concurrent_flag,misfire_strategy,retry_count,timeout_seconds,lock_time_seconds,alarm_on_fail_flag,deleted FROM sys_job WHERE handler_name IN ('crmActivityReminder','crmActivityOverdue','messageDeliveryRecovery') ORDER BY job_id";
const grants=digest(database(grantsQuery)),users=digest(database(usersQuery)),jobs=digest(database(jobQuery));
const waitFor=async(read,accept,label,timeout=45000)=>{
  const until=Date.now()+timeout;
  do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,250));}while(Date.now()<until);
  throw new Error(label);
};
const at=minutes=>database("SELECT DATE_FORMAT(TIMESTAMPADD(MINUTE,"+minutes+",NOW()),'%Y-%m-%d %H:%i:%s')");
const detail=id=>ok('admin','/crm/activity/'+id);
const subscription=()=>rows("SELECT JSON_OBJECT('id',subscribe_id,'enabled',enabled_flag,'start',CAST(quiet_start AS CHAR),'end',CAST(quiet_end AS CHAR)) FROM sys_message_subscribe WHERE tenant_id=100000 AND user_id="+quote(recipientId)+" AND message_category='BIZ_REMINDER' AND channel_type='INTERNAL'");
const pendingOutside=()=>database("SELECT COUNT(*) FROM crm_activity a JOIN crm_activity_reminder r ON r.activity_id=a.activity_id AND r.tenant_id=a.tenant_id WHERE a.deleted=0 AND a.status IN ('PLANNED','IN_PROGRESS') AND r.sent_flag=0 AND TIMESTAMPADD(MINUTE,-r.remind_minutes_before,a.start_time)<=NOW()"+(owned.size?' AND a.activity_id NOT IN ('+[...owned].join(',')+')':''));
const records=id=>rows("SELECT JSON_OBJECT('id',r.record_id,'channel',r.channel_type,'receiver',r.receiver_id,'recordStatus',r.send_status,'deliveryStatus',d.status,'attempts',d.attempt_count,'reason',d.last_error_code,'accepted',d.accepted_time IS NOT NULL,'event',r.outbox_event_id,'link',r.link_url,'due',d.next_attempt_time IS NOT NULL AND d.next_attempt_time<=NOW()) FROM sys_message_record r JOIN sys_message_delivery d ON d.tenant_id=r.tenant_id AND d.record_id=r.record_id WHERE r.tenant_id=100000 AND r.biz_type='CRM_ACTIVITY' AND r.biz_id="+quote(id)+' ORDER BY r.record_id');
const oldDeliveryLimit=originals.find(value=>value.table==='sys_message_delivery').last;
const trigger=async(handler,label)=>{
  assert.ok(['crmActivityReminder','messageDeliveryRecovery'].includes(handler));
  check('no_original_due_'+label,pendingOutside()==='0');
  check('no_original_pending_'+label,database("SELECT COUNT(*) FROM sys_message_delivery WHERE status IN ('PENDING','CLAIMED','SENDING','RETRYABLE') AND delivery_id<="+oldDeliveryLimit)==='0');
  check('no_original_expiry_'+label,database("SELECT COUNT(*) FROM sys_message_delivery WHERE payload_encrypted IS NOT NULL AND status IN ('SENT','FAILED','SKIPPED','CANCELLED') AND claim_owner IS NULL AND update_time<DATE_SUB(NOW(),INTERVAL 30 DAY)")==='0');
  const jobId=database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND deleted=0 AND status='PAUSED' AND handler_name="+quote(handler));assert.match(jobId,/^\d+$/);
  const execution=await ok('admin','/auth/system/job/'+jobId+'/trigger','POST',{});
  check('accepted_'+label,execution.accepted===true&&/^[a-f0-9-]{36}$/.test(execution.executeNo));
  const terminal=await waitFor(()=>rows("SELECT JSON_OBJECT('id',log_id,'status',execute_status,'report',report_time IS NOT NULL,'end',end_time IS NOT NULL) FROM sys_job_log WHERE execute_no="+quote(execution.executeNo)),value=>value.length===1&&value[0].status!=='RUNNING','Task not terminal: '+label);
  const log=await ok('admin','/auth/system/job/log/'+terminal[0].id);
  check('task_terminal_'+label,terminal[0].status==='SUCCESS'&&terminal[0].report&&terminal[0].end&&log.executeNo===execution.executeNo&&log.executeStatus==='SUCCESS');
  executions.push({handler,label,executeNo:execution.executeNo,logId:terminal[0].id,status:terminal[0].status});
};
const create=async label=>{
  const participant=label==='decline';
  const value=await ok('admin','/crm/activity','POST',{activity:{activityType:'MEETING',subject:marker+'_'+label,status:'PLANNED',priority:'MEDIUM',startTime:at(-1),endTime:at(59),bizType:'NONE',ownerId:participant?3:recipientId,location:marker+'_location'},participants:participant?[{participantType:'USER',participantRefId:recipientId,acceptanceStatus:'ACCEPTED'}]:[],reminders:[{channelType:'INTERNAL',remindMinutesBefore:0}]});
  owned.add(value.activity.activityId);return value.activity.activityId;
};
let failure,quiet,subscriptionId,baselineSettings,quietConfigured=false,mailSnapshot;
try{
  check('real_admin_recipient_has_employee',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND user_id='+quote(recipientId))==='1');
  check('no_original_target_subscription',subscription().length===0);
  check('no_original_due_before',pendingOutside()==='0');
  check('no_pending_delivery_before',database("SELECT COUNT(*) FROM sys_message_delivery WHERE status IN ('PENDING','CLAIMED','SENDING','RETRYABLE')")==='0');
  check('no_external_channel_enabled',database("SELECT COUNT(*) FROM sys_message_channel WHERE deleted=0 AND status='ENABLED' AND channel_type<>'INTERNAL'")==='0');
  check('both_tasks_paused',database("SELECT COUNT(*) FROM sys_job WHERE tenant_id=100000 AND deleted=0 AND status='PAUSED' AND handler_name IN ('crmActivityReminder','messageDeliveryRecovery')")==='2');
  const settings=await fs.readFile(path.join(run,'auth/integration.properties'),'utf8');
  check('known_payload_retention',settings.split(/\r?\n/).filter(line=>/^cloudflow\.message\.delivery\.payload-retention-days=/.test(line)).every(line=>line.endsWith('=30')));
  mailSnapshot=JSON.parse(await fs.readFile(path.join(state.smtpFixture.directory,'snapshot.json'),'utf8'));
  baselineSettings=await ok('admin','/auth/system/message/subscribe/mine');
  const target=baselineSettings.find(value=>value.messageCategory==='BIZ_REMINDER'&&value.channelType==='INTERNAL');
  check('default_subscription_open',target?.enabledFlag===1&&!target.quietStart&&!target.quietEnd);
  quiet=rows("SELECT JSON_OBJECT('start',DATE_FORMAT(TIMESTAMPADD(MINUTE,-1,NOW()),'%H:%i:%s'),'end',DATE_FORMAT(TIMESTAMPADD(SECOND,120,NOW()),'%H:%i:%s'),'sameDay',DATE(NOW())=DATE(TIMESTAMPADD(SECOND,120,NOW())))")[0];
  check('bounded_quiet_window',quiet.sameDay===true);
  quietConfigured=true;
  await ok('admin','/auth/system/message/subscribe/mine','PUT',[{messageCategory:'BIZ_REMINDER',channelType:'INTERNAL',enabledFlag:1,quietStart:quiet.start,quietEnd:quiet.end}]);
  const stored=subscription();subscriptionId=stored[0]?.id;
  check('owned_quiet_subscription_created',stored.length===1&&stored[0].enabled===1&&stored[0].start===quiet.start&&stored[0].end===quiet.end&&subscriptionId>Number(originals.find(value=>value.table==='sys_message_subscribe').last));
  const cases={};
  for(const label of ['edit','reschedule','cancel','delete','complete','remove_reminder','decline'])cases[label]=await create(label);
  await trigger('crmActivityReminder','initial');
  const initial={};
  for(const[label,id]of Object.entries(cases)){
    initial[label]=await waitFor(()=>records(id),value=>value.length===(label==='decline'?2:1)&&value.filter(row=>row.receiver===recipientId).length===1&&value.filter(row=>row.receiver===recipientId).every(row=>row.deliveryStatus==='PENDING'&&row.reason==='QUIET_HOURS'),'Quiet internal delivery absent: '+label);
    check('not_sent_during_quiet_'+label,initial[label].filter(row=>row.receiver===recipientId).every(row=>row.channel==='INTERNAL'&&row.recordStatus==='PENDING'&&row.attempts===0&&!row.accepted&&!row.due));
    if(label==='decline')check('unrestricted_owner_received',initial[label].filter(row=>row.receiver===3).length===1&&initial[label].filter(row=>row.receiver===3).every(row=>row.deliveryStatus==='SENT'&&row.attempts===1));
    observations.push({label:'initial_'+label,activityId:id,records:initial[label]});
  }
  let current=await detail(cases.edit);const stableIds=current.reminders.map(row=>row.reminderId);
  current=await ok('admin','/crm/activity','PUT',{...current,activity:{...current.activity,description:'免打扰期间普通编辑保留提醒'}});
  check('ordinary_edit_preserves_pending_id',current.reminders.length===1&&current.reminders.every(row=>stableIds.includes(row.reminderId)&&row.sentFlag===1));
  current=await detail(cases.reschedule);const oldIds=current.reminders.map(row=>row.reminderId);
  current=await ok('admin','/crm/activity','PUT',{activity:{...current.activity,startTime:at(120),endTime:at(180)}});
  check('reschedule_replaces_pending_id',current.reminders.length===1&&current.reminders.every(row=>!oldIds.includes(row.reminderId)&&row.sentFlag===0));
  current=await detail(cases.cancel);await ok('admin','/crm/activity/'+cases.cancel+'/cancel','POST',{version:current.activity.version});
  await ok('admin','/crm/activity/'+cases.delete,'DELETE');deleted.add(cases.delete);
  current=await detail(cases.complete);await ok('admin','/crm/activity/'+cases.complete+'/complete','POST',{version:current.activity.version,resultSummary:marker,generateFollowUp:false});
  current=await detail(cases.remove_reminder);current=await ok('admin','/crm/activity','PUT',{...current,reminders:[]});check('reminder_setting_removed',current.reminders.length===0);
  await ok('admin','/crm/activity/'+cases.decline+'/respond','POST',{acceptanceStatus:'DECLINED'});
  check('self_decline_recorded',(await detail(cases.decline)).participants.some(member=>member.participantRefId===recipientId&&member.acceptanceStatus==='DECLINED'));
  check('all_changes_before_delivery',Object.values(cases).flatMap(records).filter(row=>row.receiver===recipientId).every(row=>row.deliveryStatus==='PENDING'&&row.attempts===0&&!row.accepted&&!row.due));
  await waitFor(()=>Object.values(cases).flatMap(records).filter(row=>row.receiver===recipientId),value=>value.length===7&&value.every(row=>row.due),'Natural quiet window did not finish',150000);
  await trigger('messageDeliveryRecovery','after_quiet');
  for(const[label,id]of Object.entries(cases)){
    const observed=await waitFor(()=>records(id),value=>value.every(row=>!['PENDING','CLAIMED','SENDING','RETRYABLE'].includes(row.deliveryStatus)),'Internal recovery not terminal: '+label);
    const targetRow=observed.find(row=>row.receiver===recipientId);
    check('internal_source_'+label,label==='edit'?targetRow.deliveryStatus==='SENT'&&targetRow.recordStatus==='SUCCESS'&&targetRow.attempts===1&&targetRow.accepted:targetRow.deliveryStatus==='SKIPPED'&&targetRow.recordStatus==='SKIPPED'&&targetRow.attempts===0&&!targetRow.accepted&&targetRow.reason===(label==='decline'?'SOURCE_RECIPIENT_REMOVED':'SOURCE_EXPIRED'));
    check('same_internal_record_'+label,observed.every(row=>initial[label].some(old=>old.id===row.id&&old.event===row.event)));
    observations.push({label:'recovered_'+label,activityId:id,records:observed});
  }
  result.queuedRevocations=true;result.ordinaryEdit=true;
  const beforeRepeat=digest(JSON.stringify(Object.values(cases).flatMap(records)));
  await trigger('messageDeliveryRecovery','repeat');
  check('recovery_repeat_unchanged',digest(JSON.stringify(Object.values(cases).flatMap(records)))===beforeRepeat);
  current=await detail(cases.reschedule);check('future_activity_waits',current.reminders.every(row=>row.sentFlag===0));
  await ok('admin','/crm/activity','PUT',{activity:{...current.activity,startTime:at(-1),endTime:at(59)}});
  await trigger('crmActivityReminder','new_schedule');
  const fresh=await waitFor(()=>records(cases.reschedule),value=>value.length===2&&value.some(row=>row.deliveryStatus==='SENT'),'New internal reminder absent');
  const newest=fresh.find(row=>!initial.reschedule.some(old=>old.id===row.id));
  check('new_schedule_new_identity',newest?.deliveryStatus==='SENT'&&newest.attempts===1&&newest.event!==initial.reschedule[0].event);
  check('old_schedule_never_attempted',fresh.find(row=>row.id===initial.reschedule[0].id)?.attempts===0&&fresh.find(row=>row.id===initial.reschedule[0].id)?.deliveryStatus==='SKIPPED');
  observations.push({label:'new_schedule',activityId:cases.reschedule,records:fresh});result.newSchedule=true;
  const finalRows=Object.values(cases).flatMap(records),finalHash=digest(JSON.stringify(finalRows));
  await trigger('crmActivityReminder','repeat_new_schedule');
  check('new_schedule_not_repeated',digest(JSON.stringify(Object.values(cases).flatMap(records)))===finalHash);
  check('exact_internal_outcome',finalRows.length===9&&finalRows.every(row=>row.channel==='INTERNAL')&&finalRows.filter(row=>row.deliveryStatus==='SKIPPED'&&row.attempts===0).length===6&&finalRows.filter(row=>row.deliveryStatus==='SENT'&&row.attempts===1).length===3);
  result.internal={initialQuietPending:7,skipped:6,sent:3,attempts:3};result.queuedInternalActualCheckComplete=true;
  check('no_browser_errors',runtime.browserErrors.length===0);
}catch(error){failure=error instanceof Error?error.message:'Internal reminder verification failed';}
finally{
  const cleanupFailures=[];
  for(const id of owned){if(deleted.has(id))continue;try{await ok('admin','/crm/activity/'+id,'DELETE');deleted.add(id);}catch{cleanupFailures.push('activity_'+id);}}
  try{
    if(quietConfigured){
      const current=subscription();
      if(!subscriptionId&&current.length===1&&current[0].id>Number(originals.find(value=>value.table==='sys_message_subscribe').last))subscriptionId=current[0].id;
      check('owned_subscription_unchanged_before_restore',current.length===1&&current[0].id===subscriptionId&&current[0].enabled===1&&current[0].start===quiet.start&&current[0].end===quiet.end);
      await ok('admin','/auth/system/message/subscribe/mine','PUT',[{messageCategory:'BIZ_REMINDER',channelType:'INTERNAL',enabledFlag:1,quietStart:null,quietEnd:null}]);
      const restored=subscription();
      check('own_subscription_restored_to_default',restored.length===1&&restored[0].id===subscriptionId&&restored[0].enabled===1&&restored[0].start===null&&restored[0].end===null);
      check('effective_subscriptions_restored',digest(JSON.stringify(await ok('admin','/auth/system/message/subscribe/mine')))===digest(JSON.stringify(baselineSettings)));
      result.subscription={id:subscriptionId,userId:recipientId,newRecord:true,restoredToDefault:true};
    }
    check('owned_records_cleanup',cleanupFailures.length===0);
    for(const original of originals)check('original_rows_preserved_'+original.table,digest(database(original.query))===original.hash);
    check('original_role_grants_preserved',digest(database(grantsQuery))===grants);
    check('original_contacts_preserved',digest(database(usersQuery))===users);
    check('original_job_configuration_preserved',digest(database(jobQuery))===jobs);
    check('no_original_due_after',pendingOutside()==='0');
    if(mailSnapshot){const after=JSON.parse(await fs.readFile(path.join(state.smtpFixture.directory,'snapshot.json'),'utf8'));check('no_email_attempts',after.connections===mailSnapshot.connections&&after.messages.length===mailSnapshot.messages.length&&after.mode===mailSnapshot.mode);}
    result.preservation=true;result.secretScan=await runtime.scan();result.secrets=true;
  }catch(error){failure||=error instanceof Error?error.message:'Internal reminder restoration failed';}
  await runtime.close();
  result.passed=!failure;result.checks=runtime.checks;result.requests=runtime.requests;result.executions=executions;result.observations=observations;result.cleanupFailures=cleanupFailures;result.failure=failure;result.verifiedAt=new Date().toISOString();
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log('E1_REMINDER_INTERNAL: passed='+result.passed+'; checks='+runtime.checks.length+'; requests='+runtime.requests.length+'; tasks='+executions.length+'; skipped='+(result.internal?.skipped||0)+'; all_acceptance_complete=false');
}
if(failure)throw new Error(failure);
