import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Pagination } from '@/components/common';
import { listTenantPackages, readTenantPackageCatalog } from '@/services/api/tenantPackage';
import type { TenantPackageAdjustments, TenantPackageCatalog, TenantPackagePage, TenantPackageSelection, TenantPackageTemplate } from '@/services/api/tenantPackage';
import { platformHttpStatus } from '@/services/api/platformAccess';
import { getErrorMessage } from '@/utils/errorMessage';
import { TenantPackageFeatures } from './TenantPackageFeatures';
import { emptyPackageAdjustments, packageSelectionError, readPackageAdjustments } from './tenantPackageSelection';

export function TenantPackageAssignment({ originalOverride, disabled, onChange, invalidate }: {
  originalOverride?: string | null; disabled: boolean; onChange: (selection: TenantPackageSelection | undefined, ready: boolean) => void; invalidate: () => void;
}) {
  const original = useMemo(() => {
    try { return { adjustments: readPackageAdjustments(originalOverride), error: '' }; }
    catch (failure) { return { adjustments: emptyPackageAdjustments(), error: getErrorMessage(failure, '原覆盖数据不可用') }; }
  }, [originalOverride]);
  const [adjustments, setAdjustments] = useState<TenantPackageAdjustments>(original.adjustments);
  const [catalog, setCatalog] = useState<TenantPackageCatalog | null>(null);
  const [page, setPage] = useState<TenantPackagePage | null>(null);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10 });
  const [selected, setSelected] = useState<TenantPackageTemplate | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const callbacks = useRef({ onChange, invalidate });
  callbacks.current = { onChange, invalidate };
  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError('');
    void Promise.all([listTenantPackages(query, cancellation.signal), readTenantPackageCatalog(cancellation.signal)]).then(([result, features]) => {
      if (!cancellation.signal.aborted) { setPage(result); setCatalog(features); }
    }).catch(failure => {
      if (cancellation.signal.aborted) return;
      if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) callbacks.current.invalidate();
      else setError(getErrorMessage(failure, '读取可选套餐失败'));
    }).finally(() => { if (!cancellation.signal.aborted) setLoading(false); });
    return () => cancellation.abort();
  }, [query]);
  const selectionError = selected && catalog ? packageSelectionError(catalog, selected.menuIds, undefined, adjustments) : '';
  const quotaError = adjustments.maxUsers != null && (!Number.isInteger(adjustments.maxUsers) || adjustments.maxUsers < 1 || adjustments.maxUsers > 2147483647)
    || adjustments.maxStorageMb != null && (!Number.isSafeInteger(adjustments.maxStorageMb) || adjustments.maxStorageMb < 1 || adjustments.maxStorageMb > 8796093022207);
  const ready = Boolean(selected && catalog && !loading && !error && !selectionError && !quotaError && !original.error);
  useEffect(() => {
    callbacks.current.onChange(selected ? { packageId: selected.packageId, packageVersion: selected.version, adjustments } : undefined, ready);
  }, [selected, adjustments, ready]);
  return <section className="space-y-4" aria-label="明确分配租户套餐">
    <p className="text-sm text-cf-muted">选择启用中的套餐版本；原有个别覆盖会保留，可逐项调整。保存后应用本次明确选择。</p>
    {loading ? <p role="status">正在读取可选套餐…</p> : error ? <p role="alert">{error}</p> : <fieldset disabled={disabled || Boolean(original.error)} className="space-y-2"><legend className="text-sm font-medium">选择套餐</legend>
      {page?.rows.length ? page.rows.map(template => <label key={template.packageId} className="flex min-h-11 items-center gap-3 rounded-md border border-[var(--cf-border)] p-3 text-sm">
        <input type="radio" name="assigned-package" disabled={template.status !== 'ACTIVE'} checked={selected?.packageId === template.packageId && selected.version === template.version} onChange={() => setSelected(template)} />
        {template.packageName} · 版本{template.version} · {template.maxUsers}人 / {template.maxStorageMb} MB{template.status !== 'ACTIVE' ? '（不可分配）' : ''}
      </label>) : <p>暂无可选套餐，请先创建并启用模板。</p>}
    </fieldset>}
    <Pagination total={page?.total ?? 0} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => setQuery(previous => ({ ...previous, pageNum }))} onPageSizeChange={pageSize => setQuery({ pageNum: 1, pageSize })} />
    {selected && <p className="text-sm">本次选择：{selected.packageName}（{selected.packageId}），版本{selected.version}</p>}
    {selected && catalog && <>
      <fieldset disabled={disabled || Boolean(original.error)} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">个别用户上限（留空沿用套餐）<Input type="number" min={1} max={2147483647} step={1} value={adjustments.maxUsers ?? ''} onChange={event => setAdjustments(previous => ({ ...previous, maxUsers: event.target.value === '' ? null : Number(event.target.value) }))} /></label>
        <label className="space-y-2 text-sm">个别存储上限（MB，留空沿用套餐）<Input type="number" min={1} max={8796093022207} step={1} value={adjustments.maxStorageMb ?? ''} onChange={event => setAdjustments(previous => ({ ...previous, maxStorageMb: event.target.value === '' ? null : Number(event.target.value) }))} /></label>
      </fieldset>
      <TenantPackageFeatures catalog={catalog} selected={selected.menuIds} adjustments={adjustments} disabled={disabled || Boolean(original.error)} onAdjustmentsChange={setAdjustments} />
      <p className="text-sm">本次上限：{adjustments.maxUsers ?? selected.maxUsers}人，{adjustments.maxStorageMb ?? selected.maxStorageMb} MB；超额不会删除既有数据。</p>
    </>}
    {(original.error || selectionError || quotaError) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{original.error || selectionError || '个别额度必须是允许范围内的正整数'}</p>}
  </section>;
}
