import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  LogOut,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const getInitials = (name?: string) => {
  const safeName = String(name || '').trim();
  if (!safeName) {
    return 'CF';
  }

  const parts = safeName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return safeName.slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

export const HeaderUserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  const displayName = useMemo(() => user?.name || user?.username || 'CloudFlow', [user]);
  const subtitle = useMemo(
    () => user?.deptName || user?.position || String(user?.role || 'CloudFlow'),
    [user],
  );

  if (!user) {
    return null;
  }

  const avatar = user.avatar;
  const initials = getInitials(displayName);

  const closeDropdown = () => setDropdownOpen(false);

  const handleNavigate = (path: string) => {
    closeDropdown();
    navigate(path);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-xl p-1.5 transition-colors hover:bg-slate-100"
        aria-label="用户菜单"
        aria-expanded={dropdownOpen}
        aria-haspopup="menu"
      >
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-sm font-medium text-white shadow-sm">
          {avatar ? (
            <img src={avatar} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="hidden text-left md:block">
          <div className="text-sm font-medium text-slate-900">{displayName}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
        <ChevronDown size={14} className="hidden text-slate-400 md:block" />
      </button>

      <div
        className={`absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg transition-all duration-150 ${
          dropdownOpen
            ? 'pointer-events-auto scale-100 opacity-100'
            : 'pointer-events-none scale-95 opacity-0'
        }`}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-medium text-slate-900">{displayName}</div>
          <div className="text-xs text-slate-500">{user.email || user.username || '-'}</div>
        </div>

        <div className="py-1">
          <button
            type="button"
            onClick={() => handleNavigate('/profile')}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
          >
            <User size={16} />
            个人资料
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('/office/announcement')}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Bell size={16} />
            公告中心
          </button>
        </div>

        {user.email || user.phone ? (
          <div className="border-t border-slate-100 px-4 py-2.5">
            {user.email ? (
              <div className="flex items-start gap-2 text-xs text-slate-500">
                <Mail size={14} className="mt-0.5 shrink-0" />
                <div>
                  <div>邮箱 Email:</div>
                  <div className="font-medium text-slate-700">{user.email}</div>
                </div>
              </div>
            ) : null}
            {user.phone ? (
              <div className={`flex items-start gap-2 text-xs text-slate-500 ${user.email ? 'mt-2' : ''}`}>
                <Phone size={14} className="mt-0.5 shrink-0" />
                <div>
                  <div>电话 Phone:</div>
                  <div className="font-medium text-slate-700">{user.phone}</div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="border-t border-slate-100 py-1">
          <button
            type="button"
            onClick={async () => {
              closeDropdown();
              await logout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50"
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
};
