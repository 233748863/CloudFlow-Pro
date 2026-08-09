import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, DatePicker, DictSelect, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, UserSelector } from '@/components/common';
import { useCrmManagement } from '../store';
import { emptyQuoteLine } from '../constants';

export const QuoteDialogContent: React.FC = () => {
  const {
    quoteForm,
    setQuoteForm,
    customerOptions,
    opportunityOptions,
    productOptions,
    opportunities,
    updateQuoteLine,
    selectQuoteLineProduct,
    addQuoteLine,
    removeQuoteLine,
  } = useCrmManagement();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Select value={quoteForm.customerId ? String(quoteForm.customerId) : ''} onValueChange={(value) => setQuoteForm((prev) => ({ ...prev, customerId: Number(value) }))}>
          <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
          <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Select
          value={quoteForm.opportunityId ? String(quoteForm.opportunityId) : 'NONE'}
          onValueChange={(value) => {
            if (value === 'NONE') {
              setQuoteForm((prev) => ({ ...prev, opportunityId: undefined, opportunityName: undefined }));
              return;
            }
            const matched = opportunities.find((item) => item.opportunityId === Number(value));
            setQuoteForm((prev) => ({
              ...prev,
              opportunityId: Number(value),
              opportunityName: matched?.opportunityName,
              customerId: matched?.customerId || prev.customerId,
              customerName: matched?.customerName || prev.customerName,
            }));
          }}
        >
          <SelectTrigger><SelectValue placeholder="关联合同商机" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">不关联商机</SelectItem>
            {opportunityOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Input value={quoteForm.quoteName || ''} onChange={(e) => setQuoteForm((prev) => ({ ...prev, quoteName: e.target.value }))} placeholder="报价名称" />
      <UserSelector
        single
        allowClear
        value={quoteForm.ownerId ? String(quoteForm.ownerId) : null}
        onChange={(id, picked) => setQuoteForm((prev) => ({ ...prev, ownerId: id ? Number(id) : undefined, ownerName: picked?.name || '' }))}
        placeholder="选择负责人"
      />
      <DictSelect
        dictType="sys_currency"
        value={quoteForm.currency || 'CNY'}
        onChange={(value) => setQuoteForm((prev) => ({ ...prev, currency: value }))}
        placeholder="选择币种"
      />
      <DatePicker className="h-11" type="date" value={quoteForm.validUntil || ''} onChange={(e) => setQuoteForm((prev) => ({ ...prev, validUntil: e.target.value }))} placeholder="有效期至" />
      <div className="p-4 md:col-span-2 border border-slate-200 dark:border-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">报价行项目</div>
            <div className="text-xs text-cf-subtle">按产品带入标准价，可继续调整数量、折扣与税率。</div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addQuoteLine}><Plus size={14} className="mr-1.5" />新增行</Button>
        </div>
        <div className="grid gap-3">
          {(quoteForm.quoteLines && quoteForm.quoteLines.length ? quoteForm.quoteLines : [{ ...emptyQuoteLine, sortNo: 1 }]).map((line, index) => (
            <div key={line.quoteLineId || `line-${index}`} className="p-4 border border-slate-200 p-3 dark:border-slate-800">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">第 {index + 1} 行</div>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeQuoteLine(index)} disabled={(quoteForm.quoteLines?.length || 1) <= 1}><Trash2 size={14} /></Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="xl:col-span-2">
                  <Select value={line.productId ? String(line.productId) : 'NONE'} onValueChange={(value) => selectQuoteLineProduct(index, value === 'NONE' ? undefined : Number(value))}>
                    <SelectTrigger><SelectValue placeholder="选择产品" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">手工录入</SelectItem>
                      {productOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Input value={line.productName || ''} onChange={(e) => updateQuoteLine(index, { productName: e.target.value })} placeholder="产品名称" />
                <Input value={line.productNo || ''} onChange={(e) => updateQuoteLine(index, { productNo: e.target.value })} placeholder="产品编号" />
                <Input value={line.category || ''} onChange={(e) => updateQuoteLine(index, { category: e.target.value })} placeholder="分类" />
                <Input value={line.spec || ''} onChange={(e) => updateQuoteLine(index, { spec: e.target.value })} placeholder="规格" />
                <Input value={line.unit || ''} onChange={(e) => updateQuoteLine(index, { unit: e.target.value })} placeholder="单位" />
                <Input type="number" value={String(line.quantity ?? 1)} onChange={(e) => updateQuoteLine(index, { quantity: Number(e.target.value || 0) })} placeholder="数量" />
                <Input type="number" value={String(line.unitPrice ?? 0)} onChange={(e) => updateQuoteLine(index, { unitPrice: Number(e.target.value || 0) })} placeholder="单价" />
                <Input type="number" value={String(line.discountRate ?? 100)} onChange={(e) => updateQuoteLine(index, { discountRate: Number(e.target.value || 0) })} placeholder="折扣率" />
                <Input type="number" value={String(line.taxRate ?? 0)} onChange={(e) => updateQuoteLine(index, { taxRate: Number(e.target.value || 0) })} placeholder="税率" />
                <Input value={String(line.lineAmount ?? 0)} readOnly placeholder="行金额" />
                <Input value={String(line.taxAmount ?? 0)} readOnly placeholder="税额" />
                <Textarea className="md:col-span-2 xl:col-span-4" value={line.remark || ''} onChange={(e) => updateQuoteLine(index, { remark: e.target.value })} placeholder="行备注、折扣说明、交付边界" rows={2} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <Input type="number" value={String(quoteForm.totalAmount || 0)} readOnly placeholder="总金额" />
      <Input type="number" value={String(quoteForm.taxAmount || 0)} readOnly placeholder="税额" />
      <Textarea className="md:col-span-2" value={quoteForm.remark || ''} onChange={(e) => setQuoteForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="报价说明、商务条款、附件说明" rows={3} />
    </div>
  );
};
