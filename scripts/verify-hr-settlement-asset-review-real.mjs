import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifySettlementAssetReminder } from './verify-hr-settlement-asset-reminder-real.mjs';

export async function verifySettlementAssetReview(context) {
  const { admin, hr, finance, employee, api, successful, database, check, caseTag, marker, userId, settlementId, directory, evidence } = context;
  const root = `/hr/settlement/${settlementId}`;
  const categoryId = database("SELECT category_id FROM oa_asset_category WHERE tenant_id=100000 AND deleted=0 AND status='ACTIVE' ORDER BY category_id LIMIT 1;"); assert.match(categoryId, /^[1-9]\d*$/);
  const assetId = String(successful(await api(admin, '/oa/asset', { method: 'POST', body: { assetCode: `${marker}_asset`, name: `结算核定资产_${caseTag}`, categoryId, purchaseAmount: '100', depreciationFlag: 0 } }), '实际OA建立结算测试资产')); assert.match(assetId, /^[1-9]\d*$/);
  successful(await api(admin, `/oa/asset/${assetId}/borrow?userId=${userId}`, { method: 'POST' }), '实际OA领用资产');
  const read = async () => successful(await api(hr, root), '读取结算资产核定');
  const recalculate = async () => { const row = await read(); return successful(await api(hr, `${root}/calculate`, { method: 'POST', body: { version: row.version } }), '实际重新汇集资产'); };
  const source = row => { const found = row.items.find(item => item.sourceBizType === 'OA_ASSET' && String(item.sourceBizId) === assetId); assert.ok(found); return found; };
  let row = await recalculate(); const itemId = String(source(row).itemId); const observationPath = `${root}/assets/${itemId}`; const reviewPath = `${observationPath}/review`;
  check('真实领用资产只形成零金额待核定来源', source(row).amount === '0.00' && !source(row).confirmed && source(row).evidence.sourceVerified === true);
  await verifySettlementAssetReminder({ ...context, assetId, itemId });
  const denied = (response, label) => check(label, [400,403,404,409].includes(response.status) && response.body?.code !== 200);
  const observation = successful(await api(hr, observationPath), '普通HR读取真实资产责任');
  const body = { version: row.version, sourceFingerprint: observation.sourceFingerprint, resolution: 'LOSS_ASSESSED', amount: '12.345', reason: `${marker}_实际损失核定` };
  denied(await api(finance, observationPath), '财务不能进入资产核定读取入口');
  denied(await api(finance, reviewPath, { method: 'POST', body }), '财务不能修改资产核定');
  denied(await api(employee, reviewPath, { method: 'POST', body }), '员工本人不能核定资产扣款');
  denied(await api(hr, reviewPath, { method: 'POST', body: { ...body, reviewedBy: userId } }), '资产核定不能伪造核定人');
  denied(await api(hr, reviewPath, { method: 'POST', body: { ...body, amount: '999999999999.991' } }), '资产核定拒绝超过容量的原始金额');
  denied(await api(hr, reviewPath, { method: 'POST', body: { ...body, resolution: 'RELEASED_NO_LOSS', amount: '0', reason: `${marker}_责任尚未解除` } }), '责任尚未解除不能核定无损失完成');
  row = successful(await api(hr, reviewPath, { method: 'POST', body }), '真实保存资产损失核定');
  check('实际损失按分舍入且保留输入依据', source(row).amount === '12.35' && source(row).evidence.assetReview.rawAmount === '12.345' && !row.calculated);
  const competition = await Promise.all(['a','b'].map(suffix => api(hr, reviewPath, { method: 'POST', body: { ...body, version: row.version, reason: `${marker}_并发核定_${suffix}` } })));
  check('同版本两人核定仅一次成功', competition.filter(result => result.status === 200 && result.body?.code === 200).length === 1 && competition.filter(result => result.status === 409).length === 1);
  row = await recalculate(); check('重复汇集保留同一资产明细和已核定金额', String(source(row).itemId) === itemId && source(row).amount === '12.35' && source(row).confirmed);
  const output = path.join(directory, `h2-settlement-asset-review-ui-${caseTag}`); await fs.mkdir(output, { recursive: true });
  const origin = new URL(hr.url()).origin; const pageErrors = []; hr.on('pageerror', error => pageErrors.push(error.message));
  const capture = async (scope, label, width) => {
    const layout = await scope.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, client: element.clientWidth, content: element.scrollWidth,
      controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),[role="combobox"],summary')].filter(control => control.getClientRects().length).map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })) }));
    check(`${label} ${width}px资产操作可见且触控区至少44px`, layout.document <= layout.viewport && layout.content <= layout.client && layout.controls.length > 0 && layout.controls.every(control => control.width >= 44 && control.height >= 44));
    await scope.screenshot({ path: path.join(output, `${label}-${width}.png`) });
  };
  await hr.setViewportSize({ width: 1440, height: 1100 }); await hr.goto(`${origin}/hr/final-settlements`, { waitUntil: 'domcontentloaded' });
  await hr.getByLabel('搜索结算单号').fill(row.settlementNo); await hr.getByRole('button', { name: '查看结算', exact: true }).click();
  const detail = hr.getByRole('dialog', { name: '离职结算详情', exact: true }); await detail.getByRole('button', { name: '核定资产处理', exact: true }).click();
  let editor = hr.getByRole('dialog', { name: '核定资产处理', exact: true });
  await editor.getByText('该员工仍有保管或领用责任', { exact: true }).waitFor();
  await editor.getByLabel('核定损失金额（元）', { exact: true }).fill('13.355'); await editor.getByLabel('资产处理原因', { exact: true }).fill(`${marker}_电脑损失依据`);
  await capture(editor, 'desktop-assessment', 1440); await editor.getByRole('button', { name: '保存资产核定', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
  row = await recalculate(); check('普通HR电脑实际保存损失与计算结果', source(row).amount === '13.36' && row.assetRecoveryCost === '13.36');
  successful(await api(admin, `/oa/asset/${assetId}/return`, { method: 'POST' }), '实际OA归还资产并形成完成记录');
  row = await recalculate();
  check('真实归还保留原损失并要求重新核定', source(row).amount === '13.36' && !source(row).confirmed && source(row).evidence.responsibilityReleased === true && source(row).evidence.disposition.purpose === 'RETURN');
  check('归还依据对应实际完成的OA处置记录', database(`SELECT COUNT(*) FROM oa_asset_movement WHERE tenant_id=100000 AND asset_id=${assetId} AND movement_id=${source(row).evidence.disposition.movementId} AND purpose='RETURN' AND status='COMPLETED';`) === '1');
  await hr.setViewportSize({ width: 320, height: 1100 }); await detail.getByRole('button', { name: '重新读取', exact: true }).click();
  await detail.getByText('已解除该员工责任', { exact: true }).waitFor(); await detail.getByRole('button', { name: '核定资产处理', exact: true }).click(); editor = hr.getByRole('dialog', { name: '核定资产处理', exact: true });
  await editor.getByText('已解除该员工责任', { exact: true }).waitFor(); await editor.getByRole('button', { name: '资产处理方式', exact: true }).click(); await hr.getByRole('option', { name: '责任已解除，不扣款', exact: true }).click();
  const reason = `${marker}_实际归还后核定无损失`; await editor.getByLabel('资产处理原因', { exact: true }).fill(reason); await capture(editor, 'mobile-release', 320);
  let lost = false; const reviewRoute = `**/api${reviewPath}`;
  await hr.route(reviewRoute, async route => { if (!lost && route.request().method() === 'POST') { lost = true; const result = await route.fetch(); assert.equal(result.status(), 200); await route.abort('failed'); } else await route.continue(); });
  try { await editor.getByRole('button', { name: '保存资产核定', exact: true }).click(); await editor.getByRole('button', { name: '读取已保存资产核定', exact: true }).waitFor();
    check('资产核定响应丢失保留原因并阻止重复提交', lost && await editor.getByLabel('资产处理原因', { exact: true }).inputValue() === reason && await editor.getByRole('button', { name: '保存资产核定', exact: true }).isDisabled());
  } finally { await hr.unroute(reviewRoute); }
  let failedRead = false; const readRoute = `**/api${root}`;
  await hr.route(readRoute, async route => { if (!failedRead && route.request().method() === 'GET') { failedRead = true; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, msg: '隔离资产读取故障' }) }); } else await route.continue(); });
  try { await editor.getByRole('button', { name: '读取已保存资产核定', exact: true }).click(); await editor.getByText('隔离资产读取故障', { exact: true }).waitFor(); check('资产核定结果读取失败仍锁住保存', failedRead && await editor.getByRole('button', { name: '保存资产核定', exact: true }).isDisabled()); }
  finally { await hr.unroute(readRoute); }
  await editor.getByRole('button', { name: '读取已保存资产核定', exact: true }).click(); await editor.getByRole('button', { name: '载入已保存资产核定', exact: true }).click();
  await editor.getByText('已解除该员工责任', { exact: true }).waitFor();
  check('明确载入完整恢复资产核定原因', await editor.getByLabel('资产处理原因', { exact: true }).inputValue() === reason); await capture(editor, 'mobile-recovered', 320);
  row = await recalculate(); check('真实无损失核定保留旧金额历史且最终扣款为零', source(row).confirmed && source(row).amount === '0.00' && row.assetRecoveryCost === '0.00' && source(row).evidence.assetReviewHistory.some(review => review.amount === '13.36'));
  check('资产核定及真实归还不产生结算入账或付款', database(`SELECT COUNT(*) FROM hr_final_settlement WHERE settlement_id=${settlementId} AND status='DRAFT' AND payment_request_id IS NULL;`) === '1' && database(`SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=${settlementId} AND source_posted_flag=1;`) === '0');
  check('资产双端页面无运行异常', pageErrors.length === 0); evidence.assetReview = true; evidence.assetDisposition = true; evidence.assetReviewReadFaultInjections = 1;
}
