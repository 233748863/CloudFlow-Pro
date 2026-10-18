import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { verifyAnomalyEventDelivery } from './verify-anomaly-event-delivery.mjs';
import { verifyDisabledUserDelivery } from './verify-disabled-user-delivery.mjs';
import { verifyTriggerAnomalyDelivery } from './verify-trigger-anomaly-delivery.mjs';
import { verifyWorkflowHttpTrigger } from './verify-workflow-http-trigger.mjs';
import { verifyB2Capabilities } from './verify-b2-capabilities.mjs';
import { repairB2DefinitionFixtures } from './repair-b2-definition-fixtures.mjs';
import { verifyA3TransactionScan } from './verify-a3-transaction-scan.mjs';
import { verifyWorkflowOffboardDelivery } from './verify-workflow-offboard-delivery.mjs';
import { verifyWorkflowHAdvanceOffboard } from './verify-workflow-h-advance-offboard.mjs';
import { verifyB1ApprovalPolicies } from './verify-b1-approval-policies.mjs';
import { verifyB1DesignerUi } from './verify-b1-designer-ui.mjs';
import { verifyB1TaskControls } from './verify-b1-task-controls.mjs';
import { verifyB1LaunchSelection } from './verify-b1-launch-selection.mjs';
import { verifyB1RejectionStrategies } from './verify-b1-rejection-strategies.mjs';
import { verifyB1TimeoutStrategies } from './verify-b1-timeout-strategies.mjs';
import { verifyB1LegacyAssignees } from './verify-b1-legacy-assignees.mjs';
import { verifyB1TaskSemantics } from './verify-b1-task-semantics.mjs';
import { verifyB1NodeDesignerUi } from './verify-b1-node-designer-ui.mjs';
import { verifyB1ManualPolicyProbe } from './verify-b1-manual-policy-probe.mjs';
import { verifyB1ManualRequired } from './verify-b1-manual-required.mjs';
import { verifyB1LegacyNodes } from './verify-b1-legacy-nodes.mjs';

