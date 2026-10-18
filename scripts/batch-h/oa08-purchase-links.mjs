import { check, jsonRows, pause, sqlText } from './live-lib.mjs';
import { cents, id, records, same, stockPath } from './oa08-live.mjs';
import { approvePurchase, draft } from './oa08-purchase.mjs';

const purchasePath = '/oa/purchase/request';
const name = 'purchase-links';

async function project(live) {
  const state = live.scenario(name);
  const projectName = `${live.fixture.tag}:${name}`;
  if (!state.projectId) {
    const lookup = () => jsonRows(`SELECT JSON_OBJECT('id', CAST(project_id AS CHAR)) FROM oa_project
      WHERE tenant_id = ${sqlText(live.tenantId)} AND project_name = ${sqlText(projectName)}
        AND owner_id = ${sqlText(live.sessions.accounts.admin.userId)} AND deleted = 0`);
    let found = lookup();
    if (!found.length) {
      await live.ok('admin', '/oa/project', 'POST', { projectName, sourceType: 'MANUAL', budgetAmount: '0.00',
        estimatedCost: '0.00', otherCostAmount: '0.00' });
      found = lookup();
    }
    check('采购联验项目由真实API创建且可唯一恢复', found.length === 1);
    state.projectId = id(found[0].id);
    await live.persist();
  }
  const current = await live.ok('admin', `/oa/project/${state.projectId}`);
  check('项目联验仅使用本租户本账号的H隔离项目', current.projectName === projectName
    && String(current.tenantId) === live.tenantId && String(current.ownerId) === live.sessions.accounts.admin.userId);
  return current;
}

async function projectCost(live, projectId, amount, label) {
  const current = await live.ok('admin', `/oa/project/${projectId}`);
  const summary = await live.ok('admin', `/oa/project/${projectId}/cost-summary`);
  const stored = jsonRows(`SELECT JSON_OBJECT('purchase', CAST(purchase_cost_amount AS CHAR),
    'actual', CAST(actual_cost_amount AS CHAR)) FROM oa_project
    WHERE tenant_id = ${sqlText(live.tenantId)} AND project_id = ${sqlText(projectId)} AND deleted = 0`);
  check(`${label}项目缓存与只读SQL金额一致`, stored.length === 1 && cents(current.purchaseCostAmount) === cents(amount)
    && cents(current.actualCostAmount) === cents(amount) && cents(stored[0].purchase) === cents(amount)
    && cents(stored[0].actual) === cents(amount));
  check(`${label}项目汇总只计原采购成本且不重复加入耗材台账`, String(summary.projectId) === projectId
    && cents(summary.purchaseAmount) === cents(amount) && cents(summary.totalAmount) === cents(amount)
    && cents(summary.laborAmount) === 0n && cents(summary.otherAmount) === 0n);
}

function receipts(live, purchaseId) {
  return jsonRows(`SELECT JSON_OBJECT('id', CAST(id AS CHAR), 'item', CAST(item_id AS CHAR),
    'material', CAST(consumable_id AS CHAR), 'quantity', received_quantity, 'operator', CAST(operator_id AS CHAR))
    FROM biz_purchase_receipt WHERE tenant_id = ${sqlText(live.tenantId)}
      AND purchase_id = ${sqlText(purchaseId)} ORDER BY id`);
}

