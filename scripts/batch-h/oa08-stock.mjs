import { check, pause, readFixture } from './live-lib.mjs';
import { cents, id, noCost, records, requestPath, same, stockPath } from './oa08-live.mjs';

export async function inventory(live) {
  const materialId = await live.material('inventory', { unit: '根' });
  const inbound = `${stockPath}/${materialId}/add-stock`;
  await live.step('inventory:weighted', async () => {
    await live.command('inventory:in-2', 'admin', inbound, () => live.operation({ quantity: 10, unitPrice: '2.00' }));
    await live.command('inventory:in-4', 'admin', inbound, () => live.operation({ quantity: 10, unitPrice: '4.00' }));
    const current = await live.stock(materialId, 20, '60.00', 2);
    check('移动加权平均单价真实为3元', cents(current.avgCost) === 300n);
  });
  await live.step('inventory:boundaries', async () => {
    const original = live.fixture.operations['inventory:in-2'];
    const before = live.proof(materialId);
    const replay = await live.command('inventory:in-2', 'admin', inbound);
    check('原键原请求返回原入库流水', replay.replayed === true && JSON.stringify(replay.ledgerIds) === JSON.stringify(original.result.ledgerIds));
    same('立即重放不重复入库', live.proof(materialId), before);
    await live.deny('admin', inbound, 'POST', { ...original.body, quantity: 11 }, '同键变更数量', materialId, /IDEMPOTENCY_CONFLICT/);
    await live.deny('admin', inbound, 'POST', live.operation({ quantity: 1 }), '缺失入库单价', materialId);
    await live.deny('admin', inbound, 'POST', live.operation({ quantity: 1.5, unitPrice: '1.00' }), '小数数量', materialId);
    await live.deny('admin', inbound, 'POST', live.operation({ quantity: 1, unitPrice: '1.001' }), '超两位金额', materialId);
    await live.deny('employee', inbound, 'POST', live.operation({ quantity: 1, unitPrice: '1.00' }), '员工越权入库', materialId, /403/);
    await live.deny('admin', `${stockPath}/${materialId}/reduce-stock`, 'POST', live.operation({ quantity: 21, stockOutType: 'LOSS' }), '库存不足整笔回滚', materialId, /STOCK_NOT_ENOUGH/);
    await live.deny('admin', `${stockPath}/${materialId}/reduce-stock`, 'POST', live.operation({ quantity: 1, stockOutType: 'ISSUE' }), '旧入口缺失批准来源', materialId);
    noCost(await live.ok('oa', `${stockPath}/ledger/${original.result.ledgerIds[0]}`), '仓管台账不回传成本');
  });
  await live.step('inventory:five-types-base', async () => {
    await live.command('inventory:scrap', 'admin', `${stockPath}/${materialId}/scrap`, () => live.operation({ quantity: 1 }));
    await live.command('inventory:adjust-out', 'admin', `${stockPath}/${materialId}/adjust`, () => live.operation({ direction: 'OUT', quantity: 1 }));
    const adjusted = await live.command('inventory:adjust-in', 'admin', `${stockPath}/${materialId}/adjust`, () => live.operation({ direction: 'IN', quantity: 2, unitPrice: '1.00' }));
    await live.stock(materialId, 20, '56.00', 5);
    const original = live.proof(materialId).ledger.find(row => row.id === String(adjusted.ledgerIds[0]));
    const reversed = await live.command('inventory:reverse', 'admin', `${stockPath}/ledger/${adjusted.ledgerIds[0]}/reverse`, () => live.operation());
    await live.stock(materialId, 18, '54.00', 6);
    same('冲正保留原台账的每个核对字段', live.proof(materialId).ledger.find(row => row.id === original.id), original);
    const reversal = live.proof(materialId).ledger.find(row => row.id === String(reversed.ledgerIds[0]));
    check('冲正精确反向且保留原交易类型', reversal.reversalOf === original.id && reversal.quantity === -original.quantity
      && cents(reversal.amount) === -cents(original.amount) && reversal.type === original.type);
  });
  await live.step('inventory:reverse-boundaries', async () => {
    const before = live.proof(materialId);
    const operation = live.fixture.operations['inventory:reverse'];
    const replay = await live.command('inventory:reverse', 'admin', operation.endpoint);
    check('冲正重放返回原反向流水', replay.replayed && JSON.stringify(replay.ledgerIds) === JSON.stringify(operation.result.ledgerIds));
    same('冲正重放无二次扣减', live.proof(materialId), before);
    await live.deny('admin', `${stockPath}/ledger/${operation.result.ledgerIds[0]}/reverse`, 'POST', live.operation(), '冲正记录不可再次冲正', materialId);
    await live.deny('admin', `${stockPath}/ledger/${live.fixture.operations['inventory:in-2'].result.ledgerIds[0]}/reverse`, 'POST', live.operation(), '非最新台账不可冲正', materialId);
    await live.deny('admin', `${stockPath}/ledger/${operation.result.ledgerIds[0]}`, 'PUT', { amount: '0.00' }, '台账不开放修改', materialId);
    await live.deny('admin', `${stockPath}/ledger/${operation.result.ledgerIds[0]}`, 'DELETE', undefined, '台账不开放删除', materialId);
  });
  await live.step('inventory:zero-and-empty', async () => {
    await live.command('inventory:zero-price', 'admin', inbound, () => live.operation({ quantity: 1, unitPrice: '0.00' }));
    await live.stock(materialId, 19, '54.00', 7);
    await live.command('inventory:empty', 'admin', `${stockPath}/${materialId}/scrap`, () => live.operation({ quantity: 19 }));
    const current = await live.stock(materialId, 0, '0.00', 8);
    check('出尽数量与金额及均价同时归零', cents(current.avgCost) === 0n);
    await live.deny('admin', `${stockPath}/${materialId}`, 'DELETE', undefined, '零库存历史耗材不可删除', materialId);
    await live.deny('admin', stockPath, 'PUT', { ...live.scenario('inventory').materialInput, consumableId: materialId,
      version: current.version, unit: '箱', status: 'ACTIVE' }, '已有业务引用的单位冻结', materialId);
  });
  await live.step('inventory:check-rebuild', async () => {
    const current = await live.readMaterial(materialId);
    const before = live.proof(materialId);
    const checked = await live.command('inventory:check', 'admin', `${stockPath}/${materialId}/recalculate`,
      () => live.operation({ mode: 'CHECK', version: current.version }));
    check('真实CHECK报告库存与有效来源一致', checked.consistent === true && checked.changed === false);
    same('CHECK不修改任何库存和流水', live.proof(materialId), before);
    const rebuilt = await live.command('inventory:rebuild', 'admin', `${stockPath}/${materialId}/recalculate`,
      () => live.operation({ mode: 'REBUILD', version: current.version }));
    check('一致库存REBUILD无改写', rebuilt.consistent === true && rebuilt.changed === false);
    await live.command('inventory:rebuild', 'admin', `${stockPath}/${materialId}/recalculate`);
    same('重复REBUILD不修改库存及历史', live.proof(materialId), before);
  });
  const replayId = await live.material('replay');
  await live.step('inventory:durable-concurrent-replay', async () => {
    const state = live.scenario('replay');
    if (!state.command) { state.command = live.operation({ quantity: 5, unitPrice: '1.00' }); await live.persist(); }
    const endpoint = `${stockPath}/${replayId}/add-stock`;
    const results = await Promise.all(Array.from({ length: 4 }, () => live.ok('admin', endpoint, 'POST', state.command)));
    check('四个并发同键请求只返回一组流水', results.every(result => JSON.stringify(result.ledgerIds) === JSON.stringify(results[0].ledgerIds)));
    check('并发重复请求至少三个被持久识别为重放', results.filter(result => result.replayed).length >= 3);
    await live.stock(replayId, 5, '5.00', 1);
    const before = live.proof(replayId);
    await pause(5500);
    const replay = await live.ok('admin', endpoint, 'POST', state.command);
    check('超过短时防重窗口仍返回原持久结果', replay.replayed && JSON.stringify(replay.ledgerIds) === JSON.stringify(results[0].ledgerIds));
    same('持久重放不重复记库存', live.proof(replayId), before);
  });
  await live.stock(materialId, 0, '0.00', 8);
  await live.stock(replayId, 5, '5.00', 1);
}

