import React from 'react';
import { toast } from 'sonner';
import { Eye, Handshake, Plus, RefreshCcw, Send, TriangleAlert } from 'lucide-react';
import { TableHead, TableHeader, TableActionHead, TableRowActions } from '@/components/common';
import { crmApi } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { useCrmManagement } from './store';
import { renderStatus } from './helpers';

export const QuoteTab: React.FC = () => {
  const { quotes, openDialog, openCustomerWorkspace, setConfirm, goToContract, load } = useCrmManagement();
  return (
    <table className="w-full min-w-[980px]">
      <TableHeader>
        <tr>
          <TableHead>报价</TableHead>
          <TableHead>客户</TableHead>
          <TableHead>金额</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>合同</TableHead>
          <TableActionHead>操作</TableActionHead>
        </tr>
      </TableHeader>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {quotes.map((item) => (
          <tr key={item.quoteId}>
            <td className="px-4 py-3 text-sm">
              <div>{item.quoteName}</div>
              <div className="text-xs text-slate-500">{item.quoteNo || '-'}</div>
            </td>
            <td className="px-4 py-3 text-sm">{item.customerName || '-'}</td>
            <td className="px-4 py-3 text-sm">
              <div>{item.totalAmount || 0}</div>
              <div className="text-xs text-slate-500">{item.quoteLines?.length || 0} 行 / 税额 {item.taxAmount || 0}</div>
            </td>
            <td className="px-4 py-3 text-sm">{renderStatus(item.status)}</td>
            <td className="px-4 py-3 text-sm">{item.contractNo || '-'}</td>
            <td className="px-4 py-3 text-right">
              <TableRowActions
                align="end"
                overflowLabel="更多"
                actions={[
                  { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                  { label: '编辑报价', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'quote', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:quote:edit' },
                  { label: '提交提审', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'submitQuote', item }), hidden: item.status !== 'DRAFT' && item.status !== 'REJECTED', semantic: 'submit', permissionKey: 'crm:quote:submit' },
                  { label: '发送报价', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'sendQuote', item }), hidden: item.status !== 'APPROVED' && item.status !== 'DRAFT' && item.status !== 'REJECTED', semantic: 'send', permissionKey: 'crm:quote:send' },
                  { label: '接受报价', icon: <RefreshCcw size={14} />, onClick: () => setConfirm({ action: 'acceptQuote', item }), hidden: item.status !== 'APPROVED' && item.status !== 'SENT', semantic: 'process', permissionKey: 'crm:quote:accept' },
                  { label: '标记过期', icon: <TriangleAlert size={14} />, onClick: () => setConfirm({ action: 'expireQuote', item }), hidden: item.status === 'ACCEPTED' || item.status === 'EXPIRED', semantic: 'disable', permissionKey: 'crm:quote:expire' },
                  {
                    label: '转合同',
                    icon: <Plus size={14} />,
                    onClick: async () => {
                      try {
                        const contractId = await crmApi.createContractDraft(item.quoteId!);
                        toast.success(`已生成合同草稿 #${contractId}`);
                        await load();
                        goToContract(contractId);
                      } catch (error) {
                        toast.error(getErrorMessage(error, '生成合同草稿失败'));
                      }
                    },
                    semantic: 'custom',
                    permissionKey: 'crm:contract:draft',
                  },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
