import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useBackendMenus } from '@/hooks/useBackendMenus';
import type { MenuItem as ApiMenuItem } from '@/services/api/menu';
import { getIcon } from '@/utils/iconMapper';
import { cn } from '@/utils/cn';
import { tenantStorage } from '@/utils/tenantStorage';

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

  return tenantStorage.get(SIDEBAR_STORAGE_KEY) === '1';
}

export const MainLayout = () => {
  const { user, loading } = useAuth();
  const { resolvedTheme, setThemeMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  useWebSocket();

  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => readStoredSidebarState());
  const { data: backendMenus = [], isLoading: menuLoading, isError: menuLoadFailed, error: menuLoadError } = useBackendMenus(Boolean(user));

  const convertApiMenusToMenuTree = (apiMenus: ApiMenuItem[]): MenuTreeItem[] => {
    const parseMenuItem = (item: ApiMenuItem): MenuTreeItem => {
      const rawPath = item.path || '';
      const [purePath, inlineQuery] = rawPath.split('?');
      
      const children = item.children
        ?.filter((child) => child.visible === '0' && (child.menuType === 'C' || child.menuType === 'M'))
        .map(parseMenuItem) || [];

      return {
        id: String(item.menuId),
        label: item.menuName,
        icon: getIcon(item.icon),
        path: purePath || rawPath,
        query: item.query || inlineQuery,
        children,
      };
    };

    return apiMenus
      .filter((menu) => menu.menuType === 'M' && menu.visible === '0')
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
      const groupActive = checkActive(group.children || []);
      if (groupActive) {
        activeIds.add(group.id);
      }
    });

    return activeIds;
  }, [location.pathname, location.search, menuTree]);

  useEffect(() => {
    if (sidebarCollapsed) {
      return;
    }

    setExpandedGroups((prev) => {
      let next = [...prev];
      let changed = false;

      activeMenuIds.forEach((id) => {
        if (!next.includes(id)) {
          next.push(id);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [activeMenuIds, sidebarCollapsed]);

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

  const flatItems = useMemo(() => {
    const flatten = (items: MenuTreeItem[], groupLabel: string): any[] => {
      return items.flatMap((item) => {
        if (item.path) {
          return [{
            ...item,
            groupLabel,
          }];
        }
        if (item.children && item.children.length > 0) {
          return flatten(item.children, `${groupLabel} / ${item.label}`);
        }
        return [];
      });
    };
    return menuTree.flatMap((group) => flatten(group.children || [], group.label));
  }, [menuTree]);

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

    const findActiveItem = (items: MenuTreeItem[]): { group: string; item: string } | null => {
      for (const item of items) {
        if (item.path && isActive(item.path, item.query)) {
          return {
            group: '',
            item: item.label,
          };
        }
        if (item.children && item.children.length > 0) {
          const res = findActiveItem(item.children);
          if (res) {
            res.group = item.label;
            return res;
          }
        }
      }
      return null;
    };

    for (const group of menuTree) {
      const res = findActiveItem(group.children || []);
      if (res) {
        return {
          group: res.group || group.label,
          item: res.item,
        };
      }
    }

    return {
      group: '工作台',
      item: '仪表盘',
    };
  }, [location.pathname, location.search, menuTree]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  const toggleThemeMode = () => {
    setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const renderExpandedMenuItems = (items: MenuTreeItem[], depth = 1) => {
    const containerClassName = cn(
      depth === 1
        ? 'ml-4 mt-2 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800'
        : 'ml-3 mt-1 space-y-1 border-l border-slate-100 pl-2 dark:border-slate-800',
    );

    return (
      <div className={containerClassName}>
        {items.map((item) => {
          const hasChildren = Boolean(item.children?.length);
          const expanded = expandedGroups.includes(item.id);
          const active = activeMenuIds.has(item.id);
          const parentActive = hasChildren && active && !expanded;
          const Icon = item.icon;

          const handleItemClick = () => {
            if (item.path) {
              navigate(buildRouteKey(item.path, item.query));
              return;
            }
            if (hasChildren) {
              toggleGroup(item.id);
            }
          };

          return (
            <div key={item.id} className="space-y-1">
              <button
                type="button"
                onClick={handleItemClick}
                className={cn(
                  'cf-side-link cf-side-link-sm relative transition-all duration-300',
                  hasChildren ? '' : 'pl-7',
                  active && !hasChildren && 'cf-side-link-active',
                  parentActive && 'cf-side-link-active',
                )}
              >
                {active && !hasChildren ? (
                  <span className="absolute left-2.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)] animate-pulse" />
                ) : null}
                <Icon size={depth > 1 ? 14 : 16} className="shrink-0" />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{item.label}</span>
                  {hasChildren ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={expanded ? `收起${item.label}` : `展开${item.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleGroup(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleGroup(item.id);
                        }
                      }}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <ChevronDown
                        size={14}
                        className={cn(
                          'transition-transform duration-200',
                          expanded ? 'rotate-180' : '',
                        )}
                      />
                    </span>
                  ) : null}
                </span>
              </button>

              {hasChildren && expanded ? renderExpandedMenuItems(item.children || [], depth + 1) : null}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading || menuLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
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
    <div className="relative h-full overflow-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-mesh-gradient dark:opacity-60" />

      <aside
        className={cn(
          'absolute bottom-4 left-4 top-4 z-50 flex flex-col rounded-2xl border border-slate-200/50 bg-white/70 backdrop-blur-xl shadow-xl transition-[width] duration-300 dark:border-slate-800/40 dark:bg-slate-950/60',
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
                const active = activeMenuIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={`${item.groupLabel} / ${item.label}`}
                    onClick={() => item.path && navigate(buildRouteKey(item.path, item.query))}
                    className={cn(
                      'cf-side-link h-10 w-10 justify-center gap-0 px-0 relative transition-all duration-300',
                      active && 'cf-side-link-active',
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-r bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)]" />
                    )}
                    <item.icon size={18} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {menuTree.map((group) => {
                const expanded = expandedGroups.includes(group.id);
                const groupActive = activeMenuIds.has(group.id);
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

                    {expanded ? renderExpandedMenuItems(group.children || []) : null}
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
          'relative flex h-full min-h-0 flex-col overflow-hidden transition-[padding] duration-300 pr-4',
          sidebarCollapsed ? 'pl-[104px]' : 'pl-[296px]',
        )}
      >
        <header className="sticky top-0 z-30 mt-4 rounded-2xl border border-slate-200/50 bg-white/70 backdrop-blur-md shadow-sm dark:border-slate-800/40 dark:bg-slate-950/60">
          <div className="flex h-14 items-center justify-between px-4 md:px-6">
            <div className="min-w-0">
              <div className="hidden lg:block">
                <h1 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                  {activeLabel.item}
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{activeLabel.group}</p>
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
          className="hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-6 md:p-8 lg:p-10 premium-glass-card rounded-2xl mt-3 mb-4"
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
