import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyF5RfqFoundation } from './verify-f5-rfq-foundation.mjs';

export async function verifyF5RfqQuotes(ctx) {
  await verifyF5RfqFoundation(ctx);
  const { admin, manager, recorder, api, successful, check, evidence, marker, database, get, post, reject,
    today, shifted, cents, sleep, main, rfq, first, second, tied, foreignCurrency, fromPurchase, snapshot } = ctx;
  const recorderId = String((await get('/auth/info', recorder)).user.userId);
  const pdf = Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%F5-${ctx.caseTag}\n%%EOF\n`);
  const pdfHash = createHash('sha256').update(pdf).digest('hex');
  const upload = async page => {
    await sleep(5200);
    return successful(await api(page, '/oa/rfq/quotation-files', { method: 'POST', file: {
      name: marker + '_正式报价.pdf', type: 'application/pdf', content: pdf.toString('base64') } }), 'F5 实际报价附件上传');
  };
  const recorderFile = await upload(recorder);
  const ownerFile = await upload(admin);
  const quotation = (id, page = admin) => get('/oa/rfq/quotations/' + id, page);
  const firstPrices = [{ unitPrice: '10.01', discountRate: '0.9500', taxRate: '0.1300', deliveryDays: 6 },
    { unitPrice: '20.02', discountRate: '1.0000', taxRate: '0.0600', deliveryDays: 7 }];
  const secondPrices = [{ unitPrice: '11.11', discountRate: '1.0000', taxRate: '0.1300', deliveryDays: 2 },
    { unitPrice: '19.99', discountRate: '1.0000', taxRate: '0.0600', deliveryDays: 2 }];
  const quoteBody = (target, supplier, prices, file, extra = {}) => ({ quotation: { rfqId: target.rfq.rfqId,
    supplierId: supplier.supplierId, quoteDate: today, validUntil: shifted(30), currency: 'CNY',
    deliveryDays: 7, warrantyMonths: 12, paymentTerms: '验收后30日付款', attachmentUrl: file.reference,
    totalAmount: '999999.99', taxAmount: '99999.99', entryBy: 990000701, status: 'SUBMITTED', ...extra },
  items: target.items.map((item, index) => ({ rfqItemId: item.itemId, quantity: item.quantity,
    brand: '实际品牌' + index, model: '完整型号' + index, ...prices[index] })) });
  const save = async (body, page = admin) => quotation(await post('/oa/rfq/quotations', body, page), page);
  const quoteSnapshot = id => snapshot(`SELECT * FROM oa_supplier_quotation WHERE tenant_id=100000 AND quotation_id=${id};
    SELECT * FROM oa_supplier_quotation_item WHERE tenant_id=100000 AND quotation_id=${id} ORDER BY item_id;`);
  let firstQuote = await save(quoteBody(main, first, firstPrices, recorderFile), recorder);
  check('AC-6 报价身份与含税金额由实际保存确定', String(firstQuote.quotation.entryBy) === recorderId
    && firstQuote.quotation.status === 'DRAFT' && cents(firstQuote.quotation.totalAmount) === 7468n
    && cents(firstQuote.quotation.taxAmount) === 611n && firstQuote.items.map(value => cents(value.lineAmount)).join(',') === '2853,4004');
  const initialLines = firstQuote.items;
  firstQuote = await save({ ...firstQuote, items: firstQuote.items.slice(0, 1) }, recorder);
  check('AC-6 报价草稿移除明细实际释放活动行', firstQuote.items.length === 1 && cents(firstQuote.quotation.totalAmount) === 3224n
    && database(`SELECT deleted FROM oa_supplier_quotation_item WHERE tenant_id=100000 AND item_id=${initialLines[1].itemId};`) === '1');
  reject(await api(recorder, '/oa/rfq/quotations/' + firstQuote.quotation.quotationId + '/submit', { method: 'POST', body: {} }),
    'AC-6 缺少物料的报价不能提交', '提交报价须覆盖全部询价物料');
  firstQuote = await save({ ...firstQuote, items: initialLines.map(value => ({ ...value, itemId: null })) }, recorder);
  check('AC-6 重新加入物料恢复原行并保留唯一来源', firstQuote.items.length === 2
    && firstQuote.items.map(value => value.itemId).join(',') === initialLines.map(value => value.itemId).join(',')
    && database(`SELECT COUNT(*) FROM oa_supplier_quotation_item WHERE tenant_id=100000 AND quotation_id=${firstQuote.quotation.quotationId};`) === '2');
  for (const [label, body, message] of [
    ['外部询价物料', { ...firstQuote, items: [{ ...firstQuote.items[0], rfqItemId: fromPurchase.items[0].itemId }] }, '报价物料不属于当前询价'],
    ['重复报价物料', { ...firstQuote, items: [firstQuote.items[0], firstQuote.items[0]] }, '同一询价物料不能重复报价'],
    ['数量不一致', { ...firstQuote, items: [{ ...firstQuote.items[0], quantity: 4 }] }, '报价数量必须与询价物料一致'],
    ['无效币种', { ...firstQuote, quotation: { ...firstQuote.quotation, currency: 'XXX1' } }, '报价币种无效'],
  ]) {
    const before = quoteSnapshot(firstQuote.quotation.quotationId);
    reject(await api(recorder, '/oa/rfq/quotations', { method: 'POST', body }), 'AC-6 ' + label + '被拒绝', message);
    check('AC-6 报价校验失败时原主表和明细保持', quoteSnapshot(firstQuote.quotation.quotationId) === before);
  }
  const downloaded = await api(recorder, '/oa/rfq/quotations/' + firstQuote.quotation.quotationId + '/file');
  check('AC-6/16 原录入人读取正式报价附件字节一致', downloaded.status === 200 && downloaded.sha256 === pdfHash && downloaded.cacheControl?.includes('no-store'));
  const secondQuote = await save(quoteBody(main, second, secondPrices, ownerFile, { deliveryDays: 2, warrantyMonths: 24 }));
  const tiedQuote = await save(quoteBody(main, tied, firstPrices.map(value => ({ ...value, deliveryDays: null })), ownerFile, { deliveryDays: null }));
  const dollarQuote = await save(quoteBody(main, foreignCurrency, [{ unitPrice: '1.23', discountRate: '1.0000', taxRate: '0.0000', deliveryDays: 10 },
    { unitPrice: '2.34', discountRate: '1.0000', taxRate: '0.0000', deliveryDays: 10 }], ownerFile, { currency: 'USD', deliveryDays: 10 }));
  check('AC-6 三家其他报价逐分汇总准确', cents(secondQuote.quotation.totalAmount) === 8004n
    && cents(secondQuote.quotation.taxAmount) === 673n && cents(tiedQuote.quotation.totalAmount) === 7468n
    && cents(dollarQuote.quotation.totalAmount) === 837n && cents(dollarQuote.quotation.taxAmount) === 0n);
  const candidates = [[firstQuote, recorder], [secondQuote, admin], [tiedQuote, admin], [dollarQuote, admin]];
  for (const [candidate, page] of candidates) await post('/oa/rfq/quotations/' + candidate.quotation.quotationId + '/submit', {}, page);
  check('AC-6 四份完整报价实际提交并回写响应家数', (await rfq(main.rfq.rfqId)).rfq.respondedCount === 4);
  await post('/oa/rfq/quotations/' + firstQuote.quotation.quotationId + '/withdraw', {}, recorder);
  check('AC-6 撤回报价回退响应家数并清空响应时间', (await rfq(main.rfq.rfqId)).rfq.respondedCount === 3
    && (await ctx.invitationList(main.rfq.rfqId)).find(value => value.supplierId === first.supplierId).respondTime == null);
  firstQuote = await quotation(firstQuote.quotation.quotationId, recorder);
  firstQuote = await save(firstQuote, recorder);
  await post('/oa/rfq/quotations/' + firstQuote.quotation.quotationId + '/submit', {}, recorder);
  check('AC-6 撤回后实际重提恢复原报价和响应家数', (await rfq(main.rfq.rfqId)).rfq.respondedCount === 4);
  for (const [page, target] of [[admin, firstQuote], [manager, firstQuote], [recorder, secondQuote]]) {
    reject(await api(page, '/oa/rfq/quotations/' + target.quotation.quotationId), 'AC-16 截止前其他录入人和审批人不能读取报价', '无权读取该供应商报价及附件');
    reject(await api(page, '/oa/rfq/quotations/' + target.quotation.quotationId + '/file'), 'AC-16 截止前报价附件遵循相同保密范围', '无权读取该供应商报价及附件');
  }
  const own = await get('/oa/rfq/' + main.rfq.rfqId + '/quotations', recorder);
  check('AC-16 截止前录入人列表只含本人报价', own.length === 1 && own[0].quotationId === firstQuote.quotation.quotationId);
  for (const page of [admin, manager]) {
    reject(await api(page, '/oa/rfq/' + main.rfq.rfqId + '/comparison'), 'AC-16 截止前负责人和审批人均不能横向比价', '报价截止前不能查看各家比价');
    reject(await api(page, '/oa/rfq/' + main.rfq.rfqId + '/comparison/export'), 'AC-10/16 截止前不能导出各家报价');
  }
  database(`UPDATE oa_purchase_rfq SET quote_deadline=CURRENT_DATE WHERE tenant_id=100000 AND rfq_id=${main.rfq.rfqId};`);
  reject(await api(admin, '/oa/rfq/' + main.rfq.rfqId + '/comparison'), 'AC-16 截止当天仍保密', '报价截止前不能查看各家比价');
  database(`UPDATE oa_purchase_rfq SET quote_deadline=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY) WHERE tenant_id=100000 AND rfq_id=${main.rfq.rfqId};`);
  await ctx.trigger('oaRfqDeadlineScan');
  const comparison = await get('/oa/rfq/' + main.rfq.rfqId + '/comparison');
  const cny = comparison.suppliers.filter(value => value.currency === 'CNY');
  const usd = comparison.suppliers.filter(value => value.currency === 'USD');
  check('AC-7 两个币种独立排名并保留并列最低总价', comparison.items.length === 2 && cny.length === 3 && usd.length === 1
    && cny.filter(value => value.isLowestTotal && value.rank === 1 && cents(value.totalAmount) === 7468n).length === 2
    && cny.find(value => value.supplierId === second.supplierId).rank === 3 && usd[0].rank === 1 && usd[0].isLowestTotal);
  check('AC-7 同币种最低单价和逐行税额准确', comparison.items[0].quotes.filter(value => value.currency === 'CNY' && value.isLowest).length === 2
    && comparison.items[1].quotes.find(value => value.supplierId === second.supplierId).isLowest
    && cents(comparison.items[0].quotes.find(value => value.supplierId === first.supplierId).grossAmount) === 3224n);
  check('AC-7 最短交期由明确天数计算且空值不被当作零', comparison.suppliers.filter(value => value.isShortestDelivery).length === 1
    && comparison.suppliers.find(value => value.supplierId === second.supplierId).isShortestDelivery
    && comparison.suppliers.find(value => value.supplierId === tied.supplierId).deliveryDays == null
    && comparison.items.every(value => value.quotes.find(cell => cell.supplierId === second.supplierId).isShortestDelivery));
  const cnySummary = comparison.summaries.find(value => value.currency === 'CNY');
  check('AC-7 同币种区间均值与价差逐分准确', cents(cnySummary.lowestTotal) === 7468n && cents(cnySummary.highestTotal) === 8004n
    && cents(cnySummary.avgTotal) === 7647n && cents(cnySummary.priceSpread) === 536n);
  for (const target of [first, second, tied, foreignCurrency]) {
    const actual = await ctx.supplier(target.supplierId);
    const presented = comparison.suppliers.find(value => value.supplierId === target.supplierId);
    check('AC-8 每家比价评分和分档等于实际供应商主数据', presented.score === actual.score && presented.standing === actual.standing);
  }
  check('AC-17 指定审批人在截止后可读取完整比价', JSON.stringify(await get('/oa/rfq/' + main.rfq.rfqId + '/comparison', manager)) === JSON.stringify(comparison));
  reject(await api(recorder, '/oa/rfq/' + main.rfq.rfqId + '/comparison'), 'AC-17 报价录入权限不能替代比价权限');
  reject(await api(recorder, '/oa/rfq/quotations/' + secondQuote.quotation.quotationId), 'AC-16/17 截止后非比价人员仍不能读取他人报价');
  Object.assign(ctx, { main: await rfq(main.rfq.rfqId), comparison, firstQuote, secondQuote, tiedQuote, dollarQuote,
    quoteBody, saveQuotation: save, quotation, quoteSnapshot, firstPrices, secondPrices, ownerFile, recorderFile, recorderId });
  evidence.quotations = true;
  evidence.precision = true;
  evidence.comparison = true;
  evidence.scores = true;
  evidence.confidentiality = true;
}
