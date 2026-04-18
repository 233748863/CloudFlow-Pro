import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, BriefcaseBusiness, Building2, FilePlus2, Layers3, RefreshCcw, Search, SquarePen, Users } from 'lucide-react';
import { toast } from 'sonner';
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
import { WorkspaceInlineState, WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
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
import { WorkspaceDialogShell, WorkspaceHeroCard, WorkspaceMetricCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';
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

const vacancyTone = (headcount: Pick<Headcount, 'approvedCount' | 'actualCount' | 'vacancyCount'>) => {
  if (headcount.actualCount > headcount.approvedCount || headcount.vacancyCount < 0) {
    return 'bg-rose-50 text-rose-700 border-rose-100';
  }
  if (headcount.vacancyCount > 0) {
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-100';
};

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
      const [deptRes, postRes] = await Promise.all([
        getDeptTreeOptions(),
        getPostOptions(),
      ]);
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
        nextSelectedId = rows.some(item => item.id === nextSelection) ? String(nextSelection) : '';
      } else if (nextSelection) {
        const matched = rows.find(item => item.targetType === nextSelection.targetType && item.targetId === nextSelection.targetId);
        nextSelectedId = matched ? String(matched.id) : '';
      } else if (selectedHeadcountId && rows.some(item => String(item.id) === selectedHeadcountId)) {
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
    () => headcounts.find(item => String(item.id) === selectedHeadcountId) || null,
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
    () => (createForm.targetType === 'POST'
      ? postOptions.map(item => ({ label: item.postName, value: item.postId }))
      : deptOptions),
    [createForm.targetType, deptOptions, postOptions],
  );

  useEffect(() => {
    if (!currentTargetOptions.length) return;
    if (currentTargetOptions.some(item => item.value === createForm.targetId)) return;

    setCreateForm(prev => ({
      ...prev,
      targetId: currentTargetOptions[0]?.value || 0,
    }));
  }, [createForm.targetId, currentTargetOptions]);

  const filteredHeadcounts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return headcounts;

    return headcounts.filter(item =>
      [
        item.targetName,
        targetTypeLabel(item.targetType),
        item.targetId,
        item.approvedCount,
        item.actualCount,
        item.vacancyCount,
      ]
        .filter(value => value !== null && value !== undefined)
        .some(value => String(value).toLowerCase().includes(normalizedKeyword)),
    );
  }, [headcounts, keyword]);

  useEffect(() => {
    if (!filteredHeadcounts.length) {
      setSelectedHeadcountId('');
      return;
    }

    if (!selectedHeadcountId || !filteredHeadcounts.some(item => String(item.id) === selectedHeadcountId)) {
      setSelectedHeadcountId(String(filteredHeadcounts[0].id));
    }
  }, [filteredHeadcounts, selectedHeadcountId]);

  const metrics = useMemo(() => {
    const deptCount = headcounts.filter(item => item.targetType === 'DEPT').length;
    const postCount = headcounts.filter(item => item.targetType === 'POST').length;
    const vacancyTotal = headcounts.reduce((sum, item) => sum + Math.max(item.vacancyCount, 0), 0);
    const overstaffedCount = headcounts.filter(item => item.actualCount > item.approvedCount || item.vacancyCount < 0).length;

    return [
      { label: '编制记录', value: headcounts.length, hint: '当前查询范围内的有效编制', icon: <Layers3 size={18} />, tone: 'bg-slate-100 text-slate-600' },
      { label: '部门编制', value: deptCount, hint: '按部门维护的编制数', icon: <Building2 size={18} />, tone: 'bg-sky-50 text-sky-600' },
      { label: '岗位编制', value: postCount, hint: '按岗位维护的编制数', icon: <BriefcaseBusiness size={18} />, tone: 'bg-violet-50 text-violet-600' },
      { label: '空缺总量', value: vacancyTotal, hint: `${overstaffedCount} 项存在超编风险`, icon: <Users size={18} />, tone: 'bg-amber-50 text-amber-600' },
    ];
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
    if (createForm.expiryDate && createForm.effectiveDate && createForm.expiryDate < createForm.effectiveDate) {
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

  return (
    <div className="space-y-6">
      <WorkspaceHeroCard
        badge={(
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            <Layers3 size={14} />
            Headcount Control
          </div>
        )}
        title="编制管理中心"
        description="围绕部门和岗位维护核定编制、实际在职与空缺情况，直接联调 HR 编制接口。"
        actions={(
          <>
            <Button className="rounded-2xl" onClick={handleOpenCreate}>
              <FilePlus2 size={16} className="mr-2" />
              新增编制
            </Button>
            {selectedHeadcount && (
              <Button variant="outline" className="rounded-2xl" onClick={handleOpenEdit}>
                <SquarePen size={16} className="mr-2" />
                编辑当前编制
              </Button>
            )}
            <Button variant="outline" className="rounded-2xl" onClick={() => void loadHeadcountList()}>
              <RefreshCcw size={16} className="mr-2" />
              刷新列表
            </Button>
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
          <WorkspaceMetricCard
            key={metric.label}
            label={metric.label}
            value={loading ? '--' : metric.value}
            hint={metric.hint}
            aside={<div className={`rounded-2xl p-3 ${metric.tone}`}>{metric.icon}</div>}
          />
        ))}
      </div>

      <WorkspaceSectionCard
        title="筛选与检索"
        description="按目标类型、有效范围和关键词定位当前要维护的编制记录。"
        bodyClassName="mt-0"
      >
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_180px_180px_auto]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              placeholder="搜索目标名称、目标类型、目标 ID"
              value={keyword}
              onChange={event => setKeyword(event.target.value)}
            />
          </div>
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
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LIST_SCOPE_ACTIVE}>仅看有效编制</SelectItem>
              <SelectItem value={LIST_SCOPE_ALL}>包含已失效编制</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              setKeyword('');
              setTargetFilter(ALL_TARGETS);
              setScopeFilter(LIST_SCOPE_ACTIVE);
            }}
          >
            重置
          </Button>
        </div>
      </WorkspaceSectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
        <WorkspaceSectionCard
          title="编制列表"
          description="左侧先锁定一条编制记录，右侧再查看统计和维护在职人数。"
          bodyClassName="mt-0"
          className="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>目标</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>核定编制</TableHead>
                <TableHead>实际在职</TableHead>
                <TableHead>空缺 / 超编</TableHead>
                <TableHead>生效日期</TableHead>
                <TableHead>失效日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHeadcounts.map(item => {
                const isActive = String(item.id) === selectedHeadcountId;
                const isOverstaffed = item.actualCount > item.approvedCount || item.vacancyCount < 0;

                return (
                  <TableRow
                    key={item.id}
                    className={isActive ? 'bg-sky-50/70' : undefined}
                  >
                    <TableCell>
                      <div className="font-semibold text-slate-900">{item.targetName || '-'}</div>
                      <div className="text-xs text-slate-400">目标 ID：{item.targetId}</div>
                    </TableCell>
                    <TableCell>{targetTypeLabel(item.targetType)}</TableCell>
                    <TableCell>{item.approvedCount}</TableCell>
                    <TableCell>{item.actualCount}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${vacancyTone(item)}`}>
                        {isOverstaffed ? `超编 ${Math.abs(item.vacancyCount)}` : `空缺 ${item.vacancyCount}`}
                      </span>
                    </TableCell>
                    <TableCell>{toDateInputValue(item.effectiveDate) || '-'}</TableCell>
                    <TableCell>{toDateInputValue(item.expiryDate) || '长期有效'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={isActive ? 'default' : 'outline'} onClick={() => setSelectedHeadcountId(String(item.id))}>
                        查看统计
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filteredHeadcounts.length && !listLoading && (
                <WorkspaceTableStateRow
                  colSpan={8}
                  title="当前筛选条件下没有编制记录"
                  rowClassName="border-slate-100 hover:bg-transparent"
                  cellClassName="px-4 py-6"
                />
              )}
              {(loading || listLoading) && (
                <WorkspaceTableStateRow
                  type="loading"
                  colSpan={8}
                  title="正在加载编制列表..."
                  rowClassName="border-slate-100 hover:bg-transparent"
                  cellClassName="px-4 py-16"
                />
              )}
            </TableBody>
          </Table>
        </WorkspaceSectionCard>

        <div className="space-y-6">
          <WorkspaceSectionCard
            title="编制统计"
            description="按真实统计接口查看使用率、空缺和超编情况。"
            headerAside={selectedHeadcount ? (
              <Button variant="outline" onClick={() => void loadStatistics(selectedHeadcount.targetType, selectedHeadcount.targetId)}>
                <RefreshCcw size={14} className="mr-2" />
                刷新统计
              </Button>
            ) : null}
            bodyClassName="mt-0"
          >
            {!selectedHeadcount && (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center text-sm text-slate-500">
                从左侧选择一条编制记录查看详情和统计。
              </div>
            )}

            {selectedHeadcount && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2">
                  <div className="text-xs text-slate-400">目标名称</div>
                  <div className="mt-2 font-semibold text-slate-900">{statistics?.targetName || selectedHeadcount.targetName || '-'}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {targetTypeLabel(selectedHeadcount.targetType)} / 目标 ID：{selectedHeadcount.targetId}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">核定编制</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{detailApprovedCount}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">实际在职</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{detailActualCount}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">空缺 / 超编</div>
                  <div className="mt-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${vacancyTone({
                      approvedCount: detailApprovedCount,
                      actualCount: detailActualCount,
                      vacancyCount: detailVacancyCount,
                    })}`}>
                      {detailActualCount > detailApprovedCount || detailVacancyCount < 0
                        ? `超编 ${Math.abs(detailVacancyCount)}`
                        : `空缺 ${detailVacancyCount}`}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">使用率</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{formatUtilizationRate(statistics?.utilizationRate)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">生效日期</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(selectedHeadcount.effectiveDate) || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">失效日期</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(selectedHeadcount.expiryDate) || '长期有效'}</div>
                </div>
              </div>
            )}

            {detailLoading && <WorkspaceInlineState type="loading" title="正在加载统计数据..." className="mt-4 py-4" />}
          </WorkspaceSectionCard>

          <WorkspaceSectionCard
            title="维护实际在职人数"
            description="更新后端 `actualCount` 后，会自动重算空缺人数。"
            bodyClassName="mt-0"
          >
            {!selectedHeadcount && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                先从左侧选择一条编制记录，再维护实际在职人数。
              </div>
            )}

            {selectedHeadcount && (
              <div className="space-y-4">
                <div>
                  <Label>实际在职人数</Label>
                  <Input
                    className="mt-2"
                    type="number"
                    min={0}
                    value={actualCountInput}
                    onChange={event => setActualCountInput(event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  当前目标：{statistics?.targetName || selectedHeadcount.targetName || '-'}，类型为 {targetTypeLabel(selectedHeadcount.targetType)}。
                </div>
                <Button className="w-full" disabled={actionLoading} onClick={() => void handleUpdateActualCount()}>
                  <BarChart3 size={16} className="mr-2" />
                  更新实际人数
                </Button>
              </div>
            )}
          </WorkspaceSectionCard>
        </div>
      </div>

      {createDialogOpen && (
        <WorkspaceDialogShell
          title={isEditMode ? '编辑编制' : '新增编制'}
          description={
            isEditMode
              ? '编辑模式会预填当前编制，目标类型和目标不可修改，到期日留空表示长期有效。'
              : '若当前目标已有有效编制，后端会直接更新该记录。'
          }
          onClose={resetCreateDialog}
          maxWidthClassName="max-w-3xl"
        >

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>目标类型</Label>
                <Select
                  value={createForm.targetType}
                  disabled={isEditMode}
                  onValueChange={value => setCreateForm(prev => ({
                    ...prev,
                    targetType: value as HeadcountTargetType,
                    targetId: 0,
                  }))}
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

              <div>
                <Label>编制目标</Label>
                <Select
                  disabled={isEditMode}
                  value={createForm.targetId ? String(createForm.targetId) : undefined}
                  onValueChange={value => setCreateForm(prev => ({ ...prev, targetId: Number(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择目标" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentTargetOptions.map(option => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>核定编制数</Label>
                <Input
                  type="number"
                  min={0}
                  value={createForm.approvedCount}
                  onChange={event => setCreateForm(prev => ({
                    ...prev,
                    approvedCount: Number(event.target.value) || 0,
                  }))}
                />
              </div>

              <div>
                <Label>生效日期</Label>
                <Input
                  type="date"
                  value={createForm.effectiveDate || ''}
                  onChange={event => setCreateForm(prev => ({ ...prev, effectiveDate: event.target.value }))}
                />
              </div>

              <div className="md:col-span-2">
                <Label>失效日期</Label>
                <Input
                  type="date"
                  value={createForm.expiryDate || ''}
                  onChange={event => setCreateForm(prev => ({ ...prev, expiryDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={resetCreateDialog}>取消</Button>
              <Button disabled={actionLoading} onClick={() => void handleCreate()}>
                {isEditMode ? '保存修改' : '保存编制'}
              </Button>
            </div>
        </WorkspaceDialogShell>
      )}
    </div>
  );
};

export default HrHeadcountPage;
