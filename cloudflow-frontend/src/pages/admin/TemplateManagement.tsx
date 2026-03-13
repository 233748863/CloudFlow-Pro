import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit,
  FolderPlus,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import request from '../../services/api/request';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';
import { PermissionGuard } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';

interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  categoryName?: string;
  tags?: string[];
  usageCount?: number;
  status: 'active' | 'inactive';
  definition?: unknown;
  previewImage?: string;
}

interface CategoryNode {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  orderNum?: number;
  templateCount?: number;
  children?: CategoryNode[];
}

interface FlatCategoryNode extends CategoryNode {
  depth: number;
}

interface TemplateListResult {
  records: TemplateItem[];
  total: number;
}

const DEFAULT_TEMPLATE_DEFINITION = {
  nodes: [
    {
      id: 'start',
      type: 'START',
      title: '开始'
    },
    {
      id: 'end',
      type: 'END',
      title: '流程结束'
    }
  ],
  edges: [
    {
      id: 'start->end',
      source: 'start',
      target: 'end'
    }
  ]
};

const flattenCategoryTree = (
  nodes: CategoryNode[],
  depth: number = 0,
  result: FlatCategoryNode[] = []
): FlatCategoryNode[] => {
  nodes.forEach((node) => {
    result.push({ ...node, depth });
    if (node.children?.length) {
      flattenCategoryTree(node.children, depth + 1, result);
    }
  });
  return result;
};

const collectDescendantIds = (node: CategoryNode): Set<string> => {
  const ids = new Set<string>();
  const walk = (current?: CategoryNode) => {
    if (!current?.children?.length) {
      return;
    }
    current.children.forEach((child) => {
      ids.add(child.id);
      walk(child);
    });
  };
  walk(node);
  return ids;
};

