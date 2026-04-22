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
            .map((child) => ({
              id: child.path,
              label: child.menuName,
              icon: getIcon(child.icon),
              path: child.path,
            })) || [],
      }));

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
          if (child.path === '/') {
            return location.pathname === '/';
          }

          return child.path && (location.pathname === child.path || location.pathname.startsWith(`${child.path}/`));
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

  const isActive = (path?: string) => {
    if (!path) {
      return false;
    }

    if (path === '/') {
      return location.pathname === '/';
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const activeLabel = useMemo(() => {
    for (const group of menuTree) {
      const child = group.children?.find((item) => isActive(item.path));
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
  }, [menuTree, location.pathname]);

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
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(at_40%_20%,rgba(20,184,166,0.12)_0px,transparent_48%),radial-gradient(at_80%_0%,rgba(6,182,212,0.08)_0px,transparent_50%),radial-gradient(at_0%_55%,rgba(20,184,166,0.08)_0px,transparent_48%)] dark:opacity-50" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(20,184,166,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,0.025)_1px,transparent_1px)] bg-[size:72px_72px] opacity-70 dark:opacity-20" />
      </div>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200/80 bg-white/86 backdrop-blur-xl transition-[width] duration-300 dark:border-slate-800 dark:bg-slate-950/90',
          sidebarCollapsed ? 'w-[88px]' : 'w-72',
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
                const active = isActive(item.path);
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={`${item.groupLabel} / ${item.label}`}
                    onClick={() => item.path && navigate(item.path)}
                    className={cn(
                      'flex h-11 w-full items-center justify-center rounded-xl border transition-colors',
                      active
                        ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200'
                        : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white',
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
                const groupActive = Boolean(group.children?.some((child) => isActive(child.path)));
                const parentButtonActive = groupActive && !expanded;

                return (
                  <div key={group.id}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                        parentButtonActive
                          ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white',
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
                            onClick={() => child.path && navigate(child.path)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-all duration-200',
                              isActive(child.path)
                                ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white',
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
                'flex items-center gap-3 overflow-hidden rounded-xl py-2.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                sidebarCollapsed ? 'w-10 justify-center px-0' : 'w-full pl-[1.0625rem] pr-3.5',
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
                'flex items-center gap-3 overflow-hidden rounded-xl py-2.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                sidebarCollapsed ? 'w-10 justify-center px-0' : 'w-full pl-[1.0625rem] pr-3.5',
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
          sidebarCollapsed ? 'pl-[88px]' : 'pl-72',
        )}
      >
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/72 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78">
          <div className="flex h-16 items-center justify-between px-4 md:px-6">
            <div className="min-w-0">
              <h1 className="hidden truncate text-lg font-semibold text-slate-900 dark:text-slate-100 lg:block">
                {activeLabel.item}
              </h1>
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
