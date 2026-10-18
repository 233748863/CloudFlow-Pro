import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyA3TransactionScan({admin,api,successful,session,database,check,caseTag,state,accounts,evidence}) {
  Object.assign(evidence,{transactionOnly:true,counts:false,failure:false,retention:false,alarm:false,recovery:false,repeat:false,permissions:false,restoration:false,secrets:false,asyncRollback:false,asyncDelivery:false,cleanupFailure:false,cleanupRecovery:false,demoRestoration:false});
  const marker='A3TX'+caseTag,base='/workflow/wf',root='/auth/system/job';
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const post=(page,url,body={})=>api(page,url,{method:'POST',body});
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async(read,accept,label)=>{const until=Date.now()+90000;do{const value=await read();if(accept(value))return value;await sleep(250);}while(Date.now()<until);throw new Error(label);};
  const employee=await session('g_holiday_employee'),foreign=await session('g_import_tenant'),keys=await readOwnedJobKeys(state);
  const secrets=new Set([...accounts.map(item=>item.password).filter(Boolean),...Object.values(keys)]);
  for(const page of [admin,employee,foreign]){const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));}
  const workflow=state.services.find(item=>item.name==='workflow');assert.ok(workflow);
  const receiver=database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND status='0' AND deleted=0;");
  assert.match(receiver,/^[1-9][0-9]*$/);assert.equal(database('SELECT COUNT(*) FROM sys_user WHERE user_id=0;'),'0');
  const jobs=[],definitions=[],triggers=new Set(),postponed=[];
  let failure,internalRequests=0,adjustedRetryDates=0;
  const triggerName='a3_txn_'+caseTag;assert.match(triggerName,/^[a-z0-9_]+$/);
  const removeFaults=()=>{for(const name of [...triggers]){database('DROP TRIGGER '+name+';');triggers.delete(name);}};
  const instances=()=>rows("SELECT JSON_OBJECT('id',instance_id,'status',status,'key',process_def_key) FROM wf_process_instance WHERE tenant_id=100000 AND process_def_key LIKE "+sql(marker+'%')+' ORDER BY instance_id;');
  const queued=instance=>rows("SELECT JSON_OBJECT('id',message_id,'status',status,'count',retry_count,'maximum',max_retry_count,'version',version,'waitSeconds',TIMESTAMPDIFF(SECOND,NOW(),next_retry_time)) FROM wf_transaction_message WHERE tenant_id=100000 AND business_id="+sql(instance)+" AND business_type='WORKFLOW_TRIGGER';");
  const alerts=instance=>rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'name',process_def_name,'sent',notification_sent,'node',node_key,'error',error_message) FROM wf_anomaly_alert WHERE tenant_id=100000 AND instance_id="+sql(instance)+' ORDER BY id;');
  const configs=()=>database('SELECT tenant_id,job_id,status,handler_name,cron_expression,interval_ms,deleted FROM sys_job WHERE job_name NOT LIKE '+sql(marker+'%')+' ORDER BY job_id;');
  const grants=()=>database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const beforeConfig=configs(),beforeGrants=grants();
  const fingerprint="SHA2(CAST(JSON_ARRAY(message_id,tenant_id,business_type,business_id,content,status,version,retry_count,max_retry_count,create_time,update_time,error_message) AS CHAR),256)";
  const originalRows=()=>rows("SELECT JSON_OBJECT('id',message_id,'hash',"+fingerprint+",'next',DATE_FORMAT(next_retry_time,'%Y-%m-%d %H:%i:%s')) FROM wf_transaction_message ORDER BY message_id;");
  const beforeMessages=originalRows(),originalIds=new Set(beforeMessages.map(item=>item.id));
  const demoRows=rows("SELECT JSON_OBJECT('id',message_id,'hash',"+fingerprint+",'next',DATE_FORMAT(next_retry_time,'%Y-%m-%d %H:%i:%s')) FROM wf_transaction_message WHERE status='PENDING' AND next_retry_time<=NOW() ORDER BY message_id;");
  assert.deepEqual(demoRows.map(item=>item.id),['demo_msg_002','seed_msg_deploy_004','seed_msg_org_006']);
  assert.equal(database("SELECT COUNT(*) FROM wf_transaction_message WHERE status='SUCCESS' AND update_time<NOW()-INTERVAL 7 DAY;"),'0');
  assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE handler_name IN ('txnConsistencyScan','txnConsistencyDaily') AND status='ENABLED' AND deleted=0;"),'0');
  const postponedUntil=database("SELECT DATE_FORMAT(NOW()+INTERVAL 1 DAY,'%Y-%m-%d %H:%i:%s');");
  const snapshot=path.join('D:/CloudFlowPro/.cloudflow-runtime/full-prd-20260915/approved-runtime','a3-transaction-demo-'+caseTag+'.json');
  await fs.writeFile(snapshot,JSON.stringify({marker,postponedUntil,demos:demoRows,originals:beforeMessages},null,2),{flag:'wx'});
  const logs=job=>rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'actor',trigger_by,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id="+job.id+' ORDER BY log_id;');
  const trigger=async job=>{if(job.last&&Date.now()-job.last<5300)await sleep(5300-(Date.now()-job.last));const result=successful(await post(admin,root+'/'+job.id+'/trigger'),'实际触发事务消息任务');assert.equal(result.accepted,true);job.last=Date.now();return waitFor(()=>logs(job).find(item=>item.executeNo===result.executeNo),item=>item&&item.status!=='RUNNING','Transaction job did not finish');};
  const success=async(job,count,summary)=>{
    const result=await trigger(job);
    check('事务消息任务保存准确数量摘要和操作者',result.status==='SUCCESS'&&result.affected===count&&result.message===summary&&result.actor==='g_import_admin'&&Number.isInteger(result.duration)&&result.report);
    const target='/inner/job/status/'+result.executeNo,headers=signJobRequest(keys,'cloudflow-auth','cloudflow-service-workflow','GET',target,'');secrets.add(headers['X-Job-Signature']);
    const response=await fetch('http://127.0.0.1:'+workflow.port+target,{headers,signal:AbortSignal.timeout(10000)}),body=await response.json();internalRequests++;
    check('事务消息签名反查与平台结果一致',response.status===200&&body.code===200&&body.data.affectedRows===count&&body.data.resultMsg===summary);return result;
  };
  const readNotice=async(type,id)=>{
    const notices=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type="+sql(type)+' AND biz_id='+sql(id)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Owned notice not delivered');
    check('任务失败或流程异常提醒实际送达指定员工',notices[0].user===receiver);
    successful(await api(employee,'/auth/system/message/mine/'+notices[0].id),'员工读取事务消息提醒');
    const denied=await api(foreign,'/auth/system/message/mine/'+notices[0].id);
    check('其他租户不能读取事务消息提醒',([403,404].includes(denied.status)||[403,404].includes(denied.body?.code))&&!denied.body?.data);
  };
  const due=message=>{assert.equal(database("UPDATE wf_transaction_message SET next_retry_time=NOW(),update_time=update_time WHERE tenant_id=100000 AND message_id="+sql(message.id)+" AND status='PENDING' AND version="+message.version+'; SELECT ROW_COUNT();'),'1');adjustedRetryDates++;};
  const create=async(suffix,recipients)=>{
    const name=marker+'-'+suffix;
    const form=successful(await post(admin,base+'/form/save',{formKey:name,formName:name,fieldsJson:JSON.stringify([{id:'note',type:'TEXT',label:'说明'}])}),'建立自有事务消息表单');
    const graph={nodes:[{id:'start',type:'START',title:'发起'},{id:'trigger',type:'SCRIPT',title:'异步触发',props:{triggerType:'MESSAGE',callAsync:true,failStrategy:'BLOCK',retryCount:5,timeoutSeconds:1,actionBody:{recipientIds:recipients,title:name,content:name}}},{id:'end',type:'END',title:'结束'}],edges:[{id:'start-trigger',source:'start',target:'trigger'},{id:'trigger-end',source:'trigger',target:'end'}]};
    const saved=successful(await post(admin,base+'/definition/save',{processKey:name,processName:name,formId:form.formId??form.id,modelJson:JSON.stringify(graph),startPermissionType:'ALL',startPermissionValue:'[]'}),'保存异步触发定义');
    const definition=saved.definitionId??saved.id;assert.ok(definition);definitions.push(definition);
    successful(await post(admin,base+'/definition/deploy/'+definition),'发布异步触发定义');
    const context=successful(await api(employee,base+'/draft/context/'+definition),'读取异步流程发起上下文');
    const draft=successful(await post(employee,base+'/draft',{definitionId:definition,expectedVersion:0,loadedContextHash:context.contextHash,title:name,formData:{note:marker},nodeAssignees:{}}),'员工保存异步流程草稿');
    const started=successful(await post(employee,base+'/start',{draftId:draft.draftId,expectedVersion:draft.lockVersion}),'员工发起异步触发流程');
    assert.ok(started.instanceId);return {instance:started.instanceId,name};
  };
  let agedOriginal=null;
  try {
    for(const row of demoRows){
      assert.equal(database('UPDATE wf_transaction_message SET next_retry_time='+sql(postponedUntil)+',update_time=update_time WHERE message_id='+sql(row.id)+' AND '+fingerprint+'='+sql(row.hash)+' AND next_retry_time='+sql(row.next)+'; SELECT ROW_COUNT();'),'1');
      postponed.push(row);
    }
    check('原演示消息仅临时延后且业务内容版本保持',originalRows().filter(item=>originalIds.has(item.id)).every(item=>item.hash===beforeMessages.find(old=>old.id===item.id).hash));
    for(const [id,handler] of [[122,'txnConsistencyScan'],[123,'txnConsistencyDaily']]){
      const original=successful(await api(admin,root+'/'+id),'读取原事务消息任务');assert.equal(original.handlerName,handler);assert.equal(original.status,'PAUSED');
      successful(await post(admin,root,{...original,jobId:undefined,jobName:marker+'-'+handler,jobGroup:'A3_VERIFY',handlerParam:marker,status:'PAUSED',concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:receiver,logSuccessFlag:1}),'建立暂停的事务消息验证任务');
      const job={handler,id:database('SELECT job_id FROM sys_job WHERE job_name='+sql(marker+'-'+handler)+' AND deleted=0;')};assert.match(job.id,/^[1-9][0-9]*$/);jobs.push(job);
    }
    await success(jobs[0],0,'事务消息重试完成：处理0条');
    await success(jobs[1],0,'事务消息清理完成：删除0条七天前的成功记录');evidence.counts=true;
    const healthy=await create('success',[Number(receiver)]);
    const healthyQueue=await waitFor(()=>queued(healthy.instance),items=>items.length===1&&items[0].status==='SUCCESS','Async successful message did not finish');
    check('异步消息成功后真实流程自动结束',instances().some(item=>item.id===healthy.instance&&['PASSED','AUTO_PASSED'].includes(item.status)));
    const sent=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND title="+sql(healthy.name)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Actual async message did not arrive');
    check('异步触发内容实际送达本人',sent[0].user===receiver);successful(await api(employee,'/auth/system/message/mine/'+sent[0].id),'员工读取异步触发消息');
    database('DELIMITER $$\nCREATE TRIGGER '+triggerName+' BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF LOCATE('+sql(marker)+",NEW.payload_json)>0 AND LOCATE('WORKFLOW_ANOMALY',NEW.payload_json)>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='a3_txn_notice_failure'; END IF; END$$\nDELIMITER ;\n");triggers.add(triggerName);
    const broken=await create('blocked',[0]);
    let pending=await waitFor(()=>queued(broken.instance),items=>items.length===1&&items[0].count===1&&items[0].status==='PENDING','Async failure was not rescheduled');
    check('异步提交失败保留等待流程并安排三分钟退避',pending[0].maximum===6&&pending[0].waitSeconds>0&&pending[0].waitSeconds<=180&&instances().some(item=>item.id===broken.instance&&item.status==='PENDING')&&alerts(broken.instance).length===0);evidence.asyncRollback=true;
    await success(jobs[0],0,'事务消息重试完成：处理0条');
    check('未到重试时间时任务不提前处理',queued(broken.instance)[0].count===1);evidence.retention=true;
    due(pending[0]);
    const failed=await trigger(jobs[0]);
    check('真实异步提交故障在任务平台报告FAILED及原异常',failed.status==='FAILED'&&failed.affected===null&&failed.stack.includes('a3_txn_notice_failure')&&failed.stack.includes('事务消息重试存在失败项'));evidence.failure=true;
    pending=queued(broken.instance);
    check('任务故障回滚告警并保留消息等待恢复',pending.length===1&&pending[0].count===2&&pending[0].status==='PENDING'&&alerts(broken.instance).length===0&&instances().some(item=>item.id===broken.instance&&item.status==='PENDING'));
    await readNotice('SYS_JOB',failed.executeNo);evidence.alarm=true;
    removeFaults();due(pending[0]);
    await success(jobs[0],1,'事务消息重试完成：处理1条');evidence.recovery=true;
    const recovered=queued(broken.instance),record=alerts(broken.instance);
    check('恢复后真实阻塞流程保存唯一异常及准确名称',recovered.length===1&&recovered[0].status==='FAILED'&&instances().some(item=>item.id===broken.instance&&item.status==='FAILED')&&record.length===1&&record[0].name===broken.name&&record[0].sent==='Y'&&record[0].node==='trigger');
    check('异步失败异常统计与一条实际告警一致',database('SELECT COALESCE(SUM(anomaly_count),0) FROM wf_performance_stats WHERE tenant_id=100000 AND process_def_key='+sql(broken.name)+';')==='1');
    await readNotice('WORKFLOW_ANOMALY',record[0].id);evidence.asyncDelivery=true;
    await success(jobs[0],0,'事务消息重试完成：处理0条');
    check('重复任务没有新增流程异常或再次改写终态',alerts(broken.instance).length===1&&queued(broken.instance)[0].version===recovered[0].version);evidence.repeat=true;
    agedOriginal={id:healthyQueue[0].id,updated:database("SELECT DATE_FORMAT(update_time,'%Y-%m-%d %H:%i:%s') FROM wf_transaction_message WHERE message_id="+sql(healthyQueue[0].id)+';')};
    assert.equal(database('UPDATE wf_transaction_message SET update_time=NOW()-INTERVAL 8 DAY WHERE tenant_id=100000 AND message_id='+sql(agedOriginal.id)+" AND status='SUCCESS'; SELECT ROW_COUNT();"),'1');
    database('DELIMITER $$\nCREATE TRIGGER '+triggerName+' BEFORE DELETE ON wf_transaction_message FOR EACH ROW BEGIN IF OLD.message_id='+sql(agedOriginal.id)+" THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='a3_txn_delete_failure'; END IF; END$$\nDELIMITER ;\n");triggers.add(triggerName);
    const cleanupFailed=await trigger(jobs[1]);
    check('真实历史清理故障报告FAILED且成功记录完整保留',cleanupFailed.status==='FAILED'&&cleanupFailed.stack.includes('a3_txn_delete_failure')&&queued(healthy.instance).length===1);evidence.cleanupFailure=true;
    await readNotice('SYS_JOB',cleanupFailed.executeNo);removeFaults();
    await success(jobs[1],1,'事务消息清理完成：删除1条七天前的成功记录');
    check('恢复清理仅删除自有过期成功消息并保留失败消息',queued(healthy.instance).length===0&&queued(broken.instance).length===1);evidence.cleanupRecovery=true;
    await success(jobs[1],0,'事务消息清理完成：删除0条七天前的成功记录');
    const denied=await post(employee,root+'/'+jobs[0].id+'/trigger'),detail=await api(employee,root+'/log/'+failed.id);
    check('普通员工不能执行后台重试或读取任务失败详情',denied.status===403&&detail.status===403&&!detail.body?.data);evidence.permissions=true;
    console.log('A3_TRANSACTION_SCAN_ACTUAL: '+JSON.stringify({jobs:jobs.map(item=>({id:item.id,handler:item.handler})),internalRequests,realAsyncStarts:2,realFailedTaskRuns:2,successfulRetryRows:1,cleanupRows:1,adjustedRetryDates,successTimestampAged:true,naturalSchedule:false,forcedBusinessTerminalWrites:0}));
  }catch(error){failure=error;}
  finally {
    const restorationFailures=[];
    const attempt=async action=>{try{await action();}catch(error){restorationFailures.push(error);}};
    await attempt(async()=>removeFaults());
    await attempt(async()=>{for(const job of jobs)await waitFor(()=>logs(job),items=>items.every(item=>item.status!=='RUNNING'),'Owned transaction job still running');});
    await attempt(async()=>{
      for(const item of instances())if(['RUNNING','PENDING','FAILED','PAUSED','WITHDRAWN','TASK_BACK','RESTARTED'].includes(item.status))successful(await post(admin,base+'/instance/terminate',{instanceId:item.id,reason:marker+'-cleanup'}),'终止自有事务消息流程');
      const pending=instances().flatMap(item=>queued(item.id)).filter(item=>item.status==='PENDING');
      if(pending.length){assert.ok(jobs[0]);for(const item of pending)due(item);await success(jobs[0],pending.length,'事务消息重试完成：处理'+pending.length+'条');}
    });
    await attempt(async()=>{
      if(agedOriginal&&database('SELECT COUNT(*) FROM wf_transaction_message WHERE tenant_id=100000 AND message_id='+sql(agedOriginal.id)+';')==='1'){
        database('UPDATE wf_transaction_message SET update_time='+sql(agedOriginal.updated)+' WHERE tenant_id=100000 AND message_id='+sql(agedOriginal.id)+" AND status='SUCCESS';");
        assert.equal(database("SELECT DATE_FORMAT(update_time,'%Y-%m-%d %H:%i:%s') FROM wf_transaction_message WHERE tenant_id=100000 AND status='SUCCESS' AND message_id="+sql(agedOriginal.id)+';'),agedOriginal.updated);
      }
      for(const id of definitions)database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id=100000 AND definition_id='+sql(id)+' AND process_key LIKE '+sql(marker+'%')+';');
    });
    await attempt(async()=>{
      for(const row of postponed)assert.equal(database('UPDATE wf_transaction_message SET next_retry_time='+sql(row.next)+',update_time=update_time WHERE message_id='+sql(row.id)+' AND '+fingerprint+'='+sql(row.hash)+' AND next_retry_time='+sql(postponedUntil)+'; SELECT ROW_COUNT();'),'1');
      assert.deepEqual(originalRows().filter(item=>originalIds.has(item.id)),beforeMessages);
      check('原演示消息内容版本和重试时间完整恢复',true);evidence.demoRestoration=true;
    });
    await attempt(async()=>{
      check('自有事务消息验证完成收尾且原任务权限保持',triggers.size===0&&configs()===beforeConfig&&grants()===beforeGrants&&instances().every(item=>['PASSED','AUTO_PASSED','TERMINATED'].includes(item.status)));
      evidence.restoration=true;
    });
    if(restorationFailures.length)failure=new AggregateError([failure,...restorationFailures].filter(Boolean),'Transaction verification or restoration failed');
  }
  let files=0,bytes=0,leaks=0;
  for(const service of state.services){
    const directory=path.join(state.run,service.name),names=await fs.readdir(path.join(directory,'logs')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    for(const name of ['stdout.log','stderr.log',...names.filter(name=>name.endsWith('.log')).map(name=>path.join('logs',name))]){
      const scan=await scanSecretStream(createReadStream(path.join(directory,name)),[...secrets]);files++;bytes+=scan.bytes;leaks+=scan.leaks;
    }
  }
  const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});
  check('事务消息任务及审计日志无凭据泄漏',leaks===0&&audit.leaks===0);evidence.secrets=true;
  console.log('A3_TRANSACTION_SCAN_SECRET_SCAN: '+JSON.stringify({files,bytes,values:secrets.size,leaks,databaseBytes:audit.bytes,databaseLeaks:audit.leaks}));
  if(failure)throw failure;
}
