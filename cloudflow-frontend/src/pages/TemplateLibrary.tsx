import React, { useState, useEffect } from 'react';
import { 
  Search, 
  FolderOpen, 
  Tag, 
  Eye,
  Plus,
  Grid,
  List,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

/**
 * 模板库页面 - 用户端
 * 展示所有可用的流程模板，支持筛选和预览
 * 权限控制：
 * - 所有用户可以查看模板库
 * - 需要登录才能使用模板创建流程
 */
export const TemplateLibrary = () => {
  // 用户认证
  const { user } = useAuth();
  // 模板列表数据
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 分类树
  const [categories, setCategories] = useState<any[]>([]);
  
  // 筛选条件
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // 视图模式
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(12);
  const [total, setTotal] = useState(0);
  
  // 预览模态框
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  
  // 创建流程模态框
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState<string>('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');

  // 加载分类树
  const loadCategories = async () => {
    try {
      const response = await fetch('/api/workflow/templates/categories');
      const result = await response.json();
      if (result.code === 200) {
        setCategories(result.data || []);
      }
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  };

  // 加载模板列表
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        pageNum: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      
      if (selectedCategory) {
        params.append('categoryId', selectedCategory);
      }
      if (selectedTags.length > 0) {
        params.append('tags', selectedTags.join(','));
      }
      if (searchTerm) {
        params.append('keyword', searchTerm);
      }
      
      const response = await fetch(`/api/workflow/templates?${params}`);
      const result = await response.json();
      
      if (result.code === 200) {
        setTemplates(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        toast.error(result.msg || '加载模板失败');
      }
    } catch (error) {
      console.error('加载模板失败:', error);
      toast.error('加载模板失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [currentPage, selectedCategory, selectedTags, searchTerm]);

  // 处理标签选择
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
    setCurrentPage(1);
  };

  // 预览模板
  const handlePreview = (template: any) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  };

  // 从模板创建流程
  const handleCreateFromTemplate = (templateId: string) => {
    // 检查用户是否登录
    if (!user) {
      toast.error('请先登录后再使用模板创建流程');
      return;
    }
    
    setCreateTemplateId(templateId);
    setWorkflowName('');
    setWorkflowDescription('');
    setShowCreateModal(true);
  };

  // 提交创建流程
  const submitCreateWorkflow = async () => {
    if (!workflowName.trim()) {
      toast.error('请输入流程名称');
      return;
    }

    try {
      const response = await fetch(`/api/workflow/templates/${createTemplateId}/create-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowName: workflowName.trim(),
          description: workflowDescription.trim()
        })
      });

      const result = await response.json();
      
      if (result.code === 200) {
        toast.success('流程创建成功');
        setShowCreateModal(false);
        // 跳转到流程设计页面
        window.location.href = `/workflow/design?id=${result.data.definitionId}`;
      } else {
        toast.error(result.msg || '创建流程失败');
      }
    } catch (error) {
      console.error('创建流程失败:', error);
      toast.error('创建流程失败');
    }
  };

  // 渲染分类树
  const renderCategoryTree = (nodes: any[], level = 0) => {
    return nodes.map(node => (
      <div key={node.id} style={{ marginLeft: level * 16 }}>
        <button
          onClick={() => {
            setSelectedCategory(node.id);
            setCurrentPage(1);
          }}
          className={`w-full text-left px-3 py-2 rounded hover:bg-gray-100 ${
            selectedCategory === node.id ? 'bg-blue-50 text-blue-600' : ''
          }`}
        >
          <FolderOpen className="inline w-4 h-4 mr-2" />
          {node.name}
          {node.templateCount > 0 && (
            <span className="ml-2 text-xs text-gray-500">({node.templateCount})</span>
          )}
        </button>
        {node.children && node.children.length > 0 && renderCategoryTree(node.children, level + 1)}
      </div>
    ));
  };

  return (
    <div className="flex h-full">
      {/* 左侧边栏 - 分类和标签筛选 */}
      <div className="w-64 border-r bg-white p-4 overflow-y-auto">
        <h3 className="font-semibold mb-4">分类</h3>
        <button
          onClick={() => {
            setSelectedCategory('');
            setCurrentPage(1);
          }}
          className={`w-full text-left px-3 py-2 rounded hover:bg-gray-100 mb-2 ${
            !selectedCategory ? 'bg-blue-50 text-blue-600' : ''
          }`}
        >
          全部模板
        </button>
        {renderCategoryTree(categories)}

        <h3 className="font-semibold mt-6 mb-4">常用标签</h3>
        <div className="flex flex-wrap gap-2">
          {['审批', '请假', '报销', '采购', '合同', '财务', '人事'].map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 rounded-full text-sm ${
                selectedTags.includes(tag)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索模板..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 border rounded-lg w-80"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 模板列表 */}
        {loading ? (
          <div className="text-center py-12">加载中...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">暂无模板</div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map(template => (
              <div key={template.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  {template.isSystem && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">系统</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{template.description}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {template.tags?.map((tag: string) => (
                    <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span>使用 {template.usageCount} 次</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePreview(template)}
                    className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    <Eye className="inline w-4 h-4 mr-1" />
                    预览
                  </button>
                  <button
                    onClick={() => handleCreateFromTemplate(template.id)}
                    disabled={!user}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!user ? '请先登录' : '使用此模板创建流程'}
                  >
                    <Plus className="inline w-4 h-4 mr-1" />
                    使用
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map(template => (
              <div key={template.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{template.name}</h3>
                      {template.isSystem && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">系统</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>使用 {template.usageCount} 次</span>
                      <div className="flex gap-2">
                        {template.tags?.map((tag: string) => (
                          <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handlePreview(template)}
                      className="px-4 py-2 border rounded hover:bg-gray-50"
                    >
                      预览
                    </button>
                    <button
                      onClick={() => handleCreateFromTemplate(template.id)}
                      disabled={!user}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!user ? '请先登录' : '使用此模板创建流程'}
                    >
                      使用模板
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {total > pageSize && (
          <div className="flex justify-center mt-6 gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              上一页
            </button>
            <span className="px-4 py-2">
              第 {currentPage} / {Math.ceil(total / pageSize)} 页
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(total / pageSize), p + 1))}
              disabled={currentPage >= Math.ceil(total / pageSize)}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* 预览模态框 */}
      {showPreview && previewTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{previewTemplate.name}</h2>
              <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 mb-4">{previewTemplate.description}</p>
            <div className="border rounded p-4 bg-gray-50">
              <p className="text-sm text-gray-500">流程图预览功能开发中...</p>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setShowPreview(false);
                  handleCreateFromTemplate(previewTemplate.id);
                }}
                disabled={!user}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!user ? '请先登录' : '使用此模板创建流程'}
              >
                使用此模板
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建流程模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">从模板创建流程</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">流程名称 *</label>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="请输入流程名称"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">流程描述</label>
                <textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="请输入流程描述（可选）"
                  rows={3}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={submitCreateWorkflow}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateLibrary;
