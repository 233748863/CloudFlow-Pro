import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  FolderKanban,
  FolderTree,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog } from '@/components/common';
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
  Textarea,
} from '@/components/common';
import { cn } from '@/utils/cn';
import { processCategoryApi, type ProcessCategory } from '../../services/api/processCategory';

const STATUS_ALL_VALUE = '__all__';
const EMPTY_ICON_VALUE = '__none__';

const iconMap: Record<string, React.ElementType> = {
  'folder-tree': FolderTree,
  briefcase: Briefcase,
  users: Users,
  'dollar-sign': DollarSign,
  building: Building2,
  'folder-kanban': FolderKanban,
  layers: Layers,
};

const iconOptions = [
  { value: 'briefcase', label: '公文包' },
  { value: 'users', label: '多人协作' },
  { value: 'dollar-sign', label: '金额审批' },
  { value: 'building', label: '组织架构' },
  { value: 'folder-kanban', label: '看板文件夹' },
  { value: 'folder-tree', label: '树形目录' },
  { value: 'layers', label: '通用分类' },
];

const emptyForm: ProcessCategory = {
  parentId: 0,
  categoryName: '',
  categoryCode: '',
  icon: '',
  sortOrder: 0,
  status: '0',
  remark: '',
};

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

const InlineState: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
  className?: string;
}> = ({ title, description, loading = false, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
    {loading ? (
      <LoadingSpinner size="lg" className="mb-3" />
    ) : (
      <FolderTree className="mb-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
    )}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}> = ({ label, value, mono = false }) => (
  <div className="flex flex-col gap-1 border-b border-slate-100 px-3.5 py-2.5 last:border-b-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <div className="text-xs font-medium text-slate-400 dark:text-slate-500 sm:min-w-[84px]">{label}</div>
    <div className={cn('text-sm text-slate-900 dark:text-slate-100 sm:text-right', mono && 'font-mono')}>
      {value}
    </div>
  </div>
);

const DetailSection: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={cn('overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800', className)}>
    {children}
  </div>
);

const getStatusLabel = (status?: string) => (status === '1' ? '停用' : '正常');
const getParentLabel = (item?: ProcessCategory | null) =>
  Number(item?.parentId || 0) === 0 ? '顶级分类' : item?.parentName || item?.parentId || '-';

const renderIcon = (icon?: string, className = 'h-4 w-4 text-slate-400 dark:text-slate-500') => {
  const Icon = icon && iconMap[icon] ? iconMap[icon] : Layers;
  return <Icon className={className} />;
};

const IconOptionDisplay: React.FC<{
  icon?: string;
  label: string;
  code?: string;
  empty?: boolean;
}> = ({ icon, label, code, empty = false }) => (
  <div className="flex min-w-0 items-center gap-2.5">
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
        empty
          ? 'border-dashed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500'
          : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
      )}
    >
      {empty ? (
        <span className="text-[11px] font-medium">无</span>
      ) : (
        renderIcon(icon, 'h-4 w-4 text-current')
      )}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm text-slate-900 dark:text-slate-100">{label}</span>
      {code ? (
        <span className="block truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
          {code}
        </span>
      ) : null}
    </span>
  </div>
);

const flattenCategories = (items: ProcessCategory[]): ProcessCategory[] => {
  const result: ProcessCategory[] = [];

  const visit = (nodes: ProcessCategory[], parentName?: string) => {
    nodes.forEach((node) => {
      result.push({
        ...node,
        children: undefined,
        parentName: node.parentName || parentName,
      });

      if (node.children?.length) {
        visit(node.children, node.categoryName);
      }
    });
  };

  visit(items);

  const deduped = new Map<number, ProcessCategory>();
  result.forEach((item) => {
    if (item.categoryId !== undefined) {
      deduped.set(item.categoryId, item);
    }
  });

  return Array.from(deduped.values()).sort((a, b) => {
    const parentDiff = Number(a.parentId || 0) - Number(b.parentId || 0);
    if (parentDiff !== 0) {
      return parentDiff;
    }

    const sortDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    if (sortDiff !== 0) {
      return sortDiff;
    }

    return String(a.categoryName || '').localeCompare(String(b.categoryName || ''));
  });
};

