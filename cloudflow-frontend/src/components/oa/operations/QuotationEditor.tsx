import React, { useEffect, useState } from 'react';
import { Button, Input } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { oaPost, type QuotationDetail, type OaPurchaseRfqSupplier, type OaSupplierQuotationItem } from '@/services/api/oaOperations';
import { saveAuthorizedFile } from '@/services/api/file';
import { OpsTable, money, useMutation } from './OperationsKit';
import { FormFields, optionsOf } from './RecordEditor';
import PrivateFileInput from './PrivateFileInput';

export default function QuotationEditor({ value, suppliers, editable, onClose, onSaved }: { value: QuotationDetail | null; suppliers: OaPurchaseRfqSupplier[]; editable: boolean; onClose: () => void; onSaved: () => void }) {
  const mutation = useMutation(); const [draft, setDraft] = useState<QuotationDetail | null>(value); useEffect(() => setDraft(value), [value]);
  const updateItem = (index: number, patch: Partial<OaSupplierQuotationItem>) => setDraft(current => current && ({ ...current, items: current.items.map((item, position) => position === index ? { ...item, ...patch } : item) }));
  return <BaseDialog open={!!value} title="供应商报价" width="extra-wide" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>关闭</Button>{editable && <Button disabled={mutation.busy || !draft} onClick={() => draft && void mutation.run(() => oaPost('/rfq/quotations', draft), () => { onSaved(); onClose(); })}>保存报价</Button>}</>}>
    {draft && <div className="oa-operations space-y-4"><p className="oa-ops-warning">报价截止日期当天仍保密，仅原录入人可编辑。正式提交须附原报价文件；金额由服务器逐行计算税额后汇总。</p>
      <FormFields value={draft.quotation} onChange={quotation => setDraft({ ...draft, quotation })} disabled={!editable} fields={[
        { key: 'supplierId', label: '供应商', type: 'select', numeric: true, options: optionsOf(suppliers, 'supplierId', 'supplierName'), required: true, disabled: !!draft.quotation.quotationId },
        { key: 'quoteDate', label: '报价日期', type: 'date' }, { key: 'validUntil', label: '报价有效期至', type: 'date' }, { key: 'currency', label: '币种代码', maxLength: 3, required: true },
        { key: 'paymentTerms', label: '付款条件', maxLength: 50 }, { key: 'deliveryDays', label: '交付天数', type: 'number', min: 0, step: 1 }, { key: 'deliveryDate', label: '交付日期', type: 'date' },
        { key: 'warrantyMonths', label: '质保月数', type: 'number', min: 0, step: 1 }, { key: 'remark', label: '报价说明', type: 'textarea', maxLength: 500, wide: true },
      ]} />
      <div className="oa-quotation-items"><OpsTable headers={['物料 / 数量', '未税单价', '折扣（0–1）', '税率（0–1）', '品牌 / 型号', '交付天数', '已保存未税行额']}>
        {draft.items.map((item, index) => <tr key={item.rfqItemId}><td data-field-label="物料 / 数量">{item.itemName}<div>{item.quantity} {item.unit}</div></td><td data-field-label="未税单价"><Input aria-label="未税单价" type="number" min={0} max={99999999.99} step={0.01} value={item.unitPrice ?? ''} disabled={!editable} onChange={event => updateItem(index, { unitPrice: event.target.value })} /></td>
          <td data-field-label="折扣（0–1）"><Input aria-label="折扣比例" type="number" min={0} max={1} step={0.0001} value={item.discountRate ?? 1} disabled={!editable} onChange={event => updateItem(index, { discountRate: event.target.value })} /></td><td data-field-label="税率（0–1）"><Input aria-label="税率" type="number" min={0} max={1} step={0.0001} value={item.taxRate ?? 0} disabled={!editable} onChange={event => updateItem(index, { taxRate: event.target.value })} /></td>
          <td data-field-label="品牌 / 型号"><Input aria-label="品牌" value={item.brand || ''} disabled={!editable} maxLength={100} onChange={event => updateItem(index, { brand: event.target.value })} /><Input aria-label="型号" value={item.model || ''} disabled={!editable} maxLength={100} onChange={event => updateItem(index, { model: event.target.value })} /></td><td data-field-label="交付天数"><Input aria-label="明细交付天数" type="number" min={0} step={1} value={item.deliveryDays ?? ''} disabled={!editable} onChange={event => updateItem(index, { deliveryDays: event.target.value ? Number(event.target.value) : undefined })} /></td><td data-field-label="已保存未税行额">{money(item.lineAmount)}</td></tr>)}
      </OpsTable></div>
      {editable && <PrivateFileInput path="/rfq/quotation-files" value={draft.quotation.attachmentUrl} onChange={reference => setDraft({ ...draft, quotation: { ...draft.quotation, attachmentUrl: reference } })} label="供应商原始报价附件" />}
      {draft.quotation.quotationId && draft.quotation.attachmentUrl && <Button variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => saveAuthorizedFile({ bizType: 'OA_RFQ_QUOTATION', bizId: String(draft.quotation.quotationId), reference: draft.quotation.attachmentUrl }, '供应商报价文件'), undefined, '')}>查看已保存附件</Button>}
      <p>已保存含税总额：{draft.quotation.currency} {money(draft.quotation.totalAmount)} · 税额：{money(draft.quotation.taxAmount)}</p>
    </div>}
  </BaseDialog>;
}
