import { useState } from 'react';
import { TimerOff } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Textarea } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { finishTimerNode } from '@/services/api/workflow';
import { getErrorMessage } from '@/utils/errorMessage';
import { isProcessActive } from '@/utils/processStatus';
import { Role } from '@/types';

export const TimerFinishAction = ({ instanceId, nodeKey, nodeName, processStatus, onFinished }: {
  instanceId: string;
  nodeKey: string;
  nodeName: string;
  processStatus?: string;
  onFinished: () => void | Promise<void>;
}) => {
  const { user, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (user?.role !== Role.ADMIN || !hasPermission('workflow:process:resume') || !isProcessActive(processStatus)) return null;

  const finish = async () => {
    if (!reason.trim() || reason.length > 500 || submitting) return;
    setSubmitting(true);
    try {
      await finishTimerNode(instanceId, nodeKey, reason.trim());
      setOpen(false);
      toast.success('已结束定时等待并继续流程');
      await onFinished();
    } catch (error) {
      toast.error(getErrorMessage(error, '结束等待失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => { setReason(''); setOpen(true); }}>
        <TimerOff size={14} />提前结束等待
      </Button>
      <BaseDialog
        open={open}
        title="提前结束定时等待"
        description={`将立即通过“${nodeName}”并继续流程，操作原因会保留在审批记录中。`}
        onClose={() => { if (!submitting) setOpen(false); }}
        maxWidthClassName="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={submitting} onClick={() => setOpen(false)}>取消</Button>
            <Button size="sm" disabled={submitting || !reason.trim() || reason.length > 500} onClick={() => void finish()}>
              {submitting ? '处理中…' : '结束等待并继续'}
            </Button>
          </div>
        }
      >
        <label className="block space-y-2 text-sm text-cf-title">
          <span>操作原因（必填）</span>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={500} placeholder="请说明提前结束等待的原因" />
        </label>
        <p className="mt-1 text-right text-xs text-cf-muted">{reason.length}/500</p>
      </BaseDialog>
    </>
  );
};
