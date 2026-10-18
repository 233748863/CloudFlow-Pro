import { check, jsonRows, pause, sqlText, until } from './live-lib.mjs';
import { id, noCost, records, same, stockPath } from './oa08-live.mjs';
import { purchase, supplier } from './oa08-purchase.mjs';

export { purchase };

function risks(live, materialId) {
  return jsonRows(`SELECT JSON_OBJECT('id', CAST(id AS CHAR), 'status', risk_status, 'receiver', CAST(owner_id AS CHAR))
    FROM oa_risk_alert WHERE tenant_id = ${sqlText(live.tenantId)} AND business_type = 'CONSUMABLE'
      AND business_id = ${sqlText(materialId)} AND risk_code = 'CONSUMABLE_LOW_STOCK' ORDER BY id`);
}

function messages(live, materialId) {
  return jsonRows(`SELECT JSON_OBJECT('id', CAST(record_id AS CHAR), 'status', send_status, 'receiver', CAST(receiver_id AS CHAR), 'channel', channel_type)
    FROM sys_message_record WHERE tenant_id = ${sqlText(live.tenantId)} AND template_code = 'OA_CONSUMABLE_LOW_STOCK'
      AND biz_type = 'CONSUMABLE' AND biz_id = ${sqlText(materialId)} ORDER BY record_id`);
}

async function scan(live, name, scenarioName = 'warning') {
  const state = live.scenario(scenarioName);
  state.jobRuns ||= {};
  let run = state.jobRuns[name];
  if (!run) {
    const job = await live.ok('admin', '/auth/system/job/1810');
    check('只手工触发已登记且仍停用的耗材预警任务', job.handlerName === 'oaConsumableStockWarning' && job.status === 'PAUSED');
    await pause(5200);
    const triggered = await live.ok('admin', '/auth/system/job/1810/trigger', 'POST', {});
    check('集中调度真实接受预警任务', triggered.accepted === true && typeof triggered.executeNo === 'string');
    run = { executeNo: triggered.executeNo };
    state.jobRuns[name] = run;
    await live.persist();
  }
  const completed = await until(() => jsonRows(`SELECT JSON_OBJECT('status', execute_status,
    'missingReceiver', COALESCE(exception_stack, '') LIKE '%未配置本租户耗材仓管接收人%',
    'targetTenantFailed', COALESCE(exception_stack, '') LIKE ${sqlText(`%耗材任务租户${live.tenantId}失败%`)}) FROM sys_job_log
    WHERE job_id = 1810 AND execute_no = ${sqlText(run.executeNo)}`)[0], value => value && value.status !== 'RUNNING', '真实耗材调度执行完成', 180000);
  run.status = completed.status;
  run.missingReceiver = completed.missingReceiver === 1 || completed.missingReceiver === true;
  run.targetTenantFailed = completed.targetTenantFailed === 1 || completed.targetTenantFailed === true;
  await live.persist();
  check('手工执行后定时任务仍保持停用', (await live.ok('admin', '/auth/system/job/1810')).status === 'PAUSED');
  return run;
}

async function notificationCount(live, materialId, expected, original = []) {
  const rows = await until(() => messages(live, materialId), values => values.length >= expected + original.length
    && values.every(value => value.status !== 'PENDING' && value.status !== 'SENDING'), '真实预警站内消息投递落地', 120000);
  const originalIds = new Set(original.map(row => row.id));
  if (original.length) same('旧成功及SKIPPED通知原样保留且不计为新轮成功', rows.filter(row => originalIds.has(row.id)), original);
  const current = rows.filter(row => !originalIds.has(row.id));
  check('每轮预警只有一条成功站内通知且接收人为本租户仓管', current.length === expected
    && current.every(row => row.status === 'SUCCESS' && row.channel === 'INTERNAL' && row.receiver === live.sessions.accounts.oa.userId));
  return current;
}

