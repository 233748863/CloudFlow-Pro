import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard, Textarea } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { cancelTenantPackageSync, confirmTenantPackageSync, listTenantPackages, previewTenantPackageSync, readTenantPackage, readTenantPackageCatalog, readTenantPackageSync, saveTenantPackage } from '@/services/api/tenantPackage';
import type { TenantPackageCatalog, TenantPackagePage as PackagePage, TenantPackageSave, TenantPackageSyncView, TenantPackageTemplate } from '@/services/api/tenantPackage';
import { platformHttpStatus } from '@/services/api/platformAccess';
import { getAuthToken } from '@/utils/authStorage';
import { getErrorMessage } from '@/utils/errorMessage';
import { PlatformOperationGate } from './_components/PlatformOperationGate';
import { InfrastructurePageHeader, InfrastructureSelect, InfrastructureTableStateRow } from './_components/InfrastructurePrimitives';
import { TenantPackageFeatures } from './_components/TenantPackageFeatures';
import { TenantPackageTargets } from './_components/TenantPackageTargets';
import { packageFormFrom, packageModuleNames, packageSelectionError } from './_components/tenantPackageSelection';
import './tenant-package.css';

const statusNames: Record<string, string> = { DRAFT: '草稿', ACTIVE: '启用', DISABLED: '停用', PREVIEWED: '待确认', RUNNING: '执行中', PARTIAL: '未全部成功', COMPLETED: '全部完成', CANCELLED: '已取消', APPLIED: '已应用', CONFLICT: '存在冲突', FAILED: '应用失败' };
const emptyForm = (): TenantPackageSave => ({ packageCode: '', packageName: '', menuIds: [], enabledModules: [], maxUsers: 100, maxStorageMb: 10240, price: 0, billingCycle: 'NONE', sortNo: 0, status: 'DRAFT', remark: '' });
const unknownWrite = (failure: unknown) => { const status = platformHttpStatus(failure); return status == null || status >= 500 || status === 409; };

function SyncResult({ view, catalog }: { view: TenantPackageSyncView; catalog: TenantPackageCatalog }) {
  const names = new Map(catalog.features.map(feature => [feature.menuId, feature.menuName]));
  const describe = (menuIds: number[]) => menuIds.map(menuId => `${names.get(menuId) ?? '未登记功能'}（${menuId}）`).join('、') || '无';
  return <div className="space-y-3">
    <p role="status">批次{view.syncId} · {statusNames[view.status] ?? view.status} · 共{view.preview.items.length}户 · 已应用{view.items.filter(item => item.status === 'APPLIED').length}户</p>
    <p className="text-sm text-cf-muted">取消仅停止未应用项，已应用项保留；额度调低不删除既有用户或文件。</p>
    {view.preview.items.map(item => {
      const result = view.items.find(entry => entry.tenantId === item.targetTenantId);
      const before = item.before.effective;
      const proposed = item.proposed?.effective;
      return <details key={item.targetTenantId} open className="rounded-md border border-[var(--cf-border)] p-3 text-sm">
        <summary className="min-h-11 cursor-pointer font-medium">租户{item.targetTenantId} · {statusNames[result?.status ?? ''] ?? '结果未返回'}</summary>
        <div className="space-y-2 break-words">
          {(item.errorCode || result?.errorCode) && <p role="alert">冲突或失败代码：{item.errorCode || result?.errorCode}；请处理后重新预览。</p>}
          <p>套餐版本：{item.before.packageVersion} → {item.proposed?.packageVersion ?? '无法应用'}</p>
          <p>用户上限：{before.quotas.maxUsers} → {proposed?.quotas.maxUsers ?? '无法应用'}；存储上限：{before.quotas.maxStorageMb} → {proposed?.quotas.maxStorageMb ?? '无法应用'} MB</p>
          {proposed && <><p>新增功能：{describe(proposed.menuIds.filter(menuId => !before.menuIds.includes(menuId)))}</p><p>移除功能：{describe(before.menuIds.filter(menuId => !proposed.menuIds.includes(menuId)))}</p>
            <p className="break-all">新增权限：{proposed.permissions.filter(permission => !before.permissions.includes(permission)).join('、') || '无'}</p>
            <p className="break-all">移除权限：{before.permissions.filter(permission => !proposed.permissions.includes(permission)).join('、') || '无'}</p></>}
          <p>保留额外开放：{describe(item.before.adjustments.addMenuIds)}</p><p>保留明确禁用：{describe(item.before.adjustments.removeMenuIds)}</p>
          <p>保留额度覆盖：用户{item.before.adjustments.maxUsers ?? '沿用套餐'}；存储{item.before.adjustments.maxStorageMb == null ? '沿用套餐' : `${item.before.adjustments.maxStorageMb} MB`}</p>
        </div>
      </details>;
    })}
  </div>;
}