export async function approval(live) {
  const state = live.scenario('approval');
  if (!state.requestId) {
    const previous = await readFixture('oa-first-pass');
    if (previous.requestId && previous.consumableId && previous.milestone === live.fixture.milestone) {
      const original = await live.ok('employee', `${requestPath}/${id(previous.requestId)}`);
      const material = await live.readMaterial(previous.consumableId);
      check('恢复原102首段申请及H耗材而不重复造单', String(original.applicantId) === live.sessions.accounts.employee.userId
        && material.name.startsWith(previous.tag) && original.items.length === 1 && original.items[0].applyQuantity === 3);
      state.requestId = id(original.requestId);
      state.materialId = id(previous.consumableId);
      state.itemId = id(original.items[0].itemId);
      if (previous.submit) live.fixture.operations['approval:submit'] = { actor: 'employee', endpoint: `${requestPath}/${state.requestId}/submit`, body: previous.submit };
      if (previous.issue) live.fixture.operations['approval:issue'] = { actor: 'oa', endpoint: `${requestPath}/${state.requestId}/issue`, body: previous.issue };
      await live.persist();
    } else {
      state.materialId = await live.material('approval-stock');
      await live.command('approval:in-2', 'admin', `${stockPath}/${state.materialId}/add-stock`, () => live.operation({ quantity: 10, unitPrice: '2.00' }));
      await live.command('approval:in-4', 'admin', `${stockPath}/${state.materialId}/add-stock`, () => live.operation({ quantity: 10, unitPrice: '4.00' }));
      const request = await live.createRequest('approval', 'employee', [{ consumableId: state.materialId, applyQuantity: 3 }]);
      state.itemId = id(request.items[0].itemId);
      await live.persist();
    }
  }
  await live.approve('approval', 'employee', state.requestId, state.materialId);
  await live.step('approval:issue', async () => {
    const request = await live.ok('oa', `${requestPath}/${state.requestId}/dispatch-detail`);
    const command = () => live.operation({ version: request.version, allowPartial: false, items: [{ itemId: state.itemId, quantity: 3 }] });
    await live.deny('employee', `${requestPath}/${state.requestId}/issue`, 'POST', command(), '申请人不能自行发料', state.materialId, /403/);
    const issued = await live.command('approval:issue', 'oa', `${requestPath}/${state.requestId}/issue`, command);
    check('真实仓管发足后申请为ISSUED', issued.status === 'ISSUED' && issued.rows[0].issuedQuantity === 3);
    await live.stock(state.materialId, 17, '51.00', 3);
    const before = live.proof(state.materialId);
    const replay = await live.command('approval:issue', 'oa', `${requestPath}/${state.requestId}/issue`);
    check('发料原版本立即重放同一笔事实', replay.replayed && JSON.stringify(replay.ledgerIds) === JSON.stringify(issued.ledgerIds));
    same('发料重放未再次扣库存', live.proof(state.materialId), before);
    noCost(await live.ok('oa', `${stockPath}/ledger/${issued.ledgerIds[0]}`), '仓管发料台账成本隐藏');
    const cost = await live.ok('finance', `${stockPath}/ledger/${issued.ledgerIds[0]}`);
    check('财务读取真实领用成本和批准来源', cents(cost.amount) === -900n && cost.sourceBizType === 'CONSUMABLE_REQUEST'
      && String(cost.sourceBizId) === state.requestId);
  });
  await live.stock(state.materialId, 17, '51.00', 3);
}

