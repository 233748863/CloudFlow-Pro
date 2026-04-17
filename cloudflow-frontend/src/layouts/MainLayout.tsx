import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { getRouters, MenuItem as ApiMenuItem } from '../services/api/menu';
import { getIcon } from '../utils/iconMapper';
import { getMyAnnouncements } from '../services/api/announcement';
import { TenantSwitcher } from '../components/TenantSwitcher';
import { HeaderAnnouncementBell } from '../components/header/HeaderAnnouncementBell';
import { HeaderUserMenu } from '../components/header/HeaderUserMenu';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string;
  children?: MenuItem[];
}

export const MainLayout = () => {
  const { user, logout } = useAuth();
  useWebSocket();

  const navigate = useNavigate();
  const location = useLocation();
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [menuTree, setMenuTree] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const convertApiMenusToMenuTree = (apiMenus: ApiMenuItem[]): MenuItem[] => {
    return apiMenus
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
  };

  useEffect(() => {
    const loadMenus = async () => {
      try {
        const menus = await getRouters();
        setMenuTree(convertApiMenusToMenuTree(menus));
      } catch (error) {
        console.error('加载菜单失败:', error);
        setMenuTree([]);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      void loadMenus();
    }
  }, [user]);

  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        const announcements = await getMyAnnouncements();
        const unread = Array.isArray(announcements)
          ? announcements.filter((item) => !item.isRead).length
          : 0;
        setUnreadCount(unread);
      } catch (error) {
        console.error('加载未读公告数量失败:', error);
        setUnreadCount(0);
      }
    };

    if (!user) {
      return;
    }

    void loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 60000);

    const handleAnnouncementRead = () => {
      void loadUnreadCount();
    };

    window.addEventListener('announcementRead', handleAnnouncementRead);

    return () => {
      clearInterval(interval);
      window.removeEventListener('announcementRead', handleAnnouncementRead);
    };
  }, [user]);

  useEffect(() => {
    for (const group of menuTree) {
      const match = group.children?.find((child) => {
        if (child.path === '/') {
          return location.pathname === '/';
        }

        return child.path && location.pathname.startsWith(child.path);
      });

      if (match && !expandedGroups.includes(group.id)) {
        setExpandedGroups((prev) => [...prev, group.id]);
        break;
      }
    }
  }, [expandedGroups, location.pathname, menuTree]);

  useLayoutEffect(() => {
    if (!mainScrollRef.current) {
      return;
    }

    // 路由切换后重置主体滚动位置，避免内容顶到 sticky 头部下面。
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

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

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
        return { group: group.label, item: child.label };
      }
    }

    return { group: '工作台', item: '仪表盘' };
  }, [menuTree, location.pathname]);

  const pageDescription = useMemo(() => {
    if (activeLabel.group && activeLabel.group !== activeLabel.item) {
      return `${activeLabel.group} · CloudFlow Workspace`;
    }

    return 'CloudFlow Workspace';
  }, [activeLabel.group, activeLabel.item]);

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_12px_30px_rgba(20,184,166,0.16)]">
          <img src="/icon.svg" alt="CloudFlow Pro" className="h-10 w-10 object-contain" />
        </div>
        <div className="text-sm font-medium text-gray-500">正在加载系统资源...</div>
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-gray-50 text-gray-900">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(at_40%_20%,rgba(20,184,166,0.12)_0px,transparent_50%),radial-gradient(at_80%_0%,rgba(6,182,212,0.08)_0px,transparent_50%),radial-gradient(at_0%_50%,rgba(20,184,166,0.08)_0px,transparent_50%)]" />

      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-[0_0_20px_rgba(20,184,166,0.18)]">
            <img src="/icon.svg" alt="CloudFlow Pro" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1 whitespace-nowrap">
            <span className="block truncate text-[17px] font-bold tracking-[-0.01em] text-gray-900">
              CloudFlow Pro
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-gray-400">Workspace</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-6">
            {menuTree.map((group) => {
              const expanded = expandedGroups.includes(group.id);
              const groupActive = Boolean(group.children?.some((child) => isActive(child.path)));
              const parentButtonActive = groupActive && !expanded;

              return (
                <div key={group.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`flex w-full items-center gap-3 overflow-hidden rounded-xl py-2.5 pl-[1.0625rem] pr-[0.875rem] text-sm font-medium transition-all duration-200 ${
                      parentButtonActive
                        ? 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <group.icon size={20} className="shrink-0" />
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate">{group.label}</span>
                      <ChevronDown
                        size={16}
                        className={`shrink-0 transition-transform duration-200 ${
                          expanded ? 'rotate-180' : ''
                        }`}
                      />
                    </span>
                  </button>

                  {!expanded ? null : (
                    <div className="mb-1 ml-4 mt-1 border-l border-gray-200 pl-2">
                      {group.children?.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => child.path && navigate(child.path)}
                          className={`mb-0.5 flex w-full items-center gap-3 overflow-hidden rounded-xl py-1.5 pl-[1.0625rem] pr-[0.875rem] text-left text-sm font-medium transition-all duration-200 ${
                            isActive(child.path)
                              ? 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <child.icon size={16} className="shrink-0" />
                          <span className="truncate">{child.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        <div className="mt-auto border-t border-gray-100 p-3">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 overflow-hidden rounded-xl py-2.5 pl-[1.0625rem] pr-[0.875rem] text-sm font-medium text-gray-600 transition-all duration-200 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={20} className="shrink-0" />
            <span className="truncate">退出登录</span>
          </button>
        </div>
      </aside>

      <div className="relative flex h-screen pl-64">
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 shrink-0 border-b border-gray-200/50 bg-white/80 backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between px-4 md:px-6">
              <div className="flex items-center gap-4">
                <div className="hidden lg:block">
                  <h1 className="text-lg font-semibold text-gray-900">{activeLabel.item}</h1>
                  <p className="text-xs text-gray-500">{pageDescription}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 md:gap-3">
                <div className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 xl:flex">
                  <ShieldCheck size={14} className="text-emerald-500" />
                  <span>开发环境</span>
                </div>

                <TenantSwitcher />
                <HeaderAnnouncementBell unreadCount={unreadCount} />
                <HeaderUserMenu />
              </div>
            </div>
          </header>

          <main
            ref={mainScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-pt-20 p-4 md:p-6 lg:p-8"
          >
            <div className="min-h-full animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
