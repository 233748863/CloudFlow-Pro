import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useSwipeGesture } from '@/hooks/useGestures';
import { ModalOverlay } from './ModalOverlay';

interface SideNavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: 'default' | 'sm';
}

export const SideNavItem = React.forwardRef<HTMLButtonElement, SideNavItemProps>(
  ({ active = false, size = 'default', className, children, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type || 'button'}
      className={cn(
        'cf-side-link',
        'cf-mobile-touch',
        size === 'sm' && 'cf-side-link-sm',
        active && 'cf-side-link-active',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);

SideNavItem.displayName = 'SideNavItem';

export const SideNavDrawer = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => {
  const breakpoint = useBreakpoint();
  const drawerRef = useRef<HTMLDivElement>(null);
  useSwipeGesture(drawerRef, { onSwipeLeft: open ? onClose : undefined });
  if (breakpoint === 'desktop') return <>{children}</>;
  if (!open) return null;
  return (
    <ModalOverlay mobileFullScreen={false} className="cf-side-nav-overlay" zIndex={90} closeOnClickOutside onClose={onClose} aria-label="主导航">
      <div ref={drawerRef} className="cf-side-nav-drawer">
        {children}
        <button type="button" className="cf-side-nav-close cf-mobile-icon-button" aria-label="关闭导航" onClick={onClose}><X size={20} /></button>
      </div>
    </ModalOverlay>
  );
};
