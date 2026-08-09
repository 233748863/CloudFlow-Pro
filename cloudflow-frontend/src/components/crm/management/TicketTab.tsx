import React from 'react';
import { Eye, LifeBuoy, RefreshCcw, Send } from 'lucide-react';
import { useCrmManagement } from './store';
import { renderSeverity, renderStatus } from './helpers';

export const TicketTab: React.FC = () => {
  const { tickets, openDialog, openCustomerWorkspace, setConfirm } = useCrmManagement();
  return (
    <table className="unity-data-table admin-source-table admin-crm-table min-w-[900px]">
      <thead>
        <tr>
          <th>工单</th>
          <th>客户</th>
          <th>严重度</th>
          <th>状态</th>
          <th>负责人</th>
          <th className="text-right">操作</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((item) => (
          <tr key={item.ticketId}>
            <td><strong>{item.ticketTitle}</strong></td>
            <td>{item.customerName || '-'}</td>
            <td>{renderSeverity(item.severity)}</td>
            <td>{renderStatus(item.status)}</td>
            <td>{item.ownerName || '-'}</td>
            <td>
              <div className="admin-users-row-actions">
                <button type="button" data-tooltip="客户360" aria-label="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Eye size={15} /></button>
                <button type="button" data-tooltip="编辑工单" aria-label="编辑工单" onClick={() => openDialog({ type: 'ticket', item })}><LifeBuoy size={15} /></button>
                {item.status !== 'RESOLVED' && item.status !== 'CLOSED' ? <button type="button" data-tooltip="解决工单" aria-label="解决工单" onClick={() => setConfirm({ action: 'resolveTicket', item: { ...item, solution: item.solution || '已处理完成' } })}><RefreshCcw size={15} /></button> : null}
                {item.status !== 'CLOSED' ? <button type="button" data-tooltip="关闭工单" aria-label="关闭工单" onClick={() => setConfirm({ action: 'closeTicket', item })}><Send size={15} /></button> : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
