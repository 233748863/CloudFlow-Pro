import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Building2, Clock, LogOut, RefreshCw, RotateCcw, Search, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { ConfirmDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
  LoadingSpinner,
} from '@/components/common';
import {
  forceLogoutOnlineUsers,
  getOnlineUserPage,
  OnlineUserItem,
  OnlineUserQuery,
} from '@/services/api/onlineUser';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type OnlineUserFilters = {
  username: string;
  nickName: string;
  deptName: string;
  tenantId: string;
};

const formatDateTime = (timestamp?: number) => {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

const formatDuration = (seconds?: number) => {
  if (seconds == null) return '-';
  if (seconds <= 0) return '即将过期';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainSeconds = seconds % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (parts.length === 0) parts.push(`${remainSeconds}秒`);

  return parts.slice(0, 2).join(' ');
};

const getAvatarText = (item: OnlineUserItem) =>
  item.nickName?.slice(0, 1) || item.username?.slice(0, 1) || 'U';

const getSessionStatusClassName = (item: OnlineUserItem) =>
  item.currentLogin
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300';

const getRemainingClassName = (seconds?: number) => {
  if (seconds == null) return 'text-slate-500 dark:text-slate-400';
  if (seconds <= 0) return 'text-rose-600 dark:text-rose-300';
  if (seconds <= 1800) return 'text-amber-600 dark:text-amber-300';
  return 'text-slate-600 dark:text-slate-300';
};

const checkboxClassName =
  'h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0d95b5] text-[#0d95b5] focus:ring-2 focus:ring-[#0d95b5]/30 focus:ring-offset-0 dark:border-slate-700 dark:bg-slate-950';

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

export const OnlineUserPage: React.FC = () => {
  const [query, setQuery] = useState<OnlineUserQuery>({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  const [filters, setFilters] = useState<OnlineUserFilters>({
    username: '',
    nickName: '',
    deptName: '',
    tenantId: '',
  });
  const [records, setRecords] = useState<OnlineUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [pendingLogoutTokens, setPendingLogoutTokens] = useState<string[]>([]);

  const selectableRecords = useMemo(
    () => records.filter((item) => !item.currentLogin),
    [records],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getOnlineUserPage(query);
      setRecords(response.rows || []);
      setTotal(response.total || 0);
      setSelectedTokens([]);
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载在线用户失败，请稍后重试';
      setError(message);
      toast.error(message);
      setRecords([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();

    setQuery((current) => ({
      ...current,
      pageNum: 1,
      username: filters.username.trim() || undefined,
      nickName: filters.nickName.trim() || undefined,
      deptName: filters.deptName.trim() || undefined,
      tenantId:
        filters.tenantId && Number.isFinite(Number(filters.tenantId))
          ? Number(filters.tenantId)
          : undefined,
    }));
  };

  const handleReset = () => {
    setFilters({
      username: '',
      nickName: '',
      deptName: '',
      tenantId: '',
    });
    setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  };

  const handleRefresh = () => {
    void loadData();
  };

  const toggleSelect = (token: string) => {
    setSelectedTokens((current) =>
      current.includes(token)
        ? current.filter((item) => item !== token)
        : [...current, token],
    );
  };

  const allSelected =
    selectableRecords.length > 0 &&
    selectableRecords.every((item) => selectedTokens.includes(item.token));

  const toggleSelectAll = () => {
    if (!selectableRecords.length) {
      return;
    }

    setSelectedTokens(allSelected ? [] : selectableRecords.map((item) => item.token));
  };

  const handleForceLogout = (tokens: string[]) => {
    if (!tokens.length) {
      toast.warning('请选择要强制下线的会话');
      return;
    }

    setPendingLogoutTokens(tokens);
  };

  const confirmForceLogout = async () => {
    if (!pendingLogoutTokens.length) {
      return;
    }

    try {
      const message = await forceLogoutOnlineUsers(pendingLogoutTokens);
      toast.success(message || '强制下线成功');
      setPendingLogoutTokens([]);
      await loadData();
    } catch (logoutError) {
      console.error(logoutError);
      toast.error(getErrorMessage(logoutError, '强制下线失败'));
    }
  };

  const hasActiveFilters = Boolean(
    query.username || query.nickName || query.deptName || query.tenantId,
  );

  const stats = useMemo(
    () => [
      {
        label: '在线总数',
        value: String(total),
        meta: `当前页 ${records.length}`,
        icon: <Users size={18} />,
        tone: 'blue',
      },
      {
        label: '可强退',
        value: String(selectableRecords.length),
        meta: '排除当前会话',
        icon: <LogOut size={18} />,
        tone: 'amber',
      },
      {
        label: '当前会话',
        value: String(records.filter((item) => item.currentLogin).length),
        meta: '受保护',
        icon: <ShieldCheck size={18} />,
        tone: 'green',
      },
      {
        label: '已选中',
        value: String(selectedTokens.length),
        meta: '待批量强退',
        icon: <Clock size={18} />,
        tone: 'violet',
      },
    ],
    [records, selectableRecords.length, selectedTokens.length, total],
  );

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">ONLINE USERS</p>
          <h2>在线用户</h2>
          <span>查看当前会话、租户归属、角色和强退状态</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleForceLogout(selectedTokens)}
            disabled={!selectedTokens.length}
          >
            <LogOut size={16} />
            批量强退
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
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form onSubmit={handleSearch} className="admin-online-user-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">搜索账号</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.username}
              onChange={(event) =>
                setFilters((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="按账号搜索"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className="input-label">昵称</span>
          <Input
            value={filters.nickName}
            onChange={(event) =>
              setFilters((current) => ({ ...current, nickName: event.target.value }))
            }
            placeholder="按昵称搜索"
          />
        </label>

        <label>
          <span className="input-label">部门</span>
          <Input
            value={filters.deptName}
            onChange={(event) =>
              setFilters((current) => ({ ...current, deptName: event.target.value }))
            }
            placeholder="按部门搜索"
          />
        </label>

        <label>
          <span className="input-label">租户 ID</span>
          <Input
            type="number"
            value={filters.tenantId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, tenantId: event.target.value }))
            }
            placeholder="租户 ID"
          />
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
    <InnerTableSurface className="admin-online-user-table-panel">
      <table className="unity-data-table admin-source-table admin-online-user-table min-w-[1120px]">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className={checkboxClassName}
                />
              </th>
              <th>用户</th>
              <th>部门</th>
              <th>租户</th>
              <th>角色</th>
              <th>登录时间</th>
              <th>剩余有效期</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={9} title="正在加载在线用户..." loading />
            ) : error ? (
              <TableStateRow colSpan={9} title="在线用户加载失败" description={error} />
            ) : records.length === 0 ? (
              <TableStateRow colSpan={9} title="暂无在线用户数据" />
            ) : (
              records.map((item) => (
                <tr key={item.token}>
                  <td className="align-top">
                    <input
                      type="checkbox"
                      disabled={item.currentLogin}
                      checked={selectedTokens.includes(item.token)}
                      onChange={() => toggleSelect(item.token)}
                      className={cn(checkboxClassName, 'disabled:opacity-40')}
                    />
                  </td>
                  <td>
                    <div className="admin-users-identity">
                      <div className="admin-users-avatar">{getAvatarText(item)}</div>
                      <div className="min-w-0">
                        <strong className="truncate">{item.username || '-'}</strong>
                        <small className="truncate">{item.nickName || '-'}</small>
                        <small className="truncate font-mono" title={item.token}>
                          Token: {item.token.slice(0, 12)}...
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>{item.deptName || '-'}</td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <Building2 size={14} className="text-slate-400 dark:text-slate-500" />
                      {item.tenantId ?? '-'}
                    </span>
                  </td>
                  <td>{item.roles?.length ? item.roles.join('、') : '-'}</td>
                  <td className="whitespace-nowrap">{formatDateTime(item.loginTime)}</td>
                  <td>
                    <span className={cn('text-sm font-medium', getRemainingClassName(item.remainingSeconds))}>
                      {formatDuration(item.remainingSeconds)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        getSessionStatusClassName(item),
                      )}
                    >
                      {item.currentLogin ? '当前在线' : '在线'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button
                        type="button"
                        className="danger"
                        title="强制下线"
                        disabled={Boolean(item.currentLogin)}
                        onClick={() => handleForceLogout([item.token])}
                      >
                        <LogOut size={15} />
                      </button>
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
      page={query.pageNum || 1}
      pageSize={query.pageSize || 10}
      onPageChange={(pageNum) => setQuery((current) => ({ ...current, pageNum }))}
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
      <section className="admin-source-page admin-online-user-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <ConfirmDialog
        open={pendingLogoutTokens.length > 0}
        title="确认强制下线"
        message={
          pendingLogoutTokens.length > 1
            ? `确定强制下线选中的 ${pendingLogoutTokens.length} 个会话吗？`
            : '确定强制下线这个会话吗？'
        }
        confirmText="确认强退"
        cancelText="取消"
        danger
        onCancel={() => setPendingLogoutTokens([])}
        onConfirm={() => void confirmForceLogout()}
      />
    </>
  );
};

export default OnlineUserPage;
