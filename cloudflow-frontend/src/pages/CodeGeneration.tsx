import React, { useState, useEffect } from 'react';
import { SourceCodeViewer } from '../components/SourceCodeViewer';
import { WorkflowDefinition, NodeType } from '../types';
import { getProcessDefinitions } from '../services/api/workflow';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';

export const CodeGeneration = () => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);

  useEffect(() => {
    getProcessDefinitions().then(res => {
       if (Array.isArray(res)) {
          const mapped = res.map((w: any) => ({
              id: w.definitionId || w.processKey,
              name: w.processName || w.name,
              key: w.processKey || w.key,
              version: w.version,
              formId: w.formId,
              nodes: w.modelJson ? JSON.parse(w.modelJson) : { type: NodeType.START, title: '开始', id: 'start' }
          }));
          setWorkflows(mapped);
          if (mapped.length > 0) setSelectedWorkflow(mapped[0]);
       }
    });
  }, []);

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
         <label className="text-sm font-bold text-slate-700">选择流程:</label>
         <Select value={selectedWorkflow?.key || ""} onValueChange={v => setSelectedWorkflow(workflows.find(w => w.key === v) || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map(w => (
                        <SelectItem key={w.key} value={String(w.key)}>{w.name} ({w.key})</SelectItem>
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
