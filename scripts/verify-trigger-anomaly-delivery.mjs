import assert from 'node:assert/strict';

export async function verifyTriggerAnomalyDelivery({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence}) {
  Object.assign(evidence,{triggerLongTitle:false,triggerDelivery:false,triggerRollback:false,triggerStatsRollback:false,triggerRecovery:false,triggerRepeat:false,triggerRestoration:false});
  const marker='A3TR'+caseTag,base='/workflow/wf',name=marker+'-触发故障';
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const post=(page,url,body={})=>api(page,url,{method:'POST',body});
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async(read,accept,label)=>{const until=Date.now()+90000;do{const value=await read();if(accept(value))return value;await sleep(250);}while(Date.now()<until);throw new Error(label);};
  const receiver=database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0 AND status='0';");
  assert.match(receiver,/^[1-9][0-9]*$/);
  assert.equal(database('SELECT COUNT(*) FROM sys_user WHERE user_id=0;'),'0','Zero is an absent recipient fixture, never an actual delivery target');
  const foreign=await session('g_import_tenant');
  const token=await foreign.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));
  const original=()=>database('SELECT COUNT(*) FROM wf_anomaly_alert WHERE process_def_key NOT LIKE '+sql(marker+'%')+'; SELECT COUNT(*) FROM wf_performance_stats WHERE process_def_key NOT LIKE '+sql(marker+'%')+';');
  const before=original(),definitions=[];let triggerCreated=false,failure;
  const triggerName='a3_trigger_'+caseTag;assert.match(triggerName,/^[a-z0-9_]+$/);
  const removeTrigger=()=>{if(triggerCreated){database('DROP TRIGGER '+triggerName+';');triggerCreated=false;}};
  const alerts=()=>rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'instance',instance_id,'type',anomaly_type,'name',process_def_name,'node',node_key,'notified',notification_sent,'error',error_message) FROM wf_anomaly_alert WHERE tenant_id=100000 AND process_def_key="+sql(name)+' ORDER BY id;');
  const instances=()=>rows("SELECT JSON_OBJECT('id',instance_id,'status',status,'title',title) FROM wf_process_instance WHERE tenant_id=100000 AND deleted=0 AND process_def_key="+sql(name)+' ORDER BY instance_id;');
  const start=draft=>post(employee,base+'/start',{draftId:draft.draftId,expectedVersion:draft.lockVersion});
  let definition;
  const draft=async title=>{
    const context=successful(await api(employee,base+'/draft/context/'+definition),'读取触发节点流程发起上下文');
    return successful(await post(employee,base+'/draft',{definitionId:definition,expectedVersion:0,loadedContextHash:context.contextHash,title,formData:{note:marker},nodeAssignees:{}}),'保存触发节点流程草稿');
  };
  const delivered=async alert=>{
    const messages=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='WORKFLOW_ANOMALY' AND biz_id="+sql(alert.id)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Trigger failure reminder was not delivered');
    check('触发失败提醒送达实际流程发起人',messages[0].user===receiver);
    successful(await api(employee,'/auth/system/message/mine/'+messages[0].id),'发起人读取触发失败提醒');
    const denied=await api(foreign,'/auth/system/message/mine/'+messages[0].id);
    check('其他租户不能读取触发失败提醒',([403,404].includes(denied.status)||[403,404].includes(denied.body?.code))&&!denied.body?.data);
  };
  try {
    const form=successful(await post(admin,base+'/form/save',{formKey:marker,formName:marker,fieldsJson:JSON.stringify([{id:'note',type:'TEXT',label:'说明'}])}),'创建自有触发失败表单');
    const graph={nodes:[{id:'start',type:'START',title:'发起'},{id:'trigger',type:'SCRIPT',title:'触发失败',props:{triggerType:'MESSAGE',callAsync:false,failStrategy:'BLOCK',retryCount:0,timeoutSeconds:1,actionBody:{recipientIds:[0],title:marker,content:marker}}},{id:'end',type:'END',title:'结束'}],edges:[{id:'start-trigger',source:'start',target:'trigger'},{id:'trigger-end',source:'trigger',target:'end'}]};
    const saved=successful(await post(admin,base+'/definition/save',{processKey:name,processName:name,formId:form.formId??form.id,modelJson:JSON.stringify(graph),startPermissionType:'ALL',startPermissionValue:'[]'}),'保存自有触发失败流程');
    definition=saved.definitionId??saved.id;assert.ok(definition);definitions.push(definition);
    successful(await post(admin,base+'/definition/deploy/'+definition),'发布自有触发失败流程');
    const title=marker+'长'.repeat(200-marker.length),longDraft=await draft(title);
    const result=await start(longDraft);
    check('200字符标题下触发失败仍保存受阻流程而非发起报错',result.status===200&&result.body?.code===200);
    const first=instances();
    check('触发失败保留完整申请标题及FAILED状态',first.length===1&&first[0].title===title&&first[0].status==='FAILED');
    let current=alerts();
    check('触发失败提醒使用流程名称并保留节点与原因',current.length===1&&current[0].instance===first[0].id&&current[0].name===name&&current[0].node==='trigger'&&current[0].type==='EXECUTION_FAILED'&&current[0].notified==='Y'&&current[0].error.includes('消息接收人不存在'));
    check('触发异常统计与实际登记告警数量一致',database('SELECT COALESCE(SUM(anomaly_count),0) FROM wf_performance_stats WHERE tenant_id=100000 AND process_def_key='+sql(name)+';')==='1');
    evidence.triggerLongTitle=true;await delivered(current[0]);evidence.triggerDelivery=true;
    const retryDraft=await draft(marker+'-消息登记回滚');
    database('DELIMITER $$\nCREATE TRIGGER '+triggerName+' BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF LOCATE('+sql(marker)+",NEW.payload_json)>0 AND LOCATE('WORKFLOW_ANOMALY',NEW.payload_json)>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='a3_trigger_notice_failure'; END IF; END$$\nDELIMITER ;\n");triggerCreated=true;
    await sleep(5300);
    const rejected=await start(retryDraft);
    check('触发异常提醒登记故障使真实发起失败',rejected.status>=400||rejected.body?.code!==200);
    check('触发异常提醒失败整体撤销新流程节点记录及告警',instances().length===1&&alerts().length===1&&database('SELECT COUNT(*) FROM wf_node_record WHERE tenant_id=100000 AND process_def_key='+sql(name)+' AND instance_id NOT IN (SELECT instance_id FROM wf_process_instance) AND node_key=\'trigger\';')==='0');
    evidence.triggerRollback=true;removeTrigger();
    const beforeOutbox=database("SELECT COUNT(*) FROM outbox_event WHERE LOCATE("+sql(marker)+",payload_json)>0 AND LOCATE('WORKFLOW_ANOMALY',payload_json)>0;");
    database('DELIMITER $$\nCREATE TRIGGER '+triggerName+' BEFORE UPDATE ON wf_performance_stats FOR EACH ROW BEGIN IF NEW.tenant_id=100000 AND NEW.process_def_key='+sql(name)+" AND NEW.anomaly_count>OLD.anomaly_count THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='a3_trigger_stats_failure'; END IF; END$$\nDELIMITER ;\n");triggerCreated=true;
    await sleep(5300);
    const statsRejected=await start(retryDraft);
    check('触发异常统计更新故障使真实发起失败',statsRejected.status>=400||statsRejected.body?.code!==200);
    check('统计失败撤销新实例告警通知且保持原计数',instances().length===1&&alerts().length===1&&database('SELECT COALESCE(SUM(anomaly_count),0) FROM wf_performance_stats WHERE tenant_id=100000 AND process_def_key='+sql(name)+';')==='1'&&database("SELECT COUNT(*) FROM outbox_event WHERE LOCATE("+sql(marker)+",payload_json)>0 AND LOCATE('WORKFLOW_ANOMALY',payload_json)>0;")===beforeOutbox);
    evidence.triggerStatsRollback=true;removeTrigger();await sleep(5300);
    const recovered=successful(await start(retryDraft),'消息登记恢复后重试原草稿');
    current=alerts();
    check('原草稿恢复只新建一个受阻流程和对应异常提醒',instances().length===2&&instances().every(item=>item.status==='FAILED')&&current.length===2&&current.every(item=>item.notified==='Y'));
    check('恢复后异常统计与两条实际告警保持一致',database('SELECT COALESCE(SUM(anomaly_count),0) FROM wf_performance_stats WHERE tenant_id=100000 AND process_def_key='+sql(name)+';')==='2');
    await delivered(current.find(item=>item.instance!==first[0].id));evidence.triggerRecovery=true;
    await sleep(5300);
    const repeated=await start(retryDraft);
    check('重复提交已使用草稿返回原实例且不重复创建流程提醒及统计',repeated.status===200&&repeated.body?.code===200&&Boolean(recovered.instanceId)&&repeated.body?.data?.instanceId===recovered.instanceId&&instances().length===2&&alerts().length===2&&database('SELECT COALESCE(SUM(anomaly_count),0) FROM wf_performance_stats WHERE tenant_id=100000 AND process_def_key='+sql(name)+';')==='2');evidence.triggerRepeat=true;
    console.log('A3_TRIGGER_ANOMALY_ACTUAL: '+JSON.stringify({source:'TRIGGER_BLOCK',cause:'absent-message-recipient',realWorkflowStarts:2,failedStarts:2,longTitleCharacters:200,fullTitlePreserved:true,definitionNamePreserved:true,httpBusinessRollback:true,statisticsRollback:true,initiatorRead:true,externalHttpInvoked:false,scheduledPositiveAnomaly:false,forcedBusinessTerminalWrites:0}));
  }catch(error){failure=error;}
  finally {
    try {
      removeTrigger();
      for(const item of instances()){if(['RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED'].includes(item.status))successful(await post(admin,base+'/instance/terminate',{instanceId:item.id,reason:marker+'-cleanup'}),'终止自有触发失败流程');}
      for(const id of definitions)database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND deleted=0 AND definition_id="+sql(id)+' AND process_key='+sql(name)+';');
      check('触发提醒验证恢复原业务并收尾自有流程',!triggerCreated&&original()===before&&instances().every(item=>item.status==='TERMINATED'));evidence.triggerRestoration=true;
    }catch(error){failure=new AggregateError([failure,error].filter(Boolean),'Trigger anomaly verification or restoration failed');}
  }
  if(failure)throw failure;
}
