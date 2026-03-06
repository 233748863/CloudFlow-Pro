import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { WorkflowDefinition, NodeType, FormDefinition, User } from '../types';
import {
  getProcessDefinition,
  getProcessDefinitions,
  saveProcessDefinition,
  getFormDefinitions,
} from '../services/api/workflow';
import { getRoleList, getUserList } from '../services/api/auth';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { useAutoSave } from '../hooks/useAutoSave';
import { SkeletonForm } from '../components/ui/Skeleton';
import { EmptyWorkflows, EmptyError } from '../components/ui/EmptyState';
import { toast } from 'sonner';
import { logWorkflow } from '../lib/logger';
import {
  convertGraphToWorkflowTree,
  convertWorkflowTreeToGraph,
  parseWorkflowGraphDefinition,
} from '../utils/workflowGraph';

const createDefaultWorkflow = (): WorkflowDefinition => ({
  id: `new_${Date.now()}`,
  name: '新流程',
  key: 'new_process',
  version: 1,
  nodes: { type: NodeType.START, title: '开始', id: 'start' },
});

/**
 * 解析流程节点定义。
 * 仅接受合法的 nodes+edges 图模型，异常时直接抛错。
 */
const parseWorkflowNodes = (raw: unknown, workflowName: string) => {
  const graph = parseWorkflowGraphDefinition(raw);
  if (!graph) {
    throw new Error(`流程 "${workflowName}" 的 modelJson 不是合法的 nodes+edges 图模型`);
  }
  return convertGraphToWorkflowTree(graph);
};

/**
 * 统一映射后端流程数据，确保设计器使用稳定的 definitionId。
 */
const resolveDefinitionId = (w: any): string => {
  const rawId = w?.definitionId ?? w?.id;
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
  id: resolveDefinitionId(w) || `new_${Date.now()}`,
  name: w?.processName || w?.name || '未命名流程',
  key: w?.processKey || w?.key || 'new_process',
  version: Number(w?.version || 1),
  formId: w?.formId,
  nodes: parseWorkflowNodes(w?.modelJson, w?.processName || w?.name || '未命名流程'),
  description: w?.description,
  category: w?.category,
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
          logWorkflow.error('解析表单字段失败:', parseError);
          fields = [];
        }
      }
    } else {
      fields = f.fields || f.fieldsJson || [];
    }

    return {
      id: f.id || f.formId,
      name: f.name || f.formName,
      fields,
    };
  });

const buildWorkflowSavePayload = (wf: WorkflowDefinition) => ({
  definitionId: wf.id.startsWith('new_') ? undefined : wf.id,
  processName: wf.name,
  processKey: wf.key,
  formId: wf.formId,
  modelJson: JSON.stringify(convertWorkflowTreeToGraph(wf.nodes)),
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
    modelJson: JSON.stringify(convertWorkflowTreeToGraph(wf.nodes)),
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

  const syncWorkflowIdToUrl = useCallback(
    (definitionId: string) => {
      if (!definitionId) return;
      if (searchParams.get('id') === definitionId) return;

      const nextParams = new URLSearchParams(searchParams);
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
      // 设计器可能在异步保存后短暂回传旧 definitionId；已持久化流程始终以父状态 id 为准，避免回滚触发循环请求
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

      // 避免编辑器回传“等价快照”导致父状态抖动，进而触发自动保存误判
      if (sameId && sameContent) {
        return prev;
      }
      return normalizedNext;
    });
  }, []);

  const loadData = useCallback(async () => {
    const loadKey = requestedWorkflowId || '__default__';
    if (inFlightLoadKeyRef.current === loadKey) {
      return;
    }
    // URL 同步引起的同 ID 重入不再重复请求后端
    if (requestedWorkflowId && workflowIdRef.current === requestedWorkflowId) {
      return;
    }
    inFlightLoadKeyRef.current = loadKey;
    const currentLoadSeq = ++loadSequenceRef.current;
    try {
      setLoading(true);
      setError(null);

      // 基础上下文（表单/角色/用户）在设计页生命周期内只加载一次，避免切换流程时重复请求。
      if (!contextLoadedRef.current) {
        const [forms, roles, users] = await Promise.all([
          getFormDefinitions().catch((err) => {
            logWorkflow.warn('加载表单列表失败:', err);
            toast.warning('表单列表加载失败，暂时无法绑定表单');
            return [];
          }),
          getRoleList().catch((err) => {
            logWorkflow.warn('加载角色列表失败:', err);
            toast.warning('角色列表加载失败，部分审批人配置不可用');
            return [];
          }),
          getUserList().catch((err) => {
            logWorkflow.warn('加载用户列表失败:', err);
            toast.warning('用户列表加载失败，部分审批人配置不可用');
            return [];
          }),
        ]);
        if (currentLoadSeq !== loadSequenceRef.current) {
          return;
        }

        if (Array.isArray(forms)) {
          setSavedForms(mapBackendForms(forms));
        }
        if (Array.isArray(roles)) setAvailableRoles(roles);
        if (Array.isArray(users)) setAvailableUsers(users.map(mapBackendUserToFrontend));
        contextLoadedRef.current = true;
      }

      // 先按 URL id 精确加载，避免串流程
      let selectedWorkflow: any = null;
      if (requestedWorkflowId) {
        try {
          selectedWorkflow = await getProcessDefinition(requestedWorkflowId);
        } catch (err) {
          logWorkflow.warn('按 ID 加载流程失败，尝试列表兜底:', err);
        }
      }

      // 兜底：从列表中匹配，仍找不到则回退到第一条
      if (!selectedWorkflow) {
        const workflows = await getProcessDefinitions().catch(() => []);
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
        toast.warning('检测到流程缺少定义ID，已切换为新建模式以避免误覆盖');
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
  }, [requestedWorkflowId]);

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

  // 自动保存：仅对已持久化流程启用
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
          // 自动保存只更新本地ID，不触发URL变更，避免“URL同步 -> 重新加载 -> 再次自动保存”循环。
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

  if (loading) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <SkeletonForm fields={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
        <EmptyError onRetry={loadData} />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
        <EmptyWorkflows onCreate={loadData} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
      <WorkflowBuilder
        workflow={workflow}
        onChange={handleWorkflowChange}
        onSave={handleSaveWorkflow}
        availableForms={savedForms}
        availableRoles={availableRoles}
        availableUsers={availableUsers}
      />
    </div>
  );
};
