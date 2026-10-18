import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

export async function verifyA3DictScan({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3D' + caseTag;
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
  const root = '/auth/system/job'; const auth = state.services.find(item => item.name === 'auth'); assert.ok(auth);
  const owners = rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE user_name IN ('g_holiday_employee','g_import_tenant') AND deleted=0 AND status='0' ORDER BY tenant_id;");
  assert.equal(owners.length, 2); assert.equal(owners[0].tenant, '100000'); assert.equal(owners[1].tenant, '100001');
  for (const owner of owners) for (const value of Object.values(owner)) assert.match(value, /^[1-9][0-9]*$/);
  const config = () => database("SELECT tenant_id,job_id,job_name,handler_name,status,cron_expression,interval_ms,timeout_seconds,lock_time_seconds,alarm_receiver,deleted FROM sys_job WHERE job_name NOT LIKE " + sql(marker + '%') + ' ORDER BY job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig = config(); const oldGrants = grants();
  const jobs = []; let lock; let failure; let baseline;
  const summary = count => '字典引用检查完成：已刷新' + count + '条告警';
  const logs = job => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'report',report_time) FROM sys_job_log WHERE job_id=" + job.id + ' ORDER BY log_id;');
  const trigger = async job => {
    if (job.last && Date.now() - job.last < 5300) await sleep(5300 - (Date.now() - job.last));
    const result = successful(await api(admin, root + '/' + job.id + '/trigger', { method: 'POST', body: {} }), '实际触发字典检查');
    assert.equal(result.accepted, true); job.last = Date.now(); return result.executeNo;
  };
  const complete = (job, no) => waitFor(() => logs(job).find(item => item.executeNo === no), item => item && item.status !== 'RUNNING', 'Dictionary scan did not complete', 90000);
  const alarm = async failed => {
    const result = await waitFor(() => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(failed.executeNo) + ';'), items => items.length === 1 && items[0].status === 'SUCCESS', 'Dictionary failure alarm missing');
    check('字典失败告警真实送达指定人', result[0].user === owners[0].user);
    successful(await api(employee, '/auth/system/message/mine/' + result[0].id), '员工读取字典任务失败告警');
  };
  const verifiedSuccess = async (job, expected, text) => {
    const no = await trigger(job); const result = await complete(job, no);
    check(job.kind + '实际成功数量摘要及耗时准确', result.status === 'SUCCESS' && result.affected === expected && result.message === text
      && Number.isInteger(result.duration) && result.actor === 'g_import_admin' && result.trigger === 'MANUAL' && result.report);
    const target = '/inner/job/status/' + no; const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-auth', 'GET', target, '');
    secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + auth.port + target, { headers, signal: AbortSignal.timeout(10000) }); const body = await response.json();
    check(job.kind + '服务签名反查与归档一致', response.status === 200 && body.code === 200 && body.data.affectedRows === expected && body.data.resultMsg === text);
    return result;
  };
  const openLock = async sample => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; }); child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("ROLLBACK; SELECT 'A3_DICT_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned dictionary alert lock release timed out'); }
      assert.ok(code === 0 && !processError && output.includes('A3_DICT_RELEASED'), 'Owned dictionary alert lock helper failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, connection: null };
    child.stdin.write('START TRANSACTION; SELECT id FROM sys_dict_orphan_alert WHERE id=' + sample.id + ' AND create_by=' + sql(marker) + " FOR UPDATE; SELECT CONCAT('A3_DICT_READY:',CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_DICT_READY:[0-9]+/.test(value), 'Dictionary alert lock not ready', 5000);
    lock.connection = output.match(/A3_DICT_READY:([0-9]+)/)[1];
  };
  const alerts = tenant => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'type',dict_type,'reason',reason,'summary',binding_summary,'count',binding_count,'created',create_time,'updated',update_time) FROM sys_dict_orphan_alert" + (tenant ? ' WHERE tenant_id='+tenant : '') + ' ORDER BY tenant_id,dict_type;');
  const normalized = items => items.map(({id,created,updated,...rest})=>rest);
  const dicts = () => database('SELECT tenant_id,dict_id,dict_type,dict_name,status,version,create_time,update_time FROM sys_dict_type WHERE COALESCE(create_by,\'\')<>'+sql(marker)+' ORDER BY tenant_id,dict_id;');
  const originalDicts=dicts();
  try {
    const original=successful(await api(admin,root+'/101'),'读取原字典检查任务'); assert.equal(original.handlerName,'dictOrphanScan'); assert.equal(original.status,'PAUSED');
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name='dictOrphanScan';"),'0');
    successful(await api(admin,root,{method:'POST',body:{...original,jobId:undefined,jobName:marker,jobGroup:'A3_VERIFY',handlerParam:marker,
      status:'PAUSED',triggerType:'FIXED_RATE',cronExpression:null,intervalMs:60000,concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,
      dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:owners[0].user,logSuccessFlag:1}}),'建立暂停字典检查验证任务');
    const job={id:database('SELECT job_id FROM sys_job WHERE job_name='+sql(marker)+' AND deleted=0;'),kind:'dict'}; assert.match(job.id,/^[1-9][0-9]*$/); jobs.push(job);
    const first=await complete(job,await trigger(job)); baseline=alerts();
    check('原字典实际扫描成功且刷新数量等于当前告警数',first.status==='SUCCESS' && first.affected===baseline.length && first.message===summary(baseline.length) && baseline.length>0);
    console.log('A3_DICT_SCAN_BASELINE: '+JSON.stringify({jobId:job.id,count:first.affected}));
    check('共享字典在两个租户均按各自归属产生告警',owners.every(owner=>baseline.some(item=>item.tenant===owner.tenant)));
    database('INSERT INTO sys_dict_type(tenant_id,dict_name,dict_type,create_by) VALUES(100001,'+sql(marker)+','+sql(marker+'_unused')+','+sql(marker)+');');
    const sentinels=[];
    for(const owner of owners) {
      const name='zz_'+marker;
      database('INSERT INTO sys_dict_orphan_alert(tenant_id,dict_type,reason,binding_summary,binding_count,create_by) VALUES('+owner.tenant+','+sql(name)+','+sql(marker)+','+sql(marker)+',1,'+sql(marker)+');');
      const id=database('SELECT id FROM sys_dict_orphan_alert WHERE tenant_id='+owner.tenant+' AND dict_type='+sql(name)+';'); assert.match(id,/^[1-9][0-9]*$/);
      sentinels.push({id,tenant:owner.tenant});
    }
    const before=JSON.stringify(alerts('100000'));
    await openLock(sentinels[0]); const no=await trigger(job);
    const waits=await waitFor(()=>rows("SELECT JSON_OBJECT('connection',CAST(r.PROCESSLIST_ID AS CHAR),'db',d.OBJECT_SCHEMA,'table',d.OBJECT_NAME,'index',d.INDEX_NAME,'data',d.LOCK_DATA) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads b ON b.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.threads r ON r.THREAD_ID=w.REQUESTING_THREAD_ID JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND d.ENGINE=w.ENGINE WHERE b.PROCESSLIST_ID="+lock.connection+';'),items=>items.length>0,'Dictionary replacement not waiting on owned sentinel',25000);
    assert.ok(waits.length===1 && waits[0].db==='cloud_flow_db' && waits[0].table==='sys_dict_orphan_alert' && waits[0].index==='PRIMARY' && waits[0].data===sentinels[0].id);
    const granted=rows("SELECT JSON_OBJECT('id',d.LOCK_DATA) FROM performance_schema.data_locks d JOIN performance_schema.threads t ON t.THREAD_ID=d.THREAD_ID WHERE t.PROCESSLIST_ID="+waits[0].connection+" AND d.OBJECT_SCHEMA='cloud_flow_db' AND d.OBJECT_NAME='sys_dict_orphan_alert' AND d.INDEX_NAME='PRIMARY' AND d.LOCK_STATUS='GRANTED' AND d.LOCK_MODE LIKE 'X%';");
    check('故障前实际事务已进入本租户旧告警清理',granted.some(item=>baseline.some(alert=>alert.tenant==='100000'&&alert.id===item.id)));
    assert.match(waits[0].connection,/^[1-9][0-9]*$/); database('KILL QUERY '+waits[0].connection+';'); evidence.injection=true;
    const failed=await complete(job,no); await lock.release();
    check('清理中途失败保留本租户所有旧告警主键内容和时间',JSON.stringify(alerts('100000'))===before); evidence.rollback=true;
    const other=alerts('100001');
    check('其他租户继续重建且旧告警和未注册字典不残留',JSON.stringify(normalized(other))===JSON.stringify(normalized(baseline.filter(item=>item.tenant==='100001')))
      && other.every(item=>!baseline.some(previous=>previous.id===item.id))); evidence.continuation=true;
    check('字典失败如实上报租户及原异常且不编造数量',failed.status==='FAILED' && failed.affected===null && failed.stack.includes('字典引用检查存在失败租户') && failed.stack.includes('100000')); evidence.failure=true;
    await alarm(failed); evidence.alarm=true;
    const total=baseline.length;
    await verifiedSuccess(job,total,summary(total));
    check('恢复后告警内容与真实注册一致且旧哨兵清除',JSON.stringify(normalized(alerts('100000')))===JSON.stringify(normalized(baseline.filter(item=>item.tenant==='100000')))
      && JSON.stringify(normalized(alerts('100001')))===JSON.stringify(normalized(baseline.filter(item=>item.tenant==='100001'))) && alerts().length===total); evidence.recovery=true;
    const previous=JSON.stringify(normalized(alerts()));
    await verifiedSuccess(job,total,summary(total));
    check('重复扫描返回刷新总数且告警内容不累计',JSON.stringify(normalized(alerts()))===previous); evidence.counts=true; evidence.repeat=true;
    const denied=await api(employee,root+'/log/'+failed.id);
    check('告警收件人不能越权读取后台失败详情',denied.status===403 && !denied.body?.data);
    const triggerDenied=await api(employee,root+'/'+job.id+'/trigger',{method:'POST',body:{}});
    check('普通员工不能执行平台字典检查',triggerDenied.status===403 && !triggerDenied.body?.data); evidence.permissions=true;
    console.log('A3_DICT_SCAN_ACTUAL: '+JSON.stringify({jobId:job.id,baseline:baseline.length,refreshed:total,realQueryFailure:true,forcedTerminalWrites:0}));
  } catch(error) {failure=error;}
  finally {
    try{if(lock)await lock.release();}catch(error){failure ||= error;}
    try{
      for(const job of jobs)await waitFor(()=>logs(job),items=>items.every(item=>item.status!=='RUNNING'),'Dictionary job still running at cleanup',90000);
      console.log('A3_DICT_SCAN_CLEANUP: stage=jobs_terminal');
      database('DELETE FROM sys_dict_type WHERE tenant_id=100001 AND create_by='+sql(marker)+';');
      database('DELETE FROM sys_dict_orphan_alert WHERE create_by='+sql(marker)+';');
      console.log('A3_DICT_SCAN_CLEANUP: stage=owned_fixtures_removed');
      if(jobs.length && baseline) {
        const cleaned=await complete(jobs[0],await trigger(jobs[0]));
        check('移除自有字典后实际扫描恢复原告警内容',cleaned.status==='SUCCESS' && cleaned.affected===baseline.length && JSON.stringify(normalized(alerts()))===JSON.stringify(normalized(baseline)));
      }
      check('原字典与任务权限保持且自有行锁关闭',dicts()===originalDicts && config()===oldConfig && grants()===oldGrants
        && (!lock?.connection||database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID='+lock.connection+';')==='0')); evidence.restoration=true;
    }catch(error){console.log('A3_DICT_SCAN_CLEANUP_FAILED: type='+error.name); failure = new AggregateError([failure,error].filter(Boolean),'Dictionary verification or cleanup failed');}
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const item of state.services) {
    const directory = path.join(state.run, item.name); const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) { const scan = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks; }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('字典检查任务与审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_DICT_SCAN_SECRET_SCAN: ' + JSON.stringify({ files, bytes, values: secrets.size, leaks, databaseBytes: audit.bytes, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}
