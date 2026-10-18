import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { createA3ReportFaultProxy } from './a3-report-fault-proxy.mjs';

export async function verifyA3JobReportFault({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3R' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accept, label, milliseconds = 45000) => {
    const deadline = Date.now() + milliseconds;
    do { const value = await read(); if (accept(value)) return value; await sleep(200); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const keys = await readOwnedJobKeys(state); const redis = await ownedGatewayRedis(state);
  const secrets = new Set([...accounts.map(item => item.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const auth = state.services.find(item => item.name === 'auth'); const hr = state.services.find(item => item.name === 'hr');
  assert.ok(auth && hr);
  const root = '/auth/system/job';
  const owner = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0 AND status='0';")[0];
  assert.match(owner.id, /^[1-9][0-9]*$/); assert.match(owner.dept, /^[1-9][0-9]*$/);
  const config = () => database("SELECT tenant_id,job_id,job_name,job_group,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY tenant_id,job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig = config(); const oldGrants = grants();
  const original = successful(await api(admin, root + '/106'), '读取真实合同处理器配置');
  const inspector = successful(await api(admin, root + '/125'), '读取原任务结果巡检配置');
  assert.equal(original.handlerName, 'employeeContractExpire'); assert.equal(original.status, 'PAUSED');
  assert.equal(inspector.handlerName, 'jobTimeoutInspect'); assert.equal(inspector.status, 'PAUSED');
  assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED' AND deleted=0 AND handler_name IN ('employeeContractExpire','jobTimeoutInspect');"), '0');
  const candidates = () => database("SELECT COUNT(*) FROM hr_employee_contract c JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND ((c.end_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY) AND c.status IN ('ACTIVE','EFFECTIVE')) OR (c.end_date<CURRENT_DATE AND c.status NOT IN ('EXPIRED','TERMINATED')));");
  assert.equal(candidates(), '0', 'Only new owned contracts may be processed');
  const payload = { ...original, jobId: undefined, jobName: marker, jobGroup: 'A3_VERIFY', handlerParam: marker, status: 'PAUSED',
    triggerType: 'FIXED_RATE', cronExpression: null, intervalMs: 60000, concurrentFlag: 0, misfireStrategy: 'IGNORE',
    retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 0, dispatchRetryIntervalSec: 1,
    timeoutSeconds: 30, lockTimeSeconds: 30, criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 1, alarmReceiver: owner.id, remark: marker };
  const manifestFile = path.join(state.run, 'private', 'a3-report-fault-' + caseTag + '.json');
  const proxyEvidenceFile = path.join(state.run, 'a3-report-fault-' + caseTag + '-proxy.json');
  const readManifest = () => fs.readFile(manifestFile, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, '')))
    .catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const helperLogs = []; const contracts = []; const executions = []; let proxy; let jobId; let employeeId; let createdEmployee = false; let failure; let internalRequests = 0;
  const operate = async action => {
    const out = manifestFile + '.' + action + '.stdout.log'; const err = manifestFile + '.' + action + '.stderr.log';
    const output = await fs.open(out, 'wx'); const errors = await fs.open(err, 'wx'); helperLogs.push(out, err);
    let code;
    try {
      const args = ['-NoLogo', '-NoProfile', '-File', 'scripts/operate-a3-report-fault.ps1', '-StatePath', path.join(state.run, 'state.json'), '-Action', action, '-Marker', caseTag];
      if (action === 'Route') args.push('-ProxyPort', String(proxy.port), '-ProxyProcess', String(process.pid), '-JobId', jobId);
      code = await new Promise((resolve, reject) => {
        const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe', args, { windowsHide: true, stdio: ['ignore', output.fd, errors.fd] });
        child.once('error', reject); child.once('exit', resolve);
      });
    } finally { await output.close(); await errors.close(); }
    assert.equal(code, 0, 'Owned report fault ' + action + ' failed; inspect retained diagnostics');
    const lines = (await fs.readFile(out, 'utf8')).split(/\r?\n/).filter(line => line.startsWith('A3_REPORT_'));
    assert.equal(lines.length, 1); console.log(lines[0]);
  };
  const logRows = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'report',report_time,'start',start_time,'end',end_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + jobId + ' ORDER BY log_id;');
  const ownLog = executeNo => logRows().find(item => item.executeNo === executeNo);
  const alarmRows = executeNo => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type,'content',content) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(executeNo) + ' ORDER BY record_id;');
  const messages = contractId => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='HR_CONTRACT_EXPIRING' AND biz_id=" + sql(contractId) + ' ORDER BY record_id;');
  const internal = async (service, source, recipient, target, method = 'GET', body = '') => {
    const headers = signJobRequest(keys, source, recipient, method, target, body); secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + service.port + target, { method, headers, ...(method === 'GET' ? {} : { body }), redirect: 'error', signal: AbortSignal.timeout(12000) });
    internalRequests++; const value = await response.json(); assert.ok(response.status === 200 && value.code === 200, 'Real signed report-fault protocol rejected'); return value.data;
  };
  const inspect = async label => {
    const result = successful(await api(admin, root + '/125/trigger', { method: 'POST', body: {} }), '管理员实际触发原结果巡检');
    assert.equal(result.accepted, true);
    const value = await waitFor(() => rows("SELECT JSON_OBJECT('status',execute_status,'actor',trigger_by,'trigger',trigger_type,'message',result_msg) FROM sys_job_log WHERE tenant_id=100000 AND job_id=125 AND execute_no=" + sql(result.executeNo) + ';')[0], row => row && row.status !== 'RUNNING', 'Actual result inspection did not finish');
    check(label + '由原125实际执行并保存手动操作者', value?.status === 'SUCCESS' && value.actor === 'g_import_admin' && value.trigger === 'MANUAL');
    return result;
  };
  const awaitThreshold = executeNo => waitFor(() => database('SELECT IF(DATE_ADD(start_time,INTERVAL 31 SECOND)<=NOW(),1,0) FROM sys_job_log WHERE execute_no=' + sql(executeNo) + ';'), value => value === '1', 'Real timeout threshold not reached', 40000);
  const newExecution = async suffix => {
    assert.equal(candidates(), '0');
    const number = marker + suffix;
    database('INSERT INTO hr_employee_contract(tenant_id,employee_id,contract_type,contract_no,sign_date,start_date,end_date,status,deleted,create_by) VALUES(100000,' + employeeId
      + ",'LABOR'," + sql(number) + ",CURRENT_DATE,CURRENT_DATE,DATE_ADD(CURRENT_DATE,INTERVAL 10 DAY),'ACTIVE',0," + sql(marker) + ');');
    const contractId = database('SELECT id FROM hr_employee_contract WHERE tenant_id=100000 AND contract_no=' + sql(number) + ';'); assert.match(contractId, /^[1-9][0-9]*$/); contracts.push(contractId);
    const started = Date.now();
    const accepted = successful(await api(admin, root + '/' + jobId + '/trigger', { method: 'POST', body: {} }), '管理员实际派发丢回报验证任务');
    assert.equal(accepted.accepted, true); executions.push(accepted.executeNo);
    const report = await waitFor(() => proxy.reports.get(accepted.executeNo), Boolean, 'Actual HR result did not reach controlled report connection', 15000);
    const actual = await internal(hr, 'cloudflow-auth', 'cloudflow-service-hr', '/inner/job/status/' + accepted.executeNo);
    check(suffix + '真实合同已处理且成功回报连接被丢弃', report.value.executeStatus === 'SUCCESS' && report.value.affectedRows === 1
      && report.value.resultMsg === '员工合同到期扫描完成：即将到期1份，已到期0份' && actual?.executeStatus === 'SUCCESS' && actual.affectedRows === 1
      && actual.resultMsg === report.value.resultMsg && actual.durationMs === report.value.durationMs
      && database('SELECT status FROM hr_employee_contract WHERE id=' + contractId + ';') === 'EXPIRING');
    const sent = await waitFor(() => messages(contractId), values => values.length === 1 && values[0].status === 'SUCCESS', 'Actual contract notification was not delivered');
    check(suffix + '员工实际收到唯一站内合同提醒', sent[0].receiver === owner.id && sent[0].channel === 'INTERNAL');
    successful(await api(employee, '/auth/system/message/mine/' + sent[0].id), '员工读取真实合同提醒');
    await waitFor(() => redis('EXISTS', 'cloudflow:job:lock:hr-employee-contract-expire-job'), value => value === '0', 'Actual HR worker did not release its lock');
    check(suffix + '实际成功但管理日志仍处理中且没有收到回报', ownLog(accepted.executeNo)?.status === 'RUNNING' && !ownLog(accepted.executeNo)?.report && alarmRows(accepted.executeNo).length === 0);
    return { executeNo: accepted.executeNo, contractId, report, started };
  };
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE service_name='hr' AND handler_name='employeeContractExpire' AND LEFT(handler_param,100)=" + sql(marker) + ';'), '0');
    successful(await api(admin, root, { method: 'POST', body: payload }), '建立独立暂停回报故障任务');
    jobId = database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=' + sql(marker) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
    proxy = await createA3ReportFaultProxy({ authPort: auth.port, jobId, keys, secrets,
      ownsExecution: executeNo => database('SELECT COUNT(*) FROM sys_job_log WHERE tenant_id=100000 AND job_id=' + jobId + ' AND execute_no=' + sql(executeNo) + ';') === '1' });
    await operate('Route');
    await waitFor(() => proxy.counters.forwardedHeartbeats, value => value > 0, 'Real HR heartbeat was not forwarded', 20000);
    check('原人事服务重启后通过真实转发回报心跳', (await readManifest()).status === 'ACTIVE' && proxy.counters.forwardedHeartbeats > 0 && proxy.counters.rejected === 0); evidence.route = true;
    employeeId = database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=' + owner.id + ' AND deleted=0;');
    if (!employeeId) {
      database('INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by) VALUES(100000,' + sql(marker) + ',' + sql(marker) + ",'UNKNOWN'," + owner.dept + ",'ACTIVE'," + owner.id + ',' + sql(marker) + ');');
      employeeId = database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND employee_no=' + sql(marker) + ';'); createdEmployee = true;
    }
    assert.match(employeeId, /^[1-9][0-9]*$/);
    const first = await newExecution('A'); evidence.dropped = true; evidence.business = true;
    await inspect('超时前巡检');
    check('达到真实超时阈值前保持处理中且没有告警', Date.now() - first.started < 30000 && ownLog(first.executeNo).status === 'RUNNING' && alarmRows(first.executeNo).length === 0);
    await awaitThreshold(first.executeNo); await inspect('丢回报反查');
    const recovered = ownLog(first.executeNo);
    check('巡检从真实人事状态查回成功及准确结果', recovered.status === 'SUCCESS' && recovered.affected === 1 && recovered.message === first.report.value.resultMsg
      && recovered.duration === first.report.value.durationMs && recovered.report && recovered.end && alarmRows(first.executeNo).length === 0);
    evidence.recovered = true;
    const stableFirst = JSON.stringify(recovered);
    await internal(auth, 'cloudflow-service-hr', 'cloudflow-auth', '/inner/job/report', 'POST', first.report.body);
    check('查回成功后重投原实际回报不改变完成结果或重复发消息', JSON.stringify(ownLog(first.executeNo)) === stableFirst && messages(first.contractId).length === 1 && alarmRows(first.executeNo).length === 0);
    evidence.successReplay = true;
    const second = await newExecution('B');
    await operate('Stop'); evidence.unreachable = true;
    let refused = false;
    try { await fetch('http://127.0.0.1:' + hr.port + '/inner/job/status/' + second.executeNo, { signal: AbortSignal.timeout(4000) }); }
    catch (error) { refused = error.cause?.code === 'ECONNREFUSED'; }
    check('原服务发现地址的状态查询连接真实被拒绝', refused);
    await awaitThreshold(second.executeNo); await inspect('反查不可达');
    const timedOut = ownLog(second.executeNo);
    check('回报与反查均不可用时保存结果未知终态', timedOut.status === 'TIMEOUT' && timedOut.message === '结果未知' && timedOut.affected === null && timedOut.duration === null && timedOut.end);
    const alerts = await waitFor(() => alarmRows(second.executeNo), values => values.length === 1 && values[0].status === 'SUCCESS', 'Unknown-result alarm was not delivered');
    check('指定员工实际收到结果未知告警及准确执行编号', alerts[0].receiver === owner.id && alerts[0].channel === 'INTERNAL'
      && alerts[0].content.includes('结果未知') && alerts[0].content.includes('执行结果回报与状态反查均不可用')
      && alerts[0].content.includes(second.executeNo) && alerts[0].content.includes(marker) && !alerts[0].content.includes('任务执行失败'));
    successful(await api(employee, '/auth/system/message/mine/' + alerts[0].id), '员工读取真实结果未知告警'); evidence.timeout = true; evidence.alarm = true;
    const stableTimeout = JSON.stringify(timedOut);
    await operate('Restore'); evidence.runtimeRestoration = true;
    await internal(auth, 'cloudflow-service-hr', 'cloudflow-auth', '/inner/job/report', 'POST', second.report.body);
    check('服务恢复后原实际成功回报不能覆盖TIMEOUT终态', JSON.stringify(ownLog(second.executeNo)) === stableTimeout && alarmRows(second.executeNo).length === 1 && messages(second.contractId).length === 1);
    await inspect('恢复后重复巡检');
    check('重复巡检保持终态且未知结果告警不重复', JSON.stringify(ownLog(second.executeNo)) === stableTimeout && alarmRows(second.executeNo).length === 1);
    evidence.lateReplay = true;
    const detail = successful(await api(admin, root + '/log/' + timedOut.id), '管理员读取真实TIMEOUT详情');
    check('管理详情准确显示未知结果和TIMEOUT', detail.executeStatus === 'TIMEOUT' && detail.resultMsg === '结果未知' && detail.affectedRows === null);
    const denied = await api(employee, root + '/log/' + timedOut.id);
    check('告警收件人不能读取后台任务日志', denied.status === 403 && !denied.body?.data); evidence.permissions = true;
    check('两份实际成功合同仍各有唯一消息且没有业务失败计数', contracts.every(id => messages(id).length === 1)
      && database('SELECT consecutive_fail_count FROM sys_job WHERE job_id=' + jobId + ';') === '0');
    console.log('A3_REPORT_FAULT_OBSERVED: contracts=2; dropped_result_executions=2; real_status_recovery=true; actual_hr_outage=true; timeout_unknown_alarm=true; replayed_genuine_reports=2; forced_database_terminal_states=0');
  } catch (error) { failure = error; }
  finally {
    try {
      if (jobId) await waitFor(() => redis('EXISTS', 'cloudflow:job:lock:hr-employee-contract-expire-job'), value => value === '0', 'Wait for actual worker lock before restoring HR');
      const manifest = await readManifest();
      if (manifest && manifest.status !== 'RESTORED') await operate('Restore');
      check('原人事回报地址与九进程六服务完整恢复', !manifest || (await readManifest()).status === 'RESTORED'); evidence.runtimeRestoration = true;
    } catch (error) { failure ||= error; }
    try {
      for (const executeNo of executions) {
        if (ownLog(executeNo)?.status !== 'RUNNING') continue;
        const report = proxy?.reports.get(executeNo);
        if (report) await internal(auth, 'cloudflow-service-hr', 'cloudflow-auth', '/inner/job/report', 'POST', report.body);
        else { await awaitThreshold(executeNo); await inspect('异常收尾巡检'); }
      }
      if (jobId) {
        await waitFor(logRows, values => values.every(item => item.status !== 'RUNNING'), 'Actual execution remained pending during cleanup');
        if (database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') !== 'PAUSED') successful(await api(admin, root + '/' + jobId + '/toggle', { method: 'PUT', body: { status: 'PAUSED', confirmCritical: true } }), '暂停本轮任务');
      }
      for (const contractId of contracts) database('UPDATE hr_employee_contract SET deleted=1 WHERE id=' + contractId + ' AND create_by=' + sql(marker) + ';');
      if (createdEmployee) database('UPDATE hr_employee SET deleted=1 WHERE id=' + employeeId + ' AND employee_no=' + sql(marker) + ';');
      check('原任务授权保持且新合同停用并保留真实消息日志', config() === oldConfig && grants() === oldGrants
        && contracts.every(id => database('SELECT deleted FROM hr_employee_contract WHERE id=' + id + ';') === '1')
        && (!jobId || database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'PAUSED')); evidence.restoration = true;
    } catch (error) { failure ||= error; }
    try {
      if (proxy) {
        await proxy.close();
        await fs.writeFile(proxyEvidenceFile, JSON.stringify({ jobId, events: proxy.events, counters: proxy.counters,
          reports: [...proxy.reports].map(([executeNo, report]) => ({ executeNo, ...report })) }, null, 2), { flag: 'wx' });
        check('真实转发器已关闭且只丢本轮回报并保留原正文证据', proxy.counters.rejected === 0 && proxy.counters.upstreamErrors === 0);
      }
      evidence.proxyRestoration = true;
    } catch (error) { failure ||= error; }
  }
  const filesToScan = [...helperLogs, proxyEvidenceFile];
  for (const service of state.services) for (const sub of ['', 'logs']) {
    const directory = path.join(state.run, service.name, sub);
    const names = await fs.readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of names) if (name.endsWith('.log')) filesToScan.push(path.join(directory, name));
  }
  for (const name of await fs.readdir(path.dirname(manifestFile))) if (name.startsWith(path.basename(manifestFile) + '.') && name.endsWith('.log')) filesToScan.push(path.join(path.dirname(manifestFile), name));
  let files = 0; let bytes = 0; let leaks = 0;
  for (const filename of new Set(filesToScan)) {
    if (!(await fs.stat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; }))) continue;
    const scan = await scanSecretStream(createReadStream(filename), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('丢回报与恢复的全部日志和审计无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`A3_REPORT_FAULT_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log(`A3_REPORT_FAULT_SCOPE: internal_requests=${internalRequests}; real_result_connection_dropped=${evidence.dropped}; genuine_result_recovery=${evidence.recovered}; real_hr_outage=${evidence.unreachable}; timeout_and_late_report=${evidence.timeout && evidence.lateReplay}; original_runtime_restored=${evidence.runtimeRestoration}; interface_doubles=0; production_modified=false`);
  if (failure) throw failure;
}
