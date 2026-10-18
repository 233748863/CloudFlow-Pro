import React from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { cn } from '@/utils/cn';

interface MobileHeaderProps {
  title: React.ReactNode;
  titleId?: string;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  onMenu?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

export const MobileHeader = ({ title, titleId, subtitle, onBack, onMenu, actions, className }: MobileHeaderProps) => (
  <header className={cn('cf-mobile-header', className)}>
    {onBack || onMenu ? (
      <button type="button" className="cf-mobile-icon-button" onClick={onBack || onMenu} aria-label={onBack ? '返回' : '打开导航'}>
        {onBack ? <ArrowLeft size={20} /> : <Menu size={20} />}
      </button>
    ) : null}
    <div className="min-w-0 flex-1">
      <h1 id={titleId} className="truncate text-base font-semibold text-cf-title">{title}</h1>
      {subtitle ? <div className="truncate text-xs text-cf-subtle">{subtitle}</div> : null}
    </div>
    {actions ? <div className="cf-mobile-header-actions flex shrink-0 items-center gap-1">{actions}</div> : null}
  </header>
);
