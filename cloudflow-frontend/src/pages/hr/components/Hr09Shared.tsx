import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Inbox, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, DictBadge, Input, Label, ListResultFooter, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { Hr09Error, hr09Message } from '@/services/api/hr/hr09Model';
import type { BusinessBlockerVO, Hr09NamedOption, RuleWarningVO, ShiftSlotVO, TimeSegmentVO } from '@/services/api/hr/hr09Types';
import '../admin-hr.css';
import './hr09-mobile.css';

export const overtimeStatuses = { DRAFT: '草稿', SUBMITTED: '待核定', PENDING: '待启动审批', APPROVING: '审批中', APPROVED: '已通过', REJECTED: '已拒绝', CANCELLED: '已撤回' };
export const settlementStatuses = { NOT_READY: '未就绪', PENDING: '待结算', SETTLED: '已结算', FAILED: '执行失败', NEEDS_RESOLUTION: '待人工处置', CORRECTION_PENDING: '补正审批中', REJECTED: '自动结算已结案' };
export const shiftStatuses = { DRAFT: '草稿', WAITING_ACCEPTANCE: '等待对方同意', PENDING: '待启动审批', APPROVING: '审批中', APPROVED: '已通过', REJECTED: '已拒绝', CANCELLED: '已撤回' };
export const applicationStatuses = { NOT_READY: '未就绪', PENDING: '待应用', APPLIED: '已应用', FAILED: '应用失败' };
export const peerStatuses = { NONE: '无需对方同意', PENDING: '待回应', ACCEPTED: '已同意', DECLINED: '已拒绝' };
export const settleModes = { PAY: '加班费', COMPENSATORY: '调休' };
export const dayTypes = { WORKDAY: '工作日', REST_DAY: '休息日', HOLIDAY: '法定节假日' };
export const shiftModes = { SINGLE: '本人换班', SWAP: '双方互换' };
export const asOptions = (labels: Record<string, string>): Hr09NamedOption[] => Object.entries(labels).map(([value, label]) => ({ value, label }));
export const dateTimeText = (value?: string | null) => value ? value.replace('T', ' ').slice(0, 16) : '—';
export const minutesText = (value?: number | null) => value == null ? '未核定' : `${value} 分钟`;

export function Hr09Access({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { user, hasPermission, loading } = useAuth();
  if (loading) return <Hr09State loading title="正在确认访问权限" />;
  if (!hasPermission(permission)) return <Hr09State error title="无权访问此页面" description="当前账号未获得该入口权限。" />;
  return <React.Fragment key={`${user?.id}:${user?.tenantId}`}>{children}</React.Fragment>;
}

export function useHr09Resource<Result>(load: (signal: AbortSignal) => Promise<Result>, dependencies: React.DependencyList, enabled = true) {
  const loader = useRef(load);
  loader.current = load;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ data?: Result; loading: boolean; error?: Hr09Error }>({ loading: enabled });
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) { setState({ loading: false }); return; }
    const controller = new AbortController();
    setState({ loading: true });
    void Promise.resolve().then(() => loader.current(controller.signal)).then(data => {
      if (!controller.signal.aborted) setState({ loading: false, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ loading: false, error: error instanceof Hr09Error ? error : new Hr09Error('读取失败，请刷新后重试。') });
    });
    return () => controller.abort();
  }, [revision, enabled, ...dependencies]);
  return { ...state, refresh };
}

export function useHr09Mutation() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Hr09Error>();
  const run = async (work: () => Promise<unknown>) => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try { await work(); return true; }
    catch (caught) { setError(caught instanceof Hr09Error ? caught : new Hr09Error('操作未完成，请重新读取记录后重试。')); return false; }
    finally { locked.current = false; setBusy(false); }
  };
  return { busy, error, run };
}

