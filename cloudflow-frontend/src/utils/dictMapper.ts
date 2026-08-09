/**
 * 字典样式映射工具
 *
 * 负责将后端 SysDictData 转换为前端 DictItem，
 * 并处理 listClass → colorName → Tailwind 类的映射
 */

import type { SysDictData } from '@/services/api/dict';
import type { DictItem, StatusColorName } from '@/types/dict';

/**
 * listClass 到 colorName 的映射
 * 后端 listClass 使用语义化名称（success/warning/danger），前端映射为具体颜色
 */
const LIST_CLASS_TO_COLOR: Record<string, StatusColorName> = {
  success: 'emerald',
  warning: 'amber',
  danger: 'rose',
  info: 'sky',
  primary: 'teal',
  default: 'slate',
  // 兼容可能的其他值
  error: 'rose',
  secondary: 'violet',
};

/**
 * 根据 colorName 生成完整 Tailwind 类（border 风格）
 * 包含 light + dark mode，与 enumLabels.ts 中的 fullClass 保持一致
 */
function buildFullClass(colorName: StatusColorName): string {
  const colorMap: Record<StatusColorName, string> = {
    emerald:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    amber:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    slate:
      'border-slate-200 bg-cf-surface-3 text-cf-body dark:border-slate-800',
    violet:
      'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200',
    orange:
      'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
    teal: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200',
  };
  return colorMap[colorName];
}

/**
 * 根据 colorName 生成简化 tone 类（向后兼容）
 * 仅包含背景和文字颜色，无 dark mode
 */
function buildTone(colorName: StatusColorName): string {
  const toneMap: Record<StatusColorName, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-700',
    slate: 'bg-cf-surface-3 text-cf-muted',
    violet: 'bg-violet-50 text-violet-700',
    orange: 'bg-orange-50 text-orange-700',
    teal: 'bg-teal-50 text-teal-700',
  };
  return toneMap[colorName];
}

/**
 * 将后端 SysDictData 数组转换为前端 DictItem 数组
 * @param rawData 后端字典数据
 * @returns 前端字典项数组（已按 sort 升序排序）
 */
export function transformDictData(rawData: SysDictData[]): DictItem[] {
  return rawData
    .sort((a, b) => (a.dictSort ?? 0) - (b.dictSort ?? 0))
    .map((item) => {
      // 获取 listClass 并转换为小写
      const listClass = item.listClass?.toLowerCase() || 'default';
      const colorName = LIST_CLASS_TO_COLOR[listClass] || 'slate';

      return {
        label: item.dictLabel,
        value: item.dictValue,
        sort: item.dictSort ?? 0,
        listClass: item.listClass,
        cssClass: item.cssClass,
        isDefault: item.isDefault === 'Y',
        // 扩展字段
        colorName,
        fullClass: buildFullClass(colorName),
        tone: buildTone(colorName),
      };
    });
}

/**
 * 根据 listClass 获取 colorName（用于兼容现有代码）
 * @param listClass 后端 listClass 值
 * @returns 颜色名称
 */
export function getColorNameFromListClass(listClass?: string): StatusColorName {
  if (!listClass) return 'slate';
  const normalized = listClass.toLowerCase();
  return LIST_CLASS_TO_COLOR[normalized] || 'slate';
}

/**
 * 根据 colorName 获取完整 Tailwind 类（用于兼容现有代码）
 * @param colorName 颜色名称
 * @returns Tailwind 类字符串
 */
export function getFullClassFromColorName(colorName?: StatusColorName): string {
  if (!colorName) return buildFullClass('slate');
  return buildFullClass(colorName);
}

/**
 * 根据 colorName 获取简化 tone 类（用于兼容现有代码）
 * @param colorName 颜色名称
 * @returns Tailwind 类字符串
 */
export function getToneFromColorName(colorName?: StatusColorName): string {
  if (!colorName) return buildTone('slate');
  return buildTone(colorName);
}