const buildCategoryTree = (items: ProcessCategory[]): ProcessCategory[] => {
  const map = new Map<number, ProcessCategory>();

  items.forEach((item) => {
    if (item.categoryId === undefined) {
      return;
    }

    map.set(item.categoryId, {
      ...item,
      children: [],
    });
  });

  const roots: ProcessCategory[] = [];

  map.forEach((item) => {
    const parentId = Number(item.parentId || 0);

    if (parentId && map.has(parentId) && parentId !== item.categoryId) {
      map.get(parentId)?.children?.push(item);
    } else {
      roots.push(item);
    }
  });

  const sortNodes = (nodes: ProcessCategory[]) => {
    nodes.sort((a, b) => {
      const sortDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
      if (sortDiff !== 0) {
        return sortDiff;
      }

      return String(a.categoryName || '').localeCompare(String(b.categoryName || ''));
    });

    nodes.forEach((node) => sortNodes(node.children || []));
  };

  sortNodes(roots);
  return roots;
};

const filterCategoryTree = (nodes: ProcessCategory[], keyword: string, status: string): ProcessCategory[] => {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return nodes.reduce<ProcessCategory[]>((acc, node) => {
    const filteredChildren = filterCategoryTree(node.children || [], keyword, status);
    const matchesStatus = !status || node.status === status;
    const matchesKeyword =
      !normalizedKeyword ||
      [node.categoryName, node.categoryCode, node.remark]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedKeyword));

    if ((matchesStatus && matchesKeyword) || filteredChildren.length > 0) {
      acc.push({
        ...node,
        children: filteredChildren,
      });
    }

    return acc;
  }, []);
};

const collectDescendantIds = (categoryId: number | undefined, items: ProcessCategory[]) => {
  if (!categoryId) {
    return new Set<number>();
  }

  const descendants = new Set<number>();
  const queue = [categoryId];

  while (queue.length > 0) {
    const currentId = queue.shift() as number;
    items.forEach((item) => {
      if (Number(item.parentId || 0) === currentId && item.categoryId !== undefined && !descendants.has(item.categoryId)) {
        descendants.add(item.categoryId);
        queue.push(item.categoryId);
      }
    });
  }

  return descendants;
};

