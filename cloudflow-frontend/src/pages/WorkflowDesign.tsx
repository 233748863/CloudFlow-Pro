import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, GitMerge, Loader2 } from 'lucide-react';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { WorkflowDefinition, FormDefinition, User } from '../types';
import { Button } from '@/components/ui';
import {
  getProcessDefinition,
  getProcessDefinitions,
  saveProcessDefinition,
  getFormDefinitions,
} from '../services/api/workflow';
import { getRoleList, getUserList } from '../services/api/auth';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { normalizeWorkflowCategory } from '../utils/workflowCategory';
import { useAutoSave } from '../hooks/useAutoSave';
import { toast } from 'sonner';
import { logWorkflow } from '../lib/logger';
import {
  createDefaultWorkflowGraph,
  parseWorkflowGraphDefinition,
} from '../utils/workflowGraph';

type WorkflowDesignContextPayload = {
  forms: FormDefinition[];
  roles: any[];
  users: User[];
};

let workflowDesignContextCache: WorkflowDesignContextPayload | null = null;
let workflowDesignContextPromise: Promise<WorkflowDesignContextPayload> | null = null;
const processDefinitionPromiseCache = new Map<string, Promise<any | null>>();
let processDefinitionsListPromise: Promise<any[]> | null = null;

const StatusPanel: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ icon, title, description, actions }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
      {icon}
    </div>
    <div className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    {actions ? <div className="mt-5 flex justify-center gap-3">{actions}</div> : null}
  </div>
);

const loadWorkflowDesignContext = async (): Promise<WorkflowDesignContextPayload> => {
  if (workflowDesignContextCache) {
    return workflowDesignContextCache;
  }
  if (workflowDesignContextPromise) {
    return workflowDesignContextPromise;
  }

  workflowDesignContextPromise = Promise.all([
    getFormDefinitions().catch((err) => {
      logWorkflow.warn('鍔犺浇琛ㄥ崟鍒楄〃澶辫触:', err);
      toast.warning('表单列表加载失败，暂时无法绑定表单');
      return [];
    }),
    getRoleList().catch((err) => {
      logWorkflow.warn('鍔犺浇瑙掕壊鍒楄〃澶辫触:', err);
      toast.warning('角色列表加载失败，部分审批人配置不可用');
      return [];
    }),
    getUserList().catch((err) => {
      logWorkflow.warn('鍔犺浇鐢ㄦ埛鍒楄〃澶辫触:', err);
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
      workflowDesignContextCache = payload;
      return payload;
    })
    .finally(() => {
      workflowDesignContextPromise = null;
    });

  return workflowDesignContextPromise;
};

const loadProcessDefinitionById = async (definitionId: string): Promise<any | null> => {
  const normalizedId = definitionId.trim();
  if (!normalizedId) {
    return null;
  }

  const cachedPromise = processDefinitionPromiseCache.get(normalizedId);
  if (cachedPromise) {
    return cachedPromise;
  }

  const requestPromise = getProcessDefinition(normalizedId)
    .catch((err) => {
      logWorkflow.warn('鎸?ID 鍔犺浇娴佺▼澶辫触锛屽皾璇曞垪琛ㄥ厹搴?', err);
      return null;
    })
    .finally(() => {
      processDefinitionPromiseCache.delete(normalizedId);
    });

  processDefinitionPromiseCache.set(normalizedId, requestPromise);
  return requestPromise;
};

const loadProcessDefinitionsList = async (): Promise<any[]> => {
  if (processDefinitionsListPromise) {
    return processDefinitionsListPromise;
  }

  processDefinitionsListPromise = getProcessDefinitions()
    .catch((err) => {
      logWorkflow.warn('鍔犺浇娴佺▼瀹氫箟鍒楄〃澶辫触:', err);
      return [];
    })
    .finally(() => {
      processDefinitionsListPromise = null;
    });

  return processDefinitionsListPromise;
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
 * 缁熶竴鏄犲皠鍚庣娴佺▼鏁版嵁锛岀‘淇濊璁″櫒浣跨敤绋冲畾鐨?definitionId銆? */
const resolveDefinitionId = (w: any): string => {
  const rawId = w?.definitionId;
  if (rawId === undefined || rawId === null) {
    return '';
  }
  return String(rawId).trim();
};

/**
 * 瑙ｆ瀽淇濆瓨鎺ュ彛杩斿洖鐨?definitionId銆? * nodes+edges 閲嶆瀯鍚庝粎鎺ュ彈瀵硅薄缁撴瀯锛歿 id: string }銆? */
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

const mapBackendForms = (forms: any[]): FormDefinition[] =>
  forms.map((f: any) => {
    let fields: any[] = [];
    const raw =
      typeof f.fieldsJson === 'string'
        ? f.fieldsJson
        : typeof f.formSchema === 'string'
          ? f.formSchema
          : null;

    if (raw) {
      try {
        fields = JSON.parse(raw);
      } catch {
        try {
          const sanitized = raw.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
          fields = JSON.parse(sanitized);
        } catch (parseError) {
          logWorkflow.error('瑙ｆ瀽琛ㄥ崟瀛楁澶辫触:', parseError);
          fields = [];
        }
      }
    } else {
      fields = [];
    }

    return {
      id: f.formId,
      name: f.formName,
      fields,
    };
  });

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
 * 鑷姩淇濆瓨绛惧悕锛氬拷鐣?definitionId锛屼粎鍏虫敞娴佺▼鍐呭鏄惁鐪熸鍙樺寲銆? */
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
    <div className="flex min-h-[calc(100vh-260px)] items-center justify-center py-8">
      <div className="w-full max-w-3xl">{panel}</div>
    </div>
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
    const loadKey = requestedWorkflowId || '__default__';
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

  const handleSaveWorkflow = async (wf: WorkflowDefinition) => {
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
        icon={<Loader2 size={28} className="animate-spin text-cyan-600" />}
        title="正在加载流程设计器..."
        description="正在准备流程定义、表单列表和审批基础数据，请稍候。"
      />
    );
  }

  if (error) {
    return renderStatusShell(
      <StatusPanel
        icon={<AlertTriangle size={28} className="text-amber-500" />}
        title="流程设计数据加载失败"
        description={error}
        actions={
          <Button
            type="button"
            onClick={loadData}
            className="rounded-xl"
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
              className="rounded-xl"
            >
              重新加载
            </Button>
            <Button
              type="button"
              onClick={() => navigate('/workflow/create?mode=blank')}
              className="rounded-xl"
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
  const studioDescription = isNewWorkflow
    ? '当前处于空白设计模式，优先收口画布、节点和右侧属性面板的统一设计语法。'
    : '流程设计器已接入统一工作台壳层，这一轮继续收口工具栏、画布、节点和侧边配置面板。';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            Workflow Studio
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {studioTitle}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {studioDescription}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={loadData}>
            刷新设计器
          </Button>
          <Button variant="soft" onClick={() => navigate('/workflow/create')}>
            返回流程目录
          </Button>
        </div>
      </div>

      <div className="min-h-[calc(100vh-250px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/92">
        <WorkflowBuilder
          workflow={workflow}
          onChange={handleWorkflowChange}
          onSave={handleSaveWorkflow}
          availableForms={savedForms}
          availableRoles={availableRoles}
          availableUsers={availableUsers}
        />
      </div>
    </div>
  );
};
