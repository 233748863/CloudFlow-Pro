import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as dateFormat from '../src/utils/dateFormat';

// 执行正式页面；仅替换 hooks、网络和外层控件，不生成浏览器或构建产物。
type Element = React.ReactElement<Record<string, any>>;
const component = (name: string) => Object.assign(() => null, { displayName: name });
const names = ['Button', 'DatePicker', 'Input', 'Label', 'SegmentedControl', 'SegmentedControlItem', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue', 'Tabs', 'TabsContent', 'TabsList', 'TabsTrigger', 'Textarea', 'BaseDialog'];
const common = Object.fromEntries(names.map(name => [name, component(name)]));
const Drawer = component('MobileFilterDrawer');
const Confirm = component('ConfirmDialog');
const Calendar = component('FullCalendar');
const compiledSource = ts.transpileModule(readFileSync(new URL('../src/pages/SchedulePage.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const records = () => [
  { eventId: '1', version: 3, title: '个人计划', type: 'PERSONAL', startTime: '2026-10-21 09:00:00', endTime: '2026-10-21 10:00:00', isAllDay: false },
  { eventId: '2', version: 4, title: '项目会议', type: 'MEETING', roomId: '8', description: '讨论交付', startTime: '2026-10-21 11:00:00', endTime: '2026-10-21 12:00:00', isAllDay: false },
];
function nodes(value: React.ReactNode): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children), ...nodes(element.props.footer), ...nodes(element.props.actions), ...nodes(element.props.table)];
}
function content(value: any): string {
  if (Array.isArray(value)) return value.map(content).join('');
  if (React.isValidElement(value)) return content((value as Element).props.children);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function harness(mobile = true, permissions = ['oa:schedule:list', 'oa:schedule:add', 'oa:schedule:remove']) {
  const state: any[] = [];
  const effects: Array<{ deps?: any[]; cleanup?: () => void }> = [];
  let index = 0;
  let dirty = false;
  let pendingEffects: Array<() => void> = [];
  let tree: Element[] = [];
  let version = 1;
  let user = { id: '7', tenantId: '3' };
  let items = records();
  let confirmation: boolean | undefined = false;
  let delayedEvents: Promise<any> | undefined;
  const reads: Array<{ start: string; end: string }> = [];
  const writes: any[] = [];
  const deletes: any[] = [];
  const errors: string[] = [];
  let roomsRead = 0;
  const reactMock = { ...React,
    useState: (initial: any) => { const slot = index++; if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial; return [state[slot], (next: any) => { const value = typeof next === 'function' ? next(state[slot]) : next; if (!Object.is(value, state[slot])) { state[slot] = value; dirty = true; } }]; },
    useRef: (initial: any) => { const slot = index++; return state[slot] ??= { current: initial }; },
    useEffect: (body: () => void | (() => void), deps?: any[]) => {
      const slot = index++; const prior = effects[slot];
      if (!prior || !deps || deps.some((value, position) => !Object.is(value, prior.deps?.[position]))) {
        pendingEffects.push(() => { prior?.cleanup?.(); const cleanup = body(); effects[slot] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined }; });
      }
    },
  };
  const deps: Record<string, any> = {
    react: { ...reactMock, default: reactMock, __esModule: true },
    '@fullcalendar/react': { default: Calendar, __esModule: true },
    '@fullcalendar/daygrid': {}, '@fullcalendar/timegrid': {}, '@fullcalendar/interaction': {},
    'lucide-react': new Proxy({}, { get: (_, key) => component(String(key)) }),
    sonner: { toast: { error: (message: string) => errors.push(message), success: () => {} } },
    '@/components/common': common,
    '@/components/common/ConfirmDialog': { ConfirmDialog: Confirm },
    '@/components/common/Pagination': { Pagination: component('Pagination') },
    '@/context/AuthContext': { useAuth: () => ({ user, hasPermission: (permission: string) => permissions.includes(permission) }) },
    '../services/api/schedule': { getMyEvents: async (start: string, end: string) => { reads.push({ start, end }); const delayed = delayedEvents; delayedEvents = undefined; return delayed ?? items; }, getMeetingRooms: async () => { roomsRead++; return [{ roomId: '8', name: '第一会议室' }]; }, createEvent: async (payload: any) => { writes.push(payload); }, deleteEvent: async (...args: any[]) => { deletes.push(args); items = items.filter(item => item.eventId !== args[0]); } },
    '../utils/dateFormat': dateFormat,
    '@/utils/cn': { cn: (...values: any[]) => values.filter(Boolean).join(' ') },
    '@/components/layout/TablePageLayout': { InnerTableSurface: component('InnerTableSurface'), TablePageLayout: component('TablePageLayout') },
    '@/components/mobile/MobileFilterDrawer': { MobileFilterDrawer: Drawer },
    '@/utils/authStorage': { getAuthSessionVersion: () => version },
    './meeting/useMeetingConflictConsent': { useMeetingConflictConsent: () => ({ confirmSchedule: async () => confirmation, conflictDialog: null }) },
  };
  const compiled = { exports: {} as Record<string, any> };
  vm.runInNewContext(compiledSource, { module: compiled, exports: compiled.exports, Date, console, require: (name: string) => { if (!(name in deps)) throw new Error(`Unmocked dependency: ${name}`); return deps[name]; } });
  function render() { index = 0; dirty = false; tree = nodes(compiled.exports.SchedulePage({ mobile })); return tree; }
  async function settle() {
    for (let attempt = 0; attempt < 12; attempt++) { render(); const pending = pendingEffects; pendingEffects = []; pending.forEach(body => body()); await new Promise(resolve => setImmediate(resolve)); if (!dirty && !pendingEffects.length) return render(); }
    throw new Error('页面未在12次局部更新内稳定');
  }
  return { render, settle, reads, writes, deletes, errors, get roomsRead() { return roomsRead; }, button: (label: string) => render().find(node => node.type === common.Button && content(node.props.children) === label)!, named: (label: string) => render().find(node => node.props['aria-label'] === label)!, drawer: () => render().find(node => node.type === Drawer)!, dialog: (title: string) => render().find(node => node.type === common.BaseDialog && node.props.title === title)!, confirm: () => render().find(node => node.type === Confirm)!, title: (value: string) => render().find(node => node.type === common.Input && node.props.placeholder === '例如：项目评审、客户回访、个人学习')!.props.onChange({ target: { value } }), setConfirmation: (value: boolean | undefined) => { confirmation = value; }, defer: (promise: Promise<any>) => { delayedEvents = promise; }, switchUser: () => { version++; user = { id: '9', tenantId: '4' }; }, cards: () => render().filter(node => node.props['data-schedule-id']), } ;
}
let checks = 0;
async function check(label: string, body: () => void | Promise<void>) { await body(); checks++; console.log(`PASS ${label}`); }
const page = harness();
await check('手机按日读取正式日程接口并显示详情卡片', async () => {
  const tree = await page.settle(); assert.equal(page.cards().length, 2); assert.ok(!tree.some(node => node.type === Calendar));
  assert.ok(page.reads.at(-1)!.start.endsWith('00:00:00')); assert.ok(page.reads.at(-1)!.end.endsWith('23:59:59'));
  page.cards()[1].props.onClick(); assert.equal(page.dialog('项目会议').props.open, true); assert.ok(content(page.dialog('项目会议').props.children).includes('讨论交付')); page.dialog('项目会议').props.onClose();
});
await check('新建入口带入所选日期并执行必填校验及创建', async () => {
  page.render().find(node => node.type === common.DatePicker && node.props.type === 'date')!.props.onChange({ target: { value: '2026-10-21' } }); await page.settle();
  page.button('新建日程').props.onClick(); assert.equal(page.dialog('新建日程').props.open, true);
  const dates = page.render().filter(node => node.type === common.DatePicker && node.props.type === 'datetime-local'); assert.equal(dates[0].props.value, '2026-10-21T09:00');
  await page.button('创建日程').props.onClick(); assert.equal(page.errors.at(-1), '请输入日程主题'); assert.equal(page.writes.length, 0);
  page.title('  新安排  '); await page.button('创建日程').props.onClick(); assert.equal(page.writes[0].title, '新安排'); assert.equal(page.writes[0].confirmParticipantConflicts, false); assert.equal(page.dialog('新建日程').props.open, false); await page.settle();
});
await check('参与人冲突确认取消时不提交创建', async () => {
  page.button('新建日程').props.onClick(); page.title('冲突事项'); page.setConfirmation(undefined); await page.button('创建日程').props.onClick(); assert.equal(page.writes.length, 1); assert.equal(page.dialog('新建日程').props.open, true); page.dialog('新建日程').props.onClose(); page.setConfirmation(false);
});
await check('筛选抽屉支持取消、关键词类型提交和重置', () => {
  page.named('筛选日程').props.onClick(); assert.equal(page.drawer().props.open, true);
  const keyword = () => nodes(page.drawer().props.children).find(node => node.type === common.Input)!;
  keyword().props.onChange({ target: { value: '取消内容' } }); page.drawer().props.onClose(); assert.equal(page.cards().length, 2);
  page.named('筛选日程').props.onClick(); assert.equal(keyword().props.value, ''); keyword().props.onChange({ target: { value: '  项目  ' } });
  nodes(page.drawer().props.children).find(node => node.type === 'select')!.props.onChange({ target: { value: 'MEETING' } }); page.drawer().props.onApply(); assert.equal(page.cards().length, 1); assert.equal(page.cards()[0].props['data-schedule-id'], '2');
  page.named('筛选日程').props.onClick(); page.drawer().props.onReset(); page.drawer().props.onApply(); assert.equal(page.cards().length, 2);
});
await check('周视图读取所选日期所在周的周一至周日', async () => {
  page.button('周视图').props.onClick(); await page.settle(); assert.equal(page.reads.at(-1)!.start, '2026-10-19 00:00:00'); assert.equal(page.reads.at(-1)!.end, '2026-10-25 23:59:59');
});
await check('取消日程要求原因并保留正式版本参数', async () => {
  page.cards()[0].props.onClick(); page.button('删除日程').props.onClick(); page.confirm().props.onConfirm(); await page.settle(); assert.equal(page.errors.at(-1), '请填写取消原因'); assert.equal(page.deletes.length, 0);
  page.render().find(node => node.type === common.Textarea && node.props.id === 'schedule-cancellation-reason')!.props.onChange({ target: { value: '  安排调整  ' } });
  page.confirm().props.onConfirm(); await page.settle(); assert.deepEqual(page.deletes[0], ['1', 3, '安排调整']); assert.equal(page.cards().length, 1); assert.equal(page.confirm().props.open, false);
});
await check('查看与新增权限限制查询和操作入口', async () => {
  const denied = harness(true, []); await denied.settle(); assert.equal(denied.reads.length, 0); assert.equal(denied.roomsRead, 0); assert.equal(denied.named('刷新日程').props.disabled, true);
  const readOnly = harness(true, ['oa:schedule:list']); await readOnly.settle(); assert.equal(readOnly.button('新建日程').props.disabled, true); readOnly.cards()[0].props.onClick(); assert.equal(readOnly.button('删除日程').props.disabled, true);
});
await check('账号租户切换清理表单且旧响应不能覆盖新身份', async () => {
  page.button('新建日程').props.onClick(); page.title('旧账号草稿'); let resolve!: (value: any) => void; page.defer(new Promise(done => { resolve = done; })); page.named('刷新日程').props.onClick();
  page.switchUser(); await page.settle(); resolve([{ ...records()[0], title: '旧账号迟到数据' }]); await page.settle(); assert.equal(page.dialog('新建日程').props.open, false); assert.ok(!page.cards().some(node => content(node).includes('旧账号迟到数据')));
  page.button('新建日程').props.onClick(); assert.equal(page.render().find(node => node.type === common.Input && node.props.placeholder === '例如：项目评审、客户回访、个人学习')!.props.value, '');
});
await check('桌面代表流程保留日历并使用同一创建表单', async () => {
  const desktop = harness(false); const tree = await desktop.settle(); assert.ok(tree.some(node => node.type === Calendar)); assert.equal(desktop.named('筛选日程'), undefined);
  desktop.render().find(node => node.type === 'button' && content(node.props.children) === '新建日程')!.props.onClick(); desktop.title('桌面事项'); await desktop.button('创建日程').props.onClick(); assert.equal(desktop.writes[0].title, '桌面事项');
});
console.log(`MOBILE_SCHEDULE_BASIC: checks=${checks}; failed=0; production-page=true; mocked-hooks-and-api=true; browser=false; artifacts=none`);
