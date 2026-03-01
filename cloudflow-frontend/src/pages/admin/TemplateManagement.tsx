import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus,
  Edit, 
  Trash2,
  FolderPlus,
  Save,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';
import { PermissionGuard } from '../../components/ui/PermissionGuard';

/**
 * 模板管理页面 - 管理员端
 * 管理流程模板和分类
 * 仅管理员可访问
 */
export const TemplateManagement = () => {
  // 权限控制
  const { isAdmin, canManageTemplates } = useWorkflowPermission();

  // 如果不是管理员，显示无权限提示
  if (!isAdmin || !canManageTemplates) {
    return (
      <PermissionGuard permissions={[]} roles={[]} hidden={false}>
        <div />
      </PermissionGuard>
    );
  }
  // 模板列表
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 分类列表
  const [categories, setCategories] = useState<any[]>([]);
  
  // 筛选条件
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  
  // 模板编辑模态框
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    tags: [] as string[],
    definition: '',
    previewImage: '',
    status: 'active'
  });
  const [tagInput, setTagInput] = useState('');
  
  // 分类编辑模态框
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    parentId: '',
    orderNum: 0
  });

  // 加载分类列表
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
  }, [currentPage, selectedCategory, searchTerm]);

  // 打开创建模板对话框
  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      description: '',
      categoryId: '',
      tags: [],
      definition: '{"nodes":[],"edges":[]}',
      previewImage: '',
      status: 'active'
    });
    setShowTemplateModal(true);
  };

  // 打开编辑模板对话框
  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      description: template.description,
      categoryId: template.categoryId,
      tags: template.tags || [],
      definition: JSON.stringify(template.definition),
      previewImage: template.previewImage || '',
      status: template.status
    });
    setShowTemplateModal(true);
  };

  // 保存模板
  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast.error('请输入模板名称');
      return;
    }
    if (!templateForm.categoryId) {
      toast.error('请选择模板分类');
      return;
    }
    if (templateForm.tags.length === 0) {
      toast.error('请添加至少一个标签');
      return;
    }

    try {
      const url = editingTemplate
        ? `/api/workflow/templates/${editingTemplate.id}`
        : '/api/workflow/templates';
      
      const method = editingTemplate ? 'PUT' : 'POST';
      
      const body = {
        name: templateForm.name.trim(),
        description: templateForm.description.trim(),
        categoryId: templateForm.categoryId,
        tags: templateForm.tags,
        definition: JSON.parse(templateForm.definition),
        previewImage: templateForm.previewImage.trim(),
        status: templateForm.status
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      
      if (result.code === 200) {
        toast.success(editingTemplate ? '模板更新成功' : '模板创建成功');
        setShowTemplateModal(false);
        loadTemplates();
      } else {
        toast.error(result.msg || '保存模板失败');
      }
    } catch (error) {
      console.error('保存模板失败:', error);
      toast.error('保存模板失败');
    }
  };

  // 删除模板
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('确定要删除此模板吗？此操作不可恢复。')) {
      return;
    }

    try {
      const response = await fetch(`/api/workflow/templates/${id}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.code === 200) {
        toast.success('模板删除成功');
        loadTemplates();
      } else {
        toast.error(result.msg || '删除模板失败');
      }
    } catch (error) {
      console.error('删除模板失败:', error);
      toast.error('删除模板失败');
    }
  };

  // 添加标签
  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    
    if (templateForm.tags.includes(tag)) {
      toast.error('标签已存在');
      return;
    }
    
    setTemplateForm(prev => ({
      ...prev,
      tags: [...prev.tags, tag]
    }));
    setTagInput('');
  };

  // 移除标签
  const handleRemoveTag = (tag: string) => {
    setTemplateForm(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  // 打开创建分类对话框
  const handleCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm({
      name: '',
      description: '',
      parentId: '',
      orderNum: 0
    });
    setShowCategoryModal(true);
  };

  // 保存分类
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('请输入分类名称');
      return;
    }

    try {
      // 这里需要实现分类管理的 API
      toast.info('分类管理功能开发中...');
      setShowCategoryModal(false);
    } catch (error) {
      console.error('保存分类失败:', error);
      toast.error('保存分类失败');
    }
  };

  // 扁平化分类树
  const flattenCategories = (nodes: any[], result: any[] = []): any[] => {
    nodes.forEach(node => {
      result.push(node);
      if (node.children && node.children.length > 0) {
        flattenCategories(node.children, result);
      }
    });
    return result;
  };

  const flatCategories = flattenCategories(categories);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">模板管理</h1>
        <div className="flex gap-2">
          <button
            onClick={handleCreateCategory}
            className="px-4 py-2 border rounded hover:bg-gray-50 flex items-center gap-2"
          >
            <FolderPlus className="w-4 h-4" />
            新建分类
          </button>
          <button
            onClick={handleCreateTemplate}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            新建模板
          </button>
        </div>
      </div>

      {/* 筛选工具栏 */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索模板..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 pr-4 py-2 border rounded-lg w-full"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setCurrentPage(1);
          }}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="">全部分类</option>
          {flatCategories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* 模板列表 */}
      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无模板</div>
      ) : (
        <div className="bg-white rounded-lg border">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">模板名称</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">分类</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">标签</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">使用次数</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">状态</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {templates.map(template => (
                <tr key={template.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium">{template.name}</div>
                      <div className="text-sm text-gray-500">{template.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{template.categoryName || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {template.tags?.slice(0, 3).map((tag: string) => (
                        <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                      {template.tags?.length > 3 && (
                        <span className="px-2 py-1 text-gray-500 text-xs">+{template.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{template.usageCount}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded ${
                      template.status === 'active' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {template.status === 'active' ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditTemplate(template)}
                        className="p-2 hover:bg-gray-100 rounded"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* 模板编辑模态框 */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {editingTemplate ? '编辑模板' : '新建模板'}
              </h2>
              <button onClick={() => setShowTemplateModal(false)} className="p-2 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">模板名称 *</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="请输入模板名称"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">模板描述 *</label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="请输入模板描述"
                  rows={3}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">分类 *</label>
                <select
                  value={templateForm.categoryId}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">请选择分类</option>
                  {flatCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">标签 *</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    placeholder="输入标签后按回车"
                    className="flex-1 px-3 py-2 border rounded"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    添加
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {templateForm.tags.map(tag => (
                    <span key={tag} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full flex items-center gap-2">
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} className="hover:text-blue-900">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">流程定义 (JSON) *</label>
                <textarea
                  value={templateForm.definition}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, definition: e.target.value }))}
                  placeholder='{"nodes":[],"edges":[]}'
                  rows={6}
                  className="w-full px-3 py-2 border rounded font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">预览图 URL</label>
                <input
                  type="text"
                  value={templateForm.previewImage}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, previewImage: e.target.value }))}
                  placeholder="请输入预览图 URL（可选）"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">状态</label>
                <select
                  value={templateForm.status}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="active">启用</option>
                  <option value="inactive">禁用</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveTemplate}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分类编辑模态框 */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {editingCategory ? '编辑分类' : '新建分类'}
              </h2>
              <button onClick={() => setShowCategoryModal(false)} className="p-2 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">分类名称 *</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="请输入分类名称"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">分类描述</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="请输入分类描述（可选）"
                  rows={3}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">父分类</label>
                <select
                  value={categoryForm.parentId}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, parentId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">无（顶级分类）</option>
                  {flatCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">排序号</label>
                <input
                  type="number"
                  value={categoryForm.orderNum}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, orderNum: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveCategory}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateManagement;
