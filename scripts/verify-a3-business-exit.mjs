import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyA3BusinessExit({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3X' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label, ms = 45000) => {
    const until = Date.now() + ms;
    do { const value = await read(); if (accept(value)) return value; await sleep(250); } while (Date.now() < until);
    throw new Error(label);
  };
  const keys = await readOwnedJobKeys(state); const redis = await ownedGatewayRedis(state);
  const secrets = new Set([...accounts.map(item => item.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const hr = state.services.find(item => item.name === 'hr'); assert.ok(hr);
  const root = '/auth/system/job';
  const owner = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0 AND status='0';")[0];
  assert.match(owner.id, /^[1-9][0-9]*$/); assert.match(owner.dept, /^[1-9][0-9]*$/);
  const config = () => database("SELECT tenant_id,job_id,job_name,job_group,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY tenant_id,job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig = config(); const oldGrants = grants();
  const original = successful(await api(admin, root + '/106'), '读取原合同到期任务');
  const inspector = successful(await api(admin, root + '/125'), '读取原任务结果巡检');
  assert.ok(original.handlerName === 'employeeContractExpire' && original.status === 'PAUSED');
  assert.ok(inspector.handlerName === 'jobTimeoutInspect' && inspector.status === 'PAUSED');
  assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED' AND deleted=0 AND handler_name IN ('employeeContractExpire','jobTimeoutInspect');"), '0');
  const candidates = () => database("SELECT COUNT(*) FROM hr_employee_contract c JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND t.deleted=0 AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND ((c.end_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY) AND c.status IN ('ACTIVE','EFFECTIVE')) OR (c.end_date<CURRENT_DATE AND c.status NOT IN ('EXPIRED','TERMINATED')));");
  assert.equal(candidates(), '0', 'Only the newly owned contract may be processed');
  const payload = { ...original, jobId: undefined, jobName: marker, jobGroup: 'A3_VERIFY', handlerParam: marker, status: 'PAUSED',
    triggerType: 'FIXED_RATE', cronExpression: null, intervalMs: 60000, concurrentFlag: 0, misfireStrategy: 'IGNORE',
    retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 0, dispatchRetryIntervalSec: 1,
    timeoutSeconds: 30, lockTimeSeconds: 30, criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 1, alarmReceiver: owner.id, remark: marker };
  const manifestFile = path.join(state.run, 'private', 'a3-business-exit-' + caseTag + '.json');
  const readManifest = () => fs.readFile(manifestFile, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, '')))
    .catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  let jobId; let employeeId; let contractId; let createdEmployee = false; let lock; let first; let failure; let internalRequests = 0;
  const helperLogs = []; const executions = [];
  const logRows = () => jobId ? rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'report',report_time,'start',start_time,'end',end_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + jobId + ' ORDER BY log_id;') : [];
  const ownLog = executeNo => logRows().find(item => item.executeNo === executeNo);
  const messages = () => contractId ? rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='HR_CONTRACT_EXPIRING' AND biz_id=" + sql(contractId) + ' ORDER BY record_id;') : [];
  const alarms = executeNo => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type,'content',content) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(executeNo) + ' ORDER BY record_id;');
  const internal = async (target, method = 'GET', payload) => {
    const body = payload ? JSON.stringify(payload) : '';
    const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-hr', method, target, body); secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + hr.port + target, { method, headers, ...(method === 'GET' ? {} : { body }), redirect: 'error', signal: AbortSignal.timeout(10000) });
    internalRequests++; const result = await response.json();
    assert.ok(response.status === 200 && result.code === 200, 'Actual signed HR protocol failed'); return result.data;
  };
  const operate = async action => {
    const out = manifestFile + '.' + action + '.stdout.log'; const err = manifestFile + '.' + action + '.stderr.log';
    const output = await fs.open(out, 'wx'); const errors = await fs.open(err, 'wx'); helperLogs.push(out, err);
    let code;
    try {
      const args = ['-NoLogo', '-NoProfile', '-File', 'scripts/operate-a3-business-exit.ps1', '-StatePath', path.join(state.run, 'state.json'), '-Action', action, '-Marker', caseTag];
      if (action === 'Stop') args.push('-JobId', jobId, '-ContractId', contractId, '-LockConnection', lock.connection, '-ExecuteNo', first.executeNo);
      code = await new Promise((resolve, reject) => {
        const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe', args, { windowsHide: true, stdio: ['ignore', output.fd, errors.fd] });
        child.once('error', reject); child.once('exit', resolve);
      });
    } finally { await output.close(); await errors.close(); }
    assert.equal(code, 0, 'Owned business exit ' + action + ' failed; evidence retained');
    for (const line of (await fs.readFile(out, 'utf8')).split(/\r?\n/).filter(line => line.startsWith('A3_BUSINESS_EXIT_'))) console.log(line);
  };
  const inspect = async label => {
    const accepted = successful(await api(admin, root + '/125/trigger', { method: 'POST', body: {} }), '管理员实际执行原结果巡检');
    assert.equal(accepted.accepted, true);
    const result = await waitFor(() => rows("SELECT JSON_OBJECT('status',execute_status,'actor',trigger_by,'trigger',trigger_type) FROM sys_job_log WHERE job_id=125 AND execute_no=" + sql(accepted.executeNo) + ';')[0], row => row && row.status !== 'RUNNING', 'Original result inspection did not finish');
    check(label + '由原125真实完成并记录操作者', result.status === 'SUCCESS' && result.actor === 'g_import_admin' && result.trigger === 'MANUAL');
  };
  const awaitThreshold = executeNo => waitFor(() => database('SELECT IF(DATE_ADD(start_time,INTERVAL 31 SECOND)<=NOW(),1,0) FROM sys_job_log WHERE job_id=' + jobId + ' AND execute_no=' + sql(executeNo) + ';'), value => value === '1', 'Actual timeout threshold not reached', 40000);
  const trigger = async () => {
    const accepted = successful(await api(admin, root + '/' + jobId + '/trigger', { method: 'POST', body: {} }), '管理员实际派发进行中退出验证任务');
    executions.push(accepted.executeNo); assert.equal(accepted.accepted, true); return accepted;
  };
  const openLock = async () => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', '--default-character-set=utf8mb4', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; }); child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("ROLLBACK; SELECT 'A3_EXIT_LOCK_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned lock connection did not release promptly'); }
      assert.ok(code === 0 && !processError && output.includes('A3_EXIT_LOCK_RELEASED'), 'Owned row-lock connection failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, isReleased: () => released, connection: null };
    child.stdin.write('START TRANSACTION; SELECT id FROM hr_employee_contract WHERE id=' + contractId + ' AND create_by=' + sql(marker) + " FOR UPDATE; SELECT CONCAT('A3_EXIT_LOCK_READY:', CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_EXIT_LOCK_READY:[0-9]+/.test(value), 'Actual owned contract row lock not ready', 5000);
    lock.connection = output.match(/A3_EXIT_LOCK_READY:([0-9]+)/)[1];
  };
  try {
    successful(await api(admin, root, { method: 'POST', body: payload }), '新建独立暂停的业务退出验证任务');
    jobId = database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=' + sql(marker) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
    employeeId = database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=' + owner.id + ' AND deleted=0;');
    if (!employeeId) {
      database('INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by) VALUES(100000,' + sql(marker) + ',' + sql(marker) + ",'UNKNOWN'," + owner.dept + ",'ACTIVE'," + owner.id + ',' + sql(marker) + ');');
      employeeId = database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND employee_no=' + sql(marker) + ';'); createdEmployee = true;
    }
    assert.match(employeeId, /^[1-9][0-9]*$/);
    database('INSERT INTO hr_employee_contract(tenant_id,employee_id,contract_type,contract_no,sign_date,start_date,end_date,status,deleted,create_by) VALUES(100000,' + employeeId + ",'LABOR'," + sql(marker) + ",CURRENT_DATE,CURRENT_DATE,DATE_ADD(CURRENT_DATE,INTERVAL 10 DAY),'ACTIVE',0," + sql(marker) + ');');
    contractId = database('SELECT id FROM hr_employee_contract WHERE tenant_id=100000 AND contract_no=' + sql(marker) + ';'); assert.match(contractId, /^[1-9][0-9]*$/);
    assert.equal(candidates(), '1');
    await openLock(); const started = Date.now(); first = await trigger();
    await waitFor(() => database('SELECT COUNT(*) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.BLOCKING_THREAD_ID WHERE t.PROCESSLIST_ID=' + lock.connection + ';'), value => Number(value) >= 1, 'HR did not actually wait on the owned contract', 5000);
    const running = await internal('/inner/job/status/' + first.executeNo);
    check('实际业务在行锁处等待且管理和签名状态均处理中', !lock.isReleased() && running.executeStatus === 'RUNNING' && ownLog(first.executeNo)?.status === 'RUNNING' && !ownLog(first.executeNo)?.report && messages().length === 0);
    evidence.running = true;
    await operate('Stop');
    check('原人事进程在业务未完成时实际退出', !lock.isReleased() && (await readManifest()).status === 'STOPPED' && ownLog(first.executeNo).status === 'RUNNING'); evidence.stopped = true;
    await lock.release();
    let refused = false;
    try { await fetch('http://127.0.0.1:' + hr.port + '/inner/job/status/' + first.executeNo, { signal: AbortSignal.timeout(4000) }); }
    catch (error) { refused = error.cause?.code === 'ECONNREFUSED'; }
    check('退出后原地址不可达且合同保持未处理无提醒', refused && database('SELECT status FROM hr_employee_contract WHERE id=' + contractId + ';') === 'ACTIVE' && messages().length === 0); evidence.rollback = true;
    await awaitThreshold(first.executeNo); await inspect('业务退出后巡检');
    const timedOut = ownLog(first.executeNo);
    check('实际超时后记录结果未知且不伪报成功条数', timedOut.status === 'TIMEOUT' && timedOut.message === '结果未知' && timedOut.affected === null && timedOut.duration === null && timedOut.end); evidence.timeout = true;
    const delivered = await waitFor(() => alarms(first.executeNo), values => values.length === 1 && values[0].status === 'SUCCESS', 'Actual unknown-result alarm not delivered');
    check('指定员工收到唯一结果未知告警', delivered[0].receiver === owner.id && delivered[0].channel === 'INTERNAL' && delivered[0].content.includes(first.executeNo) && delivered[0].content.includes('结果未知') && delivered[0].content.includes(marker));
    successful(await api(employee, '/auth/system/message/mine/' + delivered[0].id), '员工读取进行中退出告警'); evidence.alarm = true;
    const stableTimeout = JSON.stringify(timedOut);
    await operate('Restore'); evidence.runtimeRestoration = true;
    await waitFor(() => redis('EXISTS', 'cloudflow:job:lock:hr-employee-contract-expire-job'), value => value === '0', 'Original process lock did not expire naturally');
    const next = await trigger();
    const success = await waitFor(() => ownLog(next.executeNo), value => value && value.status !== 'RUNNING', 'Restored HR did not complete the new execution');
    check('恢复后新编号真实处理一份合同并回报准确结果', success.status === 'SUCCESS' && success.affected === 1 && success.message === '员工合同到期扫描完成：即将到期1份，已到期0份' && Number.isInteger(success.duration) && success.duration >= 0 && success.report && success.actor === 'g_import_admin' && success.trigger === 'MANUAL');
    const actual = await internal('/inner/job/status/' + next.executeNo);
    check('恢复执行的签名反查与真实完成记录一致', actual.executeStatus === 'SUCCESS' && actual.affectedRows === 1 && actual.durationMs === success.duration && actual.resultMsg === success.message);
    const notice = await waitFor(messages, values => values.length === 1 && values[0].status === 'SUCCESS', 'Recovered contract reminder not delivered');
    check('恢复后合同实际变更且员工仅收到一条业务提醒', database('SELECT status FROM hr_employee_contract WHERE id=' + contractId + ';') === 'EXPIRING' && notice[0].receiver === owner.id && notice[0].channel === 'INTERNAL');
    successful(await api(employee, '/auth/system/message/mine/' + notice[0].id), '员工读取恢复后的合同提醒'); evidence.recovery = true;
    const replay = await internal('/inner/job/execute', 'POST', { jobId: Number(jobId), executeNo: next.executeNo, handlerName: original.handlerName, handlerParam: marker, timeoutSeconds: 30, lockTimeSeconds: 30, concurrentFlag: 0 });
    await sleep(5300); await inspect('恢复后重复巡检');
    check('完成编号重投及重复巡检不覆盖旧超时或重复消息', replay.accepted === true && JSON.stringify(ownLog(first.executeNo)) === stableTimeout && JSON.stringify(ownLog(next.executeNo)) === JSON.stringify(success) && messages().length === 1 && alarms(first.executeNo).length === 1 && alarms(next.executeNo).length === 0); evidence.deduplication = true;
    const detail = successful(await api(admin, root + '/log/' + timedOut.id), '管理员查看进行中退出结果');
    const denied = await api(employee, root + '/log/' + timedOut.id);
    check('管理员可查未知结果而员工仍无后台日志权限', detail.executeStatus === 'TIMEOUT' && detail.resultMsg === '结果未知' && denied.status === 403 && !denied.body?.data); evidence.permissions = true;
    console.log('A3_BUSINESS_EXIT_OBSERVED: ' + JSON.stringify({ jobId, contractId, crashedExecution: first.executeNo, recoveredExecution: next.executeNo, elapsedMs: Date.now() - started, realMysqlWait: true, originalHrProcessKilled: true, recoveredAffected: success.affected, forcedTerminalWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    try { if (lock) await lock.release(); } catch (error) { failure ||= error; }
    try {
      // Resolve the lost execution while the original address is still unreachable, then restore.
      const manifest = await readManifest();
      if (manifest && manifest.status !== 'RESTORED') {
        if (first?.accepted && ownLog(first.executeNo)?.status === 'RUNNING') { await awaitThreshold(first.executeNo); await inspect('异常收尾巡检'); }
        await operate('Restore');
      }
      check('原人事进程和十二份运行配置恢复', !manifest || (await readManifest()).status === 'RESTORED'); evidence.runtimeRestoration = true;
    } catch (error) { failure ||= error; }
    try {
      if (jobId) await waitFor(logRows, values => values.every(value => value.status !== 'RUNNING'), 'Execution still running during fixture cleanup', 60000);
      if (contractId) database('UPDATE hr_employee_contract SET deleted=1 WHERE id=' + contractId + ' AND create_by=' + sql(marker) + ';');
      if (createdEmployee) database('UPDATE hr_employee SET deleted=1 WHERE id=' + employeeId + ' AND employee_no=' + sql(marker) + ';');
      check('原任务授权保持且新样本停用并保留真实证据', config() === oldConfig && grants() === oldGrants && (!contractId || database('SELECT deleted FROM hr_employee_contract WHERE id=' + contractId + ';') === '1') && (!jobId || database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'PAUSED'));
      check('数据库行锁连接已关闭', !lock?.connection || database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID=' + lock.connection + ';') === '0'); evidence.restoration = true;
    } catch (error) { failure ||= error; }
  }
  const scanFiles = [...helperLogs];
  for (const item of state.services) for (const sub of ['', 'logs']) {
    const directory = path.join(state.run, item.name, sub);
    const names = await fs.readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of names) if (name.endsWith('.log')) scanFiles.push(path.join(directory, name));
  }
  for (const name of await fs.readdir(path.dirname(manifestFile))) if (name.startsWith(path.basename(manifestFile) + '.') && name.endsWith('.log')) scanFiles.push(path.join(path.dirname(manifestFile), name));
  let files = 0; let bytes = 0; let leaks = 0;
  for (const file of new Set(scanFiles)) { const scan = await scanSecretStream(createReadStream(file), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks; }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('业务退出和恢复日志及审计无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_BUSINESS_EXIT_SECRET_SCAN: ' + JSON.stringify({ files, bytes, values: secrets.size, leaks, databaseBytes: audit.bytes, databaseLeaks: audit.leaks }));
  console.log('A3_BUSINESS_EXIT_SCOPE: internal_requests=' + internalRequests + '; original_contract_handler=true; real_process_exit=true; full_cluster=false; production_modified=false');
  if (failure) throw failure;
}
