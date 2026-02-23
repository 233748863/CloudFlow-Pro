import React, { useMemo, useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  LogOut, Bell, ShieldCheck, ChevronRight, GitMerge
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { getRouters, MenuItem as ApiMenuItem } from '../services/api/menu';
import { getIcon } from '../utils/iconMapper';
import { getMyAnnouncements } from '../services/api/announcement';
import { TenantSwitcher } from '../components/TenantSwitcher';

// 菜单结构类型定义
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

  // 从后端动态加载菜单
  useEffect(() => {
    const loadMenus = async () => {
      try {
        const menus = await getRouters();
        // 转换后端菜单数据为前端格式
        const convertedMenus = convertApiMenusToMenuTree(menus);
        setMenuTree(convertedMenus);
      } catch (error) {
        console.error('加载菜单失败:', error);
        // 如果加载失败，使用空菜单
        setMenuTree([]);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadMenus();
    }
  }, [user]);

  // 加载未读公告数量
  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        const announcements = await getMyAnnouncements();
        const unread = Array.isArray(announcements) 
          ? announcements.filter(a => !a.isRead).length 
          : 0;
        setUnreadCount(unread);
      } catch (error) {
        console.error('加载未读公告数量失败:', error);
        setUnreadCount(0);
      }
    };

    if (user) {
      loadUnreadCount();
      // 每分钟刷新一次未读数量
      const interval = setInterval(loadUnreadCount, 60000);
      
      // 监听公告已读事件
      const handleAnnouncementRead = () => {
        loadUnreadCount();
      };
      window.addEventListener('announcementRead', handleAnnouncementRead);
      
      return () => {
        clearInterval(interval);
        window.removeEventListener('announcementRead', handleAnnouncementRead);
      };
    }
  }, [user]);

  // 将后端菜单数据转换为前端菜单树结构
  const convertApiMenusToMenuTree = (apiMenus: ApiMenuItem[]): MenuItem[] => {
    return apiMenus
      .filter(menu => menu.menuType === 'M' && menu.visible === '0')
      .map(group => ({
        id: group.path,
        label: group.menuName,
        icon: getIcon(group.icon),
        children: group.children
          ?.filter(child => child.menuType === 'C' && child.visible === '0')
          .map(child => ({
            id: child.path,
            label: child.menuName,
            icon: getIcon(child.icon),
            path: child.path,
          })) || [],
      }));
  };

  // 自动展开包含当前路由的分组
  useMemo(() => {
    for (const group of menuTree) {
      if (group.children) {
        const match = group.children.find(child => {
          if (child.path === '/') return location.pathname === '/';
          return child.path && location.pathname.startsWith(child.path);
        });
        if (match && !expandedGroups.includes(group.id)) {
          setExpandedGroups(prev => [...prev, group.id]);
        }
      }
    }
  }, [location.pathname, menuTree]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const isActive = (path?: string) => {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname === path;
  };

  // 查找当前活动菜单的标签（用于面包屑）
  const activeLabel = useMemo(() => {
    for (const group of menuTree) {
      if (group.children) {
        const child = group.children.find(c => isActive(c.path));
        if (child) return { group: group.label, item: child.label };
      }
    }
    return { group: '工作台', item: '仪表盘' };
  }, [location.pathname, menuTree]);

  if (!user) return null;
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 animate-pulse">
          <GitMerge size={24} className="text-white" />
        </div>
        <div className="text-slate-500 font-medium text-sm animate-pulse">正在加载系统资源...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-[Inter]">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 fixed h-full z-20 flex flex-col transition-all">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-100">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-indigo-200 shadow-lg">
            <GitMerge size={18} />
          </div>
          <span className="font-bold text-slate-800 text-lg tracking-tight">CloudFlow</span>
        </div>
        
        {/* User Profile Mini */}
        <div className="px-6 py-4 border-b border-slate-50">
           <div className="flex items-center gap-3">
              <img src={user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.name} className="w-10 h-10 rounded-full border border-slate-200 object-cover" alt={user.name} />
              <div>
                 <div className="text-sm font-bold text-slate-800">{user.name}</div>
                 <div className="text-[10px] text-slate-500 uppercase tracking-wider">{user.role}</div>
              </div>
           </div>
        </div>

        {/* Two-level Navigation */}
        <nav className="p-3 flex-1 overflow-y-auto custom-scrollbar">
          {menuTree.map(group => (
            <div key={group.id} className="mb-1">
              {/* Group Header (一级菜单) */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition-all
                  ${expandedGroups.includes(group.id)
                    ? 'text-slate-800 bg-slate-50'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
                `}
              >
                <div className="flex items-center gap-2.5">
                  <group.icon size={17} className={expandedGroups.includes(group.id) ? 'text-indigo-500' : 'text-slate-400'} />
                  <span>{group.label}</span>
                </div>
                <ChevronRight
                  size={14}
                  className={`text-slate-400 transition-transform duration-200 ${
                    expandedGroups.includes(group.id) ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {/* Children (二级菜单) */}
              <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${
                  expandedGroups.includes(group.id) ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="ml-3 pl-3 border-l border-slate-100 mt-0.5 mb-1">
                  {group.children?.map(child => (
                    <button
                      key={child.id}
                      onClick={() => child.path && navigate(child.path)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
                        ${isActive(child.path)
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}
                      `}
                    >
                      <child.icon
                        size={15}
                        className={isActive(child.path) ? 'text-indigo-500' : 'text-slate-400'}
                      />
                      {child.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-100">
           <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-2.5 rounded-lg transition-all">
              <LogOut size={16}/> 退出登录
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-30 bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="text-slate-400">{activeLabel.group}</span>
            <ChevronRight size={14}/>
            <span className="font-bold text-slate-800">
              {activeLabel.item}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5">
               <ShieldCheck size={14} className="text-emerald-500"/>
               <span className="text-xs font-medium text-slate-600">环境: 开发版 (Dev)</span>
            </div>
            <TenantSwitcher />
            <button 
              onClick={() => navigate('/office/announcement')}
              className="relative text-slate-500 hover:text-indigo-600 transition-colors z-50 p-1.5 rounded-full hover:bg-indigo-50"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center font-bold z-50 border-2 border-white shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto relative">
          <div className="h-full animate-fade-in">
             <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
