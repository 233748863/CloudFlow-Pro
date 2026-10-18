import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard } from '@/components/common';
import { LineChart } from '@/components/charts/presets';
import { useAuth } from '@/context/AuthContext';
import { getApiError, getErrorTrend, getLogTrace, getSlowEndpoints, listApiErrors, processApiError } from '@/services/api/observability';
import type { ApiErrorLog, ErrorQuery, ErrorStatus, ErrorTrend, SlowEndpoint, TraceBundle } from '@/services/api/observability';
import { getErrorMessage } from '@/utils/errorMessage';
import { validTraceId } from '@/utils/trace';
import { useInfrastructurePage } from './_components/useInfrastructurePage';
import { InfrastructureBadge, InfrastructurePageHeader, InfrastructureSelect, InfrastructureTableStateRow } from './_components/InfrastructurePrimitives';

const statuses: Record<ErrorStatus, string> = { TODO: '待处理', PROCESSING: '处理中', DONE: '已处理', IGNORED: '已忽略' };
const statusOptions = Object.entries(statuses).map(([value, label]) => ({ value, label }));
const services = ['cloudflow-gateway', 'cloudflow-auth', 'cloudflow-service-workflow', 'cloudflow-service-oa', 'cloudflow-service-crm', 'cloudflow-service-hr'];
const panel = 'rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4';
const textBlock = 'max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--cf-surface-muted)] p-3 text-xs';

