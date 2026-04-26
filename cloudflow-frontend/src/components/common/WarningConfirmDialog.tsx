/**
 * 警告确认对话框
 * 
 * 用于显示警告信息并要求用户确认
 * 适用于运行实例警告、删除确认等场景
 * 
 * @author CloudFlow
 */

import React, { useState } from 'react';
import { Dialog } from './dialog';
import { Button } from './button';

export interface WarningConfirmDialogProps {
  /** 是否显示对话框 */
  open: boolean;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 对话框标题 */
  title: string;
  /** 警告消息 */
  message: string;
  /** 详细描述 */
  description?: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 是否需要二次确认（显示复选框） */
  requireDoubleConfirm?: boolean;
  /** 二次确认文本 */
  doubleConfirmText?: string;
  /** 确认回调 */
  onConfirm: () => void;
  /** 警告级别 */
  severity?: 'warning' | 'danger';
}

/**
 * 警告确认对话框组件
 */
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

  // 处理确认
  const handleConfirm = () => {
    if (requireDoubleConfirm && !isDoubleConfirmed) {
      return; // 需要二次确认但未勾选
    }
    onConfirm();
    onClose();
    setIsDoubleConfirmed(false); // 重置状态
  };

  // 处理取消
  const handleCancel = () => {
    onClose();
    setIsDoubleConfirmed(false); // 重置状态
  };

  // 根据严重级别选择颜色
  const severityColors = {
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      icon: 'text-yellow-400',
      buttonVariant: 'warning' as const,
    },
    danger: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'text-red-400',
      buttonVariant: 'destructive' as const,
    },
  };

  const colors = severityColors[severity];

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32">
        <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)]">
          {/* 对话框头部 */}
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          </div>

          {/* 对话框内容 */}
          <div className="space-y-4 px-5 py-4">
            {/* 警告消息 */}
            <div className={`${colors.bg} ${colors.border} rounded-xl border p-4`}>
              <div className="flex">
                <svg
                  className={`h-5 w-5 ${colors.icon} flex-shrink-0`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-slate-900">{message}</p>
                  {description && (
                    <p className="mt-2 text-sm text-slate-600">{description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* 二次确认复选框 */}
            {requireDoubleConfirm && (
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="double-confirm"
                  checked={isDoubleConfirmed}
                  onChange={(e) => setIsDoubleConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 text-cyan-600 focus:ring-cyan-500/20 rounded"
                />
                <label
                  htmlFor="double-confirm"
                  className="ml-3 cursor-pointer text-sm text-slate-700"
                >
                  {doubleConfirmText}
                </label>
              </div>
            )}
          </div>

          {/* 对话框底部 */}
          <div className="flex justify-end space-x-3 border-t border-slate-100 px-5 py-4">
            <Button variant="outline" onClick={handleCancel}>
              {cancelText}
            </Button>
            <Button
              variant={colors.buttonVariant}
              onClick={handleConfirm}
              disabled={requireDoubleConfirm && !isDoubleConfirmed}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