const ProcessCategoryPage: React.FC = () => {
  const [flatList, setFlatList] = useState<ProcessCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filters, setFilters] = useState({ keyword: '', status: '' });
  const [query, setQuery] = useState({ keyword: '', status: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ProcessCategory>({ ...emptyForm });
  const [deleteTarget, setDeleteTarget] = useState<ProcessCategory | null>(null);

  const treeData = useMemo(() => buildCategoryTree(flatList), [flatList]);

  const filteredTreeData = useMemo(
    () => filterCategoryTree(treeData, query.keyword, query.status),
    [query.keyword, query.status, treeData],
  );

  const filteredFlatList = useMemo(() => {
    const normalizedKeyword = query.keyword.trim().toLowerCase();

    return flatList.filter((item) => {
      const matchesStatus = !query.status || item.status === query.status;
      const matchesKeyword =
        !normalizedKeyword ||
        [item.categoryName, item.categoryCode, item.remark]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedKeyword));

      return matchesStatus && matchesKeyword;
    });
  }, [flatList, query.keyword, query.status]);

  const selectedNode = useMemo(
    () => flatList.find((item) => item.categoryId === selectedId) ?? null,
    [flatList, selectedId],
  );

  const selectedChildren = useMemo(
    () => flatList.filter((item) => Number(item.parentId || 0) === Number(selectedNode?.categoryId || 0)),
    [flatList, selectedNode?.categoryId],
  );

  const hasActiveFilters = Boolean(query.keyword || query.status);

  const disabledParentIds = useMemo(() => {
    const currentId = form.categoryId;
    const descendants = collectDescendantIds(currentId, flatList);

    if (currentId !== undefined) {
      descendants.add(currentId);
    }

    return descendants;
  }, [flatList, form.categoryId]);

  const selectedIconOption = useMemo(
    () => iconOptions.find((item) => item.value === form.icon) ?? null,
    [form.icon],
  );

  const loadData = async () => {
    setLoading(true);

    try {
      const listRes = await processCategoryApi.list();
      const normalized = flattenCategories(listRes || []);
      setFlatList(normalized);
    } catch (error) {
      console.error('加载流程分类失败:', error);
      toast.error(getErrorMessage(error, '加载流程分类失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setExpandedKeys(new Set(treeData.map((item) => item.categoryId!).filter(Boolean)));
  }, [treeData]);

  useEffect(() => {
    if (filteredFlatList.length === 0) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) => {
      if (current && filteredFlatList.some((item) => item.categoryId === current)) {
        return current;
      }

      return filteredFlatList[0]?.categoryId ?? null;
    });
  }, [filteredFlatList]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery({
      keyword: filters.keyword.trim(),
      status: filters.status,
    });
  };

  const handleReset = () => {
    const next = { keyword: '', status: '' };
    setFilters(next);
    setQuery(next);
  };

  const closeModal = () => {
    setModalOpen(false);
    setIsEdit(false);
    setForm({ ...emptyForm });
  };

  const handleAdd = (parentId = 0) => {
    setIsEdit(false);
    setForm({
      ...emptyForm,
      parentId,
    });
    setModalOpen(true);
  };

  const handleEdit = async (categoryId: number) => {
    try {
      const detail = await processCategoryApi.getInfo(categoryId);
      setIsEdit(true);
      setForm({
        ...emptyForm,
        ...detail,
      });
      setModalOpen(true);
    } catch (error) {
      console.error('加载分类详情失败:', error);
      toast.error(getErrorMessage(error, '加载分类详情失败'));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.categoryName?.trim()) {
      toast.error('请输入分类名称');
      return;
    }

    if (!form.categoryCode?.trim()) {
      toast.error('请输入分类编码');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        ...form,
        categoryName: form.categoryName.trim(),
        categoryCode: form.categoryCode.trim(),
        remark: form.remark?.trim() || '',
      };

      if (isEdit) {
        await processCategoryApi.edit(payload);
        toast.success('分类已更新');
      } else {
        await processCategoryApi.add(payload);
        toast.success('分类已创建');
      }

      closeModal();
      await loadData();
    } catch (error: any) {
      console.error('保存分类失败:', error);
      toast.error(error?.response?.data?.msg || '保存分类失败');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.categoryId) {
      return;
    }

    try {
      await processCategoryApi.remove(deleteTarget.categoryId);
      toast.success('分类已删除');
      setDeleteTarget(null);
      await loadData();
    } catch (error: any) {
      console.error('删除分类失败:', error);
      toast.error(error?.response?.data?.msg || '删除分类失败');
    }
  };

  const toggleExpand = (categoryId: number) => {
    setExpandedKeys((current) => {
      const next = new Set(current);

      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }

      return next;
    });
  };

  const renderTreeNode = (node: ProcessCategory, level = 0): React.ReactNode => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expandedKeys.has(node.categoryId!);
    const isSelected = selectedId === node.categoryId;

    return (
      <div key={node.categoryId}>
        <div
          className={cn(
            'cf-side-link cf-side-link-sm group cursor-pointer',
            isSelected && 'cf-side-link-active',
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => setSelectedId(node.categoryId || null)}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren && node.categoryId !== undefined) {
                toggleExpand(node.categoryId);
              }
            }}
            className="flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <span className="h-3.5 w-3.5" />
            )}
          </button>

          <span className="flex h-4 w-4 items-center justify-center">
            {renderIcon(node.icon, 'h-3.5 w-3.5 text-slate-400 dark:text-slate-500')}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="truncate font-medium">{node.categoryName}</span>
              {node.categoryCode ? (
                <span className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                  {node.categoryCode}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {hasChildren && isExpanded ? node.children?.map((child) => renderTreeNode(child, level + 1)) : null}
      </div>
    );
  };

  return (
    <>
      <TablePageLayout
        className="gap-2.5"
        filters={(
          <div className="flex flex-wrap items-start justify-between gap-3">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  value={filters.keyword}
                  onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
                  placeholder="搜索分类名称或编码"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.status || STATUS_ALL_VALUE}
                  onValueChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      status: value === STATUS_ALL_VALUE ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STATUS_ALL_VALUE}>全部状态</SelectItem>
                    <SelectItem value="0">正常</SelectItem>
                    <SelectItem value="1">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                  清空
                </Button>
              ) : null}
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                刷新
              </Button>
              <Button type="button" size="sm" onClick={() => handleAdd(0)}>
                <Plus className="h-4 w-4" />
                新建分类
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="grid min-h-[640px] grid-cols-1 xl:grid-cols-[232px_minmax(0,1fr)]">
            <div className="border-b border-slate-200 xl:border-b-0 xl:border-r dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5 dark:border-slate-800">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">分类树</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{filteredFlatList.length} 条</div>
              </div>

              <div className="max-h-[calc(100vh-324px)] overflow-y-auto px-1.5 py-1.5">
                {loading ? (
                  <InlineState title="正在加载分类树..." loading className="py-16" />
                ) : filteredTreeData.length === 0 ? (
                  <InlineState
                    title={hasActiveFilters ? '当前筛选无结果' : '暂无分类'}
                    className="py-16"
                  />
                ) : (
                  <div className="space-y-1">{filteredTreeData.map((node) => renderTreeNode(node))}</div>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {selectedNode?.categoryName || '分类详情'}
                  </div>
                  {selectedNode ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{selectedNode.categoryCode}</span>
                      <span>{getParentLabel(selectedNode)}</span>
                      <span>{getStatusLabel(selectedNode.status)}</span>
                    </div>
                  ) : null}
                </div>

                {selectedNode ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void handleEdit(selectedNode.categoryId || 0)}>
                      <Pencil className="h-4 w-4" />
                      编辑
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleAdd(selectedNode.categoryId || 0)}>
                      <Plus className="h-4 w-4" />
                      新建子分类
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(selectedNode)}>
                      <Trash2 className="h-4 w-4" />
                      删除
                    </Button>
                  </div>
                ) : null}
              </div>

              {!selectedNode ? (
                <InlineState
                  title={hasActiveFilters ? '当前筛选无可查看分类' : '请选择分类'}
                  className="min-h-[560px]"
                />
              ) : (
                <div className="space-y-3 px-4 py-3">
                  <DetailSection>
                    <DetailRow label="分类名称" value={selectedNode.categoryName || '-'} />
                    <DetailRow label="分类编码" value={selectedNode.categoryCode || '-'} mono />
                    <DetailRow label="状态" value={getStatusLabel(selectedNode.status)} />
                    <DetailRow label="父分类" value={getParentLabel(selectedNode)} />
                    <DetailRow label="子分类" value={`${selectedChildren.length} 个`} />
                    <DetailRow label="排序" value={selectedNode.sortOrder ?? 0} />
                    <DetailRow
                      label="图标"
                      value={
                        <span className="inline-flex items-center gap-2">
                          {renderIcon(selectedNode.icon)}
                          <span>{selectedNode.icon || '未设置'}</span>
                        </span>
                      }
                    />
                    <DetailRow label="备注" value={selectedNode.remark || '暂无备注'} />
                  </DetailSection>

                  <div className="space-y-3">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">子分类</div>

                    {selectedChildren.length > 0 ? (
                      <DetailSection>
                        {selectedChildren.map((child) => (
                          <button
                            key={child.categoryId}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 last:border-b-0 dark:border-slate-800 dark:hover:bg-slate-900/50"
                            onClick={() => setSelectedId(child.categoryId || null)}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="flex h-4 w-4 items-center justify-center">
                                {renderIcon(child.icon, 'h-3.5 w-3.5 text-slate-400 dark:text-slate-500')}
                              </span>
                              <div className="min-w-0 flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                                <span className="truncate">{child.categoryName}</span>
                                {child.categoryCode ? (
                                  <span className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                    {child.categoryCode}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              {child.status === '1' ? <span>停用</span> : null}
                              <ChevronRight className="h-4 w-4" />
                            </div>
                          </button>
                        ))}
                      </DetailSection>
                    ) : (
                      <DetailSection>
                        <div className="px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400">暂无子分类</div>
                      </DetailSection>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TableSurfaceCard>)}
      />

      <BaseDialog
        open={modalOpen}
        title={isEdit ? '编辑分类' : '新建分类'}
        onClose={closeModal}
        width="normal"
        bodyClassName="px-4 py-3 sm:px-5 sm:py-4"
        footerClassName="gap-2 px-4 py-2.5 sm:px-5 sm:py-3"
        footer={(
          <>
            <Button variant="outline" onClick={closeModal}>
              取消
            </Button>
            <Button type="submit" form="process-category-form" disabled={submitting}>
              {submitting ? '保存中...' : isEdit ? '保存修改' : '创建分类'}
            </Button>
          </>
        )}
      >
        <form id="process-category-form" onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={fieldLabelClassName}>父分类</label>
              <Select
                value={String(form.parentId ?? 0)}
                onValueChange={(value) => setForm((current) => ({ ...current, parentId: Number(value) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择父分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">顶级分类</SelectItem>
                  {flatList
                    .filter((item) => item.categoryId !== undefined && !disabledParentIds.has(item.categoryId))
                    .map((item) => (
                      <SelectItem key={item.categoryId} value={String(item.categoryId)}>
                        {item.categoryName} ({item.categoryCode})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={fieldLabelClassName}>
                分类名称 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={form.categoryName || ''}
                onChange={(event) => setForm((current) => ({ ...current, categoryName: event.target.value }))}
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>
                分类编码 <span className="text-rose-500">*</span>
              </label>
              <Input
                className="font-mono"
                value={form.categoryCode || ''}
                onChange={(event) => setForm((current) => ({ ...current, categoryCode: event.target.value }))}
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>图标</label>
              <Select
                value={form.icon || EMPTY_ICON_VALUE}
                onValueChange={(value) => setForm((current) => ({ ...current, icon: value === EMPTY_ICON_VALUE ? '' : value }))}
              >
                <SelectTrigger>
                  {selectedIconOption ? (
                    <IconOptionDisplay
                      icon={selectedIconOption.value}
                      label={selectedIconOption.label}
                      code={selectedIconOption.value}
                    />
                  ) : (
                    <IconOptionDisplay label="未设置" empty />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_ICON_VALUE}>
                    <IconOptionDisplay label="未设置" empty />
                  </SelectItem>
                  {iconOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <IconOptionDisplay
                        icon={option.value}
                        label={option.label}
                        code={option.value}
                      />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={fieldLabelClassName}>排序</label>
              <Input
                type="number"
                value={form.sortOrder ?? 0}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sortOrder: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
              />
            </div>

            <div className="md:col-span-2">
              <label className={fieldLabelClassName}>状态</label>
              <Select
                value={form.status || '0'}
                onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">正常</SelectItem>
                  <SelectItem value="1">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>备注</label>
            <Textarea
              rows={4}
              className="resize-none"
              value={form.remark || ''}
              onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
            />
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="确认删除分类"
        message={deleteTarget ? `确认删除分类“${deleteTarget.categoryName}”？` : '确认删除当前分类？'}
        confirmText="删除"
        cancelText="取消"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};

export default ProcessCategoryPage;
