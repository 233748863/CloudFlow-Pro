import React from 'react';
import { Eye, LifeBuoy, RefreshCcw, Send } from 'lucide-react';
import { TableHead, TableHeader, TableActionHead, TableRowActions } from '@/components/common';
import { useCrmManagement } from './store';
import { renderSeverity, renderStatus } from './helpers';

export const TicketTab: React.FC = () => {
  const { tickets, openDialog, openCustomerWorkspace, setConfirm } = useCrmManagement();
  return (
    <table className="w-full min-w-[900px]">
      <TableHeader>
        <tr>
          <TableHead>工单</TableHead>
          <TableHead>客户</TableHead>
          <TableHead>严重度</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>负责人</TableHead>
          <TableActionHead>操作</TableActionHead>
        </tr>
      </TableHeader>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {tickets.map((item) => (
          <tr key={item.ticketId}>
            <td className="px-4 py-3 text-sm">{item.ticketTitle}</td>
            <td className="px-4 py-3 text-sm">{item.customerName || '-'}</td>
            <td className="px-4 py-3 text-sm">{renderSeverity(item.severity)}</td>
            <td className="px-4 py-3 text-sm">{renderStatus(item.status)}</td>
            <td className="px-4 py-3 text-sm">{item.ownerName || '-'}</td>
            <td className="px-4 py-3 text-right">
              <TableRowActions
                align="end"
                overflowLabel="更多"
                actions={[
                  { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                  { label: '编辑工单', icon: <LifeBuoy size={14} />, onClick: () => openDialog({ type: 'ticket', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:ticket:edit' },
                  { label: '解决工单', icon: <RefreshCcw size={14} />, onClick: () => setConfirm({ action: 'resolveTicket', item: { ...item, solution: item.solution || '已处理完成' } }), hidden: item.status === 'RESOLVED' || item.status === 'CLOSED', semantic: 'process', permissionKey: 'crm:ticket:resolve' },
                  { label: '关闭工单', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'closeTicket', item }), hidden: item.status === 'CLOSED', semantic: 'disable', permissionKey: 'crm:ticket:close' },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
