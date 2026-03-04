import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, GitMerge, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { FormBuilder } from '../components/FormBuilder';
import { SkeletonForm } from '../components/ui/Skeleton';
import { EmptyForms, EmptyError } from '../components/ui/EmptyState';
import { useMount } from '../hooks/useMount';
import { useAutoSave } from '../hooks/useAutoSave';
import { getFormDefinitions, saveFormDefinition } from '../services/api/workflow';
import { logForm } from '../lib/logger';
import { FormDefinition } from '../types';

const NEW_FORM_NAME = '新表单';

export const FormDesign = () => {
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [selectedForm, setSelectedForm] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadForms = async () => {
    try {
      setLoading(true);
      setError(null);

      const formList = await getFormDefinitions();
      if (Array.isArray(formList)) {
        const mapped = formList.map((f: any) => {
          let fields = f.fields || [];
          if (typeof f.fieldsJson === 'string') {
            try {
              fields = JSON.parse(f.fieldsJson);
            } catch (parseErr) {
              // 兼容历史脏数据中的非法转义字符，避免整个列表加载失败
              try {
                const sanitized = f.fieldsJson.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
                fields = JSON.parse(sanitized);
              } catch {
                logForm.warn(`表单 ${f.formId || f.id} 的 fieldsJson 解析失败，使用空字段`, parseErr);
                fields = [];
              }
            }
          } else if (f.fieldsJson) {
            fields = f.fieldsJson;
          }

          return {
            id: f.id || f.formId,
            name: f.name || f.formName,
            fields,
          } as FormDefinition;
        });

        setForms(mapped);
        if (mapped.length > 0) {
          setSelectedForm(mapped[0]);
        } else {
          setSelectedForm({
            id: `new_${Date.now()}`,
            name: NEW_FORM_NAME,
            fields: [],
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

  const handleSaveForm = async (form: FormDefinition, options?: { silent?: boolean }) => {
    try {
      const payload = {
        formId: form.id.startsWith('new_') ? undefined : form.id,
        formName: form.name,
        fieldsJson: JSON.stringify(form.fields),
      };

      const result: any = await saveFormDefinition(payload as any);

      // 兼容后端返回 string(formId) 和 object({ id/formId }) 两种格式
      const savedId =
        typeof result === 'string'
          ? result
          : (result as any)?.id || (result as any)?.formId;

      if (savedId) {
        const updatedForm = { ...form, id: savedId };
        setSelectedForm(updatedForm);

        // 函数式更新避免并发保存导致的状态覆盖
        setForms((prevForms) => {
          const index = prevForms.findIndex((item) => item.id === form.id);
          if (index >= 0) {
            const next = [...prevForms];
            next[index] = updatedForm;
            return next;
          }
          return [...prevForms, updatedForm];
        });
      }

      if (!options?.silent) {
        toast.success('表单保存成功');
      }
    } catch (err) {
      logForm.error('保存表单失败:', err);
      toast.error(err instanceof Error ? err.message : '表单保存失败');
      throw err;
    }
  };

  useAutoSave(
    selectedForm,
    async (form) => {
      if (form && form.name && form.name !== NEW_FORM_NAME) {
        await handleSaveForm(form, { silent: true });
      }
    },
    {
      delay: 3000,
      enabled: !!selectedForm && !selectedForm.id.startsWith('new_'),
      resetKey: selectedForm?.id,
      onSuccess: () => logForm.info('表单自动保存成功'),
      onError: (err) => logForm.error('表单自动保存失败:', err),
    },
  );

  const handleCreateNew = () => {
    setSelectedForm({
      id: `new_${Date.now()}`,
      name: NEW_FORM_NAME,
      fields: [],
    });
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <SkeletonForm fields={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
        <EmptyError onRetry={loadForms} />
      </div>
    );
  }

  if (!selectedForm) {
    return (
      <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
        <EmptyForms onCreate={handleCreateNew} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] flex gap-4">
      <div className="w-64 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">表单列表</h3>
          <button
            onClick={handleCreateNew}
            className="px-3 py-1 text-sm bg-pink-500 text-white rounded hover:bg-pink-600 transition-colors"
          >
            新建
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {forms.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">暂无表单</p>
          ) : (
            forms.map((form) => (
              <button
                key={form.id}
                onClick={() => setSelectedForm(form)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedForm.id === form.id
                    ? 'bg-pink-50 text-pink-600 border border-pink-100'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="font-medium truncate">{form.name}</div>
                <div className="text-xs text-slate-500 mt-1">{form.fields.length} 个字段</div>
              </button>
            ))
          )}
        </div>

        <div className="pt-3 mt-3 border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-400 font-medium">下一步</p>
          <button
            onClick={() => navigate('/workflow')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-pink-500 bg-pink-50 hover:bg-pink-50 rounded-lg transition-colors text-left"
          >
            <GitMerge size={14} />
            <span className="flex-1">绑定到流程</span>
            <ArrowRight size={12} />
          </button>
          <button
            onClick={() => navigate('/workplace')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors text-left"
          >
            <Rocket size={14} />
            <span className="flex-1">发起流程</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1">
        <FormBuilder key={selectedForm.id} onSave={handleSaveForm} initialForm={selectedForm} />
      </div>
    </div>
  );
};
