import React, { useState, useEffect } from 'react';
import { Search, DollarSign, Clock, Monitor, FileBadge, GitMerge, ArrowRightCircle, FormInput, AlertTriangle } from 'lucide-react';
import { WorkflowDefinition, NodeType, FormDefinition } from '../types';
import { getProcessDefinitions, getFormDefinitions, startProcess, getTodoTasks, getMyInstances } from '../services/api/workflow';
import { FormRenderer } from '../components/FormRenderer';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export const Workplace = () => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [targetWorkflow, setTargetWorkflow] = useState<WorkflowDefinition | null>(null);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();

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
       }
    });

    getFormDefinitions().then(res => {
        if(Array.isArray(res)) {
            const mapped = res.map((f: any) => {
                let fields = [];
                const raw = typeof f.fieldsJson === 'string' ? f.fieldsJson
                          : typeof f.formSchema === 'string' ? f.formSchema
                          : null;
                if (raw) {
                    try {
                        fields = JSON.parse(raw);
                    } catch {
                        // 尝试修复非法转义字符（如 \d, \w 等正则表达式字符）
                        try {
                            const sanitized = raw.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
                            fields = JSON.parse(sanitized);
                        } catch (parseError) {
                            console.error('解析表单字段失败:', parseError);
                            fields = [];
                        }
                    }
                } else {
                    fields = f.fields || f.fieldsJson || [];
                }
                
                return {
                    id: f.formId,
                    name: f.formName,
                    fields: fields
                };
            });
            setSavedForms(mapped);
        }
    });
  }, []);
  
  const filteredWorkflows = workflows.filter(wf => wf.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleStartClick = (wf: WorkflowDefinition) => {
    setTargetWorkflow(wf);
    setIsFormOpen(true);
  };

  const handleStartProcess = async (formData: Record<string, any>) => {
    if (!targetWorkflow || !user) return;

    try {
      await startProcess({
        processDefKey: targetWorkflow.key,
        businessKey: `BK_${Date.now()}`,
        title: `${targetWorkflow.name} - ${user.name}`,
        startUserId: user.id,
        startUserName: user.name,
        variables: { ...formData }
      });
      
      alert("流程发起成功");
      setIsFormOpen(false);
      setTargetWorkflow(null);
      // Navigate to My Apps
      navigate('/my-apps');
      
    } catch (e) {
      console.error("Start process failed:", e);
      alert("流程发起失败");
    }
  };

  return (
    <div className="space-y-6">
      {/* Overlay for Form Renderer */}
      {isFormOpen && targetWorkflow && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl">
                {targetWorkflow.formId ? (
                <FormRenderer 
                    formDef={savedForms.find(f => f.id === targetWorkflow.formId) || savedForms[0]}
                    onCancel={() => setIsFormOpen(false)}
                    onSubmit={handleStartProcess}
                />
                ) : (
                <div className="bg-white p-8 rounded-xl text-center">
                    <AlertTriangle size={32} className="text-amber-500 mx-auto mb-4"/>
                    <h3 className="font-bold">未绑定表单</h3>
                    <p className="text-slate-500 text-sm mb-4">该流程尚未配置输入表单，无法自动发起。</p>
                    <button onClick={() => setIsFormOpen(false)} className="px-4 py-2 bg-slate-100 rounded">关闭</button>
                </div>
                )}
            </div>
            </div>
        )}

      <div className="flex justify-between items-center">
         <div>
            <h2 className="text-2xl font-bold text-slate-800">发起业务流程</h2>
            <p className="text-slate-500 mt-1 text-sm">选择下方服务卡片开始申请，系统将自动匹配审批流。</p>
         </div>
         <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
            <input 
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-indigo-500 outline-none" 
              placeholder="搜索流程..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
         </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredWorkflows.map(wf => (
          <div key={wf.id} className="group bg-white border border-slate-200 hover:border-indigo-500 rounded-xl p-6 transition-all shadow-sm hover:shadow-lg cursor-pointer relative overflow-hidden" onClick={() => handleStartClick(wf)}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
            <div className="relative z-10 flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                 {wf.key.includes('reimburse') || wf.key.includes('payment') ? <DollarSign size={24}/> : 
                  wf.key.includes('leave') ? <Clock size={24}/> :
                  wf.key.includes('it') ? <Monitor size={24}/> :
                  wf.key.includes('contract') ? <FileBadge size={24}/> :
                  <GitMerge size={24} />
                 }
              </div>
              <ArrowRightCircle size={24} className="text-slate-300 group-hover:text-indigo-600 transition-colors"/>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">{wf.name}</h3>
            <p className="text-xs text-slate-500 line-clamp-2">Key: {wf.key}</p>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
              <FormInput size={12}/> 绑定表单: {wf.formId ? '已配置' : '无'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
