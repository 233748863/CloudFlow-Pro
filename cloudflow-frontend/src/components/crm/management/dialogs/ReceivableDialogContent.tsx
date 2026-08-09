import React from 'react';
import { Button, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { useCrmManagement } from '../store';
import { renderInvoiceStatus } from '../helpers';

export const ReceivableDialogContent: React.FC = () => {
  const {
    receivableForm,
    setReceivableForm,
    customerOptions,
    contractOptions,
    applyContractToReceivable,
    invoiceCandidates,
    bindInvoiceToReceivable,
  } = useCrmManagement();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Select value={receivableForm.customerId ? String(receivableForm.customerId) : ''} onValueChange={(value) => setReceivableForm((prev) => ({ ...prev, customerId: Number(value) }))}>
          <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
          <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Select
          value={receivableForm.contractId ? String(receivableForm.contractId) : 'NONE'}
          onValueChange={(value) => {
            if (value === 'NONE') {
              setReceivableForm((prev) => ({ ...prev, contractId: undefined, contractNo: undefined }));
              return;
            }
            applyContractToReceivable(Number(value));
          }}
        >
          <SelectTrigger><SelectValue placeholder="选择OA合同" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">不关联合同</SelectItem>
            {contractOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Input value={receivableForm.receivableName || ''} onChange={(e) => setReceivableForm((prev) => ({ ...prev, receivableName: e.target.value }))} placeholder="回款名称" />
      <Input type="number" value={String(receivableForm.plannedAmount || 0)} onChange={(e) => setReceivableForm((prev) => ({ ...prev, plannedAmount: Number(e.target.value || 0) }))} placeholder="计划金额" />
      <Input value={receivableForm.contractNo || ''} onChange={(e) => setReceivableForm((prev) => ({ ...prev, contractNo: e.target.value }))} placeholder="合同编号" />
      <DatePicker className="h-11" type="date" value={receivableForm.dueDate || ''} onChange={(e) => setReceivableForm((prev) => ({ ...prev, dueDate: e.target.value }))} placeholder="到期日期" />
      {receivableForm.receivableId ? (
        <div className="p-4 admin-dialog-field md:col-span-2 border border-slate-200 p-3 dark:border-slate-800">
          <div className="text-sm font-medium">销项发票联动</div>
          <div className="text-xs text-cf-subtle">当前发票状态：{renderInvoiceStatus(receivableForm.invoiceStatus)}</div>
          <div className="admin-dialog-field">
            {invoiceCandidates.length ? invoiceCandidates.map((item) => (
              <div key={item.invoiceId} className="p-4 flex items-center justify-between bg-[var(--cf-surface-muted)] px-3 py-2 text-sm dark:bg-slate-900">
                <div>
                  <div>{item.invoiceCode} / {item.invoiceNo}</div>
                  <div className="text-xs text-cf-subtle">{item.status || '-'} / {item.grossAmount || 0}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void bindInvoiceToReceivable(receivableForm, item.invoiceId!)} disabled={item.receivableId === receivableForm.receivableId}>
                  {item.receivableId === receivableForm.receivableId ? '已绑定' : '绑定'}
                </Button>
              </div>
            )) : <div className="text-sm text-cf-subtle">暂无可绑定销项发票</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
};
