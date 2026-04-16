import React, { useMemo, useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  Bell,
  ShieldCheck,
  ChevronRight,
  GitMerge,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { getRouters, MenuItem as ApiMenuItem } from '../services/api/menu';
import { getIcon } from '../utils/iconMapper';
import { getMyAnnouncements } from '../services/api/announcement';
import { TenantSwitcher } from '../components/TenantSwitcher';

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
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [menuTree, setMenuTree] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

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

    if (user) {
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
    }
  }, [user]);

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
    for (const group of menuTree) {
      const match = group.children?.find((child) => {
        if (child.path === '/') return location.pathname === '/';
        return child.path && location.pathname.startsWith(child.path);
      });

      if (match && !expandedGroups.includes(group.id)) {
        setExpandedGroups((prev) => [...prev, group.id]);
        break;
      }
    }
  }, [expandedGroups, location.pathname, menuTree]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  const isActive = (path?: string) => {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname === path;
  };

  const activeLabel = useMemo(() => {
    for (const group of menuTree) {
      const child = group.children?.find((item) => isActive(item.path));
      if (child) {
        return { group: group.label, item: child.label };
      }
    }

    return { group: '工作台', item: '仪表盘' };
  }, [location.pathname, menuTree]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_18px_34px_rgba(236,72,153,0.24)]">
          <GitMerge size={24} />
        </div>
        <div className="text-sm font-medium text-slate-500">正在加载系统资源...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-4 left-4 z-30 w-72 overflow-hidden rounded-[32px] border border-white/78 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.82))] shadow-[0_24px_60px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-2xl">
        <div className="flex h-full flex-col">
          <div className="relative overflow-hidden border-b border-white/72 px-5 pb-5 pt-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.16),transparent_58%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_52%)]" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_16px_32px_rgba(236,72,153,0.24)]">
                  <GitMerge size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold tracking-tight text-slate-900">CloudFlow Pro</div>
                  <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-pink-500">
                    Unified Workspace
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.7))] p-4 shadow-[0_12px_24px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.72)]">
                <div className="flex items-center gap-3">
                  <img
                    src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
                    className="h-12 w-12 rounded-full border border-white/80 object-cover shadow-[0_10px_20px_rgba(15,23,42,0.06)]"
                    alt={user.name}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{user.name}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{user.role}</div>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-medium text-pink-600 ring-1 ring-pink-100">
                  <Sparkles size={12} />
                  当前菜单由业务权限动态生成
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {menuTree.map((group) => {
              const expanded = expandedGroups.includes(group.id);
              return (
                <div key={group.id} className="mb-2">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className={`flex w-full items-center justify-between rounded-[22px] px-3.5 py-3 text-sm font-medium transition-all ${
                      expanded
                        ? 'bg-[linear-gradient(135deg,rgba(244,114,182,0.14),rgba(255,255,255,0.78))] text-slate-900 shadow-[0_10px_20px_rgba(15,23,42,0.04)]'
                        : 'text-slate-500 hover:bg-white/72 hover:text-slate-800'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${expanded ? 'bg-white text-pink-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)]' : 'bg-white/60 text-slate-400'}`}>
                        <group.icon size={17} />
                      </div>
                      <span className="truncate">{group.label}</span>
                    </div>
                    <ChevronRight
                      size={15}
                      className={`shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-90 text-pink-500' : ''}`}
                    />
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-200 ease-out ${
                      expanded ? 'max-h-[28rem] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="ml-5 mt-2 flex flex-col gap-1 border-l border-white/75 pl-4">
                      {group.children?.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => child.path && navigate(child.path)}
                          className={`flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left text-[13px] font-medium transition-all ${
                            isActive(child.path)
                              ? 'bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_12px_22px_rgba(236,72,153,0.18)]'
                              : 'text-slate-500 hover:bg-white/78 hover:text-slate-800'
                          }`}
                        >
                          <child.icon size={15} className={isActive(child.path) ? 'text-white' : 'text-slate-400'} />
                          <span className="truncate">{child.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="border-t border-white/72 p-4">
            <button
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.72))] px-4 py-3 text-sm font-medium text-slate-600 shadow-[0_10px_18px_rgba(15,23,42,0.04)] transition-all hover:bg-white hover:text-rose-600"
            >
              <LogOut size={16} />
              退出登录
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen pl-[19rem]">
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-4 z-20 px-4 pt-4">
            <div className="overflow-hidden rounded-[28px] border border-white/78 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] px-6 py-4 shadow-[0_20px_46px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.76)] backdrop-blur-2xl">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
                    <Sparkles size={12} />
                    Workspace Navigation
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>{activeLabel.group}</span>
                    <ChevronRight size={14} className="text-slate-300" />
                    <span className="font-semibold text-slate-900">{activeLabel.item}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <div className="hidden items-center gap-2 rounded-full bg-white/78 px-3 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)] md:inline-flex">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    环境: 开发版
                  </div>
                  <TenantSwitcher />
                  <button
                    onClick={() => navigate('/office/announcement')}
                    className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-white/78 text-slate-500 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition-colors hover:bg-white hover:text-pink-600"
                  >
                    <Bell size={18} />
                    {unreadCount > 0 ? (
                      <span className="absolute right-0 top-0 flex h-[18px] min-w-[18px] -translate-y-1/4 translate-x-1/4 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
            <div className="min-h-[calc(100vh-7.5rem)] animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
