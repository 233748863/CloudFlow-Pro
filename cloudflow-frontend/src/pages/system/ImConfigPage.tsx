import React, { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { listImConfigs, saveImConfig, testImConfig } from '@/services/api/im';
import type { ImConfig, ImConfigSave, ImOverview, ImSecretChange, ImSecretField, ImTestResult } from '@/services/api/im';
import { platformHttpStatus } from '@/services/api/platformAccess';
import { getAuthSessionVersion } from '@/utils/authStorage';
import { getErrorMessage } from '@/utils/errorMessage';
import ImScopeFields, { imScopeError } from './_components/ImScopeFields';
import ImTodoReconcilePanel from './_components/ImTodoReconcilePanel';
import { InfrastructureBadge, InfrastructurePageHeader, InfrastructureSelect, InfrastructureTableStateRow } from './_components/InfrastructurePrimitives';
import './im-config.css';

const secrets: { field: ImSecretField; label: string; maximum: number; pattern?: string }[] = [
  { field: 'appSecret', label: '应用Secret', maximum: 1024, pattern: '[A-Za-z0-9_-]+' },
  { field: 'token', label: '回调Token', maximum: 32, pattern: '[A-Za-z0-9]+' },
  { field: 'aesKey', label: '回调EncodingAESKey', maximum: 43, pattern: '[A-Za-z0-9+/]{43}' },
  { field: 'appKey', label: '应用Key（可选）', maximum: 1024 },
];

const emptyForm = (): ImConfigSave => ({ imType: 'WECOM', corpId: '', agentId: '', appKey: { action: 'CLEAR' },
  appSecret: { action: 'REPLACE', value: '' }, token: { action: 'CLEAR' }, aesKey: { action: 'CLEAR' },
  syncEnabled: false, syncCron: null, loginEnabled: false, messageEnabled: false, todoEnabled: false, syncScope: null, status: 'DISABLED' });
const formFrom = (config: ImConfig): ImConfigSave => ({ configId: config.configId, version: config.version, imType: config.imType,
  corpId: config.corpId, agentId: config.agentId, appKey: { action: 'KEEP' }, appSecret: { action: 'KEEP' },
  token: { action: 'KEEP' }, aesKey: { action: 'KEEP' }, callbackUrl: config.callbackUrl, syncEnabled: config.syncEnabled,
  syncCron: config.syncCron, loginEnabled: config.loginEnabled, messageEnabled: config.messageEnabled,
  todoEnabled: config.todoEnabled, syncScope: config.syncScope, status: config.status });
const clearSecretInputs = (form: ImConfigSave): ImConfigSave => ({ ...form,
  appKey: { action: form.appKey.action }, appSecret: { action: form.appSecret.action },
  token: { action: form.token.action }, aesKey: { action: form.aesKey.action } });

function ImConfigWorkspace() {
  const { hasPermission } = useAuth();
  const canSchedule = hasPermission('system:im:sync:preview') && hasPermission('system:im:sync:run');
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10 });
  const [revision, setRevision] = useState(0);
  const [overview, setOverview] = useState<ImOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [form, setForm] = useState<ImConfigSave | null>(null);
  const [original, setOriginal] = useState<ImConfig | null>(null);
  const [formError, setFormError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ corpId: string; result: ImTestResult } | null>(null);
  const [todoConfig, setTodoConfig] = useState<ImConfig | null>(null);
  const active = useRef(false);
  const locked = useRef(false);
  const access = useRef(0);
  const session = useRef(getAuthSessionVersion());
  const current = (epoch: number) => active.current && session.current === getAuthSessionVersion() && epoch === access.current;
  const refresh = () => setRevision(value => value + 1);
  const revoke = () => { access.current++; setDenied(true); setOverview(null); setForm(null); setOriginal(null); setTestResult(null); setTodoConfig(null); setFormError(''); setLoading(false); setBusy(false); };

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const cancellation = new AbortController(); const epoch = access.current;
    setLoading(true); setError('');
    void listImConfigs(query, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted && current(epoch)) { setOverview(result); setDenied(false); }
    }).catch(failure => {
      if (!cancellation.signal.aborted && current(epoch)) {
        setOverview(null);
        if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) revoke();
        else setError(getErrorMessage(failure, '读取企业微信配置失败，请刷新重试'));
      }
    }).finally(() => { if (!cancellation.signal.aborted && current(epoch)) setLoading(false); });
    return () => cancellation.abort();
  }, [query, revision]);

  const setField = <Key extends keyof ImConfigSave>(key: Key, value: ImConfigSave[Key]) =>
    setForm(previous => previous ? { ...previous, [key]: value } : previous);
  const open = (config?: ImConfig) => {
    if (locked.current || loading || !overview?.canConfigure) return;
    setOriginal(config ?? null); setForm(config ? formFrom(config) : emptyForm()); setFormError(''); setUncertain(false); setTestResult(null);
  };
  const close = () => { if (!locked.current) { setForm(null); setOriginal(null); setFormError(''); } };
  const fail = (failure: unknown, fallback: string, epoch: number) => {
    if (!current(epoch)) return;
    if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) revoke();
    else setFormError(getErrorMessage(failure, fallback));
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || locked.current || uncertain || !overview?.canConfigure) return;
    const scopeError = imScopeError(form.syncScope);
    if (scopeError) { setFormError(scopeError); return; }
    if (form.syncEnabled && (!form.syncScope || !form.syncCron?.trim())) { setFormError('开启定时同步须先选择同步范围并填写执行时间'); return; }
    locked.current = true; const epoch = access.current; setBusy(true); setFormError('');
    const payload = { ...form };
    for (const { field } of secrets) payload[field] = form[field].action === 'REPLACE'
      ? { action: 'REPLACE', value: form[field].value } : { action: form[field].action };
    setForm(clearSecretInputs(form));
    try {
      await saveImConfig(payload);
      if (!current(epoch)) return;
      setForm(null); setOriginal(null); refresh(); toast.success('企业微信配置已保存，连接测试不会自动开启业务功能');
    } catch (failure) {
      if (!current(epoch)) return;
      const status = platformHttpStatus(failure);
      setUncertain(status == null || status >= 500 || status === 409);
      fail(failure, '保存结果未确认，请关闭表单并刷新核对当前版本', epoch);
      if (![401, 403].includes(status ?? 0)) refresh();
    } finally { locked.current = false; if (current(epoch)) setBusy(false); }
  };
  const test = async (config: ImConfig) => {
    if (locked.current || loading || !overview?.deploymentEnabled || !overview.canConfigure) return;
    locked.current = true; const epoch = access.current; setBusy(true); setFormError(''); setTestResult(null);
    try {
      const result = await testImConfig(config.configId, config.version);
      if (current(epoch)) setTestResult({ corpId: config.corpId, result });
    } catch (failure) {
      if (!current(epoch)) return;
      fail(failure, '连接测试未确认，请刷新配置后重试', epoch);
      if (![401, 403].includes(platformHttpStatus(failure) ?? 0)) refresh();
    }
    finally { locked.current = false; if (current(epoch)) setBusy(false); }
  };
  if (denied) return <section className="im-config-workspace card space-y-4 p-6" aria-label="企业微信配置访问受限">
    <p role="alert" className="text-sm">当前身份、角色或套餐不允许访问企业微信配置，已关闭编辑并清除密钥输入。</p>
    <Button variant="outline" disabled={loading} onClick={refresh}>重新核验权限</Button>
  </section>;

  const rows = overview?.page.rows ?? [];
  const blocked = busy || uncertain || !overview?.canConfigure;
  const actions = (config: ImConfig) => <div className="flex flex-wrap gap-2">
    <PermissionGuard permissions={['system:im:config:manage']} hidden><Button variant="outline" disabled={busy || loading || !overview?.canConfigure || config.imType !== 'WECOM'} onClick={() => open(config)}>编辑</Button></PermissionGuard>
    <PermissionGuard permissions={['system:im:config:test']} hidden><Button variant="outline" disabled={busy || loading || !overview?.deploymentEnabled || !overview.canConfigure || !config.appSecretConfigured || config.imType !== 'WECOM'} onClick={() => void test(config)}>测试连接</Button></PermissionGuard>
    <PermissionGuard permissions={['system:im:todo:reconcile']} hidden><Button variant="outline" disabled={busy || loading || config.imType !== 'WECOM'} onClick={() => setTodoConfig(config)}>核对待办状态</Button></PermissionGuard>
  </div>;
  const secretSummary = (config: ImConfig) => <div className="space-y-1 text-xs text-cf-muted">{secrets.map(({ field, label }) =>
    <p key={field}>{label}：{config[`${field}Configured`] ? '已配置' : '未配置'}</p>)}</div>;
  const emptyMessage = loading ? '正在读取企业微信配置…' : error || '暂无企业微信配置';
  return <div className="im-config-workspace space-y-5">
    {todoConfig && <ImTodoReconcilePanel config={todoConfig} onClose={() => setTodoConfig(null)} />}
    <InfrastructurePageHeader kicker="系统管理" title="企业微信配置" description="按当前公司维护应用凭据；密钥不回显，保存和测试分别受角色与套餐限制。">
      <Button variant="outline" disabled={loading || busy || form !== null} onClick={refresh}><RefreshCw size={16} />刷新</Button>
      <PermissionGuard permissions={['system:im:config:manage']} hidden><Button disabled={loading || busy || !overview?.canConfigure || form !== null || rows.some(config => config.imType === 'WECOM')} onClick={() => open()}><Plus size={16} />新增配置</Button></PermissionGuard>
    </InfrastructurePageHeader>
    <section className="card space-y-3 p-4 text-sm" aria-label="企业微信接入状态">
      <div className="flex items-start gap-3"><ShieldCheck size={20} className="shrink-0 text-cf-muted" /><p role="status">{overview?.reason || (loading ? '正在核对部署状态…' : '未能读取部署状态，配置操作已停用')}</p></div>
      {overview && <div className="flex flex-wrap gap-2"><InfrastructureBadge tone={overview.deploymentEnabled ? 'info' : 'neutral'}>{overview.deploymentEnabled ? '部署允许外部连接' : '部署已停用外部连接'}</InfrastructureBadge><InfrastructureBadge tone={overview.canConfigure ? 'info' : 'warning'}>{overview.canConfigure ? '独立加密密钥已配置' : '独立加密密钥未配置，禁止保存'}</InfrastructureBadge></div>}
      <p className="text-cf-muted">组织同步支持先预览再执行，也可开启定时同步按已选范围自动执行并保留结果报告。扫码登录、消息投递和待办卡片尚未开放，原账号登录和审批照常使用。</p>
      <p className="text-xs text-cf-subtle">每家公司只能保存一份企业微信配置；钉钉、飞书尚未实现。</p>
    </section>
    {formError && !form && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
    <TablePageLayout table={<>
      <div className="hidden md:block"><InnerTableSurface><table className="w-full text-sm">
        <thead><tr>{['企业 / 应用', '配置状态 / 版本', '密钥配置状态', '操作'].map(label => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead>
        <tbody>{loading || error || rows.length === 0 ? <InfrastructureTableStateRow colSpan={4} loading={loading} title={emptyMessage} description="新增配置默认停用，测试通过也不会自动启用业务。" /> : rows.map(config => <tr key={config.configId} className="border-t border-[var(--cf-border)]">
          <td className="max-w-72 break-all px-4 py-3"><p className="font-medium">{config.imType === 'WECOM' ? '企业微信' : config.imType} · {config.corpId}</p><p className="mt-1 text-xs text-cf-subtle">应用ID：{config.agentId}</p></td>
          <td className="px-4 py-3"><InfrastructureBadge tone={config.status === 'ENABLED' ? 'info' : 'neutral'}>{config.status === 'ENABLED' ? '配置已启用' : '配置已停用'}</InfrastructureBadge><p className="mt-2 text-xs text-cf-subtle">版本 {config.version}</p></td>
          <td className="px-4 py-3">{secretSummary(config)}</td><td className="px-4 py-3">{actions(config)}</td>
        </tr>)}</tbody>
      </table></InnerTableSurface></div>
      <div className="space-y-3 p-3 md:hidden" aria-live="polite">{loading || error || rows.length === 0 ? <p className="p-4 text-sm">{emptyMessage}</p> : rows.map(config => <article key={config.configId} className="card min-w-0 space-y-3 p-4">
        <h3 className="break-all font-medium">{config.imType === 'WECOM' ? '企业微信' : config.imType} · {config.corpId}</h3><p className="break-all text-sm text-cf-muted">应用ID：{config.agentId} · 版本 {config.version}</p>
        <InfrastructureBadge tone={config.status === 'ENABLED' ? 'info' : 'neutral'}>{config.status === 'ENABLED' ? '配置已启用' : '配置已停用'}</InfrastructureBadge>{secretSummary(config)}{actions(config)}
      </article>)}</div>
    </>} pagination={<Pagination total={overview?.page.total ?? 0} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => { if (!locked.current && !form) setQuery(previous => ({ ...previous, pageNum })); }} onPageSizeChange={pageSize => { if (!locked.current && !form) setQuery({ pageNum: 1, pageSize }); }} />} />
    <BaseDialog open={form !== null} title={form?.configId ? '编辑企业微信配置' : '新增企业微信配置'} width="wide" panelClassName="im-config-dialog" onClose={close}>
      {form && <form onSubmit={event => void save(event)} className="space-y-5">
        <p className="text-sm text-cf-muted">{form.configId ? `正在编辑版本 ${form.version}；并发变更会拒绝覆盖，请刷新后核对。已有业务引用后企业与应用ID锁定。` : '先保存停用配置，再按系统生成的地址配置回调；不会自动连接企业微信。'}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">企业ID<Input required maxLength={100} pattern="[A-Za-z0-9_-]+" autoComplete="off" value={form.corpId} disabled={blocked} onChange={event => setField('corpId', event.target.value)} /></label>
          <label className="space-y-2 text-sm">应用ID<Input required inputMode="numeric" maxLength={19} pattern="[1-9][0-9]{0,18}" autoComplete="off" value={form.agentId} disabled={blocked} onChange={event => setField('agentId', event.target.value)} /></label>
        </div>
        <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">密钥操作</legend><p className="text-xs text-cf-subtle">每项独立选择操作；输入仅保留在当前表单，提交、关闭或身份变化后清空。应用Secret不可清除。</p>
          <div className="grid gap-3 md:grid-cols-2">{secrets.map(({ field, label, maximum, pattern }) => <div key={field} className="card min-w-0 space-y-3 p-4">
            <p className="text-sm font-medium">{label}</p><p className="text-xs text-cf-subtle">{original?.[`${field}Configured`] ? '已配置，不回显内容' : '尚未配置'}</p>
            <InfrastructureSelect aria-label={`${label}操作`} value={form[field].action} disabled={blocked} options={[
              ...(form.configId ? [{ value: 'KEEP', label: '保留已有值' }] : []), { value: 'REPLACE', label: '替换为新值' },
              ...(field !== 'appSecret' ? [{ value: 'CLEAR', label: '清除已有值' }] : []),
            ]} onValueChange={action => setField(field, { action: action as ImSecretChange['action'] })} />
            {form[field].action === 'REPLACE' && <label className="block space-y-2 text-sm">新{label}<Input type="password" required maxLength={maximum} pattern={pattern} autoComplete="new-password" spellCheck={false} value={form[field].value ?? ''} disabled={blocked} onChange={event => setField(field, { action: 'REPLACE', value: event.target.value })} /></label>}
          </div>)}</div>
        </fieldset>
        {form.configId && <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">配置状态与回调地址</legend>
          <InfrastructureSelect aria-label="配置状态" value={form.status} disabled={blocked} options={[{ value: 'DISABLED', label: '停用配置' }, ...(overview?.deploymentEnabled || form.status === 'ENABLED' ? [{ value: 'ENABLED', label: '启用配置（允许组织同步）' }] : [])]} onValueChange={value => setField('status', value as ImConfigSave['status'])} />
          <label className="block space-y-2 text-sm">系统生成的回调地址<Input readOnly value={original?.expectedCallbackUrl ?? ''} placeholder="部署未配置有效HTTPS站点地址" /></label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={!!form.callbackUrl} disabled={blocked || (!original?.expectedCallbackUrl && !form.callbackUrl)} onChange={event => setField('callbackUrl', event.target.checked ? original?.expectedCallbackUrl : null)} />保存系统生成的回调地址</label>
          {form.callbackUrl && form.callbackUrl !== original?.expectedCallbackUrl && <p role="status" className="break-all text-sm">已保存地址与当前部署不同：{form.callbackUrl}；请取消勾选后重新选择当前地址。</p>}
          <p className="text-xs text-cf-subtle">回调地址只接受当前部署的固定地址；保存地址不会开放回调业务。登录和消息开关保持原值。</p>
        </fieldset>}
        <ImScopeFields value={form.syncScope} onChange={value => setField('syncScope', value)} config={original} disabled={blocked}
          canConnect={!!overview?.deploymentEnabled && !!overview.canConfigure} onFailure={failure => { if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) revoke(); }} />
        <fieldset className="card space-y-3 p-4"><legend className="px-1 text-sm font-medium">定时组织同步</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.syncEnabled} disabled={blocked || (!canSchedule && !form.syncEnabled)} onChange={event => setField('syncEnabled', event.target.checked)} />按已选范围自动同步</label>
          {form.syncEnabled && <label className="block space-y-2 text-sm">执行时间表达式<Input required maxLength={100} spellCheck={false} placeholder="0 0 2 * * *" value={form.syncCron ?? ''} disabled={blocked || !canSchedule} onChange={event => setField('syncCron', event.target.value)} /></label>}
          <p className="text-xs text-cf-subtle">CRON = 按秒、分、时、日、月、星期填写执行时间；示例“0 0 2 * * *”表示服务器时间每天02:00。关闭定时同步或停用配置后，后续组织变更停止执行。</p>
          <p className="text-sm text-cf-muted">开启后，新发现的范围内变动将自动应用，无需逐轮确认；新增账号不授予角色，每轮结果保留在组织同步记录中。</p>
          {!canSchedule && <p role="status" className="text-sm">开启定时同步需要组织预览与执行权限；已有定时同步可关闭。</p>}
          {form.syncEnabled && form.status !== 'ENABLED' && <p role="status" className="text-sm">配置处于停用状态，保存后定时任务仍暂停。</p>}
        </fieldset>
        {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        {uncertain && <p role="status" className="text-sm">结果或版本未确认，已禁止重复提交；请关闭表单、刷新列表并核对当前记录后再操作。</p>}
        {!overview?.canConfigure && <p role="status" className="text-sm">当前无法确认允许保存，已停用提交；请关闭表单并刷新。</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={close}>取消</Button><Button type="submit" disabled={blocked}>{busy ? '保存中…' : '保存配置'}</Button></div>
      </form>}
    </BaseDialog>
    <BaseDialog open={testResult !== null} title="企业微信连接测试结果" panelClassName="im-config-dialog" onClose={() => setTestResult(null)}>
      {testResult && <div className="space-y-3 text-sm"><p className="break-all">企业：{testResult.corpId} · 版本 {testResult.result.version}</p><InfrastructureBadge tone={testResult.result.successful ? 'success' : 'danger'}>{testResult.result.successful ? '凭据验证通过' : '连接测试失败'}</InfrastructureBadge><p role="status">{testResult.result.message}</p><p>耗时：{testResult.result.elapsedMillis}毫秒</p><p className="break-all text-xs text-cf-subtle">原因代码：{testResult.result.reasonCode}</p><p>本次仅核验访问凭据，不返回访问令牌，不自动启用组织、登录、消息或待办。</p></div>}
    </BaseDialog>
  </div>;
}

export default function ImConfigPage() {
  const { user, hasPermission } = useAuth();
  if (!hasPermission('system:im:config:list')) return <p role="alert" className="card p-6 text-sm">您没有权限访问企业微信配置</p>;
  return <ImConfigWorkspace key={`${user?.tenantId}:${user?.id}:${getAuthSessionVersion()}`} />;
}
