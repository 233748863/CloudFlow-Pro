import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyA3TimerScan({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  if (process.argv.includes('--a3-natural-cadence')) {
    const { verifyA3NaturalCadence } = await import('./verify-a3-natural-cadence.mjs');
    return verifyA3NaturalCadence({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence });
  }
  const marker='A3M'+caseTag,base='/workflow/wf',jobsRoot='/auth/system/job';
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async(read,accept,label)=>{const end=Date.now()+90000;do{const value=await read();if(accept(value))return value;await sleep(250);}while(Date.now()<end);throw new Error(label);};
  const post=(page,url,body={})=>api(page,url,{method:'POST',body});
  const employee=await session('g_holiday_employee'),foreign=await session('g_import_tenant');
  const keys=await readOwnedJobKeys(state),secrets=new Set([...accounts.map(item=>item.password).filter(Boolean),...Object.values(keys)]);
  for(const page of [admin,employee,foreign]){const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));}
  const redis=await ownedGatewayRedis(state),workflow=state.services.find(item=>item.name==='workflow');assert.ok(workflow);
  const users=rows("SELECT JSON_OBJECT('name',user_name,'id',CAST(user_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) FROM sys_user WHERE user_name IN ('g_import_admin','g_holiday_employee','g_import_tenant') AND deleted=0 AND status='0';");
  const owner=(name,page)=>{const user=users.find(item=>item.name===name);assert.ok(user);assert.match(user.id,/^[1-9][0-9]*$/);return {...user,page};};
  const first=owner('g_import_admin',admin),second=owner('g_import_tenant',foreign),receiver=users.find(item=>item.name==='g_holiday_employee').id;
  const queue=tenant=>tenant+':sys:wf:timers';
  const configuration=()=>database("SELECT tenant_id,job_id,job_name,status,handler_name,interval_ms,cron_expression,deleted FROM sys_job WHERE job_name NOT LIKE "+sql(marker+'%')+' ORDER BY job_id;');
  const grants=()=>database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const triggers=()=>database('SELECT trigger_name,event_manipulation,event_object_table,action_statement FROM information_schema.triggers WHERE trigger_schema=DATABASE() ORDER BY trigger_name;');
  const indexes=()=>JSON.stringify([first,second].map(item=>[item.tenant,redis('ZRANGE',queue(item.tenant),0,-1,'WITHSCORES')]));
  const beforeConfig=configuration(),beforeGrants=grants(),beforeTriggers=triggers(),beforeIndexes=indexes();
  const samples=[],definitions=[],forms=[],jobs=[],extraMembers=[],sentinels=new Set();let failure,triggerCreated=false,internalRequests=0;
  const triggerName='a3_timer_'+caseTag;assert.match(triggerName,/^[a-z0-9_]+$/);
  const instance=sample=>rows("SELECT JSON_OBJECT('status',status,'variables',CAST(variables AS JSON)) FROM wf_process_instance WHERE tenant_id="+sample.tenant+' AND instance_id='+sql(sample.instance)+';')[0];
  const pending=sample=>instance(sample).variables?._wf_waits?.[sample.wait];
  const history=sample=>rows("SELECT JSON_OBJECT('id',history_id,'type',task_type,'action',action) FROM wf_task_history WHERE tenant_id="+sample.tenant+' AND instance_id='+sql(sample.instance)+" AND node_key='timer' ORDER BY history_id;");
  const messages=()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status,'reason',skip_reason,'title',title,'content',content) FROM sys_message_record WHERE title IN ('定时节点触发通知','定时节点已到期') AND content LIKE "+sql('%'+marker+'%')+' ORDER BY record_id;');
  const admins=actor=>rows("SELECT JSON_OBJECT('id',CAST(u.user_id AS CHAR)) FROM sys_user u WHERE u.tenant_id="+actor.tenant+" AND u.deleted=0 AND u.status='0' AND EXISTS (SELECT 1 FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id AND r.role_key='admin' AND r.deleted=0 AND r.status='0') ORDER BY u.user_id;").map(item=>item.id);
  const recipients=sample=>[...new Set([...admins(sample),sample.initiator])].sort();
  const failureMessages=sample=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status,'reason',skip_reason,'content',content,'event',outbox_event_id) FROM sys_message_record WHERE biz_type='WF_TIMER_FAILURE' AND biz_id="+sql(sample.instance)+' ORDER BY record_id;');
  const eventId=(sample,user)=>{const identity='cloudflow-service-workflow:'+sample.tenant+':wf:timer:failure:'+sample.instance+':'+sample.wait+':'+user;const bytes=createHash('md5').update(identity).digest();bytes[6]=(bytes[6]&15)|48;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString('hex');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');};
  const poison=(sample,user)=>{const id=eventId(sample,user);assert.equal(database('SELECT COUNT(*) FROM outbox_event WHERE event_id='+sql(id)+';'),'0');
    const payload=JSON.stringify({eventId:id,eventType:'A3_TIMER_SENTINEL',sourceModule:marker,sourceId:0,tenantId:Number(sample.tenant),payloadDigest:marker});
    database('INSERT INTO outbox_event(aggregate_type,aggregate_id,event_id,event_type,payload_json,status,next_retry_at,tenant_id) VALUES('+sql(marker)+',0,'+sql(id)+",'A3_TIMER_SENTINEL',"+sql(payload)+",'PUBLISHED',NOW(),"+sample.tenant+');');sentinels.add(id);return id;};
  const removeSentinel=id=>{database('DELETE FROM outbox_event WHERE event_id='+sql(id)+' AND aggregate_type='+sql(marker)+" AND event_type='A3_TIMER_SENTINEL' AND status='PUBLISHED';");sentinels.delete(id);};
  const logs=job=>rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'actor',trigger_by,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id="+job.id+' ORDER BY log_id;');
  const trigger=async job=>{if(job.last&&Date.now()-job.last<5300)await sleep(5300-(Date.now()-job.last));const result=successful(await post(admin,jobsRoot+'/'+job.id+'/trigger'),'实际触发定时节点任务');assert.equal(result.accepted,true);job.last=Date.now();return waitFor(()=>logs(job).find(item=>item.executeNo===result.executeNo),item=>item&&item.status!=='RUNNING','Timer job did not finish');};
  const success=async(job,count,text)=>{const result=await trigger(job);check('定时节点任务准确保存数量摘要及操作者',result.status==='SUCCESS'&&result.affected===count&&result.message===text&&result.actor==='g_import_admin'&&Number.isInteger(result.duration)&&result.report);
    const target='/inner/job/status/'+result.executeNo,headers=signJobRequest(keys,'cloudflow-auth','cloudflow-service-workflow','GET',target,'');secrets.add(headers['X-Job-Signature']);
    const response=await fetch('http://127.0.0.1:'+workflow.port+target,{headers,signal:AbortSignal.timeout(10000)}),body=await response.json();internalRequests++;check('定时节点签名反查与平台结果一致',response.status===200&&body.code===200&&body.data.affectedRows===count&&body.data.resultMsg===text);return result;};
  const summary=(handled,stale=0,deferred=0)=>`定时节点扫描完成：处理${handled}项，移除失效${stale}项，暂缓${deferred}项`;
  const due=sample=>{assert.ok(pending(sample),'Owned durable timer wait required');const prefix='$._wf_waits."'+sample.wait+'".payload.';
    database('UPDATE wf_process_instance SET variables=JSON_SET(variables,'+sql(prefix+'expireAt')+',1,'+sql(prefix+'nextRetryAt')+',1) WHERE tenant_id='+sample.tenant+' AND instance_id='+sql(sample.instance)+' AND title='+sql(marker+'-'+sample.name)+';');};
  const present=sample=>redis('ZSCORE',queue(sample.tenant),JSON.stringify(sample.key))!=='';
  const create=async(name,actor,action='AUTO_PASS',starter=actor)=>{
    let form=forms.find(item=>item.tenant===actor.tenant);
    if(!form){const saved=successful(await post(actor.page,base+'/form/save',{formKey:marker+'-'+actor.tenant,formName:marker,fieldsJson:JSON.stringify([{id:'note',type:'TEXT',label:'说明'}])}),'建立自有定时表单');form={id:saved.formId??saved.id,tenant:actor.tenant};assert.ok(form.id);forms.push(form);}
    const graph={nodes:[{id:'start',type:'START',title:'发起'},{id:'timer',type:'TIMER',title:name,props:{delayValue:1,delayUnit:'HOUR',timerAction:action}},{id:'end',type:'END',title:'结束'}],edges:[{id:'start-timer',source:'start',target:'timer'},{id:'timer-end',source:'timer',target:'end'}]};
    const saved=successful(await post(actor.page,base+'/definition/save',{processKey:marker+'-'+name,processName:marker+'-'+name,formId:form.id,modelJson:JSON.stringify(graph),startPermissionType:'ALL',startPermissionValue:'[]'}),'保存真实定时流程');
    const definition=saved.definitionId??saved.id;assert.ok(definition);definitions.push({id:definition,tenant:actor.tenant});successful(await post(actor.page,base+'/definition/deploy/'+definition),'发布真实定时流程');
    assert.equal(starter.tenant,actor.tenant,'Initiator belongs to definition tenant');
    const context=successful(await api(starter.page,base+'/draft/context/'+definition),'读取定时流程发起上下文');
    const draft=successful(await post(starter.page,base+'/draft',{definitionId:definition,expectedVersion:0,loadedContextHash:context.contextHash,title:marker+'-'+name,formData:{note:marker},nodeAssignees:{}}),'保存真实定时流程草稿');
    const started=successful(await post(starter.page,base+'/start',{draftId:draft.draftId,expectedVersion:draft.lockVersion}),'真实启动定时等待流程');
    const sample={name,tenant:actor.tenant,initiator:starter.id,page:actor.page,instance:started.instanceId??started.processInstanceId};assert.ok(sample.instance);samples.push(sample);
    const waits=Object.values(instance(sample).variables?._wf_waits??{}).filter(item=>item.kind==='TIMER');assert.equal(waits.length,1);sample.wait=waits[0].waitId;sample.key='sys:wf:timer:'+sample.instance+':timer:root:'+sample.wait;
    assert.ok(present(sample)&&Number(redis('ZSCORE',queue(sample.tenant),JSON.stringify(sample.key)))>Date.now()+3500000,'Real engine creates one-hour durable timer and index');sample.serialized=redis('GET',sample.tenant+':'+sample.key);assert.ok(sample.serialized);console.log('A3_TIMER_SAMPLE_READY: name='+name+'; tenant='+actor.tenant);return sample;
  };
  const removeTrigger=()=>{if(triggerCreated){database('DROP TRIGGER '+triggerName+';');triggerCreated=false;}};
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name IN ('timerScan','timerScanCleanup');"),'0');
    assert.equal(database("SELECT COUNT(*) FROM wf_process_instance WHERE deleted=0 AND status IN ('RUNNING','RESTARTED','TASK_BACK','WITHDRAWN','PENDING','PAUSED','FAILED') AND JSON_CONTAINS_PATH(variables,'one','$._wf_waits')=1;"),'0','No previous persistent waits permitted');
    for(const actor of [first,second])assert.equal(redis('ZCARD',queue(actor.tenant)),'0','No prior timer entries permitted');
    for(const [id,kind] of [[114,'scan'],[117,'cleanup']]){
      const original=successful(await api(admin,jobsRoot+'/'+id),'读取原定时处理器');assert.equal(original.status,'PAUSED');assert.equal(original.handlerName,kind==='scan'?'timerScan':'timerScanCleanup');
      successful(await post(admin,jobsRoot,{...original,jobId:undefined,jobName:marker+'-'+kind,jobGroup:'A3_VERIFY',handlerParam:marker,status:'PAUSED',triggerType:'FIXED_RATE',cronExpression:null,intervalMs:60000,concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:receiver,logSuccessFlag:1}),'建立暂停定时验证任务');jobs.push({kind,id:database('SELECT job_id FROM sys_job WHERE job_name='+sql(marker+'-'+kind)+' AND deleted=0;')});
    }
    const scan=jobs.find(item=>item.kind==='scan'),cleanup=jobs.find(item=>item.kind==='cleanup');
    const bad=await create('bad',first),same=await create('same',first),other=await create('other',second,'AUTO_REJECT'),notice=await create('notice',first,'NOTIFY_ONLY'),paused=await create('paused',first),future=await create('future',first);
    successful(await post(admin,base+'/pause',{instanceId:paused.instance}),'实际暂停自有定时流程');
    const stableWaits=JSON.stringify([instance(future),instance(paused)]);
    const invalidEntries=[];
    const injectInvalid=()=>{
      invalidEntries.length=0;
      for(const sample of [future,paused])for(const defect of ['missing','blank','number','unknown','node','context','alias']){
        const serialized=JSON.parse(sample.serialized);
        const data=Array.isArray(serialized)?serialized[1]:serialized;
        assert.equal(data.instanceId,sample.instance);assert.equal(data.waitId,sample.wait);
        if(defect==='missing')delete data.waitId;
        if(defect==='blank')data.waitId=' ';
        if(defect==='number')data.waitId=1;
        if(defect==='unknown')data.waitId='obsolete-'+sample.wait;
        if(defect==='node')data.nodeKey='other-node';
        if(defect==='context')data.executionContext='other-branch';
        const key=sample.key+':invalid-'+defect,item={tenant:sample.tenant,key};
        extraMembers.push(item);invalidEntries.push(item);
        redis('SET',sample.tenant+':'+key,JSON.stringify(serialized));
        redis('ZADD',queue(sample.tenant),1,JSON.stringify(key));
      }
    };
    const invalidCleared=()=>invalidEntries.every(item=>redis('GET',item.tenant+':'+item.key)===''&&redis('ZSCORE',queue(item.tenant),JSON.stringify(item.key))==='');
    const waitsUnchanged=()=>stableWaits===JSON.stringify([instance(future),instance(paused)])&&present(future)&&present(paused)&&history(future).length===0&&history(paused).length===0&&messages().length===0;
    injectInvalid();await success(scan,0,summary(0,14,0));
    check('扫描清理14条无有效等待身份的缓存且正常与暂停等待保持',invalidCleared()&&waitsUnchanged());
    await success(scan,0,summary(0,0,0));check('无效缓存不会重建或重复触发通知',invalidCleared()&&waitsUnchanged());
    injectInvalid();await success(cleanup,14,'定时节点清理完成：移除14条失效记录');
    check('清理任务核验等待编号节点分支和完整索引身份',invalidCleared()&&waitsUnchanged());
    await success(cleanup,0,'定时节点清理完成：移除0条失效记录');
    check('重复清理保持有效定时等待及零新增任务消息',invalidCleared()&&waitsUnchanged());evidence.invalidCacheIdentity=true;
    console.log('A3_TIMER_IDENTITY_ACTUAL: invalid_per_run=14; scan_and_cleanup=true; missing_wait_id_removed=true; persistent_waits_unchanged=true; extra_tasks=0; extra_messages=0');
    assert.equal(database('SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name='+sql(triggerName)+';'),'0');
    database('DELIMITER $$\nCREATE TRIGGER '+triggerName+' BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF LOCATE('+sql(marker+'-bad')+",NEW.payload_json)>0 AND LOCATE('定时节点触发通知',NEW.payload_json)>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='a3_timer_notice_failure'; END IF; END$$\nDELIMITER ;\n");triggerCreated=true;
    for(const sample of [bad,same,other,notice,paused])due(sample);
    const failed=await trigger(scan);check('真实定时通知插入故障上报FAILED和原异常',failed.status==='FAILED'&&failed.affected===null&&failed.stack.includes('a3_timer_notice_failure')&&failed.stack.includes('定时节点扫描存在失败项'));evidence.failure=true;
    check('定时通知失败时等待任务历史和状态共同撤销',pending(bad)&&history(bad).length===0&&instance(bad).status==='PENDING'&&database('SELECT COUNT(*) FROM wf_task WHERE instance_id='+sql(bad.instance)+';')==='0');evidence.rollback=true;
    check('同租户及另一租户定时流程继续完成',instance(same).status==='AUTO_PASSED'&&instance(other).status==='REJECTED'&&history(same).length===1&&history(other).length===1&&!present(same)&&!present(other));evidence.continuation=true;
    check('仅通知保持等待且未来及暂停流程保留',pending(notice)?.payload.notified===true&&history(notice).length===0&&!present(notice)&&present(future)&&instance(paused).status==='PAUSED');evidence.notification=true;
    const alarms=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id="+sql(failed.executeNo)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Timer failure alarm not delivered');check('定时失败告警实际送达指定员工',alarms[0].user===receiver);successful(await api(employee,'/auth/system/message/mine/'+alarms[0].id),'员工实际读取定时失败告警');evidence.alarm=true;
    const retry=pending(bad).payload;check('定时失败持久化一次重试和两分钟退避',retry.retryCount===1&&retry.nextRetryAt>Date.now()+70000&&retry.nextRetryAt<=Date.now()+120000);
    await success(scan,0,summary(0,0,1));check('退避期间没有再次执行失败流程',pending(bad).payload.retryCount===1&&history(bad).length===0);evidence.backoff=true;
    removeTrigger();due(bad);await success(scan,1,summary(1,0,1));check('故障恢复只补处理失败流程',instance(bad).status==='AUTO_PASSED'&&history(bad).length===1&&!present(bad));evidence.recovery=true;
    const delivered=await waitFor(messages,items=>items.length===4&&items.every(item=>['SUCCESS','SKIPPED'].includes(item.status)),'Timer business notifications did not finish');
    check('定时业务消息按实际租户和发起人送达',delivered.filter(item=>item.tenant===first.tenant).length===3&&delivered.filter(item=>item.tenant===first.tenant).every(item=>item.user===first.id&&item.status==='SUCCESS')&&delivered.find(item=>item.tenant===second.tenant)?.reason==='NO_CHANNEL');
    for(const item of delivered.filter(item=>item.user===first.id))successful(await api(admin,'/auth/system/message/mine/'+item.id),'发起人实际读取定时业务通知');
    const beforeMessages=JSON.stringify(messages());redis('SET',bad.tenant+':'+bad.key,bad.serialized);redis('ZADD',queue(bad.tenant),1,JSON.stringify(bad.key));
    await success(scan,0,summary(0,1,1));check('已完成等待重投只清理索引且无重复通知',history(bad).length===1&&JSON.stringify(messages())===beforeMessages);evidence.repeat=true;
    const exhausted=await create('exhausted-first',first,'AUTO_PASS',owner('g_holiday_employee',employee)),exhaustedOther=await create('exhausted-other',second);
    assert.ok(admins(first).length>0&&!admins(first).includes(exhausted.initiator),'First tenant needs administrators and a separate employee initiator');
    assert.ok(admins(second).includes(exhaustedOther.initiator),'Second tenant initiator also serves as administrator');
    database('DELIMITER $$\nCREATE TRIGGER '+triggerName+' BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF LOCATE('+sql(marker+'-exhausted-')+",NEW.payload_json)>0 AND LOCATE('定时节点触发通知',NEW.payload_json)>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='a3_timer_notice_failure'; END IF; END$$\nDELIMITER ;\n");triggerCreated=true;
    let sentinel;
    for(let attempt=1;attempt<=4;attempt++){
      if(attempt===4)sentinel=poison(exhausted,exhausted.initiator);
      for(const sample of [exhausted,exhaustedOther])due(sample);
      const result=await trigger(scan);
      check('耗尽场景真实自动执行失败并保存第'+attempt+'次计数',result.status==='FAILED'&&result.stack.includes('a3_timer_notice_failure')&&[exhausted,exhaustedOther].every(sample=>pending(sample).payload.retryCount===attempt&&history(sample).length===0&&instance(sample).status==='PENDING'));
    }
    check('耗尽提醒后续收件冲突时前序事件与已通知标记共同回滚',pending(exhausted).payload.blocked===true&&pending(exhausted).payload.notified!==true&&present(exhausted)&&failureMessages(exhausted).length===0&&database('SELECT COUNT(*) FROM outbox_event WHERE event_id='+sql(eventId(exhausted,admins(first)[0]))+';')==='0');evidence.exhaustedRollback=true;
    const otherDelivered=await waitFor(()=>failureMessages(exhaustedOther),items=>items.length===recipients(exhaustedOther).length&&items.every(item=>['SUCCESS','SKIPPED'].includes(item.status)),'Other tenant exhausted reminders did not finish');
    check('另一租户耗尽提醒继续登记且管理员兼发起人仅一条',JSON.stringify(otherDelivered.map(item=>item.user).sort())===JSON.stringify(recipients(exhaustedOther))&&otherDelivered.every(item=>item.tenant===second.tenant&&item.event===eventId(exhaustedOther,item.user))&&pending(exhaustedOther).payload.notified===true&&!present(exhaustedOther));evidence.exhaustedRecipients=true;
    due(exhausted);const notificationFailed=await trigger(scan);
    check('耗尽提醒再次失败仍保留补发入口且计数不增',notificationFailed.status==='FAILED'&&pending(exhausted).payload.retryCount===4&&pending(exhausted).payload.blocked===true&&pending(exhausted).payload.notified!==true&&present(exhausted)&&history(exhausted).length===0&&failureMessages(exhausted).length===0);evidence.exhaustedLimit=true;
    removeSentinel(sentinel);redis('DEL',exhausted.tenant+':'+exhausted.key);redis('ZREM',queue(exhausted.tenant),JSON.stringify(exhausted.key));due(exhausted);assert.ok(!present(exhausted));
    await success(scan,1,summary(1,0,1));
    check('丢失缓存后持久等待只补失败提醒且没有第五次自动执行',triggerCreated&&pending(exhausted).payload.retryCount===4&&pending(exhausted).payload.blocked===true&&pending(exhausted).payload.notified===true&&history(exhausted).length===0&&instance(exhausted).status==='PENDING'&&!present(exhausted)&&database('SELECT COUNT(*) FROM wf_task WHERE instance_id='+sql(exhausted.instance)+';')==='0');evidence.exhaustedRecovery=true;
    const firstDelivered=await waitFor(()=>failureMessages(exhausted),items=>items.length===recipients(exhausted).length&&items.every(item=>item.status==='SUCCESS'),'First tenant exhausted reminders did not finish');
    check('失败提醒覆盖当前租户全部管理员及独立发起人并保持稳定身份',JSON.stringify(firstDelivered.map(item=>item.user).sort())===JSON.stringify(recipients(exhausted))&&firstDelivered.every(item=>item.tenant===first.tenant&&item.event===eventId(exhausted,item.user)&&item.content.includes('已停止自动重试')&&!item.content.includes('a3_timer_notice_failure')));
    for(const [actor,sample] of [[{id:receiver,page:employee},exhausted],[first,exhausted]]){const record=failureMessages(sample).find(item=>item.user===actor.id);assert.ok(record);successful(await api(actor.page,'/auth/system/message/mine/'+record.id),'管理员和发起人实际读取耗尽提醒');}
    const beforeFailureMessages=JSON.stringify([failureMessages(exhausted),failureMessages(exhaustedOther)]);
    for(const sample of [exhausted,exhaustedOther]){redis('SET',sample.tenant+':'+sample.key,sample.serialized);redis('ZADD',queue(sample.tenant),1,JSON.stringify(sample.key));}
    await success(scan,0,summary(0,0,1));check('耗尽等待原缓存重投没有重复提醒或额外自动执行',JSON.stringify([failureMessages(exhausted),failureMessages(exhaustedOther)])===beforeFailureMessages&&[exhausted,exhaustedOther].every(sample=>pending(sample).payload.retryCount===4&&history(sample).length===0&&!present(sample)));evidence.exhaustedRepeat=true;
    console.log('A3_TIMER_EXHAUSTION_ACTUAL: '+JSON.stringify({realStarts:2,automaticAttemptsPerInstance:4,blockedWaits:2,firstRecipients:firstDelivered.length,secondRecipients:otherDelivered.length,notificationCollision:true,durableRecovery:true,fifthAutomaticExecution:false,cacheRequiresPersistentWait:true}));
    removeTrigger();
    for(const actor of [first,second]){const key='sys:wf:timer:'+marker+'-missing-'+actor.tenant;redis('ZADD',queue(actor.tenant),1,JSON.stringify(key));extraMembers.push({tenant:actor.tenant,key});}
    await success(cleanup,2,'定时节点清理完成：移除2条失效记录');await success(cleanup,0,'定时节点清理完成：移除0条失效记录');check('失效清理跨租户且保留暂停和未来等待',extraMembers.every(item=>redis('ZSCORE',queue(item.tenant),JSON.stringify(item.key))==='')&&present(paused)&&present(future));evidence.cleanup=true;
    const denied=await post(employee,jobsRoot+'/'+scan.id+'/trigger'),detail=await api(employee,jobsRoot+'/log/'+failed.id);check('普通员工不能执行定时后台任务或读取失败详情',denied.status===403&&detail.status===403&&!detail.body?.data);evidence.permissions=true;
    console.log('A3_TIMER_SCAN_ACTUAL: '+JSON.stringify({jobs:jobs.map(item=>item.id),realStarts:samples.length,automaticCompleted:3,notificationOnly:1,timerMessages:4,internalRequests,realMessageFailure:true,forcedTerminalWrites:0,naturalThreeMinuteWait:false}));
  }catch(error){failure=error;}
  finally {
    try{
      for(const job of jobs)await waitFor(()=>logs(job),items=>items.every(item=>item.status!=='RUNNING'),'Owned timer job still running');
      removeTrigger();for(const id of [...sentinels])removeSentinel(id);
      for(const sample of samples){if(['RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED'].includes(instance(sample).status))successful(await post(sample.page,base+'/instance/terminate',{instanceId:sample.instance,reason:marker+'-cleanup'}),'终止自有未结束定时流程');
        if(sample.key){redis('ZREM',queue(sample.tenant),JSON.stringify(sample.key));redis('DEL',sample.tenant+':'+sample.key);}}
      for(const item of extraMembers){redis('ZREM',queue(item.tenant),JSON.stringify(item.key));redis('DEL',item.tenant+':'+item.key);}
      for(const item of definitions)database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id='+item.tenant+' AND definition_id='+sql(item.id)+' AND process_key LIKE '+sql(marker+'%')+';');
      check('定时样本收尾后原索引任务授权和触发器保持',indexes()===beforeIndexes&&configuration()===beforeConfig&&grants()===beforeGrants&&triggers()===beforeTriggers&&!triggerCreated);evidence.restoration=true;
    }catch(error){console.log('A3_TIMER_SCAN_CLEANUP_FAILED: type='+error.name);failure=new AggregateError([failure,error].filter(Boolean),'Timer verification or cleanup failed');}
  }
  let files=0,bytes=0,leaks=0;
  for(const service of state.services){const directory=path.join(state.run,service.name),names=await fs.readdir(path.join(directory,'logs')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});for(const name of ['stdout.log','stderr.log',...names.filter(name=>name.endsWith('.log')).map(name=>path.join('logs',name))]){const scan=await scanSecretStream(createReadStream(path.join(directory,name)),[...secrets]);files++;bytes+=scan.bytes;leaks+=scan.leaks;}}
  const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});check('定时任务及审计日志无凭据泄漏',leaks===0&&audit.leaks===0);evidence.secrets=true;
  console.log('A3_TIMER_SCAN_SECRET_SCAN: '+JSON.stringify({files,bytes,values:secrets.size,leaks,databaseBytes:audit.bytes,databaseLeaks:audit.leaks}));
  if(failure)throw failure;
}
