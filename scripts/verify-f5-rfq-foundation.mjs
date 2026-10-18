import assert from 'node:assert/strict';

export async function verifyF5RfqFoundation(ctx) {
  const { admin, recorder, employee, outsider, api, successful, check, evidence, marker, database, sql, rows,
    get, post, reject, today, shifted, cents, waitFor, snapshot, completeWorkflow } = ctx;
  let supplierSequence = 0;
  const supplier = id => get('/oa/supplier/' + id);
  const createSupplier = async (suffix, extra = {}) => {
    const number = marker + '_SUP_' + (++supplierSequence);
    const name = marker + '_' + suffix;
    await post('/oa/supplier', { supplierCode: number, supplierName: name, supplierType: 'MANUFACTURER',
      contactName: suffix + '联系人', contactEmail: 'f5-' + supplierSequence + '-' + ctx.caseTag + '@example.test',
      contactPhone: '13800000000', status: 'ACTIVE', currency: 'CNY', ...extra });
    const matches = (await get('/oa/supplier/list?' + new URLSearchParams({ supplierName: name, pageSize: '100' }))).records
      .filter(value => value.supplierCode === number);
    check('F5 供应商从实际创建入口唯一保存', matches.length === 1);
    return supplier(matches[0].supplierId);
  };
  const period = rows("SELECT JSON_OBJECT('start',DATE_FORMAT(DATE_SUB(CURRENT_DATE,INTERVAL 1 MONTH),'%Y-%m-01'),'end',DATE_FORMAT(LAST_DAY(DATE_SUB(CURRENT_DATE,INTERVAL 1 MONTH)),'%Y-%m-%d'));")[0];
  const rateSupplier = async (target, score, standing) => {
    const definitions = [['DELIVERY_ON_TIME', '交付及时率', '0.3000'], ['QUALITY', '质量合格率', '0.3000'],
      ['PRICE', '价格竞争力', '0.2000'], ['SERVICE', '服务响应', '0.2000']];
    const scorecardId = await post('/oa/supplier/scorecards', { scorecard: { supplierId: target.supplierId,
      periodType: 'MONTHLY', periodStart: period.start, periodEnd: period.end, remark: marker + '_实际评分' },
    criteria: definitions.map(([criteriaCode, criteriaName, weight]) => ({ criteriaCode, criteriaName, weight,
      score, maxScore: '100.00', dataSource: 'MANUAL' })) });
    await post('/oa/supplier/scorecards/' + scorecardId + '/confirm');
    const rated = await supplier(target.supplierId);
    check('AC-8 比价供应商评分由真实评分确认产生', rated.standing === standing && cents(rated.score) === cents(score));
    return rated;
  };
  const first = await rateSupplier(await createSupplier('供应商甲长名称用于完整比较'), '85.00', 'QUALIFIED');
  const second = await rateSupplier(await createSupplier('供应商乙长名称用于完整比较'), '95.00', 'EXCELLENT');
  const tied = await createSupplier('供应商丙同价报价');
  const foreignCurrency = await createSupplier('供应商丁美元报价');
  const watch = await rateSupplier(await createSupplier('观察级供应商'), '65.00', 'WATCH');
  const eliminated = await rateSupplier(await createSupplier('淘汰级供应商'), '30.00', 'ELIMINATED');
  const prevented = await createSupplier('禁止询价供应商', { preventRfqFlag: 1 });
  const black = await createSupplier('已批准黑名单供应商');
  await post('/oa/supplier/' + black.supplierId + '/decisions', { action: 'BLACKLIST', reason: marker + '_准入阻断' });
  const blackPending = await waitFor(() => supplier(black.supplierId), value => value.instanceId && !value.instanceId.startsWith('F:'), 'F5 黑名单未绑定真实审批');
  await completeWorkflow(blackPending.instanceId);
  const blacklisted = await waitFor(() => supplier(black.supplierId), value => value.blacklistFlag === 1 && value.instanceId == null, 'F5 黑名单审批未回写');
  const materials = [];
  for (const suffix of ['精密物料甲', '配套物料乙']) {
    const name = marker + '_' + suffix;
    await post('/oa/consumable', { name, model: 'F5-规格', unit: '件', lowStockThreshold: 0,
      targetStock: 0, warnEnabled: 0, storageLocation: '询价验收区' });
    const list = await get('/oa/consumable/list?' + new URLSearchParams({ name, pageSize: '100' }));
    const matches = (list.records || list.rows).filter(value => value.name === name);
    check('AC-1 询价物料关联实际耗材', matches.length === 1);
    materials.push(matches[0]);
  }
  const rfq = (id, page = admin) => get('/oa/rfq/' + id, page);
  let rfqSequence = 0;
  const makeItems = () => materials.map((material, index) => ({ consumableId: material.consumableId,
    itemName: material.name, spec: 'F5-规格', unit: '件', quantity: index === 0 ? 3 : 2,
    sortNo: index + 1, expectedPrice: index === 0 ? '12.00' : '22.00', technicalRequirement: '按已确认规格交付' }));
  const createRfq = async suffix => {
    const id = await post('/oa/rfq', { rfq: { title: marker + '_' + (++rfqSequence) + '_' + suffix,
      quoteDeadline: shifted(2), expectedDeliveryDate: shifted(15), deliveryAddress: '独立验收项目收货处',
      paymentTerms: '验收后30日付款', termsContent: '按物料完整报价，提供正式报价附件' }, items: makeItems() });
    const current = await rfq(id);
    check('AC-1 独立询价保存唯一编号及本人负责身份', current.rfq.rfqNo && current.rfq.status === 'DRAFT'
      && String(current.rfq.ownerId) === '990000701' && current.items.length === 2);
    return current;
  };
  let main = await createRfq('横向比价完整验收');
  const temporary = { itemName: marker + '_移除的草稿物料', quantity: 1, unit: '件', sortNo: 3 };
  await post('/oa/rfq', { ...main, items: [...main.items, temporary] });
  main = await rfq(main.rfq.rfqId);
  const removed = main.items.find(value => value.itemName === temporary.itemName);
  assert.ok(removed);
  await post('/oa/rfq', { ...main, items: main.items.filter(value => value.itemId !== removed.itemId) });
  main = await rfq(main.rfq.rfqId);
  check('AC-1 草稿移除物料实际写入删除标记且活动明细完整', main.items.length === 2
    && database(`SELECT deleted FROM oa_purchase_rfq_item WHERE tenant_id=100000 AND item_id=${removed.itemId};`) === '1');
  const invitationList = id => get('/oa/rfq/' + id + '/suppliers');
  const invite = async (target, selected, channel = 'OFFLINE') => api(admin, '/oa/rfq/' + target.rfq.rfqId + '/invite', {
    method: 'POST', body: { version: (await rfq(target.rfq.rfqId)).rfq.version, channel, supplierIds: selected.map(value => value.supplierId) } });
  for (const [label, target] of [['黑名单', blacklisted], ['淘汰级', eliminated], ['禁止询价', prevented]]) {
    const before = snapshot(`SELECT * FROM oa_purchase_rfq WHERE tenant_id=100000 AND rfq_id=${main.rfq.rfqId};`);
    reject(await invite(main, [target]), 'AC-3 ' + label + '供应商被实际邀请入口拒绝');
    check('AC-3 准入拒绝后询价及供应商邀请保持', before === snapshot(`SELECT * FROM oa_purchase_rfq WHERE tenant_id=100000 AND rfq_id=${main.rfq.rfqId};`)
      && (await invitationList(main.rfq.rfqId)).length === 0);
  }
  const single = await invite(main, [first], 'PHONE');
  const singleData = successful(single, 'F5 首家电话邀请');
  check('AC-2/5 少于最少家数允许邀请且返回警告', singleData.registered === 1 && single.body.msg !== '操作成功'
    && Number(database(`SELECT COUNT(*) FROM sys_business_rule_hit_record WHERE tenant_id=100000 AND rule_code='oa.rfq.min.suppliers' AND business_id=${main.rfq.rfqId};`)) > 0);
  const additional = successful(await invite(main, [second, tied, foreignCurrency]), 'F5 追加三家实际邀请');
  check('AC-2 追加邀请按去重后的实际家数登记', additional.registered === 3 && (await rfq(main.rfq.rfqId)).rfq.invitedCount === 4);
  const observed = await invite(main, [watch]);
  check('AC-4 观察级实际允许邀请并留下提醒记录', successful(observed, 'F5 观察级邀请').registered === 1
    && observed.body.msg.includes('观察') && Number(database(`SELECT COUNT(*) FROM sys_business_rule_hit_record
      WHERE tenant_id=100000 AND rule_code='oa.supplier.standing.limit' AND business_id=${watch.supplierId};`)) > 0);
  const invitations = await invitationList(main.rfq.rfqId);
  check('AC-2 电话和线下邀请均保存实际时间及渠道', invitations.length === 5 && invitations.every(value => value.inviteTime)
    && invitations.find(value => value.supplierId === first.supplierId).inviteChannel === 'PHONE'
    && invitations.filter(value => value.supplierId !== first.supplierId).every(value => value.inviteChannel === 'OFFLINE'));
  await post('/oa/rfq/' + main.rfq.rfqId + '/decline', { supplierId: watch.supplierId, reason: marker + '_本轮无法供货' });
  const repeated = successful(await invite(main, [first], 'PHONE'), 'F5 重复登记电话邀请');
  check('AC-2 重复邀请复用原记录和时间', repeated.retained === 1
    && (await invitationList(main.rfq.rfqId)).find(value => value.supplierId === first.supplierId).inviteTime === invitations.find(value => value.supplierId === first.supplierId).inviteTime);
  reject(await api(employee, '/oa/rfq/' + main.rfq.rfqId + '/comparison'), 'AC-17 无询价权限的员工不能查看比价');
  reject(await api(outsider, '/oa/rfq/' + main.rfq.rfqId), 'AC-17 外租户不能读取本轮询价');
  reject(await api(recorder, '/system/rules/effective/oa.rfq.min.suppliers'), 'AC-17 报价录入人未获得规则管理权限');
  const reason = marker + '_采购来源';
  await post('/oa/purchase/request', { supplierId: first.supplierId, reason, expectedDate: shifted(15) + ' 12:00:00',
    items: materials.map((material, index) => ({ consumableId: material.consumableId, quantity: index === 0 ? 3 : 2, unitPrice: '100.00' })) });
  const sourcePurchaseId = database(`SELECT id FROM biz_purchase_request WHERE tenant_id=100000 AND reason=${sql(reason)} AND deleted=0;`);
  assert.match(sourcePurchaseId, /^[1-9][0-9]*$/);
  const fromPurchaseId = await post('/oa/rfq/from-purchase/' + sourcePurchaseId, { deadline: shifted(2) });
  const fromPurchase = await rfq(fromPurchaseId);
  check('AC-1 来源采购实际带入两项物料、数量和原单关联', String(fromPurchase.rfq.purchaseRequestId) === sourcePurchaseId
    && fromPurchase.items.length === 2 && fromPurchase.items.every((value, index) => value.consumableId === materials[index].consumableId
      && value.quantity === (index === 0 ? 3 : 2) && cents(value.expectedPrice) === 10000n));
  reject(await api(admin, '/oa/rfq/from-purchase/' + sourcePurchaseId, { method: 'POST', body: { deadline: shifted(3) } }),
    'AC-1 同一采购不能创建第二张有效询价', '该采购申请已有有效询价，请继续原询价轮次');
  Object.assign(ctx, { first, second, tied, foreignCurrency, watch, supplier, materials, main: await rfq(main.rfq.rfqId),
    rfq, createRfq, makeItems, invite, invitationList, fromPurchase, sourcePurchaseId });
  evidence.creation = true;
  evidence.invitations = true;
  evidence.admission = true;
  evidence.watch = true;
  evidence.minimum = true;
  evidence.permissions = true;
}
