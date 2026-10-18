import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyImportGeneratedCapacity({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, applyLimit, usage, physicalSnapshot, evidence }) {
  const prefix = `${caseTag}-generated-import-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const predicate = `tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')}`;
  const tasks = () => rows(`SELECT JSON_OBJECT('id',task_id,'name',file_name,'type',biz_type,'status',status,
    'file',file_url,'errorFile',error_file_url,'job',job_log_id,'success',success_rows,'failed',fail_rows,
    'valid',valid_rows,'invalid',invalid_rows,'message',error_message,'operator',operator_id)
    FROM sys_import_task WHERE ${predicate} ORDER BY task_id;`);
  const files = () => rows(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'business',biz_type,'businessId',biz_id,'deleted',deleted,'storage',storage_type,'owner',create_by)
    FROM sys_file WHERE tenant_id=${targetId} AND biz_type='IMPORT_TASK'
      AND biz_id IN (SELECT CAST(task_id AS CHAR) FROM sys_import_task WHERE ${predicate}) ORDER BY file_id;`);
  const beforeUsage = usage(); const beforeFiles = await physicalSnapshot();
  const jobs = () => rows(`SELECT JSON_OBJECT('id',job_id,'name',job_name,'service',service_name,'status',status,
    'handler',handler_name,'alarm',alarm_on_fail_flag,'parameter',handler_param)
    FROM sys_job WHERE tenant_id=${targetId} AND handler_name='batchImport' AND deleted=0 ORDER BY job_id;`);
  const beforeJobs = JSON.stringify(jobs());
  const preparedJobs = [];
  const accepted = []; let failure;
  const capacityMessage = '租户可用存储空间不足，无法新增文件';
  const current = item => { const task = tasks().find(task => task.id === item.id); assert.ok(task); return task; };
  const currentFiles = item => files().filter(file => file.businessId === String(item.id));
  const settled = async item => {
    const deadline = Date.now() + 90000;
    do {
      const task = current(item);
      if (!['VALIDATING', 'IMPORTING'].includes(task.status)) {
        assert.ok(task.job != null);
        const status = database(`SELECT execute_status FROM sys_job_log WHERE tenant_id=${targetId} AND log_id=${task.job};`);
        if (['SUCCESS', 'FAILED', 'TIMEOUT', 'DISPATCH_FAILED'].includes(status)) return task;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    throw new Error('导入错误报告任务未在限定时间完成');
  };
  const validate = async item => {
    successful(await api(tenantAdmin, `/${item.service}/system/import/${item.id}/validate`, { method: 'POST' }), `${item.service}真实执行文件校验`);
    return settled(item);
  };
  const download = async (item, errors, phase, expected) => {
    const response = await api(tenantAdmin, `/${item.service}/system/import/${item.id}/${errors ? 'errors/file' : 'file'}`);
    check(`${phase}${item.service}${errors ? '错误报告' : '原文件'}实际下载字节完整`, response.status === 200
      && response.size === expected.length && response.sha256 === createHash('sha256').update(expected).digest('hex'));
  };
  const ownedPath = async file => {
    assert.equal(file.storage, 'LOCAL'); assert.equal(file.business, 'IMPORT_TASK');
    const task = tasks().find(task => String(task.id) === file.businessId); assert.ok(task);
    assert.ok(file.name === task.name || file.name.startsWith(`错误_${task.name.replace(/\.[^.]+$/, '')}`));
    const root = await fs.realpath(path.join(state.run, 'profile'));
    const target = path.resolve(root, file.path.replace(/^\//, ''));
    assert.ok(target.startsWith(root + path.sep));
    const observed = await fs.realpath(target).catch(error => { if (error.code === 'ENOENT' && file.deleted === 1) return null; throw error; });
    if (observed) assert.ok(observed.startsWith(root + path.sep));
    return observed;
  };
  assert.equal(tasks().length, 0);
  try {
    await applyLimit(8);
    for (const [service, type] of [['auth', 'HOLIDAY'], ['hr', 'EMPLOYEE'], ['oa', 'ASSET'], ['crm', 'CUSTOMER']]) {
      // The quota fixture tenant has no seeded background jobs. Prepare paused, non-alerting
      // copies of the real import job configuration, and remove only those copies afterward.
      assert.equal(jobs().filter(job => [service, service === 'auth' ? 'cloudflow-auth' : `cloudflow-service-${service}`].includes(job.service)).length, 0);
      assert.equal(database(`SELECT COUNT(*) FROM sys_job WHERE tenant_id=100000 AND deleted=0
        AND service_name=${sql(service)} AND handler_name='batchImport' AND status='PAUSED' AND handler_param IS NULL;`), '1');
      const jobId = Number(database(`INSERT INTO sys_job (tenant_id,job_name,job_group,service_name,handler_name,
        trigger_type,cron_expression,status,concurrent_flag,misfire_strategy,retry_count,timeout_seconds,
        lock_time_seconds,alarm_on_fail_flag,create_by)
        SELECT ${targetId},${sql(prefix + service)},job_group,service_name,handler_name,trigger_type,cron_expression,
        'PAUSED',concurrent_flag,misfire_strategy,0,timeout_seconds,lock_time_seconds,0,${sql(caseTag)}
        FROM sys_job WHERE tenant_id=100000 AND deleted=0 AND service_name=${sql(service)}
          AND handler_name='batchImport' AND status='PAUSED' AND handler_param IS NULL;
        SELECT LAST_INSERT_ID();`));
      assert.ok(Number.isSafeInteger(jobId) && jobId > 0);
      preparedJobs.push({ id: jobId, service });
      check(`${service}隔离导入任务配置已准备且保持暂停和关闭告警`, jobs().some(job => job.id === jobId
        && job.name === prefix + service && job.status === 'PAUSED' && job.alarm === 0 && job.parameter == null));
      const available = successful(await api(tenantAdmin, `/${service}/system/import/types`), '读取错误报告业务列');
      const definition = available.find(item => item.bizType === type); assert.ok(definition);
      const name = `${prefix}${service}.csv`;
      const quote = value => `"${String(value).replaceAll('"', '""')}"`;
      // Every cell contains an invalid marker; business execution is never called.
      const bytes = Buffer.from('\uFEFF' + definition.columns.map(column => quote(column.name)).join(',') + '\r\n'
        + definition.columns.map(() => quote(name)).join(',') + '\r\n');
      const uploaded = successful(await api(tenantAdmin, `/${service}/system/import/${type}/upload`, { method: 'POST',
        file: { name, type: 'text/csv', content: bytes.toString('base64') } }), '实际保存待校验原文件');
      const id = Number(uploaded.taskId); assert.ok(Number.isSafeInteger(id) && id > 0);
      accepted.push({ service, id, bytes });
    }
    await applyLimit(1);
    for (const item of accepted) {
      const before = JSON.stringify(currentFiles(item));
      const result = await validate(item);
      check(`${item.service}首次报告容量失败明确记录原因且保留校验进度`, result.status === 'FAILED'
        && result.message === capacityMessage && result.invalid === 1 && result.valid === 0
        && result.success === 0 && result.failed === 0 && result.errorFile == null);
      check(`${item.service}首次生成失败未留下文件记录`, before === JSON.stringify(currentFiles(item)));
      await download(item, false, '首次生成失败后', item.bytes);
    }
    await applyLimit(8);
    for (const item of accepted) {
      const result = await validate(item);
      check(`${item.service}扩容重试生成真实错误报告`, result.status === 'VALIDATED' && result.invalid === 1
        && result.valid === 0 && result.success === 0 && result.errorFile != null && result.message == null);
      const fileId = Number(result.errorFile.match(/\/([1-9][0-9]*)\/content$/)?.[1]);
      const file = currentFiles(item).find(file => file.id === fileId && file.deleted === 0); assert.ok(file);
      item.report = await fs.readFile(await ownedPath(file)); item.reference = result.errorFile;
      assert.ok(item.report.length > 0);
      await download(item, true, '降额前', item.report);
    }
    await applyLimit(1);
    const retainedFiles = JSON.stringify(files()); const retainedPhysical = await physicalSnapshot(); const retainedUsage = usage();
    for (const item of accepted) {
      const result = await validate(item);
      console.log(`H5_IMPORT_GENERATED_CAPACITY: service=${item.service}; task_failed=${result.status === 'FAILED'}; capacity_message=${result.message === capacityMessage}; previous_reference_retained=${result.errorFile === item.reference}`);
      check(`${item.service}替换报告容量失败保留旧引用及校验结果`, result.status === 'FAILED' && result.message === capacityMessage
        && result.errorFile === item.reference && result.invalid === 1 && result.valid === 0 && result.success === 0 && result.failed === 0);
      await download(item, false, '替换失败后', item.bytes);
      await download(item, true, '替换失败后', item.report);
    }
    check('四部署替换失败保留全部原记录、物理文件及容量', retainedFiles === JSON.stringify(files())
      && JSON.stringify(retainedPhysical) === JSON.stringify(await physicalSnapshot()) && retainedUsage === usage());
    evidence.storageImportGenerated = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      for (const item of accepted) {
        if (['VALIDATING', 'IMPORTING'].includes(current(item).status)) await settled(item);
      }
      const ownedTasks = tasks(); const ownedFiles = files();
      assert.ok(ownedTasks.every(task => ['UPLOADED', 'FAILED', 'VALIDATED'].includes(task.status) && task.success === 0 && task.failed === 0));
      const paths = await Promise.all(ownedFiles.map(ownedPath));
      for (const task of ownedTasks.filter(task => task.job != null)) {
        assert.ok(['SUCCESS', 'FAILED', 'TIMEOUT', 'DISPATCH_FAILED'].includes(database(`SELECT execute_status FROM sys_job_log WHERE tenant_id=${targetId} AND log_id=${task.job};`)));
      }
      // Keep task-platform logs, operation logs and audit evidence.
      database(`START TRANSACTION;
        DELETE FROM sys_file WHERE tenant_id=${targetId} AND biz_type='IMPORT_TASK'
          AND biz_id IN (SELECT CAST(task_id AS CHAR) FROM sys_import_task WHERE ${predicate} AND success_rows=0 AND fail_rows=0 AND status IN ('UPLOADED','FAILED','VALIDATED'));
        DELETE FROM sys_import_error WHERE tenant_id=${targetId} AND task_id IN (SELECT task_id FROM sys_import_task WHERE ${predicate} AND success_rows=0 AND fail_rows=0 AND status IN ('UPLOADED','FAILED','VALIDATED'));
        DELETE FROM sys_import_task WHERE ${predicate} AND success_rows=0 AND fail_rows=0 AND status IN ('UPLOADED','FAILED','VALIDATED');
        COMMIT;`);
      assert.equal(tasks().length, 0);
      for (const task of ownedTasks) assert.equal(database(`SELECT COUNT(*) FROM sys_import_error WHERE tenant_id=${targetId} AND task_id=${task.id};`), '0');
      for (let index = 0; index < ownedFiles.length; index++) {
        const file = ownedFiles[index];
        assert.equal(database(`SELECT COUNT(*) FROM sys_file WHERE file_id=${file.id};`), '0');
        if (paths[index]) {
          assert.equal(database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=${targetId} AND deleted=0 AND storage_type='LOCAL'
            AND CAST(file_path AS BINARY)=CAST(${sql(file.path)} AS BINARY);`), '0');
          await fs.unlink(paths[index]);
        }
      }
      for (const job of preparedJobs) {
        assert.equal(database(`SELECT COUNT(*) FROM sys_job_log WHERE tenant_id=${targetId}
          AND job_id=${job.id} AND execute_status='RUNNING';`), '0');
        assert.equal(database(`DELETE FROM sys_job WHERE tenant_id=${targetId} AND job_id=${job.id}
          AND job_name=${sql(prefix + job.service)} AND service_name=${sql(job.service)}
          AND handler_name='batchImport' AND status='PAUSED' AND alarm_on_fail_flag=0
          AND handler_param IS NULL AND create_by=${sql(caseTag)}; SELECT ROW_COUNT();`), '1');
      }
      check('仅清理本轮暂停任务配置并保留任务执行日志', beforeJobs === JSON.stringify(jobs()));
    } catch (error) { failures.push(error); }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '导入生成报告容量测试清理不完整');
    check('四部署导入任务、错误明细和文件精确清理且用量恢复', tasks().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot()));
    evidence.storageImportGeneratedCleanup = true;
  }
}
