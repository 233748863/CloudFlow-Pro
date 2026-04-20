import React, { useEffect, useMemo, useState } from 'react';
import { processCategoryApi, ProcessCategory } from '../../services/api/processCategory';
import { toast } from 'sonner';
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
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { WorkspaceBackdrop, WorkspaceInlineState, WorkspacePageContent } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';
import { ConfirmDialog } from '@/components/common';
import { cn } from '@/utils/cn';

const iconMap: Record<string, React.ElementType> = {
  'folder-tree': FolderTree,
  briefcase: Briefcase,
  users: Users,
  'dollar-sign': DollarSign,
  building: Building2,
  'folder-kanban': FolderKanban,
  layers: Layers,
};

const emptyForm: ProcessCategory = {
  parentId: 0,
  categoryName: '',
  categoryCode: '',
  icon: '',
  sortOrder: 0,
  status: '0',
  remark: '',
};

const fieldLabelClassName = 'mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200';
const infoBlockClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const renderIcon = (icon?: string, className = 'h-4 w-4 text-slate-400 dark:text-slate-500') => {
  const Icon = icon && iconMap[icon] ? iconMap[icon] : Layers;
  return <Icon className={className} />;
};

const flattenCategories = (items: ProcessCategory[]): ProcessCategory[] => {
  const result: ProcessCategory[] = [];
  const visit = (nodes: ProcessCategory[], parentName?: string) => {
    nodes.forEach((node) => {
      const next: ProcessCategory = {
        ...node,
        children: undefined,
        parentName: node.parentName || parentName,
      };
      result.push(next);
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
    if (parentDiff !== 0) return parentDiff;
    const sortDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    if (sortDiff !== 0) return sortDiff;
    return String(a.categoryName || '').localeCompare(String(b.categoryName || ''));
  });
};

const buildCategoryTree = (items: ProcessCategory[]): ProcessCategory[] => {
  const map = new Map<number, ProcessCategory>();

  items.forEach((item) => {
    if (item.categoryId === undefined) return;
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
      if (sortDiff !== 0) return sortDiff;
      return String(a.categoryName || '').localeCompare(String(b.categoryName || ''));
    });
    nodes.forEach((node) => sortNodes(node.children || []));
  };

  sortNodes(roots);
  return roots;
};

const filterCategoryTree = (
  nodes: ProcessCategory[],
  keyword: string,
  statusFilter: string,
): ProcessCategory[] => {
  const loweredKeyword = keyword.trim().toLowerCase();

  return nodes.reduce<ProcessCategory[]>((acc, node) => {
    const filteredChildren = filterCategoryTree(node.children || [], keyword, statusFilter);
    const statusMatch = !statusFilter || node.status === statusFilter;
    const keywordMatch = !loweredKeyword
      || [node.categoryName, node.categoryCode, node.remark]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(loweredKeyword));

    if ((statusMatch && keywordMatch) || filteredChildren.length > 0) {
      acc.push({
        ...node,
        children: filteredChildren,
      });
    }
    return acc;
  }, []);
};

