import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileSpreadsheet, GitMerge, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { FormBuilder } from '../components/FormBuilder';
import {
  EmptyError,
  EmptyForms,
  SkeletonForm,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { useMount } from '../hooks/useMount';
import { useAutoSave } from '../hooks/useAutoSave';
import { getFormDefinitions, saveFormDefinition } from '../services/api/workflow';
import { logForm } from '../lib/logger';
import { FormDefinition } from '../types';
import { mapBackendFormDefinitions } from '@/utils/formDefinition';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const NEW_FORM_NAME = '新表单';

const StatusPanel: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ icon, title, description, actions }) => (
  <section className="admin-source-page">
    <InnerTableSurface wrapperClassName="p-0">
      <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="admin-source-stat-icon text-cf-subtle">
          {icon}
        </div>
        <div className="mt-4 text-lg font-semibold text-cf-title">{title}</div>
        {description ? (
          <div className="mt-2 text-sm leading-6 text-cf-subtle">{description}</div>
        ) : null}
        {actions ? <div className="mt-5 flex justify-center gap-3">{actions}</div> : null}
      </div>
    </InnerTableSurface>
  </section>
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
        const mapped = mapBackendFormDefinitions(formList);

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
      <section className="admin-source-page">
        <InnerTableSurface className="form-design-workbench" wrapperClassName="flex min-h-0 flex-col p-0">
          <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <strong>表单设计</strong>
              <span>正在加载表单定义</span>
            </div>
          </div>
          <div className="p-4">
            <SkeletonForm fields={5} />
          </div>
        </InnerTableSurface>
      </section>
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

  const statCards = [
    { label: '表单总数', value: String(forms.length), detail: '可编辑定义', icon: FileSpreadsheet, tone: 'blue' },
    { label: '当前字段', value: String(selectedForm.fields.length), detail: selectedForm.name, icon: FileSpreadsheet, tone: 'green' },
    { label: '当前表单', value: selectedForm.id.startsWith('new_') ? '新建' : '已保存', detail: selectedForm.id.startsWith('new_') ? '待首次保存' : selectedForm.id, icon: Plus, tone: 'amber' },
    { label: '流程绑定', value: '入口', detail: '工作流设计中心', icon: GitMerge, tone: 'violet' },
  ];
  const formOptions = forms.some((form) => form.id === selectedForm.id)
    ? forms
    : [selectedForm, ...forms];

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">FORM DESIGN</p>
          <h2>表单设计</h2>
          <span>维护流程表单定义、字段结构和流程绑定入口</span>
        </div>
        <div className="admin-source-controls">
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
      </header>

      <section className="admin-source-stat-grid">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon"><Icon size={18} /></div>
              <div>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.detail}</span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-toolbar-filter-grid [--admin-toolbar-filter-count:1]">
        <label className="min-w-0">
          <span className="input-label">当前表单</span>
          <Select
            value={selectedForm.id}
            onValueChange={(value) => {
              const nextForm = formOptions.find((form) => form.id === value);
              if (nextForm) {
                setSelectedForm(nextForm);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择表单" />
            </SelectTrigger>
            <SelectContent>
              {formOptions.map((form) => (
                <SelectItem key={form.id} value={form.id} label={form.name}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="truncate">{form.name}</span>
                    <span className="text-xs text-cf-faint">{form.fields.length} 字段</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="min-w-0">
          <span className="input-label">设计上下文</span>
          <div className="admin-users-filter-count truncate">
            共 {forms.length} 个 / 当前 {selectedForm.name} / {selectedForm.fields.length} 字段
          </div>
        </div>

        <div className="admin-users-toolbar-actions">
          <Button type="button" variant="outline" size="sm" onClick={handleCreateNew}>
            <Plus className="h-4 w-4" />
            新建表单
          </Button>
        </div>
      </div>
    </section>
  );

  const pageContent = (
    <InnerTableSurface
      className="form-design-workbench flex min-h-0 flex-1 flex-col overflow-hidden"
      wrapperClassName="flex min-h-0 flex-1 flex-col p-0"
    >
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          <strong>{selectedForm.name}</strong>
          <span>{selectedForm.fields.length} 个字段 · 设计画布</span>
        </div>
      </div>
      <div className="min-h-[42rem] overflow-auto">
        <FormBuilder
          key={selectedForm.id}
          onSave={handleSaveForm}
          initialForm={selectedForm}
        />
      </div>
    </InnerTableSurface>
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
    </section>
  );
};
