import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

// Only the SQL waiting on a new, owned customer primary key is cancelled.
// The production dispatcher, CRM handler, cross-tenant iteration, report and alarm are real.
export async function verifyA3JobCrmFailure({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3C' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accept, label, milliseconds = 30000) => {
    const deadline = Date.now() + milliseconds;
    do { const value = await read(); if (accept(value)) return value; await sleep(200); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const employee = await session('g_holiday_employee');
  const keys = await readOwnedJobKeys(state);
  const secrets = new Set([...accounts.map(account => account.password).filter(Boolean), ...Object.values(keys)]);
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const owners = rows("SELECT JSON_OBJECT('id',CAST(u.user_id AS CHAR),'tenant',CAST(u.tenant_id AS CHAR),'dept',CAST(u.dept_id AS CHAR)) FROM sys_user u JOIN sys_tenant t ON t.tenant_id=u.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE u.user_name IN ('g_holiday_employee','g_import_tenant') AND u.deleted=0 AND u.status='0' ORDER BY u.tenant_id;");
  assert.equal(owners.length, 2); assert.equal(owners[0].tenant, '100000'); assert.notEqual(owners[0].tenant, owners[1].tenant);
  for (const owner of owners) for (const key of ['id', 'tenant', 'dept']) assert.match(owner[key], /^[1-9][0-9]*$/);
  const root = '/auth/system/job';
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const configuration = () => database("SELECT tenant_id,job_id,job_name,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY tenant_id,job_id;');
  const rules = () => database('SELECT tenant_id,rule_id,status,deleted FROM crm_assignment_rule WHERE create_by<>' + sql(marker) + ' ORDER BY tenant_id,rule_id;');
  const originalGrants = grants(); const originalConfiguration = configuration(); const originalRules = rules();
  const payload = { jobName: marker, jobGroup: 'A3_VERIFY', serviceName: 'cloudflow-service-crm', handlerName: 'customerPoolRelease',
    handlerParam: marker, triggerType: 'FIXED_RATE', intervalMs: 60000, status: 'PAUSED', concurrentFlag: 0,
    misfireStrategy: 'IGNORE', retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 0, dispatchRetryIntervalSec: 1,
    timeoutSeconds: 60, lockTimeSeconds: 60, criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 1, alarmReceiver: owners[0].id, remark: marker };
  const samples = []; let jobId; let execution; let lastExecution; let lock; let failure; let internalRequests = 0;
  const crm = state.services.find(item => item.name === 'crm'); assert.ok(crm);
  const status = async executeNo => {
    const target = '/inner/job/status/' + executeNo;
    const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-crm', 'GET', target); secrets.add(headers['X-Job-Signature']);
    const response = await fetch(`http://127.0.0.1:${crm.port}${target}`, { headers, signal: AbortSignal.timeout(10000), redirect: 'error' });
    internalRequests++; const result = await response.json(); assert.ok(response.status === 200 && result.code === 200); return result.data;
  };
  const logs = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'report',report_time,'end',end_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + jobId + ' ORDER BY log_id;');
  const customer = sample => rows("SELECT JSON_OBJECT('pool',pool_flag,'owner',CAST(owner_id AS CHAR),'original',CAST(original_owner_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) FROM crm_customer WHERE customer_id=" + sample.customer + ';')[0];
  const trail = sample => rows("SELECT JSON_OBJECT('owner',CAST(from_owner_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'rule',CAST(rule_id AS CHAR)) FROM crm_customer_pool_log WHERE customer_id=" + sample.customer + " AND action_type='AUTO_RELEASE' ORDER BY log_id;");
  const alarms = executeNo => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'content',content) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(executeNo) + ' ORDER BY record_id;');
  const candidates = () => rows("SELECT DISTINCT JSON_OBJECT('id',CAST(c.customer_id AS CHAR)) FROM crm_customer c JOIN crm_assignment_rule r ON r.tenant_id=c.tenant_id AND r.rule_type='AUTO_RELEASE' AND r.status='ACTIVE' AND r.deleted=0 JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND c.pool_flag='0' AND c.owner_id IS NOT NULL AND r.inactive_days>0 AND (c.last_follow_up_time<DATE_SUB(NOW(),INTERVAL r.inactive_days DAY) OR c.last_follow_up_time IS NULL) AND (r.dept_id IS NULL OR r.dept_id=c.dept_id) AND (r.customer_level IS NULL OR r.customer_level='' OR r.customer_level=c.level_code) AND (r.customer_tags IS NULL OR r.customer_tags='' OR c.customer_tags LIKE CONCAT('%',r.customer_tags,'%'));");
  let lastTrigger = 0;
  const trigger = async () => {
    const remaining = 5200 - (Date.now() - lastTrigger); if (remaining > 0) await sleep(remaining);
    const accepted = successful(await api(admin, root + '/' + jobId + '/trigger', { method: 'POST', body: {} }), '触发真实客户公海任务');
    lastTrigger = Date.now(); lastExecution = accepted; assert.equal(accepted.accepted, true); return accepted;
  };
  const openLock = async sample => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root',
      '--batch', '--raw', '--skip-column-names', '--unbuffered', '--default-character-set=utf8mb4', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; }); child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("COMMIT; SELECT 'A3_CRM_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned CRM lock failed to release'); }
      assert.ok(code === 0 && !processError && output.includes('A3_CRM_RELEASED'), 'Owned CRM lock helper failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, connection: null };
    child.stdin.write('START TRANSACTION; SELECT customer_id FROM crm_customer WHERE customer_id=' + sample.customer + ' AND tenant_id=' + sample.tenant + ' AND create_by=' + sql(marker)
      + " FOR UPDATE; SELECT CONCAT('A3_CRM_READY:',CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_CRM_READY:[0-9]+/.test(value), 'Owned CRM lock not ready', 5000);
    lock.connection = output.match(/A3_CRM_READY:([0-9]+)/)[1];
  };
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name='customerPoolRelease';"), '0');
    for (const owner of owners) {
      const sample = { ...owner }; samples.push(sample);
      database('INSERT INTO crm_assignment_rule(tenant_id,rule_name,rule_type,status,inactive_days,customer_level,customer_tags,create_by) VALUES(' + owner.tenant + ',' + sql(marker) + ",'AUTO_RELEASE','ACTIVE',45," + sql(marker) + ',' + sql(marker) + ',' + sql(marker) + ');');
      sample.rule = database('SELECT rule_id FROM crm_assignment_rule WHERE tenant_id=' + owner.tenant + ' AND rule_name=' + sql(marker) + ';'); assert.match(sample.rule, /^[1-9][0-9]*$/);
      database('INSERT INTO crm_customer(tenant_id,customer_code,customer_name,level_code,customer_tags,owner_id,owner_name,dept_id,pool_flag,last_follow_up_time,deleted,create_by) VALUES(' + owner.tenant + ','
        + [sql(marker + owner.tenant), sql(marker), sql(marker), sql(marker), owner.id, sql(marker), owner.dept, "'0'", 'DATE_SUB(NOW(),INTERVAL 46 DAY)', 0, sql(marker)].join(',') + ');');
      sample.customer = database('SELECT customer_id FROM crm_customer WHERE tenant_id=' + owner.tenant + ' AND customer_code=' + sql(marker + owner.tenant) + ';'); assert.match(sample.customer, /^[1-9][0-9]*$/);
    }
    successful(await api(admin, root, { method: 'POST', body: payload }), '建立独立暂停客户公海故障任务');
    jobId = database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=' + sql(marker) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
    await openLock(samples[0]); execution = await trigger();
    const waiting = () => rows("SELECT JSON_OBJECT('id',CAST(r.PROCESSLIST_ID AS CHAR),'db',l.OBJECT_SCHEMA,'table',l.OBJECT_NAME,'index',l.INDEX_NAME,'data',l.LOCK_DATA) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads b ON b.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.threads r ON r.THREAD_ID=w.REQUESTING_THREAD_ID JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE=w.ENGINE WHERE b.PROCESSLIST_ID=" + lock.connection + ';');
    const blocked = await waitFor(waiting, items => items.length === 1, 'CRM update did not wait on owned row');
    const ownedRow = blocked[0].db === 'cloud_flow_db' && blocked[0].table === 'crm_customer' && blocked[0].index === 'PRIMARY' && blocked[0].data === samples[0].customer;
    check('仅取消已确认等待精确新客户主键的真实SQL', ownedRow); assert.match(blocked[0].id, /^[1-9][0-9]*$/);
    database('KILL QUERY ' + blocked[0].id + ';'); evidence.injected = true;
    const result = await waitFor(() => logs().find(item => item.executeNo === execution.executeNo), item => item && item.status !== 'RUNNING', 'CRM partial failure did not finish');
    await lock.release();
    check('失败租户客户未被回收且原负责人和轨迹保持', customer(samples[0]).pool === '0' && customer(samples[0]).owner === samples[0].id && trail(samples[0]).length === 0);
    const released = customer(samples[1]); const releasedTrail = trail(samples[1]);
    check('其他租户继续真实回收且保留原负责人和唯一轨迹', released.pool === '1' && released.owner === null && released.original === samples[1].id
      && releasedTrail.length === 1 && releasedTrail[0].tenant === samples[1].tenant && releasedTrail[0].owner === samples[1].id); evidence.continuation = true;
    check('客户公海部分失败保存FAILED及原始异常', result.status === 'FAILED' && result.affected === null && result.stack.includes('客户公海释放存在失败租户')
      && result.stack.includes('100000') && result.report && result.end); evidence.failed = true;
    const worker = await status(execution.executeNo);
    check('实际客户执行服务反查与持久失败日志一致', worker?.executeStatus === 'FAILED' && worker.exceptionStack === result.stack);
    const alarm = await waitFor(() => alarms(execution.executeNo), items => items.length === 1 && items[0].status === 'SUCCESS', 'CRM actual failure alarm not delivered');
    check('客户公海部分失败真实告警送达指定人员', alarm[0].receiver === owners[0].id && alarm[0].content.includes(marker));
    successful(await api(employee, '/auth/system/message/mine/' + alarm[0].id), '指定人员读取客户公海真实失败告警'); evidence.alarm = true;
    const pending = candidates(); assert.ok(pending.some(item => item.id === samples[0].customer));
    const recovered = await trigger();
    const completed = await waitFor(() => logs().find(item => item.executeNo === recovered.executeNo), item => item && item.status !== 'RUNNING', 'CRM recovery did not finish');
    check('解除故障后原处理器实际成功并准确回收全部剩余候选', completed.status === 'SUCCESS' && completed.affected === pending.length
      && completed.message === '客户公海释放完成：已释放' + pending.length + '名客户' && candidates().length === 0);
    check('原失败客户补回收且已成功租户不重复回收', samples.every(sample => customer(sample).pool === '1' && customer(sample).original === sample.id && trail(sample).length === 1));
    check('恢复后失败计数清零且原异常告警保留', database('SELECT consecutive_fail_count FROM sys_job WHERE job_id=' + jobId + ';') === '0'
      && alarms(execution.executeNo).length === 1 && alarms(recovered.executeNo).length === 0 && logs().find(item => item.executeNo === execution.executeNo).status === 'FAILED'); evidence.recovery = true;
    const denied = await api(employee, root + '/log/' + result.id);
    check('告警收件人不能读取后台客户任务异常详情', denied.status === 403 && !denied.body?.data); evidence.permissions = true;
    console.log(`A3_CRM_FAILURE_OBSERVED: tenants=2; real_partial_failed=true; other_tenant_released=true; failed_customer_recovered=true; duplicate_releases=0; recovered_count=${completed.affected}; production_modified=false`);
  } catch (error) { failure = error; }
  finally {
    try { if (lock) await lock.release(); } catch (error) { failure ||= error; }
    try {
      if (lastExecution?.accepted) await waitFor(() => logs().find(item => item.executeNo === lastExecution.executeNo), item => item && item.status !== 'RUNNING', 'CRM task still running during restoration', 60000);
      for (const sample of samples) {
        if (sample.rule) database("UPDATE crm_assignment_rule SET status='INACTIVE' WHERE rule_id=" + sample.rule + ' AND create_by=' + sql(marker) + ';');
        if (sample.customer) database('UPDATE crm_customer SET deleted=1 WHERE customer_id=' + sample.customer + ' AND create_by=' + sql(marker) + ';');
      }
      check('客户公海原任务规则授权保持且新样本停用', configuration() === originalConfiguration && grants() === originalGrants && rules() === originalRules
        && samples.every(sample => (!sample.rule || database('SELECT status FROM crm_assignment_rule WHERE rule_id=' + sample.rule + ';') === 'INACTIVE')
          && (!sample.customer || database('SELECT deleted FROM crm_customer WHERE customer_id=' + sample.customer + ';') === '1')));
      check('客户公海测试锁关闭且新任务保持暂停', (!lock?.connection || database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID=' + lock.connection + ';') === '0')
        && (!jobId || database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'PAUSED'));
      evidence.restoration = true; console.log('A3_CRM_FAILURE_RESTORED: original_jobs=true; original_rules=true; grants=true; new_rules_inactive=true; new_customers_deleted=true; lock_closed=true; logs_messages_audit_retained=true');
    } catch (error) { failure ||= error; }
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const service of state.services) {
    const directory = path.join(state.run, service.name);
    const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const filename of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(directory, filename)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('客户公海异常及审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`A3_CRM_FAILURE_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log(`A3_CRM_FAILURE_SCOPE: handler=customerPoolRelease; internal_requests=${internalRequests}; real_two_tenant_business=true; interface_doubles=0; production_modified=false`);
  if (failure) throw failure;
}