async function warningScenario(live) {
  const retry = process.env.CLOUDFLOW_H_OA_WARNING_RETRY || '';
  if (!['', '1', '2'].includes(retry)) throw new Error('H_OA_WARNING_RETRY_INVALID');
  if (live.fixture.warningRecovery) {
    const saved = live.fixture.warningRecovery;
    check('预警复验继续使用原持久保存的H隔离场景', ['warning-retry', 'warning-retry-2'].includes(saved.scenario));
    if (retry === '2' && saved.scenario === 'warning-retry') {
      const previous = live.scenario(saved.scenario);
      const previousMaterialId = id(previous.materialId);
      const original = { risks: risks(live, previousMaterialId), messages: messages(live, previousMaterialId) };
      check('显式部署后复验仅承接已有失败及独立忽略证据', previous.materialName?.startsWith(live.fixture.tag)
        && previous.ignoreEvidence?.targetTenantPassed === true
        && original.risks.length === 2 && original.risks[0].status === 'CLOSED' && original.risks[1].status === 'IGNORED'
        && original.messages.length === 2 && original.messages[0].status === 'SUCCESS' && original.messages[1].status === 'SKIPPED'
        && original.messages.every(row => row.receiver === live.sessions.accounts.oa.userId && row.channel === 'INTERNAL'));
      live.fixture.warningRecoveryHistory ||= [];
      live.fixture.warningRecoveryHistory.push(saved);
      live.fixture.warningRecovery = { scenario: 'warning-retry-2', previousMaterialId, original,
        sourceScenario: saved.scenario, reuseExistingMaterial: true, originalPhase: live.fixture.phases.warning,
        startedAt: new Date().toISOString(), explicitlyRequested: true };
      await live.persist();
    }
    return live.fixture.warningRecovery.scenario;
  }
  if (!retry) return 'warning';
  if (retry !== '1') throw new Error('H_OA_WARNING_RETRY_PREVIOUS_CYCLE_REQUIRED');
  const previous = live.fixture.scenarios.warning;
  check('预警复验限定已有第一轮成功及第二轮失败的H测试耗材', previous?.materialName?.startsWith(live.fixture.tag)
    && previous.materialId && live.fixture.steps['warning:equal-threshold']?.passed && !live.fixture.steps['warning:new-cycle']?.passed);
  const previousMaterialId = id(previous.materialId);
  const original = { risks: risks(live, previousMaterialId), messages: messages(live, previousMaterialId) };
  check('原预警失败明确为第二轮通知被去重且仍有原风险证据', original.risks.length === 2
    && original.risks[0].status === 'CLOSED' && original.risks[1].status === 'OPEN' && original.messages.length === 2
    && original.messages[0].status === 'SUCCESS' && original.messages[1].status === 'SKIPPED'
    && original.messages.every(row => row.receiver === live.sessions.accounts.oa.userId && row.channel === 'INTERNAL'));
  live.fixture.warningRecovery = { scenario: 'warning-retry', previousMaterialId, original, startedAt: new Date().toISOString() };
  await live.persist();
  return 'warning-retry';
}

export async function warningIgnore(live) {
  const name = await warningScenario(live);
  const state = live.scenario(name);
  check('独立忽略核验复用已有H预警且不新造风险轮次', state.materialId && state.materialName?.startsWith(live.fixture.tag)
    && live.fixture.steps[`${name}:close-recovered`]?.passed && live.fixture.steps[`${name}:lower-stock`]?.passed);
  const materialId = id(state.materialId);
  const before = live.proof(materialId);
  const current = risks(live, materialId);
  check('忽略核验仅处理本次已有第二轮风险', current.length === 2 && current[0].status === 'CLOSED'
    && ['OPEN', 'IGNORED'].includes(current[1].status) && current.every(row => row.receiver === live.sessions.accounts.oa.userId));
  if (!state.ignoreEvidence) {
    state.ignoreEvidence = { originalRisks: current, originalMessages: messages(live, materialId) };
    await live.persist();
  }
  await live.setConfig('sys.oa.consumable.stockManagerUserId', live.sessions.accounts.oa.userId);
  await live.step(`${name}:ignore-independent`, async () => {
    if (current[1].status !== 'IGNORED') await live.ok('admin', `/oa/risk/${current[1].id}/status`, 'PUT',
      { riskStatus: 'IGNORED', handleRemark: `${live.fixture.tag}独立忽略及重复扫描验收` });
    for (const label of ['ignore-independent-first', 'ignore-independent-repeat']) await scan(live, label, name);
    const ignored = risks(live, materialId);
    check('忽略后两次真实任务扫描不重新开启或新增风险', ignored.length === 2
      && ignored[0].id === current[0].id && ignored[0].status === 'CLOSED'
      && ignored[1].id === current[1].id && ignored[1].status === 'IGNORED');
    same('忽略重复扫描保留既有成功及失败消息且不再通知', messages(live, materialId), state.ignoreEvidence.originalMessages);
    same('忽略风险与重复扫描不改变真实库存流水', live.proof(materialId), before);
  });
  const jobs = jsonRows("SELECT JSON_OBJECT('status', status) FROM sys_job WHERE job_id IN (1810, 1811)");
  check('独立忽略核验后两个正式任务仍停用', jobs.length === 2 && jobs.every(job => job.status === 'PAUSED'));
  state.ignoreEvidence.targetTenantPassed = true;
  state.ignoreEvidence.globalJobsPassed = ['ignore-independent-first', 'ignore-independent-repeat']
    .every(label => state.jobRuns?.[label]?.status === 'SUCCESS');
  state.ignoreEvidence.verifiedAt = new Date().toISOString();
  await live.persist();
  console.log(JSON.stringify({ warningIgnore: { targetTenantPassed: true, globalJobsPassed: state.ignoreEvidence.globalJobsPassed,
    previousNotificationFailuresRetained: state.ignoreEvidence.originalMessages.filter(message => message.status !== 'SUCCESS').length,
    warningPhasePassed: live.fixture.phases.warning?.passed === true } }));
}

