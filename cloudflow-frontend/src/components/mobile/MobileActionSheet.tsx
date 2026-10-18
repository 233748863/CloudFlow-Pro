import React, { useId, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';

export interface MobileAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
}

export const MobileActionSheet = ({ open, onClose, title = '选择操作', actions }: { open: boolean; onClose: () => void; title?: string; actions: MobileAction[] }) => {
  const titleId = useId();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const selectAction = async (action: MobileAction) => {
    if (pendingRef.current || action.disabled) return;
    pendingRef.current = true;
    setPending(action.key);
    try {
      await action.onSelect();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  };
  if (!open) return null;
  return (
    <ModalOverlay className="cf-mobile-sheet-overlay" mobileFullScreen={false} closeOnClickOutside onClose={pending ? undefined : onClose} aria-labelledby={titleId}>
      <section className="cf-mobile-sheet">
        <h2 id={titleId} className="border-b border-[var(--cf-border)] px-4 py-4 text-center text-sm font-semibold text-cf-title">{title}</h2>
        <div className="overflow-y-auto overscroll-contain p-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.key} type="button" className={cn('cf-mobile-sheet-action', action.destructive && 'text-red-600 dark:text-red-400')} disabled={Boolean(pending) || action.disabled} onClick={() => void selectAction(action)}>
                {Icon ? <Icon size={20} aria-hidden="true" /> : null}
                {pending === action.key ? '处理中…' : action.label}
              </button>
            );
          })}
        </div>
        <footer className="cf-mobile-sheet-footer"><button type="button" className="cf-mobile-sheet-action" disabled={Boolean(pending)} onClick={onClose}>取消</button></footer>
      </section>
    </ModalOverlay>
  );
};
