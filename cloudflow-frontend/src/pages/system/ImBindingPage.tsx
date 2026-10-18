import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { BaseDialog, Button, Input } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getAuthSessionVersion } from '@/utils/authStorage';
import { getImManagementIdentity, imBindingError, listImManagedBindings, manageImBinding, verifyImManagementIdentity } from '@/services/api/imBinding';
import type { ImBindingIdentity, ImManagedBinding, ImManagementAction } from '@/services/api/imBinding';
import { InfrastructureBadge, InfrastructurePageHeader } from './_components/InfrastructurePrimitives';
import './im-config.css';

const sources: Record<string, string> = { AUTO_SYNC: '组织同步', SCAN_BIND: '本人扫码', MANUAL_BIND: '管理员绑定' };
const states: Record<string, string> = { ACTIVE: '有效', DISABLED: '已停用', OUT_OF_SCOPE: '已退出范围管理' };
type Selection = { binding: ImManagedBinding; action: ImManagementAction };

function Workspace() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<ImManagedBinding[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [identity, setIdentity] = useState<ImBindingIdentity | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [actionError, setActionError] = useState('');
  const owner = useRef(getAuthSessionVersion());
  const active = useRef(true);
  const submitting = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const current = () => active.current && owner.current === getAuthSessionVersion();
  const secure = window.location.protocol === 'https:';
  const allowed = hasPermission('system:im:binding:manage');

  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort(); }; }, []);
  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError(''); setRows([]);
    void listImManagedBindings(page, cancellation.signal).then(result => {
      if (cancellation.signal.aborted || !current()) return;
      setRows(result.rows); setTotal(result.total); setUncertain(false);
    }).catch(failure => {
      if (!cancellation.signal.aborted && current()) setError(imBindingError(failure, '读取绑定失败，请刷新核对'));
    }).finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [page, revision]);

  useEffect(() => {
    const cancellation = new AbortController();
    setIdentity(null); setPassword(''); setCode(''); setConfirmed(false); setActionError('');
    if (selection && secure) void getImManagementIdentity(selection.action, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted && current()) setIdentity(result);
    }).catch(failure => {
      if (!cancellation.signal.aborted && current()) setActionError(imBindingError(failure, '当前无法验证管理操作，请关闭后刷新'));
    });
    return () => cancellation.abort();
  }, [selection, secure]);

  useEffect(() => {
    if (!identity?.verified || identity.expiresAt == null) return;
    const timeout = window.setTimeout(() => {
      setIdentity(value => value ? { ...value, verified: false, expiresAt: null } : null); setConfirmed(false);
    }, Math.max(0, identity.expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [identity]);

  const close = () => {
    if (submitting.current) return;
    pending.current?.abort(); setSelection(null); setPassword(''); setCode('');
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selection || !identity || !secure || !allowed || submitting.current || uncertain || !current()) return;
    const cancellation = new AbortController(); pending.current = cancellation; submitting.current = true; setBusy(true); setActionError('');
    try {
      const result = await verifyImManagementIdentity(selection.action, password, identity.totpRequired ? code : null, cancellation.signal);
      if (current() && !cancellation.signal.aborted) setIdentity(result);
    } catch (failure) { if (current() && !cancellation.signal.aborted) setActionError(imBindingError(failure, '验证未完成，请重新验证')); }
    finally { submitting.current = false; if (current()) { setBusy(false); setPassword(''); setCode(''); } }
  };
  const submit = async () => {
    if (!selection || !identity?.verified || !identity.expiresAt || identity.expiresAt <= Date.now() || !confirmed
      || !secure || !allowed || submitting.current || uncertain || !current()) return;
    const cancellation = new AbortController(); pending.current = cancellation; submitting.current = true; setBusy(true); setActionError('');
    try {
      await manageImBinding(selection.action, selection.binding, cancellation.signal);
      if (current() && !cancellation.signal.aborted) { setSelection(null); setRevision(value => value + 1); }
    } catch (failure) {
      if (current() && !cancellation.signal.aborted) {
        setUncertain(true); setIdentity(null); setActionError(imBindingError(failure, '操作结果尚未确认，请关闭后刷新核对'));
      }
    } finally { submitting.current = false; if (current()) setBusy(false); }
  };
  const verified = identity?.verified && identity.expiresAt != null && identity.expiresAt > Date.now();

  return <div className="im-config-page space-y-5">
    <InfrastructurePageHeader kicker="企业通信" title="通信绑定管理" description="核对员工的企业微信绑定，管理组织同步的纳入状态。"><Button variant="outline" disabled={loading || busy} onClick={() => { close(); setRevision(value => value + 1); }}><RefreshCw size={16} />刷新</Button></InfrastructurePageHeader>
    <div className="card flex items-start gap-3 p-4 text-sm"><ShieldCheck size={20} className="shrink-0" /><p>解除组织同步绑定后保留本地账号，后续同步持续跳过该员工；管理员重新纳入后才恢复。重新纳入不会启用已停用的本地账号。</p></div>
    {!secure && <p role="status" className="card p-4 text-sm">管理操作需要通过 HTTPS 安全地址访问；当前仅可查询。</p>}
    {error && <p role="alert" className="card p-4 text-sm">{error}</p>}
    {loading ? <p role="status" className="card p-4">正在读取绑定…</p> : !error && rows.length === 0 ? <p className="card p-6">暂无通信绑定记录。</p> : <div className="grid gap-4 lg:grid-cols-2">{rows.map(binding => {
      const stopped = binding.bindType === 'AUTO_SYNC' && binding.status === 'DISABLED';
      return <article key={binding.mappingId} className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="break-all font-semibold">{binding.name || binding.account || '本地账号已移除'}</h2><InfrastructureBadge tone={binding.status === 'ACTIVE' ? 'success' : 'neutral'}>{stopped ? '已解除绑定，停止管理' : states[binding.status] ?? '状态待核对'}</InfrastructureBadge></div>
        <p className="break-all text-sm">本地账号：{binding.account ?? '已移除'}</p><p className="break-all text-sm">企业微信账号：{binding.externalAccount}</p>
        <p className="text-sm text-cf-muted">来源：{sources[binding.bindType] ?? '待核对'} · 最近同步：{binding.lastSyncTime ?? '尚未同步'}</p>
        {allowed && <div className="flex flex-wrap gap-3">{binding.canUnbind && <Button variant="outline" disabled={!secure || loading || busy || uncertain} onClick={() => setSelection({ binding, action: 'unbind' })}>解除绑定</Button>}{binding.canResume && <Button variant="outline" disabled={!secure || loading || busy || uncertain} onClick={() => setSelection({ binding, action: 'resume' })}>重新纳入</Button>}</div>}
      </article>;
    })}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>共 {total} 条 · 第 {page} 页</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || loading || busy} onClick={() => setPage(value => value - 1)}>上一页</Button><Button variant="outline" disabled={page * 20 >= total || loading || busy} onClick={() => setPage(value => value + 1)}>下一页</Button></div></div>
    <BaseDialog open={selection !== null} title={selection?.action === 'resume' ? '重新纳入组织同步' : '解除通信绑定'} onClose={close} panelClassName="im-config-dialog">
      {selection && <div className="space-y-4 text-sm">
        <p className="break-all">本地账号：{selection.binding.account ?? '已移除'}<br />企业微信账号：{selection.binding.externalAccount}</p>
        <p>{selection.action === 'resume' ? '恢复此绑定和组织同步；后续同步可更新该员工资料。' : selection.binding.bindType === 'AUTO_SYNC' ? '解除后保留本地账号并停止同步管理，管理员重新纳入后才恢复。' : '解除后保留本地账号、原权限及业务记录。'}{selection.action === 'unbind' && '该企业微信账号将不能再通过此绑定登录。'}</p>
        {actionError && <p role="alert">{actionError}</p>}
        {uncertain ? <p role="status">结果或版本尚未确认，请关闭后刷新列表核对；当前禁止重复提交。</p> : !identity ? <p role="status">当前操作尚未取得可用的身份验证状态。</p> : !verified ? <form onSubmit={verify} className="space-y-4">
          <label className="block space-y-2">当前密码<Input type="password" autoComplete="current-password" required maxLength={256} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
          {identity.totpRequired && <label className="block space-y-2">动态验证码<Input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} disabled={busy} onChange={event => setCode(event.target.value)} /></label>}
          <Button type="submit" disabled={busy || !password}>{busy ? '正在验证…' : '验证管理员身份'}</Button>
        </form> : <><p role="status">管理员身份已验证，仅用于本次操作。</p><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />我已核对账号，并确认上述操作</label><Button disabled={busy || !confirmed} onClick={submit}>{busy ? '正在提交…' : selection.action === 'resume' ? '确认重新纳入' : '确认解除绑定'}</Button></>}
        <Button variant="outline" disabled={busy} onClick={close}>关闭</Button>
      </div>}
    </BaseDialog>
  </div>;
}

export default function ImBindingPage() {
  const { user, hasPermission } = useAuth();
  if (!hasPermission('system:im:binding:list')) return <p role="alert" className="card p-6">您没有查看通信绑定管理的权限。</p>;
  return <Workspace key={`${user?.tenantId}:${user?.id}:${getAuthSessionVersion()}`} />;
}
