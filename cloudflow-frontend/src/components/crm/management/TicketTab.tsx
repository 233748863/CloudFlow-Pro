import React, { useState } from 'react';
import { Eye, LifeBuoy, RefreshCcw, Send } from 'lucide-react';
import { useCrmManagement } from './store';
import { renderSeverity, renderStatus } from './helpers';
import { Button } from '@/components/common';
import { crmOperations } from '@/services/api/crm/operations';
import { useAccess, useMutation } from '../operations/OperationsKit';
import { EmailBusinessButton } from '../email/EmailPanel';
import { useAuth } from '@/context/AuthContext';
import type { CrmTicket } from '@/services/api/crm';
import { PortalTicketManagementDialog } from './dialogs/PortalTicketManagementDialog';
import { TicketDetailDialog } from './dialogs/TicketDetailDialog';
import { useBusinessSearchFocus } from '@/hooks/useBusinessSearchFocus';
import '@/pages/portal/portal.css';

export const TicketTab: React.FC = () => {
  const { tickets, openDialog, openCustomerWorkspace, setConfirm, load, ticketPage, setTicketPage, ticketTotal, ticketListError, loading } = useCrmManagement();
  const { user } = useAuth();
  const [managedId, setManagedId] = useState<number>();
  const [viewedId, setViewedId] = useState<number>();
  const cancelSearchFocus = useBusinessSearchFocus(async identifier => { setViewedId(identifier); }, () => setViewedId(undefined));
  const can = useAccess();
  const mutation = useMutation();
  const pending = (ticket: CrmTicket) => ticket.portalContactId != null && ticket.ownerId == null;
  const status = (ticket: CrmTicket) => pending(ticket) ? '待分派' : ticket.status === 'WAITING_CUSTOMER' ? '等待客户' : renderStatus(ticket.status);
  const actions = (item: CrmTicket) => {
    const owned = item.ownerId != null && String(item.ownerId) === user?.id && !pending(item);
    return <div className="portal-ticket-actions flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => { cancelSearchFocus(); setViewedId(item.ticketId); }} aria-label={`查看工单 ${item.ticketTitle}`}>查看</Button>
      <Button size="sm" variant="outline" onClick={() => setManagedId(item.ticketId)} aria-label={`门户处理 ${item.ticketTitle}`}>门户处理</Button>
      <EmailBusinessButton bizType="TICKET" bizId={item.ticketId} />
      {can('crm:customer:list') && <Button size="sm" variant="outline" data-tooltip="客户360" aria-label="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Eye size={15} /></Button>}
      {owned && can('crm:ticket:edit') && <Button size="sm" variant="outline" data-tooltip="编辑工单" aria-label="编辑工单" onClick={() => openDialog({ type: 'ticket', item })}><LifeBuoy size={15} /></Button>}
      {owned && can('crm:ticket:respond') && !item.firstResponseTime && !['RESOLVED', 'CLOSED'].includes(item.status || '') && <Button size="sm" variant="ghost" disabled={mutation.busy} onClick={() => void mutation.run(() => crmOperations.respondTicket(item.ticketId!), () => void load())}>首次响应</Button>}
      {owned && can('crm:ticket:resolve') && item.status !== 'RESOLVED' && item.status !== 'CLOSED' ? <Button size="sm" variant="outline" data-tooltip="解决工单" aria-label="解决工单" onClick={() => setConfirm({ action: 'resolveTicket', item: { ...item, solution: item.solution || '已处理完成' } })}><RefreshCcw size={15} /></Button> : null}
      {owned && can('crm:ticket:close') && item.status !== 'CLOSED' ? <Button size="sm" variant="outline" data-tooltip="关闭工单" aria-label="关闭工单" onClick={() => setConfirm({ action: 'closeTicket', item })}><Send size={15} /></Button> : null}
    </div>;
  };
  return (
    <div className="portal-controls p-3">
    {loading && <p role="status" className="mb-3 text-sm">正在核对工单列表…</p>}
    {ticketListError && <div role="alert" className="portal-notice"><p>{ticketListError}；当前筛选结果未加载。</p><Button variant="outline" className="mt-3" onClick={() => void load()}>重新加载工单</Button></div>}
    <table className="unity-data-table admin-source-table admin-crm-table portal-ticket-table min-w-[900px]">
      <thead>
        <tr>
          <th>工单</th>
          <th>客户</th>
          <th>优先级</th>
          <th>服务时限</th>
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
            <td><div>响应：{item.firstResponseDue || '—'}</div><div>解决：{item.resolutionDue || '—'}</div>{Boolean(item.responseBreachedFlag || item.resolutionBreachedFlag) && <span className="text-rose-600">{item.responseBreachedFlag ? '响应违约 ' : ''}{item.resolutionBreachedFlag ? '解决违约' : ''}</span>}{item.pauseStartTime && <div className="text-amber-700">已暂停 · {item.pauseStartTime}</div>}</td>
            <td>{status(item)}</td>
            <td>{item.ownerName || '-'}</td>
            <td>
              {actions(item)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="portal-ticket-cards space-y-3">{tickets.map(item => <article key={item.ticketId} className="min-w-0 rounded-lg border border-cf-border p-3">
      <h3 className="break-words font-medium">{item.ticketTitle}</h3><p className="mt-2 break-words text-sm text-cf-muted">{item.customerName || '—'} · {item.ownerName || '待分派'}</p><p className="mt-2 text-sm">{status(item)} · {renderSeverity(item.severity)}</p><p className="mt-2 break-words text-xs text-cf-muted">响应截止：{item.firstResponseDue || '—'}<br />解决截止：{item.resolutionDue || '—'}</p><div className="mt-3">{actions(item)}</div>
    </article>)}</div>
    {!loading && !ticketListError && !tickets.length && <p role="status" className="py-8 text-center text-sm text-cf-muted">暂无符合条件的工单。</p>}
    <nav aria-label="内部工单分页" className="mt-4 flex flex-wrap items-center gap-3"><span className="text-sm text-cf-muted">{ticketListError ? '列表未加载，数量暂不可用' : `第 ${ticketPage} 页 · 共 ${ticketTotal} 张`}</span><Button variant="outline" disabled={loading || Boolean(ticketListError) || ticketPage <= 1} onClick={() => setTicketPage(value => value - 1)}>上一页</Button><Button variant="outline" disabled={loading || Boolean(ticketListError) || ticketPage * 10 >= ticketTotal} onClick={() => setTicketPage(value => value + 1)}>下一页</Button></nav>
    {managedId !== undefined && <PortalTicketManagementDialog key={managedId} ticketId={managedId} onClose={() => setManagedId(undefined)} onSaved={() => void load()} />}
    {viewedId !== undefined && <TicketDetailDialog key={viewedId} ticketId={viewedId} onClose={cancelSearchFocus} />}
    </div>
  );
};
