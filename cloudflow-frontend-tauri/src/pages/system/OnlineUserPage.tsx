import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { LogOut, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { ConfirmDialog, Pagination } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
  Table,
  TableActionHead,
  TableRowActions,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import {
  forceLogoutOnlineUsers,
  getOnlineUserPage,
  OnlineUserItem,
  OnlineUserQuery,
} from '@/services/api/onlineUser';
import { cn } from '@/utils/cn';

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
    : 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300';

const getRemainingClassName = (seconds?: number) => {
  if (seconds == null) return 'text-slate-500 dark:text-slate-400';
  if (seconds <= 0) return 'text-rose-600 dark:text-rose-300';
  if (seconds <= 1800) return 'text-amber-600 dark:text-amber-300';
  return 'text-slate-600 dark:text-slate-300';
};

const checkboxClassName =
  'h-4 w-4 shrink-0 rounded border-slate-300 accent-cyan-600 text-cyan-600 focus:ring-2 focus:ring-cyan-400 focus:ring-offset-0 dark:border-slate-700 dark:bg-slate-950';

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

  return (
    <>
      <TablePageLayout
        className="gap-3"
        filters={(
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-40">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.username}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder="按账号搜索"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-36">
                <Input
                  value={filters.nickName}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, nickName: event.target.value }))
                  }
                  placeholder="按昵称搜索"
                  className="h-10"
                />
              </div>

              <div className="w-full sm:w-36">
                <Input
                  value={filters.deptName}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, deptName: event.target.value }))
                  }
                  placeholder="按部门搜索"
                  className="h-10"
                />
              </div>

              <div className="w-full sm:w-32">
                <Input
                  type="number"
                  value={filters.tenantId}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, tenantId: event.target.value }))
                  }
                  placeholder="租户 ID"
                  className="h-10"
                />
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

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleForceLogout(selectedTokens)}
                disabled={!selectedTokens.length}
              >
                <LogOut size={15} />
                批量强退
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard fill>
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[1120px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className={checkboxClassName}
                      />
                    </TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>租户</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>登录时间</TableHead>
                    <TableHead>剩余有效期</TableHead>
                    <TableHead>状态</TableHead>
                    <TableActionHead className="w-24">操作</TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableStateRow colSpan={9} title="正在加载在线用户..." loading />
                  ) : error ? (
                    <TableStateRow colSpan={9} title="在线用户加载失败" description={error} />
                  ) : records.length === 0 ? (
                    <TableStateRow colSpan={9} title="暂无在线用户数据" />
                  ) : (
                    records.map((item) => (
                      <TableRow key={item.token}>
                        <TableCell className="py-4 align-top">
                          <input
                            type="checkbox"
                            disabled={item.currentLogin}
                            checked={selectedTokens.includes(item.token)}
                            onChange={() => toggleSelect(item.token)}
                            className={cn(checkboxClassName, 'disabled:opacity-40')}
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                              {getAvatarText(item)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {item.username || '-'}
                                </span>
                                {item.currentLogin ? (
                                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
                                    当前会话
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-slate-500 dark:text-slate-400">
                                {item.nickName || '-'}
                              </div>
                              <div
                                className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500"
                                title={item.token}
                              >
                                Token: {item.token.slice(0, 12)}...
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-slate-600 dark:text-slate-300">
                          {item.deptName || '-'}
                        </TableCell>
                        <TableCell className="py-4 text-slate-600 dark:text-slate-300">
                          {item.tenantId ?? '-'}
                        </TableCell>
                        <TableCell className="py-4 text-slate-600 dark:text-slate-300">
                          {item.roles?.length ? item.roles.join('、') : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-4 text-slate-600 dark:text-slate-300">
                          {formatDateTime(item.loginTime)}
                        </TableCell>
                        <TableCell className="py-4">
                          <span
                            className={cn('text-sm font-medium', getRemainingClassName(item.remainingSeconds))}
                          >
                            {formatDuration(item.remainingSeconds)}
                          </span>
                        </TableCell>
                        <TableCell className="py-4">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                              getSessionStatusClassName(item),
                            )}
                          >
                            {item.currentLogin ? '当前在线' : '在线'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <TableRowActions
                            align="end"
                            actions={[
                              {
                                label: '强制下线',
                                icon: <LogOut size={15} />,
                                onClick: () => handleForceLogout([item.token]),
                                disabled: Boolean(item.currentLogin),
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
            </div>
          </>
        </TableSurfaceCard>)}
        pagination={(
          total > 0 ? (
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
          ) : null
        )}
      />

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

