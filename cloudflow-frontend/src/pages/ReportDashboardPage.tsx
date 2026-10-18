import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { GripVertical, LayoutDashboard, Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button, Pagination } from '@/components/common';
import { MobileDesktopGuide } from '@/components/mobile/MobileDesktopGuide';
import { MOBILE_DESKTOP_FEATURES } from '@/config/mobileDesktopPages';
import { isMobileDevice } from '@/utils/device';
import { ReportResultView } from '@/components/reports/ReportResultView';
import { ReportShareDialog } from '@/components/reports/ReportShareDialog';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/utils/authStorage';
import { getReportChart, getReportDashboard, layoutConflict, listReportCharts, listReportDashboards, queryReport, removeReportDashboard, reportError, saveReportDashboard, shareReport, shareScopeNames,
  type ReportChart, type ReportDashboard, type ReportDashboardInput, type ReportLayoutItem, type ReportPage, type ReportResult, type ShareScope } from '@/services/api/report';
import { InfrastructurePageHeader, InfrastructureSelect } from './system/_components/InfrastructurePrimitives';
import '@/components/reports/report.css';

type CardState = { chart: ReportChart | null; result: ReportResult | null; error: string; loading: boolean };
type DashboardItem = ReportDashboardInput['items'][number];
const emptyCard = (): CardState => ({ chart: null, result: null, error: '', loading: false });
const fromDashboard = (dashboard: ReportDashboard): ReportDashboardInput => ({ dashboardId: String(dashboard.dashboardId), version: dashboard.version, name: dashboard.name, remark: dashboard.remark ?? '',
  items: dashboard.items.map(item => ({ chartId: String(item.chartId), gridX: item.gridX, gridY: item.gridY, gridW: item.gridW, gridH: item.gridH })) });
const availabilityMessage = (chart: ReportChart | null) => !chart ? '图表不存在或共享已撤回。' : chart.availability !== 'AVAILABLE' ? '统计来源已停用或您没有源业务读取权限。' : '';

function DashboardCard({ item, state, editable, draggable, onLayout, onRemove }: { item: DashboardItem; state: CardState; editable: boolean; draggable: boolean; onLayout: (patch: Partial<ReportLayoutItem>) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.chartId, disabled: !draggable });
  const title = state.chart?.name ?? '受限图表';
  return <article ref={setNodeRef} className="report-grid-card card space-y-3 p-4" aria-label={title} style={{ gridColumn: `${item.gridX + 1} / span ${item.gridW}`, gridRow: `${item.gridY + 1} / span ${item.gridH}`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, zIndex: isDragging ? 10 : undefined, opacity: isDragging ? 0.85 : 1 }}>
    <div className="flex items-center justify-between gap-2"><h3 className="break-words font-semibold">{title}</h3>{editable && <div className="flex shrink-0 gap-1">
      <Button variant="ghost" className="report-drag-handle min-w-11" disabled={!draggable} {...attributes} {...listeners} aria-label={`移动图表 ${title}`} title="空格拾起，方向键移动，空格放下，Esc取消"><GripVertical size={18} /></Button>
      <Button variant="ghost" onClick={onRemove} aria-label={`从仪表盘移除 ${title}`}>移除</Button>
    </div>}</div>
    {editable && <fieldset className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" aria-label={`${title}布局坐标`}>
      {([{ key: 'gridX', label: '列坐标', min: 0, max: 11 }, { key: 'gridY', label: '行坐标', min: 0, max: 1000 }, { key: 'gridW', label: '宽度', min: 1, max: 12 }, { key: 'gridH', label: '高度', min: 1, max: 100 }] as const).map(field => <label className="report-field" key={field.key}>{field.label}<input aria-label={`${title}${field.label}`} type="number" value={item[field.key]} min={field.min} max={field.max} onChange={event => { if (event.target.value !== '') onLayout({ [field.key]: Number(event.target.value) }); }} /></label>)}
    </fieldset>}
    {state.loading ? <p role="status" className="py-8 text-sm">正在按您的权限查询…</p> : state.error ? <p role="status" className="report-warning">{state.error}</p> : state.result && state.chart ? <ReportResultView result={state.result} type={state.chart.type} style={state.chart.style} title={title} /> : <p className="py-8 text-sm text-cf-muted">点击“查询全部”读取当前数据。</p>}
  </article>;
}

