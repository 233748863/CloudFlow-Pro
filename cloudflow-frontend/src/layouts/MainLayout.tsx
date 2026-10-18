import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PlatformControlLinks } from '@/components/PlatformControlLinks';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useBackendMenus } from '@/hooks/useBackendMenus';
import { useMenuSearchHistory } from '@/hooks/useMenuSearchHistory';
import { MenuSearch } from '@/components/menu-search/MenuSearch';
import { BUSINESS_SEARCH_META, businessSearchRoute } from '@/utils/businessSearch';
import { getBackendMenuQueryKey, queryClient } from '@/lib/queryClient';
import { getCurrentUserSnapshot } from '@/utils/authStorage';
import type { MenuItem as ApiMenuItem } from '@/services/api/menu';
import { getIcon } from '@/utils/iconMapper';
import { cn } from '@/utils/cn';
import { tenantStorage } from '@/utils/tenantStorage';
import {
  buildMenuRouteKey as buildRouteKey, convertApiMenusToMenuTree, findCurrentMenu, flattenMenuItems,
  matchesMenuRoute as matchesMenuLocation, menuSearchIdentityKey, type MenuTreeItem,
} from '@/utils/menuSearch';
import { SideNavDrawer } from '@/components/common/side-nav';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { MobileTabBar } from '@/components/mobile/MobileTabBar';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useMobileNavigation } from '@/hooks/useMobileNavigation';
import { useSwipeGesture } from '@/hooks/useGestures';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { MobileMenuSearch } from '@/mobile/layouts/MobileMenuSearch';
import { MobileDesktopGuide } from '@/components/mobile/MobileDesktopGuide';

const SIDEBAR_STORAGE_KEY = 'cf-sidebar-collapsed';
const EMPTY_BACKEND_MENUS: ApiMenuItem[] = [];
const EMPTY_PERMISSIONS: string[] = [];

interface MainLayoutProps {
  mobileRoutes?: boolean;
  mobileNotice?: React.ReactNode;
}

function readStoredSidebarState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return tenantStorage.get(SIDEBAR_STORAGE_KEY) === '1';
}

