import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, PlayCircle, MessageSquare, User } from 'lucide-react';

export const MobileLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: '/', label: '首页', icon: Home },
    { id: '/workplace', label: '工作台', icon: PlayCircle },
    { id: '/announcement', label: '消息', icon: MessageSquare },
    { id: '/profile', label: '我的', icon: User },
  ];

  return (
    <div className="mobile-app-shell flex h-screen flex-col bg-[var(--cf-bg)] font-[Inter] text-[var(--cf-text)]">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </div>

      {/* Bottom Tab Bar */}
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-200 bg-[var(--cf-surface-strong)] pb-safe dark:border-slate-800"
        role="navigation"
        aria-label="主导航"
      >
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.id)}
              className="flex flex-col items-center justify-center w-full h-full"
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              role="tab"
              aria-selected={isActive}
            >
              <tab.icon
                size={24}
                className={`mb-1 transition-colors ${
 isActive ? 'text-[#0d95b5]' : 'text-cf-faint'
 }`}
                aria-hidden="true"
              />
              <span
                className={`text-[10px] font-medium ${
 isActive ? 'text-[#0d95b5]' : 'text-cf-subtle'
 }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
