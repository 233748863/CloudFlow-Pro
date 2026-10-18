import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

export async function verifyF1AssetTasks(ctx) {
  const { admin, other, state, directory, database, check, evidence, quote, rows, waitFor, sleep,
    marker, get, post, today, shifted, createAsset, asset, schedules } = ctx;
  const lastTriggered = new Map();
  const trigger = async id => {
    const pause = 5200 - (Date.now() - (lastTriggered.get(id) || 0)); if (pause > 0) await sleep(pause);
    const started = Date.now();
    const result = await post(`/auth/system/job/${id}/trigger`);
    lastTriggered.set(id, Date.now());
    check('AC-4/9/10 实际集中任务受理 ' + id, result.accepted === true);
    return { ...result, elapsed: Date.now() - started };
  };
  const jobRow = execution => rows(`SELECT JSON_OBJECT('status',execute_status,'affected',affected_rows,'actor',trigger_by,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE tenant_id=100000 AND execute_no=${quote(execution.executeNo)};`)[0];
  const finishJob = async execution => {
    const result = await waitFor(() => jobRow(execution), value => value && value.status !== 'RUNNING', '集中任务未返回最终执行结果', 180000);
    check('AC-4/9/10 集中任务真实完成并回报成功', result.status === 'SUCCESS' && result.report != null);
    return result;
  };
  const messages = (kind, ids) => rows(`SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'receiver',CAST(receiver_id AS CHAR),'status',send_status,'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type=${quote(kind)} AND biz_id IN(${ids.map(value => quote(value)).join(',')}) ORDER BY record_id;`);
  const maintenance = await createAsset('维保入口', { depreciationFlag: 0 });
  const plans = [];
  for (const frequency of ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM']) {
    const planId = await post('/oa/asset/maintenance-plans', { assetId: maintenance.assetId,
      planName: marker + '_' + frequency, maintenanceType: 'PREVENTIVE', frequency,
      customIntervalDays: frequency === 'CUSTOM' ? 10 : null, responsibleId: 990000702, nextDueDate: today, reminderDays: 7, status: 'ACTIVE' });
    plans.push({ planId, frequency });
  }
  const disabled = await post('/oa/asset/maintenance-plans', { assetId: maintenance.assetId, planName: marker + '_停用',
    maintenanceType: 'INSPECTION', frequency: 'MONTHLY', responsibleId: 990000702, nextDueDate: today, reminderDays: 7, status: 'DISABLED' });
  const outside = await post('/oa/asset/maintenance-plans', { assetId: maintenance.assetId, planName: marker + '_尚未到期',
    maintenanceType: 'INSPECTION', frequency: 'MONTHLY', responsibleId: 990000702, nextDueDate: shifted('DAY', 8), reminderDays: 7, status: 'ACTIVE' });
  const overdue = await post('/oa/asset/maintenance-plans', { assetId: maintenance.assetId, planName: marker + '_逾期',
    maintenanceType: 'INSPECTION', frequency: 'MONTHLY', responsibleId: 990000702, nextDueDate: shifted('DAY', -1), reminderDays: 0, status: 'ACTIVE' });
  await finishJob(await trigger(1651));
  const tasks = await get(`/oa/asset/${maintenance.assetId}/maintenance-tasks`);
  check('AC-10 五种周期及逾期维保实际生成，停用和未到日期不生成', tasks.length === 6
    && !tasks.some(row => [String(disabled), String(outside)].includes(String(row.planId)))
    && tasks.some(row => String(row.planId) === String(overdue) && row.status === 'PENDING'));
  for (const terminal of ctx.terminalAssets) {
    check('AC-10 终态资产已有维保计划不再生成任务 ' + terminal.status,
      (await get(`/oa/asset/${terminal.assetId}/maintenance-tasks`)).length === 0);
  }
  const notices = await waitFor(() => messages('ASSET_MAINTENANCE', tasks.map(row => row.taskId)),
    values => values.length === 6 && values.every(row => row.status === 'SUCCESS'), '维保提醒未实际投递');
  check('AC-10 维保负责人收到六条站内提醒', notices.every(row => row.receiver === '990000702' && row.channel === 'INTERNAL'));
  await get('/auth/system/message/mine/' + notices[0].id, other);
  await finishJob(await trigger(1651));
  check('AC-10 重复扫描不重复创建任务和提醒', (await get(`/oa/asset/${maintenance.assetId}/maintenance-tasks`)).length === 6
    && messages('ASSET_MAINTENANCE', tasks.map(row => row.taskId)).length === 6);
  for (const [index, plan] of plans.entries()) {
    const task = tasks.find(row => String(row.planId) === String(plan.planId));
    const result = index === 0 ? 'NEED_REPAIR' : index === 1 ? 'ABNORMAL' : 'NORMAL';
    await post('/oa/asset/maintenance-tasks/complete', { taskId: task.taskId, actualDate: today, result,
      cost: '1.25', description: marker + '_维保故障说明' });
    const updated = (await get(`/oa/asset/${maintenance.assetId}/maintenance-plans`)).find(row => String(row.planId) === String(plan.planId));
    const next = plan.frequency === 'CUSTOM' ? shifted('DAY', 10) : shifted('MONTH', { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 }[plan.frequency]);
    check('AC-10 完成后按原计划推进下次日期 ' + plan.frequency, updated.nextDueDate === next && updated.lastCompletedDate === today);
    if (index === 0) ctx.maintenanceTask = { ...task, actualDate: today, description: marker + '_维保故障说明' };
  }
  ctx.maintenanceAsset = maintenance;
  evidence.maintenance = true;
  const expiry = await createAsset('保险保修边界', { depreciationFlag: 0, custodianId: 990000702,
    insuranceStartDate: today, insuranceEndDate: shifted('DAY', 7), insuranceReminderDays: 7, warrantyExpireDate: shifted('DAY', 30) });
  const future = await createAsset('保险保修未到期', { depreciationFlag: 0,
    insuranceStartDate: today, insuranceEndDate: shifted('DAY', 8), insuranceReminderDays: 7, warrantyExpireDate: shifted('DAY', 31) });
  const fallback = await createAsset('保险默认接收人', { depreciationFlag: 0, insuranceEndDate: today, insuranceReminderDays: 0 });
  await finishJob(await trigger(1652));
  const insurance = await waitFor(() => messages('ASSET_INSURANCE', [expiry.assetId, fallback.assetId]),
    values => values.length === 2 && values.every(row => row.status === 'SUCCESS'), '保险到期提醒未实际投递');
  const warranty = await waitFor(() => messages('ASSET_WARRANTY', [expiry.assetId]), values => values.length === 1 && values[0].status === 'SUCCESS', '保修到期提醒未实际投递');
  check('AC-9 保险和保修边界正确，保管人与默认负责人分别收到提醒', insurance.some(row => row.receiver === '990000702')
    && insurance.some(row => row.receiver === '990000701') && warranty[0].receiver === '990000702'
    && messages('ASSET_INSURANCE', [future.assetId]).length === 0 && messages('ASSET_WARRANTY', [future.assetId]).length === 0);
  const terminalIds = ctx.terminalAssets.map(row => row.assetId);
  check('AC-9 已报废处置和丢失资产不再发送保险或保修提醒', messages('ASSET_INSURANCE', terminalIds).length === 0
    && messages('ASSET_WARRANTY', terminalIds).length === 0);
  await finishJob(await trigger(1652));
  check('AC-9 重复到期扫描不会重复提醒', messages('ASSET_INSURANCE', [expiry.assetId, fallback.assetId]).length === 2 && messages('ASSET_WARRANTY', [expiry.assetId]).length === 1);
  evidence.expiry = true;
  const sample = await createAsset('千项输入模板', { purchaseAmount: '10.00', salvageValue: '0.00', usefulLifeMonths: 1 });
  const prefix = marker + '_bulk_';
  const inputNumbers = JSON.stringify(Array.from({ length: 1000 }, (_, index) => index));
  // These are new owned input assets and unposted plans; posting results are produced only by the real job.
  database(`INSERT INTO oa_asset(tenant_id,asset_code,name,status,purchase_amount,purchase_date,category_id,salvage_value,useful_life_months,available_from_date,depreciation_flag,depreciation_method,depreciation_frequency,opening_accumulated_depreciation,accumulated_depreciation,net_book_value,next_depreciation_date,depreciation_completed_flag,deleted,version,create_by,create_time,update_by,update_time)
    SELECT 100000,CONCAT(${quote(prefix)},n.number),CONCAT(${quote(prefix)},n.number),'IDLE',a.purchase_amount,CURRENT_DATE,a.category_id,0,1,DATE_SUB(CURRENT_DATE,INTERVAL 1 MONTH),1,'STRAIGHT_LINE','MONTHLY',0,0,a.purchase_amount,DATE_ADD(DATE_SUB(CURRENT_DATE,INTERVAL 1 MONTH),INTERVAL 1 MONTH),0,0,0,${quote(marker)},NOW(),${quote(marker)},NOW()
    FROM oa_asset a JOIN JSON_TABLE(${quote(inputNumbers)},'$[*]' COLUMNS(number INT PATH '$')) n WHERE a.asset_id=${sample.assetId} AND a.tenant_id=100000;`);
  const own = `tenant_id=100000 AND create_by=${quote(marker)} AND LEFT(asset_code,${prefix.length})=${quote(prefix)}`;
  database(`INSERT INTO oa_asset_depreciation_schedule(tenant_id,asset_id,period_no,period_date,depreciation_amount,accumulated_amount,net_value,status,version,create_by,create_time,update_by,update_time)
    SELECT 100000,asset_id,1,next_depreciation_date,purchase_amount,purchase_amount,0,'PLANNED',0,${quote(marker)},NOW(),${quote(marker)},NOW() FROM oa_asset WHERE ${own};`);
  check('AC-17 自有隔离输入恰有1000资产且全部尚未过账', database(`SELECT COUNT(*) FROM oa_asset WHERE ${own} AND accumulated_depreciation=0 AND depreciation_completed_flag=0;`) === '1000'
    && database(`SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND create_by=${quote(marker)} AND status='PLANNED';`) === '1000');
  const firstId = database(`SELECT MIN(asset_id) FROM oa_asset WHERE ${own};`);
  assert.match(firstId, /^[1-9][0-9]*$/);
  const environment = { ...process.env }; delete environment.MYSQL_PWD;
  const lock = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db'],
  { stdio: ['pipe', 'pipe', 'pipe'], env: environment, windowsHide: true });
  let output = ''; let stderr = ''; let lockError; let released = false;
  const expectedWarning = 'mysql: [Warning] Using a password on the command line interface can be insecure.';
  lock.stdout.on('data', chunk => { output += chunk.toString(); });
  lock.stderr.on('data', chunk => { stderr += chunk.toString(); });
  lock.on('error', error => { lockError = error.message; });
  const closed = new Promise(resolve => lock.once('close', (code, signal) => resolve({ code, signal })));
  const release = async () => {
    if (released) return;
    released = true;
    lock.stdin.end('COMMIT;\nquit\n');
    const deadline = setTimeout(() => lock.kill(), 5000);
    try {
      const result = await closed;
      const lines = stderr.split(/\r?\n/).filter(line => line.trim());
      const unexpected = lines.filter(line => line.trim() !== expectedWarning);
      await fs.writeFile(path.join(directory, `f1-sql-lock-${ctx.caseTag}.json`), JSON.stringify({ ...result,
        stdout: output, stderr, knownWarningLines: lines.length - unexpected.length, unexpectedLines: unexpected.length,
        connectionId: output.match(/F1_LOCK_READY:([0-9]+)/)?.[1], passwordSupplied: false }, null, 2), { flag: 'wx' });
      assert.ok(result.code === 0 && !lockError && unexpected.length === 0, 'Owned asset lock client failed; original output retained');
    } finally { clearTimeout(deadline); }
  };
  let execution;
  try {
    lock.stdin.write(`START TRANSACTION; SELECT asset_id FROM oa_asset WHERE ${own} AND asset_id=${firstId} FOR UPDATE; SELECT CONCAT('F1_LOCK_READY:',CONNECTION_ID());\n`);
    await waitFor(() => output, value => /F1_LOCK_READY:[0-9]+/.test(value), '千项输入行锁未建立', 10000);
    assert.ok(!lockError);
    const connection = output.match(/F1_LOCK_READY:([0-9]+)/)[1];
    execution = await trigger(1650);
    check('AC-17 千项任务在业务等待时先返回受理且少于10000毫秒', execution.elapsed < 10000 && !released);
    await waitFor(() => database(`SELECT COUNT(*) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.BLOCKING_THREAD_ID WHERE t.PROCESSLIST_ID=${connection};`),
      value => Number(value) >= 1, '实际过账没有等待自有输入行锁', 10000);
    check('AC-17 千项后台任务实际处于执行中', jobRow(execution)?.status === 'RUNNING');
    await release();
    const finished = await finishJob(execution);
    check('AC-17 千项任务完成回报包含1000项并保留操作者', finished.affected === 1000 && finished.actor === 'g_import_admin');
    check('AC-17 每项资产只过账一期，合计10000元', database(`SELECT COUNT(*) FROM oa_asset WHERE ${own} AND accumulated_depreciation=10.00 AND net_book_value=0.00 AND next_depreciation_date IS NULL AND depreciation_completed_flag=1;`) === '1000'
      && database(`SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND create_by=${quote(marker)} AND status='POSTED' AND depreciation_amount=10.00;`) === '1000');
    const postedDigest = database(`SELECT SHA2(CAST(JSON_ARRAY(schedule_id,asset_id,period_no,period_date,depreciation_amount,accumulated_amount,net_value,status,post_time,post_by,version) AS CHAR),256) FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND create_by=${quote(marker)} ORDER BY schedule_id;`);
    const auditSelection = `tenant_id=100000 AND audit_field='DEPRECIATION_POSTED' AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.assetId')) IN(SELECT CAST(asset_id AS CHAR) FROM oa_asset WHERE ${own})`;
    check('AC-19 千项实际过账逐项生成高风险审计与前后金额', database(`SELECT COUNT(*) FROM sys_audit_log WHERE ${auditSelection}
      AND high_risk=1 AND create_by<>'' AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.job.executeNo'))=${quote(execution.executeNo)}
      AND JSON_EXTRACT(after_json,'$.job.jobId')=1650 AND JSON_EXTRACT(before_json,'$.state.asset.accumulatedDepreciation')=0
      AND JSON_EXTRACT(after_json,'$.state.asset.accumulatedDepreciation')=10 AND JSON_EXTRACT(after_json,'$.details.postedPeriods')=1;`) === '1000'
      && database(`SELECT COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.assetId'))) FROM sys_audit_log WHERE ${auditSelection};`) === '1000');
    const auditDigest = database(`SELECT SHA2(CAST(JSON_ARRAY(audit_id,before_json,after_json,create_by,create_time,high_risk) AS CHAR),256) FROM sys_audit_log WHERE ${auditSelection} ORDER BY audit_id;`);
    const original = await get('/auth/system/job/1650');
    const keys = await readOwnedJobKeys(state);
    const secretPath = path.join(directory, 'private/h3-core-secrets.json');
    const secrets = new Set(JSON.parse(await fs.readFile(secretPath, 'utf8')));
    const service = state.services.find(row => row.name === 'oa');
    const internal = async (target, method = 'GET', payload) => {
      const body = payload === undefined ? '' : JSON.stringify(payload);
      const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-oa', method, target, body);
      secrets.add(headers['X-Job-Signature']);
      const response = await fetch(`http://127.0.0.1:${service.port}${target}`, { method, headers,
        ...(method === 'GET' ? {} : { body }), redirect: 'error', signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      check('AC-5 实际内部任务协议返回成功', response.status === 200 && result.code === 200);
      return result.data;
    };
    try {
      const replay = await internal('/inner/job/execute', 'POST', { jobId: 1650, executeNo: execution.executeNo,
        handlerName: original.handlerName, handlerParam: original.handlerParam, timeoutSeconds: original.timeoutSeconds,
        lockTimeSeconds: original.lockTimeSeconds, concurrentFlag: 0 });
      check('AC-5 相同执行编号重投保留原成功结果', replay.accepted === true
        && (await internal('/inner/job/status/' + execution.executeNo)).executeStatus === 'SUCCESS');
    } finally { await fs.writeFile(secretPath, JSON.stringify([...secrets])); }
    const repeated = await finishJob(await trigger(1650));
    check('AC-5/6 千项完成后重投与重新扫描均不重复过账', repeated.affected === 0 && postedDigest === database(`SELECT SHA2(CAST(JSON_ARRAY(schedule_id,asset_id,period_no,period_date,depreciation_amount,accumulated_amount,net_value,status,post_time,post_by,version) AS CHAR),256) FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND create_by=${quote(marker)} ORDER BY schedule_id;`));
    check('AC-5/19 千项完成后重投与重新扫描保留原1000条审计', auditDigest === database(`SELECT SHA2(CAST(JSON_ARRAY(audit_id,before_json,after_json,create_by,create_time,high_risk) AS CHAR),256) FROM sys_audit_log WHERE ${auditSelection} ORDER BY audit_id;`));
    await fs.writeFile(path.join(directory, `f1-thousand-${ctx.caseTag}.json`), JSON.stringify({ assets: 1000, inputRowsOnly: true,
      acceptedMilliseconds: execution.elapsed, actualJobMilliseconds: finished.duration, affectedRows: finished.affected,
      repeatedAffectedRows: repeated.affected, auditRows: 1000, repeatedAuditRows: 0, actualSqlLock: true, businessResponseDoubles: 0 }, null, 2), { flag: 'wx' });
    evidence.asyncThousand = true;
  } finally {
    await release();
    if (execution) await waitFor(() => jobRow(execution), row => row && row.status !== 'RUNNING', '千项后台任务结束失败', 180000);
  }
}
