import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const createDefaultWorkflow = (): WorkflowDefinition => ({
  id: `new_${Date.now()}`,
  name: '新流程',
  key: 'new_process',
  version: 1,
  nodes: { type: NodeType.START, title: '开始', id: 'start' },
});

/**
 * 解析流程节点定义。
 * 支持对象与 JSON 字符串，解析失败时返回默认开始节点。
 */
const parseWorkflowNodes = (raw: unknown) => {
  if (raw && typeof raw === 'object') {
    return raw as WorkflowDefinition['nodes'];
  }

  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw) as WorkflowDefinition['nodes'];
    } catch {
      // 兼容后端偶发的非法转义
      try {
        const sanitized = raw.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
        return JSON.parse(sanitized) as WorkflowDefinition['nodes'];
      } catch {
        return { type: NodeType.START, title: '开始', id: 'start' };
      }
    }
  }

  return { type: NodeType.START, title: '开始', id: 'start' };
};

/**
 * 统一映射后端流程数据，确保设计器使用稳定的 definitionId。
 */
const mapBackendWorkflow = (w: any): WorkflowDefinition => ({
  id: String(w?.definitionId || w?.id || w?.processKey || `wf_${Date.now()}`),
  name: w?.processName || w?.name || '未命名流程',
  key: w?.processKey || w?.key || 'new_process',
  version: Number(w?.version || 1),
  formId: w?.formId,
  nodes: parseWorkflowNodes(w?.nodes ?? w?.modelJson),
  description: w?.description,
  category: w?.category,
  tags: typeof w?.tags === 'string' ? w.tags : w?.tags ? JSON.stringify(w.tags) : undefined,
  startPermissionType: w?.startPermissionType,
  startPermissionValue: w?.startPermissionValue,
  deptId: w?.deptId,
});

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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [forms, roles, users] = await Promise.all([
        getFormDefinitions().catch(() => []),
        getRoleList().catch(() => []),
        getUserList().catch(() => []),
      ]);

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
        if (Array.isArray(workflows) && workflows.length > 0) {
          if (requestedWorkflowId) {
            selectedWorkflow = workflows.find((item: any) => {
              const id = String(item?.definitionId || item?.id || item?.processKey || '');
              return id === requestedWorkflowId;
            });
          } else {
            selectedWorkflow = workflows[0];
          }
        }
      }

      if (!selectedWorkflow && requestedWorkflowId) {
        toast.warning('指定流程不存在或已失效，已切换到新建流程');
      }

      setWorkflow(selectedWorkflow ? mapBackendWorkflow(selectedWorkflow) : createDefaultWorkflow());

      if (Array.isArray(forms)) {
        const mapped = forms.map((f: any) => {
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
        setSavedForms(mapped);
      }

      if (Array.isArray(roles)) setAvailableRoles(roles);
      if (Array.isArray(users)) setAvailableUsers(users.map(mapBackendUserToFrontend));
    } catch (err) {
      logWorkflow.error('加载数据失败:', err);
      setError(err instanceof Error ? err.message : '加载数据失败');
      toast.error('加载数据失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [requestedWorkflowId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!workflow?.id || workflow.id.startsWith('new_')) {
      return;
    }
    syncWorkflowIdToUrl(workflow.id);
  }, [workflow?.id, syncWorkflowIdToUrl]);

  const handleSaveWorkflow = async (wf: WorkflowDefinition) => {
    try {
      if (!wf.key || wf.key === 'new_process') {
        throw new Error('流程Key不能为空或使用默认值，请设置有效的流程Key');
      }

      const payload = {
        definitionId: wf.id.startsWith('new_') ? undefined : wf.id,
        processName: wf.name,
        processKey: wf.key,
        formId: wf.formId,
        modelJson: JSON.stringify(wf.nodes),
        description: wf.description,
        category: wf.category,
        tags: wf.tags,
        startPermissionType: wf.startPermissionType,
        startPermissionValue: wf.startPermissionValue,
        deptId: wf.deptId,
      };

      logWorkflow.info('保存流程:', payload.processName);
      const result = await saveProcessDefinition(payload);

      if (result && result.id && wf.id !== result.id) {
        const nextId = String(result.id);
        setWorkflow((prev) => (prev ? { ...prev, id: nextId } : prev));
        syncWorkflowIdToUrl(nextId);
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
        const payload = {
          definitionId: wf.id.startsWith('new_') ? undefined : wf.id,
          processName: wf.name,
          processKey: wf.key,
          formId: wf.formId,
          modelJson: JSON.stringify(wf.nodes),
          description: wf.description,
          category: wf.category,
          tags: wf.tags,
          startPermissionType: wf.startPermissionType,
          startPermissionValue: wf.startPermissionValue,
          deptId: wf.deptId,
        };
        const result = await saveProcessDefinition(payload);
        if (result && result.id && wf.id !== result.id) {
          // 自动保存仅同步 URL，避免因 definitionId 变化触发新的自动保存循环
          syncWorkflowIdToUrl(String(result.id));
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
        onChange={setWorkflow}
        onSave={handleSaveWorkflow}
        availableForms={savedForms}
        availableRoles={availableRoles}
        availableUsers={availableUsers}
      />
    </div>
  );
};
