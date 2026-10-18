import assert from 'node:assert/strict';
import { captureOwnedLostResponse } from './runtime-checks/owned-lost-response.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifySettlementReversal } from './verify-hr-settlement-reversal-real.mjs';
import { verifySettlementProofCapacity, verifySettlementCapacitySecrets } from './verify-hr-settlement-proof-capacity.mjs';

export async function resumeSettlementFunds(context) {
  const { resume, database, session, check, evidence, fundsMode } = context;
  assert.match(resume, /^[a-f0-9]{12}$/);
  const marker = `settlement_draft_${resume}`;
  const rows = sql => database(sql).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const saved = rows(`SELECT JSON_OBJECT('id',CAST(s.settlement_id AS CHAR),'employeeId',CAST(s.employee_id AS CHAR),'userId',CAST(e.user_id AS CHAR),'status',s.status,'amount',CAST(s.net_amount AS CHAR))
    FROM hr_final_settlement s JOIN hr_employee e ON e.tenant_id=s.tenant_id AND e.id=s.employee_id
    JOIN sys_user u ON u.tenant_id=e.tenant_id AND u.user_id=e.user_id
    WHERE s.tenant_id=100000 AND s.remark='${marker}_approval' AND s.settlement_kind='NORMAL' AND s.superseded_flag=0
      AND s.approval_status='APPROVED' AND e.create_by='${marker}' AND u.user_name='${marker}';`);
  assert.equal(saved.length, 1, 'Resume requires one exact retained owned settlement');
  const row = saved[0]; assert.ok(['CONFIRMED', 'PAID'].includes(row.status));
  assert.equal(fundsMode, Number(row.amount) > 0 ? 'payment' : Number(row.amount) < 0 ? 'receipt' : 'netting');
  for (const value of [row.id, row.employeeId, row.userId]) assert.match(value, /^[1-9]\d*$/);
  const slipId = database(`SELECT source_biz_id FROM hr_final_settlement_item WHERE tenant_id=100000 AND settlement_id=${row.id} AND source_biz_type='HR_SALARY_SLIP' AND JSON_EXTRACT(source_snapshot,'$.active')=true;`);
  const fundsAssetId = database(`SELECT asset_id FROM oa_asset WHERE tenant_id=100000 AND asset_code='${marker}_funds_asset' AND deleted=0;`);
  assert.match(slipId, /^[1-9]\d*$/); assert.match(fundsAssetId, /^[1-9]\d*$/);
  const employee = await session(marker, 'g_holiday_employee');
  const hr = await session(`sd_hr_${resume}`, 'g_holiday_employee');
  const finance = await session(`sd_finance_${resume}`, 'g_holiday_employee');
  check('从保留原结算继续收付核验且不重建业务单', true);
  evidence.fundsResumedFrom = marker;
  await verifySettlementFunds({ ...context, hr, finance, employee, marker, ...row, slipId, fundsAssetId, resumeConfirmed: true });
}

