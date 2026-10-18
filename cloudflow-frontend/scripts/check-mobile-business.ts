import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as routeFixes from '../src/utils/menuRouteFixes';
import * as dateFormat from '../src/utils/dateFormat';
import * as authStorage from '../src/utils/authStorage';
import * as hr09Model from '../src/services/api/hr/hr09Model';

type Element = React.ReactElement<Record<string, any>>;
const component = (name: string) => Object.assign(() => null, { displayName: name });
const fallback = new Proxy({}, { get: (_, name) => component(String(name)) });
let breakpoint = 'mobile';
let route = { pathname: '/tasks', search: '', state: null, key: 'one' };
let menus: any[] = [];
let menuState: any = {};
let allowed = new Set(['crm:activity:add', 'crm:ticket:add']);
let slots: any[] = [];
let cursor = 0;
let dirty = false;
let effects: Array<() => void> = [];
let remoteLoader: () => Promise<unknown>;
let query: any;
let storeState: any;
const dialogs: any[] = [];
const browserEvents = new Map<string, () => void>();
const ticket = { keyword: '原关键字', ticketQueue: false, tab: 'ticket',
  setKeyword: (value: string) => { ticket.keyword = value; },
  setTicketQueue: (value: boolean) => { ticket.ticketQueue = value; },
  hasPermission: (value: string) => allowed.has(value),
  openDialog: (value: unknown) => dialogs.push(value), load: () => {} };
const reactMock = { ...React,
  useState: (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (next: any) => { const value = typeof next === 'function' ? next(slots[index]) : next; if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; } }];
  },
  useRef: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
  useMemo: (run: () => unknown) => run(),
  useEffect: (run: () => void | (() => void), deps: unknown[]) => {
    const index = cursor++; const old = slots[index];
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
      slots[index] = { deps, cleanup: old?.cleanup };
      effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = run(); });
    }
  },
};
const common = new Proxy({}, { get: (_, name) => component(String(name)) });
const dependencies: Record<string, any> = {
  react: { ...reactMock, default: reactMock, __esModule: true },
  'react-router-dom': { useLocation: () => route, useNavigate: () => () => {}, useSearchParams: () => [new URLSearchParams(), () => {}] },
  'lucide-react': fallback, sonner: { toast: { success: () => {}, error: () => {}, warning: () => {} } },
  '@/hooks/useBreakpoint': { useBreakpoint: () => breakpoint },
  '@/hooks/useBackendMenus': { useBackendMenus: () => ({ data: menus, isLoading: false, isError: false, ...menuState }) },
  '@/utils/menuRouteFixes': routeFixes,
  '@/context/AuthContext': { useAuth: () => ({ user: { id: '7', tenantId: '3' }, hasPermission: (value: string | string[]) => Array.isArray(value) ? value.some(item => allowed.has(item)) : allowed.has(value) }) },
  '@/components/common': common, '@/components/common/PageLoading': common, '@/components/common/RouteGuard': common, '@/components/common/result': common,
  '@/components/mobile/MobileFilterDrawer': { MobileFilterDrawer: component('MobileFilterDrawer') },
  '@/components/crm/management/store': { useCrmManagement: () => ticket },
  './store': { useCrmManagement: () => ticket }, './constants': { tabLabelMap: { ticket: '工单', customer: '客户' } },
  '@/components/crm/operations/ActivityEditor': { ActivityEditor: component('ActivityEditor'), activityTypes: { CALL: '电话' }, newActivity: () => ({ activity: { subject: '' } }) },
  '@/services/api/crm/operations': { crmOperations: { activities: async (value: unknown) => { query = value; return { rows: [], total: 0 }; } } },
  '@/components/crm/operations/OperationsKit': { OperationsPage: component('OperationsPage'), OpsSelect: component('OpsSelect'), OpsTable: component('OpsTable'), Empty: component('Empty'), activityStatuses: { PLANNED: '已安排' }, labelOf: (_: unknown, value: string) => value,
    useAccess: () => (value: string) => allowed.has(value), useMutation: () => ({ busy: false, run: async (run: () => Promise<unknown>, after?: (value: unknown) => void) => after?.(await run()) }),
    useRemote: (loader: () => Promise<unknown>) => { remoteLoader = loader; return { data: { rows: [{ activityId: 1, subject: '客户回访', activityType: 'CALL', status: 'PLANNED', startTime: '2026-10-17 09:00:00', endTime: '2026-10-17 10:00:00' }], total: 1 }, loading: false, refresh: () => {} }; } },
  '@/types': { AnnouncementType: { URGENT: 'URGENT' }, AnnouncementScope: { ALL: 'ALL' } },
  '@/utils/announcementMeta': { useAnnouncementPriorityMeta: () => () => ({ label: '普通', className: '' }) },
  '@/utils/announcementFormat': { formatAnnouncementRelativeWithDateTime: () => '' },
  '@/components/layout/TablePageLayout': common,
};
function load(relative: string) {
  let source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  source = source.replace('import.meta.glob<PageModule>(', '__pageGlob(');
  const compiled = { exports: {} as Record<string, any> };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, console, URLSearchParams, Event, window: { dispatchEvent: () => {}, location: { pathname: '/login' }, addEventListener: (name: string, run: () => void) => browserEvents.set(name, run), removeEventListener: (name: string) => browserEvents.delete(name) }, setTimeout: () => 0,
    __pageGlob: () => ({ '../pages/TaskListPage.tsx': () => {}, '../pages/AnnouncementPage.tsx': () => {}, '../pages/WorkflowDesign.tsx': () => {} }),
    require: (name: string) => name === 'react/jsx-runtime' ? { jsx: (type: any, props: any, key: any) => React.createElement(type, { ...props, key }), jsxs: (type: any, props: any, key: any) => React.createElement(type, { ...props, key }), Fragment: React.Fragment } : dependencies[name] ?? fallback });
  return compiled.exports;
}
function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const node = value as Element;
  return [node, ...['children', 'actions', 'filters', 'table', 'action'].flatMap(key => nodes(node.props[key]))];
}
const nameOf = (node: Element) => typeof node.type === 'string' ? node.type : (node.type as any)?.displayName;
const named = (tree: Element[], name: string) => tree.find(node => nameOf(node) === name)!;
const labelled = (tree: Element[], name: string) => tree.find(node => node.props['aria-label'] === name || node.props.label === name)!;
const button = (tree: Element[], text: string) => tree.find(node => nameOf(node) === 'Button' && React.Children.toArray(node.props.children).includes(text))!;
function reset() { slots = []; cursor = 0; effects = []; }
function render(page: any, props: any = {}) {
  let tree: Element[] = [];
  for (let pass = 0; pass < 8; pass++) {
    cursor = 0; effects = []; dirty = false; tree = nodes(page(props)); effects.forEach(run => run());
    if (!dirty) return tree;
  }
  throw new Error('基本检查组件未稳定');
}
let checks = 0;
async function check(label: string, run: () => void | Promise<void>) { if (process.argv[2] && !label.includes(process.argv[2])) return; await run(); checks++; console.log(`PASS ${label}`); }

