import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import {
  Building2,
  Calendar,
  Edit,
  Eye,
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
import { BaseDialog, ConfirmDialog, DetailDialog, Pagination, PermissionGuard } from '@/components/common';
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
  Textarea,
} from '@/components/common';
import {
  addTenant,
  changeTenantStatus,
  deleteTenant,
  getTenantPage,
  getTenantStatisticsBatch,
  refreshTenantStorageUsage,
  updateTenant,
  type SysTenant,
  type TenantStatistics,
  type TenantStatisticsItem,
  type TenantSave,
} from '../../services/api/tenant';
import type { TenantPackageSelection } from '@/services/api/tenantPackage';
import { platformHttpStatus } from '@/services/api/platformAccess';
import { getAuthToken } from '@/utils/authStorage';
import { getErrorMessage } from '@/utils/errorMessage';
import { PlatformOperationGate } from './_components/PlatformOperationGate';
import { TenantPackageAssignment } from './_components/TenantPackageAssignment';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import './TenantList.css';
import './tenant-package.css';

interface TenantView extends SysTenant, TenantStatistics {
  tenantId: number;
  status: string;
}

interface TenantFormData {
  tenantCode: string;
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

const fieldLabelClassName = 'input-label';

const DEFAULT_TENANT_STATS: TenantStatistics = {
  expired: false,
  disabled: false,
  userLimitReached: false,
  userCount: 0,
};

const DEFAULT_FORM_DATA: TenantFormData = {
  tenantCode: '',
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
        'border border-slate-200 bg-[var(--cf-surface-muted)] text-cf-muted dark:border-slate-700 dark:bg-slate-900/70',
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

  return 'border border-slate-200 bg-[var(--cf-surface-muted)] text-cf-muted dark:border-slate-700 dark:bg-slate-900/70';
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

const TenantWorkspace: React.FC<{ invalidate: () => void }> = ({ invalidate }) => {
  const [allTenants, setAllTenants] = useState<TenantView[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TenantFilters>({ keyword: '' });
  const [query, setQuery] = useState<TenantQuery>({
    keyword: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantView | null>(null);
  const [pendingDeleteTenant, setPendingDeleteTenant] = useState<TenantView | null>(null);
  const [detailTenant, setDetailTenant] = useState<TenantView | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(DEFAULT_FORM_DATA);
  const [refreshingTenantId, setRefreshingTenantId] = useState<number | null>(null);
  const [selectingPackage, setSelectingPackage] = useState(false);
  const [packageSelection, setPackageSelection] = useState<TenantPackageSelection>();
  const [packageReady, setPackageReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const active = useRef(true);
  const token = useRef(getAuthToken());
  const mutation = useRef(false);
  const fetchSequence = useRef(0);
  const current = () => active.current && token.current === getAuthToken();
  const assignmentChanged = useCallback((selection: TenantPackageSelection | undefined, ready: boolean) => { setPackageSelection(selection); setPackageReady(ready); }, []);
  const fail = (failure: unknown, fallback: string) => {
    if (!current()) return;
    if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) invalidate();
    else toast.error(getErrorMessage(failure, fallback));
  };
  useEffect(() => { active.current = true; return () => { active.current = false; fetchSequence.current++; }; }, []);

  const fetchTenants = async (keyword: string) => {
    const sequence = ++fetchSequence.current;
    setLoading(true);
    setError(null);

    try {
      const response = await getTenantPage({ current: query.pageNum, size: query.pageSize, tenantName: keyword || undefined });
      if (!current() || sequence !== fetchSequence.current) return;
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
          if ([401, 403].includes(platformHttpStatus(statisticsError) ?? 0)) { if (current()) invalidate(); return; }
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

      if (current() && sequence === fetchSequence.current) { setAllTenants(enrichedTenants); setTotalCount(response.total); }
    } catch (fetchError) {
      if (!current() || sequence !== fetchSequence.current) return;
      console.error(fetchError);
      const message = '加载租户失败，请稍后重试';
      setError(message);
      setAllTenants([]);
      setTotalCount(0);
      fail(fetchError, message);
    } finally {
      if (current() && sequence === fetchSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTenants(query.keyword);
  }, [query.keyword, query.pageNum, query.pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    if (query.pageNum > totalPages) {
      setQuery((current) => ({ ...current, pageNum: totalPages }));
    }
  }, [totalCount, query.pageNum, query.pageSize]);

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
    if (mutation.current) return;
    setUncertain(false); setSelectingPackage(!tenant); setPackageSelection(undefined); setPackageReady(false);
    if (tenant) {
      setEditingTenant(tenant);
      setFormData({
        tenantCode: tenant.tenantCode || '',
        tenantName: tenant.tenantName || '',
        contactName: tenant.contactName || '',
        contactPhone: tenant.contactPhone || '',
        contactEmail: tenant.contactEmail || '',
        domain: tenant.domain || '',
        status: tenant.status || '0',
        expireTime: tenant.expireTime?.slice(0, 10) ?? '',
        userLimit: tenant.userLimit ?? 100,
        storageLimit: tenant.storageLimit ?? 10240,
        remark: tenant.remark || '',
      });
    } else {
      setEditingTenant(null);
      setFormData(DEFAULT_FORM_DATA);
    }

    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (mutation.current) return;
    setIsModalOpen(false);
    setEditingTenant(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mutation.current || uncertain || !current()) return;
    if (selectingPackage && (!packageSelection || !packageReady)) { toast.error('请明确选择有效套餐并处理覆盖冲突'); return; }
    if (editingTenant && !Number.isInteger(editingTenant.version)) { toast.error('租户版本缺失，请关闭并刷新后重试'); return; }

    if (!formData.tenantName.trim()) {
      toast.error('请输入租户名称');
      return;
    }

    if (!formData.tenantCode.trim()) {
      toast.error('请输入租户编码');
      return;
    }

    mutation.current = true; setSaving(true);
    try {
      const payload: TenantSave = {
        tenantCode: formData.tenantCode.trim(),
        tenantName: formData.tenantName.trim(),
        contactName: formData.contactName,
        contactPhone: formData.contactPhone,
        contactEmail: formData.contactEmail,
        domain: formData.domain,
        status: formData.status,
        remark: formData.remark,
        expireTime: formData.expireTime && formData.expireTime !== editingTenant?.expireTime?.slice(0, 10) ? `${formData.expireTime} 00:00:00` : undefined,
        ...(selectingPackage ? { packageSelection } : !editingTenant?.packageId ? { userLimit: formData.userLimit, storageLimit: formData.storageLimit } : {}),
      };
      if (editingTenant) {
        await updateTenant({ ...payload, tenantId: editingTenant.tenantId, version: editingTenant.version });
        if (current()) toast.success('租户更新成功');
      } else {
        await addTenant(payload);
        if (current()) toast.success('租户创建成功');
      }

      if (!current()) return;
      setIsModalOpen(false); setEditingTenant(null);
      await fetchTenants(query.keyword);
    } catch (submitError) {
      if (!current()) return;
      const status = platformHttpStatus(submitError);
      setUncertain(status == null || status >= 500 || status === 409);
      fail(submitError, '保存结果未确认，请关闭并刷新核对后再操作');
    } finally { mutation.current = false; if (current()) setSaving(false); }
  };

  const handleDelete = async () => {
    if (!pendingDeleteTenant || mutation.current || !current()) {
      return;
    }

    mutation.current = true; setSaving(true);
    try {
      await deleteTenant([pendingDeleteTenant.tenantId]);
      if (!current()) return;
      toast.success('租户删除成功');
      setPendingDeleteTenant(null);
      await fetchTenants(query.keyword);
    } catch (deleteError) { if (current()) { setPendingDeleteTenant(null); fail(deleteError, '删除结果未确认，请刷新核对'); await fetchTenants(query.keyword); } }
    finally { mutation.current = false; if (current()) setSaving(false); }
  };

  const handleToggleStatus = async (tenant: TenantView) => {
    if (mutation.current || !current()) return;
    const nextStatus = tenant.status === '0' ? '1' : '0';

    mutation.current = true; setSaving(true);
    try {
      await changeTenantStatus({ tenantId: tenant.tenantId, status: nextStatus });
      if (!current()) return;
      toast.success(nextStatus === '0' ? '租户已启用' : '租户已停用');
      await fetchTenants(query.keyword);
    } catch (statusError) { if (current()) { fail(statusError, '状态修改结果未确认，请刷新核对'); await fetchTenants(query.keyword); } }
    finally { mutation.current = false; if (current()) setSaving(false); }
  };

  const handleRefreshStorage = async (tenantId: number) => {
    if (mutation.current || !current()) return;
    mutation.current = true; setSaving(true);
    setRefreshingTenantId(tenantId);

    try {
      await refreshTenantStorageUsage(tenantId);
      if (!current()) return;
      toast.success('存储使用量已刷新');
      await fetchTenants(query.keyword);
    } catch (refreshError) {
      fail(refreshError, '刷新存储使用量失败');
    } finally {
      mutation.current = false;
      if (current()) { setRefreshingTenantId(null); setSaving(false); }
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
      total: totalCount,
      active: allTenants.filter((tenant) => tenant.status === '0' && !tenant.expired).length,
      expiringSoon: expiringSoonTenants,
      warning: warningTenants,
    };
  }, [allTenants, totalCount]);

  const pagedTenants = allTenants;

  const hasActiveFilters = Boolean(query.keyword);
  const isEdit = Boolean(editingTenant);
  const stats = useMemo(
    () => [
      {
        label: '总租户',
        value: String(summary.total),
        meta: `当前页 ${pagedTenants.length}`,
        icon: <Building2 size={18} />,
        tone: 'blue',
      },
      {
        label: '本页有效租户',
        value: String(summary.active),
        meta: '可正常使用',
        icon: <Power size={18} />,
        tone: 'green',
      },
      {
        label: '本页即将到期',
        value: String(summary.expiringSoon),
        meta: '30 天内',
        icon: <Calendar size={18} />,
        tone: 'amber',
      },
      {
        label: '本页风险租户',
        value: String(summary.warning),
        meta: '配额或有效期异常',
        icon: <HardDrive size={18} />,
        tone: 'violet',
      },
    ],
    [pagedTenants.length, summary.active, summary.expiringSoon, summary.total, summary.warning],
  );

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">TENANT MANAGEMENT</p>
          <h2>租户管理</h2>
          <span>管理租户信息、配额容量、到期状态和启停操作</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <PermissionGuard permissions={['system:tenant:add']} hidden><Button size="sm" onClick={() => handleOpenModal()}>
            <Plus size={16} />
            新增租户
          </Button></PermissionGuard>
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
      <form
        onSubmit={handleSearch}
        className="admin-users-filter-grid admin-tenants-filter-grid"
      >
        <label className="admin-source-search">
          <span className={fieldLabelClassName}>搜索租户</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.keyword}
              onChange={(event) =>
                setFilters((current) => ({ ...current, keyword: event.target.value }))
              }
              placeholder="租户名称、编码或域名"
              type="search"
            />
          </div>
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">当前 {summary.total} 项</span>
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
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-tenants-table-panel">
      <table className="unity-data-table admin-source-table admin-tenants-table">
          <thead>
            <tr>
              <th>租户信息</th>
              <th>联系方式</th>
              <th>配额与容量</th>
              <th>到期情况</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
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
                  <tr key={tenant.tenantId}>
                    <td>
                      <div className="admin-tenants-identity">
                        <div className="admin-tenants-icon">
                          <Building2 size={18} />
                        </div>
                        <div>
                          <strong>{tenant.tenantName}</strong>
                          <div className="admin-tenants-chip-row">
                            {tenant.tenantCode ? (
                              <span className="admin-source-chip">
                                {tenant.tenantCode}
                              </span>
                            ) : null}
                            <span className="admin-source-chip">
                              ID {tenant.tenantId}
                            </span>
                            {tenant.domain ? (
                              <span className="admin-source-chip">
                                {tenant.domain}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="admin-tenants-contact">
                        <strong>{tenant.contactName || '-'}</strong>
                        <span>{tenant.contactPhone || '-'}</span>
                        <small>{tenant.contactEmail || '-'}</small>
                      </div>
                    </td>

                    <td>
                      <div className="admin-tenants-quota">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            <Users size={14} />
                            {tenant.userCount} / {tenant.userLimit || 0} 用户
                          </span>
                          <span
                            className={cn(
                              'rounded-md px-2.5 py-1 text-xs font-medium',
                              getUsageBadgeClassName(userPercent, 100, 80),
                            )}
                          >
                            {userPercent.toFixed(0)}%
                          </span>
                          {tenant.userLimitReached ? (
                            <span className="text-xs text-rose-600 dark:text-rose-300">
                              {(tenant.userLimit ?? 0) > 0 && tenant.userCount > (tenant.userLimit ?? 0) ? '已超额，禁止新增用户' : '已达到上限，禁止新增用户'}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            <HardDrive size={14} />
                            {formatStorage(tenant.storageUsed)} / {formatStorage(tenant.storageLimit)}
                          </span>
                          <span
                            className={cn(
                              'rounded-md px-2.5 py-1 text-xs font-medium',
                              getUsageBadgeClassName(storagePercent, 90, 70),
                            )}
                          >
                            {storagePercent.toFixed(0)}%
                          </span>
                          {(tenant.storageLimit ?? 0) > 0 && (tenant.storageUsed ?? 0) > (tenant.storageLimit ?? 0) && (
                            <span className="text-xs text-rose-600 dark:text-rose-300">已超额，禁止新增文件</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="admin-tenants-expire">
                        <Calendar size={14} />
                        {formatDate(tenant.expireTime)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium',
                            expireHint.toneClassName,
                          )}
                        >
                          {expireHint.text}
                        </span>
                        {hasRisk ? (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                            需关注
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td>
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium',
                            getStatusClassName(tenant.status),
                          )}
                        >
                          {tenant.status === '0' ? '正常' : '停用'}
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium',
                            tenant.expired
                              ? 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200'
                              : 'border border-slate-200 bg-[var(--cf-surface-muted)] text-cf-muted dark:border-slate-700 dark:bg-slate-900/70',
                          )}
                        >
                          {tenant.expired ? '已过期' : '未过期'}
                        </span>
                      </div>
                    </td>

                    <td className="text-right">
                      <div className="admin-users-row-actions">
                        <PermissionGuard permissions={['system:tenant:query']} hidden><button type="button" data-tooltip="查看详情" aria-label="查看详情" onClick={() => setDetailTenant(tenant)}>
                          <Eye size={15} />
                        </button></PermissionGuard>
                        <PermissionGuard permissions={['system:tenant:edit']} hidden><button type="button" disabled={saving} data-tooltip="编辑租户" aria-label="编辑租户" onClick={() => handleOpenModal(tenant)}>
                          <Edit size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          data-tooltip={tenant.status === '0' ? '停用租户' : '启用租户'} aria-label={tenant.status === '0' ? '停用租户' : '启用租户'}
                          onClick={() => void handleToggleStatus(tenant)}
                        >
                          {tenant.status === '0' ? <PowerOff size={15} /> : <Power size={15} />}
                        </button>
                        <button
                          type="button"
                          data-tooltip="刷新存储" aria-label="刷新存储"
                          onClick={() => void handleRefreshStorage(tenant.tenantId)}
                          disabled={saving || refreshingTenantId === tenant.tenantId}
                        >
                          <RefreshCw
                            size={15}
                            className={cn(refreshingTenantId === tenant.tenantId && 'animate-spin')}
                          />
                        </button></PermissionGuard>
                        <PermissionGuard permissions={['system:tenant:remove']} hidden><button
                          type="button"
                          disabled={saving}
                          className="danger"
                          data-tooltip="删除租户" aria-label="删除租户"
                          onClick={() => setPendingDeleteTenant(tenant)}
                        >
                          <Trash2 size={15} />
                        </button></PermissionGuard>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = summary.total > 0 ? (
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
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-tenants-page tenant-package-workspace">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑租户' : '新增租户'}
        onClose={handleCloseModal}
        maxWidthClassName="max-w-3xl"
        panelClassName="tenant-package-dialog"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" disabled={saving} onClick={handleCloseModal}>
              取消
            </Button>
            <Button type="submit" form="tenant-form" disabled={saving || uncertain || selectingPackage && !packageReady}>
              {isEdit ? '保存修改' : '创建租户'}
            </Button>
          </div>
        }
      >
        <form id="tenant-form" onSubmit={handleSubmit} className="admin-source-form-grid">
          <fieldset disabled={saving || uncertain} className="contents">
            <label>
              <span className={fieldLabelClassName}>
                租户编码 <span className="text-red-500">*</span>
              </span>
              <Input
                value={formData.tenantCode}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, tenantCode: event.target.value }))
                }
                placeholder="xinyuan"
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>
                租户名称 <span className="text-red-500">*</span>
              </span>
              <Input
                value={formData.tenantName}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, tenantName: event.target.value }))
                }
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>联系人</span>
              <Input
                value={formData.contactName}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, contactName: event.target.value }))
                }
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>联系电话</span>
              <Input
                value={formData.contactPhone}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, contactPhone: event.target.value }))
                }
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>联系邮箱</span>
              <Input
                type="email"
                value={formData.contactEmail}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, contactEmail: event.target.value }))
                }
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>域名</span>
              <Input
                value={formData.domain}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, domain: event.target.value }))
                }
                placeholder="example.com"
              />
            </label>

            {!selectingPackage && !editingTenant?.packageId && <label>
              <span className={fieldLabelClassName}>用户数量限制</span>
              <Input
                type="number"
                min="0"
                value={formData.userLimit}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    userLimit: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
              />
            </label>}

            {!selectingPackage && !editingTenant?.packageId && <label>
              <span className={fieldLabelClassName}>存储空间限制 (MB)</span>
              <Input
                type="number"
                min="0"
                value={formData.storageLimit}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    storageLimit: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
              />
            </label>}

            <label>
              <span className={fieldLabelClassName}>到期时间</span>
              <DatePicker
                type="date"
                value={formData.expireTime}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, expireTime: event.target.value }))
                }
                placeholder="选择到期日期"
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>状态</span>
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
            </label>

          <div className="admin-source-form-wide">
            <span className={fieldLabelClassName}>备注</span>
            <Textarea
              rows={4}
              className="resize-none"
              value={formData.remark}
              onChange={(event) =>
                setFormData((current) => ({ ...current, remark: event.target.value }))
              }
            />
          </div>
          <div className="admin-source-form-wide space-y-4">
            {editingTenant && <>
              <p className="text-sm">{editingTenant.packageId ? `现有套餐${editingTenant.packageId}，已应用版本${editingTenant.packageVersion}；当前上限${editingTenant.userLimit}人 / ${editingTenant.storageLimit} MB。` : '此租户尚未分配套餐，保留原授权；旧额度0表示不限。'}</p>
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={selectingPackage} onChange={event => { setSelectingPackage(event.target.checked); setPackageSelection(undefined); setPackageReady(false); }} />明确改选套餐或调整个别覆盖</label>
              {!selectingPackage && <p className="text-sm text-cf-muted">保存资料将保留原套餐、已应用版本、覆盖及有效功能，不自动应用最新模板。</p>}
            </>}
            {selectingPackage && <PermissionGuard permissions={['system:tenant-package:list']} fallback={<p role="alert">选择套餐需要套餐列表权限，当前无法保存本次分配。</p>}><TenantPackageAssignment originalOverride={editingTenant?.packageOverride} disabled={saving || uncertain} onChange={assignmentChanged} invalidate={invalidate} /></PermissionGuard>}
            {uncertain && <p role="alert">保存结果或版本未确认，请关闭并刷新核对，勿重复提交。</p>}
          </div>
          </fieldset>
        </form>
      </BaseDialog>

      <DetailDialog
        open={Boolean(detailTenant)}
        title="租户详情"
        onClose={() => setDetailTenant(null)}
        heading={detailTenant?.tenantName}
        subheading={detailTenant?.tenantCode}
        headingAside={detailTenant ? (
          <span className="text-xs text-cf-subtle">{detailTenant.status === '0' ? '正常' : '停用'}</span>
        ) : undefined}
        sections={detailTenant ? [
          {
            title: '租户信息',
            items: [
              { label: '租户名称', value: detailTenant.tenantName },
              { label: '租户编码', value: detailTenant.tenantCode },
              { label: '公司名称', value: detailTenant.companyName },
              { label: '联系人', value: detailTenant.contactName },
              { label: '联系电话', value: detailTenant.contactPhone },
              { label: '联系邮箱', value: detailTenant.contactEmail },
              { label: '域名', value: detailTenant.domain },
              { label: '到期时间', value: detailTenant.expireTime },
              { label: '账号上限', value: detailTenant.accountCount == null ? '' : String(detailTenant.accountCount) },
              { label: '用户上限', value: detailTenant.userLimit == null ? '' : String(detailTenant.userLimit) },
              { label: '存储上限', value: detailTenant.storageLimit == null ? '' : String(detailTenant.storageLimit) },
              { label: '已用存储', value: detailTenant.storageUsed == null ? '' : String(detailTenant.storageUsed) },
              { label: '状态', value: detailTenant.status === '0' ? '正常' : '停用' },
              { label: '地址', value: detailTenant.address, wide: true },
              { label: '备注', value: detailTenant.remark, wide: true },
              { label: '创建时间', value: detailTenant.createTime },
            ],
          },
        ] : []}
      />
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
        onCancel={() => { if (!mutation.current) setPendingDeleteTenant(null); }}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export const TenantList: React.FC = () => <div className="space-y-5"><PlatformOperationGate permission="system:tenant:list">{invalidate => <TenantWorkspace invalidate={invalidate} />}</PlatformOperationGate></div>;

export default TenantList;
