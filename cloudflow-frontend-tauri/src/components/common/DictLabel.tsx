/**
 * DictLabel 组件 - 字典纯文本标签
 *
 * 用于显示字典项的文本标签，不带样式
 */

import React from 'react';
import { useDict } from '@/hooks/useDict';

export interface DictLabelProps {
  /** 字典类型 */
  dictType: string;

  /** 字典值 */
  value: string;

  /** 未找到时的回退文本（默认显示原值） */
  fallback?: string;

  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * 字典纯文本标签组件
 *
 * @example
 * ```tsx
 * <DictLabel dictType="employee_status" value="ACTIVE" />
 * // 输出: 在职
 *
 * <DictLabel dictType="employee_status" value="UNKNOWN" fallback="-" />
 * // 输出: -
 * ```
 */
export const DictLabel: React.FC<DictLabelProps> = ({ dictType, value, fallback, className }) => {
  const { getLabel, isLoading } = useDict(dictType);

  if (isLoading) {
    return <span className={className}>...</span>;
  }

  const displayText = getLabel(value) || fallback || value;

  return <span className={className}>{displayText}</span>;
};
