import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyA3TaskTimeout({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker='A3T'+caseTag, base='/workflow/wf', jobsRoot='/auth/system/job';
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
  const actor=name=>{const user=users.find(item=>item.name===name);assert.ok(user);assert.match(user.id,/^[1-9][0-9]*$/);return user;};
  const first={page:admin,...actor('g_import_admin'),assignee:actor('g_holiday_employee').id};
  const second={page:foreign,...actor('g_import_tenant'),assignee:actor('g_import_tenant').id};
  const queue=tenant=>tenant+':sys:task:timeouts',retry=sample=>sample.tenant+':sys:task:timeout:retry:'+sample.task;
  const configuration=()=>database("SELECT tenant_id,job_id,job_name,status,handler_name,interval_ms,cron_expression,deleted FROM sys_job WHERE job_name NOT LIKE "+sql(marker+'%')+' ORDER BY job_id;');
  const grants=()=>database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const template=()=>database("SELECT template_id,tenant_id,title_template,content_template,params_declare,version FROM sys_message_template WHERE template_code='WF_TASK_TIMEOUT' ORDER BY tenant_id;");
  const beforeConfig=configuration(),beforeGrants=grants(),beforeTemplate=template();
  assert.ok(beforeTemplate.includes('${title}\t${content}'),'Approved timeout template must be prepared before runtime verification');
  const originalIndexes=JSON.stringify([first,second].map(owner=>[owner.tenant,redis('ZRANGE',queue(owner.tenant),0,-1,'WITHSCORES'),redis('ZRANGE',owner.tenant+':sys:task:reminders',0,-1,'WITHSCORES')]));
  const samples=[],definitions=[],forms=[],jobs=[],extraMembers=[],sentinels=new Map();let failure;
  const taskRow=sample=>rows("SELECT JSON_OBJECT('id',task_id,'status',status,'due',DATE_FORMAT(due_time,'%Y-%m-%dT%H:%i:%s')) FROM wf_task WHERE tenant_id="+sample.tenant+' AND task_id='+sql(sample.task)+';')[0];
  const status=sample=>database('SELECT status FROM wf_process_instance WHERE tenant_id='+sample.tenant+' AND instance_id='+sql(sample.instance)+';');
  const history=sample=>rows("SELECT JSON_OBJECT('id',history_id,'action',action,'type',task_type,'operator',CAST(operator_id AS CHAR)) FROM wf_task_history WHERE tenant_id="+sample.tenant+' AND task_id='+sql(sample.task)+' ORDER BY history_id;');
  const ownPredicate=()=>samples.length?'('+samples.map(sample=>'biz_id LIKE '+sql(sample.task+':%')).join(' OR ')+')':'1=0';
  const messages=()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'user',CAST(receiver_id AS CHAR),'bizId',biz_id,'status',send_status,'reason',skip_reason,'title',title,'content',content,'event',outbox_event_id) FROM sys_message_record WHERE biz_type='WF_TASK_TIMEOUT' AND "+ownPredicate()+' ORDER BY record_id;');
  const logs=job=>rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'actor',trigger_by,'trigger',trigger_type,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id="+job.id+' ORDER BY log_id;');
  const trigger=async job=>{if(job.last&&Date.now()-job.last<5300)await sleep(5300-(Date.now()-job.last));const result=successful(await post(admin,jobsRoot+'/'+job.id+'/trigger'),'实际触发超时任务');assert.equal(result.accepted,true);job.last=Date.now();return waitFor(()=>logs(job).find(item=>item.executeNo===result.executeNo),item=>item&&item.status!=='RUNNING','Timeout job did not finish');};
  const success=async(job,count,text)=>{const result=await trigger(job);check('超时任务成功数量摘要操作者准确',result.status==='SUCCESS'&&result.affected===count&&result.message===text&&result.actor==='g_import_admin'&&result.trigger==='MANUAL'&&Number.isInteger(result.duration)&&result.report);
    const target='/inner/job/status/'+result.executeNo,headers=signJobRequest(keys,'cloudflow-auth','cloudflow-service-workflow','GET',target,'');secrets.add(headers['X-Job-Signature']);
    const response=await fetch('http://127.0.0.1:'+workflow.port+target,{headers,signal:AbortSignal.timeout(10000)}),body=await response.json();check('超时签名状态反查与归档一致',response.status===200&&body.code===200&&body.data.affectedRows===count&&body.data.resultMsg===text);return result;};
  const summary=(handled,manual=0,stale=0,deferred=0)=>`超时扫描完成：自动处理${handled}项，转人工${manual}项，移除失效${stale}项，暂缓${deferred}项`;
  const due=sample=>redis('ZADD',queue(sample.tenant),Date.now()-1000,JSON.stringify(sample.task));
  const present=sample=>redis('ZSCORE',queue(sample.tenant),JSON.stringify(sample.task))!=='';
  const eventId=(sample,kind,user)=>{const identity='cloudflow-service-workflow:'+sample.tenant+':wf:task:timeout:'+sample.task+':'+sample.due+':'+kind+':'+user;const bytes=createHash('md5').update(identity).digest();bytes[6]=(bytes[6]&15)|48;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString('hex');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');};
  const poison=(sample,kind)=>{const id=eventId(sample,kind,sample.initiator);assert.equal(database('SELECT COUNT(*) FROM outbox_event WHERE event_id='+sql(id)+';'),'0');
    const payload=JSON.stringify({eventId:id,eventType:'A3_TIMEOUT_SENTINEL',sourceModule:marker,sourceId:0,tenantId:Number(sample.tenant),payloadDigest:marker});
    database('INSERT INTO outbox_event(aggregate_type,aggregate_id,event_id,event_type,payload_json,status,next_retry_at,tenant_id) VALUES('+sql(marker)+',0,'+sql(id)+",'A3_TIMEOUT_SENTINEL',"+sql(payload)+",'PUBLISHED',NOW(),"+sample.tenant+');');sentinels.set(id,sample.tenant);return id;};
  const removeSentinel=id=>{database('DELETE FROM outbox_event WHERE event_id='+sql(id)+' AND aggregate_type='+sql(marker)+" AND event_type='A3_TIMEOUT_SENTINEL' AND status='PUBLISHED';");sentinels.delete(id);};
  const create=async(name,owner,action='AUTO_PASS')=>{
    let form=forms.find(item=>item.tenant===owner.tenant);
    if(!form){const saved=successful(await post(owner.page,base+'/form/save',{formKey:marker+'-'+owner.tenant,formName:marker,fieldsJson:JSON.stringify([{id:'note',type:'TEXT',label:'说明'}])}),'建立自有超时表单');form={id:saved.formId??saved.id,tenant:owner.tenant};assert.ok(form.id);forms.push(form);}
    const graph={nodes:[{id:'start',type:'START',title:'发起'},{id:'review',type:'APPROVAL',title:name,approverType:'USER',approverValue:owner.assignee,allowAgent:false,rejectStrategy:'TERMINATE',slaHours:1,slaAction:action},{id:'end',type:'END',title:'结束'}],edges:[{id:'start-review',source:'start',target:'review'},{id:'review-end',source:'review',target:'end'}]};
    const saved=successful(await post(owner.page,base+'/definition/save',{processKey:marker+'-'+name,processName:marker+'-'+name,formId:form.id,modelJson:JSON.stringify(graph),startPermissionType:'ALL',startPermissionValue:'[]'}),'保存真实超时流程');
    const definition=saved.definitionId??saved.id;assert.ok(definition);definitions.push({id:definition,tenant:owner.tenant});successful(await post(owner.page,base+'/definition/deploy/'+definition),'发布真实超时流程');
    const context=successful(await api(owner.page,base+'/draft/context/'+definition),'读取超时流程发起上下文');
    const draft=successful(await post(owner.page,base+'/draft',{definitionId:definition,expectedVersion:0,loadedContextHash:context.contextHash,title:marker+'-'+name,formData:{note:marker},nodeAssignees:{}}),'保存真实超时流程草稿');
    const started=successful(await post(owner.page,base+'/start',{draftId:draft.draftId,expectedVersion:draft.lockVersion}),'真实启动待审批流程');
    const sample={name,tenant:owner.tenant,initiator:owner.id,assignee:owner.assignee,page:owner.page,instance:started.instanceId??started.processInstanceId};assert.ok(sample.instance);samples.push(sample);
    const tasks=rows("SELECT JSON_OBJECT('id',task_id,'due',DATE_FORMAT(due_time,'%Y-%m-%dT%H:%i:%s'),'status',status) FROM wf_task WHERE tenant_id="+owner.tenant+' AND instance_id='+sql(sample.instance)+';');assert.equal(tasks.length,1);sample.task=tasks[0].id;assert.equal(tasks[0].status,'TODO');sample.due=tasks[0].due==null?'null':tasks[0].due.replace(/:00$/,'');
    // The real engine registers the deadline in Redis; due_time may remain null.
    const deadline=Number(redis('ZSCORE',queue(sample.tenant),JSON.stringify(sample.task)));
    assert.ok(present(sample)&&deadline>Date.now()+3500000&&deadline<=Date.now()+3600000,'Real engine registers one-hour SLA index');return sample;
  };
  const alarm=async result=>{const items=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id="+sql(result.executeNo)+';'),value=>value.length===1&&value[0].status==='SUCCESS','Timeout failure alarm not delivered');check('超时失败告警实际送达指定员工',items[0].user===first.assignee);successful(await api(employee,'/auth/system/message/mine/'+items[0].id),'员工读取超时失败告警');};
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name IN ('taskReminder','taskTimeout','taskTimeoutCleanup');"),'0');
    for(const owner of [first,second])assert.equal(redis('ZCOUNT',queue(owner.tenant),'-inf',Date.now()),'0','No pre-existing due timeout work permitted');
    for(const [id,kind] of [[113,'scan'],[116,'cleanup']]){
      const handler=kind==='scan'?'taskTimeout':'taskTimeoutCleanup';const actual=database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_id='+id+' AND handler_name='+sql(handler)+' AND deleted=0;');assert.equal(actual,String(id));
      const original=successful(await api(admin,jobsRoot+'/'+actual),'读取原超时处理器');assert.equal(original.status,'PAUSED');
      successful(await post(admin,jobsRoot,{...original,jobId:undefined,jobName:marker+'-'+kind,jobGroup:'A3_VERIFY',handlerParam:marker,status:'PAUSED',triggerType:'FIXED_RATE',cronExpression:null,intervalMs:60000,concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:first.assignee,logSuccessFlag:1}),'建立暂停超时验证任务');
      jobs.push({kind,id:database('SELECT job_id FROM sys_job WHERE job_name='+sql(marker+'-'+kind)+' AND deleted=0;')});
    }
    const scan=jobs.find(item=>item.kind==='scan'),cleanup=jobs.find(item=>item.kind==='cleanup');
    const recovery=await create('recovery',first),same=await create('same',first),other=await create('other',second,'AUTO_REJECT'),paused=await create('paused',first);
    successful(await post(admin,base+'/pause',{instanceId:paused.instance}),'真实暂停自有流程');due(paused);
    const sentinel=poison(recovery,'automatic:APPROVE');for(const sample of [recovery,same,other])due(sample);
    const failed=await trigger(scan);check('真实通知登记冲突准确报告失败',failed.status==='FAILED'&&failed.affected===null&&failed.stack.includes('超时扫描存在失败项')&&failed.stack.includes('同源消息内容不一致'));evidence.messageFailure=true;
    check('通知失败回滚真实审批历史任务状态及第一名收件事件',status(recovery)==='RUNNING'&&taskRow(recovery)?.status==='TODO'&&history(recovery).length===0&&database('SELECT COUNT(*) FROM outbox_event WHERE event_id='+sql(eventId(recovery,'automatic:APPROVE',recovery.assignee))+';')==='0');evidence.rollback=true;
    check('同租户自动通过和另一租户自动驳回继续完成',status(same)==='AUTO_PASSED'&&status(other)==='REJECTED'&&history(same)[0]?.type==='AUTO_PASS'&&history(other)[0]?.type==='AUTO_REJECT'&&!present(same)&&!present(other));evidence.continuation=true;
    const retryScore=Number(redis('ZSCORE',queue(recovery.tenant),JSON.stringify(recovery.task)));check('首次失败保留索引并退避五分钟',redis('GET',retry(recovery))==='1'&&retryScore>Date.now()+240000&&retryScore<=Date.now()+300000);
    await alarm(failed);evidence.alarm=true;
    await success(scan,0,summary(0,0,0,1));check('暂停流程保留且退避期间不重试',history(recovery).length===0&&redis('GET',retry(recovery))==='1'&&present(paused)&&redis('GET',retry(paused))==='');evidence.backoff=true;
    removeSentinel(sentinel);due(recovery);await success(scan,1,summary(1,0,0,1));check('恢复仅补处理失败流程且删除重试计数',status(recovery)==='AUTO_PASSED'&&history(recovery).length===1&&redis('GET',retry(recovery))==='');evidence.recovery=true;
    const manual=await create('manual',first);const autoSentinel=poison(manual,'automatic:APPROVE');
    for(let attempt=1;attempt<=3;attempt++){
      if(attempt===3)poison(manual,'manual');due(manual);const result=await trigger(scan);
      check('真实第'+attempt+'次自动失败保持任务并准确累计',result.status==='FAILED'&&status(manual)==='RUNNING'&&taskRow(manual)?.status==='TODO'&&history(manual).length===0&&redis('GET',retry(manual))===String(attempt));
      await alarm(result);
    }
    check('第三次转人工通知失败仍保留任务且首名收件事件回滚',present(manual)&&database('SELECT COUNT(*) FROM outbox_event WHERE event_id='+sql(eventId(manual,'manual',manual.assignee))+';')==='0');evidence.manualFailure=true;
    removeSentinel(eventId(manual,'manual',manual.initiator));
    // Automatic sentinel deliberately remains: another engine attempt would fail again.
    await success(scan,0,summary(0,1,0,1));check('上限后只补人工通知且没有第四次自动审批',status(manual)==='RUNNING'&&taskRow(manual)?.status==='TODO'&&history(manual).length===0&&!present(manual)&&redis('GET',retry(manual))==='');removeSentinel(autoSentinel);evidence.manualLimit=true;
    const delivered=await waitFor(messages,items=>items.length===7&&items.every(item=>['SUCCESS','SKIPPED'].includes(item.status)),'Timeout business messages did not finish');
    check('超时结果与人工通知按任务租户和实际收件人送达',delivered.filter(item=>item.tenant==='100000').length===6&&delivered.filter(item=>item.tenant==='100000').every(item=>item.status==='SUCCESS'&&[first.id,first.assignee].includes(item.user))&&delivered.filter(item=>item.tenant==='100001').length===1&&delivered.find(item=>item.tenant==='100001').reason==='NO_CHANNEL');
    check('通知实际显示自动通过与人工处理区别',delivered.filter(item=>item.bizId.startsWith(manual.task+':')).every(item=>item.title==='超时任务自动处理失败'&&item.content.includes('人工处理'))&&delivered.filter(item=>[same.task,recovery.task].some(id=>item.bizId.startsWith(id+':'))).every(item=>item.title==='任务超时自动处理通知'&&item.content.includes('自动通过')));evidence.delivery=true;
    const snapshot=JSON.stringify(delivered);due(recovery);await success(scan,0,summary(0,0,1,1));check('已完成任务重投只清理索引且消息和历史不重复',JSON.stringify(messages())===snapshot&&history(recovery).length===1);evidence.repeat=true;
    for(const [tenant,score] of [['100000',0],['100001',-1]]){const value=JSON.stringify(marker+'-cleanup-'+tenant);redis('ZADD',queue(tenant),score,value);extraMembers.push({tenant,value});}
    await success(cleanup,2,'超时队列清理完成：移除2条异常记录');await success(cleanup,0,'超时队列清理完成：移除0条异常记录');check('异常索引清理跨租户且保留暂停任务',extraMembers.every(item=>redis('ZSCORE',queue(item.tenant),item.value)==='')&&present(paused));evidence.cleanup=true;
    for(const item of delivered.filter(item=>item.user===first.assignee))successful(await api(employee,'/auth/system/message/mine/'+item.id),'本人读取超时通知');
    const denied=await post(employee,jobsRoot+'/'+scan.id+'/trigger'),foreignMessage=await api(employee,'/auth/system/message/mine/'+delivered.find(item=>item.tenant==='100001').id);
    check('普通员工不能执行后台任务或跨租户读取消息',denied.status===403&&([403,404].includes(foreignMessage.status)||[403,404].includes(foreignMessage.body?.code))&&!foreignMessage.body?.data);evidence.permissions=true;
    console.log('A3_TASK_TIMEOUT_ACTUAL: '+JSON.stringify({jobs:jobs.map(item=>item.id),realStarts:samples.length,automaticCompleted:3,manualTransfers:1,timeoutMessages:7,realMessageRegistrationFailure:true,realManualRegistrationFailure:true,automaticRetryLimit:3,backoffMs:300000,naturalFiveMinuteWait:false,forcedTerminalWrites:0}));
  }catch(error){failure=error;}
  finally{
    try{
      for(const job of jobs)await waitFor(()=>logs(job),items=>items.every(item=>item.status!=='RUNNING'),'Owned timeout task still running');
      for(const id of [...sentinels.keys()])removeSentinel(id);
      for(const sample of samples){if(['RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED'].includes(status(sample)))successful(await post(sample.page,base+'/instance/terminate',{instanceId:sample.instance,reason:marker+'-cleanup'}),'终止自有未结束验证流程');
        if(sample.task){redis('ZREM',queue(sample.tenant),JSON.stringify(sample.task));redis('DEL',retry(sample));for(const minute of [60,30,10])redis('ZREM',sample.tenant+':sys:task:reminders',JSON.stringify(sample.task+':'+minute));}}
      for(const item of extraMembers)redis('ZREM',queue(item.tenant),item.value);
      for(const item of definitions)database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id='+item.tenant+' AND definition_id='+sql(item.id)+' AND process_key LIKE '+sql(marker+'%')+';');
      // Retain the real form versions referenced by completed workflow history; their definitions are disabled above.
      const afterIndexes=JSON.stringify([first,second].map(owner=>[owner.tenant,redis('ZRANGE',queue(owner.tenant),0,-1,'WITHSCORES'),redis('ZRANGE',owner.tenant+':sys:task:reminders',0,-1,'WITHSCORES')]));
      check('自有超时样本结束且原索引任务授权和模板保持',afterIndexes===originalIndexes&&configuration()===beforeConfig&&grants()===beforeGrants&&template()===beforeTemplate&&sentinels.size===0);evidence.restoration=true;
    }catch(error){console.log('A3_TASK_TIMEOUT_CLEANUP_FAILED: type='+error.name);failure=new AggregateError([failure,error].filter(Boolean),'Timeout verification or cleanup failed');}
  }
  let files=0,bytes=0,leaks=0;
  for(const service of state.services){const directory=path.join(state.run,service.name),names=await fs.readdir(path.join(directory,'logs')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});for(const name of ['stdout.log','stderr.log',...names.filter(name=>name.endsWith('.log')).map(name=>path.join('logs',name))]){const scan=await scanSecretStream(createReadStream(path.join(directory,name)),[...secrets]);files++;bytes+=scan.bytes;leaks+=scan.leaks;}}
  const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});check('超时任务和审计日志无凭据泄漏',leaks===0&&audit.leaks===0);evidence.secrets=true;
  console.log('A3_TASK_TIMEOUT_SECRET_SCAN: '+JSON.stringify({files,bytes,values:secrets.size,leaks,databaseBytes:audit.bytes,databaseLeaks:audit.leaks}));
  if(failure)throw failure;
}
