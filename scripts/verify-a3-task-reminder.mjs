import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyA3TaskReminder({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3R' + caseTag;
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
  const redis = await ownedGatewayRedis(state);
  const root = '/auth/system/job'; const workflow = state.services.find(item => item.name === 'workflow'); assert.ok(workflow);
  const owners = rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) FROM sys_user WHERE user_name IN ('g_holiday_employee','g_import_tenant') AND deleted=0 AND status='0' ORDER BY tenant_id;");
  assert.equal(owners.length, 2); assert.equal(owners[0].tenant, '100000'); assert.equal(owners[1].tenant, '100001');
  for (const owner of owners) for (const value of Object.values(owner)) assert.match(value, /^[1-9][0-9]*$/);
  const config = () => database("SELECT tenant_id,job_id,job_name,handler_name,status,cron_expression,interval_ms,timeout_seconds,lock_time_seconds,alarm_receiver,deleted FROM sys_job WHERE job_name NOT LIKE " + sql(marker + '%') + ' ORDER BY job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig = config(); const oldGrants = grants();
  const jobs = []; const samples = []; const members = []; let lock; let failure;
  const queue = tenant => tenant + ':sys:task:reminders';
  const indexSnapshot = () => JSON.stringify(owners.map(owner => [owner.tenant,
    redis('ZRANGE',queue(owner.tenant),0,-1,'WITHSCORES'),redis('ZRANGE',owner.tenant+':sys:task:timeouts',0,-1,'WITHSCORES')]));
  const originalIndices = indexSnapshot();
  const summary = count => '催办扫描完成：已提交' + count + '条提醒请求';
  const logs = job => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'report',report_time) FROM sys_job_log WHERE job_id=" + job.id + ' ORDER BY log_id;');
  const messages = () => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'user',CAST(receiver_id AS CHAR),'bizId',biz_id,'status',send_status,'skipReason',skip_reason,'channel',channel_type,'title',title,'content',content,'event',outbox_event_id) FROM sys_message_record WHERE biz_type='WF_TASK_URGE' AND biz_id LIKE " + sql(marker+'%') + ' ORDER BY record_id;');
  const events = () => rows("SELECT JSON_OBJECT('id',event_id,'tenant',CAST(tenant_id AS CHAR),'payload',JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload'))) FROM outbox_event WHERE event_type='MESSAGE_SEND' AND payload_json LIKE " + sql('%'+marker+'%') + ' ORDER BY event_id;')
    .filter(item => { const request=JSON.parse(item.payload); return request.bizType==='WF_TASK_URGE' && request.bizId.startsWith(marker); })
    .map(({payload,...item})=>item);
  const trigger = async job => {
    if (job.last && Date.now() - job.last < 5300) await sleep(5300 - (Date.now() - job.last));
    const result = successful(await api(admin, root + '/' + job.id + '/trigger', { method: 'POST', body: {} }), '实际触发催办扫描');
    assert.equal(result.accepted, true); job.last = Date.now(); return result.executeNo;
  };
  const complete = (job, no) => waitFor(() => logs(job).find(item => item.executeNo === no), item => item && item.status !== 'RUNNING', 'Reminder scan did not complete', 90000);
  const verifiedSuccess = async (job, expected) => {
    const no = await trigger(job); const result = await complete(job, no);
    check('催办实际成功数量摘要及耗时准确', result.status === 'SUCCESS' && result.affected === expected && result.message === summary(expected)
      && Number.isInteger(result.duration) && result.actor === 'g_import_admin' && result.trigger === 'MANUAL' && result.report);
    const target = '/inner/job/status/' + no; const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-workflow', 'GET', target, '');
    secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + workflow.port + target, { headers, signal: AbortSignal.timeout(10000) }); const body = await response.json();
    check('催办服务签名反查与归档一致', response.status === 200 && body.code === 200 && body.data.affectedRows === expected && body.data.resultMsg === summary(expected));
    return result;
  };
  const addMember = (tenant, value, score) => {
    const item = {tenant,value:JSON.stringify(value)}; members.push(item);
    assert.equal(redis('ZADD',queue(tenant),'NX',score,item.value),'1'); return item;
  };
  const present = item => redis('ZSCORE',queue(item.tenant),item.value) !== '';
  const sample = (suffix, owner, status='TODO', assigned=true) => {
    const item={id:marker+'-'+suffix,tenant:owner.tenant,user:owner.user,status}; samples.push(item);
    database('INSERT INTO wf_task(task_id,tenant_id,instance_id,node_key,node_name,assignee,status,create_time,due_time) VALUES('
      +sql(item.id)+','+owner.tenant+','+sql(marker+'-'+owner.tenant)+','+sql(suffix)+','+sql(suffix)+','+(assigned?owner.user:'NULL')+','+sql(status)+',NOW(),DATE_ADD(NOW(),INTERVAL 4 HOUR));');
    return item;
  };
  const openLock = async item => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; }); child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("ROLLBACK; SELECT 'A3_REMINDER_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned reminder lock release timed out'); }
      assert.ok(code === 0 && !processError && output.includes('A3_REMINDER_RELEASED'), 'Owned reminder lock helper failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, connection: null };
    child.stdin.write('START TRANSACTION; SELECT task_id FROM wf_task WHERE tenant_id='+item.tenant+' AND task_id='+sql(item.id)+" FOR UPDATE; SELECT CONCAT('A3_REMINDER_READY:',CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_REMINDER_READY:[0-9]+/.test(value), 'Reminder task lock not ready', 5000);
    lock.connection = output.match(/A3_REMINDER_READY:([0-9]+)/)[1];
  };
  try {
    const original=successful(await api(admin,root+'/112'),'读取原催办扫描任务'); assert.equal(original.handlerName,'taskReminder'); assert.equal(original.status,'PAUSED');
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name IN ('taskReminder','taskTimeout');"),'0');
    for(const owner of owners) assert.equal(redis('ZCOUNT',queue(owner.tenant),0,Date.now()),'0','Due queue must be empty before owned samples');
    successful(await api(admin,root,{method:'POST',body:{...original,jobId:undefined,jobName:marker,jobGroup:'A3_VERIFY',handlerParam:marker,
      status:'PAUSED',triggerType:'FIXED_RATE',cronExpression:null,intervalMs:60000,concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,
      dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:owners[0].user,logSuccessFlag:1}}),'建立暂停催办验证任务');
    const job={id:database('SELECT job_id FROM sys_job WHERE job_name='+sql(marker)+' AND deleted=0;')}; assert.match(job.id,/^[1-9][0-9]*$/); jobs.push(job);
    console.log('A3_TASK_REMINDER_FIXTURE: '+JSON.stringify({marker,jobId:job.id,originalJob:112}));
    for(const owner of owners) database('INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,business_key,start_user_id,title,status,create_by,create_time) VALUES('
      +sql(marker+'-'+owner.tenant)+','+owner.tenant+','+sql(marker)+','+sql(marker)+','+owner.user+','+sql(marker+'-'+owner.tenant)+",'RUNNING',"+sql(marker)+',NOW());');
    const blocked=sample('blocked',owners[0]); const same=sample('same',owners[0]); const other=sample('other',owners[1]);
    const done=sample('done',owners[0],'DONE'); const noOwner=sample('no-owner',owners[0],'TODO',false); const future=sample('future',owners[0]);
    const now=Date.now(); const failedMember=addMember(blocked.tenant,blocked.id+':10',now-2000);
    const successfulMembers=[...[60,30,10].map(minutes=>addMember(same.tenant,same.id+':'+minutes,now-1000)),addMember(other.tenant,other.id+':10',now-1000)];
    const excluded=[done.id+':10',noOwner.id+':10',other.id+':10',marker+'-missing:10',marker+'-malformed',same.id+':0',same.id+':bad'].map(value=>addMember('100000',value,now-1000));
    const futureMember=addMember(future.tenant,future.id+':10',now+3600000);
    const taskSnapshot=()=>database('SELECT task_id,tenant_id,instance_id,node_key,node_name,assignee,status,due_time FROM wf_task WHERE task_id LIKE '+sql(marker+'%')+' ORDER BY task_id;');
    const beforeTasks=taskSnapshot();
    await openLock(blocked); const no=await trigger(job);
    const waits=await waitFor(()=>rows("SELECT JSON_OBJECT('connection',CAST(r.PROCESSLIST_ID AS CHAR),'db',d.OBJECT_SCHEMA,'table',d.OBJECT_NAME,'index',d.INDEX_NAME,'data',d.LOCK_DATA) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads b ON b.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.threads r ON r.THREAD_ID=w.REQUESTING_THREAD_ID JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND d.ENGINE=w.ENGINE WHERE b.PROCESSLIST_ID="+lock.connection+';'),items=>items.length>0,'Reminder query not waiting on owned task',18000);
    assert.ok(waits.length===1 && waits[0].db==='cloud_flow_db' && waits[0].table==='wf_task' && waits[0].index==='PRIMARY' && waits[0].data==="'"+blocked.id+"'");
    assert.match(waits[0].connection,/^[1-9][0-9]*$/); database('KILL QUERY '+waits[0].connection+';'); evidence.injection=true;
    const failed=await complete(job,no); await lock.release();
    check('真实查询失败保留催办条目且未发送失败任务消息',present(failedMember) && !messages().some(item=>item.bizId.startsWith(blocked.id+':'))); evidence.retention=true;
    const partial=await waitFor(messages,items=>items.length===4 && items.every(item=>['SUCCESS','SKIPPED'].includes(item.status)),'Other reminders did not continue');
    check('同租户三次提醒及另一租户继续处理',successfulMembers.every(item=>!present(item)) && partial.filter(item=>item.tenant==='100000').length===3 && partial.filter(item=>item.tenant==='100001').length===1); evidence.continuation=true;
    check('无效已完成无负责人及跨租户条目清理且未来条目保留',excluded.every(item=>!present(item)) && present(futureMember) && taskSnapshot()===beforeTasks); evidence.boundaries=true;
    check('催办失败如实记录原异常且不编造成功数量',failed.status==='FAILED' && failed.affected===null && failed.stack.includes('催办扫描存在失败项') && failed.stack.includes(blocked.id)); evidence.failure=true;
    const alarms=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id="+sql(failed.executeNo)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Reminder failure alarm missing');
    check('催办失败告警实际送达指定员工',alarms[0].user===owners[0].user); successful(await api(employee,'/auth/system/message/mine/'+alarms[0].id),'员工读取催办失败告警'); evidence.alarm=true;
    await verifiedSuccess(job,1);
    const delivered=await waitFor(messages,items=>items.length===5 && items.every(item=>['SUCCESS','SKIPPED'].includes(item.status)),'Recovered reminder missing');
    check('恢复仅处理失败条目且保留未来提醒',!present(failedMember) && present(futureMember)); evidence.recovery=true;
    check('催办使用现有模板并准确归属租户和负责人',delivered.every(item=>item.channel==='INTERNAL' && item.user===owners.find(owner=>owner.tenant===item.tenant).user)
      && delivered.filter(item=>item.tenant==='100000').every(item=>item.status==='SUCCESS' && item.title==='任务催办：'+marker+'-'+item.tenant && item.content.startsWith('请尽快处理待办任务：'))
      && delivered.filter(item=>item.tenant==='100001').every(item=>item.status==='SKIPPED'&&item.skipReason==='NO_CHANNEL')); evidence.delivery=true;
    const eventRows=events(); check('五个真实催办请求各保存一个稳定消息来源',eventRows.length===5 && delivered.every(item=>eventRows.some(event=>event.id===item.event&&event.tenant===item.tenant)));
    const beforeMessages=JSON.stringify(delivered); const beforeEvents=JSON.stringify(eventRows);
    assert.equal(redis('ZADD',queue(failedMember.tenant),'NX',now-1000,failedMember.value),'1');
    await verifiedSuccess(job,1);
    check('同一真实提醒重投返回请求数且不新增事件或消息',!present(failedMember) && JSON.stringify(messages())===beforeMessages && JSON.stringify(events())===beforeEvents); evidence.repeat=true;
    await verifiedSuccess(job,0); await sleep(1200);
    check('处理后空扫描返回零且未来提醒未提前发送',JSON.stringify(messages())===beforeMessages && present(futureMember) && taskSnapshot()===beforeTasks); evidence.counts=true;
    for(const item of delivered.filter(item=>item.tenant==='100000')) successful(await api(employee,'/auth/system/message/mine/'+item.id),'本人读取流程催办消息');
    const denied=await api(employee,root+'/log/'+failed.id); const triggerDenied=await api(employee,root+'/'+job.id+'/trigger',{method:'POST',body:{}});
    check('普通员工不能读取催办后台失败详情或执行平台任务',denied.status===403&&!denied.body?.data&&triggerDenied.status===403&&!triggerDenied.body?.data);
    const foreign=await api(employee,'/auth/system/message/mine/'+delivered.find(item=>item.tenant==='100001').id);
    check('催办消息禁止跨租户读取',([403,404].includes(foreign.status)||[403,404].includes(foreign.body?.code))&&!foreign.body?.data); evidence.permissions=true;
    console.log('A3_TASK_REMINDER_ACTUAL: '+JSON.stringify({jobId:job.id,tasks:samples.length,reminderMembers:members.length,messages:delivered.length,recoveryRequests:1,replayRequests:1,emptyRequests:0,realQueryFailure:true,reinsertSameMember:true,actualRedisRemovalFailure:false,forcedTerminalWrites:0}));
  } catch(error) {failure=error;}
  finally {
    try{if(lock)await lock.release();}catch(error){failure ||= error;}
    try{
      for(const job of jobs)await waitFor(()=>logs(job),items=>items.every(item=>item.status!=='RUNNING'),'Reminder job still running at cleanup',90000);
      for(const item of members)redis('ZREM',queue(item.tenant),item.value);
      database("UPDATE wf_task t JOIN wf_process_instance p ON t.instance_id=p.instance_id AND t.tenant_id=p.tenant_id SET t.status='DONE' WHERE p.create_by="+sql(marker)+' AND t.task_id LIKE '+sql(marker+'%')+"; UPDATE wf_process_instance SET status='CANCELLED',deleted=1,update_by="+sql(marker)+',update_time=NOW() WHERE create_by='+sql(marker)+';');
      check('自有提醒精确清理且任务权限原索引保持',indexSnapshot()===originalIndices && config()===oldConfig && grants()===oldGrants
        && (!lock?.connection||database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID='+lock.connection+';')==='0')
        && database("SELECT COUNT(*) FROM wf_task t JOIN wf_process_instance p ON t.instance_id=p.instance_id AND t.tenant_id=p.tenant_id WHERE p.create_by="+sql(marker)+" AND (t.status<>'DONE' OR p.deleted<>1);")==='0'); evidence.restoration=true;
    }catch(error){console.log('A3_TASK_REMINDER_CLEANUP_FAILED: type='+error.name); failure = new AggregateError([failure,error].filter(Boolean),'Reminder verification or cleanup failed');}
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const item of state.services) {
    const directory = path.join(state.run, item.name); const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) { const scan = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks; }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('催办任务与审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_TASK_REMINDER_SECRET_SCAN: ' + JSON.stringify({ files, bytes, values: secrets.size, leaks, databaseBytes: audit.bytes, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}
