import React, { useEffect, useState } from 'react';
import { AlertTriangle, FileCode2, GitBranch, Layers3, RefreshCw } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
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
  skippedModelCount?: number;
  publishedCount?: number;
  onRefresh?: () => void;
}> = ({
  title,
  description,
  loading = false,
  skippedModelCount = 0,
  publishedCount = 0,
  onRefresh,
}) => (
  <div className="code-generation-state">
    <div className="code-generation-state-icon">
      {loading ? (
        <RefreshCw size={18} className="animate-spin" />
      ) : (
        <FileCode2 size={18} />
      )}
    </div>
    <div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
    <div className="code-generation-state-grid">
      <span>已发布 {publishedCount}</span>
      <span>可解析 {Math.max(publishedCount - skippedModelCount, 0)}</span>
      <span className={cn(skippedModelCount > 0 && 'is-warning')}>异常 {skippedModelCount}</span>
    </div>
    {onRefresh ? (
      <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onRefresh}>
        <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
        刷新
      </Button>
    ) : null}
  </div>
);

export const CodeGeneration = () => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skippedModelCount, setSkippedModelCount] = useState(0);

  const loadWorkflows = async () => {
    setLoading(true);
    setError(null);
    setSkippedModelCount(0);

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
      setSkippedModelCount(invalidModelCount);
      setSelectedWorkflow((current) => {
        if (!mapped.length) return null;
        if (!current) return mapped[0];
        return mapped.find((workflow) => workflow.id === current.id) || mapped[0];
      });
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载已发布流程失败，请稍后重试';
      setWorkflows([]);
      setSelectedWorkflow(null);
      setError(message);
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
  const statCards = [
    { label: '已发布流程', value: String(workflows.length), detail: '可生成代码', icon: FileCode2, tone: 'blue' },
    { label: '当前版本', value: currentVersionLabel, detail: selectedWorkflow?.key || '未选择', icon: GitBranch, tone: 'green' },
    { label: '流程节点', value: String(selectedNodeCount), detail: `连线 ${selectedEdgeCount}`, icon: Layers3, tone: 'amber' },
    { label: '绑定表单', value: currentFormLabel === '未绑定' ? '--' : '已绑定', detail: currentFormLabel, icon: FileCode2, tone: 'violet' },
  ];

  return (
    <section className="playground-container source-playground code-generation-workbench -m-4 md:-m-6 lg:-m-8">
      <div className="playground-config-bar code-generation-config-bar">
        <div className="playground-control-group">
          <span className="code-generation-control-label">流程定义</span>
          <div className="code-generation-flow-select">
            <Select
              value={selectedWorkflow?.id || ''}
              onValueChange={(value) =>
                setSelectedWorkflow(workflows.find((workflow) => workflow.id === value) || null)
              }
            >
              <SelectTrigger className="h-9">
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
        </div>

        <div className="code-generation-context-strip">
          <span>{selectedWorkflow?.key || '未选择流程'}</span>
          <span>{currentVersionLabel}</span>
          <span>表单 {currentFormLabel}</span>
          <span>{selectedNodeCount} 节点 / {selectedEdgeCount} 连线</span>
        </div>

        <div className="playground-actions">
          {skippedModelCount > 0 ? (
            <span className="code-generation-warning">
              <AlertTriangle size={13} />
              跳过 {skippedModelCount} 条异常模型
            </span>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadWorkflows()}>
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            刷新流程
          </Button>
        </div>
      </div>

      <div className="code-generation-body">
        <aside className="code-generation-sidebar">
          <div className="code-generation-sidebar-head">
            <p>CODE GENERATION</p>
            <h2>代码生成</h2>
            <span>读取已发布流程并生成可预览的源代码结构</span>
          </div>

          <div className="code-generation-stat-list">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`code-generation-stat code-generation-tone-${stat.tone}`}>
                  <span className="code-generation-stat-icon"><Icon size={16} /></span>
                  <div>
                    <p>{stat.label}</p>
                    <strong>{stat.value}</strong>
                    <span>{stat.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="code-generation-main">
          {loading ? (
            <InlineState
              title="正在加载已发布流程"
              description="系统正在读取流程定义并准备代码预览。"
              loading
              publishedCount={workflows.length}
              skippedModelCount={skippedModelCount}
              onRefresh={() => void loadWorkflows()}
            />
          ) : error ? (
            <InlineState
              title="流程定义加载失败"
              description={error}
              publishedCount={workflows.length}
              skippedModelCount={skippedModelCount}
              onRefresh={() => void loadWorkflows()}
            />
          ) : selectedWorkflow ? (
            <SourceCodeViewer workflow={selectedWorkflow} />
          ) : (
            <InlineState
              title="暂无可生成的已发布流程"
              description="请先确认流程已发布且模型可被正确解析。"
              publishedCount={workflows.length}
              skippedModelCount={skippedModelCount}
              onRefresh={() => void loadWorkflows()}
            />
          )}
        </main>
      </div>

      <div className="code-generation-statusbar">
        <span>已发布流程 {workflows.length}</span>
        <span>可解析模型 {Math.max(workflows.length - skippedModelCount, 0)}</span>
        <span>异常模型 {skippedModelCount}</span>
      </div>
    </section>
  );
};
