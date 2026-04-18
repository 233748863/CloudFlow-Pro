import React, { useMemo, useState } from 'react';
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
import { useMount } from '../../hooks/useMount';
import {
  Button,
  Card,
  DatePicker,
  Input,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';

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

export const TenantList: React.FC = () => {
  const [tenants, setTenants] = useState<TenantView[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantView | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(DEFAULT_FORM_DATA);
  const [refreshingTenantId, setRefreshingTenantId] = useState<number | null>(null);

  useMount(() => {
    void fetchTenants();
  });

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const response = await getTenantList({ tenantName: searchTerm });
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
    } catch (error) {
      console.error(error);
      toast.error('加载租户失败');
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchTenants();
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
      await fetchTenants();
    } catch (error: any) {
      toast.error(error?.message || '保存租户失败');
    }
  };

  const handleDelete = async (tenantId: number) => {
    if (!window.confirm('确认删除该租户吗？删除后无法恢复。')) {
      return;
    }

    try {
      await deleteTenant([tenantId]);
      toast.success('租户删除成功');
      await fetchTenants();
    } catch (error: any) {
      toast.error(error?.message || '删除租户失败');
    }
  };

  const handleToggleStatus = async (tenant: TenantView) => {
    const nextStatus = tenant.status === '0' ? '1' : '0';
    try {
      await changeTenantStatus({ tenantId: tenant.tenantId, status: nextStatus });
      toast.success(nextStatus === '0' ? '租户已启用' : '租户已停用');
      await fetchTenants();
    } catch (error: any) {
      toast.error(error?.message || '更新租户状态失败');
    }
  };

  const handleRefreshStorage = async (tenantId: number) => {
    setRefreshingTenantId(tenantId);
    try {
      await refreshTenantStorageUsage(tenantId);
      toast.success('存储使用量已刷新');
      await fetchTenants();
    } catch (error: any) {
      toast.error(error?.message || '刷新存储使用量失败');
    } finally {
      setRefreshingTenantId(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('zh-CN');
  };

  const formatStorage = (mb?: number) => {
    if (!mb) return '0 MB';
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
      return { text: '未设置', tone: 'text-slate-500' };
    }

    const time = new Date(expireTime).getTime();
    if (Number.isNaN(time)) {
      return { text: '日期异常', tone: 'text-red-600' };
    }

    const diffDays = Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { text: '已过期', tone: 'text-red-600' };
    }
    if (diffDays <= 30) {
      return { text: `${diffDays} 天后到期`, tone: 'text-amber-600' };
    }
    return { text: '有效', tone: 'text-emerald-600' };
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
  const hasActiveFilters = Boolean(searchTerm.trim());
  const isEdit = Boolean(editingTenant);

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
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Building2 size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="租户管理"
          description="租户页的信息密度很高，所以这次重点统一信息卡、搜索台、结果表和弹窗表单的层级，让它和业务申请页属于同一套产品。"
          actions={(
            <Button size="lg" onClick={() => handleOpenModal()}>
              <Plus size={15} />
              新增租户
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="租户列表"
              total={tenants.length}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              headerBadges={(
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
                    支持实时刷新存储统计
                  </span>
                </div>
              )}
              quickFilterAside={hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={() => { setSearchTerm(''); void fetchTenants(); }}>
                  清空筛选
                </Button>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                  当前显示全部租户
                </span>
              )}
              filterBar={(
                <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="按租户名称搜索"
                      className="pl-10"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  </div>
                  <Button type="submit">
                    <Search size={15} />
                    搜索租户
                  </Button>
                </form>
              )}
            />

            <WorkspaceResultCard
              total={tenants.length}
              description="统一展示租户信息、配额、容量和到期状态，避免系统页与业务页产生割裂感。"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px]">
                  <TableHeader>
                    <tr>
                      <TableHead>租户信息</TableHead>
                      <TableHead>联系方式</TableHead>
                      <TableHead>用户配额</TableHead>
                      <TableHead>存储使用</TableHead>
                      <TableHead>到期情况</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-72">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载租户数据..." />
                    ) : tenants.length === 0 ? (
                      <WorkspaceTableStateRow colSpan={7} title="暂无租户数据" description="可以先创建租户，再逐步维护配额、域名和有效期。" />
                    ) : (
                      tenants.map((tenant) => {
                        const userPercent = calcPercent(tenant.userCount, tenant.userLimit);
                        const storagePercent = calcPercent(tenant.storageUsed, tenant.storageLimit);
                        const expireHint = getExpireHint(tenant.expireTime);

                        return (
                          <tr key={tenant.tenantId} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                                  <Building2 size={18} />
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-slate-900">{tenant.tenantName}</div>
                                  <div className="text-xs text-slate-500">ID: {tenant.tenantId}</div>
                                  {tenant.domain ? <div className="mt-0.5 text-xs text-slate-400">{tenant.domain}</div> : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              <div>{tenant.contactName || '-'}</div>
                              <div className="text-xs">{tenant.contactPhone || '-'}</div>
                              <div className="text-xs text-slate-400">{tenant.contactEmail || '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              <div className="flex items-center gap-1 text-slate-700">
                                <Users size={14} />
                                <span>{tenant.userCount} / {tenant.userLimit || 0} 用户</span>
                              </div>
                              <div className="mt-2 w-40">
                                <div className="mb-1 flex justify-between text-xs text-slate-500">
                                  <span>占用率</span>
                                  <span>{userPercent.toFixed(0)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-200">
                                  <div
                                    className={`h-2 rounded-full ${
                                      userPercent >= 100 ? 'bg-rose-500' : userPercent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${userPercent}%` }}
                                  />
                                </div>
                              </div>
                              <div className={`mt-2 text-xs ${tenant.userLimitReached ? 'text-rose-600' : 'text-slate-500'}`}>
                                {tenant.userLimitReached ? '已达到用户上限' : '用户配额正常'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              <div className="flex items-center gap-1 text-slate-700">
                                <HardDrive size={14} />
                                <span>{formatStorage(tenant.storageUsed)} / {formatStorage(tenant.storageLimit)}</span>
                              </div>
                              <div className="mt-2 w-40">
                                <div className="mb-1 flex justify-between text-xs text-slate-500">
                                  <span>占用率</span>
                                  <span>{storagePercent.toFixed(0)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-200">
                                  <div
                                    className={`h-2 rounded-full ${
                                      storagePercent >= 90 ? 'bg-rose-500' : storagePercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${storagePercent}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              <div className="flex items-center gap-1 text-slate-700">
                                <Calendar size={14} />
                                <span>{formatDate(tenant.expireTime)}</span>
                              </div>
                              <div className={`mt-1 text-xs ${expireHint.tone}`}>{expireHint.text}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(tenant)}
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                                    tenant.status === '0'
                                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border border-rose-200 bg-rose-50 text-rose-600'
                                  }`}
                                >
                                  {tenant.status === '0' ? <Power size={12} /> : <PowerOff size={12} />}
                                  {tenant.status === '0' ? '正常' : '停用'}
                                </button>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                  tenant.expired
                                    ? 'border border-rose-200 bg-rose-50 text-rose-600'
                                    : 'border border-slate-200 bg-white text-slate-600'
                                }`}>
                                  {tenant.expired ? '已过期' : '未过期'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <TableRowActions
                                align="end"
                                actions={[
                                  {
                                    label: '编辑',
                                    icon: <Edit size={14} />,
                                    onClick: () => handleOpenModal(tenant),
                                    tone: 'primary',
                                  },
                                  {
                                    label: '刷新',
                                    icon: refreshingTenantId === tenant.tenantId ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />,
                                    onClick: () => void handleRefreshStorage(tenant.tenantId),
                                    tone: 'neutral',
                                    disabled: refreshingTenantId === tenant.tenantId,
                                  },
                                  {
                                    label: '删除',
                                    icon: <Trash2 size={14} />,
                                    onClick: () => handleDelete(tenant.tenantId),
                                    tone: 'danger',
                                  },
                                ]}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>

        {isModalOpen ? (
          <WorkspaceDialogShell
            title={isEdit ? '编辑租户' : '新增租户'}
            description="按统一的业务工作台表单结构填写基础资料、配额限制和有效期。"
            onClose={() => setIsModalOpen(false)}
            maxWidthClassName="max-w-4xl"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">基础资料</div>
                  <div className="mt-1 text-sm text-slate-500">先确认租户名称、联系人和域名信息，便于后续统一检索和联络。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      租户名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.tenantName}
                      onChange={(event) => setFormData({ ...formData, tenantName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">联系人</label>
                    <Input
                      value={formData.contactName}
                      onChange={(event) => setFormData({ ...formData, contactName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">联系电话</label>
                    <Input
                      value={formData.contactPhone}
                      onChange={(event) => setFormData({ ...formData, contactPhone: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">联系邮箱</label>
                    <Input
                      type="email"
                      value={formData.contactEmail}
                      onChange={(event) => setFormData({ ...formData, contactEmail: event.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">域名</label>
                    <Input
                      value={formData.domain}
                      onChange={(event) => setFormData({ ...formData, domain: event.target.value })}
                      placeholder="example.com"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">配额与有效期</div>
                  <div className="mt-1 text-sm text-slate-500">集中管理用户上限、存储容量、到期时间和状态，方便运维排查风险租户。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">用户数量限制</label>
                    <Input
                      type="number"
                      value={formData.userLimit}
                      onChange={(event) => setFormData({ ...formData, userLimit: parseInt(event.target.value, 10) || 0 })}
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">存储空间限制 (MB)</label>
                    <Input
                      type="number"
                      value={formData.storageLimit}
                      onChange={(event) => setFormData({ ...formData, storageLimit: parseInt(event.target.value, 10) || 0 })}
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">到期时间</label>
                    <DatePicker
                      className="h-11 rounded-2xl"
                      type="date"
                      value={formData.expireTime}
                      onChange={(event) => setFormData({ ...formData, expireTime: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">状态</label>
                    <div className="flex gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      {[
                        ['0', '正常'],
                        ['1', '停用'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            checked={formData.status === value}
                            onChange={() => setFormData({ ...formData, status: value })}
                            className="accent-slate-700"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">备注</div>
                  <div className="mt-1 text-sm text-slate-500">记录续费说明、特殊权限或交接备注，方便后续协作。</div>
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
      </WorkspacePageContent>
    </div>
  );
};

export default TenantList;