const responsive = load('../src/router/ResponsiveMenuPage.tsx');
dependencies['./ResponsiveMenuPage'] = responsive;
const { DynamicMenuRoute } = load('../src/router/DynamicMenuRoute.tsx');
await check('同一路由按宽度切换并保留我的申请模式', () => {
  assert.ok(responsive.findMobileMenuPage('../pages/TaskListPage.tsx', '/tasks'));
  assert.equal(responsive.findMobileMenuPage('../pages/TaskListPage.tsx', '/my-apps'), null);
  assert.equal(responsive.findMobileMenuPage('../pages/TaskListPage.tsx.bak', '/tasks'), null);
  const child = React.createElement('main');
  breakpoint = 'desktop'; assert.equal(responsive.ResponsiveMenuPage({ page: 'Dashboard', children: child }).props.children, child);
  breakpoint = 'mobile'; assert.notEqual(responsive.ResponsiveMenuPage({ page: 'Dashboard', children: child }).props.children.type, 'main');
});
await check('动态菜单保留显示状态、查询参数与权限守卫', () => {
  const menu = { path: '/tasks', component: 'pages/TaskListPage', visible: '0', status: '0', menuType: 'C', perms: 'task:list, task:view' };
  menus = [menu]; route.pathname = '/tasks'; route.search = '';
  const guard = DynamicMenuRoute(); assert.equal(Array.from(guard.props.requiredPermissions).join(','), 'task:list,task:view');
  assert.equal(guard.props.children.props.children.type, responsive.findMobileMenuPage('../pages/TaskListPage.tsx', '/tasks'));
  for (const change of [{ visible: '1' }, { status: '1' }, { menuType: 'M' }, { query: 'mode=other' }]) { menus = [{ ...menu, ...change }]; assert.equal(DynamicMenuRoute().props.title, '菜单路由未配置'); }
  menus = [{ ...menu, path: '/my-apps' }]; route.pathname = '/my-apps';
  assert.notEqual(DynamicMenuRoute().props.children.props.children.type, responsive.findMobileMenuPage('../pages/TaskListPage.tsx', '/tasks'));
  menuState = { isLoading: true }; assert.equal(DynamicMenuRoute().props.tip, '正在加载菜单路由…'); menuState = {};
});
await check('公告和继续查看的业务页能经动态入口到达', () => {
  for (const [path, componentPath] of [['/announcements', 'pages/AnnouncementPage'], ['/workflow/design', 'pages/WorkflowDesign']]) {
    route.pathname = path; menus = [{ path, component: componentPath, visible: '0', status: '0', menuType: 'C', perms: 'allowed' }];
    assert.ok(DynamicMenuRoute().props.children.props.children.type);
  }
  const router = readFileSync(new URL('../src/router.tsx', import.meta.url), 'utf8');
  assert.ok(router.includes('<ResponsiveMenuPage page="LeaveApplicationPage">{withSuspense(<LeaveApplicationPage />)}</ResponsiveMenuPage>'));
  assert.ok(!router.includes('当前功能暂不支持移动端'));
});

