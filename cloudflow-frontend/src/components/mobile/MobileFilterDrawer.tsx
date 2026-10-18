import React, { useId } from 'react';
import { X } from 'lucide-react';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { Button } from '@/components/common/button';
import { MobileHeader } from './MobileHeader';

interface MobileFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  onApply: () => void;
  onReset?: () => void;
  busy?: boolean;
}

export const MobileFilterDrawer = ({ open, onClose, title = '筛选', children, onApply, onReset, busy = false }: MobileFilterDrawerProps) => {
  const titleId = useId();
  if (!open) return null;
  return (
    <ModalOverlay className="cf-mobile-sheet-overlay" mobileFullScreen={false} onClose={busy ? undefined : onClose} closeOnClickOutside aria-labelledby={titleId}>
      <section className="cf-mobile-sheet">
        <MobileHeader title={title} titleId={titleId} actions={(
          <button type="button" className="cf-mobile-icon-button" aria-label="关闭筛选" disabled={busy} onClick={onClose}><X size={20} /></button>
        )} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        <footer className="cf-mobile-sheet-footer">
          {onReset ? <Button type="button" variant="outline" disabled={busy} onClick={onReset}>重置</Button> : null}
          <Button type="button" disabled={busy} onClick={onApply}>查看结果</Button>
        </footer>
      </section>
    </ModalOverlay>
  );
};
