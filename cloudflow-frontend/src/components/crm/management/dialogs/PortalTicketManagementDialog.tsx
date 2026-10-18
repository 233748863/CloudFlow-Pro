import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { BaseDialog, Button, Input, Textarea } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { portalTickets, type PortalTicketHandler, type PortalTicketManagement, type TicketPublication } from '@/services/api/crm/portalTickets';
import type { PortalFile } from '@/services/portal';
import type { PageResult } from '@/types';
import { getErrorMessage } from '@/utils/errorMessage';
import { ticketStatuses } from '../../operations/OperationsKit';
import '@/pages/portal/portal.css';

type Attempt = { type: 'ASSIGN'; version: number; ownerId: number } | { type: 'PUBLISH'; request: TicketPublication };

export function PortalTicketManagementDialog({ ticketId, onClose, onSaved }: { ticketId: number; onClose: () => void; onSaved: () => void }) {
  const { hasPermission } = useAuth();
  const [view, setView] = useState<PortalTicketManagement>();
  const [latest, setLatest] = useState<PortalTicketManagement>();
  const [solution, setSolution] = useState('');
  const [handler, setHandler] = useState<PortalTicketHandler>();
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [handlers, setHandlers] = useState<PageResult<PortalTicketHandler>>();
  const [handlersLoading, setHandlersLoading] = useState(false);
  const [handlersError, setHandlersError] = useState('');
  const [attempt, setAttempt] = useState<Attempt>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const canAssign = Boolean(view?.canAssign && hasPermission('crm:ticket:edit'));
  const canPublish = Boolean(view?.canPublish && hasPermission('crm:portal:solution:publish'));
  const dirty = Boolean(attempt || handler && String(handler.userId) !== String(view?.ticket.ownerId) || view && solution !== (view.ticket.portalSolution || ''));
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty || Boolean(busy))
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    const controller = new AbortController(); setBusy('正在读取工单…'); setError('');
    void portalTickets.view(ticketId, controller.signal).then(result => { if (!controller.signal.aborted) { setView(result); setSolution(result.ticket.portalSolution || ''); } })
      .catch(failure => { if (!controller.signal.aborted) setError(getErrorMessage(failure, '工单读取失败')); }).finally(() => { if (!controller.signal.aborted) setBusy(''); });
    return () => controller.abort();
  }, [ticketId]);
  useEffect(() => {
    if (!canAssign) { setHandlers(undefined); return; }
    const controller = new AbortController(); setHandlers(undefined); setHandlersLoading(true); setHandlersError('');
    void portalTickets.handlers(ticketId, query, pageNum, controller.signal).then(result => { if (!controller.signal.aborted) setHandlers(result); })
      .catch(failure => { if (!controller.signal.aborted) setHandlersError(getErrorMessage(failure, '处理人读取失败')); }).finally(() => { if (!controller.signal.aborted) setHandlersLoading(false); });
    return () => controller.abort();
  }, [canAssign, ticketId, query, pageNum, revision]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, busy]);
  useEffect(() => { if (busy && blocker.state === 'blocked') blocker.reset(); }, [busy, blocker]);
  const run = async (label: string, operation: () => Promise<void>) => {
    if (lock.current || busy) return;
    lock.current = true; setBusy(label); setError('');
    try { await operation(); }
    catch (failure) { setError(getErrorMessage(failure, '结果未确认，请先核对最新工单')); }
    finally { lock.current = false; setBusy(''); }
  };
  const accepted = (result: PortalTicketManagement) => { setView(result); setLatest(undefined); setAttempt(undefined); setSolution(result.ticket.portalSolution || ''); setHandler(undefined); setError(''); onSaved(); };
  const submit = (command: Attempt) => void run('正在核验并保存…', async () => {
    if (attempt || !view) return;
    setAttempt(command); setLatest(undefined);
    const result = command.type === 'ASSIGN' ? await portalTickets.assign(ticketId, command.version, command.ownerId) : await portalTickets.publish(ticketId, command.request);
    accepted(result);
  });
  const inspect = () => void run('正在只读核对最新结果…', async () => {
    const result = await portalTickets.view(ticketId);
    if (!view) { accepted(result); return; }
    if (attempt) {
      const version = attempt.type === 'ASSIGN' ? attempt.version : attempt.request.version;
      const matched = attempt.type === 'ASSIGN' ? String(result.ticket.ownerId) === String(attempt.ownerId)
        : (result.ticket.portalSolution || '') === (attempt.request.publish ? attempt.request.solution : '') && Boolean(result.ticket.portalSolutionTime) === attempt.request.publish;
      if (matched && (result.ticket.version ?? -1) >= version) { accepted(result); return; }
    }
    setLatest(result);
  });
  const download = (file: PortalFile) => void run('正在下载客户附件…', async () => {
    const data = await portalTickets.download(ticketId, file.fileId);
    const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.fileName;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const close = () => { if (busy || lock.current) return; if (dirty) setDiscard(true); else onClose(); };
  const selectedVersion = view?.ticket.version;
  return <><BaseDialog open title={`门户处理 · ${view?.ticket.ticketTitle || '客户工单'}`} width="wide" panelClassName="portal-controls" hideCloseButton={Boolean(busy)} closeOnEscape={!busy && !discard} onClose={close} footerClassName="flex-wrap"
    footer={<><Button variant="outline" disabled={Boolean(busy)} onClick={close}>返回工单列表</Button><Button variant="outline" disabled={Boolean(busy)} onClick={inspect}>核对最新结果（保留输入）</Button></>}>
    <div className="space-y-5">{busy && <p role="status">{busy}</p>}{error && <p role="alert" className="portal-notice">{error}；输入仍保留。</p>}
      {attempt && <p role="status" className="portal-notice">保存结果尚未确认，已暂停再次保存；请先只读核对最新结果。</p>}
      {latest && <section aria-label="最新已保存工单" className="portal-notice space-y-3"><p>最新版本 {latest.ticket.version} · 当前负责人 {latest.ticket.ownerName || '待分派'} · 状态 {ticketStatuses[latest.ticket.status as keyof typeof ticketStatuses] || latest.ticket.status}</p><p className="portal-ticket-text">最新对外方案：{latest.ticket.portalSolution || '尚未发布'}</p><p>采用最新版本会保留本页输入；请确认当前处理人和方案后再操作。</p><Button variant="outline" disabled={Boolean(busy)} onClick={() => { setView(latest); setLatest(undefined); setAttempt(undefined); setError(''); }}>已核对，保留输入并采用最新版本</Button></section>}
      {view && <><dl className="portal-ticket-dates text-sm"><div><dt className="text-cf-muted">客户</dt><dd className="mt-1">{view.ticket.customerName || '—'}</dd></div><div><dt className="text-cf-muted">当前负责人</dt><dd className="mt-1">{view.ticket.ownerName || '待分派'}</dd></div><div><dt className="text-cf-muted">业务版本</dt><dd className="mt-1">{view.ticket.version}</dd></div><div><dt className="text-cf-muted">响应截止 / 解决截止</dt><dd className="mt-1">{view.ticket.firstResponseDue || '—'} / {view.ticket.resolutionDue || '—'}</dd></div></dl>
        <section><h3 className="font-medium">{view.ticket.portalContactId ? '客户原始描述（只读）' : '内部工单描述'}</h3><p className="portal-ticket-text mt-3">{view.ticket.description || '未填写'}</p></section>
        <section><h3 className="font-medium">内部处理意见（仅内部可见）</h3><p className="portal-ticket-text mt-3">{view.ticket.solution || '未填写'}</p></section>
        {!!view.attachments.length && <section aria-label="客户工单附件"><h3 className="font-medium">客户提交的附件</h3><ul className="mt-3 space-y-3">{view.attachments.map(file => <li key={file.fileId} className="portal-ticket-file"><div className="min-w-0"><p className="break-words text-sm">{file.fileName}</p><p className="mt-1 text-xs text-cf-muted">{file.fileSize.toLocaleString()} 字节</p></div><Button variant="outline" disabled={Boolean(busy)} aria-label={`下载客户附件 ${file.fileName}`} onClick={() => download(file)}>下载</Button></li>)}</ul></section>}
        {canAssign && <fieldset disabled={Boolean(busy) || Boolean(attempt)} className="min-w-0 space-y-3 border-t border-cf-border pt-4"><legend className="px-1 font-medium">管理员 / 客服分派</legend><p className="text-xs leading-5 text-cf-muted">候选均为本企业有效且具有工单读取与处理权限的人员；分派不会记为首次响应。</p>
          <div className="flex flex-wrap items-end gap-3"><label className="portal-field min-w-0 flex-1"><span>查找接手人</span><Input value={keyword} maxLength={100} onChange={event => setKeyword(event.target.value)} /></label><Button variant="outline" onClick={() => { setQuery(keyword.trim()); setPageNum(1); setRevision(value => value + 1); }}>查找</Button></div>
          {handlersLoading && <p role="status">正在核对可分派人员…</p>}{handlersError && <p role="alert" className="portal-notice">{handlersError}</p>}
          {handlers && <><ul className="space-y-2">{handlers.rows.map(candidate => <li key={candidate.userId}><label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-cf-border px-3 py-2 text-sm"><input type="radio" name="portal-ticket-handler" checked={String(handler?.userId) === String(candidate.userId)} onChange={() => setHandler(candidate)} /><span className="min-w-0 break-words">{candidate.name}<span className="ml-2 text-cf-muted">{candidate.department || '未设部门'}</span></span></label></li>)}</ul>{!handlers.rows.length && <p role="status">暂无符合条件的处理人。</p>}
            <nav aria-label="接手人分页" className="flex flex-wrap items-center gap-3"><span className="text-xs text-cf-muted">第 {pageNum} 页 · 共 {handlers.total} 人</span><Button variant="outline" disabled={pageNum <= 1 || handlersLoading} onClick={() => setPageNum(value => value - 1)}>上一页</Button><Button variant="outline" disabled={pageNum * 10 >= handlers.total || handlersLoading} onClick={() => setPageNum(value => value + 1)}>下一页</Button></nav></>}
          {handler && <p className="text-sm">已选接手人：{handler.name}</p>}<Button disabled={!handler || selectedVersion == null || String(handler.userId) === String(view.ticket.ownerId)} onClick={() => { if (handler && selectedVersion != null) submit({ type: 'ASSIGN', version: selectedVersion, ownerId: handler.userId }); }}>确认分派</Button>
        </fieldset>}
        <section className="space-y-3 border-t border-cf-border pt-4" aria-label="对客户发布方案"><h3 className="font-medium">对客户发布的解决方案</h3><p className="text-xs leading-5 text-cf-muted">由当前接手人明确发布或撤回；发布会记录首次响应，不自动解决工单。</p>
          {canPublish ? <fieldset disabled={Boolean(busy) || Boolean(attempt)} className="min-w-0 space-y-3"><label className="portal-field"><span>对外解决方案（最多10000字符）</span><Textarea rows={6} maxLength={10000} value={solution} onChange={event => setSolution(event.target.value)} /></label><div className="flex flex-wrap gap-3"><Button disabled={!solution.trim() || selectedVersion == null} onClick={() => { if (selectedVersion != null) submit({ type: 'PUBLISH', request: { version: selectedVersion, publish: true, solution: solution.trim() } }); }}>发布给客户</Button><Button variant="outline" disabled={!view.ticket.portalSolutionTime || selectedVersion == null} onClick={() => { if (selectedVersion != null) submit({ type: 'PUBLISH', request: { version: selectedVersion, publish: false } }); }}>撤回已发布方案</Button></div></fieldset>
            : <p className="portal-ticket-text">{view.ticket.portalSolution || '尚未发布；仅有发布权限的当前接手人可以操作。'}</p>}
          <p className="text-xs text-cf-muted">当前发布时间：{view.ticket.portalSolutionTime || '尚未发布'}</p>
        </section>
      </>}
    </div>
  </BaseDialog><BaseDialog open={!busy && (discard || blocker.state === 'blocked')} title="离开门户工单处理？" panelClassName="portal-controls" zIndex={60}
    onClose={() => { setDiscard(false); if (blocker.state === 'blocked') blocker.reset(); }} footerClassName="flex-wrap"
    footer={<><Button variant="outline" onClick={() => { setDiscard(false); if (blocker.state === 'blocked') blocker.reset(); }}>保留输入，继续处理</Button><Button onClick={() => { if (blocker.state === 'blocked') blocker.proceed(); else onClose(); }}>确认离开</Button></>}>
    <p className="text-sm leading-6">未保存的分派选择和方案输入将丢失；已到达服务器的操作不会撤销。保存结果未确认时请先核对。</p>
  </BaseDialog></>;
}
