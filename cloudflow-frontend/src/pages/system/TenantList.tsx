import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  Edit,
  HardDrive,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
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
  TableRowActions,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import {
  addTenant,
  changeTenantStatus,
  deleteTenant,
  getTenantList,
  getTenantStatisticsBatch,
  refreshTenantStorageUsage,
  updateTenant,
  type SysTenant,
  type TenantStatistics,
  type TenantStatisticsItem,
} from '../../services/api/tenant';
import { cn } from '@/utils/cn';

interface TenantView extends SysTenant, TenantStatistics {
  tenantId: number;
  status: string;
}

interface TenantFormData {
  tenantName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  domain: string;
  status: string;
  expireTime: string;
  userLimit: number;
  storageLimit: number;
  remark: string;
}

type TenantFilters = {
  keyword: string;
};

type TenantQuery = TenantFilters & {
  pageNum: number;
  pageSize: number;
};

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

const DEFAULT_TENANT_STATS: TenantStatistics = {
  expired: false,
  disabled: false,
  userLimitReached: false,
  userCount: 0,
};

const DEFAULT_FORM_DATA: TenantFormData = {
  tenantName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  domain: '',
  status: '0',
  expireTime: '',
  userLimit: 100,
  storageLimit: 10240,
  remark: '',
};

const normalizeTenantListResponse = (response: any): SysTenant[] => {
  if (Array.isArray(response?.records)) {
    return response.records;
  }

  if (Array.isArray(response?.rows)) {
    return response.rows;
  }

  if (Array.isArray(response)) {
    return response;
  }

  return [];
};

const isTenantExpiredByDate = (expireTime?: string) => {
  if (!expireTime) {
    return false;
  }

  const time = new Date(expireTime).getTime();
  return !Number.isNaN(time) && time < Date.now();
};

const buildFallbackStatistics = (tenant: SysTenant): TenantStatistics => ({
  expired: isTenantExpiredByDate(tenant.expireTime),
  disabled: tenant.status === '1',
  userLimitReached: false,
  userCount: tenant.accountCount ?? 0,
});

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN');
};

