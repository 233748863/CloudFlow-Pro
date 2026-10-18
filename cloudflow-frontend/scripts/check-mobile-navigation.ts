import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as menuSearch from '../src/utils/menuSearch';

let checks = 0;
function check(label: string, body: () => void) { body(); checks++; console.log(`PASS ${label}`); }
const state: unknown[] = [];
let stateIndex = 0;
let breakpoint = 'mobile';
let route = { pathname: '/dashboard', search: '' };
let queryState: any;
let menuReady = true;
let currentUser: unknown;
const effects: Array<{ run: () => void; deps?: unknown[] }> = [];
const gestures: any[] = [];
const navigated: string[] = [];
const user = { id: '7', tenantId: '3', permissions: ['allowed'] };
currentUser = user;
const menus = [
  { menuId: 1, menuName: '已授权', parentId: 0, orderNum: 1, path: '/allowed', menuType: 'C', visible: '0', status: '0', perms: 'allowed', icon: '' },
  { menuId: 2, menuName: '未授权', parentId: 0, orderNum: 2, path: '/blocked', menuType: 'C', visible: '0', status: '0', perms: 'blocked', icon: '' },
];
const readyQuery = () => ({ data: menus, status: 'success', fetchStatus: 'idle', isInvalidated: false });
queryState = readyQuery();
const reactMock = { ...React,
  useState: (initial: any) => {
    const index = stateIndex++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (next: any) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  },
  useMemo: (run: () => unknown) => run(), useCallback: (run: unknown) => run,
  useRef: () => ({ current: null }),
  useEffect: (run: () => void, deps?: unknown[]) => effects.push({ run, deps }),
};
const component = (name: string) => Object.assign(() => null, { displayName: name });
const cn = (...values: unknown[]) => values.filter(Boolean).join(' ');
const dependencies: Record<string, any> = {
  react: { ...reactMock, default: reactMock, __esModule: true },
  'react-router-dom': { Outlet: component('Outlet'), useLocation: () => route, useNavigate: () => (path: string) => navigated.push(path) },
  'lucide-react': new Proxy({}, { get: (_, key) => component(String(key)) }),
  '@/utils/cn': { cn },
  '@/hooks/useBreakpoint': { useBreakpoint: () => breakpoint },
  '@/hooks/useGestures': { useSwipeGesture: (_: unknown, options: unknown) => gestures.push(options) },
  '@/context/AuthContext': { useAuth: () => ({ user, loading: false, hasPermission: (value: string) => user.permissions.includes(value) }) },
  '@/context/ThemeContext': { useTheme: () => ({ resolvedTheme: 'light', setThemeMode: () => {} }) },
  '@/hooks/useWebSocket': { useWebSocket: () => {} },
  '@/hooks/useBackendMenus': { useBackendMenus: () => ({ data: menus, isLoading: false, isError: false, isMenuReady: menuReady, identity: { tenantId: '3', userId: '7' }, refetch: () => {} }) },
  '@/hooks/useMenuSearchHistory': { useMenuSearchHistory: () => ({ recent: [], frequent: [] }) },
  '@/utils/businessSearch': { BUSINESS_SEARCH_META: {}, businessSearchRoute: () => '' },
  '@/lib/queryClient': { getBackendMenuQueryKey: () => ['menus'], queryClient: { getQueryState: () => queryState } },
  '@/utils/authStorage': { getCurrentUserSnapshot: () => currentUser },
  '@/utils/iconMapper': { getIcon: () => component('Icon') },
  '@/utils/tenantStorage': { tenantStorage: { get: () => '1', set: () => {} } },
  '@/utils/menuSearch': menuSearch,
  '@/hooks/useMobileNavigation': { useMobileNavigation: () => [] },
  '@/hooks/useKeyboardHeight': { useKeyboardHeight: () => ({ isKeyboardVisible: false }) },
};
function load(relative: string) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const compiled = { exports: {} as Record<string, any> };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, window: {}, require: (name: string) => dependencies[name] ?? new Proxy({}, { get: (_, key) => component(String(key)) }) });
  return compiled.exports;
}
const { MobileHeader } = load('../src/components/mobile/MobileHeader.tsx');
dependencies['@/components/mobile/MobileHeader'] = { MobileHeader };
const { MobileMenuSearch } = load('../src/mobile/layouts/MobileMenuSearch.tsx');
dependencies['@/mobile/layouts/MobileMenuSearch'] = { MobileMenuSearch };
const { SideNavDrawer } = load('../src/components/common/side-nav.tsx');
dependencies['@/components/common/side-nav'] = { SideNavDrawer };
const { MainLayout } = load('../src/layouts/MainLayout.tsx');
type Element = React.ReactElement<Record<string, any>>;
function nodes(value: React.ReactNode): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}
function render(mobileRoutes = true) { stateIndex = 0; effects.length = 0; gestures.length = 0; return nodes(MainLayout({ mobileRoutes })); }
const findDrawer = (tree: Element[]) => tree.find(node => node.type === SideNavDrawer)!;
const findEdge = (tree: Element[]) => tree.find(node => node.props.className === 'cf-navigation-swipe-edge');
check('手机专用布局包含关闭的导航抽屉和边缘手势', () => {
  const tree = render(); assert.equal(findDrawer(tree).props.open, false); assert.ok(findEdge(tree)); assert.equal(typeof gestures[0].onSwipeRight, 'function');
});
check('真实手机标题按钮打开抽屉且展开菜单文字', () => {
  const header = render().find(node => node.type === MobileMenuSearch)!;
  const buttons = nodes(MobileHeader(MobileMenuSearch(header.props).props));
  buttons.find(node => node.props['aria-label'] === '打开导航')!.props.onClick();
  const tree = render(); assert.equal(findDrawer(tree).props.open, true);
  assert.ok(tree.find(node => node.type === 'aside')!.props.className.includes('cf-mobile-sidebar-open'));
  assert.ok(!tree.find(node => node.type === 'aside')!.props.className.includes('sidebar-collapsed'));
});
check('导航保留权限过滤并在有效选择后关闭', () => {
  const tree = render(); assert.ok(!tree.some(node => node.props['aria-label'] === '未授权'));
  tree.find(node => node.props['aria-label'] === '已授权')!.props.onClick();
  assert.deepEqual(navigated, ['/allowed']); assert.equal(findDrawer(render()).props.open, false);
});
check('边缘手势打开，关闭回调关闭', () => {
  render(); gestures[0].onSwipeRight(); assert.equal(findDrawer(render()).props.open, true);
  findDrawer(render()).props.onClose(); assert.equal(findDrawer(render()).props.open, false);
});
check('真实抽屉提供关闭按钮、遮罩回调及左滑关闭', () => {
  let closes = 0; const onClose = () => closes++;
  const tree = nodes(SideNavDrawer({ open: true, onClose, children: '菜单' }));
  assert.equal(tree[0].props.closeOnClickOutside, true); tree[0].props.onClose();
  tree.find(node => node.props['aria-label'] === '关闭导航')!.props.onClick();
  gestures.at(-1).onSwipeLeft(); assert.equal(closes, 3);
  assert.equal(SideNavDrawer({ open: false, onClose, children: '菜单' }), null);
});
check('切换路由和恢复桌面时关闭抽屉', () => {
  render(); gestures[0].onSwipeRight(); route = { pathname: '/allowed', search: '' }; render();
  effects.filter(effect => effect.deps?.[0] === route.pathname).at(-1)!.run();
  assert.equal(findDrawer(render()).props.open, false);
  gestures[0].onSwipeRight(); breakpoint = 'desktop'; render();
  effects.find(effect => effect.deps?.length === 1 && effect.deps[0] === 'desktop')!.run();
  assert.equal(findDrawer(render()).props.open, false); breakpoint = 'mobile';
});
check('过期、失效或切换账号的菜单不能执行导航', () => {
  const before = navigated.length;
  for (const prepare of [() => { queryState = undefined; }, () => { queryState = { ...readyQuery(), isInvalidated: true }; }, () => { queryState = { ...readyQuery(), fetchStatus: 'fetching' }; }, () => { currentUser = { ...user }; }, () => { menuReady = false; }]) {
    queryState = readyQuery(); currentUser = user; menuReady = true; prepare();
    render(); gestures[0].onSwipeRight();
    render().find(node => node.props['aria-label'] === '已授权')!.props.onClick();
    assert.equal(navigated.length, before);
  }
  queryState = readyQuery(); currentUser = user; menuReady = true;
});
check('窄桌面壳与平板保留导航，桌面保留常驻侧栏', () => {
  assert.ok(findDrawer(render(false))); assert.ok(render(false).find(node => node.type === MobileHeader));
  breakpoint = 'tablet'; let tree = render(); assert.ok(findDrawer(tree)); assert.ok(findEdge(tree));
  breakpoint = 'desktop'; tree = render(); assert.ok(findDrawer(tree)); assert.equal(findEdge(tree), undefined); assert.equal(gestures[0].onSwipeRight, undefined);
  const child = React.createElement('aside'); assert.equal(SideNavDrawer({ open: false, onClose: () => {}, children: child }).props.children, child);
});
console.log(`MOBILE_NAVIGATION_BASIC: checks=${checks}; failed=0; production-components=true; mocked-hooks=true; browser=false; artifacts=none`);