function TenantPackageWorkspace({ invalidate }: { invalidate: () => void }) {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10 });
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<PackagePage | null>(null);
  const [catalog, setCatalog] = useState<TenantPackageCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<TenantPackageSave | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [targetPackage, setTargetPackage] = useState<TenantPackageTemplate | null>(null);
  const [targets, setTargets] = useState(new Map<number, string>());
  const [view, setView] = useState<TenantPackageSyncView | null>(null);
  const [recoveryId, setRecoveryId] = useState(searchParams.get('syncId') ?? '');
  const [confirmation, setConfirmation] = useState(false);
  const [now, setNow] = useState(Date.now());
  const active = useRef(true);
  const token = useRef(getAuthToken());
  const locked = useRef(false);
  const latestInvalidate = useRef(invalidate);
  latestInvalidate.current = invalidate;
  const current = () => active.current && token.current === getAuthToken();
  const refresh = () => setRevision(value => value + 1);
  const fail = (failure: unknown) => {
    if (!current()) return;
    if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) latestInvalidate.current();
    else setError(getErrorMessage(failure, '操作未完成，请刷新核对实际结果'));
  };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setPage(null);
    void Promise.all([listTenantPackages(query, cancellation.signal), readTenantPackageCatalog(cancellation.signal)]).then(([result, features]) => {
      if (!cancellation.signal.aborted && current()) { setPage(result); setCatalog(features); }
    }).catch(failure => { if (!cancellation.signal.aborted) fail(failure); })
      .finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [query, revision]);

  const run = async (action: () => Promise<void>, write = false) => {
    if (locked.current || !current()) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { if (current()) { if (write && unknownWrite(failure)) setUncertain(true); fail(failure); } }
    finally { locked.current = false; if (current()) setBusy(false); }
  };
  const open = (template: TenantPackageTemplate, intent: 'view' | 'edit' | 'sync') => void run(async () => {
    const latest = await readTenantPackage(template.packageId);
    if (!current()) return;
    setUncertain(false);
    if (intent === 'sync') { setTargetPackage(latest); setTargets(new Map()); }
    else { setForm(packageFormFrom(latest)); setReadOnly(intent === 'view'); }
  });
  const setField = <Key extends keyof TenantPackageSave>(key: Key, value: TenantPackageSave[Key]) => setForm(previous => previous ? { ...previous, [key]: value } : previous);
  const selectionError = form && catalog ? packageSelectionError(catalog, form.menuIds, form.enabledModules) : '';
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !catalog || readOnly || uncertain || selectionError) return;
    void run(async () => {
      await saveTenantPackage(packageFormFrom(form));
      if (current()) { setForm(null); refresh(); toast.success('套餐模板已保存；现有租户保持原版本，需单独预览并确认同步'); }
    }, true);
  };
  const acceptView = (result: TenantPackageSyncView) => {
    if (!current()) return;
    setView(result); setTargetPackage(null); setUncertain(false); setConfirmation(false); setRecoveryId(String(result.syncId));
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('syncId', String(result.syncId)); return next; }, { replace: true });
  };
  const loadSync = () => {
    const syncId = Number(recoveryId);
    if (!Number.isSafeInteger(syncId) || syncId <= 0) { setError('请输入有效的同步批次编号'); return; }
    void run(async () => { const result = await readTenantPackageSync(syncId); acceptView(result); });
  };
  const remaining = view ? Math.max(0, Math.ceil((Date.parse(view.preview.expiresAt) - now) / 1000)) : 0;
  const expired = !Number.isFinite(remaining) || remaining <= 0;
  const pending = view && ['PREVIEWED', 'RUNNING', 'PARTIAL'].includes(view.status);
  const confirmable = pending && !(view?.status === 'PREVIEWED' && expired);
  const syncAction = (cancel: boolean) => {
    if (!view || !confirmation || uncertain || !(cancel ? pending : confirmable)) return;
    void run(async () => {
      const result = await (cancel ? cancelTenantPackageSync(view.syncId, view.preview.hash) : confirmTenantPackageSync(view.syncId, view.preview.hash));
      acceptView(result);
    }, true);
  };
  const actions = (template: TenantPackageTemplate) => <div className="flex flex-wrap gap-2">
    <Button variant="outline" disabled={busy} onClick={() => open(template, 'view')}>查看功能</Button>
    <PermissionGuard permissions={['system:tenant-package:manage']} hidden><Button variant="outline" disabled={busy} onClick={() => open(template, 'edit')}>编辑套餐</Button></PermissionGuard>
    <PermissionGuard permissions={['system:tenant-package:sync', 'system:tenant:list']} requireAll hidden><Button variant="outline" disabled={busy || template.status !== 'ACTIVE'} onClick={() => open(template, 'sync')}>同步租户</Button></PermissionGuard>
  </div>;
  const closeForm = () => { if (!locked.current) { setForm(null); setError(''); setUncertain(false); refresh(); } };
  return <div className="tenant-package-workspace space-y-5">
    <InfrastructurePageHeader kicker="平台治理" title="租户套餐" description="明确选择功能与额度；模板更新后，逐户预览并确认应用。">
      <Button variant="outline" disabled={loading || busy} onClick={refresh}><RefreshCw size={16} />刷新</Button>
      <PermissionGuard permissions={['system:tenant-package:manage']} hidden><Button disabled={!catalog || busy || loading} onClick={() => { setForm(emptyForm()); setReadOnly(false); setError(''); setUncertain(false); }}><Plus size={16} />新增套餐</Button></PermissionGuard>
    </InfrastructurePageHeader>
    {error && !form && !targetPackage && !view && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    <TablePageLayout table={<>
      <div className="hidden md:block"><InnerTableSurface><table className="w-full text-sm"><thead><tr>{['套餐名称 / 编码', '状态 / 版本', '额度', '操作'].map(label => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead>
        <tbody>{loading || !page?.rows.length ? <InfrastructureTableStateRow colSpan={4} loading={loading} title={loading ? '正在读取套餐…' : error || '暂无套餐，请先创建模板'} /> : page.rows.map(template => <tr key={template.packageId} className="border-t border-[var(--cf-border)]">
          <td className="px-4 py-3"><p className="font-medium">{template.packageName}</p><code>{template.packageCode}</code></td><td className="px-4 py-3">{statusNames[template.status]} · v{template.version}</td>
          <td className="px-4 py-3">{template.maxUsers}人 / {template.maxStorageMb} MB</td><td className="px-4 py-3">{actions(template)}</td>
        </tr>)}</tbody></table></InnerTableSurface></div>
      <div className="space-y-3 p-3 md:hidden">{loading || !page?.rows.length ? <p role="status">{loading ? '正在读取套餐…' : error || '暂无套餐，请先创建模板'}</p> : page.rows.map(template => <article key={template.packageId} className="card space-y-3 p-4">
        <h3 className="font-medium">{template.packageName}</h3><p className="break-all text-sm">{template.packageCode} · {statusNames[template.status]} · v{template.version}</p><p className="text-sm">{template.maxUsers}人 / {template.maxStorageMb} MB</p>{actions(template)}
      </article>)}</div>
    </>} pagination={<Pagination total={page?.total ?? 0} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => setQuery(previous => ({ ...previous, pageNum }))} onPageSizeChange={pageSize => setQuery({ pageNum: 1, pageSize })} />} />
    <PermissionGuard permissions={['system:tenant-package:sync']} hidden><section className="card space-y-3 p-4" aria-label="恢复同步批次">
      <p className="text-sm">重新验证身份或断线后，可按批次编号读取实际结果；只允许原操作者读取。</p>
      <div className="flex flex-wrap items-end gap-2"><label className="flex-1 space-y-2 text-sm">同步批次编号<Input value={recoveryId} inputMode="numeric" onChange={event => setRecoveryId(event.target.value)} /></label><Button variant="outline" disabled={busy || !catalog} onClick={loadSync}>读取同步结果</Button></div>
      {!hasPermission(['system:tenant:list']) && <p className="text-sm text-cf-muted">发起同步还需租户列表权限；已有批次可在此恢复。</p>}
    </section></PermissionGuard>
    <BaseDialog open={form !== null} title={readOnly ? '查看套餐功能' : form?.packageId ? '编辑租户套餐' : '新增租户套餐'} width="extra-wide" panelClassName="tenant-package-dialog" onClose={closeForm}
      footer={<><Button variant="outline" disabled={busy} onClick={closeForm}>关闭</Button>{!readOnly && <Button type="submit" form="tenant-package-form" disabled={busy || uncertain || !catalog || Boolean(selectionError)}>保存套餐</Button>}</>}>
      {form && <form id="tenant-package-form" onSubmit={save} className="space-y-5">
        <fieldset disabled={busy || readOnly || uncertain} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">套餐编码<Input required maxLength={64} value={form.packageCode} onChange={event => setField('packageCode', event.target.value)} /></label>
          <label className="space-y-2 text-sm">套餐名称<Input required maxLength={100} value={form.packageName} onChange={event => setField('packageName', event.target.value)} /></label>
          <label className="space-y-2 text-sm">用户上限<Input required type="number" min={1} max={2147483647} step={1} value={form.maxUsers} onChange={event => setField('maxUsers', Number(event.target.value))} /></label>
          <label className="space-y-2 text-sm">存储上限（MB）<Input required type="number" min={1} max={8796093022207} step={1} value={form.maxStorageMb} onChange={event => setField('maxStorageMb', Number(event.target.value))} /></label>
          <label className="space-y-2 text-sm">展示价格<Input required type="number" min={0} max={999999999999.99} step="0.01" value={form.price} onChange={event => setField('price', Number(event.target.value))} /></label>
          <label className="space-y-2 text-sm">计费周期<InfrastructureSelect aria-label="计费周期" disabled={busy || readOnly || uncertain} value={form.billingCycle} options={[{ value: 'NONE', label: '不计费' }, { value: 'MONTHLY', label: '按月' }, { value: 'YEARLY', label: '按年' }]} onValueChange={value => setField('billingCycle', value as TenantPackageSave['billingCycle'])} /></label>
          <label className="space-y-2 text-sm">排序<Input required type="number" min={0} max={2147483647} step={1} value={form.sortNo} onChange={event => setField('sortNo', Number(event.target.value))} /></label>
          <label className="space-y-2 text-sm">套餐状态<InfrastructureSelect aria-label="套餐状态" disabled={busy || readOnly || uncertain} value={form.status} options={['DRAFT', 'ACTIVE', 'DISABLED'].map(value => ({ value, label: statusNames[value] }))} onValueChange={value => setField('status', value as TenantPackageSave['status'])} /></label>
          <label className="space-y-2 text-sm sm:col-span-2">备注<Textarea maxLength={500} value={form.remark} onChange={event => setField('remark', event.target.value)} /></label>
        </fieldset>
        <p className="text-sm text-cf-muted">价格仅作展示，不会自动扣费；停用模板会禁止新分配，已有租户保留已应用的功能。</p>
        <fieldset disabled={busy || readOnly || uncertain} className="space-y-2"><legend className="text-sm font-medium">启用业务模块</legend><div className="flex flex-wrap gap-4">{catalog?.modules.map(module => <label key={module} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.enabledModules.includes(module)} onChange={event => setField('enabledModules', event.target.checked ? [...form.enabledModules, module] : form.enabledModules.filter(value => value !== module))} />{packageModuleNames[module] ?? module}</label>)}</div></fieldset>
        {catalog && <TenantPackageFeatures catalog={catalog} selected={form.menuIds} disabled={busy || readOnly || uncertain} onChange={menuIds => setField('menuIds', menuIds)} />}
        {selectionError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{selectionError}</p>}
        {error && <p role="alert">{error}</p>}{uncertain && <p role="alert">保存结果或版本未确认；请关闭后刷新列表，核对实际内容再编辑，勿重复提交。</p>}
      </form>}
    </BaseDialog>
    <BaseDialog open={targetPackage !== null} title="选择套餐同步范围" width="wide" panelClassName="tenant-package-dialog" onClose={() => { if (!locked.current) setTargetPackage(null); }}
      footer={<Button disabled={busy || uncertain || targets.size === 0} onClick={() => { if (targetPackage && !uncertain && targets.size) void run(async () => { const result = await previewTenantPackageSync(targetPackage.packageId, [...targets.keys()]); acceptView(result); }, true); }}>生成逐户预览</Button>}>
      {targetPackage && <><p className="mb-4 text-sm">{targetPackage.packageName}；生成预览后还需明确确认，不立即修改租户。</p><TenantPackageTargets key={targetPackage.packageId} packageId={targetPackage.packageId} selected={targets} onChange={setTargets} disabled={busy || uncertain} invalidate={invalidate} /></>}
      {error && <p role="alert">{error}</p>}{uncertain && <p role="alert">预览结果未收到，租户尚未因此应用变更；关闭后重新核对。</p>}
    </BaseDialog>
    <BaseDialog open={view !== null} title="逐户同步预览与实际结果" width="extra-wide" panelClassName="tenant-package-dialog" onClose={() => { if (!locked.current) { setView(null); setError(''); } }}
      footer={<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={loadSync}>刷新实际结果</Button>
        <Button variant="outline" disabled={busy || uncertain || !pending || !confirmation} onClick={() => syncAction(true)}>取消未应用项</Button>
        <Button disabled={busy || uncertain || !confirmable || !confirmation} onClick={() => syncAction(false)}>{view?.status === 'PREVIEWED' ? '确认应用本批变更' : '继续未完成项'}</Button></div>}>
      {view && catalog && <div className="space-y-4"><SyncResult view={view} catalog={catalog} />
        {view.status === 'PREVIEWED' ? <p role="status">{expired ? '预览已过期，禁止确认；请重新生成预览。' : `首次确认剩余${remaining}秒`}</p> : <p className="text-sm">已确认批次可按实际状态继续；已应用项不会重复应用。</p>}
        {pending && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={busy || uncertain} checked={confirmation} onChange={event => setConfirmation(event.target.checked)} />已逐户核对功能增减、额度与保留覆盖，确认本次操作范围为{view.preview.items.length}户</label>}
        {error && <p role="alert">{error}</p>}{uncertain && <p role="alert">提交结果未确认，请先刷新实际结果；当前禁止重复提交。</p>}
      </div>}
    </BaseDialog>
  </div>;
}

export default function TenantPackagePage() {
  const { hasPermission } = useAuth();
  if (!hasPermission('system:tenant-package:list')) return <p role="alert" className="card p-6 text-sm">您没有权限访问此内容</p>;
  return <section className="admin-source-page space-y-5"><PlatformOperationGate permission="system:tenant-package:list">{invalidate => <TenantPackageWorkspace invalidate={invalidate} />}</PlatformOperationGate></section>;
}
