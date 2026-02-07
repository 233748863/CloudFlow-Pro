import React, { useState, useEffect } from 'react';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { WorkflowDefinition, NodeType, FormDefinition, User } from '../types';
import { getProcessDefinitions, saveProcessDefinition, getFormDefinitions } from '../services/api/workflow';
import { getRoleList, getUserList } from '../services/api/auth';
import { mapBackendUserToFrontend } from '../utils/mappers';

export const WorkflowDesign = () => {
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  useEffect(() => {
    // Fetch initial workflow list to select one (or create new)
    // For simplicity, let's just fetch and if empty show create new. 
    // If not empty, select the first one. (This can be improved with a list view later)
    getProcessDefinitions().then(res => {
       if (Array.isArray(res) && res.length > 0) {
          const w = res[0];
          setWorkflow({
              id: w.definitionId || w.processKey,
              name: w.processName || w.name,
              key: w.processKey || w.key,
              version: w.version,
              formId: w.formId,
              nodes: w.modelJson ? JSON.parse(w.modelJson) : { type: NodeType.START, title: '开始', id: 'start' }
          });
       } else {
           // Create new
           setWorkflow({
               id: 'new_' + Date.now(),
               name: '新流程',
               key: 'new_process',
               version: 1,
               nodes: { type: NodeType.START, title: '开始', id: 'start' }
           });
       }
    });

    getFormDefinitions().then(res => {
        if(Array.isArray(res)) {
            const mapped = res.map((f: any) => ({
                id: f.formId,
                name: f.formName,
                fields: typeof f.fieldsJson === 'string' ? JSON.parse(f.fieldsJson) : (f.fieldsJson || [])
            }));
            setSavedForms(mapped);
        }
    });

    getRoleList().then(res => {
        if (Array.isArray(res)) setAvailableRoles(res);
    });

    getUserList().then(res => {
        if (Array.isArray(res)) setAvailableUsers(res.map(mapBackendUserToFrontend));
    });
  }, []);

  const handleSaveWorkflow = async (wf: WorkflowDefinition) => {
    try {
      const payload = {
         definitionId: wf.id.startsWith('wf_') ? undefined : wf.id, // ID handling might need adjustment based on backend
         processName: wf.name,
         processKey: wf.key,
         formId: wf.formId,
         modelJson: JSON.stringify(wf.nodes)
      };
      await saveProcessDefinition(payload);
      alert("流程保存成功");
    } catch (e) {
      console.error(e);
      alert("流程保存失败");
    }
  };

  if (!workflow) return <div>Loading...</div>;

  return (
    <div className="h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <WorkflowBuilder 
            workflow={workflow} 
            onChange={setWorkflow} 
            onSave={handleSaveWorkflow}
            availableForms={savedForms}
            availableRoles={availableRoles}
            availableUsers={availableUsers}
        />
    </div>
  );
};
