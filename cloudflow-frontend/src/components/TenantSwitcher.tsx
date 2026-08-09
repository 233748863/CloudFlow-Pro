import React, { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { useAuth } from '@/context/AuthContext';
import { getTenantList } from '@/services/api/tenant';
import './TenantSwitcher.css';

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
        className="app-header-action hidden md:inline-flex disabled:cursor-wait disabled:opacity-70"
      >
        <Building2 size={16} />
        <span className="hidden max-w-[7.5rem] truncate 2xl:inline">{currentTenantName}</span>
        {switching ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-cf-faint" />
        ) : (
          <ChevronDown
            size={14}
            className={`shrink-0 text-cf-faint transition-transform duration-200 ${
 isOpen ? 'rotate-180' : ''
 }`}
          />
        )}
      </button>

      <div
        className={`dropdown tenant-dropdown transition-all duration-150 ${
          isOpen
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
        }`}
      >
        {loading ? (
          <div className="tenant-dropdown-state">
            <Loader2 size={14} className="animate-spin" />
            <span>正在加载</span>
          </div>
        ) : tenants.length === 0 ? (
          <div className="tenant-dropdown-state">暂无租户</div>
        ) : (
          <>
            <div className="tenant-dropdown-label">切换租户</div>
            <div className="pb-1.5">
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
                    data-tooltip={`${tenantName} ${tenantIdText}`} aria-label={`${tenantName} ${tenantIdText}`}
                    className={`tenant-option ${active ? 'is-active' : ''}`}
                  >
                    <div className="tenant-option-icon">
                      <Building2 size={15} />
                    </div>
                    <div className="tenant-option-body">
                      <div className="tenant-option-name">{tenantName}</div>
                      <div className="tenant-option-id">{tenantIdText}</div>
                    </div>
                    {active ? <Check size={15} className="tenant-option-check" /> : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
