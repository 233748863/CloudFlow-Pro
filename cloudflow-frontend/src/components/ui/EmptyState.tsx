/**
 * 空状态组件
 * 用于数据为空时的友好提示
 */

import React from 'react';
import { cn } from '@/utils/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      {icon && (
        <div className="mb-5 p-4 bg-slate-50/80 rounded-full text-slate-400 ring-1 ring-slate-100 shadow-sm">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-800 mb-1.5">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-slate-500 mb-6 max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-pink-500 text-white hover:bg-pink-600 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

/**
 * 预设的空状态组件
 */

// 无数据
export const EmptyData: React.FC<{ onRefresh?: () => void }> = ({ onRefresh }) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    }
    title="暂无数据"
    description="当前没有可显示的数据"
    action={onRefresh ? { label: '刷新', onClick: onRefresh } : undefined}
  />
);

// 无任务
export const EmptyTasks: React.FC<{ onCreate?: () => void }> = ({ onCreate }) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    }
    title="暂无任务"
    description="您目前没有待处理的任务"
    action={onCreate ? { label: '创建任务', onClick: onCreate } : undefined}
  />
);

// 无流程
export const EmptyWorkflows: React.FC<{ onCreate?: () => void }> = ({ onCreate }) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    }
    title="暂无流程"
    description="还没有创建任何流程定义"
    action={onCreate ? { label: '创建流程', onClick: onCreate } : undefined}
  />
);

// 无表单
export const EmptyForms: React.FC<{ onCreate?: () => void }> = ({ onCreate }) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    }
    title="暂无表单"
    description="还没有创建任何表单定义"
    action={onCreate ? { label: '创建表单', onClick: onCreate } : undefined}
  />
);

// 搜索无结果
export const EmptySearch: React.FC<{ query?: string; onClear?: () => void }> = ({ query, onClear }) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    }
    title="未找到结果"
    description={query ? `没有找到与 "${query}" 相关的结果` : '没有找到匹配的结果'}
    action={onClear ? { label: '清除搜索', onClick: onClear } : undefined}
  />
);

// 网络错误
export const EmptyError: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    }
    title="加载失败"
    description="数据加载失败，请稍后重试"
    action={onRetry ? { label: '重试', onClick: onRetry } : undefined}
  />
);

// 权限不足
export const EmptyPermission: React.FC = () => (
  <EmptyState
    icon={
      <svg className="w-16 h-16 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    }
    title="权限不足"
    description="您没有权限访问此内容"
  />
);
