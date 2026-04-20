import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Clock3,
  Edit,
  HardDrive,
  Loader2,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
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
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/common';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';
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

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';
const sectionPanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';
const nestedPanelClassName =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/78';
const fieldLabelClassName =
  'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

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
  if (response && Array.isArray(response.records)) {
    return response.records;
  }
  if (Array.isArray(response)) {
    return response;
  }
  if (response && Array.isArray(response.rows)) {
    return response.rows;
  }
  return [];
};

const isTenantExpiredByDate = (expireTime?: string): boolean => {
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

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

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
  if (!limit || limit <= 0) return 0;
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

const getProgressTone = (percent: number, high: number, medium: number) => {
  if (percent >= high) {
    return {
      bar: 'bg-rose-500',
      text: 'text-rose-600 dark:text-rose-300',
    };
  }

  if (percent >= medium) {
    return {
      bar: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-300',
    };
  }

  return {
    bar: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-300',
  };
};

export const TenantList: React.FC = () => {
  const [tenants, setTenants] = useState<TenantView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [queryTerm, setQueryTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantView | null>(null);
  const [pendingDeleteTenant, setPendingDeleteTenant] = useState<TenantView | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(DEFAULT_FORM_DATA);
  const [refreshingTenantId, setRefreshingTenantId] = useState<number | null>(null);

  useEffect(() => {
    void fetchTenants(queryTerm);
  }, [queryTerm]);

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

      // 统一先补齐统计信息，再进入表格和风险摘要，避免每个渲染分支自己兜底。
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

      setTenants(enrichedTenants);
    } catch (err) {
      console.error(err);
      const message = '加载租户失败，请稍后重试';
      setError(message);
      toast.error(message);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    // 搜索输入态和已应用查询态分离，避免边输入边请求打断工作台操作。
    setQueryTerm(searchInput.trim());
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setQueryTerm('');
  };

  const handleRefresh = () => {
    void fetchTenants(queryTerm);
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

      setIsModalOpen(false);
      await fetchTenants(queryTerm);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || '保存租户失败');
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
      await fetchTenants(queryTerm);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || '删除租户失败');
    }
  };

  const handleToggleStatus = async (tenant: TenantView) => {
    const nextStatus = tenant.status === '0' ? '1' : '0';
    try {
      await changeTenantStatus({ tenantId: tenant.tenantId, status: nextStatus });
      toast.success(nextStatus === '0' ? '租户已启用' : '租户已停用');
      await fetchTenants(queryTerm);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || '更新租户状态失败');
    }
  };

  const handleRefreshStorage = async (tenantId: number) => {
    setRefreshingTenantId(tenantId);
    try {
      await refreshTenantStorageUsage(tenantId);
      toast.success('存储使用量已刷新');
      await fetchTenants(queryTerm);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || '刷新存储使用量失败');
    } finally {
      setRefreshingTenantId(null);
    }
  };

  const summary = useMemo(() => {
    const warningTenants = tenants.filter((tenant) => {
      const storagePercent = calcPercent(tenant.storageUsed, tenant.storageLimit);
      return tenant.expired || tenant.userLimitReached || storagePercent >= 80;
    }).length;

    const expiringSoonTenants = tenants.filter((tenant) => {
      if (!tenant.expireTime || tenant.expired) return false;
      const time = new Date(tenant.expireTime).getTime();
      if (Number.isNaN(time)) return false;
      const diffDays = Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }).length;

    return {
      total: tenants.length,
      active: tenants.filter((tenant) => tenant.status === '0' && !tenant.expired).length,
      expiringSoon: expiringSoonTenants,
      warning: warningTenants,
    };
  }, [tenants]);

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasActiveFilters = Boolean(queryTerm.trim());
  const isEdit = Boolean(editingTenant);
  const currentKeywordLabel = queryTerm || '未设置';

  const overviewItems = [
    { label: '租户总数', value: `${summary.total} 个` },
    { label: '正常运行', value: `${summary.active} 个` },
    { label: '30天内到期', value: `${summary.expiringSoon} 个` },
    { label: '重点关注', value: `${summary.warning} 个` },
  ];
  const heroMetrics = [
    {
      label: '租户总数',
      value: `${summary.total}`,
      hint: '当前已接入的租户数量',
      icon: <Building2 size={17} />,
    },
    {
      label: '正常运行',
      value: `${summary.active}`,
      hint: '未停用且未过期',
      icon: <ShieldCheck size={17} />,
    },
    {
      label: '即将到期',
      value: `${summary.expiringSoon}`,
      hint: '30 天内需要续费或处理',
      icon: <Clock3 size={17} />,
    },
    {
      label: '风险租户',
      value: `${summary.warning}`,
      hint: '配额、容量或有效期存在风险',
      icon: <AlertTriangle size={17} />,
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
                <Building2 size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          )}
          title="租户管理"
          description="租户页的信息密度很高，所以这次重点统一信息卡、搜索台、结果表和弹窗表单的层级，让它和业务申请页属于同一套产品。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新数据
              </Button>
              <Button size="lg" onClick={() => handleOpenModal()}>
                <Plus size={15} />
                新增租户
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 租户工作台
            </span>
            <span className={surfaceChipClassName}>关键词：{currentKeywordLabel}</span>
            <span className={surfaceChipClassName}>风险租户 {summary.warning} 个</span>
            <span className={surfaceChipClassName}>支持实时刷新租户存储统计</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="租户筛选"
          title="租户工作台"
          total={tenants.length}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={(
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>正常运行 {summary.active} 个</span>
              <span className={surfaceChipClassName}>即将到期 {summary.expiringSoon} 个</span>
              <span className={surfaceChipClassName}>重点关注 {summary.warning} 个</span>
            </div>
          )}
          quickFilterAside={(
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                  清空筛选
                </Button>
              ) : (
                <span className={surfaceChipClassName}>当前显示全部租户</span>
              )}
            </div>
          )}
          filterBar={(
            <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="按租户名称搜索"
                  className="pl-10"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
              </div>
              <Button type="submit" className="xl:min-w-[120px]">
                <Search size={15} />
                搜索租户
              </Button>
              <Button type="button" variant="outline" className="xl:min-w-[120px]" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
            </form>
          )}
        />

        <WorkspaceResultCard
          total={tenants.length}
          title="当前租户"
          description="统一展示租户信息、配额、容量和到期状态，避免系统页与业务页产生割裂感。"
        >
          <div className="space-y-4 px-4 py-4">
            {!loading && !error && tenants.length > 0 ? (
              <div className={subtlePanelClassName}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">租户结果概况</div>
                    <div className="flex flex-wrap gap-2">
                      <span className={surfaceChipClassName}>当前结果 {tenants.length} 个</span>
                      <span className={surfaceChipClassName}>正常运行 {summary.active} 个</span>
                      <span className={surfaceChipClassName}>即将到期 {summary.expiringSoon} 个</span>
                      <span className={surfaceChipClassName}>重点关注 {summary.warning} 个</span>
                    </div>
                    <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                      表格、状态标签、容量进度条和编辑弹层统一回到同一套 System 标准 CRUD 语法，后续租户相关页面都沿用这一层级。
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <Table className="min-w-[1260px]">
              <TableHeader>
                <tr>
                  <TableHead>租户信息</TableHead>
                  <TableHead>联系方式</TableHead>
                  <TableHead>用户配额</TableHead>
                  <TableHead>存储使用</TableHead>
                  <TableHead>到期情况</TableHead>
                  <TableHead>状态</TableHead>
                  <TableActionHead className="w-80">操作</TableActionHead>
                </tr>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载租户数据..." />
                ) : error ? (
                  <WorkspaceTableStateRow
                    colSpan={7}
                    title="租户数据加载失败"
                    description={error}
                  />
                ) : tenants.length === 0 ? (
                  <WorkspaceTableStateRow
                    colSpan={7}
                    title="暂无租户数据"
                    description="可以先创建租户，再逐步维护配额、域名和有效期。"
                  />
                ) : (
                  tenants.map((tenant) => {
                    const userPercent = calcPercent(tenant.userCount, tenant.userLimit);
                    const storagePercent = calcPercent(tenant.storageUsed, tenant.storageLimit);
                    const expireHint = getExpireHint(tenant.expireTime);
                    const userTone = getProgressTone(userPercent, 100, 80);
                    const storageTone = getProgressTone(storagePercent, 90, 70);
                    const hasRisk = tenant.expired || tenant.userLimitReached || storagePercent >= 80;

                    return (
                      <TableRow key={tenant.tenantId}>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                              <Building2 size={18} />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {tenant.tenantName}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <span className={surfaceChipClassName}>ID: {tenant.tenantId}</span>
                                {tenant.domain ? <span className={surfaceChipClassName}>{tenant.domain}</span> : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                          <div>{tenant.contactName || '-'}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{tenant.contactPhone || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{tenant.contactEmail || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
                            <Users size={14} />
                            <span>{tenant.userCount} / {tenant.userLimit || 0} 用户</span>
                          </div>
                          <div className="mt-2 w-44">
                            <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span>占用率</span>
                              <span className={userTone.text}>{userPercent.toFixed(0)}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                              <div
                                className={cn('h-2 rounded-full transition-all', userTone.bar)}
                                style={{ width: `${userPercent}%` }}
                              />
                            </div>
                          </div>
                          <div className={cn('mt-2 text-xs', tenant.userLimitReached ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400')}>
                            {tenant.userLimitReached ? '已达到用户上限' : '用户配额正常'}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
                            <HardDrive size={14} />
                            <span>{formatStorage(tenant.storageUsed)} / {formatStorage(tenant.storageLimit)}</span>
                          </div>
                          <div className="mt-2 w-44">
                            <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span>占用率</span>
                              <span className={storageTone.text}>{storagePercent.toFixed(0)}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                              <div
                                className={cn('h-2 rounded-full transition-all', storageTone.bar)}
                                style={{ width: `${storagePercent}%` }}
                              />
                            </div>
                          </div>
                          <div className={cn('mt-2 text-xs', storagePercent >= 80 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400')}>
                            {storagePercent >= 80 ? '存储容量进入关注区' : '存储容量正常'}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
                            <Calendar size={14} />
                            <span>{formatDate(tenant.expireTime)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', expireHint.toneClassName)}>
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
                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getStatusClassName(tenant.status))}>
                              {tenant.status === '0' ? '正常' : '停用'}
                            </span>
                            <span className={cn(
                              'rounded-full px-2.5 py-1 text-xs font-medium',
                              tenant.expired
                                ? 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200'
                                : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300',
                            )}>
                              {tenant.expired ? '已过期' : '未过期'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-right whitespace-nowrap">
                          <TableRowActions
                            align="end"
                            wrap={true}
                            className="max-w-[300px]"
                            actions={[
                              {
                                label: '编辑',
                                icon: <Edit size={14} />,
                                onClick: () => handleOpenModal(tenant),
                                tone: 'primary',
                              },
                              {
                                label: tenant.status === '0' ? '停用' : '启用',
                                icon: tenant.status === '0' ? <PowerOff size={14} /> : <Power size={14} />,
                                onClick: () => void handleToggleStatus(tenant),
                                tone: tenant.status === '0' ? 'warning' : 'success',
                              },
                              {
                                label: '刷新存储',
                                icon:
                                  refreshingTenantId === tenant.tenantId ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <RefreshCw size={14} />
                                  ),
                                onClick: () => void handleRefreshStorage(tenant.tenantId),
                                tone: 'neutral',
                                disabled: refreshingTenantId === tenant.tenantId,
                              },
                              {
                                label: '删除',
                                icon: <Trash2 size={14} />,
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
          </div>
        </WorkspaceResultCard>

        {isModalOpen ? (
          <WorkspaceDialogShell
            title={isEdit ? '编辑租户' : '新增租户'}
            description="按统一的业务工作台表单结构填写基础资料、配额限制和有效期。"
            onClose={() => setIsModalOpen(false)}
            maxWidthClassName="max-w-4xl"
            headerAside={(
              <div className="flex flex-wrap gap-2">
                <span className={surfaceChipClassName}>{isEdit ? '编辑模式' : '新增模式'}</span>
                <span className={surfaceChipClassName}>状态：{formData.status === '0' ? '正常' : '停用'}</span>
              </div>
            )}
            bodyClassName="space-y-6"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">基础资料</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">先确认租户名称、联系人和域名信息，便于后续统一检索和联络。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClassName}>
                      租户名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.tenantName}
                      onChange={(event) => setFormData({ ...formData, tenantName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>联系人</label>
                    <Input
                      value={formData.contactName}
                      onChange={(event) => setFormData({ ...formData, contactName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>联系电话</label>
                    <Input
                      value={formData.contactPhone}
                      onChange={(event) => setFormData({ ...formData, contactPhone: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>联系邮箱</label>
                    <Input
                      type="email"
                      value={formData.contactEmail}
                      onChange={(event) => setFormData({ ...formData, contactEmail: event.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={fieldLabelClassName}>域名</label>
                    <Input
                      value={formData.domain}
                      onChange={(event) => setFormData({ ...formData, domain: event.target.value })}
                      placeholder="example.com"
                    />
                  </div>
                </div>
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">配额与有效期</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">集中管理用户上限、存储容量、到期时间和状态，方便运维排查风险租户。</div>
                </div>
                <div className={nestedPanelClassName}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={fieldLabelClassName}>用户数量限制</label>
                      <Input
                        type="number"
                        value={formData.userLimit}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            userLimit: Number.parseInt(event.target.value, 10) || 0,
                          })
                        }
                        min="1"
                      />
                    </div>
                    <div>
                      <label className={fieldLabelClassName}>存储空间限制 (MB)</label>
                      <Input
                        type="number"
                        value={formData.storageLimit}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            storageLimit: Number.parseInt(event.target.value, 10) || 0,
                          })
                        }
                        min="1"
                      />
                    </div>
                    <div>
                      <label className={fieldLabelClassName}>到期时间</label>
                      <Input
                        type="date"
                        className="h-11 rounded-2xl"
                        value={formData.expireTime}
                        onChange={(event) => setFormData({ ...formData, expireTime: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className={fieldLabelClassName}>状态</label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger className="h-11 rounded-2xl">
                          <SelectValue placeholder="请选择状态" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">正常</SelectItem>
                          <SelectItem value="1">停用</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">备注</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">记录续费说明、特殊权限或交接备注，方便后续协作。</div>
                </div>
                <Textarea
                  className="resize-none"
                  rows={3}
                  value={formData.remark}
                  onChange={(event) => setFormData({ ...formData, remark: event.target.value })}
                />
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                  取消
                </Button>
                <Button type="submit">{isEdit ? '保存修改' : '立即创建'}</Button>
              </div>
            </form>
          </WorkspaceDialogShell>
        ) : null}

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
      </WorkspacePageContent>
    </div>
  );
};

export default TenantList;
