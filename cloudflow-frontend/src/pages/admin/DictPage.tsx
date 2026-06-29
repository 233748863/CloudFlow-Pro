import React, { useEffect, useMemo, useState } from 'react';
import { Edit, Eye, Plus, RefreshCw, RotateCcw, Search, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DictApprovalDialog } from '@/components/admin/DictApprovalDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog } from '@/components/common';
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
import { dictDataApi, dictTypeApi, type DictChangeResult, type SysDictData, type SysDictType } from '../../services/api/dict';
import { queryClient, queryKeys } from '@/lib/queryClient';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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
  riskLevel: string;
  remark: string;
}

type DeleteTarget =
  | { type: 'dictType'; item: SysDictType }
  | { type: 'dictData'; item: SysDictData };

const DEFAULT_STATUS_VALUE = '__all__';
const DEFAULT_LIST_CLASS_VALUE = 'default';
const fieldLabelClassName = 'text-xs font-medium text-slate-500 dark:text-slate-400';

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
  listClass: DEFAULT_LIST_CLASS_VALUE,
  isDefault: 'N',
  status: '0',
  riskLevel: 'LOW',
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
      return 'border border-slate-200 bg-[var(--cf-surface-strong)] text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
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
    : 'border border-slate-200 bg-[var(--cf-surface-strong)] text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

const getRiskLevelBadgeClassName = (riskLevel: string) => {
  switch (riskLevel) {
    case 'HIGH':
      return 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';
    case 'MID':
    case 'MEDIUM':
      return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200';
    default:
      return 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200';
  }
};

const getRiskLevelLabel = (riskLevel: string) => {
  switch (riskLevel) {
    case 'HIGH':
      return '高风险';
    case 'MID':
    case 'MEDIUM':
      return '中风险';
    default:
      return '低风险';
  }
};

