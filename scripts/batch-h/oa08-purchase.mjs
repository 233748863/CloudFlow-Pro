import { check, failureSummary, jsonRows, pause, sqlText, until } from './live-lib.mjs';
import { ensureRoles } from './oa08-identities.mjs';
import { submitQuotation } from './oa08-quotation.mjs';
import { cents, date, id, records, same, stockPath } from './oa08-live.mjs';

const purchasePath = '/oa/purchase/request';

export async function supplier(live) {
  const state = live.scenario('supplier');
  if (!state.supplierId) {
    const candidates = jsonRows(`SELECT JSON_OBJECT('id', CAST(supplier_id AS CHAR)) FROM oa_supplier
      WHERE tenant_id = ${sqlText(live.tenantId)} AND deleted = 0 AND status = 'ACTIVE' AND COALESCE(blacklist_flag, 0) = 0
        AND COALESCE(standing, 'QUALIFIED') IN ('EXCELLENT', 'QUALIFIED') AND COALESCE(prevent_rfq_flag, 0) = 0
        AND COALESCE(prevent_purchase_flag, 0) = 0 ORDER BY supplier_id LIMIT 1`);
    check('存在可经真实准入校验的同租户有效供应商', candidates.length === 1);
    state.supplierId = id(candidates[0].id);
    await live.persist();
  }
  const current = await live.ok('admin', `/oa/supplier/${state.supplierId}`);
  check('采购供应商真实存在且启用', current.status === 'ACTIVE' && String(current.tenantId) === live.tenantId);
  return state.supplierId;
}

async function transferTask(live, name, task, instanceId, approver) {
  const account = live.sessions.accounts[approver];
  const lookup = () => jsonRows(`SELECT JSON_OBJECT('assignee', CAST(assignee AS CHAR), 'status', status) FROM wf_task
    WHERE tenant_id = ${sqlText(live.tenantId)} AND instance_id = ${sqlText(instanceId)} AND task_id = ${sqlText(task.taskId)}`);
  await live.step(`${name}:transfer:${task.taskId}`, async () => {
    const before = lookup();
    check('只转交本次采购真实实例仍待办的原任务', before.length === 1 && before[0].status === 'TODO'
      && before[0].assignee === task.assignee && account.userId !== live.sessions.accounts.admin.userId);
    await live.ok('admin', '/workflow/enhance/task/delegate', 'POST', { taskId: task.taskId, toUserId: account.userId,
      toUserName: account.username, mode: 'TRANSFER', reason: `${live.fixture.tag}采购真实双身份转办验收` });
    const audit = jsonRows(`SELECT JSON_OBJECT('count', COUNT(*)) FROM wf_task_delegation
      WHERE tenant_id = ${sqlText(live.tenantId)} AND instance_id = ${sqlText(instanceId)} AND task_id = ${sqlText(task.taskId)}
        AND from_user_id = ${sqlText(task.assignee)} AND to_user_id = ${sqlText(account.userId)} AND status = 'COMPLETED'`);
    const after = lookup();
    const approvals = jsonRows(`SELECT JSON_OBJECT('count', COUNT(*)) FROM wf_task_history
      WHERE tenant_id = ${sqlText(live.tenantId)} AND task_id = ${sqlText(task.taskId)} AND action IN ('APPROVE', 'COUNTERSIGN_APPROVE')`);
    check('真实转办有持久审计且尚未产生批准事实', audit.length === 1 && audit[0].count === 1
      && after.length === 1 && after[0].assignee === account.userId && after[0].status === 'TODO' && approvals[0].count === 0);
  });
  const assigned = lookup();
  check('采购真实待办当前属于另一既有身份', assigned.length === 1 && assigned[0].assignee === account.userId && assigned[0].status === 'TODO');
  const todo = records(await live.ok(approver, '/workflow/wf/todo?pageNum=1&pageSize=100'));
  check('受办人经本人真实待办接口收到转交任务', todo.some(row => String(row.taskId || row.id) === task.taskId));
  task.assignee = assigned[0].assignee;
}

