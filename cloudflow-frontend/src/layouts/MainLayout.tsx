import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Globe2,
  Menu,
  MoonStar,
  SunMedium,
  Wallet,
} from 'lucide-react';
import { AnnouncementHub } from '@/components/common';
import { HeaderAnnouncementBell } from '@/components/header/HeaderAnnouncementBell';
import { HeaderUserMenu } from '@/components/header/HeaderUserMenu';
import { TenantSwitcher } from '@/components/TenantSwitcher';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useBackendMenus } from '@/hooks/useBackendMenus';
import type { MenuItem as ApiMenuItem } from '@/services/api/menu';
import { getIcon } from '@/utils/iconMapper';
import { cn } from '@/utils/cn';
import { tenantStorage } from '@/utils/tenantStorage';
import { applyKnownMenuRouteFix } from '@/utils/menuRouteFixes';

interface MenuTreeItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string;
  query?: string;
  children?: MenuTreeItem[];
}

interface FlatMenuItem extends MenuTreeItem {
  groupLabel: string;
}

const SIDEBAR_STORAGE_KEY = 'cf-sidebar-collapsed';

function flattenMenuItems(items: MenuTreeItem[], groupLabel: string): FlatMenuItem[] {
  return items.flatMap((item) => {
    const currentGroupLabel = groupLabel || '主导航';
    const childGroupLabel = groupLabel ? `${groupLabel} / ${item.label}` : item.label;
    const current = item.path
      ? [{
          ...item,
          groupLabel: currentGroupLabel,
        }]
      : [];

    const children = item.children?.length
      ? flattenMenuItems(item.children, childGroupLabel)
      : [];

    return [...current, ...children];
  });
}

function readStoredSidebarState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return tenantStorage.get(SIDEBAR_STORAGE_KEY) === '1';
}

