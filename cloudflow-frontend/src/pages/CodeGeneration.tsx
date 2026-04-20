import React, { useEffect, useState } from 'react';
import { Braces, FileCode2, GitBranch, RefreshCw, Sparkles, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button } from '@/components/ui';
import {
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspaceInlineState,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';
import { SourceCodeViewer } from '../components/SourceCodeViewer';
import { getProcessDefinitions } from '../services/api/workflow';
import { WorkflowDefinition } from '../types';
import { parseWorkflowGraphDefinition } from '../utils/workflowGraph';
import { cn } from '@/utils/cn';

type PublishedProcessDefinition = {
  definitionId?: string;
  processName?: string;
  processKey?: string;
  version?: number;
  formId?: string;
  modelJson?: unknown;
};

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const parseWorkflowGraph = (
  rawModelJson: unknown,
  workflowName: string,
): WorkflowDefinition['graph'] => {
  const graph = parseWorkflowGraphDefinition(rawModelJson);

  if (!graph) {
    throw new Error(`流程“${workflowName}”的模型数据无法解析为合法图结构`);
  }

  return graph;
};

export const CodeGeneration = () => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflows = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getProcessDefinitions({ status: 'PUBLISHED', latestOnly: false });
      if (!Array.isArray(response)) {
        setWorkflows([]);
        setSelectedWorkflow(null);
        return;
      }

      const latestPublishedMap = new Map<string, PublishedProcessDefinition>();
      for (const item of response as PublishedProcessDefinition[]) {
        const processKey = String(item?.processKey || '').trim();
        if (!processKey) continue;

        const current = latestPublishedMap.get(processKey);
        const currentVersion = Number(current?.version || 0);
        const nextVersion = Number(item?.version || 0);

        if (!current || nextVersion >= currentVersion) {
          latestPublishedMap.set(processKey, item);
        }
      }

      let invalidModelCount = 0;
      const mapped: WorkflowDefinition[] = Array.from(latestPublishedMap.values())
        .filter((item) => typeof item.definitionId === 'string' && item.definitionId.trim() !== '')
        .filter((item) => typeof item.processKey === 'string' && item.processKey.trim() !== '')
        .map((item): WorkflowDefinition | null => {
          const workflowName = item.processName || item.processKey || '未命名流程';

          try {
            return {
              id: item.definitionId as string,
              name: workflowName,
              key: item.processKey as string,
              version: Number(item.version || 0),
              formId: item.formId,
              graph: parseWorkflowGraph(item.modelJson, workflowName),
            };
          } catch (parseError) {
            invalidModelCount += 1;
            console.warn(`[CodeGeneration] 跳过模型异常流程: ${workflowName}`, parseError);
            return null;
          }
        })
        .filter((item): item is WorkflowDefinition => item !== null);

      setWorkflows(mapped);
      setSelectedWorkflow((current) => {
        if (!mapped.length) return null;
        if (!current) return mapped[0];
        return mapped.find((workflow) => workflow.id === current.id) || mapped[0];
      });

      if (invalidModelCount > 0) {
        toast.warning(`有 ${invalidModelCount} 条流程定义模型异常，已自动跳过`);
      }
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载已发布流程失败，请稍后重试';
      setWorkflows([]);
      setSelectedWorkflow(null);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkflows();
  }, []);

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const selectedNodeCount = selectedWorkflow?.graph.nodes.length ?? 0;
  const selectedEdgeCount = selectedWorkflow?.graph.edges.length ?? 0;
  const hasSelection = Boolean(selectedWorkflow);
  const currentWorkflowLabel = selectedWorkflow?.name || '未选择流程';
  const currentVersionLabel = selectedWorkflow ? `v${selectedWorkflow.version}` : '--';
  const currentFormLabel = selectedWorkflow?.formId || '未绑定';

  const heroMetrics = [
    {
      label: '已发布流程',
      value: `${workflows.length}`,
      hint: '按流程 Key 保留最新已发布版本',
      icon: <Workflow size={17} />,
    },
    {
      label: '当前流程',
      value: currentWorkflowLabel,
      hint: selectedWorkflow ? selectedWorkflow.key : '请先选择已发布流程',
      icon: <Sparkles size={17} />,
      valueClassName: 'text-base sm:text-lg',
    },
    {
      label: '流程图规模',
      value: hasSelection ? `${selectedNodeCount} / ${selectedEdgeCount}` : '--',
      hint: '节点数 / 连线数',
      icon: <GitBranch size={17} />,
    },
    {
      label: '输出产物',
      value: hasSelection ? 'Java + SQL' : '待选择',
      hint: '统一预览与 AI 生成动作',
      icon: <Braces size={17} />,
    },
  ];

  const overviewItems = [
    { label: '流程 Key', value: selectedWorkflow?.key || '未选择' },
    { label: '版本', value: currentVersionLabel },
    { label: '图模型', value: hasSelection ? `${selectedNodeCount} 节点 / ${selectedEdgeCount} 连线` : '--' },
    { label: '表单绑定', value: currentFormLabel },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                <Workflow size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          }
          title="代码生成"
          description="统一流程选择、图模型概览和代码预览壳层，只读取已发布流程定义，让 SQL 与 Java 产物和当前流程版本保持同一套节奏。"
          actions={
            <Button variant="outline" size="lg" onClick={() => void loadWorkflows()} disabled={loading}>
              <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
              刷新流程
            </Button>
          }
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 代码工作台
            </span>
            <span className={surfaceChipClassName}>流程：{currentWorkflowLabel}</span>
            <span className={surfaceChipClassName}>版本：{currentVersionLabel}</span>
            <span className={surfaceChipClassName}>表单：{currentFormLabel}</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="流程筛选"
          title="代码生成工作台"
          total={workflows.length}
          hasActiveFilters={hasSelection}
          overviewItems={overviewItems}
          headerBadges={
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>已发布 {workflows.length} 条</span>
              <span className={surfaceChipClassName}>当前版本 {currentVersionLabel}</span>
              <span className={surfaceChipClassName}>输出 Java + SQL</span>
            </div>
          }
          quickFilterAside={
            <div className="flex flex-wrap items-center gap-2">
              <span className={surfaceChipClassName}>仅展示最新已发布版本</span>
              <Button variant="outline" size="sm" onClick={() => void loadWorkflows()} disabled={loading}>
                <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
                重新加载
              </Button>
            </div>
          }
          filterBar={
            <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">选择已发布流程</label>
                <Select
                  value={selectedWorkflow?.id || ''}
                  onValueChange={(value) =>
                    setSelectedWorkflow(workflows.find((workflow) => workflow.id === value) || null)
                  }
                >
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue placeholder={loading ? '正在加载流程...' : '请选择流程'} />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name} ({workflow.key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <div className={subtlePanelClassName}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                    Flow Contract
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">统一生成节奏</div>
                  <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    只读取已发布流程，并把图模型、版本和产物预览收口到同一页，避免工具页继续保留旧的独立视觉体系。
                  </div>
                </div>
              </div>
            </div>
          }
        />

        <WorkspaceResultCard
          total={selectedWorkflow ? 2 : 0}
          title="代码生成结果"
          description="统一预览 Java 与 SQL 两类产物，并保留默认蓝本与 AI 重新生成动作。"
        >
          <div className="space-y-4 p-4">
            {selectedWorkflow ? (
              <div className={subtlePanelClassName}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前流程概况</div>
                    <div className="flex flex-wrap gap-2">
                      <span className={surfaceChipClassName}>流程 Key：{selectedWorkflow.key}</span>
                      <span className={surfaceChipClassName}>版本：v{selectedWorkflow.version}</span>
                      <span className={surfaceChipClassName}>
                        节点 / 连线：{selectedNodeCount} / {selectedEdgeCount}
                      </span>
                      <span className={surfaceChipClassName}>表单绑定：{selectedWorkflow.formId || '未绑定'}</span>
                    </div>
                    <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                      代码页已经和 System 其他复杂工作台统一为同一套 Hero、筛选工作台、结果区和标签页语法，后续生成器相关工具页都应沿用这组层级。
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {loading ? (
              <WorkspaceInlineState
                type="loading"
                title="正在加载已发布流程..."
                description="请稍候，系统正在读取流程定义并准备代码预览工作台。"
                className="py-16"
              />
            ) : error ? (
              <WorkspaceInlineState
                icon={<FileCode2 className="h-5 w-5" />}
                title="流程定义加载失败"
                description={error}
                type="info"
                className="py-16"
              />
            ) : selectedWorkflow ? (
              <SourceCodeViewer workflow={selectedWorkflow} />
            ) : (
              <WorkspaceInlineState
                icon={<FileCode2 className="h-5 w-5" />}
                title="暂无可生成的已发布流程"
                description="请先确认流程已发布且模型可被正确解析，随后再进入代码预览。"
                className="py-16"
              />
            )}
          </div>
        </WorkspaceResultCard>
      </WorkspacePageContent>
    </div>
  );
};