async function completeApproval(live, name, actor, read, approved) {
  const approvers = ['finance', 'manager2'].filter(name => live.sessions.accounts[name]?.userId
    && live.sessions.accounts[name].userId !== live.sessions.accounts[actor].userId);
  check('采购准备了不同于申请人的真实审批身份', approvers.length > 0);
  let current = await until(read, value => approved(value) || value.instanceId && !String(value.instanceId).startsWith('F:'), '采购绑定真实流程', 120000);
  for (let index = 0; !approved(current) && index < 12; index++) {
    const instanceId = String(current.instanceId);
    const pending = await until(async () => {
      const value = await read();
      return { completed: approved(value) ? value : null, tasks: jsonRows(`SELECT JSON_OBJECT('taskId', task_id, 'assignee', CAST(assignee AS CHAR)) FROM wf_task
        WHERE tenant_id = ${sqlText(live.tenantId)} AND instance_id = ${sqlText(instanceId)} AND status = 'TODO' ORDER BY create_time, task_id`) };
    }, value => value.completed || value.tasks.length > 0, '真实采购审批节点可办理或回调已落地', 120000);
    if (pending.completed) { current = pending.completed; break; }
    const tasks = pending.tasks;
    for (const task of tasks) {
      await live.step(`${name}:approve:${task.taskId}`, async () => {
        let approver = approvers.find(name => live.sessions.accounts[name].userId === task.assignee);
        if (!approver && !task.assignee) {
          for (const candidate of approvers) {
            const todo = records(await live.ok(candidate, '/workflow/wf/todo?pageNum=1&pageSize=100'));
            if (todo.some(row => String(row.taskId || row.id) === task.taskId)) { approver = candidate; break; }
          }
        }
        if (!approver) {
          approver = approvers[0];
          await transferTask(live, name, task, instanceId, approver);
        }
        await live.ok(approver, '/workflow/wf/complete', 'POST', { taskId: task.taskId, action: 'APPROVE',
          comment: `${live.fixture.tag}不同身份采购审批`, variables: {} });
        const history = jsonRows(`SELECT JSON_OBJECT('operator', CAST(operator_id AS CHAR), 'action', action,
          'override', JSON_EXTRACT(variables_changed, '$.adminOverride')) FROM wf_task_history WHERE tenant_id = ${sqlText(live.tenantId)}
          AND instance_id = ${sqlText(instanceId)} AND task_id = ${sqlText(task.taskId)} AND action IN ('APPROVE', 'COUNTERSIGN_APPROVE')`);
        check('采购批准来自不同身份的真实待办办理及审批历史', history.length === 1
          && history[0].operator === live.sessions.accounts[approver].userId && history[0].operator !== live.sessions.accounts[actor].userId);
        if (task.assignee && task.assignee !== history[0].operator) check('既有管理员代办能力保留真实代办审计', history[0].override === true || history[0].override === 1);
      });
    }
    current = await until(read, value => approved(value) || jsonRows(`SELECT JSON_OBJECT('taskId', task_id) FROM wf_task
      WHERE tenant_id = ${sqlText(live.tenantId)} AND instance_id = ${sqlText(instanceId)} AND status = 'TODO'
      AND task_id NOT IN (${tasks.map(task => sqlText(task.taskId)).join(',')})`).length > 0, '审批推进或最终回调落地', 120000);
  }
  check('采购所有真实审批节点完成并回调业务单', approved(current));
  const approvals = current.instanceId ? jsonRows(`SELECT JSON_OBJECT('taskId', task_id, 'operator', CAST(operator_id AS CHAR), 'action', action) FROM wf_task_history
    WHERE tenant_id = ${sqlText(live.tenantId)} AND instance_id = ${sqlText(String(current.instanceId))} AND action IN ('APPROVE', 'COUNTERSIGN_APPROVE')`) : [];
  check('批准状态具有真实流程实例及审批历史依据', approvals.length > 0);
  check('恢复核对普通审批及会签均由不同真实审批身份办理', approvals.every(history => history.operator !== live.sessions.accounts[actor].userId
    && approvers.some(approver => live.sessions.accounts[approver].userId === history.operator)));
  return current;
}

