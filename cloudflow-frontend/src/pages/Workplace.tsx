import React, { useState, useEffect } from 'react';
import { Search, DollarSign, Clock, Monitor, FileBadge, GitMerge, ArrowRightCircle, FormInput, AlertTriangle, Tag, FolderOpen, X } from 'lucide-react';
import { WorkflowDefinition, FormDefinition } from '../types';
import { getProcessDefinitions, getFormDefinition, getFormDefinitions, startProcess } from '../services/api/workflow';
import { FormRenderer } from '../components/FormRenderer';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { convertGraphToWorkflowTree, parseWorkflowGraphDefinition } from '../utils/workflowGraph';

/**
 * 将后端返回的 tags 统一转换为字符串数组，避免页面内反复强制类型断言。
 */
const normalizeTags = (rawTags: unknown): string[] => {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((item): item is string => typeof item === 'string');
  }

  if (typeof rawTags !== 'string' || rawTags.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTags);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // 非 JSON 字符串时，按逗号分隔兜底
  }

  return rawTags
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

/**
 * 统一解析后端表单结构，仅接受 fieldsJson / formSchema。
 */
const mapBackendForm = (f: any): FormDefinition => {
  let fields: any[] = [];
  const raw =
    typeof f?.fieldsJson === 'string'
      ? f.fieldsJson
      : typeof f?.formSchema === 'string'
        ? f.formSchema
        : null;

  if (raw) {
    try {
      fields = JSON.parse(raw);
    } catch {
      try {
        const sanitized = raw.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
        fields = JSON.parse(sanitized);
      } catch {
        fields = [];
      }
    }
  } else {
    fields = [];
  }

  return {
    id: String(f?.formId || ''),
    name: f?.formName || '未命名表单',
    fields,
  };
};

/**
 * 解析流程模型 JSON，仅接受合法的 nodes+edges 图模型。
 */
const parseWorkflowNodes = (rawModelJson: unknown, workflowName: string): WorkflowDefinition['nodes'] => {
  const graph = parseWorkflowGraphDefinition(rawModelJson);
  if (!graph) {
    throw new Error(`流程 "${workflowName}" 的 modelJson 不是合法的 nodes+edges 图模型`);
  }
  return convertGraphToWorkflowTree(graph);
};

/**
 * 提取后端返回的可读错误信息，避免仅展示固定失败文案。
 */
const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

