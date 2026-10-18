import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, LoadingSpinner } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { Chart } from '@/components/charts/Chart';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import type { Decimal } from '@/services/api/oaOperations';
import './operations.css';

export const money = (value?: Decimal | null) => value == null ? '—' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const percent = (value?: Decimal | null) => value == null ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
export const labelOf = (options: Record<string, string>, value?: string) => value ? options[value] || value : '—';
export const dateInput = (value?: string) => value?.replace(' ', 'T').slice(0, 16) || '';
export const datePayload = (value: string) => value ? value.length === 10 ? `${value} 00:00:00` : value.replace('T', ' ').slice(0, 16) + ':00' : '';

export function useAccess() {
  const { hasPermission } = useAuth();
  return (permission: string) => hasPermission?.(permission) === true;
}

export function useRemote<T>(loader: () => Promise<T>, dependencies: React.DependencyList = []) {
  const loaderRef = useRef(loader); loaderRef.current = loader;
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(undefined);
    loaderRef.current().then(result => { if (active) setData(result); }).catch(failure => {
      if (active) setError(getErrorMessage(failure, '加载失败'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [...dependencies, revision]);
  return { data, error, loading, refresh, setData };
}

export function useMutation() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const run = async <Result,>(action: () => Promise<Result>, done?: (result: Result) => void, message = '操作成功') => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { const result = await action(); if (message) toast.success(message); done?.(result); }
    catch (failure) { toast.error(getErrorMessage(failure, '操作失败')); }
    finally { lock.current = false; setBusy(false); }
  };
  return { busy, run };
}

export const Field = ({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) => (
  <label className={`oa-ops-field ${wide ? 'md:col-span-2' : ''}`}><span>{label}</span>{children}</label>
);
export const OpsSelect = ({ label, value, options, onChange, empty, disabled }: { label: string; value?: string | number; options: Record<string, string>; onChange: (value: string) => void; empty?: string; disabled?: boolean }) => (
  <select aria-label={label} className="cf-control h-9 w-full rounded-md px-3 text-sm" value={value ?? ''} onChange={event => onChange(event.target.value)} disabled={disabled}>
    {empty !== undefined && <option value="">{empty}</option>}{Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select>
);
export const Flag = ({ label, value, onChange, disabled }: { label: string; value?: number | boolean; onChange: (checked: boolean) => void; disabled?: boolean }) => (
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={event => onChange(event.target.checked)} />{label}</label>
);
export const Amount = ({ value, onChange, label = '金额' }: { value?: Decimal; onChange: (value: string) => void; label?: string }) => (
  <Input aria-label={label} type="number" min="0" max="99999999999999.99" step="0.01" value={value ?? ''} onChange={event => onChange(event.target.value)} />
);
export const Section = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <section className="oa-ops-section">{title && <h3 className="mb-4 font-semibold text-cf-title">{title}</h3>}{children}</section>
);
export const Metric = ({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }) => (
  <div className="oa-ops-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>
);
export const Empty = ({ text = '暂无记录' }: { text?: string }) => <div className="p-10 text-center text-sm text-cf-muted">{text}</div>;
export const OperationsPage = ({ title, description, actions, filters, children, loading, error, refresh }: { title: string; description: string; actions?: React.ReactNode; filters?: React.ReactNode; children: React.ReactNode; loading?: boolean; error?: string; refresh?: () => void }) => (
  <section className="admin-source-page oa-operations"><TablePageLayout actions={<header className="admin-source-header"><div><p className="admin-source-kicker">OA ASSET & PROJECT OPERATIONS</p><h2>{title}</h2><span>{description}</span></div><div className="admin-source-controls">{refresh && <Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw size={15} />刷新</Button>}{actions}</div></header>}
    filters={filters} table={<div className="space-y-5">{error && <div role="alert" className="oa-ops-warning">{error}<Button variant="link" onClick={refresh}>重试</Button></div>}{loading && <div role="status" className="flex items-center gap-2 text-sm text-cf-muted"><LoadingSpinner />正在加载</div>}{children}</div>} /></section>
);
export const OpsTable = ({ headers, children, empty }: { headers: string[]; children: React.ReactNode; empty?: boolean }) => (
  <InnerTableSurface><table className="unity-data-table admin-source-table min-w-[700px]"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table>{empty && <Empty />}</InnerTableSurface>
);
export const Funnel = ({ values, title }: { values: { name: string; value: number }[]; title: string }) => (
  <Chart seriesCount={values.length} dataTable={{ columns: ['阶段', '数量'], rows: values.map(item => [item.name, item.value]) }} ariaLabel={title} style={{ height: 300 }} option={{ tooltip: { trigger: 'item' }, series: [{ type: 'funnel', sort: 'none', left: '10%', width: '80%', top: 12, bottom: 12, label: { formatter: '{b}：{c}' }, data: values }] }} />
);
