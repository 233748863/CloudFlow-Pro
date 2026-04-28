import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Home, Megaphone, User } from 'lucide-react';

export const MobileLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: '/dashboard', label: '首页', icon: Home },
    { id: '/schedule', label: '日程', icon: CalendarDays },
    { id: '/announcement', label: '公告', icon: Megaphone },
    { id: '/profile', label: '我的', icon: User },
  ];

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <div className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-200 bg-white"
        role="navigation"
        aria-label="主导航"
      >
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.id || (tab.id === '/dashboard' && location.pathname === '/');
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.id)}
              className="flex h-full w-full flex-col items-center justify-center"
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <tab.icon
                size={22}
                className={`mb-1 transition-colors ${isActive ? 'text-cyan-600' : 'text-slate-400'}`}
              />
              <span className={`text-[10px] font-medium ${isActive ? 'text-cyan-600' : 'text-slate-500'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
