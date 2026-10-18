import React, { useEffect, useRef, useState } from 'react';
import { CornerUpLeft, MessageSquare, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Textarea } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { assistAgentTask, returnAgentTask } from '@/services/api/workflow/agent';
import { getErrorMessage, getErrorStatus } from '@/utils/errorMessage';
import { getTaskAgentMode } from '@/utils/workflowPermissions';
import type { Task, User } from '@/types';

interface WorkflowAgentActionsProps {
  task: Task;
  currentUser: User;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onChanged: (task: Task) => void;
}

export const WorkflowAgentActions = ({ task, currentUser, disabled = false, onBusyChange, onChanged }: WorkflowAgentActionsProps) => {
  const { hasPermission } = useAuth();
  const mode = getTaskAgentMode(task, currentUser.id);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => { mutation.current?.abort(); }, []);
  if (!mode) return null;
  const versionReady = Number.isInteger(task.version) && task.version! >= 0;
  const blocked = disabled || busy || stale || !versionReady;

  const submit = async (operation: 'assist' | 'return') => {
    if (blocked || mutation.current || !hasPermission(`workflow:agent:${operation}`)) return;
    if (operation === 'assist' && (mode !== 'AGENT_ASSIST' || !comment.trim())) {
      setError('请填写协办意见');
      return;
    }
    const abort = new AbortController();
    mutation.current = abort;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    let changed: Task | undefined;
    try {
      if (operation === 'assist') {
        await assistAgentTask(task.id, task.version!, comment.trim(), abort.signal);
        changed = { ...task, version: task.version! + 1 };
      } else {
        const result = await returnAgentTask(task.id, task.version!, reason.trim(), abort.signal);
        changed = { ...task, version: result.version, proxyUserId: undefined, agentSettingId: undefined, agentMode: undefined };
      }
      if (!abort.signal.aborted) toast.success(operation === 'assist' ? '协办意见已保存，任务仍待本人审批' : '已归还，任务保留给原负责人');
    } catch (failure) {
      if (!abort.signal.aborted) {
        setError(getErrorMessage(failure, '操作失败，已保留填写内容'));
        setStale([403, 409].includes(getErrorStatus(failure) ?? 0));
      }
    } finally {
      mutation.current = null;
      onBusyChange?.(false);
      if (!abort.signal.aborted) {
        setBusy(false);
        if (changed) onChanged(changed);
      }
    }
  };

  return <section className="space-y-3 rounded-md border border-[var(--cf-border)] bg-[var(--cf-surface-muted)] p-4" aria-label={mode === 'AGENT_ASSIST' ? '仅协办意见' : '代理办理'}>
    <h3 className="flex items-center gap-2 text-sm font-semibold text-cf-title"><ShieldCheck size={16} />{mode === 'AGENT_ASSIST' ? '仅协办意见' : '代理办理'}</h3>
    <p className="text-sm text-cf-muted">代{task.assigneeName || task.assigneeId}办理；{mode === 'AGENT_ASSIST' ? '仅能提交意见或归还，不改变表单、审批结果及流程走向。' : '审批归属保留给原负责人，记录您的实际操作。'}</p>
    {mode === 'AGENT_ASSIST' && hasPermission('workflow:agent:assist') && <label className="block space-y-2"><span className="input-label">协办意见</span><Textarea aria-label="协办意见" maxLength={1000} rows={4} value={comment} disabled={blocked} onChange={event => setComment(event.target.value)} placeholder="填写需要原负责人参考的意见" /></label>}
    {!versionReady && <p role="alert" className="text-sm text-red-600">缺少任务版本，请关闭后重新读取待办。</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {stale && <div className="flex flex-wrap items-center gap-3"><p className="text-xs text-cf-subtle">任务或代理资格已变更，已保留填写内容。</p><Button type="button" variant="outline" className="min-h-11" onClick={() => onChanged(task)}>关闭并刷新待办</Button></div>}
    <div className="flex flex-wrap justify-end gap-2">
      {hasPermission('workflow:agent:return') && <Button type="button" variant="outline" className="min-h-11" disabled={blocked} onClick={() => setReturning(true)}><CornerUpLeft size={16} />归还原负责人</Button>}
      {mode === 'AGENT_ASSIST' && hasPermission('workflow:agent:assist') && <Button type="button" className="min-h-11" disabled={blocked} onClick={() => void submit('assist')}><MessageSquare size={16} />{busy ? '提交中…' : '提交协办意见'}</Button>}
    </div>
    <BaseDialog open={returning} title="归还代理任务" width="narrow" onClose={() => { if (!busy) setReturning(false); }} footer={<><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setReturning(false)}>取消</Button><Button type="button" className="min-h-11" disabled={blocked} onClick={() => void submit('return')}>{busy ? '归还中…' : '确认归还'}</Button></>}>
      <p className="mb-4 text-sm text-cf-body">任务将保留给{task.assigneeName || task.assigneeId}继续办理，本次代理关系结束。</p>
      <label className="block space-y-2"><span className="input-label">归还原因（选填）</span><Textarea aria-label="归还原因" maxLength={500} rows={3} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {stale && <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => onChanged(task)}>关闭并刷新待办</Button>}
    </BaseDialog>
  </section>;
};
