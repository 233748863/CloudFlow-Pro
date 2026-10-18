import React, { useEffect, useRef, useState } from 'react';
import { Database, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { applyDataSource, dataSourceServices, disableDataSource, listDataSources, readDataSource, saveDataSource, testDataSource } from '@/services/api/dataSource';
import type { DataSourceConfig, DataSourceOverview, DataSourceSave, DataSourceTest } from '@/services/api/dataSource';
import { platformHttpStatus } from '@/services/api/platformAccess';
import { getAuthToken } from '@/utils/authStorage';
import { getErrorMessage } from '@/utils/errorMessage';
import { PlatformOperationGate } from './_components/PlatformOperationGate';
import { InfrastructureBadge, InfrastructurePageHeader, InfrastructureSelect, InfrastructureTableStateRow } from './_components/InfrastructurePrimitives';
import './data-source.css';

const serviceName = (name: string) => dataSourceServices[name as keyof typeof dataSourceServices] ?? name;
const instanceNames = { ACTIVE: '已启用', DISABLED: '已停用', FAILED: '应用失败', STALE: '离线或待应用' } as const;
const emptyForm = (): DataSourceSave => ({ configName: '', dsKey: '', url: '', username: '', password: '', secretAction: 'REPLACE', maxActive: 5, targetServices: [], remark: '' });
const formFrom = (config: DataSourceConfig): DataSourceSave => ({ configId: config.configId, version: config.version,
  configName: config.configName, dsKey: config.dsKey, url: config.url, username: config.username,
  secretAction: 'KEEP', password: '', maxActive: config.maxActive, targetServices: [...config.targetServices], remark: config.remark ?? '' });

function Services({ allowed, selected, disabled, onChange }: { allowed: string[]; selected: string[]; disabled?: boolean; onChange: (services: string[]) => void }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-medium">目标服务</legend>
    <div className="grid gap-2 sm:grid-cols-2">{allowed.map(service => <label key={service} className="flex min-h-11 items-center gap-3 rounded-md border border-[var(--cf-border)] px-3 text-sm">
      <input type="checkbox" checked={selected.includes(service)} disabled={disabled} onChange={event => onChange(event.target.checked ? [...selected, service] : selected.filter(item => item !== service))} />{serviceName(service)}
    </label>)}</div>
    <p className="text-xs text-cf-subtle">仅显示部署允许的服务；每个服务实例分别应用配置。</p>
  </fieldset>;
}

function DataSourceWorkspace({ invalidate }: { invalidate: () => void }) {
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10 });
  const [revision, setRevision] = useState(0);
  const [overview, setOverview] = useState<DataSourceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<DataSourceSave | null>(null);
  const [editingEnabled, setEditingEnabled] = useState(false);
  const [detail, setDetail] = useState<DataSourceConfig | null>(null);
  const [confirmation, setConfirmation] = useState<{ config: DataSourceConfig; disable: boolean } | null>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{ name: string; result: DataSourceTest } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const active = useRef(true);
  const token = useRef(getAuthToken());
  const operation = useRef(0);
  const authFailure = useRef(invalidate);
  authFailure.current = invalidate;
  const current = () => active.current && token.current === getAuthToken();
  const refresh = () => setRevision(value => value + 1);
  const fail = (failure: unknown, fallback: string) => {
    if (!current()) return;
    if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) { authFailure.current(); return; }
    setFormError(getErrorMessage(failure, fallback));
  };

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; operation.current++; };
  }, []);

  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError('');
    void listDataSources(query, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted && current()) setOverview(result);
    }).catch(failure => {
      if (!cancellation.signal.aborted && current()) {
        setOverview(null);
        if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) authFailure.current();
        else setError(getErrorMessage(failure, '加载数据源失败'));
      }
    }).finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [query, revision]);

  const setField = <Key extends keyof DataSourceSave>(key: Key, value: DataSourceSave[Key]) =>
    setForm(previous => previous ? { ...previous, [key]: value } : previous);

  const open = async (config: DataSourceConfig, intent: 'edit' | 'detail' | 'register' | 'disable') => {
    if (busy) return;
    setBusy(true); setFormError(''); setUncertain(false);
    const request = ++operation.current;
    try {
      const latest = await readDataSource(config.configId);
      if (!current() || request !== operation.current) return;
      if (intent === 'edit') { setEditingEnabled(latest.status === 'ENABLED'); setForm(formFrom(latest)); }
      else if (intent === 'detail') setDetail(latest);
      else { setTargets([...latest.targetServices]); setConfirmationText(''); setConfirmation({ config: latest, disable: intent === 'disable' }); }
    } catch (failure) { fail(failure, '读取配置失败'); }
    finally { if (current() && request === operation.current) setBusy(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || busy || uncertain) return;
    if (form.targetServices.length === 0) { setFormError('请至少选择一个目标服务'); return; }
    setBusy(true); setFormError('');
    try {
      const payload = { ...form, password: form.secretAction === 'REPLACE' ? form.password : undefined };
      await saveDataSource(payload);
      if (!current()) return;
      setForm(null); refresh();
      toast.success('配置已保存；启用配置的变更将按实例分别应用');
    } catch (failure) {
      if (!current()) return;
      setField('password', '');
      const status = platformHttpStatus(failure);
      setUncertain(status == null || status >= 500 || status === 409);
      fail(failure, '保存结果未确认，请关闭表单并刷新核对当前版本后再操作');
      refresh();
    } finally { if (current()) setBusy(false); }
  };

  const test = async (config: DataSourceConfig) => {
    if (busy) return;
    setBusy(true); setFormError('');
    try {
      const result = await testDataSource(config.configId, config.version);
      if (current()) setTestResult({ name: config.configName, result });
    } catch (failure) { fail(failure, '连接测试失败，请刷新配置后重试'); }
    finally { if (current()) setBusy(false); }
  };

  const activate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!confirmation || busy || uncertain || confirmationText !== confirmation.config.dsKey) return;
    if (!confirmation.disable && targets.length === 0) { setFormError('请至少选择一个目标服务'); return; }
    setBusy(true); setFormError('');
    const config = confirmation.config;
    try {
      if (confirmation.disable) await disableDataSource(config.configId, config.version, confirmationText);
      else await applyDataSource(config.configId, config.version, confirmationText, targets);
      if (!current()) return;
      setConfirmation(null); setConfirmationText(''); refresh();
      toast.success('操作指令已保存，请查看逐实例实际结果');
    } catch (failure) {
      if (!current()) return;
      const status = platformHttpStatus(failure);
      setUncertain(status == null || status >= 500 || status === 409);
      fail(failure, '操作结果未确认，请刷新核对实际版本后再操作');
      refresh();
    } finally { if (current()) setBusy(false); }
  };

  const actions = (config: DataSourceConfig) => <div className="flex flex-wrap gap-2">
    <Button variant="outline" disabled={busy} onClick={() => void open(config, 'detail')}>实例详情</Button>
    <PermissionGuard permissions={['system:data-source:manage']} hidden><Button variant="outline" disabled={busy} onClick={() => void open(config, 'edit')}>编辑</Button></PermissionGuard>
    <PermissionGuard permissions={['system:data-source:test']} hidden><Button variant="outline" disabled={busy || !overview?.accountVerificationReady || !config.passwordConfigured} onClick={() => void test(config)}>测试连接</Button></PermissionGuard>
    <PermissionGuard permissions={['system:data-source:register']} hidden>
      <Button variant="outline" disabled={busy || !overview?.accountVerificationReady || !config.passwordConfigured} onClick={() => void open(config, 'register')}>{config.status === 'ENABLED' ? '重新应用' : '注册启用'}</Button>
      {config.status === 'ENABLED' && <Button variant="outline" disabled={busy} onClick={() => void open(config, 'disable')}>停用</Button>}
    </PermissionGuard>
  </div>;

  const rows = overview?.page.rows ?? [];
  const emptyMessage = error || (loading ? '正在读取配置…' : '暂无数据源配置');
  return <div className="data-source-workspace space-y-5">
    <InfrastructurePageHeader kicker="平台治理" title="动态数据源" description="维护额外的只读数据库连接，默认业务数据库保持不变。">
      <Button variant="outline" disabled={loading || busy} onClick={refresh}><RefreshCw size={16} />刷新</Button>
      <PermissionGuard permissions={['system:data-source:manage']} hidden><Button disabled={!overview?.configured || busy} onClick={() => { setForm(emptyForm()); setEditingEnabled(false); setFormError(''); setUncertain(false); }}><Plus size={16} />新增配置</Button></PermissionGuard>
    </InfrastructurePageHeader>
    <div className="card flex items-start gap-3 p-4 text-sm"><Database size={20} className="shrink-0 text-cf-muted" /><p>{overview?.message || '连接地址、账号与目标服务均须位于部署允许名单；密码不回显。'}</p></div>
    {formError && !form && !confirmation && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
    {overview?.configured === false ? <p className="card p-6 text-sm" role="status">部署功能已停用；当前不会建立任何额外数据库连接。</p> : <TablePageLayout table={<>
      <div className="hidden md:block"><InnerTableSurface><table className="w-full text-sm">
        <thead><tr>{['配置 / 注册键', '期望状态', '版本 / 已记录实例', '操作'].map(label => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead>
        <tbody>{loading || error || rows.length === 0 ? <InfrastructureTableStateRow colSpan={4} loading={loading} title={emptyMessage} description="配置默认停用，注册后以各实例实际结果为准。" /> : rows.map(config => <tr key={config.configId} className="border-t border-[var(--cf-border)]">
          <td className="px-4 py-3"><p className="font-medium">{config.configName}</p><code className="text-xs text-cf-subtle">{config.dsKey}</code></td>
          <td className="px-4 py-3"><InfrastructureBadge tone={config.status === 'ENABLED' ? 'info' : 'neutral'}>{config.status === 'ENABLED' ? '期望启用' : '期望停用'}</InfrastructureBadge></td>
          <td className="px-4 py-3">v{config.version} / {config.instances.length}个<p className="mt-1 text-xs text-cf-subtle">密码{config.passwordConfigured ? '已配置' : '未配置'}</p></td>
          <td className="px-4 py-3">{actions(config)}</td>
        </tr>)}</tbody>
      </table></InnerTableSurface></div>
      <div className="space-y-3 p-3 md:hidden" aria-live="polite">{loading || error || rows.length === 0 ? <p className="p-4 text-sm">{emptyMessage}</p> : rows.map(config => <article key={config.configId} className="card space-y-3 p-4">
        <h3 className="font-medium">{config.configName}</h3><code className="break-all text-xs">{config.dsKey}</code>
        <p className="text-sm text-cf-muted">{config.status === 'ENABLED' ? '期望启用' : '期望停用'} · v{config.version} · {config.instances.length}个已记录实例</p>{actions(config)}
      </article>)}</div>
    </>} pagination={<Pagination total={overview?.page.total ?? 0} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => setQuery(previous => ({ ...previous, pageNum }))} onPageSizeChange={pageSize => setQuery({ pageNum: 1, pageSize })} />} />}
    <BaseDialog open={form !== null} title={form?.configId ? '编辑数据源配置' : '新增数据源配置'} width="wide" panelClassName="data-source-dialog" onClose={() => { if (!busy) setForm(null); }}>
      {form && <form onSubmit={event => void save(event)} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">配置名称<Input required maxLength={100} value={form.configName} disabled={busy || uncertain} onChange={event => setField('configName', event.target.value)} /></label>
          <label className="space-y-2 text-sm">注册键<Input required maxLength={64} pattern="[a-z][a-z0-9-]*" value={form.dsKey} disabled={busy || uncertain || !!form.configId} onChange={event => setField('dsKey', event.target.value)} /><span className="block text-xs text-cf-subtle">小写字母开头，允许数字及连字符；创建后锁定。</span></label>
          <label className="space-y-2 text-sm md:col-span-2">MySQL连接地址<Input required maxLength={1000} placeholder="jdbc:mysql://白名单主机:端口/数据库" value={form.url} disabled={busy || uncertain} onChange={event => setField('url', event.target.value)} /><span className="block text-xs text-cf-subtle">不允许额外连接参数、多个主机或浏览器指定业务查询库。</span></label>
          <label className="space-y-2 text-sm">专用只读账号<Input required maxLength={32} autoComplete="off" value={form.username} disabled={busy || uncertain} onChange={event => setField('username', event.target.value)} /></label>
          <label className="space-y-2 text-sm">最大连接数<Input type="number" required min={1} max={20} step={1} value={form.maxActive} disabled={busy || uncertain} onChange={event => setField('maxActive', Number(event.target.value))} /><span className="block text-xs text-cf-subtle">初始0个，默认上限5个，最多20个。</span></label>
          <div className="space-y-2 text-sm"><span>密码操作</span><InfrastructureSelect aria-label="密码操作" value={form.secretAction} disabled={busy || uncertain} options={[...(form.configId ? [{ value: 'KEEP', label: '保留已有密码' }] : []), { value: 'REPLACE', label: '替换为新密码' }, ...(!editingEnabled ? [{ value: 'CLEAR', label: '清除密码（仅停用配置）' }] : [])]} onValueChange={value => { setField('secretAction', value as DataSourceSave['secretAction']); setField('password', ''); }} /></div>
          {form.secretAction === 'REPLACE' && <label className="space-y-2 text-sm">新数据库密码<Input required type="password" autoComplete="new-password" maxLength={512} value={form.password ?? ''} disabled={busy || uncertain} onChange={event => setField('password', event.target.value)} /></label>}
        </div>
        <Services allowed={overview?.allowedServices ?? []} selected={form.targetServices} disabled={busy || uncertain} onChange={services => setField('targetServices', services)} />
        <label className="block space-y-2 text-sm">用途说明<Input maxLength={500} value={form.remark ?? ''} disabled={busy || uncertain} onChange={event => setField('remark', event.target.value)} /></label>
        {editingEnabled && <p className="text-sm text-cf-muted">保存将产生新版本并分别应用；某实例失败时保留该实例的旧可用连接。</p>}
        {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        {uncertain && <p role="status" className="text-sm">当前结果或版本需要重新核对，请关闭表单、刷新列表后再操作；不会自动重复提交。</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>取消</Button><Button type="submit" disabled={busy || uncertain}>{busy ? '保存中…' : '保存配置'}</Button></div>
      </form>}
    </BaseDialog>
    <BaseDialog open={confirmation !== null} title={confirmation?.disable ? '停用数据源' : '注册并应用数据源'} panelClassName="data-source-dialog" onClose={() => { if (!busy) setConfirmation(null); }}>
      {confirmation && <form onSubmit={event => void activate(event)} className="space-y-5">
        <p className="text-sm">配置：{confirmation.config.configName}；当前版本：v{confirmation.config.version}。</p>
        {confirmation.disable ? <p className="text-sm text-cf-muted">停止新连接，旧连接完成或60秒后关闭；默认业务库不受影响，离线实例恢复后补应用。</p> : <Services allowed={overview?.allowedServices ?? []} selected={targets} disabled={busy || uncertain} onChange={setTargets} />}
        <label className="block space-y-2 text-sm">输入注册键 <code>{confirmation.config.dsKey}</code> 确认<Input required autoComplete="off" maxLength={64} value={confirmationText} disabled={busy || uncertain} onChange={event => setConfirmationText(event.target.value)} /></label>
        {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        {uncertain && <p role="status" className="text-sm">请关闭确认框并刷新，核对实际版本后重新操作；不会自动重试。</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>取消</Button><Button type="submit" disabled={busy || uncertain || confirmationText !== confirmation.config.dsKey}>{busy ? '提交中…' : confirmation.disable ? '确认停用' : '确认注册'}</Button></div>
      </form>}
    </BaseDialog>
    <BaseDialog open={detail !== null} title="数据源实例详情" width="wide" panelClassName="data-source-dialog" onClose={() => { operation.current++; setDetail(null); setBusy(false); }}>
      {detail && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">{detail.configName} · 期望版本v{detail.version}</h4><Button variant="outline" disabled={busy} onClick={() => void open(detail, 'detail')}><RefreshCw size={16} />刷新实例结果</Button></div>
        <p className="break-all text-sm text-cf-muted">{detail.url} · 账号：{detail.username} · 密码{detail.passwordConfigured ? '已配置' : '未配置'}</p>
        <p className="text-sm">目标服务：{detail.targetServices.map(serviceName).join('、')}；{detail.status === 'ENABLED' ? '期望启用' : '期望停用'}。</p>
        {detail.targetServices.filter(service => !detail.instances.some(instance => instance.serviceName === service)).map(service => <p key={service} role="status" className="text-sm text-amber-700 dark:text-amber-300">{serviceName(service)}：尚无实例应用记录，不能确认生效。</p>)}
        <div className="grid gap-3 md:grid-cols-2">{detail.instances.map(instance => <article key={`${instance.serviceName}:${instance.instanceKey}`} className="card min-w-0 space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-medium">{serviceName(instance.serviceName)}</h5><InfrastructureBadge tone={instance.status === 'FAILED' ? 'danger' : instance.status === 'STALE' ? 'warning' : instance.appliedVersion === detail.version ? 'success' : 'warning'}>{instanceNames[instance.status]}</InfrastructureBadge></div>
          <p className="break-all text-xs text-cf-subtle">实例标识：{instance.instanceKey}</p>
          <p className="text-sm">实际版本：v{instance.appliedVersion}{instance.appliedVersion !== detail.version ? '（尚未采用期望版本）' : ''}</p>
          {instance.errorCode && <p className="break-all text-xs">原因代码：{instance.errorCode}</p>}
          <p className="text-xs text-cf-subtle">核验时间：{instance.checkedTime}</p>
        </article>)}</div>
      </div>}
    </BaseDialog>
    <BaseDialog open={testResult !== null} title="连接测试结果" panelClassName="data-source-dialog" onClose={() => setTestResult(null)}>
      {testResult && <div className="space-y-3 text-sm"><p>{testResult.name}</p><p role="status">{testResult.result.message}</p><p>耗时：{testResult.result.elapsedMillis}毫秒</p>{testResult.result.errorCode && <p>原因代码：{testResult.result.errorCode}</p>}<p className="text-cf-muted">测试不会更改业务主库或自动注册数据源。</p></div>}
    </BaseDialog>
  </div>;
}

export default function DataSourcePage() {
  const { hasPermission } = useAuth();
  if (!hasPermission('system:data-source:list')) return <p role="alert" className="card p-6 text-sm">您没有权限访问动态数据源</p>;
  return <div className="space-y-5"><PlatformOperationGate permission="system:data-source:list">{invalidate => <DataSourceWorkspace invalidate={invalidate} />}</PlatformOperationGate></div>;
}
