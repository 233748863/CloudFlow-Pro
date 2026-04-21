import React from 'react';
import { ArrowRight, Layers3, PenTool, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { Button } from '@/components/ui';

type CreationOption = {
  id: 'blank' | 'template';
  badge: string;
  title: string;
  description: string;
  highlights: string[];
  actionLabel: string;
  icon: React.ComponentType<{ className?: string }>;
};

const creationOptions: CreationOption[] = [
  {
    id: 'blank',
    badge: 'Blank Canvas',
    title: '空白创建',
    description: '直接进入设计器，从开始节点和结束节点起步，自定义规则、表单与权限。',
    highlights: ['适合全新业务流程', '不继承历史模板结构', '进入设计器后立即可编辑'],
    actionLabel: '进入空白设计',
    icon: PenTool,
  },
  {
    id: 'template',
    badge: 'Template Center',
    title: '从模板创建',
    description: '先在模板中心选取行业或业务模板，再生成草稿进入流程设计器细化。',
    highlights: ['适合复用成熟流程', '支持分类、搜索与预览', '带着模板骨架进入设计'],
    actionLabel: '进入模板中心',
    icon: Layers3,
  },
];

const creationRules = [
  '入口页只负责分流，不承载模板浏览和流程编辑。',
  '需要快速落地时优先走模板中心，再进入设计器修改。',
  '只在确认没有可复用骨架时再从空白流程开始。',
];

const recommendedPath = ['选择创建方式', '进入模板中心或空白流程', '进入设计器编辑与发布'];

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            <Workflow className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
            Workflow Entry
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            选择流程创建方式
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            先决定是从空白流程开始，还是从模板中心复用，再进入流程设计器编辑与发布。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectTemplateCreation}>
            模板中心
          </Button>
          <Button variant="contrast" size="sm" onClick={handleSelectBlankCreation}>
            空白创建
          </Button>
        </div>
      </div>

      <TablePageLayout
        className="gap-4"
        table={
          // 按源码后台页的“单容器分栏”组织入口，避免继续堆叠 Hero、摘要卡和说明卡。
          <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {creationOptions.map((option) => {
                const Icon = option.icon;
                const isBlank = option.id === 'blank';

                return (
                  <section key={option.id} className="p-5 sm:p-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-4">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                              isBlank
                                ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
                                : 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200'
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                              {option.badge}
                            </div>
                            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                              {option.title}
                            </div>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                              {option.description}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-3">
                          {option.highlights.map((item) => (
                            <div
                              key={item}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                            >
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <Button
                          variant={isBlank ? 'contrast' : 'outline'}
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

            <aside className="border-t border-slate-200 dark:border-slate-800 xl:border-l xl:border-t-0">
              <section className="border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  创建规则
                </div>
                <div className="mt-3 space-y-3">
                  {creationRules.map((rule) => (
                    <div
                      key={rule}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                    >
                      {rule}
                    </div>
                  ))}
                </div>
              </section>

              <section className="p-5 sm:p-6">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  推荐路径
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="space-y-3">
                    {recommendedPath.map((step, index) => (
                      <div key={step} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  如果你还不确定从哪里开始，先去模板中心看现有流程骨架，再决定是否需要从空白流程重建。
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectTemplateCreation}>
                    先看模板中心
                  </Button>
                  <Button variant="contrast" size="sm" onClick={handleSelectBlankCreation}>
                    直接空白创建
                  </Button>
                </div>
              </section>
            </aside>
          </div>
        }
      />
    </div>
  );
};

export default WorkflowCreate;
