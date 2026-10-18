import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

// Invalid confirmation is the controlled input; the actual registered HR handler throws.
export async function verifyA3JobFailure({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3F' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accept, label, milliseconds = 60000) => {
    const deadline = Date.now() + milliseconds;
    do { const value = await read(); if (accept(value)) return value; await sleep(250); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const keys = await readOwnedJobKeys(state);
  const secrets = new Set([...accounts.map(account => account.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const auth = state.services.find(item => item.name === 'auth');
  const hr = state.services.find(item => item.name === 'hr');
  assert.ok(auth && hr);
  const config = await fs.readFile(path.join(state.run, 'auth/integration.properties'), 'utf8');
  const escalation = config.match(/^cloudflow\.job\.alarm-escalation-threshold=([^\r\n]+)$/m);
  assert.ok(!escalation || escalation[1] === '3', 'Expected original three-failure escalation threshold');
  let internalRequests = 0;
  const internal = async (service, source, recipient, target, method = 'GET', payload) => {
    const body = payload ? JSON.stringify(payload) : '';
    const headers = signJobRequest(keys, source, recipient, method, target, body); secrets.add(headers['X-Job-Signature']);
    const response = await fetch(`http://127.0.0.1:${service.port}${target}`, { method, headers,
      ...(method === 'GET' ? {} : { body }), signal: AbortSignal.timeout(10000), redirect: 'error' });
    internalRequests++;
    const result = await response.json(); assert.ok(response.status === 200 && result.code === 200, 'Real failure protocol request rejected'); return result.data;
  };
  const root = '/auth/system/job';
  const owner = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0 AND status='0';"); assert.match(owner, /^[1-9][0-9]*$/);
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const configuration = () => database("SELECT tenant_id,job_id,job_name,job_group,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY tenant_id,job_id;');
  const attendance = () => createHash('sha256').update(database('SELECT * FROM hr_attendance_record ORDER BY id;')).update(database('SELECT * FROM hr_attendance_monthly ORDER BY id;')).digest('hex');
  const oldGrants = grants(); const oldConfiguration = configuration(); const oldAttendance = attendance();
  const payload = { jobName: marker, jobGroup: 'A3_VERIFY', serviceName: 'cloudflow-service-hr', handlerName: 'hrAttendanceRecalcAsync',
    handlerParam: '{"confirmed":false}', triggerType: 'FIXED_RATE', intervalMs: 60000, status: 'PAUSED', concurrentFlag: 0,
    misfireStrategy: 'IGNORE', retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 0, dispatchRetryIntervalSec: 1,
    timeoutSeconds: 60, lockTimeSeconds: 60, criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 1, alarmReceiver: owner, remark: marker };
  let jobId; let failure; let latest; let lastTrigger = 0; const failedExecutions = [];
  const logs = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'retry',retry_index,'dispatchRetry',dispatch_retry_index,'report',report_time,'end',end_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + jobId + ' ORDER BY log_id;');
  const alarms = executeNo => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'content',content,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type,'title',title) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(executeNo) + ' ORDER BY record_id;');
  const trigger = async () => {
    const remaining = 5200 - (Date.now() - lastTrigger); if (remaining > 0) await sleep(remaining);
    const accepted = successful(await api(admin, root + '/' + jobId + '/trigger', { method: 'POST', body: {} }), '实际触发本轮故障验证任务');
    lastTrigger = Date.now(); latest = accepted;
    assert.equal(accepted.accepted, true, 'The actual handler must accept before execution fails');
    return await waitFor(() => logs().find(item => item.executeNo === accepted.executeNo), item => item && item.status !== 'RUNNING', 'Actual handler did not report its terminal result');
  };
  try {
    const handlers = successful(await api(admin, root + '/handlers?serviceName=cloudflow-service-hr'), '读取真实人事处理器');
    check('故障验证使用实际在线人事处理器', handlers.some(item => item.handlerName === payload.handlerName && item.status === 'ONLINE'));
    successful(await api(admin, root, { method: 'POST', body: payload }), '建立独立暂停故障任务');
    jobId = database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=' + sql(marker) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await trigger(); failedExecutions.push(result);
      check('第' + attempt + '次真实执行失败保存异常及回报', result.status === 'FAILED' && result.message === '任务执行失败'
        && result.stack.includes('HrBusinessException') && result.stack.includes('请确认考勤重算范围') && result.duration >= 0 && result.report && result.end
        && result.trigger === 'MANUAL' && result.actor === 'g_import_admin' && result.retry === 0 && result.dispatchRetry === 0);
      check('第' + attempt + '次连续失败计数准确增加', database('SELECT consecutive_fail_count FROM sys_job WHERE job_id=' + jobId + ';') === String(attempt));
      const sent = await waitFor(() => alarms(result.executeNo), items => items.length === 1 && items[0].status === 'SUCCESS', 'Actual failure alarm was not delivered');
      const text = attempt === 3 ? '任务连续执行失败' : '任务执行失败';
      check('第' + attempt + '次告警由真实站内渠道送达指定人且摘要准确', sent[0].receiver === owner && sent[0].channel === 'INTERNAL'
        && sent[0].content.includes(text) && sent[0].content.includes(marker) && sent[0].content.includes(result.executeNo) && sent[0].content.includes('请确认考勤重算范围'));
      successful(await api(employee, '/auth/system/message/mine/' + sent[0].id), '指定人员读取实际任务告警');
    }
    evidence.failed = true; evidence.delivery = true; evidence.escalation = true;
    const last = failedExecutions.at(-1);
    const status = await internal(hr, 'cloudflow-auth', 'cloudflow-service-hr', '/inner/job/status/' + last.executeNo);
    check('真实失败状态反查保留同一异常及耗时', status?.executeStatus === 'FAILED' && status.exceptionStack === last.stack && status.durationMs === last.duration);
    await internal(auth, 'cloudflow-service-hr', 'cloudflow-auth', '/inner/job/report', 'POST', { executeNo: last.executeNo,
      executeStatus: status.executeStatus, affectedRows: status.affectedRows, resultMsg: status.resultMsg, exceptionStack: status.exceptionStack, durationMs: status.durationMs });
    check('相同实际失败回报重投不重复累计或发送告警', database('SELECT consecutive_fail_count FROM sys_job WHERE job_id=' + jobId + ';') === '3'
      && alarms(last.executeNo).length === 1 && logs().filter(item => item.status === 'FAILED').length === 3); evidence.replay = true;
    const emptyEmployee = (BigInt(database('SELECT COALESCE(MAX(id),0) FROM hr_employee;')) + 1000n).toString();
    assert.equal(database('SELECT COUNT(*) FROM hr_employee WHERE id=' + emptyEmployee + ';'), '0');
    const day = database('SELECT CURRENT_DATE;');
    const validParam = JSON.stringify({ confirmed: true, employeeIds: [emptyEmployee], startDate: day, endDate: day, forceOverwrite: false });
    successful(await api(admin, root, { method: 'PUT', body: { ...payload, jobId, handlerParam: validParam } }), '修正测试任务确认参数及明确空员工范围');
    const recovered = await trigger();
    check('同一真实处理器修正参数后成功并清零连续失败计数', recovered.status === 'SUCCESS' && recovered.affected === 0
      && database('SELECT consecutive_fail_count FROM sys_job WHERE job_id=' + jobId + ';') === '0');
    check('成功扫描不发告警且三次既有失败及消息仍保留', alarms(recovered.executeNo).length === 0 && logs().length === 4
      && failedExecutions.every(item => alarms(item.executeNo).length === 1 && logs().find(row => row.executeNo === item.executeNo)?.status === 'FAILED'));
    check('故障及空范围恢复没有修改既有考勤日账月账', attendance() === oldAttendance); evidence.recovery = true;
    const detail = successful(await api(admin, root + '/log/' + last.id), '管理端读取真实失败详情');
    check('管理详情保存真实异常栈和FAILED状态', detail.executeStatus === 'FAILED' && detail.exceptionStack === last.stack);
    const denied = await api(employee, root + '/log/' + last.id);
    check('告警收件人没有后台异常日志读取权限', denied.status === 403 && !denied.body?.data); evidence.permissions = true;
    console.log('A3_FAILURE_OBSERVED: actual_failures=3; actual_recovery=1; alarms_delivered=3; escalation_at=3; signed_status=1; replayed_real_failure_report=1; attendance_changed=false; production_modified=false');
  } catch (error) { failure = error; }
  finally {
    try {
      if (jobId) {
        if (latest?.accepted) await waitFor(() => logs().find(item => item.executeNo === latest.executeNo), item => item && item.status !== 'RUNNING', 'Owned failure task still running during restoration');
        if (database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') !== 'PAUSED') successful(await api(admin, root + '/' + jobId + '/toggle', { method: 'PUT', body: { status: 'PAUSED', confirmCritical: true } }), '暂停本轮故障任务');
      }
      check('原任务配置及授权保持且测试任务暂停保留审计', configuration() === oldConfiguration && grants() === oldGrants && attendance() === oldAttendance
        && (!jobId || database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'PAUSED'));
      evidence.restoration = true; console.log('A3_FAILURE_RESTORED: original_jobs=true; grants=true; attendance=true; new_task_paused=true; logs_messages_audit_retained=true');
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
  check('实际故障异常及审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`A3_FAILURE_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log(`A3_FAILURE_SCOPE: handler=hrAttendanceRecalcAsync; internal_requests=${internalRequests}; real_handler_failure=true; no_tenant_partial_failure_acceptance=true; no_cluster_acceptance=true; production_modified=false`);
  if (failure) throw failure;
}
