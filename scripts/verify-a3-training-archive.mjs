import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

export async function verifyA3TrainingArchive({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3T' + caseTag;
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
  const root = '/auth/system/job'; const hr = state.services.find(item => item.name === 'hr'); assert.ok(hr);
  const owners = rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE user_name IN ('g_holiday_employee','g_import_tenant') AND deleted=0 AND status='0' ORDER BY tenant_id;");
  assert.equal(owners.length, 2); assert.equal(owners[0].tenant, '100000'); assert.equal(owners[1].tenant, '100001');
  for (const owner of owners) for (const value of Object.values(owner)) assert.match(value, /^[1-9][0-9]*$/);
  const original = successful(await api(admin, root + '/107'), '读取原培训归档重建任务');
  assert.ok(original.handlerName === 'trainingArchiveRebuild' && original.status === 'PAUSED');
  assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name='trainingArchiveRebuild';"), '0');
  const config = () => database("SELECT tenant_id,job_id,job_name,handler_name,status,cron_expression,interval_ms,timeout_seconds,lock_time_seconds,alarm_receiver,deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig = config(); const oldGrants = grants();
  const samples = []; let jobId; let lock; let failedExecution; let failure;
  const executions = [];
  const archive = sample => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'employee',CAST(employee_id AS CHAR),'hours',CAST(total_hours AS CHAR),'completed',completion_count,'ongoing',ongoing_count,'certificates',cert_count,'yearHours',year_hours,'day',last_training_date) FROM hr_training_archive WHERE id=" + sample.archive + ';')[0];
  const logs = () => jobId ? rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'report',report_time,'end',end_time) FROM sys_job_log WHERE job_id=" + jobId + ' ORDER BY log_id;') : [];
  const ownLog = no => logs().find(item => item.executeNo === no);
  const expectedCount = () => Number(database("SELECT COUNT(*) FROM hr_employee e JOIN sys_tenant t ON t.tenant_id=e.tenant_id WHERE e.deleted=0 AND t.deleted=0 AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW());"));
  const expectedArchive = sample => {
    const value = archive(sample); const year = String(new Date().getFullYear());
    return value.tenant === sample.tenant && value.employee === sample.employee && value.hours === '3.50'
      && value.completed === 1 && value.ongoing === 0 && value.certificates === 0 && Number(value.yearHours?.[year]) === 3.5;
  };
  const trigger = async () => {
    const result = successful(await api(admin, root + '/' + jobId + '/trigger', { method: 'POST', body: {} }), '管理员实际执行培训档案重建');
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
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("ROLLBACK; SELECT 'A3_TRAINING_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned archive lock release timed out'); }
      assert.ok(code === 0 && !processError && output.includes('A3_TRAINING_RELEASED'), 'Owned archive lock helper failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, connection: null };
    child.stdin.write('START TRANSACTION; SELECT id FROM hr_training_archive WHERE id=' + sample.archive + ' AND create_by=' + sql(marker) + " FOR UPDATE; SELECT CONCAT('A3_TRAINING_READY:',CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_TRAINING_READY:[0-9]+/.test(value), 'Archive lock not ready', 5000);
    lock.connection = output.match(/A3_TRAINING_READY:([0-9]+)/)[1];
  };
  try {
    for (const [index, owner] of [owners[0], owners[0], owners[1]].entries()) {
      const suffix = marker + index;
      database('INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,create_by) VALUES(' + owner.tenant + ',' + sql(suffix) + ',' + sql(suffix) + ",'UNKNOWN'," + owner.dept + ",'ACTIVE'," + sql(marker) + ');');
      const employeeId = database('SELECT id FROM hr_employee WHERE employee_no=' + sql(suffix) + ';'); assert.match(employeeId, /^[1-9][0-9]*$/);
      const sample = { tenant: owner.tenant, employee: employeeId, suffix }; samples.push(sample);
      database('INSERT INTO hr_training_course(tenant_id,course_code,course_name,credit_hours,create_by) VALUES(' + owner.tenant + ',' + sql(suffix) + ',' + sql(suffix) + ',3.50,' + sql(marker) + ');');
      sample.course = database('SELECT id FROM hr_training_course WHERE tenant_id=' + owner.tenant + ' AND course_code=' + sql(suffix) + ';');
      database('INSERT INTO hr_training_session(tenant_id,course_id,session_no,start_time,end_time,create_by) VALUES(' + owner.tenant + ',' + sample.course + ',' + sql(suffix) + ',CURRENT_DATE,DATE_ADD(CURRENT_DATE,INTERVAL 4 HOUR),' + sql(marker) + ');');
      sample.session = database('SELECT id FROM hr_training_session WHERE tenant_id=' + owner.tenant + ' AND session_no=' + sql(suffix) + ';');
      database("INSERT INTO hr_training_enrollment(tenant_id,session_id,employee_id,status,completion_status,create_by) VALUES(" + owner.tenant + ',' + sample.session + ',' + employeeId + ",'APPROVED','PASSED'," + sql(marker) + ');');
      database('INSERT INTO hr_training_archive(tenant_id,employee_id,total_hours,completion_count,ongoing_count,cert_count,create_by) VALUES(' + owner.tenant + ',' + employeeId + ',999,99,99,99,' + sql(marker) + ');');
      sample.archive = database('SELECT id FROM hr_training_archive WHERE tenant_id=' + owner.tenant + ' AND employee_id=' + employeeId + ' AND deleted=0;'); assert.match(sample.archive, /^[1-9][0-9]*$/);
    }
    successful(await api(admin, root, { method: 'POST', body: { ...original, jobId: undefined, jobName: marker, jobGroup: 'A3_VERIFY', handlerParam: marker,
      status: 'PAUSED', triggerType: 'FIXED_RATE', cronExpression: null, intervalMs: 60000, concurrentFlag: 0, misfireStrategy: 'IGNORE', retryCount: 0,
      dispatchRetryCount: 0, timeoutSeconds: 90, lockTimeSeconds: 90, criticalFlag: 0, alarmOnFailFlag: 1, alarmReceiver: owners[0].user, logSuccessFlag: 1 } }), '创建独立暂停培训重建验证任务');
    jobId = database('SELECT job_id FROM sys_job WHERE job_name=' + sql(marker) + ' AND deleted=0;'); assert.match(jobId, /^[1-9][0-9]*$/);
    await openLock(samples[0]); failedExecution = await trigger();
    const waits = await waitFor(() => rows("SELECT JSON_OBJECT('connection',CAST(r.PROCESSLIST_ID AS CHAR),'db',d.OBJECT_SCHEMA,'table',d.OBJECT_NAME,'index',d.INDEX_NAME,'data',d.LOCK_DATA) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads b ON b.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.threads r ON r.THREAD_ID=w.REQUESTING_THREAD_ID JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND d.ENGINE=w.ENGINE WHERE b.PROCESSLIST_ID=" + lock.connection + ';'), values => values.length > 0, 'Real archive update did not reach owned row lock', 25000);
    console.log('A3_TRAINING_LOCK_OBSERVATION: ' + JSON.stringify({ expectedArchive: samples[0].archive, waits }));
    assert.equal(waits.length, 1, 'Expected one archive update waiting on the owned lock');
    assert.ok(waits[0].db === 'cloud_flow_db' && waits[0].table === 'hr_training_archive' && waits[0].index === 'PRIMARY' && waits[0].data === samples[0].archive);
    assert.match(waits[0].connection, /^[1-9][0-9]*$/); database('KILL QUERY ' + waits[0].connection + ';'); evidence.injection = true;
    const failed = await waitFor(() => ownLog(failedExecution.executeNo), value => value && value.status !== 'RUNNING', 'Archive failure not reported');
    await lock.release();
    check('单名员工重建失败后同租户其他员工和另一租户仍重建', archive(samples[0]).hours === '999.00' && expectedArchive(samples[1]) && expectedArchive(samples[2])); evidence.continuation = true;
    check('培训重建部分失败保存FAILED及员工和租户原异常', failed.status === 'FAILED' && failed.affected === null && failed.stack.includes('培训档案重建存在失败员工') && failed.stack.includes(samples[0].employee) && failed.stack.includes('培训档案重建存在失败租户') && failed.report && failed.actor === 'g_import_admin' && failed.trigger === 'MANUAL'); evidence.failure = true;
    const alarm = await waitFor(() => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(failedExecution.executeNo) + ';'), values => values.length === 1 && values[0].status === 'SUCCESS', 'Training failure alarm was not delivered');
    check('培训失败实际告警送达指定员工', alarm[0].receiver === owners[0].user && alarm[0].channel === 'INTERNAL');
    successful(await api(employee, '/auth/system/message/mine/' + alarm[0].id), '员工读取培训重建失败告警'); evidence.alarm = true;
    await sleep(5300); const count = expectedCount(); const recovered = await trigger();
    const success = await waitFor(() => ownLog(recovered.executeNo), value => value && value.status !== 'RUNNING', 'Training recovery not completed');
    check('修复故障后按全部活跃租户实际员工数记录成功和摘要', success.status === 'SUCCESS' && success.affected === count && expectedCount() === count && success.message === '培训档案重建完成：已刷新' + count + '名员工' && Number.isInteger(success.duration) && success.report);
    check('失败员工与其他样本均恢复准确学时和完成数量', samples.every(expectedArchive)); evidence.recovery = true; evidence.counts = true;
    const target = '/inner/job/status/' + recovered.executeNo;
    const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-hr', 'GET', target, ''); secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + hr.port + target, { headers, signal: AbortSignal.timeout(10000) }); const body = await response.json();
    check('真实签名反查与管理归档人数和摘要一致', response.status === 200 && body.code === 200 && body.data.affectedRows === count && body.data.resultMsg === success.message);
    const beforeRepeat = JSON.stringify(samples.map(archive)); await sleep(5300); const again = await trigger();
    const repeated = await waitFor(() => ownLog(again.executeNo), value => value && value.status !== 'RUNNING', 'Repeated training rebuild did not finish');
    check('重复重建统计准确且原有档案不重复创建或累加学时', repeated.status === 'SUCCESS' && repeated.affected === count && JSON.stringify(samples.map(archive)) === beforeRepeat); evidence.repeat = true;
    const denied = await api(employee, root + '/log/' + failed.id);
    check('告警收件员工不能越权查看后台任务日志', denied.status === 403 && !denied.body?.data); evidence.permissions = true;
    console.log('A3_TRAINING_ACTUAL: ' + JSON.stringify({ jobId, expectedEmployees: count, fixtureEmployees: samples.length, failedExecution: failedExecution.executeNo, recoveredExecution: recovered.executeNo, repeatedExecution: again.executeNo, realQueryFailure: true, forcedTerminalWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    try { if (lock) await lock.release(); } catch (error) { failure ||= error; }
    try {
      if (jobId) await waitFor(logs, values => values.every(value => value.status !== 'RUNNING'), 'Training rebuild still running during cleanup', 90000);
      for (const table of ['hr_training_enrollment', 'hr_training_session', 'hr_training_course', 'hr_training_archive', 'hr_employee']) database('UPDATE ' + table + ' SET deleted=1 WHERE create_by=' + sql(marker) + ';');
      check('培训样本停用且原任务授权保持并保留实际记录', config() === oldConfig && grants() === oldGrants && samples.every(sample => database('SELECT deleted FROM hr_employee WHERE id=' + sample.employee + ';') === '1'));
      check('培训重建自有行锁连接已关闭', !lock?.connection || database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID=' + lock.connection + ';') === '0'); evidence.restoration = true;
    } catch (error) { failure ||= error; }
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const item of state.services) {
    const directory = path.join(state.run, item.name); const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) { const scan = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks; }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('培训任务与审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_TRAINING_SECRET_SCAN: ' + JSON.stringify({ files, bytes, values: secrets.size, leaks, databaseBytes: audit.bytes, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}
