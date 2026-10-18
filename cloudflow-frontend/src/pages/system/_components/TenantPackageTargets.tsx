import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, Pagination } from '@/components/common';
import { getTenantPage, type SysTenant } from '@/services/api/tenant';
import { getErrorMessage } from '@/utils/errorMessage';
import { platformHttpStatus } from '@/services/api/platformAccess';

export function TenantPackageTargets({ packageId, selected, onChange, disabled, invalidate }: {
  packageId: number; selected: Map<number, string>; onChange: (selected: Map<number, string>) => void; disabled: boolean; invalidate: () => void;
}) {
  const [query, setQuery] = useState({ current: 1, size: 10, tenantName: '' });
  const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState<SysTenant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestInvalidate = useRef(invalidate);
  latestInvalidate.current = invalidate;
  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError(''); setRows([]);
    void getTenantPage(query, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted) { setRows(result.records); setTotal(result.total); }
    }).catch(failure => {
      if (cancellation.signal.aborted) return;
      if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) latestInvalidate.current();
      else setError(getErrorMessage(failure, '租户列表读取失败'));
    }).finally(() => { if (!cancellation.signal.aborted) setLoading(false); });
    return () => cancellation.abort();
  }, [query]);
  return <section className="space-y-3" aria-label="选择同步租户">
    <div className="flex flex-wrap items-end gap-2"><label className="flex-1 space-y-2 text-sm">搜索租户名称<Input value={keyword} onChange={event => setKeyword(event.target.value)} /></label>
      <Button variant="outline" disabled={disabled} onClick={() => setQuery(previous => ({ ...previous, current: 1, tenantName: keyword.trim() }))}>查找租户</Button></div>
    <p className="text-sm text-cf-muted">仅可勾选已使用此套餐的租户；翻页保留已选项，不自动选中其他租户。</p>
    {loading ? <p role="status">正在加载租户…</p> : error ? <p role="alert">{error}</p> : rows.length === 0 ? <p>没有匹配租户</p> : rows.map(tenant => <label key={tenant.tenantId} className="flex min-h-11 items-center gap-3 rounded-md border border-[var(--cf-border)] p-3 text-sm">
      <input type="checkbox" disabled={disabled || !tenant.tenantId || tenant.packageId !== packageId} checked={selected.has(tenant.tenantId ?? 0)} onChange={event => {
        if (!tenant.tenantId) return;
        const next = new Map(selected);
        if (event.target.checked) next.set(tenant.tenantId, tenant.tenantName); else next.delete(tenant.tenantId);
        onChange(next);
      }} />{tenant.tenantName} · {tenant.tenantId}{tenant.packageId !== packageId ? '（未使用此套餐）' : `（已应用版本${tenant.packageVersion}）`}
    </label>)}
    <Pagination total={total} page={query.current} pageSize={query.size} onPageChange={current => setQuery(previous => ({ ...previous, current }))} onPageSizeChange={size => setQuery(previous => ({ ...previous, current: 1, size }))} />
    <p className="break-words text-sm" aria-live="polite">已选{selected.size}户：{[...selected.entries()].map(([tenantId, name]) => `${name}（${tenantId}）`).join('、') || '无'}</p>
    <Button variant="outline" disabled={disabled || selected.size === 0} onClick={() => onChange(new Map())}>清空已选</Button>
  </section>;
}
