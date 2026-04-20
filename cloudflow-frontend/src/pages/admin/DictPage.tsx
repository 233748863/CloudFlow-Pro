import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Edit, Plus, RefreshCw, Search, ShieldCheck, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspaceInlineState,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceSectionCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';
import { dictDataApi, dictTypeApi, type SysDictData, type SysDictType } from '../../services/api/dict';
import { cn } from '@/utils/cn';

type DictTypeFilters = {
  keyword: string;
  status: string;
};

interface DictTypeFormState {
  dictName: string;
  dictType: string;
  status: string;
  remark: string;
}

interface DictDataFormState {
  dictLabel: string;
  dictValue: string;
  dictSort: number;
  listClass: string;
  isDefault: string;
  status: string;
  remark: string;
}

type DeleteTarget =
  | { type: 'dictType'; item: SysDictType }
  | { type: 'dictData'; item: SysDictData };

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';
const sectionPanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';
const nestedPanelClassName =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/78';
const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

const createTypeForm = (): DictTypeFormState => ({
  dictName: '',
  dictType: '',
  status: '0',
  remark: '',
});

const createDataForm = (): DictDataFormState => ({
  dictLabel: '',
  dictValue: '',
  dictSort: 0,
  listClass: '',
  isDefault: 'N',
  status: '0',
  remark: '',
});

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const getStatusBadgeClassName = (status: string) =>
  status === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const getListClassBadgeClassName = (listClass: string) => {
  switch (listClass) {
    case 'primary':
      return 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200';
    case 'success':
      return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200';
    case 'warning':
      return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200';
    case 'danger':
      return 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';
    case 'info':
      return 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200';
    default:
      return 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
  }
};

const getListClassLabel = (listClass: string) => {
  switch (listClass) {
    case 'primary':
      return '主要';
    case 'success':
      return '成功';
    case 'warning':
      return '警告';
    case 'danger':
      return '危险';
    case 'info':
      return '信息';
    default:
      return '默认';
  }
};

const getDefaultBadgeClassName = (isDefault: string) =>
  isDefault === 'Y'
    ? 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200'
    : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