const { CrmManagementToolbar } = load('../src/components/crm/management/CrmManagementToolbar.tsx');
await check('工单筛选取消、应用和重置，固定新增遵守权限', () => {
  reset(); breakpoint = 'mobile';
  labelled(render(CrmManagementToolbar), '筛选工单').props.onClick();
  labelled(render(CrmManagementToolbar), '搜索工单').props.onChange({ target: { value: ' 新内容 ' } });
  named(render(CrmManagementToolbar), 'MobileFilterDrawer').props.onClose(); assert.equal(ticket.keyword, '原关键字');
  labelled(render(CrmManagementToolbar), '筛选工单').props.onClick();
  labelled(render(CrmManagementToolbar), '搜索工单').props.onChange({ target: { value: ' 新内容 ' } });
  render(CrmManagementToolbar).find(node => node.type === 'input')!.props.onChange({ target: { checked: true } });
  named(render(CrmManagementToolbar), 'MobileFilterDrawer').props.onApply(); assert.equal(ticket.keyword, '新内容'); assert.equal(ticket.ticketQueue, true);
  button(render(CrmManagementToolbar), '新增工单').props.onClick(); assert.equal(dialogs.at(-1).type, 'ticket');
  labelled(render(CrmManagementToolbar), '筛选工单').props.onClick(); named(render(CrmManagementToolbar), 'MobileFilterDrawer').props.onReset(); named(render(CrmManagementToolbar), 'MobileFilterDrawer').props.onApply();
  assert.equal(ticket.keyword, ''); assert.equal(ticket.ticketQueue, false);
  allowed.delete('crm:ticket:add'); assert.equal(button(render(CrmManagementToolbar), '新增工单'), undefined); allowed.add('crm:ticket:add');
  breakpoint = 'desktop'; assert.equal(named(render(CrmManagementToolbar), 'MobileFilterDrawer'), undefined); breakpoint = 'mobile';
});

