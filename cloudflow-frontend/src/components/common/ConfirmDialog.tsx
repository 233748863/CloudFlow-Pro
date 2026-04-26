import React from 'react';
import { BaseDialog } from './BaseDialog';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText = '纭畾',
  cancelText = '鍙栨秷',
  danger = false,
  onConfirm,
  onCancel,
  children,
}) => (
  <BaseDialog
    open={open}
    title={title}
    onClose={onCancel}
    width="narrow"
    footer={(
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button onClick={onConfirm} variant={danger ? 'destructive' : 'default'}>
          {confirmText}
        </Button>
      </div>
    )}
  >
    <div className="space-y-4">
      <p className="whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
      {children}
    </div>
  </BaseDialog>
);
