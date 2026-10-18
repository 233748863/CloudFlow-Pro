import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyDisabledUserDelivery({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence,redis,state}) {
  await recoverDisabledUserRuns({admin,api,successful,database,redis,state,caseTag});
  const marker='A3DU'+caseTag,base='/workflow/wf',username='a3du_'+caseTag;
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const post=(page,url,body={})=>api(page,url,{method:'POST',body});
  const waitFor=async(read,accept,label)=>{const until=Date.now()+150000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,400));}while(Date.now()<until);throw new Error(label);};
  const receiver=database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND user_name='g_holiday_employee';");assert.match(receiver,/^[1-9][0-9]*$/);
  const original=()=>database('SELECT COUNT(*) FROM wf_anomaly_alert WHERE process_def_key NOT LIKE '+sql(marker+'%')+'; SELECT COUNT(*) FROM wf_performance_stats WHERE process_def_key NOT LIKE '+sql(marker+'%')+';');
  const before=original(),definitions=[];let userId,form,event,leaseKey,triggerCreated=false,failure;
  const triggerName='a3_disabled_'+caseTag;assert.match(triggerName,/^[a-z0-9_]+$/);
  const removeTrigger=()=>{if(triggerCreated){database('DROP TRIGGER '+triggerName+';');triggerCreated=false;}};
  const alerts=()=>rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'task',task_id,'key',process_def_key,'name',process_def_name,'type',anomaly_type,'notified',notification_sent) FROM wf_anomaly_alert WHERE tenant_id=100000 AND process_def_key LIKE "+sql(marker+'%')+' ORDER BY task_id;');
  const tasks=()=>rows("SELECT JSON_OBJECT('id',t.task_id,'assignee',CAST(t.assignee AS CHAR),'name',t.assignee_name,'version',t.lock_version,'status',t.status) FROM wf_task t JOIN wf_process_instance i ON i.tenant_id=t.tenant_id AND i.instance_id=t.instance_id WHERE i.tenant_id=100000 AND i.process_def_key LIKE "+sql(marker+'%')+' ORDER BY t.task_id;');
  const monitors=()=>rows("SELECT JSON_OBJECT('id',m.task_id,'assignee',CAST(m.assignee_id AS CHAR),'name',m.assignee_name) FROM wf_task_monitor m JOIN wf_process_instance i ON i.tenant_id=m.tenant_id AND i.instance_id=m.instance_id WHERE i.tenant_id=100000 AND i.process_def_key LIKE "+sql(marker+'%')+' ORDER BY m.task_id;');
  const lease=()=>({state:redis('HGET',leaseKey,'state'),attempts:Number(redis('HGET',leaseKey,'attempts'))});
  const eventRows=()=>rows("SELECT JSON_OBJECT('id',event_id,'payload',payload_json) FROM outbox_event WHERE tenant_id=100000 AND event_type='USER_DISABLED' AND aggregate_id="+userId+';');
  const setLease=()=>{const digest=createHash('sha256');for(const value of ['cloudflow-event-consumer-group:cloudflow-service-workflow','100000',event.id]){const bytes=Buffer.from(value),size=Buffer.alloc(4);size.writeInt32BE(bytes.length);digest.update(size).update(bytes);}leaseKey='cloudflow:event:idem:'+digest.digest('hex');};
  const create=async name=>{
    const graph={nodes:[{id:'start',type:'START',title:'发起'},{id:'review',type:'APPROVAL',title:'审批',approverType:'USER',approverValue:userId,signType:'ANY',allowAgent:false,rejectStrategy:'TERMINATE'},{id:'end',type:'END',title:'结束'}],edges:[{id:'start-review',source:'start',target:'review'},{id:'review-end',source:'review',target:'end'}]};
    const saved=successful(await post(admin,base+'/definition/save',{processKey:marker+'-'+name,processName:marker+'-'+name,formId:form,modelJson:JSON.stringify(graph),startPermissionType:'ALL',startPermissionValue:'[]'}),'保存专用账号停用验证流程');
    const id=saved.definitionId??saved.id;assert.ok(id);definitions.push(id);
    successful(await post(admin,base+'/definition/deploy/'+id),'发布专用账号停用验证流程');
    const context=successful(await api(employee,base+'/draft/context/'+id),'员工读取停用验证流程发起上下文');
    const draft=successful(await post(employee,base+'/draft',{definitionId:id,expectedVersion:0,loadedContextHash:context.contextHash,title:marker+'-'+name,formData:{note:marker},nodeAssignees:{}}),'员工保存停用验证流程草稿');
    successful(await post(employee,base+'/start',{draftId:draft.draftId,expectedVersion:draft.lockVersion}),'员工实际发起停用验证流程');
  };
  const createUser=async password=>{
    const read=()=>database("SELECT JSON_OBJECT('limit',user_limit,'version',version,'updated',update_time) FROM sys_tenant WHERE tenant_id=100000 AND deleted=0;");
    const originalQuota=read(),quota=JSON.parse(originalQuota),count=Number(database('SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND deleted=0;'));
    assert.ok(Number.isSafeInteger(count)&&count>=0&&Number.isSafeInteger(quota.limit)&&quota.limit>0);
    const capacity=Math.max(quota.limit,count+1),file=path.join(state.run,'private','a3-disabled-capacity-'+caseTag+'.json');
    const manifest={tenant:100000,original:quota,temporary:capacity,status:'PREPARED'};
    await fs.writeFile(file,JSON.stringify(manifest),{flag:'wx'});
    let reserved=false;
    try {
      if(capacity!==quota.limit){assert.equal(database('UPDATE sys_tenant SET user_limit='+capacity+',update_time=update_time WHERE tenant_id=100000 AND user_limit='+quota.limit+' AND version='+quota.version+'; SELECT ROW_COUNT();'),'1');reserved=true;}
      successful(await post(admin,'/auth/system/user',{userName:username,nickName:marker,password,status:'0',roleIds:[5]}),'建立专用审批账号');
    }finally{
      if(reserved)assert.equal(database('UPDATE sys_tenant SET user_limit='+quota.limit+',update_time=update_time WHERE tenant_id=100000 AND user_limit='+capacity+' AND version='+quota.version+'; SELECT ROW_COUNT();'),'1');
      assert.equal(read(),originalQuota,'Owned tenant quota must be restored immediately after account creation');
      manifest.status='RESTORED';await fs.writeFile(file,JSON.stringify(manifest));
      evidence.disabledCapacityRestoration=true;
      console.log('A3_DISABLED_CAPACITY_RESTORED: original='+quota.limit+'; temporary='+capacity+'; metadata_unchanged=true');
    }
  };
  try {
    const password='Cf9!'+randomBytes(20).toString('base64url');secrets.add(password);
    await createUser(password);
    userId=database('SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND user_name='+sql(username)+';');assert.match(userId,/^[1-9][0-9]*$/);
    const saved=successful(await post(admin,base+'/form/save',{formKey:marker,formName:marker,fieldsJson:JSON.stringify([{id:'note',type:'TEXT',label:'说明'}])}),'建立专用账号停用验证表单');form=saved.formId??saved.id;assert.ok(form);
    await create('first');await create('second');
    const beforeTasks=tasks(),beforeMonitors=monitors();
    check('实际发起的两条待办均交给专用审批账号',beforeTasks.length===2&&beforeTasks.every(item=>item.assignee===userId&&item.status==='TODO')&&beforeMonitors.length===2&&beforeMonitors.every(item=>item.assignee===userId));
    const last=beforeTasks.at(-1).id;
    database('DELIMITER $$\nCREATE TRIGGER '+triggerName+' BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM wf_anomaly_alert WHERE id=NEW.aggregate_id AND tenant_id=100000 AND task_id='+sql(last)+") AND NEW.event_type='MESSAGE_SEND' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='a3_disabled_notice_failure'; END IF; END$$\nDELIMITER ;\n");triggerCreated=true;
    const user=successful(await api(admin,'/auth/system/user/'+userId),'读取专用账号最新状态');
    successful(await api(admin,'/auth/system/user',{method:'PUT',body:{userId,userName:username,nickName:marker,status:'1',version:user.version,roleIds:[5]}}),'管理员实际停用专用审批账号');
    event=await waitFor(()=>eventRows()[0],Boolean,'Owned user disabled event was not registered');setLease();
    const failedLease=await waitFor(lease,item=>item.state==='READY'&&item.attempts>=1,'Expected actual consumer failure not observed');
    check('管理员停用已保存且实际消费失败等待重试',database('SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id='+userId+';')==='1'&&failedLease.attempts>=1);evidence.disabledFailure=true;
    check('第二条提醒失败使整批待办监控及告警消息一起撤销',JSON.stringify(tasks())===JSON.stringify(beforeTasks)&&JSON.stringify(monitors())===JSON.stringify(beforeMonitors)&&alerts().length===0&&database("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND' AND LOCATE('WORKFLOW_ANOMALY',payload_json)>0 AND LOCATE("+sql(marker)+',payload_json)>0;')==='0');evidence.disabledRollback=true;
    removeTrigger();
    const done=await waitFor(lease,item=>item.state==='DONE','Original disabled event did not automatically recover');
    const afterTasks=tasks(),afterMonitors=monitors(),actual=alerts();
    check('原停用事件自动重试后清除两条待办及监控中的审批人',done.attempts>failedLease.attempts&&afterTasks.length===2&&afterTasks.every(item=>item.assignee===null&&item.name===null)&&afterMonitors.every(item=>item.assignee===null&&item.name===null));evidence.disabledRecovery=true;
    check('两条无人审批提醒均保留流程名称且只登记一次',actual.length===2&&actual.every(item=>item.type==='NO_ASSIGNEE'&&item.notified==='Y'&&item.key===item.name&&item.name.startsWith(marker)));
    const foreign=await session('g_import_tenant');const token=await foreign.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));
    for(const alert of actual){
      const messages=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='WORKFLOW_ANOMALY' AND biz_id="+sql(alert.id)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Disabled reminder did not reach initiator');
      check('账号停用提醒实际送达发起人',messages[0].user===receiver);
      successful(await api(employee,'/auth/system/message/mine/'+messages[0].id),'发起人实际读取账号停用提醒');
      const denied=await api(foreign,'/auth/system/message/mine/'+messages[0].id);
      check('其他租户无法读取账号停用提醒',([403,404].includes(denied.status)||[403,404].includes(denied.body?.code))&&!denied.body?.data);
    }evidence.disabledDelivery=true;
    const stream='cloudflow:event:stream',group='cloudflow-event-consumer-group:cloudflow-service-workflow';
    const replay=redis('XADD',stream,'*','payload',event.payload);assert.match(replay,/^\d+-\d+$/);
    await waitFor(()=>redis('XINFO','GROUPS',stream),value=>{const groups=value.split(/\r?\n/);const index=groups.indexOf(group);if(index<0)return false;const end=groups.indexOf('name',index+1);const own=groups.slice(index,end<0?undefined:end);const lastDelivered=own[own.indexOf('last-delivered-id')+1];if(!lastDelivered)return false;const a=lastDelivered.split('-').map(BigInt),b=replay.split('-').map(BigInt);return (a[0]>b[0]||(a[0]===b[0]&&a[1]>=b[1]))&&redis('XPENDING',stream,group,replay,replay,1)==='';},'Replayed original event was not acknowledged');
    check('原事件重复投递不重复改待办或生成提醒',JSON.stringify(tasks())===JSON.stringify(afterTasks)&&alerts().length===2&&lease().attempts===done.attempts);evidence.disabledRepeat=true;
    console.log('A3_DISABLED_USER_ACTUAL: '+JSON.stringify({realStarts:2,disabledAccounts:1,failedConsumerAttempts:failedLease.attempts,completedAttempts:done.attempts,automaticPendingRecovery:true,originalEventReplay:true,businessTerminalWrites:0}));
  }catch(error){failure=error;}
  finally {
    try {
      removeTrigger();
      if(!userId){const found=database('SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND user_name='+sql(username)+';');if(found)userId=found;}
      if(userId&&!event){event=eventRows()[0];if(event)setLease();}
      if(event)await waitFor(lease,item=>item.state==='DONE','Owned disabled consumer must finish before cleanup');
      const remaining=rows("SELECT JSON_OBJECT('id',instance_id,'status',status) FROM wf_process_instance WHERE tenant_id=100000 AND deleted=0 AND process_def_key LIKE "+sql(marker+'%')+';');
      for(const item of remaining){if(['RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED'].includes(item.status))successful(await post(admin,base+'/instance/terminate',{instanceId:item.id,reason:marker+'-cleanup'}),'终止自有账号停用验证流程');}
      for(const id of definitions)database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id=100000 AND definition_id='+sql(id)+' AND process_key LIKE '+sql(marker+'%')+';');
      if(userId&&database('SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id='+userId+';')!=='1'){
        const user=successful(await api(admin,'/auth/system/user/'+userId),'读取自有账号收尾状态');
        successful(await api(admin,'/auth/system/user',{method:'PUT',body:{userId,userName:username,nickName:marker,status:'1',version:user.version,roleIds:[5]}}),'停用本轮自有验证账号');
        event=await waitFor(()=>eventRows()[0],Boolean,'Cleanup disabled event missing');setLease();await waitFor(lease,item=>item.state==='DONE','Cleanup disabled event did not finish');
      }
      check('账号停用验证收尾保留原业务并终止自有待办',!triggerCreated&&original()===before&&tasks().every(item=>item.status!=='TODO'));evidence.disabledRestoration=true;
    }catch(error){failure=new AggregateError([failure,error].filter(Boolean),'Disabled user verification or restoration failed');}
  }
  if(failure)throw failure;
}

