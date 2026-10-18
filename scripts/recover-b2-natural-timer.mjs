import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

// Resume only the cleanup and observation of the retained R2 sample. No new timer or trigger.
export async function recoverB2NaturalTimer({ admin, api, successful, database, check, state, accounts, evidence }) {
  assert.equal(process.env.CLOUDFLOW_NATURAL_RECOVER, 'r2');
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const log = await fs.readFile(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime/a3-natural-cadence-20261003-http-r2.log'), 'utf8');
  assert.match(log, /切换自有自然周期任务: HTTP 401/);
  assert.match(log, /A3_NATURAL_INPUTS: files=20; changed=0; product_changed=0; exit=1/);
  const readyLines = log.split(/\r?\n/).filter(line => line.startsWith('A3_NATURAL_TIMER_READY: '));
  assert.equal(readyLines.length, 1);
  const ready = JSON.parse(readyLines[0].slice('A3_NATURAL_TIMER_READY: '.length));
  assert.equal(ready.instance, '41ebab28-0f79-4b02-b9c2-1b7ca1d0b555');
  assert.equal(ready.timerUnit, 'HOUR'); assert.equal(ready.configuredWaitMs, 3600000);
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const instance = rows("SELECT JSON_OBJECT('status',i.status,'definition',i.definition_id,'marker',d.process_key) FROM wf_process_instance i JOIN wf_process_definition d ON d.definition_id=i.definition_id WHERE i.tenant_id=100000 AND i.instance_id=" + sql(ready.instance) + ';')[0];
  assert.equal(instance.marker, 'B2Hbb0073144489');
  const marker = instance.marker;
  const jobs = () => rows("SELECT JSON_OBJECT('id',CAST(job_id AS CHAR),'name',job_name,'status',status,'handler',handler_name,'interval',interval_ms,'timeout',timeout_seconds) FROM sys_job WHERE tenant_id=100000 AND deleted=0 AND job_name LIKE " + sql(marker + '-%') + ' ORDER BY job_id;');
  const expected = ['taskReminder','taskTimeout','timerScan','deadlockDetection'];
  const ownJobs = jobs(); assert.equal(ownJobs.length, 4);
  assert.deepEqual(ownJobs.map(job => job.handler), expected);
  assert.deepEqual(ownJobs.map(job => job.interval), [300000,300000,180000,600000]);
  const originalConfig = () => database('SELECT tenant_id,job_id,job_name,handler_name,status,trigger_type,interval_ms,cron_expression,handler_param,deleted FROM sys_job WHERE job_name NOT LIKE ' + sql(marker + '-%') + ' ORDER BY job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const beforeConfig = originalConfig(), beforeGrants = grants();
  for (const job of ownJobs) if (job.status !== 'PAUSED') successful(await api(admin, '/auth/system/job/' + job.id + '/toggle', { method: 'PUT', body: { status: 'PAUSED', confirmCritical: true } }), '重新登录后暂停原轮自有任务');
  const until = Date.now() + 90000;
  while (database('SELECT COUNT(*) FROM sys_job_log WHERE job_id IN (' + ownJobs.map(job => job.id).join(',') + ") AND execute_status='RUNNING';") !== '0') {
    assert.ok(Date.now() < until, 'Owned original jobs still running');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const redis = await ownedGatewayRedis(state), keys = await readOwnedJobKeys(state);
  const secrets = new Set([...accounts.map(account => account.password).filter(Boolean), ...Object.values(keys)]);
  const token = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  const history = () => rows("SELECT JSON_OBJECT('action',action,'type',task_type,'at',CAST(UNIX_TIMESTAMP(create_time)*1000 AS UNSIGNED)) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(ready.instance) + " AND node_key='timer' ORDER BY history_id;");
  const finalHistory = history();
  // Complete cleanup even if an evidence assertion subsequently fails.
  if (['RUNNING','PENDING','PAUSED','FAILED','WITHDRAWN','TASK_BACK','RESTARTED'].includes(instance.status))
    successful(await api(admin, '/workflow/wf/instance/terminate', { method: 'POST', body: { instanceId: ready.instance, reason: marker + '-recovery-cleanup' } }), '正常收尾原轮未完成实例');
  database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id=100000 AND definition_id=' + sql(instance.definition) + ' AND process_key=' + sql(marker) + ';');
  const queued = redis('ZRANGE', '100000:sys:wf:timers', 0, -1);
  check('原轮四任务全部暂停且原配置授权保持', jobs().every(job => job.status === 'PAUSED') && originalConfig() === beforeConfig && grants() === beforeGrants);
  check('原轮等待及定时缓存已经清除', !queued.includes(ready.instance) && redis('KEYS', '100000:sys:wf:timer:' + ready.instance + ':*') === '');
  evidence.restoration = true; evidence.naturalRecovery = true;
  check('原一小时样本自然完成且保留唯一自动通过历史', instance.status === 'AUTO_PASSED' && finalHistory.length === 1 && finalHistory[0].action === 'APPROVE' && finalHistory[0].type === 'AUTO_PASS');
  const delay = finalHistory[0].at - ready.expireAt;
  check('原一小时定时自然完成误差在三分钟内', delay >= -1000 && delay <= 180000 && finalHistory[0].at - ready.requestAt >= 3599000);
  const workflow = state.services.find(service => service.name === 'workflow'); assert.ok(workflow);
  const executionCounts = [];
  for (const job of ownJobs) {
    const records = rows("SELECT JSON_OBJECT('executeNo',execute_no,'status',execute_status,'trigger',trigger_type,'actor',trigger_by,'start',CAST(UNIX_TIMESTAMP(start_time)*1000 AS UNSIGNED),'end',CAST(UNIX_TIMESTAMP(end_time)*1000 AS UNSIGNED),'affected',affected_rows,'message',result_msg,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id=" + job.id + ' ORDER BY log_id;');
    const gaps = records.slice(1).map((record,index) => record.start - records[index].start);
    check(job.handler + '原自然记录无手动触发且间隔和结果完整', records.length >= 2 && records.every(record => record.status === 'SUCCESS' && record.trigger === 'CRON' && !record.actor && record.report && Number.isInteger(record.duration)) && gaps.every(gap => gap >= job.interval - 1000 && gap <= job.interval + 10000) && new Set(records.map(record => record.executeNo)).size === records.length);
    const result = records.at(-1), target = '/inner/job/status/' + result.executeNo;
    const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-workflow', 'GET', target, ''); secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + workflow.port + target, { headers, signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.code, 200);
    // JobExecutionService retains results for timeoutSeconds * 2, unlike the persistent platform audit.
    if (body.data === null) check(job.handler + '过期反查返回空且平台持久结果保留', Date.now() - result.end >= job.timeout * 2000);
    else check(job.handler + '原执行签名反查与平台结果一致', body.data.affectedRows === result.affected && body.data.resultMsg === result.message);
    executionCounts.push({ handler: job.handler, executions: records.length, gapsMs: gaps, statusCacheExpired:body.data === null, statusCacheTtlMs:job.timeout * 2000 });
  }
  const beforePaused = database('SELECT job_id,log_id,execute_status FROM sys_job_log WHERE job_id IN (' + ownJobs.map(job => job.id).join(',') + ') ORDER BY log_id;');
  await new Promise(resolve => setTimeout(resolve, 11000));
  check('恢复暂停后未新增执行或重复定时历史', beforePaused === database('SELECT job_id,log_id,execute_status FROM sys_job_log WHERE job_id IN (' + ownJobs.map(job => job.id).join(',') + ') ORDER BY log_id;') && JSON.stringify(history()) === JSON.stringify(finalHistory));
  let files = 0, leaks = 0;
  for (const service of state.services) {
    const directory = path.join(state.run, service.name), names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if(error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log','stderr.log',...names.filter(name => name.endsWith('.log')).map(name => path.join('logs',name))]) { const scan = await scanSecretStream(createReadStream(path.join(directory,name)), [...secrets]); files++; leaks += scan.leaks; }
  }
  const audit = await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});
  check('恢复原轮后的服务日志和审计无凭据泄漏', leaks === 0 && audit.leaks === 0);
  evidence.secrets = true; evidence.recoveredOriginalTimer = true;
  console.log('B2_NATURAL_RECOVERY_ACTUAL: ' + JSON.stringify({ originalRound:'r2', originalRunPassed:false, instance:ready.instance, configuredWaitMs:ready.configuredWaitMs, timerRequestAt:ready.requestAt, timerExpireAt:ready.expireAt, timerHistoryAt:finalHistory[0].at, timerDelayMs:delay, executionCounts, newTimers:0, manualTriggers:0, clockChanges:0, databaseTimeWrites:0, restoredOwnJobs:4, secrets:{files,leaks,databaseLeaks:audit.leaks}, fullDayObserved:false }));
}
