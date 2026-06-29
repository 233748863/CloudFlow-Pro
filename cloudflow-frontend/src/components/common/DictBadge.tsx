/**
 * DictBadge 组件 - 字典彩色标签
 *
 * 用于显示带颜色样式的字典标签，常用于状态显示
 */

import React from 'react';
import { useDict } from '@/hooks/useDict';
import { cn } from '@/utils/cn';

export interface DictBadgeProps {
  /** 字典类型 */
  dictType: string;

  /** 字典值 */
  value: string;

  /** 未找到时的回退文本（默认显示原值） */
  fallback?: string;

  /** 额外的 CSS 类名 */
  className?: string;

  /** 样式变体 */
  variant?: 'border' | 'ring' | 'solid';
}

/**
 * 字典彩色标签组件
 *
 * @example
 * ```tsx
 * <DictBadge dictType="employee_status" value="ACTIVE" />
 * // 输出: 带绿色边框和背景的"在职"标签
 *
 * <DictBadge dictType="employee_status" value="RESIGNED" variant="ring" />
 * // 输出: 带灰色 ring 的"离职"标签
 * ```
 */
export const DictBadge: React.FC<DictBadgeProps> = ({
  dictType,
  value,
  fallback,
  className,
  variant = 'border',
}) => {
  const { getItem, isLoading } = useDict(dictType);

  if (isLoading) {
    return (
      <span className="inline-block h-6 w-16 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
    );
  }

  const item = getItem(value);
  const displayText = item?.label ?? fallback ?? value;

  // 根据 variant 选择样式类
  const variantClass =
    variant === 'solid' ? '' : 'border';

  // 使用字典项的 fullClass，如果没有则使用默认样式
  const colorClass =
    item?.fullClass ||
    'border-slate-200 bg-[var(--cf-surface-muted)] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
        variantClass,
        colorClass,
        className,
      )}
    >
      {displayText}
    </span>
  );
};
