import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { observeA3SchedulerRedis } from './observe-a3-scheduler-redis.mjs';

export async function verifyA3JobPrimaryFault({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const recoveryMarker = process.argv.find(value => value.startsWith('--a3-primary-recover='))?.split('=')[1];
  if (recoveryMarker) { assert.match(recoveryMarker, /^[a-f0-9]{12}$/); caseTag = recoveryMarker; evidence.recoveryOnly = true; }
  const marker = 'a3_primary_' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accept, label, milliseconds = 30000) => {
    const deadline = Date.now() + milliseconds;
    do { const value = await read(); if (accept(value)) return value; await sleep(200); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const keys = await readOwnedJobKeys(state);
  const redis = await ownedGatewayRedis(state);
  const secrets = new Set([...accounts.map(item => item.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const root = '/auth/system/job';
  const peerDirectory = path.join(state.run, 'private', 'a3-peer-auth-' + caseTag);
  const peerFile = path.join(peerDirectory, 'peer.json');
  const capacityFile = path.join(state.run, 'private', 'a3-peer-capacity-' + caseTag + '.json');
  const observationFile = path.join(state.run, 'a3-primary-' + caseTag + '-redis.json');
  const faultDirectory = path.join(state.run, 'private', 'a3-primary-' + caseTag);
  const faultFile = path.join(faultDirectory, 'fault.json');
  const signedResults = new Map();
  const firedClaims = new Map();
  let collect = false; let collection; let collectionFailure;
  const baseProcesses = [state.processes.find(item => item.name === 'auth').id];
  const helperLogs = []; let connectionsIndex = 0;
  const ports = { base: new Set(), peer: new Set() };
  let peer; const peerProcesses = []; let jobId; let observer; let failure; let internalRequests = 0;
  const readManifest = filename => fs.readFile(filename, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, '')))
    .catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const operate = async action => {
    const suffix = (recoveryMarker ? 'recovery-' : '') + action + (++connectionsIndex);
    const out = path.join(state.run, 'private', 'a3-peer-auth-' + caseTag + '-' + suffix + '.stdout.log');
    const err = out.replace('.stdout.log', '.stderr.log');
    const output = await fs.open(out, 'wx'); const errors = await fs.open(err, 'wx'); helperLogs.push(out, err);
    let code;
    try {
      const capacity = ['Reserve', 'Restore'].includes(action);
      const primary = ['Route', 'StopBase', 'Connections', 'RestoreBase', 'RestoreRoutes'].includes(action);
      const args = ['-NoLogo', '-NoProfile', '-File', capacity ? 'scripts/operate-a3-peer-capacity.ps1' : primary ? 'scripts/operate-a3-primary-fault.ps1' : 'scripts/operate-a3-job-peer.ps1',
        '-StatePath', path.join(state.run, 'state.json'), '-Action', action, '-Marker', caseTag];
      if (!capacity && !primary) args.push('-ServiceName', 'auth');
      if (action === 'Prepare') args.push('-DiscoverAuth');
      if (action === 'Route') args.push('-JobId', String(jobId));
      code = await new Promise((resolve, reject) => {
        const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe', args, { windowsHide: true, stdio: ['ignore', output.fd, errors.fd] });
        child.once('error', reject); child.once('exit', resolve);
      });
    } finally { await output.close(); await errors.close(); }
    assert.equal(code, 0, 'Owned scheduler ' + action + ' failed; inspect retained diagnostics');
    const lines = (await fs.readFile(out, 'utf8')).split(/\r?\n/).filter(line => /^(A3_PEER_|A3_CAPACITY_|A3_PRIMARY_)/.test(line));
    assert.equal(lines.length, 1);
    if (action === 'Connections') {
      const current = JSON.parse(lines[0].slice('A3_PRIMARY_CONNECTIONS: '.length));
      if (current.baseProcess) assert.ok(baseProcesses.includes(current.baseProcess));
      assert.equal(current.peerProcess, peer.processId);
      for (const name of ['base', 'peer']) for (const port of current[name + 'Ports']) ports[name].add(port);
      assert.ok([...ports.base].every(port => !ports.peer.has(port)), 'Redis client port ownership must be distinct');
      return;
    }
    console.log(lines[0]);
  };
  const config = () => database("SELECT tenant_id,job_id,job_name,job_group,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY tenant_id,job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalConfig = config(); const originalGrants = grants();
  const contractMessages = () => database("SELECT COUNT(*) FROM sys_message_record WHERE biz_type IN ('HR_CONTRACT_EXPIRING','HR_CONTRACT_EXPIRED');");
  const initialMessages = contractMessages();
  const enabledJobs = rows("SELECT JSON_OBJECT('service',service_name,'handler',handler_name) FROM sys_job WHERE deleted=0 AND status='ENABLED' ORDER BY handler_name;");
  assert.deepEqual(enabledJobs, ['imCallbackRecovery', 'imSyncRecovery', 'imTodoRecovery'].map(handler => ({ service: 'auth', handler })), 'Only the three original IM recovery schedules may remain enabled');
  const settleOtherWork = async phase => {
    const deadline = Date.now() + 270000;
    let announced = false;
    do {
      const pending = rows("SELECT JSON_OBJECT('executeNo',l.execute_no,'jobId',CAST(l.job_id AS CHAR),'handler',j.handler_name,'due',IF(DATE_ADD(l.start_time,INTERVAL j.timeout_seconds SECOND)<NOW(),1,0)) FROM sys_job_log l JOIN sys_job j ON j.job_id=l.job_id WHERE l.execute_status='RUNNING';")
        .filter(row => row.jobId !== jobId);
      if (!pending.length) return;
      assert.ok(pending.every(row => enabledJobs.some(job => job.handler === row.handler)), 'Unexpected pending work must be reviewed');
      if (!announced) { console.log('A3_PRIMARY_OTHER_WORK_WAIT: ' + JSON.stringify({ phase, pending: pending.map(row => row.executeNo), originalTimeoutsPreserved: true })); announced = true; }
      const overdue = pending.filter(row => row.due === 1);
      if (overdue.length) {
        const accepted = successful(await api(admin, root + '/125/trigger', { method: 'POST', body: {} }), '管理员实际巡检遗留执行记录');
        assert.equal(accepted.accepted, true);
        const result = await waitFor(() => database('SELECT execute_status FROM sys_job_log WHERE job_id=125 AND execute_no=' + sql(accepted.executeNo) + ';'), value => value && value !== 'RUNNING', 'Original result inspector did not finish');
        check(phase + '由原125实际完成遗留任务结果巡检', result === 'SUCCESS');
        const resolved = await waitFor(() => rows("SELECT JSON_OBJECT('executeNo',execute_no,'status',execute_status,'message',result_msg) FROM sys_job_log WHERE execute_no IN ("
          + overdue.map(row => sql(row.executeNo)).join(',') + ');'), values => values.length === overdue.length && values.every(row => row.status !== 'RUNNING'), 'Original pending results did not resolve');
        console.log('A3_PRIMARY_OTHER_WORK_RESOLVED: ' + JSON.stringify({ phase, originalInspector: 125, results: resolved, forcedTerminalWrites: 0 }));
      }
      await sleep(500);
    } while (Date.now() < deadline);
    throw new Error('Other actual work did not settle within its unchanged timeout allowance');
  };
  await settleOtherWork('准备前');
  assert.equal(database("SELECT COUNT(*) FROM hr_employee_contract c JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND ((c.end_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY) AND c.status IN ('ACTIVE','EFFECTIVE')) OR (c.end_date<CURRENT_DATE AND c.status NOT IN ('EXPIRED','TERMINATED')));"), '0', 'No unrelated pending contract work permitted');
  const original = successful(await api(admin, root + '/106'), '读取已验证的合同处理器配置');
  assert.equal(original.handlerName, 'employeeContractExpire'); assert.equal(original.status, 'PAUSED');
  const payload = { ...original, jobId: undefined, jobName: marker, jobGroup: 'A3_VERIFY', handlerParam: marker, triggerType: 'CRON',
    cronExpression: '*/3 * * * * *', intervalMs: 3000, status: 'PAUSED', concurrentFlag: 0, misfireStrategy: 'IGNORE',
    retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 0, dispatchRetryIntervalSec: 1, timeoutSeconds: 30, lockTimeSeconds: 30,
    criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 0, alarmReceiver: '', remark: marker };
  const logRows = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'trigger',trigger_type,'actor',trigger_by,'affected',affected_rows,'message',result_msg,'duration',duration_ms,'report',report_time,'startMs',UNIX_TIMESTAMP(start_time)*1000,'endMs',UNIX_TIMESTAMP(end_time)*1000) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + jobId + ' ORDER BY log_id;');
  const toggle = status => api(admin, root + '/' + jobId + '/toggle', { method: 'PUT', body: { status, confirmCritical: true } }).then(value => successful(value, '实际切换原调度停机验证任务状态'));
  const ownerOf = event => ports.base.has(event.port) ? 'base' : ports.peer.has(event.port) ? 'peer' : 'unknown';
  const sharedWindows = (since, interval) => {
    const groups = new Map();
    for (const event of observer.events.filter(item => item.at >= since && item.window !== 'FIXED_DELAY')) {
      const time = Number(event.window); if (time < since || time % interval !== 0) continue;
      if (!groups.has(event.window)) groups.set(event.window, new Set());
      groups.get(event.window).add(ownerOf(event));
    }
    return [...groups].filter(([, owners]) => owners.has('base') && owners.has('peer')).map(([window]) => window).sort();
  };
  const completedWindows = async (since, interval, count, label) => {
    await operate('Connections');
    await waitFor(() => sharedWindows(since, interval), values => values.length >= count, label + ' did not involve both scheduler processes', 25000);
    await operate('Connections'); observer.assertHealthy();
    const windows = sharedWindows(since, interval).slice(0, count);
    const executions = windows.map(window => ({ window, executeNo: redis('GET', 'cloudflow:job:dispatch-fired:' + jobId + ':' + window) }));
    assert.ok(executions.every(item => /^[a-f0-9-]{36}$/.test(item.executeNo)), 'Each real firing window must have a Redis claim');
    const logs = await waitFor(logRows, values => executions.every(item => values.some(row => row.executeNo === item.executeNo && row.status === 'SUCCESS')), label + ' did not complete all claimed windows');
    for (const item of executions) {
      const matching = logs.filter(row => row.executeNo === item.executeNo);
      assert.equal(matching.length, 1);
      assert.ok(matching[0].affected === 0 && matching[0].trigger === 'CRON' && !matching[0].actor && matching[0].report);
      assert.equal(logs.filter(row => row.startMs >= Number(item.window) && row.startMs < Number(item.window) + interval).length, 1, 'Exactly one actual execution per observed firing interval');
    }
    check(label + '两进程争取同一计划时刻且每个时刻仅一条成功执行', windows.length >= count && new Set(executions.map(item => item.executeNo)).size === count);
    console.log('A3_PRIMARY_WINDOWS: ' + JSON.stringify({ phase: label, interval_ms: interval, windows, executeNos: executions.map(item => item.executeNo), real_processes: 2 }));
    await captureResults();
    return executions;
  };
  const pauseAndObserve = async label => {
    await toggle('PAUSED');
    await sleep(11000);
    await waitFor(logRows, values => values.every(item => item.status !== 'RUNNING'), 'Paused dual-scheduler executions did not finish');
    const baseline = logRows().length; const since = Date.now(); await sleep(7000); observer.assertHealthy();
    check(label + '暂停传播后两个实例均无新增派发或执行', logRows().length === baseline && !observer.events.some(item => item.at >= since));
  };

  const captureResults = async () => {
    for (const row of logRows()) {
      if (row.status !== 'SUCCESS' || signedResults.has(row.executeNo)) continue;
      const target = '/inner/job/status/' + row.executeNo;
      const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-hr', 'GET', target, '');
      secrets.add(headers['X-Job-Signature']);
      const response = await fetch('http://127.0.0.1:' + state.services.find(item => item.name === 'hr').port + target,
        { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
      internalRequests++;
      const value = await response.json();
      assert.ok(response.status === 200 && value.code === 200 && value.data?.executeStatus === 'SUCCESS', 'Actual signed HR state must be captured before expiry');
      assert.equal(value.data.affectedRows, row.affected);
      assert.equal(value.data.resultMsg, row.message);
      assert.equal(value.data.durationMs, row.duration);
      const claims = await waitFor(() => observer.events.filter(event => event.command === 'SET' && event.executeNo === row.executeNo), values => values.length > 0,
        'Actual dispatch claim was not observed', 5000);
      assert.equal(claims.length, 1);
      assert.equal(redis('GET', 'cloudflow:job:dispatch-fired:' + jobId + ':' + claims[0].window), row.executeNo);
      firedClaims.set(row.executeNo, { window: claims[0].window, capturedAt: Date.now(), executeNo: row.executeNo });
      signedResults.set(row.executeNo, { ...value.data, capturedAt: Date.now() });
    }
  };
  const reconcilePending = async label => {
    const pending = logRows().filter(row => row.status === 'RUNNING');
    if (!pending.length) return;
    await waitFor(() => database('SELECT COUNT(*) FROM sys_job_log WHERE job_id=' + jobId
      + " AND execute_status='RUNNING' AND DATE_ADD(start_time,INTERVAL 31 SECOND)>NOW();"), count => count === '0',
    'Actual inspection threshold did not arrive', 40000);
    const accepted = successful(await api(admin, root + '/125/trigger', { method: 'POST', body: {} }), '实际触发原125结果巡检');
    assert.equal(accepted.accepted, true);
    const result = await waitFor(() => rows("SELECT JSON_OBJECT('status',execute_status,'actor',trigger_by,'trigger',trigger_type) FROM sys_job_log WHERE job_id=125 AND execute_no="
      + sql(accepted.executeNo) + ';')[0], row => row && row.status !== 'RUNNING', 'Real result inspector did not finish');
    check(label + '实际巡检通过服务发现完成并保留管理员身份', result.status === 'SUCCESS' && result.actor === 'g_import_admin' && result.trigger === 'MANUAL');
    await waitFor(logRows, values => pending.every(item => values.find(row => row.executeNo === item.executeNo)?.status === 'SUCCESS'), 'Actual lost reports did not recover');
    await captureResults();
    console.log('A3_PRIMARY_RECOVERY: ' + JSON.stringify({ actualInspector: 125, executeNos: pending.map(item => item.executeNo), forcedTerminalWrites: 0 }));
  };

  try {
    if (recoveryMarker) {
      const fault = await readManifest(faultFile);
      assert.ok(fault && fault.statePath === path.join(state.run, 'state.json'));
      jobId = String(fault.jobId); peer = await readManifest(peerFile);
      assert.equal(peer.status, 'STOPPED');
      assert.equal(database('SELECT status FROM sys_job WHERE job_id=' + jobId + ' AND job_name=' + sql(marker) + ';'), 'PAUSED');
      check('仅收尾原停机验证任务且副本已停止', true);
      console.log('A3_PRIMARY_RECOVERY_TARGET: ' + JSON.stringify({ marker: caseTag, jobId, newFaultInjection: false }));
    } else {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE service_name='hr' AND handler_name='employeeContractExpire' AND LEFT(handler_param,100)=" + sql(marker) + ';'), '0');
    successful(await api(admin, root, { method: 'POST', body: payload }), '建立独立暂停主调度停机验证任务');
    jobId = database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=' + sql(marker) + ' AND deleted=0;');
    assert.match(jobId, /^[1-9][0-9]*$/);
    await operate('Reserve'); await operate('Prepare'); await operate('Start');
    peer = await readManifest(peerFile); peerProcesses.push(peer.processId);
    check('两个独立真实调度应用共享原数据库和Redis', peer.status === 'RUNNING' && peer.discoverAuth && peer.processId !== baseProcesses[0]);
    evidence.instances = true;
    await operate('Route');
    check('人事和网关已重启并使用固定双地址原生健康选择', (await readManifest(faultFile)).status === 'ROUTED');
    evidence.route = true;
    await waitFor(() => api(admin, root + '/106'), response => response.status === 200 && response.body?.code === 200,
      'Native health selection did not make the real gateway ready', 15000);
    for (let index = 0; index < 4; index++) {
      successful(await api(admin, root + '/106'), '双地址健康选择就绪后连续读取原任务');
      await sleep(250);
    }
    check('网关探活完成后连续四次真实管理读取成功', true);
    observer = await observeA3SchedulerRedis(state, jobId, secrets, { claims: true });
    collect = true;
    collection = (async () => {
      while (collect) {
        await captureResults();
        await sleep(500);
      }
    })().catch(error => { collectionFailure = error; });
    const winningClaims = since => {
      const actual = new Set(logRows().filter(row => row.status === 'SUCCESS').map(row => row.executeNo));
      return observer.events.filter(event => event.command === 'SET' && event.at >= since && actual.has(event.executeNo));
    };
    const started = Date.now(); await toggle('ENABLED');
    await completedWindows(started, 3000, 4, '主调度停机前');
    const claimed = await waitFor(async () => {
      await operate('Connections');
      return winningClaims(started).filter(event => ownerOf(event) === 'base');
    }, values => values.length > 0, 'Original auth must really dispatch before its outage', 60000);
    check('原调度实际派发成功且执行编号与共享占位一致', claimed.every(event =>
      redis('GET', 'cloudflow:job:dispatch-fired:' + jobId + ':' + event.window) === event.executeNo));
    evidence.dispatchOwnership = true;
    await operate('StopBase'); const stoppedAt = Date.now();
    await operate('Connections');
    let refused = false;
    try { await fetch('http://127.0.0.1:' + state.services.find(item => item.name === 'auth').port + '/legal/public/active', { signal: AbortSignal.timeout(4000) }); }
    catch (error) { refused = error.cause?.code === 'ECONNREFUSED'; }
    check('原调度进程和端口真实停止且新任务仍启用', refused && (await readManifest(faultFile)).status === 'STOPPED'
      && database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'ENABLED');
    evidence.stopped = true;
    // Allow one two-second native health interval, then require every following due window.
    const firstWindow = Math.ceil((stoppedAt + 3000) / 3000) * 3000;
    const required = Array.from({ length: 4 }, (_, index) => String(firstWindow + index * 3000));
    const survived = await waitFor(() => winningClaims(stoppedAt), values =>
      required.every(window => values.some(event => event.window === window)), 'Surviving auth must complete four consecutive due windows through native report discovery', 25000);
    await operate('Connections'); observer.assertHealthy();
    for (const window of required) {
      const claims = survived.filter(event => event.window === window);
      assert.equal(claims.length, 1); assert.equal(ownerOf(claims[0]), 'peer');
      assert.equal(redis('GET', 'cloudflow:job:dispatch-fired:' + jobId + ':' + window), claims[0].executeNo);
      const matching = logRows().filter(row => row.executeNo === claims[0].executeNo);
      assert.equal(matching.length, 1); assert.equal(matching[0].status, 'SUCCESS');
      assert.ok(matching[0].report && matching[0].affected === 0);
      assert.equal(logRows().filter(row => row.startMs >= Number(window) && row.startMs < Number(window) + 3000).length, 1);
    }
    await captureResults();
    check('固定双地址下副本连续四个计划时刻派发且真实人事回报成功', true); evidence.continuation = true;
    for (let index = 0; index < 8; index++) {
      const page = successful(await api(admin, root + '/log?jobId=' + jobId + '&pageNum=1&pageSize=100'), '原调度停机期间网关管理查询');
      assert.ok(required.every(window => page.rows.some(row => row.executeNo === survived.find(event => event.window === window).executeNo && row.executeStatus === 'SUCCESS')));
      await sleep(250);
    }
    check('原调度停机期间网关连续八次管理查询及回报结果准确', true); evidence.management = true;
    const denied = await api(employee, root + '/log?jobId=' + jobId);
    check('原调度停机期间普通员工仍无权读取后台任务日志', denied.status === 403 && !denied.body?.data);
    evidence.permissions = true;
    await reconcilePending('原调度停机期间');
    console.log('A3_PRIMARY_OUTAGE: ' + JSON.stringify({ stoppedProcess: baseProcesses[0], stoppedAt, survivingProcess: peer.processId,
      windows: required, executeNos: required.map(window => survived.find(event => event.window === window).executeNo), fixedDiscoveryAddresses: true, manualRouteChangesAfterStop: 0 }));
    await operate('RestoreBase');
    const restoredState = await readManifest(path.join(state.run, 'state.json'));
    const restoredBase = restoredState.processes.find(item => item.name === 'auth').id;
    assert.notEqual(restoredBase, baseProcesses[0]); baseProcesses.push(restoredBase);
    check('原调度以原配置恢复为新进程且保持双地址选择', (await readManifest(faultFile)).status === 'BASE_RESTORED'); evidence.restarted = true;
    const rejoinedAt = Date.now();
    await completedWindows(rejoinedAt, 3000, 4, '原调度自动重加入');
    check('恢复原调度后无需再次启用即自动参加共同计划竞争', database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'ENABLED');
    evidence.rejoin = true;
    await reconcilePending('恢复原调度后');
    await pauseAndObserve('完整恢复前'); evidence.pause = true;
    collect = false; await collection; if (collectionFailure) throw collectionFailure;
    await captureResults();
    const all = logRows();
    check('全部日志成功且真实反查结果完整一致并无重复消息', all.length >= 12 && all.every(item =>
      item.status === 'SUCCESS' && item.affected === 0 && item.report && signedResults.has(item.executeNo)) && contractMessages() === initialMessages);
    for (const row of all) {
      const claims = observer.events.filter(event => event.command === 'SET' && event.executeNo === row.executeNo);
      assert.equal(claims.length, 1);
      assert.notEqual(ownerOf(claims[0]), 'unknown');
      assert.equal(firedClaims.get(row.executeNo)?.executeNo, row.executeNo);
      assert.equal(firedClaims.get(row.executeNo)?.window, claims[0].window);
    }
    evidence.logs = true;
    }
  } catch (error) { failure = error; }
  finally {
    try {
      const fault = await readManifest(faultFile);
      if (fault && ['STOPPING', 'STOPPED', 'BASE_RESTORING'].includes(fault.status)) {
        await operate('RestoreBase');
        const current = await readManifest(path.join(state.run, 'state.json'));
        const processId = current.processes.find(item => item.name === 'auth').id;
        if (!baseProcesses.includes(processId)) baseProcesses.push(processId);
      }
      if (jobId) {
        if (database('SELECT status FROM sys_job WHERE job_id=' + jobId + ' AND job_name=' + sql(marker) + ';') !== 'PAUSED') {
          await toggle('PAUSED'); await sleep(11000);
        }
        await reconcilePending('异常收尾');
        await waitFor(logRows, values => values.every(item => item.status !== 'RUNNING'), 'Finish actual task work before restoring routes');
        await waitFor(() => redis('EXISTS', 'cloudflow:job:lock:hr-employee-contract-expire-job'), value => value === '0', 'HR must release its business lock');
      }
      await settleOtherWork('收尾');
      check('原任务及授权保持且本轮任务已暂停', config() === originalConfig && grants() === originalGrants
        && (!jobId || database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'PAUSED'));
      evidence.restoration = true;
    } catch (error) { failure ||= error; }
    collect = false;
    if (collection) await collection;
    failure ||= collectionFailure;
    try {
      if (observer) {
        observer.assertHealthy(); await observer.close();
        await fs.writeFile(observationFile, JSON.stringify({ jobId, baseProcesses, peerProcesses, firedClaims: [...firedClaims.values()], signedResults: [...signedResults].map(([executeNo, value]) => ({ executeNo, ...value })),
          events: observer.events.map(item => ({ ...item, owner: ownerOf(item) })) }, null, 2), { flag: 'wx' });
      }
    } catch (error) { failure ||= error; if (observer) await observer.close(); }
    try {
      const fault = await readManifest(faultFile);
      if (fault && fault.status !== 'RESTORED') await operate('RestoreRoutes');
      check('人事和网关原配置及原调度服务完整恢复', !fault || (await readManifest(faultFile)).status === 'RESTORED'); evidence.runtimeRestoration = true;
    } catch (error) { failure ||= error; }
    try {
      const manifest = await readManifest(peerFile);
      if (manifest && manifest.status !== 'STOPPED') await operate('Stop');
      check('副本已按进程身份停止且原调度健康', !manifest || (await readManifest(peerFile)).status === 'STOPPED'); evidence.peerRestoration = true;
    } catch (error) { failure ||= error; }
    try {
      const capacity = await readManifest(capacityFile);
      if (capacity && capacity.status !== 'RESTORED') {
        const manifest = await readManifest(peerFile); assert.ok(!manifest || manifest.status === 'STOPPED');
        await operate('Restore');
      }
      check('容量恢复且原九进程和六服务健康', !capacity || (await readManifest(capacityFile)).status === 'RESTORED'); evidence.capacityRestoration = true;
    } catch (error) { failure ||= error; }
  }
  const filesToScan = [...helperLogs, observationFile];
  for (const directory of [...state.services.map(item => path.join(state.run, item.name)), peerDirectory, faultDirectory]) {
    for (const sub of ['', 'logs']) {
      const folder = path.join(directory, sub);
      const names = await fs.readdir(folder).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      for (const name of names) if (name.endsWith('.log')) filesToScan.push(path.join(folder, name));
    }
  }
  for (const name of await fs.readdir(path.dirname(capacityFile))) if (name.startsWith(path.basename(capacityFile) + '.') && name.endsWith('.log')) filesToScan.push(path.join(path.dirname(capacityFile), name));
  let files = 0; let bytes = 0; let leaks = 0;
  for (const filename of new Set(filesToScan)) {
    if (!(await fs.stat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; }))) continue;
    const scan = await scanSecretStream(createReadStream(filename), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('双调度验证及真实服务和审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`A3_PRIMARY_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log(`A3_PRIMARY_SCOPE: internal_requests=${internalRequests}; two_auth_processes=${evidence.instances}; actual_primary_outage=${evidence.stopped}; native_gateway_and_report_failover=${evidence.management && evidence.continuation}; automatic_rejoin=${evidence.rejoin}; fixed_local_discovery=true; nacos_heartbeat_verified=false; raw_monitor_retained=false; forced_database_terminal_states=0; production_modified=false`);
  if (failure) throw failure;
}
