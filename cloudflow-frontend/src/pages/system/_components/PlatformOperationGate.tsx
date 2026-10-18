import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button, Input, PermissionGuard } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { readPlatformAccess, verifyPlatformAccess, type PlatformAccessState } from '@/services/api/platformAccess';
import { getAuthToken } from '@/utils/authStorage';
import { getErrorMessage } from '@/utils/errorMessage';

interface Props {
  permission: string;
  children: (invalidate: () => void) => React.ReactNode;
}

function BoundPlatformGate({ children }: Pick<Props, 'children'>) {
  const [state, setState] = useState<PlatformAccessState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [revision, setRevision] = useState(0);
  const active = useRef(true);
  const token = useRef(getAuthToken());
  const current = () => active.current && token.current === getAuthToken();
  const invalidate = useCallback(() => {
    setPassword(''); setCode('');
    setState(previous => previous ? { ...previous, verified: false, verifiedUntil: null } : null);
  }, []);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError('');
    void readPlatformAccess(cancellation.signal).then(result => {
      if (!cancellation.signal.aborted && current()) setState(result);
    }).catch(failure => {
      if (!cancellation.signal.aborted && current()) { setError(getErrorMessage(failure, '平台身份核验失败')); setState(null); }
    }).finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [revision]);

  useEffect(() => {
    if (!state?.verified || !state.verifiedUntil) return;
    const timeout = window.setTimeout(invalidate, Math.max(0, state.verifiedUntil - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [state?.verified, state?.verifiedUntil, invalidate]);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!state?.configured || !password || busy) return;
    setBusy(true); setError('');
    try {
      const result = await verifyPlatformAccess(password, state.totpRequired ? code : undefined);
      if (current()) setState(result);
    } catch (failure) {
      if (current()) {
        invalidate(); setError(getErrorMessage(failure, '再次验证失败'));
        try {
          const latest = await readPlatformAccess();
          if (current()) setState({ ...latest, verified: false, verifiedUntil: null });
        } catch {
          if (current()) setState(null);
        }
      }
    } finally {
      if (current()) { setPassword(''); setCode(''); setBusy(false); }
    }
  };

  if (loading) return <p className="card p-6 text-sm" role="status">正在核验平台管理身份…</p>;
  if (!state?.configured) return <section className="card space-y-4 p-6" aria-label="平台管理未开放">
    <LockKeyhole size={24} className="text-cf-muted" />
    <p role={error ? 'alert' : 'status'} className="text-sm">{error || state?.message || '平台管理暂不可用'}</p>
    <Button variant="outline" className="min-h-11" onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} />重新核验</Button>
  </section>;
  if (!state.verified || !state.verifiedUntil || state.verifiedUntil <= Date.now()) return <section className="card p-6" aria-label="平台操作身份验证">
    <form onSubmit={event => void verify(event)} className="max-w-md space-y-4">
      <h3 className="flex items-center gap-2 font-medium"><ShieldCheck size={20} />再次验证平台身份</h3>
      <p className="text-sm text-cf-muted">请输入当前账号密码；通过后五分钟内可执行平台操作。</p>
      <label className="block space-y-2 text-sm">当前账号密码<Input className="min-h-11" required type="password" autoComplete="current-password" maxLength={256} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
      {state.totpRequired && <label className="block space-y-2 text-sm">六位动态验证码<Input className="min-h-11" required pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button className="min-h-11" type="submit" disabled={busy}>{busy ? '验证中…' : '验证身份'}</Button>
    </form>
  </section>;
  return <>
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <p className="flex items-center gap-2"><ShieldCheck size={18} />平台身份已验证，有效至{new Date(state.verifiedUntil).toLocaleTimeString('zh-CN', { hour12: false })}</p>
      <Button variant="outline" className="min-h-11" onClick={invalidate}>重新验证身份</Button>
    </div>
    {children(invalidate)}
  </>;
}

export function PlatformOperationGate({ permission, children }: Props) {
  const { user } = useAuth();
  const scope = `${user?.id ?? ''}:${user?.tenantId ?? ''}:${getAuthToken() ?? ''}`;
  return <PermissionGuard permissions={[permission]}><BoundPlatformGate key={scope}>{children}</BoundPlatformGate></PermissionGuard>;
}