function DashboardWorkspace() {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const [mobileDevice] = useState(isMobileDevice);
  const [configurationLocation, setConfigurationLocation] = useState<string>();
  const [search, setSearch] = useSearchParams();
  const selectedId = search.get('id');
  const [page, setPage] = useState(1);
  const [dashboards, setDashboards] = useState<ReportPage<ReportDashboard> | null>(null);
  const [selected, setSelected] = useState<ReportDashboard | null>(null);
  const [draft, setDraft] = useState<ReportDashboardInput | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [chartPage, setChartPage] = useState(1);
  const [choices, setChoices] = useState<ReportPage<ReportChart> | null>(null);
  const [choiceId, setChoiceId] = useState('');
  const [choiceError, setChoiceError] = useState('');
  const [choiceLoading, setChoiceLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [notice, setNotice] = useState('');
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const alive = useRef(true);
  const token = useRef(getAuthToken());
  const mutation = useRef(false);
  const preview = useRef<AbortController | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  const current = () => alive.current && token.current === getAuthToken();
  useEffect(() => { alive.current = true; const media = window.matchMedia('(max-width: 900px)'); const changed = () => setMobile(media.matches); media.addEventListener('change', changed);
    return () => { alive.current = false; preview.current?.abort(); media.removeEventListener('change', changed); }; }, []);
  useEffect(() => {
    const cancellation = new AbortController(); setLoading(true); setError('');
    void listReportDashboards(page, cancellation.signal).then(value => { if (!cancellation.signal.aborted && current()) setDashboards(value); })
      .catch(failure => { if (!cancellation.signal.aborted && current()) { setDashboards(null); setError(reportError(failure)); } })
      .finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [page, revision]);
  useEffect(() => {
    preview.current?.abort(); setQuerying(false); setSharing(false); setDeleting(false); setAdding(false);
    if (!selectedId) { setDetailLoading(false); return; }
    const cancellation = new AbortController(); setDetailLoading(true); setSelected(null); setDraft(null); setCards({}); setWriteError('');
    void getReportDashboard(selectedId, cancellation.signal).then(value => {
      if (!cancellation.signal.aborted && current()) { setSelected(value); setDraft(fromDashboard(value)); setUncertain(false);
        setCards(Object.fromEntries(value.items.map(item => [String(item.chartId), { chart: item.chart, result: null, error: availabilityMessage(item.chart), loading: false }]))); }
    }).catch(failure => { if (!cancellation.signal.aborted && current()) setWriteError(reportError(failure)); })
      .finally(() => { if (!cancellation.signal.aborted && current()) setDetailLoading(false); });
    return () => cancellation.abort();
  }, [selectedId, revision]);
  useEffect(() => {
    if (!adding) return;
    const cancellation = new AbortController(); setChoiceLoading(true); setChoiceError(''); setChoiceId(''); setChoices(null);
    void listReportCharts(chartPage, cancellation.signal).then(value => { if (!cancellation.signal.aborted && current()) setChoices(value); })
      .catch(failure => { if (!cancellation.signal.aborted && current()) setChoiceError(reportError(failure)); })
      .finally(() => { if (!cancellation.signal.aborted && current()) setChoiceLoading(false); });
    return () => cancellation.abort();
  }, [adding, chartPage]);

  const canWrite = hasPermission('system:report:dashboard:save') && (!selected || selected.editable);
  const editable = canWrite && !busy && !uncertain && !querying;
  const layoutEditable = editable && (!mobileDevice || configurationLocation === location.key);
  const refresh = () => { preview.current?.abort(); setQuerying(false); setCards({}); setSharing(false); setDeleting(false);
    if (!selectedId && uncertain) { setDraft(null); setUncertain(false); setWriteError(''); setNotice('已放弃状态不明的草稿，请从列表核对是否已保存。'); }
    setRevision(previous => previous + 1); };
  const startNew = () => { preview.current?.abort(); setSearch({}); setSelected(null); setDraft({ name: '', remark: '', items: [] }); setCards({}); setWriteError(''); setUncertain(false); setNotice(''); setDetailLoading(false); };
  const update = (patch: Partial<ReportDashboardInput>) => { setDraft(previous => previous ? { ...previous, ...patch } : previous); setNotice(''); };
  const updateLayout = (id: string, patch: Partial<ReportLayoutItem>) => {
    if (!draft || !editable) return;
    const items = draft.items.map(item => item.chartId === id ? { ...item, ...patch, chartId: id } : item);
    if (items.some(item => ![item.gridX, item.gridY, item.gridW, item.gridH].every(Number.isInteger) || item.gridX < 0 || item.gridY < 0 || item.gridY > 1000 || item.gridW < 1 || item.gridW > 12 || item.gridH < 1 || item.gridH > 100 || item.gridX + item.gridW > 12) || layoutConflict(items)) {
      setNotice('位置未改变：网格须在12列内、坐标及尺寸为整数，且图表不能重叠。'); return;
    }
    update({ items });
  };
  const columnStep = () => ((grid.current?.getBoundingClientRect().width ?? 708) + 12) / 12;
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const movement: Record<string, { x: number; y: number }> = { ArrowRight: { x: columnStep(), y: 0 }, ArrowLeft: { x: -columnStep(), y: 0 }, ArrowDown: { x: 0, y: 60 }, ArrowUp: { x: 0, y: -60 } };
    const delta = movement[event.code]; if (!delta) return undefined;
    event.preventDefault(); return { x: currentCoordinates.x + delta.x, y: currentCoordinates.y + delta.y };
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }));
  const dropped = (event: DragEndEvent) => { const item = draft?.items.find(candidate => candidate.chartId === String(event.active.id));
    if (item) updateLayout(item.chartId, { gridX: item.gridX + Math.round(event.delta.x / columnStep()), gridY: item.gridY + Math.round(event.delta.y / 60) }); };
  const addChart = () => {
    const chart = choices?.rows.find(candidate => String(candidate.chartId) === choiceId);
    if (!draft || !chart || chart.availability !== 'AVAILABLE' || draft.items.length >= 30 || draft.items.some(item => item.chartId === choiceId)) return;
    for (let gridY = 0; gridY <= 1000; gridY++) {
      for (const gridX of [0, 6]) {
        const item = { chartId: choiceId, gridX, gridY, gridW: 6, gridH: 10 };
        if (!layoutConflict([...draft.items, item])) { update({ items: [...draft.items, item] }); setCards(previous => ({ ...previous, [choiceId]: { chart, result: null, error: '', loading: false } })); setAdding(false); return; }
      }
    }
    setChoiceError('没有可容纳此图表的位置，请调整已有布局。');
  };
  const runAll = async () => {
    if (!draft || querying || busy) return;
    preview.current?.abort(); const cancellation = new AbortController(); preview.current = cancellation;
    setQuerying(true); setWriteError(''); setCards(Object.fromEntries(draft.items.map(item => [item.chartId, { ...emptyCard(), loading: true }])));
    try {
      if (draft.dashboardId) await getReportDashboard(draft.dashboardId, cancellation.signal);
      if (cancellation.signal.aborted || !current()) return;
      const pending = [...draft.items];
      const worker = async () => {
        while (pending.length && !cancellation.signal.aborted && current()) {
          const item = pending.shift(); if (!item) return;
          let chart: ReportChart | null = null;
          try {
            chart = await getReportChart(item.chartId, cancellation.signal);
            const blocked = availabilityMessage(chart);
            if (blocked) { if (!cancellation.signal.aborted && current()) setCards(previous => ({ ...previous, [item.chartId]: { chart, result: null, error: blocked, loading: false } })); continue; }
            const result = await queryReport(chart.datasetCode, chart.query, cancellation.signal);
            if (!cancellation.signal.aborted && current()) setCards(previous => ({ ...previous, [item.chartId]: { chart, result, error: '', loading: false } }));
          } catch (failure) { if (!cancellation.signal.aborted && current()) setCards(previous => ({ ...previous, [item.chartId]: { chart, result: null, error: reportError(failure), loading: false } })); }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => worker()));
    } catch (failure) { if (!cancellation.signal.aborted && current()) { setCards({}); setDraft(null); setSelected(null); setWriteError(reportError(failure)); } }
    finally { if (!cancellation.signal.aborted && current()) setQuerying(false); }
  };
  const write = async (operation: () => Promise<void>) => {
    if (mutation.current || uncertain) return;
    mutation.current = true; setBusy(true); setWriteError('');
    try { await operation(); }
    catch (failure) { if (current()) { setWriteError(`${reportError(failure)}；请刷新核对实际状态后再操作。`); setUncertain(true); } }
    finally { if (current()) { mutation.current = false; setBusy(false); } }
  };
  const save = () => { if (draft) void write(async () => { const id = await saveReportDashboard(draft); if (current()) { setNotice('仪表盘定义已保存。'); setSearch({ id: String(id) }); refresh(); } }); };
  const share = (scope: ShareScope) => { if (selected) void write(async () => { await shareReport('DASHBOARD', selected.dashboardId, scope, selected.version); if (current()) { setSharing(false); refresh(); } }); };
  const remove = () => { if (selected) void write(async () => { await removeReportDashboard(selected.dashboardId, selected.version); if (current()) { setDeleting(false); setSelected(null); setDraft(null); setSearch({}); refresh(); } }); };

  return <div className="report-workspace space-y-5">
    <InfrastructurePageHeader kicker="个人分析" title="我的仪表盘" description="组合已保存的图表，以十二列网格安排布局；共享仅开放定义，数据按查看者权限查询。">
      <Button variant="outline" disabled={busy || loading} onClick={refresh}><RefreshCw size={16} />刷新</Button>
      {hasPermission('system:report:dashboard:save') && <Button disabled={busy || loading} onClick={startNew}><Plus size={16} />新建仪表盘</Button>}
    </InfrastructurePageHeader>
    {error && <p role="alert" className="report-error">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="card space-y-3 p-4" aria-label="可见仪表盘定义"><h2 className="font-semibold">我的与共享仪表盘</h2>
        {loading ? <p role="status">正在读取…</p> : !dashboards?.rows.length ? <p className="text-sm text-cf-muted">暂无可见仪表盘定义。</p> : dashboards.rows.map(dashboard => <button key={dashboard.dashboardId} disabled={busy} aria-pressed={String(dashboard.dashboardId) === selectedId} onClick={() => setSearch({ id: String(dashboard.dashboardId) })} className="w-full rounded-lg border border-cf-border p-3 text-left aria-pressed:bg-cf-secondary"><span className="block break-words font-medium">{dashboard.name}</span><span className="text-xs text-cf-muted">{dashboard.editable ? '本人' : '共享'} · {shareScopeNames[dashboard.shareScope]}</span></button>)}
        <Pagination total={dashboards?.total ?? 0} page={page} pageSize={20} pageSizeOptions={[20]} onPageChange={setPage} onPageSizeChange={() => setPage(1)} />
      </aside>
      <main className="min-w-0 space-y-4">
        {writeError && <p role="alert" className="report-error">{writeError}</p>}
        {detailLoading ? <p role="status" className="card p-6">正在核验仪表盘访问权限…</p> : !draft ? <div className="card flex min-h-72 flex-col items-center justify-center gap-4 p-6 text-cf-muted"><LayoutDashboard size={32} /><p>选择已有仪表盘，或新建个人仪表盘。</p></div> : <>
          <MobileDesktopGuide page={canWrite ? MOBILE_DESKTOP_FEATURES.reportConfiguration : undefined} onContinue={() => setConfigurationLocation(location.key)}>
          <section className="card space-y-4 p-5" aria-label="仪表盘配置"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{selected ? selected.editable ? '编辑本人仪表盘' : '查看共享仪表盘' : '新建本人仪表盘'}</h2>
            <div className="flex flex-wrap gap-2">{selected?.editable && hasPermission('system:report:share') && <Button variant="outline" disabled={busy || uncertain || querying} onClick={() => { setWriteError(''); setSharing(true); }}>共享范围</Button>}
              {selected?.editable && hasPermission('system:report:dashboard:remove') && <Button variant="outline" disabled={busy || uncertain || querying} onClick={() => { setWriteError(''); setDeleting(true); }}>删除定义</Button>}
              {selected && hasPermission('system:report:dashboard:save') && <Button variant="outline" disabled={busy || querying} onClick={() => { setSearch({}); setSelected(null); update({ dashboardId: undefined, version: undefined, name: `${draft.name.slice(0, 90)}（副本）` }); setUncertain(false); }}>另存为我的仪表盘</Button>}
            </div></div>
            <div className="grid gap-3 md:grid-cols-2"><label className="report-field">仪表盘名称<input maxLength={100} disabled={!editable} value={draft.name} onChange={event => update({ name: event.target.value })} /></label><label className="report-field">说明<input maxLength={500} disabled={!editable} value={draft.remark} onChange={event => update({ remark: event.target.value })} /></label></div>
            <p className="text-sm text-cf-muted">最多30张图表；列坐标0—11、行坐标0—1000、宽度1—12、高度1—100。{mobile ? '手机按单列显示；数字坐标仍保存电脑版布局。' : '拖动手柄移动；键盘用空格拾起、方向键移动、空格放下、Esc取消。'} 图表共享撤回后单独显示受限状态。</p>
            <div className="flex flex-wrap gap-2">{canWrite && <Button variant="outline" disabled={!editable || draft.items.length >= 30} onClick={() => { setChartPage(1); setAdding(true); }}><Plus size={16} />添加图表（{draft.items.length}/30）</Button>}
              {canWrite && <Button variant="outline" disabled={!editable || !draft.name.trim()} onClick={save}>保存布局</Button>}
            </div>
          </section>
          </MobileDesktopGuide>
          <Button disabled={busy || querying || !draft.items.length} onClick={() => void runAll()}>{querying ? '查询中…' : '查询全部'}</Button>
          <DndContext sensors={sensors} onDragEnd={dropped} accessibility={{ screenReaderInstructions: { draggable: '按空格拾起图表，方向键移动，空格放下，Esc取消。' }, announcements: {
            onDragStart: () => '图表已拾起，方向键逐格移动。', onDragMove: () => '正在移动图表。', onDragOver: () => undefined, onDragEnd: () => '移动结束，重叠或越界的位置不会保存。', onDragCancel: () => '已取消移动。',
          } }}>
            <div className="report-grid" ref={grid} aria-label="十二列仪表盘网格">{draft.items.map(item => <DashboardCard key={item.chartId} item={item} state={cards[item.chartId] ?? emptyCard()} editable={layoutEditable} draggable={layoutEditable && !mobile} onLayout={patch => updateLayout(item.chartId, patch)} onRemove={() => { update({ items: draft.items.filter(previous => previous.chartId !== item.chartId) }); setCards(previous => { const next = { ...previous }; delete next[item.chartId]; return next; }); }} />)}</div>
          </DndContext>
          {!draft.items.length && <p role="status" className="text-center text-sm text-cf-muted">仪表盘暂无图表。</p>}
        </>}
      </main>
    </div>
    <BaseDialog open={adding} title="添加可见图表" onClose={() => setAdding(false)} panelClassName="report-workspace"><div className="space-y-4"><p className="text-sm text-cf-muted">只能选择已保存、具有来源读取权限且未加入本仪表盘的图表。</p>
      {choiceLoading ? <p role="status">正在读取图表…</p> : <InfrastructureSelect aria-label="待添加图表" value={choiceId} placeholder="选择图表" options={(choices?.rows ?? []).filter(chart => chart.availability === 'AVAILABLE' && !draft?.items.some(item => item.chartId === String(chart.chartId))).map(chart => ({ value: String(chart.chartId), label: chart.name }))} onValueChange={setChoiceId} />}
      {choiceError && <p role="alert" className="report-error">{choiceError}</p>}<Pagination total={choices?.total ?? 0} page={chartPage} pageSize={20} pageSizeOptions={[20]} onPageChange={setChartPage} onPageSizeChange={() => setChartPage(1)} />
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(false)}>取消</Button><Button disabled={choiceLoading || !choiceId || !editable} onClick={addChart}>加入仪表盘</Button></div>
    </div></BaseDialog>
    <ReportShareDialog open={sharing} scope={selected?.shareScope ?? 'PRIVATE'} busy={busy} error={writeError} onClose={() => setSharing(false)} onSave={share} />
    <BaseDialog open={deleting} title="删除本人仪表盘定义" onClose={() => { if (!busy) setDeleting(false); }} panelClassName="report-workspace"><div className="space-y-4"><p>删除“{selected?.name}”只移除仪表盘及布局，保留独立图表与业务数据。</p>{writeError && <p role="alert" className="report-error">{writeError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(false)}>取消</Button><Button variant="destructive" disabled={busy || uncertain} onClick={remove}>确认删除</Button></div></div></BaseDialog>
  </div>;
}

export default function ReportDashboardPage() {
  const { user, hasPermission } = useAuth();
  if (!hasPermission('system:report:dashboard:list')) return <p role="alert" className="card p-6">您没有查看个人仪表盘的权限。</p>;
  return <DashboardWorkspace key={`${user?.id ?? ''}:${user?.tenantId ?? ''}:${getAuthToken() ?? ''}`} />;
}