export async function partial(live) {
  const materialId = await live.material('partial');
  await live.step('partial:inbound', () => live.command('partial:inbound', 'admin', `${stockPath}/${materialId}/add-stock`, () => live.operation({ quantity: 4, unitPrice: '3.00' })));
  let request = await live.createRequest('partial-request', 'employee', [{ consumableId: materialId, applyQuantity: 6 }]);
  request = await live.approve('partial-request', 'employee', id(request.requestId), materialId);
  const requestId = id(request.requestId);
  const itemId = id(request.items[0].itemId);
  await live.step('partial:first-issue', async () => {
    request = await live.ok('oa', `${requestPath}/${requestId}/dispatch-detail`);
    await live.deny('oa', `${requestPath}/${requestId}/issue`, 'POST', live.operation({ version: request.version, allowPartial: false,
      items: [{ itemId, quantity: 6 }] }), '未允许部分发料时整笔不足回滚', materialId, /STOCK_NOT_ENOUGH/);
    const issued = await live.command('partial:issue-4', 'oa', `${requestPath}/${requestId}/issue`,
      () => live.operation({ version: request.version, allowPartial: true, items: [{ itemId, quantity: 6 }] }));
    check('真实部分发料四个且缺口两个', issued.status === 'APPROVED' && issued.rows[0].issuedQuantity === 4 && issued.rows[0].shortageQuantity === 2);
    await live.stock(materialId, 0, '0.00', 2);
  });
  await live.step('partial:replenish-replay', async () => {
    await live.command('partial:replenish', 'admin', `${stockPath}/${materialId}/add-stock`, () => live.operation({ quantity: 2, unitPrice: '5.00' }));
    const before = live.proof(materialId);
    const replay = await live.command('partial:issue-4', 'oa', `${requestPath}/${requestId}/issue`);
    check('补货后重放仍返回原实际发量和缺口', replay.replayed && replay.rows[0].issuedQuantity === 4 && replay.rows[0].shortageQuantity === 2);
    same('库存变化后重放不会补发', live.proof(materialId), before);
    request = await live.ok('oa', `${requestPath}/${requestId}/dispatch-detail`);
    const issued = await live.command('partial:issue-2', 'oa', `${requestPath}/${requestId}/issue`,
      () => live.operation({ version: request.version, allowPartial: false, items: [{ itemId, quantity: 2 }] }));
    check('新操作补发两个并完成申请', issued.status === 'ISSUED' && issued.rows[0].issuedQuantity === 2);
    await live.stock(materialId, 0, '0.00', 4);
  });
  await live.step('partial:return-reverse', async () => {
    request = await live.ok('oa', `${requestPath}/${requestId}/dispatch-detail`);
    const sourceLedgerId = live.fixture.operations['partial:issue-4'].result.ledgerIds[0];
    const returned = await live.command('partial:return', 'oa', `${stockPath}/${materialId}/return`,
      () => live.operation({ sourceLedgerId, quantity: 1, requestVersion: request.version }));
    await live.stock(materialId, 1, '3.00', 5);
    const afterReturn = await live.ok('oa', `${requestPath}/${requestId}/dispatch-detail`);
    check('正常退回不恢复可发额度', afterReturn.status === 'ISSUED' && afterReturn.items[0].issuedQuantity === 6 && afterReturn.items[0].returnedQuantity === 1);
    await live.deny('oa', `${requestPath}/${requestId}/issue`, 'POST', live.operation({ version: afterReturn.version, allowPartial: false,
      items: [{ itemId, quantity: 1 }] }), '退回后不能再次发料', materialId);
    await live.command('partial:return-reverse', 'admin', `${stockPath}/ledger/${returned.ledgerIds[0]}/reverse`,
      () => live.operation({ requestVersion: afterReturn.version }));
    const afterReverse = await live.ok('oa', `${requestPath}/${requestId}/dispatch-detail`);
    check('退回冲正同步主子单累计且保留已发数量', afterReverse.items[0].returnedQuantity === 0 && afterReverse.items[0].issuedQuantity === 6);
    await live.stock(materialId, 0, '0.00', 6);
  });
  await live.stock(materialId, 0, '0.00', 6);
  const { partialEdges } = await import('./oa08-issue.mjs');
  await partialEdges(live);
}