async function recoverDisabledUserRuns({admin,api,successful,database,redis,state,caseTag}) {
  const directory=path.join(state.run,'private');
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  for(const name of await fs.readdir(directory)){
    const match=name.match(/^a3-disabled-capacity-([a-f0-9]{12})\.json$/);if(!match||match[1]===caseTag)continue;
    const file=path.join(directory,name);assert.ok(!(await fs.lstat(file)).isSymbolicLink());
    const manifest=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(manifest.tenant,100000);assert.equal(manifest.status,'RESTORED');
    const marker='A3DU'+match[1],username='a3du_'+match[1];
    const instances=rows("SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND deleted=0 AND status='RUNNING' AND process_def_key LIKE "+sql(marker+'%')+';');if(!instances.length)continue;
    const users=rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'status',status) FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND user_name="+sql(username)+';');assert.equal(users.length,1);assert.equal(users[0].status,'1');
    const events=rows("SELECT JSON_OBJECT('id',event_id,'payload',payload_json) FROM outbox_event WHERE tenant_id=100000 AND event_type='USER_DISABLED' AND aggregate_id="+users[0].id+';');assert.equal(events.length,1);
    const event=events[0],digest=createHash('sha256');
    for(const value of ['cloudflow-event-consumer-group:cloudflow-service-workflow','100000',event.id]){const bytes=Buffer.from(value),size=Buffer.alloc(4);size.writeInt32BE(bytes.length);digest.update(size).update(bytes);}
    const key='cloudflow:event:idem:'+digest.digest('hex');
    const redriven=redis('HGET',key,'state')!=='DONE';
    if(redriven)redis('XADD','cloudflow:event:stream','*','payload',event.payload);
    const deadline=Date.now()+150000;
    while(redis('HGET',key,'state')!=='DONE'){if(Date.now()>deadline)throw new Error('Previous owned disabled event has not recovered');await new Promise(resolve=>setTimeout(resolve,500));}
    for(const instance of instances)successful(await api(admin,'/workflow/wf/instance/terminate',{method:'POST',body:{instanceId:instance.id,reason:marker+'-recovery'}}),'通过业务接口终止此前停用验证流程');
    database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id=100000 AND process_key LIKE '+sql(marker+'%')+';');
    assert.equal(database("SELECT COUNT(*) FROM wf_task t JOIN wf_process_instance i ON i.tenant_id=t.tenant_id AND i.instance_id=t.instance_id WHERE i.tenant_id=100000 AND i.process_def_key LIKE "+sql(marker+'%')+" AND t.status='TODO';"),'0');
    manifest.workflowRestored=true;await fs.writeFile(file,JSON.stringify(manifest));
    console.log('A3_DISABLED_PREVIOUS_RESTORED: instances='+instances.length+'; original_event_redrive='+redriven+'; business_terminal_writes=0');
  }
}