const getDictChangeSuccessMessage = (result: DictChangeResult | undefined, fallback: string) =>
  result?.message || fallback;

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
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </td>
  </tr>
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
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [latestPendingResult, setLatestPendingResult] = useState<DictChangeResult | null>(null);

  const selectedType = useMemo(
    () => dictTypes.find((item) => item.dictId === selectedTypeId) ?? null,
    [dictTypes, selectedTypeId],
  );

  const filteredTypes = useMemo(
    () =>
      dictTypes.filter((item) => {
        const keyword = query.keyword.trim();
        const matchesKeyword =
          !keyword || item.dictName.includes(keyword) || item.dictType.includes(keyword);
        const matchesStatus = !query.status || (item.status || '0') === query.status;
        return matchesKeyword && matchesStatus;
      }),
    [dictTypes, query.keyword, query.status],
  );

  const hasActiveFilters = Boolean(query.keyword || query.status);
  const isTypeEdit = Boolean(editingType);
  const isDataEdit = Boolean(editingData);

  useEffect(() => {
    void loadDictTypes();
  }, []);

  useEffect(() => {
    if (!selectedType?.dictType) {
      setDictDataList([]);
      setDataError(null);
      setLatestPendingResult(null);
      return;
    }

    void loadDictData(selectedType.dictType);
  }, [selectedType?.dictType]);

  useEffect(() => {
    if (filteredTypes.length === 0) {
      if (hasActiveFilters) {
        setSelectedTypeId(null);
      }
      return;
    }

    if (!selectedTypeId || !filteredTypes.some((item) => item.dictId === selectedTypeId)) {
      setSelectedTypeId(filteredTypes[0]?.dictId ?? null);
    }
  }, [filteredTypes, hasActiveFilters, selectedTypeId]);

  const loadDictTypes = async (preferredDictType?: string) => {
    setTypeLoading(true);
    setTypeError(null);

    try {
      const response = await dictTypeApi.list();
      const nextTypes = Array.isArray(response) ? response : [];
      setDictTypes(nextTypes);

      setSelectedTypeId((current) => {
        const preferred = preferredDictType
          ? nextTypes.find((item) => item.dictType === preferredDictType)?.dictId ?? null
          : null;

        if (preferred !== null) {
          return preferred;
        }

        if (current && nextTypes.some((item) => item.dictId === current)) {
          return current;
        }

        return nextTypes[0]?.dictId ?? null;
      });
    } catch (error) {
      console.error('获取字典类型失败:', error);
      const message = '获取字典类型失败，请稍后重试';
      setTypeError(message);
      setDictTypes([]);
      setSelectedTypeId(null);
      setDictDataList([]);
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
    const currentDictType = selectedType?.dictType;
    await loadDictTypes(currentDictType);
    if (currentDictType) {
      await loadDictData(currentDictType);
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

  const closeTypeModal = () => {
    setTypeModalOpen(false);
    setEditingType(null);
    setTypeForm(createTypeForm());
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
        listClass: item.listClass || DEFAULT_LIST_CLASS_VALUE,
        isDefault: item.isDefault || 'N',
        status: item.status || '0',
        riskLevel: item.riskLevel || 'LOW',
        remark: item.remark || '',
      });
    } else {
      setEditingData(null);
      setDataForm(createDataForm());
    }

    setDataModalOpen(true);
  };

  const closeDataModal = () => {
    setDataModalOpen(false);
    setEditingData(null);
    setDataForm(createDataForm());
  };

  const openApprovalDialog = () => {
    if (!selectedType) {
      toast.error('请先选择字典类型');
      return;
    }
    setApprovalDialogOpen(true);
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

    const payload: SysDictType = {
      ...(editingType || {}),
      dictName: typeForm.dictName.trim(),
      dictType: typeForm.dictType.trim(),
      status: typeForm.status,
      remark: typeForm.remark.trim(),
    };

    try {
      if (editingType) {
        await dictTypeApi.edit(payload);
        toast.success('字典类型已更新');
      } else {
        await dictTypeApi.add(payload);
        toast.success('字典类型已创建');
      }

      closeTypeModal();
      await loadDictTypes(payload.dictType);
    } catch (error) {
      console.error('保存字典类型失败:', error);
      toast.error(getErrorMessage(error, '保存字典类型失败'));
    }
  };

  const handleSaveData = async (event: React.FormEvent) => {
    event.preventDefault();

    const currentType = editingData?.dictType || selectedType?.dictType;

    if (!currentType) {
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

    const payload: SysDictData = {
      ...(editingData || {}),
      dictType: currentType,
      dictLabel: dataForm.dictLabel.trim(),
      dictValue: dataForm.dictValue.trim(),
      dictSort: Number(dataForm.dictSort || 0),
      listClass: dataForm.listClass,
      isDefault: dataForm.isDefault,
      status: dataForm.status,
      riskLevel: dataForm.riskLevel,
      remark: dataForm.remark.trim(),
    };

    try {
      const result = editingData
        ? await dictDataApi.edit(payload)
        : await dictDataApi.add(payload);
      toast.success(getDictChangeSuccessMessage(
        result,
        editingData ? '字典数据已更新' : '字典数据已创建',
      ));
      closeDataModal();
      if (!result?.approvalRequired) {
        setLatestPendingResult(null);
        void queryClient.invalidateQueries({ queryKey: queryKeys.dict(currentType) });
        await loadDictData(currentType);
      } else {
        setLatestPendingResult(result);
        setApprovalDialogOpen(true);
      }
    } catch (error) {
      console.error('保存字典数据失败:', error);
      toast.error(getErrorMessage(error, '保存字典数据失败'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      if (deleteTarget.type === 'dictType' && deleteTarget.item.dictId) {
        await dictTypeApi.remove([deleteTarget.item.dictId]);
        toast.success('字典类型已删除');
        // 同时失效该 dictType 的业务缓存
        if (deleteTarget.item.dictType) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.dict(deleteTarget.item.dictType) });
        }
        await loadDictTypes();
      }

      if (deleteTarget.type === 'dictData' && deleteTarget.item.dictCode) {
        const result = await dictDataApi.remove([deleteTarget.item.dictCode]);
        toast.success(getDictChangeSuccessMessage(result, '字典数据已删除'));
        if (!result?.approvalRequired) {
          setLatestPendingResult(null);
          void queryClient.invalidateQueries({ queryKey: queryKeys.dict(deleteTarget.item.dictType) });
          await loadDictData(deleteTarget.item.dictType);
        } else {
          setLatestPendingResult(result);
          setApprovalDialogOpen(true);
        }
      }
    } catch (error) {
      console.error('删除字典内容失败:', error);
      toast.error(deleteTarget.type === 'dictType' ? '删除字典类型失败' : '删除字典数据失败');
    } finally {
      setDeleteTarget(null);
    }
  };

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">system dictionary</p>
          <h2>字典管理</h2>
          <span>集中维护系统枚举、显示标签、风险等级与默认项。</span>
        </div>
        <div className="admin-source-controls">
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
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><Tag size={18} /></span>
          <div>
            <p>字典类型</p>
            <strong>{dictTypes.length}</strong>
            <span>全部类型数量</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><Eye size={18} /></span>
          <div>
            <p>当前筛选</p>
            <strong>{filteredTypes.length}</strong>
            <span>匹配类型数量</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><Tag size={18} /></span>
          <div>
            <p>字典数据</p>
            <strong>{dictDataList.length}</strong>
            <span>{selectedType ? selectedType.dictName : '未选择类型'}</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><RefreshCw size={18} /></span>
          <div>
            <p>运行状态</p>
            <strong>{typeLoading || dataLoading ? '同步中' : '就绪'}</strong>
            <span>字典缓存与审批联动</span>
          </div>
        </article>
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form onSubmit={handleSearch} className="grid items-end gap-3 xl:grid-cols-[minmax(18rem,1fr)_180px_260px_auto]">
        <label className="min-w-0">
          <span className="input-label">关键词</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.keyword}
              onChange={(event) =>
                setFilters((current) => ({ ...current, keyword: event.target.value }))
              }
              placeholder="搜索字典名称或类型"
              className="h-[42px] pl-9"
            />
          </div>
        </label>

        <label className="min-w-0">
          <span className="input-label">状态</span>
          <Select
            value={filters.status || DEFAULT_STATUS_VALUE}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: value === DEFAULT_STATUS_VALUE ? '' : value,
              }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_STATUS_VALUE}>全部状态</SelectItem>
              <SelectItem value="0">正常</SelectItem>
              <SelectItem value="1">停用</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="min-w-0">
          <span className="input-label">字典类型</span>
          <Select
            value={selectedTypeId === null ? '' : String(selectedTypeId)}
            disabled={typeLoading || filteredTypes.length === 0}
            onValueChange={(value) => setSelectedTypeId(value ? Number(value) : null)}
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="选择字典类型" />
            </SelectTrigger>
            <SelectContent>
              {filteredTypes.map((item) => (
                <SelectItem key={item.dictId} value={String(item.dictId)} label={item.dictName}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="truncate">{item.dictName}</span>
                    <span className="truncate font-mono text-xs text-slate-400">{item.dictType}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">
            {selectedType ? selectedType.dictName : hasActiveFilters ? '筛选无类型' : '未选择类型'}
          </span>
          {selectedType ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => openTypeModal(selectedType)}>
                <Edit size={14} />
                编辑类型
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget({ type: 'dictType', item: selectedType })}>
                <Trash2 size={14} />
                删除类型
              </Button>
            </>
          ) : null}
          <Button type="submit" size="sm">
            查询
          </Button>
          {hasActiveFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw size={14} />
              重置
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={openApprovalDialog} disabled={!selectedType}>
            <Eye size={15} />
            审批记录
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface
      className="flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {selectedType ? selectedType.dictName : '字典数据'}
          </div>
          {selectedType ? (
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate font-mono">{selectedType.dictType}</span>
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 font-medium',
                  getStatusBadgeClassName(selectedType.status || '0'),
                )}
              >
                {(selectedType.status || '0') === '0' ? '正常' : '停用'}
              </span>
              <span>{dictDataList.length} 条数据 · 表格视图</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="admin-horizontal-scroll min-h-0 flex-1 overflow-auto">
        <table className="unity-data-table admin-source-table min-w-[860px]">
          <thead>
            <tr>
              <th className="w-20">排序</th>
              <th>标签</th>
              <th>键值</th>
              <th>样式</th>
              <th>默认</th>
              <th>风险</th>
              <th>状态</th>
              <th>备注</th>
              <th className="w-28 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {typeLoading ? (
              <TableStateRow colSpan={9} title="正在加载字典类型..." loading />
            ) : typeError ? (
              <TableStateRow colSpan={9} title="字典类型加载失败" />
            ) : !selectedType ? (
              <TableStateRow colSpan={9} title={hasActiveFilters ? '当前筛选无可用类型' : '请选择字典类型'} />
            ) : dataLoading ? (
              <TableStateRow colSpan={9} title="正在加载字典数据..." loading />
            ) : dataError ? (
              <TableStateRow colSpan={9} title="字典数据加载失败" />
            ) : dictDataList.length === 0 ? (
              <TableStateRow colSpan={9} title="暂无字典数据" />
            ) : (
              dictDataList.map((item) => (
                <tr key={item.dictCode}>
                  <td className="text-sm text-slate-500 dark:text-slate-400">
                    {item.dictSort ?? 0}
                  </td>
                  <td>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {item.dictLabel}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {item.createTime || '-'}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
                      {item.dictValue}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        getListClassBadgeClassName(item.listClass || ''),
                      )}
                    >
                      {getListClassLabel(item.listClass || '')}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        getDefaultBadgeClassName(item.isDefault || 'N'),
                      )}
                    >
                      {item.isDefault === 'Y' ? '是' : '否'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        getRiskLevelBadgeClassName(item.riskLevel || 'LOW'),
                      )}
                    >
                      {getRiskLevelLabel(item.riskLevel || 'LOW')}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        getStatusBadgeClassName(item.status || '0'),
                      )}
                    >
                      {(item.status || '0') === '0' ? '正常' : '停用'}
                    </span>
                  </td>
                  <td
                    className="max-w-[220px] truncate text-sm text-slate-500 dark:text-slate-400"
                    title={item.remark || '-'}
                  >
                    {item.remark || '-'}
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button
                        type="button"
                        title="编辑数据"
                        aria-label="编辑数据"
                        onClick={() => openDataModal(item)}
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        title="删除数据"
                        aria-label="删除数据"
                        onClick={() => setDeleteTarget({ type: 'dictData', item })}
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

  return (
    <section className="admin-source-page admin-dict-page">
      <TablePageLayout
        className="admin-dict-layout"
        actions={pageActions}
        filters={pageFilters}
        table={pageTable}
      />

      <BaseDialog
        open={typeModalOpen}
        title={isTypeEdit ? '编辑字典类型' : '新增字典类型'}
        onClose={closeTypeModal}
        maxWidthClassName="max-w-2xl"
        footer={(
          <>
            <Button variant="outline" onClick={closeTypeModal}>
              取消
            </Button>
            <Button type="submit" form="dict-type-form">
              {isTypeEdit ? '保存修改' : '创建类型'}
            </Button>
          </>
        )}
      >
        <form id="dict-type-form" onSubmit={handleSaveType} className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>
                字典名称 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={typeForm.dictName}
                onChange={(event) =>
                  setTypeForm((current) => ({ ...current, dictName: event.target.value }))
                }
              />
            </div>

            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>
                类型标识 <span className="text-rose-500">*</span>
              </label>
              <Input
                className="font-mono"
                value={typeForm.dictType}
                onChange={(event) =>
                  setTypeForm((current) => ({ ...current, dictType: event.target.value }))
                }
              />
            </div>

            <div className="admin-dialog-field md:col-span-2">
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

          <div className="admin-dialog-field">
            <label className={fieldLabelClassName}>备注</label>
            <Textarea
              rows={4}
              className="resize-none"
              value={typeForm.remark}
              onChange={(event) =>
                setTypeForm((current) => ({ ...current, remark: event.target.value }))
              }
            />
          </div>
        </form>
      </BaseDialog>

      <BaseDialog
        open={dataModalOpen}
        title={isDataEdit ? '编辑字典数据' : '新增字典数据'}
        onClose={closeDataModal}
        maxWidthClassName="max-w-2xl"
        footer={(
          <>
            <Button variant="outline" onClick={closeDataModal}>
              取消
            </Button>
            <Button type="submit" form="dict-data-form">
              {isDataEdit ? '保存修改' : '创建数据'}
            </Button>
          </>
        )}
      >
        <form id="dict-data-form" onSubmit={handleSaveData} className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>
                数据标签 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={dataForm.dictLabel}
                onChange={(event) =>
                  setDataForm((current) => ({ ...current, dictLabel: event.target.value }))
                }
              />
            </div>

            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>
                数据键值 <span className="text-rose-500">*</span>
              </label>
              <Input
                className="font-mono"
                value={dataForm.dictValue}
                onChange={(event) =>
                  setDataForm((current) => ({ ...current, dictValue: event.target.value }))
                }
              />
            </div>

            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>排序</label>
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

            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>样式</label>
              <Select
                value={dataForm.listClass || DEFAULT_LIST_CLASS_VALUE}
                onValueChange={(value) =>
                  setDataForm((current) => ({
                    ...current,
                    listClass: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="默认" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_LIST_CLASS_VALUE}>默认</SelectItem>
                  <SelectItem value="primary">主要</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="warning">警告</SelectItem>
                  <SelectItem value="danger">危险</SelectItem>
                  <SelectItem value="info">信息</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
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

            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>风险等级</label>
              <Select
                value={dataForm.riskLevel}
                onValueChange={(value) =>
                  setDataForm((current) => ({ ...current, riskLevel: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择风险等级" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">低风险</SelectItem>
                  <SelectItem value="MID">中风险</SelectItem>
                  <SelectItem value="HIGH">高风险</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
              <label className={fieldLabelClassName}>默认</label>
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

          <div className="admin-dialog-field">
            <label className={fieldLabelClassName}>备注</label>
            <Textarea
              rows={4}
              className="resize-none"
              value={dataForm.remark}
              onChange={(event) =>
                setDataForm((current) => ({ ...current, remark: event.target.value }))
              }
            />
          </div>
        </form>
      </BaseDialog>

      <DictApprovalDialog
        open={approvalDialogOpen}
        dictType={selectedType?.dictType}
        dictName={selectedType?.dictName}
        pendingResult={latestPendingResult}
        initialApprovalId={latestPendingResult?.approvalId ?? null}
        onClose={() => {
          setApprovalDialogOpen(false);
          setLatestPendingResult(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.type === 'dictType' ? '确认删除字典类型' : '确认删除字典数据'}
        message={
          deleteTarget?.type === 'dictType'
            ? `确认删除字典类型“${deleteTarget.item.dictName}”？关联字典数据会一并删除。`
            : `确认删除字典数据“${deleteTarget?.item.dictLabel || ''}”？`
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
};

export default DictPage;

