import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { QueryObserver } from '@tanstack/react-query';
import { compile } from '@tailwindcss/node';
import { build } from 'esbuild';
import Pinyin from 'pinyin-match';
import type { MenuItem } from '../src/services/api/menu';
import {
  buildMenuRouteKey, convertApiMenusToMenuTree, findCurrentMenu, flattenMenuItems,
  getMenuSearchIdentity, isMenuSearchComposing, isMenuSearchShortcut, isSafeMenuRoutePath,
  limitMenuSearchKeyword, matchesMenuRoute, menuSearchIdentityKey, MENU_SEARCH_KEYWORD_LIMIT,
  MENU_SEARCH_RESULT_LIMIT, nextMenuSearchIndex, searchMenus, type FlatMenuItem,
} from '../src/utils/menuSearch';
import {
  getMenuHistoryGroups, menuHistoryStorageKey, MENU_FREQUENT_LIMIT, MENU_HISTORY_LIMIT,
  MENU_HISTORY_MAX_AGE, MENU_RECENT_LIMIT, parseMenuHistory, pruneMenuHistory, recordMenuVisit,
} from '../src/utils/menuSearchHistory';
import { backendMenuQueryKey, clearBackendMenuQueries, getBackendMenuQueryKey, queryClient } from '../src/lib/queryClient';
import { getCurrentUserSnapshot, setCurrentUserSnapshot } from '../src/utils/authStorage';
import { clearAuthSession } from '../src/utils/sessionCleanup';
import { tenantStorage } from '../src/utils/tenantStorage';

let checks = 0;
const check = (name: string, operation: () => void) => {
  try { operation(); checks++; } catch (cause) { throw new Error(name, { cause }); }
};
let nextId = 10000;
const menu = (patch: Partial<MenuItem> = {}): MenuItem => ({
  menuId: nextId++, menuName: '功能', parentId: 0, orderNum: 0, path: '/feature',
  menuType: 'C', visible: '0', status: '0', icon: 'FileText', perms: 'system:test:list', ...patch,
});
const flatten = (items: MenuItem[], permissions = ['system:test:list']) => flattenMenuItems(convertApiMenusToMenuTree(items, permissions));
const ids = (items: FlatMenuItem[]) => items.map((item) => item.id);
const now = Date.UTC(2026, 8, 14);

