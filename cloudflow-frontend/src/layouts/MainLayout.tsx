import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  MoonStar,
  SunMedium,
} from 'lucide-react';
import { AnnouncementHub } from '@/components/common';
import { HeaderAnnouncementBell } from '@/components/header/HeaderAnnouncementBell';
import { HeaderUserMenu } from '@/components/header/HeaderUserMenu';
import { TenantSwitcher } from '@/components/TenantSwitcher';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getRouters, type MenuItem as ApiMenuItem } from '@/services/api/menu';
import { getIcon } from '@/utils/iconMapper';
import { cn } from '@/utils/cn';

interface MenuTreeItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string;
  query?: string;
  children?: MenuTreeItem[];
}

const SIDEBAR_STORAGE_KEY = 'cf-sidebar-collapsed';

function readStoredSidebarState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
}

export const MainLayout = () => {
  const { user, loading } = useAuth();
  const { resolvedTheme, setThemeMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  useWebSocket();

  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [menuTree, setMenuTree] = useState<MenuTreeItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => readStoredSidebarState());

  const convertApiMenusToMenuTree = (apiMenus: ApiMenuItem[]): MenuTreeItem[] =>
    apiMenus
      .filter((menu) => menu.menuType === 'M' && menu.visible === '0')
      .map((group) => ({
        id: group.path,
        label: group.menuName,
        icon: getIcon(group.icon),
        children:
          group.children
            ?.filter((child) => child.menuType === 'C' && child.visible === '0')
            .map((child) => {
              const rawPath = child.path || '';
              const [purePath, inlineQuery] = rawPath.split('?');
              return {
                id: rawPath,
                label: child.menuName,
                icon: getIcon(child.icon),
                path: purePath || rawPath,
                query: child.query || inlineQuery,
              };
            }) || [],
      }));

  const buildRouteKey = (path?: string, query?: string) =>
    path ? `${path}${query ? `?${query}` : ''}` : '';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    const loadMenus = async () => {
      try {
        const menus = await getRouters();
        setMenuTree(convertApiMenusToMenuTree(menus));
      } catch (error) {
        console.error('加载菜单失败:', error);
        setMenuTree([]);
      } finally {
        setMenuLoading(false);
      }
    };

    if (user) {
      void loadMenus();
      return;
    }

    setMenuLoading(false);
  }, [user]);

  useEffect(() => {
    if (sidebarCollapsed) {
      return;
    }

    setExpandedGroups((prev) => {
      for (const group of menuTree) {
        const match = group.children?.find((child) => {
          const childKey = buildRouteKey(child.path, child.query);
          const currentKey = `${location.pathname}${location.search}`;
          if (child.path === '/') {
            return currentKey === '/';
          }
          if (!child.path) {
            return false;
          }
          if (child.query) {
            return currentKey === childKey;
          }
          return location.pathname === child.path || location.pathname.startsWith(`${child.path}/`);
        });

        if (match && !prev.includes(group.id)) {
          return [...prev, group.id];
        }
      }

      return prev;
    });
  }, [location.pathname, menuTree, sidebarCollapsed]);

  useLayoutEffect(() => {
    if (!mainScrollRef.current) {
      return;
    }

    // 路由切换后重置主内容滚动位置，保证 sticky header 下的首屏一致。
    const resetScrollPosition = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    };

    resetScrollPosition();
    let nestedRafId = 0;
    const rafId = window.requestAnimationFrame(() => {
      resetScrollPosition();
      nestedRafId = window.requestAnimationFrame(() => {
        resetScrollPosition();
      });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.cancelAnimationFrame(nestedRafId);
    };
  }, [location.pathname, location.search]);

  const flatItems = useMemo(
    () =>
      menuTree.flatMap((group) =>
        (group.children || []).map((child) => ({
          ...child,
          groupLabel: group.label,
        })),
      ),
    [menuTree],
  );

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

    if (isCrmCustomerWorkspaceRoute && path === '/office/crm/customers') {
      return true;
    }

    if (query) {
      return currentKey === targetKey;
    }

    if (path === '/office/crm') {
      return location.pathname === '/office/crm';
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const isActive = (path?: string, query?: string) => matchesMenuRoute(path, query);

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

    for (const group of menuTree) {
      const child = group.children?.find((item) => isActive(item.path, item.query));
      if (child) {
        return {
          group: group.label,
          item: child.label,
        };
      }
    }

    return {
      group: '工作台',
      item: '仪表盘',
    };
  }, [location.pathname, menuTree]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  const toggleThemeMode = () => {
    setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  if (loading || menuLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.42)]">
          <img src="/icon.svg" alt="CloudFlow Pro" className="h-12 w-12 object-contain" />
        </div>
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium">正在加载工作区资源…</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">主题、菜单与用户状态同步中</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="relative h-screen overflow-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-mesh-gradient dark:opacity-60" />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200/80 bg-white/86 backdrop-blur-xl transition-[width] duration-300 dark:border-slate-800 dark:bg-slate-950/90',
          sidebarCollapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center border-b border-slate-100 px-4 dark:border-slate-800',
            sidebarCollapsed ? 'justify-center' : 'gap-3',
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-[0_0_20px_rgba(20,184,166,0.18)] dark:border-cyan-950/40 dark:bg-slate-900 dark:shadow-[0_0_20px_rgba(6,182,212,0.12)]">
            <img src="/icon.svg" alt="CloudFlow Pro" className="h-8 w-8 object-contain" />
          </div>

          {sidebarCollapsed ? null : (
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-bold tracking-[-0.01em] text-slate-900 dark:text-white">
                CloudFlow Pro
              </span>
            </div>
          )}
        </div>

        <nav className="hide-scrollbar flex-1 overflow-y-auto px-3 py-4">
          {sidebarCollapsed ? (
            <div className="space-y-1">
              {flatItems.map((item) => {
                const active = isActive(item.path, item.query);
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={`${item.groupLabel} / ${item.label}`}
                    onClick={() => item.path && navigate(buildRouteKey(item.path, item.query))}
                    className={cn(
                      'cf-side-link h-10 w-10 justify-center gap-0 px-0',
                      active && 'cf-side-link-active',
                    )}
                  >
                    <item.icon size={18} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {menuTree.map((group) => {
                const expanded = expandedGroups.includes(group.id);
                const groupActive = Boolean(group.children?.some((child) => isActive(child.path, child.query)));
                const parentButtonActive = groupActive && !expanded;

                return (
                  <div key={group.id}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className={cn(
                        'cf-side-link',
                        parentButtonActive && 'cf-side-link-active',
                      )}
                    >
                      <group.icon size={18} className="shrink-0" />
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate">{group.label}</span>
                        <ChevronDown
                          size={16}
                          className={cn(
                            'shrink-0 transition-transform duration-200',
                            expanded ? 'rotate-180' : '',
                          )}
                        />
                      </span>
                    </button>

                    {expanded ? (
                      <div className="ml-4 mt-2 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                        {group.children?.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => child.path && navigate(buildRouteKey(child.path, child.query))}
                            className={cn(
                              'cf-side-link cf-side-link-sm',
                              isActive(child.path, child.query) && 'cf-side-link-active',
                            )}
                          >
                            <child.icon size={16} className="shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </nav>

        <div className="mt-auto border-t border-slate-100 p-3 dark:border-slate-800">
          <div className={cn('space-y-2', sidebarCollapsed && 'flex flex-col items-center')}>
            <button
              type="button"
              onClick={toggleThemeMode}
              title={sidebarCollapsed ? (resolvedTheme === 'dark' ? '浅色模式' : '深色模式') : undefined}
              className={cn(
                'cf-side-link overflow-hidden',
                sidebarCollapsed ? 'h-10 w-10 justify-center gap-0 px-0' : '',
              )}
            >
              {resolvedTheme === 'dark' ? (
                <SunMedium size={18} className="shrink-0 text-amber-500" />
              ) : (
                <MoonStar size={18} className="shrink-0" />
              )}
              {sidebarCollapsed ? null : <span>{resolvedTheme === 'dark' ? '浅色模式' : '深色模式'}</span>}
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
              className={cn(
                'cf-side-link overflow-hidden',
                sidebarCollapsed ? 'h-10 w-10 justify-center gap-0 px-0' : '',
              )}
            >
              {sidebarCollapsed ? <ChevronsRight size={18} className="shrink-0" /> : <ChevronsLeft size={18} className="shrink-0" />}
              {sidebarCollapsed ? null : <span>收起侧栏</span>}
            </button>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          'relative flex h-screen min-h-0 flex-col overflow-hidden transition-[padding] duration-300',
          sidebarCollapsed ? 'pl-[72px]' : 'pl-64',
        )}
      >
        <header className="glass sticky top-0 z-30 border-b border-slate-200/70 dark:border-slate-800/70">
          <div className="flex h-16 items-center justify-between px-4 md:px-6">
            <div className="min-w-0">
              <div className="hidden lg:block">
                <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {activeLabel.item}
                </h1>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{activeLabel.group}</p>
              </div>
            </div>

            <div className="ml-4 flex shrink-0 items-center gap-2.5 md:gap-3">
              <TenantSwitcher />
              <HeaderAnnouncementBell />
              <HeaderUserMenu />
            </div>
          </div>
        </header>

        <main
          ref={mainScrollRef}
          className="hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-6 lg:p-8"
        >
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      <AnnouncementHub enabled={Boolean(user)} />
    </div>
  );
};