const ActivityPage = load('../src/pages/CrmActivityPage.tsx').default;
await check('活动手机卡片、筛选草稿与正常创建复用正式编辑器', async () => {
  reset(); route = { pathname: '/office/crm/activity', search: '', state: null, key: 'activity' };
  assert.ok(render(ActivityPage).some(node => node.type === 'article'));
  labelled(render(ActivityPage), '筛选客户活动').props.onClick(); labelled(render(ActivityPage), '搜索活动').props.onChange({ target: { value: '取消草稿' } });
  named(render(ActivityPage), 'MobileFilterDrawer').props.onClose(); render(ActivityPage); await remoteLoader(); assert.equal(query.subject, undefined);
  labelled(render(ActivityPage), '筛选客户活动').props.onClick(); labelled(render(ActivityPage), '搜索活动').props.onChange({ target: { value: ' 回访 ' } });
  labelled(render(ActivityPage), '活动类型筛选').props.onChange('CALL'); named(render(ActivityPage), 'MobileFilterDrawer').props.onApply();
  render(ActivityPage); await remoteLoader(); assert.equal(query.subject, '回访'); assert.equal(query.activityType, 'CALL'); assert.equal(query.pageNum, 1);
  labelled(render(ActivityPage), '筛选客户活动').props.onClick(); named(render(ActivityPage), 'MobileFilterDrawer').props.onReset(); named(render(ActivityPage), 'MobileFilterDrawer').props.onApply();
  render(ActivityPage); await remoteLoader(); assert.equal(query.subject, undefined);
  button(render(ActivityPage), '创建活动').props.onClick(); assert.ok(named(render(ActivityPage), 'ActivityEditor'));
  allowed.delete('crm:activity:add'); assert.equal(button(render(ActivityPage), '创建活动'), undefined); allowed.add('crm:activity:add');
});
await check('活动宽屏日历缩窄为卡片后恢复原桌面选择', () => {
  reset(); breakpoint = 'desktop';
  assert.ok(!render(ActivityPage).some(node => node.type === 'article'));
  breakpoint = 'mobile'; assert.ok(render(ActivityPage).some(node => node.type === 'article'));
  breakpoint = 'desktop'; assert.ok(!render(ActivityPage).some(node => node.type === 'article')); breakpoint = 'mobile';
});

