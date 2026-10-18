import React, { useEffect, useRef, useState } from 'react';
import { Copy, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/utils/authStorage';
import { createOauthClient, disableOauthClient, listOauthClients, oauthError, oauthScopeTitles, updateOauthClient } from '@/services/api/oauth2';
import type { OauthClient, OauthClientSave, OauthOverview } from '@/services/api/oauth2';
import { platformHttpStatus } from '@/services/api/platformAccess';
import { PlatformOperationGate } from './_components/PlatformOperationGate';
import { InfrastructureBadge, InfrastructurePageHeader, InfrastructureSelect } from './_components/InfrastructurePrimitives';
import './oauth2.css';

const emptyForm = (tenantId: number): OauthClientSave => ({ tenantId, clientType: 'CONFIDENTIAL', clientName: '', description: '',
  accessTokenValiditySeconds: 900, refreshTokenValiditySeconds: 604800, redirectUris: [], grantTypes: ['authorization_code'],
  scopes: ['profile'], autoApproveScopes: [], status: 'DISABLED', secretAction: 'GENERATE' });
const formFrom = (client: OauthClient): OauthClientSave => ({ clientId: client.clientId, version: client.version,
  tenantId: client.tenantId, clientType: client.clientType, clientName: client.clientName, description: client.description ?? '',
  logoFileId: client.logoFileId, serviceUserId: client.serviceUserId, accessTokenValiditySeconds: client.accessTokenValiditySeconds,
  refreshTokenValiditySeconds: client.refreshTokenValiditySeconds, redirectUris: [...client.redirectUris], grantTypes: [...client.grantTypes],
  scopes: [...client.scopes], autoApproveScopes: [...client.autoApproveScopes], status: client.status, secretAction: 'KEEP' });

function ClientWorkspace({ invalidate }: { invalidate: () => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10 });
  const [revision, setRevision] = useState(0);
  const [overview, setOverview] = useState<OauthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<OauthClientSave | null>(null);
  const [redirects, setRedirects] = useState('');
  const [rotate, setRotate] = useState(false);
  const [selection, setSelection] = useState<OauthClient | null>(null);
  const [secret, setSecret] = useState<{ name: string; key: string; value: string } | null>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const active = useRef(true);
  const submitting = useRef(false);
  const token = useRef(getAuthToken());
  const authFailure = useRef(invalidate);
  authFailure.current = invalidate;
  const current = () => active.current && token.current === getAuthToken();
  const refresh = () => setRevision(value => value + 1);
  const fail = (failure: unknown, fallback: string) => {
    if (!current()) return;
    if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) { authFailure.current(); return; }
    setActionError(oauthError(failure, fallback));
  };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError('');
    void listOauthClients(query, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted && current()) setOverview(result);
    }).catch(failure => {
      if (!cancellation.signal.aborted && current()) {
        setOverview(null);
        if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) authFailure.current();
        else setError(oauthError(failure, '读取第三方应用失败'));
      }
    }).finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [query, revision]);

  const setField = <Key extends keyof OauthClientSave>(key: Key, value: OauthClientSave[Key]) => setForm(previous => previous ? { ...previous, [key]: value } : previous);
  const open = (client?: OauthClient) => {
    if (busy) return;
    setForm(client ? formFrom(client) : emptyForm(Number(user?.tenantId ?? 100000)));
    setRedirects(client?.redirectUris.join('\n') ?? ''); setRotate(false); setUncertain(false); setActionError('');
  };
  const grantChange = (grant: string, checked: boolean) => setForm(previous => {
    if (!previous) return previous;
    const grantTypes = checked ? [...previous.grantTypes, grant] : previous.grantTypes.filter(value => value !== grant);
    const code = grantTypes.includes('authorization_code');
    return { ...previous, grantTypes, scopes: code ? previous.scopes : previous.scopes.filter(value => value !== 'profile'),
      autoApproveScopes: code ? previous.autoApproveScopes : [], serviceUserId: grantTypes.includes('client_credentials') ? previous.serviceUserId : null };
  });
  const scopeChange = (code: string, checked: boolean) => setForm(previous => previous ? { ...previous,
    scopes: checked ? [...previous.scopes, code] : previous.scopes.filter(value => value !== code),
    autoApproveScopes: checked ? previous.autoApproveScopes : previous.autoApproveScopes.filter(value => value !== code) } : previous);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || submitting.current || uncertain) return;
    if (!form.scopes.length || !form.grantTypes.length) { setActionError('请至少选择一种授权模式和一个只读范围'); return; }
    submitting.current = true; setBusy(true); setActionError('');
    try {
      const replacement = rotate ? btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : undefined;
      const payload: OauthClientSave = { ...form, redirectUris: form.grantTypes.includes('authorization_code') ? redirects.split(/\r?\n/).map(value => value.trim()).filter(Boolean) : [],
        secretAction: form.clientId ? replacement ? 'REPLACE' : 'KEEP' : form.clientType === 'CONFIDENTIAL' ? 'GENERATE' : 'NONE', clientSecret: replacement };
      const saved = form.clientId ? { client: await updateOauthClient(payload), clientSecret: replacement } : await createOauthClient(payload);
      if (!current()) return;
      setForm(null); setRotate(false); refresh();
      if (saved.clientSecret) setSecret({ name: saved.client.clientName, key: saved.client.clientKey, value: saved.clientSecret });
      toast.success(form.clientId ? '配置已保存，旧授权和令牌已撤销' : '应用已创建，默认停用');
    } catch (failure) {
      if (current()) {
        setRotate(false);
        const status = platformHttpStatus(failure);
        setUncertain(status == null || status >= 500 || status === 409);
        fail(failure, '保存结果尚未确认，请关闭并刷新，核对版本后再操作'); refresh();
      }
    } finally { if (current()) { submitting.current = false; setBusy(false); } }
  };

  const disable = async () => {
    if (!selection || submitting.current || uncertain) return;
    submitting.current = true; setBusy(true); setActionError('');
    try {
      await disableOauthClient(selection.clientId, selection.version);
      if (current()) { setSelection(null); refresh(); toast.success('应用已停用，所有关联授权和令牌已撤销'); }
    } catch (failure) {
      if (current()) { setUncertain(true); fail(failure, '停用结果尚未确认，请关闭并刷新核对'); refresh(); }
    } finally { if (current()) { submitting.current = false; setBusy(false); } }
  };
  const copySecret = async () => {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret.value); toast.success('密钥已复制，请仅保存到应用的安全配置中'); }
    catch { setActionError('剪贴板不可用，请手动复制本次展示的密钥'); }
  };
  const codeGrant = form?.grantTypes.includes('authorization_code');
  const disabled = busy || uncertain;
  return <div className="oauth2-workspace space-y-5">
    <InfrastructurePageHeader kicker="平台治理" title="第三方应用客户端" description="登记应用、精确回调与只读范围；客户端不会获得内部通用登录权限。">
      <Button variant="outline" disabled={busy || loading} onClick={refresh}><RefreshCw size={16} />刷新</Button>
      <PermissionGuard permissions={['system:oauth2:client:manage']} hidden><Button disabled={busy || !overview} onClick={() => open()}><Plus size={16} />新增应用</Button></PermissionGuard>
    </InfrastructurePageHeader>
    <div className="card flex items-start gap-3 p-4 text-sm"><KeyRound size={20} className="shrink-0" /><p>{overview?.message ?? '正在读取部署可用性…'}</p></div>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {loading ? <p role="status" className="card p-6">正在读取应用…</p> : !error && !overview?.page.rows.length ? <p role="status" className="card p-6">暂无第三方应用</p> : !error && <div className="grid gap-4 xl:grid-cols-2">
      {overview?.page.rows.map(client => <article key={client.clientId} className="card min-w-0 space-y-4 p-5">
        <div className="flex flex-wrap justify-between gap-3"><h2 className="break-words font-semibold">{client.clientName}</h2><InfrastructureBadge tone={client.status === 'ACTIVE' ? 'success' : 'neutral'}>{client.status === 'ACTIVE' ? '已启用' : '已停用'}</InfrastructureBadge></div>
        <p className="text-sm text-cf-muted">企业 {client.tenantId} · {client.clientType === 'CONFIDENTIAL' ? '机密客户端' : '公共客户端'} · v{client.version}</p>
        <code className="block break-all text-xs">{client.clientKey}</code>
        <p className="text-sm">{client.scopes.map(code => oauthScopeTitles[code] ?? code).join('、')}</p>
        <p className="text-xs text-cf-subtle">访问有效期 {client.accessTokenValiditySeconds} 秒 · {client.secretConfigured ? '密钥已加密保存，不回显' : '不使用客户端密钥'}</p>
        <PermissionGuard permissions={['system:oauth2:client:manage']} hidden><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => open(client)}>编辑应用</Button>
          {client.status === 'ACTIVE' && <Button variant="outline" disabled={busy} onClick={() => { setSelection(client); setActionError(''); setUncertain(false); }}>停用应用</Button>}
        </div></PermissionGuard>
      </article>)}
    </div>}
    <Pagination total={overview?.page.total ?? 0} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => setQuery(previous => ({ ...previous, pageNum }))} onPageSizeChange={pageSize => setQuery({ pageNum: 1, pageSize })} />
    <BaseDialog open={form !== null} title={form?.clientId ? '编辑第三方应用' : '新增第三方应用'} width="wide" panelClassName="oauth2-dialog" onClose={() => { if (!busy) setForm(null); }}>
      {form && <form className="space-y-5" onSubmit={event => void save(event)}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">应用名称<Input required maxLength={100} value={form.clientName} disabled={disabled} onChange={event => setField('clientName', event.target.value)} /></label>
          <label className="space-y-2 text-sm">所属企业编号<Input type="number" required min={1} step={1} value={form.tenantId} disabled={disabled || !!form.clientId} onChange={event => setField('tenantId', Number(event.target.value))} /></label>
          <div className="space-y-2 text-sm"><span>客户端类型</span><InfrastructureSelect aria-label="客户端类型" value={form.clientType} disabled={disabled || !!form.clientId} options={[{ value: 'CONFIDENTIAL', label: '机密客户端（能安全保管密钥）' }, { value: 'PUBLIC', label: '公共客户端（仅授权码验证）' }]} onValueChange={value => {
            setForm(previous => previous ? { ...previous, clientType: value as OauthClientSave['clientType'],
              grantTypes: value === 'PUBLIC' ? ['authorization_code'] : previous.grantTypes, serviceUserId: value === 'PUBLIC' ? null : previous.serviceUserId } : previous);
          }} /></div>
          <div className="space-y-2 text-sm"><span>应用状态</span><InfrastructureSelect aria-label="应用状态" value={form.status} disabled={disabled || !form.clientId || !overview?.enabled} options={[{ value: 'DISABLED', label: '停用' }, { value: 'ACTIVE', label: '启用' }]} onValueChange={value => setField('status', value as OauthClientSave['status'])} /><p className="text-xs text-cf-subtle">新应用必须先保存为停用状态。</p></div>
          <div className="space-y-2 text-sm md:col-span-2"><label className="block" htmlFor="oauth2-client-description">用途说明</label><textarea id="oauth2-client-description" maxLength={1000} rows={3} value={form.description ?? ''} disabled={disabled} onChange={event => setField('description', event.target.value)} /></div>
          <label className="space-y-2 text-sm">应用图标文件编号（可选）<Input type="number" min={1} step={1} value={form.logoFileId ?? ''} disabled={disabled} onChange={event => setField('logoFileId', event.target.value ? Number(event.target.value) : null)} /><span className="block text-xs text-cf-subtle">仅本企业公开的 PNG、JPEG 或 WebP，最大2MiB。</span></label>
        </div>
        <fieldset disabled={disabled} className="space-y-2"><legend className="mb-2 text-sm font-medium">授权模式</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={!!codeGrant} onChange={event => grantChange('authorization_code', event.target.checked)} />员工本人确认后访问</label>
          {form.clientType === 'CONFIDENTIAL' && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.grantTypes.includes('client_credentials')} onChange={event => grantChange('client_credentials', event.target.checked)} />专用只读服务账号访问</label>}
        </fieldset>
        {form.grantTypes.includes('client_credentials') && <label className="block space-y-2 text-sm">专用只读账号编号<Input type="number" required min={1} step={1} value={form.serviceUserId ?? ''} disabled={disabled} onChange={event => setField('serviceUserId', event.target.value ? Number(event.target.value) : null)} /><span className="block text-xs text-cf-subtle">须在部署允许名单中，且不得具有管理员身份或写权限。</span></label>}
        {codeGrant && <div className="space-y-2 text-sm"><label className="block" htmlFor="oauth2-client-redirects">精确回调地址（每行一条）</label><textarea id="oauth2-client-redirects" aria-describedby="oauth2-client-redirects-help" required rows={3} maxLength={20020} value={redirects} disabled={disabled} onChange={event => setRedirects(event.target.value)} /><p id="oauth2-client-redirects-help" className="text-xs text-cf-subtle">最多20条，生产仅允许 HTTPS，不接受通配地址；公共客户端同样需要授权码安全验证。</p></div>}
        <fieldset disabled={disabled} className="space-y-3"><legend className="mb-2 text-sm font-medium">应用允许的只读范围</legend>
          {overview?.scopeRegistry.map(scope => <div key={scope.code} className="rounded-lg border border-[var(--cf-border)] px-3 py-2">
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.scopes.includes(scope.code)} disabled={disabled || scope.code === 'profile' && !codeGrant} onChange={event => scopeChange(scope.code, event.target.checked)} />{scope.title}</label>
            <p className="pb-2 text-xs text-cf-subtle">{scope.description}</p>
            {codeGrant && form.scopes.includes(scope.code) && <label className="flex min-h-11 items-center gap-3 text-xs"><input type="checkbox" checked={form.autoApproveScopes.includes(scope.code)} onChange={event => setField('autoApproveScopes', event.target.checked ? [...form.autoApproveScopes, scope.code] : form.autoApproveScopes.filter(value => value !== scope.code))} />用户已明确同意且授权有效时，允许复用本项同意</label>}
          </div>)}
        </fieldset>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">访问令牌有效期（秒）<Input type="number" required min={60} max={3600} step={1} value={form.accessTokenValiditySeconds} disabled={disabled} onChange={event => setField('accessTokenValiditySeconds', Number(event.target.value))} /></label>
          <label className="space-y-2 text-sm">刷新授权有效期（秒）<Input type="number" required min={3600} max={2592000} step={1} value={form.refreshTokenValiditySeconds} disabled={disabled} onChange={event => setField('refreshTokenValiditySeconds', Number(event.target.value))} /><span className="block text-xs text-cf-subtle">服务账号模式不发放刷新令牌。</span></label>
        </div>
        {form.clientId && form.clientType === 'CONFIDENTIAL' && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={rotate} disabled={disabled} onChange={event => setRotate(event.target.checked)} />保存时生成并替换客户端密钥，仅展示一次</label>}
        <p className="text-sm text-cf-muted">{form.clientId ? '保存任何变更都会撤销此应用的旧授权与令牌，用户需要重新确认。' : '机密客户端的密钥由安全随机数生成，创建成功后仅展示一次。'}</p>
        {actionError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
        {uncertain && <p role="status" className="text-sm">非敏感输入已保留；请关闭并刷新核对实际版本，本次不会重复提交。</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>取消</Button><Button type="submit" disabled={disabled}>{busy ? '保存中…' : '保存应用'}</Button></div>
      </form>}
    </BaseDialog>
    <BaseDialog open={selection !== null} title="停用第三方应用" panelClassName="oauth2-dialog" onClose={() => { if (!busy) setSelection(null); }}>
      {selection && <div className="space-y-5"><p className="text-sm">停用“{selection.clientName}”将撤销所有用户的相关授权、待确认请求及访问令牌，重新启用后需要重新授权。</p>
        {actionError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
        {uncertain && <p className="text-sm" role="status">请关闭并刷新核对实际状态后再操作。</p>}
        <div className="flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setSelection(null)}>取消</Button><Button disabled={disabled} onClick={() => void disable()}>{busy ? '停用中…' : '确认停用'}</Button></div>
      </div>}
    </BaseDialog>
    <BaseDialog open={secret !== null} title="客户端密钥仅展示一次" panelClassName="oauth2-dialog" onClose={() => { setSecret(null); setActionError(''); }}>
      {secret && <div className="space-y-5"><p className="text-sm">{secret.name}：请立即保存到应用的安全配置中，关闭后无法再次查看。</p>
        <label className="block space-y-2 text-sm">客户端编号<Input readOnly value={secret.key} /></label>
        <label className="block space-y-2 text-sm">本次客户端密钥<Input readOnly autoComplete="off" value={secret.value} /></label>
        {actionError && <p role="alert" className="text-sm">{actionError}</p>}
        <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" onClick={() => void copySecret()}><Copy size={16} />复制密钥</Button><Button onClick={() => { setSecret(null); setActionError(''); }}>已安全保存</Button></div>
      </div>}
    </BaseDialog>
  </div>;
}

export default function OauthClientPage() {
  const { hasPermission } = useAuth();
  if (!hasPermission('system:oauth2:client:list')) return <p role="alert" className="card p-6">您没有管理第三方应用的权限。</p>;
  return <PlatformOperationGate permission="system:oauth2:client:list">{invalidate => <ClientWorkspace invalidate={invalidate} />}</PlatformOperationGate>;
}
