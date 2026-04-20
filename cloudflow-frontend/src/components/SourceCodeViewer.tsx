import React, { useState } from 'react';
import { Braces, Copy, Database, FileCode2, GitBranch, Loader2, Sparkles, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { BACKEND_SOURCE } from '../backend_data';
import { generateBackendArtifacts } from '../services/geminiService';
import { WorkflowDefinition } from '../types';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { cn } from '@/utils/cn';

type ArtifactTab = 'java' | 'sql';

const artifactMeta: Record<
  ArtifactTab,
  {
    label: string;
    description: string;
    icon: React.ReactNode;
    accentClassName: string;
  }
> = {
  java: {
    label: 'WorkflowService.java',
    description: '审批引擎、Redis 事件监听与 SLA 处理蓝本',
    icon: <FileCode2 size={14} />,
    accentClassName: 'text-cyan-100',
  },
  sql: {
    label: 'schema.sql',
    description: '表结构、动态表单与流程运行态初始化脚本',
    icon: <Database size={14} />,
    accentClassName: 'text-emerald-100',
  },
};

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

const getLineCount = (value: string) => (value ? value.split('\n').length : 0);

const formatTimeLabel = (date: Date) =>
  date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

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

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  className?: string;
}> = ({ title, description, icon, loading = false, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
    {loading ? <Loader2 className="mb-3 h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" /> : icon ? <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div> : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </div>
    ) : null}
  </div>
);

const CodePreviewPanel = ({
  code,
  tab,
}: {
  code: string;
  tab: ArtifactTab;
}) => {
  const meta = artifactMeta[tab];

  if (!code.trim()) {
    return (
      <InlineState
        icon={meta.icon}
        title="暂无代码内容"
        description="当前产物还没有可展示的代码内容，请重新选择流程或再次触发生成。"
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {meta.icon}
            </span>
            <span className="truncate">{meta.label}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{meta.description}</div>
        </div>
        <span className={surfaceChipClassName}>{getLineCount(code).toLocaleString()} 行</span>
      </div>

      <div className="bg-slate-950 p-3 sm:p-4">
        <div className="overflow-auto rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 shadow-inner shadow-black/30 sm:px-5 sm:py-5">
          <pre className="min-h-[30rem] whitespace-pre font-mono text-[13px] leading-6 text-slate-100">
            <code className={cn('block min-w-max', meta.accentClassName)}>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};

export const SourceCodeViewer = ({ workflow }: { workflow: WorkflowDefinition }) => {
  const [activeTab, setActiveTab] = useState<ArtifactTab>('java');
  const [generatedCode, setGeneratedCode] = useState<{
    sql: string;
    java: string;
    loading: boolean;
    lastGeneratedAt: string | null;
  }>({
    sql: BACKEND_SOURCE.sql,
    java: BACKEND_SOURCE.java_workflow,
    loading: false,
    lastGeneratedAt: null,
  });

  const currentCode = activeTab === 'java' ? generatedCode.java : generatedCode.sql;
  const currentMeta = artifactMeta[activeTab];
  const resultSourceLabel = generatedCode.lastGeneratedAt ? 'AI 最新结果' : '默认蓝本';
  const workflowNodeCount = workflow.graph.nodes.length;
  const workflowEdgeCount = workflow.graph.edges.length;

  const handleGenerate = async () => {
    setGeneratedCode((prev) => ({ ...prev, loading: true }));

    try {
      // 同时请求 Java 与 SQL，保证同一轮结果来自同一份流程定义。
      const [java, sql] = await Promise.all([
        generateBackendArtifacts(workflow, 'JAVA_ENGINE'),
        generateBackendArtifacts(workflow, 'SQL'),
      ]);

      setGeneratedCode({
        java,
        sql,
        loading: false,
        lastGeneratedAt: formatTimeLabel(new Date()),
      });
      toast.success('代码产物已刷新');
    } catch (error) {
      const message = error instanceof Error ? error.message : '代码生成失败，请检查 API Key';
      setGeneratedCode((prev) => ({ ...prev, loading: false }));
      toast.error(message);
    }
  };

  const handleCopyCurrent = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      toast.success(`${currentMeta.label} 已复制到剪贴板`);
    } catch (error) {
      console.error(error);
      toast.error('复制失败，请稍后重试');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PanelCard
          title="后端产物预览"
          description="保留默认蓝本作为兜底展示，同时允许基于当前已发布流程重新生成 Java 审批引擎与 SQL 初始化脚本。"
          aside={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyCurrent}>
                <Copy size={14} />
                复制当前文件
              </Button>
              <Button size="sm" onClick={() => void handleGenerate()} disabled={generatedCode.loading}>
                {generatedCode.loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {generatedCode.loading ? 'AI 生成中' : '重新生成'}
              </Button>
            </div>
          }
        >
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                流程 Key
              </div>
              <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {workflow.key}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                版本
              </div>
              <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                v{workflow.version}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                图模型
              </div>
              <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {workflowNodeCount} 节点 / {workflowEdgeCount} 连线
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                结果来源
              </div>
              <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {resultSourceLabel}
              </div>
            </div>
          </div>
        </PanelCard>

        <PanelCard
          title="统一产物说明"
          description="保证生成结果和当前流程定义保持同一轮契约。"
        >
          <div className="space-y-3 px-4 py-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
            <div>当前页面只读取“已发布”的流程定义，避免流程版本和生成产物脱节。</div>
            <div>Java 与 SQL 使用同一轮流程模型生成，便于对齐流程节点、表单绑定和运行态表结构。</div>
            <div>默认蓝本会一直保留，AI 结果失败时不会清空现有预览。</div>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className={surfaceChipClassName}>表单绑定：{workflow.formId || '未绑定'}</span>
              <span className={surfaceChipClassName}>
                {generatedCode.lastGeneratedAt ? `最近生成 ${generatedCode.lastGeneratedAt}` : '尚未触发 AI 生成'}
              </span>
            </div>
          </div>
        </PanelCard>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ArtifactTab)} className="w-full">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="h-auto flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
                <TabsTrigger value="java" className="gap-2">
                  <FileCode2 size={14} />
                  Java 引擎
                </TabsTrigger>
                <TabsTrigger value="sql" className="gap-2">
                  <Database size={14} />
                  SQL 脚本
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap gap-2">
                <span className={surfaceChipClassName}>{resultSourceLabel}</span>
                <span className={surfaceChipClassName}>{getLineCount(currentCode).toLocaleString()} 行</span>
                <span className={surfaceChipClassName}>{currentMeta.label}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                <Workflow size={13} />
                {workflow.name}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                <GitBranch size={13} />
                {workflowNodeCount} 节点 / {workflowEdgeCount} 连线
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                <Braces size={13} />
                CloudFlow 产物蓝本
              </span>
            </div>
          </div>

          <div className="p-4">
            {generatedCode.loading ? (
              <div className="mb-4">
                <InlineState
                  title="正在生成最新代码产物..."
                  description="系统会保留当前预览内容，生成完成后自动替换为最新结果。"
                  loading
                  className="rounded-2xl border border-slate-200 bg-slate-50/90 py-6 dark:border-slate-800 dark:bg-slate-900/70"
                />
              </div>
            ) : null}

            <TabsContent value="java" className="mt-0">
              <CodePreviewPanel code={generatedCode.java} tab="java" />
            </TabsContent>
            <TabsContent value="sql" className="mt-0">
              <CodePreviewPanel code={generatedCode.sql} tab="sql" />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};
