import React, { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/utils/errorMessage';
import { useAuth } from '@/context/AuthContext';
import { getTenantSwitchOptions, type SwitchTenantPage } from '@/services/api/auth';
import { getAuthSessionVersion } from '@/utils/authStorage';
import './TenantSwitcher.css';

export const TenantSwitcher: React.FC = () => {
  const { user, switchTenant, hasPermission } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const operation = useRef(0);
  const mounted = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [current, setCurrent] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SwitchTenantPage | null>(null);
  const [error, setError] = useState('');
  const canSwitch = Boolean(user) && hasPermission('system:tenant:switch');
  const currentName = user?.tenantName || `租户 ${user?.tenantId ?? '--'}`;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current++; };
  }, []);

  useEffect(() => {
    operation.current++;
    setIsOpen(false); setResult(null); setKeyword(''); setCurrent(1); setError(''); setSwitching(false);
  }, [user?.id, user?.tenantId, canSwitch]);

  useEffect(() => {
    if (!canSwitch || !isOpen) return;
    const controller = new AbortController();
    const version = getAuthSessionVersion();
    const active = () => !controller.signal.aborted && version === getAuthSessionVersion();
    setLoading(true); setResult(null); setError('');
    const timer = window.setTimeout(async () => {
      try {
        const page = await getTenantSwitchOptions({ current, size: 20, keyword: keyword.trim() }, controller.signal);
        if (active()) setResult(page);
      } catch (failure) {
        if (active()) setError(getErrorMessage(failure, '可切换租户读取失败，请重试'));
      } finally { if (active()) setLoading(false); }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [canSwitch, isOpen, current, keyword, attempt, user]);

  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setIsOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('click', outside); window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', outside); window.removeEventListener('keydown', escape); };
  }, [isOpen]);

  const select = async (tenantId: number) => {
    if (!canSwitch || switching || loading || !result?.records.some(tenant => tenant.tenantId === tenantId)) return;
    if (tenantId === user?.tenantId) { setIsOpen(false); return; }
    const selectedOperation = ++operation.current;
    const active = () => mounted.current && selectedOperation === operation.current;
    setSwitching(true); setError('');
    try { await switchTenant(tenantId); if (active()) setIsOpen(false); }
    catch { if (active()) { setResult(null); setError('租户切换结果未确认，请重新读取当前身份后再操作'); } }
    finally { if (active()) setSwitching(false); }
  };

  if (!canSwitch || !user) return null;
  return <div ref={dropdownRef} className="relative">
    <button ref={triggerRef} type="button" onClick={() => setIsOpen(open => !open)} disabled={switching}
      aria-expanded={isOpen} aria-haspopup="dialog" aria-label={`当前租户：${currentName}`}
      className="app-header-action min-h-11 min-w-11 disabled:opacity-70">
      <Building2 size={16} /><span className="hidden max-w-[7.5rem] truncate 2xl:inline">{currentName}</span>
      {switching ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
    </button>
    {isOpen && <div role="dialog" aria-label="切换租户" className="dropdown tenant-dropdown max-w-[calc(100vw-2rem)]">
      <div className="p-3">
        <label className="text-sm">查找可切换租户<input aria-label="查找可切换租户" maxLength={50} value={keyword}
          onChange={event => { setKeyword(event.target.value); setCurrent(1); }}
          className="mt-2 min-h-11 w-full rounded-md border border-[var(--cf-border)] bg-[var(--cf-surface)] px-3" /></label>
      </div>
      {loading ? <p role="status" className="tenant-dropdown-state"><Loader2 size={14} className="animate-spin" />正在加载</p>
        : error ? <div role="alert" className="p-3 text-sm"><p>{error}</p><button type="button" className="min-h-11" onClick={() => setAttempt(value => value + 1)}>重新读取</button></div>
        : <><div className="max-h-64 overflow-y-auto">
          {!result?.records.length && <p className="tenant-dropdown-state">没有符合条件的可切换租户</p>}
          {result?.records.map(tenant => <button key={tenant.tenantId} type="button" className="tenant-option min-h-11" disabled={switching}
            aria-label={`切换到${tenant.tenantName} ID ${tenant.tenantId}`} onClick={() => { void select(tenant.tenantId); }}>
            <Building2 size={16} /><span className="tenant-option-body"><span className="tenant-option-name block">{tenant.tenantName}</span>
              <span className="tenant-option-id block">{tenant.tenantCode} · ID {tenant.tenantId}</span></span>
            {tenant.tenantId === user.tenantId && <Check size={16} />}
          </button>)}
        </div>{result && <div className="flex items-center justify-between gap-2 px-3 text-xs">
          <button type="button" className="min-h-11 disabled:opacity-50" disabled={current <= 1 || switching} onClick={() => setCurrent(page => page - 1)}>上一页</button>
          <span>第{current}页 · 共{result.total}户</span>
          <button type="button" className="min-h-11 disabled:opacity-50" disabled={current * result.size >= result.total || switching} onClick={() => setCurrent(page => page + 1)}>下一页</button>
        </div>}</>}
    </div>}
  </div>;
};
