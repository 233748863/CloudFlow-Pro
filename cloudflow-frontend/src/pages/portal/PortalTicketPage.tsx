import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { BaseDialog, Button, Input } from '@/components/common';
import { portal, PortalError, type PortalFile, type PortalTicket, type PortalTicketPage as TicketPage } from '@/services/portal';
import { PortalTicketComposer } from './PortalTicketComposer';
import './portal.css';

const statuses: Record<string, string> = { PENDING_ASSIGNMENT: '待分派', OPEN: '待处理', IN_PROGRESS: '处理中', WAITING_CUSTOMER: '等待客户', RESOLVED: '已解决', CLOSED: '已关闭' };

export default function PortalTicketPage() {
  const { tenantCode = '' } = useParams();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [page, setPage] = useState<TicketPage>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [compose, setCompose] = useState(false);
  const [ticketId, setTicketId] = useState<number>();
  const [detail, setDetail] = useState<PortalTicket>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [downloading, setDownloading] = useState<number>();
  const activeDetail = useRef<AbortController | undefined>(undefined);
  const activeDownload = useRef<AbortController | undefined>(undefined);
  const fail = useCallback((failure: unknown) => {
    if (failure instanceof PortalError && failure.code === 401) void navigate(`/portal/${encodeURIComponent(tenantCode)}/login`, { replace: true, state: { message: '门户登录状态已失效，请重新登录。' } });
    return failure instanceof Error ? failure.message : '客户工单暂不可用';
  }, [navigate, tenantCode]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setPage(undefined); setError('');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(tenantCode)) { setError('企业代码无效'); setLoading(false); return; }
    void portal.ticketList(tenantCode, query, status, pageNum, controller.signal).then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(failure => { if (!controller.signal.aborted) setError(fail(failure)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tenantCode, query, status, pageNum, revision, fail]);
  const refreshDetail = useCallback(async () => {
    if (ticketId === undefined) return;
    activeDetail.current?.abort(); activeDownload.current?.abort(); activeDownload.current = undefined; setDownloading(undefined);
    const controller = new AbortController(); activeDetail.current = controller;
    setDetail(undefined); setDetailError(''); setDetailLoading(true);
    try { const result = await portal.ticketDetail(tenantCode, ticketId, controller.signal); if (!controller.signal.aborted) setDetail(result); }
    catch (failure) { if (!controller.signal.aborted) setDetailError(fail(failure)); }
    finally { if (!controller.signal.aborted) setDetailLoading(false); }
  }, [tenantCode, ticketId, fail]);
  useEffect(() => {
    if (ticketId === undefined) return;
    void refreshDetail();
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && !activeDownload.current) void refreshDetail(); }, 30000);
    const visibility = () => { if (document.visibilityState === 'visible') void refreshDetail(); else { activeDetail.current?.abort(); activeDownload.current?.abort(); setDetail(undefined); } };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); activeDetail.current?.abort(); activeDownload.current?.abort(); activeDownload.current = undefined; };
  }, [ticketId, refreshDetail]);
  const closeDetail = () => { activeDetail.current?.abort(); activeDownload.current?.abort(); setTicketId(undefined); setDetail(undefined); setDetailError(''); };
  const download = async (file: PortalFile) => {
    if (!detail || activeDownload.current) return;
    const controller = new AbortController(); activeDownload.current = controller; setDownloading(file.fileId); setDetailError('');
    try {
      const data = await portal.ticketDownload(tenantCode, detail.ticketId, file.fileId, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.fileName;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { if (!controller.signal.aborted) setDetailError(fail(failure)); }
    finally { if (activeDownload.current === controller) { activeDownload.current = undefined; setDownloading(undefined); } }
  };
  return <main className="portal-page portal-ticket-page portal-controls"><section className="portal-card portal-knowledge-card" aria-labelledby="portal-ticket-title">
    <header className="portal-header"><LifeBuoy size={28} aria-hidden="true" /><div><p className="text-xs text-cf-muted">CloudFlow Pro · 客户服务</p><h1 id="portal-ticket-title" className="mt-1 text-xl font-semibold">客户工单</h1></div></header>
    <nav aria-label="门户业务" className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => void navigate(`/portal/${encodeURIComponent(tenantCode)}`)}>返回门户</Button><Button variant="outline" onClick={() => void navigate(`/portal/${encodeURIComponent(tenantCode)}/knowledge`)}>客户知识库</Button><Button onClick={() => setCompose(true)}>提交新工单</Button></nav>
    <form className="portal-ticket-filters mt-5" onSubmit={event => { event.preventDefault(); setQuery(keyword.trim()); setPageNum(1); setRevision(value => value + 1); }}>
      <label className="portal-field portal-ticket-search"><span>搜索工单标题</span><Input maxLength={100} value={keyword} onChange={event => setKeyword(event.target.value)} /></label>
      <label className="portal-field"><span>工单状态</span><select className="cf-control rounded-md px-3" value={status} onChange={event => { setStatus(event.target.value); setPageNum(1); }}><option value="">全部状态</option>{Object.entries(statuses).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <Button type="submit" disabled={loading}>查询</Button>
    </form>
    <p className="mt-4 text-sm leading-6 text-cf-muted">显示本公司工单进度及明确发布的解决方案。新提交工单先等待管理员或客服分派。</p>
    {loading && <p role="status" className="mt-4">正在读取工单…</p>}{error && <div role="alert" className="portal-notice"><p>{error}</p><Button className="mt-3" variant="outline" onClick={() => setRevision(value => value + 1)}>重新加载</Button></div>}
    {page && <><p className="mt-5 text-sm">共 {page.total} 张 · 第 {page.pageNum} 页</p><div className="mt-3 space-y-3">{page.rows.map(row => <article key={row.ticketId} className="rounded-lg border border-cf-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="portal-ticket-heading font-medium">{row.title}</h2><span className="portal-ticket-status">{statuses[row.status] || row.status}</span></div>
      <p className="mt-2 break-all text-xs text-cf-muted">{row.ticketNo}</p><div className="portal-ticket-dates mt-3 text-sm"><p>提交：{row.openedTime || '—'}</p><p>响应截止：{row.firstResponseDue || '—'}</p><p>解决截止：{row.resolutionDue || '—'}</p></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-cf-muted">{row.responseBreached || row.resolutionBreached ? '服务时限已超时' : row.firstResponseTime ? '已记录首次响应' : '等待首次响应'}</p><Button variant="outline" aria-label={`查看工单 ${row.title}`} onClick={() => setTicketId(row.ticketId)}>查看进度</Button></div>
    </article>)}</div>{!page.rows.length && <p role="status" className="portal-notice">暂无符合条件的工单。</p>}
      <nav aria-label="工单分页" className="mt-5 flex flex-wrap gap-3"><Button variant="outline" disabled={page.pageNum <= 1 || loading} onClick={() => setPageNum(value => value - 1)}>上一页</Button><Button variant="outline" disabled={loading || page.pageNum * page.pageSize >= page.total} onClick={() => setPageNum(value => value + 1)}>下一页</Button></nav></>}
  </section><PortalTicketComposer key={tenantCode} tenantCode={tenantCode} open={compose} onClose={() => setCompose(false)} onCreated={ticket => { setCompose(false); setTicketId(ticket.ticketId); setPageNum(1); setRevision(value => value + 1); }} />
    <BaseDialog open={ticketId !== undefined} title={detail?.title || '客户工单进度'} width="wide" panelClassName="portal-controls" onClose={closeDetail} footerClassName="flex-wrap"
      footer={<><Button variant="outline" onClick={closeDetail}>关闭</Button><Button disabled={detailLoading || downloading !== undefined} onClick={() => void refreshDetail()}>核对最新进度</Button></>}>
      {detailLoading && <p role="status">正在核对工单进度…</p>}{detailError && <p role="alert" className="portal-notice">{detailError}</p>}
      {detail && <article className="space-y-5"><div><p className="font-medium">{statuses[detail.status] || detail.status}</p><p className="mt-2 break-all text-xs text-cf-muted">{detail.ticketNo}</p></div>
        <dl className="portal-ticket-dates text-sm">{[['提交时间', detail.openedTime], ['响应截止', detail.firstResponseDue], ['首次响应', detail.firstResponseTime], ['解决截止', detail.resolutionDue], ['解决时间', detail.resolvedTime]].map(([label, value]) => <div key={label}><dt className="text-cf-muted">{label}</dt><dd className="mt-1">{value || '—'}</dd></div>)}</dl>
        {detail.description && <section><h2 className="font-medium">客户原始描述</h2><p className="portal-ticket-text mt-3">{detail.description}</p></section>}
        <section aria-label="已发布解决方案"><h2 className="font-medium">已发布解决方案</h2>{detail.solution && detail.solutionPublishedTime ? <><p className="mt-2 text-xs text-cf-muted">发布时间：{detail.solutionPublishedTime}</p><p className="portal-ticket-text mt-3">{detail.solution}</p></> : <p className="portal-notice">处理人尚未发布解决方案。</p>}</section>
        {!!detail.attachments.length && <section aria-label="工单附件"><h2 className="font-medium">本工单附件</h2><ul className="mt-3 space-y-3">{detail.attachments.map(file => <li key={file.fileId} className="portal-ticket-file"><div className="min-w-0"><p className="break-words text-sm">{file.fileName}</p><p className="mt-1 text-xs text-cf-muted">{file.fileSize.toLocaleString()} 字节</p></div><Button variant="outline" disabled={downloading !== undefined} aria-label={`下载工单附件 ${file.fileName}`} onClick={() => void download(file)}>{downloading === file.fileId ? '正在核对…' : '下载'}</Button></li>)}</ul></section>}
      </article>}
    </BaseDialog></main>;
}