export async function draft(live, name, materialId, quantity, unitPrice, fields = {}) {
  const state = live.scenario(name);
  const reason = `${live.fixture.tag}:${name}`;
  if (!state.purchaseId) {
    const lookup = () => jsonRows(`SELECT JSON_OBJECT('id', CAST(id AS CHAR)) FROM biz_purchase_request WHERE tenant_id = ${sqlText(live.tenantId)}
      AND user_id = ${sqlText(live.sessions.accounts.admin.userId)} AND reason = ${sqlText(reason)} AND deleted = 0`);
    let found = lookup();
    if (!found.length) {
      await live.ok('admin', purchasePath, 'POST', { ...fields, supplierId: await supplier(live), reason,
        items: [{ consumableId: materialId, quantity, unitPrice }] });
      found = lookup();
    }
    check('真实采购草稿可唯一恢复定位', found.length === 1);
    state.purchaseId = id(found[0].id);
    await live.persist();
  }
  return live.ok('admin', `${purchasePath}/${state.purchaseId}`);
}

export async function approvePurchase(live, name, purchaseId, materialId) {
  const read = () => live.ok('admin', `${purchasePath}/${purchaseId}`);
  const current = await read();
  if (!['APPROVED', 'PARTIAL_RECEIVED', 'RECEIVED'].includes(current.status) && process.env.CLOUDFLOW_H_WORKFLOW_PAUSED === '1') {
    throw new Error('H_OA_WORKFLOW_TEMPORARILY_PAUSED');
  }
  const before = live.proof(materialId);
  if (current.status === 'DRAFT') {
    await live.deny('admin', `${purchasePath}/${purchaseId}/receipt`, 'POST', live.operation({ purchaseVersion: current.version,
      items: [{ itemId: id(current.items[0].id), quantity: 1 }] }), '未批准采购不可收货', materialId);
    await live.ok('admin', `${purchasePath}/submit/${purchaseId}`, 'POST', {});
  }
  const approved = await completeApproval(live, name, 'admin', read, value => ['APPROVED', 'PARTIAL_RECEIVED', 'RECEIVED'].includes(value.status));
  same('采购提交和审批不产生入库事实', live.proof(materialId), before);
  return approved;
}

async function receiveSeries(live, name, purchaseId, materialId, expectedAmounts) {
  const endpoint = `${purchasePath}/${purchaseId}/receipt`;
  for (let index = 0; index < expectedAmounts.length; index++) {
    await live.step(`${name}:receipt-${index}`, async () => {
      const current = await live.ok('admin', `${purchasePath}/${purchaseId}`);
      const key = `${name}:receipt-${index}`;
      let operation = live.fixture.operations[key];
      if (!operation) {
        operation = { actor: 'admin', endpoint, body: live.operation({ purchaseVersion: current.version,
          items: [{ itemId: id(current.items[0].id), quantity: 1 }] }) };
        live.fixture.operations[key] = operation;
        await live.persist();
      }
      const replies = await Promise.all(Array.from({ length: index === 0 ? 4 : 1 }, () => live.ok('admin', endpoint, 'POST', operation.body)));
      operation.result = replies[0];
      await live.persist();
      check('同采购同键并发只产生同一组收货台账', replies.every(result => JSON.stringify(result.ledgerIds) === JSON.stringify(replies[0].ledgerIds)));
      check('采购分批成本按真实来源金额累计分摊', replies[0].rows.length === 1 && cents(replies[0].rows[0].amount) === cents(expectedAmounts[index]));
      const after = await live.ok('admin', `${purchasePath}/${purchaseId}`);
      check('部分收货累计及主单状态同步', after.items[0].receivedQuantity === index + 1
        && after.status === (index === expectedAmounts.length - 1 ? 'RECEIVED' : 'PARTIAL_RECEIVED'));
      const beforeReplay = live.proof(materialId);
      await pause(5500);
      const replay = await live.command(key, 'admin', endpoint);
      check('采购收货超过短时窗口仍持久重放原结果', replay.replayed && JSON.stringify(replay.ledgerIds) === JSON.stringify(replies[0].ledgerIds));
      same('采购收货持久重放没有重复入库', live.proof(materialId), beforeReplay);
    });
  }
}

