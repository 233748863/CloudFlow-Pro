import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyOpportunityImportRecovery(harness) {
  const { admin, api, successful, database, check, state, directory, caseTag, evidence,
    upload, validate, execute, definition, createOpportunity, detail, createRow, updateRow, sql, waitFor, guardMilliseconds } = harness;
  const first = await createOpportunity('recovery_first');
  const blocked = await createOpportunity('recovery_blocked');
  const prefix = 'H3_IMPORT_' + caseTag + '_recovery_create_';
  const rows = Array.from({ length: 199 }, (unused, index) => createRow(prefix + index));
  rows.splice(1, 0, updateRow(first, { remark: '中断前已提交的更新' }));
  rows.push(updateRow(blocked, { remark: '恢复后提交的更新' }));
  const uploaded = await upload(admin, definition, rows, 'opportunity-recovery-' + caseTag);
  const validated = await validate(admin, uploaded);
  check('201行混合恢复文件完整预校验且尚未写入', validated.validRows === 201 && validated.invalidRows === 0
    && database('SELECT COUNT(*) FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name LIKE ' + sql(prefix + '%') + ';') === '0');
  let lockProcess, lockConnection, pendingRequest;
  const taskId = String(uploaded.task.taskId);
  const observation = { taskId, blockedOpportunityId: blocked.opportunityId, connectionWaits: [], interruptionIssued: false };
  const taskState = () => JSON.parse(database("SELECT JSON_OBJECT('status',status,'successRows',success_rows,'failRows',fail_rows,'jobLogId',job_log_id) FROM sys_import_task WHERE tenant_id=100000 AND task_id=" + taskId + ';'));
  const release = async () => {
    if (!lockProcess || lockProcess.exitCode !== null) return;
    const ended = new Promise(resolve => lockProcess.once('exit', resolve));
    if (lockConnection) database('KILL CONNECTION ' + lockConnection + ';');
    else lockProcess.kill();
    await ended;
  };
  try {
    const environment = { ...process.env };
    delete environment.MYSQL_PWD;
    let output = '', processError;
    const statement = 'START TRANSACTION; SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_id='
      + blocked.opportunityId + " FOR UPDATE; SELECT CONCAT('OWNED_LOCK:',CONNECTION_ID()); DO SLEEP(180); ROLLBACK;";
    lockProcess = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '--port=' + state.mysqlPort,
      '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db', '--execute=' + statement],
    { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    lockProcess.stdout.on('data', bytes => { output += bytes.toString(); });
    lockProcess.stderr.resume();
    lockProcess.on('error', error => { processError = error; });
    lockConnection = await waitFor(() => {
      if (processError) throw processError;
      assert.equal(lockProcess.exitCode, null, 'Owned lock must remain active');
      return output.match(/OWNED_LOCK:(\d+)/)?.[1];
    }, value => !!value, 'Owned opportunity lock did not start', 30000);
    observation.lockConnection = lockConnection;
    pendingRequest = api(admin, '/crm/system/import/' + taskId + '/execute', { method: 'POST', body: { skipInvalidRows: false } })
      .then(result => ({ result }), error => ({ requestError: error.message }));
    const checkpoint = await waitFor(taskState, value => value.successRows === 200 && value.status === 'IMPORTING',
      'First import batch did not commit before interruption', 120000);
    observation.checkpoint = checkpoint;
    observation.waitStarted = Date.now();
    // Live revalidation locks the opportunity before a progress-row transaction
    // starts. Resolve the owned record wait through transaction IDs: the server
    // can report a reused blocking THREAD_ID for an earlier lock owner.
    const workerStatement = 'SELECT DISTINCT requester.trx_mysql_thread_id FROM performance_schema.data_lock_waits waiting'
      + ' JOIN information_schema.innodb_trx requester ON requester.trx_id=waiting.REQUESTING_ENGINE_TRANSACTION_ID'
      + ' JOIN information_schema.innodb_trx blocker ON blocker.trx_id=waiting.BLOCKING_ENGINE_TRANSACTION_ID'
      + ' JOIN performance_schema.data_locks requested ON requested.ENGINE=waiting.ENGINE'
      + ' AND requested.ENGINE_LOCK_ID=waiting.REQUESTING_ENGINE_LOCK_ID'
      + ' WHERE blocker.trx_mysql_thread_id=' + lockConnection
      + " AND requested.OBJECT_SCHEMA='cloud_flow_db' AND requested.OBJECT_NAME='crm_opportunity'"
      + " AND requested.INDEX_NAME='PRIMARY' AND requested.LOCK_TYPE='RECORD' AND requested.LOCK_STATUS='WAITING'"
      + ' AND requested.LOCK_DATA=' + sql(blocked.opportunityId) + ';';
    const waitingConnection = await waitFor(() => {
      const legacy = database('SELECT DISTINCT requester.PROCESSLIST_ID FROM performance_schema.data_lock_waits waiting'
        + ' JOIN performance_schema.threads requester ON requester.THREAD_ID=waiting.REQUESTING_THREAD_ID'
        + ' JOIN performance_schema.threads blocker ON blocker.THREAD_ID=waiting.BLOCKING_THREAD_ID'
        + ' WHERE blocker.PROCESSLIST_ID=' + lockConnection + ';');
      const worker = database(workerStatement);
      const snapshot = { elapsedMilliseconds: Date.now() - observation.waitStarted, legacy, worker, task: taskState() };
      observation.connectionWaits.push(snapshot);
      return worker;
    }, value => /^[1-9]\d*$/.test(value),
    'Import worker did not wait on the owned record lock', 30000);
    observation.waitingConnection = waitingConnection;
    assert.notEqual(waitingConnection, lockConnection);
    const repeated = await api(admin, '/crm/system/import/' + taskId + '/execute', { method: 'POST', body: { skipInvalidRows: false } });
    check('导入运行中重复提交拒绝且已提交进度保持200行', repeated.body?.code !== 200
      && taskState().successRows === checkpoint.successRows);
    assert.equal(database(workerStatement), waitingConnection, 'Interrupt only the connection still waiting on this owned opportunity');
    database('KILL CONNECTION ' + waitingConnection + ';');
    observation.interruptionIssued = true;
    await pendingRequest;
    pendingRequest = null;
    const failed = await waitFor(taskState, value => value.status === 'FAILED', 'Interrupted database work did not leave a resumable task', 30000);
    check('真实数据库连接中断后任务失败并保留200行提交点', failed.successRows === 200 && failed.failRows === 0);
    check('中断前新增199条及首条更新实际提交，阻塞行未修改',
      database('SELECT COUNT(*) FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name LIKE ' + sql(prefix + '%') + ';') === '199'
      && (await detail(first.opportunityId)).version === first.version + 1
      && (await detail(blocked.opportunityId)).version === blocked.version);
    await release();
    await new Promise(resolve => setTimeout(resolve, guardMilliseconds));
    const completed = await execute(admin, uploaded, false);
    check('同一任务从第201行恢复并准确完成全部新增与更新', completed.status === 'SUCCESS'
      && completed.successRows === 201 && completed.failRows === 0 && String(completed.jobLogId) !== String(failed.jobLogId));
    check('恢复没有重复新增、重复改写版本或遗漏末行',
      database('SELECT COUNT(*) FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name LIKE ' + sql(prefix + '%') + ';') === '199'
      && (await detail(first.opportunityId)).version === first.version + 1
      && (await detail(blocked.opportunityId)).version === blocked.version + 1);
    check('恢复后的199条新增各保留唯一初始阶段历史',
      database('SELECT COUNT(*) FROM crm_opportunity_stage_history history JOIN crm_opportunity opportunity'
        + ' ON opportunity.tenant_id=history.tenant_id AND opportunity.opportunity_id=history.opportunity_id'
        + ' WHERE opportunity.tenant_id=100000 AND opportunity.opportunity_name LIKE ' + sql(prefix + '%') + ';') === '199');
    await fs.writeFile(path.join(directory, 'h3-import-recovery-' + caseTag + '.json'),
      JSON.stringify({ taskId, checkpoint, failed, completed, interruption: 'owned_blocked_database_connection', servicesRestarted: false }, null, 2), { flag: 'wx' });
    evidence.recovery = true;
  } catch (error) {
    observation.failure = error.message;
    observation.failureTask = taskState();
    observation.failureLocks = JSON.parse(database("SELECT JSON_OBJECT('waits',(SELECT JSON_ARRAYAGG(JSON_OBJECT('requestingThread',REQUESTING_THREAD_ID,'blockingThread',BLOCKING_THREAD_ID,'requestingTransaction',REQUESTING_ENGINE_TRANSACTION_ID,'blockingTransaction',BLOCKING_ENGINE_TRANSACTION_ID)) FROM performance_schema.data_lock_waits),'transactions',(SELECT JSON_ARRAYAGG(JSON_OBJECT('id',trx_id,'connection',trx_mysql_thread_id,'state',trx_state,'rowsLocked',trx_rows_locked)) FROM information_schema.innodb_trx),'locks',(SELECT JSON_ARRAYAGG(JSON_OBJECT('transaction',ENGINE_TRANSACTION_ID,'thread',THREAD_ID,'table',OBJECT_NAME,'index',INDEX_NAME,'type',LOCK_TYPE,'mode',LOCK_MODE,'status',LOCK_STATUS,'data',LOCK_DATA)) FROM performance_schema.data_locks WHERE OBJECT_SCHEMA='cloud_flow_db' AND OBJECT_NAME IN ('sys_import_task','crm_opportunity')));"));
    throw error;
  } finally {
    await release();
    if (pendingRequest) await pendingRequest;
    observation.finalTask = taskState();
    await fs.writeFile(path.join(directory, 'h3-import-recovery-observation-' + caseTag + '.json'),
      JSON.stringify(observation, null, 2), { flag: 'wx' });
  }
}
