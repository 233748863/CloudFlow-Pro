import assert from 'node:assert/strict';

export async function verifyAnomalyEventDelivery({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence}) {
  const marker='A3EV'+caseTag,base='/workflow/wf';
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const post=(page,url,body={})=>api(page,url,{method:'POST',body});
  const waitFor=async(read,accept,label)=>{const until=Date.now()+90000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,250));}while(Date.now()<until);throw new Error(label);};
  const user=name=>database('SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status=\'0\' AND user_name='+sql(name)+';');
  const receiver=user('g_holiday_employee'),approver=user('g_import_admin');
  assert.match(receiver,/^[1-9][0-9]*$/);assert.match(approver,/^[1-9][0-9]*$/);
  const foreign=await session('g_import_tenant');
  const token=await foreign.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));
  assert.equal(database('SELECT COUNT(level.id) FROM hr_employee e JOIN hr_position p ON p.id=e.position_id AND p.tenant_id=e.tenant_id AND p.status=1 JOIN hr_job_level level ON level.id=p.level_id AND level.tenant_id=e.tenant_id AND level.status=1 WHERE e.tenant_id=100000 AND e.deleted=0 AND e.user_id='+approver+';'),'0','Owned approver must have no effective HR job level for real fallback');
  const original=()=>database('SELECT COUNT(*) FROM wf_anomaly_alert WHERE process_def_key NOT LIKE '+sql(marker+'%')+'; SELECT COUNT(*) FROM wf_performance_stats WHERE process_def_key NOT LIKE '+sql(marker+'%')+';');
  const before=original(),definitions=[],instances=[];let form,triggerCreated=false,failure;
  const triggerName='a3_event_'+caseTag;assert.match(triggerName,/^[a-z0-9_]+$/);
  const removeTrigger=()=>{if(triggerCreated){database('DROP TRIGGER '+triggerName+';');triggerCreated=false;}};
  const alerts=()=>rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'instance',instance_id,'type',anomaly_type,'notified',notification_sent,'resolved',resolved) FROM wf_anomaly_alert WHERE tenant_id=100000 AND process_def_key LIKE "+sql(marker+'%')+' ORDER BY id;');
  const create=async name=>{
    const graph={nodes:[{id:'start',type:'START',title:'发起'},{id:'review',type:'APPROVAL',title:'职级票签',approverType:'USER',approverValue:approver,signType:'WEIGHT',weightSource:'BY_JOB_LEVEL',passWeight:1,assigneeWeights:[{jobLevelId:1,weight:1}],allowAgent:false,rejectStrategy:'TERMINATE'},{id:'end',type:'END',title:'结束'}],edges:[{id:'start-review',source:'start',target:'review'},{id:'review-end',source:'review',target:'end'}]};
    const saved=successful(await post(admin,base+'/definition/save',{processKey:marker+'-'+name,processName:marker+'-'+name,formId:form,modelJson:JSON.stringify(graph),startPermissionType:'ALL',startPermissionValue:'[]'}),'保存真实异常提醒流程');
    const id=saved.definitionId??saved.id;assert.ok(id);definitions.push(id);
    successful(await post(admin,base+'/definition/deploy/'+id),'发布真实异常提醒流程');
    const context=successful(await api(employee,base+'/draft/context/'+id),'员工读取异常提醒流程发起上下文');
    return successful(await post(employee,base+'/draft',{definitionId:id,expectedVersion:0,loadedContextHash:context.contextHash,title:marker+'-'+name,formData:{note:marker},nodeAssignees:{}}),'员工保存异常提醒流程草稿');
  };
  const start=draft=>post(employee,base+'/start',{draftId:draft.draftId,expectedVersion:draft.lockVersion});
  try {
    const saved=successful(await post(admin,base+'/form/save',{formKey:marker,formName:marker,fieldsJson:JSON.stringify([{id:'note',type:'TEXT',label:'说明'}])}),'建立自有异常提醒表单');
    form=saved.formId??saved.id;assert.ok(form);
    const draft=await create('fallback');
    database('DELIMITER $$\nCREATE TRIGGER '+triggerName+' BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF LOCATE('+sql(marker)+",NEW.payload_json)>0 AND LOCATE('WORKFLOW_ANOMALY',NEW.payload_json)>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='a3_event_notice_failure'; END IF; END$$\nDELIMITER ;\n");triggerCreated=true;
    const failed=await start(draft);
    check('真实业务发起遇到异常提醒登记失败时返回失败',failed.status>=400||failed.body?.code!==200);
    check('提醒登记失败时实际流程实例告警与消息全部回滚',database('SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND process_def_key LIKE '+sql(marker+'%')+';')==='0'&&alerts().length===0&&database("SELECT COUNT(*) FROM outbox_event WHERE LOCATE("+sql(marker)+",payload_json)>0 AND LOCATE('WORKFLOW_ANOMALY',payload_json)>0;")==='0');
    evidence.eventRollback=true;removeTrigger();
    await new Promise(resolve=>setTimeout(resolve,5300));
    const started=successful(await start(draft),'恢复后员工重新发起真实异常提醒流程');
    const instance=started.instanceId??started.processInstanceId;assert.ok(instance);instances.push(instance);
    const actual=alerts();
    check('实际职级数据缺失触发等权降级并登记唯一提醒',actual.length===1&&actual[0].instance===instance&&actual[0].type==='WEIGHT_FALLBACK'&&actual[0].notified==='Y');
    const messages=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='WORKFLOW_ANOMALY' AND biz_id="+sql(actual[0].id)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Real business anomaly reminder did not reach initiator');
    check('实际业务异常提醒送达流程发起人',messages[0].user===receiver);
    successful(await api(employee,'/auth/system/message/mine/'+messages[0].id),'发起人实际读取业务异常提醒');
    const denied=await api(foreign,'/auth/system/message/mine/'+messages[0].id);
    check('其他租户不能读取业务异常提醒',([403,404].includes(denied.status)||[403,404].includes(denied.body?.code))&&!denied.body?.data);
    evidence.eventDelivery=true;
    console.log('A3_ANOMALY_EVENT_ACTUAL: '+JSON.stringify({realWorkflowStarts:1,failedStarts:1,source:'WEIGHT_FALLBACK',cause:'missing-effective-job-level',httpBusinessRollback:true,initiatorRead:true,forcedBusinessTerminalWrites:0,scheduledPositiveAnomaly:false}));
  }catch(error){failure=error;}
  finally {
    try {
      removeTrigger();
      const remaining=rows("SELECT JSON_OBJECT('id',instance_id,'status',status) FROM wf_process_instance WHERE tenant_id=100000 AND deleted=0 AND process_def_key LIKE "+sql(marker+'%')+';');
      for(const item of remaining){if(['RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED'].includes(item.status))successful(await post(admin,base+'/instance/terminate',{instanceId:item.id,reason:marker+'-cleanup'}),'终止自有异常提醒验证流程');}
      for(const id of definitions)database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id=100000 AND definition_id='+sql(id)+' AND process_key LIKE '+sql(marker+'%')+';');
      check('异常提醒验证收尾保留原业务且自有流程无活动待办',!triggerCreated&&original()===before&&database("SELECT COUNT(*) FROM wf_task t JOIN wf_process_instance i ON i.tenant_id=t.tenant_id AND i.instance_id=t.instance_id WHERE i.tenant_id=100000 AND i.process_def_key LIKE "+sql(marker+'%')+" AND t.status='TODO';")==='0');
      evidence.eventRestoration=true;
    }catch(error){failure=new AggregateError([failure,error].filter(Boolean),'Anomaly event verification or restoration failed');}
  }
  if(failure)throw failure;
}
