import assert from 'node:assert/strict';
import { captureOwnedLostResponse } from './runtime-checks/owned-lost-response.mjs';
import path from 'node:path';
import { fundsActionUi } from './verify-hr-settlement-funds-real.mjs';
import { submitSettlementWithLostResponse, approveSettlementInUi } from './verify-hr-settlement-approval-ui.mjs';
import { verifyReversalMoneyBoundaries } from './verify-hr-settlement-reversal-money-real.mjs';
import { verifyReversalLayouts } from './verify-hr-settlement-reversal-layout-real.mjs';

export async function verifySettlementReversal(context) {
  const { admin, hr, finance, employee, api, successful, database, check, id: originalId, slipId, directory, caseTag, evidence, userId } = context;
  const originalRoot = `/hr/settlement/${originalId}`;
  const post = (page, endpoint, body) => api(page, endpoint, { method: 'POST', ...(body === undefined ? {} : { body }) });
  const readOriginal = async () => successful(await api(admin, originalRoot), '读取冲正原单');
  const rejected = (response, label) => check(`${label} HTTP=${response.status}`, [400,401,403,404,409,422].includes(response.status) && response.body?.code !== 200);
  const waitFor = async (read, predicate, label) => {
    const end = Date.now() + 90000;
    do { const row = await read(); if (predicate(row)) return row; await new Promise(resolve => setTimeout(resolve, 600)); } while (Date.now() < end);
    throw new Error(label);
  };
  const original = await readOriginal(); assert.equal(original.status, 'CLOSED');
  const originalItems = JSON.stringify(original.items);
  const originalSalary = database(`SELECT CONCAT(status,':',reserved_settlement_id,':',digest_sha256) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${slipId};`);
  const reason = `保留原单重新核定_${caseTag}`;
  for (const [actor, label] of [[hr, '人事没有冲正权限'], [employee, '员工不能冲正本人结算']]) rejected(await post(actor, `${originalRoot}/reverse`, { version: original.version, reason }), label);
  await admin.setViewportSize({ width: 320, height: 1050 });
  await admin.goto(new URL(`/hr/final-settlements?settlementId=${originalId}`, admin.url()).href, { waitUntil: 'domcontentloaded' });
  const detail = admin.getByRole('dialog', { name: '离职结算详情', exact: true });
  await detail.getByRole('button', { name: '建立冲正', exact: true }).click();
  const dialog = admin.getByRole('dialog', { name: '建立离职结算冲正', exact: true });
  await dialog.getByLabel('冲正原因', { exact: true }).fill(reason); await dialog.getByRole('checkbox').check();
  const createPattern = `**/api/hr/settlement/${originalId}/reverse`; let creates = 0;
  const lostResponse = captureOwnedLostResponse(() => creates++);
  await admin.route(createPattern, lostResponse.handler);
  try {
    await dialog.getByRole('button', { name: '建立冲正草稿', exact: true }).click(); await dialog.getByRole('button', { name: '读取已保存结果', exact: true }).waitFor();
    check('建立冲正响应丢失后保留原因并禁止重复建单', creates === 1 && await dialog.getByRole('button', { name: '建立冲正草稿', exact: true }).isDisabled() && await dialog.getByLabel('冲正原因', { exact: true }).inputValue() === reason);
  } finally { await admin.unroute(createPattern, lostResponse.handler); lostResponse.assertSucceeded(); }
  await dialog.getByRole('button', { name: '读取已保存结果', exact: true }).click(); await dialog.getByRole('button', { name: '打开已建立的冲正单', exact: true }).waitFor();
  await dialog.screenshot({ path: path.join(directory, `h2-reversal-create-recovered-${caseTag}.png`) });
  const id = String((await readOriginal()).reversal.reversalSettlementId); assert.match(id, /^[1-9]\d*$/);
  const root = `/hr/settlement/${id}`; const read = async () => successful(await api(admin, root), '读取真实冲正进度');
  await dialog.getByRole('button', { name: '打开已建立的冲正单', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  await detail.getByRole('heading', { name: '冲正单', exact: true }).waitFor();
  let row = await read();
  const cents = value => BigInt(value.replace('.', ''));
  check('冲正草稿关联原单且全部明细为原入账金额相反数', row.settlementKind === 'REVERSAL' && String(row.reversal.originalSettlementId) === originalId
    && row.status === 'DRAFT' && row.approvalStatus === 'DRAFT' && cents(row.netAmount) === -cents(original.netAmount)
    && row.items.length === original.items.length && row.items.every(item => original.items.some(source => String(source.itemId) === String(item.evidence.reversalOfItemId) && cents(source.amount) === -cents(item.amount))));
  rejected(await api(admin, root, { method: 'PUT', body: { version: row.version, remark: '不能改反向金额' } }), '冲正禁止编辑原核定');
  rejected(await post(admin, `${root}/calculate`, { version: row.version }), '冲正禁止重新计算金额');
  const retained = async () => {
    check('冲正审批期间原单金额和来源保持已付状态', JSON.stringify((await readOriginal()).items) === originalItems
    && database(`SELECT CONCAT(status,':',reserved_settlement_id,':',digest_sha256) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${slipId};`) === originalSalary
    && database(`SELECT superseded_flag FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${originalId};`) === '0');
    if (context.observeSources) await context.observeSources('reversalPending', { id: originalId, row: await readOriginal() });
  };
  const financeId = await finance.evaluate(async () => String((await (await import('/src/services/api/auth.ts')).getInfo()).userId));
  const adminId = await admin.evaluate(async () => String((await (await import('/src/services/api/auth.ts')).getInfo()).userId));
  const taskFor = async () => {
    const tasks = await waitFor(async () => JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR))),JSON_ARRAY()) FROM wf_task
      WHERE tenant_id=100000 AND instance_id=(SELECT instance_id FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${id}) AND status='TODO';`)), tasks => tasks.length > 0, '冲正未产生实际财务待办');
    check('冲正实际待办排除提交人及离职本人', tasks.every(task => task.assignee !== adminId && task.assignee !== userId));
    const task = tasks.find(task => task.assignee === financeId); assert.ok(task); return task;
  };
  await submitSettlementWithLostResponse({ ...context, hr: admin, id, reversal: true }); await taskFor(); await retained();
  await submitSettlementWithLostResponse({ ...context, hr: admin, id, reversal: true, withdraw: true });
  await waitFor(read, row => row.approvalStatus === 'CANCELLED', '冲正撤回未完成'); await retained();
  successful(await post(admin, `${root}/reversal-submit`, { version: (await read()).version }), '重新提交冲正');
  let task = await taskFor(); successful(await post(finance, '/workflow/wf/complete', { taskId: task.id, action: 'REJECT', comment: '实际冲正退审验证' }), '财务实际驳回冲正');
  await waitFor(read, row => row.approvalStatus === 'REJECTED', '冲正退审未同步'); await retained();
  successful(await post(admin, `${root}/reversal-submit`, { version: (await read()).version }), '退审后重提冲正'); task = await taskFor();
  await approveSettlementInUi({ ...context, task, expected: await read() });
  row = await waitFor(read, row => row.approvalStatus === 'APPROVED', '冲正财务结果未同步'); await retained();
  await fundsActionUi({ ...context, page: admin, id, action: 'confirm', width: 1440 });
  row = await read();
  if (row.funds.direction === 'PAYMENT') {
    row = await waitFor(read, row => Boolean(row.funds.paymentRequestId), '冲正补付款未建立');
    check('补付款使用独立付款申请', row.funds.paymentRequestId !== original.funds.paymentRequestId);
    rejected(await post(employee, `/oa/payment/request/${row.funds.paymentRequestId}/pay`), '本人不能确认冲正补付款');
    successful(await post(finance, `/oa/payment/request/${row.funds.paymentRequestId}/pay`), '财务实际确认冲正补付款');
  } else if (row.funds.direction === 'RECEIPT') await fundsActionUi({ ...context, page: finance, id, action: 'receipt', width: 320 });
  row = await waitFor(read, row => row.status === 'PAID', '冲正资金未完成来源恢复');
  check('实际反向收付完成后原工资恢复且原单解除唯一占位', row.items.every(item => item.posted) && row.reversal.completed
    && database(`SELECT superseded_flag FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${originalId};`) === '1'
    && database(`SELECT COUNT(*) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${slipId} AND status IN ('SUBMITTED','CONFIRMED') AND reserved_settlement_id IS NULL;`) === '1');
  check('原结算金额及明细保留不被冲正覆盖', (await readOriginal()).netAmount === original.netAmount && JSON.stringify((await readOriginal()).items) === originalItems);
  await verifyReversalMoneyBoundaries({ ...context, id, row });
  if (context.observeSources) await context.observeSources('restored', { id: originalId, reversalId: id, row });
  await fundsActionUi({ ...context, page: admin, id, action: 'close', width: 320 }); row = await read(); check('冲正完成后独立关闭', row.status === 'CLOSED');
  await verifyReversalLayouts({ ...context, id, original });
  const created = String(successful(await post(admin, '/hr/settlement', { lifecycleApplicationId: original.lifecycleApplicationId, remark: `冲正后重新核定_${caseTag}` }), '实际创建冲正后的新结算草稿'));
  check('完整冲正后允许从同次离职重新结算', created !== id && created !== originalId);
  if (context.observeSources) await context.observeSources('replacementDraft', { id: created });
  evidence.reversalHttp = true; evidence.reversalIndependentApproval = true; evidence.reversalMoney = true; evidence.reversalRestoredSources = true;
  evidence.reversalLostResponse = true; evidence.reversalDesktop = true; evidence.reversalMobile = true; evidence.reversalSettlementId = id;
}