export const MainLayout = ({ mobileRoutes = false, mobileNotice }: MainLayoutProps) => {
  const { user, loading, hasPermission } = useAuth();
  const { resolvedTheme, setThemeMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const navigationEdgeRef = useRef<HTMLDivElement>(null);
  const breakpoint = useBreakpoint();
  const mobileShell = mobileRoutes && breakpoint === 'mobile';
  const mobileTabs = useMobileNavigation(breakpoint === 'mobile', mobileRoutes ? '/messages' : '/message/mine');
  const { isKeyboardVisible } = useKeyboardHeight();

  useWebSocket();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => readStoredSidebarState());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const openNavigation = useCallback(() => setMobileSidebarOpen(true), []);
  useSwipeGesture(navigationEdgeRef, { onSwipeRight: breakpoint !== 'desktop' ? openNavigation : undefined });
  const [languageOpen, setLanguageOpen] = useState(false);
  const [expandedMenuIds, setExpandedMenuIds] = useState<Set<string>>(() => new Set());
  const {
    data: backendMenus = EMPTY_BACKEND_MENUS, isLoading: menuLoading, isError: menuLoadFailed,
    error: menuLoadError, isMenuReady, identity, refetch: refetchMenus,
  } = useBackendMenus(Boolean(user));
  const permissions = user?.permissions || EMPTY_PERMISSIONS;

  const menuTree = useMemo(
    () => convertApiMenusToMenuTree(backendMenus, permissions),
    [backendMenus, permissions],
  );

  const matchesMenuRoute = (path?: string, query?: string) => matchesMenuLocation(location.pathname, location.search, path, query);

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

  // 当前页 = 命中的叶子里 path 最长的那一条，再把它的祖先一并标上。
  // 前缀匹配会让 /job 误伤兄弟节点 /job/log；全标的话两边都会亮，所以只留最长的。
  const activeMenuIds = useMemo(() => {
    const activeIds = new Set<string>();
    type Hit = { id: string; path: string; ancestors: string[] };
    const hits: Hit[] = [];

    const walk = (items: MenuTreeItem[], ancestors: string[]) => {
      items.forEach((item) => {
        if (item.path && matchesMenuRoute(item.path, item.query)) {
          hits.push({ id: item.id, path: item.path, ancestors });
        }
        if (item.children?.length) {
          walk(item.children, [...ancestors, item.id]);
        }
      });
    };

    walk(menuTree, []);

    if (hits.length > 0) {
      hits.sort((left, right) => right.path.length - left.path.length);
      const best = hits[0];
      activeIds.add(best.id);
      best.ancestors.forEach((id) => activeIds.add(id));
    }

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
    if (breakpoint === 'desktop') setMobileSidebarOpen(false);
  }, [breakpoint]);

  const flatItems = useMemo(
    () => flattenMenuItems(menuTree, ''),
    [menuTree],
  );
  const historyGroups = useMenuSearchHistory(identity, flatItems, isMenuReady, location);

  const isActive = (path?: string, query?: string) => matchesMenuRoute(path, query);

  const navigateToMenuId = (menuId: string): boolean => {
    if (!identity || !isMenuReady || getCurrentUserSnapshot() !== user) return false;
    const currentQuery = queryClient.getQueryState<ApiMenuItem[]>(getBackendMenuQueryKey(identity.tenantId, identity.userId));
    if (!currentQuery || currentQuery.status !== 'success' || currentQuery.fetchStatus !== 'idle' || currentQuery.isInvalidated) return false;
    const currentItem = flattenMenuItems(convertApiMenusToMenuTree(currentQuery.data || EMPTY_BACKEND_MENUS, permissions))
      .find((item) => item.id === menuId);
    if (!currentItem) return false;
    const target = buildRouteKey(currentItem.path, currentItem.query);
    if (!target) return false;
    navigate(target);
    setMobileSidebarOpen(false);
    return true;
  };
  const navigateToItem = (item: Pick<MenuTreeItem, 'id'>) => navigateToMenuId(item.id);

  /**
   * 只切换被点中的那一项，不再折叠其他根节点。
   *
   * 原来 depth === 0 时会把其余根节点全部折叠（手风琴）。被折叠的组通常在被点的组
   * 上方，一折叠，下方所有菜单项瞬间上移——headless 实测（1600×900、真实编译后 CSS、
   * 真实 143 项菜单树）被点项自身上移 72~504px，鼠标原位下面换成了完全无关的另一项
   * （点「行政管理」后原位变成「印章台账」，点「系统管理」后变成「在线用户」）。
   * 用户接着点第二下就落到错的项、或落进 2~6px 的行间隙里，表现正是
   * 「点路由菜单没反应，要微调几次位置重复点击才有反馈」。
   *
   * 补偿滚动位置救不了：菜单较短时侧栏 nav 根本不可滚动（实测 scrollHeight == clientHeight，
   * 均为 765），位移是实打实的重排而不是滚动偏移。所以只能不折叠。
   */
  const toggleMenuExpanded = (id: string) => {
    setExpandedMenuIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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

    const bestMatch = findCurrentMenu(flatItems, location.pathname, location.search);

    if (bestMatch) {
      return {
        group: bestMatch.groupLabel,
        item: bestMatch.label,
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
      const Icon = getIcon(item.icon);
      const hasChildren = Boolean(item.children?.length);
      const active = activeMenuIds.has(item.id);
      // 当前页祖先第一帧就要展开，不能等 effect 再写回 state，刷新会先闪成全收。
      // 用户手动展开的组仍走 expandedMenuIds；当前组收不掉，和原来 effect 补开的行为一致。
      const expanded = expandedMenuIds.has(item.id) || (hasChildren && active);
      // 累积路径只给 aria-label 和子层递归用，不再挂 data-tooltip：
      // 展开态标签就在文字旁边，悬浮气泡纯冗余；收起态（只剩图标）的提示在下方
      // sidebarCompact 分支里单独挂。
      const title = groupLabel ? `${groupLabel} / ${item.label}` : item.label;
      const paddingLeft = `${0.875 + depth * 0.75}rem`;

      if (hasChildren) {
        return (
          <div key={item.id} className="sidebar-tree-node">
            <button
              type="button"
              aria-label={title}
              aria-expanded={expanded}
              onClick={() => toggleMenuExpanded(item.id)}
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
          aria-label={title}
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
  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-[var(--cf-bg)] px-4 text-cf-muted">
        <div className="card flex items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-900">
            <img src="/icon.svg" alt="CloudFlow Pro" className="h-8 w-8 object-contain" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-cf-title">正在加载工作区资源…</p>
            <p className="text-xs text-cf-subtle">主题、菜单与用户状态同步中</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const menuSearchControl = (
    <MenuSearch
      key={menuSearchIdentityKey(identity)}
      items={flatItems}
      recent={historyGroups.recent}
      frequent={historyGroups.frequent}
      loading={menuLoading}
      failed={menuLoadFailed}
      enabled={Boolean(identity) && (hasPermission('system:auth:router') || hasPermission('system:search:business'))}
      compact={breakpoint === 'mobile'}
      onRetry={() => { void refetchMenus(); }}
      onNavigate={navigateToMenuId}
      businessEnabled={hasPermission('system:search:business')}
      onBusinessNavigate={item => {
        if (!hasPermission('system:search:business') || !BUSINESS_SEARCH_META[item.type].permissions.every(permission => hasPermission(permission))) return false;
        navigate(businessSearchRoute(item.type, item.id));
        return true;
      }}
    />
  );

  return (
    <div className={mobileShell ? 'mobile-app-shell cf-mobile-app-shell bg-[var(--cf-bg)] text-[var(--cf-text)]' : cn('unity-app-shell cf-app-shell', breakpoint === 'mobile' && 'cf-mobile-shell')}>
      {!mobileShell ? <div className="unity-model-cloud" aria-hidden="true" /> : null}
      <SideNavDrawer open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)}>
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
          {menuLoading ? <p role="status" className="px-2 py-3 text-xs text-cf-subtle">正在加载菜单…</p> : menuLoadFailed ? <p role="status" className="px-2 py-3 text-xs text-cf-subtle">菜单加载失败，请通过搜索入口重试。</p> : !menuTree.length ? <p className="px-2 py-3 text-xs text-cf-subtle">暂无可用菜单</p> : sidebarCompact ? (
            <div className="space-y-1">
              {flatItems.map((item) => {
                const active = activeMenuIds.has(item.id);
                const Icon = getIcon(item.icon);
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-tooltip={`${item.groupLabel} / ${item.label}`} aria-label={`${item.groupLabel} / ${item.label}`}
                    onClick={() => navigateToItem(item)}
                    className={cn(
                      'sidebar-link sidebar-link-collapsed cf-side-link h-8 w-8 justify-center gap-0 px-0 transition-all duration-300',
                      active && 'cf-side-link-active',
                    )}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {renderMenuNodes(menuTree, '')}
            </div>
          )}
          <PlatformControlLinks compact={sidebarCompact} onNavigate={() => setMobileSidebarOpen(false)} />
        </nav>

        <div className="sidebar-footer mt-auto border-t border-slate-100 p-3 dark:border-slate-800">
          <div className={cn('space-y-2', sidebarCompact && 'flex flex-col items-center')}>
            <button
              type="button"
              onClick={toggleThemeMode}
              data-tooltip={sidebarCompact ? (resolvedTheme === 'dark' ? '浅色模式' : '深色模式') : undefined} aria-label={sidebarCompact ? (resolvedTheme === 'dark' ? '浅色模式' : '深色模式') : undefined}
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
              data-tooltip={sidebarCompact ? '展开侧栏' : '收起侧栏'} aria-label={sidebarCompact ? '展开侧栏' : '收起侧栏'}
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
      </SideNavDrawer>
      {breakpoint !== 'desktop' ? <div ref={navigationEdgeRef} className="cf-navigation-swipe-edge" aria-hidden="true" /> : null}

      <div
        className={mobileShell ? undefined : cn(
          'cf-app-main',
          'unity-app-main',
          sidebarCompact ? 'lg:ml-[56px]' : 'lg:ml-[210px]',
        )}
      >
        {breakpoint === 'mobile' ? mobileNotice : null}
        {breakpoint === 'mobile' ? (mobileShell ? <MobileMenuSearch onMenu={openNavigation}>{menuSearchControl}<TenantSwitcher /></MobileMenuSearch> : <MobileHeader title={activeLabel.item} subtitle={activeLabel.group} onMenu={openNavigation} actions={<>{menuSearchControl}<TenantSwitcher /></>} />) : <header className="app-header cf-app-header">
          <div className="app-header-inner cf-app-header-inner">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="打开导航"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-cf-surface-1 text-cf-muted transition-colors hover:bg-cf-surface-2 hover:text-cf-title dark:border-slate-800 lg:hidden"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0 lg:hidden">
                <h1 className="truncate text-[15px] font-semibold text-cf-title">
                  {activeLabel.item}
                </h1>
                <p className="mt-0.5 truncate text-xs text-cf-subtle">{activeLabel.group}</p>
              </div>
              <div className="hidden lg:block">
                <h1 className="truncate text-[15px] font-semibold text-cf-title">
                  {activeLabel.item}
                </h1>
                <p className="mt-0.5 text-xs text-cf-subtle">{activeLabel.group}</p>
              </div>
            </div>

            <div className="app-header-actions ml-4 flex shrink-0 items-center gap-2.5 md:gap-3">
              {menuSearchControl}
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
        </header>}

        <main
          ref={mainScrollRef}
          className={mobileShell ? 'cf-mobile-app-content' : 'unity-app-content cf-app-content hide-scrollbar'}
        >
          <div className="min-h-full">
            {mobileShell && <div className="px-3"><PlatformControlLinks /></div>}
            <MobileDesktopGuide><Outlet /></MobileDesktopGuide>
          </div>
        </main>
      </div>

      {breakpoint === 'mobile' ? <MobileTabBar items={mobileTabs} hidden={isKeyboardVisible} /> : null}
      <AnnouncementHub enabled={Boolean(user) && !mobileShell} />
    </div>
  );
};
