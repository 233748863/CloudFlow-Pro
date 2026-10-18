import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button, Input } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { portal, PortalError, type PortalSession } from '@/services/portal';
import './portal.css';

export default function PortalPage({ mode }: { mode: 'login' | 'activate' | 'session' }) {
  const { tenantCode = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const validTenant = /^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(tenantCode);
  const [activationToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [profile, setProfile] = useState<PortalSession>();
  const [available, setAvailable] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [checking, setChecking] = useState(true);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activated, setActivated] = useState(false);
  const [discard, setDiscard] = useState(false);
  const lock = useRef(false);
  const title = mode === 'activate' ? '激活客户账号' : mode === 'session' ? '客户门户' : '登录客户门户';
  const loginPath = `/portal/${encodeURIComponent(tenantCode)}/login`;
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true); setAvailable(false); setAvailabilityError(''); setProfile(undefined); setError('');
    if (!validTenant) { setAvailabilityError('企业代码无效，请使用邀请邮件中的地址'); setChecking(false); return; }
    const load = async () => {
      try {
        await portal.status(tenantCode, controller.signal);
        if (mode === 'session') {
          const session = await portal.session(tenantCode, controller.signal);
          if (!controller.signal.aborted) setProfile(session);
        }
        if (!controller.signal.aborted) setAvailable(true);
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (mode === 'session' && failure instanceof PortalError && failure.code === 401) void navigate(loginPath, { replace: true, state: { message: '门户登录状态已失效，请重新登录。' } });
        else setAvailabilityError(failure instanceof Error ? failure.message : '客户门户暂不可用');
      } finally { if (!controller.signal.aborted) setChecking(false); }
    };
    void load();
    return () => controller.abort();
  }, [tenantCode, mode, revision, validTenant, loginPath, navigate]);
  useEffect(() => {
    if (!password || activated) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [password, activated]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current || !available) return;
    setError('');
    if (mode === 'activate' && (password !== confirmation || [...password].length < 12 || [...password].length > 64 || new TextEncoder().encode(password).length > 72)) {
      setError(password !== confirmation ? '两次输入的密码不一致' : '密码须为12—64字符，UTF-8编码不超过72字节'); return;
    }
    lock.current = true; setBusy(true);
    try {
      if (mode === 'activate') { await portal.activate(tenantCode, activationToken, password); setActivated(true); }
      else { await portal.login(tenantCode, account.trim(), password); void navigate(`/portal/${encodeURIComponent(tenantCode)}`, { replace: true }); }
      setPassword(''); setConfirmation('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '请求未成功，输入已保留'); }
    finally { lock.current = false; setBusy(false); }
  };
  const logout = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    let message = '已退出客户门户。';
    try { await portal.logout(tenantCode); } catch { message = '本页已退出；服务器会话注销未确认，原会话将按有效期失效。'; }
    finally { lock.current = false; setBusy(false); void navigate(loginPath, { replace: true, state: { message } }); }
  };
  const stateMessage = typeof location.state?.message === 'string' ? location.state.message : '';
  const liveInvitation = /^[A-Za-z0-9_-]{43}$/.test(activationToken);
  return <main className="portal-page portal-controls"><section className="portal-card" aria-labelledby="portal-title">
    <header className="portal-header"><ShieldCheck size={28} aria-hidden="true" /><div><p className="text-xs text-cf-muted">CloudFlow Pro · 客户服务</p><h1 id="portal-title" className="mt-1 text-xl font-semibold">{title}</h1></div></header>
    <p className="mt-5 text-sm leading-6 text-cf-muted">客户账号仅通过联系人邀请开通，与内部员工账号独立。</p>
    {checking && <p role="status" className="mt-4 text-sm">正在确认门户状态…</p>}
    {availabilityError && <div className="portal-notice" role="alert"><p>{availabilityError}</p><Button className="mt-3" variant="outline" disabled={checking || busy} onClick={() => setRevision(value => value + 1)}>重新检查</Button></div>}
    {stateMessage && <p role="status" className="portal-notice">{stateMessage}</p>}
    {mode === 'session' ? profile && <div className="mt-6 space-y-5"><dl className="space-y-3 text-sm"><div><dt className="text-cf-muted">所属客户</dt><dd className="mt-1 break-words font-medium">{profile.customerName}</dd></div><div><dt className="text-cf-muted">联系人</dt><dd className="mt-1 break-words">{profile.contactName}</dd></div><div><dt className="text-cf-muted">登录账号</dt><dd className="mt-1 break-all">{profile.loginAccount}</dd></div></dl>
      <Button className="w-full" onClick={() => void navigate(`/portal/${encodeURIComponent(tenantCode)}/tickets`)}>客户工单</Button>
      <Button className="w-full" variant="outline" onClick={() => void navigate(`/portal/${encodeURIComponent(tenantCode)}/knowledge`)}>客户知识库</Button>
      <Button className="w-full" variant="outline" onClick={() => void navigate(`/portal/${encodeURIComponent(tenantCode)}/contracts`)}>本公司合同</Button>
      <Button className="w-full" variant="outline" onClick={() => void navigate(`/portal/${encodeURIComponent(tenantCode)}/finance`)}>本公司财务记录</Button>
      <p className="portal-notice">查看本公司的工单、合同和已公开财务记录，或查阅客户知识库。</p><Button className="w-full" variant="outline" disabled={busy} onClick={() => void logout()}>{busy ? '正在退出…' : '退出客户门户'}</Button></div> : activated ? <div className="mt-6 space-y-4"><p role="status">账号已激活，请使用邀请中的登录账号和刚设置的密码登录。</p><Button className="w-full" onClick={() => void navigate(loginPath, { replace: true })}>前往登录</Button></div> : <form className="mt-6 space-y-4" onSubmit={event => void submit(event)}>
      <label className="portal-field"><span>企业代码</span><Input value={tenantCode} readOnly /></label>
      {mode === 'login' && <label className="portal-field"><span>登录账号</span><Input autoComplete="username" maxLength={100} value={account} disabled={busy} onChange={event => setAccount(event.target.value)} required /></label>}
      {mode === 'activate' && <p className="text-sm leading-6 text-cf-muted">密码须包含大写字母、小写字母、数字和符号，12—64字符且UTF-8编码不超过72字节；不能包含账号信息或常见弱口令。</p>}
      <label className="portal-field"><span>{mode === 'activate' ? '设置密码' : '密码'}</span><Input type="password" autoComplete={mode === 'activate' ? 'new-password' : 'current-password'} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} required /></label>
      {mode === 'activate' && <label className="portal-field"><span>确认密码</span><Input type="password" autoComplete="new-password" maxLength={128} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} required /></label>}
      {mode === 'activate' && !liveInvitation && <p role="alert" className="portal-notice">未取得有效邀请，请重新打开邀请邮件中的链接。刷新页面后需要重新打开原链接。</p>}
      {error && <p role="alert" className="portal-notice">{error}{mode === 'activate' && ' 若上次提交后连接中断，可先用刚设置的密码登录核对，勿重复索取邀请。'}</p>}
      <Button className="w-full" type="submit" disabled={busy || !available || mode === 'activate' && !liveInvitation}>{busy ? '正在处理…' : mode === 'activate' ? '设置密码并激活' : '登录'}</Button>
      {mode === 'activate' && <Button className="w-full" type="button" variant="outline" disabled={busy} onClick={() => { if (password) setDiscard(true); else void navigate(loginPath); }}>前往登录核对</Button>}
    </form>}
    <footer className="mt-6 text-xs leading-5 text-cf-muted">登录最长有效8小时，连续30分钟无操作后需重新登录。连续5次密码错误锁定15分钟。</footer>
  </section><BaseDialog open={discard} title="离开密码设置页面？" onClose={() => setDiscard(false)} panelClassName="portal-controls" footer={<><Button variant="outline" onClick={() => setDiscard(false)}>继续设置</Button><Button onClick={() => { setPassword(''); setConfirmation(''); setDiscard(false); void navigate(loginPath); }}>前往登录</Button></>}><p className="text-sm">当前密码输入将清空；已提交的激活结果可通过登录核对。</p></BaseDialog></main>;
}
