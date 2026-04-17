import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getTenantList } from '@/services/api/tenant';

interface Tenant {
  tenantId: number;
  tenantName: string;
  status: string;
}

export const TenantSwitcher: React.FC = () => {
  const { user, switchTenant } = useAuth();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  const normalizedRole = String(user?.role || '').trim().toUpperCase();
  const canSwitchTenant =
    Boolean(user) &&
    (normalizedRole === 'ADMIN' ||
      normalizedRole === 'ROLE_ADMIN' ||
      normalizedRole === 'SUPER_ADMIN' ||
      normalizedRole === 'SUPERADMIN' ||
      normalizedRole.endsWith('_ADMIN') ||
      normalizedRole.includes('ADMIN') ||
      String(user?.username || '').trim().toLowerCase() === 'admin');

  const fetchTenants = async (silent = false) => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      const response = await getTenantList({ status: '0' });
      setTenants(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('获取租户列表失败:', error);
      if (!silent) {
        toast.error('获取租户列表失败');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canSwitchTenant) {
      return;
    }

    void fetchTenants(true);
  }, [canSwitchTenant]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!canSwitchTenant || !user) {
    return null;
  }

  const currentTenant = tenants.find((tenant) => tenant.tenantId === user.tenantId);
  const currentTenantValue =
    typeof user.tenantId === 'number'
      ? String(user.tenantId)
      : currentTenant?.tenantName || '默认';

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

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={switching}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`租户 ${currentTenantValue}`}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-wait disabled:opacity-70"
      >
        <span className="text-[14px] text-gray-400">租户</span>
        <span className="max-w-[5rem] truncate text-[15px] text-gray-700">
          {currentTenantValue}
        </span>
        {switching ? (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        ) : (
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      <div
        className={`absolute right-0 top-full z-50 mt-1 w-36 origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg transition-all duration-150 ${
          isOpen
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-gray-500">
            <Loader2 size={14} className="animate-spin" />
            <span>加载中</span>
          </div>
        ) : tenants.length === 0 ? (
          <div className="px-3 py-3 text-center text-sm text-gray-500">暂无租户</div>
        ) : (
          <div className="py-1">
            {tenants.map((tenant) => {
              const active = tenant.tenantId === user.tenantId;
              const tenantValue =
                typeof tenant.tenantId === 'number'
                  ? String(tenant.tenantId)
                  : tenant.tenantName || '默认';

              return (
                <button
                  key={tenant.tenantId}
                  type="button"
                  onClick={() => void handleSwitchTenant(tenant.tenantId)}
                  disabled={switching}
                  title={tenant.tenantName || tenantValue}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 ${
                    active ? 'bg-teal-50 text-teal-600' : ''
                  } ${switching ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <span
                    className={`min-w-[20px] text-left text-xs font-medium uppercase ${
                      active ? 'text-teal-500' : 'text-gray-400'
                    }`}
                  >
                    ID
                  </span>
                  <span className="flex-1 truncate text-left">{tenantValue}</span>
                  {active ? <Check size={14} className="shrink-0 text-teal-500" /> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
