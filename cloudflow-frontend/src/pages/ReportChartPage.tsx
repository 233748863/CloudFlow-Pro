import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChartNoAxesCombined, Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button, Pagination } from '@/components/common';
import { MobileDesktopGuide } from '@/components/mobile/MobileDesktopGuide';
import { MOBILE_DESKTOP_FEATURES } from '@/config/mobileDesktopPages';
import { ReportFilterEditor } from '@/components/reports/ReportFilterEditor';
import { ReportResultView } from '@/components/reports/ReportResultView';
import { ReportShareDialog } from '@/components/reports/ReportShareDialog';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/utils/authStorage';
import { aggregateNames, chartTypeNames, defaultReportQuery, getReportChart, listReportCharts, listReportDatasets, queryReport, removeReportChart, reportError, saveReportChart, shareReport, shareScopeNames,
  type ChartType, type ReportChart, type ReportChartInput, type ReportDataset, type ReportPage, type ReportQuery, type ReportResult, type ReportStyle, type ShareScope } from '@/services/api/report';
import { InfrastructurePageHeader, InfrastructureSelect } from './system/_components/InfrastructurePrimitives';
import '@/components/reports/report.css';

const defaultStyle: ReportStyle = { palette: 'PRIMARY', showLegend: true, showValues: false };
const newDraft = (dataset: ReportDataset): ReportChartInput => ({ name: '', type: 'BAR', datasetCode: dataset.definition.code, query: defaultReportQuery(dataset), style: { ...defaultStyle } });
const fromChart = (chart: ReportChart): ReportChartInput => ({ chartId: String(chart.chartId), version: chart.version, name: chart.name, type: chart.type, datasetCode: chart.datasetCode, query: chart.query, style: chart.style });

