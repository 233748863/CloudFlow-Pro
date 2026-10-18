import React, { useEffect } from 'react';
import { Input } from '@/components/common';
import { oaUpload } from '@/services/api/oaOperations';
import { Field, useMutation } from './OperationsKit';

export default function PrivateFileInput({ path, value, onChange, label = '业务附件', onBusyChange }: { path: string; value?: string; onChange: (reference: string) => void; label?: string; onBusyChange?: (busy: boolean) => void }) {
  const mutation = useMutation();
  useEffect(() => { onBusyChange?.(mutation.busy); }, [mutation.busy, onBusyChange]);
  return <Field label={label}><Input type="file" aria-label={label} accept="application/pdf,image/png,image/jpeg" disabled={mutation.busy} onChange={event => {
    const file = event.target.files?.[0]; if (!file) return;
    void mutation.run(async () => { if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB'); return oaUpload(path, file); }, uploaded => onChange(uploaded.reference), '私密附件已上传'); event.target.value = '';
  }} /><span className="text-xs text-cf-muted">{mutation.busy ? '上传中' : value ? '已上传，随本次操作保存关联' : '仅 PDF、PNG、JPEG，单文件最多 10 MB'}</span></Field>;
}
