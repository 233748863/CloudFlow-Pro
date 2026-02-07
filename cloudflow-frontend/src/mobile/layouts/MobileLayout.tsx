import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, PlayCircle, MessageSquare, User } from 'lucide-react';

export const MobileLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: '/dashboard', label: '首页', icon: Home },
    { id: '/workplace', label: '工作台', icon: PlayCircle },
    { id: '/announcement', label: '消息', icon: MessageSquare },
    { id: '/profile', label: '我的', icon: User },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-[Inter]">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </div>

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-16 flex items-center justify-around z-50 pb-safe">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.id)}
              className="flex flex-col items-center justify-center w-full h-full"
            >
              <tab.icon
                size={24}
                className={`mb-1 transition-colors ${
                  isActive ? 'text-indigo-600' : 'text-slate-400'
                }`}
              />
              <span
                className={`text-[10px] font-medium ${
                  isActive ? 'text-indigo-600' : 'text-slate-500'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
