import React, { useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, GitMerge, FileText, Settings, LogOut, Bell, CheckCircle2, 
  Users, PlayCircle, ShieldCheck, ChevronRight, ChevronDown, FormInput, Code, Megaphone,
  Calendar, Monitor, Rocket, Briefcase, Building2, Wrench, FolderOpen, Car, 
  ClipboardCheck, Package, FileArchive
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { Role } from '../types';

// Types for menu structure
interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string; // If it's a leaf menu with a route
  children?: MenuItem[];
  roles?: Role[]; // If specified, only these roles can see it
}

export const MainLayout = () => {
  const { user, logout } = useAuth();
  useWebSocket(); // Activate Global WebSocket Listener
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Two-level menu structure
  const menuTree = useMemo(() => {
    const allMenus: MenuItem[] = [
      // ── 工作台 ──
      {
        id: 'workspace',
        label: '工作台',
        icon: LayoutDashboard,
        children: [
          { id: '/', label: '仪表盘', icon: LayoutDashboard, path: '/' },
          { id: '/schedule', label: '我的日程', icon: Calendar, path: '/schedule' },
        ],
      },
      // ── 办公协同 ──
      {
        id: 'office',
        label: '办公协同',
        icon: Briefcase,
        children: [
          { id: '/meeting-room', label: '会议室', icon: Monitor, path: '/meeting-room' },
          { id: '/announcement', label: '公告中心', icon: Megaphone, path: '/announcement' },
          { id: '/admin/attendance/checkin', label: '考勤打卡', icon: ClipboardCheck, path: '/admin/attendance/checkin' },
        ],
      },
      // ── 流程中心 ──
      {
        id: 'process',
        label: '流程中心',
        icon: GitMerge,
        children: [
          { id: '/workplace', label: '发起流程', icon: PlayCircle, path: '/workplace' },
          { id: '/my-apps', label: '我的申请', icon: FileText, path: '/my-apps' },
          { id: '/tasks', label: '审批待办', icon: CheckCircle2, path: '/tasks' },
        ],
      },
      // ── 流程管理 (ADMIN/MANAGER/HR) ──
      {
        id: 'workflow-mgmt',
        label: '流程管理',
        icon: Settings,
        roles: [Role.ADMIN, Role.MANAGER, Role.HR],
        children: [
          { id: '/workflow', label: '流程设计', icon: GitMerge, path: '/workflow' },
          { id: '/workflow/monitor', label: '流程监控', icon: Monitor, path: '/workflow/monitor' },
          { id: '/workflow/deploy', label: '发布管理', icon: Rocket, path: '/workflow/deploy' },
          { id: '/forms', label: '表单设计', icon: FormInput, path: '/forms' },
        ],
      },
      // ── 行政管理 (ADMIN/MANAGER/HR) ──
      {
        id: 'admin-mgmt',
        label: '行政管理',
        icon: Building2,
        roles: [Role.ADMIN, Role.MANAGER, Role.HR],
        children: [
          { id: '/users', label: '组织架构', icon: Users, path: '/users' },
          { id: '/admin/asset', label: '资产管理', icon: Package, path: '/admin/asset' },
          { id: '/admin/vehicle/list', label: '车辆管理', icon: Car, path: '/admin/vehicle/list' },
          { id: '/admin/vehicle/booking', label: '用车申请', icon: Car, path: '/admin/vehicle/booking' },
          { id: '/admin/vehicle/usage', label: '用车记录', icon: Car, path: '/admin/vehicle/usage' },
          { id: '/admin/attendance/rule', label: '考勤规则', icon: ClipboardCheck, path: '/admin/attendance/rule' },
        ],
      },
      // ── 系统管理 (ADMIN only) ──
      {
        id: 'system',
        label: '系统管理',
        icon: Wrench,
        roles: [Role.ADMIN],
        children: [
          { id: '/system/users', label: '用户管理', icon: Users, path: '/system/users' },
          { id: '/system/roles', label: '角色管理', icon: ShieldCheck, path: '/system/roles' },
          { id: '/system/menus', label: '菜单管理', icon: LayoutDashboard, path: '/system/menus' },
          { id: '/system/files', label: '文件管理', icon: FileArchive, path: '/system/files' },
          { id: '/code', label: '源码生成', icon: Code, path: '/code' },
        ],
      },
    ];

    // Filter by role
    return allMenus.filter(group => {
      if (!group.roles) return true;
      return user && group.roles.includes(user.role);
    });
  }, [user]);

  // Auto-expand the group that contains the current route
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

  // Find active menu label for breadcrumb
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
              <img src={user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.name} className="w-10 h-10 rounded-full border border-slate-200" alt=""/>
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
           <button onClick={logout} className="flex items-center gap-2 text-slate-500 hover:text-red-600 text-xs font-medium px-2 transition-colors">
              <LogOut size={14}/> 退出登录
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10 bg-white/80 backdrop-blur-md">
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
