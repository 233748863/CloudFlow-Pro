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
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import {
  Button,
  DatePicker,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableRowActions,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/common';
import { cn } from '@/utils/cn';

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
    'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
};

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

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

  return (
    <>
      <TablePageLayout
        className="gap-3"
        filters={(
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.keyword}
                  onChange={(e) =>
                    setFilters((c) => ({ ...c, keyword: e.target.value }))
                  }
                  placeholder="搜索用户名/原因"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.status || ALL_VALUE}
                  onValueChange={(v) =>
                    setFilters((c) => ({ ...c, status: v === ALL_VALUE ? '' : (v as UserBlacklistStatus) }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                    <SelectItem value="ACTIVE">生效中</SelectItem>
                    <SelectItem value="INACTIVE">已解除</SelectItem>
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

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void fetchRows()} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
              <Button size="sm" onClick={() => handleOpenModal()}>
                <Plus size={15} />
                拉黑用户
              </Button>
            </div>
          </div>
        )}
        table={(
          <TableSurfaceCard fill>
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>用户</TableHead>
                      <TableHead>原因</TableHead>
                      <TableHead>过期时间</TableHead>
                      <TableHead>操作人</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-40">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableStateRow colSpan={7} title="正在加载用户黑名单..." loading />
                    ) : error ? (
                      <TableStateRow colSpan={7} title="加载失败" description={error} />
                    ) : rows.length === 0 ? (
                      <TableStateRow colSpan={7} title="暂无黑名单记录" />
                    ) : (
                      rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                            {row.id}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <UserX size={14} className="text-rose-500" />
                              <span className="font-medium">{row.userName || `#${row.userId}`}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                            {row.reason || '—'}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {row.expireAt ? formatDateTimeDisplay(row.expireAt) : '长期'}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                            {row.opUserName || '—'}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                                STATUS_BADGE[row.status],
                              )}
                            >
                              {row.status === 'ACTIVE' ? '生效中' : '已解除'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <TableRowActions
                              align="end"
                              actions={[
                                ...(row.status === 'ACTIVE'
                                  ? [
                                      {
                                        label: '解除拉黑',
                                        icon: <ShieldOff size={15} />,
                                        onClick: () => handleUnban(row),
                                        tone: 'success' as const,
                                      },
                                    ]
                                  : []),
                                {
                                  label: '编辑记录',
                                  icon: <Edit size={15} />,
                                  onClick: () => handleOpenModal(row),
                                  tone: 'neutral',
                                },
                                {
                                  label: '删除记录',
                                  icon: <Trash2 size={15} />,
                                  onClick: () => setPendingDelete(row),
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
              <Pagination
                page={query.pageNum}
                pageSize={query.pageSize}
                total={total}
                onPageChange={(pageNum) => setQuery((c) => ({ ...c, pageNum }))}
                onPageSizeChange={(pageSize) => setQuery((c) => ({ ...c, pageNum: 1, pageSize }))}
              />
            </>
          </TableSurfaceCard>
        )}
      />

      <BaseDialog
        open={isModalOpen}
        onClose={handleCloseModal}
        title={editing ? '编辑黑名单' : '拉黑用户'}
        width="normal"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={fieldLabelClassName}>用户 *</label>
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
          <div>
            <label className={fieldLabelClassName}>过期时间 (可选, 留空= 长期)</label>
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
          <div>
            <label className={fieldLabelClassName}>状态</label>
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
          <div>
            <label className={fieldLabelClassName}>原因</label>
            <Textarea
              rows={3}
              value={formData.reason || ''}
              onChange={(e) => setFormData((c) => ({ ...c, reason: e.target.value }))}
              placeholder="请说明拉黑原因, 例如: 风控告警 / 离职封禁 / 异常登录"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button type="submit">{editing ? '保存修改' : '拉黑'}</Button>
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
