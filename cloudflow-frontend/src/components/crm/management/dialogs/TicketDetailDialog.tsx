import React, { useEffect, useState } from 'react';
import { BaseDialog, Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getTicket } from '@/services/api/crm/service';
import type { CrmTicket } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { renderSeverity, renderStatus } from '../helpers';
import { ActivityBusinessButton } from '../../operations/ActivityBusinessButton';

export function TicketDetailDialog({ ticketId, onClose }: { ticketId: number; onClose: () => void }) {
  const { user } = useAuth();
  const scope = JSON.stringify([user?.tenantId, user?.id, user?.permissions, ticketId]);
  const [state, setState] = useState<{ scope: string; ticket?: CrmTicket; error?: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(undefined);
    void getTicket(ticketId, controller.signal).then(ticket => {
      if (controller.signal.aborted) return;
      if (!ticket || Number(ticket.ticketId) !== ticketId) throw new Error('工单已删除或无权查看。');
      setState({ scope, ticket });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ scope, error: getErrorMessage(error, '工单详情无法加载，请重试。') });
    });
    return () => controller.abort();
  }, [scope, ticketId, revision]);
  const current = state?.scope === scope ? state : undefined;
  const ticket = current?.ticket;
  return <BaseDialog open title="工单详情" onClose={onClose} width="wide"
    footer={<Button variant="outline" className="min-h-[44px]" onClick={onClose}>关闭</Button>}>
    {!current && <p role="status">正在核对工单查看权限…</p>}
    {current?.error && <div role="alert"><p>{current.error}</p><Button className="mt-3 min-h-[44px]" variant="outline" onClick={() => setRevision(value => value + 1)}>重试</Button></div>}
    {ticket && <div className="space-y-4"><ActivityBusinessButton bizType="TICKET" bizId={ticket.ticketId} businessName={ticket.ticketTitle} customerId={ticket.customerId} customerName={ticket.customerName} /><dl className="grid min-w-0 grid-cols-1 gap-4 break-words text-sm sm:grid-cols-2">
      <div><dt className="text-cf-muted">工单名称</dt><dd className="mt-1">{ticket.ticketTitle}</dd></div>
      <div><dt className="text-cf-muted">工单编号</dt><dd className="mt-1">{ticket.ticketNo || '—'}</dd></div>
      <div><dt className="text-cf-muted">客户</dt><dd className="mt-1">{ticket.customerName || '—'}</dd></div>
      <div><dt className="text-cf-muted">状态</dt><dd className="mt-1">{ticket.portalContactId != null && ticket.ownerId == null ? '待分派' : renderStatus(ticket.status)}</dd></div>
      <div><dt className="text-cf-muted">优先级</dt><dd className="mt-1">{renderSeverity(ticket.severity)}</dd></div>
      <div><dt className="text-cf-muted">负责人</dt><dd className="mt-1">{ticket.ownerName || '—'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-cf-muted">问题描述</dt><dd className="mt-1 whitespace-pre-wrap">{ticket.description || '—'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-cf-muted">解决方案</dt><dd className="mt-1 whitespace-pre-wrap">{ticket.solution || '—'}</dd></div>
    </dl></div>}
  </BaseDialog>;
}