function ChartWorkspace() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useSearchParams();
  const selectedId = search.get('id');
  const [datasets, setDatasets] = useState<ReportDataset[]>([]);
  const [page, setPage] = useState(1);
  const [charts, setCharts] = useState<ReportPage<ReportChart> | null>(null);
  const [selected, setSelected] = useState<ReportChart | null>(null);
  const [draft, setDraft] = useState<ReportChartInput | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [queryError, setQueryError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const alive = useRef(true);
  const token = useRef(getAuthToken());
  const mutation = useRef(false);
  const preview = useRef<AbortController | null>(null);
  const current = () => alive.current && token.current === getAuthToken();
  useEffect(() => { alive.current = true; return () => { alive.current = false; preview.current?.abort(); }; }, []);
  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError('');
    void Promise.all([listReportDatasets(cancellation.signal), listReportCharts(page, cancellation.signal)]).then(([sources, definitions]) => {
      if (!cancellation.signal.aborted && current()) { setDatasets(sources); setCharts(definitions); }
    }).catch(failure => { if (!cancellation.signal.aborted && current()) { setCharts(null); setDatasets([]); setError(reportError(failure)); } })
      .finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [page, revision]);
  useEffect(() => {
    preview.current?.abort(); setResult(null); setQueryError(''); setQuerying(false);
    if (!selectedId) { setDetailLoading(false); return; }
    const cancellation = new AbortController();
    setDetailLoading(true); setSelected(null); setDraft(null); setWriteError(''); setSharing(false); setDeleting(false);
    void getReportChart(selectedId, cancellation.signal).then(chart => {
      if (!cancellation.signal.aborted && current()) { setSelected(chart); setDraft(fromChart(chart)); setUncertain(false); }
    }).catch(failure => { if (!cancellation.signal.aborted && current()) setWriteError(reportError(failure)); })
      .finally(() => { if (!cancellation.signal.aborted && current()) setDetailLoading(false); });
    return () => cancellation.abort();
  }, [selectedId, revision]);

  const source = datasets.find(dataset => dataset.definition.code === draft?.datasetCode);
  const canWrite = hasPermission('system:report:chart:save') && (!selected || selected.editable);
  const readonly = !canWrite || busy || uncertain;
  const refresh = () => { preview.current?.abort(); setQuerying(false); setResult(null); setSharing(false); setDeleting(false);
    if (!selectedId && uncertain) { setDraft(null); setUncertain(false); setWriteError(''); setNotice('已放弃状态不明的草稿，请从列表核对是否已保存。'); }
    setRevision(previous => previous + 1); };
  const update = (patch: Partial<ReportChartInput>) => { preview.current?.abort(); setQuerying(false); setResult(null); setQueryError(''); setNotice(''); setDraft(previous => previous ? { ...previous, ...patch } : previous); };
  const updateQuery = (patch: Partial<ReportQuery>) => { if (draft) update({ query: { ...draft.query, ...patch } }); };
  const startNew = () => {
    const first = datasets.find(dataset => dataset.availability === 'AVAILABLE');
    if (!first) return;
    preview.current?.abort(); setQuerying(false); setSearch({}); setSelected(null); setDraft(newDraft(first)); setResult(null); setWriteError(''); setUncertain(false); setNotice(''); setDetailLoading(false);
  };
  const run = async () => {
    if (!draft || querying) return;
    preview.current?.abort();
    const cancellation = new AbortController(); preview.current = cancellation;
    setResult(null); setQueryError(''); setQuerying(true);
    try { const data = await queryReport(draft.datasetCode, draft.query, cancellation.signal); if (!cancellation.signal.aborted && current()) setResult(data); }
    catch (failure) { if (!cancellation.signal.aborted && current()) setQueryError(reportError(failure)); }
    finally { if (!cancellation.signal.aborted && current()) setQuerying(false); }
  };
  const write = async (operation: () => Promise<void>) => {
    if (mutation.current || uncertain) return;
    mutation.current = true; setBusy(true); setWriteError('');
    try { await operation(); }
    catch (failure) { if (current()) { setWriteError(`${reportError(failure)}；请刷新核对实际状态后再操作。`); setUncertain(true); } }
    finally { if (current()) { mutation.current = false; setBusy(false); } }
  };
  const save = () => { if (draft) void write(async () => { const id = await saveReportChart(draft); if (current()) { setNotice('图表定义已保存；显示数据始终按当前查看者权限查询。'); setSearch({ id: String(id) }); refresh(); } }); };
  const share = (scope: ShareScope) => { if (selected) void write(async () => { await shareReport('CHART', selected.chartId, scope, selected.version); if (current()) { setSharing(false); refresh(); } }); };
  const remove = () => { if (selected) void write(async () => { await removeReportChart(selected.chartId, selected.version); if (current()) { setDeleting(false); setSelected(null); setDraft(null); setSearch({}); refresh(); } }); };
  const changeType = (type: ChartType) => {
    if (!draft) return;
    const single = ['PIE', 'FUNNEL', 'METRIC'].includes(type);
    update({ type, query: { ...draft.query, dimensions: type === 'METRIC' ? [] : single ? draft.query.dimensions.slice(0, 1) : draft.query.dimensions,
      measures: single ? draft.query.measures.slice(0, 1) : draft.query.measures, sorts: [] } });
  };

  return <div className="report-workspace space-y-5">
    <InfrastructurePageHeader kicker="个人分析" title="我的自助图表" description="选择已授权统计来源，保存和共享图表定义；共享不改变任何人的业务权限。">
      <Button variant="outline" disabled={busy || loading} onClick={refresh}><RefreshCw size={16} />刷新</Button>
      {hasPermission('system:report:chart:save') && <Button disabled={busy || loading || !datasets.some(dataset => dataset.availability === 'AVAILABLE')} onClick={startNew}><Plus size={16} />新建图表</Button>}
    </InfrastructurePageHeader>
    <p className="card p-4 text-sm text-cf-muted">每图最多2个维度、5个度量、20个筛选条件及2000行；日期默认近90天，最多366天。查询超过5秒终止，每人每分钟最多30次。</p>
    {error && <p role="alert" className="report-error">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="card space-y-3 p-4" aria-label="可见图表定义">
        <h3 className="font-semibold">我的与共享图表</h3>
        {loading ? <p role="status">正在读取…</p> : !charts?.rows.length ? <p className="text-sm text-cf-muted">暂无可见图表定义。</p> : charts.rows.map(chart => <button key={chart.chartId} disabled={busy} aria-pressed={String(chart.chartId) === selectedId} onClick={() => setSearch({ id: String(chart.chartId) })} className="w-full rounded-lg border border-cf-border p-3 text-left aria-pressed:bg-cf-secondary">
          <span className="block break-words font-medium">{chart.name}</span><span className="text-xs text-cf-muted">{chartTypeNames[chart.type]} · {chart.editable ? '本人' : '共享'} · {shareScopeNames[chart.shareScope]}</span>
        </button>)}
        <Pagination total={charts?.total ?? 0} page={page} pageSize={20} pageSizeOptions={[20]} onPageChange={setPage} onPageSizeChange={() => setPage(1)} />
      </aside>
      <main className="min-w-0 space-y-4">
        {writeError && <p role="alert" className="report-error">{writeError}</p>}
        {detailLoading ? <p role="status" className="card p-6">正在核验图表访问权限…</p> : !draft ? <div className="card flex min-h-72 flex-col items-center justify-center gap-4 p-6 text-cf-muted"><ChartNoAxesCombined size={32} /><p>选择已有图表，或新建个人图表。</p></div> : <>
          <MobileDesktopGuide page={canWrite ? MOBILE_DESKTOP_FEATURES.reportConfiguration : undefined}>
          <section className="card space-y-4 p-5" aria-label="图表配置">
            <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{selected ? selected.editable ? '编辑本人图表' : '查看共享图表' : '新建本人图表'}</h3><div className="flex flex-wrap gap-2">
              {selected?.editable && hasPermission('system:report:share') && <Button variant="outline" disabled={busy || uncertain} onClick={() => { setWriteError(''); setSharing(true); }}>共享范围</Button>}
              {selected?.editable && hasPermission('system:report:chart:remove') && <Button variant="outline" disabled={busy || uncertain} onClick={() => { setWriteError(''); setDeleting(true); }}>删除定义</Button>}
              {selected && hasPermission('system:report:chart:save') && <Button variant="outline" disabled={busy || source?.availability !== 'AVAILABLE'} onClick={() => { setSearch({}); setSelected(null); update({ chartId: undefined, version: undefined, name: `${draft.name.slice(0, 90)}（副本）` }); setUncertain(false); }}>另存为我的图表</Button>}
            </div></div>
            {source?.availability !== 'AVAILABLE' && <p role="status" className="report-warning">统计来源已停用或您没有源业务读取权限；本页不展示业务数据。</p>}
            <div className="grid gap-4 md:grid-cols-3"><label className="report-field">图表名称<input value={draft.name} maxLength={100} disabled={readonly} onChange={event => update({ name: event.target.value })} /></label>
              <label className="report-field">统计来源<InfrastructureSelect aria-label="统计来源" disabled={readonly} value={draft.datasetCode} options={datasets.map(dataset => ({ value: dataset.definition.code, label: `${dataset.definition.name}${dataset.availability === 'AVAILABLE' ? '' : '（停用）'}` }))} onValueChange={code => { const dataset = datasets.find(entry => entry.definition.code === code); if (dataset) update({ datasetCode: code, query: defaultReportQuery(dataset), type: 'BAR' }); }} /></label>
              <label className="report-field">图表类型<InfrastructureSelect aria-label="图表类型" disabled={readonly} value={draft.type} options={Object.entries(chartTypeNames).map(([value, label]) => ({ value, label }))} onValueChange={value => changeType(value as ChartType)} /></label>
            </div>
            {source && <><div className="grid gap-5 lg:grid-cols-2"><div className="space-y-4">
              <fieldset disabled={readonly}><legend className="mb-2 text-sm font-medium">分组维度（最多2个）</legend><div className="flex flex-wrap gap-3">{source.definition.fields.filter(field => field.dimension).map(field => <label key={field.code} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.query.dimensions.includes(field.code)} disabled={readonly || draft.type === 'METRIC' || !draft.query.dimensions.includes(field.code) && draft.query.dimensions.length >= (['PIE', 'FUNNEL'].includes(draft.type) ? 1 : 2)} onChange={event => updateQuery({ dimensions: event.target.checked ? [...draft.query.dimensions, field.code] : draft.query.dimensions.filter(code => code !== field.code), sorts: [] })} />{field.name}</label>)}</div></fieldset>
              <div className="space-y-2"><p className="text-sm font-medium">统计度量（最多5个）</p>{draft.query.measures.map((measure, index) => {
                const field = source.definition.fields.find(candidate => candidate.code === measure.field);
                return <div key={index} className="flex flex-wrap gap-2"><InfrastructureSelect aria-label={`度量${index + 1}`} disabled={readonly} value={measure.field} options={source.definition.fields.filter(candidate => candidate.aggregates.length).map(candidate => ({ value: candidate.code, label: candidate.name }))} onValueChange={code => { const selectedField = source.definition.fields.find(candidate => candidate.code === code); if (selectedField) updateQuery({ measures: draft.query.measures.map((previous, position) => position === index ? { field: code, aggregate: selectedField.aggregates[0] } : previous), sorts: [] }); }} />
                  <InfrastructureSelect aria-label={`聚合${index + 1}`} disabled={readonly} value={measure.aggregate} options={(field?.aggregates ?? []).map(value => ({ value, label: aggregateNames[value] }))} onValueChange={aggregate => updateQuery({ measures: draft.query.measures.map((previous, position) => position === index ? { ...previous, aggregate } : previous) })} />
                  <Button variant="ghost" disabled={readonly || draft.query.measures.length <= 1} onClick={() => updateQuery({ measures: draft.query.measures.filter((unused, position) => position !== index), sorts: [] })}>移除</Button>
                </div>;
              })}<Button variant="outline" disabled={readonly || draft.query.measures.length >= 5 || ['PIE', 'FUNNEL', 'METRIC'].includes(draft.type)} onClick={() => {
                const next = source.definition.fields.flatMap(field => field.aggregates.map(aggregate => ({ field: field.code, aggregate }))).find(candidate => !draft.query.measures.some(measure => measure.field === candidate.field && measure.aggregate === candidate.aggregate));
                if (next) updateQuery({ measures: [...draft.query.measures, next], sorts: [] });
              }}>添加度量</Button></div>
              {source.definition.timeBased && <div className="grid grid-cols-2 gap-3"><label className="report-field">开始日期（留空为近90天）<input type="date" disabled={readonly} value={draft.query.startDate ?? ''} onChange={event => updateQuery({ startDate: event.target.value || null })} /></label><label className="report-field">结束日期<input type="date" disabled={readonly} value={draft.query.endDate ?? ''} onChange={event => updateQuery({ endDate: event.target.value || null })} /></label></div>}
              {source.definition.unitPartition && <p className="text-sm text-cf-muted">天（DAY）和小时（HOUR）不能相加。请保留单位分组，或用“同时满足”条件只选择一种单位。</p>}
              <label className="report-field">结果行数<input type="number" min={1} max={2000} disabled={readonly} value={draft.query.limitRows} onChange={event => updateQuery({ limitRows: Number(event.target.value) })} /></label>
            </div><ReportFilterEditor fields={source.definition.fields} value={draft.query.filters} onChange={filters => updateQuery({ filters })} disabled={readonly} /></div>
              <div className="flex flex-wrap items-end gap-3"><label className="report-field">配色<InfrastructureSelect aria-label="语义配色" disabled={readonly} value={draft.style.palette} options={[{ value: 'PRIMARY', label: '主题' }, { value: 'SUCCESS', label: '成功' }, { value: 'WARNING', label: '提醒' }, { value: 'NEUTRAL', label: '中性' }]} onValueChange={palette => update({ style: { ...draft.style, palette: palette as ReportStyle['palette'] } })} /></label>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={readonly} checked={draft.style.showLegend} onChange={event => update({ style: { ...draft.style, showLegend: event.target.checked } })} />显示图例</label>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={readonly} checked={draft.style.showValues} onChange={event => update({ style: { ...draft.style, showValues: event.target.checked } })} />显示数值</label>
              </div>
              <div className="space-y-2"><p className="text-sm font-medium">排序</p>{draft.query.sorts.map((sort, index) => <div key={index} className="flex flex-wrap gap-2"><InfrastructureSelect aria-label="排序列" disabled={readonly} value={sort.column} options={[...draft.query.dimensions.map((field, position) => ({ value: `dimension${position + 1}`, label: source.definition.fields.find(candidate => candidate.code === field)?.name ?? field })), ...draft.query.measures.map((measure, position) => ({ value: `measure${position + 1}`, label: `${source.definition.fields.find(field => field.code === measure.field)?.name} · ${aggregateNames[measure.aggregate]}` }))]} onValueChange={column => updateQuery({ sorts: draft.query.sorts.map((previous, position) => position === index ? { ...previous, column } : previous) })} />
                <InfrastructureSelect aria-label="排序方向" disabled={readonly} value={sort.direction} options={[{ value: 'ASC', label: '升序' }, { value: 'DESC', label: '降序' }]} onValueChange={direction => updateQuery({ sorts: draft.query.sorts.map((previous, position) => position === index ? { ...previous, direction: direction as 'ASC' | 'DESC' } : previous) })} /><Button variant="ghost" disabled={readonly} onClick={() => updateQuery({ sorts: draft.query.sorts.filter((unused, position) => position !== index) })}>移除排序</Button></div>)}
                <Button variant="outline" disabled={readonly || draft.query.sorts.length >= draft.query.dimensions.length + draft.query.measures.length} onClick={() => { const columns = [...draft.query.dimensions.map((unused, position) => `dimension${position + 1}`), ...draft.query.measures.map((unused, position) => `measure${position + 1}`)]; const column = columns.find(candidate => !draft.query.sorts.some(sort => sort.column === candidate)); if (column) updateQuery({ sorts: [...draft.query.sorts, { column, direction: 'ASC' }] }); }}>添加排序</Button>
              </div>
            </>}
            {canWrite && <Button variant="outline" disabled={readonly || !draft.name.trim()} onClick={save}>保存定义</Button>}
          </section>
          </MobileDesktopGuide>
          <Button disabled={busy || querying || source?.availability !== 'AVAILABLE'} onClick={() => void run()}>{querying ? '查询中…' : '运行查询'}</Button>
          <section className="card min-w-0 p-5" aria-label="图表查询结果"><h3 className="mb-4 font-semibold">{draft.name || '图表预览'}</h3>{queryError && <p role="alert" className="report-error">{queryError}</p>}{querying ? <p role="status">正在按您的业务权限查询…</p> : result ? <ReportResultView result={result} type={draft.type} style={draft.style} title={draft.name} /> : !queryError && <p role="status" className="text-sm text-cf-muted">请运行查询；修改配置后不会继续显示旧结果。</p>}</section>
        </>}
      </main>
    </div>
    <ReportShareDialog open={sharing} scope={selected?.shareScope ?? 'PRIVATE'} busy={busy} error={writeError} onClose={() => setSharing(false)} onSave={share} />
    <BaseDialog open={deleting} title="删除本人图表定义" onClose={() => { if (!busy) setDeleting(false); }} panelClassName="report-workspace"><div className="space-y-4"><p>删除“{selected?.name}”仅影响这份图表定义；仍被仪表盘引用时系统会拒绝删除。</p>{writeError && <p role="alert" className="report-error">{writeError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(false)}>取消</Button><Button variant="destructive" disabled={busy || uncertain} onClick={remove}>确认删除</Button></div></div></BaseDialog>
  </div>;
}

export default function ReportChartPage() {
  const { user, hasPermission } = useAuth();
  if (!hasPermission('system:report:chart:list')) return <p role="alert" className="card p-6">您没有查看自助图表的权限。</p>;
  return <ChartWorkspace key={`${user?.id ?? ''}:${user?.tenantId ?? ''}:${getAuthToken() ?? ''}`} />;
}