async function completeWarning(live, name) {
  const state = live.scenario(name);
  const runs = Object.values(state.jobRuns || {});
  state.targetTenantPassed = true;
  state.globalJobSucceeded = runs.length > 0 && runs.every(run => run.status === 'SUCCESS');
  state.globalConfigurationFailurePreserved = runs.length > 0
    && runs.every(run => run.status === 'FAILED' && run.missingReceiver === true && run.targetTenantFailed === false);
  live.fixture.warningCoverage = { scenario: name, materialId: state.materialId, targetTenantPassed: state.targetTenantPassed,
    globalJobSucceeded: state.globalJobSucceeded, globalConfigurationFailurePreserved: state.globalConfigurationFailurePreserved,
    newRiskIds: state.newRiskIds || [], newNotificationIds: state.newNotificationIds || [],
    previousSkippedMessagesRetained: state.previousSkippedMessagesRetained === true,
    foreignWarehouseConfigurationsUnchanged: state.foreignWarehouseConfigurationsUnchanged === true,
    foreignWarehouseConfigurationCount: state.foreignWarehouseConfigurations?.length ?? null,
    executions: Object.entries(state.jobRuns || {}).map(([step, run]) => ({ step, ...run })), checkedAt: new Date().toISOString() };
  await live.persist();
  check('目标租户业务通过且每次全局任务仍准确保留其它租户仓管配置错误', state.globalConfigurationFailurePreserved);
  console.log(JSON.stringify({ warning: live.fixture.warningCoverage }));
}

