/**
 * 冲突解决对话框
 * 
 * 用于处理资源冲突（如导入流程时名称冲突）
 * 提供三种解决策略：覆盖、重命名、跳过
 * 
 * @author CloudFlow
 */

import React, { useState } from 'react';
import { Dialog } from './dialog';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

export type ConflictStrategy = 'overwrite' | 'rename' | 'skip';

export interface ConflictResolutionDialogProps {
  /** 是否显示对话框 */
  open: boolean;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 冲突的资源名称 */
  resourceName: string;
  /** 冲突消息 */
  message: string;
  /** 可用的解决策略 */
  availableStrategies?: ConflictStrategy[];
  /** 确认回调 */
  onConfirm: (strategy: ConflictStrategy, newName?: string) => void;
}

/**
 * 冲突解决对话框组件
 */
export const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  open,
  onClose,
  resourceName,
  message,
  availableStrategies = ['overwrite', 'rename', 'skip'],
  onConfirm,
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<ConflictStrategy>('rename');
  const [newName, setNewName] = useState<string>(`${resourceName}_副本`);

  // 策略显示名称
  const strategyLabels: Record<ConflictStrategy, string> = {
    overwrite: '覆盖现有资源',
    rename: '重命名后导入',
    skip: '跳过此资源',
  };

  // 策略描述
  const strategyDescriptions: Record<ConflictStrategy, string> = {
    overwrite: '将替换现有资源，原有数据将被覆盖',
    rename: '使用新名称导入，保留现有资源',
    skip: '跳过此资源，不进行导入',
  };

  // 处理确认
  const handleConfirm = () => {
    if (selectedStrategy === 'rename' && !newName.trim()) {
      return; // 重命名策略必须提供新名称
    }
    onConfirm(selectedStrategy, selectedStrategy === 'rename' ? newName : undefined);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32">
        <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)]">
          {/* 对话框头部 */}
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">资源冲突</h2>
          </div>

          {/* 对话框内容 */}
          <div className="space-y-4 px-5 py-4">
            {/* 冲突消息 */}
            <div className="text-sm text-slate-600">
              <p>{message}</p>
              <p className="mt-2 font-medium text-slate-900">
                资源名称：{resourceName}
              </p>
            </div>

            {/* 解决策略选择 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-700">
                请选择解决方式：
              </Label>

              {availableStrategies.map((strategy) => (
                <div key={strategy} className="flex items-start">
                  <input
                    type="radio"
                    id={`strategy-${strategy}`}
                    name="strategy"
                    value={strategy}
                    checked={selectedStrategy === strategy}
                    onChange={(e) => setSelectedStrategy(e.target.value as ConflictStrategy)}
                    className="mt-1 h-4 w-4 text-cyan-600 focus:ring-cyan-500/20"
                  />
                  <label
                    htmlFor={`strategy-${strategy}`}
                    className="ml-3 flex-1 cursor-pointer"
                  >
                    <div className="text-sm font-medium text-slate-900">
                      {strategyLabels[strategy]}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {strategyDescriptions[strategy]}
                    </div>
                  </label>
                </div>
              ))}
            </div>

            {/* 重命名输入框 */}
            {selectedStrategy === 'rename' && (
              <div className="space-y-2">
                <Label htmlFor="newName" className="text-sm font-medium text-slate-700">
                  新名称：
                </Label>
                <Input
                  id="newName"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="请输入新名称"
                  className="w-full"
                />
              </div>
            )}

            {/* 覆盖警告 */}
            {selectedStrategy === 'overwrite' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-800">
                      警告：此操作将覆盖现有资源，原有数据将无法恢复
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 对话框底部 */}
          <div className="flex justify-end space-x-3 border-t border-slate-100 px-5 py-4">
            <Button
              variant="outline"
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedStrategy === 'rename' && !newName.trim()}
            >
              确认
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
