import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  FilePlus2,
  Layers3,
  RefreshCcw,
  Search,
  SquarePen,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import {
  Headcount,
  HeadcountPayload,
  HeadcountStatistics,
  HeadcountTargetType,
  PostOption,
  getDeptTreeOptions,
  getHeadcountStatistics,
  getPostOptions,
  listHeadcounts,
  setHeadcount,
  updateHeadcountActualCount,
} from '@/services/api/hr';
import { flattenDeptTree, normalizeRows, toDateInputValue } from './hrShared';

const ALL_TARGETS = '__all__';
const LIST_SCOPE_ACTIVE = 'ACTIVE';
const LIST_SCOPE_ALL = 'ALL';

type HeadcountDialogMode = 'create' | 'edit';

const createDefaultForm = (): HeadcountPayload => ({
  targetType: 'DEPT',
  targetId: 0,
  approvedCount: 1,
  effectiveDate: '',
  expiryDate: '',
});

const createFormFromHeadcount = (headcount: Headcount): HeadcountPayload => ({
  targetType: headcount.targetType,
  targetId: headcount.targetId,
  approvedCount: headcount.approvedCount,
  effectiveDate: toDateInputValue(headcount.effectiveDate) || '',
  expiryDate: toDateInputValue(headcount.expiryDate) || '',
});

const targetTypeLabel = (targetType?: HeadcountTargetType | string | null) =>
  targetType === 'POST' ? '岗位编制' : '部门编制';

const formatUtilizationRate = (value?: number | string | null) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';
  return `${numericValue.toFixed(numericValue % 1 === 0 ? 0 : 2)}%`;
};

const formatDateLabel = (value?: string | null, fallback = '-') =>
  toDateInputValue(value) || fallback;

const formatValidityLabel = (headcount: Pick<Headcount, 'effectiveDate' | 'expiryDate'>) => {
  const effectiveDate = formatDateLabel(headcount.effectiveDate);
  const expiryDate = formatDateLabel(headcount.expiryDate, '长期有效');
  if (effectiveDate === '-' && expiryDate === '长期有效') {
    return '长期有效';
  }
  return `${effectiveDate} 至 ${expiryDate}`;
};

const vacancyTone = (headcount: Pick<Headcount, 'approvedCount' | 'actualCount' | 'vacancyCount'>) => {
  if (headcount.actualCount > headcount.approvedCount || headcount.vacancyCount < 0) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
  }
  if (headcount.vacancyCount > 0) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
};

const targetTypeTone = (targetType?: HeadcountTargetType | string | null) =>
  targetType === 'POST'
    ? 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
    : 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';

