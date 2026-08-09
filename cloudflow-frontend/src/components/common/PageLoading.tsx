import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { cn } from '@/utils/cn';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

type PageLoadingSize = 'md' | 'lg' | 'xl';

interface PageLoadingProps {
  /** 主文案，默认"加载中…" */
  tip?: string;
  /** 次级说明，默认无 */
  description?: string;
  /** 转圈尺寸，默认 lg */
  size?: PageLoadingSize;
  /** true 时 fixed 全屏蒙层，否则嵌入式填充父容器 */
  fullscreen?: boolean;
  /** 嵌入式模式下的最小高度，默认 min-h-[60vh] */
  minHeight?: string;
  className?: string;
}

/**
 * 统一的"加载中"页面组件。
 * - 路由懒加载 Suspense fallback 使用
 * - 业务页面首屏数据加载占位使用
 * - 与 ResultPage 视觉规范对齐（青色品牌色、暗黑模式自适应）
 */
export const PageLoading: React.FC<PageLoadingProps> = ({
  tip = '加载中…',
  description,
  size = 'lg',
  fullscreen = false,
  minHeight = 'min-h-[60vh]',
  className,
}) => {
  const container = fullscreen
    ? 'fixed inset-0 z-[60] bg-slate-950/48'
    : `flex w-full ${minHeight}`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('flex items-center justify-center', container, className)}
    >
      <InnerTableSurface
        className="w-auto max-w-sm"
        wrapperClassName="flex flex-col items-center justify-center gap-4 px-6 py-5 text-center"
      >
        <LoadingSpinner size={size} />
        <div className="space-y-1.5">
          {tip && (
            <p className="text-sm font-semibold text-cf-title">
              {tip}
            </p>
          )}
          {description && (
            <p className="max-w-sm text-xs text-cf-subtle">
              {description}
            </p>
          )}
        </div>
      </InnerTableSurface>
    </div>
  );
};

export default PageLoading;
