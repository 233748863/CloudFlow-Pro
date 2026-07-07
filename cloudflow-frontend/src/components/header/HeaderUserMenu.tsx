import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LogOut, Mail, Phone, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

function getInitials(name?: string, email?: string) {
  const userName = String(name || '').trim();
  if (userName) {
    return userName.slice(0, 2).toUpperCase();
  }

  const localPart = String(email || '').split('@')[0];
  if (localPart) {
    return localPart.slice(0, 2).toUpperCase();
  }

  return 'CF';
}

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

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  const displayName = useMemo(
    () => user?.username || user?.name || user?.email?.split('@')[0] || 'CloudFlow',
    [user],
  );

  const subtitle = useMemo(() => {
    const rawRole = String(user?.role || 'user').trim();
    if (!rawRole) {
      return 'user';
    }

    return rawRole.replace(/^ROLE_/i, '').replace(/_/g, ' ').toLowerCase();
  }, [user]);

  if (!user) {
    return null;
  }

  const avatar = user.avatar;
  const initials = getInitials(user.username || user.name, user.email);

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
        className="app-user-menu-button"
        aria-label="用户菜单"
        aria-expanded={dropdownOpen}
        aria-haspopup="menu"
      >
        <div className="app-avatar">
          {avatar ? (
            <img src={avatar} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="default-avatar default-avatar--xs" role="img" aria-label={`${displayName} avatar`}>
              <span className="default-avatar-glow" aria-hidden="true" />
              <span className="default-avatar-ring" aria-hidden="true" />
              <span className="default-avatar-initials">{initials}</span>
            </div>
          )}
        </div>
        <div className="app-user-meta">
          <div>{displayName}</div>
          <span>{subtitle}</span>
        </div>
        <ChevronDown
          size={14}
          className={`app-user-chevron text-slate-400 transition-transform duration-200 ${
            dropdownOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`dropdown app-user-dropdown transition-all duration-150 ${
          dropdownOpen
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
        }`}
      >
        <div className="app-user-dropdown-head">
          <div>{displayName}</div>
          <span>{user.email || user.username || '-'}</span>
        </div>

        <div className="py-1">
          <button
            type="button"
            onClick={() => handleNavigate('/profile')}
            className="dropdown-item"
          >
            <User size={16} />
            个人资料
          </button>
        </div>

        {user.email || user.phone ? (
          <div className="border-t border-slate-200 px-3 py-2.5 dark:border-slate-800">
            {user.email ? (
              <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Mail size={14} className="mt-0.5 shrink-0" />
                <div>
                  <div>邮箱</div>
                  <div className="font-medium text-slate-700 dark:text-slate-200">{user.email}</div>
                </div>
              </div>
            ) : null}

            {user.phone ? (
              <div
                className={`flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 ${
                  user.email ? 'mt-2' : ''
                }`}
              >
                <Phone size={14} className="mt-0.5 shrink-0" />
                <div>
                  <div>电话</div>
                  <div className="font-medium text-slate-700 dark:text-slate-200">{user.phone}</div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="border-t border-slate-200 py-1 dark:border-slate-800">
          <button
            type="button"
            onClick={async () => {
              closeDropdown();
              await logout();
            }}
            className="dropdown-item text-red-600 dark:text-red-300"
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
};
