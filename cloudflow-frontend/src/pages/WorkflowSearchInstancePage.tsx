import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/common';
import { TaskHandleModal } from '@/components/TaskHandleModal';
import { useAuth } from '@/context/AuthContext';
import { getProcessInstance } from '@/services/api/workflow';
import { mapBackendInstanceToTask } from '@/utils/mappers';
import { getErrorMessage } from '@/utils/errorMessage';
import { businessSearchRoute } from '@/utils/businessSearch';
import type { Task } from '@/types';

export default function WorkflowSearchInstancePage() {
  const { instanceId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const scope = JSON.stringify([user?.tenantId, user?.id, user?.permissions, instanceId]);
  const [state, setState] = useState<{ scope: string; task?: Task; error?: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(undefined);
    const load = async () => {
      businessSearchRoute('WORKFLOW_INSTANCE', instanceId);
      const response: unknown = await getProcessInstance(instanceId, undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!response || typeof response !== 'object' || !('instanceId' in response) || response.instanceId !== instanceId) {
        throw new Error('流程已删除或无权查看。');
      }
      const instance = response as Parameters<typeof mapBackendInstanceToTask>[0];
      setState({ scope, task: mapBackendInstanceToTask(instance) });
    };
    void load().catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ scope, error: getErrorMessage(error, '流程详情无法加载，请重试。') });
    });
    return () => controller.abort();
  }, [scope, instanceId, revision]);
  const current = state?.scope === scope ? state : undefined;
  const close = () => navigate('/', { replace: true });
  return <section className="p-4 text-sm">
    <h1 className="text-lg font-semibold text-cf-title">流程详情</h1>
    {!current && <p role="status" className="mt-4">正在核对流程查看权限…</p>}
    {current?.error && <div role="alert" className="mt-4"><p>{current.error}</p><Button className="mt-3 min-h-[44px]" variant="outline" onClick={() => setRevision(value => value + 1)}>重试</Button></div>}
    <Button className="mt-4 min-h-[44px]" variant="outline" onClick={close}>返回工作台</Button>
    {user && current?.task && <TaskHandleModal key={scope} task={current.task} isOpen viewOnly availableForms={[]} currentUser={user} onClose={close} onComplete={() => undefined} />}
  </section>;
}
