import { useEffect, useState } from 'react';
import { BaseDialog, Button } from '@/components/common';
import { InfrastructureSelect } from '@/pages/system/_components/InfrastructurePrimitives';
import { shareScopeNames, type ShareScope } from '@/services/api/report';

interface Props {
  open: boolean;
  scope: ShareScope;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (scope: ShareScope) => void;
}

export function ReportShareDialog({ open, scope, busy, error, onClose, onSave }: Props) {
  const [selected, setSelected] = useState(scope);
  useEffect(() => { if (open) setSelected(scope); }, [open, scope]);
  return <BaseDialog open={open} title="设置共享范围" panelClassName="report-workspace"
    onClose={() => { if (!busy) onClose(); }} closeOnEscape={!busy} hideCloseButton={busy}
    footer={<><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button>
      <Button disabled={busy} onClick={() => onSave(selected)}>{busy ? '保存中…' : '确认范围'}</Button></>}>
    <div className="space-y-4">
      <p className="text-sm text-cf-muted">共享仅开放图表或仪表盘定义。查看者查询数据时，仍按本人业务权限和数据范围读取。</p>
      <label className="report-field">共享范围<InfrastructureSelect aria-label="共享范围" value={selected} disabled={busy}
        options={Object.entries(shareScopeNames).map(([value, label]) => ({ value, label }))}
        onValueChange={value => setSelected(value as ShareScope)} /></label>
      {error && <p role="alert" className="report-error">{error}</p>}
    </div>
  </BaseDialog>;
}
