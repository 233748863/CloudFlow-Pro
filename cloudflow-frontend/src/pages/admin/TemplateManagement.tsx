import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit,
  FolderOpen,
  FolderPlus,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldOff,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { cn } from '@/utils/cn';
import request from '../../services/api/request';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';

type TemplateStatus = 'active' | 'inactive';
type StatusFilter = 'all' | 'active' | 'inactive';

interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  categoryName?: string;
  tags?: string[] | string | null;
  usageCount?: number;
  status: TemplateStatus;
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

interface TemplateFormState {
  name: string;
  description: string;
  categoryId: string;
  tags: string[];
  definition: string;
  previewImage: string;
  status: TemplateStatus;
}

interface CategoryFormState {
  name: string;
  description: string;
  parentId: string;
  orderNum: number;
}

type DeleteTarget =
  | { type: 'template'; id: string; name: string }
  | { type: 'category'; id: string; name: string };

const DEFAULT_TEMPLATE_DEFINITION = {
  nodes: [
    { id: 'start', type: 'START', title: '开始' },
    { id: 'end', type: 'END', title: '流程结束' },
  ],
  edges: [{ id: 'start->end', source: 'start', target: 'end' }],
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const fieldLabelClassName = 'text-xs font-medium text-slate-500 dark:text-slate-400';
const tagTokenClassName =
  'inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200';
const selectTriggerClassName = 'h-10';

const createTemplateForm = (): TemplateFormState => ({
  name: '',
  description: '',
  categoryId: '',
  tags: [],
  definition: JSON.stringify(DEFAULT_TEMPLATE_DEFINITION, null, 2),
  previewImage: '',
  status: 'active',
});

const createCategoryForm = (): CategoryFormState => ({
  name: '',
  description: '',
  parentId: '',
  orderNum: 0,
});

const normalizeTemplateTags = (tags?: TemplateItem['tags']): string[] => {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof tags !== 'string') {
    return [];
  }

  const trimmed = tags.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag).trim()).filter(Boolean);
    }
  } catch {
    // Fallback to delimiter parsing for legacy comma-separated tags.
  }

  return trimmed.split(/[,，;；]/).map((tag) => tag.trim()).filter(Boolean);
};

const normalizeTemplateItem = (template: TemplateItem): TemplateItem => ({
  ...template,
  tags: normalizeTemplateTags(template.tags),
  status: template.status || 'active',
});

const flattenCategoryTree = (
  nodes: CategoryNode[],
  depth = 0,
  result: FlatCategoryNode[] = [],
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
    current?.children?.forEach((child) => {
      ids.add(child.id);
      walk(child);
    });
  };

  walk(node);
  return ids;
};

const formatTemplateTags = (tags?: TemplateItem['tags']) => {
  const normalizedTags = normalizeTemplateTags(tags);
  if (normalizedTags.length === 0) {
    return '-';
  }

  const visibleTags = normalizedTags.slice(0, 2).join(' / ');
  return normalizedTags.length > 2 ? `${visibleTags} +${normalizedTags.length - 2}` : visibleTags;
};

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
);

const AccessState: React.FC<{
  title: string;
  description: string;
}> = ({ title, description }) => (
  <section className="admin-source-page admin-template-management-page">
    <TablePageLayout
      table={(
        <InnerTableSurface
          className="flex min-h-0 flex-1 flex-col"
          wrapperClassName="flex min-h-0 flex-1 flex-col"
        >
        <div className="flex flex-col items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-6 py-10 text-center dark:border-slate-800 dark:bg-slate-950">
          <div className="admin-source-stat-icon mb-4">
            <ShieldOff className="h-5 w-5" />
          </div>
          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
          <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</div>
        </div>
        </InnerTableSurface>
      )}
    />
  </section>
);

const RowActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'danger';
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}> = ({ label, icon, tone = 'neutral', onClick, className }) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    onClick={onClick}
    className={cn(
      'h-8 w-8 rounded-md p-0 shadow-none',
      tone === 'danger'
        ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
        : 'text-slate-400 hover:bg-[var(--cf-surface-muted)] hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200',
      className,
    )}
    title={label}
    aria-label={label}
  >
    {icon}
  </Button>
);

