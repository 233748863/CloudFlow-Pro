import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

export async function verifyA3ProcessReconcile({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3P' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label, ms = 60000) => {
    const until = Date.now() + ms;
    do { const value = await read(); if (accept(value)) return value; await sleep(250); } while (Date.now() < until);
    throw new Error(label);
  };
  const keys = await readOwnedJobKeys(state);
  const secrets = new Set([...accounts.map(item => item.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const root = '/auth/system/job'; const auth = state.services.find(item => item.name === 'workflow'); assert.ok(auth);
  const owners = rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE user_name IN ('g_holiday_employee','g_import_tenant') AND deleted=0 AND status='0' ORDER BY tenant_id;");
  assert.equal(owners.length, 2); assert.equal(owners[0].tenant, '100000'); assert.equal(owners[1].tenant, '100001');
  for (const owner of owners) for (const value of Object.values(owner)) assert.match(value, /^[1-9][0-9]*$/);
  const config = () => database("SELECT tenant_id,job_id,job_name,handler_name,status,cron_expression,interval_ms,timeout_seconds,lock_time_seconds,alarm_receiver,deleted FROM sys_job WHERE job_name NOT LIKE " + sql(marker + '%') + ' ORDER BY job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig = config(); const oldGrants = grants();
  const jobs = []; let lock; let failure; let baseline; let sentinel; const samples=[];
  const summary = count => '流程业务对账完成：新增' + count + '条告警';
  const logs = job => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'report',report_time) FROM sys_job_log WHERE job_id=" + job.id + ' ORDER BY log_id;');
  const trigger = async job => {
    if (job.last && Date.now() - job.last < 5300) await sleep(5300 - (Date.now() - job.last));
    const result = successful(await api(admin, root + '/' + job.id + '/trigger', { method: 'POST', body: {} }), '实际触发流程对账检查');
    assert.equal(result.accepted, true); job.last = Date.now(); return result.executeNo;
  };
  const complete = (job, no) => waitFor(() => logs(job).find(item => item.executeNo === no), item => item && item.status !== 'RUNNING', 'Reconcile scan did not complete', 90000);
  const alarm = async failed => {
    const result = await waitFor(() => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(failed.executeNo) + ';'), items => items.length === 1 && items[0].status === 'SUCCESS', 'Reconcile failure alarm missing');
    check('流程对账失败告警真实送达指定人', result[0].user === owners[0].user);
    successful(await api(employee, '/auth/system/message/mine/' + result[0].id), '员工读取流程对账任务失败告警');
  };
  const verifiedSuccess = async (job, expected, text) => {
    const no = await trigger(job); const result = await complete(job, no);
    check(job.kind + '实际成功数量摘要及耗时准确', result.status === 'SUCCESS' && result.affected === expected && result.message === text
      && Number.isInteger(result.duration) && result.actor === 'g_import_admin' && result.trigger === 'MANUAL' && result.report);
    const target = '/inner/job/status/' + no; const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-workflow', 'GET', target, '');
    secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + auth.port + target, { headers, signal: AbortSignal.timeout(10000) }); const body = await response.json();
    check(job.kind + '服务签名反查与归档一致', response.status === 200 && body.code === 200 && body.data.affectedRows === expected && body.data.resultMsg === text);
    return result;
  };
  const alerts = () => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'bizId',CAST(biz_id AS CHAR),'instance',wf_instance_id,'bizStatus',biz_status,'wfStatus',wf_status,'detected',detected_at,'created',create_time,'updated',update_time) FROM wf_reconcile_alert ORDER BY id;");
  const ownAlerts = () => alerts().filter(item=>item.instance.startsWith(marker));
  const messages = () => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'user',CAST(receiver_id AS CHAR),'bizId',biz_id,'status',send_status,'skipReason',skip_reason,'channel',channel_type,'title',title,'content',content,'event',outbox_event_id) FROM sys_message_record WHERE biz_type='WORKFLOW_RECONCILE_ALERT' AND content LIKE "+sql('%'+marker+'%')+' ORDER BY record_id;');
  const recipients = tenant => {
    const result=[];
    for(const role of ['admin','hr']) {
      const users=database("SELECT DISTINCT u.user_id FROM sys_role r JOIN sys_user_role ur ON ur.role_id=r.role_id AND ur.tenant_id=r.tenant_id JOIN sys_user u ON u.user_id=ur.user_id AND u.tenant_id=ur.tenant_id WHERE r.tenant_id="+tenant+" AND r.role_key="+sql(role)+" AND r.deleted=0 AND r.status='0' AND u.deleted=0 AND u.status='0' ORDER BY u.user_id;").split(/\r?\n/).filter(Boolean);
      for(const user of users) if(!result.includes(user)&&result.length<20)result.push(user);
    }
    return result;
  };
  const expectedRecipients=Object.fromEntries(owners.map(owner=>[owner.tenant,recipients(owner.tenant)]));
  assert.equal(expectedRecipients['100000'].length,20); assert.equal(expectedRecipients['100001'].length,1);
  const originalAlerts=alerts(); const originalAlertIds=new Set(originalAlerts.map(item=>item.id));
  const createSample = (suffix,owner,bizStatus='PENDING',wfStatus='PASSED',old=false,wfTenant=owner.tenant) => {
    const instance=marker+'-'+suffix; const item={instance,tenant:owner.tenant,wfTenant,bizStatus,wfStatus};samples.push(item);
    const time=old?'DATE_SUB(NOW(),INTERVAL 8 DAY)':'NOW()';
    database('INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,business_key,start_user_id,title,status,create_by,create_time,start_time) VALUES('
      +sql(instance)+','+wfTenant+','+sql(marker)+','+sql(instance)+','+owner.user+','+sql(instance)+','+sql(wfStatus)+','+sql(marker)+','+time+','+time+');');
    database('INSERT INTO hr_certificate_request(tenant_id,request_no,employee_id,certificate_type,status,process_instance_id,create_by) VALUES('
      +owner.tenant+','+sql(instance)+','+owner.user+",'EMPLOYMENT',"+sql(bizStatus)+','+sql(instance)+','+sql(marker)+');');
    item.id=database('SELECT id FROM hr_certificate_request WHERE tenant_id='+owner.tenant+' AND request_no='+sql(instance)+';');assert.match(item.id,/^[1-9][0-9]*$/);
    return item;
  };
  const openLock = async sample => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; }); child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("ROLLBACK; SELECT 'A3_RECONCILE_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned reconciliation lock release timed out'); }
      assert.ok(code === 0 && !processError && output.includes('A3_RECONCILE_RELEASED'), 'Owned reconciliation lock helper failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, connection: null };
    child.stdin.write('START TRANSACTION; SELECT id FROM wf_reconcile_alert FORCE INDEX (uk_reconcile_open) WHERE wf_instance_id='+sql(sample.instance)
      +" AND biz_module='hr' AND biz_id="+sample.id+' AND biz_status='+sql(sample.bizStatus)+' AND wf_status='+sql(sample.wfStatus)
      +" FOR UPDATE; SELECT CONCAT('A3_RECONCILE_READY:',CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_RECONCILE_READY:[0-9]+/.test(value), 'Reconciliation unique key lock not ready', 5000);
    lock.connection = output.match(/A3_RECONCILE_READY:([0-9]+)/)[1];
    const held=rows("SELECT JSON_OBJECT('index',d.INDEX_NAME,'data',d.LOCK_DATA) FROM performance_schema.data_locks d JOIN performance_schema.threads t ON t.THREAD_ID=d.THREAD_ID WHERE t.PROCESSLIST_ID="+lock.connection+" AND d.OBJECT_SCHEMA='cloud_flow_db' AND d.OBJECT_NAME='wf_reconcile_alert' AND d.LOCK_STATUS='GRANTED' AND d.LOCK_MODE LIKE 'X%';");
    assert.ok(held.some(item=>item.index==='uk_reconcile_open'&&item.data.startsWith("'"+sample.instance+"', 'hr', "+sample.id+", ")),'Owned unique key must be locked before trigger');
  };
  const ownedBusiness = () => database('SELECT id,tenant_id,status,process_instance_id,version FROM hr_certificate_request WHERE create_by='+sql(marker)+' ORDER BY id;')
    +database('SELECT instance_id,tenant_id,status,start_time,create_time FROM wf_process_instance WHERE create_by='+sql(marker)+' ORDER BY instance_id;');
  try {
    const original=successful(await api(admin,root+'/111'),'读取原流程业务对账任务');assert.equal(original.handlerName,'processBusinessReconcile');assert.equal(original.status,'PAUSED');
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name='processBusinessReconcile';"),'0');
    successful(await api(admin,root,{method:'POST',body:{...original,jobId:undefined,jobName:marker,jobGroup:'A3_VERIFY',handlerParam:marker,
      status:'PAUSED',triggerType:'FIXED_RATE',cronExpression:null,intervalMs:60000,concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,
      dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:owners[0].user,logSuccessFlag:1}}),'建立暂停流程对账验证任务');
    const job={id:database('SELECT job_id FROM sys_job WHERE job_name='+sql(marker)+' AND deleted=0;'),kind:'reconcile'};assert.match(job.id,/^[1-9][0-9]*$/);jobs.push(job);
    const before=alerts().length;const initial=await complete(job,await trigger(job));baseline=alerts();
    check('原隔离业务实际对账成功且新增数准确',initial.status==='SUCCESS'&&initial.affected===baseline.length-before&&initial.message===summary(initial.affected));
    check('原有告警主键内容和时间保持',JSON.stringify(baseline.filter(item=>originalAlertIds.has(item.id)))===JSON.stringify(originalAlerts));
    console.log('A3_PROCESS_RECONCILE_BASELINE: '+JSON.stringify({marker,jobId:job.id,original:before,created:initial.affected,total:baseline.length}));
    const blocked=createSample('0blocked',owners[0]);const same=createSample('1same',owners[0]);const other=createSample('2other',owners[1],'APPROVED','RUNNING');
    createSample('consistent',owners[0],'APPROVED','PASSED');createSample('pending',owners[0],'PENDING','RUNNING');createSample('old',owners[0],'PENDING','PASSED',true);createSample('foreign',owners[0],'PENDING','PASSED',false,'100001');
    const businessBefore=ownedBusiness();
    database('INSERT INTO wf_reconcile_alert(tenant_id,biz_module,biz_id,wf_instance_id,biz_status,wf_status) VALUES('
      +blocked.tenant+",'hr',"+blocked.id+','+sql(blocked.instance)+','+sql(blocked.bizStatus)+','+sql(blocked.wfStatus)+');');
    sentinel=ownAlerts().find(item=>item.instance===blocked.instance);assert.ok(sentinel);assert.match(sentinel.id,/^[1-9][0-9]*$/);
    await openLock(blocked);const no=await trigger(job);
    const waits=await waitFor(()=>rows("SELECT JSON_OBJECT('connection',CAST(r.PROCESSLIST_ID AS CHAR),'db',d.OBJECT_SCHEMA,'table',d.OBJECT_NAME,'index',d.INDEX_NAME,'data',d.LOCK_DATA) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads b ON b.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.threads r ON r.THREAD_ID=w.REQUESTING_THREAD_ID JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND d.ENGINE=w.ENGINE WHERE b.PROCESSLIST_ID="+lock.connection+';'),items=>items.length>0,'Reconciliation insert not waiting on owned unique key',25000);
    assert.ok(waits.length===1&&waits[0].db==='cloud_flow_db'&&waits[0].table==='wf_reconcile_alert'
      && ((waits[0].index==='PRIMARY'&&waits[0].data===sentinel.id)||(waits[0].index==='uk_reconcile_open'
      && waits[0].data.startsWith("'"+blocked.instance+"', 'hr', "+blocked.id+", 'PENDING', 'PASSED', "))));
    console.log('A3_PROCESS_RECONCILE_LOCK: '+JSON.stringify({table:waits[0].table,index:waits[0].index,ownedSentinel:true}));
    assert.match(waits[0].connection,/^[1-9][0-9]*$/);database('KILL QUERY '+waits[0].connection+';');evidence.injection=true;
    const failed=await complete(job,no);await lock.release();
    check('真实插入失败保留原哨兵且没有误发消息或改变业务',JSON.stringify(ownAlerts().find(item=>item.id===sentinel.id))===JSON.stringify(sentinel)&&!messages().some(item=>item.content.includes(blocked.instance))&&ownedBusiness()===businessBefore);evidence.rollback=true;
    database('DELETE FROM wf_reconcile_alert WHERE id='+sentinel.id+' AND wf_instance_id='+sql(sentinel.instance)+';');
    check('同租户及其他租户差异均继续记录',ownAlerts().length===2&&[same,other].every(sample=>ownAlerts().some(item=>item.instance===sample.instance&&item.tenant===sample.tenant)));evidence.continuation=true;
    check('一致未终态过期和跨租户样本不误报',ownAlerts().every(item=>[same.instance,other.instance].includes(item.instance)));evidence.boundaries=true;
    check('对账真实失败保存原异常且不编造数量',failed.status==='FAILED'&&failed.affected===null&&failed.stack.includes('流程业务对账存在失败项')&&failed.stack.includes(blocked.instance));evidence.failure=true;
    await alarm(failed);evidence.alarm=true;
    await verifiedSuccess(job,1,summary(1));check('恢复仅补录失败的一条差异',ownAlerts().length===3&&ownAlerts().some(item=>item.instance===blocked.instance));evidence.recovery=true;
    const expected=[blocked,same,other].flatMap(sample=>expectedRecipients[sample.tenant].map(user=>({tenant:sample.tenant,user,alert:ownAlerts().find(item=>item.instance===sample.instance).id,instance:sample.instance})));
    const delivered=await waitFor(messages,items=>items.length===expected.length&&items.every(item=>['SUCCESS','SKIPPED'].includes(item.status)),'Reconciliation messages not terminal');
    check('真实对账提醒仅发给本租户管理员和人事且每条最多20人',expected.every(item=>delivered.filter(message=>message.tenant===item.tenant&&message.user===item.user&&message.bizId===item.alert&&message.content.includes(item.instance)).length===1));
    check('对账实际渠道结果和标题准确',delivered.every(item=>item.channel==='INTERNAL'&&item.title==='流程业务状态对账告警')
      &&delivered.filter(item=>item.tenant==='100000').every(item=>item.status==='SUCCESS')
      &&delivered.filter(item=>item.tenant==='100001').every(item=>item.status==='SKIPPED'&&item.skipReason==='NO_CHANNEL'));evidence.delivery=true;
    const beforeRepeat=JSON.stringify(ownAlerts());const beforeMessages=JSON.stringify(delivered);
    await verifiedSuccess(job,0,summary(0));await sleep(1200);
    check('已有差异重复扫描零新增且不重复消息',JSON.stringify(ownAlerts())===beforeRepeat&&JSON.stringify(messages())===beforeMessages&&ownedBusiness()===businessBefore);evidence.repeat=true;evidence.counts=true;
    const adminId=database("SELECT user_id FROM sys_user WHERE user_name='g_import_admin' AND tenant_id=100000 AND deleted=0;");
    const own=delivered.find(item=>item.user===adminId&&item.tenant==='100000');assert.ok(own);successful(await api(admin,'/auth/system/message/mine/'+own.id),'管理员读取本人对账提醒');
    const denied=await api(employee,root+'/log/'+failed.id);const deniedTrigger=await api(employee,root+'/'+job.id+'/trigger',{method:'POST',body:{}});
    check('普通员工不能查对账后台失败详情或执行平台任务',denied.status===403&&!denied.body?.data&&deniedTrigger.status===403&&!deniedTrigger.body?.data);
    const foreign=await api(admin,'/auth/system/message/mine/'+delivered.find(item=>item.tenant==='100001').id);
    check('管理员不能跨租户读取对账提醒',([403,404].includes(foreign.status)||[403,404].includes(foreign.body?.code))&&!foreign.body?.data);evidence.permissions=true;
    console.log('A3_PROCESS_RECONCILE_ACTUAL: '+JSON.stringify({jobId:job.id,samples:samples.length,newAlerts:3,messages:delivered.length,recovered:1,repeated:0,realInsertFailure:true,actualMessageRegistrationFailure:false,forcedTerminalWrites:0}));
  } catch(error){failure=error;}
  finally {
    try{if(lock)await lock.release();}catch(error){failure ||= error;}
    try{
      for(const job of jobs)await waitFor(()=>logs(job),items=>items.every(item=>item.status!=='RUNNING'),'Reconciliation still running at cleanup',90000);
      if(sentinel)database('DELETE FROM wf_reconcile_alert WHERE id='+sentinel.id+' AND wf_instance_id='+sql(sentinel.instance)+';');
      database("UPDATE hr_certificate_request SET status='CANCELLED',deleted=1,update_by="+sql(marker)+' WHERE create_by='+sql(marker)
        +"; UPDATE wf_process_instance SET status='CANCELLED',deleted=1,update_by="+sql(marker)+',update_time=NOW() WHERE create_by='+sql(marker)+';');
      check('自有对账样本结束且既有告警和任务权限保持',config()===oldConfig&&grants()===oldGrants
        &&JSON.stringify(alerts().filter(item=>originalAlertIds.has(item.id)))===JSON.stringify(originalAlerts)
        &&(!baseline||JSON.stringify(alerts().filter(item=>!item.instance.startsWith(marker)))===JSON.stringify(baseline))
        &&(!lock?.connection||database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID='+lock.connection+';')==='0')
        &&database("SELECT COUNT(*) FROM hr_certificate_request WHERE create_by="+sql(marker)+" AND (status<>'CANCELLED' OR deleted<>1);")==='0');evidence.restoration=true;
    }catch(error){console.log('A3_PROCESS_RECONCILE_CLEANUP_FAILED: type='+error.name);failure=new AggregateError([failure,error].filter(Boolean),'Reconciliation verification or cleanup failed');}
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const item of state.services) {
    const directory = path.join(state.run, item.name); const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) { const scan = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks; }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('流程对账任务与审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_PROCESS_RECONCILE_SECRET_SCAN: ' + JSON.stringify({ files, bytes, values: secrets.size, leaks, databaseBytes: audit.bytes, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}