export async function prepareSettlementFundsAsset({ admin, hr, api, successful, database, check, marker, userId, id, current, fundsMode }) {
  const categoryId = database("SELECT category_id FROM oa_asset_category WHERE tenant_id=100000 AND deleted=0 AND status='ACTIVE' ORDER BY category_id LIMIT 1;"); assert.match(categoryId, /^[1-9]\d*$/);
  const assetId = String(successful(await api(admin, '/oa/asset', { method: 'POST', body: { assetCode: `${marker}_funds_asset`, name: '结算收付及关闭验证资产', categoryId, purchaseAmount: '30000', depreciationFlag: 0 } }), '实际创建收付验证资产')); assert.match(assetId, /^[1-9]\d*$/);
  successful(await api(admin, `/oa/asset/${assetId}/borrow?userId=${userId}`, { method: 'POST' }), '实际领用收付验证资产');
  const root = `/hr/settlement/${id}`;
  let row = successful(await api(hr, `${root}/calculate`, { method: 'POST', body: { version: current.version } }), '实际汇集收付资产来源');
  const item = row.items.find(value => value.sourceBizType === 'OA_ASSET' && String(value.sourceBizId) === assetId); assert.ok(item);
  const cents = fundsMode === 'payment' ? 10000n : BigInt(current.netAmount.replace('.', '')) + (fundsMode === 'receipt' ? 10000n : 0n);
  assert.ok(cents > 0n); const amount = `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  const observed = successful(await api(hr, `${root}/assets/${item.itemId}`), '实际核实资产责任');
  row = successful(await api(hr, `${root}/assets/${item.itemId}/review`, { method: 'POST', body: {
    version: row.version, sourceFingerprint: observed.sourceFingerprint, resolution: 'LOSS_ASSESSED', amount, reason: '隔离收付场景中逐单核定的真实测试资产损失金额',
  } }), '实际核定结算资产损失');
  row = successful(await api(hr, `${root}/calculate`, { method: 'POST', body: { version: row.version } }), '按已核定损失计算收付净额');
  check('实际核定形成所选正零负净额且来源齐备', row.missingRequirements.length === 0 && (fundsMode === 'payment' ? Number(row.netAmount) > 0 : row.netAmount === (fundsMode === 'receipt' ? '-100.00' : '0.00')));
  return assetId;
}

export async function verifySettlementFunds(context) {
  const { admin, hr, finance, employee, api, successful, database, check, id, fundsAssetId, fundsMode, evidence, directory, caseTag, slipId, state, requests } = context;
  const root = `/hr/settlement/${id}`;
  const post = (actor, endpoint, body) => api(actor, endpoint, { method: 'POST', ...(body === undefined ? {} : { body }) });
  const read = async () => successful(await api(hr, root), '读取真实结算收付状态');
  const rejected = (result, label) => check(`${label} HTTP=${result.status}`, [400,401,403,404,409,422].includes(result.status) && result.body?.code !== 200);
  const waitFor = async (accepted, label) => {
    const deadline = Date.now() + 90000;
    do { const row = await read(); if (accepted(row)) return row; await new Promise(resolve => setTimeout(resolve, 600)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  let row = await read(); const amount = row.netAmount;
  if (!context.resumeConfirmed) {
    rejected(await post(employee, `${root}/confirm`, { version: row.version }), '本人不能确认结算');
    rejected(await post(hr, `${root}/close`, { version: row.version }), '尚未收付不能关闭');
    await fundsActionUi({ ...context, page: hr, action: 'confirm', width: 1440 });
    row = await waitFor(value => value.status !== 'DRAFT', '结算确认未保存');
  }
  check('确认保持原审批金额和方向', row.netAmount === amount && row.funds.direction === fundsMode.toUpperCase() && Boolean(row.funds.confirmedTime));
  if (context.observeSources) await context.observeSources('confirmed', { id, row });
  rejected(await api(hr, root, { method: 'PUT', body: { version: row.version, remark: '确认后不得改写' } }), '已确认结算禁止修改');
  if (fundsMode === 'payment') {
    row = await waitFor(value => Boolean(value.funds.paymentRequestId), '未恢复唯一OA付款申请'); const payment = String(row.funds.paymentRequestId); assert.match(payment, /^[1-9]\d*$/);
    if (row.status !== 'PAID') {
      check('OA建款后原工资仍未入账', row.status === 'CONFIRMED' && row.items.every(item => !item.posted) && database(`SELECT status FROM hr_salary_slip WHERE tenant_id=100000 AND id=${slipId};`) !== 'PAID');
      rejected(await post(employee, `/oa/payment/request/${payment}/pay`), '本人不能确认实际付款');
      rejected(await post(hr, `/oa/payment/request/${payment}/pay`), '无付款权的人事不能确认实际付款');
      successful(await post(finance, `/oa/payment/request/${payment}/pay`), '财务确认实际OA付款');
      row = await waitFor(value => value.status === 'PAID', '实际付款尚未同步来源入账');
    }
    const payload = JSON.parse(database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload')) FROM outbox_event WHERE tenant_id=100000 AND event_type='HR_SETTLEMENT_PAYMENT_PAID' AND aggregate_id=${payment};`));
    const port = Number(state.services.find(service => service.name === 'hr')?.port); assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
    const replay = async (body, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}/inner/hr/settlement/payment-event`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa', 'X-Tenant-Id': '100000', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const result = { status: response.status, body: await response.json() }; requests.push({ path: '/inner/hr/settlement/payment-event', method: 'POST', status: result.status, code: result.body?.code }); return result;
    };
    successful(await replay(payload), '实际内部入口重复接收原付款事件');
    rejected(await replay({ ...payload, amount: '0.01' }), '内部付款通知不能篡改金额');
    rejected(await replay(payload, { 'X-From-Service': 'cloudflow-service-crm' }), '其他服务不能冒充OA付款');
    rejected(await replay(payload, { 'X-Tenant-Id': '100001' }), '其他租户不能重放本单付款');
    rejected(await post(employee, '/hr/inner/hr/settlement/payment-event', payload), '浏览器不能调用内部入账接口');
    check('实际付款事件重复处理不修改结算版本', (await read()).version === row.version);
    evidence.fundsPaymentReplay = true;
  } else if (fundsMode === 'receipt') {
    if (row.status !== 'PAID') {
      check('负净额确认后只待收款且全部来源未入账', row.status === 'CONFIRMED' && row.funds.paymentRequestId == null && row.items.every(item => !item.posted));
      rejected(await post(hr, `${root}/receipt`, { version: row.version, proofFileId: '1', actualDate: '2026-10-01' }), '人事不能登记财务收款');
      if (process.argv.includes('--hr-settlement-proof-capacity')) {
        await verifySettlementProofCapacity(context);
        await new Promise(resolve => setTimeout(resolve, 5100));
      }
      await fundsActionUi({ ...context, page: finance, action: 'receipt', width: 320 });
      row = await waitFor(value => value.status === 'PAID', '实际收款尚未入账');
    }
    evidence.fundsPaidObserved = row.status === 'PAID';
    const proofId = String(row.funds.proofFileId); assert.match(proofId, /^[1-9]\d*$/);
    const proof = await api(finance, `${root}/proof/${proofId}`);
    console.log(`H2_SETTLEMENT_PROOF_RESPONSE: status=${proof.status}; bytes=${proof.size}; cache=${proof.cacheControl}; type=${proof.contentType}`);
    const expectedProof = Buffer.from('%PDF-1.7\nactual-receipt-fixture\n%%EOF');
    check('实际收款凭据可通过业务入口完整下载且禁止缓存', proof.status === 200 && proof.size === expectedProof.length
      && proof.sha256 === createHash('sha256').update(expectedProof).digest('hex')
      && typeof proof.cacheControl === 'string' && proof.cacheControl.split(',').every(value => value.trim().toLowerCase() === 'no-store')
      && proof.contentType.includes('application/pdf') && proof.nosniff === 'nosniff');
    rejected(await api(admin, `/auth/system/file/${proofId}/content`), '管理员通用文件入口不能绕过私有收款凭据保护');
    rejected(await api(employee, `${root}/proof/${proofId}`), '本人不能读取内部收款凭据');
    await new Promise(resolve => setTimeout(resolve, 5100));
    successful(await post(finance, `${root}/receipt`, { version: row.version, proofFileId: proofId, actualDate: row.funds.actualDate }), '重复确认原收款保持原事实');
    check('重复实际收款不重复入账', (await read()).version === row.version);
    evidence.fundsPrivateProof = true;
  } else {
    row = await waitFor(value => value.status === 'PAID', '净额抵销未完成');
    check('零净额只形成抵销证据且没有OA付款', row.funds.paymentRequestId == null && row.funds.proofFileId == null
      && database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(calculation_snapshot,'$.funds.kind')) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${id};`) === 'NETTING');
  }
  check('真实收付后全部来源入账且原工资占位保留', row.items.every(item => item.posted) && Boolean(row.funds.paidTime)
    && database(`SELECT CONCAT(status,':',reserved_settlement_id) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${slipId};`) === `PAID:${id}`);
  if (context.observeSources) await context.observeSources('posted', { id, row });
  rejected(await post(hr, `${root}/close`, { version: row.version }), '结清后资产仍未归还时禁止关闭');
  successful(await post(admin, `/oa/asset/${fundsAssetId}/return`), '实际完成资产责任解除');
  await new Promise(resolve => setTimeout(resolve, 5100));
  await fundsActionUi({ ...context, page: hr, action: 'close', width: 320 });
  row = await read();
  check('真实收付和资产处置完成后关闭且原金额不变', row.status === 'CLOSED' && row.netAmount === amount && Boolean(row.funds.closedTime));
  for (const width of [1440, 320]) {
    await finance.setViewportSize({ width, height: 1050 }); await finance.goto(new URL(`/hr/final-settlements?settlementId=${id}`, finance.url()).href, { waitUntil: 'domcontentloaded' });
    const detail = finance.getByRole('dialog', { name: '离职结算详情', exact: true });
    await detail.getByRole('heading', { name: '收付进度', exact: true }).scrollIntoViewIfNeeded();
    const layout = await detail.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, client: element.clientWidth, content: element.scrollWidth }));
    check(`${width}px完整结算收付详情没有横向溢出`, layout.document <= layout.viewport && layout.content <= layout.client);
    await detail.screenshot({ path: path.join(directory, `h2-settlement-funds-${fundsMode}-${caseTag}-${width}.png`) });
  }
  evidence.fundsDirection = fundsMode; evidence.fundsPosted = true; evidence.fundsClosed = true; evidence.fundsSettlementId = id;
  evidence.fundsDesktop = true; evidence.fundsMobile = true;
  if (process.argv.includes('--hr-settlement-proof-capacity')) await verifySettlementCapacitySecrets(context);
  if (process.argv.includes('--hr-settlement-reversal-complete')) await verifySettlementReversal(context);
}