export const TemplateManagement: React.FC = () => {
  const { isAdmin, canManageTemplates } = useWorkflowPermission();

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [filters, setFilters] = useState<{ keyword: string; status: StatusFilter }>({
    keyword: '',
    status: 'all',
  });
  const [query, setQuery] = useState<{ keyword: string; status: StatusFilter }>({
    keyword: '',
    status: 'all',
  });
  const [selectedCategory, setSelectedCategory] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(createTemplateForm);
  const [tagInput, setTagInput] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(createCategoryForm);
  const [savingCategory, setSavingCategory] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const flatCategories = useMemo(() => flattenCategoryTree(categories), [categories]);
  const selectableParentCategories = useMemo(() => {
    if (!editingCategory) {
      return flatCategories;
    }

    const descendants = collectDescendantIds(editingCategory);
    return flatCategories.filter((item) => item.id !== editingCategory.id && !descendants.has(item.id));
  }, [editingCategory, flatCategories]);

  const selectedCategoryNode = useMemo(
    () => flatCategories.find((item) => item.id === selectedCategory) ?? null,
    [flatCategories, selectedCategory],
  );

  const hasActiveFilters = Boolean(query.keyword || query.status !== 'all' || selectedCategory);

  const loadCategories = async () => {
    setCategoryLoading(true);

    try {
      const data = await request.get<CategoryNode[]>('/workflow/templates/categories');
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('加载模板分类失败:', error);
      toast.error(getErrorMessage(error, '加载模板分类失败'));
    } finally {
      setCategoryLoading(false);
    }
  };

  const loadTemplates = async () => {
    setTemplateLoading(true);

    try {
      const params: Record<string, string | number> = {
        pageNum: currentPage,
        pageSize,
        status: query.status,
      };

      if (selectedCategory) {
        params.categoryId = selectedCategory;
      }

      if (query.keyword.trim()) {
        params.keyword = query.keyword.trim();
      }

      const data = await request.get<TemplateListResult>('/workflow/templates', { params });
      setTemplates(Array.isArray(data?.records) ? data.records.map(normalizeTemplateItem) : []);
      setTotal(Number(data?.total || 0));
    } catch (error) {
      console.error('加载模板列表失败:', error);
      toast.error(getErrorMessage(error, '加载模板列表失败'));
    } finally {
      setTemplateLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory && !flatCategories.some((item) => item.id === selectedCategory)) {
      setSelectedCategory('');
    }
  }, [flatCategories, selectedCategory]);

  useEffect(() => {
    if (isAdmin && canManageTemplates) {
      void loadTemplates();
    }
  }, [canManageTemplates, currentPage, isAdmin, pageSize, query, selectedCategory]);

  const applySearch = () => {
    setCurrentPage(1);
    setQuery({
      keyword: filters.keyword.trim(),
      status: filters.status,
    });
  };

  const handleReset = () => {
    setFilters({ keyword: '', status: 'all' });
    setQuery({ keyword: '', status: 'all' });
    setSelectedCategory('');
    setCurrentPage(1);
  };

  const openTemplateModal = (template?: TemplateItem) => {
    if (template) {
      const normalizedTemplate = normalizeTemplateItem(template);
      setEditingTemplate(normalizedTemplate);
      setTemplateForm({
        name: normalizedTemplate.name || '',
        description: normalizedTemplate.description || '',
        categoryId: normalizedTemplate.categoryId || '',
        tags: normalizeTemplateTags(normalizedTemplate.tags),
        definition: JSON.stringify(normalizedTemplate.definition || DEFAULT_TEMPLATE_DEFINITION, null, 2),
        previewImage: normalizedTemplate.previewImage || '',
        status: normalizedTemplate.status || 'active',
      });
    } else {
      setEditingTemplate(null);
      setTemplateForm(createTemplateForm());
    }

    setTagInput('');
    setShowTemplateModal(true);
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setEditingTemplate(null);
    setTemplateForm(createTemplateForm());
    setTagInput('');
  };

  const openCategoryModal = (category?: CategoryNode) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name || '',
        description: category.description || '',
        parentId: category.parentId || '',
        orderNum: category.orderNum ?? 0,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm(createCategoryForm());
    }

    setShowCategoryModal(true);
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    setCategoryForm(createCategoryForm());
  };

  const addTag = () => {
    const nextTag = tagInput.trim();
    if (!nextTag) {
      return;
    }

    if (templateForm.tags.includes(nextTag)) {
      toast.error('标签已存在');
      return;
    }

    setTemplateForm((current) => ({ ...current, tags: [...current.tags, nextTag] }));
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTemplateForm((current) => ({
      ...current,
      tags: current.tags.filter((item) => item !== tag),
    }));
  };

  const saveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();

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
      console.error('模板定义 JSON 解析失败:', error);
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
      status: templateForm.status,
    };

    setSavingTemplate(true);

    try {
      if (editingTemplate) {
        await request.put(`/workflow/templates/${editingTemplate.id}`, payload);
        toast.success('模板已更新');
      } else {
        await request.post('/workflow/templates', payload);
        toast.success('模板已创建');
      }

      closeTemplateModal();
      await Promise.all([loadTemplates(), loadCategories()]);
    } catch (error) {
      console.error('保存模板失败:', error);
      toast.error(getErrorMessage(error, '保存模板失败'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();

    const name = categoryForm.name.trim();
    if (!name) {
      toast.error('请输入分类名称');
      return;
    }

    const payload = {
      name,
      description: categoryForm.description.trim(),
      parentId: categoryForm.parentId || null,
      orderNum: categoryForm.orderNum ?? 0,
    };

    setSavingCategory(true);

    try {
      if (editingCategory) {
        await request.put(`/workflow/templates/categories/${editingCategory.id}`, payload);
        toast.success('分类已更新');
      } else {
        await request.post('/workflow/templates/categories', payload);
        toast.success('分类已创建');
      }

      closeCategoryModal();
      await Promise.all([loadCategories(), loadTemplates()]);
    } catch (error) {
      console.error('保存分类失败:', error);
      toast.error(getErrorMessage(error, '保存分类失败'));
    } finally {
      setSavingCategory(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    await request.delete(`/workflow/templates/${id}`);
  };

  const deleteCategory = async (id: string) => {
    await request.delete(`/workflow/templates/categories/${id}`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      if (deleteTarget.type === 'template') {
        await deleteTemplate(deleteTarget.id);
        toast.success('模板已删除');
      } else {
        await deleteCategory(deleteTarget.id);
        toast.success('分类已删除');
        if (selectedCategory === deleteTarget.id) {
          setSelectedCategory('');
        }
      }

      setDeleteTarget(null);
      await Promise.all([loadCategories(), loadTemplates()]);
    } catch (error) {
      console.error('删除失败:', error);
      toast.error(deleteTarget.type === 'template' ? '删除模板失败' : '删除分类失败');
    }
  };

  if (!isAdmin || !canManageTemplates) {
    return <AccessState title="当前账号没有模板管理权限" description="模板治理仅对具备管理权限的账号开放。" />;
  }

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">TEMPLATE GOVERNANCE</p>
            <h2>模板管理</h2>
            <span>维护流程模板、分类树、标签和启停状态</span>
          </div>
          <div className="admin-source-controls">
            <Button type="button" variant="outline" size="sm" onClick={() => void Promise.all([loadCategories(), loadTemplates()])}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => openCategoryModal()}>
              <FolderPlus className="h-4 w-4" />
              新建分类
            </Button>
            <Button type="button" size="sm" onClick={() => openTemplateModal()} disabled={flatCategories.length === 0}>
              <Plus className="h-4 w-4" />
              新建模板
            </Button>
          </div>
        </header>

        <section className="admin-source-stat-grid">
          <article className="card admin-source-stat admin-source-tone-blue">
            <div className="admin-source-stat-icon"><FolderOpen size={18} /></div>
            <div><p>模板总数</p><strong>{total}</strong><span>当前条件</span></div>
          </article>
          <article className="card admin-source-stat admin-source-tone-green">
            <div className="admin-source-stat-icon"><Plus size={18} /></div>
            <div><p>本页启用</p><strong>{templates.filter((template) => template.status === 'active').length}</strong><span>可用模板</span></div>
          </article>
          <article className="card admin-source-stat admin-source-tone-violet">
            <div className="admin-source-stat-icon"><FolderPlus size={18} /></div>
            <div><p>分类</p><strong>{flatCategories.length}</strong><span>分类树节点</span></div>
          </article>
          <article className="card admin-source-stat admin-source-tone-amber">
            <div className="admin-source-stat-icon"><ShieldOff size={18} /></div>
            <div><p>本页禁用</p><strong>{templates.filter((template) => template.status === 'inactive').length}</strong><span>暂停使用</span></div>
          </article>
        </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-toolbar-filter-grid [--admin-toolbar-filter-count:2]">
        <label className="min-w-0">
          <span className="input-label">搜索模板</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  applySearch();
                }
              }}
              placeholder="模板名称"
              className="h-[42px] pl-9"
            />
          </div>
        </label>

        <label className="min-w-0">
          <span className="input-label">分类</span>
          <Select
            value={selectedCategory}
            disabled={categoryLoading}
            onValueChange={(value) => {
              setSelectedCategory(value);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className={cn(selectTriggerClassName, 'w-full')}>
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" label="全部分类">
                <span className="flex w-full items-center justify-between gap-3">
                  <span>全部分类</span>
                  <span className="text-xs text-slate-400">{flatCategories.length}</span>
                </span>
              </SelectItem>
              {flatCategories.map((category) => (
                <SelectItem key={category.id} value={category.id} label={category.name}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="truncate">{`${'　'.repeat(category.depth)}${category.name}`}</span>
                    <span className="text-xs text-slate-400">{category.templateCount ?? 0}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="min-w-0">
          <span className="input-label">状态</span>
          <Select
            value={filters.status}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: value as StatusFilter,
              }))
            }
          >
            <SelectTrigger className={cn(selectTriggerClassName, 'w-full')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">仅启用</SelectItem>
              <SelectItem value="inactive">仅禁用</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          {selectedCategoryNode ? (
            <span className="admin-users-filter-count">{selectedCategoryNode.name}</span>
          ) : null}
          {selectedCategoryNode ? (
            <>
              <RowActionButton
                label="编辑分类"
                icon={<Edit className="h-4 w-4" />}
                onClick={() => openCategoryModal(selectedCategoryNode)}
              />
              <RowActionButton
                label="删除分类"
                icon={<Trash2 className="h-4 w-4" />}
                tone="danger"
                onClick={() =>
                  setDeleteTarget({
                    type: 'category',
                    id: selectedCategoryNode.id,
                    name: selectedCategoryNode.name,
                  })
                }
              />
            </>
          ) : null}
          <Button type="button" size="sm" onClick={applySearch}>
            查询
          </Button>
          {hasActiveFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              清空
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface
      className="flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {selectedCategoryNode?.name || '模板列表'}
        </div>
        <div className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          {total} 项 · 表格视图
        </div>
      </div>

      <div className="admin-horizontal-scroll min-h-0 flex-1 overflow-auto">
        <table className="unity-data-table admin-source-table min-w-[840px]">
          <thead>
            <tr>
              <th>模板</th>
              <th>分类</th>
              <th>标签</th>
              <th>使用次数</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {templateLoading ? (
              <TableStateRow colSpan={6} title="正在加载模板..." loading />
            ) : templates.length === 0 ? (
              <TableStateRow colSpan={6} title={hasActiveFilters ? '当前筛选无结果' : '暂无模板'} />
            ) : (
              templates.map((template) => (
                <tr key={template.id}>
                  <td>
                    <div className="admin-users-identity">
                      <div>
                        <strong>{template.name}</strong>
                        <small>{template.description || '-'}</small>
                      </div>
                    </div>
                  </td>
                  <td>{template.categoryName || '-'}</td>
                  <td>{formatTemplateTags(template.tags)}</td>
                  <td>{template.usageCount ?? 0}</td>
                  <td>
                    <span className={template.status === 'active' ? 'badge badge-success' : 'badge badge-gray'}>
                      {template.status === 'active' ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" title="编辑" aria-label="编辑模板" onClick={() => openTemplateModal(template)}>
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        title="删除"
                        aria-label="删除模板"
                        onClick={() =>
                          setDeleteTarget({
                            type: 'template',
                            id: template.id,
                            name: template.name,
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={currentPage}
      pageSize={pageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      onPageChange={setCurrentPage}
      onPageSizeChange={(value) => {
        setPageSize(value);
        setCurrentPage(1);
      }}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-template-management-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showTemplateModal}
        title={editingTemplate ? '编辑模板' : '新建模板'}
        onClose={closeTemplateModal}
        maxWidthClassName="w-full sm:max-w-2xl lg:max-w-[56rem]"
        footer={(
          <>
            <Button variant="outline" onClick={closeTemplateModal}>
              取消
            </Button>
            <Button type="submit" form="template-form" disabled={savingTemplate}>
              {savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingTemplate ? '保存修改' : '创建模板'}
            </Button>
          </>
        )}
      >
        <form id="template-form" onSubmit={saveTemplate} className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>
                模板名称 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={templateForm.name}
                onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>

            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>
                分类 <span className="text-rose-500">*</span>
              </label>
              <Select
                value={templateForm.categoryId}
                onValueChange={(value) =>
                  setTemplateForm((current) => ({
                    ...current,
                    categoryId: value,
                  }))
                }
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue placeholder="请选择分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">请选择分类</SelectItem>
                  {flatCategories.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="admin-dialog-field">
            <label className={fieldLabelClassName}>模板描述</label>
            <Textarea
              rows={2}
              className="resize-none"
              value={templateForm.description}
              onChange={(event) =>
                setTemplateForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>

          <div className="admin-dialog-field">
            <label className={fieldLabelClassName}>
              标签 <span className="text-rose-500">*</span>
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="输入标签"
              />
              <Button type="button" variant="outline" onClick={addTag} className="w-full justify-center">
                添加
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {templateForm.tags.length > 0 ? (
                templateForm.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => removeTag(tag)}
                    className={tagTokenClassName}
                  >
                    {tag}
                    <X className="h-3 w-3" />
                  </button>
                ))
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
              )}
            </div>
          </div>

          <div className="admin-dialog-field">
            <label className={fieldLabelClassName}>
              流程定义（JSON） <span className="text-rose-500">*</span>
            </label>
            <Textarea
              rows={8}
              className="min-h-[240px] font-mono text-xs leading-6"
              value={templateForm.definition}
              onChange={(event) =>
                setTemplateForm((current) => ({
                  ...current,
                  definition: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>预览图 URL</label>
              <Input
                value={templateForm.previewImage}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    previewImage: event.target.value,
                  }))
                }
              />
            </div>

            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>状态</label>
              <Select
                value={templateForm.status}
                onValueChange={(value) =>
                  setTemplateForm((current) => ({
                    ...current,
                    status: value as TemplateStatus,
                  }))
                }
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="inactive">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>
      </BaseDialog>

      <BaseDialog
        open={showCategoryModal}
        title={editingCategory ? '编辑分类' : '新建分类'}
        onClose={closeCategoryModal}
        width="normal"
        footer={(
          <>
            <Button variant="outline" onClick={closeCategoryModal}>
              取消
            </Button>
            <Button type="submit" form="template-category-form" disabled={savingCategory}>
              {savingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingCategory ? '保存修改' : '创建分类'}
            </Button>
          </>
        )}
      >
        <form id="template-category-form" onSubmit={saveCategory} className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>父分类</label>
              <Select
                value={categoryForm.parentId}
                onValueChange={(value) =>
                  setCategoryForm((current) => ({
                    ...current,
                    parentId: value,
                  }))
                }
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">无（顶级分类）</SelectItem>
                  {selectableParentCategories.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>排序号</label>
              <Input
                type="number"
                value={categoryForm.orderNum}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    orderNum: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
              />
            </div>
          </div>

          <div className="admin-dialog-field">
            <label className={fieldLabelClassName}>
              分类名称 <span className="text-rose-500">*</span>
            </label>
            <Input
              value={categoryForm.name}
              onChange={(event) =>
                setCategoryForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </div>

          <div className="admin-dialog-field">
            <label className={fieldLabelClassName}>分类描述</label>
            <Textarea
              rows={3}
              className="resize-none"
              value={categoryForm.description}
              onChange={(event) =>
                setCategoryForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.type === 'template' ? '确认删除模板' : '确认删除分类'}
        message={
          deleteTarget?.type === 'template'
            ? `确认删除模板“${deleteTarget.name}”？`
            : `确认删除分类“${deleteTarget?.name || ''}”？`
        }
        confirmText="删除"
        cancelText="取消"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};

export default TemplateManagement;

