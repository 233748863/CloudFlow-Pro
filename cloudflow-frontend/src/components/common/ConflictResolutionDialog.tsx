import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BaseDialog } from './BaseDialog';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

export type ConflictStrategy = 'overwrite' | 'rename' | 'skip';

export interface ConflictResolutionDialogProps {
  open: boolean;
  onClose: () => void;
  resourceName: string;
  message: string;
  availableStrategies?: ConflictStrategy[];
  onConfirm: (strategy: ConflictStrategy, newName?: string) => void;
}

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

  const strategyLabels: Record<ConflictStrategy, string> = {
    overwrite: '覆盖现有资源',
    rename: '重命名后导入',
    skip: '跳过此资源',
  };

  const strategyDescriptions: Record<ConflictStrategy, string> = {
    overwrite: '替换现有资源，原有数据将被覆盖',
    rename: '使用新名称导入，保留现有资源',
    skip: '跳过此资源，不进行导入',
  };

  const handleConfirm = () => {
    if (selectedStrategy === 'rename' && !newName.trim()) {
      return;
    }
    onConfirm(selectedStrategy, selectedStrategy === 'rename' ? newName : undefined);
    onClose();
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="资源冲突"
      maxWidthClassName="max-w-md"
      bodyClassName="admin-dialog-stack"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={selectedStrategy === 'rename' && !newName.trim()}>
            确认
          </Button>
        </>
      )}
    >
      <div className="p-4 border border-slate-200 bg-[var(--cf-surface-muted)] text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
        <p>{message}</p>
        <p className="mt-2 font-medium text-slate-900 dark:text-slate-100">资源名称：{resourceName}</p>
      </div>

      <div className="admin-dialog-stack">
        <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">请选择解决方式</Label>
        {availableStrategies.map((strategy) => (
          <label
            key={strategy}
            className={`p-4 flex items-start gap-3 border text-left transition-colors ${
              selectedStrategy === strategy
                ? 'border-cyan-300 bg-[var(--cf-surface-muted)] dark:border-cyan-900/60 dark:bg-slate-900/70'
                : 'border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-900/60'
            }`}
          >
            <input
              type="radio"
              name="strategy"
              value={strategy}
              checked={selectedStrategy === strategy}
              onChange={(e) => setSelectedStrategy(e.target.value as ConflictStrategy)}
              className="mt-1 h-4 w-4 text-cyan-600 focus:ring-cyan-500/20"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {strategyLabels[strategy]}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {strategyDescriptions[strategy]}
              </div>
            </div>
          </label>
        ))}
      </div>

      {selectedStrategy === 'rename' ? (
        <div className="admin-dialog-field">
          <Label htmlFor="newName" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            新名称
          </Label>
          <Input
            id="newName"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="请输入新名称"
          />
        </div>
      ) : null}

      {selectedStrategy === 'overwrite' ? (
        <div className="p-4 flex items-start gap-3 border border-amber-200 bg-[var(--cf-surface-muted)] dark:border-amber-900/60 dark:bg-slate-900/70">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500 dark:text-amber-300" />
          <p className="text-sm text-amber-800 dark:text-amber-100">此操作将覆盖现有资源，原有数据将无法恢复。</p>
        </div>
      ) : null}
    </BaseDialog>
  );
};
