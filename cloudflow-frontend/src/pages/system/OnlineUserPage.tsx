import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Laptop, LogOut, RefreshCw, RotateCcw, Search, ShieldAlert, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { ConfirmDialog } from '@/components/common';
import {
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';
import {
  forceLogoutOnlineUsers,
  getOnlineUserPage,
  type OnlineUserItem,
  type OnlineUserQuery,
} from '@/services/api/onlineUser';
import { cn } from '@/utils/cn';

type OnlineUserFilters = {
  username: string;
  nickName: string;
  deptName: string;
  tenantId: string;
};

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
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
    : 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200';

const getRemainingClassName = (seconds?: number) => {
  if (seconds == null) return 'text-slate-500 dark:text-slate-400';
  if (seconds <= 0) return 'text-rose-600 dark:text-rose-300';
  if (seconds <= 1800) return 'text-amber-600 dark:text-amber-300';
  return 'text-slate-600 dark:text-slate-300';
};

export const OnlineUserPage: React.FC = () => {
  const [query, setQuery] = useState<OnlineUserQuery>({ pageNum: 1, pageSize: 10 });
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
    } catch (error) {
      console.error(error);
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

  const applySearch = () => {
    setQuery((prev) => ({
      ...prev,
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
    setQuery({ pageNum: 1, pageSize: 10 });
  };

  const handleRefresh = () => {
    void loadData();
  };

  const toggleSelect = (token: string) => {
    setSelectedTokens((prev) =>
      prev.includes(token) ? prev.filter((item) => item !== token) : [...prev, token],
    );
  };

  const toggleSelectAll = () => {
    if (!selectableRecords.length) return;
    const allSelected = selectableRecords.every((item) => selectedTokens.includes(item.token));
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
    } catch (error) {
      console.error(error);
      toast.error('强制下线失败');
    }
  };

  const currentPage = query.pageNum || 1;
  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize || 10)));
  const currentLoginCount = records.filter((item) => item.currentLogin).length;
  const expiringSoonCount = records.filter((item) => (item.remainingSeconds ?? 0) > 0 && (item.remainingSeconds ?? 0) <= 1800).length;
  const hasActiveFilters = Boolean(query.username || query.nickName || query.deptName || query.tenantId);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const overviewItems = [
    { label: '在线总会话', value: `${total} 个` },
    { label: '当前页可操作', value: `${selectableRecords.length} 个` },
    { label: '当前登录会话', value: `${currentLoginCount} 个` },
    { label: '已勾选', value: `${selectedTokens.length} 个` },
  ];

  const heroMetrics = [
    {
      label: '在线总会话',
      value: `${total}`,
      hint: '当前筛选条件下的总在线会话数',
      icon: <Laptop size={17} />,
    },
    {
      label: '可操作会话',
      value: `${selectableRecords.length}`,
      hint: '当前页中可强制下线的会话数',
      icon: <ShieldAlert size={17} />,
    },
    {
      label: '当前登录',
      value: `${currentLoginCount}`,
      hint: '属于当前账号的在线会话',
      icon: <Users size={17} />,
    },
    {
      label: '即将过期',
      value: `${expiringSoonCount}`,
      hint: '30 分钟内到期的会话数',
      icon: <LogOut size={17} />,
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                <Laptop size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          )}
          title="在线用户"
          description="在线会话页统一到同一套工作台结构后，筛选、批量强退和分页浏览的节奏会更稳定。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新列表
              </Button>
              <Button variant="destructive" size="lg" onClick={() => handleForceLogout(selectedTokens)} disabled={!selectedTokens.length}>
                <ShieldAlert size={15} />
                批量强退
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 在线会话工作台
            </span>
            <span className={surfaceChipClassName}>用户：{query.username || '未设置'}</span>
            <span className={surfaceChipClassName}>部门：{query.deptName || '未设置'}</span>
            <span className={surfaceChipClassName}>租户：{query.tenantId ?? '未设置'}</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="在线筛选"
          title="在线会话工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={(
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>可强退 {selectableRecords.length} 个</span>
              <span className={surfaceChipClassName}>当前登录 {currentLoginCount} 个</span>
              <span className={surfaceChipClassName}>即将过期 {expiringSoonCount} 个</span>
            </div>
          )}
          quickFilterAside={(
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} />
                  重置条件
                </Button>
              ) : (
                <span className={surfaceChipClassName}>当前显示默认视图</span>
              )}
            </div>
          )}
          filterBar={(
            <div className="grid gap-2.5 xl:grid-cols-5">
              <Input
                value={filters.username}
                onChange={(event) => setFilters((prev) => ({ ...prev, username: event.target.value }))}
                placeholder="按账号搜索"
              />
              <Input
                value={filters.nickName}
                onChange={(event) => setFilters((prev) => ({ ...prev, nickName: event.target.value }))}
                placeholder="按昵称搜索"
              />
              <Input
                value={filters.deptName}
                onChange={(event) => setFilters((prev) => ({ ...prev, deptName: event.target.value }))}
                placeholder="按部门搜索"
              />
              <Input
                type="number"
                value={filters.tenantId}
                onChange={(event) => setFilters((prev) => ({ ...prev, tenantId: event.target.value }))}
                placeholder="租户 ID"
              />
              <Button type="button" onClick={applySearch}>
                <Search size={15} />
                查询会话
              </Button>
            </div>
          )}
        />

        <WorkspaceResultCard
          total={total}
          title="当前在线会话"
          description="账号、部门、租户、会话有效期和强制下线操作统一纳入工作台页面结构。"
          footer={(
            <WorkspacePaginationBar
              total={total}
              pageNum={currentPage}
              totalPages={totalPages}
              onPrev={() =>
                setQuery((prev) => ({
                  ...prev,
                  pageNum: Math.max((prev.pageNum || 1) - 1, 1),
                }))
              }
              onNext={() =>
                setQuery((prev) => ({
                  ...prev,
                  pageNum: Math.min(totalPages, (prev.pageNum || 1) + 1),
                }))
              }
              prevDisabled={currentPage <= 1}
              nextDisabled={currentPage >= totalPages}
            />
          )}
        >
          <div className="space-y-4 px-4 py-4">
            {!loading && !error && records.length > 0 ? (
              <div className={subtlePanelClassName}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">在线结果概况</div>
                    <div className="flex flex-wrap gap-2">
                      <span className={surfaceChipClassName}>当前页 {records.length} 个</span>
                      <span className={surfaceChipClassName}>可操作 {selectableRecords.length} 个</span>
                      <span className={surfaceChipClassName}>当前登录 {currentLoginCount} 个</span>
                      <span className={surfaceChipClassName}>已勾选 {selectedTokens.length} 个</span>
                    </div>
                    <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                      当前登录的会话不可被勾选或强退，避免在线治理页出现误操作和状态混乱。
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleForceLogout(selectedTokens)}
                      disabled={!selectedTokens.length}
                    >
                      <LogOut size={14} />
                      强制下线
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <Table className="min-w-[1180px]">
              <TableHeader>
                <tr>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={
                        selectableRecords.length > 0 &&
                        selectableRecords.every((item) => selectedTokens.includes(item.token))
                      }
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>租户</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>登录时间</TableHead>
                  <TableHead>剩余有效期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableActionHead className="w-48">操作</TableActionHead>
                </tr>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <WorkspaceTableStateRow colSpan={9} type="loading" title="正在加载在线用户..." />
                ) : error ? (
                  <WorkspaceTableStateRow
                    colSpan={9}
                    title="在线用户加载失败"
                    description={error}
                  />
                ) : !records.length ? (
                  <WorkspaceTableStateRow
                    colSpan={9}
                    title="暂无在线用户数据"
                    description="可以调整筛选条件，或等待新的登录会话出现。"
                  />
                ) : (
                  records.map((item) => (
                    <TableRow key={item.token}>
                      <TableCell className="py-4 align-top">
                        <input
                          type="checkbox"
                          disabled={item.currentLogin}
                          checked={selectedTokens.includes(item.token)}
                          onChange={() => toggleSelect(item.token)}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950"
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                            {getAvatarText(item)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900 dark:text-slate-100">{item.username || '-'}</span>
                              {item.currentLogin ? (
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
                                  当前会话
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-slate-500 dark:text-slate-400">{item.nickName || '-'}</div>
                            <div className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500" title={item.token}>
                              Token: {item.token.slice(0, 12)}...
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-slate-600 dark:text-slate-300">{item.deptName || '-'}</TableCell>
                      <TableCell className="py-4 text-slate-600 dark:text-slate-300">{item.tenantId ?? '-'}</TableCell>
                      <TableCell className="py-4 text-slate-600 dark:text-slate-300">{item.roles?.length ? item.roles.join('、') : '-'}</TableCell>
                      <TableCell className="py-4 text-slate-600 dark:text-slate-300">{formatDateTime(item.loginTime)}</TableCell>
                      <TableCell className="py-4">
                        <span className={cn('text-sm font-medium', getRemainingClassName(item.remainingSeconds))}>
                          {formatDuration(item.remainingSeconds)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', getSessionStatusClassName(item))}>
                          {item.currentLogin ? '当前在线' : '在线'}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            {
                              label: '强制下线',
                              icon: <LogOut size={14} />,
                              onClick: () => handleForceLogout([item.token]),
                              tone: 'danger',
                              disabled: !!item.currentLogin,
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
        </WorkspaceResultCard>

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
          danger={true}
          onCancel={() => setPendingLogoutTokens([])}
          onConfirm={() => void confirmForceLogout()}
        />
      </WorkspacePageContent>
    </div>
  );
};

export default OnlineUserPage;
