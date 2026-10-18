import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Pagination, PermissionGuard } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/utils/authStorage';
import { listOauthGrants, oauthError, oauthScopeTitles, revokeOauthGrant, type OauthGrant, type OauthPage } from '@/services/api/oauth2';
import { InfrastructureBadge, InfrastructurePageHeader } from './system/_components/InfrastructurePrimitives';
import './system/oauth2.css';

const statusNames = { ACTIVE: '有效授权', REVOKED: '已撤销', EXPIRED: '已过期', POLICY_CHANGED: '应用已停用或策略已变更' } as const;

function Grants() {
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10 });
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<OauthPage<OauthGrant> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<OauthGrant | null>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const active = useRef(true);
  const submitting = useRef(false);
  const token = useRef(getAuthToken());
  const current = () => active.current && token.current === getAuthToken();
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError('');
    void listOauthGrants(query, cancellation.signal).then(page => {
      if (!cancellation.signal.aborted && current()) setResult(page);
    }).catch(failure => {
      if (!cancellation.signal.aborted && current()) { setResult(null); setError(oauthError(failure, '读取本人授权失败')); }
    }).finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [query, revision]);

  const revoke = async () => {
    if (!selection || submitting.current || uncertain) return;
    submitting.current = true; setBusy(true); setActionError('');
    try {
      await revokeOauthGrant(selection.approveId, selection.version);
      if (current()) { setSelection(null); refresh(); toast.success('已撤销本人授权，相关访问令牌立即失效'); }
    } catch (failure) {
      if (current()) { setUncertain(true); setActionError(oauthError(failure, '撤销结果尚未确认，请关闭并刷新核对')); refresh(); }
    } finally { if (current()) { submitting.current = false; setBusy(false); } }
  };

  return <div className="oauth2-workspace space-y-5">
    <InfrastructurePageHeader kicker="本人账号" title="我的第三方授权" description="查看本人同意的应用及只读范围；撤销后需要重新确认才能继续访问。">
      <Button variant="outline" disabled={busy || loading} onClick={refresh}><RefreshCw size={16} />刷新</Button>
    </InfrastructurePageHeader>
    <div className="card flex items-start gap-3 p-4 text-sm"><ShieldCheck size={20} className="shrink-0" /><p>只显示您本人的同意记录，不包含客户端密钥或访问令牌；应用未配置或已停用时仍可撤销历史授权。</p></div>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {loading ? <p role="status" className="card p-6">正在读取本人授权…</p> : !error && !result?.rows.length ? <p className="card p-6" role="status">暂无第三方授权记录</p> : !error && <div className="grid gap-4 lg:grid-cols-2">
      {result?.rows.map(grant => <article key={grant.approveId} className="card min-w-0 space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="break-words font-semibold">{grant.clientName}</h2><InfrastructureBadge tone={grant.status === 'ACTIVE' ? 'success' : 'neutral'}>{statusNames[grant.status]}</InfrastructureBadge></div>
        <ul className="list-inside list-disc space-y-2 text-sm">{grant.scopes.map(scope => <li key={scope}>{oauthScopeTitles[scope] ?? scope}</li>)}</ul>
        <p className="text-xs text-cf-subtle">同意时间：{grant.approvedTime}<br />到期时间：{grant.expiresTime}</p>
        {grant.status !== 'REVOKED' && <PermissionGuard permissions={['system:oauth2:grant:revoke']} hidden><Button variant="outline" disabled={busy} onClick={() => { setActionError(''); setUncertain(false); setSelection(grant); }}>撤销授权</Button></PermissionGuard>}
      </article>)}
    </div>}
    <Pagination total={result?.total ?? 0} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => setQuery(previous => ({ ...previous, pageNum }))} onPageSizeChange={pageSize => setQuery({ pageNum: 1, pageSize })} />
    <BaseDialog open={selection !== null} title="撤销本人授权" panelClassName="oauth2-dialog" onClose={() => { if (!busy) setSelection(null); }}>
      {selection && <div className="space-y-5"><p className="text-sm">撤销对“{selection.clientName}”的授权后，该应用的相关访问令牌、刷新令牌和待确认请求立即失效。</p>
        <p className="text-sm text-cf-muted">不会变更您的内部业务权限。</p>
        {actionError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
        {uncertain && <p role="status" className="text-sm">请关闭确认框并刷新列表，核对实际状态；本次不会自动重复提交。</p>}
        <div className="flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setSelection(null)}>取消</Button><Button disabled={busy || uncertain} onClick={() => void revoke()}>{busy ? '撤销中…' : '确认撤销'}</Button></div>
      </div>}
    </BaseDialog>
  </div>;
}

export default function OauthGrantMinePage() {
  const { user, hasPermission } = useAuth();
  if (!hasPermission('system:oauth2:grant:list')) return <p role="alert" className="card p-6">您没有查看本人第三方授权的权限。</p>;
  return <Grants key={`${user?.id ?? ''}:${user?.tenantId ?? ''}:${getAuthToken() ?? ''}`} />;
}
