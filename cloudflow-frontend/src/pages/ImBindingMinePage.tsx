import React, { useEffect, useRef, useState } from 'react';
import { Link2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button, Input } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getAuthSessionVersion, getAuthToken } from '@/utils/authStorage';
import { authorizeImBinding, confirmImBinding, getImBinding, getImBindingIdentity, getImBindingPending, imBindingDestination, imBindingError,
  verifyImBindingIdentity, getImUnbindingIdentity, verifyImUnbindingIdentity, unbindImAccount,
  type ImBindingIdentity, type ImBindingOverview, type ImBindingPending } from '@/services/api/imBinding';
import { InfrastructureBadge, InfrastructurePageHeader } from './system/_components/InfrastructurePrimitives';
import './system/im-config.css';

const sources: Record<string, string> = { AUTO_SYNC: '组织同步', SCAN_BIND: '本人扫码', MANUAL_BIND: '管理员绑定' };
const statuses: Record<string, string> = { ACTIVE: '有效', DISABLED: '已停用', OUT_OF_SCOPE: '已停止范围同步' };

function BindingWorkspace() {
  const { user, hasPermission } = useAuth();
  const [overview, setOverview] = useState<ImBindingOverview | null>(null);
  const [identity, setIdentity] = useState<ImBindingIdentity | null>(null);
  const [pending, setPending] = useState<ImBindingPending | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [unbindConfirmed, setUnbindConfirmed] = useState(false);
  const [returnState] = useState(() => new URLSearchParams(window.location.search).get('imBinding'));
  const owner = useRef(getAuthSessionVersion());
  const active = useRef(true);
  const submitting = useRef(false);
  const action = useRef<AbortController | null>(null);
  const current = () => active.current && owner.current === getAuthSessionVersion();
  const secure = window.location.protocol === 'https:';
  const permitted = hasPermission('system:im:binding:bind');
  const unbindPermitted = hasPermission('system:im:binding:unbind');
  const refresh = () => { setPassword(''); setCode(''); setUnbindConfirmed(false); setRevision(value => value + 1); };

  useEffect(() => {
    active.current = true;
    if (returnState != null) {
      const address = new URL(window.location.href); address.searchParams.delete('imBinding');
      window.history.replaceState(window.history.state, '', address.pathname + address.search + address.hash);
    }
    return () => { active.current = false; action.current?.abort(); };
  }, []);

  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError(''); setIdentity(null); setPending(null);
    void (async () => {
      const result = await getImBinding(cancellation.signal);
      if (cancellation.signal.aborted || !current()) return;
      setOverview(result); setUncertain(false);
      if (result.binding && result.canUnbind && unbindPermitted && secure) {
        const local = await getImUnbindingIdentity(cancellation.signal);
        if (!cancellation.signal.aborted && current()) setIdentity(local);
        return;
      }
      if (!result.canBind || !permitted || !secure) return;
      const local = await getImBindingIdentity(cancellation.signal);
      if (cancellation.signal.aborted || !current()) return;
      setIdentity(local);
      const external = await getImBindingPending(cancellation.signal);
      if (cancellation.signal.aborted || !current()) return;
      setPending(external);
      if (revision === 0 && returnState === 'error') setError('企业微信身份核实未完成，请重新验证后扫码。');
      if (revision === 0 && returnState === 'ready' && !external) setError('未取得有效的企业微信身份证明，请重新验证后扫码。');
    })().catch(failure => {
      if (!cancellation.signal.aborted && current()) { setPending(null); setError(imBindingError(failure, '读取绑定状态失败，请刷新重试')); }
    }).finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [revision, permitted, unbindPermitted, secure]);

  useEffect(() => {
    if (!identity?.verified || !identity.expiresAt) return;
    const timeout = window.setTimeout(() => {
      if (current()) { setIdentity(previous => previous ? { ...previous, verified: false, expiresAt: null } : null); setPending(null); setPassword(''); setCode(''); }
    }, Math.max(0, Math.min(2147483647, identity.expiresAt - Date.now())));
    return () => window.clearTimeout(timeout);
  }, [identity]);

  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (submitting.current || !current() || loading || uncertain) return;
    submitting.current = true; setBusy(true); setError('');
    const cancellation = new AbortController(); action.current = cancellation;
    try { await operation(cancellation.signal); }
    catch (failure) { if (current() && !cancellation.signal.aborted) setError(imBindingError(failure, '操作未完成，请刷新核对后重试')); }
    finally { if (current()) { submitting.current = false; setBusy(false); setPassword(''); setCode(''); } }
  };

  const verify = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async signal => {
      const verifyIdentity = overview?.binding ? verifyImUnbindingIdentity : verifyImBindingIdentity;
      const result = await verifyIdentity(password, identity?.totpRequired ? code : null, signal);
      if (current()) { setIdentity(result); setPending(null); setUnbindConfirmed(false); }
    });
  };

  const authorize = () => void run(async signal => {
    const result = await authorizeImBinding(signal);
    if (current()) window.location.assign(imBindingDestination(result.authorizationUrl));
  });

  const confirm = () => void run(async signal => {
    try {
      const result = await confirmImBinding(signal);
      if (current()) { setOverview({ binding: result, canBind: false, reasonCode: null, message: null }); setPending(null); setIdentity(null); refresh(); }
    } catch (failure) {
      if (current()) { setUncertain(true); setPending(null); }
      throw failure;
    }
  });

  const binding = overview?.binding;
  const unbind = () => void run(async signal => {
    if (!binding || !unbindConfirmed || !unbindPermitted || !overview?.canUnbind) return;
    try {
      await unbindImAccount(binding, signal);
      if (current()) { setOverview(null); setIdentity(null); setPending(null); refresh(); }
    } catch (failure) {
      if (current()) { setUncertain(true); setIdentity(null); setUnbindConfirmed(false); }
      throw failure;
    }
  });
  const verified = identity?.verified && identity.expiresAt != null && identity.expiresAt > Date.now();
  const canStart = !loading && !binding && overview?.canBind && permitted && secure && !uncertain;
  const canRemove = !loading && binding && binding.bindType !== 'AUTO_SYNC' && overview?.canUnbind && unbindPermitted && secure && !uncertain;
  return <div className="im-binding-workspace space-y-5">
    <InfrastructurePageHeader kicker="本人账号" title="我的通信绑定" description="核实当前账号与企业微信成员身份，最后由您确认建立绑定。">
      <Button variant="outline" disabled={busy || loading} onClick={refresh}><RefreshCw size={16} />刷新</Button>
    </InfrastructurePageHeader>
    <section className="card flex items-start gap-3 p-5 text-sm"><ShieldCheck size={20} className="shrink-0" /><p>只操作当前本人账号；扫码成功后仍需确认。绑定不会增加业务权限，也不会自动开启企业微信登录。</p></section>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {uncertain && <p role="status" className="card p-5">提交结果尚未确认，请点击刷新核对实际绑定；本次不会自动重复提交。</p>}
    {loading ? <p role="status" className="card p-6">正在读取本人绑定…</p> : overview && <section className="card space-y-3 p-5" aria-label="当前通信绑定">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Link2 size={18} />当前绑定</h2><InfrastructureBadge tone={binding?.status === 'ACTIVE' ? 'success' : 'neutral'}>{binding ? statuses[binding.status] ?? '状态待核对' : '未绑定'}</InfrastructureBadge></div>
      <p className="text-sm break-words">本地账号：{user?.username ?? user?.name ?? '当前本人账号'}</p>
      {binding ? <><p className="text-sm break-all">企业微信账号：{binding.externalAccount}</p><p className="text-sm text-cf-muted">来源：{sources[binding.bindType] ?? '待核对'} · 绑定时间：{binding.bindTime}</p><p className="text-sm text-cf-muted">{binding.bindType === 'AUTO_SYNC' ? '组织同步建立的绑定仅可由管理员通过管理入口解除。' : overview.canUnbind ? '解除后保留本地账号、原有权限和业务记录；企业微信账号将不能再通过此绑定登录。' : overview.unbindMessage ?? '当前账号无权解除此绑定。'}</p></> : <p className="text-sm text-cf-muted">{overview.canBind ? '完成下方三步后建立本人绑定。' : overview.message ?? '企业微信绑定暂未启用。'}</p>}
    </section>}
    {!secure && <p role="status" className="card p-5 text-sm">本人绑定需通过本系统HTTPS页面操作，当前地址不能发起身份验证或绑定。</p>}
    {(canStart || canRemove) && <section className="card space-y-5 p-5" aria-label={canRemove ? '本人解绑操作' : '本人绑定操作'}>
      <h2 className="font-semibold">1. 验证本人身份</h2>
      {!identity ? <p className="text-sm text-cf-muted">身份验证状态未能读取，请刷新核对。</p> : !verified ? <form onSubmit={verify} className="max-w-md space-y-4">
        <p className="text-sm text-cf-muted">请输入当前账号密码；已登记动态验证码时必须同时验证，有效期五分钟。</p>
        <label className="block space-y-2 text-sm">当前账号密码<Input required type="password" autoComplete="current-password" maxLength={256} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        {identity.totpRequired && <label className="block space-y-2 text-sm">六位动态验证码<Input required pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>}
        <Button type="submit" disabled={busy}>{busy ? '验证中…' : '验证本人身份'}</Button>
      </form> : <p role="status" className="text-sm">身份已验证，有效至{new Date(identity.expiresAt!).toLocaleTimeString('zh-CN', { hour12: false })}；{canRemove ? '仅用于本次解绑确认。' : '扫码不会延长有效期。'}</p>}
      {canRemove ? <div className="space-y-3 border-t border-cf-border pt-5"><h2 className="font-semibold">2. 确认解除绑定</h2>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={unbindConfirmed} disabled={busy || !verified} onChange={event => setUnbindConfirmed(event.target.checked)} />我已核对当前企业微信账号，确认解除此绑定</label>
        <Button variant="outline" disabled={busy || !verified || !unbindConfirmed} onClick={unbind}>{busy ? '正在提交…' : '确认解除绑定'}</Button>
      </div> : <><div className="space-y-3 border-t border-cf-border pt-5"><h2 className="font-semibold">2. 扫码核实企业微信身份</h2><p className="text-sm text-cf-muted">将前往企业微信官方授权页，请使用需要绑定的企业成员账号扫码。</p><Button variant="outline" disabled={busy || !verified} onClick={authorize}>前往企业微信扫码</Button></div>
      <div className="space-y-3 border-t border-cf-border pt-5"><h2 className="font-semibold">3. 确认建立绑定</h2>
        {pending && verified && pending.expiresAt > Date.now() ? <><p className="text-sm break-all">将本人账号与企业微信成员“{pending.externalAccount}”绑定，请核对后确认。</p><Button disabled={busy} onClick={confirm}>{busy ? '正在提交…' : '确认绑定此企业微信账号'}</Button></> : <p className="text-sm text-cf-muted">等待有效的企业微信身份证明；未确认前不会建立绑定。</p>}
      </div></>}
    </section>}
  </div>;
}

export default function ImBindingMinePage() {
  const { user, hasPermission } = useAuth();
  if (!hasPermission('system:im:binding:mine')) return <p role="alert" className="card p-6">您没有查看本人通信绑定的权限。</p>;
  return <BindingWorkspace key={`${user?.id ?? ''}:${user?.tenantId ?? ''}:${getAuthToken() ?? ''}:${getAuthSessionVersion()}`} />;
}
