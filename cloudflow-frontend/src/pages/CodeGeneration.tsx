import React, { useState, useEffect } from 'react';
import { SourceCodeViewer } from '../components/SourceCodeViewer';
import { WorkflowDefinition, NodeType } from '../types';
import { getProcessDefinitions } from '../services/api/workflow';

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
         <select 
            className="p-2 border rounded-lg min-w-[200px]"
            onChange={(e) => {
                const wf = workflows.find(w => w.key === e.target.value);
                setSelectedWorkflow(wf || null);
            }}
            value={selectedWorkflow?.key || ''}
         >
             {workflows.map(w => <option key={w.key} value={w.key}>{w.name} ({w.key})</option>)}
         </select>
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
