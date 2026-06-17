import React, { Suspense, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { PageLoading } from '@/components/common/PageLoading';
import { RouteGuard } from '@/components/common/RouteGuard';
import { Result404, Result500 } from '@/components/common/result';
import { useBackendMenus } from '@/hooks/useBackendMenus';
import type { MenuItem } from '@/services/api/menu';

type PageModule = Record<string, unknown> & {
  default?: React.ComponentType;
};

const pageModules = import.meta.glob<PageModule>([
  '../pages/**/*.tsx',
  '!../pages/AuthPage.tsx',
  '!../pages/Login.tsx',
  '!../pages/Register.tsx',
]);
const componentCache = new Map<string, React.LazyExoticComponent<React.ComponentType>>();

const normalizeRoutePath = (path?: string) => {
  const trimmed = (path || '').trim();
  if (!trimmed) {
    return '';
  }
  const [purePath] = trimmed.split('?');
  return purePath.startsWith('/') ? purePath : `/${purePath}`;
};

const normalizeSearch = (search?: string) => {
  const trimmed = (search || '').replace(/^\?/, '').trim();
  if (!trimmed) {
    return '';
  }
  return new URLSearchParams(trimmed).toString();
};

const getMenuSearch = (item: MenuItem) => {
  const rawPath = item.path || '';
  const [, inlineQuery] = rawPath.split('?');
  return normalizeSearch(item.query || inlineQuery);
};

const isVisibleMenuPage = (item: MenuItem) =>
  item.visible === '0'
  && item.status === '0'
  && item.menuType === 'C'
  && Boolean(item.path)
  && Boolean(item.component);

const findMenuByLocation = (
  menus: MenuItem[],
  pathname: string,
  search: string,
): MenuItem | null => {
  const currentSearch = normalizeSearch(search);

  const visit = (items: MenuItem[]): MenuItem | null => {
    for (const item of items) {
      if (isVisibleMenuPage(item)) {
        const targetPath = normalizeRoutePath(item.path);
        const targetSearch = getMenuSearch(item);
        const queryMatches = targetSearch ? currentSearch === targetSearch : true;
        if (targetPath === pathname && queryMatches) {
          return item;
        }
      }

      const childMatch = item.children?.length ? visit(item.children) : null;
      if (childMatch) {
        return childMatch;
      }
    }
    return null;
  };

  return visit(menus);
};

const toPageModuleKey = (component?: string) => {
  const raw = (component || '').trim();
  if (!raw) {
    return '';
  }

  const normalized = raw
    .replace(/\\/g, '/')
    .replace(/^@\//, '')
    .replace(/^src\//, '')
    .replace(/^\.\//, '')
    .replace(/\.(tsx|ts|jsx|js)$/, '');

  if (!normalized.startsWith('pages/')) {
    return '';
  }

  return `../${normalized}.tsx`;
};

const isReactComponent = (value: unknown): value is React.ComponentType =>
  typeof value === 'function'
  || (typeof value === 'object' && value !== null);

const pickComponentExport = (module: PageModule, componentPath: string) => {
  if (isReactComponent(module.default)) {
    return module.default;
  }

  const exportName = componentPath
    .split('/')
    .pop()
    ?.replace(/\.(tsx|ts|jsx|js)$/, '');

  if (exportName && isReactComponent(module[exportName])) {
    return module[exportName] as React.ComponentType;
  }

  const firstComponent = Object.values(module).find(isReactComponent);
  return firstComponent as React.ComponentType | undefined;
};

const resolveLazyPage = (componentPath?: string) => {
  const moduleKey = toPageModuleKey(componentPath);
  if (!moduleKey) {
    return null;
  }

  const loader = pageModules[moduleKey];
  if (!loader) {
    return null;
  }

  if (!componentCache.has(moduleKey)) {
    componentCache.set(
      moduleKey,
      React.lazy(async () => {
        const module = await loader();
        const component = pickComponentExport(module, componentPath || '');
        if (!component) {
          throw new Error(`菜单组件未导出可渲染页面：${componentPath}`);
        }
        return { default: component };
      }),
    );
  }

  return componentCache.get(moduleKey) || null;
};

const parsePermissions = (perms?: string) =>
  (perms || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const DynamicMenuRoute = () => {
  const location = useLocation();
  const { data: menus = [], isLoading, isError, error } = useBackendMenus(true);

  const menu = useMemo(
    () => findMenuByLocation(menus, location.pathname, location.search),
    [location.pathname, location.search, menus],
  );

  if (isLoading) {
    return <PageLoading tip="正在加载菜单路由…" />;
  }

  if (isError) {
    return (
      <Result500
        title="菜单路由加载失败"
        error={error instanceof Error ? error : new Error('无法获取后端菜单配置')}
      />
    );
  }

  if (!menu) {
    return (
      <Result404
        title="菜单路由未配置"
        subTitle="当前地址不在后端菜单配置中"
      />
    );
  }

  const PageComponent = resolveLazyPage(menu.component);
  if (!PageComponent) {
    return (
      <Result404
        title="菜单页面未注册"
        subTitle={`后端组件配置 ${menu.component || '-'} 未匹配到前端页面`}
      />
    );
  }

  return (
    <RouteGuard requiredPermissions={parsePermissions(menu.perms)}>
      <Suspense fallback={<PageLoading tip="正在加载页面…" />}>
        <PageComponent />
      </Suspense>
    </RouteGuard>
  );
};

export default DynamicMenuRoute;
