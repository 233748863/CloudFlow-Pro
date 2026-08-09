/**
 * DictSelect 组件 - 字典下拉选择器
 *
 * 基于现有 Select 组件封装，自动加载字典数据
 */

import React, { useMemo } from 'react';
import { useDict } from '@/hooks/useDict';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { cn } from '@/utils/cn';
import type { DictItem } from '@/types/dict';

export interface DictSelectProps {
  /** 字典类型 */
  dictType: string;

  /** 当前值 */
  value?: string;

  /** 值变化回调 */
  onChange?: (value: string) => void;

  /** 占位符 */
  placeholder?: string;

  /** 是否禁用 */
  disabled?: boolean;

  /** 是否允许清空 */
  allowClear?: boolean;

  /** 额外的 CSS 类名 */
  className?: string;

  /** 过滤选项（返回 true 表示保留） */
  filter?: (item: DictItem) => boolean;

  /** 自定义选项渲染 */
  renderOption?: (item: DictItem) => React.ReactNode;

  /** 是否显示彩色标签 */
  showBadge?: boolean;
}

/**
 * 字典下拉选择器组件
 *
 * @example
 * ```tsx
 * // 基础用法
 * <DictSelect
 *   dictType="employee_status"
 *   value={status}
 *   onChange={setStatus}
 *   placeholder="选择状态"
 * />
 *
 * // 带过滤
 * <DictSelect
 *   dictType="employee_status"
 *   value={status}
 *   onChange={setStatus}
 *   filter={(item) => item.value !== 'DELETED'}
 * />
 *
 * // 显示彩色标签
 * <DictSelect
 *   dictType="employee_status"
 *   value={status}
 *   onChange={setStatus}
 *   showBadge
 * />
 * ```
 */
export const DictSelect: React.FC<DictSelectProps> = ({
  dictType,
  value,
  onChange,
  placeholder = '请选择',
  disabled = false,
  allowClear = false,
  className,
  filter,
  renderOption,
  showBadge = false,
}) => {
  const { data, isLoading, getLabel, getItem } = useDict(dictType);

  // 过滤数据
  const filteredData = useMemo(() => {
    if (!data) return [];
    return filter ? data.filter(filter) : data;
  }, [data, filter]);

  // Loading 状态
  if (isLoading) {
    return (
      <div className={cn('cf-control h-10 rounded-md px-4 py-2.5', className)}>
        <span className="text-sm text-cf-faint">加载中...</span>
      </div>
    );
  }

  // 获取当前选中项
  const selectedItem = value ? getItem(value) : undefined;

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowClear && value && (
          <SelectItem value="" label="清空">
            <span className="text-cf-faint">清空</span>
          </SelectItem>
        )}
        {filteredData.map((item) => (
          <SelectItem key={item.value} value={item.value} label={item.label}>
            {renderOption ? (
              renderOption(item)
            ) : showBadge ? (
              <span
                className={cn(
                  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                  item.fullClass,
                )}
              >
                {item.label}
              </span>
            ) : (
              item.label
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