const InlineState = ({
  title,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      <Layers3 className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {actions ? <div className="mt-4">{actions}</div> : null}
  </div>
);

const TableStateRow = ({
  colSpan,
  title,
  description,
  loading = false,
}: {
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-14">
      <InlineState
        title={title}
        className={loading ? 'py-6' : 'py-4'}
      />
    </td>
  </tr>
);

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800">
    <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
      {label}
    </div>
    <div className="text-right text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

export const HrHeadcountPage: React.FC = () => {
  const [headcounts, setHeadcounts] = useState<Headcount[]>([]);
  const [statistics, setStatistics] = useState<HeadcountStatistics | null>(null);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [postOptions, setPostOptions] = useState<PostOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<HeadcountDialogMode>('create');
  const [keyword, setKeyword] = useState('');
  const [targetFilter, setTargetFilter] = useState<string>(ALL_TARGETS);
  const [scopeFilter, setScopeFilter] = useState(LIST_SCOPE_ACTIVE);
  const [selectedHeadcountId, setSelectedHeadcountId] = useState('');
  const [actualCountInput, setActualCountInput] = useState('');
  const [createForm, setCreateForm] = useState<HeadcountPayload>(createDefaultForm);

  const loadOptions = async () => {
    try {
      const [deptRes, postRes] = await Promise.all([getDeptTreeOptions(), getPostOptions()]);
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPostOptions(normalizeRows<PostOption>(postRes));
    } catch (error) {
      console.error(error);
      toast.error('编制基础选项加载失败');
    }
  };

  const loadHeadcountList = async (
    nextSelection?: number | { targetType: HeadcountTargetType; targetId: number },
  ) => {
    setListLoading(true);
    try {
      const data = await listHeadcounts({
        targetType: targetFilter === ALL_TARGETS ? undefined : (targetFilter as HeadcountTargetType),
        includeExpired: scopeFilter === LIST_SCOPE_ALL,
      });
      const rows = Array.isArray(data) ? data : [];
      setHeadcounts(rows);

      let nextSelectedId = '';

      if (typeof nextSelection === 'number') {
        nextSelectedId = rows.some((item) => item.id === nextSelection) ? String(nextSelection) : '';
      } else if (nextSelection) {
        const matched = rows.find(
          (item) => item.targetType === nextSelection.targetType && item.targetId === nextSelection.targetId,
        );
        nextSelectedId = matched ? String(matched.id) : '';
      } else if (selectedHeadcountId && rows.some((item) => String(item.id) === selectedHeadcountId)) {
        nextSelectedId = selectedHeadcountId;
      } else if (rows[0]) {
        nextSelectedId = String(rows[0].id);
      }

      setSelectedHeadcountId(nextSelectedId);
      if (!nextSelectedId) {
        setStatistics(null);
        setActualCountInput('');
      }
    } catch (error) {
      console.error(error);
      toast.error('编制列表加载失败');
    } finally {
      setListLoading(false);
    }
  };

  const loadStatistics = async (targetType: HeadcountTargetType, targetId: number) => {
    setDetailLoading(true);
    try {
      const detail = await getHeadcountStatistics(targetType, targetId);
      setStatistics(detail);
      setActualCountInput(String(detail.actualCount ?? 0));
    } catch (error) {
      console.error(error);
      setStatistics(null);
      toast.error('编制统计加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      await Promise.all([loadOptions(), loadHeadcountList()]);
      setLoading(false);
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    if (loading) return;
    void loadHeadcountList();
  }, [loading, scopeFilter, targetFilter]);

  const selectedHeadcount = useMemo(
    () => headcounts.find((item) => String(item.id) === selectedHeadcountId) || null,
    [headcounts, selectedHeadcountId],
  );

  useEffect(() => {
    if (!selectedHeadcount) {
      setStatistics(null);
      setActualCountInput('');
      return;
    }

    void loadStatistics(selectedHeadcount.targetType, selectedHeadcount.targetId);
  }, [selectedHeadcount]);

  const currentTargetOptions = useMemo(
    () =>
      createForm.targetType === 'POST'
        ? postOptions.map((item) => ({ label: item.postName, value: item.postId }))
        : deptOptions,
    [createForm.targetType, deptOptions, postOptions],
  );

  useEffect(() => {
    if (!currentTargetOptions.length) return;
    if (currentTargetOptions.some((item) => item.value === createForm.targetId)) return;

    setCreateForm((prev) => ({
      ...prev,
      targetId: currentTargetOptions[0]?.value || 0,
    }));
  }, [createForm.targetId, currentTargetOptions]);

  const filteredHeadcounts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return headcounts;

    return headcounts.filter((item) =>
      [
        item.targetName,
        targetTypeLabel(item.targetType),
        item.targetId,
        item.approvedCount,
        item.actualCount,
        item.vacancyCount,
      ]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(normalizedKeyword)),
    );
  }, [headcounts, keyword]);

  useEffect(() => {
    if (!filteredHeadcounts.length) {
      setSelectedHeadcountId('');
      return;
    }

    if (
      !selectedHeadcountId
      || !filteredHeadcounts.some((item) => String(item.id) === selectedHeadcountId)
    ) {
      setSelectedHeadcountId(String(filteredHeadcounts[0].id));
    }
  }, [filteredHeadcounts, selectedHeadcountId]);

  const summary = useMemo(() => {
    const deptCount = headcounts.filter((item) => item.targetType === 'DEPT').length;
    const postCount = headcounts.filter((item) => item.targetType === 'POST').length;
    const vacancyTotal = headcounts.reduce((sum, item) => sum + Math.max(item.vacancyCount, 0), 0);
    const overstaffedCount = headcounts.filter(
      (item) => item.actualCount > item.approvedCount || item.vacancyCount < 0,
    ).length;

    return {
      deptCount,
      postCount,
      vacancyTotal,
      overstaffedCount,
    };
  }, [headcounts]);

  const isEditMode = dialogMode === 'edit';

  const buildCreateForm = (): HeadcountPayload => ({
    ...createDefaultForm(),
    targetType: 'DEPT',
    targetId: deptOptions[0]?.value || postOptions[0]?.postId || 0,
  });

  const resetCreateDialog = () => {
    setDialogMode('create');
    setCreateForm(buildCreateForm());
    setCreateDialogOpen(false);
  };

  const handleOpenCreate = () => {
    setDialogMode('create');
    setCreateForm(buildCreateForm());
    setCreateDialogOpen(true);
  };

  const handleOpenEdit = () => {
    if (!selectedHeadcount) return;
    setDialogMode('edit');
    setCreateForm(createFormFromHeadcount(selectedHeadcount));
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.targetId) {
      toast.error('请选择编制目标');
      return;
    }
    if (createForm.approvedCount < 0) {
      toast.error('核定编制数不能小于 0');
      return;
    }
    if (
      createForm.expiryDate
      && createForm.effectiveDate
      && createForm.expiryDate < createForm.effectiveDate
    ) {
      toast.error('失效日期不能早于生效日期');
      return;
    }

    setActionLoading(true);
    try {
      await setHeadcount({
        ...createForm,
        effectiveDate: createForm.effectiveDate || undefined,
        expiryDate: createForm.expiryDate || undefined,
      });
      toast.success(isEditMode ? '编制已更新' : '编制已保存');
      resetCreateDialog();
      await loadHeadcountList({
        targetType: createForm.targetType,
        targetId: createForm.targetId,
      });
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '保存编制失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateActualCount = async () => {
    if (!selectedHeadcount) return;
    if (!/^\d+$/.test(actualCountInput.trim())) {
      toast.error('实际在职人数必须是非负整数');
      return;
    }

    setActionLoading(true);
    try {
      await updateHeadcountActualCount(
        selectedHeadcount.targetType,
        selectedHeadcount.targetId,
        Number(actualCountInput),
      );
      toast.success('实际在职人数已更新');
      await loadHeadcountList(selectedHeadcount.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '更新实际在职人数失败');
    } finally {
      setActionLoading(false);
    }
  };

  const detailVacancyCount = statistics?.vacancyCount ?? selectedHeadcount?.vacancyCount ?? 0;
  const detailApprovedCount = statistics?.approvedCount ?? selectedHeadcount?.approvedCount ?? 0;
  const detailActualCount = statistics?.actualCount ?? selectedHeadcount?.actualCount ?? 0;
  const detailTargetName = statistics?.targetName || selectedHeadcount?.targetName || '-';

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Layers3 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Headcount
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          编制管理
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          记录 {loading ? '--' : headcounts.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          部门 {loading ? '--' : summary.deptCount}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          岗位 {loading ? '--' : summary.postCount}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          空缺 {loading ? '--' : summary.vacancyTotal}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          超编 {loading ? '--' : summary.overstaffedCount}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadHeadcountList(selectedHeadcount ? selectedHeadcount.id : undefined)}
          >
            <RefreshCcw
              size={14}
              className={`mr-1.5 ${loading || listLoading ? 'animate-spin' : ''}`}
            />
            刷新列表
          </Button>
          {selectedHeadcount ? (
            <Button variant="outline" size="sm" onClick={handleOpenEdit}>
              <SquarePen size={14} className="mr-1.5" />
              编辑当前编制
            </Button>
          ) : null}
          <Button size="sm" onClick={handleOpenCreate}>
            <FilePlus2 size={14} className="mr-1.5" />
            新增编制
          </Button>
        </div>
      </div>

      <TablePageLayout
        filters={(
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  className="pl-10"
                  placeholder="搜索目标名称、类型或目标 ID"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>

              <div className="w-full sm:w-40">
                <Select value={targetFilter} onValueChange={setTargetFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TARGETS}>全部类型</SelectItem>
                    <SelectItem value="DEPT">部门编制</SelectItem>
                    <SelectItem value="POST">岗位编制</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-44">
                <Select value={scopeFilter} onValueChange={setScopeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LIST_SCOPE_ACTIVE}>仅看有效编制</SelectItem>
                    <SelectItem value={LIST_SCOPE_ALL}>包含已失效编制</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
              <Button
                variant="outline"
                onClick={() => {
                  setKeyword('');
                  setTargetFilter(ALL_TARGETS);
                  setScopeFilter(LIST_SCOPE_ACTIVE);
                }}
              >
                重置筛选
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="grid min-h-[580px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 xl:border-r xl:border-slate-200 dark:xl:border-slate-800">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">编制列表</div>
              </div>

              <div className="overflow-x-auto">
                <Table className="min-w-[860px]">
                  <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                    <TableRow>
                      <TableHead>目标</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>核定</TableHead>
                      <TableHead>在职</TableHead>
                      <TableHead>空缺 / 超编</TableHead>
                      <TableHead>有效期</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading || listLoading ? (
                      <TableStateRow
                        colSpan={7}
                        title="正在加载编制列表..."
                        loading
                      />
                    ) : filteredHeadcounts.length === 0 ? (
                      <TableStateRow
                        colSpan={7}
                        title="当前筛选条件下没有编制记录"
                      />
                    ) : (
                      filteredHeadcounts.map((item) => {
                        const isActive = String(item.id) === selectedHeadcountId;
                        const isOverstaffed =
                          item.actualCount > item.approvedCount || item.vacancyCount < 0;

                        return (
                          <TableRow
                            key={item.id}
                            className={isActive ? 'bg-cyan-50/70 dark:bg-cyan-950/20' : undefined}
                          >
                            <TableCell>
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {item.targetName || '-'}
                              </div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                目标 ID：{item.targetId}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={[
                                  'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                                  targetTypeTone(item.targetType),
                                ].join(' ')}
                              >
                                {targetTypeLabel(item.targetType)}
                              </span>
                            </TableCell>
                            <TableCell>{item.approvedCount}</TableCell>
                            <TableCell>{item.actualCount}</TableCell>
                            <TableCell>
                              <span
                                className={[
                                  'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                                  vacancyTone(item),
                                ].join(' ')}
                              >
                                {isOverstaffed
                                  ? `超编 ${Math.abs(item.vacancyCount)}`
                                  : `空缺 ${item.vacancyCount}`}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                              {formatValidityLabel(item)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={isActive ? 'default' : 'outline'}
                                onClick={() => setSelectedHeadcountId(String(item.id))}
                              >
                                {isActive ? '已选中' : '查看'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <aside className="flex min-h-0 flex-col border-t border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/20 xl:border-l-0 xl:border-t-0">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">编制详情</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    查看使用率，并直接维护实际在职人数。
                  </div>
                </div>
                {selectedHeadcount ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void loadStatistics(selectedHeadcount.targetType, selectedHeadcount.targetId)
                    }
                  >
                    <RefreshCcw
                      size={14}
                      className={`mr-1.5 ${detailLoading ? 'animate-spin' : ''}`}
                    />
                    刷新
                  </Button>
                ) : null}
              </div>

              {!selectedHeadcount ? (
                <InlineState
                  title="请选择一条编制记录"
                  className="flex-1 py-16"
                />
              ) : (
                <div className="flex flex-1 flex-col gap-4 p-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                          当前目标
                        </div>
                        <div className="mt-2 truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                          {detailTargetName}
                        </div>
                        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {targetTypeLabel(selectedHeadcount.targetType)} / 目标 ID：{selectedHeadcount.targetId}
                        </div>
                      </div>
                      <span
                        className={[
                          'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                          targetTypeTone(selectedHeadcount.targetType),
                        ].join(' ')}
                      >
                        {targetTypeLabel(selectedHeadcount.targetType)}
                      </span>
                    </div>
                    {detailLoading ? (
                      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        统计数据同步中...
                      </div>
                    ) : null}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <DetailRow label="核定编制" value={detailApprovedCount} />
                    <DetailRow label="实际在职" value={detailActualCount} />
                    <DetailRow
                      label="空缺 / 超编"
                      value={(
                        <span
                          className={[
                            'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                            vacancyTone({
                              approvedCount: detailApprovedCount,
                              actualCount: detailActualCount,
                              vacancyCount: detailVacancyCount,
                            }),
                          ].join(' ')}
                        >
                          {detailActualCount > detailApprovedCount || detailVacancyCount < 0
                            ? `超编 ${Math.abs(detailVacancyCount)}`
                            : `空缺 ${detailVacancyCount}`}
                        </span>
                      )}
                    />
                    <DetailRow
                      label="使用率"
                      value={formatUtilizationRate(statistics?.utilizationRate)}
                    />
                    <DetailRow
                      label="生效日期"
                      value={formatDateLabel(selectedHeadcount.effectiveDate)}
                    />
                    <DetailRow
                      label="失效日期"
                      value={formatDateLabel(selectedHeadcount.expiryDate, '长期有效')}
                    />
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        维护实际在职人数
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        更新后端 `actualCount` 后，会自动重算空缺与超编状态。
                      </div>
                    </div>

                    <div className="space-y-4 p-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          实际在职人数
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={actualCountInput}
                          onChange={(event) => setActualCountInput(event.target.value)}
                          className="h-11"
                        />
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                        当前目标：{detailTargetName}，类型为 {targetTypeLabel(selectedHeadcount.targetType)}。
                      </div>

                      <Button
                        className="w-full"
                        disabled={actionLoading}
                        onClick={() => void handleUpdateActualCount()}
                      >
                        <BarChart3 size={16} className="mr-2" />
                        {actionLoading ? '更新中...' : '更新实际人数'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}
      />

      <BaseDialog
        open={createDialogOpen}
        title={isEditMode ? '编辑编制' : '新增编制'}
        onClose={resetCreateDialog}
        maxWidthClassName="max-w-3xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetCreateDialog}>
              取消
            </Button>
            <Button disabled={actionLoading} onClick={() => void handleCreate()}>
              {actionLoading ? '保存中...' : isEditMode ? '保存修改' : '保存编制'}
            </Button>
          </div>
        )}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              目标类型
            </Label>
            <Select
              value={createForm.targetType}
              disabled={isEditMode}
              onValueChange={(value) =>
                setCreateForm((prev) => ({
                  ...prev,
                  targetType: value as HeadcountTargetType,
                  targetId: 0,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEPT">部门编制</SelectItem>
                <SelectItem value="POST">岗位编制</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              编制目标
            </Label>
            <Select
              disabled={isEditMode}
              value={createForm.targetId ? String(createForm.targetId) : undefined}
              onValueChange={(value) =>
                setCreateForm((prev) => ({ ...prev, targetId: Number(value) }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择目标" />
              </SelectTrigger>
              <SelectContent>
                {currentTargetOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              核定编制数
            </Label>
            <Input
              type="number"
              min={0}
              value={createForm.approvedCount}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  approvedCount: Number(event.target.value) || 0,
                }))
              }
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              生效日期
            </Label>
            <Input
              type="date"
              value={createForm.effectiveDate || ''}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, effectiveDate: event.target.value }))
              }
              className="h-11"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              失效日期
            </Label>
            <Input
              type="date"
              value={createForm.expiryDate || ''}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, expiryDate: event.target.value }))
              }
              className="h-11"
            />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrHeadcountPage;
