import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Button } from '@/components/ui';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}) => (
  <BaseDialog
    open={open}
    title={title}
    onClose={onCancel}
    maxWidthClassName="max-w-md"
    footer={(
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          className={danger ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500' : undefined}
        >
          {confirmText}
        </Button>
      </div>
    )}
  >
    <div className="flex items-start gap-3">
      <div
        className={
          danger
            ? 'rounded-full bg-red-50 p-2 text-red-600 dark:bg-red-950/40 dark:text-red-300'
            : 'rounded-full bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'
        }
      >
        <AlertTriangle size={18} />
      </div>
      <p className="whitespace-pre-line pt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
    </div>
  </BaseDialog>
);
