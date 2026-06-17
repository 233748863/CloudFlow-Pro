import React from 'react';
import { ArrowRight, CheckCircle2, Layers3, PenTool, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common';

type CreationDetail = {
  label: string;
  value: string;
};

type CreationOption = {
  id: 'template' | 'blank';
  title: string;
  subtitle: string;
  description: string;
  details: CreationDetail[];
  checkpoints: string[];
  actionLabel: string;
  target: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClassName: string;
  iconClassName: string;
};

const creationOptions: CreationOption[] = [
  {
    id: 'template',
    title: '从模板创建',
    subtitle: '复用成熟流程，快速生成草稿',
    description: '适合请假、报销、采购等已有相似规则的场景，先选模板，再调整节点和审批人。',
    details: [
      { label: '适用', value: '复用成熟流程' },
      { label: '入口', value: '模板中心' },
      { label: '落点', value: '草稿设计' },
    ],
    checkpoints: ['筛选业务模板', '填写流程名称', '进入设计工作台'],
    actionLabel: '进入模板中心',
    target: '/templates?entry=create',
    icon: Layers3,
    accentClassName: 'bg-teal-500',
    iconClassName:
      'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800/70 dark:bg-teal-950/40 dark:text-teal-200',
  },
  {
    id: 'blank',
    title: '空白创建',
    subtitle: '从零搭建，直接进入编辑',
    description: '适合新业务、新审批链路或需要完全自定义节点结构的场景，从空画布开始设计。',
    details: [
      { label: '适用', value: '新流程搭建' },
      { label: '入口', value: '空白设计' },
      { label: '落点', value: '直接编辑' },
    ],
    checkpoints: ['打开空白画布', '配置流程节点', '保存流程草稿'],
    actionLabel: '进入空白设计',
    target: '/workflow/design?mode=blank&entry=create',
    icon: PenTool,
    accentClassName: 'bg-amber-500',
    iconClassName:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200',
  },
];

const creationGuides: CreationDetail[] = [
  { label: '模板创建', value: '速度优先，可复用已有流程结构' },
  { label: '空白创建', value: '自由度优先，适合新规则从零设计' },
  { label: '共同结果', value: '都会进入同一套流程设计工作台' },
];

export const WorkflowCreate: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectOption = (target: string) => {
    navigate(target);
  };

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-200">
            <Workflow className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              WORKFLOW SETUP
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
              创建流程
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              选择一个创建起点，后续继续在流程设计工作台完成节点配置、保存和发布。
            </p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-5 text-sm text-slate-500 dark:text-slate-400 sm:w-auto">
          <div>
            <div className="text-base font-semibold text-slate-950 dark:text-slate-100">2 种</div>
            <div className="mt-0.5 text-xs">创建入口</div>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" />
          <div>
            <div className="text-base font-semibold text-slate-950 dark:text-slate-100">1 个</div>
            <div className="mt-0.5 text-xs">设计工作台</div>
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {creationOptions.map((option) => {
          const Icon = option.icon;

          return (
            <article
              key={option.id}
              className="flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88"
            >
              <div className={`h-1.5 ${option.accentClassName}`} />

              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${option.iconClassName}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                      {option.title}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {option.subtitle}
                    </p>
                  </div>
                </div>

                <p className="mt-5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {option.description}
                </p>

                <dl className="mt-5 grid gap-x-6 gap-y-4 border-y border-slate-200 py-4 dark:border-slate-800 sm:grid-cols-3">
                  {option.details.map((detail) => (
                    <div key={`${option.id}-${detail.label}`} className="min-w-0">
                      <dt className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                        {detail.label}
                      </dt>
                      <dd className="mt-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {detail.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <ul className="mt-5 space-y-2">
                  {option.checkpoints.map((checkpoint) => (
                    <li
                      key={`${option.id}-${checkpoint}`}
                      className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      <span className="truncate">{checkpoint}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-6">
                  <Button
                    variant="contrast"
                    size="lg"
                    className="w-full"
                    onClick={() => handleSelectOption(option.target)}
                  >
                    {option.actionLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="grid gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 md:grid-cols-3">
        {creationGuides.map((guide) => (
          <div key={guide.label} className="min-w-0">
            <div className="text-xs font-medium text-slate-400 dark:text-slate-500">{guide.label}</div>
            <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{guide.value}</div>
          </div>
        ))}
      </footer>
    </section>
  );
};

export default WorkflowCreate;
