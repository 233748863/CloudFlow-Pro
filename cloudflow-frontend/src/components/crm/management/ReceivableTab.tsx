import React, { useState } from 'react';
import { toast } from 'sonner';
import { Eye, Handshake, ReceiptText, Wallet } from 'lucide-react';
import { BaseDialog, Button, Input, Label, TableActionHead, TableHead, TableHeader, TableRowActions, Textarea } from '@/components/common';
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
      <section className="cf-section-card">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Wallet size={16} />回款计划</div>
          <div className="mt-1 text-xs text-slate-500">主操作 = 新增回款。次操作统一放到行内。</div>
        </div>
        <table className="w-full">
          <TableHeader>
            <tr>
              <TableHead>名称</TableHead>
              <TableHead>状态 / 发票</TableHead>
              <TableHead>金额</TableHead>
              <TableActionHead>操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {receivables.map((item) => (
              <tr key={item.receivableId}>
                <td className="px-4 py-3 text-sm">{item.receivableName}</td>
                <td className="px-4 py-3 text-sm">
                  <div>{renderStatus(item.status)}</div>
                  <div className="text-xs text-slate-500">{renderInvoiceStatus(item.invoiceStatus)}</div>
                </td>
                <td className="px-4 py-3 text-sm">{item.plannedAmount || 0}</td>
                <td className="px-4 py-3 text-right">
                  <TableRowActions
                    align="end"
                    overflowLabel="更多"
                    actions={[
                      { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                      { label: '编辑回款', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'receivable', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:receivable:edit' },
                      { label: '确认回款', icon: <Wallet size={14} />, onClick: () => setConfirm({ action: 'confirmReceivable', item }), hidden: item.status === 'RECEIVED', semantic: 'process', permissionKey: 'crm:receivable:confirm' },
                      { label: '退款审批', icon: <Wallet size={14} />, onClick: () => { setRefundItem(item); setRefundAmount(String(item.receivedAmount || 0)); setRefundReason(''); }, hidden: Number(item.receivedAmount || 0) <= 0, semantic: 'disable', permissionKey: 'crm:approval:refund' },
                      {
                        label: '绑定发票',
                        icon: <ReceiptText size={14} />,
                        onClick: async () => {
                          await loadReceivableInvoices(item);
                          openDialog({ type: 'receivable', item });
                        },
                        semantic: 'bind',
                        permissionKey: 'crm:receivable:bind-invoice',
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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
          <div className="text-sm text-slate-500">
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
