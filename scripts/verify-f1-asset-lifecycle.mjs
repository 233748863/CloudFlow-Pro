import assert from 'node:assert/strict';

export async function verifyF1AssetLifecycle(ctx) {
  const { admin, other, readonly, outsider, employee, api, database, check, evidence, marker, quote, rows, waitFor,
    get, post, reject, today, createAsset, asset, schedules, snapshot, cents, shifted } = ctx;
  const readRepair = async (assetId, id) => (await get(`/oa/asset/${assetId}/repairs`)).find(row => String(row.repairId) === String(id));
  const readMovement = async (assetId, id) => (await get(`/oa/asset/${assetId}/movements`)).find(row => String(row.movementId) === String(id));
  check('AC-13/15 普通员工账号有办理权限且没有管理员角色', database("SELECT COUNT(*) FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id JOIN sys_role_menu rm ON rm.role_id=r.role_id AND rm.tenant_id=r.tenant_id JOIN sys_menu m ON m.menu_id=rm.menu_id WHERE ur.tenant_id=100000 AND ur.user_id=990000707 AND r.deleted=0 AND r.status='0' AND m.perms='workflow:task:complete';") !== '0'
    && database("SELECT COUNT(*) FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE ur.tenant_id=100000 AND ur.user_id=990000707 AND r.role_key IN('admin','administrator');") === '0');
  const decide = async (table, column, id, decision = 'APPROVE') => {
    assert.ok(['oa_asset_repair', 'oa_asset_movement'].includes(table));
    assert.ok(['repair_id', 'movement_id'].includes(column));
    const instance = await waitFor(() => database(`SELECT COALESCE(instance_id,'') FROM ${table} WHERE ${column}=${id} AND tenant_id=100000;`),
      value => value && !value.startsWith('F:'), '资产审批未绑定实际工作流');
    const tasks = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=${quote(instance)} AND status='TODO';`),
      values => values.length === 1, '资产审批未生成独立审批人的待办');
    check('AC-13/15 实际审批待办属于配置的独立审批人', tasks[0].assignee === '990000702');
    reject(await api(readonly, '/workflow/wf/complete', { method: 'POST', body: { taskId: tasks[0].id, action: decision, comment: marker + '无权代办' } }), 'AC-13/15 未指定且无管理权限的普通账号不能代办');
    const unassigned = await api(employee, '/workflow/wf/complete', { method: 'POST', body: { taskId: tasks[0].id, action: decision, comment: marker + '未分配办理人' } });
    check('AC-13/15 有办理权限但未分配的普通员工不能代办', unassigned.status === 403 && unassigned.body?.code === 'PERMISSION_DENIED');
    check('AC-13/15 拒绝越权办理后原审批待办保持', database(`SELECT COUNT(*) FROM wf_task WHERE tenant_id=100000 AND task_id=${quote(tasks[0].id)} AND status='TODO' AND assignee='990000702';`) === '1');
    await post('/workflow/wf/complete', { taskId: tasks[0].id, action: decision, comment: marker + '真实审批' }, other);
    return instance;
  };
  const repair = async (current, suffix, extra = {}) => {
    const id = await post('/oa/asset/repairs', { assetId: current.assetId, failureDate: today,
      faultDescription: marker + '_' + suffix, repairCost: '0.00', downtimeHours: '2.50', capitalizeFlag: 0,
      lifeExtensionMonths: 0, ...extra });
    return readRepair(current.assetId, id);
  };
  const finish = async (current, row, repairable = true, decision = 'APPROVE') => {
    await post(`/oa/asset/repairs/${row.repairId}/complete`, { repairable, actions: marker + '处理完成' });
    const sent = await readRepair(current.assetId, row.repairId);
    if (sent.instanceId) {
      await decide('oa_asset_repair', 'repair_id', row.repairId, decision);
      return waitFor(() => readRepair(current.assetId, row.repairId), value => decision === 'REJECT'
        ? !value.instanceId : ['COMPLETED', 'CANNOT_REPAIR'].includes(value.repairStatus), '实际维修审批未完成业务回写');
    }
    return sent;
  };
  ctx.repair = repair; ctx.readRepair = readRepair; ctx.readMovement = readMovement; ctx.decide = decide; ctx.finishRepair = finish;
  const maximumLife = await createAsset('维修寿命上限', { usefulLifeMonths: 1200 });
  for (const extension of [1, 2147483647]) {
    const invalid = await api(admin, '/oa/asset/repairs', { method: 'POST', body: { assetId: maximumLife.assetId,
      failureDate: today, faultDescription: marker + '_延寿越界', lifeExtensionMonths: extension } });
    check('AC-14 延寿越界在登记时返回明确拒绝 ' + extension, invalid.status === 400 && invalid.body?.code === 400
      && invalid.body?.msg === '延寿后使用寿命必须为1至1200个月');
  }
  const invalidCost = await api(admin, '/oa/asset/repairs', { method: 'POST', body: { assetId: maximumLife.assetId,
    failureDate: today, faultDescription: marker + '_资本化越界', capitalizeFlag: 1, repairCost: '99999999.99' } });
  check('AC-13 资本化后原值越界在登记时拒绝', invalidCost.status === 400 && invalidCost.body?.code === 400);
  check('AC-13/14 非法调整不产生维修单也不改变资产状态', (await asset(maximumLife.assetId)).status === 'IDLE'
    && database(`SELECT COUNT(*) FROM oa_asset_repair WHERE tenant_id=100000 AND asset_id=${maximumLife.assetId};`) === '0');
  const multi = await createAsset('多维修单', { depreciationFlag: 0 });
  const first = await repair(multi, '首张维修');
  const second = await repair(multi, '第二张维修');
  check('AC-12 登记维修立即进入维修状态', (await asset(multi.assetId)).status === 'MAINTENANCE');
  await finish(multi, first);
  check('AC-12 仍有未结束维修单时保持维修状态', (await asset(multi.assetId)).status === 'MAINTENANCE');
  await finish(multi, second);
  check('AC-12 全部维修完成后恢复闲置状态', (await asset(multi.assetId)).status === 'IDLE');
  const irreparable = await repair(multi, '无法修复');
  const closed = await finish(multi, irreparable, false);
  check('AC-12 无法修复记录实际保存且待报废处理', closed.repairStatus === 'CANNOT_REPAIR' && closed.completionDate === today);
  ctx.irreparableAsset = multi; ctx.irreparableRepair = closed;
  evidence.repairStates = true;

  const historyAsset = await asset(ctx.historical.assetId);
  const oldHistory = snapshot(historyAsset.assetId);
  const combined = await repair(historyAsset, '资本化并延寿', { repairCost: '300.00', capitalizeFlag: 1, lifeExtensionMonths: 12 });
  await post(`/oa/asset/repairs/${combined.repairId}/complete`, { repairable: true, actions: marker + '资本化与延寿' });
  const awaiting = await asset(historyAsset.assetId);
  check('AC-13/14 待审批维修不提前增加原值或寿命', cents(awaiting.purchaseAmount) === 1000000n && awaiting.usefulLifeMonths === 60
    && snapshot(historyAsset.assetId) === oldHistory);
  reject(await api(readonly, `/oa/asset/repairs/${combined.repairId}/complete`, { method: 'POST', body: { repairable: true, actions: '越权' } }), 'AC-13 无权限不能完成资本化维修');
  reject(await api(outsider, `/oa/asset/repairs/${combined.repairId}/complete`, { method: 'POST', body: { repairable: true, actions: '跨租户' } }), 'AC-13 外租户不能完成资本化维修');
  await decide('oa_asset_repair', 'repair_id', combined.repairId);
  await waitFor(() => readRepair(historyAsset.assetId, combined.repairId), row => row.repairStatus === 'COMPLETED', '资本化审批未落库');
  const capitalized = await asset(historyAsset.assetId);
  check('AC-13/14 真实审批后原值10300元且寿命72个月', cents(capitalized.purchaseAmount) === 1030000n && capitalized.usefulLifeMonths === 72);
  check('AC-8/13/14 维修后原过账金额日期操作者及审计字段保持', snapshot(historyAsset.assetId) === oldHistory);
  const future = (await schedules(historyAsset.assetId)).filter(row => row.status === 'PLANNED');
  check('AC-13/14 重算未来70期合计9000元且保留1000元残值', future.length === 70
    && future.reduce((sum, row) => sum + cents(row.depreciationAmount), 0n) === 900000n && cents(future.at(-1).netValue) === 100000n);
  await post(`/oa/asset/repairs/${combined.repairId}/complete`, { repairable: true, actions: marker + '重复完成' }, other);
  check('AC-13 重复完成不再次计入维修费', cents((await asset(historyAsset.assetId)).purchaseAmount) === 1030000n);
  for (const [suffix, cost, extension, expectedPurchase, expectedLife] of [
    ['仅资本化', '200.00', 0, 1020000n, 60], ['仅延寿', '0.00', 12, 1000000n, 72],
    ['延寿达到上限', '0.00', 1140, 1000000n, 1200],
  ]) {
    const current = await createAsset(suffix);
    const row = await repair(current, suffix, { repairCost: cost, capitalizeFlag: cost !== '0.00' ? 1 : 0, lifeExtensionMonths: extension });
    await finish(current, row);
    const after = await asset(current.assetId);
    check('AC-13/14 ' + suffix + '通过实际审批后只调整对应金额和期限', cents(after.purchaseAmount) === expectedPurchase && after.usefulLifeMonths === expectedLife);
    if (expectedLife === 1200) {
      const remaining = await schedules(current.assetId);
      check('AC-14 延寿至1200个月的实际计划完整且金额保持', remaining.length === 1200
        && remaining.every(period => period.status === 'PLANNED')
        && remaining.reduce((sum, period) => sum + cents(period.depreciationAmount), 0n) === 900000n);
    }
  }
  const rejected = await createAsset('驳回维修');
  const rejectedRow = await repair(rejected, '驳回资本化', { repairCost: '500.00', capitalizeFlag: 1, lifeExtensionMonths: 12 });
  await finish(rejected, rejectedRow, true, 'REJECT');
  const unchanged = await asset(rejected.assetId);
  check('AC-13/14 审批驳回保留原值与寿命并允许重新处理', cents(unchanged.purchaseAmount) === 1000000n && unchanged.usefulLifeMonths === 60
    && !(await readRepair(rejected.assetId, rejectedRow.repairId)).instanceId);
  evidence.capitalization = true; evidence.extension = true;
  const move = async (current, purpose, extra = {}) => {
    const id = await post('/oa/asset/movements', { assetId: current.assetId, purpose, movementDate: today,
      reason: marker + '_' + purpose, toDeptId: 100, toLocation: marker + '_' + purpose, ...extra });
    return readMovement(current.assetId, id);
  };
  const execute = async (current, row) => {
    await post(`/oa/asset/movements/${row.movementId}/execute`);
    const sent = await readMovement(current.assetId, row.movementId);
    if (sent.status === 'APPROVING') {
      check('AC-15 审批前资产保持原状态与保管人', (await asset(current.assetId)).status === current.status
        && String((await asset(current.assetId)).custodianId ?? '') === String(current.custodianId ?? ''));
      await decide('oa_asset_movement', 'movement_id', row.movementId);
    }
    await waitFor(() => readMovement(current.assetId, row.movementId), value => value.status === 'COMPLETED', '资产调拨未完成实际回写');
    return asset(current.assetId);
  };
  ctx.move = move; ctx.executeMovement = execute;
  let movable = await createAsset('领用调拨归还');
  movable = await execute(movable, await move(movable, 'ISSUE', { toCustodianId: 990000701 }));
  check('AC-15 领用更新使用人保管人和所属位置', movable.status === 'IN_USE' && String(movable.ownerId) === '990000701'
    && String(movable.custodianId) === '990000701' && String(movable.deptId) === '100' && movable.location === marker + '_ISSUE');
  reject(await api(admin, '/oa/asset/' + movable.assetId, { method: 'DELETE' }), 'AC-15 在用资产不能删除');
  const staleReturn = await move(movable, 'RETURN');
  movable = await execute(movable, await move(movable, 'TRANSFER', { toCustodianId: 990000702 }));
  check('AC-15 真实审批调拨后使用人与保管人同步变更', movable.status === 'IN_USE' && String(movable.ownerId) === '990000702'
    && String(movable.custodianId) === '990000702' && movable.location === marker + '_TRANSFER');
  reject(await api(admin, `/oa/asset/movements/${staleReturn.movementId}/execute`, { method: 'POST', body: {} }), 'AC-15 保管人变化后旧归还草稿不能执行');
  movable = await execute(movable, await move(movable, 'RETURN', { reason: marker + '_调拨后归还' }));
  check('AC-15 归还清除使用人与保管人并恢复闲置', movable.status === 'IDLE' && movable.ownerId == null && movable.custodianId == null);
  ctx.terminalAssets = [];
  for (const [purpose, target] of [['SCRAP', 'SCRAPPED'], ['DISPOSE', 'DISPOSED'], ['LOST', 'LOST']]) {
    let current = await createAsset(purpose, { availableFromDate: shifted('MONTH', -2),
      insuranceEndDate: today, insuranceReminderDays: 0, warrantyExpireDate: today });
    await post(`/oa/asset/${current.assetId}/depreciation/post`);
    const unfinished = await repair(current, purpose + '前未完成维修');
    const staleDraft = await move(current, 'SCRAP', { reason: marker + '_终态前旧草稿_' + purpose });
    await post('/oa/asset/maintenance-plans', { assetId: current.assetId, planName: marker + '_终态前维保_' + purpose,
      maintenanceType: 'INSPECTION', frequency: 'MONTHLY', responsibleId: 990000702, nextDueDate: today, reminderDays: 0, status: 'ACTIVE' });
    current = await asset(current.assetId);
    const history = snapshot(current.assetId);
    const after = await execute(current, await move(current, purpose));
    const remaining = await schedules(current.assetId);
    check('AC-7/15 ' + purpose + '实际审批后进入终态且取消所有未来期次', after.status === target && after.disposalDate === today
      && after.nextDepreciationDate == null && remaining.filter(value => value.status === 'POSTED').length === 2
      && remaining.filter(value => value.status === 'CANCELLED').length === 58 && snapshot(current.assetId) === history);
    check('AC-7 终态资产不再过账 ' + purpose, await post(`/oa/asset/${current.assetId}/depreciation/post`, {}, other) === 0);
    reject(await api(admin, '/oa/asset/repairs', { method: 'POST', body: { assetId: current.assetId, failureDate: today, faultDescription: '终态送修' } }), 'AC-12 终态资产不能新增维修 ' + purpose);
    const finishAfterTermination = await api(admin, `/oa/asset/repairs/${unfinished.repairId}/complete`, {
      method: 'POST', body: { repairable: true, actions: marker + '_终止后完成旧维修' },
    });
    check('AC-7/12 终止后完成旧维修返回明确拒绝 ' + purpose, finishAfterTermination.status === 400
      && finishAfterTermination.body?.code === 400 && finishAfterTermination.body?.msg === '该资产已终止使用');
    const retainedRepair = await readRepair(current.assetId, unfinished.repairId);
    const retainedAsset = await asset(current.assetId);
    check('AC-7/12 旧维修拒绝后原终态原值与全部期次保持 ' + purpose, retainedRepair.repairStatus === unfinished.repairStatus
      && retainedRepair.instanceId == null && retainedRepair.completionDate == null && retainedAsset.status === target
      && cents(retainedAsset.purchaseAmount) === cents(after.purchaseAmount) && retainedAsset.nextDepreciationDate == null
      && JSON.stringify(await schedules(current.assetId)) === JSON.stringify(remaining) && snapshot(current.assetId) === history);
    reject(await api(admin, '/oa/asset/movements', { method: 'POST', body: { assetId: current.assetId, purpose: 'SCRAP',
      movementDate: today, reason: marker + '_终态后新增调拨' } }), 'AC-15 终态资产不能新增调拨草稿 ' + purpose);
    reject(await api(admin, `/oa/asset/movements/${staleDraft.movementId}/execute`, { method: 'POST', body: {} }), 'AC-15 终态资产不能提交旧调拨草稿 ' + purpose);
    const retainedDraft = await readMovement(current.assetId, staleDraft.movementId);
    check('AC-15 终态旧草稿拒绝后没有启动审批 ' + purpose, retainedDraft.status === 'DRAFT' && retainedDraft.instanceId == null);
    ctx.terminalAsset = after;
    ctx.terminalRepair = unfinished;
    ctx.terminalAssets.push(after);
  }
  reject(await api(admin, '/oa/asset/movements', { method: 'POST', body: { assetId: movable.assetId, purpose: 'ISSUE', movementDate: today,
    reason: marker + '_跨租户保管人', toCustodianId: 990000703 } }), 'AC-15 目标保管人必须属于本租户');
  reject(await api(admin, '/oa/asset/movements', { method: 'POST', body: { assetId: movable.assetId, purpose: 'ISSUE', movementDate: today,
    reason: marker + '_失效保管人', toCustodianId: 999999999 } }), 'AC-15 失效保管人不能调入资产');
  evidence.movements = true;
  const timeline = await get(`/oa/timeline?businessType=ASSET&businessId=${historyAsset.assetId}&limit=100`);
  check('AC-16 统一时间线包含实际维修登记与完成', timeline.some(row => row.title === '资产送修') && timeline.some(row => row.title === '维修完成'));
  const movementTimeline = await get(`/oa/timeline?businessType=ASSET&businessId=${movable.assetId}&limit=100`);
  check('AC-16 统一时间线包含领用调拨和归还三项事实', ['资产ISSUE', '资产TRANSFER', '资产RETURN'].every(title => movementTimeline.some(row => row.title === title)));
  const foreignTimeline = await api(outsider, `/oa/timeline?businessType=ASSET&businessId=${historyAsset.assetId}&limit=100`);
  if (foreignTimeline.status === 200 && foreignTimeline.body?.code === 200) {
    check('AC-16 外租户时间线只返回本租户范围的空列表', Array.isArray(foreignTimeline.body.data) && foreignTimeline.body.data.length === 0);
  } else reject(foreignTimeline, 'AC-16 外租户不能读取资产时间线');
  evidence.timeline = true;
  const audits = rows("SELECT JSON_OBJECT('name',audit_name,'actor',create_by,'risk',high_risk,'before',CAST(before_json AS JSON),'after',CAST(after_json AS JSON)) FROM sys_audit_log WHERE tenant_id=100000 AND audit_name IN('资产折旧过账','维修费用资本化及延寿','资产维修审批结果','资产调拨审批结果','执行资产调拨','取消未过账折旧');");
  check('AC-19 过账资本化及调拨审批均保留实际高风险审计', ['资产折旧过账', '维修费用资本化及延寿', '资产维修审批结果', '资产调拨审批结果', '执行资产调拨']
    .every(name => audits.some(row => row.name === name && row.risk === 1 && row.actor)));
  check('AC-19 核心审计同时记录资产单据编号和变更前后状态', audits.every(row => row.before?.assetId && row.after?.assetId
    && String(row.before.assetId) === String(row.after.assetId) && row.after.businessId && row.after.operatorId
    && row.before.state?.asset && row.after.state?.asset));
  const combinedAudits = audits.filter(row => row.name === '维修费用资本化及延寿' && String(row.after.businessId) === String(combined.repairId));
  check('AC-19 资本化审计精确记录原值和寿命且重复完成不再记录', combinedAudits.length === 1
    && cents(combinedAudits[0].before.state.asset.purchaseAmount) === 1000000n && cents(combinedAudits[0].after.state.asset.purchaseAmount) === 1030000n
    && combinedAudits[0].before.state.asset.usefulLifeMonths === 60 && combinedAudits[0].after.state.asset.usefulLifeMonths === 72);
  const decisions = audits.filter(row => ['资产维修审批结果', '资产调拨审批结果'].includes(row.name));
  check('AC-19 实际审批审计保留真实审批人实例及时间', decisions.length > 0 && decisions.every(row => String(row.after.operatorId) === '990000702'
    && String(row.after.approval?.approverId) === '990000702' && row.after.approval?.processInstanceId && row.after.approval?.approvalTime > 0
    && ['APPROVED', 'REJECTED'].includes(row.after.approval?.result)));
  const rejection = decisions.filter(row => row.name === '资产维修审批结果' && String(row.after.businessId) === String(rejectedRow.repairId));
  check('AC-19 驳回审计保留原金额并记录审批结束', rejection.length === 1 && rejection[0].after.approval.result === 'REJECTED'
    && rejection[0].after.details.accepted === false && rejection[0].after.state.repair.instanceId == null
    && cents(rejection[0].before.state.asset.purchaseAmount) === cents(rejection[0].after.state.asset.purchaseAmount));
  evidence.audit = true;
}
