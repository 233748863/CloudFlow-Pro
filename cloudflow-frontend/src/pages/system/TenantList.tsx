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
  RefreshCw,
  Power,
  PowerOff,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
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
import { DatePicker, Input, Textarea, Button, TableHead, TableHeader, TableActionHead } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';

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
          console.warn('??????????????????', statisticsError);
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
      toast.error('????????');
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
      setIsModalOpen(true);
      return;
    }

    setEditingTenant(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingTenant(null);
    setFormData(DEFAULT_FORM_DATA);
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
      toast.error(error?.message || '操作失败');
    }
  };

  const handleDelete = async (tenantId: number) => {
    if (!window.confirm('确认删除该租户吗？删除后无法恢复！')) {
      return;
    }

    try {
      await deleteTenant([tenantId]);
      toast.success('租户删除成功');
      await fetchTenants();
    } catch (error: any) {
      toast.error(error?.message || '删除失败');
    }
  };

  const handleToggleStatus = async (tenant: TenantView) => {
    const newStatus = tenant.status === '0' ? '1' : '0';
    try {
      await changeTenantStatus({ tenantId: tenant.tenantId, status: newStatus });
      toast.success(newStatus === '0' ? '租户已启用' : '租户已停用');
      await fetchTenants();
    } catch (error: any) {
      toast.error(error?.message || '状态更新失败');
    }
  };

  // ??????????????????????????
  const handleRefreshStorage = async (tenantId: number) => {
    setRefreshingTenantId(tenantId);
    try {
      await refreshTenantStorageUsage(tenantId);
      toast.success('?????????');
      await fetchTenants();
    } catch (error: any) {
      toast.error(error?.message || '????????');
    } finally {
      setRefreshingTenantId(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) {
      return '-';
    }
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return date.toLocaleDateString('zh-CN');
  };

  const formatStorage = (mb?: number) => {
    if (!mb) {
      return '0 MB';
    }
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
      if (!tenant.expireTime || tenant.expired) {
        return false;
      }
      const time = new Date(tenant.expireTime).getTime();
      if (Number.isNaN(time)) {
        return false;
      }
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

  const isEdit = !!editingTenant;

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50 gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">租户管理</h1>
        <Button
          onClick={openCreateModal}
          className="bg-pink-500 hover:bg-pink-600"
        >
          <Plus size={18} className="mr-2" /> 新增租户
        </Button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <Input
              type="text"
              placeholder="搜索租户名称..."
              className="pl-10"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <Button type="submit" className="bg-slate-800 hover:bg-slate-900 px-6">
            搜索
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: '租户总数',
            value: summary.total,
            desc: '当前已接入租户',
            icon: <Building2 size={18} className="text-pink-600" />,
            bg: 'bg-pink-50',
          },
          {
            label: '正常运行',
            value: summary.active,
            desc: '未停用且未过期',
            icon: <ShieldCheck size={18} className="text-emerald-600" />,
            bg: 'bg-emerald-50',
          },
          {
            label: '30天内到期',
            value: summary.expiringSoon,
            desc: '需要提前续费或处理',
            icon: <Clock3 size={18} className="text-amber-600" />,
            bg: 'bg-amber-50',
          },
          {
            label: '重点关注',
            value: summary.warning,
            desc: '配额或容量存在风险',
            icon: <AlertTriangle size={18} className="text-red-600" />,
            bg: 'bg-red-50',
          },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.bg}`}>{card.icon}</div>
              <span className="text-2xl font-bold text-slate-800">{card.value}</span>
            </div>
            <div className="text-sm font-semibold text-slate-800">{card.label}</div>
            <div className="text-xs text-slate-500 mt-1">{card.desc}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full">
            <TableHeader>
              <tr>
                <TableHead className="px-6 py-3 text-left">租户信息</TableHead>
                <TableHead className="px-6 py-3 text-left">联系方式</TableHead>
                <TableHead className="px-6 py-3 text-left">用户配额</TableHead>
                <TableHead className="px-6 py-3 text-left">存储使用</TableHead>
                <TableHead className="px-6 py-3 text-left">到期情况</TableHead>
                <TableHead className="px-6 py-3 text-left">状态</TableHead>
                <TableActionHead className="px-6 py-3 w-72">操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载租户数据..." />
              ) : tenants.length === 0 ? (
                <WorkspaceTableStateRow colSpan={7} title="暂无租户数据" />
              ) : (
                tenants.map((tenant) => {
                  const userPercent = calcPercent(tenant.userCount, tenant.userLimit);
                  const storagePercent = calcPercent(tenant.storageUsed, tenant.storageLimit);
                  const expireHint = getExpireHint(tenant.expireTime);

                  return (
                    <tr key={tenant.tenantId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-pink-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Building2 size={20} className="text-pink-500" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-900">{tenant.tenantName}</div>
                            <div className="text-xs text-slate-500">ID: {tenant.tenantId}</div>
                            {tenant.domain ? <div className="text-xs text-slate-400 mt-0.5">域名：{tenant.domain}</div> : null}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-500">
                        <div>{tenant.contactName || '-'}</div>
                        <div className="text-xs">{tenant.contactPhone || '-'}</div>
                        <div className="text-xs text-slate-400">{tenant.contactEmail || '-'}</div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        <div className="flex items-center gap-1 text-slate-700">
                          <Users size={14} />
                          <span>{tenant.userCount} / {tenant.userLimit || 0} 用户</span>
                        </div>
                        <div className="w-36 mt-2">
                          <div className="flex justify-between text-xs text-slate-600 mb-1">
                            <span>占用率</span>
                            <span>{userPercent.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                userPercent >= 100 ? 'bg-red-500' : userPercent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${userPercent}%` }}
                            />
                          </div>
                        </div>
                        <div className={`text-xs mt-2 ${tenant.userLimitReached ? 'text-red-600' : 'text-slate-500'}`}>
                          {tenant.userLimitReached ? '已达到用户上限' : '用户配额正常'}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="w-36">
                          <div className="flex items-center gap-1 text-sm text-slate-700 mb-1">
                            <HardDrive size={14} />
                            <span>{formatStorage(tenant.storageUsed)} / {formatStorage(tenant.storageLimit)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-600 mb-1">
                            <span>占用率</span>
                            <span>{storagePercent.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                storagePercent >= 90 ? 'bg-red-500' : storagePercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${storagePercent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        <div className="flex items-center gap-1 text-slate-700">
                          <Calendar size={14} />
                          <span>{formatDate(tenant.expireTime)}</span>
                        </div>
                        <div className={`text-xs mt-1 ${expireHint.tone}`}>{expireHint.text}</div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-2 items-start">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(tenant)}
                            className={`h-6 px-3 rounded-full text-xs font-medium flex items-center gap-1 ${
                              tenant.status === '0'
                                ? 'bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800'
                            }`}
                          >
                            {tenant.status === '0' ? <Power size={12} /> : <PowerOff size={12} />}
                            {tenant.status === '0' ? '正常' : '停用'}
                          </Button>

                          {tenant.expired ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">已过期</span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">未过期</span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
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
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(event) => event.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">{isEdit ? '编辑租户' : '新增租户'}</h3>
              <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">租户名称</label>
                  <Input
                    value={formData.tenantName}
                    onChange={(event) => setFormData({ ...formData, tenantName: event.target.value })}
                    placeholder="请输入租户名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系人</label>
                  <Input
                    value={formData.contactName}
                    onChange={(event) => setFormData({ ...formData, contactName: event.target.value })}
                    placeholder="联系人姓名"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系电话</label>
                  <Input
                    value={formData.contactPhone}
                    onChange={(event) => setFormData({ ...formData, contactPhone: event.target.value })}
                    placeholder="联系电话"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系邮箱</label>
                  <Input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(event) => setFormData({ ...formData, contactEmail: event.target.value })}
                    placeholder="联系邮箱"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">域名</label>
                <Input
                  value={formData.domain}
                  onChange={(event) => setFormData({ ...formData, domain: event.target.value })}
                  placeholder="example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">用户数量限制</label>
                  <Input
                    type="number"
                    value={formData.userLimit}
                    onChange={(event) => setFormData({ ...formData, userLimit: parseInt(event.target.value, 10) || 0 })}
                    placeholder="100"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">存储空间限制 (MB)</label>
                  <Input
                    type="number"
                    value={formData.storageLimit}
                    onChange={(event) => setFormData({ ...formData, storageLimit: parseInt(event.target.value, 10) || 0 })}
                    placeholder="10240"
                    min="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">到期时间</label>
                  <DatePicker
                    type="date"
                    value={formData.expireTime}
                    onChange={(event) => setFormData({ ...formData, expireTime: event.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                  <div className="flex gap-4 pt-2">
                    {[['0', '正常'], ['1', '停用']].map(([value, label]) => (
                      <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          checked={formData.status === value}
                          onChange={() => setFormData({ ...formData, status: value })}
                          className="accent-pink-500"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <Textarea
                  className="resize-none"
                  rows={3}
                  value={formData.remark}
                  onChange={(event) => setFormData({ ...formData, remark: event.target.value })}
                  placeholder="备注信息"
                />
              </div>
            </form>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsModalOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={(event) => void handleSubmit(event as any)}
                className="bg-pink-500 hover:bg-pink-600"
              >
                {isEdit ? '保存修改' : '立即创建'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TenantList;
