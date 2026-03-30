import React from "react";
import { ArrowRight, DraftingCompass, Layers3, PenTool, Sparkles, Workflow } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui";

const creationOptions = [
  {
    id: "blank",
    title: "空白创建",
    description: "从开始节点和结束节点起步，自定义节点、规则、表单与权限。",
    eyebrow: "Blank Canvas",
    accentClassName: "from-amber-100 via-white to-rose-50 text-amber-700 ring-amber-200",
    icon: PenTool,
    bulletPoints: ["适合新业务流程", "避免模板历史包袱", "直接进入设计器开始搭建"],
  },
  {
    id: "template",
    title: "从模板创建",
    description: "先进入模板中心挑选行业或业务模板，再生成流程草稿进入设计器。",
    eyebrow: "Template Center",
    accentClassName: "from-sky-100 via-white to-cyan-50 text-sky-700 ring-sky-200",
    icon: Sparkles,
    bulletPoints: ["适合复用成熟流程", "支持分类、搜索、预览", "创建后自动带入模板结构"],
  },
] as const;

export const WorkflowCreate: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectBlankCreation = () => {
    navigate("/workflow/design?mode=blank&entry=create");
  };

  const handleSelectTemplateCreation = () => {
    navigate("/templates?entry=create");
  };

  return (
    <div className="relative min-h-[calc(100vh-140px)] overflow-hidden rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(180deg,_#fffef8_0%,_#ffffff_48%,_#f8fafc_100%)] shadow-sm">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-4rem] top-[-4rem] h-40 w-40 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute bottom-[-5rem] right-[-2rem] h-52 w-52 rounded-full bg-sky-200/30 blur-3xl" />
      </div>

      <div className="relative flex h-full flex-col px-6 py-8 lg:px-10 lg:py-10">
        <div className="max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm backdrop-blur">
            <Workflow className="h-4 w-4 text-pink-500" />
            Flow Entry
          </div>

          <div className="space-y-3">
            <h1 className="max-w-3xl text-3xl font-black tracking-tight text-slate-900 lg:text-[2.6rem]">
              新建流程先选创建方式，再进入设计器。
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              设计器现在只负责编辑、校验、保存与发布，不再承担模板浏览职责。先决定是从空白开始，还是从模板中心生成流程草稿。
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
          <div className="grid gap-5 md:grid-cols-2">
            {creationOptions.map((option) => {
              const Icon = option.icon;
              const primaryAction =
                option.id === "blank" ? handleSelectBlankCreation : handleSelectTemplateCreation;

              return (
                <section
                  key={option.id}
                  className="group relative overflow-hidden rounded-[28px] border border-slate-200 bg-white/92 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur transition-transform duration-300 hover:-translate-y-1"
                >
                  <div
                    className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] ring-1 ${option.accentClassName}`}
                  >
                    <Icon className="h-4 w-4" />
                    {option.eyebrow}
                  </div>

                  <div className="mt-5 space-y-3">
                    <h2 className="text-2xl font-black tracking-tight text-slate-900">{option.title}</h2>
                    <p className="text-sm leading-7 text-slate-600">{option.description}</p>
                  </div>

                  <div className="mt-6 space-y-3 rounded-2xl bg-slate-50/85 p-4 ring-1 ring-slate-200">
                    {option.bulletPoints.map((item) => (
                      <div key={item} className="flex items-center gap-3 text-sm text-slate-600">
                        <div className="h-2.5 w-2.5 rounded-full bg-slate-300 transition-colors group-hover:bg-pink-400" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={primaryAction}
                    className="mt-6 h-11 w-full justify-between rounded-xl px-4 text-sm font-semibold"
                  >
                    <span>{option.id === "blank" ? "进入空白设计" : "进入模板中心"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </section>
              );
            })}
          </div>

          <aside className="rounded-[28px] border border-slate-200 bg-slate-950 px-6 py-6 text-slate-100 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200">
              <DraftingCompass className="h-4 w-4 text-amber-300" />
              New Flow Guide
            </div>

            <div className="mt-5 space-y-3">
              <h2 className="text-2xl font-black tracking-tight">创建链路已经拆分完成</h2>
              <p className="text-sm leading-7 text-slate-300">
                现在的推荐路径是“创建方式页 → 模板中心或空白流程 → 设计器”。这样模板资产和流程编辑不再互相堆叠。
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3 text-sm font-semibold text-white">
                  <Layers3 className="h-4 w-4 text-sky-300" />
                  模板中心
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">负责模板浏览、分类筛选、预览与从模板创建流程。</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3 text-sm font-semibold text-white">
                  <PenTool className="h-4 w-4 text-amber-300" />
                  流程设计器
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">只负责编辑流程结构、节点属性、保存、发布与版本相关操作。</p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <div className="flex items-center gap-3 text-sm font-semibold text-white">
                <Workflow className="h-4 w-4 text-pink-300" />
                当前建议
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                如果你不确定从哪里开始，先去模板中心看看已有流程骨架，再决定是否需要从空白流程重新搭建。
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  className="h-10 rounded-xl border border-white/10 bg-white text-slate-900 hover:bg-slate-100"
                  onClick={handleSelectTemplateCreation}
                >
                  优先去模板中心
                </Button>
                <Button
                  variant="ghost"
                  className="h-10 rounded-xl border border-white/10 text-white hover:bg-white/10"
                  onClick={handleSelectBlankCreation}
                >
                  直接空白创建
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default WorkflowCreate;
