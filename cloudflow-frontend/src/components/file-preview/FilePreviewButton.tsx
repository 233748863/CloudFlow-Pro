import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import type { FilePreviewRequest } from '@/services/api/filePreview';

const FilePreviewDialog = lazy(() => import('./FilePreviewDialog'));

export interface FilePreviewButtonProps {
  request: FilePreviewRequest;
  fileName?: string;
  downloadUrl?: string;
  download?: (signal: AbortSignal) => Promise<Blob>;
  disabled?: boolean;
  iconOnly?: boolean;
}

export default function FilePreviewButton({ request, fileName = '附件', downloadUrl, download, disabled, iconOnly }: FilePreviewButtonProps) {
  const { user, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const allowed = hasPermission('system:file:preview');
  const scopeKey = JSON.stringify([user?.tenantId, user?.id, request]);
  useEffect(() => { setOpen(false); }, [scopeKey, allowed]);
  if (!allowed) return null;
  return <>
    <Button type="button" variant="ghost" className="min-h-11 min-w-11 shrink-0 px-2" aria-label={`预览 ${fileName}`} disabled={disabled} onClick={() => setOpen(true)}>
      <Eye size={16} aria-hidden="true" />{!iconOnly && <span className="ml-1.5">预览</span>}
    </Button>
    {open && <Suspense fallback={<span role="status" className="text-xs text-cf-muted">正在加载预览…</span>}>
      <FilePreviewDialog key={scopeKey} request={request} fileName={fileName} downloadUrl={downloadUrl} download={download} onClose={() => setOpen(false)} />
    </Suspense>}
  </>;
}
