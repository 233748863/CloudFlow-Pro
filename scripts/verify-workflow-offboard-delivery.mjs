import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyWorkflowOffboardDelivery({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence,redis,state,accounts}) {
  const marker='A3OF'+caseTag,base='/workflow/wf',created=[],definitions=[],events=[];
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const post=(page,url,body={})=>api(page,url,{method:'POST',body});
  const waitFor=async(read,accept,label)=>{const deadline=Date.now()+150000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,400));}while(Date.now()<deadline);throw new Error(label);};
  const leaseKey=event=>{const digest=createHash('sha256');for(const value of ['cloudflow-event-consumer-group:cloudflow-service-workflow','100000',event.id]){const bytes=Buffer.from(value),size=Buffer.alloc(4);size.writeInt32BE(bytes.length);digest.update(size).update(bytes);}return 'cloudflow:event:idem:'+digest.digest('hex');};
  const lease=event=>({state:redis('HGET',leaseKey(event),'state'),attempts:Number(redis('HGET',leaseKey(event),'attempts'))});
  const eventFor=async(type,id)=>{const event=await waitFor(()=>rows("SELECT JSON_OBJECT('id',event_id,'payload',payload_json) FROM outbox_event WHERE tenant_id=100000 AND event_type="+sql(type)+' AND aggregate_id='+id+' ORDER BY id LIMIT 1;')[0],Boolean,'Actual offboard source event missing');if(!events.some(item=>item.id===event.id))events.push(event);return event;};
  const awaitDone=event=>waitFor(()=>lease(event),item=>item.state==='DONE','Actual workflow event did not finish');
  const taskRows=()=>rows("SELECT JSON_OBJECT('id',t.task_id,'instance',t.instance_id,'owner',CAST(t.assignee AS CHAR),'name',t.assignee_name,'version',t.lock_version,'status',t.status,'from',CAST(t.disabled_from_user_id AS CHAR),'fromName',t.disabled_from_user_name,'releaseVersion',t.disabled_release_version,'event',t.disabled_release_event_id) FROM wf_task t JOIN wf_process_instance i ON i.tenant_id=t.tenant_id AND i.instance_id=t.instance_id WHERE i.tenant_id=100000 AND i.process_def_key LIKE "+sql(marker+'%')+' ORDER BY t.task_id;');
  const monitorRows=()=>rows("SELECT JSON_OBJECT('task',m.task_id,'owner',CAST(m.assignee_id AS CHAR),'name',m.assignee_name,'version',m.version,'action',m.action) FROM wf_task_monitor m JOIN wf_process_instance i ON i.tenant_id=m.tenant_id AND i.instance_id=m.instance_id WHERE i.tenant_id=100000 AND i.process_def_key LIKE "+sql(marker+'%')+' ORDER BY m.task_id;');
  const histories=()=>rows("SELECT JSON_OBJECT('task',d.task_id,'from',CAST(d.from_user_id AS CHAR),'fromName',d.from_user_name,'to',CAST(d.to_user_id AS CHAR),'toName',d.to_user_name) FROM wf_task_delegation d JOIN wf_process_instance i ON i.tenant_id=d.tenant_id AND i.instance_id=d.instance_id WHERE i.tenant_id=100000 AND i.process_def_key LIKE "+sql(marker+'%')+' ORDER BY d.task_id;');
  const original=()=>database('SELECT SHA2(CAST(JSON_OBJECT(\'id\',t.task_id,\'owner\',t.assignee,\'name\',t.assignee_name,\'status\',t.status,\'version\',t.lock_version,\'from\',t.disabled_from_user_id,\'fromName\',t.disabled_from_user_name,\'releaseVersion\',t.disabled_release_version,\'event\',t.disabled_release_event_id) AS CHAR),256) FROM wf_task t LEFT JOIN wf_process_instance i ON i.tenant_id=t.tenant_id AND i.instance_id=t.instance_id WHERE i.process_def_key IS NULL OR i.process_def_key NOT LIKE '+sql(marker+'%')+' ORDER BY t.task_id;');
  const before=original();let form,failure,trigger;
  const dropTrigger=()=>{if(trigger){database('DROP TRIGGER '+trigger+';');trigger=null;}};
  const rememberToken=async page=>{const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));};
  const createPerson=async suffix=>{
    const username='a3of_'+caseTag+'_'+suffix,name=marker+'_'+suffix+'名'.repeat(100-marker.length-suffix.length-1);assert.equal(name.length,100);
    const readQuota=()=>database("SELECT JSON_OBJECT('limit',user_limit,'version',version,'updated',update_time) FROM sys_tenant WHERE tenant_id=100000 AND deleted=0;");
    const previous=readQuota(),quota=JSON.parse(previous),count=Number(database('SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND deleted=0;'));
    const temporary=Math.max(quota.limit,count+1),file=path.join(state.run,'private','a3-offboard-capacity-'+caseTag+'-'+suffix+'.json');
    const manifest={tenant:100000,original:quota,temporary,status:'PREPARED'};await fs.writeFile(file,JSON.stringify(manifest),{flag:'wx'});
    let reserved=false;
    try {
      if(temporary!==quota.limit){assert.equal(database('UPDATE sys_tenant SET user_limit='+temporary+',update_time=update_time WHERE tenant_id=100000 AND user_limit='+quota.limit+' AND version='+quota.version+'; SELECT ROW_COUNT();'),'1');reserved=true;}
      successful(await post(admin,'/auth/system/user',{userName:username,nickName:name,deptId:100,status:'0',roleIds:[5]}),'通过账号入口创建100字符姓名验证人员');
    }finally{
      if(reserved)assert.equal(database('UPDATE sys_tenant SET user_limit='+quota.limit+',update_time=update_time WHERE tenant_id=100000 AND user_limit='+temporary+' AND version='+quota.version+'; SELECT ROW_COUNT();'),'1');
      assert.equal(readQuota(),previous);manifest.status='RESTORED';await fs.writeFile(file,JSON.stringify(manifest));
    }
    const person={username,name,user:database('SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND user_name='+sql(username)+';')};assert.match(person.user,/^[1-9][0-9]*$/);created.push(person);
    person.employee=database("INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,user_id,employee_status) VALUES (100000,"+sql(username)+','+sql(name)+",'MALE',100,"+person.user+",'REGULAR'); SELECT LAST_INSERT_ID();");assert.match(person.employee,/^[1-9][0-9]*$/);
    // Existing account API ignores its password property. Prepare only this owned identity's login fixture in the database;
    // all authentication, workflow starts, HR approval and handover still use the real endpoints.
    database("UPDATE sys_user target JOIN sys_user fixture ON fixture.tenant_id=100000 AND fixture.user_name='g_holiday_employee' AND fixture.deleted=0 SET target.password=fixture.password,target.pwd_reset_required='0' WHERE target.tenant_id=100000 AND target.user_id="+person.user+' AND target.user_name='+sql(username)+';');
    return person;
  };
  const disable=async person=>{
    const user=successful(await api(admin,'/auth/system/user/'+person.user),'读取专用账号状态');
    if(user.status!=='1')successful(await api(admin,'/auth/system/user',{method:'PUT',body:{userId:person.user,userName:person.username,nickName:person.name,deptId:100,status:'1',version:user.version,roleIds:[5]}}),'通过管理员入口停用专用账号');
    const event=await eventFor('USER_DISABLED',person.user);await awaitDone(event);return event;
  };
  const start=async(person,suffix)=>{
    const graph={nodes:[{id:'start',type:'START',title:'发起'},{id:'review',type:'APPROVAL',title:'审批',approverType:'USER',approverValue:person.user,signType:'ANY',allowAgent:false,rejectStrategy:'TERMINATE'},{id:'end',type:'END',title:'结束'}],edges:[{id:'start-review',source:'start',target:'review'},{id:'review-end',source:'review',target:'end'}]};
    const definition=successful(await post(admin,base+'/definition/save',{processKey:marker+'-'+suffix,processName:marker+'-'+suffix,formId:form,modelJson:JSON.stringify(graph),startPermissionType:'ALL',startPermissionValue:'[]'}),'保存离职交接验证流程');
    const id=definition.definitionId??definition.id;assert.ok(id);definitions.push(id);successful(await post(admin,base+'/definition/deploy/'+id),'发布离职交接验证流程');
    const context=successful(await api(employee,base+'/draft/context/'+id),'读取实际发起上下文');
    const draft=successful(await post(employee,base+'/draft',{definitionId:id,expectedVersion:0,loadedContextHash:context.contextHash,title:marker+'-'+suffix,formData:{note:marker},nodeAssignees:{}}),'保存实际发起草稿');
    successful(await post(employee,base+'/start',{draftId:draft.draftId,expectedVersion:draft.lockVersion}),'实际发起待交接审批');
  };
  const acknowledged=async(stream,group,id,deleted=false)=>waitFor(()=>{
    const parts=redis('XINFO','GROUPS',stream).split(/\r?\n/),index=parts.indexOf(group);if(index<0)return false;
    const end=parts.indexOf('name',index+1),own=parts.slice(index,end<0?undefined:end),last=own[own.indexOf('last-delivered-id')+1];if(!last)return false;
    const a=last.split('-').map(BigInt),b=id.split('-').map(BigInt);
    return (a[0]>b[0]||a[0]===b[0]&&a[1]>=b[1])&&redis('XPENDING',stream,group,id,id,1)===''&&(!deleted||redis('XRANGE',stream,id,id)==='');
  },Boolean,'Offboard replay was not acknowledged');
  try {
    const previousFiles=(await fs.readdir(path.join(state.run,'private'))).filter(name=>/^a3-offboard-capacity-[a-f0-9]{12}-(donor|next|legacy)\.json$/.test(name)&&!name.includes(caseTag));
    for(const name of previousFiles){
      const file=path.join(state.run,'private',name),manifest=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(manifest.status,'RESTORED');
      if(manifest.workflowRestored)continue;
      const [,priorTag,suffix]=name.match(/^a3-offboard-capacity-([a-f0-9]{12})-(donor|next|legacy)\.json$/),username='a3of_'+priorTag+'_'+suffix;
      const people=rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'name',nick_name) FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND user_name="+sql(username)+';');assert.equal(people.length,1);
      const previousInstances=rows("SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND deleted=0 AND status IN ('RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED') AND process_def_key LIKE "+sql('A3OF'+priorTag+'%')+';');
      for(const instance of previousInstances)successful(await post(admin,base+'/instance/terminate',{instanceId:instance.id,reason:'A3OF'+priorTag+'-recovery'}),'通过业务入口收尾此前专用验证流程');
      await disable({...people[0],username});manifest.workflowRestored=true;await fs.writeFile(file,JSON.stringify(manifest));
    }
    if(previousFiles.length)console.log('A3_OFFBOARD_PREVIOUS_RESTORED: checked_manifests='+previousFiles.length+'; business_terminal_writes=0');
    const donor=await createPerson('donor'),successor=await createPerson('next'),legacy=await createPerson('legacy');
    evidence.offboardCapacityRestoration=true;
    const nextPage=await session(successor.username,'g_holiday_employee'),hr=await session('g_holiday_hr');await rememberToken(nextPage);await rememberToken(hr);
    const saved=successful(await post(admin,base+'/form/save',{formKey:marker,formName:marker,fieldsJson:JSON.stringify([{id:'note',type:'TEXT',label:'说明'}])}),'创建离职交接验证表单');form=saved.formId??saved.id;assert.ok(form);
    await start(donor,'first');await start(donor,'second');await start(legacy,'legacy');
    const actual=taskRows(),main=actual.filter(item=>item.owner===donor.user),old=actual.filter(item=>item.owner===legacy.user);
    check('三条实际待办完整保留100字符原姓名',main.length===2&&old.length===1&&main.every(item=>item.name===donor.name)&&old[0].name===legacy.name);
    const application=successful(await post(hr,'/hr/lifecycle/applications',{applicationNo:marker,employeeId:donor.employee,type:'RESIGNATION',status:'DRAFT',effectiveDate:database('SELECT CURRENT_DATE;'),successorUserId:successor.user,detailJson:{reason:marker}}),'人事创建真实离职申请');assert.ok(Number(application)>0);
    for(const action of ['submit','approve'])successful(await post(hr,'/hr/lifecycle/applications/'+application+'/'+action),'人事实行离职审批步骤');
    for(const task of successful(await api(hr,'/hr/lifecycle/applications/'+application+'/tasks'),'读取离职交接任务'))successful(await post(hr,'/hr/lifecycle/tasks/'+task.id+'/complete'),'完成实际离职交接任务');
    const approved=successful(await api(hr,'/hr/lifecycle/applications/'+application),'读取审批后申请版本');
    const passwordDigest=database('SELECT SHA2(password,256) FROM sys_user WHERE tenant_id=100000 AND user_id='+donor.user+';');
    trigger='a3_offboard_source_'+caseTag;
    database('DELIMITER $$\nCREATE TRIGGER '+trigger+" BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF NEW.tenant_id=100000 AND NEW.event_type='EMPLOYEE_OFFBOARDED' AND NEW.aggregate_id="+donor.employee+" THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_OFFBOARD_SOURCE_FAILURE'; END IF; END$$\nDELIMITER ;\n");
    const failed=await post(hr,'/hr/lifecycle/applications/'+application+'/complete',{version:approved.version});
    check('离职通知登记失败由实际接口报告且未返回内部SQL',failed.status===500&&failed.body?.code===500&&!/OWNED_OFFBOARD_SOURCE_FAILURE|INSERT|SIGNAL/.test(JSON.stringify(failed.body)));
    dropTrigger();
    check('人事停用真实成功且原密码摘要完整保持',database('SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id='+donor.user+';')==='1'&&database('SELECT SHA2(password,256) FROM sys_user WHERE tenant_id=100000 AND user_id='+donor.user+';')===passwordDigest);
    const disabled=await eventFor('USER_DISABLED',donor.user);await awaitDone(disabled);
    const released=taskRows().filter(item=>main.some(task=>task.id===item.id));
    check('认证先停用后实际消费保存原归属和100字符姓名',released.length===2&&released.every(item=>item.owner===null&&item.from===donor.user&&item.fromName===donor.name&&item.releaseVersion===item.version&&item.event===disabled.id));
    const afterFailure=successful(await api(hr,'/hr/lifecycle/applications/'+application),'读取失败后离职申请');
    check('离职通知登记失败保留已审批申请及版本',afterFailure.status==='APPROVED'&&afterFailure.version===approved.version);evidence.offboardRelease=true;
    const beforeTransfer=JSON.stringify(taskRows()),beforeMonitor=JSON.stringify(monitorRows());
    trigger='a3_offboard_history_'+caseTag;
    database('DELIMITER $$\nCREATE TRIGGER '+trigger+' BEFORE INSERT ON wf_task_delegation FOR EACH ROW BEGIN IF NEW.tenant_id=100000 AND NEW.task_id='+sql(main.at(-1).id)+" THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_OFFBOARD_TRANSFER_FAILURE'; END IF; END$$\nDELIMITER ;\n");
    await new Promise(resolve=>setTimeout(resolve,5300));
    successful(await post(hr,'/hr/lifecycle/applications/'+application+'/complete',{version:approved.version}),'恢复后通过真实入口完成离职');
    const offboard=await eventFor('EMPLOYEE_OFFBOARDED',donor.employee);
    const failedLease=await waitFor(()=>lease(offboard),item=>item.state==='READY'&&item.attempts>=1,'Actual handover consumer failure not observed');
    check('第二条转办历史失败使实际事件整批交接回滚',JSON.stringify(taskRows())===beforeTransfer&&JSON.stringify(monitorRows())===beforeMonitor&&histories().length===0);evidence.offboardRollback=true;
    dropTrigger();const recovered=await awaitDone(offboard),transferred=taskRows().filter(item=>main.some(task=>task.id===item.id)),history=histories();
    check('原离职事件自动恢复后两条待办交给指定接任人',recovered.attempts>failedLease.attempts&&transferred.length===2&&transferred.every(item=>item.owner===successor.user&&item.name===successor.name&&item.from===null&&item.fromName===null&&item.releaseVersion===null&&item.event===null));
    check('转办历史完整保留双方100字符姓名且监控同步',history.length===2&&history.every(item=>item.from===donor.user&&item.fromName===donor.name&&item.to===successor.user&&item.toName===successor.name)&&monitorRows().filter(item=>main.some(task=>task.id===item.task)).every(item=>item.owner===successor.user&&item.name===successor.name&&item.action==='TRANSFER'));evidence.offboardRecovery=true;
    for(const task of transferred){
      const detail=successful(await api(nextPage,base+'/todo/'+task.id),'接任人通过真实待办接口读取交接任务');
      check('待办外部响应隐藏四个内部释放来源字段',!['disabledFromUserId','disabledFromUserName','disabledReleaseVersion','disabledReleaseEventId'].some(field=>JSON.stringify(detail).includes('"'+field+'"')));
    }evidence.offboardSuccessorRead=true;
    const beforeReplay=JSON.stringify(taskRows());
    for(const event of [disabled,offboard]){const id=redis('XADD','cloudflow:event:stream','*','payload',event.payload);await acknowledged('cloudflow:event:stream','cloudflow-event-consumer-group:cloudflow-service-workflow',id);}
    check('原停用和离职事件重复投递不覆盖接任人且不重复历史',JSON.stringify(taskRows())===beforeReplay&&histories().length===2&&lease(offboard).attempts===recovered.attempts);evidence.offboardRepeat=true;
    await disable(legacy);
    const stream='hr:stream:employee-left',group='group:workflow:hr-employee-left';
    const sendLegacy=()=>redis('XADD',stream,'*','userId',legacy.user,'tenantId','100000','employeeName',legacy.name,'successorUserId',successor.user);
    await acknowledged(stream,group,sendLegacy(),true);
    const legacyTask=taskRows().find(item=>item.id===old[0].id);
    check('旧独立入口消费释放待办并完整保存姓名',legacyTask.owner===successor.user&&legacyTask.name===successor.name&&legacyTask.from===null&&histories().filter(item=>item.task===legacyTask.id&&item.fromName===legacy.name&&item.toName===successor.name).length===1);
    await acknowledged(stream,group,sendLegacy(),true);
    check('旧独立入口重复事件不重复转办历史',histories().length===3);evidence.offboardLegacy=true;
    console.log('A3_OFFBOARD_ACTUAL: '+JSON.stringify({realWorkflowStarts:3,realHrApprovedApplications:1,realHandoverTasksCompleted:true,sharedConsumerAutomaticRecovery:true,legacyStreamFixture:true,names:100,forcedBusinessTerminalWrites:0}));
  }catch(error){failure=error;}
  finally {
    try {
      dropTrigger();for(const event of events)await awaitDone(event);
      const instances=rows("SELECT JSON_OBJECT('id',instance_id,'status',status) FROM wf_process_instance WHERE tenant_id=100000 AND deleted=0 AND process_def_key LIKE "+sql(marker+'%')+';');
      for(const instance of instances)if(['RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED'].includes(instance.status))successful(await post(admin,base+'/instance/terminate',{instanceId:instance.id,reason:marker+'-cleanup'}),'通过业务入口终止自有验证流程');
      for(const id of definitions)database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id=100000 AND definition_id='+sql(id)+' AND process_key LIKE '+sql(marker+'%')+';');
      for(const person of created)await disable(person);
      check('离职接续验证已移除故障并收尾自有待办，原待办保持不变',!trigger&&taskRows().every(item=>item.status!=='TODO')&&original()===before);evidence.offboardRestoration=true;
    }catch(error){failure=new AggregateError([failure,error].filter(Boolean),'Offboard verification or restoration failed');}
    for(const person of created){const index=accounts.findIndex(item=>item.username===person.username);if(index>=0)accounts.splice(index,1);}
  }
  if(failure)throw failure;
}
