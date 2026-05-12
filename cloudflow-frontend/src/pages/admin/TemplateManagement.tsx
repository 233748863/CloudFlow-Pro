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
import { BaseDialog, ConfirmDialog, Pagination, TableRowActions } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SideNavItem,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
  tags?: string[];
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
const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';
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

const formatTemplateTags = (tags?: string[]) => {
  if (!tags || tags.length === 0) {
    return '-';
  }

  const visibleTags = tags.slice(0, 2).join(' / ');
  return tags.length > 2 ? `${visibleTags} +${tags.length - 2}` : visibleTags;
};

const InlineState: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
  className?: string;
}> = ({ title, description, loading = false, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
    {loading ? <LoadingSpinner size="lg" className="mb-3" /> : <FolderOpen className="mb-3 h-5 w-5 text-slate-400 dark:text-slate-500" />}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

const AccessState: React.FC<{
  title: string;
  description: string;
}> = ({ title, description }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <ShieldOff className="h-5 w-5" />
    </div>
    <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</div>
  </div>
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
      'h-8 w-8 rounded-lg p-0 shadow-none',
      tone === 'danger'
        ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200',
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
      setTemplates(Array.isArray(data?.records) ? data.records : []);
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

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
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
      setEditingTemplate(template);
      setTemplateForm({
        name: template.name || '',
        description: template.description || '',
        categoryId: template.categoryId || '',
        tags: template.tags || [],
        definition: JSON.stringify(template.definition || DEFAULT_TEMPLATE_DEFINITION, null, 2),
        previewImage: template.previewImage || '',
        status: template.status || 'active',
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

  return (
    <>
      <TablePageLayout
        filters={(
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  value={filters.keyword}
                  onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
                  placeholder="搜索模板名称"
                  className="h-10 pl-10"
                />
              </div>
              <Select
                value={filters.status}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    status: value as StatusFilter,
                  }))
                }
              >
                <SelectTrigger className={cn(selectTriggerClassName, 'w-full sm:w-40')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">仅启用</SelectItem>
                  <SelectItem value="inactive">仅禁用</SelectItem>
                </SelectContent>
              </Select>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                  清空
                </Button>
              ) : null}
            </form>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto lg:flex-nowrap">
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
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="grid min-h-[620px] grid-cols-1 xl:grid-cols-[248px_minmax(0,1fr)]">
            <div className="border-b border-slate-200 xl:border-b-0 xl:border-r dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">分类</div>
                <div className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{flatCategories.length}</div>
              </div>

              <div className="max-h-[calc(100vh-312px)] overflow-y-auto px-1.5 py-1.5">
                {categoryLoading ? (
                  <InlineState title="正在加载分类..." loading className="py-14" />
                ) : flatCategories.length === 0 ? (
                  <InlineState title="暂无分类" className="py-14" />
                ) : (
                  <div className="space-y-1">
                    <SideNavItem
                      size="sm"
                      active={!selectedCategory}
                      onClick={() => {
                        setSelectedCategory('');
                        setCurrentPage(1);
                      }}
                      className="justify-between"
                    >
                      <span className="font-medium">全部分类</span>
                      <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{total}</span>
                    </SideNavItem>

                    {flatCategories.map((category) => {
                      const selected = selectedCategory === category.id;

                      return (
                        <div
                          key={category.id}
                          className={cn(
                            'cf-side-link cf-side-link-sm group',
                            selected && 'cf-side-link-active',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategory(category.id);
                              setCurrentPage(1);
                            }}
                            className="min-w-0 flex-1 text-left"
                            style={{ paddingLeft: `${category.depth * 10}px` }}
                          >
                            <div className="flex items-center gap-2">
                              <FolderOpen className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                              <span
                                className={cn(
                                  'truncate text-sm',
                                  selected && 'font-medium',
                                )}
                              >
                                {category.name}
                              </span>
                            </div>
                          </button>

                          <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                            {category.templateCount ?? 0}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <RowActionButton
                              label="编辑分类"
                              icon={<Edit className="h-3.5 w-3.5" />}
                              className="h-7 w-7 rounded-md"
                              onClick={(event) => {
                                event.stopPropagation();
                                openCategoryModal(category);
                              }}
                            />
                            <RowActionButton
                              label="删除分类"
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              tone="danger"
                              className="h-7 w-7 rounded-md"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteTarget({
                                  type: 'category',
                                  id: category.id,
                                  name: category.name,
                                });
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
                <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {selectedCategoryNode?.name || '模板列表'}
                </div>
                <div className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{total}</div>
              </div>

              <div className="overflow-x-auto">
                <Table className="min-w-[840px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[34%]">模板</TableHead>
                      <TableHead className="w-[15%]">分类</TableHead>
                      <TableHead className="w-[19%]">标签</TableHead>
                      <TableHead className="w-[12%]">使用次数</TableHead>
                      <TableHead className="w-[10%]">状态</TableHead>
                      <TableActionHead className="w-40">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templateLoading ? (
                      <TableStateRow colSpan={6} title="正在加载模板..." loading />
                    ) : templates.length === 0 ? (
                      <TableStateRow colSpan={6} title={hasActiveFilters ? '当前筛选无结果' : '暂无模板'} />
                    ) : (
                      templates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="py-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                                {template.name}
                              </div>
                              <div className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                                {template.description || '-'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 text-sm text-slate-600 dark:text-slate-300">
                            {template.categoryName || '-'}
                          </TableCell>
                          <TableCell className="py-3 text-sm text-slate-600 dark:text-slate-300">
                            {formatTemplateTags(template.tags)}
                          </TableCell>
                          <TableCell className="py-3 text-sm text-slate-600 dark:text-slate-300">
                            {template.usageCount ?? 0}
                          </TableCell>
                          <TableCell className="py-3">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {template.status === 'active' ? '启用' : '禁用'}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-3 text-right">
                            <TableRowActions
                              align="end"
                              className="gap-1"
                              actions={[
                                {
                                  label: '编辑',
                                  icon: <Edit size={16} />,
                                  onClick: () => openTemplateModal(template),
                                  tone: 'neutral',
                                  semantic: 'edit',
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={16} />,
                                  onClick: () =>
                                    setDeleteTarget({
                                      type: 'template',
                                      id: template.id,
                                      name: template.name,
                                    }),
                                  tone: 'danger',
                                  semantic: 'delete',
                                },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </TableSurfaceCard>)}
        pagination={(
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
        )}
      />

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
        <form id="template-form" onSubmit={saveTemplate} className="space-y-3.5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>
                模板名称 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={templateForm.name}
                onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>

            <div>
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

          <div>
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

          <div>
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

          <div>
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
            <div>
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

            <div>
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
        <form id="template-category-form" onSubmit={saveCategory} className="space-y-3.5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
            <div>
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

            <div>
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

          <div>
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

          <div>
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

