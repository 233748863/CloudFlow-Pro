import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
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
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  Label,
  LoadingSpinner,
  Pagination,
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
const DEFAULT_PAGE_SIZE = 10;

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
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border',
        empty
          ? 'border-dashed border-slate-200 bg-[var(--cf-surface-muted)] text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500'
          : 'border-slate-200 bg-[var(--cf-surface-muted)] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filters, setFilters] = useState({ keyword: '', status: '' });
  const [query, setQuery] = useState({ keyword: '', status: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ProcessCategory>({ ...emptyForm });
  const [deleteTarget, setDeleteTarget] = useState<ProcessCategory | null>(null);

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

  const totalPages = Math.max(1, Math.ceil(filteredFlatList.length / pageSize));
  const pagedFlatList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredFlatList.slice(start, start + pageSize);
  }, [filteredFlatList, page, pageSize]);

  const childCountByParent = useMemo(() => {
    const counts = new Map<number, number>();
    flatList.forEach((item) => {
      const parentId = Number(item.parentId || 0);
      if (parentId) {
        counts.set(parentId, (counts.get(parentId) || 0) + 1);
      }
    });
    return counts;
  }, [flatList]);

  const hasActiveFilters = Boolean(query.keyword || query.status);
  const activeCount = useMemo(() => flatList.filter((item) => item.status !== '1').length, [flatList]);
  const disabledCount = useMemo(() => flatList.filter((item) => item.status === '1').length, [flatList]);
  const rootCount = useMemo(() => flatList.filter((item) => Number(item.parentId || 0) === 0).length, [flatList]);
  const metrics = [
    { label: '流程分类', value: String(flatList.length), meta: `当前结果 ${filteredFlatList.length}`, icon: <FolderTree size={18} />, tone: 'blue' },
    { label: '顶级分类', value: String(rootCount), meta: '一级入口', icon: <Layers size={18} />, tone: 'violet' },
    { label: '正常', value: String(activeCount), meta: '可发起使用', icon: <FolderKanban size={18} />, tone: 'green' },
    { label: '停用', value: String(disabledCount), meta: '隐藏分类', icon: <Trash2 size={18} />, tone: 'amber' },
  ];

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

  useEffect(() => {
    setPage(1);
  }, [query.keyword, query.status, pageSize]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

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

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">WORKFLOW CATEGORIES</p>
          <h2>流程分类</h2>
          <span>维护流程分类、编码、图标、排序和启停状态</span>
        </div>
        <div className="admin-source-controls">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button type="button" size="sm" onClick={() => handleAdd(0)}>
            <Plus className="h-4 w-4" />
            新建分类
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
            <div className="admin-source-stat-icon">{metric.icon}</div>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar workflow-category-toolbar">
      <form onSubmit={handleSearch} className="workflow-category-filter-grid">
        <label>
          <span className="input-label">分类检索</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              placeholder="搜索分类名称或编码"
              className="h-[42px] pl-9"
            />
          </div>
        </label>

        <label>
          <span className="input-label">状态</span>
          <Select
            value={filters.status || STATUS_ALL_VALUE}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: value === STATUS_ALL_VALUE ? '' : value,
              }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STATUS_ALL_VALUE}>全部状态</SelectItem>
              <SelectItem value="0">正常</SelectItem>
              <SelectItem value="1">停用</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">{hasActiveFilters ? `${query.keyword || '全部关键词'} / ${query.status ? getStatusLabel(query.status) : '全部状态'}` : '全部分类'}</span>
          <Button type="submit" variant="outline" size="sm">
            <Search size={14} />
            查询
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={!hasActiveFilters}>
            <RefreshCw size={14} />
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface
      className="workflow-category-table-panel flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="workflow-category-table-head">
        <div>
          <strong>流程分类列表</strong>
          <span>
            {filteredFlatList.length} 条 · 表格视图{selectedNode ? ` · 当前 ${selectedNode.categoryName}` : ''}
          </span>
        </div>
        <span className="workflow-category-table-count">
          第 {Math.min(page, totalPages)} / {totalPages} 页
        </span>
      </div>

      <div className="admin-horizontal-scroll min-h-0 flex-1 overflow-auto">
        <table className="unity-data-table workflow-category-table">
          <thead>
            <tr>
              <th>分类</th>
              <th>父分类</th>
              <th>子分类</th>
              <th>图标</th>
              <th>排序</th>
              <th>状态</th>
              <th>备注</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={8} title="正在加载流程分类..." loading />
            ) : filteredFlatList.length === 0 ? (
              <TableStateRow colSpan={8} title={hasActiveFilters ? '当前筛选无结果' : '暂无流程分类'} />
            ) : (
              pagedFlatList.map((item) => {
                const isSelected = selectedId === item.categoryId;
                const childCount = item.categoryId ? childCountByParent.get(item.categoryId) || 0 : 0;

                return (
                  <tr
                    key={item.categoryId}
                    className={cn(isSelected && 'is-selected')}
                    onClick={() => setSelectedId(item.categoryId || null)}
                  >
                    <td>
                      <div className="admin-users-identity workflow-category-identity">
                        <span>
                          {renderIcon(item.icon, 'h-4 w-4 text-current')}
                        </span>
                        <div>
                          <strong>{item.categoryName || '-'}</strong>
                          <small className="font-mono">{item.categoryCode || '-'}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="workflow-category-parent">{getParentLabel(item)}</span>
                    </td>
                    <td>
                      <span className="workflow-category-child-count">{childCount}</span>
                    </td>
                    <td>
                      <span className="workflow-category-icon-token">
                        {renderIcon(item.icon)}
                        <span>{item.icon || '未设置'}</span>
                      </span>
                    </td>
                    <td>
                      <span className="workflow-category-sort">{item.sortOrder ?? 0}</span>
                    </td>
                    <td>
                      <span className={item.status === '1' ? 'badge badge-gray' : 'badge badge-success'}>
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <span className="workflow-category-remark" title={item.remark || '-'}>
                        {item.remark || '-'}
                      </span>
                    </td>
                    <td className="workflow-category-actions-cell">
                      <div className="admin-users-row-actions">
                        <button
                          type="button"
                          title="编辑"
                          aria-label="编辑分类"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleEdit(item.categoryId || 0);
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          title="新建子分类"
                          aria-label="新建子分类"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleAdd(item.categoryId || 0);
                          }}
                        >
                          <Plus size={15} />
                        </button>
                        <button
                          type="button"
                          className="danger"
                          title="删除"
                          aria-label="删除分类"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(item);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </InnerTableSurface>
  );

  const pagePagination = filteredFlatList.length > 0 ? (
    <Pagination
      total={filteredFlatList.length}
      page={Math.min(page, totalPages)}
      pageSize={pageSize}
      pageSizeOptions={[10, 20, 50]}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page workflow-category-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={modalOpen}
        title={isEdit ? '编辑分类' : '新建分类'}
        onClose={closeModal}
        width="normal"
        bodyClassName="admin-dialog-stack workflow-category-dialog-body px-4 py-3 sm:px-5 sm:py-4"
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
        <form id="process-category-form" onSubmit={handleSubmit} className="admin-dialog-stack workflow-category-dialog-form">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="admin-dialog-field md:col-span-2">
              <Label>父分类</Label>
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

            <div className="admin-dialog-field">
              <Label>
                分类名称 <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={form.categoryName || ''}
                onChange={(event) => setForm((current) => ({ ...current, categoryName: event.target.value }))}
              />
            </div>

            <div className="admin-dialog-field">
              <Label>
                分类编码 <span className="text-rose-500">*</span>
              </Label>
              <Input
                className="font-mono"
                value={form.categoryCode || ''}
                onChange={(event) => setForm((current) => ({ ...current, categoryCode: event.target.value }))}
              />
            </div>

            <div className="admin-dialog-field">
              <Label>图标</Label>
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

            <div className="admin-dialog-field">
              <Label>排序</Label>
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

            <div className="admin-dialog-field md:col-span-2">
              <Label>状态</Label>
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

          <div className="admin-dialog-field">
            <Label>备注</Label>
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
