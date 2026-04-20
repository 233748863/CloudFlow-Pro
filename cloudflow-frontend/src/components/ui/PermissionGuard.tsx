import React, { ReactNode } from 'react';
import { usePermission } from '../../hooks/usePermission';
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
 * 根据用户权限和角色控制子组件的显示
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  permissions = [],
  roles = [],
  requireAll = false,
  fallback,
  hidden = false,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions, hasAnyRole, isAdmin } = usePermission();

  // 管理员拥有所有权限
  if (isAdmin()) {
    return <>{children}</>;
  }

  let hasAccess = true;

  // 检查权限
  if (permissions.length > 0) {
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }

  // 检查角色
  if (hasAccess && roles.length > 0) {
    hasAccess = hasAnyRole(roles);
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  // 无权限时
  if (hidden) return null;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
        <ShieldOff className="text-slate-400" size={24} />
      </div>
      <p className="text-sm text-slate-500">您没有权限访问此内容</p>
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
  const { hasAnyPermission, hasAnyRole, isAdmin } = usePermission();

  const hasAccess =
    isAdmin() ||
    (permissions.length === 0 || hasAnyPermission(permissions)) &&
    (roles.length === 0 || hasAnyRole(roles));

  return (
    <button {...props} disabled={!hasAccess || props.disabled} title={!hasAccess ? '无操作权限' : props.title}>
      {children}
    </button>
  );
};
