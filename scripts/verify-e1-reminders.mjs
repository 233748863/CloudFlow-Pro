import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createE1ActivityRuntime } from './runtime-checks/e1-activity-runtime.mjs';

assert.ok(process.argv.includes('--e1-activity'));
const output = process.argv[process.argv.indexOf('--output') + 1];
assert.ok(output);
const runtime = await createE1ActivityRuntime('D:/CloudFlowPro', output);
const { check, ok, rows, database, sessions, state, run } = runtime;
const marker = 'E1R_' + randomUUID().replaceAll('-', '').slice(0, 12);
const quote = value => "CONVERT(UNHEX('" + Buffer.from(String(value)).toString('hex') + "') USING utf8mb4)";
const digest = value => createHash('sha256').update(value).digest('hex');
const owned = new Set(), executions = [], observations = [];
const result = { marker, passed: false, dualChannels: false, reschedule: false, cancel: false, preservation: false, secrets: false, allAcceptanceComplete: false };
const originals = [];
for (const [table, key] of [['crm_activity','activity_id'],['crm_activity_participant','participant_id'],['crm_activity_reminder','reminder_id'],['crm_customer','customer_id'],['crm_follow_up','follow_up_id'],['sys_message_channel','channel_id'],['sys_message_template','template_id'],['sys_message_subscribe','subscribe_id']]) {
  const last = database('SELECT COALESCE(MAX(' + key + '),0) FROM ' + table); assert.match(last, /^\d+$/);
  const query = 'SELECT * FROM ' + table + ' WHERE ' + key + '<=' + last + ' ORDER BY ' + key;
  originals.push({ table, query, hash: digest(database(query)) });
}
const grantsQuery = 'SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id';
const grants = digest(database(grantsQuery));
const usersQuery = 'SELECT user_id,tenant_id,user_name,nick_name,email,phonenumber,status,deleted FROM sys_user ORDER BY user_id';
const users = digest(database(usersQuery));
const jobQuery = "SELECT job_id,tenant_id,job_name,job_group,service_name,handler_name,handler_param,trigger_type,cron_expression,interval_ms,status,concurrent_flag,misfire_strategy,retry_count,timeout_seconds,lock_time_seconds,alarm_on_fail_flag,deleted FROM sys_job WHERE handler_name IN ('crmActivityReminder','crmActivityOverdue') ORDER BY job_id";
const jobs = digest(database(jobQuery));
const mailRoot = await fs.realpath(path.join(run, 'private/smtp'));
assert.equal(mailRoot, await fs.realpath(state.smtpFixture.directory));
assert.equal(state.smtpFixture.loopback, true);
const snapshot = async () => JSON.parse(await fs.readFile(path.join(mailRoot, 'snapshot.json'), 'utf8'));
const waitFor = async (read, accept, label, timeout = 45000) => {
  const until = Date.now() + timeout;
  do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 250)); } while (Date.now() < until);
  throw new Error(label);
};
const at = minutes => database("SELECT DATE_FORMAT(TIMESTAMPADD(MINUTE," + minutes + ",NOW()),'%Y-%m-%d %H:%i:%s')");
const reminder = (channelType, remindMinutesBefore) => ({ channelType, remindMinutesBefore });
const detail = id => ok('admin', '/crm/activity/' + id);
const create = async (suffix, reminders, participants = []) => {
  const value = await ok('admin', '/crm/activity', 'POST', { activity: { activityType:'MEETING',subject:marker+'_'+suffix,status:'PLANNED',priority:'MEDIUM',startTime:at(10),endTime:at(70),bizType:'NONE',ownerId:1,location:marker+'_location' }, reminders, participants });
  owned.add(value.activity.activityId); return value;
};
const activityRecords = id => rows("SELECT JSON_OBJECT('id',record_id,'channel',channel_type,'channelId',channel_id,'receiver',receiver_id,'status',send_status,'link',link_url,'event',outbox_event_id,'sent',send_time IS NOT NULL) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='CRM_ACTIVITY' AND biz_id="+quote(id)+' ORDER BY record_id');
const channelCode = marker.toLowerCase();
let channelId, failure, originalSnapshot;
const pendingOutside = () => database("SELECT COUNT(*) FROM crm_activity a JOIN crm_activity_reminder r ON r.activity_id=a.activity_id AND r.tenant_id=a.tenant_id WHERE a.deleted=0 AND a.status IN ('PLANNED','IN_PROGRESS') AND r.sent_flag=0 AND TIMESTAMPADD(MINUTE,-r.remind_minutes_before,a.start_time)<=NOW()" + (owned.size ? ' AND a.activity_id NOT IN ('+[...owned].join(',')+')' : ''));
const assertLocalChannels = () => {
  const enabled = rows("SELECT JSON_OBJECT('id',channel_id,'tenant',tenant_id,'host',smtp_host,'port',smtp_port,'type',channel_type) FROM sys_message_channel WHERE status='ENABLED' AND deleted=0 AND channel_type<>'INTERNAL'");
  check('only_owned_local_email_channel', enabled.length===1 && enabled[0].id===channelId && enabled[0].tenant===100000 && enabled[0].type==='EMAIL' && enabled[0].host==='localhost' && enabled[0].port===state.smtpFixture.port);
};
const trigger = async label => {
  assertLocalChannels(); check('no_original_due_reminders_'+label, pendingOutside()==='0');
  const jobId=database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND handler_name='crmActivityReminder' AND deleted=0 AND status='PAUSED'"); assert.match(jobId,/^\d+$/);
  const execution=await ok('admin','/auth/system/job/'+jobId+'/trigger','POST',{});
  check('accepted_'+label,execution.accepted===true && /^[a-f0-9-]{36}$/.test(execution.executeNo));
  const terminal=await waitFor(()=>rows("SELECT JSON_OBJECT('id',log_id,'status',execute_status,'report',report_time IS NOT NULL,'end',end_time IS NOT NULL) FROM sys_job_log WHERE execute_no="+quote(execution.executeNo)),value=>value.length===1 && value[0].status!=='RUNNING','Task terminal not observed: '+label);
  const log=await ok('admin','/auth/system/job/log/'+terminal[0].id);
  check('task_terminal_'+label,terminal[0].status==='SUCCESS' && terminal[0].report && terminal[0].end && log.executeNo===execution.executeNo && log.executeStatus==='SUCCESS');
  executions.push({label,executeNo:execution.executeNo,logId:terminal[0].id,status:terminal[0].status});
};
const received = async (id, count, label) => {
  const records=await waitFor(()=>activityRecords(id),value=>value.length>=count && value.every(row=>!['PENDING','SENDING'].includes(row.status)),'Message records not terminal: '+label);
  check('record_count_'+label,records.length===count);
  check('records_success_and_link_'+label,records.every(row=>row.status==='SUCCESS'&&row.sent&&row.link==='/office/crm/activity?activityId='+id&&[1,3].includes(row.receiver)));
  const expected=count/4;
  check('recipient_channel_counts_'+label,[1,3].every(receiver=>['INTERNAL','EMAIL'].every(channel=>records.filter(row=>row.receiver===receiver&&row.channel===channel).length===expected)));
  for(const record of records.filter(row=>row.channel==='EMAIL')) check('owned_channel_record_'+record.id,record.channelId===channelId);
  const eventIds=[...new Set(records.map(row=>row.event))];
  if(eventIds.length){
    const events=rows("SELECT JSON_OBJECT('id',event_id,'type',event_type,'status',status) FROM outbox_event WHERE event_id IN ("+eventIds.map(quote).join(',')+")");
    check('persistent_events_'+label,events.length===eventIds.length&&events.every(row=>row.type==='MESSAGE_SEND'&&row.status==='PUBLISHED'));
    const delivery=rows("SELECT JSON_OBJECT('record',record_id,'status',status,'attempts',attempt_count,'accepted',accepted_time IS NOT NULL,'encrypted',payload_encrypted IS NOT NULL) FROM sys_message_delivery WHERE record_id IN ("+records.filter(row=>row.channel==='EMAIL').map(row=>row.id).join(',')+")");
    check('smtp_delivery_evidence_'+label,delivery.length===count/2&&delivery.every(row=>row.status==='SENT'&&row.attempts===1&&row.accepted));
  }
  observations.push({label,activityId:id,count,eventCount:eventIds.length,records}); return records;
};
try {
  originalSnapshot=await snapshot();
  check('smtp_loopback_ready',originalSnapshot.loopback===true&&originalSnapshot.port===state.smtpFixture.port&&originalSnapshot.mode==='ACCEPT'&&originalSnapshot.failures.length===0);
  check('no_original_due_reminders',pendingOutside()==='0');
  check('no_existing_external_delivery_pending',database("SELECT COUNT(*) FROM sys_message_delivery WHERE status IN ('PENDING','CLAIMED','SENDING','RETRYABLE')")==='0');
  check('no_enabled_external_channel_before',database("SELECT COUNT(*) FROM sys_message_channel WHERE deleted=0 AND status='ENABLED' AND channel_type<>'INTERNAL'")==='0');
  const recipients=rows("SELECT JSON_OBJECT('id',u.user_id,'email',u.email) FROM sys_user u JOIN hr_employee e ON e.user_id=u.user_id AND e.tenant_id=u.tenant_id AND e.deleted=0 WHERE u.tenant_id=100000 AND u.user_id IN (1,3) AND u.status='0' AND u.deleted=0 AND u.email IS NOT NULL AND u.email<>'' ORDER BY u.user_id");
  check('two_existing_hr_recipients',recipients.length===2&&recipients[0].id===1&&recipients[1].id===3&&new Set(recipients.map(row=>row.email.toLowerCase())).size===2);
  check('recipient_subscription_unchanged_and_open',database("SELECT COUNT(*) FROM sys_message_subscribe WHERE tenant_id=100000 AND user_id IN (1,3) AND message_category='BIZ_REMINDER' AND channel_type IN ('INTERNAL','EMAIL') AND (enabled_flag<>1 OR quiet_start IS NOT NULL OR quiet_end IS NOT NULL)")==='0');
  check('two_original_templates_enabled',database("SELECT COUNT(*) FROM sys_message_template WHERE tenant_id=100000 AND template_code='CRM_ACTIVITY_REMINDER' AND channel_type IN ('INTERNAL','EMAIL') AND status='ENABLED' AND force_send_flag=0 AND deleted=0")==='2');
  runtime.sensitive.add('fixture-password');
  await ok('admin','/auth/system/message/channel','POST',{channelType:'EMAIL',channelCode,channelName:marker,provider:'SMTP',status:'ENABLED',smtpHost:'localhost',smtpPort:state.smtpFixture.port,smtpSslFlag:0,smtpUsername:'fixture-user',smtpPwd:'fixture-password',fromAddress:'sender@example.com',fromName:'CloudFlow E1',priority:1,rateLimitMinute:1000,dailyLimit:10000,retryCount:0,retryIntervalSec:60});
  channelId=Number(database('SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND deleted=0 AND channel_code='+quote(channelCode)));check('owned_channel_created',Number.isSafeInteger(channelId)&&channelId>0);
  assertLocalChannels();
  const connected=await ok('admin','/auth/system/message/channel/'+channelId+'/test','POST',{});
  check('smtp_tls_auth_without_business_send',connected.success===true&&(await snapshot()).messages.length===originalSnapshot.messages.length);
  const participants=[{participantType:'USER',participantRefId:1,acceptanceStatus:'ACCEPTED'},{participantType:'USER',participantRefId:3,acceptanceStatus:'TENTATIVE'},{participantType:'USER',participantRefId:Number(sessions.sales.identity.userId),acceptanceStatus:'NONE'}];
  let main=await create('main',[reminder('INTERNAL',30),reminder('EMAIL',30),reminder('INTERNAL',0),reminder('EMAIL',0),reminder('EMAIL',30)],participants);
  const mainId=main.activity.activityId;
  check('duplicate_reminder_config_deduped',main.reminders.length===4);
  await ok('sales','/crm/activity/'+mainId+'/respond','POST',{acceptanceStatus:'DECLINED'});
  main=await detail(mainId);check('declined_participant_recorded',main.participants.some(row=>row.participantRefId===Number(sessions.sales.identity.userId)&&row.acceptanceStatus==='DECLINED'));
  const cancelled=await create('cancelled',[reminder('INTERNAL',30),reminder('EMAIL',30)],participants.slice(0,2));
  const cancelledResult=await ok('admin','/crm/activity/'+cancelled.activity.activityId+'/cancel','POST',{version:cancelled.activity.version});
  check('cancel_removes_pending',cancelledResult.activity.status==='CANCELLED'&&cancelledResult.reminders.length===0);
  let zero=await create('zero',[reminder('INTERNAL',0),reminder('EMAIL',0)],participants.slice(0,2));
  const completed=await create('completed',[reminder('INTERNAL',30),reminder('EMAIL',30)],participants.slice(0,2));
  const completedResult=await ok('admin','/crm/activity/'+completed.activity.activityId+'/complete','POST',{version:completed.activity.version,resultSummary:marker,generateFollowUp:false});
  check('complete_removes_pending',completedResult.activity.status==='COMPLETED'&&completedResult.reminders.length===0);
  await trigger('initial');await received(mainId,4,'initial');
  main=await detail(mainId);check('only_thirty_minute_sent',main.reminders.every(row=>row.sentFlag===(row.remindMinutesBefore===30?1:0)));
  check('zero_minute_waits',activityRecords(zero.activity.activityId).length===0);
  const sentTimes=main.reminders.filter(row=>row.sentFlag===1).map(row=>row.sendTime);
  main=await ok('admin','/crm/activity','PUT',{...main,activity:{...main.activity,description:'同一时间编辑保留已提交提醒'}});
  check('same_time_edit_retains_sent',main.reminders.filter(row=>row.sentFlag===1).length===2&&main.reminders.filter(row=>row.sentFlag===1).every(row=>sentTimes.includes(row.sendTime)));
  await trigger('repeat_after_edit');await received(mainId,4,'repeat_after_edit');
  const oldIds=main.reminders.map(row=>row.reminderId);
  main=await ok('admin','/crm/activity','PUT',{activity:{...main.activity,startTime:at(120),endTime:at(180)}});
  check('postpone_replaces_all_reminders',main.reminders.length===4&&main.reminders.every(row=>row.sentFlag===0&&!oldIds.includes(row.reminderId)&&!row.sendTime));
  await trigger('postponed');await received(mainId,4,'postponed');
  check('postponed_remains_pending',(await detail(mainId)).reminders.every(row=>row.sentFlag===0));
  main=await ok('admin','/crm/activity','PUT',{activity:{...main.activity,startTime:at(10),endTime:at(70)}});
  await trigger('new_schedule');await received(mainId,8,'new_schedule');
  main=await detail(mainId);
  const afterCancel=await ok('admin','/crm/activity/'+mainId+'/cancel','POST',{version:main.activity.version});
  check('cancel_retains_sent_only',afterCancel.reminders.length===2&&afterCancel.reminders.every(row=>row.sentFlag===1));
  await trigger('cancelled');await received(mainId,8,'cancelled');
  zero=await ok('admin','/crm/activity','PUT',{activity:{...zero.activity,startTime:at(-1),endTime:at(59)}});
  await trigger('zero_due');await received(zero.activity.activityId,4,'zero_due');
  await trigger('repeat_zero');await received(zero.activity.activityId,4,'repeat_zero');
  check('cancelled_and_completed_never_delivered',activityRecords(cancelled.activity.activityId).length===0&&activityRecords(completed.activity.activityId).length===0);
  const mail=await waitFor(snapshot,value=>value.messages.filter(row=>row.subject?.includes(marker)).length>=6,'SMTP messages not observed');
  const messages=mail.messages.filter(row=>row.subject?.includes(marker));
  check('six_exact_local_smtp_messages',messages.length===6&&mail.messages.length===originalSnapshot.messages.length+6&&mail.failures.length===0);
  check('owner_participant_deduplicated_and_declined_excluded',recipients.every(receiver=>messages.filter(message=>message.to.length===1&&message.to[0].toLowerCase().includes(receiver.email.toLowerCase())).length===3));
  check('actual_smtp_content',messages.every(message=>message.body.includes(marker+'_location')&&message.body.includes('开始时间')&&!message.cc&&!message.bcc));
  check('smtp_message_ids_unique',new Set(messages.map(message=>message.messageId)).size===messages.length);
  result.smtp={count:messages.length,receiverCount:2,messageIds:messages.map(message=>digest(message.messageId)),bodyHashes:messages.map(message=>digest(message.body)),localOnly:true};
  result.dualChannels=true;result.reschedule=true;result.cancel=true;
  check('browser_no_runtime_errors',runtime.browserErrors.length===0);
} catch(error){failure=error instanceof Error?error.message:'E1 reminder verification failed';}
finally {
  const cleanupFailures=[];
  for(const id of owned){try{await ok('admin','/crm/activity/'+id,'DELETE');}catch{cleanupFailures.push('activity_'+id);}}
  if(!channelId){const found=database('SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND deleted=0 AND channel_code='+quote(channelCode));if(/^\d+$/.test(found))channelId=Number(found);}
  if(channelId){try{await ok('admin','/auth/system/message/channel/'+channelId,'DELETE');}catch{cleanupFailures.push('channel');}}
  try {
    check('owned_records_cleanup',cleanupFailures.length===0);
    for(const original of originals)check('original_rows_preserved_'+original.table,digest(database(original.query))===original.hash);
    check('original_role_grants_preserved',digest(database(grantsQuery))===grants);
    check('original_user_contacts_preserved',digest(database(usersQuery))===users);
    check('original_reminder_job_configuration_preserved',digest(database(jobQuery))===jobs);
    check('no_external_channels_left_enabled',database("SELECT COUNT(*) FROM sys_message_channel WHERE deleted=0 AND status='ENABLED' AND channel_type<>'INTERNAL'")==='0');
    check('no_original_due_reminders_after',pendingOutside()==='0');
    result.preservation=true;result.secretScan=await runtime.scan();result.secrets=true;
  }catch(error){failure||=error instanceof Error?error.message:'E1 reminder final check failed';}
  await runtime.close();
  result.passed=!failure;result.checks=runtime.checks;result.requests=runtime.requests;result.executions=executions;result.observations=observations;result.cleanupFailures=cleanupFailures;result.failure=failure;result.verifiedAt=new Date().toISOString();
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log('E1_REMINDERS: passed='+result.passed+'; checks='+runtime.checks.length+'; requests='+runtime.requests.length+'; tasks='+executions.length+'; local_smtp='+(result.smtp?.count||0)+'; all_acceptance_complete=false');
}
if(failure)throw new Error(failure);
