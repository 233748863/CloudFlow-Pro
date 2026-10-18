import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openSync, closeSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyRecovery(harness) {
  const { admin, api, successful, session, database, check, state, directory, caseTag, pending, upload, validate, execute } = harness;
  assert.ok(state.services.some(service => service.name === 'oa'), 'Real OA service is required for interruption verification');
  const scripts = path.dirname(fileURLToPath(import.meta.url));
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const numeric = value => { assert.match(String(value), /^[1-9][0-9]*$/); return value; };
  const isDenied = result => result.status >= 400 || (result.body && result.body.code !== 200);
  const taskState = taskId => JSON.parse(database(`SELECT JSON_OBJECT('status',status,'successRows',success_rows,'failRows',fail_rows,'jobLogId',job_log_id) FROM sys_import_task WHERE task_id=${numeric(taskId)};`));
  const fileRows = taskId => JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',file_id,'path',file_path,'size',file_size)),JSON_ARRAY()) FROM sys_file WHERE tenant_id=100000 AND biz_type='IMPORT_TASK' AND biz_id='${numeric(taskId)}' AND deleted=0;`));
  const localPath = reference => {
    const root = path.join(directory, 'profile');
    const target = path.resolve(root, reference.replace(/^\//, ''));
    assert.ok(target.startsWith(root + path.sep));
    return target;
  };
  const control = action => {
    const logPath = path.join(directory, `service-${caseTag}-${action}.log`);
    const output = openSync(logPath, 'a');
    try {
      const result = spawnSync('pwsh.exe', ['-NoProfile', '-File', path.join(scripts, 'control-batch-g-service.ps1'), '-StatePath', path.join(directory, 'state.json'), '-ServiceName', 'oa', '-Action', action], { stdio: ['ignore', output, output], timeout: 300000, windowsHide: true });
      assert.ok(!result.error, `${action} isolated OA service failed; inspect ${logPath}`);
      assert.equal(result.status, 0, `${action} isolated OA service failed; inspect ${logPath}`);
    } finally { closeSync(output); }
  };
  const eventually = async (read, accepted, label, timeout = 180000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await read();
      if (accepted(value)) return value;
      await pause(250);
    }
    throw new Error(label);
  };
  const trigger = async (page, handler, handlerParam) => {
    assert.match(handler, /^[A-Za-z]+$/);
    const jobId = database(`SELECT job_id FROM sys_job WHERE tenant_id=100000 AND service_name='auth' AND handler_name='${handler}' AND deleted=0;`);
    const started = successful(await api(page, `/auth/system/job/${numeric(jobId)}/trigger`, { method: 'POST', body: handlerParam ? { handlerParam } : {} }), `触发真实${handler}任务`);
    assert.equal(started.accepted, true, started.reason);
    assert.match(started.executeNo, /^[a-f0-9-]+$/i);
    const status = await eventually(() => database(`SELECT execute_status FROM sys_job_log WHERE execute_no='${started.executeNo}';`), value => !['', 'PENDING', 'RUNNING'].includes(value), 'Real system job did not finish');
    assert.equal(status, 'SUCCESS', `${handler} completes successfully`);
    return started;
  };
  let stopped = false;
  let databaseLock;
  let outstanding;
  const extraSessions = [];
  const holdSuppliers = async () => {
    const environment = { ...process.env };
    delete environment.MYSQL_PWD;
    let output = '';
    let error;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db', '--execute=LOCK TABLES oa_supplier WRITE; SELECT CONNECTION_ID(); DO SLEEP(180);'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: environment });
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.resume();
    child.on('error', failure => { error = failure; });
    databaseLock = child;
    const connection = await eventually(() => {
      if (error) throw error;
      if (child.exitCode !== null) throw new Error('Isolated supplier lock ended before interruption');
      return output.trim();
    }, value => /^[1-9][0-9]*$/.test(value), 'Isolated supplier lock was not acquired', 30000);
    child.connectionId = connection;
  };
  const releaseSuppliers = async () => {
    if (!databaseLock) return;
    const child = databaseLock;
    const exited = child.exitCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve));
    if (child.connectionId && child.exitCode === null) database(`KILL CONNECTION ${numeric(child.connectionId)};`);
    else if (child.exitCode === null) child.kill();
    await exited;
    databaseLock = null;
  };
  const interruptedRequest = (uploaded, phase) => {
    let completed = false;
    const request = api(admin, `/oa/system/import/${numeric(uploaded.task.taskId)}/${phase === 'VALIDATING' ? 'validate' : 'execute'}`, { method: 'POST', ...(phase === 'IMPORTING' ? { body: { skipInvalidRows: false } } : {}) })
      .then(result => { completed = true; return result; }, error => { completed = true; return { networkError: error.message }; });
    outstanding = request;
    return { result: request, completed: () => completed };
  };
  const restartAfterInterruption = async (uploaded, phase, active) => {
    control('Stop');
    stopped = true;
    await releaseSuppliers();
    const response = await outstanding;
    outstanding = null;
    check(`${phase}同步请求在真实停机后失败而非返回成功`, !!response.networkError || isDenied(response));
    const checkpoint = taskState(uploaded.task.taskId);
    if (active.jobLogId) {
      database(`UPDATE sys_job_log SET start_time=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE log_id=${numeric(active.jobLogId)};`);
      await trigger(admin, 'jobTimeoutInspect');
      check(`${phase}中断执行由集中任务巡检结束`, database(`SELECT execute_status FROM sys_job_log WHERE log_id=${numeric(active.jobLogId)};`) === 'TIMEOUT');
    }
    control('Start');
    stopped = false;
    const recovered = successful(await api(admin, `/oa/system/import/${numeric(uploaded.task.taskId)}`), `${phase}重启后读取任务`);
    await fs.writeFile(path.join(directory, `sync-recovery-${phase.toLowerCase()}-${caseTag}.json`), JSON.stringify({ taskId: uploaded.task.taskId, interrupted: checkpoint, recovered }, null, 2));
    check(`${phase}同步任务重启后可重试并保留已提交进度`, recovered.status === 'FAILED' && recovered.successRows === checkpoint.successRows && recovered.failRows === checkpoint.failRows);
    return recovered;
  };
  try {
    successful(await api(admin, '/auth/system/file/config', { method: 'POST', body: { configCode: `G_${caseTag}_RECOVERY`, configName: '导入恢复与清理验收', storageType: 'LOCAL', masterFlag: 1, basePath: `g-recovery/${caseTag}`, maxFileSize: 20971520, allowedExtensions: 'csv,txt,xlsx', accessPolicy: '0', status: 'ENABLED' } }), '独立本地恢复验收配置');
    const holiday = { ...successful(await api(admin, '/auth/system/import/types'), '节假日业务定义').find(definition => definition.bizType === 'HOLIDAY'), service: 'auth' };
    const supplier = { ...successful(await api(admin, '/oa/system/import/types'), '供应商业务定义').find(definition => definition.bizType === 'SUPPLIER'), service: 'oa' };
    assert.ok(holiday.bizType && supplier.bizType);
    if (harness.syncOnly) {
      const prefix = `GS${caseTag}`;
      const rows = Array.from({ length: 500 }, (unused, index) => ({ supplierCode: `${prefix}${String(index).padStart(4, '0')}`, supplierName: `同步恢复供应商${index + 1}`, categoryId: 'G_IMPORT_SUPPLIER', supplierType: 'SERVICE', creditCode: `S${caseTag.toUpperCase()}${String(index).padStart(5, '0')}`, contactName: '恢复验收', contactPhone: '010-12345678', contactEmail: 'sync-recovery@example.test', registerCapital: '1000.00', registerDate: '2020-01-01', taxRate: '0.13', currency: 'CNY', status: 'ACTIVE' }));
      const uploaded = await upload(admin, supplier, rows, 'synchronous-interruption');
      check('500行真实供应商文件满足同步执行大小条件', uploaded.task.totalRows === 500 && uploaded.task.fileSize <= 2 * 1024 * 1024);
      const jobId = numeric(database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND service_name='oa' AND handler_name='batchImport' AND deleted=0;"));
      database(`UPDATE sys_job SET deleted=1 WHERE job_id=${jobId};`);
      try {
        check('集中执行登记失败时同步校验被拒绝', isDenied(await api(admin, `/oa/system/import/${numeric(uploaded.task.taskId)}/validate`, { method: 'POST' })));
        const unchanged = taskState(uploaded.task.taskId);
        check('登记失败不留下无执行编号的运行任务', unchanged.status === 'UPLOADED' && unchanged.jobLogId === null && unchanged.successRows === 0);
      } finally { database(`UPDATE sys_job SET deleted=0 WHERE job_id=${jobId};`); }
      await pause(5200);
      await holdSuppliers();
      const validating = interruptedRequest(uploaded, 'VALIDATING');
      const validationRun = await eventually(() => taskState(uploaded.task.taskId), value => value.status === 'VALIDATING', 'Synchronous validation did not start');
      check('同步校验在数据库等待期间仍占用原请求', !validating.completed());
      const liveValidation = successful(await api(admin, `/oa/system/import/${numeric(uploaded.task.taskId)}`), '查询仍存活的同步校验');
      check('真实运行中的同步校验保持运行状态', liveValidation.status === 'VALIDATING');
      const competing = await api(admin, `/oa/system/import/${numeric(uploaded.task.taskId)}/execute`, { method: 'POST', body: { skipInvalidRows: false } });
      const afterCompetition = taskState(uploaded.task.taskId);
      check('失败的并发接管不能覆盖仍运行的同步执行', isDenied(competing) && afterCompetition.status === 'VALIDATING' && afterCompetition.jobLogId === validationRun.jobLogId);
      database(`UPDATE sys_job_log SET start_time=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE log_id=${numeric(validationRun.jobLogId)};`);
      await trigger(admin, 'jobTimeoutInspect', JSON.stringify({ caseTag, phase: 'live' }));
      check('达到巡检时限但实际仍运行的同步任务不会误判失败', database(`SELECT execute_status FROM sys_job_log WHERE log_id=${numeric(validationRun.jobLogId)};`) === 'RUNNING' && taskState(uploaded.task.taskId).status === 'VALIDATING');
      const validationFailure = await restartAfterInterruption(uploaded, 'VALIDATING', validationRun);
      check('校验中断没有写入供应商业务记录', database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code LIKE '${prefix}%';`) === '0');
      const validated = successful(await api(admin, `/oa/system/import/${numeric(uploaded.task.taskId)}/validate`, { method: 'POST' }), '同步重新校验');
      check('500行重校验直接返回完整结果且使用新执行记录', validated.status === 'VALIDATED' && validated.validRows === 500 && validated.invalidRows === 0 && !!validated.jobLogId && validated.jobLogId !== validationFailure.jobLogId);
      const importing = interruptedRequest(uploaded, 'IMPORTING');
      await eventually(() => taskState(uploaded.task.taskId), value => value.status === 'IMPORTING' && value.successRows > 0, 'Synchronous import did not commit any row');
      await holdSuppliers();
      const importRun = taskState(uploaded.task.taskId);
      check('500行同步导入中断前已提交部分记录且请求未结束', importRun.status === 'IMPORTING' && importRun.successRows > 0 && importRun.successRows < 500 && importRun.failRows === 0 && !importing.completed());
      const importFailure = await restartAfterInterruption(uploaded, 'IMPORTING', importRun);
      const committed = Number(database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code LIKE '${prefix}%';`));
      check('同步停机检查点与实际提交业务行数一致', importFailure.successRows === committed && committed > 0 && committed < 500);
      const other = await session('g_import_other');
      extraSessions.push(other);
      check('其他用户不能接管同步中断任务', isDenied(await api(other, `/oa/system/import/${numeric(uploaded.task.taskId)}/execute`, { method: 'POST', body: { skipInvalidRows: false } })));
      check('部分提交后不能重新校验清零进度', isDenied(await api(admin, `/oa/system/import/${numeric(uploaded.task.taskId)}/validate`, { method: 'POST' })) && taskState(uploaded.task.taskId).successRows === committed);
      const completed = successful(await api(admin, `/oa/system/import/${numeric(uploaded.task.taskId)}/execute`, { method: 'POST', body: { skipInvalidRows: false } }), '同步续传剩余供应商');
      check('同步恢复直接返回500行完成结果且执行编号更新', completed.status === 'SUCCESS' && completed.successRows === 500 && completed.failRows === 0 && !!completed.jobLogId && completed.jobLogId !== importFailure.jobLogId);
      check('同步续传实际保存500条且无重复业务编码', database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code LIKE '${prefix}%';`) === '500' && database(`SELECT COUNT(*) FROM (SELECT supplier_code FROM oa_supplier WHERE tenant_id=100000 AND supplier_code LIKE '${prefix}%' GROUP BY supplier_code HAVING COUNT(*)>1) duplicates;`) === '0');
      check('同步完成结果实际回报集中任务', await eventually(() => database(`SELECT execute_status FROM sys_job_log WHERE log_id=${numeric(completed.jobLogId)};`), value => value === 'SUCCESS', 'Synchronous result was not reported'));
      await fs.writeFile(path.join(directory, `sync-recovery-checkpoint-${caseTag}.json`), JSON.stringify({ taskId: uploaded.task.taskId, validationJobId: validationRun.jobLogId, oldJobId: importFailure.jobLogId, newJobId: completed.jobLogId, committedBeforeInterruption: committed, completedRows: completed.successRows }, null, 2));
      return;
    }
    const holidayRow = { calendarId: 'G_IMPORT_CALENDAR', holidayDate: '2059-01-02', dateType: 'HOLIDAY', yearNo: '2059', holidayName: `recovery-${caseTag}` };
    const old = await upload(admin, holiday, [holidayRow, { ...holidayRow, holidayDate: 'invalid-date' }], 'retention-expired');
    const oldValidated = await validate(admin, old);
    check('待清理任务通过真实校验产生错误行和错误文件', oldValidated.status === 'VALIDATED' && oldValidated.invalidRows === 1 && !!oldValidated.errorFileUrl);
    const expiredFiles = fileRows(old.task.taskId);
    check('到期场景有真实原文件和错误文件', expiredFiles.length === 2 && Number(database(`SELECT COUNT(*) FROM sys_import_error WHERE task_id=${numeric(old.task.taskId)};`)) > 0);
    const retained = successful(await api(admin, '/auth/system/file/upload', { method: 'POST', file: { name: `${caseTag}-retained.csv`, type: 'text/csv', content: old.content.toString('base64') } }), '为到期原文件创建独立保留引用');
    check('清理场景的普通文件引用真实复用导入原文件', expiredFiles.some(file => file.path === retained.filePath));
    await pause(5300);
    const recent = await upload(admin, holiday, [{ ...holidayRow, holidayDate: '2059-01-03' }], 'retention-boundary');

    const prefix = `GREC${caseTag}`;
    const totalRows = 2000;
    const rows = Array.from({ length: totalRows }, (unusedRow, index) => ({ supplierCode: `${prefix}${index}`, supplierName: `恢复验收供应商-${caseTag}-${index}`, categoryId: 'G_IMPORT_SUPPLIER', supplierType: 'SERVICE', status: 'ACTIVE' }));
    const interrupted = await upload(admin, supplier, rows, 'interrupted');
    const validated = await validate(admin, interrupted);
    check('2000行供应商经真实后台校验且尚未写业务数据', validated.status === 'VALIDATED' && validated.validRows === totalRows && database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code LIKE '${prefix}%';`) === '0');
    const running = successful(await api(admin, `/oa/system/import/${numeric(interrupted.task.taskId)}/execute`, { method: 'POST', body: { skipInvalidRows: false } }), '开始真实后台导入');
    const oldJobId = numeric(running.jobLogId);
    await eventually(() => taskState(interrupted.task.taskId), value => value.successRows > 0, 'No business row committed before interruption', 60000);
    control('Stop');
    stopped = true;
    const checkpoint = taskState(interrupted.task.taskId);
    const committed = Number(database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code LIKE '${prefix}%';`));
    check('真实进程中断留下未完成任务且业务行数等于检查点', checkpoint.status === 'IMPORTING' && checkpoint.successRows > 0 && checkpoint.successRows < totalRows && checkpoint.failRows === 0 && committed === checkpoint.successRows);
    database(`UPDATE sys_import_task SET create_time=DATE_SUB(NOW(),INTERVAL 31 DAY) WHERE task_id IN (${numeric(old.task.taskId)},${numeric(interrupted.task.taskId)}); UPDATE sys_import_task SET create_time=DATE_ADD(DATE_SUB(NOW(),INTERVAL 30 DAY),INTERVAL 1 HOUR) WHERE task_id=${numeric(recent.task.taskId)};`);
    await trigger(admin, 'importTaskCleanup');
    check('真实清理任务删除超过30天的导入任务和错误明细', database(`SELECT COUNT(*) FROM sys_import_task WHERE task_id=${numeric(old.task.taskId)};`) === '0' && database(`SELECT COUNT(*) FROM sys_import_error WHERE task_id=${numeric(old.task.taskId)};`) === '0');
    check('到期清理软删所有到期业务文件引用', database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND biz_type='IMPORT_TASK' AND biz_id='${numeric(old.task.taskId)}' AND deleted=0;`) === '0');
    const retainedContent = await api(admin, `/auth/system/file/${numeric(retained.fileId)}/content`);
    check('到期清理保留同物理对象的其他独立引用', retainedContent.status === 200 && retainedContent.sha256 === createHash('sha256').update(old.content).digest('hex'));
    const errorFiles = expiredFiles.filter(file => file.path !== retained.filePath);
    check('没有剩余引用的错误文件真实删除', errorFiles.length === 1 && !(await fs.stat(localPath(errorFiles[0].path)).then(() => true, () => false)));
    check('不足30天的任务与超过30天的运行任务均保留', database(`SELECT COUNT(*) FROM sys_import_task WHERE task_id IN (${numeric(recent.task.taskId)},${numeric(interrupted.task.taskId)});`) === '2' && taskState(interrupted.task.taskId).status === 'IMPORTING');
    database(`UPDATE sys_import_task SET create_time=NOW() WHERE task_id=${numeric(interrupted.task.taskId)}; UPDATE sys_job_log SET start_time=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE log_id=${oldJobId};`);
    await trigger(admin, 'jobTimeoutInspect');
    check('集中任务真实反查失败后把中断执行标为超时', database(`SELECT execute_status FROM sys_job_log WHERE log_id=${oldJobId};`) === 'TIMEOUT');
    control('Start');
    stopped = false;
    const failed = successful(await api(admin, `/oa/system/import/${numeric(interrupted.task.taskId)}`), '读取中断后任务');
    check('服务重启后任务转为可重试且保留已提交计数', failed.status === 'FAILED' && failed.successRows === committed && failed.failRows === 0);
    const other = await session('g_import_other');
    extraSessions.push(other);
    check('其他真实登录用户不能接管中断任务', isDenied(await api(other, `/oa/system/import/${numeric(interrupted.task.taskId)}/execute`, { method: 'POST', body: { skipInvalidRows: false } })));
    check('已提交任务不能重新校验以清零检查点', isDenied(await api(admin, `/oa/system/import/${numeric(interrupted.task.taskId)}/validate`, { method: 'POST' })) && taskState(interrupted.task.taskId).successRows === committed);
    const current = await session('g_import_admin');
    extraSessions.push(current);
    successful(await api(current, '/auth/info'), '重新登录后的真实身份仍有效');
    check('重新登录后已失效的旧身份不能恢复任务', isDenied(await api(admin, `/oa/system/import/${numeric(interrupted.task.taskId)}/execute`, { method: 'POST', body: { skipInvalidRows: false } })));
    const completed = await execute(current, interrupted, false);
    check('重新登录后恢复只处理剩余行并完成2000条业务记录', completed.status === 'SUCCESS' && completed.successRows === totalRows && completed.failRows === 0 && database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code LIKE '${prefix}%';`) === String(totalRows));
    check('中断恢复使用新的任务执行记录并保持旧记录终态', String(completed.jobLogId) !== String(oldJobId) && database(`SELECT execute_status FROM sys_job_log WHERE log_id=${oldJobId};`) === 'TIMEOUT');
    check('恢复后的业务编码没有重复记录', database(`SELECT COUNT(*) FROM (SELECT supplier_code FROM oa_supplier WHERE tenant_id=100000 AND supplier_code LIKE '${prefix}%' GROUP BY supplier_code HAVING COUNT(*)>1) duplicates;`) === '0');
    const newJobId = numeric(completed.jobLogId);
    const recoveredStatus = await eventually(() => database(`SELECT execute_status FROM sys_job_log WHERE log_id=${newJobId};`), value => value === 'SUCCESS', 'Recovered job result was not reported');
    check('恢复完成的后台结果实际回报成功', recoveredStatus === 'SUCCESS');
    const staleJob = successful(await api(current, '/auth/system/job/1752/trigger', { method: 'POST', body: { handlerParam: JSON.stringify({ taskId: interrupted.task.taskId, phase: 'IMPORTING', skipInvalidRows: false, jobLogId: oldJobId }) } }), '重放旧执行标识');
    assert.equal(staleJob.accepted, true, staleJob.reason);
    assert.match(staleJob.executeNo, /^[a-f0-9-]+$/i);
    const staleStatus = await eventually(() => database(`SELECT execute_status FROM sys_job_log WHERE execute_no='${staleJob.executeNo}';`), value => !['', 'PENDING', 'RUNNING'].includes(value), 'Old execution replay did not settle');
    check('旧执行标识重放被拒绝且不能覆盖新任务结果', staleStatus === 'FAILED' && taskState(interrupted.task.taskId).status === 'SUCCESS' && String(taskState(interrupted.task.taskId).jobLogId) === String(newJobId) && database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code LIKE '${prefix}%';`) === String(totalRows));
    const token = await current.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token, 'Current authenticated session remains present');
    const parameters = database(`SELECT COALESCE(handler_param,'') FROM sys_job WHERE job_id IN (SELECT job_id FROM sys_job_log WHERE log_id IN (${oldJobId},${newJobId})) UNION ALL SELECT CONCAT_WS('|',result_msg,exception_stack) FROM sys_job_log WHERE log_id IN (${oldJobId},${newJobId}) UNION ALL SELECT CONCAT_WS('|',file_url,error_file_url,error_message) FROM sys_import_task WHERE task_id=${numeric(interrupted.task.taskId)};`);
    check('后台配置、执行日志和文件引用没有登录令牌或签名URL', !parameters.includes(token.replace(/^Bearer /, '')) && !/Bearer |X-Amz-Signature|Authorization|"token"/i.test(parameters));
    const output = await api(current, `/oa/system/import/${numeric(interrupted.task.taskId)}/file`);
    check('中断恢复后原始导入文件仍可访问且内容未变', output.status === 200 && output.sha256 === createHash('sha256').update(interrupted.content).digest('hex'));
    await fs.writeFile(path.join(directory, `recovery-checkpoint-${caseTag}.json`), JSON.stringify({ taskId: interrupted.task.taskId, oldJobId, newJobId, committedBeforeInterruption: committed, completedRows: completed.successRows, expiredTaskId: old.task.taskId, retainedTaskId: recent.task.taskId }, null, 2));
    pending.push('员工导入仍等待真实HR服务；客户导入及完整业务页面仍需独立验收', '访问日志删除与不可删除触发器的既有冲突保持保护，未绕过');
  } finally {
    await releaseSuppliers();
    if (stopped) control('Start');
    if (outstanding) await outstanding;
    await Promise.all(extraSessions.map(page => page.context().close()));
  }
}
