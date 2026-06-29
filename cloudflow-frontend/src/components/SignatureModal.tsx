import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common';
import { Button, Input, Textarea } from '@/components/common';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import { getUserList } from '../services/api/auth';
import { addSignature, reductionSignature } from '../services/api/workflow';
import { mapBackendUserToFrontend } from '../utils/mappers';
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
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => {
    if (isOpen && users.length === 0) {
      getUserList()
        .then((res) => {
          if (Array.isArray(res)) {
            setUsers(res.map(mapBackendUserToFrontend));
          }
        })
        .catch((error) => {
          console.error('加载用户列表失败:', error);
          toast.error(getErrorMessage(error, '加载用户列表失败'));
        });
    }
  }, [isOpen, users.length]);

  useEffect(() => {
    if (isOpen) {
      setSelectedUserIds([]);
      setComment('');
      setSearchKeyword('');
    }
  }, [isOpen]);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        if (mode === 'add' && user.id === currentUser.id) {
          return false;
        }

        if (!searchKeyword) {
          return true;
        }

        const keyword = searchKeyword.toLowerCase();
        return (
          user.name.toLowerCase().includes(keyword) ||
          Boolean(user.username && user.username.toLowerCase().includes(keyword))
        );
      }),
    [currentUser.id, mode, searchKeyword, users],
  );

  if (!isOpen) {
    return null;
  }

  const toggleUser = (userId: number) => {
    setSelectedUserIds((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId],
    );
  };

  const handleSubmit = async () => {
    if (selectedUserIds.length === 0) {
      toast.error(`请选择要${mode === 'add' ? '加签' : '减签'}的人员`);
      return;
    }
    if (!comment.trim()) {
      toast.error(`请填写${mode === 'add' ? '加签' : '减签'}说明`);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'add') {
        await addSignature(taskId, selectedUserIds, comment);
        toast.success('加签成功');
      } else {
        await reductionSignature(taskId, selectedUserIds, comment);
        toast.success('减签成功');
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error(`${mode === 'add' ? '加签' : '减签'}失败:`, error);
      toast.error(error instanceof Error ? error.message : `${mode === 'add' ? '加签' : '减签'}失败`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BaseDialog
      open={isOpen}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      panelClassName="max-h-[88vh] flex flex-col"
      bodyClassName="!p-0 flex-1 overflow-hidden"
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
          ? '在会签节点中新增审批人，新的审批人会参与当前任务投票。'
          : '减少会签节点的审批人，已投票人员通常不可被减签。'
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="admin-dialog-stack">
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
                  <div className="text-xs leading-6 text-slate-600 dark:text-slate-300">
                    {mode === 'add'
                      ? '仅支持会签节点，且只有当前任务处理人可以执行加签。'
                      : '仅支持会签节点，任务处理人或管理员可减签，至少保留 1 名审批人。'}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">选择人员</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                支持按姓名或账号搜索可选审批人。
              </div>

              <div className="mt-4 relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="搜索用户姓名或账号..."
                  className="pl-10"
                />
              </div>

              <div className="mt-4 max-h-72 overflow-y-auto">
                {filteredUsers.length === 0 ? (
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
                          onClick={() => toggleUser(Number(user.id))}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 text-left transition',
                            active
                              ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30'
                              : 'bg-[var(--cf-surface-muted)] hover:border-cyan-200 hover:bg-[var(--cf-surface-strong)] dark:bg-slate-900/70 dark:hover:border-cyan-900 dark:hover:bg-slate-950',
                          )}
                        >
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="h-10 w-10 rounded-md object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--cf-surface-muted)] text-sm font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                              {user.name?.slice(0, 1) || 'U'}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn(
                                'truncate font-medium',
                                active
                                  ? 'text-cyan-700 dark:text-cyan-200'
                                  : 'text-slate-900 dark:text-slate-100',
                              )}
                            >
                              {user.name}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {user.username ? `@${user.username}` : user.email || '暂无账号信息'}
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
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">操作说明</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
                  onChange={(event) => setComment(event.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={submitting || selectedUserIds.length === 0 || !comment.trim()}
            >
              {submitting ? '处理中...' : `确认${mode === 'add' ? '加签' : '减签'}`}
            </Button>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
};

export default SignatureModal;