export const MainLayout = () => {
  const { user, loading } = useAuth();
  const { resolvedTheme, setThemeMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  useWebSocket();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => readStoredSidebarState());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [expandedMenuIds, setExpandedMenuIds] = useState<Set<string>>(() => new Set());
  const { data: backendMenus = [], isLoading: menuLoading, isError: menuLoadFailed, error: menuLoadError } = useBackendMenus(Boolean(user));

  const convertApiMenusToMenuTree = (apiMenus: ApiMenuItem[]): MenuTreeItem[] => {
    const parseMenuItem = (item: ApiMenuItem): MenuTreeItem => {
      const fixedItem = applyKnownMenuRouteFix(item);
      const rawPath = fixedItem.path || '';
      const [purePath, inlineQuery] = rawPath.split('?');
      
      const children = item.children
        ?.filter((child) => child.visible === '0' && (child.menuType === 'C' || child.menuType === 'M'))
        .map(parseMenuItem) || [];

      return {
        id: String(fixedItem.menuId),
        label: fixedItem.menuName,
        icon: getIcon(fixedItem.icon),
        path: fixedItem.menuType === 'C' ? purePath || rawPath : undefined,
        query: fixedItem.menuType === 'C' ? fixedItem.query || inlineQuery : undefined,
        children,
      };
    };

    return apiMenus
      .filter((menu) => (menu.menuType === 'M' || menu.menuType === 'C') && menu.visible === '0')
      .map(parseMenuItem);
  };

  const menuTree = useMemo(
    () => convertApiMenusToMenuTree(backendMenus),
    [backendMenus],
  );

  const buildRouteKey = (path?: string, query?: string) => {
    if (!path) {
      return '';
    }
    const normalizedQuery = query?.replace(/^\?/, '');
    return `${path}${normalizedQuery ? `?${normalizedQuery}` : ''}`;
  };

  const matchesMenuRoute = (path?: string, query?: string) => {
    if (!path) {
      return false;
    }

    const currentKey = `${location.pathname}${location.search}`;
    const targetKey = buildRouteKey(path, query);
    const isCrmCustomerWorkspaceRoute = location.pathname.startsWith('/office/crm/customer/');

    if (path === '/') {
      return currentKey === '/';
    }

    if (location.pathname === '/workplace' && path === '/dashboard') {
      return true;
    }

    if (isCrmCustomerWorkspaceRoute && path === '/office/crm/customers') {
      return true;
    }

    if (query) {
      return currentKey === targetKey;
    }

    if (path === '/office/crm') {
      return currentKey === '/office/crm';
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    tenantStorage.set(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (menuLoadFailed) {
      console.error('加载菜单失败:', menuLoadError);
    }
  }, [menuLoadFailed, menuLoadError]);

  // 核心优化：预先计算所有当前活动的菜单和分组 ID，以便在渲染时进行 O(1) 的极速高亮和状态匹配，告别递归计算
  const activeMenuIds = useMemo(() => {
    const activeIds = new Set<string>();

    const checkActive = (items: MenuTreeItem[]): boolean => {
      let anyActive = false;
      for (const item of items) {
        let active = false;
        if (item.path && matchesMenuRoute(item.path, item.query)) {
          active = true;
        }
        if (item.children && item.children.length > 0) {
          const childActive = checkActive(item.children);
          if (childActive) {
            active = true;
          }
        }
        if (active) {
          activeIds.add(item.id);
          anyActive = true;
        }
      }
      return anyActive;
    };

    menuTree.forEach((group) => {
      if (group.path && matchesMenuRoute(group.path, group.query)) {
        activeIds.add(group.id);
      }
      const groupActive = checkActive(group.children || []);
      if (groupActive) {
        activeIds.add(group.id);
      }
    });

    return activeIds;
  }, [location.pathname, location.search, menuTree]);

  // 性能优化：将原本阻塞浏览器重绘的 useLayoutEffect 滚动重置，改为非阻塞的异步 useEffect，配合微延迟，防止多次触发强制布局（Layout Thrashing），彻底解决点击延迟
  useEffect(() => {
    if (!mainScrollRef.current) {
      return;
    }

    const resetScrollPosition = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    };

    resetScrollPosition();

    // 针对异步加载和动态高度组件，在下一个宏任务周期执行最终修正
    const timerId = setTimeout(resetScrollPosition, 100);
    return () => clearTimeout(timerId);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof document === 'undefined' || !mobileSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  const flatItems = useMemo(
    () => flattenMenuItems(menuTree, ''),
    [menuTree],
  );

  const isActive = (path?: string, query?: string) => matchesMenuRoute(path, query);

  const navigateToItem = (item: Pick<MenuTreeItem, 'path' | 'query'>) => {
    if (!item.path) {
      return;
    }

    navigate(buildRouteKey(item.path, item.query));
    setMobileSidebarOpen(false);
  };

  const toggleMenuExpanded = (id: string, depth = 0) => {
    setExpandedMenuIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (depth === 0) {
          menuTree.forEach((rootItem) => {
            if (rootItem.id !== id) {
              next.delete(rootItem.id);
            }
          });
        }
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    setExpandedMenuIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      const activeRootId = menuTree.find((item) => activeMenuIds.has(item.id))?.id;

      if (activeRootId) {
        menuTree.forEach((rootItem) => {
          if (rootItem.id !== activeRootId && next.delete(rootItem.id)) {
            changed = true;
          }
        });
      }

      const openActiveParents = (items: MenuTreeItem[]) => {
        items.forEach((item) => {
          if (item.children?.length) {
            if (activeMenuIds.has(item.id) && !next.has(item.id)) {
              next.add(item.id);
              changed = true;
            }
            openActiveParents(item.children);
          }
        });
      };

      openActiveParents(menuTree);
      return changed ? next : prev;
    });
  }, [activeMenuIds, menuTree]);

  const activeLabel = useMemo(() => {
    if (location.pathname === '/profile') {
      return {
        group: '个人中心',
        item: '个人资料',
      };
    }

    if (location.pathname.startsWith('/office/crm/customer/')) {
      return {
        group: '客户经营',
        item: '客户管理',
      };
    }

    const currentKey = `${location.pathname}${location.search}`;
    const bestMatch = flatItems
      .map((item) => {
        if (!item.path || !matchesMenuRoute(item.path, item.query)) {
          return null;
        }

        const targetKey = buildRouteKey(item.path, item.query);
        const score = currentKey === targetKey
          ? 10000 + targetKey.length
          : item.path.length;

        return { item, score };
      })
      .filter((entry): entry is { item: FlatMenuItem; score: number } => Boolean(entry))
      .sort((left, right) => right.score - left.score)[0];

    if (bestMatch) {
      return {
        group: bestMatch.item.groupLabel,
        item: bestMatch.item.label,
      };
    }

    return {
      group: '工作台',
      item: '仪表盘',
    };
  }, [flatItems, location.pathname, location.search]);

  const toggleThemeMode = () => {
    setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const renderMenuNodes = (items: MenuTreeItem[], groupLabel: string, depth = 0): React.ReactNode => (
    items.map((item) => {
      const Icon = item.icon;
      const hasChildren = Boolean(item.children?.length);
      const active = activeMenuIds.has(item.id);
      const expanded = expandedMenuIds.has(item.id);
      const title = groupLabel ? `${groupLabel} / ${item.label}` : item.label;
      const paddingLeft = `${0.875 + depth * 0.75}rem`;

      if (hasChildren) {
        return (
          <div key={item.id} className="sidebar-tree-node">
            <button
              type="button"
              title={title}
              aria-expanded={expanded}
              onClick={() => toggleMenuExpanded(item.id, depth)}
              className={cn(
                'sidebar-link cf-side-link sidebar-tree-toggle',
                active && 'sidebar-parent-active',
              )}
              style={{ paddingLeft }}
            >
              <Icon size={16} className="shrink-0" />
              <span className="sidebar-label">{item.label}</span>
              <ChevronDown
                size={14}
                className={cn('sidebar-chevron ml-auto shrink-0', expanded && 'sidebar-chevron-open')}
              />
            </button>
            {expanded ? (
              <div className="sidebar-submenu">
                {renderMenuNodes(item.children || [], title, depth + 1)}
              </div>
            ) : null}
          </div>
        );
      }

      return (
        <button
          key={item.id}
          type="button"
          title={title}
          onClick={() => navigateToItem(item)}
          className={cn(
            'sidebar-link cf-side-link',
            active && 'cf-side-link-active',
          )}
          style={{ paddingLeft }}
        >
          <Icon size={16} className="shrink-0" />
          <span className="sidebar-label">{item.label}</span>
        </button>
      );
    })
  );

  const sidebarCompact = sidebarCollapsed && !mobileSidebarOpen;
  if (loading || menuLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-[var(--cf-bg)] px-4 text-slate-600 dark:text-slate-300">
        <div className="card flex items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-900">
            <img src="/icon.svg" alt="CloudFlow Pro" className="h-8 w-8 object-contain" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">正在加载工作区资源…</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">主题、菜单与用户状态同步中</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="unity-app-shell cf-app-shell">
      <div className="unity-model-cloud" aria-hidden="true" />
      <aside
        className={cn(
          'sidebar cf-app-sidebar',
          mobileSidebarOpen && 'cf-mobile-sidebar-open',
          sidebarCompact ? 'sidebar-collapsed w-[56px]' : 'w-[210px]',
        )}
      >
        <div
          className={cn(
            'sidebar-header flex h-[50px] items-center border-b border-slate-200 px-3 dark:border-slate-800',
            sidebarCompact ? 'justify-center' : 'gap-2.5',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-900">
            <img src="/icon.svg" alt="CloudFlow Pro" className="h-7 w-7 object-contain" />
          </div>

          {sidebarCompact ? null : (
            <div className="sidebar-brand min-w-0 flex-1">
              <span className="sidebar-brand-title block truncate">
                CloudFlow Pro
              </span>
            </div>
          )}
        </div>

        <nav className="sidebar-nav hide-scrollbar flex-1 overflow-y-auto px-2 py-3">
          {sidebarCompact ? (
            <div className="space-y-1">
              {flatItems.map((item) => {
                const active = activeMenuIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={`${item.groupLabel} / ${item.label}`}
                    onClick={() => navigateToItem(item)}
                    className={cn(
                      'sidebar-link sidebar-link-collapsed cf-side-link h-8 w-8 justify-center gap-0 px-0 transition-all duration-300',
                      active && 'cf-side-link-active',
                    )}
                  >
                    <item.icon size={16} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {renderMenuNodes(menuTree, '')}
            </div>
          )}
        </nav>

        <div className="sidebar-footer mt-auto border-t border-slate-100 p-3 dark:border-slate-800">
          <div className={cn('space-y-2', sidebarCompact && 'flex flex-col items-center')}>
            <button
              type="button"
              onClick={toggleThemeMode}
              title={sidebarCompact ? (resolvedTheme === 'dark' ? '浅色模式' : '深色模式') : undefined}
              className={cn(
                'sidebar-link cf-side-link overflow-hidden',
                sidebarCompact ? 'sidebar-link-collapsed h-8 w-8 justify-center gap-0 px-0' : '',
              )}
            >
              {resolvedTheme === 'dark' ? (
                <SunMedium size={16} className="shrink-0 text-amber-500" />
              ) : (
                <MoonStar size={16} className="shrink-0" />
              )}
              {sidebarCompact ? null : <span>{resolvedTheme === 'dark' ? '浅色模式' : '深色模式'}</span>}
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              title={sidebarCompact ? '展开侧栏' : '收起侧栏'}
              className={cn(
                'sidebar-link cf-side-link overflow-hidden',
                sidebarCompact ? 'sidebar-link-collapsed h-8 w-8 justify-center gap-0 px-0' : '',
              )}
            >
              {sidebarCompact ? <ChevronsRight size={16} className="shrink-0" /> : <ChevronsLeft size={16} className="shrink-0" />}
              {sidebarCompact ? null : <span>收起侧栏</span>}
            </button>
          </div>
        </div>
      </aside>

      <button
        type="button"
        aria-label="关闭导航"
        className={cn(
          'cf-mobile-sidebar-backdrop',
          mobileSidebarOpen && 'cf-mobile-sidebar-backdrop-open',
        )}
        onClick={() => setMobileSidebarOpen(false)}
      />

      <div
        className={cn(
          'cf-app-main',
          'unity-app-main',
          sidebarCompact ? 'lg:ml-[56px]' : 'lg:ml-[210px]',
        )}
      >
        <header className="app-header cf-app-header">
          <div className="app-header-inner cf-app-header-inner">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="打开导航"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-50 lg:hidden"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0 lg:hidden">
                <h1 className="truncate text-[15px] font-semibold text-slate-950 dark:text-slate-100">
                  {activeLabel.item}
                </h1>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{activeLabel.group}</p>
              </div>
              <div className="hidden lg:block">
                <h1 className="truncate text-[15px] font-semibold text-slate-950 dark:text-slate-100">
                  {activeLabel.item}
                </h1>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{activeLabel.group}</p>
              </div>
            </div>

            <div className="app-header-actions ml-4 flex shrink-0 items-center gap-2.5 md:gap-3">
              <TenantSwitcher />
              <HeaderAnnouncementBell />

              <div className="relative hidden sm:block">
                <button
                  className="app-header-action"
                  type="button"
                  aria-expanded={languageOpen}
                  onClick={() => setLanguageOpen((prev) => !prev)}
                >
                  <Globe2 size={16} />
                  <span>中文</span>
                </button>
                {languageOpen ? (
                  <div className="dropdown locale-dropdown right-0 mt-2 w-36">
                    <button className="dropdown-item locale-option is-active" type="button" onClick={() => setLanguageOpen(false)}>
                      <span className="locale-check">✓</span>
                      中文
                    </button>
                    <button className="dropdown-item locale-option" type="button" onClick={() => setLanguageOpen(false)}>
                      <span className="locale-check" />
                      English
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="app-balance-pill">
                <Wallet size={16} />
                <span>企业版</span>
              </div>

              <HeaderUserMenu />
            </div>
          </div>
        </header>

        <main
          ref={mainScrollRef}
          className="unity-app-content cf-app-content hide-scrollbar"
        >
          <div className="min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

      <AnnouncementHub enabled={Boolean(user)} />
    </div>
  );
};
