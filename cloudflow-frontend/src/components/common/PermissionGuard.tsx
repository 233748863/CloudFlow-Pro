import React, { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Role } from '../../types';
import { ShieldOff } from 'lucide-react';

interface PermissionGuardProps {
  children: ReactNode;
  /** 需要的权限（满足任一即可） */
  permissions?: string[];
  /** 需要的角色（满足任一即可） */
  roles?: Role[];
  /** 是否需要所有权限（默认 false，即满足任一即可） */
  requireAll?: boolean;
  /** 无权限时显示的内容 */
  fallback?: ReactNode;
  /** 无权限时是否隐藏（默认显示无权限提示） */
  hidden?: boolean;
}

/**
 * 权限守卫组件
 * 权限源单一化（P0-5）：统一从 AuthContext 取 user.permissions / user.role。
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  permissions = [],
  roles = [],
  requireAll = false,
  fallback,
  hidden = false,
}) => {
  const { user, hasPermission } = useAuth();

  if (user?.role === Role.ADMIN) {
    return <>{children}</>;
  }

  let hasAccess = true;

  if (permissions.length > 0) {
    hasAccess = hasPermission(permissions, requireAll);
  }

  if (hasAccess && roles.length > 0) {
    hasAccess = roles.some((r) => user?.role === r);
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (hidden) return null;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="p-4 flex flex-col items-center justify-center border border-slate-200 bg-[var(--cf-surface-muted)] p-6 text-center dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950">
        <ShieldOff className="text-slate-400 dark:text-slate-500" size={20} />
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">您没有权限访问此内容</p>
    </div>
  );
};

/**
 * 按钮级权限控制 - 无权限时禁用按钮
 */
export const PermissionButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    permissions?: string[];
    roles?: Role[];
  }
> = ({ permissions = [], roles = [], children, ...props }) => {
  const { user, hasPermission } = useAuth();

  const isAdmin = user?.role === Role.ADMIN;
  const permOk = permissions.length === 0 || hasPermission(permissions);
  const roleOk = roles.length === 0 || roles.some((r) => user?.role === r);
  const hasAccess = isAdmin || (permOk && roleOk);

  return (
    <button {...props} disabled={!hasAccess || props.disabled} title={!hasAccess ? '无操作权限' : props.title}>
      {children}
    </button>
  );
};

