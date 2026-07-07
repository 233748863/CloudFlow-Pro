import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, GitMerge, Loader2, RefreshCw } from 'lucide-react';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { WorkflowDefinition, FormDefinition, User } from '../types';
import { Button } from '@/components/common';
import {
  getProcessDefinition,
  getProcessDefinitions,
  saveProcessDefinition,
  getFormDefinitions,
} from '../services/api/workflow';
import { getRoleOptions, getUserList } from '../services/api/auth';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { normalizeWorkflowCategory } from '../utils/workflowCategory';
import { mapBackendFormDefinitions } from '../utils/formDefinition';
import { useAutoSave } from '../hooks/useAutoSave';
import { toast } from 'sonner';
import { logWorkflow } from '../lib/logger';
import {
  createDefaultWorkflowGraph,
  parseWorkflowGraphDefinition,
} from '../utils/workflowGraph';

import {
  workflowDesignCache,
  resetWorkflowDesignCaches,
  type WorkflowDesignContextPayload,
} from './workflowDesignCache';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

export { resetWorkflowDesignCaches };

const StatusPanel: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ icon, title, description, actions }) => (
  <InnerTableSurface wrapperClassName="px-6 py-10 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
      {icon}
    </div>
    <div className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    {actions ? <div className="mt-5 flex justify-center gap-3">{actions}</div> : null}
  </InnerTableSurface>
);

const loadWorkflowDesignContext = async (): Promise<WorkflowDesignContextPayload> => {
  if (workflowDesignCache.context) {
    return workflowDesignCache.context;
  }
  if (workflowDesignCache.contextPromise) {
    return workflowDesignCache.contextPromise;
  }

  workflowDesignCache.contextPromise = Promise.all([
    getFormDefinitions().catch((err) => {
      logWorkflow.warn('加载表单列表失败:', err);
      toast.warning('表单列表加载失败，暂时无法绑定表单');
      return [];
    }),
    getRoleOptions().catch((err) => {
      logWorkflow.warn('加载角色列表失败:', err);
      toast.warning('角色列表加载失败，部分审批人配置不可用');
      return [];
    }),
    getUserList().catch((err) => {
      logWorkflow.warn('加载用户列表失败:', err);
      toast.warning('用户列表加载失败，部分审批人配置不可用');
      return [];
    }),
  ])
    .then(([forms, roles, users]) => {
      const payload: WorkflowDesignContextPayload = {
        forms: Array.isArray(forms) ? mapBackendForms(forms) : [],
        roles: Array.isArray(roles) ? roles : [],
        users: Array.isArray(users) ? users.map(mapBackendUserToFrontend) : [],
      };
      workflowDesignCache.context = payload;
      return payload;
    })
    .finally(() => {
      workflowDesignCache.contextPromise = null;
    });

  return workflowDesignCache.contextPromise;
};

const loadProcessDefinitionById = async (definitionId: string): Promise<any | null> => {
  const normalizedId = definitionId.trim();
  if (!normalizedId) {
    return null;
  }

  const cachedPromise = workflowDesignCache.processDefinitionPromises.get(normalizedId);
  if (cachedPromise) {
    return cachedPromise;
  }

  const requestPromise = getProcessDefinition(normalizedId)
    .catch((err) => {
      logWorkflow.warn('按 ID 加载流程失败，尝试列表兜底:', err);
      return null;
    })
    .finally(() => {
      workflowDesignCache.processDefinitionPromises.delete(normalizedId);
    });

  workflowDesignCache.processDefinitionPromises.set(normalizedId, requestPromise);
  return requestPromise;
};

const loadProcessDefinitionsList = async (): Promise<any[]> => {
  if (workflowDesignCache.processDefinitionsListPromise) {
    return workflowDesignCache.processDefinitionsListPromise;
  }

  workflowDesignCache.processDefinitionsListPromise = getProcessDefinitions()
    .catch((err) => {
      logWorkflow.warn('加载流程定义列表失败:', err);
      return [];
    })
    .finally(() => {
      workflowDesignCache.processDefinitionsListPromise = null;
    });

  return workflowDesignCache.processDefinitionsListPromise;
};

const createDefaultWorkflow = (): WorkflowDefinition => ({
  id: `new_${Date.now()}`,
  name: '新流程',
  key: 'new_process',
  version: 1,
  graph: createDefaultWorkflowGraph(),
});

/**
 * 解析流程图定义，只接受合法的 nodes+edges 图模型。
 */
const parseWorkflowGraph = (raw: unknown, workflowName: string) => {
  const graph = parseWorkflowGraphDefinition(raw);
  if (!graph) {
    throw new Error(`流程 "${workflowName}" 的 modelJson 不是合法的 nodes+edges 图模型`);
  }
  return graph;
};

