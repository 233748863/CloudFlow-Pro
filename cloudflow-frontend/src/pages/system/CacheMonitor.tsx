import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Folder,
  FolderOpen,
  Key,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  CacheKeyDetail,
  deleteCacheByPrefix,
  deleteCacheKey,
  getCacheInfo,
  getCacheKeys,
  getCacheKeyValue,
} from '../../services/api/system';
import {
  Button,
  Input,
} from '@/components/common';
import { ConfirmDialog } from '@/components/common';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type DeleteTarget =
  | { type: 'key'; value: string }
  | { type: 'prefix'; value: string };

type CacheTab = 'overview' | 'browser';

const surfaceChipClassName =
  'rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300';

const typeColor: Record<string, string> = {
  string:
    'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
  list:
    'border border-[#b8e7f1] bg-[#effbfe] text-[#0b7894] dark:border-[#0d95b5]/40 dark:bg-[#0d95b5]/15 dark:text-[#d8f3fa]',
  set:
    'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/70 dark:bg-fuchsia-950/30 dark:text-fuchsia-200',
  zset:
    'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200',
  hash:
    'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200',
};

const formatTTL = (ttl: number): string => {
  if (ttl === -1) return '永不过期';
  if (ttl === -2) return 'Key 不存在';
  if (ttl < 60) return `${ttl} 秒`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)} 分 ${ttl % 60} 秒`;
  if (ttl < 86400) return `${Math.floor(ttl / 3600)} 小时 ${Math.floor((ttl % 3600) / 60)} 分`;
  return `${Math.floor(ttl / 86400)} 天 ${Math.floor((ttl % 86400) / 3600)} 小时`;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }

  return JSON.stringify(value, null, 2);
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const InlineState: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
  className?: string;
}> = ({ title, description, loading = false, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
    {loading ? <RefreshCw size={20} className="mb-3 animate-spin text-slate-400" /> : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </div>
    ) : null}
  </div>
);

const CachePanel: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, description, action, className, bodyClassName, children }) => (
  <section className={cn('admin-cache-panel', className)}>
    <div className="admin-cache-panel-head">
      <div className="min-w-0">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {action ? <div className="admin-cache-panel-action">{action}</div> : null}
    </div>
    <div className={cn('admin-cache-panel-body', bodyClassName)}>{children}</div>
  </section>
);

export const CacheMonitor = () => {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<Record<string, string>>({});
  const [dbSize, setDbSize] = useState(0);
  const [commandStats, setCommandStats] = useState<{ name: string; value: number }[]>([]);
  const [keyGroups, setKeyGroups] = useState<{ prefix: string; count: number }[]>([]);
  const [activeTab, setActiveTab] = useState<CacheTab>('overview');
  const [cacheKeys, setCacheKeys] = useState<string[]>([]);
  const [keySearchInput, setKeySearchInput] = useState('');
  const [keySearch, setKeySearch] = useState('');
  const [keysLoading, setKeysLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyDetail, setKeyDetail] = useState<CacheKeyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const fetchCacheInfo = async () => {
    setLoading(true);
    try {
      const response: any = await getCacheInfo();
      if (response) {
        setInfo(response.info || {});
        setDbSize(response.dbSize || 0);
        setCommandStats(response.commandStats || []);
        setKeyGroups(response.keyGroups || []);
      }
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '获取缓存信息失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchKeys = useCallback(async (pattern?: string) => {
    setKeysLoading(true);
    try {
      const keys: any = await getCacheKeys(pattern || '*');
      const keyList = Array.isArray(keys) ? keys : [];
      setCacheKeys(keyList.map((item) => String(item)).sort((left, right) => left.localeCompare(right)));
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '获取 Key 列表失败'));
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCacheInfo();
  }, []);

  useEffect(() => {
    if (activeTab === 'browser' && cacheKeys.length === 0) {
      void fetchKeys();
    }
  }, [activeTab, cacheKeys.length, fetchKeys]);

  const handleSearch = () => {
    const keyword = keySearchInput.trim();
    const pattern = keyword ? `*${keyword}*` : '*';
    setKeySearch(keyword);
    void fetchKeys(pattern);
  };

  const handleReset = () => {
    setKeySearchInput('');
    setKeySearch('');
    setSelectedKey(null);
    setKeyDetail(null);
    if (activeTab === 'browser') {
      void fetchKeys('*');
    }
  };

  const handleSelectKey = async (key: string) => {
    setSelectedKey(key);
    setDetailLoading(true);
    try {
      const detail: any = await getCacheKeyValue(key);
      setKeyDetail(detail);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '获取 Key 详情失败'));
      setKeyDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'key') {
        await deleteCacheKey(deleteTarget.value);
        toast.success('删除成功');
        if (selectedKey === deleteTarget.value) {
          setSelectedKey(null);
          setKeyDetail(null);
        }
      } else {
        const count: any = await deleteCacheByPrefix(`${deleteTarget.value}:`);
        toast.success(`已删除 ${count || 0} 个 Key`);
        setSelectedKey(null);
        setKeyDetail(null);
      }

      setDeleteTarget(null);
      const pattern = keySearch.trim() ? `*${keySearch.trim()}*` : '*';
      void fetchKeys(pattern);
      void fetchCacheInfo();
    } catch (error) {
      console.error(error);
      toast.error(deleteTarget.type === 'key' ? '删除失败' : '批量删除失败');
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success('已复制'));
  };

  const redisVersion = info.redis_version || '-';
  const usedMemoryHuman = info.used_memory_human || '-';
  const connectedClients = info.connected_clients || '0';
  const uptimeInDays = info.uptime_in_days || '0';
  const totalCommandsProcessed = info.total_commands_processed || '0';
  const usedMemoryPeak = info.used_memory_peak_human || '-';
  const maxmemory = info.maxmemory_human || info.maxmemory || '-';
  const role = info.role || '-';
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const trendRows = useMemo(() => commandStats.slice(0, 10), [commandStats]);
  const maxCommandValue = Math.max(...trendRows.map((item) => item.value), 1);
  const keyRows = useMemo(
    () =>
      cacheKeys.map((cacheKey) => {
        const parts = cacheKey.split(':');
        return {
          key: cacheKey,
          prefix: parts.length > 1 ? parts.slice(0, -1).join(':') : '-',
          name: parts[parts.length - 1] || cacheKey,
        };
      }),
    [cacheKeys],
  );
  const pageActions = (
    <div className="grid gap-3">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">CACHE MONITOR</p>
          <h2>缓存监控</h2>
          <span>查看 Redis 运行状态、命令统计、Key 分组和缓存值</span>
          <div className="admin-source-context-row">
            <span className="admin-source-context-chip">
              <span className="admin-source-context-icon"><Key size={14} /></span>
              <strong>Key</strong>
              <em>{dbSize}</em>
              <small>{activeTab === 'browser' && keySearch ? '筛选' : 'Redis DB'}</small>
            </span>
            <span className="admin-source-context-chip">
              <span className="admin-source-context-icon"><FolderOpen size={14} /></span>
              <strong>内存</strong>
              <em>{usedMemoryHuman}</em>
              <small>峰值 {usedMemoryPeak}</small>
            </span>
            <span className="admin-source-context-chip">
              <span className="admin-source-context-icon"><Folder size={14} /></span>
              <strong>客户端</strong>
              <em>{connectedClients}</em>
              <small>{role}</small>
            </span>
            <span className="admin-source-context-chip">
              <span className="admin-source-context-icon"><RefreshCw size={14} /></span>
              <strong>命令</strong>
              <em>{Number(totalCommandsProcessed).toLocaleString()}</em>
              <small>{uptimeInDays} 天</small>
            </span>
          </div>
        </div>
        <div className="admin-source-controls">
          <span className={surfaceChipClassName}>{todayLabel}</span>
          <span className={surfaceChipClassName}>{timeLabel}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void fetchCacheInfo();
              if (activeTab === 'browser') {
                const pattern = keySearch.trim() ? `*${keySearch.trim()}*` : '*';
                void fetchKeys(pattern);
              }
            }}
            disabled={loading || keysLoading}
          >
            <RefreshCw size={16} className={cn((loading || keysLoading) && 'animate-spin')} />
            刷新缓存
          </Button>
        </div>
      </header>
    </div>
  );

  const pageFilters = (
    <section className="admin-source-inline-toolbar admin-cache-inline-toolbar">
      <div className="admin-cache-toolbar-grid">
        <div className="admin-source-tabs">
          <button
            type="button"
            className={cn(activeTab === 'overview' && 'active')}
            onClick={() => setActiveTab('overview')}
          >
            概览
          </button>
          <button
            type="button"
            className={cn(activeTab === 'browser' && 'active')}
            onClick={() => setActiveTab('browser')}
          >
            Key 浏览器
          </button>
        </div>

        {activeTab === 'browser' ? (
          <form
            className="admin-cache-search"
            onSubmit={(event) => {
              event.preventDefault();
              handleSearch();
            }}
          >
            <label className="admin-source-search">
              <span className="input-label">Key 搜索</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input
                  type="search"
                  placeholder="输入 Key 关键字"
                  value={keySearchInput}
                  onChange={(event) => setKeySearchInput(event.target.value)}
                />
              </div>
            </label>
            <div className="admin-users-toolbar-actions">
              <span className="admin-users-filter-count">当前 {keyRows.length} 个 Key</span>
              <Button type="submit" size="sm">
                搜索
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleReset}>
                <X size={14} />
                重置
              </Button>
            </div>
          </form>
        ) : (
          <div className="admin-cache-summary-chips">
            <span className={surfaceChipClassName}>Redis {redisVersion}</span>
            <span className={surfaceChipClassName}>
              最大内存 {maxmemory === '0' ? '无限制' : maxmemory}
            </span>
          </div>
        )}
      </div>
    </section>
  );

  const overviewContent = (
    <div className="grid min-h-0 gap-4 overflow-y-auto">
      <div className="grid gap-4 xl:grid-cols-2">
        <CachePanel title="基本信息" description="Redis 实例运行状态" bodyClassName={loading && Object.keys(info).length === 0 ? '' : 'p-4'}>
          {loading && Object.keys(info).length === 0 ? (
            <InlineState title="正在加载缓存信息..." loading />
          ) : (
              <table className="unity-data-table admin-source-table min-w-[480px]">
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {[
                    ['Redis 版本', redisVersion],
                    ['运行天数', `${uptimeInDays} 天`],
                    ['已用内存', usedMemoryHuman],
                    ['峰值内存', usedMemoryPeak],
                    ['最大内存', maxmemory === '0' ? '无限制' : maxmemory],
                    ['角色', role],
                    ['处理命令数', Number(totalCommandsProcessed).toLocaleString()],
                    ['客户端连接数', connectedClients],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td className="w-1/3 py-2.5 text-slate-500 dark:text-slate-400">
                        {label}
                      </td>
                      <td className="py-2.5 font-medium text-slate-800 dark:text-slate-100">
                        {value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          )}
        </CachePanel>

        <CachePanel title="命令统计 Top 10" description="按执行次数排序">
          {loading && trendRows.length === 0 ? (
            <InlineState title="正在加载命令统计..." loading />
          ) : trendRows.length === 0 ? (
            <InlineState title="暂无命令统计数据" />
          ) : (
            <div className="grid gap-3 px-4 py-4">
              {trendRows.map((cmd) => {
                const percent = Math.round((cmd.value / maxCommandValue) * 100);
                return (
                  <div key={cmd.name}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-mono text-slate-700 dark:text-slate-200">
                        {cmd.name}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {cmd.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 rounded-md bg-[var(--cf-surface-muted)] dark:bg-slate-900">
                      <div
                        className="h-2 rounded-md bg-[#0d95b5] transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CachePanel>
      </div>

      <CachePanel title="Key 分组" description="按前缀统计缓存数量和占比" className="admin-cache-groups-panel">
          <table className="unity-data-table admin-source-table min-w-[560px]">
            <thead>
              <tr>
                <th>前缀</th>
                <th>数量</th>
                <th>占比</th>
              </tr>
            </thead>
            <tbody>
              {loading && keyGroups.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <InlineState title="正在加载 Key 分组..." loading className="py-10" />
                  </td>
                </tr>
              ) : keyGroups.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <InlineState title="暂无 Key 数据" className="py-10" />
                  </td>
                </tr>
              ) : (
                keyGroups.map((group) => {
                  const percent = dbSize > 0 ? ((group.count / dbSize) * 100).toFixed(1) : '0';
                  return (
                    <tr key={group.prefix}>
                      <td className="font-mono text-sm text-slate-800 dark:text-slate-100">
                        {group.prefix}*
                      </td>
                      <td>{group.count}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-md bg-[var(--cf-surface-muted)] dark:bg-slate-900">
                            <div
                              className="h-2 rounded-md bg-emerald-500"
                              style={{ width: `${Math.min(parseFloat(percent), 100)}%` }}
                            />
                          </div>
                          <span className="text-slate-500 dark:text-slate-400">
                            {percent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </CachePanel>
    </div>
  );

  const browserContent = (
    <div className="grid min-h-0 gap-4 overflow-y-auto">
      <CachePanel
        title="Key 列表"
        description={keySearch ? `搜索：${keySearch}` : '按完整 Key 平铺展示'}
        bodyClassName="p-0"
      >
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[860px]">
            <thead>
              <tr>
                <th>Key</th>
                <th>前缀</th>
                <th>名称</th>
                <th className="w-36 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {keysLoading ? (
                <tr>
                  <td colSpan={4}>
                    <InlineState title="正在加载 Key 列表..." loading />
                  </td>
                </tr>
              ) : keyRows.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <InlineState
                      title="暂无 Key 数据"
                      description={keySearch ? `没有找到包含“${keySearch}”的结果。` : undefined}
                    />
                  </td>
                </tr>
              ) : (
                keyRows.map((row) => {
                  const selected = row.key === selectedKey;
                  return (
                    <tr
                      key={row.key}
                      className={selected ? 'bg-[#effbfe] dark:bg-[#0d95b5]/15' : undefined}
                    >
                      <td>
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-2 text-left"
                          onClick={() => void handleSelectKey(row.key)}
                        >
                          <Key size={15} className="shrink-0 text-[#0d95b5] dark:text-[#d8f3fa]" />
                          <span className="truncate font-mono text-xs text-slate-800 dark:text-slate-100">
                            {row.key}
                          </span>
                        </button>
                      </td>
                      <td className="font-mono text-xs text-slate-500 dark:text-slate-400">{row.prefix}</td>
                      <td className="font-mono text-xs text-slate-700 dark:text-slate-200">{row.name}</td>
                      <td>
                        <div className="admin-users-row-actions">
                          <button type="button" onClick={() => copyToClipboard(row.key)} title="复制 Key">
                            <Copy size={14} />
                          </button>
                          {row.prefix !== '-' ? (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ type: 'prefix', value: row.prefix })}
                              title={`删除 ${row.prefix}:*`}
                            >
                              <FolderOpen size={14} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="danger"
                            onClick={() => setDeleteTarget({ type: 'key', value: row.key })}
                            title="删除 Key"
                          >
                            <Trash2 size={14} />
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
      </CachePanel>

      <CachePanel
        title={selectedKey ? 'Key 详情' : '详情预览'}
        description={selectedKey || '选择上方 Key 查看缓存值'}
        action={selectedKey && keyDetail ? (
          <div className="admin-users-row-actions">
            <button type="button" onClick={() => copyToClipboard(keyDetail.key)} title="复制 Key">
              <Copy size={14} />
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => setDeleteTarget({ type: 'key', value: keyDetail.key })}
              title="删除 Key"
            >
              <Trash2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedKey(null);
                setKeyDetail(null);
              }}
              title="关闭"
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
      >
        {selectedKey && keyDetail ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 text-xs dark:border-slate-800">
            <span
              className={cn(
                'rounded-md px-2.5 py-1 font-medium',
                typeColor[keyDetail.type] ||
                  'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
              )}
            >
              {keyDetail.type.toUpperCase()}
            </span>
            <span className={surfaceChipClassName}>TTL：{formatTTL(keyDetail.ttl)}</span>
            {keyDetail.size !== undefined ? (
              <span className={surfaceChipClassName}>元素数：{keyDetail.size}</span>
            ) : null}
          </div>
        ) : null}

        {!selectedKey ? (
          <InlineState title="选择上方的 Key 查看详情" className="min-h-[18rem]" />
        ) : detailLoading ? (
          <InlineState title="正在加载 Key 详情..." loading className="min-h-[18rem]" />
        ) : keyDetail ? (
          <div className="admin-source-content-grid p-4">
            <div className="admin-cache-detail-key">
              <div className="flex items-center gap-2">
                <Key size={16} className="shrink-0 text-[#0d95b5] dark:text-[#d8f3fa]" />
                <span
                  className="truncate font-mono text-sm text-slate-800 dark:text-slate-100"
                  title={keyDetail.key}
                >
                  {keyDetail.key}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                值
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(formatValue(keyDetail.value))}
                className="inline-flex items-center gap-1 text-xs text-[#0d95b5] transition hover:text-[#0b7894] dark:text-[#d8f3fa] dark:hover:text-white"
              >
                <Copy size={12} />
                复制值
              </button>
            </div>

            <pre className="admin-cache-value-block">
              {formatValue(keyDetail.value)}
            </pre>
          </div>
        ) : (
          <InlineState title="加载失败，请重试" className="min-h-[18rem]" />
        )}
      </CachePanel>
    </div>
  );

  const pageContent = (
    <InnerTableSurface
      className="admin-cache-content-surface flex min-h-0 flex-1 flex-col overflow-hidden"
      wrapperClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="admin-cache-content-scroll">
        {activeTab === 'overview' ? overviewContent : browserContent}
      </div>
    </InnerTableSurface>
  );

  return (
    <>
      <section className="admin-source-page admin-cache-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageContent}
        />
      </section>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.type === 'prefix' ? '确认批量删除前缀' : '确认删除缓存 Key'}
        message={
          deleteTarget?.type === 'prefix'
            ? `确定删除前缀“${deleteTarget.value}:*”下的所有 Key 吗？此操作不可撤销。`
            : `确定删除 Key“${deleteTarget?.value || ''}”吗？`
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};

export default CacheMonitor;
