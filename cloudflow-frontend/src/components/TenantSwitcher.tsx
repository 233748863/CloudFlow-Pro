import React, { useState, useEffect } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getTenantList } from '@/services/api/tenant';
import { toast } from 'sonner';

interface Tenant {
  tenantId: number;
  tenantName: string;
  status: string;
}

export const TenantSwitcher: React.FC = () => {
  const { user, switchTenant } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  // 只有超级管理员才显示租户切换器
  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  useEffect(() => {
    if (isOpen && tenants.length === 0) {
      fetchTenants();
    }
  }, [isOpen]);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await getTenantList({ status: '0' }); // 只获取正常状态的租户
      setTenants(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error('获取租户列表失败:', error);
      toast.error('获取租户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchTenant = async (tenantId: number) => {
    if (tenantId === user.tenantId) {
      setIsOpen(false);
      return;
    }

    setSwitching(true);
    try {
      await switchTenant(tenantId);
      setIsOpen(false);
    } catch (error) {
      console.error('租户切换失败:', error);
    } finally {
      setSwitching(false);
    }
  };

  const currentTenant = tenants.find(t => t.tenantId === user.tenantId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        disabled={switching}
      >
        <Building2 size={16} className="text-slate-500" />
        <span className="font-medium">
          {currentTenant?.tenantName || `租户 ${user.tenantId}`}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* 下拉菜单 */}
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 z-50 max-h-80 overflow-y-auto">
            <div className="p-2 border-b border-slate-100">
              <div className="text-xs font-medium text-slate-500 px-2 py-1">
                切换租户
              </div>
            </div>

            {loading ? (
              <div className="p-4 text-center text-slate-500">
                <Loader2 className="animate-spin inline mr-2" size={16} />
                加载中...
              </div>
            ) : tenants.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                暂无可用租户
              </div>
            ) : (
              <div className="p-1">
                {tenants.map((tenant) => (
                  <button
                    key={tenant.tenantId}
                    onClick={() => handleSwitchTenant(tenant.tenantId)}
                    disabled={switching}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                      tenant.tenantId === user.tenantId
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 size={14} />
                      <span>{tenant.tenantName}</span>
                    </div>
                    {tenant.tenantId === user.tenantId && (
                      <Check size={14} className="text-indigo-600" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {switching && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="animate-spin" size={16} />
                  <span>切换中...</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
