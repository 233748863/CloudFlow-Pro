import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/utils/authStorage';
import { beginOauthAuthorization, confirmOauthAuthorization, oauthError, oauthReturnUrl, type OauthAuthorization } from '@/services/api/oauth2';
import './system/oauth2.css';

function Authorization({ search }: { search: string }) {
  const [view, setView] = useState<OauthAuthorization | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [spent, setSpent] = useState(false);
  const [now, setNow] = useState(Date.now());
  const active = useRef(true);
  const submitting = useRef(false);
  const token = useRef(getAuthToken());
  const current = () => active.current && token.current === getAuthToken();
  const follow = (result: OauthAuthorization) => {
    if (!result.redirectUrl) throw new Error('应用返回地址缺失，请重新发起授权');
    const destination = oauthReturnUrl(result.redirectUrl, new URLSearchParams(search).get('redirect_uri'));
    setSpent(true); setView(null);
    window.location.replace(destination);
  };

  useEffect(() => {
    active.current = true;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const previous = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const original = previous?.content;
    const meta = previous ?? document.createElement('meta');
    meta.name = 'referrer'; meta.content = 'no-referrer';
    if (!previous) document.head.append(meta);
    return () => {
      active.current = false;
      window.clearInterval(timer);
      if (previous) previous.content = original ?? ''; else meta.remove();
    };
  }, []);

  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setView(null); setError(''); setSpent(false);
    void beginOauthAuthorization(search, cancellation.signal).then(result => {
      if (cancellation.signal.aborted || !current()) return;
      if (result.redirectUrl) { follow(result); return; }
      if (!result.requestToken || !result.scopes.length) throw new Error('授权请求不完整，请从应用重新发起');
      setView(result); setSelected(result.scopes.map(scope => scope.code));
    }).catch(failure => {
      if (!cancellation.signal.aborted && current()) setError(oauthError(failure, '读取授权请求失败，入口可能尚未启用'));
    }).finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [search]);

  const confirm = async (approve: boolean) => {
    if (!view?.requestToken || submitting.current || spent) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const result = await confirmOauthAuthorization(view.requestToken, approve, approve ? selected : []);
      if (current()) follow(result);
    } catch (failure) {
      if (current()) {
        setSpent(true);
        setError(oauthError(failure, '授权结果尚未确认，请回到原应用重新发起，避免重复提交'));
      }
    } finally { if (current()) { setBusy(false); submitting.current = false; } }
  };

  const expires = view ? new Date(view.expiresTime.replace(' ', 'T')).getTime() : 0;
  const expired = !!view && (!Number.isFinite(expires) || expires <= now);
  return <section className="oauth2-workspace card mx-auto w-full max-w-2xl space-y-6 p-6" aria-label="第三方授权确认">
    <ShieldCheck size={32} className="text-cf-muted" />
    <div className="space-y-2"><h1 className="text-xl font-semibold">{view ? `${view.clientName} 请求访问` : '第三方应用授权'}</h1>
      <p className="text-sm text-cf-muted">仅开放您同意的只读范围，您可随时在“我的第三方授权”中撤销。</p></div>
    {loading && <p role="status">正在核验应用和授权范围…</p>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {view && <>
      {view.description && <p className="whitespace-pre-wrap break-words text-sm">{view.description}</p>}
      <fieldset disabled={busy || spent || expired} className="space-y-3"><legend className="mb-3 text-sm font-medium">选择允许访问的范围</legend>
        {view.scopes.map(scope => <label key={scope.code} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-[var(--cf-border)] p-4">
          <input type="checkbox" className="mt-1" checked={selected.includes(scope.code)} onChange={event => setSelected(previous => event.target.checked ? [...previous, scope.code] : previous.filter(code => code !== scope.code))} />
          <span className="space-y-1"><span className="block font-medium">{scope.title}</span><span className="block text-sm text-cf-muted">{scope.description}</span></span>
        </label>)}
      </fieldset>
      <p className="text-xs text-cf-subtle">确认有效至 {view.expiresTime}，仅当前登录会话可以操作。</p>
      {expired && <p role="status" className="text-sm">确认已过期，请回到原应用重新发起授权。</p>}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" disabled={busy || spent || expired} onClick={() => void confirm(false)}>拒绝授权</Button>
        <Button disabled={busy || spent || expired || selected.length === 0} onClick={() => void confirm(true)}>{busy ? '正在处理…' : '确认授权'}</Button>
      </div>
    </>}
    {spent && <p role="status" className="text-sm">本次确认已停止接受提交；如未返回原应用，请从原应用重新发起。</p>}
    <Link className="inline-flex min-h-11 items-center text-sm underline" to="/workspace/oauth2-grants">查看我的第三方授权</Link>
  </section>;
}

export default function OauthAuthorizationPage() {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();
  const scope = `${user?.id ?? ''}:${user?.tenantId ?? ''}:${getAuthToken() ?? ''}`;
  return <main className="min-h-screen bg-[var(--cf-bg)] px-4 py-8 text-[var(--cf-text)]">
    {loading ? <p role="status" className="text-center">正在核验登录身份…</p> : !user ? <section className="card mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-semibold">登录后确认应用授权</h1><p className="text-sm text-cf-muted">请先使用您本人的内部账号登录，再选择是否允许第三方访问。</p>
      <Link className="inline-flex min-h-11 items-center underline" to={`/login?redirect=${encodeURIComponent(`/oauth2/authorize${location.search}`)}`}>登录并返回授权确认</Link>
    </section> : !hasPermission('system:oauth2:authorize') ? <p role="alert" className="card mx-auto max-w-lg p-6">当前账号没有第三方授权权限。</p>
      : <Authorization key={scope} search={location.search} />}
  </main>;
}
