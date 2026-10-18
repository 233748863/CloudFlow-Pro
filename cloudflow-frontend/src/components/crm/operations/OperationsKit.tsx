import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, LoadingSpinner, TableScrollArea } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { Chart } from '@/components/charts/Chart';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import type { Decimal } from '@/services/api/crm/operations';
import { decimalAmount, groupAmountDigits } from '@/utils/amountValue';
import './operations.css';

export const activityStatuses = { PLANNED: '计划', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消', NOT_HELD: '未举行' };
export const acceptanceStatuses = { NONE: '未回应', ACCEPTED: '接受', DECLINED: '拒绝', TENTATIVE: '暂定' };
export const qualificationStatuses = { UNQUALIFIED: '未评估', QUALIFYING: '评估中', QUALIFIED: '合格', DISQUALIFIED: '不合格' };
export const ticketPriorities = { P1: 'P1 紧急', P2: 'P2 高', P3: 'P3 中', P4: 'P4 低' };
export const ticketStatuses = { OPEN: '待处理', IN_PROGRESS: '处理中', WAITING_CUSTOMER: '等待客户', RESOLVED: '已解决', CLOSED: '已关闭' };
export const campaignStatuses = { PLANNING: '策划', ACTIVE: '进行中', PAUSED: '暂停', COMPLETED: '完成', CANCELLED: '取消' };
export const campaignTypes = { EMAIL: '邮件', EVENT: '活动会议', WEBINAR: '线上研讨', EXHIBITION: '展会', OTHER: '其他' };
export const money = (value?: Decimal | null) => {
  const amount = decimalAmount(value);
  if (!amount) return '—';
  const [integer, fraction] = amount.toFixed(2).split('.');
  return `${groupAmountDigits(integer)}.${fraction}`;
};
export const percent = (value?: Decimal | null) => {
  const amount = decimalAmount(value);
  return amount ? `${amount.mul(100).toFixed(1)}%` : '—';
};
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
  <label className={`crm-ops-field ${wide ? 'md:col-span-2' : ''}`}><span>{label}</span>{children}</label>
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
  <section className="crm-ops-section">{title && <h3 className="mb-4 font-semibold text-cf-title">{title}</h3>}{children}</section>
);
export const Metric = ({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }) => (
  <div className="crm-ops-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>
);
export const Empty = ({ text = '暂无记录' }: { text?: string }) => <div className="p-10 text-center text-sm text-cf-muted">{text}</div>;
export const OperationsPage = ({ title, description, actions, filters, children, loading, error, refresh }: { title: string; description: string; actions?: React.ReactNode; filters?: React.ReactNode; children: React.ReactNode; loading?: boolean; error?: string; refresh?: () => void }) => (
  <section className="admin-source-page crm-operations"><TablePageLayout actions={<header className="admin-source-header"><div><p className="admin-source-kicker">CRM CUSTOMER OPERATIONS</p><h2>{title}</h2><span>{description}</span></div><div className="admin-source-controls">{refresh && <Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw size={15} />刷新</Button>}{actions}</div></header>}
    filters={filters} table={<div className="space-y-5">{error && <div role="alert" className="crm-ops-warning">{error}<Button variant="link" onClick={refresh}>重试</Button></div>}{loading && <div role="status" className="flex items-center gap-2 text-sm text-cf-muted"><LoadingSpinner />正在加载</div>}{children}</div>} /></section>
);
export const OpsTable = ({ headers, children, empty, tableClassName = '', ariaLabel, scrollHintId }: {
  headers: string[]; children: React.ReactNode; empty?: boolean; tableClassName?: string; ariaLabel?: string; scrollHintId?: string;
}) => {
  const content = <><table className={`unity-data-table admin-source-table min-w-[700px] ${tableClassName}`} aria-label={ariaLabel}><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{children}</tbody></table>{empty && <Empty />}</>;
  return <InnerTableSurface disableScrollWrapper={Boolean(ariaLabel)}>{ariaLabel
    ? <TableScrollArea role="region" aria-label={`${ariaLabel}横向滚动区域`} aria-describedby={scrollHintId} maxHeight="none">{content}</TableScrollArea>
    : content}</InnerTableSurface>;
};
export const Funnel = ({ values, title }: { values: { name: string; value: number }[]; title: string }) => (
  <div role="group" aria-label={`${title}与阶段明细`} className="space-y-3">
    <Chart seriesCount={values.length} dataTable={{ columns: ['阶段', '数量'], rows: values.map(item => [item.name, item.value]) }} ariaLabel={title} style={{ height: 300 }} option={{ tooltip: { trigger: 'item' }, series: [{ type: 'funnel', sort: 'none', left: '5%', width: '90%', top: 12, bottom: 12, label: { show: false }, labelLine: { show: false }, emphasis: { label: { show: false } }, data: values }] }} />
    <dl aria-label={`${title}阶段明细`} className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {values.map((item, index) => <div key={item.name} className="flex min-w-0 items-start justify-between gap-2">
        <dt className="flex min-w-0 items-start gap-2 text-sm text-cf-muted"><span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `var(--cf-chart-${index % 8 + 1})` }} /><span className="min-w-0 break-words">{item.name}</span></dt>
        <dd className="min-w-0 break-all text-right text-sm font-semibold tabular-nums">{item.value.toLocaleString('zh-CN')}</dd>
      </div>)}
    </dl>
  </div>
);
