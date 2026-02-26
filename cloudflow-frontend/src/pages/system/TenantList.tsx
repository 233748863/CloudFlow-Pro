import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, Building2, Users, HardDrive, Calendar, Loader2, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { getTenantList, addTenant, updateTenant, deleteTenant, changeTenantStatus } from '../../services/api/tenant';
import { useMount } from '../../hooks/useMount';

interface Tenant {
  tenantId: number;
  tenantName: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  domain?: string;
  status: string;
  expireTime?: string;
  userLimit?: number;
  storageLimit?: number;
  storageUsed?: number;
  createTime?: string;
  remark?: string;
}

// 分页响应接口
interface PageResponse<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
  pages: number;
}

export const TenantList = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
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
  });

  useMount(() => {
    fetchTenants();
  });

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res: any = await getTenantList({ tenantName: searchTerm });
      // 响应拦截器已经解包了 data，所以 res 就是分页对象
      // 分页对象结构：{ records: [...], total: 1, size: 10, current: 1, pages: 1 }
      if (res && Array.isArray(res.records)) {
        setTenants(res.records);
      } else if (Array.isArray(res)) {
        // 兼容直接返回数组的情况
        setTenants(res);
      } else {
        setTenants([]);
      }
    } catch (error) {
      console.error(error);
      toast.error('加载租户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTenants();
  };

  const handleOpenModal = (tenant?: Tenant) => {
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
      setFormData({
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
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.tenantName?.trim()) {
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
      fetchTenants();
    } catch (error: any) {
      toast.error(error?.message || '操作失败');
    }
  };

  const handleDelete = async (tenantId: number) => {
    if (window.confirm('确认删除该租户吗？删除后无法恢复！')) {
      try {
        await deleteTenant([tenantId]);
        toast.success('租户删除成功');
        fetchTenants();
      } catch (error: any) {
        toast.error(error?.message || '删除失败');
      }
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const newStatus = tenant.status === '0' ? '1' : '0';
    try {
      await changeTenantStatus({ tenantId: tenant.tenantId, status: newStatus });
      toast.success(newStatus === '0' ? '租户已启用' : '租户已停用');
      fetchTenants();
    } catch (error: any) {
      toast.error(error?.message || '状态更新失败');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  const formatStorage = (mb?: number) => {
    if (!mb) return '0 MB';
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb} MB`;
  };

  const getStoragePercent = (used?: number, limit?: number) => {
    if (!used || !limit) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const isEdit = !!editingTenant;

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">租户管理</h1>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors"
        >
          <Plus size={18} /> 新增租户
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="搜索租户名称..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-900 transition-colors">
            搜索
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">租户信息</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">联系方式</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">配额</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">存储使用</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">到期时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="animate-spin inline mr-2" size={18} />加载中...
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">暂无数据</td>
                </tr>
              ) : (
                tenants.map((tenant) => {
                  const storagePercent = getStoragePercent(tenant.storageUsed, tenant.storageLimit);
                  return (
                    <tr key={tenant.tenantId} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-pink-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Building2 size={20} className="text-pink-500" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-900">{tenant.tenantName}</div>
                            <div className="text-xs text-slate-500">ID: {tenant.tenantId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        <div>{tenant.contactName || '-'}</div>
                        <div className="text-xs">{tenant.contactPhone || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        <div className="flex items-center gap-1">
                          <Users size={14} />
                          <span>{tenant.userLimit || 0} 用户</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <HardDrive size={12} />
                          <span>{formatStorage(tenant.storageLimit)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="w-32">
                          <div className="flex justify-between text-xs text-slate-600 mb-1">
                            <span>{formatStorage(tenant.storageUsed)}</span>
                            <span>{storagePercent.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${
                                storagePercent > 90 ? 'bg-red-500' : 
                                storagePercent > 70 ? 'bg-yellow-500' : 
                                'bg-green-500'
                              }`}
                              style={{ width: `${storagePercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar size={14} />
                          <span>{formatDate(tenant.expireTime)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(tenant)}
                          className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                            tenant.status === '0' 
                              ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          {tenant.status === '0' ? <Power size={12} /> : <PowerOff size={12} />}
                          {tenant.status === '0' ? '正常' : '停用'}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 flex gap-3">
                        <button 
                          onClick={() => handleOpenModal(tenant)} 
                          className="text-pink-500 hover:text-pink-700 flex items-center gap-1"
                        >
                          <Edit size={16} /> 编辑
                        </button>
                        <button 
                          onClick={() => handleDelete(tenant.tenantId)} 
                          className="text-red-600 hover:text-red-900 flex items-center gap-1"
                        >
                          <Trash2 size={16} /> 删除
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">{isEdit ? '编辑租户' : '新增租户'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* 租户名称 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  租户名称 <span className="text-red-500">*</span>
                </label>
                <input 
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                  value={formData.tenantName}
                  onChange={e => setFormData({...formData, tenantName: e.target.value})}
                  placeholder="请输入租户名称"
                />
              </div>

              {/* 联系人信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系人</label>
                  <input 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.contactName}
                    onChange={e => setFormData({...formData, contactName: e.target.value})}
                    placeholder="联系人姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系电话</label>
                  <input 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.contactPhone}
                    onChange={e => setFormData({...formData, contactPhone: e.target.value})}
                    placeholder="联系电话"
                  />
                </div>
              </div>

              {/* 联系邮箱 + 域名 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系邮箱</label>
                  <input 
                    type="email"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.contactEmail}
                    onChange={e => setFormData({...formData, contactEmail: e.target.value})}
                    placeholder="联系邮箱"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">域名</label>
                  <input 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.domain}
                    onChange={e => setFormData({...formData, domain: e.target.value})}
                    placeholder="example.com"
                  />
                </div>
              </div>

              {/* 配额设置 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">用户数量限制</label>
                  <input 
                    type="number"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.userLimit}
                    onChange={e => setFormData({...formData, userLimit: parseInt(e.target.value) || 0})}
                    placeholder="100"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">存储空间限制 (MB)</label>
                  <input 
                    type="number"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.storageLimit}
                    onChange={e => setFormData({...formData, storageLimit: parseInt(e.target.value) || 0})}
                    placeholder="10240"
                    min="1"
                  />
                </div>
              </div>

              {/* 到期时间 + 状态 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">到期时间</label>
                  <input 
                    type="date"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.expireTime}
                    onChange={e => setFormData({...formData, expireTime: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                  <div className="flex gap-4 pt-2">
                    {[['0', '正常'], ['1', '停用']].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          checked={formData.status === v} 
                          onChange={() => setFormData({...formData, status: v})} 
                          className="accent-pink-500" 
                        />
                        <span className="text-sm">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <textarea 
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none resize-none"
                  rows={3}
                  value={formData.remark}
                  onChange={e => setFormData({...formData, remark: e.target.value})}
                  placeholder="备注信息"
                />
              </div>
            </form>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button 
                type="button"
                onClick={(e) => handleSubmit(e as any)}
                className="px-4 py-2 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors shadow-sm"
              >
                {isEdit ? '保存修改' : '立即创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