/**
 * 统一映射后端流程数据，确保设计器使用稳定的 definitionId。
 */
const resolveDefinitionId = (w: any): string => {
  const rawId = w?.definitionId;
  if (rawId === undefined || rawId === null) {
    return '';
  }
  return String(rawId).trim();
};

/**
 * 解析保存接口返回的 definitionId。
 * nodes+edges 重构后仅接受对象结构：{ id: string }。
 */
const resolveSavedDefinitionId = (result: unknown): string | undefined => {
  if (result && typeof result === 'object') {
    const rawId = (result as { id?: unknown }).id;
    if (typeof rawId === 'string') {
      const trimmed = rawId.trim();
      return trimmed ? trimmed : undefined;
    }
  }
  return undefined;
};

const mapBackendWorkflow = (w: any): WorkflowDefinition => ({
  id: resolveDefinitionId(w),
  name: w?.processName || '未命名流程',
  key: w?.processKey || 'new_process',
  version: Number(w?.version || 1),
  formId: w?.formId,
  graph: parseWorkflowGraph(w?.modelJson, w?.processName || '未命名流程'),
  description: w?.description,
  category: normalizeWorkflowCategory(w?.category),
  tags: typeof w?.tags === 'string' ? w.tags : w?.tags ? JSON.stringify(w.tags) : undefined,
  startPermissionType: w?.startPermissionType,
  startPermissionValue: w?.startPermissionValue,
  deptId: w?.deptId,
});

const mapBackendForms = (forms: any[]): FormDefinition[] => mapBackendFormDefinitions(forms);

const buildWorkflowSavePayload = (wf: WorkflowDefinition) => ({
  definitionId: wf.id.startsWith('new_') ? undefined : wf.id,
  processName: wf.name,
  processKey: wf.key,
  formId: wf.formId,
  modelJson: JSON.stringify(wf.graph),
  description: wf.description,
  category: wf.category,
  tags: wf.tags,
  startPermissionType: wf.startPermissionType,
  startPermissionValue: wf.startPermissionValue,
  deptId: wf.deptId,
});

/**
 * 自动保存签名：忽略 definitionId，仅关注流程内容是否真正变化。
 */
const buildWorkflowContentSignature = (wf: WorkflowDefinition | null | undefined): string => {
  if (!wf) return '';
  return JSON.stringify({
    processName: wf.name || '',
    processKey: wf.key || '',
    formId: wf.formId || '',
    modelJson: JSON.stringify(wf.graph),
    description: wf.description || '',
    category: wf.category || '',
    tags: wf.tags || '',
    startPermissionType: wf.startPermissionType || '',
    startPermissionValue: wf.startPermissionValue || '',
    deptId: wf.deptId ?? null,
  });
};