export async function concurrency(live) {
  const materialId = await live.material('concurrency');
  await live.step('concurrency:inbound', () => live.command('concurrency:inbound', 'admin', `${stockPath}/${materialId}/add-stock`, () => live.operation({ quantity: 5, unitPrice: '1.00' })));
  const requests = [];
  for (const actor of ['employee', 'peer']) {
    let request = await live.createRequest(`concurrency-${actor}`, actor, [{ consumableId: materialId, applyQuantity: 4 }]);
    request = await live.approve(`concurrency-${actor}`, actor, id(request.requestId), materialId);
    requests.push(request);
  }
  await live.step('concurrency:race', async () => {
    const state = live.scenario('concurrency');
    if (!state.commands) {
      state.commands = requests.map(request => ({ endpoint: `${requestPath}/${request.requestId}/issue`,
        body: live.operation({ version: request.version, allowPartial: false, items: [{ itemId: id(request.items[0].itemId), quantity: 4 }] }) }));
      await live.persist();
    }
    const responses = await Promise.all(state.commands.map(command => live.call('oa', command.endpoint, 'POST', command.body)));
    check('两个独立操作并发竞争库存恰好一个成功', responses.filter(response => response.status === 200 && response.body?.code === 200).length === 1);
    check('另一并发申请明确因库存不足失败', responses.filter(response => response.status === 409 && /STOCK_NOT_ENOUGH/.test(response.body?.msg ?? '')).length === 1);
    await live.stock(materialId, 1, '1.00', 2);
    const views = await Promise.all(requests.map(request => live.ok('oa', `${requestPath}/${request.requestId}/dispatch-detail`)));
    check('批准单累计发料总量为四且无超发', views.reduce((quantity, value) => quantity + value.items[0].issuedQuantity, 0) === 4
      && views.filter(value => value.status === 'ISSUED').length === 1);
  });
  await live.stock(materialId, 1, '1.00', 2);
}
