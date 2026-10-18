import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { BaseDialog, Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { issueFilePreview, readFilePreview, type FilePreviewRequest, type FilePreviewTicket } from '@/services/api/filePreview';
import { getCurrentUserSnapshot } from '@/utils/authStorage';
import { downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import ImageFilePreview from './ImageFilePreview';
import './file-preview.css';

const PdfFilePreview = lazy(() => import('./PdfFilePreview'));

interface Props {
  request: FilePreviewRequest;
  fileName: string;
  downloadUrl?: string;
  download?: (signal: AbortSignal) => Promise<Blob>;
  onClose: () => void;
}

export default function FilePreviewDialog({ request, fileName, downloadUrl, download, onClose }: Props) {
  const { user, hasPermission } = useAuth();
  const [ticket, setTicket] = useState<FilePreviewTicket>();
  const [imageUrl, setImageUrl] = useState('');
  const [pdfData, setPdfData] = useState<Uint8Array>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true);
  const pending = useRef(new Set<AbortController>());
  const scope = JSON.stringify([user?.tenantId, user?.id, request]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const close = useRef(onClose);
  close.current = onClose;
  const allowed = hasPermission('system:file:preview');

  useEffect(() => {
    active.current = true;
    if (!allowed || !user) { close.current(); return; }
    const controller = new AbortController();
    pending.current.add(controller);
    let objectUrl: string | undefined;
    const live = () => {
      const current = getCurrentUserSnapshot();
      return active.current && !controller.signal.aborted && currentScope.current === scope
        && String(current?.id ?? current?.userId) === String(user.id) && String(current?.tenantId) === String(user.tenantId);
    };
    setLoading(true); setError(''); setTicket(undefined); setPdfData(undefined); setImageUrl('');
    void (async () => {
      try {
        const result = await issueFilePreview(request, controller.signal);
        if (!live()) return;
        setTicket(result);
        if (!result.supported) { setError(result.message); return; }
        const bytes = await readFilePreview(result, controller);
        if (!live()) return;
        if (result.mediaType === 'application/pdf') {
          const data = new Uint8Array(await bytes.arrayBuffer());
          if (live()) setPdfData(data);
        } else {
          objectUrl = URL.createObjectURL(bytes);
          if (live()) setImageUrl(objectUrl);
          else URL.revokeObjectURL(objectUrl);
        }
      } catch (failure) {
        if (live()) setError(getErrorMessage(failure, '附件无法预览，请核对当前权限或从原入口下载'));
      } finally {
        pending.current.delete(controller);
        if (live()) setLoading(false);
      }
    })();
    const expired = () => close.current();
    window.addEventListener('cloudflow:auth-expired', expired);
    return () => {
      active.current = false;
      pending.current.forEach((operation) => operation.abort());
      pending.current.clear();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      window.removeEventListener('cloudflow:auth-expired', expired);
    };
  }, [scope, attempt, allowed]);

  const originalDownload = async () => {
    if (!download || downloading) return;
    const controller = new AbortController();
    pending.current.add(controller); setDownloading(true);
    try {
      const blob = await download(controller.signal);
      if (active.current && !controller.signal.aborted && currentScope.current === scope) downloadBlob(blob, ticket?.fileName || fileName);
    } catch (failure) {
      if (active.current && !controller.signal.aborted && currentScope.current === scope) setError(getErrorMessage(failure, '原附件下载失败'));
    } finally {
      pending.current.delete(controller);
      if (active.current && currentScope.current === scope) setDownloading(false);
    }
  };

  return <BaseDialog open title={ticket?.fileName || fileName} description="预览沿用原业务权限；支持PDF、PNG、JPEG、GIF、WebP，单文件不超过20 MiB。"
    width="full" onClose={onClose} zIndex={80} bodyClassName="!p-0 overflow-hidden" panelClassName="file-preview-dialog h-[94dvh] max-h-[94dvh]"
    headerAside={download ? <Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={() => void originalDownload()} disabled={downloading} aria-label="授权下载原附件">
      {downloading ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <Download size={16} />}<span className="ml-1 hidden sm:inline">下载</span>
    </Button> : downloadUrl ? <a href={downloadUrl} target="_blank" rel="noreferrer" className="file-preview-download" aria-label="授权下载原附件"><Download size={16} /><span className="hidden sm:inline">下载</span></a> : undefined}>
    {loading ? <div role="status" className="file-preview-message"><Loader2 className="animate-spin motion-reduce:animate-none" /><span>正在校验权限并读取附件…</span></div> : null}
    {!loading && error ? <div className="file-preview-message"><p role="alert">{error}</p><Button type="button" className="min-h-11" variant="outline" onClick={() => setAttempt(previous => previous + 1)}><RefreshCw size={16} className="mr-2" />重新校验并打开</Button></div> : null}
    {!loading && !error && pdfData ? <Suspense fallback={<div role="status" className="file-preview-message">正在加载PDF阅读器…</div>}><PdfFilePreview data={pdfData} fileName={ticket?.fileName || fileName} onError={setError} /></Suspense> : null}
    {!loading && !error && imageUrl ? <ImageFilePreview source={imageUrl} fileName={ticket?.fileName || fileName} onError={setError} /> : null}
  </BaseDialog>;
}