const ProcessCategoryPage: React.FC = () => {
  const [flatList, setFlatList] = useState<ProcessCategory[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<ProcessCategory>({ ...emptyForm });
  const [pageLoading, setPageLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProcessCategory | null>(null);

  const fetchData = async () => {
    try {
      setPageLoading(true);
      const listRes = await processCategoryApi.list();
      const normalizedFlat = flattenCategories(listRes || []);
      setFlatList(normalizedFlat);

      if (normalizedFlat.length > 0) {
        setSelectedId((prev) => {
          if (prev && normalizedFlat.some((item) => item.categoryId === prev)) {
            return prev;
          }
          return normalizedFlat[0].categoryId || null;
        });
      } else {
        setSelectedId(null);
      }
    } catch (error) {
      console.error(error);
      toast.error('加载分类数据失败');
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const treeData = useMemo(() => buildCategoryTree(flatList), [flatList]);

  useEffect(() => {
    setExpandedKeys(new Set(treeData.map((item) => item.categoryId!).filter(Boolean)));
  }, [treeData.length]);

  const filteredTreeData = useMemo(
    () => filterCategoryTree(treeData, keyword, statusFilter),
    [keyword, statusFilter, treeData],
  );

  const filteredFlatList = useMemo(() => {
    const loweredKeyword = keyword.trim().toLowerCase();
    return flatList.filter((item) => {
      const statusMatch = !statusFilter || item.status === statusFilter;
      const keywordMatch = !loweredKeyword
        || [item.categoryName, item.categoryCode, item.remark]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(loweredKeyword));
      return statusMatch && keywordMatch;
    });
  }, [flatList, keyword, statusFilter]);

  const selectedNode = useMemo(
    () => flatList.find((item) => item.categoryId === selectedId),
    [flatList, selectedId],
  );

  const selectedChildren = useMemo(
    () => flatList.filter((item) => item.parentId === selectedNode?.categoryId),
    [flatList, selectedNode?.categoryId],
  );

  const activeCount = flatList.filter((item) => item.status === '0').length;
  const rootCount = flatList.filter((item) => Number(item.parentId || 0) === 0).length;
  const inactiveCount = flatList.filter((item) => item.status === '1').length;

  const handleAdd = (parentId: number = 0) => {
    setIsEdit(false);
    setForm({ ...emptyForm, parentId });
    setModalOpen(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const data = await processCategoryApi.getInfo(id);
      if (data) {
        setIsEdit(true);
        setForm(data);
        setModalOpen(true);
      }
    } catch {
      toast.error('获取分类详情失败');
    }
  };

  const handleDelete = async (target: ProcessCategory | null) => {
    if (!target?.categoryId) return;

    try {
      await processCategoryApi.remove(target.categoryId);
      toast.success('删除成功');
      if (selectedId === target.categoryId) setSelectedId(null);
      setDeleteTarget(null);
      await fetchData();
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || '删除失败');
    }
  };

  const handleSubmit = async () => {
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
      if (isEdit) {
        await processCategoryApi.edit(form);
        toast.success('修改成功');
      } else {
        await processCategoryApi.add(form);
        toast.success('新增成功');
      }
      setModalOpen(false);
      await fetchData();
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTreeNode = (node: ProcessCategory, level: number = 0): React.ReactNode => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expandedKeys.has(node.categoryId!);
    const isSelected = selectedId === node.categoryId;

    return (
      <div key={node.categoryId}>
        <div
          className={cn(
            'group flex cursor-pointer items-center rounded-2xl border px-3 py-2 transition-all',
            isSelected
              ? 'border-cyan-200 bg-cyan-50 text-cyan-700 shadow-sm dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200'
              : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:hover:border-slate-800 dark:hover:bg-slate-900/70',
          )}
          style={{ paddingLeft: `${level * 22 + 12}px` }}
          onClick={() => setSelectedId(node.categoryId!)}
        >
          <button
            type="button"
            className="mr-1 flex h-5 w-5 items-center justify-center text-slate-400 dark:text-slate-500"
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) toggleExpand(node.categoryId!);
            }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <span className="w-4" />
            )}
          </button>
          <span className="mr-2 text-cyan-600 dark:text-cyan-200">
            {renderIcon(node.icon, 'h-4 w-4')}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{node.categoryName}</div>
            <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{node.categoryCode}</div>
          </div>
          <span
            className={cn(
              'mr-2 rounded-full px-2 py-0.5 text-xs font-medium',
              node.status === '0'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
            )}
          >
            {node.status === '0' ? '正常' : '停用'}
          </span>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-cyan-700 dark:text-slate-500 dark:hover:text-cyan-200"
              onClick={(event) => {
                event.stopPropagation();
                handleAdd(node.categoryId!);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-cyan-600 dark:text-slate-500 dark:hover:text-cyan-200"
              onClick={(event) => {
                event.stopPropagation();
                void handleEdit(node.categoryId!);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
              onClick={(event) => {
                event.stopPropagation();
                setDeleteTarget(node);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {hasChildren && isExpanded ? node.children!.map((child) => renderTreeNode(child, level + 1)) : null}
      </div>
    );
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: '筛选结果', value: `${filteredFlatList.length} 条` },
    { label: '正常分类', value: `${activeCount} 条` },
    { label: '停用分类', value: `${inactiveCount} 条` },
    { label: '当前选中', value: selectedNode?.categoryName || '未选择' },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent className="space-y-4">
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                <FolderTree className="h-3.5 w-3.5" />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950/90">
                {timeLabel}
              </span>
            </div>
          )}
          title="流程分类管理"
          description="统一流程分类树、详情面板和编辑弹窗，让流程治理页也进入同一套工作台结构。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void fetchData()}>
                <RefreshCw className="h-4 w-4" />
                刷新
              </Button>
              <Button onClick={() => handleAdd(0)}>
                <Plus className="h-4 w-4" />
                新增顶级分类
              </Button>
            </div>
          )}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="分类总数"
              value={flatList.length}
              hint="当前所有分类节点数"
              aside={<FolderTree className="h-[18px] w-[18px] text-cyan-600 dark:text-cyan-200" />}
            />
            <WorkspaceMetricCard
              label="正常分类"
              value={activeCount}
              hint="状态为正常的分类节点"
              aside={<Layers className="h-[18px] w-[18px] text-emerald-500 dark:text-emerald-200" />}
            />
            <WorkspaceMetricCard
              label="顶级分类"
              value={rootCount}
              hint="树结构中的一级分类数量"
              aside={<FolderKanban className="h-[18px] w-[18px] text-amber-500 dark:text-amber-200" />}
            />
            <WorkspaceMetricCard
              label="当前选中"
              value={selectedNode?.categoryName || '未选择'}
              hint="右侧详情面板展示的分类"
              aside={<Briefcase className="h-[18px] w-[18px] text-sky-500 dark:text-sky-200" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          eyebrow="Category Filters"
          title="分类筛选与治理"
          total={filteredFlatList.length}
          hasActiveFilters={Boolean(keyword || statusFilter)}
          overviewItems={overviewItems}
          quickFilters={[
            { label: '全部状态', value: 'all' },
            { label: '正常', value: '0' },
            { label: '停用', value: '1' },
          ]}
          activeQuickFilter={statusFilter || 'all'}
          onQuickFilterChange={(value) => setStatusFilter(value === 'all' ? '' : value)}
          quickFilterAside={selectedNode ? (
            <Button variant="outline" size="sm" onClick={() => void handleEdit(selectedNode.categoryId!)}>
              <Pencil className="h-4 w-4" />
              编辑当前分类
            </Button>
          ) : (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500">
              当前未选择分类
            </span>
          )}
          filterBar={(
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="按分类名称、编码或备注搜索"
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter || 'all'} onValueChange={(value) => setStatusFilter(value === 'all' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="0">正常</SelectItem>
                  <SelectItem value="1">停用</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setKeyword('');
                  setStatusFilter('');
                }}
              >
                <Search className="h-4 w-4" />
                清空筛选
              </Button>
            </div>
          )}
        />

        <div className="grid gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
          <WorkspaceSectionCard title="分类结构" description="左侧按层级浏览流程分类树，支持快速展开、选择与增删改。">
            {pageLoading ? (
              <WorkspaceInlineState type="loading" title="正在加载分类树..." className="py-12" />
            ) : filteredTreeData.length === 0 ? (
              <WorkspaceInlineState icon={<FolderTree className="h-5 w-5" />} title="暂无分类数据" className="py-12" />
            ) : (
              <div className="space-y-1">{filteredTreeData.map((node) => renderTreeNode(node))}</div>
            )}
          </WorkspaceSectionCard>

          <WorkspaceSectionCard
            title={selectedNode ? selectedNode.categoryName || '分类详情' : '分类详情'}
            description={selectedNode ? '查看当前分类的编码、层级、图标和备注。' : '在左侧选择一个分类查看详情。'}
            headerAside={selectedNode ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handleEdit(selectedNode.categoryId!)}>
                  编辑分类
                </Button>
                <Button variant="secondary" onClick={() => handleAdd(selectedNode.categoryId!)}>
                  添加子分类
                </Button>
              </div>
            ) : undefined}
            bodyClassName="space-y-4"
          >
            {selectedNode ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className={infoBlockClassName}>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">分类编码</div>
                    <div className="mt-2 font-mono text-sm text-slate-900 dark:text-slate-100">{selectedNode.categoryCode}</div>
                  </div>
                  <div className={infoBlockClassName}>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">排序号</div>
                    <div className="mt-2 text-sm text-slate-900 dark:text-slate-100">{selectedNode.sortOrder}</div>
                  </div>
                  <div className={infoBlockClassName}>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">状态</div>
                    <div className="mt-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                          selectedNode.status === '0'
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
                        )}
                      >
                        {selectedNode.status === '0' ? '正常' : '停用'}
                      </span>
                    </div>
                  </div>
                  <div className={infoBlockClassName}>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">父分类</div>
                    <div className="mt-2 text-sm text-slate-900 dark:text-slate-100">
                      {selectedNode.parentId === 0 ? '顶级分类' : selectedNode.parentName || selectedNode.parentId}
                    </div>
                  </div>
                  <div className={infoBlockClassName}>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">图标</div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
                      {renderIcon(selectedNode.icon, 'h-4 w-4 text-cyan-600 dark:text-cyan-200')}
                      <span>{selectedNode.icon || '无'}</span>
                    </div>
                  </div>
                  <div className={infoBlockClassName}>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">子分类数</div>
                    <div className="mt-2 text-sm text-slate-900 dark:text-slate-100">{selectedChildren.length}</div>
                  </div>
                </div>

                <div className={infoBlockClassName}>
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">备注</div>
                  <div className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">
                    {selectedNode.remark || '暂无备注'}
                  </div>
                </div>

                {selectedChildren.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">子分类</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {selectedChildren.map((child) => (
                        <div key={child.categoryId} className={infoBlockClassName}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {child.categoryName}
                              </div>
                              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{child.categoryCode}</div>
                            </div>
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                                child.status === '0'
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                                  : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
                              )}
                            >
                              {child.status === '0' ? '正常' : '停用'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <WorkspaceInlineState icon={<FolderTree className="h-5 w-5" />} title="请选择一个分类查看详情" className="py-16" />
            )}
          </WorkspaceSectionCard>
        </div>

        {modalOpen ? (
          <WorkspaceDialogShell
            title={isEdit ? '编辑分类' : '新增分类'}
            description="维护分类层级、编码、图标、排序与状态，保持流程治理体系一致。"
            onClose={() => setModalOpen(false)}
            maxWidthClassName="max-w-3xl"
          >
            <div className="space-y-4">
              <div>
                <label className={fieldLabelClassName}>父分类</label>
                <Select value={String(form.parentId || 0)} onValueChange={(value) => setForm({ ...form, parentId: Number(value) })}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择父分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">顶级分类</SelectItem>
                    {flatList
                      .filter((item) => item.categoryId !== form.categoryId)
                      .map((item) => (
                        <SelectItem key={item.categoryId} value={String(item.categoryId)}>
                          {item.categoryName} ({item.categoryCode})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={fieldLabelClassName}>
                    分类名称 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={form.categoryName || ''}
                    onChange={(e) => setForm({ ...form, categoryName: e.target.value })}
                    placeholder="请输入分类名称"
                  />
                </div>
                <div>
                  <label className={fieldLabelClassName}>
                    分类编码 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    className="font-mono"
                    value={form.categoryCode || ''}
                    onChange={(e) => setForm({ ...form, categoryCode: e.target.value })}
                    placeholder="如：hr_leave"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={fieldLabelClassName}>图标标识</label>
                  <Select value={form.icon || ''} onValueChange={(value) => setForm({ ...form, icon: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="无" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">无</SelectItem>
                      <SelectItem value="briefcase">briefcase</SelectItem>
                      <SelectItem value="users">users</SelectItem>
                      <SelectItem value="dollar-sign">dollar-sign</SelectItem>
                      <SelectItem value="building">building</SelectItem>
                      <SelectItem value="folder-kanban">folder-kanban</SelectItem>
                      <SelectItem value="folder-tree">folder-tree</SelectItem>
                      <SelectItem value="layers">layers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={fieldLabelClassName}>排序号</label>
                  <Input
                    type="number"
                    value={form.sortOrder ?? 0}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className={fieldLabelClassName}>状态</label>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900/80">
                  {[
                    { value: '0', label: '正常' },
                    { value: '1', label: '停用' },
                  ].map((item) => {
                    const active = form.status === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setForm({ ...form, status: item.value })}
                        className={cn(
                          'rounded-lg px-4 py-2 text-sm font-medium transition',
                          active
                            ? 'bg-white text-cyan-700 shadow-sm dark:bg-slate-950 dark:text-cyan-200'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={fieldLabelClassName}>备注</label>
                <Textarea
                  rows={4}
                  value={form.remark || ''}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                  placeholder="可选"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? '提交中...' : '确定'}
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="确认删除分类"
          message={
            deleteTarget
              ? `确定删除分类“${deleteTarget.categoryName}”吗？删除后将影响当前分类树中的流程归属。`
              : '确定删除当前分类吗？'
          }
          confirmText="删除分类"
          cancelText="取消"
          danger
          onConfirm={() => void handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      </WorkspacePageContent>
    </div>
  );
};

export default ProcessCategoryPage;
