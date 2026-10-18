import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/common';
import { TaskHandleModal } from '@/components/TaskHandleModal';
import { useAuth } from '@/context/AuthContext';
import { getTodoTask } from '@/services/api/workflow/task';
import { getAuthToken } from '@/utils/authStorage';
import { getErrorMessage } from '@/utils/errorMessage';
import { mapBackendTaskToFrontend } from '@/utils/mappers';
import { isTaskInCurrentTodo } from '@/utils/workflowPermissions';
import type { Task, User } from '@/types';

function TaskDetails({ taskId, user }: { taskId: string; user: User }) {
  const navigate = useNavigate();
  const [state, setState] = useState<{ task?: Task; error?: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(undefined);
    const load = async () => {
      const response = await getTodoTask(taskId, controller.signal);
      if (controller.signal.aborted) return;
      if (!response || typeof response !== 'object' || !('taskId' in response) || response.taskId !== taskId
        || !('status' in response) || response.status !== 'TODO') throw new Error('任务已处理、已转交或无权查看。');
      const task = mapBackendTaskToFrontend(response as Parameters<typeof mapBackendTaskToFrontend>[0]);
      if (!task.processInstanceId || !isTaskInCurrentTodo(task, user)) throw new Error('当前账号已无法办理此任务。');
      setState({ task });
    };
    void load().catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ error: getErrorMessage(error, '待办详情无法加载，请重试。') });
    });
    return () => controller.abort();
  }, [taskId, user, revision]);
  const close = () => navigate('/tasks', { replace: true });
  return <>
    {!state && <p role="status" className="mt-4 text-cf-muted">正在核对待办权限…</p>}
    {state?.error && <div role="alert" className="mt-4 space-y-3"><p>{state.error}</p>
      <Button className="min-h-[44px]" variant="outline" onClick={() => setRevision(value => value + 1)}>重试</Button>
    </div>}
    <Button className="mt-4 min-h-[44px]" variant="outline" onClick={close}>返回待办列表</Button>
    {state?.task && <TaskHandleModal task={state.task} isOpen currentUser={user} availableForms={[]} onClose={close} onComplete={close} />}
  </>;
}

export default function WorkflowTaskPage() {
  const { taskId = '' } = useParams();
  const { user, loading, hasPermission } = useAuth();
  const valid = /^[A-Za-z0-9_-]{1,64}$/.test(taskId);
  const scope = JSON.stringify([user?.tenantId, user?.id, user?.permissions, getAuthToken(), taskId]);
  return <main className="min-h-screen bg-[var(--cf-bg)] p-4 text-sm text-[var(--cf-text)] sm:p-6">
    <section className="card mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-cf-title">待办详情</h1>
      {!valid ? <p role="alert" className="mt-4">待办链接无效。</p>
        : loading ? <p role="status" className="mt-4">正在核验登录身份…</p>
          : !user ? <div className="mt-4 space-y-3"><p>请使用收到此待办的账号登录。</p>
            <Link className="inline-flex min-h-[44px] items-center underline" to={`/login?redirect=${encodeURIComponent(`/workflow/task/${taskId}`)}`}>登录并返回待办</Link>
          </div>
            : !hasPermission(['workflow:task:todo', 'workflow:process:view'], true) ? <p role="alert" className="mt-4">当前账号没有查看此待办的权限。</p>
              : <TaskDetails key={scope} taskId={taskId} user={user} />}
    </section>
  </main>;
}
