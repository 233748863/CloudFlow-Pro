import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

// Stop only the verified fixture CRM process; no fabricated heartbeat or task result.
export async function verifyA3JobOutage({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3O' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label, ms = 60000, interval = 500) => {
    const until = Date.now() + ms;
    do { const value = await read(); if (accept(value)) return value; await sleep(interval); } while (Date.now() < until);
    throw new Error(label);
  };
  const keys = await readOwnedJobKeys(state);
  const secrets = new Set([...accounts.map(item => item.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const owner = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0 AND status='0';")[0];
  assert.match(owner.id, /^[1-9][0-9]*$/); assert.match(owner.dept, /^[1-9][0-9]*$/);
  const crm = state.services.find(item => item.name === 'crm'); assert.ok(crm);
  const root = '/auth/system/job';
  const manifest = path.join(state.run, 'private', 'a3-crm-outage-' + caseTag + '.json');
  const helperFiles = [];
  const operate = async action => {
    const out = manifest + '.' + action + '.stdout.log'; const err = manifest + '.' + action + '.stderr.log';
    const output = await fs.open(out, 'wx'); const errors = await fs.open(err, 'wx'); helperFiles.push(out, err);
    let exit;
    try {
      exit = await new Promise((resolve, reject) => {
        const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe', ['-NoLogo', '-NoProfile', '-File', 'scripts/operate-a3-crm-outage.ps1',
          '-StatePath', path.join(state.run, 'state.json'), '-Action', action, '-ManifestPath', manifest],
        { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', output.fd, errors.fd] });
        child.once('error', reject); child.once('exit', resolve);
      });
    } finally { await output.close(); await errors.close(); }
    assert.equal(exit, 0, 'Owned CRM ' + action + ' failed; inspect retained helper diagnostics');
    const safe = (await fs.readFile(out, 'utf8')).split(/\r?\n/).filter(line => line.startsWith('A3_OUTAGE_'));
    assert.equal(safe.length, 1); console.log(safe[0]);
  };
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const configuration = () => database("SELECT tenant_id,job_id,job_name,job_group,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY tenant_id,job_id;');
  const rules = () => database('SELECT tenant_id,rule_id,status,deleted FROM crm_assignment_rule WHERE create_by<>' + sql(marker) + ' ORDER BY tenant_id,rule_id;');
  const original = { grants: grants(), jobs: configuration(), rules: rules() };
  const payload = { jobName: marker, jobGroup: 'A3_VERIFY', serviceName: 'cloudflow-service-crm', handlerName: 'customerPoolRelease',
    handlerParam: marker, triggerType: 'FIXED_RATE', intervalMs: 60000, status: 'PAUSED', concurrentFlag: 0, misfireStrategy: 'IGNORE',
    retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 3, dispatchRetryIntervalSec: 1, timeoutSeconds: 600, lockTimeSeconds: 600,
    criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 1, alarmReceiver: owner.id, remark: marker };
  let ruleId; let customerId; let jobId; let failure; let stopped = false; let recoveryAttempted = false;
  let lastTrigger = 0; let internalRequests = 0; let latest;
  const observedRetries = [];
  const logs = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'dispatchRetry',dispatch_retry_index,'retry',retry_index,'report',report_time,'end',end_time,'actor',trigger_by,'trigger',trigger_type) FROM sys_job_log WHERE job_id=" + jobId + ' ORDER BY log_id;');
  const alarms = executeNo => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'content',content,'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(executeNo) + ' ORDER BY record_id;');
  const handlers = () => rows("SELECT JSON_OBJECT('name',handler_name,'status',status,'age',TIMESTAMPDIFF(SECOND,last_report_time,NOW())) FROM sys_job_handler WHERE service_name='crm' ORDER BY handler_name;");
  const customer = () => rows("SELECT JSON_OBJECT('pool',pool_flag,'owner',CAST(owner_id AS CHAR),'original',CAST(original_owner_id AS CHAR)) FROM crm_customer WHERE customer_id=" + customerId + ';')[0];
  const trails = () => database("SELECT COUNT(*) FROM crm_customer_pool_log WHERE customer_id=" + customerId + " AND action_type='AUTO_RELEASE';");
  const candidates = () => rows("SELECT DISTINCT JSON_OBJECT('id',CAST(c.customer_id AS CHAR)) FROM crm_customer c JOIN crm_assignment_rule r ON r.tenant_id=c.tenant_id AND r.rule_type='AUTO_RELEASE' AND r.status='ACTIVE' AND r.deleted=0 JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND c.pool_flag='0' AND c.owner_id IS NOT NULL AND r.inactive_days>0 AND (c.last_follow_up_time<DATE_SUB(NOW(),INTERVAL r.inactive_days DAY) OR c.last_follow_up_time IS NULL) AND (r.dept_id IS NULL OR r.dept_id=c.dept_id) AND (r.customer_level IS NULL OR r.customer_level='' OR r.customer_level=c.level_code) AND (r.customer_tags IS NULL OR r.customer_tags='' OR c.customer_tags LIKE CONCAT('%',r.customer_tags,'%'));");
  const trigger = async () => {
    const delay = 5200 - (Date.now() - lastTrigger); if (delay > 0) await sleep(delay);
    const started = Date.now();
    const value = successful(await api(admin, root + '/' + jobId + '/trigger', { method: 'POST', body: {} }), '实际调用独立停机验证任务');
    lastTrigger = Date.now(); latest = value; return { ...value, elapsed: Date.now() - started };
  };
  const assertDispatchFailed = async label => {
    const execution = await trigger();
    const result = await waitFor(() => logs().find(item => item.executeNo === execution.executeNo), item => item && item.status !== 'RUNNING', 'Stopped CRM dispatch did not reach terminal state');
    check(label + '返回派发失败并完成三次真实重试', execution.accepted === false && execution.reason === 'DISPATCH_FAILED'
      && result.status === 'DISPATCH_FAILED' && result.dispatchRetry === 3 && result.retry === 0 && execution.elapsed >= 3000);
    check(label + '保存网络失败且没有业务回报或处理数量', result.message === '网络调度失败' && Boolean(result.stack)
      && result.affected === null && !result.report && result.end && result.trigger === 'MANUAL' && result.actor === 'g_import_admin');
    check(label + '没有执行业务且不增加业务连续失败计数', customer().pool === '0' && customer().owner === owner.id && trails() === '0'
      && database('SELECT consecutive_fail_count FROM sys_job WHERE job_id=' + jobId + ';') === '0');
    const sent = await waitFor(() => alarms(execution.executeNo), items => items.length === 1 && items[0].status === 'SUCCESS', 'Network dispatch failure alarm not delivered');
    check(label + '网络派发失败专门告警实际送达指定人', sent[0].receiver === owner.id && sent[0].channel === 'INTERNAL'
      && sent[0].content.includes('网络调度失败') && sent[0].content.includes(marker) && sent[0].content.includes(execution.executeNo)
      && !sent[0].content.includes('任务执行失败'));
    successful(await api(employee, '/auth/system/message/mine/' + sent[0].id), '指定人员读取网络派发失败告警');
    observedRetries.push({ elapsed_ms: execution.elapsed, dispatch_retry_index: result.dispatchRetry, executeNo: execution.executeNo });
    return result;
  };
  const pageErrors = []; admin.on('pageerror', error => pageErrors.push(error.name));
  const showTask = async name => {
    const loadedHandlers = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/system/job/handlers' && response.request().method() === 'GET');
    await admin.goto(new URL('/job', admin.url()).href, { waitUntil: 'domcontentloaded' });
    assert.equal((await loadedHandlers).status(), 200, 'Actual handler list must load before checking offline presentation');
    await admin.getByPlaceholder('按任务名称搜索').fill(name);
    await admin.getByRole('button', { name: '查询', exact: true }).click();
    const row = admin.getByRole('row').filter({ hasText: name }); await row.waitFor(); return row;
  };
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND service_name IN ('crm','cloudflow-service-crm');"), '0', 'Pause-free outage requires no enabled CRM schedules');
    const authConfig = await fs.readFile(path.join(state.run, 'auth/integration.properties'), 'utf8');
    const threshold = authConfig.match(/^cloudflow\.job\.handler-offline-threshold-seconds=([^\r\n]+)$/m);
    assert.ok(!threshold || threshold[1] === '180', 'Preserve the actual default 180 second offline threshold');
    const listed = successful(await api(admin, root + '/handlers?serviceName=cloudflow-service-crm'), '读取真实在线客户处理器');
    check('停机前原客户处理器在线且真实心跳未过期', listed.some(item => item.handlerName === payload.handlerName && item.status === 'ONLINE')
      && handlers().every(item => item.status === 'ONLINE' && item.age < 180));
    database('INSERT INTO crm_assignment_rule(tenant_id,rule_name,rule_type,status,inactive_days,customer_level,customer_tags,create_by) VALUES(100000,' + sql(marker) + ",'AUTO_RELEASE','ACTIVE',45," + sql(marker) + ',' + sql(marker) + ',' + sql(marker) + ');');
    ruleId = database('SELECT rule_id FROM crm_assignment_rule WHERE tenant_id=100000 AND rule_name=' + sql(marker) + ';'); assert.match(ruleId, /^[1-9][0-9]*$/);
    database('INSERT INTO crm_customer(tenant_id,customer_code,customer_name,level_code,customer_tags,owner_id,owner_name,dept_id,pool_flag,last_follow_up_time,deleted,create_by) VALUES(100000,'
      + [sql(marker), sql(marker), sql(marker), sql(marker), owner.id, sql(marker), owner.dept, "'0'", 'DATE_SUB(NOW(),INTERVAL 46 DAY)', 0, sql(marker)].join(',') + ');');
    customerId = database('SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=' + sql(marker) + ';'); assert.match(customerId, /^[1-9][0-9]*$/);
    successful(await api(admin, root, { method: 'POST', body: payload }), '建立独立暂停停机任务');
    jobId = database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=' + sql(marker) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
    await operate('Stop'); stopped = true; evidence.stopped = true;
    const first = await assertDispatchFailed('心跳尚未判离线时');
    evidence.retries = true; evidence.alarm = true;
    console.log('A3_OUTAGE_WAITING: real_crm_stopped=true; heartbeat_threshold_seconds=180; synthetic_heartbeat_writes=0');
    const offline = await waitFor(handlers, items => items.length > 0 && items.every(item => item.status === 'OFFLINE'), 'CRM handlers did not become OFFLINE from real missed heartbeats', 210000, 2000);
    check('真实心跳超过180秒后客户处理器自动标记离线', offline.every(item => item.age >= 180));
    const response = successful(await api(admin, root + '/handlers?serviceName=cloudflow-service-crm'), '管理端读取真实离线处理器');
    check('管理接口显示实际OFFLINE且其他服务仍在线', response.length === offline.length && response.every(item => item.status === 'OFFLINE')
      && database("SELECT COUNT(DISTINCT service_name) FROM sys_job_handler WHERE service_name IN ('auth','hr','oa','workflow') AND status='ONLINE' AND last_report_time>DATE_SUB(NOW(),INTERVAL 180 SECOND);") === '4');
    evidence.offline = true;
    for (const width of [1440, 768]) {
      await admin.setViewportSize({ width, height: 1000 });
      const row = await showTask(marker); const badge = row.getByText('执行服务离线', { exact: true }); await badge.waitFor();
      check('实际离线任务页面' + width + '像素显示红色文字标识', await badge.isVisible() && await badge.evaluate(element => element.classList.contains('text-rose-700') && element.classList.contains('dark:text-rose-200')));
      await admin.screenshot({ path: path.resolve('.cloudflow-runtime/full-prd-20260915/approved-runtime/a3-outage-' + caseTag + '-' + width + '.png'), fullPage: true });
    }
    // A fresh phone navigation uses the existing mobile router, which has no /job route.
    await admin.setViewportSize({ width: 320, height: 1000 });
    await admin.goto(new URL('/job', admin.url()).href, { waitUntil: 'domcontentloaded' });
    const desktopOnly = admin.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true });
    await desktopOnly.waitFor();
    check('320像素手机直接访问保持原有电脑端办理提示', await desktopOnly.isVisible()
      && await admin.getByPlaceholder('按任务名称搜索').count() === 0 && await admin.getByRole('button', { name: '新增任务', exact: true }).count() === 0);
    await admin.screenshot({ path: path.resolve('.cloudflow-runtime/full-prd-20260915/approved-runtime/a3-outage-' + caseTag + '-320.png'), fullPage: true });
    await admin.setViewportSize({ width: 1440, height: 1000 });
    const originalJob = successful(await api(admin, root + '/102'), '读取原公海任务名称');
    const originalBadge = (await showTask(originalJob.jobName)).getByText('执行服务离线', { exact: true });
    await originalBadge.waitFor();
    check('原客户公海任务也显示真实离线提示', await originalBadge.isVisible());
    const healthyName = database("SELECT job_name FROM sys_job WHERE job_id=106 AND deleted=0;");
    check('人事服务在线任务没有被误标为客户服务离线', await (await showTask(healthyName)).getByText('执行服务离线', { exact: true }).count() === 0);
    check('电脑平板离线提示及手机原访问限制没有脚本错误', pageErrors.length === 0); evidence.page = true;
    await assertDispatchFailed('已确认离线时');
    const denied = await api(employee, root + '/log/' + first.id);
    check('告警收件人没有后台派发异常详情权限', denied.status === 403 && !denied.body?.data); evidence.permissions = true;
    recoveryAttempted = true; await operate('Recover'); stopped = false;
    const online = await waitFor(handlers, items => items.length === offline.length && items.every(item => item.status === 'ONLINE' && item.age < 180), 'Recovered real CRM failed to register handlers');
    check('恢复原服务后处理器自动重新上报在线', online.length === offline.length);
    const refreshed = successful(await api(admin, root + '/handlers?serviceName=cloudflow-service-crm'), '读取恢复后的处理器');
    check('恢复后管理接口ONLINE且页面红色离线提示消失', refreshed.every(item => item.status === 'ONLINE')
      && await (await showTask(marker)).getByText('执行服务离线', { exact: true }).count() === 0);
    const pending = candidates(); assert.ok(pending.some(item => item.id === customerId));
    const accepted = await trigger(); check('恢复后相同客户处理器重新受理', accepted.accepted === true);
    const completed = await waitFor(() => logs().find(item => item.executeNo === accepted.executeNo), item => item && item.status !== 'RUNNING', 'Recovered CRM did not report success');
    check('恢复后真实补回收客户并准确记录处理数量', completed.status === 'SUCCESS' && completed.affected === pending.length
      && completed.message === '客户公海释放完成：已释放' + pending.length + '名客户' && completed.report && customer().pool === '1'
      && customer().original === owner.id && customer().owner === null && trails() === '1' && candidates().length === 0);
    const target = '/inner/job/status/' + accepted.executeNo;
    const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-crm', 'GET', target); secrets.add(headers['X-Job-Signature']);
    const statusResponse = await fetch('http://127.0.0.1:' + crm.port + target, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) }); internalRequests++;
    const actual = await statusResponse.json();
    check('恢复任务签名状态查询与数据库成功结果一致', statusResponse.status === 200 && actual.code === 200 && actual.data?.executeStatus === 'SUCCESS' && actual.data.affectedRows === completed.affected);
    check('恢复成功保留原派发失败和两条告警且无补跑队列', logs().length === 3 && logs().filter(item => item.status === 'DISPATCH_FAILED').length === 2
      && alarms(accepted.executeNo).length === 0 && observedRetries.every(item => alarms(item.executeNo).length === 1));
    evidence.recovery = true;
    console.log('A3_OUTAGE_OBSERVED: ' + JSON.stringify({ retries: observedRetries.map(({ elapsed_ms, dispatch_retry_index }) => ({ elapsed_ms, dispatch_retry_index })),
      offline_min_age_seconds: Math.min(...offline.map(item => item.age)), recovered_count: completed.affected, actual_process_stop: true, actual_restart: true, tcp_packet_capture: false }));
  } catch (error) { failure = error; }
  finally {
    try {
      if (!recoveryAttempted) {
        const saved = await fs.readFile(manifest, 'utf8').then(text => JSON.parse(text.replace(/^\uFEFF/, ''))).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (saved && ['STOPPED', 'STOPPING'].includes(saved.status)) { recoveryAttempted = true; await operate('Recover'); stopped = false; }
      }
      if (stopped) throw new Error('CRM recovery requires retained helper diagnostics; environment not yet restored');
      if (latest?.accepted) await waitFor(() => logs().find(item => item.executeNo === latest.executeNo), item => item && item.status !== 'RUNNING', 'Owned recovery task still running at closeout');
    } catch (error) { failure ||= error; }
    try {
      if (ruleId) database("UPDATE crm_assignment_rule SET status='INACTIVE' WHERE rule_id=" + ruleId + ' AND create_by=' + sql(marker) + ';');
      if (customerId) database('UPDATE crm_customer SET deleted=1 WHERE customer_id=' + customerId + ' AND create_by=' + sql(marker) + ';');
      check('原任务规则及授权保持且新增测试样本已停用', configuration() === original.jobs && grants() === original.grants && rules() === original.rules
        && (!ruleId || database('SELECT status FROM crm_assignment_rule WHERE rule_id=' + ruleId + ';') === 'INACTIVE')
        && (!customerId || database('SELECT deleted FROM crm_customer WHERE customer_id=' + customerId + ';') === '1')
        && (!jobId || database('SELECT status FROM sys_job WHERE job_id=' + jobId + ';') === 'PAUSED'));
      const restored = JSON.parse((await fs.readFile(manifest, 'utf8')).replace(/^\uFEFF/, ''));
      check('真实停机验证已恢复全部服务和原启动配置', restored.status === 'RECOVERED' && !stopped);
      evidence.restoration = true;
      console.log('A3_OUTAGE_RESTORED: crm_running=true; original_configuration=true; original_jobs_rules_grants=true; sample_disabled=true; test_task_paused=true; logs_messages_audit_retained=true');
    } catch (error) { failure ||= error; }
  }
  let files = 0; let bytes = 0; let leaks = 0;
  const paths = [...helperFiles];
  for (const suffix of ['.recovery.stdout.log', '.recovery.stderr.log']) {
    const filename = manifest + suffix; if (await fs.stat(filename).catch(() => null)) paths.push(filename);
  }
  for (const service of state.services) {
    const directory = path.join(state.run, service.name);
    const top = await fs.readdir(directory);
    paths.push(...top.filter(name => /^(stdout|stderr)(-before-.*)?\.log$/.test(name)).map(name => path.join(directory, name)));
    const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    paths.push(...names.filter(name => name.endsWith('.log')).map(name => path.join(directory, 'logs', name)));
  }
  for (const filename of paths) { const scan = await scanSecretStream(createReadStream(filename), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks; }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('停机重试及恢复的服务日志和审计无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_OUTAGE_SECRET_SCAN: ' + JSON.stringify({ files, bytes, values: secrets.size, leaks, database_bytes: audit.bytes, database_leaks: audit.leaks }));
  console.log('A3_OUTAGE_SCOPE: internal_requests=' + internalRequests + '; real_crm_process_stop=true; interface_doubles=0; no_cluster_acceptance=true; production_modified=false');
  if (failure) throw failure;
}