export function Hr09State({ title, description, loading, error, onRetry }: { title: string; description?: string; loading?: boolean; error?: boolean; onRetry?: () => void }) {
  const Icon = loading ? LoaderCircle : error ? AlertCircle : Inbox;
  return <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center" role={error ? 'alert' : 'status'} aria-busy={loading}>
    <Icon className={`h-6 w-6 text-cf-muted ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
    <p className="text-sm font-medium text-cf-title">{title}</p>
    {description && <p className="max-w-xl text-sm leading-6 text-cf-subtle">{description}</p>}
    {onRetry && <Button variant="outline" onClick={onRetry}><RefreshCw size={16} className="mr-2" />重新读取</Button>}
  </div>;
}

export function Hr09Notice({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return <div role={danger ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm leading-6 ${danger ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200' : 'border-[var(--cf-border)] bg-[var(--cf-surface-muted)] text-cf-muted'}`}>{children}</div>;
}

export function Hr09ErrorNotice({ error }: { error?: unknown }) {
  if (!error) return null;
  return <Hr09Notice danger>{error instanceof Hr09Error && error.code ? `${error.code}：` : ''}{hr09Message(error)}{error instanceof Hr09Error && error.status === 409 ? ' 请重新读取并核对当前版本及配置后再操作。' : ''}</Hr09Notice>;
}

export function Hr09Blockers({ blockers, warnings = [] }: { blockers: BusinessBlockerVO[]; warnings?: RuleWarningVO[] }) {
  return <div className="space-y-2">
    {blockers.map((blocker, index) => <Hr09Notice key={`${blocker.code}:${index}`} danger><span className="font-medium">{blocker.code}：</span>{blocker.message}</Hr09Notice>)}
    {warnings.map((warning, index) => <Hr09Notice key={`${warning.ruleCode}:${warning.dimension}:${index}`}><span className="font-medium">{warning.dimension === 'DAY' ? '日上限' : '月上限'}提醒：</span>{warning.message}（上限 {warning.limitHours} 小时，实际 {warning.actualHours} 小时）</Hr09Notice>)}
  </div>;
}

export function Hr09Status({ value, kind }: { value: string; kind: 'overtime' | 'settlement' | 'shift' | 'application' | 'peer' }) {
  const definitions = {
    overtime: { dictionary: 'hr_overtime_status', labels: overtimeStatuses },
    settlement: { dictionary: 'hr_overtime_settlement_status', labels: settlementStatuses },
    shift: { dictionary: 'hr_shift_request_status', labels: shiftStatuses },
    application: { dictionary: 'hr_shift_application_status', labels: applicationStatuses },
    peer: { dictionary: 'hr_shift_peer_acceptance_status', labels: peerStatuses },
  };
  const definition = definitions[kind];
  return <DictBadge dictType={definition.dictionary} value={value} fallback={(definition.labels as Record<string, string>)[value] || `未知状态（${value || '缺失'}）`} />;
}

