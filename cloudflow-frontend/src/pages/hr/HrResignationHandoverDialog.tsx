import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button, UserSelector } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import {
  completeResignationHandover, getLifecycleApplication, listLifecycleApplicationTasks, updateLifecycleSuccessor,
  type LifecycleApplication, type OnboardingTask,
} from '@/services/api/hr';
import { getErrorMessage } from '@/utils/errorMessage';

interface Props {
  applicationId: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export const HrResignationHandoverDialog: React.FC<Props> = ({ applicationId, onClose, onSaved }) => {
  const { hasPermission } = useAuth();
  const [application, setApplication] = useState<LifecycleApplication | null>(null);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [successor, setSuccessor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [comparison, setComparison] = useState<LifecycleApplication | null>(null);
  const busyRef = useRef(false);
  const canEdit = hasPermission('hr:lifecycle:edit');
  const editable = !!application && ['DRAFT', 'APPROVING', 'APPROVED', 'ACCEPTED', 'REJECTED'].includes(application.status || '');
  const canCompleteTask = canEdit && !!application && ['APPROVED', 'ACCEPTED'].includes(application.status || '');
  const busy = loading || saving;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLifecycleApplication(applicationId), listLifecycleApplicationTasks(applicationId)])
      .then(([current, currentTasks]) => {
        if (cancelled) return;
        setApplication(current);
        setTasks(currentTasks);
        setSuccessor(current.successorUserId == null ? null : String(current.successorUserId));
      })
      .catch((failure) => { if (!cancelled) setError(getErrorMessage(failure, '交接安排读取失败')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applicationId]);

  const perform = async (operation: () => Promise<void>) => {
    if (busyRef.current || loading) return;
    busyRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await operation();
    } catch (failure) {
      const message = getErrorMessage(failure, '操作失败，当前选择已保留');
      setError(message);
      if (message.includes('已被修改')) setNeedsReview(true);
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const refresh = () => perform(async () => {
    const [current, currentTasks] = await Promise.all([getLifecycleApplication(applicationId), listLifecycleApplicationTasks(applicationId)]);
    setTasks(currentTasks);
    if (application) {
      setComparison(current);
      setNeedsReview(true);
    } else {
      setApplication(current);
      setSuccessor(current.successorUserId == null ? null : String(current.successorUserId));
    }
  });

  const save = () => perform(async () => {
    if (!application || !editable || !canEdit || needsReview) return;
    await updateLifecycleSuccessor(applicationId, application.version, successor == null ? null : Number(successor));
    toast.success('接任人安排已保存，完成离职后执行交接');
    setApplication(await getLifecycleApplication(applicationId));
    setComparison(null);
    await onSaved();
  });

  const completeTask = (task: OnboardingTask) => perform(async () => {
    if (!canCompleteTask || task.status === 'COMPLETED') return;
    await completeResignationHandover(task.id, '经人工核实已完成交接任务');
    setTasks(await listLifecycleApplicationTasks(applicationId));
    toast.success('交接任务已确认完成');
  });

  return (
    <BaseDialog open title="离职交接安排" width="wide" onClose={() => { if (!busyRef.current) onClose(); }}
      closeOnEscape={!saving} hideCloseButton={saving}
      description="未指定接任人时生成待办；指定后，在完成离职时统一交接客户业务。"
      footer={(
        <>
          <Button variant="outline" disabled={saving} onClick={onClose} className="!min-h-[44px] !min-w-[44px]">关闭</Button>
          {canEdit && editable && <Button disabled={busy || needsReview} onClick={() => void save()} className="!min-h-[44px] !min-w-[44px]">{saving ? '处理中...' : '保存接任人'}</Button>}
        </>
      )}
    >
      <div className="min-w-0 space-y-4" aria-busy={busy}>
        {loading && <p role="status">正在读取离职交接安排…</p>}
        {error && <p role="alert" className="break-words text-sm text-red-600">{error}</p>}
        <Button variant="outline" disabled={busy} onClick={() => void refresh()} className="!min-h-[44px] !min-w-[44px] whitespace-normal">读取最新申请（保留选择）</Button>
        {application && (
          <>
            <p className="break-words text-sm text-cf-subtle">{application.applicationNo} · {application.name || '离职员工'} · 当前版本 {application.version}</p>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-cf-body">客户业务接任人（可选）</p>
              <UserSelector single allowClear value={successor} onChange={(userId) => setSuccessor(userId)}
                disabled={busy || !editable || !canEdit} placeholder="客户业务接任人（可选）" />
              <p className="break-words text-sm text-cf-subtle">已保存：{application.successorName || '未指定，生成待交接任务'}。接任人已在团队时合并原负责人比例，其他成员比例及历史业绩不变。</p>
              {!editable && <p role="status" className="text-sm text-cf-subtle">此申请已结束，接任人安排只读。</p>}
            </div>
            {comparison && (
              <aside aria-label="接任人版本冲突核对" className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3 text-sm">
                <p>服务器最新版本 {comparison.version} · 接任人：{comparison.successorName || '未指定'} · 状态：{comparison.status}</p>
                <Button variant="outline" disabled={busy} className="!min-h-[44px] !min-w-[44px] whitespace-normal" onClick={() => {
                  setApplication(comparison); setComparison(null); setNeedsReview(false); setError(null);
                }}>已核对，保留选择并采用最新版本</Button>
              </aside>
            )}
            <section aria-label="离职交接任务" className="space-y-3">
              <h4 className="font-semibold text-cf-title">离职交接任务</h4>
              {!tasks.length && <p className="text-sm text-cf-subtle">暂无交接任务</p>}
              {tasks.map((task) => (
                <div key={task.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--cf-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="break-words text-sm">{task.taskName} · {task.status === 'COMPLETED' ? '已完成' : '待完成'}</p>
                  {task.status !== 'COMPLETED' && canCompleteTask && <Button variant="outline" disabled={busy} className="!min-h-[44px] !min-w-[44px] shrink-0" onClick={() => void completeTask(task)}>确认完成{task.taskName}</Button>}
                </div>
              ))}
              {!canCompleteTask && editable && <p className="text-sm text-cf-subtle">通过离职审批后，由获准人员确认任务，再完成离职。</p>}
            </section>
          </>
        )}
      </div>
    </BaseDialog>
  );
};