export async function verifyA3AnomalyScan({admin,api,successful,session,database,check,caseTag,state,accounts,evidence}) {
  if(process.argv.includes('--transaction-only')) return verifyA3TransactionScan({admin,api,successful,session,database,check,caseTag,state,accounts,evidence});
  const offboardOnly=process.argv.includes('--offboard-only');
  const triggerOnly=process.argv.includes('--trigger-only')||offboardOnly;
  const b2Capabilities=['1','ui','designer','hr'].includes(process.env.CLOUDFLOW_B2_CAPABILITIES);
  const b2UiOnly=['ui','designer','hr'].includes(process.env.CLOUDFLOW_B2_CAPABILITIES);
  const b1Policies=['1','designer','controls','launch','rejection','rejection-ui','timeout','legacy','semantics','nodes','manual-policy','manual-required','legacy-nodes'].includes(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES);
  assert.ok(!b1Policies || (triggerOnly && !offboardOnly && !b2Capabilities), 'B1 policies require an independent workflow focus');
  assert.ok(!b2Capabilities || (triggerOnly && !offboardOnly), 'B2 capabilities require the HTTP trigger focus');
  evidence.offboardOnly=offboardOnly;
  evidence.triggerOnly=triggerOnly;
  const marker='A3AN'+caseTag,root='/auth/system/job';
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async(read,accept,label)=>{const end=Date.now()+90000;do{const value=await read();if(accept(value))return value;await sleep(250);}while(Date.now()<end);throw new Error(label);};
  const post=(page,url,body={})=>api(page,url,{method:'POST',body});
  const employee=await session('g_holiday_employee'),keys=await readOwnedJobKeys(state);
  const secrets=new Set([...accounts.map(item=>item.password).filter(Boolean),...Object.values(keys)]);
  for(const page of [admin,employee]){const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));}
  const redis=await ownedGatewayRedis(state),workflow=state.services.find(item=>item.name==='workflow');assert.ok(workflow);
  if(b2Capabilities) await repairB2DefinitionFixtures({admin,api,successful,database,check,caseTag,accounts,evidence});
  const receiver=database("SELECT user_id FROM sys_user WHERE user_name='g_holiday_employee' AND deleted=0 AND status='0';");assert.match(receiver,/^[1-9][0-9]*$/);
  const config=()=>database("SELECT tenant_id,job_id,job_name,status,handler_name,interval_ms,cron_expression,deleted FROM sys_job WHERE job_name NOT LIKE "+sql(marker+'%')+' ORDER BY job_id;');
  const grants=()=>database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const counts=()=>database('SELECT COUNT(*) FROM wf_anomaly_alert; SELECT COUNT(*) FROM wf_performance_stats;');
  const beforeConfig=config(),beforeGrants=grants(),beforeCounts=counts(),jobs=[];let failure,internalRequests=0,overridden=false;
  const key='100000:sys:config:tenant:sys.workflow.anomaly.runningHoursThreshold',fault=JSON.stringify('-1');
  const originalExists=redis('EXISTS',key)==='1',original=originalExists?redis('GET',key):null;
  const originalTtl=Number(redis('PTTL',key)),originalDeadline=originalTtl>0?Date.now()+originalTtl:null;
  assert.ok(!originalExists||originalTtl===-1,'Stable persistent original threshold or absent key required');
  const restore=()=>{
    if(!overridden)return;
    assert.equal(redis('EVAL',"if redis.call('get',KEYS[1])~=ARGV[1] then return 0 end if ARGV[2]=='1' then redis.call('set',KEYS[1],ARGV[3]) else redis.call('del',KEYS[1]) end return 1",1,key,fault,originalExists?'1':'0',original??''),'1','Owned threshold changed unexpectedly');
    overridden=false;
  };
  const logs=job=>rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'actor',trigger_by,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id="+job.id+' ORDER BY log_id;');
  const trigger=async job=>{if(job.last&&Date.now()-job.last<5300)await sleep(5300-(Date.now()-job.last));const result=successful(await post(admin,root+'/'+job.id+'/trigger'),'实际触发流程异常巡检');assert.equal(result.accepted,true);job.last=Date.now();return waitFor(()=>logs(job).find(item=>item.executeNo===result.executeNo),item=>item&&item.status!=='RUNNING','Anomaly scan did not finish');};
  const success=async job=>{
    const result=await trigger(job),summary='流程异常巡检完成：新增告警0条，补登提醒0条';
    check('流程异常空巡检保存准确数量摘要及操作者',result.status==='SUCCESS'&&result.affected===0&&result.message===summary&&result.actor==='g_import_admin'&&Number.isInteger(result.duration)&&result.report);
    const target='/inner/job/status/'+result.executeNo,headers=signJobRequest(keys,'cloudflow-auth','cloudflow-service-workflow','GET',target,'');secrets.add(headers['X-Job-Signature']);
    const response=await fetch('http://127.0.0.1:'+workflow.port+target,{headers,signal:AbortSignal.timeout(10000)}),body=await response.json();internalRequests++;
    check('流程异常签名反查与平台保存结果一致',response.status===200&&body.code===200&&body.data.affectedRows===0&&body.data.resultMsg===summary);return result;
  };
  if(!triggerOnly) try {
    assert.equal(database("SELECT COUNT(*) FROM wf_process_monitor m WHERE m.status='RUNNING' AND NOT EXISTS(SELECT 1 FROM wf_task t WHERE t.tenant_id=m.tenant_id AND t.instance_id=m.instance_id);"),'0','Actual daily scan must start without preexisting eligible monitors');
    assert.equal(database("SELECT COUNT(*) FROM wf_process_monitor m WHERE m.status='RUNNING' AND m.start_time<NOW()-INTERVAL 24 HOUR AND NOT EXISTS(SELECT 1 FROM wf_task t WHERE t.tenant_id=m.tenant_id AND t.instance_id=m.instance_id AND t.status='TODO');"),'0','Actual deadlock scan must start without preexisting eligible monitors');
    for(const [originalId,handler] of [[118,'anomalyDetect'],[119,'anomalyDetectDaily']]){
      const originalJob=successful(await api(admin,root+'/'+originalId),'读取原流程异常处理器');assert.equal(originalJob.handlerName,handler);assert.equal(originalJob.status,'PAUSED');
      successful(await post(admin,root,{...originalJob,jobId:undefined,jobName:marker+'-'+handler,jobGroup:'A3_VERIFY',handlerParam:marker,status:'PAUSED',concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:receiver,logSuccessFlag:1}),'建立暂停流程异常验证任务');
      const job={handler,id:database('SELECT job_id FROM sys_job WHERE job_name='+sql(marker+'-'+handler)+' AND deleted=0;')};assert.match(job.id,/^[1-9][0-9]*$/);jobs.push(job);await success(job);
    }
    evidence.counts=true;
    if(originalExists)assert.equal(redis('EVAL',"if redis.call('get',KEYS[1])~=ARGV[1] then return 0 end redis.call('set',KEYS[1],ARGV[2],'PX',180000);return 1",1,key,original,fault),'1');
    else assert.equal(redis('SET',key,fault,'PX',180000,'NX'),'OK');
    overridden=true;
    const failed=await trigger(jobs[0]);
    check('真实负数阈值上报FAILED及原异常',failed.status==='FAILED'&&failed.affected===null&&failed.stack.includes('异常巡检时长阈值不能为负数')&&failed.stack.includes('流程异常巡检存在失败项'));evidence.failure=true;
    check('失败巡检保留故障配置且未登记业务半成品',redis('GET',key)===fault&&counts()===beforeCounts);evidence.retention=true;
    const alarms=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id="+sql(failed.executeNo)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Anomaly platform alarm not delivered');
    check('流程异常巡检失败告警实际送达指定员工',alarms[0].user===receiver);successful(await api(employee,'/auth/system/message/mine/'+alarms[0].id),'员工读取流程异常任务失败告警');evidence.alarm=true;
    restore();await success(jobs[0]);evidence.recovery=true;await success(jobs[0]);await success(jobs[1]);evidence.repeat=true;
    const denied=await post(employee,root+'/'+jobs[0].id+'/trigger'),detail=await api(employee,root+'/log/'+failed.id);
    check('普通员工不能执行流程异常后台任务或读取失败详情',denied.status===403&&detail.status===403&&!detail.body?.data);evidence.permissions=true;
    console.log('A3_ANOMALY_SCAN_ACTUAL: '+JSON.stringify({jobs:jobs.map(item=>({id:item.id,handler:item.handler})),internalRequests,realThresholdFailure:true,positiveWorkflowAlarm:false,independentMysqlEvidence:'a3-anomaly-scan-database-20261003-r6',naturalSchedule:false,forcedBusinessWrites:0}));
  }catch(error){failure=error;}
  finally {
    try {
      for(const job of jobs)await waitFor(()=>logs(job),items=>items.every(item=>item.status!=='RUNNING'),'Owned anomaly job still running');
      restore();
      check('流程异常故障配置完整恢复且原任务权限和业务数量保持',redis('EXISTS',key)===(originalExists?'1':'0')&&(!originalExists||redis('GET',key)===original)&&Number(redis('PTTL',key))===originalTtl&&originalDeadline===null&&config()===beforeConfig&&grants()===beforeGrants&&counts()===beforeCounts);evidence.restoration=true;
    }catch(error){failure=new AggregateError([failure,error].filter(Boolean),'Anomaly verification or restoration failed');}
  }
  if(!failure&&!triggerOnly){try{await verifyAnomalyEventDelivery({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence});}catch(error){failure=error;}}
  if(!failure&&!triggerOnly){try{await verifyDisabledUserDelivery({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence,redis,state});}catch(error){failure=error;}}
  if(!failure&&!offboardOnly&&!b2UiOnly&&!b1Policies){try{await verifyTriggerAnomalyDelivery({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence});}catch(error){failure=error;}}
  if(!failure&&triggerOnly&&!offboardOnly&&!b2UiOnly&&!b1Policies){try{await verifyWorkflowHttpTrigger({admin,employee,api,successful,database,check,caseTag,secrets,evidence,redis});}catch(error){failure=error;}}
  if(!failure&&b1Policies){try{
    if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='designer') await verifyB1DesignerUi({admin,api,successful,database,check,caseTag,evidence});
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='controls') {
      await repairB2DefinitionFixtures({admin,api,successful,database,check,caseTag,accounts,evidence});
      await verifyB1TaskControls({admin,employee,api,successful,database,check,caseTag,secrets,evidence});
    }
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='launch') {
      await repairB2DefinitionFixtures({admin,api,successful,database,check,caseTag,accounts,evidence});
      await verifyB1LaunchSelection({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence});
    }
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='timeout') await verifyB1TimeoutStrategies({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence,redis,state});
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='legacy') await verifyB1LegacyAssignees({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence});
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='semantics') await verifyB1TaskSemantics({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence});
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='nodes') await verifyB1NodeDesignerUi({admin,api,successful,database,check,caseTag,secrets,evidence});
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='manual-policy') await verifyB1ManualPolicyProbe({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence});
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='manual-required') await verifyB1ManualRequired({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence});
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='legacy-nodes') await verifyB1LegacyNodes({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence,redis});
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='rejection-ui') {
      for(const [suffix,uiDevice] of [['d','desktop'],['m','mobile']]) {
        const deviceEmployee=uiDevice==='mobile'?await session('g_holiday_employee'):employee;
        const deviceToken=await deviceEmployee.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());
        assert.ok(deviceToken);secrets.add(deviceToken.replace(/^Bearer /,''));
        await verifyB1RejectionStrategies({admin,employee:deviceEmployee,api,successful,session,database,check,caseTag:caseTag+suffix,secrets,evidence,uiDevice});
      }
    }
    else if(process.env.CLOUDFLOW_B1_APPROVAL_POLICIES==='rejection') await verifyB1RejectionStrategies({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence});
    else await verifyB1ApprovalPolicies({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence});
  }catch(error){failure=error;}}
  if(!failure&&b2Capabilities){try{await verifyB2Capabilities({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence,redis,state,accounts});}catch(error){failure=error;}}
  if(!failure&&offboardOnly){try{await verifyWorkflowOffboardDelivery({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence,redis,state,accounts});}catch(error){failure=error;}}
  if(!failure&&offboardOnly){try{await verifyWorkflowHAdvanceOffboard({admin,employee,api,successful,session,database,check,caseTag,secrets,evidence,redis,state,accounts});}catch(error){failure=error;}}
  let files=0,bytes=0,leaks=0;
  for(const service of state.services){const directory=path.join(state.run,service.name),names=await fs.readdir(path.join(directory,'logs')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});for(const name of ['stdout.log','stderr.log',...names.filter(name=>name.endsWith('.log')).map(name=>path.join('logs',name))]){const scan=await scanSecretStream(createReadStream(path.join(directory,name)),[...secrets]);files++;bytes+=scan.bytes;leaks+=scan.leaks;}}
  const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});check('流程异常任务及审计日志无凭据泄漏',leaks===0&&audit.leaks===0);evidence.secrets=true;
  console.log('A3_ANOMALY_SCAN_SECRET_SCAN: '+JSON.stringify({files,bytes,values:secrets.size,leaks,databaseBytes:audit.bytes,databaseLeaks:audit.leaks}));if(failure)throw failure;
}
