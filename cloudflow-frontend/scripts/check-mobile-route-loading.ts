import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as React from 'react';
import ts from 'typescript';

type Route = { element?: React.ReactElement<any>; children?: Route[] };
const source = readFileSync(new URL('../src/router.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
function initialize(mobile: boolean) {
  const requested: string[] = [];
  const factories = new Map<unknown, () => Promise<{ default: unknown }>>();
  const component = (name: string) => Object.assign(() => null, { displayName: name });
  const guard = component('RouteGuard');
  const layout = component('MobileLayout');
  let routerCount = 0;
  const reactMock = { ...React, lazy: (factory: () => Promise<{ default: any }>) => { const lazy = React.lazy(factory); factories.set(lazy, factory); return lazy; } };
  const dependencies: Record<string, unknown> = {
    react: { ...reactMock, default: reactMock, __esModule: true },
    'react-router-dom': { createBrowserRouter: (routes: Route[]) => { routerCount++; return routes; }, Navigate: component('Navigate'), Outlet: component('Outlet') },
    '@/utils/device': { isMobileDevice: () => mobile },
    '@/utils/logger': { logger: { log: () => {} } },
    '@/components/common/RouteGuard': { RouteGuard: guard },
    '@/mobile/layouts/MobileLayout': { MobileLayout: layout },
  };
  const compiled = { exports: {} as { router: Route[] } };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: (name: string) => { requested.push(name); return dependencies[name] ?? new Proxy({}, { get: (_, key) => component(String(key)) }); } });
  const entry = [...factories].find(([, factory]) => factory.toString().includes('@/mobile/layouts/MobileLayout'));
  assert.ok(entry, '正式路由必须注册手机布局的延迟加载函数');
  return { routes: compiled.exports.router, requested, factories, lazy: entry[0], load: entry[1], guard, layout, routerCount };
}
function elements(value: unknown): React.ReactElement<any>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!React.isValidElement(value)) return [];
  const element = value as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}
function findLayout(routes: Route[], lazy: unknown, ancestors: Route[] = []): { route: Route; ancestors: Route[] } | undefined {
  for (const route of routes) {
    if (elements(route.element).some(element => element.type === lazy)) return { route, ancestors };
    const found = findLayout(route.children ?? [], lazy, [...ancestors, route]);
    if (found) return found;
  }
  return undefined;
}
const desktop = initialize(false);
assert.equal(desktop.routerCount, 1);
assert.equal(desktop.requested.some(name => name.startsWith('@/mobile/')), false);
assert.equal(findLayout(desktop.routes, desktop.lazy), undefined);
console.log('PASS 桌面初始化不加载手机模块且只创建一个路由实例');
const mobile = initialize(true);
assert.equal(mobile.routerCount, 1);
assert.equal(mobile.requested.some(name => name.startsWith('@/mobile/')), false);
const match = findLayout(mobile.routes, mobile.lazy);
assert.ok(match);
assert.equal(match.route.element?.type, React.Suspense);
assert.ok(React.isValidElement(match.route.element.props.fallback));
assert.ok(match.ancestors.some(route => elements(route.element).some(element => element.type === mobile.guard)));
console.log('PASS 手机父路由保留权限守卫并提供加载等待界面');
const loaded = await mobile.load();
assert.equal(loaded.default, mobile.layout);
assert.equal(mobile.requested.filter(name => name === '@/mobile/layouts/MobileLayout').length, 1);
assert.equal(desktop.requested.some(name => name.startsWith('@/mobile/')), false);
console.log('PASS 触发延迟函数后才加载手机布局且正确映射正式导出');
console.log('MOBILE_ROUTE_LOADING_BASIC: checks=3; failed=0; production-router=true; mocked-router=true; browser=false; artifacts=none');
