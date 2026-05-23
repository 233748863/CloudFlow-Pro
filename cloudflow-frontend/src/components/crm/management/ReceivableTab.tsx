import React from 'react';
import { Eye, Handshake, ReceiptText, Wallet } from 'lucide-react';
import { TableHead, TableHeader, TableActionHead, TableRowActions } from '@/components/common';
import { useCrmManagement } from './store';
import { renderInvoiceStatus, renderStatus } from './helpers';

export const ReceivableTab: React.FC = () => {
  const { receivables, openDialog, openCustomerWorkspace, setConfirm, loadReceivableInvoices } = useCrmManagement();
  return (
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
  );
};
