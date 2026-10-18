import React, { useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button } from '@/components/common';
import type { HrRecord } from '@/services/api/hr';
import { ruleDownload, ruleGet } from '@/services/api/hr/rules';
import { getErrorMessage } from '@/utils/errorMessage';

export function HrLeaveProofs({ requestId, mine = false }: { requestId: number; mine?: boolean }) {
  const [files, setFiles] = useState<HrRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const path = mine ? `/ess/leave/${requestId}/files` : `/attendance/time-requests/${requestId}/files`;
  return <>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => {
      setBusy(true);
      void ruleGet(path).then(setFiles).catch(error => toast.error(getErrorMessage(error, '证明加载失败'))).finally(() => setBusy(false));
    }}>证明附件</Button>
    <BaseDialog open={files !== null} title="请假证明附件" onClose={() => setFiles(null)}>
      <div className="space-y-3">{files?.length === 0 && <p className="text-sm text-cf-subtle">本申请未附证明文件。</p>}
        {files?.map(file => <Button key={file.fileId} variant="outline" onClick={() => {
          void ruleDownload(`${path}/${file.fileId}`, file.fileName).catch(error => toast.error(getErrorMessage(error, '证明下载失败')));
        }}>{file.fileName}</Button>)}
      </div>
    </BaseDialog>
  </>;
}
