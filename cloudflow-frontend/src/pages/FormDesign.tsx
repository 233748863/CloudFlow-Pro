import React, { useState } from 'react';
import { FormBuilder } from '../components/FormBuilder';
import { FormDefinition } from '../types';
import { getFormDefinitions, saveFormDefinition } from '../services/api/workflow';
import { useMount } from '../hooks/useMount';
import { useAutoSave } from '../hooks/useAutoSave';
import { SkeletonForm } from '../components/ui/Skeleton';
import { EmptyForms, EmptyError } from '../components/ui/EmptyState';
import { toast } from 'sonner';
import { logForm } from '../lib/logger';

export const FormDesign = () => {
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [selectedForm, setSelectedForm] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadForms = async () => {
    try {
      setLoading(true);
      setError(null);

      const formList = await getFormDefinitions();
      
      if (Array.isArray(formList)) {
        const mapped = formList.map((f: any) => ({
          id: f.id || f.formId,
          name: f.name || f.formName,
          fields: typeof f.fieldsJson === 'string' ? JSON.parse(f.fieldsJson) : (f.fields || f.fieldsJson || [])
        }));
        setForms(mapped);
        
        // 默认选择第一个表单，如果没有则创建新表单
        if (mapped.length > 0) {
          setSelectedForm(mapped[0]);
        } else {
          setSelectedForm({
            id: `new_${Date.now()}`,
            name: '新表单',
            fields: []
          });
        }
      }
    } catch (err) {
      logForm.error('加载表单失败:', err);
      setError(err instanceof Error ? err.message : '加载表单失败');
      toast.error('加载表单失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useMount(() => {
    loadForms();
  });

  const handleSaveForm = async (form: FormDefinition) => {
    try {
      // 统一 ID 生成策略：新表单不传 ID，由后端生成
      // 重要：将 fields 数组序列化为 JSON 字符串，匹配后端的 fieldsJson 字段
      const payload = {
        formId: form.id.startsWith('new_') ? undefined : form.id,
        formName: form.name,
        fieldsJson: JSON.stringify(form.fields) // 序列化为 JSON 字符串
      };
      
      const result = await saveFormDefinition(payload);
      
      // 保存成功后更新表单 ID 和列表
      if (result && result.id) {
        const updatedForm = { ...form, id: result.id };
        setSelectedForm(updatedForm);
        
        // 更新表单列表
        const existingIndex = forms.findIndex(f => f.id === form.id);
        if (existingIndex >= 0) {
          const newForms = [...forms];
          newForms[existingIndex] = updatedForm;
          setForms(newForms);
        } else {
          setForms([...forms, updatedForm]);
        }
      }
      
      toast.success('表单保存成功');
    } catch (err) {
      logForm.error('保存表单失败:', err);
      toast.error(err instanceof Error ? err.message : '表单保存失败');
      throw err;
    }
  };

  // 自动保存功能（3秒防抖）
  useAutoSave(
    selectedForm,
    async (form) => {
      if (form && form.name && form.name !== '新表单') {
        await handleSaveForm(form);
      }
    },
    {
      delay: 3000,
      enabled: !!selectedForm && !selectedForm.id.startsWith('new_'),
      onSuccess: () => logForm.info('表单自动保存成功'),
      onError: (err) => logForm.error('表单自动保存失败:', err),
    }
  );

  const handleCreateNew = () => {
    const newForm: FormDefinition = {
      id: `new_${Date.now()}`,
      name: '新表单',
      fields: []
    };
    setSelectedForm(newForm);
  };

  // Loading 状态
  if (loading) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <SkeletonForm fields={5} />
      </div>
    );
  }

  // Error 状态
  if (error) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
        <EmptyError onRetry={loadForms} />
      </div>
    );
  }

  // 无表单状态
  if (!selectedForm) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
        <EmptyForms onCreate={handleCreateNew} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] flex gap-4">
      {/* 表单列表侧边栏 */}
      <div className="w-64 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">表单列表</h3>
          <button
            onClick={handleCreateNew}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            新建
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2">
          {forms.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">暂无表单</p>
          ) : (
            forms.map(form => (
              <button
                key={form.id}
                onClick={() => setSelectedForm(form)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedForm.id === form.id
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="font-medium truncate">{form.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {form.fields.length} 个字段
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 表单设计器 */}
      <div className="flex-1">
        <FormBuilder 
          key={selectedForm.id} 
          onSave={handleSaveForm} 
          initialForm={selectedForm} 
        />
      </div>
    </div>
  );
};