async function ordinaryPurchase(live) {
  const name = 'purchase-normal';
  const materialId = await live.material(name, { unit: '盒' });
  const current = await draft(live, name, materialId, 3, '3.33');
  const purchaseId = id(current.id);
  await approvePurchase(live, name, purchaseId, materialId);
  await live.step(`${name}:reject-invalid`, async () => {
    const approved = await live.ok('admin', `${purchasePath}/${purchaseId}`);
    const endpoint = `${purchasePath}/${purchaseId}/receipt`;
    const item = { itemId: id(approved.items[0].id), quantity: 1 };
    await live.deny('admin', endpoint, 'POST', live.operation({ purchaseVersion: approved.version, items: [item, item] }), '重复采购明细整单拒绝', materialId);
    await live.deny('admin', endpoint, 'POST', live.operation({ purchaseVersion: approved.version + 100, items: [item] }), '采购旧版本整单拒绝', materialId, /VERSION_CONFLICT/);
    for (const actor of ['employee', 'tenantPeer']) await live.deny(actor, endpoint, 'POST', live.operation({ purchaseVersion: approved.version, items: [item] }), '无收货权或跨租户不可收货', materialId, /403/);
  });
  await receiveSeries(live, name, purchaseId, materialId, ['3.33', '3.33', '3.33']);
  await live.step(`${name}:reverse`, async () => {
    const state = live.scenario(name);
    if (!state.beforeReverse) { state.beforeReverse = live.proof(materialId); await live.persist(); }
    const posted = live.fixture.operations[`${name}:receipt-2`].result;
    const before = await live.ok('admin', `${purchasePath}/${purchaseId}`);
    const endpoint = `${stockPath}/ledger/${posted.ledgerIds[0]}/reverse`;
    await live.deny('admin', endpoint, 'POST', live.operation({ purchaseVersion: before.version + 100 }), '采购冲正旧版本拒绝', materialId, /VERSION_CONFLICT/);
    await live.command(`${name}:reverse`, 'admin', endpoint, () => live.operation({ purchaseVersion: before.version }));
    const reversed = await live.ok('admin', `${purchasePath}/${purchaseId}`);
    check('采购冲正同步已收数量并恢复部分收货状态', reversed.status === 'PARTIAL_RECEIVED' && reversed.items[0].receivedQuantity === 2);
    same('采购冲正保留原台账全部字段', live.proof(materialId).ledger.slice(0, 3), state.beforeReverse.ledger);
    const receipts = records(await live.ok('admin', `${purchasePath}/${purchaseId}/receipts?pageNum=1&pageSize=100`));
    check('原收货记录保留并派生冲正标识', receipts.length === 3 && receipts.filter(row => row.reversed).length === 1);
  });
  await live.step(`${name}:receive-again`, async () => {
    const reversed = await live.ok('admin', `${purchasePath}/${purchaseId}`);
    await live.command(`${name}:receive-again`, 'admin', `${purchasePath}/${purchaseId}/receipt`, () => live.operation({ purchaseVersion: reversed.version,
      items: [{ itemId: id(reversed.items[0].id), quantity: 1 }] }));
  });
  await live.step(`${name}:replay-conflict`, async () => {
    const operation = live.fixture.operations[`${name}:receipt-0`];
    await live.deny('admin', operation.endpoint, 'POST', { ...operation.body, items: [{ ...operation.body.items[0], quantity: 2 }] },
      '同采购操作键换数量拒绝', materialId, /IDEMPOTENCY_CONFLICT/);
    const received = await live.ok('admin', `${purchasePath}/${purchaseId}`);
    await live.deny('admin', operation.endpoint, 'POST', live.operation({ purchaseVersion: received.version,
      items: [{ itemId: id(received.items[0].id), quantity: 1 }] }), '已收足不可超收', materialId);
  });
  await live.stock(materialId, 3, '9.99', 5);
}

