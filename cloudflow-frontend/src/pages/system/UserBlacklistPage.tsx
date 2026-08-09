import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Edit, Plus, RefreshCw, RotateCcw, ShieldOff, Search, Trash2, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay, toBackendDateString, toLocalDatetimeString } from '@/utils/dateFormat';
import {
  pageUserBlacklist,
  banUser,
  updateUserBlacklist,
  unbanUser,
  deleteUserBlacklist,
  type SysUserBlacklist,
  type UserBlacklistStatus,
} from '@/services/api/acl';
import { BaseDialog, ConfirmDialog, Pagination, UserSelector } from '@/components/common';
import {
  Button,
  DatePicker,
  Input,
  Label,
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

const ALL_VALUE = '__all__';

const DEFAULT_FORM: SysUserBlacklist = {
  userId: 0,
  userName: '',
  status: 'ACTIVE',
  expireAt: '',
  reason: '',
};

const STATUS_BADGE: Record<UserBlacklistStatus, string> = {
  ACTIVE:
    'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
  INACTIVE:
    'border border-slate-200 bg-[var(--cf-surface-muted)] text-cf-subtle dark:border-slate-700 dark:bg-slate-900/40',
};

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
        <div className="text-sm font-medium text-cf-title">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-cf-subtle">
            {description}
          </div>
        ) : null}
      </div>
    </td>
  </tr>
);

