import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const entries = [
  { path: '/system/tenant-packages', permission: 'system:tenant-package:list', label: '租户套餐' },
  { path: '/system/tenant', permission: 'system:tenant:list', label: '租户管理' },
  { path: '/system/data-sources', permission: 'system:data-source:list', label: '数据源管理' },
  { path: '/system/oauth2-clients', permission: 'system:oauth2:client:list', label: '第三方客户端' },
];

export function PlatformControlLinks({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { user, loading, hasPermission } = useAuth();
  if (!user || loading || hasPermission('system:auth:router')) return null;
  const available = entries.filter(entry => hasPermission(entry.permission));
  if (!available.length) return null;
  return <div aria-label="平台管理入口" className="mt-2 space-y-1 border-t border-[var(--cf-border)] pt-2">
    {!compact && <p className="px-2 text-xs text-cf-subtle">平台管理 · 进入后需验证身份</p>}
    {available.map(entry => <Link key={entry.path} to={entry.path} onClick={onNavigate} aria-label={entry.label}
      className="sidebar-link cf-side-link min-h-11"><Settings size={16} className="shrink-0" />{!compact && <span>{entry.label}</span>}</Link>)}
  </div>;
}