async function concurrentPurchase(live) {
  const name = 'purchase-concurrent';
  const materialId = await live.material(name);
  const purchase = await draft(live, name, materialId, 3, '1.00');
  const purchaseId = id(purchase.id);
  await approvePurchase(live, name, purchaseId, materialId);
  const endpoint = `${purchasePath}/${purchaseId}/receipt`;
  await live.step(`${name}:race`, async () => {
    const state = live.scenario(name);
    if (!state.commands) {
      const current = await live.ok('admin', `${purchasePath}/${purchaseId}`);
      state.commands = Array.from({ length: 2 }, () => live.operation({ purchaseVersion: current.version,
        items: [{ itemId: id(current.items[0].id), quantity: 2 }] }));
      await live.persist();
    }
    const responses = await Promise.all(state.commands.map(body => live.call('admin', endpoint, 'POST', body)));
    check('独立采购键并发收货恰好一笔成功', responses.filter(response => response.status === 200 && response.body?.code === 200).length === 1);
    check('另一笔竞争因版本或数量边界明确失败', responses.filter(response => response.status === 409
      && /VERSION_CONFLICT|STOCK_NOT_ENOUGH/.test(response.body?.msg ?? '')).length === 1);
    const received = await live.ok('admin', `${purchasePath}/${purchaseId}`);
    check('采购并发累计收货不超申请数量', received.status === 'PARTIAL_RECEIVED' && received.items[0].receivedQuantity === 2);
    await live.stock(materialId, 2, '2.00', 1);
  });
  await live.step(`${name}:finish`, async () => {
    const current = await live.ok('admin', `${purchasePath}/${purchaseId}`);
    await live.command(`${name}:finish`, 'admin', endpoint, () => live.operation({ purchaseVersion: current.version,
      items: [{ itemId: id(current.items[0].id), quantity: 1 }] }));
    check('竞争结束后仍可准确收齐剩余数量', (await live.ok('admin', `${purchasePath}/${purchaseId}`)).status === 'RECEIVED');
  });
  await live.stock(materialId, 3, '3.00', 2);
}

