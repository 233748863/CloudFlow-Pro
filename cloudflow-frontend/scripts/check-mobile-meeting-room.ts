import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as dates from 'date-fns';

// 正式页面与正式冲突hook；仅替换网络、React hooks和外层控件，无构建产物。
type Element = React.ReactElement<Record<string, any>>;
const component = (name: string) => Object.assign(() => null, { displayName: name });
const DatePicker = component('DatePicker');
const Drawer = component('MobileFilterDrawer');
const Dialog = component('BaseDialog');
const Button = component('Button');
const Notice = component('MeetingConflictNotice');
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const pageSource = compile('../src/mobile/pages/MobileMeetingRoom.tsx');
const hookSource = compile('../src/pages/meeting/useMeetingConflictConsent.tsx');
function nodes(value: React.ReactNode): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children), ...nodes(element.props.footer)];
}
function content(value: React.ReactNode): string {
  if (Array.isArray(value)) return value.map(content).join('');
  if (React.isValidElement(value)) return content((value as Element).props.children);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
const records = () => [
  { roomId: '9007199254740993', name: '第一会议室', location: '总部一楼', capacity: 8, equipment: '["投影仪","白板"]', status: '1' },
  { roomId: '9', name: '第二会议室', location: '总部二楼', capacity: 4, equipment: '电视,白板', status: '0' },
];
function harness(permissions = ['oa:meeting-room:list', 'oa:schedule:add'], hookOnly = false) {
  const state: any[] = [];
  const effects: Array<{ deps?: any[]; cleanup?: () => void }> = [];
  let index = 0; let dirty = false; let pending: Array<() => void> = []; let tree: Element[] = [];
  let user = { id: '7', tenantId: '3' }; let version = 1;
  let roomData = records(); let roomDelay: Promise<any> | undefined; let conflictDelay: Promise<any> | undefined;
  let conflicts = { crmVerified: true, busy: [] as any[] };
  let reads = 0; let conflictReads = 0;
  const writes: any[] = []; const errors: string[] = []; const successes: string[] = []; const navigations: any[] = [];
  const reactMock = { ...React,
    useState: (initial: any) => { const slot = index++; if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial; return [state[slot], (next: any) => { const value = typeof next === 'function' ? next(state[slot]) : next; if (!Object.is(value, state[slot])) { state[slot] = value; dirty = true; } }]; },
    useRef: (initial: any) => { const slot = index++; return state[slot] ??= { current: initial }; },
    useCallback: (callback: any, deps: any[]) => { const slot = index++; const prior = state[slot]; if (!prior || deps.some((value, position) => !Object.is(value, prior.deps[position]))) state[slot] = { callback, deps }; return state[slot].callback; },
    useEffect: (body: () => void | (() => void), deps?: any[]) => { const slot = index++; const prior = effects[slot]; if (!prior || !deps || deps.some((value, position) => !Object.is(value, prior.deps?.[position]))) pending.push(() => { prior?.cleanup?.(); const cleanup = body(); effects[slot] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined }; }); },
  };
  const dependencies: Record<string, any> = {
    react: { ...reactMock, default: reactMock, __esModule: true }, 'react/jsx-runtime': jsxRuntime, 'date-fns': dates,
    'react-router-dom': { useNavigate: () => (target: any) => navigations.push(target) },
    'lucide-react': new Proxy({}, { get: (_, key) => component(String(key)) }),
    '@/hooks/usePullToRefresh': { usePullToRefresh: () => ({ isRefreshing: false, pullDistance: 0, isPulling: false }) },
    sonner: { toast: { error: (value: string) => errors.push(value), success: (value: string) => successes.push(value) } },
    '@/context/AuthContext': { useAuth: () => ({ user, hasPermission: (value: string) => permissions.includes(value) }) },
    '@/utils/authStorage': { getAuthSessionVersion: () => version },
    '@/components/common': { DatePicker, BaseDialog: Dialog, Button },
    '@/components/mobile/MobileFilterDrawer': { MobileFilterDrawer: Drawer },
    '@/services/api/schedule': { getMeetingRooms: async () => { reads++; const delay = roomDelay; roomDelay = undefined; return delay ?? roomData; }, createEvent: async (payload: any) => { writes.push(payload); }, normalizeScheduleTime: (value: string) => value.replace('T', ' ') },
    '@/services/api/meeting': { meetingApi: { participantBusy: async () => { conflictReads++; const delay = conflictDelay; conflictDelay = undefined; return delay ?? conflicts; } } },
    './meetingUi': { MeetingConflictNotice: Notice, readArray: (value: unknown) => Array.isArray(value) ? value : [] },
    './meeting.css': {},
  };
  function evaluate(source: string) { const compiled = { exports: {} as Record<string, any> }; vm.runInNewContext(source, { module: compiled, exports: compiled.exports, Date, console, require: (name: string) => { if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`); return dependencies[name]; } }); return compiled.exports; }
  const hook = evaluate(hookSource); dependencies['@/pages/meeting/useMeetingConflictConsent'] = hook; const page = evaluate(pageSource);
  function render() { index = 0; dirty = false; if (hookOnly) { const api = hook.useMeetingConflictConsent(); tree = nodes(React.createElement('hook', { api }, api.conflictDialog)); } else tree = nodes(page.MobileMeetingRoom({})); return tree; }
  async function settle() { for (let attempt = 0; attempt < 12; attempt++) { render(); const work = pending; pending = []; work.forEach(body => body()); await new Promise(resolve => setImmediate(resolve)); if (!dirty && !pending.length) return render(); } throw new Error('页面未在12次局部更新内稳定'); }
  const byId = (id: string) => render().find(node => node.props.id === id)!;
  const button = (label: string) => render().find(node => (node.type === 'button' || node.type === Button) && content(node.props.children) === label)!;
  return { render, settle, writes, errors, successes, navigations, byId, button, get reads() { return reads; }, get conflictReads() { return conflictReads; },
    named: (label: string) => render().find(node => node.props['aria-label'] === label)!,
    rooms: () => render().filter(node => node.props['data-meeting-room-id']), drawer: () => render().find(node => node.type === Drawer)!, dialog: () => render().find(node => node.type === Dialog), notice: () => render().find(node => node.type === Notice)!,
    change: (id: string, value: string) => byId(id).props.onChange({ target: { value } }),
    fill: () => { byId('meeting-booking-date').props.onChange({ target: { value: dates.format(dates.addDays(new Date(), 2), 'yyyy-MM-dd') } }); byId('meeting-booking-purpose').props.onChange({ target: { value: '  项目评审  ' } }); },
    setConflicts: (value: typeof conflicts) => { conflicts = value; }, deferRooms: (promise: Promise<any>) => { roomDelay = promise; }, deferConflicts: (promise: Promise<any>) => { conflictDelay = promise; },
    switchUser: () => { version++; user = { id: '9', tenantId: '4' }; }, setRooms: (value: typeof roomData) => { roomData = value; }, hookApi: () => render()[0].props.api,
  };
}
let checks = 0;
async function check(label: string, body: () => void | Promise<void>) { await body(); checks++; console.log(`PASS ${label}`); }
await check('正式房间数据保留长ID并读取设备及维护状态', async () => {
  const page = harness(); await page.settle(); assert.equal(page.rooms().length, 2); assert.equal(page.rooms()[0].props['data-meeting-room-id'], records()[0].roomId); assert.ok(content(page.rooms()[0]).includes('投影仪')); assert.equal(page.rooms()[1].props['aria-disabled'], true); page.rooms()[1].props.onClick(); assert.equal(page.errors.at(-1), '该会议室当前不可用');
});
await check('筛选抽屉支持取消应用重置', async () => {
  const page = harness(); await page.settle(); page.named('筛选会议室').props.onClick(); page.change('meeting-room-keyword', '第一'); page.drawer().props.onClose(); assert.equal(page.rooms().length, 2); page.named('筛选会议室').props.onClick(); assert.equal(page.byId('meeting-room-keyword').props.value, ''); page.change('meeting-room-keyword', ' 第一 '); page.drawer().props.onApply(); assert.equal(page.rooms().length, 1); page.named('筛选会议室').props.onClick(); page.drawer().props.onReset(); page.drawer().props.onApply(); assert.equal(page.rooms().length, 2);
});
await check('正常预订保留容量日期校验并使用固定操作入口', async () => {
  const page = harness(); await page.settle(); page.rooms()[0].props.onClick(); await page.button('确认预订').props.onClick(); assert.equal(page.errors.at(-1), '请输入会议主题'); page.fill(); page.change('meeting-booking-attendees', '9'); await page.button('确认预订').props.onClick(); assert.equal(page.errors.at(-1), '该会议室最多容纳8人'); page.change('meeting-booking-attendees', '1.5'); await page.button('确认预订').props.onClick(); assert.equal(page.writes.length, 0); page.change('meeting-booking-attendees', '2'); page.change('meeting-booking-date', ''); await page.button('确认预订').props.onClick(); assert.equal(page.errors.at(-1), '请选择有效的预订日期和时间'); page.fill(); assert.ok(page.render().some(node => node.type === 'footer' && node.props.className === 'cf-mobile-booking-footer')); await page.button('确认预订').props.onClick(); assert.equal(page.writes.length, 1); assert.equal(page.writes[0].roomId, records()[0].roomId); assert.equal(page.writes[0].title, '项目评审'); assert.equal(page.writes[0].expectedAttendees, 2); assert.equal(page.writes[0].confirmParticipantConflicts, false); assert.deepEqual(page.navigations, ['/']);
});
await check('表单显示正式冲突弹窗并允许返回调整或确认', async () => {
  const page = harness(); await page.settle(); page.rooms()[0].props.onClick(); page.fill(); page.setConflicts({ crmVerified: true, busy: [{ userId: '7' }] }); const first = page.button('确认预订').props.onClick(); await page.settle(); assert.ok(page.dialog()); assert.equal(page.button('确认仍继续预约').props.disabled, true); page.button('返回调整').props.onClick(); await first; assert.equal(page.writes.length, 0); const second = page.button('确认预订').props.onClick(); await page.settle(); page.notice().props.onConfirm(true); assert.equal(page.button('确认仍继续预约').props.disabled, false); page.button('确认仍继续预约').props.onClick(); await second; assert.equal(page.writes[0].confirmParticipantConflicts, true);
});
await check('查看及预订权限分别限制查询和操作', async () => {
  const denied = harness([]); await denied.settle(); assert.equal(denied.reads, 0); assert.ok(content(denied.render()).includes('暂无会议室查看权限')); const readOnly = harness(['oa:meeting-room:list']); await readOnly.settle(); assert.equal(readOnly.rooms()[0].props['aria-disabled'], true); readOnly.rooms()[0].props.onClick(); assert.equal(readOnly.errors.at(-1), '暂无会议预订权限'); assert.equal(readOnly.writes.length, 0);
});
await check('账号租户切换清空草稿并丢弃旧房间响应', async () => {
  const page = harness(); await page.settle(); const refresh = page.named('刷新会议室').props.onClick; page.rooms()[0].props.onClick(); page.fill(); let resolve!: (value: any) => void; page.deferRooms(new Promise(done => { resolve = done; })); const old = refresh(); page.switchUser(); await page.settle(); resolve([{ ...records()[0], name: '旧身份房间' }]); await old; await page.settle(); assert.ok(!content(page.render()).includes('旧身份房间')); assert.equal(page.byId('meeting-booking-purpose'), undefined); page.rooms()[0].props.onClick(); assert.equal(page.byId('meeting-booking-purpose').props.value, '');
});
await check('冲突查询和确认期间切换身份均取消旧提交', async () => {
  for (const waitingForDialog of [false, true]) { const page = harness(); await page.settle(); page.rooms()[0].props.onClick(); page.fill(); page.setConflicts({ crmVerified: true, busy: [{ userId: '7' }] }); let resolve!: (value: any) => void; if (!waitingForDialog) page.deferConflicts(new Promise(done => { resolve = done; })); const submission = page.button('确认预订').props.onClick(); await page.settle(); page.switchUser(); await page.settle(); if (!waitingForDialog) resolve({ crmVerified: true, busy: [] }); await submission; await page.settle(); assert.equal(page.writes.length, 0); assert.equal(page.dialog(), undefined); assert.deepEqual(page.navigations, []); }
});
await check('共享冲突hook代表流程保留无冲突及显式确认返回值', async () => {
  const page = harness(undefined, true); await page.settle(); const event = { title: '桌面日程', startTime: '2026-10-21 09:00:00', endTime: '2026-10-21 10:00:00' }; assert.equal(await page.hookApi().confirmSchedule(event), false); page.setConflicts({ crmVerified: false, busy: [] }); const result = page.hookApi().confirmSchedule(event); await page.settle(); assert.ok(page.dialog()); page.notice().props.onConfirm(true); page.button('确认仍继续预约').props.onClick(); assert.equal(await result, true);
});
console.log(`MOBILE_MEETING_ROOM_BASIC: checks=${checks}; failed=0; production-page-and-hook=true; mocked-network-and-hooks=true; browser=false; artifacts=none`);
