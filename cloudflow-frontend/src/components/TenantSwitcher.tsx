import React, { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { useAuth } from '@/context/AuthContext';
import { getTenantList } from '@/services/api/tenant';

interface Tenant {
  tenantId: number;
  tenantName: string;
  status: string;
}

type TenantListResponse =
  | Tenant[]
  | {
      records?: Tenant[];
      rows?: Tenant[];
      list?: Tenant[];
      data?: {
        records?: Tenant[];
        rows?: Tenant[];
        list?: Tenant[];
      };
    };

const pickTenantArray = (source?: {
  records?: Tenant[];
  rows?: Tenant[];
  list?: Tenant[];
}) => {
  if (Array.isArray(source?.records)) {
    return source.records;
  }

  if (Array.isArray(source?.rows)) {
    return source.rows;
  }

  if (Array.isArray(source?.list)) {
    return source.list;
  }

  return [];
};

const normalizeTenantListResponse = (response: TenantListResponse): Tenant[] => {
  if (Array.isArray(response)) {
    return response;
  }

  const directList = pickTenantArray(response);
  if (directList.length > 0) {
    return directList;
  }

  return pickTenantArray(response?.data);
};

const getTenantName = (tenantName?: string, tenantId?: number) => {
  const normalizedName = String(tenantName || '').trim();
  if (normalizedName) {
    return normalizedName;
  }

  if (typeof tenantId === 'number') {
    return `租户 ${tenantId}`;
  }

  return '默认租户';
};

const getTenantIdText = (tenantId?: number) =>
  typeof tenantId === 'number' ? `ID ${tenantId}` : 'ID --';

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
      setTenants(normalizeTenantListResponse(response as TenantListResponse));
    } catch (error) {
      console.error('获取租户列表失败:', error);
      if (!silent) {
        toast.error(getErrorMessage(error, '获取租户列表失败'));
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
  const currentTenantName = getTenantName(
    currentTenant?.tenantName || user.tenantName,
    user.tenantId,
  );
  const currentTenantIdText = getTenantIdText(user.tenantId);

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
        aria-label={`当前租户：${currentTenantName}`}
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70 dark:hover:bg-slate-800"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <Building2 size={15} />
        </div>
        <div className="hidden min-w-0 flex-1 sm:block">
          <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-100">
            {currentTenantName}
          </div>
          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
            {currentTenantIdText}
          </div>
        </div>
        {switching ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-slate-400 dark:text-slate-500" />
        ) : (
          <ChevronDown
            size={14}
            className={`shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      <div
        className={`absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_36px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/70 transition-all duration-150 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-800/70 dark:shadow-[0_18px_36px_rgba(2,6,23,0.5)] ${
          isOpen
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 size={14} className="animate-spin" />
            <span>正在加载</span>
          </div>
        ) : tenants.length === 0 ? (
          <div className="px-4 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            暂无租户
          </div>
        ) : (
          <div className="py-1.5">
            {tenants.map((tenant) => {
              const active = tenant.tenantId === user.tenantId;
              const tenantName = getTenantName(tenant.tenantName, tenant.tenantId);
              const tenantIdText = getTenantIdText(tenant.tenantId);

              return (
                <button
                  key={tenant.tenantId}
                  type="button"
                  onClick={() => void handleSwitchTenant(tenant.tenantId)}
                  disabled={switching}
                  title={`${tenantName} ${tenantIdText}`}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900 ${
                    active ? 'bg-cyan-50 dark:bg-cyan-950/30' : ''
                  } ${switching ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                      active
                        ? 'border-cyan-200 bg-cyan-100 text-cyan-600 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-300'
                        : 'border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500'
                    }`}
                  >
                    <Building2 size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-sm font-medium ${
                        active
                          ? 'text-cyan-700 dark:text-cyan-200'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {tenantName}
                    </div>
                    <div
                      className={`mt-0.5 truncate text-[11px] ${
                        active
                          ? 'text-cyan-600/80 dark:text-cyan-300/80'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {tenantIdText}
                    </div>
                  </div>
                  {active ? <Check size={14} className="shrink-0 text-cyan-500 dark:text-cyan-300" /> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