let fetchImpl: () => Promise<any[]> = async () => [];
let markImpl: (id: string) => Promise<boolean> = async () => true;
dependencies['@/services/api/announcement'] = { getMyAnnouncements: () => fetchImpl(), markAnnouncementRead: (id: string) => markImpl(id) };
dependencies.zustand = { create: (initialize: any) => {
  const set = (next: any) => { storeState = { ...storeState, ...(typeof next === 'function' ? next(storeState) : next) }; };
  const store = (selector: any) => selector(storeState); store.getState = () => storeState; store.setState = set;
  storeState = initialize(set, () => storeState); return store;
} };
const announcementStore = load('../src/stores/announcementStore.ts');
dependencies['@/stores/announcementStore'] = announcementStore;
const rows = Array.from({ length: 25 }, (_, index) => ({ announcementId: index + 1, title: `公告${index + 1}`, createTime: `2026-10-${String(index + 1).padStart(2, '0')} 09:00:00`, isTop: 0, priority: 'L', type: 'GENERAL', isRead: index % 2 === 0 }));
await check('公告完整读取超过20条且后发请求结果优先', async () => {
  storeState.reset(); fetchImpl = async () => rows; await storeState.fetchAnnouncements(true); assert.equal(storeState.announcements.length, 25);
  let finish!: (value: any[]) => void; fetchImpl = () => new Promise(resolve => { finish = resolve; }); const old = storeState.fetchAnnouncements(true);
  fetchImpl = async () => [rows[0]]; await storeState.fetchAnnouncements(true); finish(rows); await old; assert.equal(storeState.announcements.length, 1);
});
await check('切身份后旧公告请求与已读响应不会污染新状态', async () => {
  let finish!: (value: any[]) => void; fetchImpl = () => new Promise(resolve => { finish = resolve; }); const old = storeState.fetchAnnouncements(true);
  storeState.reset(); finish(rows); await old; assert.equal(storeState.announcements.length, 0);
  let readFinish!: (value: boolean) => void; markImpl = () => new Promise(resolve => { readFinish = resolve; }); const reading = storeState.markAsRead(1);
  storeState.reset(); storeState.announcements = [{ ...rows[0], isRead: false }]; readFinish(true); await reading; assert.equal(storeState.announcements[0].isRead, false);
  markImpl = async () => true;
});
await check('全部已读仅更新本次提交的公告，新到公告仍未读', async () => {
  storeState.reset(); storeState.announcements = [{ ...rows[0], isRead: false }];
  let finish!: (value: boolean) => void; markImpl = () => new Promise(resolve => { finish = resolve; }); const reading = storeState.markAllAsRead();
  storeState.announcements = [...storeState.announcements, { ...rows[1], isRead: false }]; finish(true); await reading;
  assert.equal(storeState.announcements[0].isRead, true); assert.equal(storeState.announcements[1].isRead, false); markImpl = async () => true;
});
const AnnouncementPage = load('../src/pages/AnnouncementPage.tsx').AnnouncementPage;
let eligibility = { loading: false, canStartSelfService: true, restrictionMessage: '' };
const leaveCalls: Array<{ kind: string; value: any }> = [];
const leaveErrors: string[] = [];
dependencies['@/hooks/useKeyboardHeight'] = { useKeyboardAwareScroll: () => {} };
dependencies['@/hooks/useHrSelfServiceEligibility'] = { useHrSelfServiceEligibility: () => eligibility };
dependencies['@/utils/dateFormat'] = dateFormat;
dependencies['@/services/api/leaveApplication'] = { leaveApplicationApi: {
  listLeaveTypes: async () => [{ id: 1, leaveName: '年假', unit: 'DAY', status: 1 }, { id: 2, leaveName: '事假', unit: 'HOUR', status: 1 }],
  add: async (value: any) => { leaveCalls.push({ kind: 'add', value }); return { id: 123 }; },
  submit: async (value: number) => { leaveCalls.push({ kind: 'submit', value }); },
} };
const MobileLeaveApplication = load('../src/mobile/pages/MobileLeaveApplication.tsx').MobileLeaveApplication;
await check('请假固定提交与字段标签，日期及小时正常提交', async () => {
  reset(); leaveCalls.length = 0; eligibility = { loading: false, canStartSelfService: true, restrictionMessage: '' };
  render(MobileLeaveApplication); await new Promise<void>(resolve => setImmediate(resolve));
  let tree = render(MobileLeaveApplication);
  for (const id of ['mobile-leave-start', 'mobile-leave-end', 'mobile-leave-reason']) {
    assert.ok(tree.some(node => node.type === 'label' && node.props.htmlFor === id));
    assert.ok(tree.some(node => node.props.id === id && node.props.required));
  }
  const footer = tree.find(node => node.props.className === 'cf-mobile-primary-footer')!;
  const submit = nodes(footer).find(node => node.type === 'button')!; assert.ok(submit);
  tree.find(node => node.props.id === 'mobile-leave-start')!.props.onChange({ target: { value: '2026-10-17' } });
  tree.find(node => node.props.id === 'mobile-leave-end')!.props.onChange({ target: { value: '2026-10-18' } });
  tree.find(node => node.type === 'textarea')!.props.onChange({ target: { value: ' 家庭事务 ' } });
  await nodes(render(MobileLeaveApplication).find(node => node.props.className === 'cf-mobile-primary-footer')).find(node => node.type === 'button')!.props.onClick();
  assert.equal(leaveCalls[0].value.duration, 2); assert.equal(leaveCalls[0].value.startTime, '2026-10-17 09:00:00');
  assert.equal(leaveCalls[0].value.reason, '家庭事务'); assert.equal(leaveCalls[1].value, 123);
  tree = render(MobileLeaveApplication); tree.find(node => node.type === 'button' && node.props.children === '事假')!.props.onClick();
  tree = render(MobileLeaveApplication);
  tree.find(node => node.props.id === 'mobile-leave-start')!.props.onChange({ target: { value: '2026-10-17T09:00' } });
  tree.find(node => node.props.id === 'mobile-leave-end')!.props.onChange({ target: { value: '2026-10-17T11:30' } });
  await nodes(render(MobileLeaveApplication).find(node => node.props.className === 'cf-mobile-primary-footer')).find(node => node.type === 'button')!.props.onClick();
  assert.equal(leaveCalls[2].value.duration, 2.5); assert.equal(leaveCalls[2].value.unit, 'HOUR');
});
await check('请假必要校验与员工限制阻止提交', async () => {
  dependencies.sonner.toast.error = (message: string) => leaveErrors.push(message);
  reset(); leaveCalls.length = 0; leaveErrors.length = 0;
  render(MobileLeaveApplication); await new Promise<void>(resolve => setImmediate(resolve));
  const submit = () => nodes(render(MobileLeaveApplication).find(node => node.props.className === 'cf-mobile-primary-footer')).find(node => node.type === 'button')!;
  await submit().props.onClick(); assert.ok(leaveErrors.at(-1)?.includes('原因')); assert.equal(leaveCalls.length, 0);
  render(MobileLeaveApplication).find(node => node.type === 'textarea')!.props.onChange({ target: { value: '正常事由' } });
  render(MobileLeaveApplication).find(node => node.props.id === 'mobile-leave-end')!.props.onChange({ target: { value: '2020-01-01' } });
  await submit().props.onClick(); assert.ok(leaveErrors.at(-1)?.includes('早于')); assert.equal(leaveCalls.length, 0);
  eligibility = { loading: false, canStartSelfService: false, restrictionMessage: '当前员工不能发起' };
  assert.equal(submit().props.disabled, true); await submit().props.onClick(); assert.equal(leaveCalls.length, 0);
  assert.ok(render(MobileLeaveApplication).filter(node => node.props.id?.startsWith('mobile-leave-')).every(node => node.props.disabled));
  eligibility = { loading: false, canStartSelfService: true, restrictionMessage: '' };
});
await check('公告分页可达后续记录，未读筛选取消应用及重置', async () => {
  reset(); storeState.reset(); fetchImpl = async () => rows; await storeState.fetchAnnouncements(true);
  render(AnnouncementPage); await new Promise<void>(resolve => setImmediate(resolve));
  let tree = render(AnnouncementPage); assert.equal(tree.filter(node => nameOf(node) === 'AnnouncementListItem').length, 20);
  named(tree, 'Pagination').props.onPageChange(2); tree = render(AnnouncementPage); assert.equal(tree.filter(node => nameOf(node) === 'AnnouncementListItem').length, 5);
  labelled(tree, '筛选公告').props.onClick(); render(AnnouncementPage).find(node => node.type === 'input')!.props.onChange({ target: { checked: true } });
  named(render(AnnouncementPage), 'MobileFilterDrawer').props.onClose(); assert.equal(named(render(AnnouncementPage), 'Pagination').props.total, 25);
  labelled(render(AnnouncementPage), '筛选公告').props.onClick(); render(AnnouncementPage).find(node => node.type === 'input')!.props.onChange({ target: { checked: true } }); named(render(AnnouncementPage), 'MobileFilterDrawer').props.onApply();
  tree = render(AnnouncementPage); assert.equal(named(tree, 'Pagination').props.page, 1); assert.equal(named(tree, 'Pagination').props.total, 12);
  labelled(tree, '筛选公告').props.onClick(); named(render(AnnouncementPage), 'MobileFilterDrawer').props.onReset(); named(render(AnnouncementPage), 'MobileFilterDrawer').props.onApply();
  assert.equal(named(render(AnnouncementPage), 'Pagination').props.total, 25);
  button(render(AnnouncementPage), '全部已读').props.onClick(); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(storeState.announcements.filter((item: any) => !item.isRead).length, 0);
  breakpoint = 'desktop'; assert.equal(named(render(AnnouncementPage), 'MobileFilterDrawer'), undefined);
});
await check('身份边界登录退出和会话失效立即重置公告', async () => {
  let finishInfo!: (value: any) => void; let finishLogout!: () => void;
  dependencies['@/services/api/auth'] = { getInfo: () => new Promise(resolve => { finishInfo = resolve; }), logout: () => new Promise<void>(resolve => { finishLogout = resolve; }) };
  dependencies['@/utils/authStorage'] = authStorage;
  dependencies['@/utils/sessionCleanup'] = { clearAuthSession: () => { authStorage.removeAuthToken(); authStorage.clearCurrentUserSnapshot(); } };
  dependencies['@/utils/mobileSnapshots'] = { clearMobileSnapshots: () => {}, readLastMobileSnapshots: () => null };
  dependencies['@/hooks/useOffline'] = { useNetworkStatus: () => true };
  dependencies['@/lib/queryClient'] = { clearBackendMenuQueries: () => {}, getBackendMenuQueryKey: () => [], queryClient: { cancelQueries: async () => {}, invalidateQueries: async () => {} } };
  dependencies['@/utils/logger'] = { logger: { warn: () => {}, error: () => {} } };
  dependencies['@/utils/tenantStorage'] = { tenantStorage: { purgeOther: () => {} } };
  const AuthProvider = load('../src/context/AuthContext.tsx').AuthProvider;
  reset(); let tree = render(AuthProvider); const auth = () => tree[0].props.value;
  storeState.announcements = [rows[0]]; storeState.currentPopup = rows[0];
  let finishFetch!: (value: any[]) => void; fetchImpl = () => new Promise(resolve => { finishFetch = resolve; });
  const old = storeState.fetchAnnouncements(true); const loggingIn = auth().login('test-token');
  assert.equal(storeState.announcements.length, 0); assert.equal(storeState.currentPopup, null);
  finishFetch(rows); await old; assert.equal(storeState.announcements.length, 0);
  finishInfo({ userId: '9', tenantId: '3', userName: '另一用户', permissions: ['oa:announcement:list'] }); await loggingIn;
  tree = render(AuthProvider); assert.equal(auth().user.id, '9');
  storeState.announcements = [rows[0]]; const loggingOut = auth().logout();
  assert.equal(storeState.announcements.length, 0); finishLogout(); await loggingOut;
  tree = render(AuthProvider); assert.equal(auth().user, null);
  storeState.announcements = [rows[0]]; browserEvents.get('cloudflow:auth-expired')!();
  assert.equal(storeState.announcements.length, 0); fetchImpl = async () => rows;
});
let overtimeLoader: () => Promise<unknown>;
let overtimeQuerySeen: any;
const overtimeSearch = new URLSearchParams();
dependencies['react-router-dom'].useSearchParams = () => [overtimeSearch, () => {}];
dependencies['@/hooks/useWorkflowRefresh'] = { useWorkflowRefresh: () => {} };
dependencies['@/services/api/hr/hr09Model'] = hr09Model;
dependencies['@/services/api/hr/overtime'] = { hrOvertimeApi: { list: async (value: unknown) => { overtimeQuerySeen = value; return { rows: [], total: 30 }; } } };
dependencies['./Hr09Shared'] = { ...Object.fromEntries(['Hr09Blockers', 'Hr09ErrorNotice', 'Hr09FormDialog', 'Hr09Input', 'Hr09ListLayout', 'Hr09Notice', 'Hr09Page', 'Hr09Segments', 'Hr09Select', 'Hr09State', 'Hr09Status', 'Hr09Table', 'Hr09Textarea', 'Hr09Value'].map(name => [name, component(name)])),
  asOptions: (values: Record<string, string>) => Object.entries(values).map(([value, label]) => ({ value, label })),
  overtimeStatuses: { DRAFT: '草稿', SUBMITTED: '已提交' }, settlementStatuses: { PENDING: '待结算' }, settleModes: { PAY: '加班费', COMPENSATORY: '调休' },
  dateTimeText: (value: string) => value, minutesText: (value: number) => value,
  useHr09Resource: (loader: () => Promise<unknown>, deps: unknown[], enabled = true) => { if (deps.length === 2) overtimeLoader = loader; return { data: deps.length === 2 ? { rows: [], total: 30 } : undefined, loading: false, refresh: () => {} }; },
  useHr09Mutation: () => ({ busy: false, run: async (run: () => Promise<unknown>) => run() }),
};
const { HrOvertimeWorkspace } = load('../src/pages/hr/components/HrOvertimeWorkspace.tsx');
const overtimeTree = (mine = true) => render(HrOvertimeWorkspace, { mine });
await check('加班筛选取消、应用、重置与返回首页', async () => {
  reset(); breakpoint = 'mobile'; allowed.add('hr:overtime:apply');
  named(overtimeTree(), 'Hr09ListLayout').props.onPageChange(3);
  labelled(overtimeTree(), '筛选加班申请').props.onClick();
  labelled(overtimeTree(), '申请状态').props.onChange('DRAFT');
  named(overtimeTree(), 'MobileFilterDrawer').props.onClose(); overtimeTree(); await overtimeLoader();
  assert.equal(overtimeQuerySeen.status, undefined); assert.equal(overtimeQuerySeen.pageNum, 3);
  labelled(overtimeTree(), '筛选加班申请').props.onClick();
  assert.equal(labelled(overtimeTree(), '申请状态').props.value, '');
  labelled(overtimeTree(), '申请状态').props.onChange('SUBMITTED');
  named(overtimeTree(), 'MobileFilterDrawer').props.onApply(); overtimeTree(); await overtimeLoader();
  assert.equal(overtimeQuerySeen.status, 'SUBMITTED'); assert.equal(overtimeQuerySeen.pageNum, 1);
  assert.equal(named(overtimeTree(), 'MobileFilterDrawer').props.open, false);
  labelled(overtimeTree(), '筛选加班申请').props.onClick(); named(overtimeTree(), 'MobileFilterDrawer').props.onReset();
  overtimeTree(); await overtimeLoader(); assert.equal(overtimeQuerySeen.status, 'SUBMITTED');
  named(overtimeTree(), 'MobileFilterDrawer').props.onApply(); overtimeTree(); await overtimeLoader(); assert.equal(overtimeQuerySeen.status, undefined);
});
await check('加班日期倒置保留抽屉及原查询，修正后正常应用', async () => {
  reset(); labelled(overtimeTree(), '筛选加班申请').props.onClick();
  labelled(overtimeTree(), '加班日起').props.onChange({ target: { value: '2026-10-18' } });
  labelled(overtimeTree(), '加班日止').props.onChange({ target: { value: '2026-10-17' } });
  named(overtimeTree(), 'MobileFilterDrawer').props.onApply();
  assert.equal(named(overtimeTree(), 'MobileFilterDrawer').props.open, true);
  assert.ok(overtimeTree().some(node => nameOf(node) === 'Hr09ErrorNotice' && node.props.error?.message.includes('早于')));
  overtimeTree(); await overtimeLoader(); assert.equal(overtimeQuerySeen.workDateFrom, undefined);
  labelled(overtimeTree(), '加班日止').props.onChange({ target: { value: '2026-10-19' } });
  named(overtimeTree(), 'MobileFilterDrawer').props.onApply(); overtimeTree(); await overtimeLoader();
  assert.equal(overtimeQuerySeen.workDateFrom, '2026-10-18'); assert.equal(overtimeQuerySeen.workDateTo, '2026-10-19');
});
await check('加班固定登记复用正式草稿入口并遵守本人权限', () => {
  reset(); allowed.add('hr:overtime:apply');
  const footer = overtimeTree().find(node => node.props.className === 'cf-mobile-primary-footer')!;
  assert.ok(button(nodes(footer), '登记加班').props.className.includes('min-h-11'));
  labelled(overtimeTree(), '筛选加班申请').props.onClick(); assert.equal(overtimeTree().find(node => node.props.className === 'cf-mobile-primary-footer'), undefined);
  named(overtimeTree(), 'MobileFilterDrawer').props.onClose(); button(overtimeTree(), '登记加班').props.onClick();
  assert.ok(named(overtimeTree(), 'HrOvertimeDraftDialog'));
  assert.equal(overtimeTree().find(node => node.props.className === 'cf-mobile-primary-footer'), undefined);
  named(overtimeTree(), 'HrOvertimeDraftDialog').props.onClose();
  named(overtimeTree(), 'Hr09Table').props.columns.find((value: any) => value.key === 'actions').render({ requestId: '123' }).props.onClick();
  assert.equal(overtimeTree().find(node => node.props.className === 'cf-mobile-primary-footer'), undefined);
  named(overtimeTree(), 'BaseDialog').props.onClose(); allowed.delete('hr:overtime:apply'); assert.equal(button(overtimeTree(), '登记加班'), undefined);
  allowed.add('hr:overtime:apply'); assert.equal(button(overtimeTree(false), '登记加班'), undefined);
});
await check('加班桌面查询和新增保持可用，切回桌面关闭抽屉', async () => {
  reset(); labelled(overtimeTree(), '筛选加班申请').props.onClick(); breakpoint = 'desktop';
  assert.equal(named(overtimeTree(), 'MobileFilterDrawer'), undefined);
  labelled(overtimeTree(), '申请状态').props.onChange('DRAFT');
  overtimeTree().find(node => node.type === 'form')!.props.onSubmit({ preventDefault: () => {} }); overtimeTree(); await overtimeLoader();
  assert.equal(overtimeQuerySeen.status, 'DRAFT'); button(overtimeTree(), '登记加班').props.onClick(); assert.ok(named(overtimeTree(), 'HrOvertimeDraftDialog'));
  named(overtimeTree(), 'HrOvertimeDraftDialog').props.onClose(); breakpoint = 'mobile'; assert.equal(named(overtimeTree(), 'MobileFilterDrawer').props.open, false);
});
console.log(`MOBILE_BUSINESS_BASIC: checks=${checks}; failed=0; production-pages-and-store=true; mocked-hooks-and-api=true; browser=false; artifacts=none`);
