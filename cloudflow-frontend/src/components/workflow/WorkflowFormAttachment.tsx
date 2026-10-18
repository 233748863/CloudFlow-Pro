import React, { useEffect, useId, useRef, useState } from 'react';
import { Download, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { Button } from '@/components/common';
import FilePreviewButton from '@/components/file-preview/FilePreviewButton';
import type { FormUploadFieldRenderProps } from '@/components/FormRenderer';
import { downloadWorkflowFormFile, getWorkflowFormFile, uploadWorkflowFormFile, type WorkflowFormFile, type WorkflowFormFileContext } from '@/services/api/workflow/form-files';
import { downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCurrentUserSnapshot } from '@/utils/authStorage';

interface Props extends FormUploadFieldRenderProps {
  context: WorkflowFormFileContext;
  onBusyChange?: (busy: boolean, uploadId: string) => void;
}

export const WorkflowFormAttachment: React.FC<Props> = ({ field, fieldPath, value, disabled, readonly, controlProps, onChange, context, onBusyChange }) => {
  const inputId = useId();
  const picker = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const currentIds = useRef<string[]>([]);
  currentIds.current = Array.isArray(value) ? value.map(String) : [];
  const [metadata, setMetadata] = useState<Record<string, WorkflowFormFile>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string>();
  const user = getCurrentUserSnapshot();
  const scopeKey = JSON.stringify([user?.tenantId, user?.id, context.definitionId, context.instanceId, context.taskId, fieldPath]);
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const maximum = field.maxCount ?? (fieldPath.includes('[') ? 1 : 5);
  const identifierKey = currentIds.current.join(',');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requests.current.forEach((request) => request.abort());
      onBusyChange?.(false, inputId);
    };
  }, [scopeKey]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    requests.current.add(controller);
    setFailures({}); setMetadata({});
    void Promise.all(currentIds.current.map(async (fileId) => {
      try {
        const file = await getWorkflowFormFile(fileId, context, fieldPath, controller.signal);
        if (active && currentScope.current === scopeKey) setMetadata((previous) => ({ ...previous, [fileId]: file }));
      } catch (cause) {
        if (active && !controller.signal.aborted && currentScope.current === scopeKey) setFailures((previous) => ({ ...previous, [fileId]: getErrorMessage(cause, '附件不可访问') }));
      }
    })).finally(() => requests.current.delete(controller));
    return () => { active = false; controller.abort(); requests.current.delete(controller); };
  }, [scopeKey, identifierKey]);

  const upload = async (selected: FileList | null) => {
    if (!selected?.length || uploading || disabled || readonly) return;
    if (selected.length + currentIds.current.length > maximum) { setError(`最多上传 ${maximum} 个附件`); return; }
    const controller = new AbortController(); requests.current.add(controller);
    setUploading(true); onBusyChange?.(true, inputId); setError('');
    const next = [...currentIds.current];
    try {
      for (const file of Array.from(selected)) {
        if (file.size > (field.maxSize ?? 10) * 1048576) throw new Error(`单个附件不得超过 ${field.maxSize ?? 10} MB`);
        const uploaded = await uploadWorkflowFormFile(file, context, fieldPath, controller.signal);
        if (!mounted.current || currentScope.current !== scopeKey) return;
        next.push(String(uploaded.fileId));
        currentIds.current = [...next];
        onChange([...next]);
      }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted && currentScope.current === scopeKey) setError(getErrorMessage(cause, '附件上传失败，请重试'));
    } finally {
      requests.current.delete(controller);
      if (mounted.current && currentScope.current === scopeKey) { setUploading(false); onBusyChange?.(false, inputId); }
      if (picker.current) picker.current.value = '';
    }
  };

  const openFile = async (fileId: string) => {
    const file = metadata[fileId];
    if (!file || downloading) return;
    const controller = new AbortController(); requests.current.add(controller);
    setDownloading(fileId); setError('');
    try {
      const blob = await downloadWorkflowFormFile(fileId, context, fieldPath, controller.signal);
      if (!mounted.current || currentScope.current !== scopeKey) return;
      downloadBlob(blob, file.fileName);
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted && currentScope.current === scopeKey) setError(getErrorMessage(cause, '附件下载失败'));
    } finally {
      requests.current.delete(controller);
      if (mounted.current && currentScope.current === scopeKey) setDownloading(undefined);
    }
  };

  return <div className="space-y-2" aria-label={`${field.label}附件`}>
    {currentIds.current.length ? <ul className="space-y-2">{currentIds.current.map((fileId) => <li key={fileId} className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--cf-border)] px-2 py-1">
      <Paperclip size={16} className="shrink-0 text-cf-subtle" />
      <div className="min-w-0 flex-1"><p className="whitespace-normal break-words text-sm text-cf-title [overflow-wrap:anywhere]">{metadata[fileId]?.fileName || (failures[fileId] ? '附件不可访问' : '正在读取附件…')}</p>{failures[fileId] ? <p role="alert" className="text-xs text-red-600">{failures[fileId]}</p> : metadata[fileId] ? <p className="text-xs text-cf-muted">{(metadata[fileId].size / 1024).toFixed(1)} KB</p> : null}</div>
      {metadata[fileId] ? <FilePreviewButton request={{ bizType: 'WORKFLOW_FORM', bizId: context.instanceId || context.definitionId, fileId, ...context, fieldPath }}
        fileName={metadata[fileId].fileName} iconOnly disabled={Boolean(downloading)} download={signal => downloadWorkflowFormFile(fileId, context, fieldPath, signal)} /> : null}
      <Button type="button" variant="ghost" className="min-h-11 min-w-11 p-2" aria-label={`下载 ${metadata[fileId]?.fileName || '附件'}`} disabled={!metadata[fileId] || Boolean(downloading)} onClick={() => void openFile(fileId)}>{downloading === fileId ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <Download size={16} />}</Button>
      {!readonly ? <Button type="button" variant="ghost" className="min-h-11 min-w-11 p-2" aria-label={`移除 ${metadata[fileId]?.fileName || '附件'}`} disabled={disabled || uploading} onClick={() => onChange(currentIds.current.filter((identifier) => identifier !== fileId))}><X size={16} /></Button> : null}
    </li>)}</ul> : <p className="text-xs text-cf-muted">尚未上传附件</p>}
    {!readonly ? <><input ref={picker} {...controlProps} id={controlProps?.id || inputId} type="file" className="sr-only" aria-labelledby={undefined} aria-label={`选择${field.label}`} accept={field.accept || (field.type === 'UPLOAD_IMAGE' ? 'image/*' : undefined)} multiple={maximum > 1} disabled={disabled || uploading || currentIds.current.length >= maximum} onChange={(event) => void upload(event.target.files)} />
      <Button {...controlProps} id={undefined} aria-labelledby={undefined} type="button" variant="outline" className="min-h-11" disabled={disabled || uploading || currentIds.current.length >= maximum} onClick={() => picker.current?.click()}>{uploading ? <Loader2 size={16} className="mr-2 animate-spin motion-reduce:animate-none" /> : <Upload size={16} className="mr-2" />}{uploading ? '正在上传…' : '上传附件'}</Button>
      <p className="text-xs text-cf-muted">最多 {maximum} 个，每个不超过 {field.maxSize ?? 10} MB；仅当前流程有权查看该字段的人员可下载。</p></> : null}
    {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
  </div>;
};
