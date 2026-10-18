import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createE1ActivityRuntime } from './runtime-checks/e1-activity-runtime.mjs';

assert.ok(process.argv.includes('--e1-activity'));
const output = process.argv[process.argv.indexOf('--output') + 1];
assert.ok(output);
const runtime = await createE1ActivityRuntime('D:/CloudFlowPro', output);
const { check, ok, rows, database, state, run } = runtime;
const marker = 'E1Q_' + randomUUID().replaceAll('-', '').slice(0, 12);
const quote = value => "CONVERT(UNHEX('" + Buffer.from(String(value)).toString('hex') + "') USING utf8mb4)";
const digest = value => createHash('sha256').update(value).digest('hex');
const owned = new Set(), deleted = new Set(), executions = [], observations = [], originals = [];
const result = { marker, passed:false, queuedRevocations:false, ordinaryEdit:false, newSchedule:false, preservation:false, secrets:false, queuedInternalActualCheckComplete:false, allAcceptanceComplete:false };
for (const [table, key] of [['crm_activity','activity_id'],['crm_activity_participant','participant_id'],['crm_activity_reminder','reminder_id'],['crm_customer','customer_id'],['crm_follow_up','follow_up_id'],['sys_message_channel','channel_id'],['sys_message_template','template_id'],['sys_message_subscribe','subscribe_id'],['sys_message_record','record_id'],['sys_message_delivery','delivery_id']]) {
  const last=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);assert.match(last,/^\d+$/);
  const columns=database("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name="+quote(table)+' ORDER BY ordinal_position').split(/\r?\n/);
  assert.ok(columns.length>0&&columns.every(column=>/^[a-z_]+$/.test(column)));
  const query='SELECT '+key+',SHA2(JSON_ARRAY('+columns.map(column=>'`'+column+'`').join(',')+'),256) FROM '+table+' WHERE '+key+'<='+last+' ORDER BY '+key;
  originals.push({table,query,hash:digest(database(query))});
}
const grantsQuery='SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id';
const usersQuery='SELECT user_id,tenant_id,user_name,nick_name,email,phonenumber,status,deleted FROM sys_user ORDER BY user_id';
const jobQuery="SELECT job_id,tenant_id,job_name,job_group,service_name,handler_name,handler_param,trigger_type,cron_expression,interval_ms,status,concurrent_flag,misfire_strategy,retry_count,timeout_seconds,lock_time_seconds,alarm_on_fail_flag,deleted FROM sys_job WHERE handler_name IN ('crmActivityReminder','crmActivityOverdue','messageDeliveryRecovery') ORDER BY job_id";
const grants=digest(database(grantsQuery)),users=digest(database(usersQuery)),jobs=digest(database(jobQuery));
const mailRoot=await fs.realpath(path.join(run,'private/smtp'));
assert.equal(mailRoot,await fs.realpath(state.smtpFixture.directory));assert.equal(state.smtpFixture.loopback,true);
const control=path.join(mailRoot,'control.json');
assert.equal((await fs.lstat(control)).isSymbolicLink(),false);
const originalControl=await fs.readFile(control);
assert.equal(JSON.parse(originalControl.toString('utf8').replace(/^\uFEFF/, '')).mode,'ACCEPT');
await fs.writeFile(path.join(output,'smtp-control.original.json'),originalControl,{flag:'wx'});
const snapshot=async()=>JSON.parse(await fs.readFile(path.join(mailRoot,'snapshot.json'),'utf8'));
const waitFor=async(read,accept,label,timeout=45000)=>{
  const until=Date.now()+timeout;
  do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,250));}while(Date.now()<until);
  throw new Error(label);
};
let appliedControl=originalControl;
const mode=async value=>{
  assert.ok(['ACCEPT','TEMPORARY'].includes(value));
  assert.equal(digest(await fs.readFile(control)),digest(appliedControl),'SMTP control changed by another writer');
  const next=Buffer.from(JSON.stringify({mode:value}));
  await fs.writeFile(control,next);appliedControl=next;
  await waitFor(snapshot,current=>current.mode===value,'Local SMTP mode not observed');
};
const at=minutes=>database("SELECT DATE_FORMAT(TIMESTAMPADD(MINUTE,"+minutes+",NOW()),'%Y-%m-%d %H:%i:%s')");
const detail=id=>ok('admin','/crm/activity/'+id);
const pendingOutside=()=>database("SELECT COUNT(*) FROM crm_activity a JOIN crm_activity_reminder r ON r.activity_id=a.activity_id AND r.tenant_id=a.tenant_id WHERE a.deleted=0 AND a.status IN ('PLANNED','IN_PROGRESS') AND r.sent_flag=0 AND TIMESTAMPADD(MINUTE,-r.remind_minutes_before,a.start_time)<=NOW()"+(owned.size?' AND a.activity_id NOT IN ('+[...owned].join(',')+')':''));
const originalDeliveryLimit=originals.find(value=>value.table==='sys_message_delivery').query.match(/delivery_id<=(\d+)/)[1];
const pendingDeliveriesOutside=()=>database("SELECT COUNT(*) FROM sys_message_delivery WHERE status IN ('PENDING','CLAIMED','SENDING','RETRYABLE') AND delivery_id<="+originalDeliveryLimit);
const records=id=>rows("SELECT JSON_OBJECT('id',r.record_id,'channel',r.channel_type,'receiver',r.receiver_id,'recordStatus',r.send_status,'deliveryStatus',d.status,'attempts',d.attempt_count,'reason',d.last_error_code,'accepted',d.accepted_time IS NOT NULL,'event',r.outbox_event_id,'link',r.link_url,'due',d.next_attempt_time IS NOT NULL AND d.next_attempt_time<=NOW()) FROM sys_message_record r JOIN sys_message_delivery d ON d.tenant_id=r.tenant_id AND d.record_id=r.record_id WHERE r.tenant_id=100000 AND r.biz_type='CRM_ACTIVITY' AND r.biz_id="+quote(id)+' ORDER BY r.record_id');
const channelCode=marker.toLowerCase();
let channelId,failure,initialSnapshot;
const assertLocal=()=>{
  const enabled=rows("SELECT JSON_OBJECT('id',channel_id,'host',smtp_host,'port',smtp_port,'tenant',tenant_id,'type',channel_type) FROM sys_message_channel WHERE deleted=0 AND status='ENABLED' AND channel_type<>'INTERNAL'");
  check('only_local_owned_channel',enabled.length===1&&enabled[0].id===channelId&&enabled[0].host==='localhost'&&enabled[0].port===state.smtpFixture.port&&enabled[0].tenant===100000&&enabled[0].type==='EMAIL');
};
const trigger=async(handler,label)=>{
  assert.ok(['crmActivityReminder','messageDeliveryRecovery'].includes(handler));assertLocal();
  check('no_original_due_reminders_'+label,pendingOutside()==='0');
  check('no_original_pending_delivery_'+label,pendingDeliveriesOutside()==='0');
  check('no_original_payload_expiry_'+label,database("SELECT COUNT(*) FROM sys_message_delivery WHERE payload_encrypted IS NOT NULL AND status IN ('SENT','FAILED','SKIPPED','CANCELLED') AND claim_owner IS NULL AND update_time<DATE_SUB(NOW(),INTERVAL 30 DAY)")==='0');
  const jobId=database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND deleted=0 AND status='PAUSED' AND handler_name="+quote(handler));assert.match(jobId,/^\d+$/);
  const execution=await ok('admin','/auth/system/job/'+jobId+'/trigger','POST',{});
  check('accepted_'+label,execution.accepted===true&&/^[a-f0-9-]{36}$/.test(execution.executeNo));
  const terminal=await waitFor(()=>rows("SELECT JSON_OBJECT('id',log_id,'status',execute_status,'report',report_time IS NOT NULL,'end',end_time IS NOT NULL) FROM sys_job_log WHERE execute_no="+quote(execution.executeNo)),value=>value.length===1&&value[0].status!=='RUNNING','Task not terminal: '+label);
  const log=await ok('admin','/auth/system/job/log/'+terminal[0].id);
  check('task_terminal_'+label,terminal[0].status==='SUCCESS'&&terminal[0].report&&terminal[0].end&&log.executeNo===execution.executeNo&&log.executeStatus==='SUCCESS');
  executions.push({handler,label,executeNo:execution.executeNo,logId:terminal[0].id,status:terminal[0].status});
};
const create=async label=>{
  const value=await ok('admin','/crm/activity','POST',{activity:{activityType:'MEETING',subject:marker+'_'+label,status:'PLANNED',priority:'MEDIUM',startTime:at(-1),endTime:at(59),bizType:'NONE',ownerId:1,location:marker+'_location'},participants:[{participantType:'USER',participantRefId:1,acceptanceStatus:'ACCEPTED'},{participantType:'USER',participantRefId:3,acceptanceStatus:'TENTATIVE'}],reminders:[{channelType:'INTERNAL',remindMinutesBefore:0},{channelType:'EMAIL',remindMinutesBefore:0}]});
  owned.add(value.activity.activityId);return value.activity.activityId;
};
try{
  initialSnapshot=await snapshot();
  check('local_smtp_ready',initialSnapshot.mode==='ACCEPT'&&initialSnapshot.loopback===true&&initialSnapshot.port===state.smtpFixture.port&&initialSnapshot.failures.length===0);
  check('no_original_due_reminders',pendingOutside()==='0');
  check('no_pending_deliveries_before',database("SELECT COUNT(*) FROM sys_message_delivery WHERE status IN ('PENDING','CLAIMED','SENDING','RETRYABLE')")==='0');
  check('no_external_channel_before',database("SELECT COUNT(*) FROM sys_message_channel WHERE deleted=0 AND status='ENABLED' AND channel_type<>'INTERNAL'")==='0');
  check('both_tasks_paused',database("SELECT COUNT(*) FROM sys_job WHERE tenant_id=100000 AND deleted=0 AND status='PAUSED' AND handler_name IN ('crmActivityReminder','messageDeliveryRecovery')")==='2');
  const settings=await fs.readFile(path.join(run,'auth/integration.properties'),'utf8');
  check('known_payload_retention',settings.split(/\r?\n/).filter(line=>/^cloudflow\.message\.delivery\.payload-retention-days=/.test(line)).every(line=>line.endsWith('=30')));
  const recipients=rows("SELECT JSON_OBJECT('id',u.user_id,'email',u.email) FROM sys_user u JOIN hr_employee e ON e.user_id=u.user_id AND e.tenant_id=u.tenant_id AND e.deleted=0 WHERE u.tenant_id=100000 AND u.user_id IN (1,3) AND u.deleted=0 AND u.status='0' AND u.email IS NOT NULL AND u.email<>'' ORDER BY u.user_id");
  check('two_existing_recipients',recipients.length===2&&recipients[0].id===1&&recipients[1].id===3&&new Set(recipients.map(value=>value.email.toLowerCase())).size===2);
  check('recipient_subscription_open',database("SELECT COUNT(*) FROM sys_message_subscribe WHERE tenant_id=100000 AND user_id IN (1,3) AND message_category='BIZ_REMINDER' AND channel_type IN ('INTERNAL','EMAIL') AND (enabled_flag<>1 OR quiet_start IS NOT NULL OR quiet_end IS NOT NULL)")==='0');
  runtime.sensitive.add('fixture-password');
  await ok('admin','/auth/system/message/channel','POST',{channelType:'EMAIL',channelCode,channelName:marker,provider:'SMTP',status:'ENABLED',smtpHost:'localhost',smtpPort:state.smtpFixture.port,smtpSslFlag:0,smtpUsername:'fixture-user',smtpPwd:'fixture-password',fromAddress:'sender@example.com',fromName:'CloudFlow E1',priority:1,rateLimitMinute:1000,dailyLimit:10000,retryCount:2,retryIntervalSec:1});
  channelId=Number(database('SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND deleted=0 AND channel_code='+quote(channelCode)));
  check('owned_channel_created',Number.isSafeInteger(channelId)&&channelId>0);assertLocal();
  const connected=await ok('admin','/auth/system/message/channel/'+channelId+'/test','POST',{});
  check('connected_without_business_send',connected.success===true&&(await snapshot()).messages.length===initialSnapshot.messages.length);
  await mode('TEMPORARY');
  const cases={};
  for(const label of ['edit','reschedule','cancel','delete','complete','remove_reminder','remove_participant'])cases[label]=await create(label);
  await trigger('crmActivityReminder','initial');
  const initial={};
  for(const [label,id]of Object.entries(cases)){
    initial[label]=await waitFor(()=>records(id),value=>value.length===4&&value.filter(row=>row.channel==='EMAIL').length===2&&value.filter(row=>row.channel==='EMAIL').every(row=>row.deliveryStatus==='RETRYABLE')&&value.filter(row=>row.channel==='INTERNAL').every(row=>row.deliveryStatus==='SENT'),'Initial retries absent: '+label);
    check('known_smtp_rejection_'+label,initial[label].filter(row=>row.channel==='EMAIL').every(row=>row.attempts===1&&!row.accepted&&row.reason?.startsWith('SMTP_REJECTED_')));
    check('initial_station_delivery_'+label,initial[label].filter(row=>row.channel==='INTERNAL').length===2&&initial[label].filter(row=>row.channel==='INTERNAL').every(row=>row.recordStatus==='SUCCESS'));
    observations.push({label:'initial_'+label,activityId:id,records:initial[label]});
  }
  check('temporary_refusal_not_delivered',(await snapshot()).messages.length===initialSnapshot.messages.length);
  let current=await detail(cases.edit);const stableIds=current.reminders.map(row=>row.reminderId);
  current=await ok('admin','/crm/activity','PUT',{...current,activity:{...current.activity,description:'普通编辑后排队提醒继续有效'}});
  check('ordinary_edit_keeps_queued_ids',current.reminders.length===2&&current.reminders.every(row=>stableIds.includes(row.reminderId)&&row.sentFlag===1));
  current=await detail(cases.reschedule);const oldIds=current.reminders.map(row=>row.reminderId);
  current=await ok('admin','/crm/activity','PUT',{activity:{...current.activity,startTime:at(120),endTime:at(180)}});
  check('reschedule_new_pending_ids',current.reminders.length===2&&current.reminders.every(row=>!oldIds.includes(row.reminderId)&&row.sentFlag===0));
  current=await detail(cases.cancel);await ok('admin','/crm/activity/'+cases.cancel+'/cancel','POST',{version:current.activity.version});
  await ok('admin','/crm/activity/'+cases.delete,'DELETE');deleted.add(cases.delete);
  current=await detail(cases.complete);await ok('admin','/crm/activity/'+cases.complete+'/complete','POST',{version:current.activity.version,resultSummary:marker,generateFollowUp:false});
  current=await detail(cases.remove_reminder);current=await ok('admin','/crm/activity','PUT',{...current,reminders:[]});check('reminders_removed',current.reminders.length===0);
  current=await detail(cases.remove_participant);current=await ok('admin','/crm/activity','PUT',{...current,participants:current.participants.filter(member=>member.participantRefId!==3)});check('participant_removed',current.participants.every(member=>member.participantRefId!==3));
  check('queued_until_recovery',Object.values(cases).every(id=>records(id).filter(row=>row.channel==='EMAIL').every(row=>row.deliveryStatus==='RETRYABLE')));
  await mode('ACCEPT');
  await waitFor(()=>Object.values(cases).flatMap(records).filter(row=>row.channel==='EMAIL'),value=>value.length===14&&value.every(row=>row.due),'Natural retry deadline not reached');
  await trigger('messageDeliveryRecovery','revocations');
  for(const [label,id]of Object.entries(cases)){
    const observed=await waitFor(()=>records(id),value=>value.length===4&&value.every(row=>!['PENDING','CLAIMED','SENDING','RETRYABLE'].includes(row.deliveryStatus)),'Recovered delivery not terminal: '+label);
    for(const row of observed.filter(value=>value.channel==='EMAIL')){
      const allowed=label==='edit'||label==='remove_participant'&&row.receiver===1;
      check('recovered_'+label+'_'+row.receiver,allowed?row.deliveryStatus==='SENT'&&row.recordStatus==='SUCCESS'&&row.accepted&&row.attempts===2:row.deliveryStatus==='SKIPPED'&&row.recordStatus==='SKIPPED'&&!row.accepted&&row.attempts===1&&row.reason===(label==='remove_participant'?'SOURCE_RECIPIENT_REMOVED':'SOURCE_EXPIRED'));
    }
    check('original_records_reused_'+label,observed.every(row=>initial[label].some(original=>original.id===row.id&&original.event===row.event)));
    observations.push({label:'recovered_'+label,activityId:id,records:observed});
  }
  let mail=await waitFor(snapshot,value=>value.messages.filter(message=>message.subject?.includes(marker)).length>=3,'Valid queued mail not received');
  let messages=mail.messages.filter(message=>message.subject?.includes(marker));
  check('only_three_valid_queued_messages',messages.length===3&&mail.messages.length===initialSnapshot.messages.length+3&&messages.every(message=>message.subject==='活动提醒：'+marker+'_edit'||message.subject==='活动提醒：'+marker+'_remove_participant'));
  const ownerEmail=recipients[0].email.toLowerCase();
  check('removed_participant_not_sent',messages.filter(message=>message.subject==='活动提醒：'+marker+'_remove_participant').length===1&&messages.filter(message=>message.subject==='活动提醒：'+marker+'_remove_participant').every(message=>message.to.length===1&&message.to[0].toLowerCase().includes(ownerEmail)));
  result.queuedRevocations=true;result.ordinaryEdit=true;
  const beforeRepeat=digest(JSON.stringify(Object.values(cases).flatMap(records)));
  await trigger('messageDeliveryRecovery','repeat');
  check('repeat_recovery_does_not_repeat_attempts',digest(JSON.stringify(Object.values(cases).flatMap(records)))===beforeRepeat&&(await snapshot()).messages.length===initialSnapshot.messages.length+3);
  current=await detail(cases.reschedule);check('future_schedule_still_pending',current.reminders.every(row=>row.sentFlag===0));
  current=await ok('admin','/crm/activity','PUT',{activity:{...current.activity,startTime:at(-1),endTime:at(59)}});
  await trigger('crmActivityReminder','new_schedule');
  const fresh=await waitFor(()=>records(cases.reschedule),value=>value.length===8&&value.filter(row=>!initial.reschedule.some(old=>old.id===row.id)).every(row=>row.deliveryStatus==='SENT'),'New schedule not delivered');
  const newRows=fresh.filter(row=>!initial.reschedule.some(old=>old.id===row.id));
  check('new_schedule_has_new_event_ids',newRows.length===4&&newRows.every(row=>row.attempts===1&&!initial.reschedule.some(old=>old.event===row.event)));
  check('old_schedule_remains_skipped',fresh.filter(row=>initial.reschedule.some(old=>old.id===row.id)&&row.channel==='EMAIL').every(row=>row.deliveryStatus==='SKIPPED'&&row.attempts===1));
  observations.push({label:'new_schedule',activityId:cases.reschedule,records:fresh});result.newSchedule=true;
  const allFinal=Object.values(cases).flatMap(records),finalHash=digest(JSON.stringify(allFinal));
  await trigger('crmActivityReminder','repeat_new_schedule');
  check('new_schedule_does_not_repeat',digest(JSON.stringify(Object.values(cases).flatMap(records)))===finalHash);
  mail=await waitFor(snapshot,value=>value.messages.filter(message=>message.subject?.includes(marker)).length>=5,'New schedule local mail absent');
  messages=mail.messages.filter(message=>message.subject?.includes(marker));
  check('five_exact_local_messages',messages.length===5&&mail.messages.length===initialSnapshot.messages.length+5&&mail.failures.length===0);
  check('valid_mail_content_and_recipients',messages.every(message=>message.body.includes(marker+'_location')&&message.body.includes('开始时间')&&message.to.length===1&&!message.cc&&!message.bcc&&recipients.some(receiver=>message.to[0].toLowerCase().includes(receiver.email.toLowerCase()))));
  check('all_records_terminal',allFinal.length===32&&allFinal.filter(row=>row.channel==='EMAIL'&&row.deliveryStatus==='SKIPPED').length===11&&allFinal.filter(row=>row.channel==='EMAIL'&&row.deliveryStatus==='SENT').length===5&&allFinal.filter(row=>row.channel==='INTERNAL'&&row.deliveryStatus==='SENT').length===16);
  check('message_ids_unique',new Set(messages.map(message=>message.messageId)).size===5);
  result.smtp={count:5,localOnly:true,messageIds:messages.map(message=>digest(message.messageId)),bodyHashes:messages.map(message=>digest(message.body))};
  result.email={initialRetryable:14,skipped:11,sent:5};
  check('no_browser_errors',runtime.browserErrors.length===0);
}catch(error){failure=error instanceof Error?error.message:'Queued reminder verification failed';}
finally{
  const cleanupFailures=[];
  for(const id of owned){if(deleted.has(id))continue;try{await ok('admin','/crm/activity/'+id,'DELETE');deleted.add(id);}catch{cleanupFailures.push('activity_'+id);}}
  if(!channelId){const found=database('SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND deleted=0 AND channel_code='+quote(channelCode));if(/^\d+$/.test(found))channelId=Number(found);}
  if(channelId){try{await ok('admin','/auth/system/message/channel/'+channelId,'DELETE');}catch{cleanupFailures.push('channel');}}
  try{
    assert.equal(digest(await fs.readFile(control)),digest(appliedControl),'SMTP control changed before restoration');
    await fs.writeFile(control,originalControl);appliedControl=originalControl;
    await waitFor(snapshot,value=>value.mode==='ACCEPT','SMTP mode restoration not observed');
    check('smtp_control_restored',digest(await fs.readFile(control))===digest(originalControl));
    check('owned_records_cleanup',cleanupFailures.length===0);
    for(const original of originals)check('original_rows_preserved_'+original.table,digest(database(original.query))===original.hash);
    check('original_role_grants_preserved',digest(database(grantsQuery))===grants);
    check('original_user_contacts_preserved',digest(database(usersQuery))===users);
    check('original_job_configuration_preserved',digest(database(jobQuery))===jobs);
    check('no_external_channels_left',database("SELECT COUNT(*) FROM sys_message_channel WHERE deleted=0 AND status='ENABLED' AND channel_type<>'INTERNAL'")==='0');
    check('no_original_due_after',pendingOutside()==='0');
    result.preservation=true;result.secretScan=await runtime.scan();result.secrets=true;
  }catch(error){failure||=error instanceof Error?error.message:'Queued reminder cleanup failed';}
  await runtime.close();
  result.passed=!failure;result.checks=runtime.checks;result.requests=runtime.requests;result.executions=executions;result.observations=observations;result.cleanupFailures=cleanupFailures;result.failure=failure;result.verifiedAt=new Date().toISOString();
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log('E1_REMINDER_QUEUED: passed='+result.passed+'; checks='+runtime.checks.length+'; requests='+runtime.requests.length+'; tasks='+executions.length+'; local_smtp='+(result.smtp?.count||0)+'; all_acceptance_complete=false');
}
if(failure)throw new Error(failure);