export const UserBlacklistPage = () => {
  const [rows, setRows] = useState<SysUserBlacklist[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ keyword: '', status: '' as '' | UserBlacklistStatus });
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), keyword: '', status: '' as '' | UserBlacklistStatus });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<SysUserBlacklist | null>(null);
  const [formData, setFormData] = useState<SysUserBlacklist>(DEFAULT_FORM);
  const [pendingDelete, setPendingDelete] = useState<SysUserBlacklist | null>(null);

  const fetchRows = async (next = query) => {
    setLoading(true);
    setError(null);
    try {
      const response: any = await pageUserBlacklist({
        pageNum: next.pageNum,
        pageSize: next.pageSize,
        keyword: next.keyword || undefined,
        status: next.status || undefined,
      });
      const list: SysUserBlacklist[] = Array.isArray(response?.records)
        ? response.records
        : Array.isArray(response?.rows)
          ? response.rows
          : [];
      setRows(list);
      setTotal(typeof response?.total === 'number' ? response.total : list.length);
    } catch (err) {
      console.error(err);
      const msg = '加载用户黑名单失败，请稍后重试。';
      setError(msg);
      setRows([]);
      setTotal(0);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
  }, [query]);

  const hasActiveFilters = useMemo(
    () => Boolean(query.keyword || query.status),
    [query],
  );

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      keyword: filters.keyword.trim(),
      status: filters.status,
    }));
  };

  const handleReset = () => {
    setFilters({ keyword: '', status: '' });
    setQuery((current) => ({ ...current, pageNum: 1, keyword: '', status: '' }));
  };

  const handleOpenModal = (row?: SysUserBlacklist) => {
    if (row) {
      setEditing(row);
      setFormData({ ...row, expireAt: row.expireAt || '' });
    } else {
      setEditing(null);
      setFormData(DEFAULT_FORM);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setFormData(DEFAULT_FORM);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.userId || formData.userId <= 0) {
      toast.error('请选择需要拉黑的用户');
      return;
    }
    try {
      const payload: SysUserBlacklist = {
        ...formData,
        userId: Number(formData.userId),
        reason: formData.reason?.trim() || '',
        expireAt: formData.expireAt?.trim() ? toBackendDateString(formData.expireAt) : undefined,
      };
      if (editing?.id) {
        await updateUserBlacklist({ ...payload, id: editing.id });
        toast.success('黑名单已更新');
      } else {
        await banUser(payload);
        toast.success('用户已拉黑');
      }
      handleCloseModal();
      await fetchRows();
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, editing ? '更新失败' : '拉黑失败'));
    }
  };

  const handleUnban = async (row: SysUserBlacklist) => {
    if (!row.id) return;
    try {
      await unbanUser(row.id);
      toast.success('已解除拉黑');
      await fetchRows();
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, '解除失败'));
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete?.id) return;
    try {
      await deleteUserBlacklist(pendingDelete.id);
      toast.success('记录已删除');
      const nextPage =
        rows.length === 1 && query.pageNum > 1 ? query.pageNum - 1 : query.pageNum;
      setPendingDelete(null);
      setQuery((current) => ({ ...current, pageNum: nextPage }));
      if (nextPage === query.pageNum) {
        await fetchRows();
      }
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, '删除失败'));
    }
  };

  const stats = useMemo(
    () => [
      {
        label: '黑名单总数',
        value: String(total),
        meta: `当前页 ${rows.length}`,
        icon: <UserX size={18} />,
        tone: 'blue',
      },
      {
        label: '生效中',
        value: String(rows.filter((row) => row.status === 'ACTIVE').length),
        meta: '禁止登录',
        icon: <ShieldOff size={18} />,
        tone: 'amber',
      },
      {
        label: '已解除',
        value: String(rows.filter((row) => row.status === 'INACTIVE').length),
        meta: '恢复登录',
        icon: <ShieldOff size={18} />,
        tone: 'green',
      },
      {
        label: '长期限制',
        value: String(rows.filter((row) => !row.expireAt).length),
        meta: '无过期时间',
        icon: <Trash2 size={18} />,
        tone: 'violet',
      },
    ],
    [rows, total],
  );

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">USER BLACKLIST</p>
          <h2>用户黑名单</h2>
          <span>管理拉黑用户、限制原因、过期时间和解除状态</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchRows()} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={() => handleOpenModal()}>
            <Plus size={16} />
            拉黑用户
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
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
      <form onSubmit={handleSearch} className="admin-user-blacklist-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">搜索用户</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.keyword}
              onChange={(e) =>
                setFilters((c) => ({ ...c, keyword: e.target.value }))
              }
              placeholder="用户名或原因"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className="input-label">状态</span>
          <Select
            value={filters.status || ALL_VALUE}
            onValueChange={(v) =>
              setFilters((c) => ({ ...c, status: v === ALL_VALUE ? '' : (v as UserBlacklistStatus) }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
              <SelectItem value="ACTIVE">生效中</SelectItem>
              <SelectItem value="INACTIVE">已解除</SelectItem>
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
    <InnerTableSurface className="admin-user-blacklist-table-panel">
      <table className="unity-data-table admin-source-table admin-user-blacklist-table min-w-[960px]">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户</th>
              <th>原因</th>
              <th>过期时间</th>
              <th>操作人</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={7} title="正在加载用户黑名单..." loading />
            ) : error ? (
              <TableStateRow colSpan={7} title="加载失败" description={error} />
            ) : rows.length === 0 ? (
              <TableStateRow colSpan={7} title="暂无黑名单记录" />
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="text-sm text-cf-subtle">{row.id}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <UserX size={14} className="text-rose-500" />
                      <span className="font-medium">{row.userName || `#${row.userId}`}</span>
                    </div>
                  </td>
                  <td className="text-xs text-cf-muted">{row.reason || '—'}</td>
                  <td>
                    <span className="text-xs text-cf-subtle">
                      {row.expireAt ? formatDateTimeDisplay(row.expireAt) : '长期'}
                    </span>
                  </td>
                  <td className="text-xs text-cf-subtle">{row.opUserName || '—'}</td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        STATUS_BADGE[row.status],
                      )}
                    >
                      {row.status === 'ACTIVE' ? '生效中' : '已解除'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      {row.status === 'ACTIVE' ? (
                        <button type="button" data-tooltip="解除拉黑" aria-label="解除拉黑" onClick={() => handleUnban(row)}>
                          <ShieldOff size={15} />
                        </button>
                      ) : null}
                      <button type="button" data-tooltip="编辑记录" aria-label="编辑记录" onClick={() => handleOpenModal(row)}>
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        data-tooltip="删除记录" aria-label="删除记录"
                        onClick={() => setPendingDelete(row)}
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
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((c) => ({ ...c, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((c) => ({ ...c, pageNum: 1, pageSize }))}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-user-blacklist-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={isModalOpen}
        onClose={handleCloseModal}
        title={editing ? '编辑黑名单' : '拉黑用户'}
        width="normal"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button type="submit" form="user-blacklist-form">{editing ? '保存修改' : '拉黑'}</Button>
          </>
        )}
      >
        <form id="user-blacklist-form" onSubmit={handleSubmit} className="admin-dialog-stack">
          <div className="admin-dialog-field">
            <Label>用户 *</Label>
            <UserSelector
              single
              value={formData.userId ? String(formData.userId) : ''}
              onChange={(id, user) =>
                setFormData((c) => ({
                  ...c,
                  userId: id ? Number(id) : 0,
                  userName: user?.name || '',
                }))
              }
              disabled={Boolean(editing)}
              placeholder="选择要拉黑的用户"
            />
          </div>
          <div className="admin-dialog-field">
            <Label>过期时间 (可选, 留空= 长期)</Label>
            <DatePicker
              type="datetime-local"
              value={formData.expireAt ? toLocalDatetimeString(formData.expireAt) : ''}
              onChange={(e) =>
                setFormData((c) => ({
                  ...c,
                  expireAt: e.target.value ? toBackendDateString(e.target.value) : '',
                }))
              }
            />
          </div>
          <div className="admin-dialog-field">
            <Label>状态</Label>
            <Select
              value={formData.status}
              onValueChange={(v) => setFormData((c) => ({ ...c, status: v as UserBlacklistStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">生效</SelectItem>
                <SelectItem value="INACTIVE">解除</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field">
            <Label>原因</Label>
            <Textarea
              rows={3}
              value={formData.reason || ''}
              onChange={(e) => setFormData((c) => ({ ...c, reason: e.target.value }))}
              placeholder="请说明拉黑原因, 例如: 风控告警 / 离职封禁 / 异常登录"
            />
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        title="删除黑名单记录"
        message={
          pendingDelete
            ? `确定删除「${pendingDelete.userName || `#${pendingDelete.userId}`}」的黑名单记录？该用户将不再被禁止登录。`
            : ''
        }
        confirmText="删除"
        danger
        onConfirm={handleDelete}
      />
    </>
  );
};

export default UserBlacklistPage;
