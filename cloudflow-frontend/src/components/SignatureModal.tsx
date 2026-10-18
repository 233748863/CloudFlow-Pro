import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Search, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common';
import { Button, Input, Textarea } from '@/components/common';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import { addSignature, reductionSignature, addSign, removeSign, getTaskSignatures, getUsers } from '../services/api/workflow';
import type { AddSignRequest, TaskSignatureContext } from '../services/api/workflow';
import type { UserBrief } from '../types/workflow';
import { User } from '../types';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  taskId: string;
  mode: 'add' | 'reduce';
  currentUser: User;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  taskId,
  mode,
  currentUser,
}) => {
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [signType, setSignType] = useState<AddSignRequest['signType']>('BEFORE');
  const [context, setContext] = useState<TaskSignatureContext>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    setContext(undefined);
    Promise.all([getTaskSignatures(taskId), mode === 'add' ? getUsers() : Promise.resolve([])])
      .then(([details, options]) => {
        if (!active) return;
        setContext(details);
        setUsers(mode === 'add' ? options : details.members.map(member => ({
          id: String(member.userId), name: member.userName || String(member.userId),
          deptName: member.status === 'PLANNED' ? '原审批通过后分派' : '尚未处理',
        })));
      })
      .catch(error => { if (active) setLoadError(getErrorMessage(error, '无法读取当前加签人员，请重新加载')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, taskId, mode, revision]);

  useEffect(() => {
    if (isOpen) {
      setSelectedUserIds([]);
      setComment('');
      setSearchKeyword('');
      setSignType('BEFORE');
      setSubmitError('');
    }
  }, [isOpen, taskId, mode]);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        if (mode === 'add' && (String(user.id) === String(context?.assigneeId ?? currentUser.id)
          || context?.members.some(member => String(member.userId) === String(user.id)))) {
          return false;
        }

        if (!searchKeyword) {
          return true;
        }

        const keyword = searchKeyword.toLowerCase();
        return (
          user.name.toLowerCase().includes(keyword) ||
          Boolean(user.deptName && user.deptName.toLowerCase().includes(keyword))
        );
      }),
    [context, currentUser.id, mode, searchKeyword, users],
  );

  const allowed = mode === 'add' ? context?.canAdd : context?.canReduce;

  if (!isOpen) {
    return null;
  }

  const toggleUser = (userId: number) => {
    setSelectedUserIds((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId],
    );
  };

  const handleSubmit = async () => {
    if (pending.current || !allowed || loading || loadError) return;
    if (selectedUserIds.length === 0) {
      toast.error(`请选择要${mode === 'add' ? '加签' : '减签'}的人员`);
      return;
    }
    if (!comment.trim()) {
      toast.error(`请填写${mode === 'add' ? '加签' : '减签'}说明`);
      return;
    }

    pending.current = true;
    setSubmitError('');
    setSubmitting(true);
    try {
      if (context?.kind === 'ORDERED' && mode === 'add') {
        await addSign({ taskId, userIds: selectedUserIds, signType, reason: comment.trim() });
        toast.success('加签成功');
      } else if (context?.kind === 'ORDERED') {
        await removeSign({ taskId, userIds: selectedUserIds, reason: comment.trim() });
        toast.success('减签成功');
      } else if (mode === 'add') {
        await addSignature(taskId, selectedUserIds, comment);
        toast.success('加签成功');
      } else {
        await reductionSignature(taskId, selectedUserIds, comment);
        toast.success('减签成功');
      }
      onSuccess();
      onClose();
    } catch (error) {
      setSubmitError(getErrorMessage(error, `${mode === 'add' ? '加签' : '减签'}失败，选择和说明已保留`));
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <BaseDialog
      open={isOpen}
      zIndex={70}
      onClose={() => { if (!pending.current) onClose(); }}
      hideCloseButton={submitting}
      closeOnEscape={!submitting}
      maxWidthClassName="max-w-3xl"
      panelClassName="max-h-[88vh] flex flex-col [&_.modal-close]:!min-h-[44px] [&_.modal-close]:!min-w-[44px]"
      bodyClassName="p-4 sm:p-5"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="!min-h-[44px]" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          {allowed && <Button
            onClick={() => void handleSubmit()}
            className="!min-h-[44px]"
            disabled={loading || Boolean(loadError) || !allowed || submitting || selectedUserIds.length === 0 || !comment.trim()}
          >
            {submitting ? '处理中...' : `确认${mode === 'add' ? '加签' : '减签'}`}
          </Button>}
        </div>
      }
      title={
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'admin-source-stat-icon !h-9 !w-9 !flex-none',
              mode === 'add'
                ? 'border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
                : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
            )}
          >
            {mode === 'add' ? <UserPlus size={18} /> : <UserMinus size={18} />}
          </span>
          {mode === 'add' ? '加签' : '减签'}
        </div>
      }
      description={
        mode === 'add'
          ? '选择新增审批人和处理顺序，当前节点规则由服务器核对。'
          : '只列出当前仍可移除的人员，已完成的审批记录始终保留。'
      }
    >
      <div className="admin-dialog-stack">
            {loading && <p role="status" className="p-4 text-sm text-cf-muted">正在读取任务和可选人员…</p>}
            {loadError && <div role="alert" className="p-4 text-sm text-red-700 dark:text-red-300">
              <p>{loadError}</p><Button className="mt-2 !min-h-[44px]" onClick={() => setRevision(value => value + 1)}>重新加载</Button>
            </div>}
            <div
              className={cn(
                'px-4 py-4',
                mode === 'add'
                  ? 'border-cyan-200 bg-cyan-50/80 dark:border-cyan-900 dark:bg-cyan-950/20'
                  : 'border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/20',
              )}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={18}
                  className={cn(
                    'mt-0.5 shrink-0',
                    mode === 'add'
                      ? 'text-cyan-700 dark:text-cyan-200'
                      : 'text-amber-700 dark:text-amber-200',
                  )}
                />
                <div className="space-y-1 text-sm">
                  <div
                    className={cn(
                      'font-medium',
                      mode === 'add'
                        ? 'text-cyan-700 dark:text-cyan-200'
                        : 'text-amber-700 dark:text-amber-200',
                    )}
                  >
                    {mode === 'add' ? '加签说明' : '减签说明'}
                  </div>
                  <div className="text-xs leading-6 text-cf-muted">
                    {context && !allowed ? `当前任务不允许${mode === 'add' ? '加签' : '减签'}。`
                      : context?.message || '读取后显示当前节点允许的操作。'}
                  </div>
                </div>
              </div>
            </div>

            {context?.kind === 'ORDERED' && mode === 'add' && <fieldset disabled={submitting || !allowed} className="space-y-2 p-4">
              <legend className="text-sm font-semibold text-cf-title">加签顺序</legend>
              {([
                ['BEFORE', '前加签', '新增人员全部通过后，交还原负责人审批。'],
                ['AFTER', '后加签', '原负责人先通过，再由新增人员全部审批。'],
                ['PARALLEL', '并行加签', '原负责人和新增人员同时处理，全部通过后继续。'],
              ] as const).map(([value, label, explanation]) => <label key={value}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-[var(--cf-border)] p-3 text-sm transition-colors duration-150 motion-reduce:transition-none">
                <input type="radio" name={`signature-order-${taskId}`} value={value} checked={signType === value} onChange={() => setSignType(value)} />
                <span><span className="block font-medium text-cf-title">{label}</span><span className="block text-xs leading-5 text-cf-subtle">{explanation}</span></span>
              </label>)}
            </fieldset>}

            <div className="p-4">
              <div className="text-sm font-semibold text-cf-title">选择人员</div>
              <div className="mt-1 text-xs text-cf-subtle">
                {mode === 'add' ? '支持按姓名或部门搜索可选审批人。' : '仅显示尚未处理或尚未分派的本组人员。'}
              </div>

              <div className="mt-4 relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cf-faint"
                />
                <Input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="搜索用户姓名或部门..."
                  aria-label="搜索加签人员"
                  disabled={loading || submitting || !allowed}
                  className="min-h-[44px] pl-10"
                />
              </div>

              <div className="mt-4 max-h-72 overflow-y-auto">
                {loading || loadError ? null : filteredUsers.length === 0 ? (
                  <WorkspaceInlineState
                    type="info"
                    title={searchKeyword ? '未找到匹配用户' : '暂无可选用户'}
                    className="py-10"
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredUsers.map((user) => {
                      const active = selectedUserIds.includes(Number(user.id));
                      return (
                        <button
                          key={user.id}
                          type="button"
                          aria-pressed={active}
                          disabled={submitting || !allowed}
                          onClick={() => toggleUser(Number(user.id))}
                          className={cn(
                            'flex min-h-[44px] items-center gap-3 px-4 py-3 text-left transition-colors duration-150 motion-reduce:transition-none disabled:opacity-50',
                            active
                              ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30'
                              : 'bg-[var(--cf-surface-muted)] hover:border-cyan-200 hover:bg-[var(--cf-surface-strong)] dark:bg-slate-900/70 dark:hover:border-cyan-900 dark:hover:bg-slate-950',
                          )}
                        >
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="h-10 w-10 rounded-md object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--cf-surface-muted)] text-sm font-semibold text-cf-muted dark:bg-slate-900">
                              {user.name?.slice(0, 1) || 'U'}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn(
                                'truncate font-medium',
                                active
                                  ? 'text-cyan-700 dark:text-cyan-200'
                                  : 'text-cf-title',
                              )}
                            >
                              {user.name}
                            </div>
                            <div className="mt-1 text-xs text-cf-subtle">
                              {user.deptName || user.email || '本租户用户'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-cf-title">操作说明</div>
                  <div className="mt-1 text-xs text-cf-subtle">
                    该说明会写入审批记录，建议明确说明原因和目标。
                  </div>
                </div>
                {selectedUserIds.length > 0 ? (
                  <span className="badge border border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                    已选择 {selectedUserIds.length} 人
                  </span>
                ) : null}
              </div>

              <div className="mt-4">
                <Textarea
                  rows={4}
                  placeholder={`请填写${mode === 'add' ? '加签' : '减签'}原因...`}
                  value={comment}
                  maxLength={500}
                  aria-label={mode === 'add' ? '加签原因' : '减签原因'}
                  onChange={(event) => setComment(event.target.value)}
                  disabled={submitting || !allowed}
                />
                {submitError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{submitError}</p>}
              </div>
            </div>
      </div>
    </BaseDialog>
  );
};

export default SignatureModal;