export async function purchaseLinks(live) {
  const state = live.scenario(name);
  const linkedProject = await project(live);
  const projectId = id(linkedProject.projectId);
  const materialId = await live.material(name);
  const created = await draft(live, name, materialId, 3, '2.75', { projectId, projectName: linkedProject.projectName });
  const purchaseId = id(created.id);
  check('真实采购保留项目来源并计算三件八元二角五分', String(created.projectId) === projectId
    && created.items.length === 1 && created.items[0].quantity === 3 && cents(created.totalAmount) === 825n);
  await approvePurchase(live, name, purchaseId, materialId);
  const read = () => live.ok('admin', `${purchasePath}/${purchaseId}`);
  const receive = async (operation, quantity) => {
    const current = await read();
    return live.command(`${name}:${operation}`, 'admin', `${purchasePath}/${purchaseId}/receipt`,
      () => live.operation({ purchaseVersion: current.version, items: [{ itemId: id(current.items[0].id), quantity }] }));
  };
  await live.step(`${name}:partial`, async () => {
    await receive('partial', 1);
    const current = await read();
    check('项目关联采购首次收一件保持部分收货', current.status === 'PARTIAL_RECEIVED' && current.items[0].receivedQuantity === 1);
    await live.stock(materialId, 1, '2.75', 1);
    await projectCost(live, projectId, '0.00', '部分收货沿既有项目汇总口径');
  });
  await live.step(`${name}:full`, async () => {
    await receive('full', 2);
    const current = await read();
    check('项目关联采购收足三件且主单同步', current.status === 'RECEIVED' && current.items[0].receivedQuantity === 3);
    await live.stock(materialId, 3, '8.25', 2);
    await projectCost(live, projectId, '8.25', '全部收货');
  });
  await live.step(`${name}:reverse`, async () => {
    const current = await read();
    state.originalReceipts ||= receipts(live, purchaseId);
    state.originalLedger ||= live.proof(materialId).ledger.slice(0, 2);
    await live.persist();
    const posted = live.fixture.operations[`${name}:full`].result;
    await live.command(`${name}:reverse`, 'admin', `${stockPath}/ledger/${posted.ledgerIds[0]}/reverse`,
      () => live.operation({ purchaseVersion: current.version }));
    const after = await read();
    check('收货冲正同步采购累计一件及部分收货状态', after.status === 'PARTIAL_RECEIVED' && after.items[0].receivedQuantity === 1);
    same('采购项目联动冲正保留每一笔原收货记录', receipts(live, purchaseId), state.originalReceipts);
    same('采购项目联动冲正保留原台账核对字段', live.proof(materialId).ledger.slice(0, 2), state.originalLedger);
    const visible = records(await live.ok('admin', `${purchasePath}/${purchaseId}/receipts?pageNum=1&pageSize=100`));
    check('采购项目联动冲正仍展示两条原收货及唯一冲正标记', visible.length === 2 && visible.filter(row => row.reversed).length === 1);
    await live.stock(materialId, 1, '2.75', 3);
    await projectCost(live, projectId, '0.00', '收货冲正');
  });
  await live.step(`${name}:refill`, async () => {
    await receive('refill', 2);
    const current = await read();
    check('冲正后新收货重新收足且未复用旧收货事实', current.status === 'RECEIVED' && current.items[0].receivedQuantity === 3);
    await live.stock(materialId, 3, '8.25', 4);
    await projectCost(live, projectId, '8.25', '冲正后补收');
  });
  await live.step(`${name}:payment`, async () => {
    const endpoint = `${purchasePath}/${purchaseId}/create-payment`;
    const before = live.proof(materialId);
    const payment = await live.command(`${name}:payment`, 'admin', endpoint, {});
    state.paymentId = id(payment.id);
    await live.persist();
    check('真实生成的付款草稿关联采购金额及本租户', payment.status === 'DRAFT'
      && payment.paymentType === 'PURCHASE' && String(payment.tenantId) === live.tenantId && cents(payment.amount) === 825n);
    const linked = await read();
    check('采购主单保存真实付款关系且未伪造已支付', String(linked.paymentRequestId) === state.paymentId && linked.paymentStatus === 'DRAFT');
    await pause(5500);
    const replay = await live.ok('admin', endpoint, 'POST', {});
    check('重复生成采购付款返回同一真实付款申请', id(replay.id) === state.paymentId);
    const stored = jsonRows(`SELECT JSON_OBJECT('id', CAST(payment.id AS CHAR), 'amount', CAST(payment.amount AS CHAR),
      'status', payment.status) FROM biz_purchase_request purchase JOIN biz_payment_request payment
        ON payment.id = purchase.payment_request_id AND payment.tenant_id = purchase.tenant_id
      WHERE purchase.tenant_id = ${sqlText(live.tenantId)} AND purchase.id = ${sqlText(purchaseId)} AND payment.deleted = 0`);
    check('只读SQL确认采购仅绑定一笔未支付付款草稿', stored.length === 1 && stored[0].id === state.paymentId
      && stored[0].status === 'DRAFT' && cents(stored[0].amount) === 825n);
    same('生成付款关系和重试均不改变耗材库存流水', live.proof(materialId), before);
    await projectCost(live, projectId, '8.25', '建立付款关系');
  });
  await live.step(`${name}:paid-link-rejection`, async () => {
    const before = await read();
    const originalReceipts = receipts(live, purchaseId);
    const originalProject = await live.ok('admin', `/oa/project/${projectId}`);
    const source = live.fixture.operations[`${name}:refill`].result.ledgerIds[0];
    await live.deny('admin', `${stockPath}/ledger/${source}/reverse`, 'POST', live.operation({ purchaseVersion: before.version }),
      '已有真实付款关联的采购拒绝裸冲正', materialId, /REVERSAL_NOT_ALLOWED/);
    same('付款关联拒绝冲正后采购主单及明细不变', await read(), before);
    same('付款关联拒绝冲正后原收货记录不变', receipts(live, purchaseId), originalReceipts);
    same('付款关联拒绝冲正后项目缓存及版本不变', await live.ok('admin', `/oa/project/${projectId}`), originalProject);
    await projectCost(live, projectId, '8.25', '付款关联冲正拒绝');
  });
  await live.stock(materialId, 3, '8.25', 4);
  await projectCost(live, projectId, '8.25', '采购付款项目联验终态');
}
