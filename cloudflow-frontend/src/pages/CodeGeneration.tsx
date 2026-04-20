import React, { useEffect, useState } from 'react';
import { Braces, FileCode2, GitBranch, RefreshCw, Sparkles, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button } from '@/components/ui';
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
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}> = ({ icon, label, value, hint }) => (
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

const InlineState: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ title, description, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
    {loading ? <RefreshCw size={18} className="mb-3 animate-spin text-slate-400 dark:text-slate-500" /> : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </div>
    ) : null}
  </div>
);

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

  return (
    <div className="flex flex-col gap-4">
      <PanelCard
        title="代码生成"
        description="统一流程选择、图模型概览和代码预览壳层，把这页从旧工作台大壳层收回到更接近参考后台的复杂页语法。"
        aside={
          <Button variant="outline" size="sm" onClick={() => void loadWorkflows()} disabled={loading}>
            <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
            刷新流程
          </Button>
        }
      >
        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              <Workflow size={14} />
              {todayLabel}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {timeLabel}
            </span>
            <span className={surfaceChipClassName}>流程：{currentWorkflowLabel}</span>
            <span className={surfaceChipClassName}>版本：{currentVersionLabel}</span>
            <span className={surfaceChipClassName}>表单：{currentFormLabel}</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <SummaryCard
              icon={<Workflow size={18} />}
              label="已发布流程"
              value={`${workflows.length}`}
              hint="按流程 Key 保留最新已发布版本"
            />
            <SummaryCard
              icon={<Sparkles size={18} />}
              label="当前流程"
              value={currentWorkflowLabel}
              hint={selectedWorkflow ? selectedWorkflow.key : '请先选择已发布流程'}
            />
            <SummaryCard
              icon={<GitBranch size={18} />}
              label="流程图规模"
              value={hasSelection ? `${selectedNodeCount} / ${selectedEdgeCount}` : '--'}
              hint="节点数 / 连线数"
            />
            <SummaryCard
              icon={<Braces size={18} />}
              label="输出产物"
              value={hasSelection ? 'Java + SQL' : '待选择'}
              hint="统一预览与 AI 生成动作"
            />
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title="流程选择"
        description="只展示最新已发布版本，并把流程版本、图模型和表单绑定收口到同一选择区。"
      >
        <div className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              选择已发布流程
            </label>
            <Select
              value={selectedWorkflow?.id || ''}
              onValueChange={(value) =>
                setSelectedWorkflow(workflows.find((workflow) => workflow.id === value) || null)
              }
            >
              <SelectTrigger className="h-11">
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

          <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              Flow Contract
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              统一生成节奏
            </div>
            <div className="mt-2 space-y-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              <div>只读取“已发布”的流程定义，避免设计稿版本和生成产物脱节。</div>
              <div>Java 与 SQL 使用同一轮流程模型生成，便于对齐流程节点和表结构。</div>
              <div>默认蓝本一直保留，AI 失败时不会清空当前预览。</div>
            </div>
          </div>
        </div>
      </PanelCard>

      {loading ? (
        <PanelCard title="代码结果" description="正在准备当前流程的代码预览。">
          <InlineState
            title="正在加载已发布流程..."
            description="请稍候，系统正在读取流程定义并准备代码预览。"
            loading
          />
        </PanelCard>
      ) : error ? (
        <PanelCard title="代码结果" description="流程定义加载失败。">
          <InlineState title="流程定义加载失败" description={error} />
        </PanelCard>
      ) : selectedWorkflow ? (
        <SourceCodeViewer workflow={selectedWorkflow} />
      ) : (
        <PanelCard title="代码结果" description="暂无可生成的流程。">
          <InlineState
            title="暂无可生成的已发布流程"
            description="请先确认流程已发布且模型可被正确解析，随后再进入代码预览。"
          />
        </PanelCard>
      )}
    </div>
  );
};
