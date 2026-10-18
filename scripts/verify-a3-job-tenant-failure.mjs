import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys } from './job-internal-signing.mjs';

// A single owned contract update is cancelled while blocked on its fixture row.
// All tenant iteration, actual SQL, execution/report and messages remain product behavior.
export async function verifyA3JobTenantFailure({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3P' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accept, label, milliseconds = 30000) => {
    const deadline = Date.now() + milliseconds;
    do { const value = await read(); if (accept(value)) return value; await sleep(200); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const employee = await session('g_holiday_employee'); const foreign = await session('g_import_tenant');
  const secrets = new Set([...accounts.map(account => account.password).filter(Boolean), ...Object.values(await readOwnedJobKeys(state))]);
  for (const page of [admin, employee, foreign]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const owners = rows("SELECT JSON_OBJECT('id',CAST(u.user_id AS CHAR),'tenant',CAST(u.tenant_id AS CHAR),'dept',CAST(u.dept_id AS CHAR),'name',u.user_name) FROM sys_user u JOIN sys_tenant t ON t.tenant_id=u.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE u.user_name IN ('g_holiday_employee','g_import_tenant') AND u.deleted=0 AND u.status='0' ORDER BY u.tenant_id;");
  assert.equal(owners.length, 2); assert.equal(owners[0].tenant, '100000'); assert.notEqual(owners[0].tenant, owners[1].tenant);
  for (const owner of owners) for (const key of ['id', 'tenant', 'dept']) assert.match(owner[key], /^[1-9][0-9]*$/);
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const configuration = () => database("SELECT tenant_id,job_id,job_name,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY tenant_id,job_id;');
  const originalConfiguration = configuration(); const originalGrants = grants();
  const root = '/auth/system/job';
  const payload = { jobName: marker, jobGroup: 'A3_VERIFY', serviceName: 'cloudflow-service-hr', handlerName: 'employeeContractExpire',
    handlerParam: marker, triggerType: 'FIXED_RATE', intervalMs: 60000, status: 'PAUSED', concurrentFlag: 0,
    misfireStrategy: 'IGNORE', retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 0, dispatchRetryIntervalSec: 1,
    timeoutSeconds: 60, lockTimeSeconds: 60, criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 1, alarmReceiver: owners[0].id, remark: marker };
  const samples = []; let jobId; let execution; let lock; let failure; let correctFailure = false; let channelId;
  const channels = () => database('SELECT tenant_id,channel_id,channel_code,channel_type,status,deleted FROM sys_message_channel WHERE create_by<>' + sql(marker) + ' ORDER BY tenant_id,channel_id;');
  const originalChannels = channels();
  const logs = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'report',report_time,'end',end_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + jobId + ' ORDER BY log_id;');
  const messages = sample => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) FROM sys_message_record WHERE tenant_id=" + sample.tenant + " AND biz_type='HR_CONTRACT_EXPIRING' AND biz_id=" + sql(sample.contract) + ' ORDER BY record_id;');
  const alarms = () => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'content',content) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(execution.executeNo) + ' ORDER BY record_id;');
  const openLock = async sample => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root',
      '--batch', '--raw', '--skip-column-names', '--unbuffered', '--default-character-set=utf8mb4', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; }); child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("COMMIT; SELECT 'A3_PARTIAL_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned partial-failure lock failed to release'); }
      assert.ok(code === 0 && !processError && output.includes('A3_PARTIAL_RELEASED'), 'Owned lock helper failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, connection: null };
    child.stdin.write('START TRANSACTION; SELECT id FROM hr_employee_contract WHERE id=' + sample.contract + ' AND tenant_id=' + sample.tenant + ' AND create_by=' + sql(marker)
      + " FOR UPDATE; SELECT CONCAT('A3_PARTIAL_READY:',CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_PARTIAL_READY:[0-9]+/.test(value), 'Owned partial-failure lock not ready', 5000);
    lock.connection = output.match(/A3_PARTIAL_READY:([0-9]+)/)[1];
  };
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name='employeeContractExpire';"), '0');
    if (database('SELECT COUNT(*) FROM sys_message_channel WHERE tenant_id=' + owners[1].tenant + " AND channel_type='INTERNAL' AND status='ENABLED' AND deleted=0;") === '0') {
      database('INSERT INTO sys_message_channel(tenant_id,channel_code,channel_type,channel_name,implemented_flag,status,create_by) VALUES(' + owners[1].tenant + ',' + sql(marker) + ",'INTERNAL'," + sql(marker) + ",1,'ENABLED'," + sql(marker) + ');');
      channelId = database('SELECT channel_id FROM sys_message_channel WHERE tenant_id=' + owners[1].tenant + ' AND channel_code=' + sql(marker) + ';'); assert.match(channelId, /^[1-9][0-9]*$/);
    }
    for (const owner of owners) {
      const sample = { ...owner, createdEmployee: false }; samples.push(sample);
      sample.employee = database('SELECT id FROM hr_employee WHERE tenant_id=' + sample.tenant + ' AND user_id=' + sample.id + ' AND deleted=0;');
      if (!sample.employee) {
        database('INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by) VALUES(' + sample.tenant + ',' + sql(marker + sample.tenant) + ',' + sql(marker) + ",'UNKNOWN'," + sample.dept + ",'ACTIVE'," + sample.id + ',' + sql(marker) + ');');
        sample.employee = database('SELECT id FROM hr_employee WHERE tenant_id=' + sample.tenant + ' AND employee_no=' + sql(marker + sample.tenant) + ';'); sample.createdEmployee = true;
      }
      assert.match(sample.employee, /^[1-9][0-9]*$/);
      database('INSERT INTO hr_employee_contract(tenant_id,employee_id,contract_type,contract_no,sign_date,start_date,end_date,status,deleted,create_by) VALUES(' + sample.tenant + ',' + sample.employee
        + ",'LABOR'," + sql(marker + sample.tenant) + ",CURRENT_DATE,CURRENT_DATE,DATE_ADD(CURRENT_DATE,INTERVAL 10 DAY),'ACTIVE',0," + sql(marker) + ');');
      sample.contract = database('SELECT id FROM hr_employee_contract WHERE tenant_id=' + sample.tenant + ' AND contract_no=' + sql(marker + sample.tenant) + ';'); assert.match(sample.contract, /^[1-9][0-9]*$/);
    }
    successful(await api(admin, root, { method: 'POST', body: payload }), '建立实际跨租户故障验证任务');
    jobId = database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=' + sql(marker) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
    await openLock(samples[0]);
    execution = successful(await api(admin, root + '/' + jobId + '/trigger', { method: 'POST', body: {} }), '触发真实跨租户合同任务');
    check('实际跨租户合同任务已受理', execution.accepted === true);
    const waiting = () => rows("SELECT JSON_OBJECT('id',CAST(r.PROCESSLIST_ID AS CHAR),'db',l.OBJECT_SCHEMA,'table',l.OBJECT_NAME,'index',l.INDEX_NAME,'data',l.LOCK_DATA) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads b ON b.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.threads r ON r.THREAD_ID=w.REQUESTING_THREAD_ID JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE=w.ENGINE WHERE b.PROCESSLIST_ID=" + lock.connection + ';');
    const blocked = await waitFor(waiting, items => items.length === 1, 'Real contract update not blocked by owned row');
    const ownedRow = blocked[0].db === 'cloud_flow_db' && blocked[0].table === 'hr_employee_contract'
      && blocked[0].index === 'PRIMARY' && blocked[0].data === samples[0].contract;
    console.log('A3_TENANT_FAILURE_QUERY_GUARD: owned_schema=' + (blocked[0].db === 'cloud_flow_db') + '; owned_table=' + (blocked[0].table === 'hr_employee_contract')
      + '; primary_index=' + (blocked[0].index === 'PRIMARY') + '; exact_owned_contract=' + (blocked[0].data === samples[0].contract));
    assert.ok(ownedRow, 'Only a statement waiting on the exact owned primary-key row may be cancelled'); assert.match(blocked[0].id, /^[1-9][0-9]*$/);
    // Cancel only the statement demonstrably waiting on our uniquely owned contract row.
    database('KILL QUERY ' + blocked[0].id + ';'); evidence.injected = true;
    check('单条故障注入未关闭数据库服务或修改业务结果', database('SELECT status FROM hr_employee_contract WHERE id=' + samples[0].contract + ';') === 'ACTIVE');
    const result = await waitFor(() => logs().find(item => item.executeNo === execution.executeNo), item => item && item.status !== 'RUNNING', 'Partial-tenant job did not complete');
    await lock.release();
    const sent = await waitFor(() => messages(samples[1]), items => items.length === 1 && items[0].status === 'SUCCESS', 'Other tenant contract was not actually processed');
    check('一个租户失败后其他租户继续处理并实际送达', database('SELECT status FROM hr_employee_contract WHERE id=' + samples[1].contract + ';') === 'EXPIRING'
      && sent[0].receiver === samples[1].id && sent[0].tenant === samples[1].tenant && messages(samples[0]).length === 0);
    successful(await api(foreign, '/auth/system/message/mine/' + sent[0].id), '另一个租户本人读取真实合同消息'); evidence.continuation = true;
    correctFailure = result.status === 'FAILED' && Boolean(result.stack) && Boolean(result.report) && Boolean(result.end);
    console.log('A3_TENANT_FAILURE_OBSERVED: ' + JSON.stringify({ status: result.status, affected: result.affected,
      has_exception: Boolean(result.stack), has_report: Boolean(result.report), expected_status: 'FAILED', failed_contract_unchanged: true,
      other_tenant_contract_processed: true, actual_query_cancelled: true, original_job_configuration_unchanged: true }));
    if (correctFailure) {
      const alarm = await waitFor(alarms, items => items.length === 1 && items[0].status === 'SUCCESS', 'Partial-tenant failure alarm not delivered');
      check('部分租户失败实际告警送达指定人', alarm[0].receiver === owners[0].id && alarm[0].content.includes(marker));
      successful(await api(employee, '/auth/system/message/mine/' + alarm[0].id), '本租户指定人读取部分失败告警'); evidence.alarm = true;
    } else console.log('A3_TENANT_FAILURE_DEFECT: partial_business_failure_reported_success=' + (result.status === 'SUCCESS') + '; alarm_count=' + alarms().length);
  } catch (error) { failure = error; }
  finally {
    try { if (lock) await lock.release(); } catch (error) { failure ||= error; }
    try {
      if (execution?.accepted) await waitFor(() => logs().find(item => item.executeNo === execution.executeNo), item => item && item.status !== 'RUNNING', 'Partial-tenant task still running during restoration', 60000);
      for (const sample of samples) {
        if (sample.contract) database('UPDATE hr_employee_contract SET deleted=1 WHERE id=' + sample.contract + ' AND create_by=' + sql(marker) + ';');
        if (sample.createdEmployee) database('UPDATE hr_employee SET deleted=1 WHERE id=' + sample.employee + ' AND create_by=' + sql(marker) + ';');
      }
      if (channelId) database("UPDATE sys_message_channel SET status='DISABLED',deleted=1 WHERE channel_id=" + channelId + ' AND create_by=' + sql(marker) + ';');
      check('跨租户测试原配置及授权保持且所有新合同停用', configuration() === originalConfiguration && grants() === originalGrants
        && samples.every(sample => !sample.contract || database('SELECT deleted FROM hr_employee_contract WHERE id=' + sample.contract + ';') === '1'));
      check('临时锁连接关闭且测试任务保持暂停', (!lock?.connection || database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID=' + lock.connection + ';') === '0')
        && (!jobId || database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'PAUSED'));
      check('原消息渠道保持且新测试渠道停用', channels() === originalChannels && (!channelId || database('SELECT CONCAT(status,deleted) FROM sys_message_channel WHERE channel_id=' + channelId + ';') === 'DISABLED1'));
      evidence.restoration = true; console.log('A3_TENANT_FAILURE_RESTORED: original_jobs=true; grants=true; new_contracts_deleted=true; lock_closed=true; channels_restored=true; audit_retained=true');
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
  check('跨租户异常及审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`A3_TENANT_FAILURE_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  if (failure) throw failure;
  check('任何租户实际业务失败都必须返回FAILED及异常', correctFailure); evidence.failed = true;
}
