import React, { useState } from 'react';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { WorkflowDefinition, NodeType, FormDefinition, User } from '../types';
import { getProcessDefinitions, saveProcessDefinition, getFormDefinitions } from '../services/api/workflow';
import { getRoleList, getUserList } from '../services/api/auth';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { useMount } from '../hooks/useMount';
import { useAutoSave } from '../hooks/useAutoSave';
import { SkeletonForm } from '../components/ui/Skeleton';
import { EmptyWorkflows, EmptyError } from '../components/ui/EmptyState';
import { toast } from 'sonner';
import { logWorkflow } from '../lib/logger';

export const WorkflowDesign = () => {
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 并行加载所有数据
      const [workflows, forms, roles, users] = await Promise.all([
        getProcessDefinitions().catch(() => []),
        getFormDefinitions().catch(() => []),
        getRoleList().catch(() => []),
        getUserList().catch(() => [])
      ]);

      // 处理流程定义
      if (Array.isArray(workflows) && workflows.length > 0) {
        const w = workflows[0];
        setWorkflow({
          id: w.id || w.definitionId || w.processKey || `wf_${Date.now()}`,
          name: w.name || w.processName || '未命名流程',
          key: w.key || w.processKey || 'new_process',
          version: w.version || 1,
          formId: w.formId,
          nodes: w.nodes || (w.modelJson ? JSON.parse(w.modelJson) : { type: NodeType.START, title: '开始', id: 'start' })
        });
      } else {
        // 创建新流程
        setWorkflow({
          id: `new_${Date.now()}`,
          name: '新流程',
          key: 'new_process',
          version: 1,
          nodes: { type: NodeType.START, title: '开始', id: 'start' }
        });
      }

      // 处理表单定义
      if (Array.isArray(forms)) {
        const mapped = forms.map((f: any) => ({
          id: f.id || f.formId,
          name: f.name || f.formName,
          fields: typeof f.fieldsJson === 'string' ? JSON.parse(f.fieldsJson) : (f.fields || f.fieldsJson || [])
        }));
        setSavedForms(mapped);
      }

      // 处理角色和用户
      if (Array.isArray(roles)) setAvailableRoles(roles);
      if (Array.isArray(users)) setAvailableUsers(users.map(mapBackendUserToFrontend));

    } catch (err) {
      logWorkflow.error('加载数据失败:', err);
      setError(err instanceof Error ? err.message : '加载数据失败');
      toast.error('加载数据失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useMount(() => {
    loadData();
  });

  const handleSaveWorkflow = async (wf: WorkflowDefinition) => {
    try {
      // 统一 ID 生成策略：新流程不传 ID，由后端生成
      const payload = {
        id: wf.id.startsWith('new_') ? undefined : wf.id,
        name: wf.name,
        key: wf.key,
        formId: wf.formId,
        nodes: wf.nodes
      };
      
      logWorkflow.info('保存流程:', payload.name);
      const result = await saveProcessDefinition(payload);
      
      // 保存成功后更新流程 ID
      if (result && result.id) {
        setWorkflow({ ...wf, id: result.id });
      }
      
      toast.success('流程保存成功');
    } catch (err) {
      logWorkflow.error('保存流程失败:', err);
      toast.error(err instanceof Error ? err.message : '流程保存失败');
      throw err;
    }
  };

  // 自动保存功能（3秒防抖）
  useAutoSave(
    workflow,
    async (wf) => {
      if (wf && wf.name && wf.name !== '新流程') {
        await handleSaveWorkflow(wf);
      }
    },
    {
      delay: 3000,
      enabled: !!workflow && !workflow.id.startsWith('new_'),
      onSuccess: () => logWorkflow.info('流程自动保存成功'),
      onError: (err) => logWorkflow.error('流程自动保存失败:', err),
    }
  );

  // Loading 状态
  if (loading) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <SkeletonForm fields={6} />
      </div>
    );
  }

  // Error 状态
  if (error) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
        <EmptyError onRetry={loadData} />
      </div>
    );
  }

  // 无流程状态（理论上不会出现，因为会自动创建新流程）
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
