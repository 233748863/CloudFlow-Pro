import React, { useState, useEffect } from 'react';
import { 
  Search, 
  FolderOpen, 
  Tag, 
  Edit, 
  Trash2, 
  Archive, 
  CheckSquare, 
  Square,
  X,
  Save,
  RefreshCw
} from 'lucide-react';
import { WorkflowDefinition as BaseWorkflowDefinition, NodeType } from '../../types';
import { getProcessDefinitions, saveProcessDefinition } from '../../services/api/workflow';
import { toast } from 'sonner';

// 扩展 WorkflowDefinition 类型，tags 解析为数组
interface WorkflowDefinition extends Omit<BaseWorkflowDefinition, 'tags'> {
  tags: string[]; // 已解析的标签数组
}

/**
 * 流程管理页面 - 支持批量编辑分类和标签
 * 管理员专用页面
 */
export const ProcessManagement = () => {
  // 流程列表数据
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 筛选条件
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // 批量选择
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // 批量编辑模态框
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [batchEditType, setBatchEditType] = useState<'category' | 'tags'>('category');
  const [batchCategory, setBatchCategory] = useState('');
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [batchTagInput, setBatchTagInput] = useState('');

  // 分类选项
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

  // 常用标签
  const COMMON_TAGS = [
    '审批', '请假', '报销', '采购', '合同', '财务',
    '人事', '考勤', '加班', '出差', '资产', '车辆',
    '紧急', '重要', '常用'
  ];

  // 加载流程列表
  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const res = await getProcessDefinitions();
      if (Array.isArray(res)) {
        const mapped = res.map((w: any) => ({
          id: w.definitionId || w.processKey,
          name: w.processName || w.name,
          key: w.processKey || w.key,
          version: w.version,
          formId: w.formId,
          category: w.category || '',
          tags: w.tags ? (typeof w.tags === 'string' ? JSON.parse(w.tags) : w.tags) : [],
          description: w.description || '',
          nodes: w.modelJson ? JSON.parse(w.modelJson) : { type: NodeType.START, title: '开始', id: 'start' }
        }));
        setWorkflows(mapped);
      }
    } catch (error) {
      console.error('加载流程列表失败:', error);
      toast.error('加载流程列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  // 筛选逻辑
  const filteredWorkflows = workflows.filter(wf => {
    const matchesSearch = wf.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || wf.category === selectedCategory;
    const matchesTags = selectedTags.length === 0 || 
      selectedTags.some(tag => wf.tags.includes(tag));
    return matchesSearch && matchesCategory && matchesTags;
  });

  // 获取所有可用标签
  const allTags = Array.from(new Set(
    workflows.flatMap(wf => wf.tags)
  ));

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedIds.length === filteredWorkflows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredWorkflows.map(wf => wf.id));
    }
  };

  // 单选
  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // 打开批量编辑模态框
  const openBatchEdit = (type: 'category' | 'tags') => {
    if (selectedIds.length === 0) {
      toast.error('请先选择要编辑的流程');
      return;
    }
    setBatchEditType(type);
    setBatchCategory('');
    setBatchTags([]);
    setBatchTagInput('');
    setShowBatchEditModal(true);
  };

  // 批量修改分类
  const handleBatchUpdateCategory = async () => {
    if (!batchCategory) {
      toast.error('请选择分类');
      return;
    }

    setLoading(true);
    try {
      // 批量更新选中的流程
      const updatePromises = selectedIds.map(async (id) => {
        const workflow = workflows.find(wf => wf.id === id);
        if (!workflow) return;

        await saveProcessDefinition({
          definitionId: id,
          processName: workflow.name,
          processKey: workflow.key,
          modelJson: JSON.stringify(workflow.nodes),
          category: batchCategory,
          tags: workflow.tags.length > 0 ? JSON.stringify(workflow.tags) : undefined,
          description: workflow.description,
          formId: workflow.formId,
        });
      });

      await Promise.all(updatePromises);
      
      toast.success(`成功修改 ${selectedIds.length} 个流程的分类`);
      setShowBatchEditModal(false);
      setSelectedIds([]);
      loadWorkflows(); // 重新加载列表
    } catch (error) {
      console.error('批量修改分类失败:', error);
      toast.error('批量修改分类失败');
    } finally {
      setLoading(false);
    }
  };

  // 批量添加标签
  const handleBatchAddTags = async () => {
    if (batchTags.length === 0) {
      toast.error('请添加至少一个标签');
      return;
    }

    setLoading(true);
    try {
      // 批量更新选中的流程
      const updatePromises = selectedIds.map(async (id) => {
        const workflow = workflows.find(wf => wf.id === id);
        if (!workflow) return;

        // 合并现有标签和新标签，去重
        const existingTags = workflow.tags;
        const mergedTags = Array.from(new Set([...existingTags, ...batchTags]));

        await saveProcessDefinition({
          definitionId: id,
          processName: workflow.name,
          processKey: workflow.key,
          modelJson: JSON.stringify(workflow.nodes),
          category: workflow.category,
          tags: JSON.stringify(mergedTags),
          description: workflow.description,
          formId: workflow.formId,
        });
      });

      await Promise.all(updatePromises);
      
      toast.success(`成功为 ${selectedIds.length} 个流程添加标签`);
      setShowBatchEditModal(false);
      setSelectedIds([]);
      loadWorkflows(); // 重新加载列表
    } catch (error) {
      console.error('批量添加标签失败:', error);
      toast.error('批量添加标签失败');
    } finally {
      setLoading(false);
    }
  };

  // 添加批量标签
  const addBatchTag = (tag: string) => {
    if (tag && !batchTags.includes(tag)) {
      setBatchTags([...batchTags, tag]);
    }
  };

  // 移除批量标签
  const removeBatchTag = (tag: string) => {
    setBatchTags(batchTags.filter(t => t !== tag));
  };

  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">流程管理</h2>
          <p className="text-slate-500 mt-1 text-sm">管理流程定义，支持批量修改分类和标签</p>
        </div>
        <button
          onClick={loadWorkflows}
          disabled={loading}
          className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
          <input 
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:ring-2 focus:ring-pink-400 outline-none" 
            placeholder="搜索流程名称..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* 分类筛选 */}
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

        {/* 标签筛选 */}
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
                清除筛选
              </button>
            )}
          </div>
        )}
      </div>

      {/* 批量操作工具栏 */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-pink-500 transition-colors"
          >
            {selectedIds.length === filteredWorkflows.length && filteredWorkflows.length > 0 ? (
              <CheckSquare size={18} className="text-pink-500" />
            ) : (
              <Square size={18} />
            )}
            全选 ({selectedIds.length}/{filteredWorkflows.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openBatchEdit('category')}
            disabled={selectedIds.length === 0}
            className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <FolderOpen size={16} />
            批量修改分类
          </button>
          <button
            onClick={() => openBatchEdit('tags')}
            disabled={selectedIds.length === 0}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <Tag size={16} />
            批量添加标签
          </button>
        </div>
      </div>

      {/* 流程列表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-12">
                选择
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                流程名称
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                流程Key
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                分类
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                标签
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                版本
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw size={16} className="animate-spin" />
                    加载中...
                  </div>
                </td>
              </tr>
            ) : filteredWorkflows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  暂无流程数据
                </td>
              </tr>
            ) : (
              filteredWorkflows.map(wf => (
                <tr key={wf.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleSelectOne(wf.id)}
                      className="text-slate-400 hover:text-pink-500 transition-colors"
                    >
                      {selectedIds.includes(wf.id) ? (
                        <CheckSquare size={18} className="text-pink-500" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800">{wf.name}</div>
                    {wf.description && (
                      <div className="text-xs text-slate-500 mt-1 line-clamp-1">{wf.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{wf.key}</td>
                  <td className="px-4 py-3">
                    {wf.category ? (
                      <span className="px-2 py-1 text-xs font-medium bg-pink-100 text-pink-600 rounded-md flex items-center gap-1 w-fit">
                        <FolderOpen size={10} />
                        {CATEGORY_LABELS[wf.category] || wf.category}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">未分类</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {wf.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {wf.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">
                            {tag}
                          </span>
                        ))}
                        {wf.tags.length > 3 && (
                          <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded">
                            +{wf.tags.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">无标签</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">v{wf.version}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 批量编辑模态框 */}
      {showBatchEditModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            {/* 模态框标题 */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {batchEditType === 'category' ? '批量修改分类' : '批量添加标签'}
              </h3>
              <button
                onClick={() => setShowBatchEditModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 模态框内容 */}
            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-600 mb-4">
                已选择 <span className="font-bold text-pink-500">{selectedIds.length}</span> 个流程
              </div>

              {batchEditType === 'category' ? (
                // 分类选择
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    选择分类
                  </label>
                  <select
                    value={batchCategory}
                    onChange={(e) => setBatchCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
                  >
                    <option value="">请选择分类</option>
                    {Object.entries(CATEGORY_LABELS)
                      .filter(([key]) => key !== '')
                      .map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                  </select>
                </div>
              ) : (
                // 标签添加
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    添加标签
                  </label>
                  
                  {/* 标签输入 */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={batchTagInput}
                      onChange={(e) => setBatchTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && batchTagInput.trim()) {
                          addBatchTag(batchTagInput.trim());
                          setBatchTagInput('');
                        }
                      }}
                      placeholder="输入标签后按回车"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                    />
                    <button
                      onClick={() => {
                        if (batchTagInput.trim()) {
                          addBatchTag(batchTagInput.trim());
                          setBatchTagInput('');
                        }
                      }}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm"
                    >
                      添加
                    </button>
                  </div>

                  {/* 已添加的标签 */}
                  {batchTags.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-slate-600 mb-2">已添加的标签:</div>
                      <div className="flex flex-wrap gap-2">
                        {batchTags.map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded flex items-center gap-1"
                          >
                            {tag}
                            <button
                              onClick={() => removeBatchTag(tag)}
                              className="hover:text-blue-800"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 常用标签快捷选择 */}
                  <div>
                    <div className="text-xs text-slate-600 mb-2">常用标签:</div>
                    <div className="flex flex-wrap gap-2">
                      {COMMON_TAGS.map(tag => (
                        <button
                          key={tag}
                          onClick={() => addBatchTag(tag)}
                          disabled={batchTags.includes(tag)}
                          className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 模态框底部按钮 */}
            <div className="flex items-center justify-end gap-2 p-6 border-t border-slate-200">
              <button
                onClick={() => setShowBatchEditModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                取消
              </button>
              <button
                onClick={batchEditType === 'category' ? handleBatchUpdateCategory : handleBatchAddTags}
                disabled={loading || (batchEditType === 'category' ? !batchCategory : batchTags.length === 0)}
                className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
