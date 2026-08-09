import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BaseDialog } from './BaseDialog';
import { Button } from './button';

export interface WarningConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  requireDoubleConfirm?: boolean;
  doubleConfirmText?: string;
  onConfirm: () => void;
  severity?: 'warning' | 'danger';
}

export const WarningConfirmDialog: React.FC<WarningConfirmDialogProps> = ({
  open,
  onClose,
  title,
  message,
  description,
  confirmText = '确认',
  cancelText = '取消',
  requireDoubleConfirm = false,
  doubleConfirmText = '我已了解风险，确认继续',
  onConfirm,
  severity = 'warning',
}) => {
  const [isDoubleConfirmed, setIsDoubleConfirmed] = useState(false);

  const handleConfirm = () => {
    if (requireDoubleConfirm && !isDoubleConfirmed) {
      return;
    }
    onConfirm();
    onClose();
    setIsDoubleConfirmed(false);
  };

  const handleCancel = () => {
    onClose();
    setIsDoubleConfirmed(false);
  };

  const severityColors = {
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-900/70',
      icon: 'text-amber-500 dark:text-amber-300',
      buttonVariant: 'warning' as const,
    },
    danger: {
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      border: 'border-rose-200 dark:border-rose-900/70',
      icon: 'text-rose-500 dark:text-rose-300',
      buttonVariant: 'destructive' as const,
    },
  };

  const colors = severityColors[severity];

  return (
    <BaseDialog
      open={open}
      onClose={handleCancel}
      title={title}
      maxWidthClassName="max-w-md"
      bodyClassName="admin-dialog-stack"
      footer={(
        <>
          <Button variant="outline" onClick={handleCancel}>
            {cancelText}
          </Button>
          <Button variant={colors.buttonVariant} onClick={handleConfirm} disabled={requireDoubleConfirm && !isDoubleConfirmed}>
            {confirmText}
          </Button>
        </>
      )}
    >
      <div className={`p-4 flex items-start gap-3 border bg-[var(--cf-surface-muted)] dark:bg-slate-900/70 ${colors.border}`}>
        <AlertTriangle size={18} className={`mt-0.5 shrink-0 ${colors.icon}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-cf-title">{message}</p>
          {description ? (
            <p className="mt-2 text-sm text-cf-muted">{description}</p>
          ) : null}
        </div>
      </div>

      {requireDoubleConfirm ? (
        <label className="p-4 flex items-start gap-3 border border-slate-200 bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-900/70">
          <input
            type="checkbox"
            checked={isDoubleConfirmed}
            onChange={(e) => setIsDoubleConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500/20"
          />
          <span className="text-sm text-cf-body">{doubleConfirmText}</span>
        </label>
      ) : null}
    </BaseDialog>
  );
};