const formatStorage = (mb?: number) => {
  if (!mb || mb <= 0) return '0 MB';
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb} MB`;
};

const calcPercent = (used?: number, limit?: number) => {
  if (!limit || limit <= 0) {
    return 0;
  }

  return Math.min(((used || 0) / limit) * 100, 100);
};

const getExpireHint = (expireTime?: string) => {
  if (!expireTime) {
    return {
      text: '未设置',
      toneClassName:
        'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300',
    };
  }

  const time = new Date(expireTime).getTime();
  if (Number.isNaN(time)) {
    return {
      text: '日期异常',
      toneClassName:
        'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
    };
  }

  const diffDays = Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return {
      text: '已过期',
      toneClassName:
        'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
    };
  }

  if (diffDays <= 30) {
    return {
      text: `${diffDays} 天后到期`,
      toneClassName:
        'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200',
    };
  }

  return {
    text: '有效',
    toneClassName:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
    };
};

const getStatusClassName = (status: string) =>
  status === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const getUsageBadgeClassName = (percent: number, high: number, medium: number) => {
  if (percent >= high) {
    return 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';
  }

  if (percent >= medium) {
    return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200';
  }

  return 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300';
};

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

export const TenantList: React.FC = () => {
  const [allTenants, setAllTenants] = useState<TenantView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TenantFilters>({ keyword: '' });
  const [query, setQuery] = useState<TenantQuery>({
    keyword: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantView | null>(null);
  const [pendingDeleteTenant, setPendingDeleteTenant] = useState<TenantView | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(DEFAULT_FORM_DATA);
  const [refreshingTenantId, setRefreshingTenantId] = useState<number | null>(null);

  const fetchTenants = async (keyword: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await getTenantList({ tenantName: keyword || undefined });
      const baseTenants = normalizeTenantListResponse(response);
      const tenantIds = baseTenants
        .map((tenant) => tenant.tenantId)
        .filter((tenantId): tenantId is number => typeof tenantId === 'number' && tenantId > 0);

      let statisticsMap = new Map<number, TenantStatisticsItem>();
      if (tenantIds.length > 0) {
        try {
          const statisticsList = await getTenantStatisticsBatch(tenantIds);
          statisticsMap = new Map(statisticsList.map((item) => [item.tenantId, item]));
        } catch (statisticsError) {
          console.warn('批量读取租户统计失败，将回退到基础统计。', statisticsError);
        }
      }

      // 先补齐统计字段，再进入统一的表格和分页骨架。
      const enrichedTenants = baseTenants.map((tenant) => {
        if (!tenant.tenantId) {
          return {
            ...tenant,
            ...DEFAULT_TENANT_STATS,
            tenantId: 0,
            status: tenant.status || '0',
          } satisfies TenantView;
        }

        const statistics = statisticsMap.get(tenant.tenantId) ?? buildFallbackStatistics(tenant);
        return {
          ...tenant,
          ...statistics,
          tenantId: tenant.tenantId,
          status: tenant.status || '0',
        } satisfies TenantView;
      });

      setAllTenants(enrichedTenants);
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载租户失败，请稍后重试';
      setError(message);
      setAllTenants([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTenants(query.keyword);
  }, [query.keyword]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(allTenants.length / query.pageSize));
    if (query.pageNum > totalPages) {
      setQuery((current) => ({ ...current, pageNum: totalPages }));
    }
  }, [allTenants.length, query.pageNum, query.pageSize]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      keyword: filters.keyword.trim(),
      pageNum: 1,
    }));
  };

  const handleReset = () => {
    setFilters({ keyword: '' });
    setQuery((current) => ({
      ...current,
      keyword: '',
      pageNum: 1,
    }));
  };

  const handleRefresh = () => {
    void fetchTenants(query.keyword);
  };

  const handleOpenModal = (tenant?: TenantView) => {
    if (tenant) {
      setEditingTenant(tenant);
      setFormData({
        tenantName: tenant.tenantName || '',
        contactName: tenant.contactName || '',
        contactPhone: tenant.contactPhone || '',
        contactEmail: tenant.contactEmail || '',
        domain: tenant.domain || '',
        status: tenant.status || '0',
        expireTime: tenant.expireTime ? tenant.expireTime.split(' ')[0] : '',
        userLimit: tenant.userLimit || 100,
        storageLimit: tenant.storageLimit || 10240,
        remark: tenant.remark || '',
      });
    } else {
      setEditingTenant(null);
      setFormData(DEFAULT_FORM_DATA);
    }

    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTenant(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.tenantName.trim()) {
      toast.error('请输入租户名称');
      return;
    }

    try {
      if (editingTenant) {
        await updateTenant({ ...formData, tenantId: editingTenant.tenantId });
        toast.success('租户更新成功');
      } else {
        await addTenant(formData);
        toast.success('租户创建成功');
      }

      handleCloseModal();
      await fetchTenants(query.keyword);
    } catch (submitError: any) {
      console.error(submitError);
      toast.error(submitError?.message || '保存租户失败');
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteTenant) {
      return;
    }

    try {
      await deleteTenant([pendingDeleteTenant.tenantId]);
      toast.success('租户删除成功');
      setPendingDeleteTenant(null);
      await fetchTenants(query.keyword);
    } catch (deleteError: any) {
      console.error(deleteError);
      toast.error(deleteError?.message || '删除租户失败');
    }
  };

  const handleToggleStatus = async (tenant: TenantView) => {
    const nextStatus = tenant.status === '0' ? '1' : '0';

    try {
      await changeTenantStatus({ tenantId: tenant.tenantId, status: nextStatus });
      toast.success(nextStatus === '0' ? '租户已启用' : '租户已停用');
      await fetchTenants(query.keyword);
    } catch (statusError: any) {
      console.error(statusError);
      toast.error(statusError?.message || '更新租户状态失败');
    }
  };

  const handleRefreshStorage = async (tenantId: number) => {
    setRefreshingTenantId(tenantId);

    try {
      await refreshTenantStorageUsage(tenantId);
      toast.success('存储使用量已刷新');
      await fetchTenants(query.keyword);
    } catch (refreshError: any) {
      console.error(refreshError);
      toast.error(refreshError?.message || '刷新存储使用量失败');
    } finally {
      setRefreshingTenantId(null);
    }
  };

  const summary = useMemo(() => {
    const warningTenants = allTenants.filter((tenant) => {
      const storagePercent = calcPercent(tenant.storageUsed, tenant.storageLimit);
      return tenant.expired || tenant.userLimitReached || storagePercent >= 80;
    }).length;

    const expiringSoonTenants = allTenants.filter((tenant) => {
      if (!tenant.expireTime || tenant.expired) return false;
      const time = new Date(tenant.expireTime).getTime();
      if (Number.isNaN(time)) return false;
      const diffDays = Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }).length;

    return {
      total: allTenants.length,
      active: allTenants.filter((tenant) => tenant.status === '0' && !tenant.expired).length,
      expiringSoon: expiringSoonTenants,
      warning: warningTenants,
    };
  }, [allTenants]);

  const pagedTenants = useMemo(() => {
    const start = (query.pageNum - 1) * query.pageSize;
    return allTenants.slice(start, start + query.pageSize);
  }, [allTenants, query.pageNum, query.pageSize]);

  const hasActiveFilters = Boolean(query.keyword);
  const isEdit = Boolean(editingTenant);

  return (
    <>
      <TablePageLayout
        className="gap-4"
        filters={
          <div className="flex flex-wrap items-start justify-between gap-3">
            <form
              onSubmit={handleSearch}
              className="flex flex-1 flex-wrap items-center gap-3"
            >
              <div className="relative w-full sm:w-60">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.keyword}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, keyword: event.target.value }))
                  }
                  placeholder="按租户名称搜索"
                  className="h-10 pl-10"
                />
              </div>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                  重置
                </Button>
              ) : null}
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
              <Button size="sm" onClick={() => handleOpenModal()}>
                <Plus size={15} />
                新增租户
              </Button>
            </div>
          </div>
        }
        table={
          <>
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow>
                  <TableHead>租户信息</TableHead>
                  <TableHead>联系方式</TableHead>
                  <TableHead>配额与容量</TableHead>
                  <TableHead>到期情况</TableHead>
                  <TableHead>状态</TableHead>
                  <TableActionHead className="w-40">操作</TableActionHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={6} title="正在加载租户列表..." loading />
                ) : error ? (
                  <TableStateRow colSpan={6} title="租户列表加载失败" description={error} />
                ) : pagedTenants.length === 0 ? (
                  <TableStateRow colSpan={6} title="暂无租户数据" />
                ) : (
                  pagedTenants.map((tenant) => {
                    const userPercent = calcPercent(tenant.userCount, tenant.userLimit);
                    const storagePercent = calcPercent(tenant.storageUsed, tenant.storageLimit);
                    const expireHint = getExpireHint(tenant.expireTime);
                    const hasRisk = tenant.expired || tenant.userLimitReached || storagePercent >= 80;

                    return (
                      <TableRow key={tenant.tenantId}>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                              <Building2 size={18} />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {tenant.tenantName}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                                  ID {tenant.tenantId}
                                </span>
                                {tenant.domain ? (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                                    {tenant.domain}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                          <div>{tenant.contactName || '-'}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {tenant.contactPhone || '-'}
                          </div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {tenant.contactEmail || '-'}
                          </div>
                        </TableCell>

                        <TableCell className="py-4">
                          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                                <Users size={14} />
                                {tenant.userCount} / {tenant.userLimit || 0} 用户
                              </span>
                              <span
                                className={cn(
                                  'rounded-full px-2.5 py-1 text-xs font-medium',
                                  getUsageBadgeClassName(userPercent, 100, 80),
                                )}
                              >
                                {userPercent.toFixed(0)}%
                              </span>
                              {tenant.userLimitReached ? (
                                <span className="text-xs text-rose-600 dark:text-rose-300">
                                  已达到上限
                                </span>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                                <HardDrive size={14} />
                                {formatStorage(tenant.storageUsed)} / {formatStorage(tenant.storageLimit)}
                              </span>
                              <span
                                className={cn(
                                  'rounded-full px-2.5 py-1 text-xs font-medium',
                                  getUsageBadgeClassName(storagePercent, 90, 70),
                                )}
                              >
                                {storagePercent.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                          <div className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                            <Calendar size={14} />
                            {formatDate(tenant.expireTime)}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-medium',
                                expireHint.toneClassName,
                              )}
                            >
                              {expireHint.text}
                            </span>
                            {hasRisk ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                                需关注
                              </span>
                            ) : null}
                          </div>
                        </TableCell>

                        <TableCell className="py-4">
                          <div className="flex flex-wrap gap-2">
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-medium',
                                getStatusClassName(tenant.status),
                              )}
                            >
                              {tenant.status === '0' ? '正常' : '停用'}
                            </span>
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-medium',
                                tenant.expired
                                  ? 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200'
                                  : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300',
                              )}
                            >
                              {tenant.expired ? '已过期' : '未过期'}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <TableRowActions
                            align="end"
                            iconOnly
                            actions={[
                              {
                                label: '编辑租户',
                                icon: <Edit size={15} />,
                                onClick: () => handleOpenModal(tenant),
                                tone: 'neutral',
                              },
                              {
                                label: tenant.status === '0' ? '停用租户' : '启用租户',
                                icon: tenant.status === '0' ? <PowerOff size={15} /> : <Power size={15} />,
                                onClick: () => void handleToggleStatus(tenant),
                                tone: 'neutral',
                              },
                              {
                                label: '刷新存储',
                                icon: (
                                  <RefreshCw
                                    size={15}
                                    className={cn(refreshingTenantId === tenant.tenantId && 'animate-spin')}
                                  />
                                ),
                                onClick: () => void handleRefreshStorage(tenant.tenantId),
                                disabled: refreshingTenantId === tenant.tenantId,
                                tone: 'neutral',
                              },
                              {
                                label: '删除租户',
                                icon: <Trash2 size={15} />,
                                onClick: () => setPendingDeleteTenant(tenant),
                                tone: 'danger',
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </>
        }
        pagination={
          summary.total > 0 ? (
            <Pagination
              total={summary.total}
              page={query.pageNum}
              pageSize={query.pageSize}
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
        }
      />

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑租户' : '新增租户'}
        onClose={handleCloseModal}
        maxWidthClassName="max-w-3xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button type="submit" form="tenant-form">
              {isEdit ? '保存修改' : '创建租户'}
            </Button>
          </div>
        }
      >
        <form id="tenant-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>
                租户名称 <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.tenantName}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, tenantName: event.target.value }))
                }
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>联系人</label>
              <Input
                value={formData.contactName}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, contactName: event.target.value }))
                }
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>联系电话</label>
              <Input
                value={formData.contactPhone}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, contactPhone: event.target.value }))
                }
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>联系邮箱</label>
              <Input
                type="email"
                value={formData.contactEmail}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, contactEmail: event.target.value }))
                }
              />
            </div>

            <div className="md:col-span-2">
              <label className={fieldLabelClassName}>域名</label>
              <Input
                value={formData.domain}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, domain: event.target.value }))
                }
                placeholder="example.com"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>用户数量限制</label>
              <Input
                type="number"
                min="1"
                value={formData.userLimit}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    userLimit: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>存储空间限制 (MB)</label>
              <Input
                type="number"
                min="1"
                value={formData.storageLimit}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    storageLimit: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>到期时间</label>
              <Input
                type="date"
                value={formData.expireTime}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, expireTime: event.target.value }))
                }
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>状态</label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((current) => ({ ...current, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">正常</SelectItem>
                  <SelectItem value="1">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>备注</label>
            <Textarea
              rows={4}
              className="resize-none"
              value={formData.remark}
              onChange={(event) =>
                setFormData((current) => ({ ...current, remark: event.target.value }))
              }
            />
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDeleteTenant)}
        title="确认删除租户"
        message={
          pendingDeleteTenant
            ? `确定要删除租户“${pendingDeleteTenant.tenantName}”吗？删除后无法恢复。`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger={true}
        onCancel={() => setPendingDeleteTenant(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export default TenantList;
