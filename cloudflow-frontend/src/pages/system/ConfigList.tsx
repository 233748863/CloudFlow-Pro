import React, { useEffect, useMemo, useState } from 'react';
import { Edit, Plus, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  addConfig,
  deleteConfig,
  getConfigList,
  updateConfig,
  type SysConfig,
} from '../../services/api/system';
import { clearConfigCache, getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
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
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type ConfigFilters = {
  configName: string;
  configKey: string;
  configType: string;
  module: string;
};

type ConfigQuery = {
  pageNum: number;
  pageSize: number;
  configName: string;
  configKey: string;
  configType: string;
  module: string;
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
const DEFAULT_MODULE_VALUE = '__all__';
const fieldLabelClassName = 'input-label';

/** 按 config_key 前缀分组的模块预设，下拉切换时把 prefix 拼到 configKey 查询里 */
const MODULE_OPTIONS: { value: string; label: string; prefix: string }[] = [
  { value: 'user', label: '用户管理', prefix: 'sys.user.' },
  { value: 'captcha', label: '验证码', prefix: 'sys.captcha.' },
  { value: 'security', label: '安全认证', prefix: 'sys.security.' },
  { value: 'workflow', label: '工作流', prefix: 'sys.workflow.' },
  { value: 'oa', label: 'OA 办公', prefix: 'sys.oa.' },
  { value: 'hr', label: 'HR 人事', prefix: 'sys.hr.' },
  { value: 'crm', label: 'CRM 客户', prefix: 'sys.crm.' },
  { value: 'attendance', label: '考勤', prefix: 'sys.attendance.' },
  { value: 'announcement', label: '公告', prefix: 'sys.announcement.' },
  { value: 'vehicle', label: '车辆', prefix: 'sys.vehicle.' },
  { value: 'meetingRoom', label: '会议室', prefix: 'sys.meetingRoom.' },
  { value: 'asset', label: '资产', prefix: 'sys.asset.' },
  { value: 'page', label: '分页', prefix: 'sys.page.' },
  { value: 'tenant', label: '租户', prefix: 'sys.tenant.' },
  { value: 'upload', label: '文件上传', prefix: 'sys.upload.' },
  { value: 'oss', label: 'OSS 存储', prefix: 'sys.oss.' },
  { value: 'log', label: '日志', prefix: 'sys.log.' },
  { value: 'datascope', label: '数据权限', prefix: 'sys.datascope.' },
  { value: 'gateway', label: '网关', prefix: 'sys.gateway.' },
  { value: 'sse', label: 'SSE 推送', prefix: 'sys.sse.' },
  { value: 'encrypt', label: '加密', prefix: 'sys.encrypt.' },
  { value: 'sensitive', label: '脱敏', prefix: 'sys.sensitive.' },
  { value: 'auth', label: '认证', prefix: 'sys.auth.' },
  { value: 'common', label: '通用', prefix: 'sys.common.' },
  { value: 'account', label: '账户', prefix: 'sys.account.' },
];

/** 改后需重启才生效的 key 列表（@Cacheable 注解级 TTL 受 Spring Cache 注解限制） */
const RESTART_REQUIRED_KEYS = new Set<string>([
  'sys.workflow.cache.definition.ttl',
  'sys.workflow.cache.form.ttl',
  'sys.workflow.cache.user.ttl',
]);

const getConfigTypeBadgeClassName = (configType: string) =>
  configType === 'Y'
    ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200'
    : 'border border-slate-200 bg-[var(--cf-surface-strong)] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

const getConfigScopeBadgeClassName = (configScope: string) =>
  configScope === '0'
    ? 'border border-[#b8e7f1] bg-[#effbfe] text-[#0b7894] dark:border-[#0d95b5]/40 dark:bg-[#0d95b5]/15 dark:text-[#d8f3fa]'
    : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200';

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr className="hover:bg-transparent dark:hover:bg-transparent">
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

export const ConfigList = () => {
  const [configs, setConfigs] = useState<SysConfig[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ConfigFilters>({
    configName: '',
    configKey: '',
    configType: '',
    module: '',
  });
  const [query, setQuery] = useState<ConfigQuery>({
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    configName: '',
    configKey: '',
    configType: '',
    module: '',
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
      // 模块下拉非空时，把模块 prefix 作为 configKey 的模糊匹配条件传给后端；
      // 用户在 configKey 输入框输入的内容优先（更精确）
      const modulePrefix = nextQuery.module
        ? MODULE_OPTIONS.find((opt) => opt.value === nextQuery.module)?.prefix
        : undefined;
      const effectiveConfigKey = nextQuery.configKey || modulePrefix;
      const response = await getConfigList({
        pageNum: nextQuery.pageNum,
        pageSize: nextQuery.pageSize,
        configName: nextQuery.configName || undefined,
        configKey: effectiveConfigKey || undefined,
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

  const hasActiveFilters = Boolean(query.configName || query.configKey || query.configType || query.module);
  const isEdit = Boolean(editingConfig);
  const stats = useMemo(
    () => [
      {
        label: '参数总数',
        value: String(total),
        meta: `当前页 ${configs.length}`,
        icon: <Search size={18} />,
        tone: 'blue',
      },
      {
        label: '内置参数',
        value: String(configs.filter((config) => config.configType === 'Y').length),
        meta: '受系统控制',
        icon: <RotateCcw size={18} />,
        tone: 'amber',
      },
      {
        label: '自定义参数',
        value: String(configs.filter((config) => config.configType !== 'Y').length),
        meta: '可维护配置',
        icon: <Plus size={18} />,
        tone: 'green',
      },
      {
        label: '模块预设',
        value: String(MODULE_OPTIONS.length),
        meta: '按前缀筛选',
        icon: <RefreshCw size={18} />,
        tone: 'violet',
      },
    ],
    [configs, total],
  );

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      configName: filters.configName.trim(),
      configKey: filters.configKey.trim(),
      configType: filters.configType,
      module: filters.module,
    }));
  };

  const handleReset = () => {
    const nextFilters = {
      configName: '',
      configKey: '',
      configType: '',
      module: '',
    };

    setFilters(nextFilters);
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      configName: '',
      configKey: '',
      configType: '',
      module: '',
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
      toast.error(getErrorMessage(deleteError, '参数删除失败'));
    }
  };

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">SYSTEM CONFIG</p>
          <h2>参数配置</h2>
          <span>维护系统参数、模块前缀、作用域和缓存刷新状态</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={() => handleOpenModal()}>
            <Plus size={16} />
            新增参数
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={cn('card admin-source-stat', `admin-source-tone-${stat.tone}`)}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form onSubmit={handleSearch} className="admin-users-filter-grid admin-config-filter-grid">
        <label className="admin-source-search">
          <span className={fieldLabelClassName}>搜索参数</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.configName}
              onChange={(event) =>
                setFilters((current) => ({ ...current, configName: event.target.value }))
              }
              placeholder="参数名称"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className={fieldLabelClassName}>参数键名</span>
          <Input
            value={filters.configKey}
            onChange={(event) =>
              setFilters((current) => ({ ...current, configKey: event.target.value }))
            }
            placeholder="sys.xxx"
            className="h-[42px] font-mono"
          />
        </label>

        <label>
          <span className={fieldLabelClassName}>类型</span>
          <Select
            value={filters.configType || DEFAULT_TYPE_VALUE}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                configType: value === DEFAULT_TYPE_VALUE ? '' : value,
              }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_TYPE_VALUE}>全部类型</SelectItem>
              <SelectItem value="Y">内置</SelectItem>
              <SelectItem value="N">自定义</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label>
          <span className={fieldLabelClassName}>模块</span>
          <Select
            value={filters.module || DEFAULT_MODULE_VALUE}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                module: value === DEFAULT_MODULE_VALUE ? '' : value,
              }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部模块" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_MODULE_VALUE}>全部模块</SelectItem>
              {MODULE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">当前 {total} 项</span>
          <Button type="submit" size="sm">
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!hasActiveFilters}
          >
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-config-table-panel">
      <table className="unity-data-table admin-source-table admin-config-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>参数</th>
              <th>参数键名</th>
              <th>参数键值</th>
              <th>类型</th>
              <th>作用域</th>
              <th>创建时间</th>
              <th className="text-right admin-config-actions-col">操作</th>
            </tr>
          </thead>
          <tbody>
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
                <tr key={config.configId}>
                  <td className="text-sm text-slate-500 dark:text-slate-400">
                    {config.configId}
                  </td>
                  <td>
                    <div className="admin-config-name">
                      <span>
                        <RefreshCw size={16} />
                      </span>
                      <div>
                        <strong>{config.configName}</strong>
                      {config.remark ? (
                        <small title={config.remark}>
                          {config.remark}
                        </small>
                      ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="admin-config-key">
                      <code className="admin-source-code">
                        {config.configKey}
                      </code>
                      {RESTART_REQUIRED_KEYS.has(config.configKey) ? (
                        <span
                          className="inline-flex w-fit items-center rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          title="该参数由 Spring Cache 注解控制，修改后需重启服务才能生效"
                        >
                          重启生效
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <span className="admin-config-value" title={config.configValue}>
                      {config.configValue}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        getConfigTypeBadgeClassName(config.configType),
                      )}
                    >
                      {config.configType === 'Y' ? '内置' : '自定义'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        getConfigScopeBadgeClassName(config.configScope),
                      )}
                    >
                      {config.configScope === '0' ? '全局' : '租户'}
                    </span>
                  </td>
                  <td className="text-sm text-slate-500 dark:text-slate-400">
                    {config.createTime || '-'}
                  </td>
                  <td className="admin-config-actions-col">
                    <div className="admin-users-row-actions">
                      <button type="button" title="编辑参数" onClick={() => handleOpenModal(config)}>
                        <Edit size={15} />
                      </button>
                      {config.configType !== 'Y' ? (
                        <button
                          type="button"
                          className="danger"
                          title="删除参数"
                          onClick={() => setPendingDeleteConfig(config)}
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
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
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-config-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

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
        <form id="config-form" onSubmit={handleSubmit} className="admin-source-form-grid">
            <label>
              <span className={fieldLabelClassName}>
                参数名称 <span className="text-rose-500">*</span>
              </span>
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
            </label>

            <label>
              <span className={fieldLabelClassName}>
                参数键名 <span className="text-rose-500">*</span>
              </span>
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
            </label>

            <label>
              <span className={fieldLabelClassName}>参数类型</span>
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
            </label>

            <label>
              <span className={fieldLabelClassName}>作用域</span>
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
            </label>

          <div className="admin-source-form-wide">
            <span className={fieldLabelClassName}>
              参数键值 <span className="text-rose-500">*</span>
            </span>
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

          <div className="admin-source-form-wide">
            <span className={fieldLabelClassName}>备注</span>
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
