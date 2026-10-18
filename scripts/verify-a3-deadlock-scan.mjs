import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { verifyWorkflowBusinessLocks } from './verify-a3-workflow-business-lock.mjs';

export async function verifyA3DeadlockScan({admin,api,successful,session,database,check,caseTag,state,accounts,evidence}) {
  const marker='A3K'+caseTag,root='/auth/system/job';
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async(read,accept,label)=>{const end=Date.now()+90000;do{const value=await read();if(accept(value))return value;await sleep(250);}while(Date.now()<end);throw new Error(label);};
  const post=(page,url,body={})=>api(page,url,{method:'POST',body});
  const employee=await session('g_holiday_employee'),keys=await readOwnedJobKeys(state);
  const secrets=new Set([...accounts.map(item=>item.password).filter(Boolean),...Object.values(keys)]);
  for(const page of [admin,employee]){const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));}
  const redis=await ownedGatewayRedis(state),workflow=state.services.find(item=>item.name==='workflow');assert.ok(workflow);
  const receiver=database("SELECT user_id FROM sys_user WHERE user_name='g_holiday_employee' AND deleted=0 AND status='0';");assert.match(receiver,/^[1-9][0-9]*$/);
  const config=()=>database("SELECT tenant_id,job_id,job_name,status,handler_name,interval_ms,cron_expression,deleted FROM sys_job WHERE job_name NOT LIKE "+sql(marker+'%')+' ORDER BY job_id;');
  const grants=()=>database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const beforeConfig=config(),beforeGrants=grants(),jobs=[];let failure,internalRequests=0;
  const ownKey='100000:sys:lock:waiter:'+marker,raw=JSON.stringify('owned-invalid-waiter-set');
  const originalKeys=()=>['100000','100001'].flatMap(tenant=>redis('KEYS',tenant+':sys:lock:*').split(/\r?\n/).filter(key=>key&&key!==ownKey).sort().map(key=>{
    const at=Date.now(),value=redis('EVAL',"local v=redis.call('DUMP',KEYS[1]); if not v then return '' end return cjson.encode({ttl=redis.call('PTTL',KEYS[1]),hash=redis.sha1hex(v)})",1,key);
    return value?{key,at,...JSON.parse(value)}:null;
  }).filter(Boolean));
  const originalKeysPreserved=before=>{const after=originalKeys(),current=new Map(after.map(item=>[item.key,item]));
    return after.every(item=>before.some(previous=>previous.key===item.key&&previous.hash===item.hash))
      &&before.every(item=>current.has(item.key)||(item.ttl>=0&&item.at+item.ttl<=Date.now()));};
  const beforeKeys=originalKeys();assert.equal(redis('EXISTS',ownKey),'0');
  const logs=job=>rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'actor',trigger_by,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id="+job.id+' ORDER BY log_id;');
  const trigger=async job=>{if(job.last&&Date.now()-job.last<5300)await sleep(5300-(Date.now()-job.last));const result=successful(await post(admin,root+'/'+job.id+'/trigger'),'实际触发死锁巡检');assert.equal(result.accepted,true);job.last=Date.now();return waitFor(()=>logs(job).find(item=>item.executeNo===result.executeNo),item=>item&&item.status!=='RUNNING','Deadlock scan did not finish');};
  const success=async job=>{const result=await trigger(job),summary='死锁巡检完成：释放锁0个，解除循环等待0条，清理过期记录0条';
    check('死锁空巡检保存准确数量摘要及操作者',result.status==='SUCCESS'&&result.affected===0&&result.message===summary&&result.actor==='g_import_admin'&&Number.isInteger(result.duration)&&result.report);
    const target='/inner/job/status/'+result.executeNo,headers=signJobRequest(keys,'cloudflow-auth','cloudflow-service-workflow','GET',target,'');secrets.add(headers['X-Job-Signature']);
    const response=await fetch('http://127.0.0.1:'+workflow.port+target,{headers,signal:AbortSignal.timeout(10000)}),body=await response.json();internalRequests++;
    check('死锁签名反查与平台保存结果一致',response.status===200&&body.code===200&&body.data.affectedRows===0&&body.data.resultMsg===summary);return result;};
  try {
    const original=successful(await api(admin,root+'/115'),'读取原死锁巡检处理器');assert.equal(original.handlerName,'deadlockDetection');assert.equal(original.status,'PAUSED');
    successful(await post(admin,root,{...original,jobId:undefined,jobName:marker,jobGroup:'A3_VERIFY',handlerParam:marker,status:'PAUSED',triggerType:'FIXED_DELAY',cronExpression:null,intervalMs:600000,concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:receiver,logSuccessFlag:1}),'建立暂停死锁验证任务');
    const job={id:database('SELECT job_id FROM sys_job WHERE job_name='+sql(marker)+' AND deleted=0;')};assert.match(job.id,/^[1-9][0-9]*$/);jobs.push(job);
    await success(job);evidence.counts=true;
    redis('SET',ownKey,raw);const failed=await trigger(job);
    check('真实等待缓存类型错误上报FAILED及原异常',failed.status==='FAILED'&&failed.affected===null&&failed.stack.includes('ClassCastException')&&failed.stack.includes('死锁巡检存在失败项'));evidence.failure=true;
    check('失败巡检保留原始自有缓存供恢复',redis('GET',ownKey)===raw);evidence.retention=true;
    const alarms=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id="+sql(failed.executeNo)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Deadlock platform alarm not delivered');
    check('死锁巡检失败告警实际送达指定员工',alarms[0].user===receiver);successful(await api(employee,'/auth/system/message/mine/'+alarms[0].id),'员工读取死锁任务失败告警');evidence.alarm=true;
    redis('DEL',ownKey);await success(job);await success(job);evidence.recovery=true;evidence.repeat=true;
    const denied=await post(employee,root+'/'+job.id+'/trigger'),detail=await api(employee,root+'/log/'+failed.id);check('普通员工不能执行死锁后台任务或读取失败详情',denied.status===403&&detail.status===403&&!detail.body?.data);evidence.permissions=true;
    console.log('A3_DEADLOCK_SCAN_ACTUAL: '+JSON.stringify({jobs:jobs.map(item=>item.id),internalRequests,realMalformedCache:true,actualBusinessLockRelease:false,naturalTenMinuteWait:false,forcedBusinessWrites:0}));
  }catch(error){failure=error;}
  finally {
    try{for(const job of jobs)await waitFor(()=>logs(job),items=>items.every(item=>item.status!=='RUNNING'),'Owned deadlock job still running');if(redis('EXISTS',ownKey)==='1'){assert.equal(redis('GET',ownKey),raw);redis('DEL',ownKey);}check('死锁自有故障清理且原缓存任务权限保持',redis('EXISTS',ownKey)==='0'&&originalKeysPreserved(beforeKeys)&&config()===beforeConfig&&grants()===beforeGrants);evidence.restoration=true;}
    catch(error){failure=new AggregateError([failure,error].filter(Boolean),'Deadlock verification or restoration failed');}
  }
  if(!failure)try{await verifyWorkflowBusinessLocks({admin,employee,api,successful,database,check,caseTag,state,redis,trigger,job:jobs[0],evidence});}catch(error){failure=error;}
  let files=0,bytes=0,leaks=0;
  for(const service of state.services){const directory=path.join(state.run,service.name),names=await fs.readdir(path.join(directory,'logs')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});for(const name of ['stdout.log','stderr.log',...names.filter(name=>name.endsWith('.log')).map(name=>path.join('logs',name))]){const scan=await scanSecretStream(createReadStream(path.join(directory,name)),[...secrets]);files++;bytes+=scan.bytes;leaks+=scan.leaks;}}
  const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});check('死锁任务及审计日志无凭据泄漏',leaks===0&&audit.leaks===0);evidence.secrets=true;
  console.log('A3_DEADLOCK_SCAN_SECRET_SCAN: '+JSON.stringify({files,bytes,values:secrets.size,leaks,databaseBytes:audit.bytes,databaseLeaks:audit.leaks}));if(failure)throw failure;
}
