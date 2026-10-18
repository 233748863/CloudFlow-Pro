import React, { useEffect, useState } from 'react';
import { Button, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { crmApi, type CrmReceivable } from '@/services/api/crm';
import { useCrmManagement } from '../store';
import { renderInvoiceStatus } from '../helpers';
import { money, useMutation } from '../../operations/OperationsKit';

export const ReceivableDialogContent: React.FC = () => {
  const {
    receivableForm,
    setReceivableForm,
    receivableSaveError,
    receivableReady,
    receivableLoading,
    saving,
    dialog,
    openDialog,
    hasPermission,
    customerOptions,
    contractOptions,
    applyContractToReceivable,
    invoiceCandidates,
    bindInvoiceToReceivable,
  } = useCrmManagement();
  const [latest, setLatest] = useState<CrmReceivable>();
  const mutation = useMutation();
  useEffect(() => { setLatest(undefined); }, [receivableForm.receivableId]);
  if (!receivableReady) return <div className="space-y-3">
    {receivableLoading ? <p role="status">正在读取回款及关联限制，请稍候。</p> : <>
      <p role="alert">{receivableSaveError || '回款尚未读取，不能保存。'}</p>
      <Button className="!min-h-[44px] !min-w-[44px]" variant="outline" onClick={() => openDialog(dialog)}>重新读取回款</Button>
    </>}
  </div>;
  return (
    <fieldset disabled={saving} className="grid min-w-0 gap-4 md:grid-cols-2">
      {receivableSaveError && <div className="crm-ops-warning space-y-2 md:col-span-2">
        <p role="alert">{receivableSaveError}；未保存输入仍保留。</p>
        {receivableForm.receivableId && <Button className="!min-h-[44px] !min-w-[44px]" variant="outline" disabled={mutation.busy || saving}
          onClick={() => void mutation.run(() => crmApi.getReceivable(receivableForm.receivableId!), setLatest, '')}>读取最新回款（保留草稿）</Button>}
      </div>}
      {latest && latest.receivableId === receivableForm.receivableId && <div className="crm-ops-warning space-y-2 md:col-span-2">
        <p>当前已保存：计划 {money(latest.plannedAmount)}，到账 {money(latest.receivedAmount)}，未收 {money(latest.outstandingAmount)}；客户 {latest.customerName || latest.customerId}；合同 {latest.contractNo || '无'}。</p>
        <p>采用最新记录时保留您输入的名称、计划金额、到期日和说明；关联已锁定时使用上述客户与合同。</p>
        <Button className="!min-h-[44px] !min-w-[44px]" variant="outline" disabled={saving || latest.version == null} onClick={() => {
          setReceivableForm(previous => ({
            ...latest,
            receivableName: previous.receivableName,
            plannedAmount: previous.plannedAmount,
            dueDate: previous.dueDate,
            remark: previous.remark,
            customerId: latest.bindingLocked ? latest.customerId : previous.customerId,
            customerName: latest.bindingLocked ? latest.customerName : previous.customerName,
            contractId: latest.bindingLocked ? latest.contractId : previous.contractId,
            contractNo: latest.bindingLocked ? latest.contractNo : previous.contractNo,
          }));
          setLatest(undefined);
        }}>已核对，保留计划输入并采用最新记录</Button>
      </div>}
      {receivableForm.receivableId && <div className="space-y-2 text-sm text-cf-muted md:col-span-2">
        <p>已到账 {money(receivableForm.receivedAmount)}；剩余未收 {money(receivableForm.outstandingAmount)}，由服务器计算。</p>
        {receivableForm.invoiceId != null && <p role="status">已绑定发票，请在发票页面登记收款；此处只查看到账结果。</p>}
        {receivableForm.bindingLocked && <p role="status">已有业务记录，客户与合同已锁定；到账、核销和退款请使用专用操作。</p>}
      </div>}
      <div className="md:col-span-2">
        <Select disabled={receivableForm.bindingLocked === true} value={receivableForm.customerId ? String(receivableForm.customerId) : ''} onValueChange={(value) => setReceivableForm((prev) => ({ ...prev, customerId: Number(value), contractId: undefined, contractNo: undefined }))}>
          <SelectTrigger aria-label="回款客户" className="!min-h-[44px]"><SelectValue placeholder="选择客户" /></SelectTrigger>
          <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Select
          disabled={receivableForm.bindingLocked === true}
          value={receivableForm.contractId ? String(receivableForm.contractId) : 'NONE'}
          onValueChange={(value) => {
            if (value === 'NONE') {
              setReceivableForm((prev) => ({ ...prev, contractId: undefined, contractNo: undefined }));
              return;
            }
            applyContractToReceivable(Number(value));
          }}
        >
          <SelectTrigger aria-label="回款合同" className="!min-h-[44px]"><SelectValue placeholder="选择OA合同" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">不关联合同</SelectItem>
            {contractOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Input className="!min-h-[44px]" aria-label="回款名称" maxLength={120} value={receivableForm.receivableName || ''} onChange={(e) => setReceivableForm((prev) => ({ ...prev, receivableName: e.target.value }))} placeholder="回款名称" />
      <Input className="!min-h-[44px]" aria-label="计划回款金额" type="number" min="0" max="999999999999.99" step="0.01" value={String(receivableForm.plannedAmount || 0)} onChange={(e) => setReceivableForm((prev) => ({ ...prev, plannedAmount: Number(e.target.value || 0) }))} placeholder="计划金额" />
      <Input className="!min-h-[44px]" aria-label="回款合同编号" value={receivableForm.contractNo || ''} readOnly placeholder="选择合同后自动带入编号" />
      <DatePicker className="!min-h-[44px]" aria-label="回款到期日期" type="date" value={receivableForm.dueDate || ''} onChange={(e) => setReceivableForm((prev) => ({ ...prev, dueDate: e.target.value }))} placeholder="到期日期" />
      <Textarea className="md:col-span-2" aria-label="回款说明" value={receivableForm.remark || ''} maxLength={500} onChange={(event) => setReceivableForm(previous => ({ ...previous, remark: event.target.value }))} placeholder="回款说明" rows={3} />
      {receivableForm.receivableId && hasPermission('crm:receivable:bind-invoice') ? (
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
                <Button className="!min-h-[44px] !min-w-[44px]" size="sm" variant="outline" onClick={() => void bindInvoiceToReceivable(receivableForm, item.invoiceId!)} disabled={item.receivableId === receivableForm.receivableId || saving}>
                  {item.receivableId === receivableForm.receivableId ? '已绑定' : '绑定'}
                </Button>
              </div>
            )) : <div className="text-sm text-cf-subtle">暂无可绑定销项发票</div>}
          </div>
        </div>
      ) : null}
    </fieldset>
  );
};