export const DictPage: React.FC = () => {
  const [dictTypes, setDictTypes] = useState<SysDictType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [dictDataList, setDictDataList] = useState<SysDictData[]>([]);
  const [typeLoading, setTypeLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DictTypeFilters>({
    keyword: '',
    status: '',
  });
  const [query, setQuery] = useState<DictTypeFilters>({
    keyword: '',
    status: '',
  });
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<SysDictType | null>(null);
  const [editingData, setEditingData] = useState<SysDictData | null>(null);
  const [typeForm, setTypeForm] = useState<DictTypeFormState>(createTypeForm);
  const [dataForm, setDataForm] = useState<DictDataFormState>(createDataForm);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const selectedType = useMemo(
    () => dictTypes.find((item) => item.dictId === selectedTypeId) ?? null,
    [dictTypes, selectedTypeId],
  );

  useEffect(() => {
    void loadDictTypes();
  }, []);

  useEffect(() => {
    if (!selectedType) {
      setDictDataList([]);
      setDataError(null);
      return;
    }

    void loadDictData(selectedType.dictType);
  }, [selectedType?.dictType]);

  const loadDictTypes = async () => {
    setTypeLoading(true);
    setTypeError(null);

    try {
      const response = await dictTypeApi.list();
      const nextTypes = Array.isArray(response) ? response : [];
      setDictTypes(nextTypes);
      if (selectedTypeId && !nextTypes.some((item) => item.dictId === selectedTypeId)) {
        setSelectedTypeId(null);
      }
    } catch (error) {
      console.error('获取字典类型失败:', error);
      const message = '获取字典类型失败，请稍后重试';
      setTypeError(message);
      setDictTypes([]);
      setSelectedTypeId(null);
      toast.error(message);
    } finally {
      setTypeLoading(false);
    }
  };

  const loadDictData = async (dictType: string) => {
    setDataLoading(true);
    setDataError(null);

    try {
      const response = await dictDataApi.list(dictType);
      setDictDataList(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('获取字典数据失败:', error);
      const message = '获取字典数据失败，请稍后重试';
      setDataError(message);
      setDictDataList([]);
      toast.error(message);
    } finally {
      setDataLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadDictTypes();
    if (selectedType?.dictType) {
      await loadDictData(selectedType.dictType);
    }
  };

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

  const handleQuickFilterChange = (value: string) => {
    setFilters((prev) => ({ ...prev, status: value }));
    setQuery((prev) => ({ ...prev, status: value }));
  };

  const openTypeModal = (item?: SysDictType) => {
    if (item) {
      setEditingType(item);
      setTypeForm({
        dictName: item.dictName,
        dictType: item.dictType,
        status: item.status || '0',
        remark: item.remark || '',
      });
    } else {
      setEditingType(null);
      setTypeForm(createTypeForm());
    }
    setTypeModalOpen(true);
  };

  const openDataModal = (item?: SysDictData) => {
    if (!selectedType && !item) {
      toast.error('请先选择字典类型');
      return;
    }

    if (item) {
      setEditingData(item);
      setDataForm({
        dictLabel: item.dictLabel,
        dictValue: item.dictValue,
        dictSort: item.dictSort || 0,
        listClass: item.listClass || '',
        isDefault: item.isDefault || 'N',
        status: item.status || '0',
        remark: item.remark || '',
      });
    } else {
      setEditingData(null);
      setDataForm(createDataForm());
    }

    setDataModalOpen(true);
  };

  const closeTypeModal = () => {
    setTypeModalOpen(false);
    setEditingType(null);
    setTypeForm(createTypeForm());
  };

  const closeDataModal = () => {
    setDataModalOpen(false);
    setEditingData(null);
    setDataForm(createDataForm());
  };

  const handleSaveType = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!typeForm.dictName.trim()) {
      toast.error('请输入字典名称');
      return;
    }

    if (!typeForm.dictType.trim()) {
      toast.error('请输入类型标识');
      return;
    }

    try {
      if (editingType) {
        await dictTypeApi.edit({
          ...editingType,
          ...typeForm,
        });
        toast.success('字典类型更新成功');
      } else {
        await dictTypeApi.add(typeForm as SysDictType);
        toast.success('字典类型创建成功');
      }

      closeTypeModal();
      await loadDictTypes();
    } catch (error) {
      console.error('保存字典类型失败:', error);
      toast.error('保存字典类型失败');
    }
  };

  const handleSaveData = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedType && !editingData) {
      toast.error('请先选择字典类型');
      return;
    }

    if (!dataForm.dictLabel.trim()) {
      toast.error('请输入数据标签');
      return;
    }

    if (!dataForm.dictValue.trim()) {
      toast.error('请输入数据键值');
      return;
    }

    try {
      if (editingData) {
        await dictDataApi.edit({
          ...editingData,
          ...dataForm,
        });
        toast.success('字典数据更新成功');
      } else if (selectedType) {
        await dictDataApi.add({
          ...dataForm,
          dictType: selectedType.dictType,
        } as SysDictData);
        toast.success('字典数据创建成功');
      }

      closeDataModal();
      if (selectedType?.dictType) {
        await loadDictData(selectedType.dictType);
      }
    } catch (error) {
      console.error('保存字典数据失败:', error);
      toast.error('保存字典数据失败');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'dictType' && deleteTarget.item.dictId) {
        await dictTypeApi.remove([deleteTarget.item.dictId]);
        toast.success('字典类型删除成功');
        if (selectedTypeId === deleteTarget.item.dictId) {
          setSelectedTypeId(null);
          setDictDataList([]);
        }
        await loadDictTypes();
      }

      if (deleteTarget.type === 'dictData' && deleteTarget.item.dictCode) {
        await dictDataApi.remove([deleteTarget.item.dictCode]);
        toast.success('字典数据删除成功');
        if (selectedType?.dictType) {
          await loadDictData(selectedType.dictType);
        }
      }
    } catch (error) {
      console.error('删除字典内容失败:', error);
      toast.error(deleteTarget.type === 'dictType' ? '删除字典类型失败' : '删除字典数据失败');
    } finally {
      setDeleteTarget(null);
    }
  };

  const filteredTypes = useMemo(
    () =>
      dictTypes.filter((item) => {
        const matchesKeyword =
          !query.keyword ||
          item.dictName.includes(query.keyword) ||
          item.dictType.includes(query.keyword);
        const matchesStatus = !query.status || (item.status || '0') === query.status;
        return matchesKeyword && matchesStatus;
      }),
    [dictTypes, query.keyword, query.status],
  );

  const activeTypeCount = useMemo(
    () => dictTypes.filter((item) => (item.status || '0') === '0').length,
    [dictTypes],
  );

  const activeDataCount = useMemo(
    () => dictDataList.filter((item) => (item.status || '0') === '0').length,
    [dictDataList],
  );

  const defaultDataCount = useMemo(
    () => dictDataList.filter((item) => item.isDefault === 'Y').length,
    [dictDataList],
  );

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasActiveFilters = Boolean(query.keyword || query.status);
  const currentKeywordLabel = query.keyword || '未设置';
  const currentStatusLabel = query.status === '0' ? '正常' : query.status === '1' ? '停用' : '全部';
  const isTypeEdit = Boolean(editingType);
  const isDataEdit = Boolean(editingData);

  const heroMetrics = [
    {
      label: '字典类型',
      value: `${dictTypes.length}`,
      hint: `正常状态 ${activeTypeCount} 个`,
      icon: <BookOpen size={17} />,
    },
    {
      label: '当前类型',
      value: selectedType?.dictName || '未选择',
      hint: selectedType?.dictType || '请先从左侧选择字典类型',
      icon: <ShieldCheck size={17} />,
      valueClassName: 'text-base sm:text-lg',
    },
    {
      label: '字典数据',
      value: `${dictDataList.length}`,
      hint: `启用 ${activeDataCount} 条 / 默认 ${defaultDataCount} 条`,
      icon: <Tag size={17} />,
    },
    {
      label: '筛选结果',
      value: `${filteredTypes.length}`,
      hint: hasActiveFilters ? `关键字 ${currentKeywordLabel}` : '当前未启用筛选',
      icon: <Search size={17} />,
    },
  ];

  const overviewItems = [
    { label: '当前类型', value: selectedType?.dictName || '未选择' },
    { label: '类型总数', value: `${dictTypes.length} 个` },
    { label: '筛选结果', value: `${filteredTypes.length} 个` },
    { label: '当前数据', value: `${dictDataList.length} 条` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                <BookOpen size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          }
          title="字典管理"
          description="统一字典类型、字典数据和维护入口的层级关系，让 System 标准 CRUD 页面不再保留私有的列表与弹层语法。"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={() => void handleRefresh()} disabled={typeLoading || dataLoading}>
                <RefreshCw size={15} className={cn((typeLoading || dataLoading) && 'animate-spin')} />
                刷新字典
              </Button>
              <Button variant="outline" size="lg" onClick={() => openTypeModal()}>
                <Plus size={15} />
                新增类型
              </Button>
              <Button size="lg" onClick={() => openDataModal()} disabled={!selectedType}>
                <Tag size={15} />
                新增数据
              </Button>
            </div>
          }
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 字典工作台
            </span>
            <span className={surfaceChipClassName}>关键字：{currentKeywordLabel}</span>
            <span className={surfaceChipClassName}>状态：{currentStatusLabel}</span>
            <span className={surfaceChipClassName}>当前类型：{selectedType?.dictName || '未选择'}</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="字典筛选"
          title="字典工作台"
          total={dictTypes.length}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          quickFilters={[
            { label: '全部', value: '' },
            { label: '正常', value: '0' },
            { label: '停用', value: '1' },
          ]}
          activeQuickFilter={filters.status}
          onQuickFilterChange={handleQuickFilterChange}
          headerBadges={
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>类型 {dictTypes.length} 个</span>
              <span className={surfaceChipClassName}>正常 {activeTypeCount} 个</span>
              <span className={surfaceChipClassName}>数据 {dictDataList.length} 条</span>
            </div>
          }
          quickFilterAside={
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  清空筛选
                </Button>
              ) : (
                <span className={surfaceChipClassName}>当前显示全部字典类型</span>
              )}
            </div>
          }
          filterBar={
            <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  type="text"
                  placeholder="按字典名称或类型标识搜索"
                  className="pl-10"
                  value={filters.keyword}
                  onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
                />
              </div>
              <Button type="submit">
                <Search size={15} />
                搜索字典
              </Button>
            </form>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <WorkspaceSectionCard
            eyebrow="Types"
            title="字典类型"
            description="左侧统一维护字典类型，选中后右侧联动展示对应的字典数据。"
            headerAside={
              <Button variant="outline" size="sm" onClick={() => openTypeModal()}>
                <Plus size={14} />
                新增类型
              </Button>
            }
          >
            <div className="space-y-3">
              {typeLoading ? (
                <WorkspaceInlineState type="loading" title="正在加载字典类型..." className="py-10" />
              ) : typeError ? (
                <WorkspaceInlineState
                  type="info"
                  icon={<BookOpen className="h-5 w-5" />}
                  title="字典类型加载失败"
                  description={typeError}
                  className="py-10"
                />
              ) : filteredTypes.length === 0 ? (
                <WorkspaceInlineState
                  icon={<BookOpen className="h-5 w-5" />}
                  title="暂无字典类型"
                  description="可以先新增一个字典类型，再继续维护对应的字典数据。"
                  className="py-10"
                />
              ) : (
                filteredTypes.map((item) => {
                  const isSelected = selectedTypeId === item.dictId;

                  return (
                    <button
                      key={item.dictId}
                      type="button"
                      onClick={() => setSelectedTypeId(item.dictId ?? null)}
                      className={cn(
                        'group w-full rounded-2xl border px-4 py-3 text-left transition',
                        isSelected
                          ? 'border-cyan-200 bg-cyan-50 shadow-sm dark:border-cyan-900/70 dark:bg-cyan-950/20'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/88 dark:hover:border-slate-700 dark:hover:bg-slate-900/70',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.dictName}
                          </div>
                          <div className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                            {item.dictType}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getStatusBadgeClassName(item.status || '0'))}>
                              {(item.status || '0') === '0' ? '正常' : '停用'}
                            </span>
                            <span className={surfaceChipClassName}>{item.createTime || '未记录时间'}</span>
                          </div>
                        </div>

                        <TableRowActions
                          align="end"
                          wrap={false}
                          className="shrink-0 opacity-0 transition group-hover:opacity-100"
                          actions={[
                            {
                              label: '编辑',
                              icon: <Edit size={13} />,
                              onClick: (event) => {
                                event.stopPropagation();
                                openTypeModal(item);
                              },
                              tone: 'primary',
                            },
                            {
                              label: '删除',
                              icon: <Trash2 size={13} />,
                              onClick: (event) => {
                                event.stopPropagation();
                                setDeleteTarget({ type: 'dictType', item });
                              },
                              tone: 'danger',
                            },
                          ]}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </WorkspaceSectionCard>

          <WorkspaceResultCard
            total={dictDataList.length}
            title={selectedType ? `${selectedType.dictName} 的字典数据` : '字典数据'}
            description={
              selectedType
                ? `当前类型标识：${selectedType.dictType}`
                : '先从左侧选择一个字典类型，再查看或维护对应的字典数据。'
            }
          >
            <div className="space-y-4 px-4 py-4">
              {selectedType ? (
                <div className={subtlePanelClassName}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">字典数据概况</div>
                      <div className="flex flex-wrap gap-2">
                        <span className={surfaceChipClassName}>类型：{selectedType.dictName}</span>
                        <span className={surfaceChipClassName}>标识：{selectedType.dictType}</span>
                        <span className={surfaceChipClassName}>启用 {activeDataCount} 条</span>
                        <span className={surfaceChipClassName}>默认 {defaultDataCount} 条</span>
                      </div>
                      <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                        字典标签、显示样式、默认项和启停状态已经统一纳入同一套标准 CRUD 语法，后续菜单、角色等 System 页会直接复用这组层级。
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {!selectedType ? (
                <WorkspaceInlineState
                  icon={<Tag className="h-5 w-5" />}
                  title="请先选择一个字典类型"
                  description="选中左侧类型后，这里会展示对应的字典数据与维护动作。"
                  className="py-16"
                />
              ) : (
                <Table className="min-w-[1080px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>排序</TableHead>
                      <TableHead>标签</TableHead>
                      <TableHead>键值</TableHead>
                      <TableHead>样式</TableHead>
                      <TableHead>默认项</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>备注</TableHead>
                      <TableActionHead className="w-48">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataLoading ? (
                      <WorkspaceTableStateRow colSpan={9} type="loading" title="正在加载字典数据..." />
                    ) : dataError ? (
                      <WorkspaceTableStateRow colSpan={9} title="字典数据加载失败" description={dataError} />
                    ) : dictDataList.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={9}
                        title="暂无字典数据"
                        description="可以先新增一条字典数据，再逐步补齐默认项和显示样式。"
                      />
                    ) : (
                      dictDataList.map((item) => (
                        <TableRow key={item.dictCode}>
                          <TableCell className="py-4 text-sm text-slate-500 dark:text-slate-400">{item.dictSort ?? 0}</TableCell>
                          <TableCell className="py-4">
                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getListClassBadgeClassName(item.listClass || ''))}>
                              {item.dictLabel}
                            </span>
                          </TableCell>
                          <TableCell className="py-4 font-mono text-xs text-slate-700 dark:text-slate-200">
                            {item.dictValue}
                          </TableCell>
                          <TableCell className="py-4 text-sm text-slate-500 dark:text-slate-400">
                            {getListClassLabel(item.listClass || '')}
                          </TableCell>
                          <TableCell className="py-4">
                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getDefaultBadgeClassName(item.isDefault || 'N'))}>
                              {item.isDefault === 'Y' ? '默认' : '否'}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getStatusBadgeClassName(item.status || '0'))}>
                              {(item.status || '0') === '0' ? '正常' : '停用'}
                            </span>
                          </TableCell>
                          <TableCell className="py-4 text-sm text-slate-500 dark:text-slate-400">
                            {item.createTime || '-'}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate py-4 text-sm text-slate-500 dark:text-slate-400" title={item.remark || '-'}>
                            {item.remark || '-'}
                          </TableCell>
                          <TableCell className="py-4 text-right">
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '编辑',
                                  icon: <Edit size={14} />,
                                  onClick: () => openDataModal(item),
                                  tone: 'primary',
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => setDeleteTarget({ type: 'dictData', item }),
                                  tone: 'danger',
                                },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </WorkspaceResultCard>
        </div>

        {typeModalOpen ? (
          <WorkspaceDialogShell
            title={isTypeEdit ? '编辑字典类型' : '新增字典类型'}
            description="统一维护字典名称、类型标识、启停状态和备注信息，避免 System 页面继续保留私有表单结构。"
            onClose={closeTypeModal}
            maxWidthClassName="max-w-3xl"
            headerAside={
              <div className="flex flex-wrap gap-2">
                <span className={surfaceChipClassName}>{isTypeEdit ? '编辑模式' : '新增模式'}</span>
                <span className={surfaceChipClassName}>状态：{typeForm.status === '0' ? '正常' : '停用'}</span>
              </div>
            }
            bodyClassName="space-y-6"
          >
            <form onSubmit={handleSaveType} className="space-y-4">
              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">基础信息</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">先定义字典名称和类型标识，再设置启停状态，便于后续在右侧维护对应的数据项。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClassName}>
                      字典名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={typeForm.dictName}
                      onChange={(event) => setTypeForm((prev) => ({ ...prev, dictName: event.target.value }))}
                      placeholder="如：用户性别"
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>
                      类型标识 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      className="font-mono"
                      value={typeForm.dictType}
                      onChange={(event) => setTypeForm((prev) => ({ ...prev, dictType: event.target.value }))}
                      placeholder="如：sys_user_sex"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={fieldLabelClassName}>状态</label>
                    <Select
                      value={typeForm.status}
                      onValueChange={(value) => setTypeForm((prev) => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger className="h-11 rounded-2xl">
                        <SelectValue placeholder="请选择状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">正常</SelectItem>
                        <SelectItem value="1">停用</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">备注</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">记录该字典类型的适用范围、业务含义或维护注意事项，减少后续误改。</div>
                </div>
                <div className={nestedPanelClassName}>
                  <Textarea
                    rows={4}
                    className="resize-none"
                    value={typeForm.remark}
                    onChange={(event) => setTypeForm((prev) => ({ ...prev, remark: event.target.value }))}
                    placeholder="备注说明"
                  />
                </div>
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={closeTypeModal}>
                  取消
                </Button>
                <Button type="submit">{isTypeEdit ? '保存修改' : '立即创建'}</Button>
              </div>
            </form>
          </WorkspaceDialogShell>
        ) : null}

        {dataModalOpen ? (
          <WorkspaceDialogShell
            title={isDataEdit ? '编辑字典数据' : '新增字典数据'}
            description="统一维护字典标签、键值、默认项和显示样式，让字典页和其他标准 CRUD 弹层保持同一套表单密度。"
            onClose={closeDataModal}
            maxWidthClassName="max-w-4xl"
            headerAside={
              <div className="flex flex-wrap gap-2">
                <span className={surfaceChipClassName}>{selectedType?.dictName || editingData?.dictType || '未选择类型'}</span>
                <span className={surfaceChipClassName}>状态：{dataForm.status === '0' ? '正常' : '停用'}</span>
                <span className={surfaceChipClassName}>默认项：{dataForm.isDefault === 'Y' ? '是' : '否'}</span>
              </div>
            }
            bodyClassName="space-y-6"
          >
            <form onSubmit={handleSaveData} className="space-y-4">
              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">基础信息</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">字典标签负责展示，键值负责业务判断，两者需要保持语义一一对应。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClassName}>
                      数据标签 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={dataForm.dictLabel}
                      onChange={(event) => setDataForm((prev) => ({ ...prev, dictLabel: event.target.value }))}
                      placeholder="如：男"
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>
                      数据键值 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      className="font-mono"
                      value={dataForm.dictValue}
                      onChange={(event) => setDataForm((prev) => ({ ...prev, dictValue: event.target.value }))}
                      placeholder="如：0"
                    />
                  </div>
                </div>
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">显示与状态</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">排序、显示样式、默认项和启停状态统一集中到同一块，便于快速完成字典数据维护。</div>
                </div>
                <div className={nestedPanelClassName}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={fieldLabelClassName}>排序号</label>
                      <Input
                        type="number"
                        value={dataForm.dictSort}
                        onChange={(event) =>
                          setDataForm((prev) => ({
                            ...prev,
                            dictSort: Number.parseInt(event.target.value, 10) || 0,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className={fieldLabelClassName}>显示样式</label>
                      <Select
                        value={dataForm.listClass}
                        onValueChange={(value) => setDataForm((prev) => ({ ...prev, listClass: value }))}
                      >
                        <SelectTrigger className="h-11 rounded-2xl">
                          <SelectValue placeholder="默认" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">默认</SelectItem>
                          <SelectItem value="primary">主要</SelectItem>
                          <SelectItem value="success">成功</SelectItem>
                          <SelectItem value="warning">警告</SelectItem>
                          <SelectItem value="danger">危险</SelectItem>
                          <SelectItem value="info">信息</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={fieldLabelClassName}>状态</label>
                      <Select
                        value={dataForm.status}
                        onValueChange={(value) => setDataForm((prev) => ({ ...prev, status: value }))}
                      >
                        <SelectTrigger className="h-11 rounded-2xl">
                          <SelectValue placeholder="请选择状态" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">正常</SelectItem>
                          <SelectItem value="1">停用</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={fieldLabelClassName}>是否默认</label>
                      <Select
                        value={dataForm.isDefault}
                        onValueChange={(value) => setDataForm((prev) => ({ ...prev, isDefault: value }))}
                      >
                        <SelectTrigger className="h-11 rounded-2xl">
                          <SelectValue placeholder="请选择默认状态" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="N">否</SelectItem>
                          <SelectItem value="Y">是</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">备注</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">记录字典数据的业务说明或兼容约束，方便后续联调时快速定位用途。</div>
                </div>
                <div className={nestedPanelClassName}>
                  <Textarea
                    rows={4}
                    className="resize-none"
                    value={dataForm.remark}
                    onChange={(event) => setDataForm((prev) => ({ ...prev, remark: event.target.value }))}
                    placeholder="备注说明"
                  />
                </div>
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={closeDataModal}>
                  取消
                </Button>
                <Button type="submit">{isDataEdit ? '保存修改' : '立即创建'}</Button>
              </div>
            </form>
          </WorkspaceDialogShell>
        ) : null}

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title={deleteTarget?.type === 'dictType' ? '确认删除字典类型' : '确认删除字典数据'}
          message={
            deleteTarget?.type === 'dictType'
              ? `确定要删除字典类型“${deleteTarget.item.dictName}”吗？该类型下的关联字典数据也会一起删除。`
              : `确定要删除字典数据“${deleteTarget?.item.dictLabel || ''}”吗？该操作不可恢复。`
          }
          confirmText="确认删除"
          cancelText="取消"
          danger={true}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      </WorkspacePageContent>
    </div>
  );
};

export default DictPage;
