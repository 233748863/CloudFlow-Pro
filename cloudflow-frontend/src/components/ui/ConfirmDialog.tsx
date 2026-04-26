import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'warning' | 'danger' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = '确认操作',
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  variant = 'warning'
}) => {
  if (!open) return null;

  const variantStyles = {
    warning: {
      icon: 'text-amber-700',
      iconBg: 'border border-amber-200 bg-amber-50',
      confirmVariant: 'warning' as const,
    },
    danger: {
      icon: 'text-rose-600',
      iconBg: 'border border-rose-200 bg-rose-50',
      confirmVariant: 'destructive' as const,
    },
    info: {
      icon: 'text-cyan-700',
      iconBg: 'border border-cyan-200 bg-cyan-50',
      confirmVariant: 'default' as const,
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="w-[420px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/80 animate-in zoom-in-95 duration-200">
        {/* 头部 */}
        <div className="flex items-start gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.iconBg}`}>
            <AlertTriangle size={20} className={styles.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
          </div>
          <button 
            onClick={onCancel}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-5">
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4">
          <Button variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            variant={styles.confirmVariant}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};
