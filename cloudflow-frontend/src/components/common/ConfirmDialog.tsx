import React from 'react';
import { BaseDialog } from './BaseDialog';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  description,
  confirmText = '确定',
  cancelText = '取消',
  tone = 'default',
  danger = false,
  onConfirm,
  onCancel,
  children,
}) => {
  const content = message ?? description ?? '';
  const destructive = danger || tone === 'danger';

  return (
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
          <Button onClick={onConfirm} variant={destructive ? 'destructive' : 'default'}>
            {confirmText}
          </Button>
        </div>
      )}
    >
      <div className="admin-dialog-stack">
        {content ? (
          <p className="whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">{content}</p>
        ) : null}
        {children}
      </div>
    </BaseDialog>
  );
};
