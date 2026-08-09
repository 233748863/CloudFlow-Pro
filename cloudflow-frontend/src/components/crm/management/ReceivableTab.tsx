import React, { useState } from 'react';
import { toast } from 'sonner';
import { Eye, Handshake, ReceiptText, Wallet } from 'lucide-react';
import { BaseDialog, Button, Input, Label, Textarea } from '@/components/common';
import { crmApi, CrmReceivable } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { useCrmManagement } from './store';
import { renderInvoiceStatus, renderStatus } from './helpers';

export const ReceivableTab: React.FC = () => {
  const { receivables, load, openDialog, openCustomerWorkspace, setConfirm, loadReceivableInvoices } = useCrmManagement();
  const [refundItem, setRefundItem] = useState<CrmReceivable | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const submitRefund = async () => {
    if (!refundItem?.receivableId) {
      return;
    }
    const amount = Number(refundAmount || 0);
    if (amount <= 0) {
      toast.error('退款金额必须大于 0');
      return;
    }
    try {
      await crmApi.submitRefund({
        receivableId: refundItem.receivableId,
        refundAmount: amount,
        reason: refundReason.trim() || undefined,
      });
      toast.success('已提交退款审批');
      setRefundItem(null);
      setRefundAmount('');
      setRefundReason('');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交退款审批失败'));
    }
  };

  return (
    <>
      <table className="unity-data-table admin-source-table admin-crm-table min-w-[760px]">
        <thead>
            <tr>
              <th>名称</th>
              <th>状态 / 发票</th>
              <th>金额</th>
              <th className="text-right">操作</th>
            </tr>
        </thead>
        <tbody>
            {receivables.map((item) => (
              <tr key={item.receivableId}>
                <td><strong>{item.receivableName}</strong></td>
                <td>
                  <strong>{renderStatus(item.status)}</strong>
                  <small>{renderInvoiceStatus(item.invoiceStatus)}</small>
                </td>
                <td>{item.plannedAmount || 0}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" data-tooltip="客户360" aria-label="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Eye size={15} /></button>
                    <button type="button" data-tooltip="编辑回款" aria-label="编辑回款" onClick={() => openDialog({ type: 'receivable', item })}><Handshake size={15} /></button>
                    {item.status !== 'RECEIVED' ? <button type="button" data-tooltip="确认回款" aria-label="确认回款" onClick={() => setConfirm({ action: 'confirmReceivable', item })}><Wallet size={15} /></button> : null}
                    {Number(item.receivedAmount || 0) > 0 ? <button type="button" data-tooltip="退款审批" aria-label="退款审批" onClick={() => { setRefundItem(item); setRefundAmount(String(item.receivedAmount || 0)); setRefundReason(''); }}><Wallet size={15} /></button> : null}
                    <button
                      type="button"
                      data-tooltip="绑定发票" aria-label="绑定发票"
                      onClick={async () => {
                          await loadReceivableInvoices(item);
                          openDialog({ type: 'receivable', item });
                        }}
                    >
                      <ReceiptText size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

      <BaseDialog
        open={Boolean(refundItem)}
        title={`退款审批 - ${refundItem?.receivableName || ''}`}
        onClose={() => setRefundItem(null)}
        width="normal"
        footer={
          <>
            <Button variant="outline" onClick={() => setRefundItem(null)}>取消</Button>
            <Button onClick={() => void submitRefund()}>提交审批</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="text-sm text-cf-subtle">
            已到账金额：{refundItem?.receivedAmount || 0}；当前状态：{renderStatus(refundItem?.status)}。
          </div>
          <div>
            <Label>退款金额</Label>
            <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="输入退款金额" />
          </div>
          <div>
            <Label>退款原因</Label>
            <Textarea rows={4} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="例如：合同终止退费、重复回款冲销" />
          </div>
        </div>
      </BaseDialog>
    </>
  );
};
