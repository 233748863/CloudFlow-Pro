import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';

// 正式页面、图表组件直接执行；网络、hooks、ECharts绘制与外层控件使用替身。
type Element = React.ReactElement<Record<string, any>>;
let slots: any[] = [];
let cursor = 0;
let effects: Array<() => void> = [];
let online = true;
let version = 1;
let breakpoint = 'mobile';
let user = { id: '7', tenantId: '3' };
let partial = false;
let refresh: () => Promise<void>;
let saved: any;
let snapshotWrites = 0;
let reads = 0;
let finishOld: ((value: unknown[]) => void) | undefined;
const instances: any[] = [];
const component = (name: string) => Object.assign(() => null, { displayName: name });
const reactMock = { ...React,
  useState: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
  useRef: (initial: unknown) => { const index = cursor++; return slots[index] ??= { current: initial }; },
  useCallback: (body: unknown, deps: unknown[]) => {
    const index = cursor++; const old = slots[index];
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) slots[index] = { deps, body };
    return slots[index].body;
  }, useId: () => 'chart-view',
  useEffect: (body: () => void | (() => void), deps: unknown[]) => {
    const index = cursor++; const old = slots[index];
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
      effects.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: body() }; });
    }
  },
};
const ChartPlaceholder = component('Chart');
const dependencies: Record<string, any> = {
  react: { ...reactMock, default: reactMock, __esModule: true },
  'react-router-dom': { useNavigate: () => () => {} },
  'lucide-react': new Proxy({}, { get: (_, key) => component(String(key)) }),
  '@/context/AuthContext': { useAuth: () => ({ user, hasPermission: () => false }) },
  '@/components/common': { Card: component('Card'), CardContent: component('CardContent') },
  'date-fns': { format: () => '2026年10月17日' }, 'date-fns/locale': { zhCN: {} },
  '@/hooks/usePullToRefresh': { usePullToRefresh: (options: any) => { refresh = options.onRefresh; return {}; } },
  sonner: { toast: { success: () => {} } },
  '@/services/api/workplace': { getRecentTasks: async () => { reads++; return finishOld ? new Promise(resolve => { finishOld = resolve; }) : [{ taskId: 't1', taskName: '真实待办', priority: 'HIGH' }]; } },
  '@/services/api/schedule': { getTodaySchedule: async () => { reads++; return [{ eventId: 's1', title: '真实日程', startTime: '2026-10-17T09:00:00' }]; } },
  '@/services/api/notice': { getUnreadCount: async () => { reads++; if (partial) throw new Error('消息服务不可用'); return 3; } },
  '@/services/api/workflow': { getTasksCount: async () => { reads++; return { pending: 21 }; } },
  '@/hooks/useOffline': { useNetworkStatus: () => online },
  '@/hooks/useBreakpoint': { useBreakpoint: () => breakpoint },
  '@/utils/authStorage': { getAuthSessionVersion: () => version },
  '@/utils/mobileSnapshots': { captureMobileScope: () => ({ key: `${user.tenantId}:${user.id}`, version }),
    readMobileSnapshot: () => saved, saveMobileSnapshot: (_: unknown, __: unknown, data: unknown) => { saved = { savedAt: 1, data }; snapshotWrites++; } },
  '@/components/charts/Chart': { Chart: ChartPlaceholder },
  '@/utils/cn': { cn: (...values: unknown[]) => values.filter(Boolean).join(' ') },
  '@/components/common/Skeleton': { Skeleton: component('Skeleton') },
  '@/components/common/EmptyState': { EmptyState: component('EmptyState') },
  './ChartDataTable': { ChartDataTable: component('ChartDataTable'), ChartViewToggle: component('ChartViewToggle') },
  'echarts/core': { use: () => {}, init: (_: unknown, __: unknown, options: unknown) => {
    const instance = { options, rendered: [] as any[], disposed: false, events: new Map(), setOption: (option: unknown) => instance.rendered.push(option),
      resize: () => {}, dispose: () => { instance.disposed = true; }, isDisposed: () => instance.disposed,
      on: (name: string, handler: unknown) => instance.events.set(name, handler), off: (name: string) => instance.events.delete(name) };
    instances.push(instance); return instance;
  } },
  'echarts/charts': {}, 'echarts/components': {}, 'echarts/renderers': {},
};
let themeCallback = () => {};
const theme = { colors: ['accent'], text: 'body', subtle: 'subtle', border: 'border', surface: 'surface', fontFamily: 'system-ui' };
function load(relative: string) {
  const compiled = { exports: {} as Record<string, any> };
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8').replaceAll('import.meta.env.DEV', 'false');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, Date, console,
    window: { matchMedia: () => ({ matches: false }) }, document: { documentElement: {} },
    getComputedStyle: () => ({ fontFamily: 'system-ui', getPropertyValue: (key: string) => key }),
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { constructor(callback: () => void) { themeCallback = callback; } observe() {} disconnect() {} },
    require: (name: string) => { assert.ok(name in dependencies, `未替换依赖: ${name}`); return dependencies[name]; } });
  return compiled.exports;
}
function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element; return [element, ...nodes(element.props.children)];
}
function render(page: any, props: any = {}, runEffects = true) {
  cursor = 0; effects = []; const tree = nodes(page(props));
  tree.forEach(node => { if (node.props.ref && typeof node.props.ref === 'object') node.props.ref.current = {}; });
  if (runEffects) effects.forEach(run => run()); return tree;
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const feature = load('../src/mobile/components/MobileDashboardChart.tsx');
dependencies['@/mobile/components/MobileDashboardChart'] = feature;
const { MobileDashboard } = load('../src/mobile/pages/MobileDashboard.tsx');
const chartStats = () => render(MobileDashboard).find(node => node.type === feature.MobileDashboardChart)!.props.stats;
let checks = 0;
async function check(label: string, body: () => void | Promise<void>) { await body(); checks++; console.log(`PASS ${label}`); }
await check('工作台复用四个真实接口，卡片与图表同源，完整读取后才存摘要', async () => {
  render(MobileDashboard); await settle(); assert.equal(reads, 4);
  assert.equal(JSON.stringify(chartStats()), JSON.stringify({ pendingTasks: 21, todaySchedules: 1, unreadMessages: 3 }));
  assert.equal(snapshotWrites, 1); assert.equal(saved.data.stats.pendingTasks, 21);
});
await check('刷新部分失败显示缺失值，保留真实成功计数，不覆盖完整离线摘要', async () => {
  partial = true; await refresh(); const stats = chartStats();
  assert.equal(stats.pendingTasks, 21); assert.equal(stats.unreadMessages, null); assert.equal(snapshotWrites, 1);
  assert.ok(render(MobileDashboard).some(node => node.props.children === '部分数据加载失败，请重试'));
  partial = false;
});
await check('离线图表读取当前账号摘要，不发额外请求，切账号立即隐藏旧数据', async () => {
  online = false; const before = reads; render(MobileDashboard); await settle(); assert.equal(reads, before);
  assert.equal(chartStats().unreadMessages, 3);
  user = { id: '8', tenantId: '4' }; version++; saved = null;
  assert.equal(render(MobileDashboard, {}, false).some(node => node.type === feature.MobileDashboardChart), false);
  render(MobileDashboard); await settle(); assert.equal(chartStats().pendingTasks, null);
});
await check('旧身份延迟响应不写图表和离线摘要', async () => {
  online = true; finishOld = () => {}; render(MobileDashboard); const before = snapshotWrites;
  version++; finishOld!([{ taskId: 'old' }]); await settle();
  assert.equal(snapshotWrites, before); assert.equal(render(MobileDashboard, {}, false).some(node => node.type === feature.MobileDashboardChart), false);
  finishOld = undefined;
});
await check('正式图表隐藏冗余图例，支持零值及缺失值，并可查看完整三项数据表', () => {
  const tree = nodes(feature.MobileDashboardChart({ stats: { pendingTasks: 0, todaySchedules: 2, unreadMessages: null } }));
  const chart = tree.find(node => node.type === ChartPlaceholder)!; const option = chart.props.option(theme);
  assert.equal(chart.props.empty, false); assert.equal(option.legend.show, false); assert.equal(option.tooltip.triggerOn, 'click');
  assert.equal(JSON.stringify(chart.props.dataTable.rows), JSON.stringify([['待办任务', 0], ['今日日程', 2], ['未读消息', null]]));
  assert.equal(option.xAxis.minInterval, 1);
  assert.equal(nodes(feature.MobileDashboardChart({ stats: { pendingTasks: null, todaySchedules: null, unreadMessages: null } })).find(node => node.type === ChartPlaceholder)!.props.empty, true);
});
await check('共享图表手机44px触控与点击提示，宽屏恢复原配置，主题及数据表代表流程可用', () => {
  slots = []; const { Chart } = load('../src/components/charts/Chart.tsx');
  const handler = () => {}; const props = { ariaLabel: '代表图表', option: { legend: { top: 0 }, tooltip: { trigger: 'axis' }, series: [{ type: 'line', data: [1, 2] }] },
    dataTable: { columns: ['数量'], rows: [[1], [2]] }, onEvents: { click: handler } };
  render(Chart, props); const mobile = instances.at(-1);
  assert.equal(mobile.options.pointerSize, 44); assert.equal(mobile.options.useCoarsePointer, true);
  assert.equal(mobile.rendered.at(-1).legend[0].type, 'scroll'); assert.equal(mobile.rendered.at(-1).tooltip[0].triggerOn, 'click');
  assert.equal(mobile.events.get('click'), handler); themeCallback(); assert.equal(mobile.rendered.length, 2);
  breakpoint = 'desktop'; render(Chart, props); const desktop = instances.at(-1);
  assert.equal(mobile.disposed, true); assert.equal(desktop.options.useCoarsePointer, undefined); assert.equal(desktop.rendered.at(-1).tooltip[0].triggerOn, undefined);
  assert.equal(desktop.rendered.at(-1).legend[0].type, undefined); assert.equal(desktop.events.get('click'), handler);
  render(Chart, props).find(node => (node.type as any)?.displayName === 'ChartViewToggle')!.props.onChange(true);
  assert.ok(render(Chart, props).some(node => (node.type as any)?.displayName === 'ChartDataTable')); assert.equal(desktop.disposed, true);
});
console.log(`MOBILE_DASHBOARD_BASIC: checks=${checks}; failed=0; production-page-and-chart=true; mocked-hooks-api-and-canvas=true; browser=false; artifacts=none`);