export const Workplace = () => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(''); // P3: 分类筛选
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // P3: 标签筛选
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [targetWorkflow, setTargetWorkflow] = useState<WorkflowDefinition | null>(null);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  const [loadingBoundForm, setLoadingBoundForm] = useState(false);
  const [boundFormError, setBoundFormError] = useState<string | null>(null);
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
    getProcessDefinitions({ status: 'PUBLISHED', latestOnly: false }).then(res => {
       if (Array.isArray(res)) {
          // 发起页按 processKey 只保留“最高已发布版本”，避免最新草稿导致已发布流程被隐藏
          const publishedOnly = res.some((w: any) => !!w?.status)
            ? res.filter((w: any) => String(w?.status || '').toUpperCase() === 'PUBLISHED')
            : res;

          const latestPublishedMap = new Map<string, any>();
          for (const item of publishedOnly) {
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
                  // P3: 映射分类和标签字段
                  category: w.category || '',
                  // 与 WorkflowDefinition.tags 类型保持一致，统一存为 JSON 字符串
                  tags: typeof w.tags === 'string' ? w.tags : JSON.stringify(normalizeTags(w.tags)),
                  description: w.description || '',
                  nodes: parseWorkflowNodes(w.modelJson, workflowName)
                };
              } catch (error) {
                invalidModelCount += 1;
                console.warn(`[Workplace] 跳过模型异常流程: ${workflowName}`, error);
                return null;
              }
          })
            .filter((item): item is WorkflowDefinition => item !== null);
          setWorkflows(mapped);
          if (invalidModelCount > 0) {
            toast.warning(`有 ${invalidModelCount} 条流程模型异常，已跳过加载`);
          }
       }
    }).catch((error) => {
      console.error('加载流程列表失败:', error);
      toast.error('加载流程列表失败，请稍后重试');
    });

    // 全量表单接口需要管理员权限，非管理员失败时忽略，后续按 formId 懒加载
    getFormDefinitions()
      .then((res) => {
        if (Array.isArray(res)) {
          setSavedForms(res.map((f: any) => mapBackendForm(f)));
        }
      })
      .catch(() => {
        setSavedForms([]);
      });
  }, []);

  useEffect(() => {
    if (!isFormOpen || !targetWorkflow?.formId) {
      setLoadingBoundForm(false);
      setBoundFormError(null);
      return;
    }

    const formId = targetWorkflow.formId;
    if (savedForms.some((form) => form.id === formId)) {
      setLoadingBoundForm(false);
      setBoundFormError(null);
      return;
    }

    let cancelled = false;
    setLoadingBoundForm(true);
    setBoundFormError(null);

    getFormDefinition(formId)
      .then((res) => {
        if (cancelled) return;
        const mapped = mapBackendForm(res);
        setSavedForms((prev) => {
          const exists = prev.some((item) => item.id === mapped.id);
          if (exists) {
            return prev.map((item) => (item.id === mapped.id ? mapped : item));
          }
          return [...prev, mapped];
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setBoundFormError(err instanceof Error ? err.message : '加载绑定表单失败');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBoundForm(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isFormOpen, savedForms, targetWorkflow?.formId]);
  
  // P3: 筛选逻辑 - 支持搜索、分类和标签筛选
  const filteredWorkflows = workflows.filter(wf => {
    // 搜索词筛选
    const matchesSearch = wf.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 分类筛选
    const matchesCategory = !selectedCategory || wf.category === selectedCategory;
    
    // 标签筛选（任一匹配即可）
    const workflowTags = normalizeTags(wf.tags);
    const matchesTags = selectedTags.length === 0 ||
      selectedTags.some(tag => workflowTags.includes(tag));
    
    return matchesSearch && matchesCategory && matchesTags;
  });

  // P3: 获取所有可用标签（去重）
  const allTags = Array.from(new Set(
    workflows.flatMap(wf => normalizeTags(wf.tags))
  ));

  const handleStartClick = (wf: WorkflowDefinition) => {
    setBoundFormError(null);
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
      
      toast.success("流程发起成功");
      setIsFormOpen(false);
      setTargetWorkflow(null);
      // 跳转到“我的申请”页面
      navigate('/my-apps');
      
    } catch (e) {
      console.error("流程发起失败:", e);
      const message = getApiErrorMessage(e, "流程发起失败，请重试");
      toast.error(message);
    }
  };

  const boundForm = targetWorkflow?.formId
    ? savedForms.find((f) => f.id === targetWorkflow.formId)
    : undefined;

  return (
    <div className="space-y-6">
      {/* 表单渲染弹层 */}
      {isFormOpen && targetWorkflow && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl">
                {targetWorkflow.formId ? (
                loadingBoundForm ? (
                <div className="bg-white p-8 rounded-xl text-center">
                    <h3 className="font-bold">正在加载表单</h3>
                    <p className="text-slate-500 text-sm mb-4">请稍候，正在获取流程绑定的表单定义。</p>
                    <button onClick={() => setIsFormOpen(false)} className="px-4 py-2 bg-slate-100 rounded">关闭</button>
                </div>
                ) : (
                boundForm ? (
                <FormRenderer 
                    formDef={boundForm}
                    onCancel={() => setIsFormOpen(false)}
                    onSubmit={handleStartProcess}
                />
                ) : (
                <div className="bg-white p-8 rounded-xl text-center">
                    <AlertTriangle size={32} className="text-amber-500 mx-auto mb-4"/>
                    <h3 className="font-bold">绑定表单不存在</h3>
                    <p className="text-slate-500 text-sm mb-4">
                      {boundFormError
                        ? `无法加载绑定表单：${boundFormError}`
                        : '流程已绑定的表单可能被删除或无权访问，请联系管理员重新配置流程。'}
                    </p>
                    <button onClick={() => setIsFormOpen(false)} className="px-4 py-2 bg-slate-100 rounded">关闭</button>
                </div>
                )
                )
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
        {filteredWorkflows.map(wf => {
          const workflowTags = normalizeTags(wf.tags);
          return (
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
            {workflowTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {workflowTags.slice(0, 3).map(tag => (
                  <span key={tag} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">
                    {tag}
                  </span>
                ))}
                {workflowTags.length > 3 && (
                  <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded">
                    +{workflowTags.length - 3}
                  </span>
                )}
              </div>
            )}
            
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
              <FormInput size={12}/> 绑定表单: {wf.formId ? '已配置' : '无'}
            </div>
          </div>
        )})}
      </div>
    </div>
  );
};
