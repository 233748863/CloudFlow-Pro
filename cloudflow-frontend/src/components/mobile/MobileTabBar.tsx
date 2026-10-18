import React from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface MobileTabItem {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
  disabled?: boolean;
}

export const MobileTabBar = ({ items, hidden = false }: { items: MobileTabItem[]; hidden?: boolean }) => (
  <nav className="cf-mobile-tab-bar" aria-label="移动端主导航" hidden={hidden}>
    {items.map((item) => {
      const Icon = item.icon;
      const content = (
        <>
          <span className="relative inline-flex">
            <Icon size={22} aria-hidden="true" />
            {item.badge && item.badge > 0 ? (
              <span className="cf-mobile-tab-badge" aria-label={`${item.badge} 条未处理`}>{item.badge > 99 ? '99+' : item.badge}</span>
            ) : null}
          </span>
          <span>{item.label}</span>
        </>
      );
      return item.disabled ? (
        <span key={item.key} className="cf-mobile-tab opacity-50" aria-disabled="true">{content}</span>
      ) : (
        <NavLink key={item.key} to={item.path} end className={({ isActive }) => cn('cf-mobile-tab', isActive && 'is-active')}>
          {content}
        </NavLink>
      );
    })}
  </nav>
);
