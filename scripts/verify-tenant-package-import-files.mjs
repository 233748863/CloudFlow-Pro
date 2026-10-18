import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const importFilePermissions = ['system:import:list', 'system:import:execute', 'system:holiday:import',
  'hr:employees:import', 'oa:asset:import', 'crm:customer:import'];

// Upload only; neither validation jobs nor business imports are started.
export async function verifyImportFileCapacity({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, applyLimit, usage, physicalSnapshot, evidence }) {
  const prefix = `${caseTag}-quota-import-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const predicate = `tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')}`;
  const files = () => rows(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'business',biz_type,'businessId',biz_id,'deleted',deleted) FROM sys_file WHERE ${predicate} ORDER BY file_id;`);
  const tasks = () => rows(`SELECT JSON_OBJECT('id',task_id,'name',file_name,'type',biz_type,'status',status,
    'file',file_url,'errorFile',error_file_url,'job',job_log_id,'success',success_rows,'valid',valid_rows,'invalid',invalid_rows)
    FROM sys_import_task WHERE ${predicate} ORDER BY task_id;`);
  const definitions = [['auth', 'HOLIDAY'], ['hr', 'EMPLOYEE'], ['oa', 'ASSET'], ['crm', 'CUSTOMER']];
  const accepted = [];
  const beforeUsage = usage();
  const beforeFiles = await physicalSnapshot();
  let failure;
  const csv = (definition, marker) => {
    const quote = value => `"${String(value).replaceAll('"', '""')}"`;
    return Buffer.from('\uFEFF' + definition.columns.map(column => quote(column.name)).join(',') + '\r\n'
      + definition.columns.map(() => quote(marker)).join(',') + '\r\n');
  };
  const upload = (service, definition, phase) => {
    const name = `${prefix}${service}-${phase}.csv`;
    const bytes = csv(definition, name);
    return api(tenantAdmin, `/${service}/system/import/${definition.bizType}/upload`, { method: 'POST',
      file: { name, type: 'text/csv', content: bytes.toString('base64') } });
  };
  const ownedPath = async file => {
    assert.equal(file.business, 'IMPORT_TASK'); assert.equal(file.deleted, 0);
    assert.ok(tasks().some(task => String(task.id) === file.businessId && task.name === file.name));
    const root = await fs.realpath(path.join(state.run, 'profile'));
    const target = await fs.realpath(path.resolve(root, file.path.replace(/^\//, '')));
    assert.ok(target.startsWith(root + path.sep));
    return target;
  };
  const downloads = async phase => {
    for (const item of accepted) {
      const result = await api(tenantAdmin, `/${item.service}/system/import/${item.taskId}/file`);
      check(`${phase}${item.service}导入原文件仍可完整读取`, result.status === 200 && result.size === item.bytes.length
        && result.sha256 === createHash('sha256').update(item.bytes).digest('hex'));
    }
  };
  assert.equal(files().length, 0); assert.equal(tasks().length, 0);
  try {
    await applyLimit(8);
    for (const [service, type] of definitions) {
      const available = successful(await api(tenantAdmin, `/${service}/system/import/types`), `读取${service}真实导入列定义`);
      const definition = available.find(item => item.bizType === type);
      assert.ok(definition && definition.columns.length > 0);
      const task = successful(await upload(service, definition, 'allowed'), `${service}导入原文件真实持久保存`);
      assert.equal(task.status, 'UPLOADED'); assert.equal(task.totalRows, 1);
      const taskId = Number(task.taskId); assert.ok(Number.isSafeInteger(taskId) && taskId > 0);
      const name = `${prefix}${service}-allowed.csv`;
      const bytes = csv(definition, name);
      const file = files().find(item => item.name === name && item.businessId === String(taskId)); assert.ok(file);
      check(`${service}导入任务和原文件绑定且字节完整`, (await fs.readFile(await ownedPath(file))).equals(bytes));
      accepted.push({ service, definition, taskId, bytes });
    }
    const incomingBytes = accepted.reduce((total, item) => total + item.bytes.length, 0);
    check('四服务导入原文件共同计入租户容量', files().length === 4 && tasks().length === 4 && usage() === beforeUsage + incomingBytes);
    await downloads('降额前');
    await applyLimit(1);
    const retained = JSON.stringify(files());
    const retainedFiles = await physicalSnapshot();
    await new Promise(resolve => setTimeout(resolve, 5100));
    const denied = [];
    for (const item of accepted) {
      const response = await upload(item.service, item.definition, 'denied');
      denied.push(response);
      console.log(`H5_IMPORT_CAPACITY: service=${item.service}; http=${response.status}; code=${response.body?.code}; capacity_message=${/存储空间不足/.test(response.body?.msg || '')}`);
    }
    check('导入拒绝后原始文件记录和字节保持', retained === JSON.stringify(files())
      && JSON.stringify(retainedFiles) === JSON.stringify(await physicalSnapshot()) && usage() === beforeUsage + incomingBytes);
    await downloads('降额后');
    check('所有导入任务均未启动校验或写入业务', tasks().every(task => ['UPLOADED', 'FAILED'].includes(task.status)
      && task.job == null && task.success === 0 && task.valid === 0 && task.invalid === 0 && task.errorFile == null));
    check('四服务导入容量不足均返回明确409', denied.length === 4 && denied.every(response => response.status === 409
      && response.body?.code === 409 && /存储空间不足/.test(response.body?.msg || '')));
    evidence.storageImportFiles = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      const ownedTasks = tasks(); const ownedFiles = files();
      assert.ok(ownedTasks.every(task => ['UPLOADED', 'FAILED'].includes(task.status) && task.job == null && task.success === 0));
      for (const task of ownedTasks) {
        assert.equal(database(`SELECT COUNT(*) FROM sys_import_error WHERE tenant_id=${targetId} AND task_id=${task.id};`), '0');
      }
      const paths = await Promise.all(ownedFiles.map(ownedPath));
      database(`START TRANSACTION;
        DELETE FROM sys_file WHERE ${predicate} AND biz_type='IMPORT_TASK'
          AND biz_id IN (SELECT CAST(task_id AS CHAR) FROM sys_import_task WHERE ${predicate} AND job_log_id IS NULL AND success_rows=0);
        DELETE FROM sys_import_task WHERE ${predicate} AND job_log_id IS NULL AND success_rows=0 AND status IN ('UPLOADED','FAILED');
        COMMIT;`);
      for (const target of paths) await fs.unlink(target);
    } catch (error) { failures.push(error); }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '导入容量验证清理不完整');
    check('四服务隔离导入任务与文件清理且容量恢复', tasks().length === 0 && files().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot()));
    evidence.storageImportFilesCleanup = true;
  }
}
