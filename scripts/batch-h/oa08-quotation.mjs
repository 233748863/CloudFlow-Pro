import { api, check, jsonRows, sqlText, success } from './live-lib.mjs';
import { cents, id } from './oa08-live.mjs';

function document() {
  const content = 'BT /F1 12 Tf 50 740 Td (OA08 ACCEPTANCE FIXTURE - NOT A COMMERCIAL OFFER) Tj '
    + '0 -20 Td (Quantity: 3; net unit price: CNY 3.03; discount: 100 percent) Tj '
    + '0 -20 Td (Net amount: CNY 9.09; tax: 10 percent; gross total: CNY 10.00) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const offset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

async function attachment(live, state) {
  const name = `${live.fixture.tag}-quotation-${id(state.rfqId)}.pdf`;
  const lookup = () => jsonRows(`SELECT JSON_OBJECT('id', CAST(file_id AS CHAR)) FROM sys_file
    WHERE tenant_id = ${sqlText(live.tenantId)} AND file_name = ${sqlText(name)} AND file_type = 'OA_RFQ_QUOTATION'
      AND create_by = ${sqlText(live.sessions.accounts.admin.userId)} AND storage_type = 'LOCAL' AND deleted = 0`);
  let found = lookup();
  check('正式报价附件恢复定位仅对应本租户本录入人本验收文件', found.length <= 1);
  if (!found.length) {
    const uploaded = success(await api(live.sessions.admin.page, '/oa/rfq/quotation-files', { method: 'POST',
      file: { name, type: 'application/pdf', content: document().toString('base64') } }), '专用报价附件真实上传');
    found = lookup();
    check('专用上传返回的文件标识与只读数据库一致', found.length === 1 && id(uploaded.fileId) === found[0].id
      && uploaded.reference === `oa-file:RFQ_QUOTATION:${found[0].id}`);
  }
  check('采购报价附件仅复用原有真实上传记录', !state.quotationFileId || state.quotationFileId === found[0].id);
  state.quotationFileId = id(found[0].id);
  await live.persist();
  return `oa-file:RFQ_QUOTATION:${state.quotationFileId}`;
}

export async function submitQuotation(live, state, supplierId) {
  const reference = await attachment(live, state);
  let detail = await live.ok('admin', `/oa/rfq/quotations/${id(state.quotationId)}`);
  const quotation = detail.quotation;
  check('报价补附件前仍对应原询价供应商和十元含税金额', String(quotation.rfqId) === state.rfqId
    && String(quotation.supplierId) === supplierId && cents(quotation.totalAmount) === 1000n && detail.items.length === 1);
  if (quotation.status === 'DRAFT' && !quotation.attachmentUrl) {
    await live.ok('admin', '/oa/rfq/quotations', 'POST', { quotation: { quotationId: state.quotationId, rfqId: state.rfqId,
      supplierId, currency: 'CNY', version: quotation.version, attachmentUrl: reference },
    items: detail.items.map(item => ({ itemId: id(item.itemId), rfqItemId: id(item.rfqItemId), quantity: item.quantity,
      unitPrice: item.unitPrice, discountRate: item.discountRate, taxRate: item.taxRate })) });
    detail = await live.ok('admin', `/oa/rfq/quotations/${state.quotationId}`);
  }
  check('报价绑定真实专用附件且含税金额保持十元', detail.quotation.attachmentUrl === reference && cents(detail.quotation.totalAmount) === 1000n);
  const download = await live.call('admin', `/oa/rfq/quotations/${state.quotationId}/file`);
  check('录入人经真实受控接口读取本次报价附件', download.status === 200
    && download.text?.startsWith('%PDF-') && download.text.includes('OA08 ACCEPTANCE FIXTURE'));
  if (detail.quotation.status === 'DRAFT') await live.ok('admin', `/oa/rfq/quotations/${state.quotationId}/submit`, 'POST', {});
  const submitted = await live.ok('admin', `/oa/rfq/quotations/${state.quotationId}`);
  check('具有真实附件的供应商报价成功提交', submitted.quotation.status === 'SUBMITTED' && submitted.quotation.attachmentUrl === reference);
}