export const WorkflowDesign = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedWorkflowId = useMemo(() => (searchParams.get('id') || '').trim(), [searchParams]);
  const createMode = useMemo(() => (searchParams.get('mode') || '').trim().toLowerCase(), [searchParams]);
  const allowBlankCreation = createMode === 'blank';

  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workflowIdRef = useRef<string>('');
  const inFlightLoadKeyRef = useRef<string | null>(null);
  const loadSequenceRef = useRef(0);
  const contextLoadedRef = useRef(false);
  const lastAutoSavedSignatureRef = useRef<string>('');
  const skipNextUrlSyncRef = useRef(false);

  const renderStatusShell = (panel: React.ReactNode) => (
    <section className="admin-source-page admin-workflow-design-page">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">WORKFLOW DESIGNER</p>
          <h2>流程设计</h2>
          <span>准备流程定义、表单和审批基础数据</span>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-260px)] items-center justify-center py-6">
        <div className="w-full max-w-3xl">{panel}</div>
      </div>
    </section>
  );

  const syncWorkflowIdToUrl = useCallback(
    (definitionId: string) => {
      if (!definitionId) return;
      if (searchParams.get('id') === definitionId) return;

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('mode');
      nextParams.delete('entry');
      nextParams.set('id', definitionId);
      navigate({ search: `?${nextParams.toString()}` }, { replace: true });
    },
    [navigate, searchParams],
  );

  useEffect(() => {
    workflowIdRef.current = workflow?.id || '';
  }, [workflow?.id]);

  const handleWorkflowChange = useCallback((next: WorkflowDefinition) => {
    setWorkflow((prev) => {
      if (!prev) {
        return next;
      }
      // 已持久化流程始终以父状态 id 为准，避免异步回传旧 id 导致循环请求。
      const keepPrevId =
        !!prev.id &&
        !prev.id.startsWith('new_') &&
        !!next.id &&
        prev.id !== next.id;
      const normalizedNext = keepPrevId ? { ...next, id: prev.id } : next;

      const sameId = prev.id === normalizedNext.id;
      const sameContent =
        buildWorkflowContentSignature(prev) ===
        buildWorkflowContentSignature(normalizedNext);

      // 等价快照不再触发父状态更新，避免自动保存误判。
      if (sameId && sameContent) {
        return prev;
      }
      return normalizedNext;
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!requestedWorkflowId && !allowBlankCreation) {
      return;
    }
    const loadKey = requestedWorkflowId || (allowBlankCreation ? '__blank__' : '__default__');
    if (inFlightLoadKeyRef.current === loadKey) {
      return;
    }
    if (requestedWorkflowId && workflowIdRef.current === requestedWorkflowId) {
      return;
    }

    inFlightLoadKeyRef.current = loadKey;
    const currentLoadSeq = ++loadSequenceRef.current;

    try {
      setLoading(true);
      setError(null);

      if (!contextLoadedRef.current) {
        const context = await loadWorkflowDesignContext();
        if (currentLoadSeq !== loadSequenceRef.current) {
          return;
        }

        setSavedForms(context.forms);
        setAvailableRoles(context.roles);
        setAvailableUsers(context.users);
        contextLoadedRef.current = true;
      }

      if (allowBlankCreation && !requestedWorkflowId) {
        const nextWorkflow = createDefaultWorkflow();
        setWorkflow(nextWorkflow);
        workflowIdRef.current = nextWorkflow.id;
        lastAutoSavedSignatureRef.current = buildWorkflowContentSignature(nextWorkflow);
        return;
      }

      let selectedWorkflow: any = null;
      if (requestedWorkflowId) {
        selectedWorkflow = await loadProcessDefinitionById(requestedWorkflowId);
        if (currentLoadSeq !== loadSequenceRef.current) {
          return;
        }
      }

      if (!selectedWorkflow) {
        const workflows = await loadProcessDefinitionsList();
        if (currentLoadSeq !== loadSequenceRef.current) {
          return;
        }

        if (Array.isArray(workflows) && workflows.length > 0) {
          if (requestedWorkflowId) {
            selectedWorkflow = workflows.find((item: any) => {
              const id = resolveDefinitionId(item);
              return id === requestedWorkflowId;
            });
          } else {
            selectedWorkflow = workflows.find((item: any) => !!resolveDefinitionId(item));
          }
        }
      }

      if (!selectedWorkflow && requestedWorkflowId) {
        toast.warning('指定流程不存在或已失效，已切换到新建流程');
      }
      if (selectedWorkflow && !resolveDefinitionId(selectedWorkflow)) {
        selectedWorkflow = null;
        toast.warning('检测到流程缺少 definitionId，已切换为新建模式');
      }

      const nextWorkflow = selectedWorkflow ? mapBackendWorkflow(selectedWorkflow) : createDefaultWorkflow();
      setWorkflow(nextWorkflow);
      workflowIdRef.current = nextWorkflow.id;
      lastAutoSavedSignatureRef.current = buildWorkflowContentSignature(nextWorkflow);
    } catch (err) {
      logWorkflow.error('加载数据失败:', err);
      setError(err instanceof Error ? err.message : '加载数据失败');
      toast.error('加载数据失败，请重试');
    } finally {
      if (inFlightLoadKeyRef.current === loadKey) {
        inFlightLoadKeyRef.current = null;
      }
      if (currentLoadSeq === loadSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [allowBlankCreation, requestedWorkflowId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!workflow?.id || workflow.id.startsWith('new_')) {
      return;
    }
    if (skipNextUrlSyncRef.current) {
      skipNextUrlSyncRef.current = false;
      return;
    }
    syncWorkflowIdToUrl(workflow.id);
  }, [workflow?.id, syncWorkflowIdToUrl]);

  const handleSaveWorkflow = async (wf: WorkflowDefinition): Promise<{ id?: string } | void> => {
    try {
      if (!wf.key || wf.key === 'new_process') {
        throw new Error('流程Key不能为空或使用默认值，请设置有效的流程Key');
      }

      const payload = buildWorkflowSavePayload(wf);

      logWorkflow.info('保存流程:', payload.processName);
      const result = await saveProcessDefinition(payload);
      lastAutoSavedSignatureRef.current = buildWorkflowContentSignature(wf);
      const nextId = resolveSavedDefinitionId(result);
      if (nextId && wf.id !== nextId) {
        setWorkflow((prev) => (prev ? { ...prev, id: nextId } : prev));
        workflowIdRef.current = nextId;
      }
      // 回传保存后的 definitionId，供设计器发布/导出等后续动作使用最新版本 id
      const effectiveId = nextId || (wf.id && !wf.id.startsWith('new_') ? wf.id : undefined);
      return effectiveId ? { id: effectiveId } : undefined;
    } catch (err) {
      logWorkflow.error('保存流程失败:', err);
      toast.error(err instanceof Error ? err.message : '流程保存失败');
      throw err;
    }
  };

  // 自动保存仅对已持久化流程启用。
  useAutoSave(
    workflow,
    async (wf) => {
      if (
        wf &&
        wf.name &&
        wf.name !== '新流程' &&
        wf.key &&
        wf.key !== 'new_process' &&
        wf.key.trim() !== ''
      ) {
        const currentSignature = buildWorkflowContentSignature(wf);
        if (currentSignature === lastAutoSavedSignatureRef.current) {
          return;
        }
        const payload = buildWorkflowSavePayload(wf);
        const result = await saveProcessDefinition(payload);
        lastAutoSavedSignatureRef.current = currentSignature;
        const nextId = resolveSavedDefinitionId(result);
        if (nextId && wf.id !== nextId) {
          // 自动保存只更新本地 id，不触发 URL 同步，避免重复加载。
          skipNextUrlSyncRef.current = true;
          setWorkflow((prev) => (prev ? { ...prev, id: nextId } : prev));
          workflowIdRef.current = nextId;
        }
      }
    },
    {
      delay: 3000,
      enabled:
        !!workflow &&
        !workflow.id.startsWith('new_') &&
        !!workflow.key &&
        workflow.key !== 'new_process' &&
        workflow.key.trim() !== '',
      resetKey: workflow?.id,
      isEqual: (prev, next) =>
        buildWorkflowContentSignature(prev) === buildWorkflowContentSignature(next),
      onSuccess: () => logWorkflow.info('流程自动保存成功'),
      onError: (err) => logWorkflow.error('流程自动保存失败:', err),
    },
  );

  if (!requestedWorkflowId && !allowBlankCreation) {
    return <Navigate to="/workflow/create" replace />;
  }

  if (loading) {
    return renderStatusShell(
      <StatusPanel
        icon={<Loader2 size={28} className="animate-spin text-slate-600 dark:text-slate-200" />}
        title="正在加载流程设计器..."
        description="正在准备流程定义、表单列表和审批基础数据，请稍候。"
      />
    );
  }

  if (error) {
    return renderStatusShell(
      <StatusPanel
        icon={<AlertTriangle size={28} className="text-slate-500 dark:text-slate-300" />}
        title="流程设计数据加载失败"
        description={error}
        actions={
          <Button
            type="button"
            onClick={loadData}
            className="rounded-md"
          >
            重新加载
          </Button>
        }
      />
    );
  }

  if (!workflow) {
    return renderStatusShell(
      <StatusPanel
        icon={<GitMerge size={28} className="text-slate-400" />}
        title="未找到可编辑流程"
        description="当前没有加载到流程定义。可以重新尝试，或者直接创建一个新的空白流程。"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={loadData}
              className="rounded-md"
            >
              重新加载
            </Button>
            <Button
              type="button"
              onClick={() => navigate('/workflow/design?mode=blank&entry=create')}
              className="rounded-md"
            >
              新建流程
            </Button>
          </>
        }
      />
    );
  }

  const isNewWorkflow = workflow.id.startsWith('new_');
  const studioTitle = isNewWorkflow ? '新建流程设计' : workflow.name || '流程设计';

  const pageActions = (
    <div className="grid gap-3">
      <header className="admin-source-header admin-workflow-design-header">
        <div>
          <p className="admin-source-kicker">WORKFLOW DESIGNER</p>
          <h2>{studioTitle}</h2>
          <span>{isNewWorkflow ? '空白流程' : workflow.key ? `流程 KEY · ${workflow.key}` : '流程设计'}</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw size={16} />
            刷新设计器
          </Button>
          <Button variant="outline" onClick={() => navigate('/workflow/create')}>
            返回流程目录
          </Button>
        </div>
      </header>
    </div>
  );

  const pageContent = (
      <InnerTableSurface className="admin-workflow-designer-surface" wrapperClassName="admin-workflow-designer-wrapper">
        <WorkflowBuilder
          workflow={workflow}
          onChange={handleWorkflowChange}
          onSave={handleSaveWorkflow}
          availableForms={savedForms}
          availableRoles={availableRoles}
          availableUsers={availableUsers}
        />
      </InnerTableSurface>
  );

  return (
    <section className="admin-source-page admin-workflow-design-page">
      <TablePageLayout
        className="admin-workflow-design-layout"
        tableSurfaceClassName="admin-workflow-design-table-surface"
        actions={pageActions}
        table={pageContent}
      />
    </section>
  );
};
