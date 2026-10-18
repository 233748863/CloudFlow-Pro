import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyF2SupplierPurchasing(ctx) {
  const { admin, other, readonly, outsider, api, database, check, evidence, marker, quote, rows, waitFor,
    get, post, reject, today, shifted, month, cents, createSupplier, supplier, createQualification,
    fourCriteria, saveCard, criteria, confirmCard, principal } = ctx;
  const materialName = marker + '_验收耗材';
  await post('/oa/consumable', { name: materialName, model: 'F2', unit: '个', brand: marker,
    lowStockThreshold: 0, targetStock: 0, warnEnabled: 0, storageLocation: '独立验收区' });
  const materialList = await get('/oa/consumable/list?' + new URLSearchParams({ name: materialName, pageSize: '100' }));
  const material = (materialList.records || materialList.rows).filter(value => value.name === materialName);
  check('AC-8 真实创建本轮独立采购耗材', material.length === 1 && material[0].consumableId);
  ctx.materialId = material[0].consumableId;
  let sequence = 0;
  const purchase = id => get('/oa/purchase/request/' + id);
  const createPurchase = async (value, suffix, patch = {}) => {
    const reason = marker + '_' + suffix + '_' + (++sequence);
    await post('/oa/purchase/request', { supplierId: value.supplierId, reason, expectedDate: shifted(1) + ' 12:00:00',
      items: [{ consumableId: ctx.materialId, quantity: 1, unitPrice: '10.01' }], ...patch });
    const found = rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM biz_purchase_request
      WHERE tenant_id=100000 AND user_id=990000701 AND reason=${quote(reason)} AND deleted=0;`);
    check('AC-8 真实采购草稿唯一落库', found.length === 1);
    return purchase(found[0].id);
  };
  const completeWorkflow = async (instance, decision = 'APPROVE') => {
    const finished = new Set();
    const terminalStatuses = new Set(['PASSED', 'AUTO_PASSED', 'REJECTED', 'TERMINATED', 'INVALIDATED', 'CANCELLED']);
    for (let index = 0; index < 12; index++) {
      const pending = await waitFor(() => {
        const tasks = rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'candidateRoles',candidate_roles) FROM wf_task
          WHERE tenant_id=100000 AND instance_id=${quote(instance)} AND status='TODO' ORDER BY create_time,task_id;`);
        const status = database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${quote(instance)};`);
        return { tasks, status };
      }, value => value.tasks.some(task => !finished.has(task.id)) || terminalStatuses.has(value.status), '真实审批未推进');
      if (terminalStatuses.has(pending.status)) {
        check('AC-8/15 审批终态与本人实际决定一致且无遗留待办', pending.tasks.length === 0
          && pending.status === (decision === 'REJECT' ? 'REJECTED' : 'PASSED') && finished.size > 0);
        return;
      }
      for (const task of pending.tasks) {
        if (finished.has(task.id)) continue;
        if (task.assignee && task.assignee !== '990000702') {
          await post('/workflow/enhance/task/delegate', { taskId: task.id, toUserId: 990000702, toUserName: 'g_import_other',
            mode: 'TRANSFER', reason: marker + '_真实转交独立审批人' });
          check('AC-8 实际转交后待办属于独立审批人', database(`SELECT CAST(assignee AS CHAR) FROM wf_task
            WHERE tenant_id=100000 AND task_id=${quote(task.id)} AND status='TODO';`) === '990000702');
        }
        await post('/workflow/wf/complete', { taskId: task.id, action: decision, comment: marker + '_实际审批' }, other);
        const historyAction = String(task.candidateRoles || '').startsWith('CS:') ? 'COUNTERSIGN_' + decision : decision;
        await waitFor(() => database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${quote(task.id)}
          AND operator_id=990000702 AND action=${quote(historyAction)};`), value => value === '1', '独立审批历史未保存');
        check('AC-8/15 审批历史保留独立真实操作者及实际任务决定类型', true);
        finished.add(task.id);
      }
    }
    throw new Error('采购审批超出12轮，保留原始待办检查实际流程');
  };
  const approvePurchase = async value => {
    await post('/oa/purchase/request/submit/' + value.id);
    const bound = await waitFor(() => purchase(value.id), row => row.instanceId && !row.instanceId.startsWith('F:'), '采购未绑定真实流程');
    const form = rows(`SELECT JSON_OBJECT('itemName',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.itemName')),
      'quantity',JSON_EXTRACT(variables,'$.quantity'),'amount',JSON_EXTRACT(variables,'$.amount'),
      'expectedDate',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.expectedDate')),'reason',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.reason')))
      FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${quote(bound.instanceId)};`)[0];
    check('AC-8 真实审批表完整接收原采购物品、数量、金额、日期和原因', form
      && bound.items.every(item => form.itemName.includes(item.consumableName))
      && Number(form.quantity) === bound.items.reduce((sum, item) => sum + Number(item.quantity), 0)
      && cents(form.amount) === cents(bound.totalAmount) && form.reason === bound.reason
      && form.expectedDate === (bound.expectedDate ? String(bound.expectedDate).slice(0, 10) : null));
    await completeWorkflow(bound.instanceId);
    return waitFor(() => purchase(value.id), row => row.status === 'APPROVED', '采购真实审批结果未回写');
  };
  const hits = (id, code) => rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'ruleCode',rule_code,'businessType',business_type,
    'businessId',CAST(business_id AS CHAR),'effect',effect,'result',hit_result,'time',created_time)
    FROM sys_business_rule_hit_record WHERE tenant_id=100000 AND business_type='PURCHASE'
      AND business_id=${id}${code ? ' AND rule_code=' + quote(code) : ''} ORDER BY id;`);
  ctx.purchase = purchase; ctx.createPurchase = createPurchase; ctx.completeWorkflow = completeWorkflow; ctx.approvePurchase = approvePurchase; ctx.hits = hits;

  const receipts = [];
  for (const [suffix, expected, price] of [['及时', shifted(1), '10.01'], ['逾期', shifted(-1), '20.02']]) {
    const draft = await createPurchase(principal, suffix, { expectedDate: expected + ' 12:00:00',
      items: [{ consumableId: ctx.materialId, quantity: 1, unitPrice: price }] });
    reject(await api(admin, `/oa/purchase/request/${draft.id}/receipt`, { method: 'POST', body: { operationKey: randomUUID(), purchaseVersion: draft.version,
      items: [{ itemId: draft.items[0].id, quantity: 1 }] } }), 'AC-8 未审批采购不能提前收货');
    const approved = await approvePurchase(draft);
    const command = { operationKey: randomUUID(), purchaseVersion: approved.version, remark: marker + '_' + suffix,
      items: [{ itemId: approved.items[0].id, quantity: 1 }] };
    const posted = await post(`/oa/purchase/request/${approved.id}/receipt`, command);
    check('AC-8 真实收货生成台账且采购完成', posted.ledgerIds?.length === 1 && (await purchase(approved.id)).status === 'RECEIVED');
    const actual = rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'quantity',received_quantity,'date',DATE_FORMAT(receipt_time,'%Y-%m-%d'))
      FROM biz_purchase_receipt WHERE tenant_id=100000 AND purchase_id=${approved.id};`);
    check('AC-8 原收货单确实保存当天日期和正数数量', actual.length === 1 && actual[0].quantity === 1 && actual[0].date === today);
    const repeated = await post(`/oa/purchase/request/${approved.id}/receipt`, command);
    check('AC-8 相同收货请求不会重复纳入评分依据', JSON.stringify(repeated.ledgerIds) === JSON.stringify(posted.ledgerIds)
      && database(`SELECT COUNT(*) FROM biz_purchase_receipt WHERE tenant_id=100000 AND purchase_id=${approved.id};`) === '1');
    receipts.push({ ...actual[0], purchaseId: approved.id, price });
  }
  const items = fourCriteria('100.00').map(value => value.criteriaCode === 'DELIVERY_ON_TIME' ? { ...value, dataSource: 'AUTO', score: null }
    : value.criteriaCode === 'QUALITY' ? { ...value, score: '90.00' } : value.criteriaCode === 'PRICE' ? { ...value, score: '80.00' } : value);
  const saved = await saveCard(principal, month(0), items);
  const delivery = (await criteria(saved.scorecardId)).find(value => value.criteriaCode === 'DELIVERY_ON_TIME');
  check('AC-8 两笔真实收货推导50%及时率并保留可追溯依据', Number(delivery.autoValue) === 50 && Number(delivery.score) === 50
    && delivery.remark.includes('基于2笔收货，及时1笔') && receipts.every(value => delivery.remark.includes(value.id)));
  check('AC-7 实际加权评分为78分', cents(saved.totalScore) === 7800n && saved.standing === 'QUALIFIED');
  await confirmCard(saved);
  const noData = await createSupplier('无收货评分');
  const emptyCard = await saveCard(noData, month(0), items);
  const emptyDelivery = (await criteria(emptyCard.scorecardId)).find(value => value.criteriaCode === 'DELIVERY_ON_TIME');
  check('AC-7/8 无收货时自动维度不参与得分并按可用权重折算', emptyDelivery.score == null && emptyDelivery.autoValue == null
    && emptyDelivery.remark.includes('基于0笔收货') && cents(emptyCard.totalScore) === 9000n);
  const older = await saveCard(principal, month(-2), fourCriteria('95.00'));
  const beforeOld = await supplier(principal.supplierId);
  await confirmCard(older);
  const afterOld = await supplier(principal.supplierId);
  check('AC-9 较旧周期后确认不覆盖最新评分和时间', afterOld.score === beforeOld.score && afterOld.standing === beforeOld.standing
    && afterOld.lastScoreTime === beforeOld.lastScoreTime);
  evidence.delivery = true; evidence.periodProtection = true;
  ctx.receipts = receipts; ctx.deliveryCard = saved;

  const eliminated = await createSupplier('淘汰准入');
  const blockedDraft = await createPurchase(eliminated, '淘汰前草稿');
  const rollbackDraft = await createPurchase(eliminated, '规则恢复草稿');
  await confirmCard(await saveCard(eliminated, month(0), fourCriteria('55.00')));
  const block = async value => {
    const before = await purchase(value.id);
    const response = await api(admin, '/oa/purchase/request/submit/' + value.id, { method: 'POST', body: {} });
    reject(response, 'AC-10 淘汰级供应商实际采购提交被拒绝');
    check('AC-10 拦截给出明确评级原因且采购草稿保持', response.body?.msg?.includes('淘汰')
      && JSON.stringify(await purchase(value.id)) === JSON.stringify(before));
    check('AC-18 淘汰拦截保存真实规则命中', hits(eliminated.supplierId, 'oa.supplier.eliminated.block').at(-1)?.result === 'BLOCK');
  };
  await block(blockedDraft);
  evidence.eliminated = true;
  const watch = await createSupplier('观察准入');
  const watchDraft = await createPurchase(watch, '观察前草稿');
  await confirmCard(await saveCard(watch, month(0), fourCriteria('70.00')));
  const warning = await api(admin, '/oa/purchase/request/submit/' + watchDraft.id, { method: 'POST', body: {} });
  ctx.successful(warning, 'AC-13 观察级采购允许提交');
  check('AC-13 实际响应提示观察级且保存WARN命中', warning.body.msg.includes('业务规则提醒') && warning.body.msg.includes('观察级')
    && (await purchase(watchDraft.id)).status !== 'DRAFT' && hits(watch.supplierId, 'oa.supplier.standing.limit').at(-1)?.result === 'WARN');
  evidence.warning = true;
  const originalRule = await get('/auth/system/rules/effective/oa.supplier.eliminated.block');
  const originalVersion = (await get('/auth/system/rules/versions?ruleId=' + originalRule.id + '&pageNum=1&pageSize=100')).records.find(value => value.status === 'PUBLISHED');
  assert.ok(originalVersion && originalRule.effect === 'BLOCK');
  try {
    const draft = await post('/auth/system/rules/draft', { ...originalRule, effect: 'WARN', remark: marker + '_规则提醒' });
    check('AC-14 规则草稿尚不改变当前阻断', (await get('/auth/system/rules/effective/oa.supplier.eliminated.block')).effect === 'BLOCK');
    reject(await api(readonly, `/auth/system/rules/versions/${draft.id}/publish`, { method: 'POST', body: {} }), 'AC-14 无发布权账号不能更改采购规则');
    await post(`/auth/system/rules/versions/${draft.id}/publish`);
    check('AC-14 发布后规则效果立即可读', (await get('/auth/system/rules/effective/oa.supplier.eliminated.block')).effect === 'WARN');
    await ctx.sleep(5200);
    const allowed = await api(admin, '/oa/purchase/request/submit/' + blockedDraft.id, { method: 'POST', body: {} });
    ctx.successful(allowed, 'AC-14 原被阻断采购在规则发布后实际提交成功');
    check('AC-14 放行同时保留提醒和规则命中', allowed.body.msg.includes('业务规则提醒')
      && (await purchase(blockedDraft.id)).status !== 'DRAFT' && hits(eliminated.supplierId, 'oa.supplier.eliminated.block').at(-1)?.result === 'WARN');
  } finally {
    await post(`/auth/system/rules/${originalRule.id}/rollback/${originalVersion.id}`);
    check('AC-14 规则通过正式回滚入口恢复原BLOCK效果', (await get('/auth/system/rules/effective/oa.supplier.eliminated.block')).effect === originalRule.effect);
  }
  await block(rollbackDraft);
  evidence.liveRules = true;

  const expired = await createSupplier('关键资质过期');
  const expiryDraft = await createPurchase(expired, '资质过期前草稿');
  const certificate = await createQualification(expired, '过期营业执照', { expireDate: shifted(-1) });
  reject(await api(admin, `/oa/supplier/qualifications/${certificate.qualificationId}/verify`, { method: 'POST', body: { accepted: true } }), 'AC-12 已过期营业执照不能核验通过');
  const expiryResponse = await api(admin, '/oa/purchase/request/submit/' + expiryDraft.id, { method: 'POST', body: {} });
  reject(expiryResponse, 'AC-12 关键资质过期时实际采购提交被拒绝');
  check('AC-12 拒绝原因及资质规则命中完整', expiryResponse.body.msg.includes('关键资质已过期') && expiryResponse.body.msg.includes(certificate.certName)
    && (await purchase(expiryDraft.id)).status === 'DRAFT' && hits(expired.supplierId, 'oa.supplier.qualification.expired').at(-1)?.result === 'BLOCK');
  evidence.expiryAdmission = true;
  const visible = await get('/auth/system/rules/hit-records?businessType=PURCHASE&pageNum=1&pageSize=100');
  check('AC-18 管理员可经真实规则记录接口读取本轮命中', visible.records.some(value => String(value.businessId) === String(eliminated.supplierId)
    && value.ruleCode === 'oa.supplier.eliminated.block'));
  reject(await api(readonly, '/auth/system/rules/hit-records?businessType=PURCHASE'), 'AC-18 无规则查看权账号不能读取命中详情');
  check('AC-18 外租户规则列表不含本轮命中', !(await get('/auth/system/rules/hit-records?businessType=PURCHASE&pageNum=1&pageSize=100', outsider)).records
    .some(value => [eliminated.supplierId, watch.supplierId, expired.supplierId].map(String).includes(String(value.businessId))));
  evidence.hits = true;
  ctx.eliminated = eliminated; ctx.watch = watch; ctx.watchDraft = watchDraft; ctx.expired = expired; ctx.expiredCertificate = certificate;
}
