import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ReceiptText } from 'lucide-react';
import { BaseDialog, Button, Input } from '@/components/common';
import PortalFinanceContent from '@/components/finance/PortalFinanceContent';
import { portal, PortalError } from '@/services/portal';
import type { FinanceFile, FinanceKind, PortalFinancePage as FinancePage, PortalFinanceRecord } from '@/services/portalFinanceTypes';
import './portal.css';

export default function PortalFinancePage() {
  const { tenantCode = '' } = useParams();
  const navigate = useNavigate();
  const [kind, setKind] = useState<FinanceKind>('RECEIVABLE');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [revision, setRevision] = useState(0);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [page, setPage] = useState<FinancePage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recordId, setRecordId] = useState<string>();
  const [detail, setDetail] = useState<PortalFinanceRecord>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string }>();
  const listRequest = useRef<AbortController | undefined>(undefined);
  const detailRequest = useRef<AbortController | undefined>(undefined);
  const fileRequest = useRef<AbortController | undefined>(undefined);
  const fail = useCallback((failure: unknown) => {
    if (failure instanceof PortalError && failure.code === 401) {
      setPage(undefined); setDetail(undefined); setPreview(undefined);
      void navigate(`/portal/${encodeURIComponent(tenantCode)}/login`, { replace: true, state: { message: '门户登录状态已失效，请重新登录。' } });
    }
    return failure instanceof Error ? failure.message : '财务记录暂不可用，请重新加载';
  }, [navigate, tenantCode]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => {
    const refresh = () => {
      const active = document.visibilityState === 'visible'; setVisible(active);
      listRequest.current?.abort(); detailRequest.current?.abort(); fileRequest.current?.abort();
      setPage(undefined); setDetail(undefined); setPreview(undefined);
      if (active) setRevision(value => value + 1);
    };
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); fileRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    setPage(undefined); setError('');
    if (!visible) { setLoading(false); return; }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(tenantCode)) { setError('企业代码无效，请使用邀请中的门户地址'); setLoading(false); return; }
    const controller = new AbortController(); listRequest.current = controller; setLoading(true);
    void portal.financeList(tenantCode, kind, query, pageNum, controller.signal)
      .then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(failure => { if (!controller.signal.aborted) setError(fail(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tenantCode, kind, query, pageNum, revision, visible, fail]);
  useEffect(() => {
    setDetail(undefined); setDetailError(''); setPreview(undefined); fileRequest.current?.abort();
    if (!recordId || !visible) { setDetailLoading(false); return; }
    const controller = new AbortController(); detailRequest.current = controller; setDetailLoading(true);
    void portal.financeDetail(tenantCode, kind, recordId, controller.signal)
      .then(result => { if (!controller.signal.aborted) setDetail(result); })
      .catch(failure => {
        if (!controller.signal.aborted) {
          setDetailError(fail(failure));
          if (failure instanceof PortalError && failure.code === 404) setPage(undefined);
        }
      }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [tenantCode, kind, recordId, revision, visible, fail]);
  const openFile = async (file: FinanceFile, inline: boolean) => {
    if (fileRequest.current || !detail) return;
    const controller = new AbortController(); fileRequest.current = controller; setFileBusy(true); setDetailError(''); setPreview(undefined);
    try {
      const blob = await portal.financeFile(tenantCode, kind, detail.recordId, file.fileId, inline, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (inline) setPreview({ url, type: blob.type, name: file.fileName });
      else { const link = document.createElement('a'); link.href = url; link.download = file.fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setDetailError(fail(failure));
        if (failure instanceof PortalError && [401, 404].includes(failure.code)) { setDetail(undefined); setPage(undefined); }
      }
    } finally { if (fileRequest.current === controller) { fileRequest.current = undefined; setFileBusy(false); } }
  };
  const close = () => { detailRequest.current?.abort(); fileRequest.current?.abort(); setRecordId(undefined); setDetail(undefined); setPreview(undefined); };
  const switchKind = (next: FinanceKind) => { close(); setKind(next); setPage(undefined); setKeyword(''); setQuery(''); setPageNum(1); };
  return <main className="portal-page portal-controls finance-controls"><section className="portal-card portal-knowledge-card" aria-labelledby="portal-finance-title">
    <header className="portal-header"><ReceiptText size={28} aria-hidden="true" /><div><p className="text-xs text-cf-muted">CloudFlow Pro · 客户服务</p><h1 id="portal-finance-title" className="mt-1 text-xl font-semibold">本公司财务记录</h1></div></header>
    <div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => void navigate(`/portal/${encodeURIComponent(tenantCode)}`)}>返回门户</Button><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>重新加载</Button></div>
    <nav aria-label="财务记录类型" className="mt-5 flex flex-wrap gap-3"><Button variant={kind === 'RECEIVABLE' ? 'default' : 'outline'} aria-pressed={kind === 'RECEIVABLE'} onClick={() => switchKind('RECEIVABLE')}>回款记录</Button><Button variant={kind === 'INVOICE' ? 'default' : 'outline'} aria-pressed={kind === 'INVOICE'} onClick={() => switchKind('INVOICE')}>开票记录</Button></nav>
    <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setQuery(keyword.trim()); setPageNum(1); setRevision(value => value + 1); }}>
      <label className="portal-field min-w-0 flex-1"><span>{kind === 'RECEIVABLE' ? '回款编号' : '发票号码'}</span><Input value={keyword} maxLength={100} onChange={event => setKeyword(event.target.value)} /></label><Button type="submit" disabled={loading}>搜索</Button>
    </form>
    <p className="mt-4 text-sm leading-6 text-cf-muted">仅展示财务已确认公开的本公司记录和票据。</p>
    {loading && <p role="status" className="mt-4">正在读取财务记录…</p>}{error && <p role="alert" className="portal-notice">{error}</p>}
    {page && <><p className="mt-5 text-sm">共 {page.total} 条 · 第 {page.pageNum} 页</p><div className="mt-3 space-y-3">{page.rows.map(row =>
      <article key={row.recordId} aria-label={`财务记录 ${row.number}`} className="finance-item"><PortalFinanceContent record={row} /><Button className="mt-4" variant="outline" onClick={() => { setDetail(undefined); setRecordId(row.recordId); }}>查看详情与票据</Button></article>)}</div>
      {!page.rows.length && <p role="status" className="portal-notice">暂无符合条件的已公开记录。</p>}
      <nav aria-label="财务记录分页" className="mt-5 flex gap-3"><Button variant="outline" disabled={loading || page.pageNum <= 1} onClick={() => setPageNum(value => value - 1)}>上一页</Button><Button variant="outline" disabled={loading || page.pageNum * page.pageSize >= page.total} onClick={() => setPageNum(value => value + 1)}>下一页</Button></nav></>}
  </section><BaseDialog open={!!recordId} title="财务记录详情" width="wide" panelClassName="portal-controls finance-controls" onClose={close}
    footer={<><Button variant="outline" onClick={close}>关闭</Button><Button disabled={detailLoading || fileBusy} onClick={() => setRevision(value => value + 1)}>核对最新状态</Button></>}>
    {detailLoading && <p role="status">正在核对公开状态…</p>}{detailError && <p role="alert" className="portal-notice">{detailError}</p>}
    {detail && <div className="space-y-5"><PortalFinanceContent record={detail} /><section aria-label="已公开票据"><h2 className="mb-3 font-medium">已公开票据</h2>
      {detail.attachments.length ? detail.attachments.map(file => <div className="portal-ticket-file mt-3" key={file.fileId}><span>{file.fileName}</span><div className="flex flex-wrap gap-2">
        {['png', 'jpg', 'jpeg', 'pdf'].includes(file.extension) && <Button variant="outline" disabled={fileBusy} onClick={() => void openFile(file, true)}>预览</Button>}
        <Button variant="outline" disabled={fileBusy} onClick={() => void openFile(file, false)}>下载</Button></div></div>) : <p className="text-sm text-cf-muted">未公开票据附件。</p>}
    </section></div>}
    {fileBusy && <p role="status" className="mt-4 text-sm">正在核对票据访问权限…</p>}
    {preview && <section className="mt-5 space-y-3" aria-label="票据预览"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-all font-medium">{preview.name}</h2><Button variant="outline" onClick={() => setPreview(undefined)}>关闭预览</Button></div>
      {preview.type === 'application/pdf' ? <iframe title={preview.name} src={preview.url} sandbox="" referrerPolicy="no-referrer" className="finance-preview" /> : <img src={preview.url} alt={preview.name} className="finance-preview" />}</section>}
  </BaseDialog></main>;
}
