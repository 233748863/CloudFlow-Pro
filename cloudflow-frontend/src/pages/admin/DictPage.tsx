import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Edit, Plus, RefreshCw, Search, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, ConfirmDialog } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
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

const RowActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tone?: 'neutral' | 'danger';
}> = ({ label, icon, onClick, tone = 'neutral' }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
      tone === 'danger'
        ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200',
    )}
    title={label}
    aria-label={label}
  >
    {icon}
  </button>
);

const DictTypeCardState: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ title, description, loading = false }) => (
  <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-10 text-center">
    {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </div>
    ) : null}
  </div>
);

const DictDataTableStateRow: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={9} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

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

      // 保证类型被删除后，右侧联动不会继续指向无效条目。
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

  const hasActiveFilters = Boolean(query.keyword || query.status);
  const isTypeEdit = Boolean(editingType);
  const isDataEdit = Boolean(editingData);

  return (
    <>
      <TablePageLayout
        className="gap-4"
        filters={
          <div className="flex flex-wrap items-start justify-between gap-3">
            <form
              onSubmit={handleSearch}
              className="flex flex-1 flex-wrap items-center gap-3"
            >
              <div className="relative w-full sm:w-64">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  type="text"
                  placeholder="按字典名称或类型标识搜索"
                  className="h-10 pl-10"
                  value={filters.keyword}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, keyword: event.target.value }))
                  }
                />
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.status}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, status: value }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部状态</SelectItem>
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
                  重置
                </Button>
              ) : null}
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRefresh()}
                disabled={typeLoading || dataLoading}
              >
                <RefreshCw size={15} className={cn((typeLoading || dataLoading) && 'animate-spin')} />
                刷新
              </Button>
              <Button variant="outline" size="sm" onClick={() => openTypeModal()}>
                <Plus size={15} />
                新增类型
              </Button>
              <Button size="sm" onClick={() => openDataModal()} disabled={!selectedType}>
                <Tag size={15} />
                新增数据
              </Button>
            </div>
          </div>
        }
        table={
          <div className="grid min-h-[680px] lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="border-b border-slate-200 dark:border-slate-800 lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    字典类型
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    轻量双栏结构保留左侧类型列表，靠近源码后台管理页的密度和比例。
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                    总数 {dictTypes.length}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                    正常 {activeTypeCount}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                    筛选 {filteredTypes.length}
                  </span>
                </div>
              </div>

              <div className="max-h-[calc(100vh-320px)] overflow-y-auto p-3">
                {typeLoading ? (
                  <DictTypeCardState title="正在加载字典类型..." loading />
                ) : typeError ? (
                  <DictTypeCardState title="字典类型加载失败" description={typeError} />
                ) : filteredTypes.length === 0 ? (
                  <DictTypeCardState
                    title="暂无字典类型"
                    description="可以先新增一个字典类型，再继续维护对应的字典数据。"
                  />
                ) : (
                  <div className="space-y-3">
                    {filteredTypes.map((item) => {
                      const isSelected = selectedTypeId === item.dictId;

                      return (
                        <div
                          key={item.dictId}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedTypeId(item.dictId ?? null)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedTypeId(item.dictId ?? null);
                            }
                          }}
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
                                <span
                                  className={cn(
                                    'rounded-full px-2.5 py-1 text-xs font-medium',
                                    getStatusBadgeClassName(item.status || '0'),
                                  )}
                                >
                                  {(item.status || '0') === '0' ? '正常' : '停用'}
                                </span>
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                  {item.createTime || '未记录时间'}
                                </span>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                              <RowActionButton
                                label="编辑类型"
                                icon={<Edit size={15} />}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTypeModal(item);
                                }}
                              />
                              <RowActionButton
                                label="删除类型"
                                icon={<Trash2 size={15} />}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteTarget({ type: 'dictType', item });
                                }}
                                tone="danger"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedType ? `${selectedType.dictName} 的字典数据` : '字典数据'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selectedType
                      ? `当前类型标识：${selectedType.dictType}`
                      : '先从左侧选择一个字典类型，再查看或维护对应的字典数据。'}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                    数据 {dictDataList.length} 条
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                    启用 {activeDataCount} 条
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                    默认 {defaultDataCount} 条
                  </span>
                </div>
              </div>

              {!selectedType ? (
                <div className="flex min-h-[540px] items-center justify-center px-6 py-10">
                  <div className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                      <BookOpen size={20} />
                    </div>
                    <div className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                      请先选择一个字典类型
                    </div>
                    <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      选中左侧类型后，这里会展示对应的字典数据与维护动作。
                    </div>
                  </div>
                </div>
              ) : (
                <Table className="min-w-[980px]">
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
                      <TableActionHead className="w-28">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataLoading ? (
                      <DictDataTableStateRow title="正在加载字典数据..." loading />
                    ) : dataError ? (
                      <DictDataTableStateRow title="字典数据加载失败" description={dataError} />
                    ) : dictDataList.length === 0 ? (
                      <DictDataTableStateRow
                        title="暂无字典数据"
                        description="可以先新增一条字典数据，再逐步补齐默认项和显示样式。"
                      />
                    ) : (
                      dictDataList.map((item) => (
                        <TableRow key={item.dictCode}>
                          <TableCell className="py-4 text-sm text-slate-500 dark:text-slate-400">
                            {item.dictSort ?? 0}
                          </TableCell>
                          <TableCell className="py-4">
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-medium',
                                getListClassBadgeClassName(item.listClass || ''),
                              )}
                            >
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
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-medium',
                                getDefaultBadgeClassName(item.isDefault || 'N'),
                              )}
                            >
                              {item.isDefault === 'Y' ? '默认' : '否'}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-medium',
                                getStatusBadgeClassName(item.status || '0'),
                              )}
                            >
                              {(item.status || '0') === '0' ? '正常' : '停用'}
                            </span>
                          </TableCell>
                          <TableCell className="py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                            {item.createTime || '-'}
                          </TableCell>
                          <TableCell
                            className="max-w-[180px] truncate py-4 text-sm text-slate-500 dark:text-slate-400"
                            title={item.remark || '-'}
                          >
                            {item.remark || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <RowActionButton
                                label="编辑数据"
                                icon={<Edit size={15} />}
                                onClick={() => openDataModal(item)}
                              />
                              <RowActionButton
                                label="删除数据"
                                icon={<Trash2 size={15} />}
                                onClick={() => setDeleteTarget({ type: 'dictData', item })}
                                tone="danger"
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        }
      />

      <BaseDialog
        open={typeModalOpen}
        title={isTypeEdit ? '编辑字典类型' : '新增字典类型'}
        description="维护字典名称、类型标识、启停状态和备注信息。"
        onClose={closeTypeModal}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeTypeModal}>
              取消
            </Button>
            <Button type="submit" form="dict-type-form">
              {isTypeEdit ? '保存修改' : '创建类型'}
            </Button>
          </div>
        }
      >
        <form id="dict-type-form" onSubmit={handleSaveType} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>
                字典名称 <span className="text-red-500">*</span>
              </label>
              <Input
                value={typeForm.dictName}
                onChange={(event) =>
                  setTypeForm((current) => ({ ...current, dictName: event.target.value }))
                }
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
                onChange={(event) =>
                  setTypeForm((current) => ({ ...current, dictType: event.target.value }))
                }
                placeholder="如：sys_user_sex"
              />
            </div>

            <div className="md:col-span-2">
              <label className={fieldLabelClassName}>状态</label>
              <Select
                value={typeForm.status}
                onValueChange={(value) =>
                  setTypeForm((current) => ({ ...current, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择状态" />
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
              value={typeForm.remark}
              onChange={(event) =>
                setTypeForm((current) => ({ ...current, remark: event.target.value }))
              }
              placeholder="备注说明"
            />
          </div>
        </form>
      </BaseDialog>

      <BaseDialog
        open={dataModalOpen}
        title={isDataEdit ? '编辑字典数据' : '新增字典数据'}
        description="维护字典标签、键值、默认项和显示样式。"
        onClose={closeDataModal}
        maxWidthClassName="max-w-3xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeDataModal}>
              取消
            </Button>
            <Button type="submit" form="dict-data-form">
              {isDataEdit ? '保存修改' : '创建数据'}
            </Button>
          </div>
        }
      >
        <form id="dict-data-form" onSubmit={handleSaveData} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>
                数据标签 <span className="text-red-500">*</span>
              </label>
              <Input
                value={dataForm.dictLabel}
                onChange={(event) =>
                  setDataForm((current) => ({ ...current, dictLabel: event.target.value }))
                }
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
                onChange={(event) =>
                  setDataForm((current) => ({ ...current, dictValue: event.target.value }))
                }
                placeholder="如：0"
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>排序号</label>
              <Input
                type="number"
                value={dataForm.dictSort}
                onChange={(event) =>
                  setDataForm((current) => ({
                    ...current,
                    dictSort: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>显示样式</label>
              <Select
                value={dataForm.listClass}
                onValueChange={(value) =>
                  setDataForm((current) => ({ ...current, listClass: value }))
                }
              >
                <SelectTrigger>
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
                onValueChange={(value) =>
                  setDataForm((current) => ({ ...current, status: value }))
                }
              >
                <SelectTrigger>
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
                onValueChange={(value) =>
                  setDataForm((current) => ({ ...current, isDefault: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择默认状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N">否</SelectItem>
                  <SelectItem value="Y">是</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>备注</label>
            <Textarea
              rows={4}
              className="resize-none"
              value={dataForm.remark}
              onChange={(event) =>
                setDataForm((current) => ({ ...current, remark: event.target.value }))
              }
              placeholder="备注说明"
            />
          </div>
        </form>
      </BaseDialog>

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
    </>
  );
};

export default DictPage;
