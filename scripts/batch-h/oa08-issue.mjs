import { check } from './live-lib.mjs';
import { id, requestPath, same, stockPath } from './oa08-live.mjs';

export async function partialEdges(live) {
  const firstMaterial = await live.material('partial-multi-first');
  const secondMaterial = await live.material('partial-multi-second', { unit: '盒' });
  await live.step('partial-multi:inbound', () => live.command('partial-multi:inbound', 'admin', `${stockPath}/${firstMaterial}/add-stock`,
    () => live.operation({ quantity: 2, unitPrice: '1.00' })));
  let request = await live.createRequest('partial-multi', 'employee', [
    { consumableId: firstMaterial, applyQuantity: 2 }, { consumableId: secondMaterial, applyQuantity: 2 }]);
  const requestId = id(request.requestId);
  request = await live.approve('partial-multi', 'employee', requestId, firstMaterial);
  const firstItem = id(request.items.find(item => String(item.consumableId) === firstMaterial).itemId);
  const secondItem = id(request.items.find(item => String(item.consumableId) === secondMaterial).itemId);
  const endpoint = `${requestPath}/${requestId}/issue`;
  const read = () => live.ok('oa', `${requestPath}/${requestId}/dispatch-detail`);
  await live.step('partial-multi:atomic-reject', async () => {
    const beforeSecond = live.proof(secondMaterial);
    const beforeRequest = await read();
    await live.deny('oa', endpoint, 'POST', live.operation({ version: beforeRequest.version, allowPartial: false,
      items: [{ itemId: firstItem, quantity: 2 }, { itemId: secondItem, quantity: 2 }] }), '第二行库存不足时多行整单回滚', firstMaterial, /STOCK_NOT_ENOUGH/);
    same('多行失败也不改变缺货行库存', live.proof(secondMaterial), beforeSecond);
    same('多行失败不推进主单版本及累计发料', await read(), beforeRequest);
  });
  await live.step('partial-multi:zero-row', async () => {
    const current = await read();
    const issued = await live.command('partial-multi:zero-row', 'oa', endpoint, () => live.operation({ version: current.version, allowPartial: true,
      items: [{ itemId: firstItem, quantity: 2 }, { itemId: secondItem, quantity: 2 }] }));
    check('部分发料响应保留实际发零的缺货行', issued.rows.length === 2 && issued.ledgerIds.length === 1
      && issued.rows.find(row => row.itemId === secondItem)?.issuedQuantity === 0
      && issued.rows.find(row => row.itemId === secondItem)?.shortageQuantity === 2 && issued.status === 'APPROVED');
    await live.stock(firstMaterial, 0, '0.00', 2);
    await live.stock(secondMaterial, 0, '0.00', 0);
  });
  await live.step('partial-multi:replenish', () => live.command('partial-multi:replenish', 'admin', `${stockPath}/${secondMaterial}/add-stock`,
    () => live.operation({ quantity: 2, unitPrice: '1.00' })));
  await live.step('partial-multi:zero-row-replay', async () => {
    const before = live.proof(secondMaterial);
    const replay = await live.command('partial-multi:zero-row', 'oa', endpoint);
    check('补货后原零发料行仍重放为零且缺口不变', replay.replayed && replay.rows.length === 2
      && replay.rows.find(row => row.itemId === secondItem)?.issuedQuantity === 0
      && replay.rows.find(row => row.itemId === secondItem)?.shortageQuantity === 2);
    same('零发料行重放不以新库存自动补发', live.proof(secondMaterial), before);
  });
  await live.step('partial-multi:finish', async () => {
    const current = await read();
    const issued = await live.command('partial-multi:finish', 'oa', endpoint, () => live.operation({ version: current.version, allowPartial: false,
      items: [{ itemId: secondItem, quantity: 2 }] }));
    check('独立新操作补足零发料行并完成申请', issued.status === 'ISSUED' && issued.rows[0].issuedQuantity === 2);
  });
  await live.step('partial-multi:issue-reverse', async () => {
    const current = await read();
    const source = live.fixture.operations['partial-multi:finish'].result.ledgerIds[0];
    const reversePath = `${stockPath}/ledger/${source}/reverse`;
    await live.deny('admin', reversePath, 'POST', live.operation({ requestVersion: current.version + 100 }), '发料冲正旧主单版本拒绝', secondMaterial, /VERSION_CONFLICT/);
    await live.command('partial-multi:issue-reverse', 'admin', reversePath, () => live.operation({ requestVersion: current.version }));
    const reversed = await read();
    check('发料冲正同步已发数量并恢复可发额度', reversed.status === 'APPROVED'
      && reversed.items.find(item => String(item.itemId) === secondItem).issuedQuantity === 0
      && reversed.items.find(item => String(item.itemId) === firstItem).issuedQuantity === 2);
    await live.stock(secondMaterial, 2, '2.00', 3);
  });
  await live.step('partial-multi:issue-again', async () => {
    const current = await read();
    const issued = await live.command('partial-multi:issue-again', 'oa', endpoint, () => live.operation({ version: current.version, allowPartial: false,
      items: [{ itemId: secondItem, quantity: 2 }] }));
    check('合法发料冲正后可用新操作重新发出', issued.status === 'ISSUED' && issued.rows[0].issuedQuantity === 2);
  });
  const firstSource = live.fixture.operations['partial-multi:zero-row'].result.ledgerIds[0];
  for (let index = 0; index < 2; index++) {
    await live.step(`partial-multi:return-${index}`, async () => {
      const current = await read();
      await live.command(`partial-multi:return-${index}`, 'oa', `${stockPath}/${firstMaterial}/return`, () => live.operation({
        sourceLedgerId: firstSource, quantity: 1, requestVersion: current.version }));
      const returned = await read();
      const line = returned.items.find(item => String(item.itemId) === firstItem);
      check('分次退回保留累计已发额度且不超原发料', line.issuedQuantity === 2 && line.returnedQuantity === index + 1 && returned.status === 'ISSUED');
    });
  }
  await live.step('partial-multi:return-boundaries', async () => {
    const current = await read();
    const before = live.proof(firstMaterial);
    const replay = await live.command('partial-multi:return-0', 'oa', `${stockPath}/${firstMaterial}/return`);
    check('分次退回后仍可持久重放首笔退回', replay.replayed);
    same('退回重放不重复加库存', live.proof(firstMaterial), before);
    await live.deny('oa', `${stockPath}/${firstMaterial}/return`, 'POST', live.operation({ sourceLedgerId: firstSource,
      quantity: 1, requestVersion: current.version }), '超过原累计发量不可退回', firstMaterial);
    await live.deny('oa', `${stockPath}/${secondMaterial}/return`, 'POST', live.operation({ sourceLedgerId: firstSource,
      quantity: 1, requestVersion: current.version }), '跨耗材发料来源不可退回', secondMaterial);
    await live.deny('oa', `${stockPath}/${secondMaterial}/return`, 'POST', live.operation({
      sourceLedgerId: live.fixture.operations['partial-multi:finish'].result.ledgerIds[0], quantity: 1, requestVersion: current.version }),
    '已冲正发料不可再作为退回来源', secondMaterial);
  });
  await live.stock(firstMaterial, 2, '2.00', 4);
  await live.stock(secondMaterial, 0, '0.00', 4);
}
