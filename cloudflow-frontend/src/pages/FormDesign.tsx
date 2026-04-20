import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileSpreadsheet, GitMerge, Rocket, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { FormBuilder } from '../components/FormBuilder';
import { EmptyError, EmptyForms, SkeletonForm, Button } from '@/components/ui';
import { useMount } from '../hooks/useMount';
import { useAutoSave } from '../hooks/useAutoSave';
import { getFormDefinitions, saveFormDefinition } from '../services/api/workflow';
import { logForm } from '../lib/logger';
import { FormDefinition } from '../types';

const NEW_FORM_NAME = '新表单';

const PanelCard: React.FC<{
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, aside, children }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
      <div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
    {children}
  </section>
);

const SummaryCard: React.FC<{
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex items-center justify-between gap-3">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
        {icon}
      </div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
    </div>
    <div className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
  </div>
);

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

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
}> = ({ title, description, icon }) => (
  <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
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
      <div className="space-y-4">
        <PanelCard title="表单设计器" description="正在准备表单列表和编辑器。">
          <div className="px-4 py-4">
            <SkeletonForm fields={5} />
          </div>
        </PanelCard>
      </div>
    );
  }

  if (error) {
    return (
      <StatusPanel
        icon={<FileSpreadsheet size={28} />}
        title="加载表单失败"
        description={error}
        actions={<EmptyError onRetry={loadForms} />}
      />
    );
  }

  if (!selectedForm) {
    return (
      <StatusPanel
        icon={<FileSpreadsheet size={28} />}
        title="还没有可编辑的表单"
        description="先创建一个表单，再进入右侧设计器进行字段配置。"
        actions={<EmptyForms onCreate={handleCreateNew} />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        <SummaryCard
          label="表单总数"
          value={forms.length}
          hint="当前系统中可编辑的表单数量"
          icon={<FileSpreadsheet className="h-[18px] w-[18px]" />}
        />
        <SummaryCard
          label="当前表单"
          value={selectedForm.name}
          hint="右侧设计器当前编辑对象"
          icon={<Sparkles className="h-[18px] w-[18px]" />}
        />
        <SummaryCard
          label="字段数量"
          value={selectedForm.fields.length}
          hint="用于判断表单复杂度"
          icon={<GitMerge className="h-[18px] w-[18px]" />}
        />
        <SummaryCard
          label="保存策略"
          value="自动 + 手动"
          hint="支持自动保存和显式保存"
          icon={<Rocket className="h-[18px] w-[18px]" />}
        />
      </div>

      <PanelCard
        title="表单设计"
        description="统一管理表单列表、字段编辑和后续流程绑定，把设计器入口纳入同一套轻量工作台语法。"
        aside={
          <Button onClick={handleCreateNew}>
            <Sparkles className="h-4 w-4" />
            新建表单
          </Button>
        }
      >
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <PanelCard
              title="表单列表"
              description="切换当前编辑对象，并快速进入后续绑定或发起流程。"
            >
              <div className="space-y-4 px-4 py-4">
                <div className="space-y-2">
                  {forms.length === 0 ? (
                    <InlineState
                      icon={<FileSpreadsheet className="h-5 w-5" />}
                      title="暂无表单"
                      description="点击上方新建后，这里会显示可编辑的表单列表。"
                    />
                  ) : (
                    forms.map((form) => {
                      const active = selectedForm.id === form.id;
                      return (
                        <button
                          key={form.id}
                          type="button"
                          onClick={() => setSelectedForm(form)}
                          className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                            active
                              ? 'border border-cyan-100 bg-cyan-50 text-cyan-700 shadow-sm dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200'
                              : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-200 dark:hover:bg-slate-900/80'
                          }`}
                        >
                          <div className="truncate text-sm font-semibold">{form.name}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {form.fields.length} 个字段
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                    下一步
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => navigate('/workflow')}
                  >
                    <span className="inline-flex items-center gap-2">
                      <GitMerge size={14} />
                      绑定到流程
                    </span>
                    <ArrowRight size={12} />
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-between"
                    onClick={() => navigate('/workplace')}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Rocket size={14} />
                      发起流程
                    </span>
                    <ArrowRight size={12} />
                  </Button>
                </div>
              </div>
            </PanelCard>

            <PanelCard
              title="表单编辑器"
              description="保留原有 FormBuilder 编辑逻辑，统一外层工作台壳层和比例。"
            >
              <div className="min-h-[40rem] px-4 py-4">
                <FormBuilder
                  key={selectedForm.id}
                  onSave={handleSaveForm}
                  initialForm={selectedForm}
                />
              </div>
            </PanelCard>
          </div>
        </div>
      </PanelCard>
    </div>
  );
};
