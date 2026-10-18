import type { MenuItem as ApiMenuItem } from '../services/api/menu';
import { applyKnownMenuRouteFix, normalizeMenuRoutePath } from './menuRouteFixes';

export const MENU_SEARCH_KEYWORD_LIMIT = 80;
export const MENU_SEARCH_RESULT_LIMIT = 20;

export interface MenuSearchIdentity {
  tenantId: string;
  userId: string;
}

export interface MenuTreeItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  query?: string;
  children: MenuTreeItem[];
}

export interface FlatMenuItem extends MenuTreeItem {
  path: string;
  groupLabel: string;
  order: number;
}

export type PinyinMatcher = (name: string, keyword: string) => false | readonly number[];

export const getMenuSearchIdentity = (user: {
  id?: string | number;
  userId?: string | number;
  tenantId?: string | number | null;
} | null | undefined): MenuSearchIdentity | null => {
  const tenantId = String(user?.tenantId ?? '').trim();
  const userId = String(user?.id ?? user?.userId ?? '').trim();
  return tenantId && userId ? { tenantId, userId } : null;
};

export const menuSearchIdentityKey = (identity: MenuSearchIdentity | null): string =>
  identity ? JSON.stringify([identity.tenantId, identity.userId]) : '';

export const isSafeMenuRoutePath = (path: string | undefined): boolean => {
  if (!path || /[\u0000-\u001f\u007f]/.test(path)) return false;
  let candidate = path.trim().split('?')[0];
  if (!candidate || candidate.startsWith('#')) return false;
  for (;;) {
    if (
      /[\u0000-\u0020\u007f\\]/.test(candidate)
      || candidate.startsWith('//')
      || /^[a-z][a-z\d+.-]*:/i.test(candidate.replace(/^\//, ''))
      || candidate.split('/').some((segment) => segment === '.' || segment === '..')
    ) return false;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return true;
      candidate = decoded;
    } catch {
      return false;
    }
  }
};

const hasMenuPermission = (perms: string | undefined, permissions: ReadonlySet<string>): boolean => {
  if (permissions.has('*') || permissions.has('*:*:*')) return true;
  const required = (perms || '').split(',').map((permission) => permission.trim()).filter(Boolean);
  return !required.length || required.some((permission) => permissions.has(permission));
};

export const convertApiMenusToMenuTree = (apiMenus: ApiMenuItem[], permissions: readonly string[]): MenuTreeItem[] => {
  const grantedPermissions = new Set(permissions);
  const seenIds = new Set<string>();
  const convert = (items: ApiMenuItem[]): MenuTreeItem[] => items.flatMap((item) => {
    if (item.visible !== '0' || item.status !== '0' || !['C', 'M'].includes(item.menuType)) return [];
    const fixedItem = applyKnownMenuRouteFix(item);
    if (!hasMenuPermission(fixedItem.perms, grantedPermissions)) return [];
    if (fixedItem.menuType === 'C' && (!isSafeMenuRoutePath(item.path) || !isSafeMenuRoutePath(fixedItem.path))) return [];
    const id = String(fixedItem.menuId ?? '');
    if (!id || seenIds.has(id)) return [];
    seenIds.add(id);
    const rawPath = fixedItem.path || '';
    const queryStart = rawPath.indexOf('?');
    const inlineQuery = queryStart >= 0 ? rawPath.slice(queryStart + 1) : undefined;
    return [{
      id,
      label: fixedItem.menuName,
      icon: fixedItem.icon,
      path: fixedItem.menuType === 'C' ? normalizeMenuRoutePath(rawPath) : undefined,
      query: fixedItem.menuType === 'C' ? fixedItem.query || inlineQuery : undefined,
      children: convert(item.children || []),
    }];
  });
  return convert(apiMenus);
};

export const flattenMenuItems = (items: MenuTreeItem[], groupLabel = ''): FlatMenuItem[] => {
  const flatItems: FlatMenuItem[] = [];
  const walk = (nodes: MenuTreeItem[], group: string) => {
    nodes.forEach((item) => {
      if (item.path) flatItems.push({ ...item, path: item.path, groupLabel: group || '主导航', order: flatItems.length });
      walk(item.children, group ? `${group} / ${item.label}` : item.label);
    });
  };
  walk(items, groupLabel);
  return flatItems;
};

export const buildMenuRouteKey = (path?: string, query?: string): string => {
  if (!path || !isSafeMenuRoutePath(path)) return '';
  const normalizedQuery = query?.replace(/^\?/, '');
  return `${path}${normalizedQuery ? `?${normalizedQuery}` : ''}`;
};

export const matchesMenuRoute = (pathname: string, search: string, path?: string, query?: string): boolean => {
  if (!path) return false;
  const currentKey = `${pathname}${search}`;
  if (path === '/') return currentKey === '/';
  if (pathname === '/workplace' && path === '/dashboard') return true;
  if (pathname.startsWith('/office/crm/customer/') && path === '/office/crm/customers') return true;
  if (query) return currentKey === buildMenuRouteKey(path, query);
  if (path === '/office/crm') return currentKey === '/office/crm';
  return pathname === path || pathname.startsWith(`${path}/`);
};

export const findCurrentMenu = (items: FlatMenuItem[], pathname: string, search: string): FlatMenuItem | undefined => {
  const currentKey = `${pathname}${search}`;
  return items
    .filter((item) => matchesMenuRoute(pathname, search, item.path, item.query))
    .map((item) => {
      const targetKey = buildMenuRouteKey(item.path, item.query);
      return { item, score: currentKey === targetKey ? 10000 + targetKey.length : item.path.length };
    })
    .sort((left, right) => right.score - left.score || left.item.order - right.item.order)[0]?.item;
};

export const limitMenuSearchKeyword = (keyword: string): string => Array.from(keyword).slice(0, MENU_SEARCH_KEYWORD_LIMIT).join('');

const compareMenuIds = (left: string, right: string): number => {
  if (/^\d+$/.test(left) && /^\d+$/.test(right) && left.length !== right.length) return left.length - right.length;
  return left < right ? -1 : left > right ? 1 : 0;
};

export const searchMenus = (items: FlatMenuItem[], keyword: string, pinyinMatch?: PinyinMatcher | null) => {
  const term = limitMenuSearchKeyword(keyword).trim().toLowerCase();
  if (!term) return { items: [] as FlatMenuItem[], total: 0 };
  const ranked = items.flatMap((item) => {
    const name = item.label.toLowerCase();
    let rank: number;
    if (name === term) rank = 0;
    else if (name.startsWith(term)) rank = 1;
    else if (name.includes(term) || pinyinMatch?.(item.label, term)) rank = 2;
    else if (buildMenuRouteKey(item.path, item.query).toLowerCase().includes(term)) rank = 3;
    else return [];
    return [{ item, rank }];
  });
  ranked.sort((left, right) => left.rank - right.rank || left.item.order - right.item.order || compareMenuIds(left.item.id, right.item.id));
  return { items: ranked.slice(0, MENU_SEARCH_RESULT_LIMIT).map(({ item }) => item), total: ranked.length };
};

export const nextMenuSearchIndex = (current: number, count: number, direction: 1 | -1): number => {
  if (!count) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
};

export const isMenuSearchComposing = (event: { isComposing?: boolean; keyCode?: number }, composing: boolean): boolean =>
  composing || Boolean(event.isComposing) || event.keyCode === 229;

export const isMenuSearchShortcut = (event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  isComposing?: boolean;
  keyCode?: number;
}): boolean => !event.defaultPrevented && !isMenuSearchComposing(event, false)
  && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