export function Hr09Page({ title, description, actions, children }: { title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return <section className="admin-source-page hr09-workspace space-y-4">
    <header className="admin-source-header"><div className="min-w-0"><p className="admin-source-kicker">HR</p><h1 className="text-xl font-semibold text-cf-title">{title}</h1><p className="mt-1 text-sm leading-6 text-cf-subtle">{description}</p></div><div className="admin-source-controls flex flex-wrap gap-2">{actions}</div></header>
    {children}
  </section>;
}

export interface Hr09Column<Row> { key: string; label: string; render: (row: Row) => React.ReactNode }

export function Hr09Table<Row>({ rows, columns, rowKey, loading, error, onRefresh, emptyText = '暂无记录' }: {
  rows: Row[]; columns: Hr09Column<Row>[]; rowKey: (row: Row) => string; loading?: boolean; error?: Hr09Error; onRefresh?: () => void; emptyText?: string;
}) {
  if (loading) return <Hr09State loading title="正在读取记录" />;
  if (error) return <Hr09State error title="读取失败" description={hr09Message(error)} onRetry={onRefresh} />;
  if (!rows.length) return <Hr09State title={emptyText} description="当前条件下没有可展示的记录。" />;
  return <><div role="list" className="space-y-3 md:hidden">{rows.map(row => <article role="listitem" key={rowKey(row)} className="card min-w-0 p-4"><dl className="space-y-3">{columns.map(column => <div key={column.key} className="min-w-0"><dt className="text-xs text-cf-subtle">{column.label}</dt><dd className="mt-1 min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-cf-body [overflow-wrap:anywhere]">{column.render(row)}</dd></div>)}</dl></article>)}</div><div className="hidden md:block"><InnerTableSurface><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-[var(--cf-border)] bg-[var(--cf-surface-muted)] text-cf-subtle">{columns.map(column => <th scope="col" key={column.key} className="whitespace-nowrap px-4 py-3 font-medium">{column.label}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={rowKey(row)} className="border-b border-[var(--cf-border)] last:border-0">{columns.map(column => <td key={column.key} className="px-4 py-3 align-top text-cf-body">{column.render(row)}</td>)}</tr>)}</tbody>
  </table></InnerTableSurface></div></>;
}

export function Hr09ListLayout({ filters, table, total, page, pageSize, onPageChange }: { filters: React.ReactNode; table: React.ReactNode; total?: number; page: number; pageSize: number; onPageChange: (page: number) => void }) {
  return <TablePageLayout filters={filters} table={table} pagination={total == null ? undefined : <ListResultFooter total={total} page={page} pageSize={pageSize} onPageChange={onPageChange} summary={`共 ${total} 条记录`} />} />;
}

export function Hr09Input({ label, hint, ...props }: React.ComponentProps<typeof Input> & { label: string; hint?: string }) {
  const generated = useId();
  const fieldId = props.id || generated;
  return <div className="space-y-2"><Label htmlFor={fieldId}>{label}{props.required ? ' *' : ''}</Label><Input {...props} id={fieldId} aria-describedby={hint ? `${fieldId}-hint` : undefined} />{hint && <p id={`${fieldId}-hint`} className="text-xs leading-5 text-cf-subtle">{hint}</p>}</div>;
}

export function Hr09Textarea({ label, hint, ...props }: React.ComponentProps<typeof Textarea> & { label: string; hint?: string }) {
  const fieldId = useId();
  return <div className="space-y-2"><Label htmlFor={fieldId}>{label}{props.required ? ' *' : ''}</Label><Textarea {...props} id={fieldId} aria-describedby={hint ? `${fieldId}-hint` : undefined} />{hint && <p id={`${fieldId}-hint`} className="text-xs leading-5 text-cf-subtle">{hint}</p>}</div>;
}

export function Hr09Select({ label, value, options, onChange, disabled, placeholder = '请选择', hint, required }: {
  label: string; value: string; options: Hr09NamedOption[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; hint?: string; required?: boolean;
}) {
  return <div className="space-y-2"><Label>{label}{required ? ' *' : ''}</Label><Select value={value || '__none__'} onValueChange={next => onChange(next === '__none__' ? '' : next)} disabled={disabled}>
    <SelectTrigger className="w-full" aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent><SelectItem value="__none__">{placeholder}</SelectItem>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>{hint && <p className="text-xs leading-5 text-cf-subtle">{hint}</p>}</div>;
}

export function Hr09Value({ label, children }: { label: string; children?: React.ReactNode }) {
  return <div className="min-w-0 border-b border-[var(--cf-border)] pb-3"><dt className="text-xs text-cf-subtle">{label}</dt><dd className="mt-1.5 break-words whitespace-pre-wrap text-sm leading-6 text-cf-title">{children == null || children === '' ? '未提供' : children}</dd></div>;
}

export function Hr09FormDialog({ title, description, children, onClose, onSubmit, submitText = '确认提交', successText = '操作已完成', blocked = false, confirmation, onReload, panelClassName }: {
  title: string; description?: string; children: React.ReactNode; onClose: () => void; onSubmit: () => Promise<unknown>; submitText?: string; successText?: string; blocked?: boolean; confirmation?: string; onReload?: () => void; panelClassName?: string;
}) {
  const formId = useId();
  const mutation = useHr09Mutation();
  const [confirmed, setConfirmed] = useState(false);
  const conflict = mutation.error?.status === 409;
  const close = () => { if (!mutation.busy) onClose(); };
  return <BaseDialog open title={title} description={description} onClose={close} width="wide" panelClassName={`hr09-dialog ${panelClassName || ''}`} hideCloseButton={mutation.busy} closeOnEscape={!mutation.busy} footer={<div className="flex flex-wrap justify-end gap-2">
    {conflict && onReload && <Button variant="outline" disabled={mutation.busy} onClick={onReload}>重新读取记录</Button>}
    <Button variant="outline" disabled={mutation.busy} onClick={close}>取消</Button><Button type="submit" form={formId} variant={confirmation ? 'warning' : 'default'} disabled={mutation.busy || blocked || conflict || Boolean(confirmation && !confirmed)}>{mutation.busy && <LoaderCircle size={16} className="mr-2 animate-spin motion-reduce:animate-none" />}{submitText}</Button>
  </div>}>
    <form id={formId} className="space-y-4" aria-busy={mutation.busy} onSubmit={event => {
      event.preventDefault();
      if (blocked || conflict || confirmation && !confirmed) return;
      void mutation.run(async () => { await onSubmit(); toast.success(successText); onClose(); });
    }}><fieldset disabled={mutation.busy} className="min-w-0 space-y-4">{children}{confirmation && <label className="flex items-start gap-3 rounded-lg border border-[var(--cf-border)] p-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>{confirmation}</span></label>}</fieldset><Hr09ErrorNotice error={mutation.error} /></form>
  </BaseDialog>;
}

export function Hr09Segments({ segments }: { segments: TimeSegmentVO[] }) {
  return <Hr09Table rows={segments} rowKey={row => `${row.startTime}:${row.endTime}:${row.kind}`} emptyText="暂无可展示的打卡区间" columns={[
    { key: 'time', label: '实际区间', render: row => `${dateTimeText(row.startTime)} — ${dateTimeText(row.endTime)}` },
    { key: 'kind', label: '计量归类', render: row => ({ WORK: '有效工作', BREAK: '休息扣除', EXCLUDED: '排除区间' })[row.kind] || row.kind },
    { key: 'minutes', label: '分钟', render: row => row.minutes },
    { key: 'source', label: '打卡记录标识', render: row => row.sourceCheckinIds?.join('、') || '未提供' },
  ]} />;
}

export function Hr09Slots({ title, before, after, names = {} }: { title: string; before: ShiftSlotVO[]; after: ShiftSlotVO[]; names?: Record<string, string> }) {
  return <section className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-medium text-cf-title"><ShieldCheck size={16} />{title}</h3>
    <Hr09Table rows={before.map(slot => ({ before: slot, after: after.find(target => target.employeeId === slot.employeeId) }))} rowKey={row => row.before.employeeId} columns={[
      { key: 'employee', label: '人员 / 日期', render: row => <>{names[row.before.employeeId] || `员工 ${row.before.employeeId}`}<div className="mt-1 text-xs text-cf-subtle">{row.before.attendanceDate}</div></> },
      { key: 'before', label: '调整前', render: row => <>{dateTimeText(row.before.startTime)}<br />至 {dateTimeText(row.before.endTime)}<div className="mt-1 text-xs text-cf-subtle">班次 {row.before.shiftId} · 规则 {row.before.ruleId || '未配置'}</div></> },
      { key: 'after', label: '调整后', render: row => row.after ? <>{dateTimeText(row.after.startTime)}<br />至 {dateTimeText(row.after.endTime)}<div className="mt-1 text-xs text-cf-subtle">班次 {row.after.shiftId} · 规则 {row.after.ruleId || '未配置'}</div></> : '目标排班尚未确定' },
      { key: 'version', label: '确认依据', render: row => <>排班 {row.before.assignmentId || '未提供'}<div className="mt-1 text-xs text-cf-subtle">排班版本 {row.before.assignmentVersion ?? '未提供'} · 班次版本 {row.before.shiftVersion ?? '未提供'} · 规则版本 {row.before.ruleVersion ?? '未提供'}</div></> },
    ]} />
  </section>;
}
