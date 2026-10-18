import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpenText } from 'lucide-react';
import { BaseDialog, Button, Input } from '@/components/common';
import KnowledgeExternalContent from '@/components/knowledge/KnowledgeExternalContent';
import { portal, PortalError, type PortalKnowledge, type PortalKnowledgePage as KnowledgePage } from '@/services/portal';
import '@/components/knowledge/KnowledgeExternalDialog.css';
import './portal.css';

export default function PortalKnowledgePage() {
  const { tenantCode = '' } = useParams();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<KnowledgePage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [documentId, setDocumentId] = useState<number>();
  const [detail, setDetail] = useState<PortalKnowledge>();
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [downloading, setDownloading] = useState<number>();
  const [downloadError, setDownloadError] = useState('');
  const activeDownload = useRef<AbortController | undefined>(undefined);
  const detailRequest = useRef(0);
  const latestDetail = useRef<AbortController | undefined>(undefined);
  const fail = useCallback((failure: unknown) => {
    if (failure instanceof PortalError && failure.code === 401) {
      void navigate(`/portal/${encodeURIComponent(tenantCode)}/login`, { replace: true, state: { message: '门户登录状态已失效，请重新登录。' } });
    }
    return failure instanceof Error ? failure.message : '知识库暂不可用';
  }, [navigate, tenantCode]);
  useEffect(() => {
    const controller = new AbortController();
    setPage(undefined); setError(''); setLoading(true);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(tenantCode)) { setError('企业代码无效，请使用邀请中的门户地址'); setLoading(false); return; }
    void portal.knowledgeList(tenantCode, query, pageNum, controller.signal).then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(failure => { if (!controller.signal.aborted) setError(fail(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tenantCode, query, pageNum, revision, fail]);
  const refreshDetail = useCallback(async () => {
    if (!documentId) return;
    activeDownload.current?.abort(); activeDownload.current = undefined; setDownloading(undefined); setDownloadError('');
    latestDetail.current?.abort();
    const controller = new AbortController(); latestDetail.current = controller;
    const sequence = ++detailRequest.current;
    setDetail(undefined); setDetailError(''); setDetailLoading(true);
    try {
      const result = await portal.knowledgeDetail(tenantCode, documentId, controller.signal);
      if (!controller.signal.aborted && sequence === detailRequest.current) setDetail(result);
    } catch (failure) {
      if (!controller.signal.aborted && sequence === detailRequest.current) { setDetailError(fail(failure)); setRevision(value => value + 1); }
    } finally { if (!controller.signal.aborted && sequence === detailRequest.current) setDetailLoading(false); }
  }, [tenantCode, documentId, fail]);
  useEffect(() => {
    if (!documentId) return;
    void refreshDetail();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refreshDetail(); }, 30000);
    const focus = () => { if (document.visibilityState === 'visible') void refreshDetail(); else { latestDetail.current?.abort(); setDetail(undefined); } };
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('focus', focus);
    return () => { clearInterval(timer); latestDetail.current?.abort(); activeDownload.current?.abort(); activeDownload.current = undefined; detailRequest.current++; document.removeEventListener('visibilitychange', focus); window.removeEventListener('focus', focus); };
  }, [documentId, refreshDetail]);
  const download = async (file: PortalKnowledge['attachments'][number]) => {
    if (!detail || activeDownload.current) return;
    const controller = new AbortController(); activeDownload.current = controller;
    const sequence = detailRequest.current;
    setDownloading(file.fileId); setDownloadError('');
    try {
      const data = await portal.knowledgeDownload(tenantCode, detail.documentId, detail.versionId, file.fileId, controller.signal);
      if (controller.signal.aborted || sequence !== detailRequest.current) return;
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.fileName;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      if (!controller.signal.aborted && sequence === detailRequest.current) {
        setDownloadError(fail(failure));
        if (failure instanceof PortalError && (failure.code === 401 || failure.code === 404)) { setDetail(undefined); setRevision(value => value + 1); }
      }
    } finally { if (activeDownload.current === controller) { activeDownload.current = undefined; setDownloading(undefined); } }
  };
  const close = () => { latestDetail.current?.abort(); activeDownload.current?.abort(); detailRequest.current++; setDocumentId(undefined); setDetail(undefined); setDetailError(''); setDownloadError(''); };
  return <main className="portal-page portal-controls"><section className="portal-card portal-knowledge-card" aria-labelledby="portal-knowledge-title">
    <header className="portal-header"><BookOpenText size={28} aria-hidden="true" /><div><p className="text-xs text-cf-muted">CloudFlow Pro · 客户服务</p><h1 id="portal-knowledge-title" className="mt-1 text-xl font-semibold">客户知识库</h1></div></header>
    <div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => void navigate(`/portal/${encodeURIComponent(tenantCode)}`)}>返回门户</Button><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>重新加载</Button></div>
    <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setQuery(keyword.trim()); setPageNum(1); setRevision(value => value + 1); }}><label className="portal-field min-w-0 flex-1"><span>搜索已公开标题</span><Input value={keyword} maxLength={100} onChange={event => setKeyword(event.target.value)} /></label><Button type="submit" disabled={loading}>搜索</Button></form>
    <p className="mt-4 text-sm text-cf-muted">仅展示明确发布的知识版本及逐项获准公开的附件。</p>
    {loading && <p role="status" className="mt-4">正在读取知识库…</p>}{error && <p role="alert" className="portal-notice">{error}</p>}
    {page && <><p className="mt-5 text-sm">共 {page.total} 篇 · 第 {page.pageNum} 页</p><div className="mt-3 space-y-3">{page.rows.map(row => <article key={row.documentId} className="rounded-lg border border-cf-border p-4"><h2 className="break-words font-medium">{row.title}</h2><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-cf-muted">公开版本 v{row.versionNo}</span><Button variant="outline" aria-label={`阅读 ${row.title}`} onClick={() => { setDetail(undefined); setDocumentId(row.documentId); }}>阅读</Button></div></article>)}</div>
      {!page.rows.length && <p role="status" className="portal-notice">暂无符合条件的公开知识文档。</p>}
      <nav aria-label="知识库分页" className="mt-5 flex gap-3"><Button variant="outline" disabled={loading || page.pageNum <= 1} onClick={() => setPageNum(value => value - 1)}>上一页</Button><Button variant="outline" disabled={loading || page.pageNum * page.pageSize >= page.total} onClick={() => setPageNum(value => value + 1)}>下一页</Button></nav></>}
  </section><BaseDialog open={Boolean(documentId)} title={detail?.title || '阅读公开知识'} onClose={close} panelClassName="portal-controls" width="wide" footer={<><Button variant="outline" onClick={close}>关闭</Button><Button disabled={detailLoading} onClick={() => void refreshDetail()}>核对最新状态</Button></>}>
    {detailLoading && <p role="status">正在确认当前公开版本…</p>}{detailError && <p role="alert" className="portal-notice">{detailError}</p>}
    {downloadError && <p role="alert" className="portal-notice">{downloadError}</p>}
    {detail && <article><p className="mb-4 text-sm text-cf-muted">公开版本 v{detail.versionNo}</p><KnowledgeExternalContent content={detail.content || ''} />
      {!!detail.attachments.length && <section className="mt-5 border-t border-cf-border pt-4" aria-label="公开附件"><h2 className="font-medium">公开附件</h2><ul className="mt-3 space-y-3">{detail.attachments.map(file => <li key={file.fileId} className="flex flex-wrap items-center justify-between gap-3"><span className="min-w-0 break-words text-sm">{file.fileName}<span className="ml-2 text-cf-muted">{file.fileSize.toLocaleString()} 字节</span></span><Button variant="outline" disabled={downloading !== undefined} aria-label={`下载公开附件 ${file.fileName}`} onClick={() => void download(file)}>{downloading === file.fileId ? '正在核验下载…' : '下载'}</Button></li>)}</ul></section>}
    </article>}
  </BaseDialog></main>;
}
