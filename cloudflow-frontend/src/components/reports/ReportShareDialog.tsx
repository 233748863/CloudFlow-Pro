import React, { useEffect, useState } from 'react';
import { BaseDialog, Button } from '@/components/common';
import { InfrastructureSelect } from '@/pages/system/_components/InfrastructurePrimitives';
import { shareScopeNames, type ShareScope } from '@/services/api/report';

export function ReportShareDialog({ open, scope, busy, error, onClose, onSave }: { open: boolean; scope: ShareScope; busy: boolean; error: string; onClose: () => void; onSave: (scope: ShareScope) => void }) {
  const [selected, setSelected] = useState<ShareScope>(scope);
  useEffect(() => { if (open) setSelected(scope); }, [open, scope]);
  return <BaseDialog open={open} title="共享本人报表定义" onClose={() => { if (!busy) onClose(); }} panelClassName="report-workspace">
    <div className="space-y-4"><p className="text-sm">只分享图表或仪表盘配置；其他人仍按自己的业务权限查询。选择“仅本人”会撤回共享，已嵌入其他仪表盘的图表随之不可见。</p>
      <InfrastructureSelect aria-label="共享范围" value={selected} disabled={busy} options={Object.entries(shareScopeNames).map(([value, label]) => ({ value, label }))} onValueChange={value => setSelected(value as ShareScope)} />
      <p className="text-xs text-cf-muted">部门共享使用创建时所属部门；分享仪表盘不会自动分享其中的私有图表。</p>
      {error && <p role="alert" className="report-error">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy || Boolean(error)} onClick={() => onSave(selected)}>{busy ? '处理中…' : '确认范围'}</Button></div>
    </div>
  </BaseDialog>;
}
