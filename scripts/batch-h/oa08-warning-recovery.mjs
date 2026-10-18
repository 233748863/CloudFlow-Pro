import { check, jsonRows, sqlText } from './live-lib.mjs';
import { id, noCost, same, stockPath } from './oa08-live.mjs';

function foreignWarehouseConfigurations(live) {
  return jsonRows(`SELECT JSON_OBJECT('id', CAST(config_id AS CHAR), 'tenant', CAST(tenant_id AS CHAR),
    'missing', COALESCE(config_value, '') = '', 'fingerprint', SHA2(COALESCE(config_value, ''), 256)) FROM sys_config
    WHERE tenant_id <> ${sqlText(live.tenantId)} AND config_key = 'sys.oa.consumable.stockManagerUserId' ORDER BY config_id`);
}

export async function resumeWarning(live, helpers) {
  const { name, risks, messages, scan, notificationCount } = helpers;
  const recovery = live.fixture.warningRecovery;
  const previous = live.scenario(recovery.sourceScenario);
  const materialId = id(recovery.previousMaterialId);
  const state = live.scenario(name);
  const step = (label, action) => live.step(`${name}:${label}`, action);
  const originalRiskIds = new Set(recovery.original.risks.map(row => row.id));
  const originalMessages = recovery.original.messages;
  check('预警新轮只复用本次已有自有耗材与原失败证据', recovery.reuseExistingMaterial === true
    && previous.materialName?.startsWith(live.fixture.tag) && String(previous.materialId) === materialId
    && (!state.materialId || state.materialId === materialId));
  check('原阶段等阈值重复扫描及补货建议证据完整保留',
    ['equal-threshold', 'repeat-scan', 'recover-stock', 'close-recovered', 'lower-stock', 'suggestion']
      .every(label => live.fixture.steps[`${recovery.sourceScenario}:${label}`]?.passed));
  state.materialId = materialId;
  state.materialName = previous.materialName;
  await step('baseline', async () => {
    const material = await live.readMaterial(materialId);
    check('自有耗材名称与六个阈值十个目标保持原配置', material.name === previous.materialName
      && material.unit === '个' && material.lowStockThreshold === 6 && material.targetStock === 10 && material.warnEnabled === 1);
    same('新轮开始前原风险仍为已核验的关闭及忽略状态', risks(live, materialId), recovery.original.risks);
    same('新轮开始前保留原成功及SKIPPED通知', messages(live, materialId), originalMessages);
    state.originalStock = live.proof(materialId);
    await live.stock(materialId, 6, '6.00', state.originalStock.ledger.length);
    state.foreignWarehouseConfigurations = foreignWarehouseConfigurations(live);
    check('其它租户确有未配置仓管的原始边界', state.foreignWarehouseConfigurations.some(row => row.missing === 1 || row.missing === true));
  });
  await live.setConfig('sys.oa.consumable.stockManagerUserId', live.sessions.accounts.oa.userId);
  for (const cycle of [1, 2]) {
    const label = `cycle-${cycle}`;
    await step(`${label}-recover-stock`, async () => {
      await live.command(`${name}:${label}-recover-stock`, 'admin', `${stockPath}/${materialId}/add-stock`,
        () => live.operation({ quantity: 1, unitPrice: '1.00' }));
      await live.stock(materialId, 7, '7.00', state.originalStock.ledger.length + cycle * 2 - 1);
    });
    await step(`${label}-close-recovered`, async () => {
      const before = live.proof(materialId);
      await scan(live, `${label}-recovered`, name);
      const closed = risks(live, materialId);
      check('真实补货后旧轮风险全部自然关闭', closed.length === originalRiskIds.size + cycle - 1
        && closed.every(row => row.status === 'CLOSED' && row.receiver === live.sessions.accounts.oa.userId));
      same('原风险只通过库存恢复合法关闭且身份不变', closed.filter(row => originalRiskIds.has(row.id)),
        recovery.original.risks.map(row => ({ ...row, status: 'CLOSED' })));
      await notificationCount(live, materialId, cycle - 1, originalMessages);
      same('库存恢复扫描不改写库存与流水', live.proof(materialId), before);
    });
    await step(`${label}-lower-stock`, async () => {
      await live.command(`${name}:${label}-lower-stock`, 'admin', `${stockPath}/${materialId}/scrap`,
        () => live.operation({ quantity: 1 }));
      await live.stock(materialId, 6, '6.00', state.originalStock.ledger.length + cycle * 2);
    });
    await step(`${label}-new-notification`, async () => {
      const before = live.proof(materialId);
      await scan(live, `${label}-new-risk`, name);
      const current = risks(live, materialId);
      check('再次真实出库生成独立风险且旧轮保持关闭', current.length === originalRiskIds.size + cycle
        && current.at(-1).status === 'OPEN' && current.slice(0, -1).every(row => row.status === 'CLOSED')
        && current.every(row => row.receiver === live.sessions.accounts.oa.userId));
      state.newRiskIds = current.filter(row => !originalRiskIds.has(row.id)).map(row => row.id);
      await live.persist();
      const notifications = await notificationCount(live, materialId, cycle, originalMessages);
      state.newNotificationIds = notifications.map(row => row.id);
      const own = await live.ok('oa', `/auth/system/message/mine/${notifications.at(-1).id}`);
      check('真实仓管本人可以读取新风险轮次成功通知', String(own.recordId) === notifications.at(-1).id);
      noCost(own, '新轮站内通知不泄露成本字段');
      await live.deny('tenantPeer', `/auth/system/message/mine/${notifications.at(-1).id}`, 'GET', undefined,
        '第二租户不能读取新轮耗材通知', materialId);
      const foreign = jsonRows(`SELECT JSON_OBJECT('count', COUNT(*)) FROM sys_message_record WHERE tenant_id <> ${sqlText(live.tenantId)}
        AND template_code = 'OA_CONSUMABLE_LOW_STOCK' AND biz_type = 'CONSUMABLE' AND biz_id = ${sqlText(materialId)}`);
      check('新风险通知没有向其它租户投递', foreign[0].count === 0);
      same('新风险与消息投递均不改写实际库存', live.proof(materialId), before);
    });
    await step(`${label}-repeat-scan`, async () => {
      const before = { risks: risks(live, materialId), messages: messages(live, materialId), stock: live.proof(materialId) };
      await scan(live, `${label}-repeat`, name);
      same('同轮重复真实扫描不新增风险消息或库存流水',
        { risks: risks(live, materialId), messages: messages(live, materialId), stock: live.proof(materialId) }, before);
      await notificationCount(live, materialId, cycle, originalMessages);
    });
  }
  await step('ignore-new-round', async () => {
    const current = risks(live, materialId).at(-1);
    check('忽略只作用于本次新风险轮次', state.newRiskIds.includes(current.id) && ['OPEN', 'IGNORED'].includes(current.status));
    if (current.status !== 'IGNORED') await live.ok('admin', `/oa/risk/${current.id}/status`, 'PUT',
      { riskStatus: 'IGNORED', handleRemark: `${live.fixture.tag}修复后真实新轮忽略验收` });
    const before = { risks: risks(live, materialId), messages: messages(live, materialId), stock: live.proof(materialId) };
    for (const label of ['ignored-first', 'ignored-repeat']) await scan(live, label, name);
    same('新轮忽略后两次真实扫描不刷屏且库存不变',
      { risks: risks(live, materialId), messages: messages(live, materialId), stock: live.proof(materialId) }, before);
  });
  await notificationCount(live, materialId, 2, originalMessages);
  same('原始库存流水逐行保留且新轮只追加真实业务事实',
    live.proof(materialId).ledger.slice(0, state.originalStock.ledger.length), state.originalStock.ledger);
  await live.stock(materialId, 6, '6.00', state.originalStock.ledger.length + 4);
  for (const historical of live.fixture.warningRecoveryHistory || []) {
    if (String(historical.previousMaterialId) === materialId) continue;
    same('其它旧预警失败场景及修复前证据完整保留',
      { risks: risks(live, historical.previousMaterialId), messages: messages(live, historical.previousMaterialId) }, historical.original);
  }
  same('所有其它租户仓管配置均保持原始指纹', foreignWarehouseConfigurations(live), state.foreignWarehouseConfigurations);
  state.foreignWarehouseConfigurationsUnchanged = true;
  state.previousSkippedMessagesRetained = true;
  const jobs = jsonRows('SELECT JSON_OBJECT(\'id\', job_id, \'status\', status) FROM sys_job WHERE job_id IN (1810, 1811) ORDER BY job_id');
  check('预警与重算两个正式任务均保持停用', jobs.length === 2 && jobs.every(job => job.status === 'PAUSED'));
  await live.persist();
}
