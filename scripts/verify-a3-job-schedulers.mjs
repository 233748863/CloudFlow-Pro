import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { observeA3SchedulerRedis } from './observe-a3-scheduler-redis.mjs';

export async function verifyA3JobSchedulers({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'a3_schedulers_' + caseTag;
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
  const observationFile = path.join(state.run, 'a3-schedulers-' + caseTag + '-redis.json');
  const helperLogs = []; let connectionsIndex = 0;
  const ports = { base: new Set(), peer: new Set() };
  let peer; let jobId; let observer; let failure; let internalRequests = 0;
  const readManifest = filename => fs.readFile(filename, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, '')))
    .catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const operate = async action => {
    const suffix = action === 'Connections' ? action + (++connectionsIndex) : action;
    const out = path.join(state.run, 'private', 'a3-peer-auth-' + caseTag + '-' + suffix + '.stdout.log');
    const err = out.replace('.stdout.log', '.stderr.log');
    const output = await fs.open(out, 'wx'); const errors = await fs.open(err, 'wx'); helperLogs.push(out, err);
    let code;
    try {
      const capacity = ['Reserve', 'Restore'].includes(action);
      const args = ['-NoLogo', '-NoProfile', '-File', capacity ? 'scripts/operate-a3-peer-capacity.ps1' : 'scripts/operate-a3-job-peer.ps1',
        '-StatePath', path.join(state.run, 'state.json'), '-Action', action, '-Marker', caseTag];
      if (!capacity) args.push('-ServiceName', 'auth');
      code = await new Promise((resolve, reject) => {
        const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe', args, { windowsHide: true, stdio: ['ignore', output.fd, errors.fd] });
        child.once('error', reject); child.once('exit', resolve);
      });
    } finally { await output.close(); await errors.close(); }
    assert.equal(code, 0, 'Owned scheduler ' + action + ' failed; inspect retained diagnostics');
    const lines = (await fs.readFile(out, 'utf8')).split(/\r?\n/).filter(line => /^(A3_PEER_|A3_CAPACITY_)/.test(line));
    assert.equal(lines.length, 1);
    if (action === 'Connections') {
      const current = JSON.parse(lines[0].slice('A3_PEER_CONNECTIONS: '.length));
      assert.equal(current.baseProcess, state.processes.find(item => item.name === 'auth').id);
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
  assert.equal(database("SELECT COUNT(*) FROM hr_employee_contract c JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND ((c.end_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY) AND c.status IN ('ACTIVE','EFFECTIVE')) OR (c.end_date<CURRENT_DATE AND c.status NOT IN ('EXPIRED','TERMINATED')));"), '0', 'No unrelated pending contract work permitted');
  const original = successful(await api(admin, root + '/106'), '读取已验证的合同处理器配置');
  assert.equal(original.handlerName, 'employeeContractExpire'); assert.equal(original.status, 'PAUSED');
  const payload = { ...original, jobId: undefined, jobName: marker, jobGroup: 'A3_VERIFY', handlerParam: marker, triggerType: 'CRON',
    cronExpression: '*/3 * * * * *', intervalMs: 3000, status: 'PAUSED', concurrentFlag: 0, misfireStrategy: 'IGNORE',
    retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 0, dispatchRetryIntervalSec: 1, timeoutSeconds: 300, lockTimeSeconds: 30,
    criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 0, alarmReceiver: '', remark: marker };
  const logRows = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'trigger',trigger_type,'actor',trigger_by,'affected',affected_rows,'message',result_msg,'duration',duration_ms,'report',report_time,'startMs',UNIX_TIMESTAMP(start_time)*1000,'endMs',UNIX_TIMESTAMP(end_time)*1000) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + jobId + ' ORDER BY log_id;');
  const toggle = status => api(admin, root + '/' + jobId + '/toggle', { method: 'PUT', body: { status, confirmCritical: true } }).then(value => successful(value, '实际切换双调度任务状态'));
  const edit = async changes => {
    const current = successful(await api(admin, root + '/' + jobId), '读取双调度任务');
    successful(await api(admin, root, { method: 'PUT', body: { ...current, ...changes } }), '实际修改双调度任务');
  };
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
    console.log('A3_SCHEDULER_WINDOWS: ' + JSON.stringify({ phase: label, interval_ms: interval, windows, executeNos: executions.map(item => item.executeNo), real_processes: 2 }));
    return executions;
  };
  const pauseAndObserve = async label => {
    await toggle('PAUSED');
    await sleep(11000);
    await waitFor(logRows, values => values.every(item => item.status !== 'RUNNING'), 'Paused dual-scheduler executions did not finish');
    const baseline = logRows().length; const since = Date.now(); await sleep(7000); observer.assertHealthy();
    check(label + '暂停传播后两个实例均无新增派发或执行', logRows().length === baseline && !observer.events.some(item => item.at >= since));
  };
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE service_name='hr' AND handler_name='employeeContractExpire' AND LEFT(handler_param,100)=" + sql(marker) + ';'), '0', 'Each retained verification round requires a distinct task key');
    successful(await api(admin, root, { method: 'POST', body: payload }), '管理员建立双调度验证任务');
    jobId = database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=' + sql(marker) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
    await operate('Reserve'); await operate('Prepare'); await operate('Start'); peer = await readManifest(peerFile);
    check('两个独立真实调度应用健康且共享原数据库和Redis', peer.status === 'RUNNING' && peer.processId !== state.processes.find(item => item.name === 'auth').id);
    evidence.instances = true;
    observer = await observeA3SchedulerRedis(state, jobId, secrets);
    let started = Date.now(); await toggle('ENABLED');
    await completedWindows(started, 3000, 4, '三秒CRON'); evidence.cron = true;
    await pauseAndObserve('CRON'); evidence.pause = true;
    await edit({ triggerType: 'FIXED_RATE', cronExpression: null, intervalMs: 4000 });
    started = Date.now(); await toggle('ENABLED');
    await completedWindows(started, 4000, 3, '四秒固定频率'); evidence.fixedRate = true; evidence.resume = true;
    started = Date.now(); await edit({ intervalMs: 2000 });
    await operate('Connections');
    const changed = await waitFor(() => sharedWindows(started, 2000).filter(value => Number(value) % 4000 !== 0), values => values.length > 0, 'Both schedulers did not adopt live interval change within ten seconds', Math.max(1, 10000 - (Date.now() - started)));
    check('运行中修改间隔后两个调度实例均在十秒内采用新周期', Number(changed[0]) - started <= 10000);
    await completedWindows(started, 2000, 3, '运行中改为两秒'); evidence.liveChange = true;
    await pauseAndObserve('固定频率');
    await edit({ triggerType: 'FIXED_DELAY', intervalMs: 3000 });
    const delayBaseline = logRows().length; started = Date.now(); await toggle('ENABLED');
    const delayRows = (await waitFor(logRows, values => values.slice(delayBaseline).filter(item => item.status === 'SUCCESS').length >= 4, 'Fixed-delay scheduling did not produce four real results', 30000)).slice(delayBaseline);
    await operate('Connections'); observer.assertHealthy();
    const delayEvents = observer.events.filter(item => item.at >= started && item.window === 'FIXED_DELAY');
    check('固定延迟调度由两个实例共同参与共享锁', ['base', 'peer'].every(name => delayEvents.some(item => ownerOf(item) === name)));
    const finished = delayRows.filter(item => item.status === 'SUCCESS');
    check('固定延迟每次完成后三秒才开始下一次且无跳过或失败', delayRows.every(item => ['SUCCESS', 'RUNNING'].includes(item.status))
      && finished.slice(1).every((item, index) => item.startMs - finished[index].endMs >= 3000));
    evidence.fixedDelay = true;
    await pauseAndObserve('固定延迟');
    const all = logRows();
    check('双调度全部实际日志成功且没有重复跳过或业务重复消息', all.length >= 14 && all.every(item => item.status === 'SUCCESS' && item.affected === 0 && item.report)
      && contractMessages() === initialMessages);
    for (const row of all) {
      const target = '/inner/job/status/' + row.executeNo;
      const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-hr', 'GET', target, ''); secrets.add(headers['X-Job-Signature']);
      const response = await fetch('http://127.0.0.1:' + state.services.find(item => item.name === 'hr').port + target,
        { headers, redirect: 'error', signal: AbortSignal.timeout(10000) }); internalRequests++;
      const value = await response.json(); assert.ok(response.status === 200 && value.code === 200 && value.data?.executeStatus === 'SUCCESS' && value.data.affectedRows === 0);
    }
    check('所有调度日志与实际执行服务签名反查一致', true); evidence.logs = true;
    const page = successful(await api(admin, root + '/log?jobId=' + jobId + '&pageNum=1&pageSize=100'), '管理员读取双调度执行日志');
    check('管理员实际查询包含全部双调度结果', all.every(item => page.rows.some(row => row.executeNo === item.executeNo)));
    const denied = await api(employee, root + '/log?jobId=' + jobId);
    check('普通员工无权读取双调度任务日志', denied.status === 403 && !denied.body?.data); evidence.permissions = true;
  } catch (error) { failure = error; }
  finally {
    try {
      if (jobId) {
        if (database('SELECT status FROM sys_job WHERE job_id=' + jobId + ' AND job_name=' + sql(marker) + ';') !== 'PAUSED') await toggle('PAUSED');
        await waitFor(logRows, values => values.every(item => item.status !== 'RUNNING'), 'Finish actual work before stopping scheduler peer');
        await waitFor(() => redis('EXISTS', 'cloudflow:job:lock:hr-employee-contract-expire-job'), value => value === '0', 'HR must release its actual business lock');
      }
      check('原任务及授权保持且新验证任务已暂停', config() === originalConfig && grants() === originalGrants
        && (!jobId || database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'PAUSED'));
      evidence.restoration = true;
    } catch (error) { failure ||= error; }
    try {
      if (observer) { observer.assertHealthy(); await observer.close(); await fs.writeFile(observationFile, JSON.stringify({ jobId, baseProcess: state.processes.find(item => item.name === 'auth').id,
        peerProcess: peer.processId, events: observer.events.map(item => ({ ...item, owner: ownerOf(item) })) }, null, 2), { flag: 'wx' }); }
    } catch (error) { failure ||= error; if (observer) await observer.close(); }
    try {
      const manifest = await readManifest(peerFile);
      if (manifest && manifest.status !== 'STOPPED') await operate('Stop');
      check('第二调度进程已按身份核验停止且原调度保留', (await readManifest(peerFile))?.status === 'STOPPED'); evidence.peerRestoration = true;
    } catch (error) { failure ||= error; }
    try {
      const capacity = await readManifest(capacityFile);
      if (capacity && capacity.status !== 'RESTORED') {
        const manifest = await readManifest(peerFile); assert.ok(!manifest || manifest.status === 'STOPPED'); await operate('Restore');
      }
      check('容量安排恢复且原九进程和六服务健康', !capacity || (await readManifest(capacityFile)).status === 'RESTORED'); evidence.capacityRestoration = true;
    } catch (error) { failure ||= error; }
  }
  const filesToScan = [...helperLogs, observationFile];
  for (const directory of [...state.services.map(item => path.join(state.run, item.name)), peerDirectory]) {
    for (const sub of ['', 'logs']) {
      const folder = path.join(directory, sub);
      const names = await fs.readdir(folder).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      for (const name of names) if (name.endsWith('.log')) filesToScan.push(path.join(folder, name));
    }
  }
  for (const name of await fs.readdir(path.dirname(capacityFile))) if (name.startsWith(path.basename(capacityFile) + '.') && name.endsWith('.log')) filesToScan.push(path.join(path.dirname(capacityFile), name));
  let files = 0; let bytes = 0; let leaks = 0;
  for (const filename of filesToScan) {
    if (!(await fs.stat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; }))) continue;
    const scan = await scanSecretStream(createReadStream(filename), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('双调度验证及真实服务和审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`A3_SCHEDULER_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log(`A3_SCHEDULER_SCOPE: internal_requests=${internalRequests}; two_auth_processes=${evidence.instances}; both_dispatchers_observed=${evidence.cron && evidence.fixedRate}; read_only_redis_monitor=${Boolean(observer)}; raw_monitor_retained=false; original_service_configuration_unchanged=true; scheduler_failover_not_verified=true; production_modified=false`);
  if (failure) throw failure;
}
