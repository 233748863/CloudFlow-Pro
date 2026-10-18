import { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button } from '../common';
import { useAuth } from '../../context/AuthContext';
import { withdrawApproval } from '../../services/api/workflow';
import { canWithdrawWorkflowApproval } from '../../utils/workflowPermissions';
import { getErrorMessage } from '../../utils/errorMessage';
import type { Task } from '../../types';

export const ApprovalWithdrawalButton = ({ task, onSuccess }: { task: Task; onSuccess?: () => void }) => {
  const { user, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  if (!hasPermission('workflow:task:reject') || !canWithdrawWorkflowApproval(task, user?.id)) return null;

  const confirm = async () => {
    if (pending.current || !task.historyId) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await withdrawApproval(task.historyId);
      setOpen(false);
      toast.success('本人审批已撤回，相关节点重新待办');
      onSuccess?.();
    } catch (failure) {
      setError(getErrorMessage(failure, '撤回失败，原审批记录保持不变'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <span className="inline-flex" onClick={event => event.stopPropagation()}>
    <button type="button" aria-label="撤回本人审批" data-tooltip="撤回本人审批" style={{ minHeight: 44, minWidth: 44 }}
      className="duration-150 motion-reduce:transition-none" onClick={() => { setError(''); setOpen(true); }}>
      <RotateCcw size={16} />
    </button>
    <BaseDialog open={open} title="撤回本人审批" width="narrow" hideCloseButton={busy} closeOnEscape={!busy}
      onClose={() => { if (!pending.current) setOpen(false); }}
      footer={<div className="flex justify-end gap-3">
        <Button variant="outline" style={{ minHeight: 44 }} disabled={busy} onClick={() => setOpen(false)}>取消</Button>
        <Button variant="destructive" style={{ minHeight: 44 }} disabled={busy} onClick={() => void confirm()}>{busy ? '撤回中…' : '确认撤回'}</Button>
      </div>}>
      <div className="space-y-3 text-sm leading-6 text-cf-body" aria-busy={busy}>
        <p className="break-words">将撤回您在“{task.workflowName}”的“{task.nodeName}”审批，原记录仍保留。</p>
        <p>本分支后续任务将失效并重新审批；已到达汇聚点时，所属网关会重新分流。提交时会再次核对流程状态。</p>
        {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      </div>
    </BaseDialog>
  </span>;
};
