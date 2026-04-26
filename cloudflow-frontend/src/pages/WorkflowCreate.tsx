import React from 'react';
import { ArrowRight, Layers3, PenTool } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { Button } from '@/components/common';

type CreationDetail = {
  label: string;
  value: string;
};

type CreationOption = {
  id: 'template' | 'blank';
  title: string;
  description?: string;
  details: CreationDetail[];
  actionLabel: string;
  actionVariant: 'outline' | 'contrast';
  iconClassName: string;
  icon: React.ComponentType<{ className?: string }>;
};

const creationOptions: CreationOption[] = [
  {
    id: 'template',
    title: '从模板创建',
    details: [
      { label: '适用', value: '复用成熟流程' },
      { label: '入口', value: '模板中心' },
      { label: '落点', value: '草稿设计' },
    ],
    actionLabel: '进入模板中心',
    actionVariant: 'contrast',
    iconClassName:
      'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
    icon: Layers3,
  },
  {
    id: 'blank',
    title: '空白创建',
    details: [
      { label: '适用', value: '新流程搭建' },
      { label: '入口', value: '空白设计' },
      { label: '落点', value: '直接编辑' },
    ],
    actionLabel: '进入空白设计',
    actionVariant: 'outline',
    iconClassName:
      'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
    icon: PenTool,
  },
];

export const WorkflowCreate: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectBlankCreation = () => {
    navigate('/workflow/design?mode=blank&entry=create');
  };

  const handleSelectTemplateCreation = () => {
    navigate('/templates?entry=create');
  };

  const handleSelectOption = (id: CreationOption['id']) => {
    if (id === 'blank') {
      handleSelectBlankCreation();
      return;
    }

    handleSelectTemplateCreation();
  };

  return (
    <TablePageLayout
      className="gap-4"
      filters={
        <div className="flex min-h-9 items-center text-sm font-medium text-slate-900 dark:text-slate-100">
          选择流程创建方式
        </div>
      }
      table={
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {creationOptions.map((option) => {
            const Icon = option.icon;

            return (
              <section key={option.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${option.iconClassName}`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </div>

                      <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {option.title}
                      </div>
                        {option.description ? (
                          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                            {option.description}
                          </p>
                        ) : null}

                        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                          {option.details.map((detail) => (
                            <div key={`${option.id}-${detail.label}`} className="min-w-0">
                              <dt className="text-[11px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                {detail.label}
                              </dt>
                              <dd className="mt-1 truncate text-sm text-slate-700 dark:text-slate-200">
                                {detail.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center lg:pl-6">
                    <Button
                      variant={option.actionVariant}
                      size="sm"
                      onClick={() => handleSelectOption(option.id)}
                    >
                      {option.actionLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      }
    />
  );
};

export default WorkflowCreate;
