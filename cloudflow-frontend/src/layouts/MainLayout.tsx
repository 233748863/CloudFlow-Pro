import React, { useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, GitMerge, FileText, Settings, LogOut, Bell, CheckCircle2, 
  Users, PlayCircle, ShieldCheck, ChevronRight, FormInput, Code, Megaphone,
  Calendar, Monitor, Rocket
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { Role } from '../types';

export const MainLayout = () => {
  const { user, logout } = useAuth();
  useWebSocket(); // Activate Global WebSocket Listener
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = useMemo(() => {
    const base = [
      { id: '/', label: '仪表盘', icon: LayoutDashboard },
      { id: '/schedule', label: '我的日程', icon: Calendar },
      { id: '/meeting-room', label: '会议室', icon: Monitor },
      { id: '/workplace', label: '发起流程', icon: PlayCircle },
      { id: '/announcement', label: '公告中心', icon: Megaphone },
      { id: '/my-apps', label: '我的申请', icon: FileText },
      { id: '/tasks', label: '审批待办', icon: CheckCircle2 },
    ];
    
    if (user && [Role.ADMIN, Role.MANAGER, Role.HR].includes(user.role)) {
       base.push({ id: '/workflow', label: '流程设计', icon: GitMerge });
       base.push({ id: '/workflow/monitor', label: '流程监控', icon: Monitor });
       base.push({ id: '/workflow/deploy', label: '发布管理', icon: Rocket });
       base.push({ id: '/forms', label: '表单设计', icon: FormInput });
       base.push({ id: '/users', label: '组织架构', icon: Users });
    }
    
    if (user?.role === Role.ADMIN) {
       base.push({ id: '/code', label: '源码生成', icon: Code });
       base.push({ id: '/system/users', label: '用户管理', icon: Settings });
       base.push({ id: '/system/roles', label: '角色管理', icon: ShieldCheck });
       base.push({ id: '/system/menus', label: '菜单管理', icon: LayoutDashboard }); // Reusing icon for now
    }

    return base;
  }, [user]);

  if (!user) return null; // Should redirect in ProtectedRoute

  const activeMenu = menuItems.find(item => item.id === location.pathname) || menuItems[0];

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
        <div className="px-6 py-6 border-b border-slate-50">
           <div className="flex items-center gap-3">
              <img src={user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.name} className="w-10 h-10 rounded-full border border-slate-200" alt=""/>
              <div>
                 <div className="text-sm font-bold text-slate-800">{user.name}</div>
                 <div className="text-[10px] text-slate-500 uppercase tracking-wider">{user.role}</div>
              </div>
           </div>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${location.pathname === item.id 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
              `}
            >
              <div className="flex items-center gap-3">
                <item.icon size={18} className={location.pathname === item.id ? 'text-indigo-600' : 'text-slate-400'} />
                {item.label}
              </div>
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-100">
           <button onClick={logout} className="flex items-center gap-2 text-slate-500 hover:text-red-600 text-xs font-medium px-2 transition-colors">
              <LogOut size={14}/> 退出登录
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10 bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="text-slate-400">工作台</span>
            <ChevronRight size={14}/>
            <span className="font-bold text-slate-800">
              {activeMenu?.label}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5">
               <ShieldCheck size={14} className="text-emerald-500"/>
               <span className="text-xs font-medium text-slate-600">环境: 开发版 (Dev)</span>
            </div>
            <button className="relative text-slate-500 hover:text-slate-700">
              <Bell size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto relative">
          <div className="max-w-7xl mx-auto h-full animate-fade-in">
             <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
