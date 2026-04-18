import React from 'react';
import {
  ArrowRight,
  DraftingCompass,
  Layers3,
  PenTool,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import {
  WorkspaceBackdrop,
  WorkspacePageContent,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';
import { cn } from '@/utils/cn';

const creationOptions = [
  {
    id: 'blank',
    title: '空白创建',
    description: '从开始节点和结束节点起步，自定义节点、规则、表单与权限。',
    eyebrow: 'Blank Canvas',
    accentClassName: 'border border-amber-200 bg-amber-50 text-amber-700',
    icon: PenTool,
    bulletPoints: ['适合全新业务流程', '避免模板历史包袱', '直接进入设计器开始搭建'],
    actionLabel: '进入空白设计',
  },
  {
    id: 'template',
    title: '从模板创建',
    description: '先进入模板中心挑选行业或业务模板，再生成流程草稿进入设计器。',
    eyebrow: 'Template Center',
    accentClassName: 'border border-sky-200 bg-sky-50 text-sky-700',
    icon: Sparkles,
    bulletPoints: ['适合复用成熟流程', '支持分类、搜索与预览', '生成后自动带入模板结构'],
    actionLabel: '进入模板中心',
  },
] as const;

export const WorkflowCreate: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectBlankCreation = () => {
    navigate('/workflow/design?mode=blank&entry=create');
  };

  const handleSelectTemplateCreation = () => {
    navigate('/templates?entry=create');
  };

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              <Workflow className="h-3.5 w-3.5 text-teal-600" />
              Flow Entry
            </span>
          }
          title="新建流程先选创建方式，再进入设计器"
          description="设计器现在只负责编辑、校验、保存与发布，不再承载模板浏览职责。先决定是从空白开始，还是从模板中心生成流程草稿。"
        >
          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="创建方式"
              value={creationOptions.length}
              hint="空白创建与模板创建双入口"
              aside={<Workflow className="h-[18px] w-[18px] text-teal-600" />}
            />
            <WorkspaceMetricCard
              label="空白设计"
              value="直接建模"
              hint="适合新业务和非标准流程"
              aside={<PenTool className="h-[18px] w-[18px] text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="模板中心"
              value="复用骨架"
              hint="先选模板，再进入设计器细化"
              aside={<Layers3 className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="当前原则"
              value="先分流，后编辑"
              hint="入口职责清晰，避免模板与设计器混杂"
              aside={<DraftingCompass className="h-[18px] w-[18px] text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <div className="grid gap-6 md:grid-cols-2">
            {creationOptions.map((option) => {
              const Icon = option.icon;
              const primaryAction =
                option.id === 'blank' ? handleSelectBlankCreation : handleSelectTemplateCreation;

              return (
                <WorkspaceSectionCard
                  key={option.id}
                  title={option.title}
                  description={option.description}
                  eyebrow={option.eyebrow}
                  className="h-full"
                  bodyClassName="flex h-full flex-col"
                >
                  <div
                    className={cn(
                      'inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em]',
                      option.accentClassName,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.eyebrow}
                  </div>

                  <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                    {option.bulletPoints.map((item) => (
                      <div key={item} className="flex items-center gap-3 text-sm text-slate-600">
                        <div className="h-2.5 w-2.5 rounded-full bg-teal-500/70" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6">
                    <Button onClick={primaryAction} size="lg" className="w-full justify-between rounded-xl">
                      <span>{option.actionLabel}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </WorkspaceSectionCard>
              );
            })}
          </div>

          <WorkspaceSectionCard
            title="创建指南"
            description="入口拆分后，模板资产和流程编辑不再互相堆叠，操作路径更清晰。"
            eyebrow="Guide"
            className="h-full"
            bodyClassName="space-y-4"
          >
            <div className="rounded-2xl bg-slate-900 px-5 py-5 text-slate-100 shadow-[0_18px_36px_rgba(15,23,42,0.18)]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200">
                <DraftingCompass className="h-4 w-4 text-amber-300" />
                New Flow Guide
              </div>

              <div className="mt-5 space-y-3">
                <h2 className="text-2xl font-black tracking-tight">创建链路已经拆分完成</h2>
                <p className="text-sm leading-7 text-slate-300">
                  推荐路径是“创建方式页 → 模板中心或空白流程 → 设计器”。这样模板资产和流程编辑不再互相干扰。
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-900">
                  <Layers3 className="h-4 w-4 text-sky-500" />
                  模板中心
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  负责模板浏览、分类筛选、预览与从模板创建流程。
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-900">
                  <PenTool className="h-4 w-4 text-amber-500" />
                  流程设计器
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  只负责编辑流程结构、节点属性、保存、发布与版本相关操作。
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-4">
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-900">
                <Workflow className="h-4 w-4 text-teal-600" />
                当前建议
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                如果不确定从哪里开始，先去模板中心看现有流程骨架，再决定是否需要从空白流程重新搭建。
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="secondary" onClick={handleSelectTemplateCreation}>
                  优先去模板中心
                </Button>
                <Button variant="outline" onClick={handleSelectBlankCreation}>
                  直接空白创建
                </Button>
              </div>
            </div>
          </WorkspaceSectionCard>
        </div>
      </WorkspacePageContent>
    </div>
  );
};

export default WorkflowCreate;
