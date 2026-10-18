import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

// Two real HR JVMs share the original database, execution store and distributed lock.
// Direct peer protocol checks are distinguished from the original admin dispatch logs.
export async function verifyA3JobPeer({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3P' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accept, message, milliseconds = 30000) => {
    const until = Date.now() + milliseconds;
    do { const value = await read(); if (accept(value)) return value; await sleep(200); } while (Date.now() < until);
    throw new Error(message);
  };
  const keys = await readOwnedJobKeys(state);
  const redis = await ownedGatewayRedis(state);
  const secrets = new Set([...accounts.map(account => account.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const service = state.services.find(item => item.name === 'hr');
  assert.ok(service && Number.isSafeInteger(service.port));
  let internalRequests = 0;
  const internal = async (target, method = 'GET', payload) => {
    const body = payload ? JSON.stringify(payload) : '';
    const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-hr', method, target, body);
    secrets.add(headers['X-Job-Signature']);
    const response = await fetch(`http://127.0.0.1:${service.port}${target}`, { method, headers,
      ...(method === 'GET' ? {} : { body }), redirect: 'error', signal: AbortSignal.timeout(10000) });
    internalRequests++;
    const result = await response.json();
    assert.ok(response.status === 200 && result.code === 200, 'Signed real HR task protocol failed');
    return result.data;
  };
  const peerDirectory = path.join(state.run, 'private', 'a3-peer-hr-' + caseTag);
  const peerFile = path.join(peerDirectory, 'peer.json');
  const capacityFile = path.join(state.run, 'private', 'a3-peer-capacity-' + caseTag + '.json');
  const priorBackups = new Set();
  for (const item of state.services) for (const name of await fs.readdir(path.join(state.run, item.name))) {
    if (/^(stdout|stderr)-before-.*\.log$/.test(name)) priorBackups.add(path.join(state.run, item.name, name));
  }
  let peer; let peerContractId; let peerExecuteNo;
  const helperLogs = [];
  const operatePeer = async action => {
    const out = path.join(state.run, 'private', 'a3-peer-hr-' + caseTag + '-' + action + '.stdout.log');
    const err = out.replace('.stdout.log', '.stderr.log');
    const output = await fs.open(out, 'wx'); const errors = await fs.open(err, 'wx'); helperLogs.push(out, err);
    let code;
    try {
      code = await new Promise((resolve, reject) => {
        const capacity = ['Reserve', 'Restore'].includes(action);
        const args = ['-NoLogo', '-NoProfile', '-File', capacity ? 'scripts/operate-a3-peer-capacity.ps1' : 'scripts/operate-a3-job-peer.ps1',
          '-StatePath', path.join(state.run, 'state.json'), '-Action', action, '-Marker', caseTag];
        if (!capacity) args.push('-ServiceName', 'hr');
        const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe', args,
        { windowsHide: true, stdio: ['ignore', output.fd, errors.fd] });
        child.once('error', reject); child.once('exit', resolve);
      });
    } finally { await output.close(); await errors.close(); }
    assert.equal(code, 0, 'Owned HR peer ' + action + ' failed; retained diagnostics require inspection');
    const message = (await fs.readFile(out, 'utf8')).split(/\r?\n/).filter(line => /^(A3_PEER_|A3_CAPACITY_)/.test(line));
    assert.equal(message.length, 1); console.log(message[0]);
  };
  const peerInternal = async (target, method = 'GET', payload) => {
    const body = payload ? JSON.stringify(payload) : '';
    const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-hr', method, target, body);
    secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + peer.port + target, { method, headers,
      ...(method === 'GET' ? {} : { body }), redirect: 'error', signal: AbortSignal.timeout(10000) });
    internalRequests++;
    const result = await response.json(); assert.ok(response.status === 200 && result.code === 200, 'Actual peer signed protocol failed');
    return result.data;
  };
  const peerRequest = executeNo => ({ jobId: 106, executeNo, handlerName: original.handlerName, handlerParam: original.handlerParam,
    timeoutSeconds: original.timeoutSeconds, lockTimeSeconds: original.lockTimeSeconds, concurrentFlag: 0 });

  const root = '/auth/system/job';
  const original = successful(await api(admin, root + '/106'), '读取原合同到期任务');
  assert.ok(original.handlerName === 'employeeContractExpire' && original.status === 'PAUSED' && original.concurrentFlag === 0);
  assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name='employeeContractExpire';"), '0');
  const configuration = () => database("SELECT tenant_id,job_id,job_name,job_group,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job ORDER BY tenant_id,job_id;");
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfiguration = configuration(); const oldGrants = grants();
  const owner = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0 AND status='0';")[0];
  assert.match(owner.id, /^[1-9][0-9]*$/); assert.match(owner.dept, /^[1-9][0-9]*$/);
  const logRows = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'duration',duration_ms,'trigger',trigger_type,'actor',trigger_by,'report',report_time,'end',end_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=106 ORDER BY log_id;");
  const ownLog = executeNo => logRows().find(item => item.executeNo === executeNo);
  let lastTrigger = 0;
  const trigger = async () => {
    const remaining = 5200 - (Date.now() - lastTrigger); if (remaining > 0) await sleep(remaining);
    const started = Date.now();
    const result = successful(await api(admin, root + '/106/trigger', { method: 'POST', body: {} }), '真实触发合同到期任务');
    lastTrigger = Date.now(); return { ...result, started, returned: lastTrigger, elapsed: lastTrigger - started };
  };
  let employeeId; let contractId; let createdEmployee = false; let lock; let first; let failure;
  const messages = () => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='HR_CONTRACT_EXPIRING' AND biz_id=" + sql(contractId) + ' ORDER BY record_id;');
  const openLock = async () => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root',
      '--batch', '--raw', '--skip-column-names', '--unbuffered', '--default-character-set=utf8mb4', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; });
    child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("COMMIT; SELECT 'A3_LOCK_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned row-lock helper failed to release promptly'); }
      assert.ok(code === 0 && !processError && output.includes('A3_LOCK_RELEASED'), 'Owned row-lock helper failed');
    };
    // A hard bound is independent of the test's success/failure path and below InnoDB's default 50 s wait.
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, isReleased: () => released, connection: null };
    child.stdin.write('START TRANSACTION; SELECT id FROM hr_employee_contract WHERE id=' + contractId + " AND create_by=" + sql(marker)
      + " FOR UPDATE; SELECT CONCAT('A3_LOCK_READY:', CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_LOCK_READY:[0-9]+/.test(value), 'Owned contract row lock did not become ready', 5000);
    lock.connection = output.match(/A3_LOCK_READY:([0-9]+)/)[1];
    return lock;
  };
  try {
    await operatePeer('Reserve');
    await operatePeer('Prepare');
    await operatePeer('Start');
    peer = JSON.parse((await fs.readFile(peerFile, 'utf8')).replace(/^\uFEFF/, ''));
    const baseProcess = state.processes.find(item => item.name === 'hr');
    check('两个独立真实人事进程健康且共享原数据与服务身份', peer.status === 'RUNNING' && peer.processId !== baseProcess.id && peer.port !== service.port);
    evidence.instances = true;
    employeeId = database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=' + owner.id + ' AND deleted=0;');
    if (!employeeId) {
      database('INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by) VALUES(100000,' + sql(marker) + ',' + sql(marker) + ",'UNKNOWN'," + owner.dept + ",'ACTIVE'," + owner.id + ',' + sql(marker) + ');');
      employeeId = database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND employee_no=' + sql(marker) + ';'); createdEmployee = true;
    }
    assert.match(employeeId, /^[1-9][0-9]*$/);
    database('INSERT INTO hr_employee_contract(tenant_id,employee_id,contract_type,contract_no,sign_date,start_date,end_date,status,deleted,create_by) VALUES(100000,' + employeeId
      + ",'LABOR'," + sql(marker) + ",CURRENT_DATE,CURRENT_DATE,DATE_ADD(CURRENT_DATE,INTERVAL 10 DAY),'ACTIVE',0," + sql(marker) + ');');
    contractId = database('SELECT id FROM hr_employee_contract WHERE tenant_id=100000 AND contract_no=' + sql(marker) + ';'); assert.match(contractId, /^[1-9][0-9]*$/);
    const candidates = rows("SELECT JSON_OBJECT('id',CAST(c.id AS CHAR),'target',IF(c.end_date<CURRENT_DATE,'EXPIRED','EXPIRING')) FROM hr_employee_contract c JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND ((c.end_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY) AND c.status IN ('ACTIVE','EFFECTIVE')) OR (c.end_date<CURRENT_DATE AND c.status NOT IN ('EXPIRED','TERMINATED'))) ORDER BY c.id;");
    await openLock();
    first = await trigger();
    check('长合同任务在业务完成前返回已受理且少于十秒', first.accepted === true && first.elapsed < 10000 && !lock.isReleased());
    const blocking = () => Number(database('SELECT COUNT(*) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.BLOCKING_THREAD_ID WHERE t.PROCESSLIST_ID=' + lock.connection + ';'));
    await waitFor(blocking, value => value >= 1, 'Real HR update did not wait for the owned row lock', 5000);
    check('真实合同处理等待数据库行锁且尚未发出提醒', database('SELECT status FROM hr_employee_contract WHERE id=' + contractId + ';') === 'ACTIVE' && messages().length === 0);
    const running = await internal('/inner/job/status/' + first.executeNo);
    check('实际执行状态与管理日志同时保持处理中', running?.executeStatus === 'RUNNING' && ownLog(first.executeNo)?.status === 'RUNNING' && !ownLog(first.executeNo)?.report);
    const same = await peerInternal('/inner/job/execute', 'POST', peerRequest(first.executeNo));
    check('第二真实实例重投相同执行编号被去重', same.accepted === true && same.executeNo === first.executeNo
      && (await peerInternal('/inner/job/status/' + first.executeNo))?.executeStatus === 'RUNNING'
      && blocking() === 1 && messages().length === 0);
    const competingNo = randomUUID();
    const competing = await peerInternal('/inner/job/execute', 'POST', peerRequest(competingNo));
    check('另一实例的新执行编号也被共享业务锁阻止', competing.accepted === false && competing.reason === 'LOCK_HELD'
      && (await peerInternal('/inner/job/status/' + competingNo))?.executeStatus === 'SKIPPED'
      && (await internal('/inner/job/status/' + competingNo))?.executeStatus === 'SKIPPED'
      && blocking() === 1 && messages().length === 0);
    evidence.peerDeduplication = true; evidence.peerLock = true;
    const remaining = 11000 - (Date.now() - first.started); if (remaining > 0) await sleep(remaining);
    check('超过十秒后首个调用已返回而真实业务仍在等待', !lock.isReleased() && blocking() >= 1 && ownLog(first.executeNo)?.status === 'RUNNING');
    evidence.async = true;
    const second = await trigger();
    check('禁止并发时再次触发实际返回SKIPPED', second.accepted === false && second.reason === 'SKIPPED' && second.elapsed < 10000 && !lock.isReleased());
    const skipped = ownLog(second.executeNo);
    check('重叠执行持久记录跳过及MANUAL操作者', skipped?.status === 'SKIPPED' && skipped.message === 'LOCK_HELD' && skipped.trigger === 'MANUAL' && skipped.actor === 'g_import_admin' && skipped.end);
    const skipState = await internal('/inner/job/status/' + second.executeNo);
    check('执行服务保存SKIPPED状态且没有完成首个任务', skipState?.executeStatus === 'SKIPPED' && ownLog(first.executeNo)?.status === 'RUNNING' && messages().length === 0);
    evidence.skipped = true;
    const releaseAt = Date.now(); await lock.release();
    const finished = await waitFor(() => ownLog(first.executeNo), item => item && item.status !== 'RUNNING', 'Long task did not report its final result');
    const expiring = candidates.filter(item => item.target === 'EXPIRING').length; const expired = candidates.length - expiring;
    check('解除等待后实际回报成功及准确条数摘要耗时', finished.status === 'SUCCESS' && finished.affected === candidates.length
      && finished.message === '员工合同到期扫描完成：即将到期' + expiring + '份，已到期' + expired + '份' && finished.report && finished.end && finished.duration >= 10000);
    const finalStatus = await internal('/inner/job/status/' + first.executeNo);
    check('反查结果与持久日志一致', finalStatus?.executeStatus === 'SUCCESS' && finalStatus.affectedRows === finished.affected && finalStatus.resultMsg === finished.message && finalStatus.durationMs === finished.duration);
    const delivered = await waitFor(messages, items => items.length === 1 && items[0].status === 'SUCCESS', 'Long contract task message not delivered');
    check('完成后实际合同变更且员工仅收到一条站内提醒', database('SELECT status FROM hr_employee_contract WHERE id=' + contractId + ';') === 'EXPIRING'
      && delivered[0].receiver === owner.id && delivered[0].channel === 'INTERNAL');
    successful(await api(employee, '/auth/system/message/mine/' + delivered[0].id), '员工读取长任务完成后提醒');
    evidence.report = true; evidence.delivery = true;
    const replay = await internal('/inner/job/execute', 'POST', { jobId: 106, executeNo: first.executeNo, handlerName: original.handlerName,
      handlerParam: original.handlerParam, timeoutSeconds: original.timeoutSeconds, lockTimeSeconds: original.lockTimeSeconds, concurrentFlag: 0 });
    check('相同执行编号真实重投被识别且保留已有终态', replay?.accepted === true && (await internal('/inner/job/status/' + first.executeNo))?.executeStatus === 'SUCCESS');
    const peerReplay = await peerInternal('/inner/job/execute', 'POST', peerRequest(first.executeNo));
    const peerFinal = await peerInternal('/inner/job/status/' + first.executeNo);
    check('完成后在另一个实例重投仍保持原结果且无重复提醒', peerReplay.accepted === true && peerFinal?.executeStatus === 'SUCCESS'
      && peerFinal.affectedRows === finished.affected && peerFinal.durationMs === finished.duration && messages().length === 1);
    const next = await trigger(); check('长任务完成后原任务可重新受理', next.accepted === true);
    const nextLog = await waitFor(() => ownLog(next.executeNo), item => item && item.status !== 'RUNNING', 'Subsequent real task did not complete');
    check('后续扫描零条且没有重复提醒或覆盖跳过日志', nextLog.status === 'SUCCESS' && nextLog.affected === 0 && messages().length === 1 && ownLog(second.executeNo)?.status === 'SKIPPED');
    evidence.deduplication = true;
    const detail = successful(await api(admin, root + '/log/' + skipped.id), '读取真实并发跳过日志');
    check('管理详情能读取真实跳过结果', detail.executeStatus === 'SKIPPED' && detail.executeNo === second.executeNo);
    const denied = await api(employee, root + '/log/' + skipped.id);
    check('普通员工不能读取并发执行日志', denied.status === 403 && !denied.body?.data); evidence.permissions = true;
    database('INSERT INTO hr_employee_contract(tenant_id,employee_id,contract_type,contract_no,sign_date,start_date,end_date,status,deleted,create_by) VALUES(100000,' + employeeId
      + ",'LABOR'," + sql(marker + 'P') + ",CURRENT_DATE,CURRENT_DATE,DATE_ADD(CURRENT_DATE,INTERVAL 12 DAY),'ACTIVE',0," + sql(marker) + ');');
    peerContractId = database('SELECT id FROM hr_employee_contract WHERE tenant_id=100000 AND contract_no=' + sql(marker + 'P') + ';');
    assert.match(peerContractId, /^[1-9][0-9]*$/);
    peerExecuteNo = randomUUID();
    const independent = await peerInternal('/inner/job/execute', 'POST', peerRequest(peerExecuteNo));
    check('第二实例在共享锁释放后可实际受理新任务', independent.accepted === true);
    const independentResult = await waitFor(() => peerInternal('/inner/job/status/' + peerExecuteNo), value => value && value.executeStatus !== 'RUNNING', 'Peer did not complete its own real contract');
    const peerMessages = () => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='HR_CONTRACT_EXPIRING' AND biz_id=" + sql(peerContractId) + ' ORDER BY record_id;');
    const peerDelivery = await waitFor(peerMessages, items => items.length === 1 && items[0].status === 'SUCCESS', 'Peer contract reminder not delivered');
    check('第二实例实际处理新合同一份并仅发送一条真实提醒', independentResult.executeStatus === 'SUCCESS' && independentResult.affectedRows === 1
      && database('SELECT status FROM hr_employee_contract WHERE id=' + peerContractId + ';') === 'EXPIRING'
      && peerDelivery[0].receiver === owner.id && peerDelivery[0].channel === 'INTERNAL' && messages().length === 1);
    successful(await api(employee, '/auth/system/message/mine/' + peerDelivery[0].id), '员工读取第二实例实际生成的提醒');
    evidence.peerBusiness = true;
    console.log('A3_PEER_TIMING: ' + JSON.stringify({ first_accept_ms: first.elapsed, second_skip_ms: second.elapsed,
      held_after_dispatch_ms: releaseAt - first.started, real_duration_ms: finished.duration, affected: finished.affected,
      observed_mysql_wait: true, real_manual_dispatch: true, real_signed_status: true, forced_final_state: false }));
  } catch (error) { failure = error; }
  finally {
    let cleanupFailure;
    try { if (lock) await lock.release(); } catch (error) { cleanupFailure = error; }
    try {
      if (first?.accepted) await waitFor(() => ownLog(first.executeNo), item => item && item.status !== 'RUNNING', 'In-flight owned task did not finish during restoration', 60000);
      if (peerExecuteNo) await waitFor(() => peerInternal('/inner/job/status/' + peerExecuteNo), value => value && value.executeStatus !== 'RUNNING', 'Direct peer execution still running at cleanup');
      if (peerContractId) database('UPDATE hr_employee_contract SET deleted=1 WHERE id=' + peerContractId + ' AND create_by=' + sql(marker) + ';');
      if (contractId) database('UPDATE hr_employee_contract SET deleted=1 WHERE id=' + contractId + ' AND create_by=' + sql(marker) + ';');
      if (createdEmployee) database('UPDATE hr_employee SET deleted=1 WHERE id=' + employeeId + ' AND employee_no=' + sql(marker) + ';');
      check('原任务配置与授权保持且测试合同收尾停用', configuration() === oldConfiguration && grants() === oldGrants
        && (!contractId || database('SELECT deleted FROM hr_employee_contract WHERE id=' + contractId + ';') === '1'));
      check('自有数据库锁连接已关闭', !lock?.connection || database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID=' + lock.connection + ';') === '0');
      evidence.restoration = true;
      console.log('A3_PEER_RESTORED: original_jobs=true; grants=true; lock_connection_closed=true; new_contract_deleted=true; business_messages_and_audit_retained=true');
    } catch (error) { cleanupFailure ||= error; }
    failure ||= cleanupFailure;
    try {
      const manifest = await fs.readFile(peerFile, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, ''))).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (peerExecuteNo || first?.accepted) {
        await waitFor(() => redis('EXISTS', 'cloudflow:job:lock:hr-employee-contract-expire-job'), value => value === '0', 'Real execution must release the shared lock before stopping the peer', 30000);
        check('停止副本前共享业务锁已由实际执行器释放', true);
      }
      if (manifest && manifest.status !== 'STOPPED') await operatePeer('Stop');
      const stopped = manifest && JSON.parse((await fs.readFile(peerFile, 'utf8')).replace(/^\uFEFF/, ''));
      check('第二实例已停止且原人事进程和配置保持', stopped?.status === 'STOPPED');
      check('第二实例新合同已停用且实际消息保留', !peerContractId || database('SELECT deleted FROM hr_employee_contract WHERE id=' + peerContractId + ';') === '1');
      evidence.peerRestoration = true;
    } catch (error) { failure ||= error; }
    try {
      const capacity = await fs.readFile(capacityFile, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, ''))).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (capacity && capacity.status !== 'RESTORED') {
        const peerState = await fs.readFile(peerFile, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, ''))).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        assert.ok(!peerState || peerState.status === 'STOPPED', 'Stop the owned peer before restoring support services');
        await operatePeer('Restore');
      }
      const restored = !capacity || JSON.parse((await fs.readFile(capacityFile, 'utf8')).replace(/^\uFEFF/, '')).status === 'RESTORED';
      check('释放验证副本后已按原配置恢复全部支持服务', restored); evidence.capacityRestoration = true;
    } catch (error) { failure ||= error; }
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const item of state.services) {
    const directory = path.join(state.run, item.name);
    for (const name of await fs.readdir(directory)) {
      const filename = path.join(directory, name);
      if (/^(stdout|stderr)-before-.*\.log$/.test(name) && !priorBackups.has(filename)) {
        const scan = await scanSecretStream(createReadStream(filename), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
      }
    }
    const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const filename of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(directory, filename)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const peerLogNames = await fs.readdir(path.join(peerDirectory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const peerFiles = [...helperLogs, ...['stdout.log', 'stderr.log'].map(name => path.join(peerDirectory, name)),
    ...peerLogNames.filter(name => name.endsWith('.log')).map(name => path.join(peerDirectory, 'logs', name))];
  for (const name of await fs.readdir(path.dirname(capacityFile))) {
    if (name.startsWith(path.basename(capacityFile) + '.') && name.endsWith('.log')) peerFiles.push(path.join(path.dirname(capacityFile), name));
  }
  for (const filename of peerFiles) {
    if (!(await fs.stat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; }))) continue;
    const scan = await scanSecretStream(createReadStream(filename), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('长任务和并发验证服务及审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`A3_PEER_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log(`A3_PEER_SCOPE: original_job=106; internal_requests=${internalRequests}; real_mysql_row_lock=${evidence.async}; real_redis_lock=${evidence.peerLock}; real_dispatch_execution_report=${evidence.report}; real_two_hr_processes=${evidence.instances}; peer_direct_protocol=true; peer_direct_execution_has_no_admin_log=true; dual_scheduler_not_verified=true; production_modified=false`);
  if (failure) throw failure;
}
