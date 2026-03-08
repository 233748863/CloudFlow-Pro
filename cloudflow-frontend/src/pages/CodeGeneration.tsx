import React, { useState, useEffect } from 'react';
import { SourceCodeViewer } from '../components/SourceCodeViewer';
import { WorkflowDefinition } from '../types';
import { getProcessDefinitions } from '../services/api/workflow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { toast } from 'sonner';
import { parseWorkflowGraphDefinition } from '../utils/workflowGraph';

/**
 * 解析流程模型，仅接受合法的 nodes+edges 图模型。
 */
const parseWorkflowGraph = (rawModelJson: unknown, workflowName: string): WorkflowDefinition['graph'] => {
  const graph = parseWorkflowGraphDefinition(rawModelJson);
  if (!graph) {
    throw new Error(`流程 "${workflowName}" 的 modelJson 不是合法的 nodes+edges 图模型`);
  }
  return graph;
};

export const CodeGeneration = () => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);

  useEffect(() => {
    getProcessDefinitions({ status: 'PUBLISHED', latestOnly: false }).then(res => {
       if (Array.isArray(res)) {
          // 按流程 Key 保留最高发布版本，避免多版本重复项影响选择与代码生成
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
            .filter((w: any) => typeof w?.definitionId === 'string' && w.definitionId.trim() !== '')
            .filter((w: any) => typeof w?.processKey === 'string' && w.processKey.trim() !== '')
            .map((w: any): WorkflowDefinition | null => {
              const workflowName = w.processName || w.processKey || '未命名流程';
              try {
                return {
                  id: w.definitionId,
                  name: workflowName,
                  key: w.processKey,
                  version: w.version,
                  formId: w.formId,
                  graph: parseWorkflowGraph(w.modelJson, workflowName)
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
          if (mapped.length > 0) setSelectedWorkflow(mapped[0]);
       }
    }).catch((err) => {
      console.error('加载流程定义失败:', err);
      toast.error('加载流程定义失败，请稍后重试');
    });
  }, []);

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
         <label className="text-sm font-bold text-slate-700">选择流程:</label>
         <Select value={selectedWorkflow?.id || ""} onValueChange={v => setSelectedWorkflow(workflows.find(w => w.id === v) || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map(w => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name} ({w.key})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
      </div>

      {selectedWorkflow ? (
          <SourceCodeViewer workflow={selectedWorkflow} />
      ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
              请先选择一个流程
          </div>
      )}
    </div>
  );
};
