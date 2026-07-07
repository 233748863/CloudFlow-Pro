/**
 * useDict Hook - 字典数据获取
 *
 * 基于 React Query 实现字典数据的获取和缓存，支持租户隔离
 */

import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { dictDataApi } from '@/services/api/dict';
import { transformDictData } from '@/utils/dictMapper';
import { queryKeys } from '@/lib/queryClient';
import type { UseDictOptions, UseDictResult } from '@/types/dict';

/**
 * 字典数据获取 Hook
 *
 * @param dictType 字典类型（如 'employee_status'）
 * @param options 配置选项
 * @returns 字典数据和便捷方法
 *
 * @example
 * ```tsx
 * const { data, isLoading, getLabel, getItem } = useDict('employee_status');
 *
 * // 获取标签
 * const label = getLabel('ACTIVE'); // '在职'
 *
 * // 获取完整字典项
 * const item = getItem('ACTIVE');
 * console.log(item?.fullClass); // Tailwind 类
 * ```
 */
export function useDict(dictType: string, options: UseDictOptions = {}): UseDictResult {
  const {
    enabled = true,
    staleTime = 10 * 60 * 1000, // 默认 10 分钟
    refetchOnMount = false,
  } = options;

  const query = useQuery({
    queryKey: queryKeys.dict(dictType),
    queryFn: async () => {
      const rawData = await dictDataApi.getByType(dictType);
      return transformDictData(rawData);
    },
    enabled,
    staleTime,
    refetchOnMount,
    gcTime: 30 * 60 * 1000, // 缓存保留 30 分钟
  });

  /**
   * 根据 value 获取 label
   * 未找到时返回空字符串，由调用方决定占位展示。
   */
  const getLabel = useCallback(
    (value: string) => {
      if (!value || !query.data) return '';
      const item = query.data.find((d) => d.value === value);
      return item?.label ?? '';
    },
    [query.data],
  );

  /**
   * 根据 value 获取完整字典项
   * 未找到时返回 undefined
   */
  const getItem = useCallback(
    (value: string) => {
      if (!query.data) return undefined;
      return query.data.find((d) => d.value === value);
    },
    [query.data],
  );

  /**
   * 获取下拉选项列表
   * 返回 { label, value } 数组
   */
  const getOptions = useCallback(() => {
    if (!query.data) return [];
    return query.data.map((d) => ({ label: d.label, value: d.value }));
  }, [query.data]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
    getLabel,
    getItem,
    getOptions,
  };
}

/**
 * 批量加载多个字典类型
 *
 * @param dictTypes 字典类型数组
 * @returns 字典类型到 UseDictResult 的映射
 *
 * @example
 * ```tsx
 * const dicts = useDicts(['employee_status', 'employee_type']);
 * const statusLabel = dicts.employee_status.getLabel('ACTIVE');
 * const typeLabel = dicts.employee_type.getLabel('FULL_TIME');
 * ```
 */
export function useDicts(dictTypes: string[]): Record<string, UseDictResult> {
  const results: Record<string, UseDictResult> = {};

  for (const dictType of dictTypes) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    results[dictType] = useDict(dictType);
  }

  return results;
}