export function quoteDeadlineSummary(quoteDeadline, now = Date.now()) {
  const beginning = Date.parse(`${quoteDeadline}T00:00:00+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(quoteDeadline || '') || !Number.isFinite(beginning) || !Number.isFinite(now)
    || new Date(beginning + 8 * 3600000).toISOString().slice(0, 10) !== quoteDeadline) throw new Error('H_OA_RFQ_DEADLINE_INVALID');
  const earliest = beginning + 86400000;
  const beijing = timestamp => new Date(timestamp + 8 * 3600000).toISOString().replace('Z', '+08:00');
  return { quoteDeadline, earliestAwardBeijing: beijing(earliest), checkedAtBeijing: beijing(now),
    remainingSeconds: Math.max(0, Math.ceil((earliest - now) / 1000)) };
}

async function taxedPurchase(live) {
  const name = 'purchase-taxed';
  const state = live.scenario(name);
  const materialId = await live.material(name, { unit: '根' });
  const supplierId = await supplier(live);
  if (!state.rfqId) {
    const title = `${live.fixture.tag}:${name}`;
    let found = records(await live.ok('admin', `/oa/rfq?${new URLSearchParams({ title, pageSize: '100' })}`)).filter(row => row.title === title);
    if (!found.length) {
      await live.ok('admin', '/oa/rfq', 'POST', { rfq: { title, quoteDeadline: date() },
        items: [{ consumableId: materialId, itemName: title, unit: '根', quantity: 3 }] });
      found = records(await live.ok('admin', `/oa/rfq?${new URLSearchParams({ title, pageSize: '100' })}`)).filter(row => row.title === title);
    }
    check('税折扣成本验收使用真实且唯一可恢复询价', found.length === 1);
    state.rfqId = id(found[0].rfqId);
    await live.persist();
  }
  const readRfq = async () => (await live.ok('admin', `/oa/rfq/${state.rfqId}`)).rfq;
  let rfq = await readRfq();
  if (rfq.status === 'DRAFT') await live.ok('admin', `/oa/rfq/${state.rfqId}/invite`, 'POST', [supplierId]);
  if (!state.quotationId) {
    let quotations = records(await live.ok('admin', `/oa/rfq/${state.rfqId}/quotations`)).filter(row => String(row.supplierId) === supplierId);
    if (!quotations.length) {
      const detail = await live.ok('admin', `/oa/rfq/${state.rfqId}`);
      await live.ok('admin', '/oa/rfq/quotations', 'POST', { quotation: { rfqId: state.rfqId, supplierId, currency: 'CNY' },
        items: [{ rfqItemId: id(detail.items[0].itemId), quantity: 3, unitPrice: '3.03', discountRate: '1.0000', taxRate: '0.1000' }] });
      quotations = records(await live.ok('admin', `/oa/rfq/${state.rfqId}/quotations`)).filter(row => String(row.supplierId) === supplierId);
    }
    check('报价金额由真实未税单价税率计算为十元', quotations.length === 1 && cents(quotations[0].totalAmount) === 1000n);
    state.quotationId = id(quotations[0].quotationId);
    await live.persist();
  }
  await submitQuotation(live, state, supplierId);
  rfq = await readRfq();
  if (rfq.status !== 'AWARDED') {
    if (date() <= rfq.quoteDeadline) {
      state.pendingDeadline = rfq.quoteDeadline;
      state.deadlineWait = quoteDeadlineSummary(rfq.quoteDeadline);
      await live.persist();
      console.log(JSON.stringify({ purchaseScenario: name, rfqId: state.rfqId, quotationId: state.quotationId, ...state.deadlineWait }));
      throw new Error('H_OA_RFQ_QUOTE_DEADLINE_NOT_ELAPSED');
    }
    if (process.env.CLOUDFLOW_H_WORKFLOW_PAUSED === '1') throw new Error('H_OA_WORKFLOW_TEMPORARILY_PAUSED');
    if (!rfq.instanceId) await live.ok('admin', `/oa/rfq/${state.rfqId}/award`, 'POST', { quotationId: state.quotationId, reason: `${live.fixture.tag}真实报价成本分摊验收` });
  }
  rfq = await completeApproval(live, name, 'admin', readRfq, value => value.status === 'AWARDED');
  if (!state.purchaseId) {
    const purchase = rfq.purchaseRequestId ? await live.ok('admin', `${purchasePath}/${rfq.purchaseRequestId}`)
      : await live.ok('admin', `/oa/rfq/${state.rfqId}/purchase`, 'POST', {});
    state.purchaseId = id(purchase.id);
    await live.persist();
  }
  const purchase = await approvePurchase(live, name, state.purchaseId, materialId);
  check('采购保留真实报价含税总额且未税乘积不同', cents(purchase.totalAmount) === 1000n && cents(purchase.items[0].amount) === 1000n
    && cents(purchase.items[0].unitPrice) * BigInt(purchase.items[0].quantity) === 909n);
  await receiveSeries(live, name, state.purchaseId, materialId, ['3.33', '3.34', '3.33']);
  await live.stock(materialId, 3, '10.00', 3);
}

export async function purchase(live) {
  await ensureRoles(live, ['manager2']);
  const { purchaseLinks } = await import('./oa08-purchase-links.mjs');
  let failure;
  live.fixture.purchaseCoverage ||= {};
  for (const [name, implementation] of [['ordinary', ordinaryPurchase], ['concurrency', concurrentPurchase], ['links', purchaseLinks], ['taxed', taxedPurchase]]) {
    if (live.fixture.purchaseCoverage[name]?.passed === true) continue;
    try {
      await implementation(live);
      live.fixture.purchaseCoverage[name] = { passed: true, completedAt: new Date().toISOString() };
    } catch (error) {
      failure ??= error;
      live.fixture.purchaseCoverage[name] = { passed: false, failure: failureSummary(error), completedAt: new Date().toISOString() };
      console.error(JSON.stringify({ purchaseScenario: name, failure: failureSummary(error) }));
    }
    await live.persist();
  }
  if (failure) throw failure;
}