export const TemplateManagement = () => {
  const { isAdmin, canManageTemplates } = useWorkflowPermission();

  if (!isAdmin || !canManageTemplates) {
    return (
      <PermissionGuard permissions={[]} roles={[]} hidden={false}>
        <div />
      </PermissionGuard>
    );
  }

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    tags: [] as string[],
    definition: JSON.stringify(DEFAULT_TEMPLATE_DEFINITION, null, 2),
    previewImage: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [tagInput, setTagInput] = useState('');

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    parentId: '',
    orderNum: 0
  });

  const flatCategories = useMemo(() => flattenCategoryTree(categories), [categories]);

  const selectableParentCategories = useMemo(() => {
    if (!editingCategory) {
      return flatCategories;
    }

    const descendants = collectDescendantIds(editingCategory);
    return flatCategories.filter((item) => item.id !== editingCategory.id && !descendants.has(item.id));
  }, [editingCategory, flatCategories]);

  const loadCategories = async () => {
    try {
      const data = await request.get<CategoryNode[]>('/workflow/templates/categories');
      setCategories(data || []);
    } catch (error) {
      console.error('加载分类失败:', error);
      toast.error('加载分类失败');
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        pageNum: currentPage,
        pageSize
      };
      if (selectedCategory) {
        params.categoryId = selectedCategory;
      }
      if (searchTerm) {
        params.keyword = searchTerm;
      }

      const data = await request.get<TemplateListResult>('/workflow/templates', { params });
      setTemplates(data?.records || []);
      setTotal(data?.total || 0);
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

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      description: '',
      categoryId: '',
      tags: [],
      definition: JSON.stringify(DEFAULT_TEMPLATE_DEFINITION, null, 2),
      previewImage: '',
      status: 'active'
    });
    setTagInput('');
    setShowTemplateModal(true);
  };

  const handleEditTemplate = (template: TemplateItem) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name || '',
      description: template.description || '',
      categoryId: template.categoryId || '',
      tags: template.tags || [],
      definition: JSON.stringify(template.definition || DEFAULT_TEMPLATE_DEFINITION, null, 2),
      previewImage: template.previewImage || '',
      status: template.status || 'active'
    });
    setTagInput('');
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    const name = templateForm.name.trim();
    if (!name) {
      toast.error('请输入模板名称');
      return;
    }
    if (!templateForm.categoryId) {
      toast.error('请选择模板分类');
      return;
    }
    if (templateForm.tags.length === 0) {
      toast.error('请至少添加一个标签');
      return;
    }

    let definitionData: unknown;
    try {
      definitionData = JSON.parse(templateForm.definition);
    } catch (error) {
      toast.error('流程定义 JSON 格式不正确');
      return;
    }

    const payload = {
      name,
      description: templateForm.description.trim(),
      categoryId: templateForm.categoryId,
      tags: templateForm.tags,
      definition: definitionData,
      previewImage: templateForm.previewImage.trim(),
      status: templateForm.status
    };

    try {
      if (editingTemplate) {
        await request.put(`/workflow/templates/${editingTemplate.id}`, payload);
        toast.success('模板更新成功');
      } else {
        await request.post('/workflow/templates', payload);
        toast.success('模板创建成功');
      }
      setShowTemplateModal(false);
      loadTemplates();
    } catch (error) {
      console.error('保存模板失败:', error);
      toast.error('保存模板失败');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('确定要删除此模板吗？此操作不可恢复。')) {
      return;
    }

    try {
      await request.delete(`/workflow/templates/${id}`);
      toast.success('模板删除成功');
      loadTemplates();
    } catch (error) {
      console.error('删除模板失败:', error);
      toast.error('删除模板失败');
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag) {
      return;
    }
    if (templateForm.tags.includes(tag)) {
      toast.error('标签已存在');
      return;
    }
    setTemplateForm((prev) => ({
      ...prev,
      tags: [...prev.tags, tag]
    }));
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTemplateForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((item) => item !== tag)
    }));
  };

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

  const handleEditCategory = (category: CategoryNode) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name || '',
      description: category.description || '',
      parentId: category.parentId || '',
      orderNum: category.orderNum ?? 0
    });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    const name = categoryForm.name.trim();
    if (!name) {
      toast.error('请输入分类名称');
      return;
    }

    const payload = {
      name,
      description: categoryForm.description.trim(),
      parentId: categoryForm.parentId || null,
      orderNum: categoryForm.orderNum ?? 0
    };

    try {
      if (editingCategory) {
        await request.put(`/workflow/templates/categories/${editingCategory.id}`, payload);
        toast.success('分类更新成功');
      } else {
        await request.post('/workflow/templates/categories', payload);
        toast.success('分类创建成功');
      }
      setShowCategoryModal(false);
      await loadCategories();
    } catch (error) {
      console.error('保存分类失败:', error);
      toast.error('保存分类失败');
    }
  };

  const handleDeleteCategory = async (category: CategoryNode) => {
    if (!window.confirm(`确定要删除分类“${category.name}”吗？`)) {
      return;
    }

    try {
      await request.delete(`/workflow/templates/categories/${category.id}`);
      toast.success('分类删除成功');
      if (selectedCategory === category.id) {
        setSelectedCategory('');
      }
      await loadCategories();
      await loadTemplates();
    } catch (error) {
      console.error('删除分类失败:', error);
      toast.error('删除分类失败');
    }
  };

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
          {flatCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {'　'.repeat(cat.depth)}
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border mb-6">
        <div className="px-6 py-3 border-b text-sm font-medium text-gray-700">分类管理</div>
        {flatCategories.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无分类</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">分类名称</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">描述</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">模板数</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">排序</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-700 w-48">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {flatCategories.map((category) => (
                <tr key={category.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm">
                    <span style={{ paddingLeft: `${category.depth * 16}px` }}>{category.name}</span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">{category.description || '-'}</td>
                  <td className="px-6 py-3 text-sm">{category.templateCount ?? 0}</td>
                  <td className="px-6 py-3 text-sm">{category.orderNum ?? 0}</td>
                  <td className="px-6 py-3 whitespace-nowrap text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        {
                          label: '编辑',
                          icon: <Edit className="w-4 h-4" />,
                          onClick: () => handleEditCategory(category),
                          tone: 'primary',
                          title: '编辑分类',
                        },
                        {
                          label: '删除',
                          icon: <Trash2 className="w-4 h-4" />,
                          onClick: () => handleDeleteCategory(category),
                          tone: 'danger',
                          title: '删除分类',
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-700 w-52">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {templates.map((template) => (
                <tr key={template.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium">{template.name}</div>
                      <div className="text-sm text-gray-500">{template.description || '-'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{template.categoryName || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {template.tags?.slice(0, 3).map((tag) => (
                        <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                      {(template.tags?.length || 0) > 3 && (
                        <span className="px-2 py-1 text-gray-500 text-xs">
                          +{(template.tags?.length || 0) - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{template.usageCount ?? 0}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        template.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {template.status === 'active' ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        {
                          label: '编辑',
                          icon: <Edit className="w-4 h-4" />,
                          onClick: () => handleEditTemplate(template),
                          tone: 'primary',
                          title: '编辑模板',
                        },
                        {
                          label: '删除',
                          icon: <Trash2 className="w-4 h-4" />,
                          onClick: () => handleDeleteTemplate(template.id),
                          tone: 'danger',
                          title: '删除模板',
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div className="flex justify-center mt-6 gap-2">
          <button
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            上一页
          </button>
          <span className="px-4 py-2">
            第 {currentPage} / {Math.ceil(total / pageSize)} 页
          </span>
          <button
            onClick={() => setCurrentPage((page) => Math.min(Math.ceil(total / pageSize), page + 1))}
            disabled={currentPage >= Math.ceil(total / pageSize)}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{editingTemplate ? '编辑模板' : '新建模板'}</h2>
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
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="请输入模板名称"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">模板描述 *</label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="请输入模板描述"
                  rows={3}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">分类 *</label>
                <select
                  value={templateForm.categoryId}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">请选择分类</option>
                  {flatCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {'　'.repeat(cat.depth)}
                      {cat.name}
                    </option>
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
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
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
                  {templateForm.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full flex items-center gap-2"
                    >
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
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, definition: e.target.value }))}
                  rows={8}
                  className="w-full px-3 py-2 border rounded font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">预览图 URL</label>
                <input
                  type="text"
                  value={templateForm.previewImage}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, previewImage: e.target.value }))}
                  placeholder="请输入预览图 URL（可选）"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">状态</label>
                <select
                  value={templateForm.status}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))
                  }
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

      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{editingCategory ? '编辑分类' : '新建分类'}</h2>
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
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="请输入分类名称"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">分类描述</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="请输入分类描述（可选）"
                  rows={3}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">父分类</label>
                <select
                  value={categoryForm.parentId}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, parentId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">无（顶级分类）</option>
                  {selectableParentCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {'　'.repeat(cat.depth)}
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">排序号</label>
                <input
                  type="number"
                  value={categoryForm.orderNum}
                  onChange={(e) =>
                    setCategoryForm((prev) => ({ ...prev, orderNum: Number.parseInt(e.target.value, 10) || 0 }))
                  }
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
