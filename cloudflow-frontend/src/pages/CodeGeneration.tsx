import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
} from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
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

const InlineState: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ title, description, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
    {loading ? (
      <RefreshCw size={18} className="mb-3 animate-spin text-slate-400 dark:text-slate-500" />
    ) : null}
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

  const selectedNodeCount = selectedWorkflow?.graph.nodes.length ?? 0;
  const selectedEdgeCount = selectedWorkflow?.graph.edges.length ?? 0;
  const currentVersionLabel = selectedWorkflow ? `v${selectedWorkflow.version}` : '--';
  const currentFormLabel = selectedWorkflow?.formId || '未绑定';

  return (
    <TablePageLayout
      className="gap-3"
      filters={
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
          <div className="min-w-[300px] flex-1">
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

          <div className="flex flex-wrap items-center gap-2">
            {selectedWorkflow ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {selectedWorkflow.key} · {currentVersionLabel} · 表单 {currentFormLabel} · 节点 {selectedNodeCount} · 连线 {selectedEdgeCount}
              </span>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                已发布流程 {workflows.length}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadWorkflows()}
              disabled={loading}
            >
              <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
              刷新流程
            </Button>
          </div>
        </div>
      }
      table={
        loading ? (
          <InlineState
            title="正在加载已发布流程"
            description="系统正在读取流程定义并准备代码预览。"
            loading
          />
        ) : error ? (
          <InlineState title="流程定义加载失败" description={error} />
        ) : selectedWorkflow ? (
          <SourceCodeViewer workflow={selectedWorkflow} />
        ) : (
          <InlineState
            title="暂无可生成的已发布流程"
            description="请先确认流程已发布且模型可被正确解析。"
          />
        )
      }
    />
  );
};
