import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Laptop, LogOut, RefreshCw, RotateCcw, Search, ShieldAlert, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, TableActionHead, TableHead, TableHeader } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';
import {
  forceLogoutOnlineUsers,
  getOnlineUserPage,
  type OnlineUserItem,
  type OnlineUserQuery,
} from '@/services/api/onlineUser';

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

const getAvatarText = (item: OnlineUserItem) => {
  return item.nickName?.slice(0, 1) || item.username?.slice(0, 1) || 'U';
};

export const OnlineUserPage: React.FC = () => {
  const [query, setQuery] = useState<OnlineUserQuery>({ pageNum: 1, pageSize: 10 });
  const [records, setRecords] = useState<OnlineUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);

  const selectableRecords = useMemo(
    () => records.filter((item) => !item.currentLogin),
    [records],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getOnlineUserPage(query);
      setRecords(response.rows || []);
      setTotal(response.total || 0);
      setSelectedTokens([]);
    } catch {
      // API 层已做统一提示
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSearch = () => {
    setQuery((prev) => ({ ...prev, pageNum: 1 }));
  };

  const handleReset = () => {
    setQuery({ pageNum: 1, pageSize: 10 });
  };

  const toggleSelect = (token: string) => {
    setSelectedTokens((prev) => (prev.includes(token) ? prev.filter((item) => item !== token) : [...prev, token]));
  };

  const toggleSelectAll = () => {
    if (!selectableRecords.length) return;
    const allSelected = selectableRecords.every((item) => selectedTokens.includes(item.token));
    setSelectedTokens(allSelected ? [] : selectableRecords.map((item) => item.token));
  };

  const handleForceLogout = async (tokens: string[]) => {
    if (!tokens.length) {
      toast.warning('请选择要强制下线的会话');
      return;
    }
    if (!window.confirm(`确定强制下线选中的 ${tokens.length} 个会话吗？`)) {
      return;
    }

    try {
      const message = await forceLogoutOnlineUsers(tokens);
      toast.success(message || '强制下线成功');
      await loadData();
    } catch {
      // API 层已做统一提示
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize || 10)));
  const currentPage = query.pageNum || 1;
  const currentLoginCount = records.filter((item) => item.currentLogin).length;
  const hasActiveFilters = Boolean(query.username || query.nickName || query.deptName || query.tenantId);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: '在线总会话', value: `${total} 个` },
    { label: '当前页可操作', value: `${selectableRecords.length} 个` },
    { label: '当前登录会话', value: `${currentLoginCount} 个` },
    { label: '已勾选', value: `${selectedTokens.length} 个` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <Laptop size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="在线用户"
          description="在线会话页统一到同一套工作台结构后，筛选、批量强退和分页浏览的节奏会更稳定。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { void loadData(); }}>
                <RefreshCw size={15} />
                刷新列表
              </Button>
              <Button variant="destructive" onClick={() => void handleForceLogout(selectedTokens)} disabled={!selectedTokens.length}>
                <ShieldAlert size={15} />
                批量强退
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="在线总会话"
              value={total}
              hint="当前筛选条件下的总在线会话数"
              aside={<Laptop size={18} className="text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="可操作会话"
              value={selectableRecords.length}
              hint="当前页中可强制下线的会话数"
              aside={<ShieldAlert size={18} className="text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="当前登录"
              value={currentLoginCount}
              hint="属于当前账号的在线会话"
              aside={<Users size={18} className="text-emerald-500" />}
            />
            <WorkspaceMetricCard
              label="已勾选"
              value={selectedTokens.length}
              hint="本页已选择的会话数"
              aside={<LogOut size={18} className="text-sky-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="在线会话筛选"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              quickFilterAside={hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} />
                  重置条件
                </Button>
              ) : (
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  当前显示默认视图
                </span>
              )}
              filterBar={(
                <div className="grid gap-2.5 xl:grid-cols-5">
                  <Input
                    value={query.username || ''}
                    onChange={(event) => setQuery((prev) => ({ ...prev, username: event.target.value }))}
                    placeholder="按账号搜索"
                  />
                  <Input
                    value={query.nickName || ''}
                    onChange={(event) => setQuery((prev) => ({ ...prev, nickName: event.target.value }))}
                    placeholder="按昵称搜索"
                  />
                  <Input
                    value={query.deptName || ''}
                    onChange={(event) => setQuery((prev) => ({ ...prev, deptName: event.target.value }))}
                    placeholder="按部门搜索"
                  />
                  <Input
                    type="number"
                    value={query.tenantId ?? ''}
                    onChange={(event) => setQuery((prev) => ({
                      ...prev,
                      tenantId: event.target.value && Number.isFinite(Number(event.target.value))
                        ? Number(event.target.value)
                        : undefined,
                    }))}
                    placeholder="租户 ID"
                  />
                  <Button type="button" onClick={handleSearch}>
                    <Search size={15} />
                    查询会话
                  </Button>
                </div>
              )}
            />

            <WorkspaceResultCard
              total={total}
              description="账号、部门、租户、会话有效期和强制下线操作统一纳入工作台页面结构。"
              footer={(
                <WorkspacePaginationBar
                  total={total}
                  pageNum={currentPage}
                  totalPages={totalPages}
                  onPrev={() => setQuery((prev) => ({ ...prev, pageNum: Math.max((prev.pageNum || 1) - 1, 1) }))}
                  onNext={() => setQuery((prev) => ({ ...prev, pageNum: Math.min(totalPages, (prev.pageNum || 1) + 1) }))}
                  prevDisabled={currentPage <= 1}
                  nextDisabled={currentPage >= totalPages}
                />
              )}
            >
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full text-sm">
                  <TableHeader>
                    <tr>
                      <TableHead>
                        <input
                          type="checkbox"
                          checked={selectableRecords.length > 0 && selectableRecords.every((item) => selectedTokens.includes(item.token))}
                          onChange={toggleSelectAll}
                          className="rounded"
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
                  <tbody>
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={9} type="loading" title="正在加载在线用户..." />
                    ) : !records.length ? (
                      <WorkspaceTableStateRow colSpan={9} title="暂无在线用户数据" description="可以调整筛选条件，或等待新的登录会话出现。" />
                    ) : (
                      records.map((item) => (
                        <tr key={item.token} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-3 align-top">
                            <input
                              type="checkbox"
                              disabled={item.currentLogin}
                              checked={selectedTokens.includes(item.token)}
                              onChange={() => toggleSelect(item.token)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                                {getAvatarText(item)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-900">{item.username || '-'}</span>
                                  {item.currentLogin ? (
                                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                                      当前会话
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-slate-500">{item.nickName || '-'}</div>
                                <div className="mt-1 font-mono text-xs text-slate-400" title={item.token}>
                                  Token: {item.token.slice(0, 12)}...
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{item.deptName || '-'}</td>
                          <td className="px-4 py-3 text-slate-600">{item.tenantId ?? '-'}</td>
                          <td className="px-4 py-3 text-slate-600">{item.roles?.length ? item.roles.join('、') : '-'}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDateTime(item.loginTime)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDuration(item.remainingSeconds)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              item.currentLogin
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                            }`}>
                              {item.currentLogin ? '当前在线' : '在线'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '强制下线',
                                  icon: <LogOut size={14} />,
                                  onClick: () => void handleForceLogout([item.token]),
                                  tone: 'danger',
                                  disabled: !!item.currentLogin,
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>
      </WorkspacePageContent>
    </div>
  );
};

export default OnlineUserPage;
