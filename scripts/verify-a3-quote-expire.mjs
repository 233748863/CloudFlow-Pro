import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

export async function verifyA3QuoteExpire({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3Q' + caseTag;
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
  const root = '/auth/system/job'; const crm = state.services.find(item => item.name === 'crm'); assert.ok(crm);
  const owners = rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE user_name IN ('g_holiday_employee','g_import_tenant') AND deleted=0 AND status='0' ORDER BY tenant_id;");
  assert.equal(owners.length, 2); assert.equal(owners[0].tenant, '100000'); assert.equal(owners[1].tenant, '100001');
  for (const owner of owners) for (const value of Object.values(owner)) assert.match(value, /^[1-9][0-9]*$/);
  const original = successful(await api(admin, root + '/103'), '读取原报价过期任务');
  assert.ok(original.handlerName === 'quoteExpire' && original.status === 'PAUSED');
  assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name='quoteExpire';"), '0');
  const config = () => database("SELECT tenant_id,job_id,job_name,handler_name,status,cron_expression,interval_ms,timeout_seconds,lock_time_seconds,alarm_receiver,deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig = config(); const oldGrants = grants();
  const samples = []; let jobId; let lock; let failedExecution; let failure;
  const executions = [];
  const quotes = () => rows("SELECT JSON_OBJECT('id',CAST(quote_id AS CHAR),'status',status,'deleted',deleted,'version',version,'tenant',CAST(tenant_id AS CHAR)) FROM crm_quote WHERE create_by=" + sql(marker) + ' ORDER BY quote_id;');
  const dueCandidates = () => database("SELECT COUNT(*) FROM crm_quote q JOIN sys_tenant t ON t.tenant_id=q.tenant_id WHERE q.deleted=0 AND q.valid_until<CURRENT_DATE AND q.status IN ('DRAFT','PENDING','APPROVED','REJECTED','SENT') AND t.deleted=0 AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW());");
  const originalQuotes = () => database('SELECT tenant_id,quote_id,status,deleted,version,update_time FROM crm_quote WHERE COALESCE(create_by,\'\')<>' + sql(marker) + ' ORDER BY quote_id;');
  const beforeOriginalQuotes = originalQuotes(); const guards = [];
  const logs = () => jobId ? rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'report',report_time,'end',end_time) FROM sys_job_log WHERE job_id=" + jobId + ' ORDER BY log_id;') : [];
  const ownLog = no => logs().find(item => item.executeNo === no);
  const trigger = async () => {
    const result = successful(await api(admin, root + '/' + jobId + '/trigger', { method: 'POST', body: {} }), '管理员实际执行报价过期任务');
    executions.push(result.executeNo); assert.equal(result.accepted, true); return result;
  };
  const openLock = async sample => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; }); child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("ROLLBACK; SELECT 'A3_QUOTE_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned archive lock release timed out'); }
      assert.ok(code === 0 && !processError && output.includes('A3_QUOTE_RELEASED'), 'Owned archive lock helper failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, connection: null };
    child.stdin.write('START TRANSACTION; SELECT customer_id FROM crm_customer WHERE customer_id=' + sample.customer + ' AND create_by=' + sql(marker) + " FOR UPDATE; SELECT CONCAT('A3_QUOTE_READY:',CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_QUOTE_READY:[0-9]+/.test(value), 'Archive lock not ready', 5000);
    lock.connection = output.match(/A3_QUOTE_READY:([0-9]+)/)[1];
  };
  try {
    assert.equal(dueCandidates(), '0', 'Existing quotes must not be changed by this fixture');
    for (const [index, owner] of owners.entries()) {
      const suffix = marker + index;
      database('INSERT INTO crm_customer(tenant_id,customer_code,customer_name,owner_id,owner_name,dept_id,pool_flag,deleted,create_by) VALUES(' + owner.tenant + ',' + sql(suffix) + ',' + sql(suffix) + ',' + owner.user + ',' + sql(marker) + ',' + owner.dept + ",'0',0," + sql(marker) + ');');
      const customer = database('SELECT customer_id FROM crm_customer WHERE customer_code=' + sql(suffix) + ';'); assert.match(customer, /^[1-9][0-9]*$/);
      const sample = { tenant: owner.tenant, customer, due: [] }; samples.push(sample);
      const addQuote = (status, date, deleted, tag) => {
        const no = suffix + tag;
        database('INSERT INTO crm_quote(tenant_id,quote_no,customer_id,quote_name,total_amount,valid_until,status,deleted,owner_id,create_by) VALUES(' + owner.tenant + ',' + sql(no) + ',' + customer + ',' + sql(no) + ',100,' + date + ',' + sql(status) + ',' + deleted + ',' + owner.user + ',' + sql(marker) + ');');
        const id = database('SELECT quote_id FROM crm_quote WHERE tenant_id=' + owner.tenant + ' AND quote_no=' + sql(no) + ';'); assert.match(id, /^[1-9][0-9]*$/); return id;
      };
      for (const [i, status] of (index === 0 ? ['DRAFT','PENDING','APPROVED','REJECTED','SENT'] : ['SENT']).entries()) {
        sample.due.push({ id: addQuote(status, 'DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)', 0, 'D' + i), status });
      }
      if (index === 0) {
        const specs = [['ACCEPTED','DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)',0],['EXPIRED','DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)',0],
          ['DRAFT','CURRENT_DATE',0],['SENT','DATE_ADD(CURRENT_DATE,INTERVAL 1 DAY)',0],['DRAFT','NULL',0],['SENT','DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)',1]];
        for (const [i, [status, date, deleted]] of specs.entries()) guards.push({ id: addQuote(status, date, deleted, 'G' + i), status, deleted });
      }
    }
    const expectedGuards = JSON.stringify(quotes().filter(item => guards.some(guard => guard.id === item.id)));
    const untouchedGuards = () => JSON.stringify(quotes().filter(item => guards.some(guard => guard.id === item.id))) === expectedGuards;
    assert.equal(dueCandidates(), '6');
    successful(await api(admin, root, { method: 'POST', body: { ...original, jobId: undefined, jobName: marker, jobGroup: 'A3_VERIFY', handlerParam: marker,
      status: 'PAUSED', triggerType: 'FIXED_RATE', cronExpression: null, intervalMs: 60000, concurrentFlag: 0, misfireStrategy: 'IGNORE', retryCount: 0,
      dispatchRetryCount: 0, timeoutSeconds: 90, lockTimeSeconds: 90, criticalFlag: 0, alarmOnFailFlag: 1, alarmReceiver: owners[0].user, logSuccessFlag: 1 } }), '创建独立暂停报价过期验证任务');
    jobId = database('SELECT job_id FROM sys_job WHERE job_name=' + sql(marker) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
    await openLock(samples[0]); failedExecution = await trigger();
    const waits = await waitFor(() => rows("SELECT JSON_OBJECT('connection',CAST(r.PROCESSLIST_ID AS CHAR),'db',d.OBJECT_SCHEMA,'table',d.OBJECT_NAME,'index',d.INDEX_NAME,'data',d.LOCK_DATA) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads b ON b.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.threads r ON r.THREAD_ID=w.REQUESTING_THREAD_ID JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND d.ENGINE=w.ENGINE WHERE b.PROCESSLIST_ID=" + lock.connection + ';'), values => values.length > 0, 'Real customer refresh did not reach owned row lock', 25000);
    console.log('A3_QUOTE_LOCK_OBSERVATION: ' + JSON.stringify({ expectedCustomer: samples[0].customer, waits }));
    assert.equal(waits.length, 1, 'Expected one customer update waiting on the owned lock');
    assert.ok(waits[0].db === 'cloud_flow_db' && waits[0].table === 'crm_customer' && waits[0].index === 'PRIMARY' && waits[0].data === samples[0].customer);
    const quoteLocks = rows("SELECT JSON_OBJECT('id',d.LOCK_DATA) FROM performance_schema.data_locks d JOIN performance_schema.threads t ON t.THREAD_ID=d.THREAD_ID WHERE t.PROCESSLIST_ID=" + waits[0].connection + " AND d.OBJECT_SCHEMA='cloud_flow_db' AND d.OBJECT_NAME='crm_quote' AND d.INDEX_NAME='PRIMARY' AND d.LOCK_STATUS='GRANTED' AND d.LOCK_MODE LIKE 'X%';");
    check('客户刷新故障前实际事务已锁定本租户报价更新', quoteLocks.some(item => samples[0].due.some(quote => quote.id === item.id)));
    assert.match(waits[0].connection, /^[1-9][0-9]*$/); database('KILL QUERY ' + waits[0].connection + ';'); evidence.injection = true;
    const failed = await waitFor(() => ownLog(failedExecution.executeNo), value => value && value.status !== 'RUNNING', 'Quote failure not reported');
    await lock.release();
    const failedQuotes = quotes();
    check('客户刷新失败使本租户五份报价整体回滚且其他租户继续', samples[0].due.every(quote => failedQuotes.find(item => item.id === quote.id)?.status === quote.status)
      && samples[1].due.every(quote => failedQuotes.find(item => item.id === quote.id)?.status === 'EXPIRED')); evidence.continuation = true; evidence.rollback = true;
    check('报价部分失败保存FAILED和租户原异常', failed.status === 'FAILED' && failed.affected === null && failed.stack.includes('报价过期处理存在失败租户')
      && failed.stack.includes('100000') && failed.report && failed.actor === 'g_import_admin' && failed.trigger === 'MANUAL'); evidence.failure = true;
    const alarm = await waitFor(() => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(failedExecution.executeNo) + ';'), values => values.length === 1 && values[0].status === 'SUCCESS', 'Quote failure alarm was not delivered');
    check('报价失败真实告警送达指定人员', alarm[0].receiver === owners[0].user && alarm[0].channel === 'INTERNAL');
    successful(await api(employee, '/auth/system/message/mine/' + alarm[0].id), '员工读取报价过期失败告警'); evidence.alarm = true;
    check('已接受已过期及今天未来无日期和已删除报价保持', untouchedGuards()); evidence.boundaries = true;
    await sleep(5300); assert.equal(dueCandidates(), '5'); const recovered = await trigger();
    const success = await waitFor(() => ownLog(recovered.executeNo), value => value && value.status !== 'RUNNING', 'Quote recovery not completed');
    check('修复后真实处理剩余五份报价并记录准确单据数和摘要', success.status === 'SUCCESS' && success.affected === 5
      && success.message === '报价过期处理完成：已处理5份报价' && Number.isInteger(success.duration) && success.report);
    check('恢复后六份到期报价均过期且全部边界保持', samples.flatMap(sample => sample.due).every(quote => quotes().find(item => item.id === quote.id)?.status === 'EXPIRED') && untouchedGuards() && dueCandidates() === '0');
    evidence.recovery = true; evidence.counts = true;
    const target = '/inner/job/status/' + recovered.executeNo;
    const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-crm', 'GET', target, ''); secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + crm.port + target, { headers, signal: AbortSignal.timeout(10000) }); const body = await response.json();
    check('报价执行服务真实签名反查与管理数量摘要一致', response.status === 200 && body.code === 200 && body.data.affectedRows === 5 && body.data.resultMsg === success.message);
    const beforeRepeat = JSON.stringify(quotes()); await sleep(5300); const again = await trigger();
    const repeated = await waitFor(() => ownLog(again.executeNo), value => value && value.status !== 'RUNNING', 'Repeated quote expiration did not finish');
    check('重复扫描准确返回零份且全部报价版本保持', repeated.status === 'SUCCESS' && repeated.affected === 0 && repeated.message === '报价过期处理完成：已处理0份报价' && JSON.stringify(quotes()) === beforeRepeat); evidence.repeat = true;
    const denied = await api(employee, root + '/log/' + failed.id);
    check('告警收件员工不能越权查看后台任务日志', denied.status === 403 && !denied.body?.data); evidence.permissions = true;
    console.log('A3_QUOTE_ACTUAL: ' + JSON.stringify({ jobId, recoveredQuotes: 5, dueQuotes: 6, boundaryQuotes: guards.length, failedExecution: failedExecution.executeNo, recoveredExecution: recovered.executeNo, repeatedExecution: again.executeNo, realQueryFailure: true, forcedTerminalWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    try { if (lock) await lock.release(); } catch (error) { failure ||= error; }
    try {
      if (jobId) await waitFor(logs, values => values.every(value => value.status !== 'RUNNING'), 'Quote job still running during cleanup', 90000);
      for (const table of ['crm_quote', 'crm_customer']) database('UPDATE ' + table + ' SET deleted=1 WHERE create_by=' + sql(marker) + ';');
      check('报价样本停用且原报价任务授权保持并保留实际记录', config() === oldConfig && grants() === oldGrants && originalQuotes() === beforeOriginalQuotes
        && samples.every(sample => database('SELECT deleted FROM crm_customer WHERE customer_id=' + sample.customer + ';') === '1') && quotes().every(quote => quote.deleted === 1));
      check('报价过期处理自有行锁连接已关闭', !lock?.connection || database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID=' + lock.connection + ';') === '0'); evidence.restoration = true;
    } catch (error) { failure ||= error; }
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const item of state.services) {
    const directory = path.join(state.run, item.name); const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) { const scan = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks; }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('报价任务与审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_QUOTE_SECRET_SCAN: ' + JSON.stringify({ files, bytes, values: secrets.size, leaks, databaseBytes: audit.bytes, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}