check('确认稿全部上限', () => assert.deepEqual(
  [MENU_SEARCH_KEYWORD_LIMIT, MENU_SEARCH_RESULT_LIMIT, MENU_HISTORY_MAX_AGE, MENU_HISTORY_LIMIT, MENU_RECENT_LIMIT, MENU_FREQUENT_LIMIT],
  [80, 20, 2_592_000_000, 100, 8, 6],
));
check('身份缺失时不启用且保留大整数 ID', () => {
  assert.equal(getMenuSearchIdentity(null), null);
  assert.equal(getMenuSearchIdentity({ id: '1' }), null);
  assert.equal(getMenuSearchIdentity({ id: '', tenantId: 100000 }), null);
  assert.deepEqual(getMenuSearchIdentity({ userId: '9007199254740993', tenantId: '100000' }), { userId: '9007199254740993', tenantId: '100000' });
  assert.notEqual(menuSearchIdentityKey({ tenantId: 'a:b', userId: 'c' }), menuSearchIdentityKey({ tenantId: 'a', userId: 'b:c' }));
});
for (const patch of [{ visible: '1' }, { status: '1' }, { menuType: 'F' }, { perms: 'system:test:private' }]) {
  check(`过滤菜单与祖先 ${JSON.stringify(patch)}`, () => {
    assert.equal(flatten([menu(patch)]).length, 0);
    assert.equal(flatten([menu({ menuType: 'M', children: [menu()], ...patch })]).length, 0);
    assert.equal(flatten([menu({ children: [menu()], ...patch })]).length, 0);
  });
}
check('目录只分组、无权限码菜单及通配权限', () => {
  const tree = [menu({ menuType: 'M', path: '', menuName: '系统', perms: '', children: [menu({ perms: '', menuName: '用户' })] })];
  assert.equal(flatten(tree, [])[0].groupLabel, '系统');
  for (const permission of ['*', '*:*:*']) assert.equal(flatten([menu({ perms: 'system:private:view' })], [permission]).length, 1);
  assert.equal(flatten([menu({ perms: 'system:missing:list, system:test:list' })]).length, 1);
});
check('重复 ID 不生成重复结果，大整数保持字符串', () => {
  const item = menu();
  assert.equal(flatten([item, item]).length, 1);
  const largeId = menu({ menuId: '90071992547409931234' as unknown as number });
  assert.equal(flatten([largeId])[0].id, '90071992547409931234');
});
for (const route of ['', ' ', '#anchor', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,1', 'https://example.test/x', '//example.test/x', '\\example.test/x', '/\\example.test', '/\t/evil', 'java\nscript:alert(1)', '/%2fexample.test', '%252f%252fexample.test', '%6aavascript:alert(1)', '/%5cexample.test', '/%00evil', '/bad%escape', '/safe/../evil', '/%2e%2e/evil', 'mailto:a@example.test']) {
  check(`拒绝危险路径 ${JSON.stringify(route)}`, () => {
    assert.equal(isSafeMenuRoutePath(route), false);
    assert.equal(flatten([menu({ path: route })]).length, 0);
  });
}
check('路由修正不得恢复危险原始路径', () => assert.equal(flatten([menu({ menuId: 502, path: 'javascript:alert(1)' })], ['*:*:*']).length, 0));
check('已有路径、名称修正与查询参数保持', () => {
  const entries = flatten([
    menu({ path: ' job/log?status=RUNNING&next=/a?tab=2 ' }),
    menu({ path: '/system/user?source=inline', query: '?source=explicit&next=https%3A%2F%2Fexample.test' }),
    menu({ menuId: 502, path: '/legacy/vehicle', query: 'tab=all', perms: 'oa:vehicle:list' }),
    menu({ menuId: 400, path: '/workflow', menuName: '旧名称' }),
    menu({ menuId: 404, path: '/workflow/management', menuName: '旧名称' }),
  ], ['*:*:*']);
  assert.equal(entries[0].path, '/job/log');
  assert.equal(buildMenuRouteKey(entries[0].path, entries[0].query), '/job/log?status=RUNNING&next=/a?tab=2 ');
  assert.equal(buildMenuRouteKey(entries[1].path, entries[1].query), '/system/user?source=explicit&next=https%3A%2F%2Fexample.test');
  assert.equal(buildMenuRouteKey(entries[2].path, entries[2].query), '/admin/vehicle/list?tab=all');
  assert.deepEqual(entries.slice(2).map((item) => item.label), ['车辆管理', '创建流程', '流程管理']);
});
check('侧栏匹配、面包屑与直接进入匹配规则回归', () => {
  assert.ok(matchesMenuRoute('/workplace', '', '/dashboard'));
  assert.ok(matchesMenuRoute('/office/crm/customer/21', '?tab=contacts', '/office/crm/customers'));
  assert.equal(matchesMenuRoute('/office/crm/customers', '', '/office/crm'), false);
  assert.equal(matchesMenuRoute('/job/log', '?state=1', '/job/log', 'state=2'), false);
  assert.ok(matchesMenuRoute('/job/log', '?state=1', '/job/log', '?state=1'));
  assert.equal(matchesMenuRoute('/jobber', '', '/job'), false);
  assert.equal(matchesMenuRoute('/workplace', '', '/'), false);
  const entries = flatten([menu({ path: '/job' }), menu({ path: '/job/log' }), menu({ path: '/job/log', query: 'state=1' })]);
  assert.equal(findCurrentMenu(entries, '/job/log', '?state=1')?.id, entries[2].id);
  assert.equal(findCurrentMenu(entries, '/job/log/123', '')?.id, entries[1].id);
});

const searchable = flatten([
  menu({ menuName: '我的申请', path: '/applications?type=pending' }),
  menu({ menuName: '耗材管理', path: '/consumables' }),
  menu({ menuName: 'User Accounts', path: '/system/user' }),
]);
for (const [keyword, expected] of [['申', 0], ['wdsq', 0], ['WoDeShenQing', 0], ['HcGl', 1], ['USER ACCOUNTS', 2], ['TYPE=PENDING', 0], ['/SYSTEM/USER', 2]] as const) {
  check(`中文、英文、拼音或带参数路径 ${keyword}`, () => assert.equal(searchMenus(searchable, keyword, Pinyin.match).items[0]?.id, searchable[expected].id));
}
check('匹配优先级与同级稳定顺序', () => {
  const entries = flatten([
    menu({ menuName: '仅路径', path: '/report' }), menu({ menuName: '旧 Report' }),
    menu({ menuName: 'Report Center' }), menu({ menuName: 'Report' }), menu({ menuName: 'Report Second' }),
  ]);
  assert.deepEqual(ids(searchMenus(entries, 'report').items), [entries[3], entries[2], entries[4], entries[1], entries[0]].map((item) => item.id));
  assert.deepEqual(ids(searchMenus([{ ...entries[3], id: '10', order: 0 }, { ...entries[3], id: '2', order: 0 }], 'report').items), ['2', '10']);
});
check('关键词 80 字符、20 条结果与空态', () => {
  assert.equal(Array.from(limitMenuSearchKeyword('😀'.repeat(81))).length, 80);
  const entries = flatten(Array.from({ length: 25 }, () => menu()));
  assert.equal(searchMenus(entries, '功能').items.length, 20);
  assert.equal(searchMenus(entries, '功能').total, 25);
  assert.equal(searchMenus(entries, '  ').total, 0);
  assert.equal(searchMenus(entries, '不存在').total, 0);
  for (const keyword of ['[', '(', '\\', '.', '*', '?']) assert.doesNotThrow(() => searchMenus(searchable, keyword, Pinyin.match));
});
check('键盘首尾、空列表与组合输入', () => {
  assert.deepEqual([nextMenuSearchIndex(0, 2, -1), nextMenuSearchIndex(1, 2, 1), nextMenuSearchIndex(-1, 2, -1), nextMenuSearchIndex(0, 0, 1)], [1, 0, 1, -1]);
  assert.ok(isMenuSearchComposing({ isComposing: true }, false));
  assert.ok(isMenuSearchComposing({ keyCode: 229 }, false));
  assert.ok(isMenuSearchComposing({}, true));
  const shortcut = { key: 'K', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false };
  assert.ok(isMenuSearchShortcut(shortcut));
  assert.ok(isMenuSearchShortcut({ ...shortcut, ctrlKey: false, metaKey: true }));
  for (const patch of [{ defaultPrevented: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { key: 'j' }]) assert.equal(isMenuSearchShortcut({ ...shortcut, ...patch }), false);
});

check('损坏历史、到期边界、未来时间及字段裁剪', () => {
  for (const stored of [null, '{', 'null', '{}', '1']) assert.deepEqual(parseMenuHistory(stored, now), []);
  assert.deepEqual(pruneMenuHistory([
    { menuId: '1', visitedAt: now - MENU_HISTORY_MAX_AGE }, { menuId: '2', visitedAt: now - MENU_HISTORY_MAX_AGE + 1, query: 'secret' },
    { menuId: '3', visitedAt: now + 1 }, { menuId: 4, visitedAt: now }, null, { menuId: '5', visitedAt: 'today' },
  ], now), [{ menuId: '2', visitedAt: now - MENU_HISTORY_MAX_AGE + 1 }]);
});
check('只保留最近 100 次有效访问', () => {
  let history = [];
  for (let index = 0; index < 101; index++) history = recordMenuVisit(history, String(index), now + index);
  assert.equal(history.length, 100);
  assert.equal(history[0].menuId, '100');
  assert.equal(history.at(-1)?.menuId, '1');
  assert.deepEqual(Object.keys(history[0]).sort(), ['menuId', 'visitedAt']);
});
check('最近 8 个去重、常用 6 个、频次与时间排序及撤权', () => {
  const entries = flatten(Array.from({ length: 12 }, () => menu()));
  const visits = entries.map((item, index) => ({ menuId: item.id, visitedAt: now - index }));
  visits.push({ menuId: entries[10].id, visitedAt: now - 20 }, { menuId: entries[11].id, visitedAt: now - 21 });
  const groups = getMenuHistoryGroups(visits, entries, now);
  assert.deepEqual(ids(groups.recent), ids(entries.slice(0, 8)));
  assert.deepEqual(ids(groups.frequent), ids([entries[10], entries[11], ...entries.slice(0, 4)]));
  assert.deepEqual(ids(getMenuHistoryGroups(visits, entries.slice(0, 1), now).frequent), [entries[0].id]);
  assert.equal(getMenuHistoryGroups(visits, [], now).recent.length, 0);
});

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storageEntries = new Map<string, string>();
const storage = {
  getItem: (key: string) => storageEntries.get(key) ?? null,
  setItem: (key: string, value: string) => { storageEntries.set(key, value); },
  removeItem: (key: string) => { storageEntries.delete(key); },
  key: (index: number) => [...storageEntries.keys()][index] ?? null,
  get length() { return storageEntries.size; },
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity } });
try {
  const firstKey = getBackendMenuQueryKey('100000', '1');
  const secondKey = getBackendMenuQueryKey('100000', '2');
  const otherTenantKey = getBackendMenuQueryKey('100001', '1');
  setCurrentUserSnapshot({ id: '1', tenantId: '100000' });
  queryClient.setQueryData(firstKey, [menu({ menuName: '账号一' })]);
  setCurrentUserSnapshot({ id: '2', tenantId: '100000' });
  check('同租户五分钟缓存不跨账号或租户复用', () => {
    assert.equal(queryClient.getQueryData(secondKey), undefined);
    assert.equal(queryClient.getQueryData(otherTenantKey), undefined);
    assert.ok(queryClient.getQueryData(firstKey));
    assert.deepEqual(firstKey.slice(0, 2), backendMenuQueryKey);
  });
  queryClient.setQueryData(secondKey, []);
  await queryClient.invalidateQueries({ queryKey: secondKey, exact: true, refetchType: 'none' });
  check('权限刷新只使当前身份键失效', () => {
    assert.equal(queryClient.getQueryState(secondKey)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(firstKey)?.isInvalidated, false);
  });
  await queryClient.invalidateQueries({ queryKey: backendMenuQueryKey, refetchType: 'none' });
  check('原菜单失效前缀仍可用', () => assert.equal(queryClient.getQueryState(firstKey)?.isInvalidated, true));
  clearBackendMenuQueries();
  let calls = 0;
  let complete: (value: MenuItem[]) => void = () => undefined;
  const options = { queryKey: secondKey, queryFn: () => { calls++; return new Promise<MenuItem[]>((resolveQuery) => { complete = resolveQuery; }); } };
  const firstObserver = new QueryObserver(queryClient, options);
  const secondObserver = new QueryObserver(queryClient, options);
  const unsubscribeFirst = firstObserver.subscribe(() => undefined);
  const unsubscribeSecond = secondObserver.subscribe(() => undefined);
  complete([]);
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  check('主布局与另一个菜单消费者共享一次请求', () => assert.equal(calls, 1));
  unsubscribeFirst();
  unsubscribeSecond();
  clearBackendMenuQueries();
  let signal: AbortSignal | undefined;
  let finishLate: (value: MenuItem[]) => void = () => undefined;
  const pending = queryClient.fetchQuery({ queryKey: firstKey, queryFn: (context) => {
    signal = context.signal;
    return new Promise<MenuItem[]>((resolveQuery) => { finishLate = resolveQuery; });
  } }).catch(() => undefined);
  check('历史存储桶包含租户和用户，旧桶遵从原清理策略', () => {
    setCurrentUserSnapshot({ id: '1', tenantId: '100000' });
    tenantStorage.set(menuHistoryStorageKey('1'), 'first');
    tenantStorage.set(menuHistoryStorageKey('2'), 'second');
    setCurrentUserSnapshot({ id: '1', tenantId: '100001' });
    assert.equal(tenantStorage.get(menuHistoryStorageKey('1')), null);
    tenantStorage.set(menuHistoryStorageKey('1'), 'other');
    tenantStorage.purgeOther('100001');
    assert.equal(storageEntries.has('t100000:menu-search:v1:user:1'), false);
    assert.equal(tenantStorage.get(menuHistoryStorageKey('1')), 'other');
  });
  storage.setItem('cloudflow_device_id', 'keep');
  queryClient.setQueryData(['unrelated-test'], 'keep');
  clearAuthSession();
  finishLate([menu({ menuName: '旧身份延迟返回' })]);
  await pending;
  check('退出取消旧请求、移除菜单缓存并保留其他查询', () => {
    assert.equal(signal?.aborted, true);
    assert.equal(queryClient.getQueryData(firstKey), undefined);
    assert.equal(getCurrentUserSnapshot(), null);
    assert.equal([...storageEntries.keys()].filter((key) => /^t[^:]+:/.test(key)).length, 0);
    assert.equal(storageEntries.get('cloudflow_device_id'), 'keep');
    assert.ok(queryClient.getQueryCache().getAll().some((query) => query.queryKey[0] === 'unrelated-test'));
  });
  check('存储不可读写仍可搜索', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('denied'); } });
    assert.equal(tenantStorage.get('history'), null);
    assert.doesNotThrow(() => tenantStorage.set('history', '[]'));
    assert.equal(searchMenus(searchable, '申').total, 1);
  });
} finally {
  queryClient.clear();
  setCurrentUserSnapshot(null);
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const componentPath = join(frontendRoot, 'src/components/menu-search/MenuSearch.tsx');
const production = await build({
  entryPoints: [componentPath], absWorkingDir: frontendRoot, bundle: true, write: false, minify: true,
  format: 'esm', platform: 'browser', splitting: true, metafile: true, outdir: 'menu-search-check',
});
const pinyinChunk = Object.entries(production.metafile!.outputs).find(([, output]) => Object.keys(output.inputs).some((input) => input.includes('node_modules/pinyin-match/')));
check('拼音独立懒载，业务搜索复用统一请求客户端', () => {
  assert.ok(pinyinChunk);
  assert.ok(Object.values(production.metafile!.outputs).some((output) => output.imports.some((entry) => entry.kind === 'dynamic-import' && entry.path === pinyinChunk![0])));
  assert.ok(Object.keys(production.metafile!.inputs).some((input) => input.endsWith('services/api/businessSearch.ts')));
  assert.ok(Object.keys(production.metafile!.inputs).some((input) => input.endsWith('services/api/request.ts')));
});
const pinyinBytes = production.outputFiles!.find((output) => basename(output.path) === basename(pinyinChunk![0]))!.contents;
console.log(`纯函数、身份缓存及产物检查通过：${checks} 项；拼音独立压缩产物 ${pinyinBytes.length} 字节，gzip ${gzipSync(pinyinBytes).length} 字节（内存构建，不写 dist）。`);

const browserSource = `
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MenuSearch } from './src/components/menu-search/MenuSearch';
import { useMenuSearchHistory } from './src/hooks/useMenuSearchHistory';
import { setCurrentUserSnapshot } from './src/utils/authStorage';
const menus = ${JSON.stringify(searchable)};
const opened = [];
let retryCount = 0;
let browserChecks = 0;
let networkCalls = 0;
window.fetch = async () => { networkCalls++; throw new Error('禁止搜索网络请求'); };
XMLHttpRequest.prototype.open = function () { networkCalls++; throw new Error('禁止搜索网络请求'); };
const verify = (condition, label) => { if (!condition) throw new Error(label); browserChecks++; };
const settle = () => new Promise((done) => setTimeout(done, 40));
const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 100; attempt++) { if (predicate()) return; await settle(); }
  throw new Error('等待界面条件超时，已通过 ' + browserChecks + ' 项；焦点 ' + document.activeElement?.outerHTML.slice(0, 180));
};
const root = createRoot(document.getElementById('root'));
const historyRoot = createRoot(document.getElementById('history-root'));
const renderSearch = ({ componentKey = 'user-1', ...props } = {}) => flushSync(() => root.render(
  <StrictMode><MenuSearch key={componentKey} items={menus} recent={menus.slice(0, 2)} frequent={menus.slice(0, 1)} enabled loading={false} failed={false}
    onNavigate={(id) => { opened.push(id); return true; }} onRetry={() => { retryCount++; }} {...props} /></StrictMode>
));
const trigger = () => document.querySelector('button[aria-haspopup="dialog"]');
const input = () => document.querySelector('input[role="combobox"]');
const key = (value, options = {}, target = document.activeElement) => {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options });
  flushSync(() => (target || window).dispatchEvent(event));
  return event;
};
let automaticFocusChecked = false;
const openSearch = async () => {
  trigger().focus(); trigger().click();
  await waitFor(() => input());
  if (!automaticFocusChecked) {
    await waitFor(() => document.activeElement === input());
    automaticFocusChecked = true;
  } else input().focus();
};
const setInput = async (value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input(), value);
  flushSync(() => input().dispatchEvent(new Event('input', { bubbles: true })));
  await settle();
};
let historyGroups;
const HistoryProbe = (props) => { historyGroups = useMenuSearchHistory(props.identity, props.items, props.ready, props.location); return null; };
const identity = { tenantId: '100000', userId: '1' };
let historyProps = { identity, items: menus, ready: false, location: { key: 'first', pathname: '/applications', search: '?type=pending' } };
const renderHistory = async (patch = {}) => {
  historyProps = { ...historyProps, ...patch };
  flushSync(() => historyRoot.render(<StrictMode><HistoryProbe {...historyProps} /></StrictMode>));
  await settle();
};
const historyKey = (userId = '1', tenantId = '100000') => 't' + tenantId + ':menu-search:v1:user:' + userId;
const readHistory = (userId = '1', tenantId = '100000') => JSON.parse(localStorage.getItem(historyKey(userId, tenantId)) || '[]');
const run = async () => {
  localStorage.clear();
  renderSearch();
  await settle();
  verify(!input(), '搜索面板默认关闭');
  await openSearch();
  verify(document.activeElement === input(), '打开后输入框聚焦');
  const triggerBox = trigger().getBoundingClientRect();
  verify(triggerBox.width >= 44 && triggerBox.height >= 44, '入口触控尺寸至少 44×44，实际 ' + triggerBox.width + '×' + triggerBox.height);
  const panel = document.querySelector('.cf-dialog-panel');
  verify(panel.getBoundingClientRect().width <= innerWidth, '面板适应当前宽度');
  verify(document.documentElement.scrollWidth <= innerWidth, '页面不产生水平溢出');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  verify(reduced ? getComputedStyle(panel).animationName === 'none' : getComputedStyle(panel).animationDuration === '0.15s', '150 毫秒淡入及减少动画');
  const light = getComputedStyle(panel).backgroundColor;
  document.documentElement.classList.add('dark');
  await new Promise((done) => setTimeout(done, 250));
  verify(getComputedStyle(panel).backgroundColor !== light, '浅色与深色主题均应用现有面板颜色');
  document.documentElement.classList.remove('dark');
  verify(document.querySelectorAll('[role="listbox"] [role="option"]').length === 3, '空输入显示最近和常用');
  key('ArrowDown'); await settle();
  verify(document.querySelector('[role="option"][aria-selected="true"]').textContent.includes(menus[1].label), '向下移动选项');
  key('Enter'); await settle();
  verify(opened.at(-1) === menus[1].id && !input(), '回车打开当前选项并关闭');
  verify(document.activeElement === trigger(), '关闭后返回入口焦点');
  const outside = document.getElementById('outside');
  outside.focus(); key('k', { ctrlKey: true });
  await waitFor(() => input()); input().focus();
  key('Escape'); await settle();
  verify(!input() && document.activeElement === outside, 'Ctrl+K 和 Esc 返回原焦点');
  key('K', { metaKey: true });
  await waitFor(() => input()); input().focus();
  key('Escape'); await settle();
  verify(!input(), 'Command+K 可打开');
  for (const target of [document.getElementById('editor'), document.getElementById('outside-input')]) {
    target.focus(); key('k', { ctrlKey: true }); await settle();
    verify(!input(), '编辑器或输入框占用快捷键时不抢夺');
  }
  outside.focus();
  const consumed = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
  consumed.preventDefault(); outside.dispatchEvent(consumed); await settle();
  verify(!input(), '尊重已经被处理的快捷键');
  await openSearch();
  const openedBeforeIme = opened.length;
  const selectedBeforeIme = input().getAttribute('aria-activedescendant');
  input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  key('ArrowDown'); key('Enter'); key('Escape'); await settle();
  verify(Boolean(input()) && opened.length === openedBeforeIme && input().getAttribute('aria-activedescendant') === selectedBeforeIme, '中文组合输入不移动、跳转或关闭');
  input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '申' }));
  key('Enter', { keyCode: 229 }); await settle();
  verify(opened.length === openedBeforeIme, '兼容输入法 229 键码');
  await waitFor(() => !document.body.textContent.includes('正在准备拼音匹配'));
  await setInput('WDSQ');
  verify(document.querySelectorAll('[role="option"]').length === 1 && document.querySelector('[role="option"]').textContent.includes('我的申请'), '浏览器真实拼音懒载后匹配');
  await setInput('TYPE=PENDING');
  verify(document.querySelectorAll('[role="option"]').length === 1, '带查询参数路径可搜索');
  await setInput('没有此功能');
  key('Enter'); await settle();
  verify(opened.length === openedBeforeIme && document.querySelector('[role="status"]').textContent.includes('未找到'), '无结果不导航且播报空态');
  await setInput('申'.repeat(81));
  verify(Array.from(input().value).length === 80, '浏览器输入上限 80');
  await setInput('');
  const closeButton = document.querySelector('button[aria-label="关闭搜索"]');
  closeButton.focus(); key('Tab', { shiftKey: true });
  verify(document.activeElement === input(), 'Shift+Tab 从首项约束到末项');
  key('Tab');
  verify(document.activeElement === closeButton, 'Tab 从末项约束到首项');
  input().focus();
  const touchOption = document.querySelector('[role="option"]');
  touchOption.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
  touchOption.click(); await settle();
  verify(opened.at(-1) === menus[0].id && !input(), '触控选项可导航');
  await openSearch();
  renderSearch({ failed: true, items: [] }); await settle();
  verify(document.querySelectorAll('[role="option"]').length === 0 && document.querySelector('[role="status"]').textContent.includes('加载失败'), '失败清空旧结果，不回退静态菜单');
  [...document.querySelectorAll('button')].find((button) => button.textContent === '重新加载菜单').click();
  verify(retryCount === 1, '失败重试使用已有回调');
  renderSearch({ loading: true, items: [] }); await settle();
  verify(document.querySelector('[role="status"]').textContent.includes('正在加载'), '独立加载态');
  renderSearch({ items: [], recent: [], frequent: [] }); await settle();
  verify(document.querySelector('[role="status"]').textContent.includes('暂无可用菜单'), '独立无菜单态');
  renderSearch(); await settle(); await setInput('私密关键词');
  renderSearch({ componentKey: 'user-2' }); await settle();
  verify(!input(), '身份变化关闭面板');
  await openSearch();
  verify(input().value === '', '身份变化清除关键词');
  flushSync(() => window.dispatchEvent(new Event('cloudflow:auth-expired'))); await settle();
  verify(!input(), '鉴权失效关闭面板');
  verify(networkCalls === 0, '打开及输入没有搜索 HTTP 请求');
  setCurrentUserSnapshot({ id: '1', tenantId: '100000' });
  await renderHistory();
  verify(readHistory().length === 0, '菜单未就绪不记访问');
  await renderHistory({ ready: true });
  verify(readHistory().length === 1 && readHistory()[0].menuId === menus[0].id, '直接进入匹配页面记录一次');
  await renderHistory(); await renderHistory({ items: [...menus] });
  verify(readHistory().length === 1, '重复渲染和菜单重建不重复计数');
  await renderHistory({ location: { key: 'second', pathname: '/consumables', search: '' } });
  verify(readHistory().length === 2 && readHistory()[0].menuId === menus[1].id, '侧栏和搜索共用页面访问入口');
  await renderHistory({ location: { key: 'unknown', pathname: '/not-a-menu', search: '' } });
  await renderHistory({ location: { key: 'second', pathname: '/consumables', search: '' } });
  verify(readHistory().length === 3, '经无匹配页面返回仍记录一次');
  await renderHistory({ items: [menus[0]] });
  verify(historyGroups.recent.every((item) => item.id === menus[0].id), '撤权立即移除历史菜单');
  setCurrentUserSnapshot({ id: '2', tenantId: '100000' });
  await renderHistory({ identity: { tenantId: '100000', userId: '2' }, items: menus });
  verify(readHistory('2').length === 1 && historyGroups.recent.length === 1 && historyGroups.recent[0].id === menus[1].id, '同租户切账号历史不串用');
  setCurrentUserSnapshot({ id: '2', tenantId: '100001' });
  await renderHistory({ identity: { tenantId: '100001', userId: '2' } });
  verify(readHistory('2', '100001').length === 1, '跨租户历史独立');
  localStorage.removeItem(historyKey('2', '100001'));
  flushSync(() => window.dispatchEvent(new StorageEvent('storage', { key: historyKey('2', '100001') }))); await settle();
  verify(historyGroups.recent.length === 0, '浏览器历史被清空不从旧内存恢复');
  localStorage.setItem(historyKey('2', '100001'), '{');
  flushSync(() => window.dispatchEvent(new StorageEvent('storage', { key: historyKey('2', '100001') }))); await settle();
  verify(historyGroups.recent.length === 0, '损坏存储不影响界面');
  const originalSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function () { throw new DOMException('满额', 'QuotaExceededError'); };
  await renderHistory({ location: { key: 'quota', pathname: '/system/user', search: '' } });
  verify(historyGroups.recent[0]?.id === menus[2].id, '存储满额仍保留当前会话可用历史');
  Storage.prototype.setItem = originalSet;
  setCurrentUserSnapshot(null);
  await renderHistory({ identity: null });
  verify(historyGroups.recent.length === 0, '退出清除组件历史');
  root.unmount(); historyRoot.unmount();
  document.documentElement.dataset.menuSearchResult = 'passed';
  document.getElementById('report').textContent = '浏览器交互通过 ' + browserChecks + ' 项；实际宽度 ' + innerWidth + 'px；减少动画 ' + reduced;
};
run().catch((error) => {
  document.documentElement.dataset.menuSearchResult = 'failed';
  document.getElementById('report').textContent = error.stack || error.message;
});
`;

const browserCache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), 'AppData/Local/ms-playwright');
const cachedBrowsers = existsSync(browserCache) ? (await readdir(browserCache))
  .filter((entry) => /^chromium-\d+$/.test(entry))
  .sort((left, right) => right.localeCompare(left, 'en', { numeric: true }))
  .flatMap((entry) => ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe'].map((executable) => join(browserCache, entry, executable))) : [];
const browserPath = [
  process.env.MENU_SEARCH_BROWSER,
  ...cachedBrowsers,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((candidate): candidate is string => Boolean(candidate) && existsSync(candidate!));
if (!browserPath) {
  console.log('未发现本机 Chromium 浏览器，跳过浏览器交互；可通过 MENU_SEARCH_BROWSER 指定可执行文件。');
} else {
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'cloudflow-menu-search-')));
  try {
    const browserBundle = await build({
      stdin: { contents: browserSource, resolveDir: frontendRoot, sourcefile: 'menu-search-browser.tsx', loader: 'tsx' },
      absWorkingDir: frontendRoot, bundle: true, format: 'iife', platform: 'browser', minify: true,
      outdir: scratch, write: false, metafile: true,
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({ BASE_URL: '/', MODE: 'production', DEV: false, PROD: true }) },
    });
    const styleSources = await Promise.all([
      componentPath, 'src/components/common/BaseDialog.tsx', 'src/components/common/ModalOverlay.tsx',
      'src/components/common/button.tsx', 'src/components/common/input.tsx',
    ].map((source) => readFile(resolve(frontendRoot, source), 'utf8')));
    const styles = await compile(await readFile(join(frontendRoot, 'src/index.css'), 'utf8'), { base: join(frontendRoot, 'src'), onDependency: () => undefined });
    await writeFile(join(scratch, 'suite.css'), styles.build(styleSources.join(' ').split(/[\s"'`]+/)));
    await writeFile(join(scratch, 'suite.html'), `<!doctype html><html><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="suite.css">
      </head><body><button id="outside">外部焦点</button><input id="outside-input"><div id="editor" contenteditable="true">编辑器</div>
      <div id="root"></div><div id="history-root"></div><pre id="report"></pre>
      <script>
        window.addEventListener('error',event=>{document.getElementById('report').textContent=event.message||('资源加载失败：'+(event.target.src||event.target.href));document.documentElement.dataset.menuSearchResult='failed'},true);
        window.addEventListener('unhandledrejection',event=>{document.getElementById('report').textContent=String(event.reason);document.documentElement.dataset.menuSearchResult='failed'});
      </script><script>${browserBundle.outputFiles![0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
    for (const [size, extra] of [['1200,900', ['--force-prefers-reduced-motion=no-preference']], ['390,844', ['--force-prefers-reduced-motion']]] as const) {
      const result = await promisify(execFile)(browserPath, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
        '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
        '--hide-scrollbars', '--dump-dom', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=15000',
        `--window-size=${size}`, `--user-data-dir=${join(scratch, `profile-${size}`)}`, ...extra,
        pathToFileURL(join(scratch, 'suite.html')).href,
      ], { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
      const report = result.stdout.match(/<pre id="report"[^>]*>([\s\S]*?)<\/pre>/)?.[1] || result.stderr || result.stdout.slice(-3000);
      assert.ok(result.stdout.includes('data-menu-search-result="passed"'), `浏览器 ${size}：${report}`);
      console.log(report);
    }
  } finally {
    const target = await realpath(scratch);
    const relativeTarget = relative(await realpath(tmpdir()), target);
    assert.ok(relativeTarget && !relativeTarget.startsWith('..') && !isAbsolute(relativeTarget) && basename(target).startsWith('cloudflow-menu-search-'), '测试清理范围必须在指定临时目录内');
    await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