export async function warning(live) {
  const name = await warningScenario(live);
  if (live.fixture.warningRecovery?.reuseExistingMaterial) {
    const { resumeWarning } = await import('./oa08-warning-recovery.mjs');
    await resumeWarning(live, { name, risks, messages, scan, notificationCount });
    return completeWarning(live, name);
  }
  const materialId = await live.material(name, { unit: '个', lowStockThreshold: 6, targetStock: 10, warnEnabled: 1 });
  const state = live.scenario(name);
  const step = (stepName, action) => live.step(`${name}:${stepName}`, action);
  const runScan = stepName => scan(live, stepName, name);
  await live.setConfig('sys.oa.consumable.stockManagerUserId', live.sessions.accounts.oa.userId);
  await step('inbound', () => live.command(`${name}:inbound`, 'admin', `${stockPath}/${materialId}/add-stock`,
    () => live.operation({ quantity: 6, unitPrice: '1.00' })));
  await step('equal-threshold', async () => {
    await runScan('first');
    const opened = risks(live, materialId);
    check('库存等于阈值经真实任务生成一条OPEN风险', opened.length === 1 && opened[0].status === 'OPEN'
      && opened[0].receiver === live.sessions.accounts.oa.userId);
    const notifications = await notificationCount(live, materialId, 1);
    const own = await live.ok('oa', `/auth/system/message/mine/${notifications[0].id}`);
    check('仓管经本人消息接口读取真实通知', String(own.recordId) === notifications[0].id);
    noCost(own, '预警通知无成本字段');
    await live.deny('tenantPeer', `/auth/system/message/mine/${notifications[0].id}`, 'GET', undefined, '第二租户不能读取该通知', materialId);
    const foreign = jsonRows(`SELECT JSON_OBJECT('count', COUNT(*)) FROM sys_message_record WHERE tenant_id <> ${sqlText(live.tenantId)}
      AND template_code = 'OA_CONSUMABLE_LOW_STOCK' AND biz_type = 'CONSUMABLE' AND biz_id = ${sqlText(materialId)}`);
    check('只读核对通知没有跨租户投递', foreign[0].count === 0);
  });
  await step('repeat-scan', async () => {
    const before = risks(live, materialId);
    await runScan('repeat');
    same('重复任务不生成第二条风险', risks(live, materialId), before);
    await notificationCount(live, materialId, 1);
  });
  await step('recover-stock', () => live.command(`${name}:recover-stock`, 'admin', `${stockPath}/${materialId}/add-stock`,
    () => live.operation({ quantity: 1, unitPrice: '1.00' })));
  await step('close-recovered', async () => {
    await runScan('recovered');
    check('库存高于阈值后真实任务关闭旧风险', risks(live, materialId).length === 1 && risks(live, materialId)[0].status === 'CLOSED');
    await notificationCount(live, materialId, 1);
  });
  await step('lower-stock', () => live.command(`${name}:lower-stock`, 'admin', `${stockPath}/${materialId}/scrap`,
    () => live.operation({ quantity: 1 })));
  await step('suggestion', async () => {
    await step('suggestion-read-permission', () => live.deny('oa', `${stockPath}/replenishment-suggestions`, 'GET', undefined,
      '仓管领用与退回权不扩大为库存建议管理权', materialId, /403/));
    const suggestions = records(await live.ok('admin', `${stockPath}/replenishment-suggestions`));
    const suggestion = suggestions.find(row => String(row.consumableId) === materialId);
    check('补货建议按目标十个减现存六个计算四个', suggestion?.quantity === 6 && suggestion.suggestedQuantity === 4 && suggestion.unit === '个');
    const before = live.proof(materialId);
    const reason = `${live.fixture.tag}:${name}-suggestion`;
    const supplierId = await supplier(live);
    await step('suggestion-permission', () => live.deny('oa', '/oa/purchase/request/from-suggestion', 'POST',
      { supplierId, reason, items: [{ consumableId: materialId, quantity: 4 }] }, '仓管领用与退回权不扩大为采购新增权', materialId, /403/));
    if (!state.suggestionPurchaseId) {
      const existing = jsonRows(`SELECT JSON_OBJECT('id', CAST(id AS CHAR)) FROM biz_purchase_request WHERE tenant_id = ${sqlText(live.tenantId)}
        AND user_id = ${sqlText(live.sessions.accounts.admin.userId)} AND reason = ${sqlText(reason)} AND deleted = 0`);
      check('补货草稿恢复定位没有重复记录', existing.length <= 1);
      const created = existing.length ? existing[0] : await live.ok('admin', '/oa/purchase/request/from-suggestion', 'POST', {
        supplierId, reason, items: [{ consumableId: materialId, quantity: 4 }] });
      state.suggestionPurchaseId = id(created.id);
      await live.persist();
    }
    const draft = await live.ok('admin', `/oa/purchase/request/${state.suggestionPurchaseId}`);
    check('一键补货只生成原采购草稿及准确耗材数量', draft.status === 'DRAFT' && draft.items.length === 1
      && String(draft.items[0].consumableId) === materialId && draft.items[0].quantity === 4 && draft.items[0].receivedQuantity === 0);
    same('创建补货草稿没有直接改变库存及流水', live.proof(materialId), before);
  });
  await step('low-stock-permission', () => live.deny('oa', `${stockPath}/low-stock`, 'GET', undefined,
    '仓管领用与退回权不扩大为库存管理清单权', materialId, /403/));
  const lowStock = records(await live.ok('admin', `${stockPath}/low-stock`));
  check('真实预警报表包含阈值相等的测试耗材', lowStock.some(row => String(row.consumableId) === materialId));
  await live.stock(materialId, 6, '6.00', 3);
  const jobStates = jsonRows("SELECT JSON_OBJECT('status', status) FROM sys_job WHERE job_id IN (1810, 1811)");
  check('预警与重算两个正式任务均保持停用', jobStates.length === 2 && jobStates.every(row => row.status === 'PAUSED'));
  await step('new-cycle', async () => {
    await runScan('new-cycle');
    const cycles = risks(live, materialId);
    check('恢复后再次触达阈值生成独立预警轮次', cycles.length === 2 && cycles[0].status === 'CLOSED' && cycles[1].status === 'OPEN');
    await notificationCount(live, materialId, 2);
  });
  await step('ignore', async () => {
    const current = risks(live, materialId).at(-1);
    if (current.status !== 'IGNORED') await live.ok('admin', `/oa/risk/${current.id}/status`, 'PUT', { riskStatus: 'IGNORED', handleRemark: `${live.fixture.tag}忽略预警去重验收` });
    await runScan('ignored-first');
    await runScan('ignored-repeat');
    const ignored = risks(live, materialId);
    check('忽略后重复真实扫描不重新开风险', ignored.length === 2 && ignored[1].status === 'IGNORED');
    await notificationCount(live, materialId, 2);
  });
  for (const recovery of [...(live.fixture.warningRecoveryHistory || []), ...(live.fixture.warningRecovery ? [live.fixture.warningRecovery] : [])]) {
    same('旧预警失败风险及SKIPPED消息原样保留且不计入复验成功数',
      { risks: risks(live, recovery.previousMaterialId), messages: messages(live, recovery.previousMaterialId) }, recovery.original);
  }
  await completeWarning(live, name);
}