export async function fundsActionUi({ page, action, width, id, check, directory, caseTag, evidence }) {
  const settings = { confirm: ['确认结算', '确认离职结算', '确认结算'], receipt: ['登记实际收款', '登记结算实际收款', '确认实际收款'], close: ['核对并关闭', '核对并关闭结算', '核对并关闭'] }[action];
  await page.setViewportSize({ width, height: 1050 }); await page.goto(new URL(`/hr/final-settlements?settlementId=${id}`, page.url()).href, { waitUntil: 'domcontentloaded' });
  const detail = page.getByRole('dialog', { name: '离职结算详情', exact: true }); await detail.getByRole('button', { name: settings[0], exact: true }).click();
  const dialog = page.getByRole('dialog', { name: settings[1], exact: true });
  const layout = await dialog.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
    client: element.clientWidth, content: element.scrollWidth,
    controls: Array.from(element.querySelectorAll('button')).filter(button => button.getBoundingClientRect().width > 0)
      .every(button => button.getBoundingClientRect().width >= 44 && button.getBoundingClientRect().height >= 44) }));
  check(`${width}px${settings[1]}无横向溢出且操作区至少44px`, layout.document <= layout.viewport && layout.content <= layout.client && layout.controls);
  let actualDate;
  if (action === 'receipt') {
    actualDate = await dialog.getByLabel('实际收款日期', { exact: true }).inputValue();
    await dialog.getByLabel('收款凭据（PDF、PNG、JPEG，最多10MiB）', { exact: true }).setInputFiles({ name: `settlement-${caseTag}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nactual-receipt-fixture\n%%EOF') });
    await dialog.getByRole('button', { name: '上传收款凭据', exact: true }).click(); await dialog.getByRole('status').filter({ hasText: '凭据已上传' }).waitFor();
  }
  await dialog.getByRole('checkbox').check();
  const pattern = `**/api/hr/settlement/${id}/${action}`; let submitted = 0;
  const lostResponse = captureOwnedLostResponse(() => submitted++);
  await page.route(pattern, lostResponse.handler);
  try {
    await dialog.getByRole('button', { name: settings[2], exact: true }).click(); await dialog.getByRole('button', { name: '读取已保存结果', exact: true }).waitFor();
    check(`${settings[2]}响应丢失后保留输入并禁止重复操作`, submitted === 1 && await dialog.getByRole('button', { name: settings[2], exact: true }).isDisabled()
      && (action !== 'receipt' || await dialog.getByLabel('实际收款日期', { exact: true }).inputValue() === actualDate));
  } finally { await page.unroute(pattern, lostResponse.handler); lostResponse.assertSucceeded(); }
  await dialog.getByRole('button', { name: '读取已保存结果', exact: true }).click(); await dialog.getByRole('button', { name: '返回最新结算详情', exact: true }).waitFor();
  check(`${settings[2]}读取恢复没有重复收付款`, submitted === 1 && await dialog.getByRole('button', { name: settings[2], exact: true }).isDisabled());
  await dialog.screenshot({ path: path.join(directory, `h2-settlement-${action}-recovered-${caseTag}.png`) });
  await dialog.getByRole('button', { name: '返回最新结算详情', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  evidence.fundsLostResponse = true;
}
