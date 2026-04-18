import React, { useEffect, useState } from 'react';
import { Braces, FileCode2, Sparkles, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { WorkspaceBackdrop, WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';
import { SourceCodeViewer } from '../components/SourceCodeViewer';
import { WorkflowDefinition } from '../types';
import { getProcessDefinitions } from '../services/api/workflow';
import { parseWorkflowGraphDefinition } from '../utils/workflowGraph';

const parseWorkflowGraph = (
  rawModelJson: unknown,
  workflowName: string,
): WorkflowDefinition['graph'] => {
  const graph = parseWorkflowGraphDefinition(rawModelJson);
  if (!graph) {
    throw new Error(`流程 "${workflowName}" 的 modelJson 不是合法的 nodes+edges 图模型`);
  }
  return graph;
};

export const CodeGeneration = () => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProcessDefinitions({ status: 'PUBLISHED', latestOnly: false })
      .then((res) => {
        if (!Array.isArray(res)) {
          setWorkflows([]);
          return;
        }

        const latestPublishedMap = new Map<string, any>();
        for (const item of res) {
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
          .filter((item: any) => typeof item?.definitionId === 'string' && item.definitionId.trim() !== '')
          .filter((item: any) => typeof item?.processKey === 'string' && item.processKey.trim() !== '')
          .map((item: any): WorkflowDefinition | null => {
            const workflowName = item.processName || item.processKey || '未命名流程';
            try {
              return {
                id: item.definitionId,
                name: workflowName,
                key: item.processKey,
                version: item.version,
                formId: item.formId,
                graph: parseWorkflowGraph(item.modelJson, workflowName),
              };
            } catch (error) {
              invalidModelCount += 1;
              console.warn(`[CodeGeneration] 跳过模型异常流程: ${workflowName}`, error);
              return null;
            }
          })
          .filter((item): item is WorkflowDefinition => item !== null);

        setWorkflows(mapped);
        if (invalidModelCount > 0) {
          toast.warning(`有 ${invalidModelCount} 条流程模型异常，已跳过加载`);
        }
        if (mapped.length > 0) {
          setSelectedWorkflow(mapped[0]);
        }
      })
      .catch((error) => {
        console.error('加载流程定义失败:', error);
        toast.error('加载流程定义失败，请稍后重试');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-3">
        <WorkspaceHeroCard
          badge={
            <span className="inline-flex items-center gap-2 rounded-full bg-white/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <Braces className="h-3.5 w-3.5" />
              Code Workspace
            </span>
          }
          title="流程源码生成"
          description="从已发布流程中选择一个版本，解析图模型后生成可查看的源码结果，让流程结构和实现映射更直接。"
        >
          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="已发布流程"
              value={workflows.length}
              hint="按流程 Key 保留最新已发布版本"
              aside={<Workflow className="h-[18px] w-[18px] text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前选择"
              value={selectedWorkflow?.name || '未选择'}
              hint={selectedWorkflow ? selectedWorkflow.key : '请先选择流程'}
              aside={<Sparkles className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="版本"
              value={selectedWorkflow ? `v${selectedWorkflow.version}` : '--'}
              hint="当前用于生成源码的流程版本"
              aside={<FileCode2 className="h-[18px] w-[18px] text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="输出模式"
              value="源码查看"
              hint="用于验证流程结构与代码映射关系"
              aside={<Braces className="h-[18px] w-[18px] text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceSectionCard
          title="流程选择"
          description="先选择一个已发布流程，再进入源码查看区域。"
          eyebrow="Workflow Filter"
        >
          <div className="max-w-xl">
            <label className="mb-2 block text-sm font-semibold text-slate-700">选择流程</label>
            <Select
              value={selectedWorkflow?.id || ''}
              onValueChange={(value) =>
                setSelectedWorkflow(workflows.find((workflow) => workflow.id === value) || null)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择流程" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((workflow) => (
                  <SelectItem key={workflow.id} value={String(workflow.id)}>
                    {workflow.name} ({workflow.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="生成结果"
          description="源码查看器会基于当前选择的流程定义展示对应实现。"
          eyebrow="Source Viewer"
          className="min-h-[24rem]"
        >
          {loading ? (
            <WorkspaceInlineState
              type="loading"
              title="正在整理流程定义..."
              description="请稍候，系统正在读取流程图模型并准备源码视图。"
              className="py-16"
            />
          ) : selectedWorkflow ? (
            <SourceCodeViewer workflow={selectedWorkflow} />
          ) : (
            <WorkspaceInlineState
              icon={<FileCode2 className="h-5 w-5" />}
              title="请先选择一个流程"
              description="选择流程后，这里会展示对应的源码生成结果。"
              className="py-16"
            />
          )}
        </WorkspaceSectionCard>
      </div>
    </div>
  );
};
