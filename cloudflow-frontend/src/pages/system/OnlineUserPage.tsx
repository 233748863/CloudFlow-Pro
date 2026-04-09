import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Laptop, LogOut, RefreshCw, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, TableHead, TableHeader, TableActionHead } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
import {
  forceLogoutOnlineUsers,
  getOnlineUserPage,
  type OnlineUserItem,
  type OnlineUserQuery,
} from '@/services/api/onlineUser';

const formatDateTime = (timestamp?: number) => {
  if (!timestamp) {
    return '-';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

const formatDuration = (seconds?: number) => {
  if (seconds == null) {
    return '-';
  }
  if (seconds <= 0) {
    return '即将过期';
  }

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
      const res = await getOnlineUserPage(query);
      setRecords(res.rows || []);
      setTotal(res.total || 0);
      setSelectedTokens([]);
    } catch {
      // 这里交给统一请求层提示错误
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
    setSelectedTokens((prev) => (
      prev.includes(token) ? prev.filter((item) => item !== token) : [...prev, token]
    ));
  };

  const toggleSelectAll = () => {
    if (!selectableRecords.length) {
      return;
    }
    const allSelected = selectableRecords.every((item) => selectedTokens.includes(item.token));
    setSelectedTokens(allSelected ? [] : selectableRecords.map((item) => item.token));
  };

  const handleForceLogout = async (tokens: string[]) => {
    if (!tokens.length) {
      toast.warning('请选择要强制下线的会话');
      return;
    }
    if (!confirm(`确定强制下线选中的 ${tokens.length} 个会话吗？`)) {
      return;
    }

    try {
      const message = await forceLogoutOnlineUsers(tokens);
      toast.success(message || '强制下线成功');
      setSelectedTokens([]);
      await loadData();
    } catch {
      // 这里交给统一请求层提示错误
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize || 10)));
  const currentPage = query.pageNum || 1;
  const currentLoginCount = records.filter((item) => item.currentLogin).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-50 text-pink-500">
              <Laptop size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">在线用户</h1>
              <p className="mt-1 text-sm text-slate-500">查看当前存活会话，并支持批量强制下线。</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => void loadData()}
            className="gap-2"
          >
            <RefreshCw size={16} />
            刷新
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleForceLogout(selectedTokens)}
            disabled={!selectedTokens.length}
            className="gap-2"
          >
            <ShieldAlert size={16} />
            批量强退
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">在线总会话</div>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{total}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">当前页可操作会话</div>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{selectableRecords.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">当前登录会话</div>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{currentLoginCount}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">账号</label>
            <Input
              value={query.username || ''}
              onChange={(event) => setQuery((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="请输入账号"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">昵称</label>
            <Input
              value={query.nickName || ''}
              onChange={(event) => setQuery((prev) => ({ ...prev, nickName: event.target.value }))}
              placeholder="请输入昵称"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">部门</label>
            <Input
              value={query.deptName || ''}
              onChange={(event) => setQuery((prev) => ({ ...prev, deptName: event.target.value }))}
              placeholder="请输入部门名称"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">租户</label>
            <Input
              type="number"
              value={query.tenantId ?? ''}
              onChange={(event) => setQuery((prev) => ({
                ...prev,
                tenantId: event.target.value && Number.isFinite(Number(event.target.value))
                  ? Number(event.target.value)
                  : undefined,
              }))}
              placeholder="请输入租户 ID"
            />
          </div>
          <div className="flex items-end gap-3">
            <Button
              onClick={handleSearch}
              className="flex-1 bg-pink-500 hover:bg-pink-600 gap-2"
            >
              <Search size={16} />
              查询
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              className="gap-2"
            >
              <RotateCcw size={16} />
              重置
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <TableHeader className="text-left text-slate-600">
              <tr>
                <TableHead className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectableRecords.length > 0 && selectableRecords.every((item) => selectedTokens.includes(item.token))}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="px-4 py-3">用户</TableHead>
                <TableHead className="px-4 py-3">部门</TableHead>
                <TableHead className="px-4 py-3">租户</TableHead>
                <TableHead className="px-4 py-3">角色</TableHead>
                <TableHead className="px-4 py-3">登录时间</TableHead>
                <TableHead className="px-4 py-3">剩余有效期</TableHead>
                <TableHead className="px-4 py-3">状态</TableHead>
                <TableActionHead className="px-4 py-3 w-48">操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody>
              {loading ? (
                <WorkspaceTableStateRow colSpan={9} type="loading" title="正在加载在线用户..." />
              ) : !records.length ? (
                <WorkspaceTableStateRow colSpan={9} title="暂无在线用户数据" />
              ) : records.map((item) => (
                <tr key={item.token} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      disabled={item.currentLogin}
                      checked={selectedTokens.includes(item.token)}
                      onChange={() => toggleSelect(item.token)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-50 text-sm font-semibold text-pink-600">
                        {getAvatarText(item)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{item.username || '-'}</span>
                          {item.currentLogin ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">当前会话</span>
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
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.currentLogin ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
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
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4 text-sm text-slate-500">
          <span>共 {total} 条在线会话</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setQuery((prev) => ({ ...prev, pageNum: Math.max((prev.pageNum || 1) - 1, 1) }))}
            >
              上一页
            </Button>
            <span>第 {currentPage} / {totalPages} 页</span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setQuery((prev) => ({ ...prev, pageNum: (prev.pageNum || 1) + 1 }))}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
