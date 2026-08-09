import React, { useState } from 'react';
import {
  Copy,
  Database,
  FileCode2,
  GitBranch,
  Loader2,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { BACKEND_SOURCE } from '@/pages/CodeGeneration/demo-data/code-generation-samples';
import { generateBackendArtifacts } from '@/services/api/ai';
import { WorkflowDefinition } from '../types';
import { Button, SegmentedControl, SegmentedControlItem } from '@/components/common';
import { cn } from '@/utils/cn';
import '../styles/features/code-generation.css';

type ArtifactTab = 'java' | 'sql';

const artifactMeta: Record<
  ArtifactTab,
  {
    label: string;
    fileName: string;
    description: string;
    icon: React.ReactNode;
    accentClassName: string;
  }
> = {
  java: {
    label: 'Java 引擎',
    fileName: 'WorkflowService.java',
    description: '审批引擎、Redis 事件监听与 SLA 处理蓝本',
    icon: <FileCode2 size={14} />,
    accentClassName: 'text-cyan-100',
  },
  sql: {
    label: 'SQL 脚本',
    fileName: 'schema.sql',
    description: '表结构、表单绑定与流程运行态初始化脚本',
    icon: <Database size={14} />,
    accentClassName: 'text-emerald-100',
  },
};

const getLineCount = (value: string) => (value ? value.split('\n').length : 0);

const formatTimeLabel = (date: Date) =>
  date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, description, icon, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
    {loading ? (
      <Loader2 className="mb-3 h-4 w-4 animate-spin text-cf-faint" />
    ) : icon ? (
      <div className="mb-3 text-cf-faint">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-cf-subtle">
        {description}
      </div>
    ) : null}
  </div>
);

const MetaField: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div className="px-4 py-3">
    <div className="text-[11px] font-medium text-cf-faint">
      {label}
    </div>
    <div className="mt-1.5 text-sm font-semibold text-cf-title">
      {value}
    </div>
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
      <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
        <InlineState
          icon={meta.icon}
          title="暂无代码内容"
          description="请重新选择流程或再次触发生成。"
        />
      </div>
    );
  }

  return (
    <div className="source-code-preview-panel overflow-hidden rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950">
      <div className="source-code-preview-head flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-cf-title">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-cf-subtle dark:border-slate-700 dark:bg-slate-950">
              {meta.icon}
            </span>
            <span className="truncate">{meta.fileName}</span>
          </div>
          <div className="mt-1 text-xs text-cf-subtle">{meta.description}</div>
        </div>
        <span className="text-xs text-cf-subtle">
          {getLineCount(code).toLocaleString()} 行
        </span>
      </div>

      <div className="source-code-preview-shell bg-slate-950 p-3 sm:p-4">
        <div className="source-code-preview-scroll overflow-auto rounded-md border border-slate-800 bg-slate-950 px-4 py-4">
          <pre className="whitespace-pre font-mono text-[13px] leading-6 text-slate-100">
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
      const message =
        error instanceof Error ? error.message : '代码生成失败，请稍后重试或联系管理员';
      setGeneratedCode((prev) => ({ ...prev, loading: false }));
      toast.error(message);
    }
  };

  const handleCopyCurrent = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      toast.success(`${currentMeta.fileName} 已复制到剪贴板`);
    } catch (error) {
      console.error(error);
      toast.error('复制失败，请稍后重试');
    }
  };

  return (
    <div className="source-code-viewer divide-y divide-slate-200 dark:divide-slate-800">
      <div className="source-code-toolbar flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-cf-title">
            {workflow.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cf-subtle">
            <span className="inline-flex items-center gap-1">
              <Workflow size={13} />
              {workflow.key}
            </span>
            <span>{resultSourceLabel}</span>
            {generatedCode.lastGeneratedAt ? (
              <span>最近生成 {generatedCode.lastGeneratedAt}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyCurrent}>
            <Copy size={14} />
            复制当前文件
          </Button>
          <Button size="sm" onClick={() => void handleGenerate()} disabled={generatedCode.loading}>
            {generatedCode.loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {generatedCode.loading ? '重新生成中' : '重新生成'}
          </Button>
        </div>
      </div>

      <div className="source-code-meta-grid grid gap-0 md:grid-cols-4">
        <MetaField label="流程 Key" value={workflow.key} />
        <MetaField label="版本" value={`v${workflow.version}`} />
        <MetaField label="表单绑定" value={workflow.formId || '未绑定'} />
        <MetaField
          label="图模型"
          value={
            <span className="inline-flex items-center gap-1">
              <GitBranch size={13} className="text-cf-faint" />
              {workflowNodeCount} 节点 / {workflowEdgeCount} 连线
            </span>
          }
        />
      </div>

      <div className="source-code-body px-4 py-4 sm:px-5">
        <div className="source-code-body-inner flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SegmentedControl className="min-h-9">
              <SegmentedControlItem
                size="sm"
                active={activeTab === 'java'}
                onClick={() => setActiveTab('java')}
              >
                <FileCode2 size={14} className="mr-1.5" />
                Java 引擎
              </SegmentedControlItem>
              <SegmentedControlItem
                size="sm"
                active={activeTab === 'sql'}
                onClick={() => setActiveTab('sql')}
              >
                <Database size={14} className="mr-1.5" />
                SQL 脚本
              </SegmentedControlItem>
            </SegmentedControl>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cf-subtle">
              <span>{currentMeta.fileName}</span>
              <span>{getLineCount(currentCode).toLocaleString()} 行</span>
            </div>
          </div>

          {generatedCode.loading ? (
            <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center gap-2 text-sm text-cf-muted">
                <Loader2 size={14} className="animate-spin" />
                正在生成最新代码产物，当前预览会在完成后自动替换。
              </div>
            </div>
          ) : null}

          <CodePreviewPanel code={currentCode} tab={activeTab} />
        </div>
      </div>
    </div>
  );
};
