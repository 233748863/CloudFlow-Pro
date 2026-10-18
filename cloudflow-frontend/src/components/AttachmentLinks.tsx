import React, { useEffect, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { getAttachmentDisplayName, normalizeAttachmentUrls } from '@/utils/attachment';
import FilePreviewButton from '@/components/file-preview/FilePreviewButton';
import type { FilePreviewContext } from '@/services/api/filePreview';
import { downloadAuthorizedFile, type FileDownloadRequest } from '@/services/api/file';
import { downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { useAuth } from '@/context/AuthContext';

export const getAttachmentList = (attachmentUrl?: string) =>
  normalizeAttachmentUrls(attachmentUrl);

interface AttachmentLinksProps {
  value?: string;
  emptyText?: string;
  compact?: boolean;
  previewContext?: FilePreviewContext;
  downloadContext?: Omit<FileDownloadRequest, 'fileId' | 'reference'>;
}

export const AttachmentLinks: React.FC<AttachmentLinksProps> = ({
  value,
  emptyText = '暂无附件',
  compact = false,
  previewContext,
  downloadContext,
}) => {
  const attachments = getAttachmentList(value);
  const { user } = useAuth();
  const pending = useRef(new Map<string, AbortController>());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const downloadBinding = downloadContext ?? previewContext;
  const scope = JSON.stringify([user?.tenantId, user?.id, value, previewContext, downloadContext]);
  useEffect(() => {
    const cancel = () => { pending.current.forEach(controller => controller.abort()); pending.current.clear(); setBusy(new Set()); setError(''); };
    cancel();
    window.addEventListener('cloudflow:auth-expired', cancel);
    return () => { cancel(); window.removeEventListener('cloudflow:auth-expired', cancel); };
  }, [scope]);
  const download = async (url: string, label: string) => {
    if (!downloadBinding || pending.current.has(url)) return;
    const controller = new AbortController(); pending.current.set(url, controller); setBusy(new Set(pending.current.keys())); setError('');
    try {
      const blob = await downloadAuthorizedFile({ ...downloadBinding, reference: url }, controller.signal);
      if (!controller.signal.aborted) downloadBlob(blob, label);
    } catch (failure) {
      if (!controller.signal.aborted) setError(getErrorMessage(failure, '附件下载失败'));
    } finally {
      if (pending.current.get(url) === controller) { pending.current.delete(url); setBusy(new Set(pending.current.keys())); }
    }
  };

  if (!attachments.length) {
    return <span className="text-sm text-cf-faint">{emptyText}</span>;
  }

  return (
    <div className={compact ? 'flex flex-wrap gap-1.5' : 'grid gap-2'}>
      {attachments.map((url) => {
        const label = getAttachmentDisplayName(url);
        return (
          <div key={url} className="flex min-w-0 items-center gap-1">
          {downloadBinding ? <button type="button" disabled={busy.has(url)} onClick={() => void download(url, label)} aria-label={`下载 ${label}`}
            className={['admin-option-surface inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-left text-sm text-cf-body disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950', compact ? 'max-w-[12rem] px-2.5 py-1.5' : 'w-full px-4 py-3'].join(' ')}>
            <Paperclip size={14} className="shrink-0" /><span className="truncate">{busy.has(url) ? '下载中…' : label}</span>
          </button> : <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={[
              'admin-option-surface inline-flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-sm text-cf-body dark:border-slate-800 dark:bg-slate-950',
              compact ? 'max-w-[12rem] px-2.5 py-1.5' : 'w-full px-4 py-3',
            ].join(' ')}
          >
            <Paperclip size={14} className="shrink-0" />
            <span className="truncate">{label}</span>
          </a>}
          {previewContext ? <FilePreviewButton request={{ ...previewContext, reference: url }} fileName={label}
            download={signal => downloadAuthorizedFile({ ...previewContext, reference: url }, signal)} iconOnly /> : null}
          </div>
        );
      })}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default AttachmentLinks;
