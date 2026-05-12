import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileSpreadsheet, GitMerge, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { FormBuilder } from '../components/FormBuilder';
import { EmptyError, EmptyForms, SkeletonForm, Button } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { cn } from '@/utils/cn';
import { useMount } from '../hooks/useMount';
import { useAutoSave } from '../hooks/useAutoSave';
import { getFormDefinitions, saveFormDefinition } from '../services/api/workflow';
import { logForm } from '../lib/logger';
import { FormDefinition } from '../types';

const NEW_FORM_NAME = '新表单';

const StatusPanel: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ icon, title, description, actions }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
      {icon}
    </div>
    <div className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
    {actions ? <div className="mt-5 flex justify-center gap-3">{actions}</div> : null}
  </div>
);

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
}> = ({ title, description, icon }) => (
  <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
    {icon ? <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div> : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </div>
    ) : null}
  </div>
);

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
        const mapped = formList.map((item: any) => {
          let fields = item.fields || [];

          if (typeof item.fieldsJson === 'string') {
            try {
              fields = JSON.parse(item.fieldsJson);
            } catch (parseErr) {
              try {
                const sanitized = item.fieldsJson.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
                fields = JSON.parse(sanitized);
              } catch {
                logForm.warn(`表单 ${item.formId || item.id} 的 fieldsJson 解析失败，使用空字段`, parseErr);
                fields = [];
              }
            }
          } else if (item.fieldsJson) {
            fields = item.fieldsJson;
          }

          return {
            id: item.id || item.formId,
            name: item.name || item.formName,
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
      const savedId = result?.id || result?.formId;

      if (savedId) {
        const updatedForm = { ...form, id: savedId };
        setSelectedForm(updatedForm);

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
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">表单设计</div>
        </div>
        <div className="px-4 py-4">
          <SkeletonForm fields={5} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <StatusPanel
        icon={<FileSpreadsheet size={24} />}
        title="加载表单失败"
        description={error}
        actions={<EmptyError onRetry={loadForms} />}
      />
    );
  }

  if (!selectedForm) {
    return (
      <StatusPanel
        icon={<FileSpreadsheet size={24} />}
        title="暂无可编辑表单"
        actions={<EmptyForms onCreate={handleCreateNew} />}
      />
    );
  }

  return (
    <TablePageLayout
      className="gap-3"
      filters={
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">表单设计</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              共 {forms.length} 个 · 当前 {selectedForm.name} · {selectedForm.fields.length} 字段
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/workflow')}>
              <GitMerge className="h-4 w-4" />
              绑定流程
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4" />
              新建表单
            </Button>
          </div>
        </div>
      }
      table={(<TableSurfaceCard><div className="grid min-h-full xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 dark:border-slate-800 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">表单列表</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">{forms.length}</div>
            </div>

            <div className="space-y-2 p-3">
              {forms.length === 0 ? (
                <InlineState
                  icon={<FileSpreadsheet className="h-5 w-5" />}
                  title="暂无表单"
                />
              ) : (
                forms.map((form) => {
                  const active = selectedForm.id === form.id;
                  return (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => setSelectedForm(form)}
                      className={cn(
                        'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                        active
                          ? 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-200 dark:hover:bg-slate-900/80',
                      )}
                    >
                      <div className="truncate text-sm font-medium">{form.name}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {form.fields.length} 个字段
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="min-h-[42rem] p-3 sm:p-4">
            <FormBuilder
              key={selectedForm.id}
              onSave={handleSaveForm}
              initialForm={selectedForm}
            />
          </section>
        </div></TableSurfaceCard>)}
    />
  );
};
