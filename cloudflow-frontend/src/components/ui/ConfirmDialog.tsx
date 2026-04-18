import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

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
      confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white'
    },
    danger: {
      icon: 'text-rose-600',
      iconBg: 'border border-rose-200 bg-rose-50',
      confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white'
    },
    info: {
      icon: 'text-cyan-700',
      iconBg: 'border border-cyan-200 bg-cyan-50',
      confirmBtn: 'bg-cyan-600 hover:bg-cyan-700 text-white'
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/32 p-4 animate-in fade-in duration-200">
      <div className="w-[420px] max-w-[90vw] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        {/* 头部 */}
        <div className="flex items-start gap-3 border-b border-slate-100 bg-white p-5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.iconBg}`}>
            <AlertTriangle size={20} className={styles.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
          </div>
          <button 
            onClick={onCancel}
            className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5">
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5">
          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${styles.confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
