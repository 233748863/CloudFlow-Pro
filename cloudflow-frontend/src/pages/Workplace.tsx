import React, { useState, useEffect } from 'react';
import { Search, DollarSign, Clock, Monitor, FileBadge, GitMerge, ArrowRightCircle, FormInput, AlertTriangle, Tag, FolderOpen, X } from 'lucide-react';
import { WorkflowDefinition, NodeType, FormDefinition } from '../types';
import { getProcessDefinitions, getFormDefinitions, startProcess, getTodoTasks, getMyInstances } from '../services/api/workflow';
import { FormRenderer } from '../components/FormRenderer';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export const Workplace = () => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(''); // P3: 分类筛选
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // P3: 标签筛选
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [targetWorkflow, setTargetWorkflow] = useState<WorkflowDefinition | null>(null);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  // P3: 分类选项
  const CATEGORY_LABELS: Record<string, string> = {
    '': '全部',
    'office': '行政办公',
    'finance': '财务管理',
    'hr': '人事管理',
    'sales': '销售业务',
    'it': 'IT运维',
    'production': '生产制造',
    'quality': '质量管理',
    'project': '项目管理',
    'other': '其他',
  };

  useEffect(() => {
    getProcessDefinitions().then(res => {
       if (Array.isArray(res)) {
          const mapped = res.map((w: any) => ({
              id: w.definitionId || w.processKey,
              name: w.processName || w.name,
              key: w.processKey || w.key,
              version: w.version,
              formId: w.formId,
              // P3: 映射分类和标签字段
              category: w.category || '',
              tags: w.tags ? (typeof w.tags === 'string' ? JSON.parse(w.tags) : w.tags) : [],
              description: w.description || '',
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
  
  // P3: 筛选逻辑 - 支持搜索、分类和标签筛选
  const filteredWorkflows = workflows.filter(wf => {
    // 搜索词筛选
    const matchesSearch = wf.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 分类筛选
    const matchesCategory = !selectedCategory || wf.category === selectedCategory;
    
    // 标签筛选（任一匹配即可）
    const matchesTags = selectedTags.length === 0 || 
      selectedTags.some(tag => (wf.tags as string[])?.includes(tag));
    
    return matchesSearch && matchesCategory && matchesTags;
  });

  // P3: 获取所有可用标签（去重）
  const allTags = Array.from(new Set(
    workflows.flatMap(wf => (wf.tags as string[]) || [])
  ));

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
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-pink-400 outline-none" 
              placeholder="搜索流程..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
         </div>
      </div>

      {/* P3: 分类筛选按钮组 */}
      <div className="flex items-center gap-2 flex-wrap">
        <FolderOpen size={16} className="text-slate-400" />
        <span className="text-sm text-slate-600 font-medium">分类:</span>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setSelectedCategory(value)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
              selectedCategory === value
                ? 'bg-pink-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* P3: 标签筛选 */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag size={16} className="text-slate-400" />
          <span className="text-sm text-slate-600 font-medium">标签:</span>
          {allTags.map(tag => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => {
                  if (isSelected) {
                    setSelectedTags(selectedTags.filter(t => t !== tag));
                  } else {
                    setSelectedTags([...selectedTags, tag]);
                  }
                }}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1 ${
                  isSelected
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tag}
                {isSelected && <X size={12} />}
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition-all"
            >
              清除标签筛选
            </button>
          )}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredWorkflows.map(wf => (
          <div key={wf.id} className="group bg-white border border-slate-200 hover:border-pink-400 rounded-xl p-6 transition-all shadow-sm hover:shadow-lg cursor-pointer relative overflow-hidden" onClick={() => handleStartClick(wf)}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-pink-50 rounded-bl-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
            
            {/* P3: 分类徽章 */}
            {wf.category && (
              <div className="absolute top-3 left-3 z-20">
                <span className="px-2 py-1 text-xs font-medium bg-pink-100 text-pink-600 rounded-md flex items-center gap-1">
                  <FolderOpen size={10} />
                  {CATEGORY_LABELS[wf.category] || wf.category}
                </span>
              </div>
            )}
            
            <div className="relative z-10 flex items-start justify-between mb-4 mt-6">
              <div className="w-12 h-12 bg-pink-50 text-pink-500 rounded-xl flex items-center justify-center">
                 {wf.key.includes('reimburse') || wf.key.includes('payment') ? <DollarSign size={24}/> : 
                  wf.key.includes('leave') ? <Clock size={24}/> :
                  wf.key.includes('it') ? <Monitor size={24}/> :
                  wf.key.includes('contract') ? <FileBadge size={24}/> :
                  <GitMerge size={24} />
                 }
              </div>
              <ArrowRightCircle size={24} className="text-slate-300 group-hover:text-pink-500 transition-colors"/>
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-pink-500 transition-colors">{wf.name}</h3>
            
            {/* P3: 流程描述 */}
            {wf.description && (
              <p className="text-xs text-slate-500 line-clamp-2 mb-2">{wf.description}</p>
            )}
            
            <p className="text-xs text-slate-400">Key: {wf.key}</p>
            
            {/* P3: 标签列表 */}
            {(wf.tags as string[])?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {(wf.tags as string[]).slice(0, 3).map(tag => (
                  <span key={tag} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">
                    {tag}
                  </span>
                ))}
                {(wf.tags as string[]).length > 3 && (
                  <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded">
                    +{(wf.tags as string[]).length - 3}
                  </span>
                )}
              </div>
            )}
            
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
              <FormInput size={12}/> 绑定表单: {wf.formId ? '已配置' : '无'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
