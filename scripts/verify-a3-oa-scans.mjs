import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

export async function verifyA3OaScans({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3O' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label, ms = 60000) => {
    const until = Date.now() + ms;
    do { const value = await read(); if (accept(value)) return value; await sleep(250); } while (Date.now() < until);
    throw new Error(label);
  };
  const keys = await readOwnedJobKeys(state);
  const secrets = new Set([...accounts.map(item => item.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const root = '/auth/system/job'; const oa = state.services.find(item => item.name === 'oa'); assert.ok(oa);
  const owners = rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE user_name IN ('g_holiday_employee','g_import_tenant') AND deleted=0 AND status='0' ORDER BY tenant_id;");
  assert.equal(owners.length, 2); assert.equal(owners[0].tenant, '100000'); assert.equal(owners[1].tenant, '100001');
  for (const owner of owners) for (const value of Object.values(owner)) assert.match(value, /^[1-9][0-9]*$/);
  const redis = await ownedGatewayRedis(state);
  const config = () => database("SELECT tenant_id,job_id,job_name,handler_name,status,cron_expression,interval_ms,timeout_seconds,lock_time_seconds,alarm_receiver,deleted FROM sys_job WHERE job_name NOT LIKE " + sql(marker + '%') + ' ORDER BY job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig = config(); const oldGrants = grants();
  const samples = []; const jobs = []; let lock; let failure; let riskRestore;
  const summary = (kind, seal, license) => kind === 'borrow' ? '借用逾期扫描完成：用印' + seal + '份，证照借用' + license + '份'
    : kind === 'expiry' ? '印章证照到期扫描完成：印章' + seal + '条，证照' + license + '条提醒' : '合同风险扫描完成：新增' + seal + '条风险';
  const logs = job => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'report',report_time) FROM sys_job_log WHERE job_id=" + job.id + ' ORDER BY log_id;');
  const trigger = async job => {
    if (job.last && Date.now() - job.last < 5300) await sleep(5300 - (Date.now() - job.last));
    const result = successful(await api(admin, root + '/' + job.id + '/trigger', { method: 'POST', body: {} }), '实际触发办公扫描');
    assert.equal(result.accepted, true); job.last = Date.now(); return result.executeNo;
  };
  const complete = (job, no) => waitFor(() => logs(job).find(item => item.executeNo === no), item => item && item.status !== 'RUNNING', 'OA scan did not complete', 90000);
  const messages = () => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status,'skipReason',skip_reason,'channel',channel_type,'title',title,'content',content) FROM sys_message_record WHERE COALESCE(biz_type,'')<>'SYS_JOB' AND content LIKE " + sql('%' + marker + '%') + ' ORDER BY record_id;');
  const risks = sample => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'code',risk_code,'tenant',CAST(tenant_id AS CHAR),'owner',CAST(owner_id AS CHAR),'status',risk_status) FROM oa_risk_alert WHERE business_type='CONTRACT' AND business_id=" + sample.contract + ';');
  const borrowStatus = (sample, seal) => database('SELECT status FROM ' + (seal ? 'oa_seal_application' : 'oa_license_borrow') + ' WHERE id=' + (seal ? sample.application : sample.borrow) + ';');
  const reminderCount = (sample, kind) => kind === 'borrow'
    ? Number(database("SELECT COUNT(*) FROM oa_borrow_reminder_log WHERE tenant_id=" + sample.tenant + " AND ((business_type='SEAL' AND business_id=" + sample.application + ") OR (business_type='LICENSE' AND business_id=" + sample.borrow + '));'))
    : Number(database('SELECT (SELECT COUNT(*) FROM oa_seal_expiry_reminder_log WHERE seal_id=' + sample.seal + ') + (SELECT COUNT(*) FROM oa_license_expiry_reminder_log WHERE license_id=' + sample.license + ');'));
  const alarm = async failed => {
    const result = await waitFor(() => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(failed.executeNo) + ';'), items => items.length === 1 && items[0].status === 'SUCCESS', 'OA failure alarm missing');
    check('办公失败告警真实送达指定人', result[0].user === owners[0].user);
    successful(await api(employee, '/auth/system/message/mine/' + result[0].id), '员工读取办公任务失败告警');
  };
  const verifiedSuccess = async (job, expected, text) => {
    const no = await trigger(job); const result = await complete(job, no);
    check(job.kind + '实际成功数量摘要及耗时准确', result.status === 'SUCCESS' && result.affected === expected && result.message === text
      && Number.isInteger(result.duration) && result.actor === 'g_import_admin' && result.trigger === 'MANUAL' && result.report);
    const target = '/inner/job/status/' + no; const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-oa', 'GET', target, '');
    secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + oa.port + target, { headers, signal: AbortSignal.timeout(10000) }); const body = await response.json();
    check(job.kind + '服务签名反查与归档一致', response.status === 200 && body.code === 200 && body.data.affectedRows === expected && body.data.resultMsg === text);
    return result;
  };
  const openLock = async sample => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; }); child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("ROLLBACK; SELECT 'A3_OA_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned borrow lock release timed out'); }
      assert.ok(code === 0 && !processError && output.includes('A3_OA_RELEASED'), 'Owned borrow lock helper failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, connection: null };
    child.stdin.write('START TRANSACTION; SELECT id FROM oa_seal_application WHERE id=' + sample.application + ' AND create_by=' + sql(marker) + " FOR UPDATE; SELECT CONCAT('A3_OA_READY:',CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_OA_READY:[0-9]+/.test(value), 'Borrow lock not ready', 5000);
    lock.connection = output.match(/A3_OA_READY:([0-9]+)/)[1];
  };
  try {
    for (const [id, handler, kind] of [[108,'borrowOverdueScan','borrow'],[109,'licenseExpiryScan','expiry'],[110,'contractRiskScan','risk']]) {
      const original = successful(await api(admin, root + '/' + id), '读取办公原任务');
      assert.ok(original.handlerName === handler && original.status === 'PAUSED');
      assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name=" + sql(handler) + ';'), '0');
      const name = marker + kind;
      successful(await api(admin, root, { method: 'POST', body: { ...original, jobId: undefined, jobName: name, jobGroup: 'A3_VERIFY', handlerParam: marker,
        status: 'PAUSED', triggerType: 'FIXED_RATE', cronExpression: null, intervalMs: 60000, concurrentFlag: 0, misfireStrategy: 'IGNORE', retryCount: 0,
        dispatchRetryCount: 0, timeoutSeconds: 90, lockTimeSeconds: 90, criticalFlag: 0, alarmOnFailFlag: 1, alarmReceiver: owners[0].user, logSuccessFlag: 1 } }), '建立暂停办公验证任务');
      const jobId = database('SELECT job_id FROM sys_job WHERE job_name=' + sql(name) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
      const job = { id: jobId, kind }; jobs.push(job);
      const no = await trigger(job); const baseline = await complete(job, no);
      check(kind + '原隔离数据首轮扫描成功并保留真实结果', baseline.status === 'SUCCESS' && Number.isInteger(baseline.affected) && baseline.affected >= 0);
      console.log('A3_OA_BASELINE: ' + JSON.stringify({ kind, jobId, count: baseline.affected }));
    }
    for (const [index, owner] of owners.entries()) {
      const suffix = marker + index; const sample = { ...owner, suffix }; samples.push(sample);
      for (const kind of ['seal','license']) {
        database('INSERT INTO oa_' + kind + '(tenant_id,' + kind + '_code,' + kind + '_name,' + kind + '_type,expire_date,keeper_id,keeper_name,status,create_by) VALUES('
          + owner.tenant + ',' + sql(suffix) + ',' + sql(suffix + kind) + ",'OTHER',DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY)," + owner.user + ',' + sql(marker) + ",'AVAILABLE'," + sql(marker) + ');');
        sample[kind] = database('SELECT ' + kind + '_id FROM oa_' + kind + ' WHERE tenant_id=' + owner.tenant + ' AND ' + kind + '_code=' + sql(suffix) + ';'); assert.match(sample[kind], /^[1-9][0-9]*$/);
      }
      database('INSERT INTO oa_seal_application(tenant_id,application_no,seal_id,seal_name,user_id,user_name,dept_id,document_name,purpose,expected_return_time,status,create_by) VALUES('
        + owner.tenant + ',' + sql(suffix) + ',' + sample.seal + ',' + sql(suffix + 'seal') + ',' + owner.user + ',' + sql(marker) + ',' + owner.dept + ',' + sql(marker) + ',' + sql(marker) + ",DATE_SUB(NOW(),INTERVAL 1 DAY),'BORROWED'," + sql(marker) + ');');
      sample.application = database('SELECT id FROM oa_seal_application WHERE application_no=' + sql(suffix) + ' AND tenant_id=' + owner.tenant + ';');
      database('INSERT INTO oa_license_borrow(tenant_id,borrow_no,license_id,license_name,user_id,user_name,dept_id,purpose,expected_return_time,status,create_by) VALUES('
        + owner.tenant + ',' + sql(suffix) + ',' + sample.license + ',' + sql(suffix + 'license') + ',' + owner.user + ',' + sql(marker) + ',' + owner.dept + ',' + sql(marker) + ",DATE_SUB(NOW(),INTERVAL 1 DAY),'BORROWED'," + sql(marker) + ');');
      sample.borrow = database('SELECT id FROM oa_license_borrow WHERE borrow_no=' + sql(suffix) + ' AND tenant_id=' + owner.tenant + ';');
      database('INSERT INTO oa_contract(tenant_id,contract_no,contract_name,counterparty_name,contract_type,amount,owner_id,owner_name,dept_id,start_date,end_date,status,create_by) VALUES('
        + owner.tenant + ',' + sql(suffix) + ',' + sql(suffix + 'contract') + ',' + sql(marker) + ",'OTHER',100," + owner.user + ',' + sql(marker) + ',' + owner.dept + ",CURRENT_DATE,DATE_ADD(CURRENT_DATE,INTERVAL 20 DAY),'ACTIVE'," + sql(marker) + ');');
      sample.contract = database('SELECT contract_id FROM oa_contract WHERE contract_no=' + sql(suffix) + ' AND tenant_id=' + owner.tenant + ';');
      for (const value of [sample.application,sample.borrow,sample.contract]) assert.match(value, /^[1-9][0-9]*$/);
    }
    const [borrow, expiry, risk] = jobs;
    await openLock(samples[0]); const failedNo = await trigger(borrow);
    const waits = await waitFor(() => rows("SELECT JSON_OBJECT('connection',CAST(r.PROCESSLIST_ID AS CHAR),'db',d.OBJECT_SCHEMA,'table',d.OBJECT_NAME,'index',d.INDEX_NAME,'data',d.LOCK_DATA) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads b ON b.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.threads r ON r.THREAD_ID=w.REQUESTING_THREAD_ID JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND d.ENGINE=w.ENGINE WHERE b.PROCESSLIST_ID=" + lock.connection + ';'), items => items.length > 0, 'OA borrow update not waiting on owned row', 25000);
    assert.ok(waits.length === 1 && waits[0].db === 'cloud_flow_db' && waits[0].table === 'oa_seal_application' && waits[0].index === 'PRIMARY' && waits[0].data === samples[0].application);
    assert.match(waits[0].connection, /^[1-9][0-9]*$/); database('KILL QUERY ' + waits[0].connection + ';');
    const failed = await complete(borrow, failedNo); await lock.release();
    check('用印分项失败仍继续本租户证照和其他租户两个分项', borrowStatus(samples[0],true) === 'BORROWED' && borrowStatus(samples[0],false) === 'OVERDUE'
      && borrowStatus(samples[1],true) === 'OVERDUE' && borrowStatus(samples[1],false) === 'OVERDUE' && reminderCount(samples[0],'borrow') === 1 && reminderCount(samples[1],'borrow') === 2);
    check('借用部分失败上报FAILED并保留租户和分项原异常', failed.status === 'FAILED' && failed.affected === null && failed.stack.includes('借用逾期扫描存在失败分项') && failed.stack.includes('100000'));
    await alarm(failed); evidence.borrowFailure = true;
    await verifiedSuccess(borrow, 1, summary('borrow',1,0));
    check('恢复后两租户各两条催还日志且所有借用均逾期', samples.every(sample => reminderCount(sample,'borrow') === 2 && borrowStatus(sample,true) === 'OVERDUE' && borrowStatus(sample,false) === 'OVERDUE'));
    await verifiedSuccess(borrow, 0, summary('borrow',0,0)); evidence.borrow = true;
    await verifiedSuccess(expiry, 4, summary('expiry',2,2));
    check('两租户各生成印章和证照到期提醒且归属正确', samples.every(sample => reminderCount(sample,'expiry') === 2));
    await verifiedSuccess(expiry, 0, summary('expiry',0,0)); evidence.expiry = true;
    const rule = rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'enabled',enabled,'updated',update_time) FROM sys_business_rule WHERE tenant_id=100000 AND rule_code='oa.contract.risk.threshold';");
    assert.equal(rule.length,1); assert.equal(rule[0].enabled,1);
    const cacheKey = '100000:sys:config:tenant:sys.oa.contract.highAmountThreshold';
    const oldExists = redis('EXISTS',cacheKey) === '1'; const oldCache = redis('GET',cacheKey); const oldTtl = Number(redis('PTTL',cacheKey)); const savedAt = Date.now();
    const fault = JSON.stringify('A3_OA_INVALID_THRESHOLD_' + caseTag);
    riskRestore = () => {
      database('UPDATE sys_business_rule SET enabled=1,update_time=' + (rule[0].updated ? sql(rule[0].updated) : 'NULL') + ' WHERE id=' + rule[0].id + ' AND tenant_id=100000 AND enabled=0;');
      const current = redis('GET',cacheKey); assert.ok(current === fault || current === oldCache || current === '');
      if (oldExists) {
        if (oldTtl === -1) redis('SET',cacheKey,oldCache);
        else { const remaining = oldTtl - (Date.now() - savedAt); if (remaining > 0) redis('SET',cacheKey,oldCache,'PX',remaining); else if (current === fault) redis('DEL',cacheKey); }
      } else if (current === fault) redis('DEL',cacheKey);
      const currentRule = rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'enabled',enabled,'updated',update_time) FROM sys_business_rule WHERE tenant_id=100000 AND rule_code='oa.contract.risk.threshold';");
      const remaining = oldTtl > 0 ? oldTtl - (Date.now() - savedAt) : oldTtl;
      const observedExists = redis('EXISTS',cacheKey) === '1'; const observedTtl = Number(redis('PTTL',cacheKey));
      const cacheRestored = oldExists && (oldTtl === -1 || remaining > 0)
        ? observedExists && redis('GET',cacheKey) === oldCache && (oldTtl === -1 ? observedTtl === -1 : observedTtl > 0 && Math.abs(observedTtl - remaining) < 1000)
        : !observedExists && observedTtl === -2;
      check('办公风险故障参数原值及有效期和规则原时间恢复', JSON.stringify(currentRule) === JSON.stringify(rule) && cacheRestored);
      console.log('A3_OA_RISK_FAULT_RESTORED: rule_value_and_timestamp=true; cache_value_and_expiry=true; unrelated_keys_changed=false');
      riskRestore = null;
    };
    database('UPDATE sys_business_rule SET enabled=0 WHERE id=' + rule[0].id + ' AND tenant_id=100000 AND enabled=1;');
    redis('SET',cacheKey,fault,'EX',120);
    const riskFailed = await complete(risk, await trigger(risk));
    check('合同风险扫描后段故障撤销本租户风险及消息但其他租户继续', riskFailed.status === 'FAILED' && riskFailed.stack.includes('合同风险扫描存在失败分项')
      && riskFailed.stack.includes('NumberFormatException') && risks(samples[0]).length === 0 && risks(samples[1]).length === 1 && !messages().some(item => item.content.includes(samples[0].suffix + 'contract')));
    await alarm(riskFailed); evidence.riskRollback = true;
    riskRestore();
    await verifiedSuccess(risk, 1, summary('risk',1));
    check('风险恢复后两租户均唯一记录且风险类型及收件人正确', samples.every(sample => {
      const values=risks(sample); return values.length === 1 && values[0].code === 'CONTRACT_EXPIRING' && values[0].tenant === sample.tenant && values[0].owner === sample.user;
    }));
    await verifiedSuccess(risk, 0, summary('risk',0)); evidence.risk = true;
    const delivered = await waitFor(messages, items => items.length === 10 && items.every(item => ['SUCCESS','SKIPPED'].includes(item.status)), 'OA business messages not terminal');
    check('十条办公提醒归属各自租户和人员且第一租户五条实际送达', delivered.every(item => owners.some(owner => owner.tenant === item.tenant && owner.user === item.user))
      && delivered.filter(item => item.tenant === '100000').length === 5 && delivered.filter(item => item.tenant === '100000').every(item => item.status === 'SUCCESS'));
    check('另一租户未配置渠道的五条提醒明确记录跳过原因', delivered.filter(item => item.tenant === '100001').length === 5 && delivered.filter(item => item.tenant === '100001').every(item => item.status === 'SKIPPED' && item.skipReason === 'NO_CHANNEL'));
    for (const message of delivered.filter(item => item.tenant === '100000')) successful(await api(employee, '/auth/system/message/mine/' + message.id), '本人读取办公业务提醒');
    const denied = await api(employee, root + '/log/' + failed.id);
    check('办公告警收件人不能越权读取后台执行详情', denied.status === 403 && !denied.body?.data);
    const other = await api(employee, '/auth/system/message/mine/' + delivered.find(item => item.tenant === '100001').id);
    check('办公提醒禁止跨租户读取', ([403,404].includes(other.status) || [403,404].includes(other.body?.code)) && !other.body?.data);
    const before = JSON.stringify({ messages:messages(), reminders:samples.map(sample=>[reminderCount(sample,'borrow'),reminderCount(sample,'expiry')]),risks:samples.map(risks) });
    await sleep(1500);
    check('重复办公扫描不增加业务记录及消息', JSON.stringify({ messages:messages(), reminders:samples.map(sample=>[reminderCount(sample,'borrow'),reminderCount(sample,'expiry')]),risks:samples.map(risks) }) === before);
    evidence.delivery = true; evidence.permissions = true; evidence.deduplication = true;
    console.log('A3_OA_ACTUAL: ' + JSON.stringify({ jobs:jobs.map(job=>({ id:job.id, kind:job.kind })), fixtureTenants:2, businessMessages:delivered.length,
      successes:delivered.filter(item=>item.status==='SUCCESS').length, skipped:delivered.filter(item=>item.status==='SKIPPED').length, forcedTerminalWrites:0 }));
  } catch (error) { failure=error; }
  finally {
    try { if(lock) await lock.release(); } catch(error) { failure ||= error; }
    try { if(riskRestore) riskRestore(); } catch(error) { failure ||= error; }
    try {
      for(const job of jobs) await waitFor(()=>logs(job), values=>values.every(item=>item.status!=='RUNNING'), 'OA job still running at cleanup',90000);
      for(const table of ['oa_seal_application','oa_license_borrow','oa_seal','oa_license','oa_contract']) database('UPDATE '+table+' SET deleted=1 WHERE create_by='+sql(marker)+';');
      for(const sample of samples.filter(sample=>sample.contract)) database("UPDATE oa_risk_alert SET risk_status='IGNORED' WHERE business_type='CONTRACT' AND tenant_id="+sample.tenant+' AND business_id='+sample.contract+';');
      check('办公样本停用且原任务权限保持并保留业务审计记录', config()===oldConfig && grants()===oldGrants
        && samples.every(sample=>!sample.contract || database('SELECT deleted FROM oa_contract WHERE contract_id='+sample.contract+';')==='1'));
      check('办公自有数据库锁连接已关闭', !lock?.connection || database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID='+lock.connection+';')==='0');
      evidence.restoration=true;
    } catch(error) { failure ||= error; }
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const item of state.services) {
    const directory = path.join(state.run, item.name); const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) { const scan = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks; }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('办公扫描任务与审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_OA_SECRET_SCAN: ' + JSON.stringify({ files, bytes, values: secrets.size, leaks, databaseBytes: audit.bytes, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}
