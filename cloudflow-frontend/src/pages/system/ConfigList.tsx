import React, { useEffect, useMemo, useState } from 'react';
import { Edit, Plus, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  addConfig,
  deleteConfig,
  getConfigList,
  updateConfig,
  type SysConfig,
} from '../../services/api/system';
import { clearConfigCache } from '../../hooks/useSystemConfig';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
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
import { cn } from '@/utils/cn';

type ConfigFilters = {
  configName: string;
  configKey: string;
  configType: string;
};

type ConfigQuery = {
  pageNum: number;
  pageSize: number;
  configName: string;
  configKey: string;
  configType: string;
};

const DEFAULT_FORM_DATA: SysConfig = {
  configName: '',
  configKey: '',
  configValue: '',
  configType: 'N',
  configScope: '1',
  remark: '',
};

const DEFAULT_TYPE_VALUE = '__all__';
const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

const getConfigTypeBadgeClassName = (configType: string) =>
  configType === 'Y'
    ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200'
    : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

const getConfigScopeBadgeClassName = (configScope: string) =>
  configScope === '0'
    ? 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200'
    : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200';

const RowActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
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
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

export const ConfigList = () => {
  const [configs, setConfigs] = useState<SysConfig[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ConfigFilters>({
    configName: '',
    configKey: '',
    configType: '',
  });
  const [query, setQuery] = useState<ConfigQuery>({
    pageNum: 1,
    pageSize: 10,
    configName: '',
    configKey: '',
    configType: '',
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SysConfig | null>(null);
  const [pendingDeleteConfig, setPendingDeleteConfig] = useState<SysConfig | null>(null);
  const [formData, setFormData] = useState<SysConfig>(DEFAULT_FORM_DATA);

  const normalizeConfigListResponse = (response: any) => {
    if (Array.isArray(response)) {
      return { rows: response as SysConfig[], total: response.length };
    }

    const rows = Array.isArray(response?.rows)
      ? response.rows
      : Array.isArray(response?.records)
        ? response.records
        : [];

    return {
      rows,
      total: typeof response?.total === 'number' ? response.total : rows.length,
    };
  };

  const fetchConfigs = async (nextQuery: ConfigQuery = query) => {
    setLoading(true);
    setError(null);

    try {
      const response = await getConfigList({
        pageNum: nextQuery.pageNum,
        pageSize: nextQuery.pageSize,
        configName: nextQuery.configName || undefined,
        configKey: nextQuery.configKey || undefined,
        configType: nextQuery.configType || undefined,
      });

      const normalized = normalizeConfigListResponse(response);
      setConfigs(normalized.rows);
      setTotal(normalized.total);
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载参数配置失败，请稍后重试。';
      setError(message);
      setConfigs([]);
      setTotal(0);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfigs();
  }, [query]);

  const builtInCount = useMemo(
    () => configs.filter((item) => item.configType === 'Y').length,
    [configs],
  );
  const customCount = configs.length - builtInCount;
  const tenantScopedCount = useMemo(
    () => configs.filter((item) => item.configScope === '1').length,
    [configs],
  );
  const globalCount = configs.length - tenantScopedCount;
  const hasActiveFilters = Boolean(query.configName || query.configKey || query.configType);
  const isEdit = Boolean(editingConfig);

  const filterSummary = useMemo(() => {
    const nameLabel = query.configName || '全部参数';
    const keyLabel = query.configKey || '全部键名';
    const typeLabel = !query.configType ? '全部类型' : query.configType === 'Y' ? '内置' : '自定义';
    return `${nameLabel} / ${keyLabel} / ${typeLabel}`;
  }, [query.configKey, query.configName, query.configType]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      configName: filters.configName.trim(),
      configKey: filters.configKey.trim(),
      configType: filters.configType,
    }));
  };

  const handleReset = () => {
    const nextFilters = {
      configName: '',
      configKey: '',
      configType: '',
    };

    setFilters(nextFilters);
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      configName: '',
      configKey: '',
      configType: '',
    }));
  };

  const handleRefresh = () => {
    void fetchConfigs();
  };

  const handleOpenModal = (config?: SysConfig) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        configId: config.configId,
        configName: config.configName,
        configKey: config.configKey,
        configValue: config.configValue,
        configType: config.configType,
        configScope: config.configScope,
        remark: config.remark || '',
      });
    } else {
      setEditingConfig(null);
      setFormData(DEFAULT_FORM_DATA);
    }

    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingConfig(null);
    setFormData(DEFAULT_FORM_DATA);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.configName.trim()) {
      toast.error('请输入参数名称');
      return;
    }

    if (!formData.configKey.trim()) {
      toast.error('请输入参数键名');
      return;
    }

    if (!formData.configValue.trim()) {
      toast.error('请输入参数键值');
      return;
    }

    try {
      const payload: SysConfig = {
        ...formData,
        configName: formData.configName.trim(),
        configKey: formData.configKey.trim(),
        configValue: formData.configValue.trim(),
        remark: formData.remark?.trim() || '',
      };

      if (editingConfig?.configId) {
        await updateConfig({ ...payload, configId: editingConfig.configId });
        toast.success('参数更新成功');
      } else {
        await addConfig(payload);
        toast.success('参数创建成功');
      }

      clearConfigCache();
      handleCloseModal();
      await fetchConfigs();
    } catch (submitError) {
      console.error(submitError);
      toast.error(isEdit ? '参数更新失败' : '参数创建失败');
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteConfig?.configId) {
      return;
    }

    try {
      await deleteConfig([pendingDeleteConfig.configId]);
      clearConfigCache();
      toast.success('参数删除成功');

      const nextPage =
        configs.length === 1 && query.pageNum > 1 ? query.pageNum - 1 : query.pageNum;

      setPendingDeleteConfig(null);
      setQuery((current) => ({
        ...current,
        pageNum: nextPage,
      }));

      if (nextPage === query.pageNum) {
        await fetchConfigs();
      }
    } catch (deleteError) {
      console.error(deleteError);
      toast.error('参数删除失败');
    }
  };

  return (
    <>
      <TablePageLayout
        className="gap-3"
        actions={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-slate-900 dark:text-slate-100">共 {total} 条</span>
              <span className="text-slate-500 dark:text-slate-400">当前页 {configs.length} 条</span>
              <span className="text-slate-500 dark:text-slate-400">内置 {builtInCount}</span>
              <span className="text-slate-500 dark:text-slate-400">自定义 {customCount}</span>
              <span className="text-slate-500 dark:text-slate-400">全局 {globalCount}</span>
              <span className="text-slate-500 dark:text-slate-400">租户 {tenantScopedCount}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
              <Button size="sm" onClick={() => handleOpenModal()}>
                <Plus size={15} />
                新增参数
              </Button>
            </div>
          </div>
        )}
        filters={(
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-52">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.configName}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, configName: event.target.value }))
                  }
                  placeholder="搜索参数名称"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-52">
                <Input
                  value={filters.configKey}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, configKey: event.target.value }))
                  }
                  placeholder="参数键名"
                  className="h-10 font-mono"
                />
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.configType || DEFAULT_TYPE_VALUE}
                  onValueChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      configType: value === DEFAULT_TYPE_VALUE ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_TYPE_VALUE}>全部类型</SelectItem>
                    <SelectItem value="Y">内置</SelectItem>
                    <SelectItem value="N">自定义</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} />
                  重置
                </Button>
              ) : null}
            </form>

            <div className="text-xs text-slate-500 dark:text-slate-400">{filterSummary}</div>
          </div>
        )}
        table={(
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  参数配置列表
                </div>
                {hasActiveFilters ? (
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {filterSummary}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>参数名称</TableHead>
                    <TableHead>参数键名</TableHead>
                    <TableHead>参数键值</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>作用域</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableActionHead className="w-32">操作</TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableStateRow colSpan={8} title="正在加载参数配置..." loading />
                  ) : error ? (
                    <TableStateRow
                      colSpan={8}
                      title="参数配置加载失败"
                      description={error}
                    />
                  ) : configs.length === 0 ? (
                    <TableStateRow colSpan={8} title="暂无参数配置" />
                  ) : (
                    configs.map((config) => (
                      <TableRow key={config.configId}>
                        <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                          {config.configId}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {config.configName}
                            </div>
                            {config.remark ? (
                              <div
                                className="mt-1 max-w-[260px] truncate text-xs text-slate-500 dark:text-slate-400"
                                title={config.remark}
                              >
                                {config.remark}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            {config.configKey}
                          </code>
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <span
                            className="block truncate text-sm text-slate-600 dark:text-slate-300"
                            title={config.configValue}
                          >
                            {config.configValue}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                              getConfigTypeBadgeClassName(config.configType),
                            )}
                          >
                            {config.configType === 'Y' ? '内置' : '自定义'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                              getConfigScopeBadgeClassName(config.configScope),
                            )}
                          >
                            {config.configScope === '0' ? '全局' : '租户'}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                          {config.createTime || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <RowActionButton
                              label="编辑参数"
                              icon={<Edit size={15} />}
                              onClick={() => handleOpenModal(config)}
                            />
                            {config.configType !== 'Y' ? (
                              <RowActionButton
                                label="删除参数"
                                icon={<Trash2 size={15} />}
                                onClick={() => setPendingDeleteConfig(config)}
                                tone="danger"
                              />
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={query.pageNum}
              pageSize={query.pageSize}
              onPageChange={(pageNum) =>
                setQuery((current) => ({ ...current, pageNum }))
              }
              onPageSizeChange={(pageSize) =>
                setQuery((current) => ({
                  ...current,
                  pageNum: 1,
                  pageSize,
                }))
              }
            />
          ) : null
        )}
      />

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑参数' : '新增参数'}
        onClose={handleCloseModal}
        maxWidthClassName="max-w-2xl"
        footer={(
          <>
            <Button variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button onClick={() => void 0} type="submit" form="config-form">
              {isEdit ? '保存修改' : '创建参数'}
            </Button>
          </>
        )}
      >
        <form id="config-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>
                参数名称 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={formData.configName}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    configName: event.target.value,
                  }))
                }
                placeholder="请输入参数名称"
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>
                参数键名 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={formData.configKey}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    configKey: event.target.value,
                  }))
                }
                placeholder="例如：sys.user.initPassword"
                className="font-mono"
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>参数类型</label>
              <Select
                value={formData.configType}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    configType: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择参数类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N">自定义</SelectItem>
                  <SelectItem value="Y">内置</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={fieldLabelClassName}>作用域</label>
              <Select
                value={formData.configScope}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    configScope: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择作用域" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">全局配置</SelectItem>
                  <SelectItem value="1">租户配置</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>
              参数键值 <span className="text-rose-500">*</span>
            </label>
            <Textarea
              rows={4}
              className="resize-none font-mono"
              value={formData.configValue}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  configValue: event.target.value,
                }))
              }
              placeholder="请输入参数键值"
            />
          </div>

          <div>
            <label className={fieldLabelClassName}>备注</label>
            <Textarea
              rows={3}
              className="resize-none"
              value={formData.remark || ''}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  remark: event.target.value,
                }))
              }
              placeholder="补充参数用途或维护说明"
            />
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDeleteConfig)}
        title="删除参数"
        message={
          pendingDeleteConfig
            ? `确定删除参数“${pendingDeleteConfig.configName}”吗？删除后将无法恢复。`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setPendingDeleteConfig(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export default ConfigList;
