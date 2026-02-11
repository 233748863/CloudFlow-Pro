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
      icon: 'text-amber-500',
      iconBg: 'bg-amber-100',
      confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white'
    },
    danger: {
      icon: 'text-red-500',
      iconBg: 'bg-red-100',
      confirmBtn: 'bg-red-600 hover:bg-red-700 text-white'
    },
    info: {
      icon: 'text-blue-500',
      iconBg: 'bg-blue-100',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700 text-white'
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[90vw] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* 头部 */}
        <div className="p-5 border-b border-slate-100 flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${styles.iconBg} shrink-0`}>
            <AlertTriangle size={20} className={styles.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
          </div>
          <button 
            onClick={onCancel}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5">
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
        </div>

        {/* 按钮 */}
        <div className="p-5 pt-0 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-sm ${styles.confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