function ObservabilityWorkspace() {
  const { hasPermission } = useAuth();
  const canReadRequests = hasPermission(['system:log:list']);
  const page = useInfrastructurePage(listApiErrors, { pageNum: 1, pageSize: 20 } as ErrorQuery);
  const [trend, setTrend] = useState<ErrorTrend[]>([]);
  const [slow, setSlow] = useState<SlowEndpoint[]>([]);
  const [sort, setSort] = useState('duration');
  const [summaryError, setSummaryError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ApiErrorLog | null>(null);
  const [detailError, setDetailError] = useState('');
  const [status, setStatus] = useState<ErrorStatus>('PROCESSING');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [traceInput, setTraceInput] = useState('');
  const [traceId, setTraceId] = useState('');
  const [tracePage, setTracePage] = useState(1);
  const [tracePageSize, setTracePageSize] = useState(100);
  const [trace, setTrace] = useState<TraceBundle | null>(null);
  const [traceError, setTraceError] = useState('');
  const [traceLoading, setTraceLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setSummaryLoading(true);
    setSummaryError('');
    Promise.all([getErrorTrend(page.query.start, page.query.end), canReadRequests ? getSlowEndpoints(page.query.start, page.query.end, sort) : Promise.resolve([])])
      .then(([nextTrend, nextSlow]) => { if (active) { setTrend(nextTrend); setSlow(nextSlow); } })
      .catch((error: unknown) => { if (active) { setTrend([]); setSlow([]); setSummaryError(getErrorMessage(error, '统计加载失败')); } })
      .finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [page.query.start, page.query.end, sort, refresh, canReadRequests]);

  useEffect(() => {
    let active = true;
    setSelected(null);
    setDetailError('');
    if (selectedId !== null) void getApiError(selectedId).then((entry) => {
      if (active) { setSelected(entry); setStatus(entry.processStatus); setRemark(entry.processRemark || ''); }
    }).catch((error: unknown) => { if (active) setDetailError(getErrorMessage(error, '详情加载失败')); });
    return () => { active = false; };
  }, [selectedId, refresh]);

  useEffect(() => {
    let active = true;
    setTrace(null);
    setTraceError('');
    if (!traceId) return () => { active = false; };
    setTraceLoading(true);
    void getLogTrace(traceId, tracePage, tracePageSize).then((result) => { if (active) setTrace(result); })
      .catch((error: unknown) => { if (active) setTraceError(getErrorMessage(error, '关联记录加载失败')); })
      .finally(() => { if (active) setTraceLoading(false); });
    return () => { active = false; };
  }, [traceId, tracePage, tracePageSize, refresh]);

  const filter = (key: keyof ErrorQuery, value: string) => page.setQuery(current => ({ ...current, [key]: value || undefined, pageNum: 1 }));
  const openTrace = (value: string) => {
    const valid = validTraceId(value.trim());
    if (!valid) { toast.error('请输入16至64位字母、数字、下划线或连字符组成的追踪编号'); return; }
    setTracePage(1);
    setTraceId(valid);
    setSelectedId(null);
  };
  const process = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await processApiError(selected.errorId, selected.processStatus, status, remark);
      toast.success('处理状态已更新');
      page.refresh();
      setRefresh(value => value + 1);
    } catch (error) { setDetailError(getErrorMessage(error, '更新失败，请刷新后重试')); }
    finally { setBusy(false); }
  };
  const openButton = (entry: ApiErrorLog) => <Button variant="ghost" className="min-h-11" onClick={() => setSelectedId(entry.errorId)}>查看详情</Button>;
  const badge = (entry: ApiErrorLog) => <InfrastructureBadge tone={entry.processStatus === 'DONE' ? 'success' : entry.processStatus === 'TODO' ? 'warning' : 'neutral'}>{statuses[entry.processStatus]}</InfrastructureBadge>;

  return <div className="admin-source-page space-y-5 p-4 sm:p-6">
    <InfrastructurePageHeader kicker="运行监控" title="错误与请求追踪" description="追踪编号用于关联同一次请求的前端、网关和服务日志；所有记录仅限当前租户。">
      <Button variant="outline" className="min-h-11" onClick={() => { page.refresh(); setRefresh(value => value + 1); }}><RefreshCw className="mr-2 h-4 w-4" />刷新</Button>
    </InfrastructurePageHeader>
    <section className={`${panel} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`} aria-label="日志筛选">
      <label className="space-y-2 text-sm">开始日期<Input type="date" value={page.query.start || ''} onChange={event => filter('start', event.target.value)} /></label>
      <label className="space-y-2 text-sm">结束日期<Input type="date" value={page.query.end || ''} onChange={event => filter('end', event.target.value)} /></label>
      <div className="space-y-2 text-sm"><span>服务</span><InfrastructureSelect aria-label="服务筛选" value={page.query.serviceName || 'ALL'} options={[{ value: 'ALL', label: '全部服务' }, ...services.map(value => ({ value, label: value }))]} onValueChange={value => filter('serviceName', value === 'ALL' ? '' : value)} /></div>
      <div className="space-y-2 text-sm"><span>处理状态</span><InfrastructureSelect aria-label="处理状态筛选" value={page.query.status || 'ALL'} options={[{ value: 'ALL', label: '全部状态' }, ...statusOptions]} onValueChange={value => filter('status', value === 'ALL' ? '' : value)} /></div>
      <label className="space-y-2 text-sm">异常类型<Input value={page.query.exceptionClass || ''} onChange={event => filter('exceptionClass', event.target.value)} placeholder="按异常类名筛选" /></label>
      {canReadRequests && <form className="space-y-2 sm:col-span-2 lg:col-span-3" onSubmit={event => { event.preventDefault(); openTrace(traceInput); }}><label htmlFor="log-trace-input" className="text-sm">请求追踪编号</label><div className="flex gap-2"><Input id="log-trace-input" value={traceInput} maxLength={64} onChange={event => setTraceInput(event.target.value)} placeholder="粘贴报错中的追踪编号" /><Button type="submit" className="min-h-11 shrink-0"><Search className="mr-2 h-4 w-4" />查关联</Button></div></form>}
    </section>
    {summaryError && <p role="alert" className="text-sm text-red-600">{summaryError}</p>}
    <div className="grid gap-4 lg:grid-cols-2" aria-busy={summaryLoading}>
      <section className={panel}><h3 className="mb-2 font-medium">错误趋势</h3><p className="text-xs text-cf-subtle">按时间范围统计；未选择日期时展示最近30天。</p>
        {summaryLoading ? <p className="py-12 text-center text-sm">加载统计中…</p> : <LineChart ariaLabel="每日API错误数量趋势" height={256} categories={trend.map(row => row.date)} categoryAxisName="日期" series={[{ name: '错误数量', semantic: 'critical', values: trend.map(row => row.errorCount) }]} />}
      </section>
      {canReadRequests && <section className={panel}><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">慢请求排行 · 前20项</h3><InfrastructureSelect aria-label="慢请求排序" value={sort} options={[{ value: 'duration', label: '按平均耗时' }, { value: 'volume', label: '按调用量' }]} onValueChange={setSort} /></div>
        <div className="max-h-64 space-y-3 overflow-auto">{slow.length === 0 && !summaryLoading && <p className="py-8 text-center text-sm text-cf-subtle">当前时间范围没有慢请求</p>}{slow.map(entry => <article key={`${entry.serviceName}:${entry.requestMethod}:${entry.requestUrl}`} className="rounded-lg border border-[var(--cf-border)] p-3 text-sm"><div className="flex items-center justify-between gap-2"><span>{entry.serviceName}</span><span className="shrink-0 tabular-nums">{entry.averageDuration} 毫秒</span></div><p className="mt-1 break-all text-xs text-cf-subtle">{entry.requestMethod} {entry.requestUrl}</p><p className="mt-1 text-xs text-cf-subtle">调用 {entry.requestCount} 次 · 慢请求 {entry.slowCount} 次 · 最长 {entry.maximumDuration} 毫秒</p></article>)}</div>
      </section>}
    </div>
    <section className={`${panel} !p-0`} aria-label="错误日志列表" aria-busy={page.loading}>
      <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm"><thead><tr>{['发生时间', '服务与请求', '错误', '状态', '操作'].map(label => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>
        {page.loading || page.error || page.rows.length === 0 ? <InfrastructureTableStateRow colSpan={5} loading={page.loading} title={page.error || (page.loading ? '加载中' : '暂无错误日志')} /> : page.rows.map(entry => <tr key={entry.errorId} className="border-t border-[var(--cf-border)]"><td className="whitespace-nowrap px-4 py-3">{entry.occurTime}</td><td className="max-w-72 break-all px-4 py-3"><p>{entry.serviceName}</p><p className="text-xs text-cf-subtle">{entry.requestMethod} {entry.requestUrl}</p></td><td className="max-w-80 px-4 py-3"><p className="line-clamp-2 break-all">{entry.exceptionMessage || entry.exceptionClass}</p></td><td className="px-4 py-3">{badge(entry)}</td><td className="px-4 py-3">{openButton(entry)}</td></tr>)}
      </tbody></table></div>
      <div className="space-y-3 p-3 sm:hidden">{page.loading || page.error || page.rows.length === 0 ? <p role={page.error ? 'alert' : 'status'} className="py-8 text-center text-sm">{page.error || (page.loading ? '加载中…' : '暂无错误日志')}</p> : page.rows.map(entry => <article key={entry.errorId} className="rounded-lg border border-[var(--cf-border)] p-3"><div className="flex items-center justify-between gap-2 text-sm"><span>{entry.serviceName}</span>{badge(entry)}</div><p className="mt-2 break-all text-sm">{entry.exceptionMessage || entry.exceptionClass}</p><p className="mt-2 text-xs text-cf-subtle">{entry.occurTime}</p>{openButton(entry)}</article>)}</div>
      <Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize} onPageChange={pageNum => page.setQuery(current => ({ ...current, pageNum }))} onPageSizeChange={pageSize => page.setQuery(current => ({ ...current, pageNum: 1, pageSize }))} />
    </section>
    <BaseDialog open={selectedId !== null} title="错误详情" width="extra-wide" onClose={() => { if (!busy) setSelectedId(null); }}>
      {detailError && <p role="alert" className="mb-3 text-sm text-red-600">{detailError}</p>}
      {!selected && !detailError && <p role="status">加载中…</p>}
      {selected && <div className="space-y-4"><p className="break-all text-sm">{selected.serviceName} · {selected.requestMethod} {selected.requestUrl}</p><p className="break-all">{selected.exceptionMessage}</p><pre className={textBlock}>{selected.exceptionStack || '没有异常堆栈'}</pre><details><summary className="min-h-11 cursor-pointer py-3 text-sm">已脱敏请求参数</summary><pre className={textBlock}>{selected.requestParams || '未记录参数'}</pre></details>
        {canReadRequests && selected.traceId && <Button variant="outline" className="min-h-11" onClick={() => openTrace(selected.traceId!)}><Activity className="mr-2 h-4 w-4" />查看关联请求</Button>}
        <p className="break-all text-xs text-cf-subtle">追踪编号：{selected.traceId || '未记录'} · 处理人：{selected.processBy || '未处理'}</p>
        <PermissionGuard permissions={['system:log:error:process']} hidden><form onSubmit={event => void process(event)} className="space-y-3 border-t border-[var(--cf-border)] pt-4"><InfrastructureSelect aria-label="更新处理状态" value={status} options={statusOptions} onValueChange={value => setStatus(value as ErrorStatus)} disabled={busy} /><label className="block space-y-2 text-sm">处理说明<textarea className="w-full rounded-lg border border-[var(--cf-border)] bg-transparent p-3" value={remark} maxLength={500} rows={3} onChange={event => setRemark(event.target.value)} disabled={busy} /></label><Button type="submit" className="min-h-11" disabled={busy}>{busy ? '保存中…' : '保存处理状态'}</Button></form></PermissionGuard>
      </div>}
    </BaseDialog>
    <BaseDialog open={!!traceId} title="关联请求记录" description={traceId} width="extra-wide" onClose={() => setTraceId('')}>
      {traceError && <p role="alert" className="text-sm text-red-600">{traceError}</p>}{traceLoading && <p role="status">正在关联前端、网关与服务日志…</p>}
      {trace && <div className="space-y-5"><section><h3 className="mb-2 font-medium">前端错误（{trace.frontend.total}）</h3>{trace.frontend.rows.map(entry => <details key={entry.id} className={`${panel} mb-2`}><summary className="min-h-11 cursor-pointer text-sm">{entry.createTime} · {entry.message}</summary><pre className={textBlock}>{entry.stack}{'\n'}{entry.componentStack}</pre></details>)}</section><section><h3 className="mb-2 font-medium">网关与服务请求（{trace.operations.total}）</h3>{trace.operations.rows.map(entry => <details key={entry.logId} className={`${panel} mb-2`}><summary className="min-h-11 cursor-pointer break-all text-sm">{entry.createTime} · {entry.serviceName} · {entry.requestMethod} {entry.requestUrl} · {entry.durationMs ?? '—'} 毫秒 · 响应 {entry.resultCode ?? '—'}</summary><pre className={textBlock}>{entry.params || '未记录参数'}</pre></details>)}</section><section><h3 className="mb-2 font-medium">后端异常（{trace.errors.total}）</h3>{trace.errors.rows.map(entry => <details key={entry.errorId} className={`${panel} mb-2`}><summary className="min-h-11 cursor-pointer break-all text-sm">{entry.occurTime} · {entry.serviceName} · {entry.exceptionMessage}</summary><pre className={textBlock}>{entry.exceptionStack}</pre></details>)}</section>
        {trace.operations.total + trace.errors.total + trace.frontend.total === 0 && <p className="text-sm text-cf-subtle">当前租户暂无此编号的记录；异步日志写入后可刷新查看。</p>}
        <Pagination total={Math.max(trace.operations.total, trace.errors.total, trace.frontend.total)} page={tracePage} pageSize={tracePageSize} onPageChange={setTracePage} onPageSizeChange={value => { setTracePageSize(value); setTracePage(1); }} />
      </div>}
    </BaseDialog>
  </div>;
}

export default function ObservabilityPage() {
  return <PermissionGuard permissions={['system:log:error:list']}><ObservabilityWorkspace /></PermissionGuard>;
}
