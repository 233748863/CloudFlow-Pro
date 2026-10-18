import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyF5RfqWorkbook(ctx, page, comparisonPanel) {
  const downloading = page.waitForEvent('download');
  await comparisonPanel.getByRole('button', { name: '导出比价表', exact: true }).click();
  const download = await downloading;
  assert.match(download.suggestedFilename(), /\.xlsx$/i);
  const target = path.join(ctx.directory, `f5-comparison-${ctx.caseTag}.xlsx`);
  await assert.rejects(fs.access(target));
  await download.saveAs(target);
  assert.equal(await download.failure(), null);
  const decoded = JSON.parse(execFileSync('python', [fileURLToPath(new URL('./rfq-checks/read-comparison-workbook.py', import.meta.url)), target], {
    encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  }));
  assert.equal(decoded.sheets.length, 1);
  const [headers, ...rows] = decoded.sheets[0].rows;
  const expectedHeaders = ['物料名称', '规格', '单位', '数量', '供应商', '币种', '未税单价', '折扣比例', '税率',
    '折后未税金额', '税额', '含税行金额', '交付天数', '同币种最低单价', '含税报价总额', '同币种总价排名', '供应商分档', '供应商评分', '付款条件'];
  ctx.check('AC-10 实际下载的Excel包含完整十九列和八行报价', JSON.stringify(headers) === JSON.stringify(expectedHeaders) && rows.length === 8);
  const records = rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
  for (const item of ctx.comparison.items) {
    for (const quote of item.quotes) {
      const supplier = ctx.comparison.suppliers.find(value => value.quotationId === quote.quotationId);
      const matches = records.filter(record => record['物料名称'] === item.itemName && record['供应商'] === quote.supplierName
        && record['币种'] === quote.currency);
      assert.equal(matches.length, 1);
      const actual = matches[0];
      ctx.check('AC-10 导出逐行对应真实物料、供应商、币种及数量', actual['规格'] === (item.spec || '')
        && actual['单位'] === (item.unit || '') && Number(actual['数量']) === Number(item.quantity));
      ctx.check('AC-10 导出单价、折扣、税率及含税行额逐分一致', ctx.cents(actual['未税单价']) === ctx.cents(quote.unitPrice)
        && Number(actual['折扣比例']) === Number(quote.discountRate) && Number(actual['税率']) === Number(quote.taxRate)
        && ctx.cents(actual['折后未税金额']) === ctx.cents(quote.lineAmount)
        && ctx.cents(actual['税额']) === ctx.cents(quote.taxAmount) && ctx.cents(actual['含税行金额']) === ctx.cents(quote.grossAmount));
      ctx.check('AC-10 导出交期、最低标记、总价、排名及评分与实际比价一致',
        (quote.deliveryDays == null ? actual['交付天数'] === '' : Number(actual['交付天数']) === Number(quote.deliveryDays))
        && actual['同币种最低单价'] === (quote.isLowest ? '是' : '否')
        && ctx.cents(actual['含税报价总额']) === ctx.cents(supplier.totalAmount)
        && Number(actual['同币种总价排名']) === Number(supplier.rank)
        && actual['供应商分档'] === (supplier.standing || '')
        && (supplier.score == null ? actual['供应商评分'] === '' : Number(actual['供应商评分']) === Number(supplier.score))
        && actual['付款条件'] === (supplier.paymentTerms || ''));
    }
  }
  const bytes = await fs.readFile(target);
  await fs.writeFile(path.join(ctx.directory, `f5-workbook-observations-${ctx.caseTag}.json`), JSON.stringify({
    file: target, hash: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    actuallyDownloaded: true, headers, rows: records, allCellsMatchCurrentComparison: true,
  }, null, 2), { flag: 'wx' });
  ctx.evidence.exportContents = true;
}
