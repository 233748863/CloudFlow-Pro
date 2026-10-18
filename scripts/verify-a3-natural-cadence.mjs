import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyA3NaturalCadence({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  if (process.env.CLOUDFLOW_NATURAL_RECOVER) {
    const { recoverB2NaturalTimer } = await import('./recover-b2-natural-timer.mjs');
    return recoverB2NaturalTimer({ admin, api, successful, database, check, state, accounts, evidence });
  }
  const timerUnit = process.env.CLOUDFLOW_NATURAL_TIMER_UNIT ?? 'MINUTE';
  assert.ok(['MINUTE', 'HOUR'].includes(timerUnit), 'Only original minute and required one-hour scenarios are supported');
  const oneHour = timerUnit === 'HOUR', timerDurationMs = oneHour ? 3600000 : 60000, timerLabel = oneHour ? '一小时' : '一分钟';
  const marker = (oneHour ? 'B2H' : 'A3N') + caseTag, root = '/auth/system/job', base = '/workflow/wf';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label, duration = 90000) => {
    const until = Date.now() + duration;
    do { const value = await read(); if (accept(value)) return value; await sleep(500); } while (Date.now() < until);
    throw new Error(label);
  };
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const employee = await session('g_holiday_employee');
  const keys = await readOwnedJobKeys(state), redis = await ownedGatewayRedis(state);
  const secrets = new Set([...accounts.map(item => item.password).filter(Boolean), ...Object.values(keys)]);
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const workflow = state.services.find(item => item.name === 'workflow'); assert.ok(workflow);
  const expected = [
    { original: 112, handler: 'taskReminder', type: 'FIXED_RATE', interval: 300000 },
    { original: 113, handler: 'taskTimeout', type: 'FIXED_RATE', interval: 300000 },
    { original: 114, handler: 'timerScan', type: 'FIXED_RATE', interval: 180000 },
    { original: 115, handler: 'deadlockDetection', type: 'FIXED_DELAY', interval: 600000 }
  ];
  const configuration = () => database("SELECT tenant_id,job_id,job_name,handler_name,status,trigger_type,interval_ms,cron_expression,handler_param,deleted FROM sys_job WHERE job_name NOT LIKE " + sql(marker + '%') + ' ORDER BY job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const queues = [100000, 100001].flatMap(tenant => ['sys:wf:timers', 'sys:task:reminders', 'sys:task:timeouts'].map(name => tenant + ':' + name));
  const indices = () => JSON.stringify(queues.map(key => [key, redis('ZRANGE', key, 0, -1, 'WITHSCORES')]));
  const oldConfig = configuration(), oldGrants = grants(), oldIndices = indices();
  const jobs = []; let sample, definition, failure, observed;
  const ownJobs = () => rows("SELECT JSON_OBJECT('id',CAST(job_id AS CHAR),'status',status) FROM sys_job WHERE deleted=0 AND job_name LIKE " + sql(marker + '%') + ' ORDER BY job_id;');
  const logs = job => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'trigger',trigger_type,'actor',trigger_by,'start',CAST(UNIX_TIMESTAMP(start_time)*1000 AS UNSIGNED),'end',CAST(UNIX_TIMESTAMP(end_time)*1000 AS UNSIGNED),'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id=" + job.id + ' ORDER BY log_id;');
  const toggle = (job, status) => api(admin, root + '/' + job.id + '/toggle', { method: 'PUT', body: { status, confirmCritical: true } }).then(result => successful(result, '切换自有自然周期任务'));
  const instance = () => sample && rows("SELECT JSON_OBJECT('status',status,'variables',CAST(variables AS JSON)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(sample.instance) + ';')[0];
  const history = () => sample ? rows("SELECT JSON_OBJECT('id',history_id,'action',action,'at',CAST(UNIX_TIMESTAMP(create_time)*1000 AS UNSIGNED)) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(sample.instance) + " AND node_key='timer' ORDER BY history_id;") : [];
  const createTimer = async () => {
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '建立自然定时表单');
    const graph = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'timer', type: 'TIMER', title: '自然' + timerLabel, props: { timerType: 'DELAY', delayValue: 1, delayUnit: timerUnit, timerAction: 'AUTO_PASS' } }, { id: 'end', type: 'END', title: '结束' }], edges: [{ id: 's-t', source: 'start', target: 'timer' }, { id: 't-e', source: 'timer', target: 'end' }] };
    const saved = successful(await post(admin, base + '/definition/save', { processKey: marker, processName: marker, formId: form.formId ?? form.id, modelJson: JSON.stringify(graph), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存自然定时流程');
    definition = saved.definitionId ?? saved.id; assert.ok(definition);
    successful(await post(admin, base + '/definition/deploy/' + definition), '发布自然定时流程');
    const context = successful(await api(admin, base + '/draft/context/' + definition), '读取自然定时发起上下文');
    const draft = successful(await post(admin, base + '/draft', { definitionId: definition, expectedVersion: 0, loadedContextHash: context.contextHash, title: marker, formData: { note: marker }, nodeAssignees: {} }), '保存自然定时草稿');
    const before = Date.now();
    const started = successful(await post(admin, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '正常发起' + timerLabel + '定时流程');
    sample = { instance: started.instanceId ?? started.processInstanceId, requestAt: before }; assert.ok(sample.instance);
    const waits = Object.values(instance().variables?._wf_waits ?? {}).filter(item => item.kind === 'TIMER'); assert.equal(waits.length, 1);
    sample.expireAt = waits[0].payload.expireAt; sample.wait = waits[0].waitId;
    sample.key = 'sys:wf:timer:' + sample.instance + ':timer:root:' + sample.wait;
    check('定时等待由真实发起生成且未改截止时间', sample.expireAt >= before + timerDurationMs - 1000 && sample.expireAt <= Date.now() + timerDurationMs && Number(redis('ZSCORE', '100000:sys:wf:timers', JSON.stringify(sample.key))) === sample.expireAt);
    check(timerLabel + '定时流程实际停在等待节点', instance().status === 'PENDING' && history().length === 0);
    console.log('A3_NATURAL_TIMER_READY: ' + JSON.stringify({ instance: sample.instance, requestAt: before, expireAt: sample.expireAt, timerUnit, delayValue: 1, configuredWaitMs: timerDurationMs, databaseTimeWrites: 0, clockChanges: 0 }));
  };
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name IN ('taskReminder','taskTimeout','timerScan','deadlockDetection','timerScanCleanup');"), '0');
    assert.equal(database("SELECT COUNT(*) FROM wf_process_instance WHERE deleted=0 AND status IN ('RUNNING','RESTARTED','TASK_BACK','WITHDRAWN','PENDING','PAUSED','FAILED') AND JSON_CONTAINS_PATH(variables,'one','$._wf_waits')=1;"), '0', 'Prior durable waits must be absent');
    for (const key of queues) assert.equal(redis('ZCOUNT', key, 0, Date.now() + timerDurationMs + 900000), '0', 'No prior queue work may become due during this check');
    for (const item of expected) {
      const original = successful(await api(admin, root + '/' + item.original), '读取原高频任务');
      assert.equal(original.handlerName, item.handler); assert.equal(original.triggerType, item.type); assert.equal(original.intervalMs, item.interval); assert.equal(original.status, 'PAUSED');
      successful(await post(admin, root, { ...original, jobId: undefined, jobName: marker + '-' + item.original, jobGroup: 'A3_VERIFY', handlerParam: marker + '-' + item.original, status: 'PAUSED', concurrentFlag: 0, misfireStrategy: 'IGNORE', retryCount: 0, dispatchRetryCount: 0, timeoutSeconds: 90, lockTimeSeconds: 90, criticalFlag: 0, alarmOnFailFlag: 0, logSuccessFlag: 1 }), '建立同间隔自然周期任务');
      const id = database('SELECT job_id FROM sys_job WHERE job_name=' + sql(marker + '-' + item.original) + ' AND deleted=0;'); assert.match(id, /^[1-9][0-9]*$/);
      jobs.push({ ...item, id });
    }
    evidence.configuration = true;
    const denied = await api(employee, root + '/' + jobs[0].id + '/toggle', { method: 'PUT', body: { status: 'ENABLED', confirmCritical: true } });
    check('普通员工不能启用自然周期后台任务', denied.status === 403); evidence.permissions = true;
    const startedAt = Date.now();
    for (const job of jobs) await toggle(job, 'ENABLED');
    const deadline = startedAt + (oneHour ? timerDurationMs + 360000 : 660000); let nextProgress = 0, waitingObservations = 0;
    while (Date.now() < deadline) {
      observed = jobs.map(job => ({ ...job, logs: logs(job) }));
      assert.ok(observed.every(job => job.logs.every(item => ['RUNNING', 'SUCCESS'].includes(item.status))), 'Natural task reported failure or skipped execution');
      const timer = observed.find(job => job.handler === 'timerScan');
      if (!sample && timer.logs.some(item => item.status === 'SUCCESS')) await createTimer();
      if (sample && Date.now() < sample.expireAt - 1000) {
        const waiting = instance();
        assert.equal(waiting.status, 'PENDING', 'Timer must not complete before its original deadline');
        assert.equal(Object.values(waiting.variables._wf_waits).find(item => item.waitId === sample.wait)?.payload.expireAt, sample.expireAt, 'Durable timer deadline changed');
        waitingObservations++;
      }
      if (sample && instance().status === 'AUTO_PASSED' && observed.every(job => job.logs.filter(item => item.status === 'SUCCESS').length >= 2)) break;
      if (Date.now() >= nextProgress) {
        console.log('A3_NATURAL_PROGRESS: ' + JSON.stringify({ elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000), timerUnit, remainingSeconds: sample ? Math.max(0, Math.ceil((sample.expireAt - Date.now()) / 1000)) : null, executions: observed.map(job => ({ handler: job.handler, completed: job.logs.filter(item => item.status === 'SUCCESS').length })), timerCompleted: sample ? instance().status === 'AUTO_PASSED' : false }));
        nextProgress = Date.now() + 30000;
      }
      await sleep(oneHour ? 10000 : 1000);
    }
    for (const job of jobs) await toggle(job, 'PAUSED');
    for (const job of jobs) await waitFor(() => logs(job), items => items.every(item => item.status !== 'RUNNING'), 'Natural execution did not finish');
    observed = jobs.map(job => ({ ...job, logs: logs(job) }));
    for (const job of observed) {
      check(job.handler + '自然产生至少两次完整成功记录', job.logs.length >= 2 && job.logs.every(item => item.status === 'SUCCESS' && item.trigger === 'CRON' && !item.actor && item.report && Number.isInteger(item.duration)));
      job.gaps = job.logs.slice(1).map((item, index) => item.start - job.logs[index].start);
      check(job.handler + '按原间隔运行且没有额外触发', job.gaps.every(gap => gap >= job.interval - 1000 && gap <= job.interval + 10000) && new Set(job.logs.map(item => item.executeNo)).size === job.logs.length);
      const result = job.logs.at(-1), target = '/inner/job/status/' + result.executeNo;
      const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-workflow', 'GET', target, ''); secrets.add(headers['X-Job-Signature']);
      const response = await fetch('http://127.0.0.1:' + workflow.port + target, { headers, signal: AbortSignal.timeout(10000) });
      const body = await response.json(); check(job.handler + '真实服务状态与平台记录一致', response.status === 200 && body.code === 200 && body.data.affectedRows === result.affected && body.data.resultMsg === result.message);
    }
    evidence.cadence = true; evidence.reports = true;
    const timerHistory = history();
    check(timerLabel + '定时到期后自然完成且只处理一次', sample && instance().status === 'AUTO_PASSED' && timerHistory.length === 1 && redis('ZSCORE', '100000:sys:wf:timers', JSON.stringify(sample.key)) === '');
    const delay = timerHistory[0].at - sample.expireAt;
    check('定时节点自然到期误差不超过三分钟', delay >= -1000 && delay <= 180000);
    check('到期前持续等待且原截止时间保持', waitingObservations > 0 && timerHistory[0].at - sample.requestAt >= timerDurationMs - 1000);
    evidence.timerPrecision = true;
    evidence.oneHourTimer = oneHour;
    const beforePaused = JSON.stringify(observed.map(job => logs(job)));
    await sleep(11000); check('暂停后不增加执行且定时历史仍唯一', JSON.stringify(observed.map(job => logs(job))) === beforePaused && history().length === 1); evidence.pause = true;
    const nominalDaily = expected.reduce((total, item) => total + 86400000 / item.interval, 0); assert.equal(nominalDaily, 1200);
    console.log('A3_NATURAL_ACTUAL: ' + JSON.stringify({ durationMs: Date.now() - startedAt, jobs: observed.map(job => ({ id: job.id, original: job.original, handler: job.handler, intervalMs: job.interval, starts: job.logs.map(item => item.start), gapsMs: job.gaps, executions: job.logs.length })), timerUnit, delayValue: 1, configuredWaitMs: timerDurationMs, waitingObservations, timerRequestAt: sample.requestAt, timerDelayMs: delay, timerExpireAt: sample.expireAt, timerHistoryAt: timerHistory[0].at, manualTriggers: 0, acceleratedIntervals: false, databaseTimeWrites: 0, clockChanges: 0, nominalDailyCalls: nominalDaily, fullDayObserved: false, actualApprovalLockIntegration: false }));
  } catch (error) { failure = error; }
  finally {
    try {
      for (const job of ownJobs()) { if (job.status !== 'PAUSED') await toggle(job, 'PAUSED'); await waitFor(() => logs(job), items => items.every(item => item.status !== 'RUNNING'), 'Natural job still running during cleanup'); }
      if (sample && ['RUNNING', 'PAUSED', 'FAILED', 'PENDING', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(instance().status)) successful(await post(admin, base + '/instance/terminate', { instanceId: sample.instance, reason: marker + '-cleanup' }), '终止自有未完成自然定时流程');
      if (sample?.key) { redis('ZREM', '100000:sys:wf:timers', JSON.stringify(sample.key)); redis('DEL', '100000:' + sample.key); }
      if (definition) database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id=100000 AND definition_id=' + sql(definition) + ' AND process_key=' + sql(marker) + ';');
      check('自然周期检查后原任务权限和队列保持', configuration() === oldConfig && grants() === oldGrants && indices() === oldIndices && ownJobs().every(job => job.status === 'PAUSED'));
      evidence.restoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Natural cadence verification or restoration failed'); }
  }
  let files = 0, leaks = 0;
  for (const service of state.services) {
    const directory = path.join(state.run, service.name), names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) { const scan = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; leaks += scan.leaks; }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('自然周期任务及审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_NATURAL_SECRET_SCAN: ' + JSON.stringify({ files, values: secrets.size, leaks, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}
